import type {
  BrowserWindow as BrowserWindowType,
  IpcMainInvokeEvent,
  MenuItemConstructorOptions,
  OpenDialogOptions,
  OpenDialogReturnValue,
  SaveDialogOptions,
  SaveDialogReturnValue
} from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statfsSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Store from "electron-store";
import type {
  AppSettings,
  AudioEditRequest,
  AudioEditResult,
  AudioAnalysis,
  AudioEditProject,
  AudioRenderRequest,
  AudioRenderResult,
  CaptionProjectSession,
  ClipVideoRequest,
  ExtractAudioResult,
  PersistedSettings,
  RunWhisperRequest,
  RunWhisperResult,
  SaveFileAsRequest,
  SaveTextAsRequest,
  ToolLogEntry
} from "./types";
import { audioEditUtils } from "./audio-edit-utils";
import { audioOutputArguments, buildAudioFilterGraph, editedDuration, parseAudioMetadata, parseLoudnessMeasurement, PeakAccumulator, type AudioMetadata } from "./audio-processing";

const electronRuntime = require("electron");
if (typeof electronRuntime === "string") {
  console.error("[fatal] require('electron') returned a string, which indicates this process is running in Node mode instead of Electron app mode.");
  console.error("[fatal] Ensure startup uses Electron as the launcher (for example: .\\node_modules\\.bin\\electron.cmd .) and ELECTRON_RUN_AS_NODE is not set.");
  process.exit(1);
}
const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require("electron") as typeof import("electron");

console.log("[startup] process.execPath:", process.execPath);
console.log("[startup] process.argv:", process.argv);
console.log("[startup] process.versions:", process.versions);
console.log("[startup] typeof require('electron'):", typeof electronRuntime);
console.log("[startup] Object.keys(require('electron') || {}):", Object.keys(electronRuntime || {}));

type BinaryName = "ffmpeg.exe" | "ffprobe.exe" | "whisper.exe";
type ToolName = ToolLogEntry["tool"];
type StreamName = ToolLogEntry["stream"];

const APP_USER_MODEL_ID = "com.local.video-caption-app";
const MEDIA_PROCESS_CANCELLED_MESSAGE = "Media process cancelled";
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' file: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"]);
const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma", ".aiff", ".aif"]);
const REQUIRED_RUNTIME_FILES: Record<ToolName, readonly string[]> = {
  ffmpeg: ["ffmpeg.exe", "ffprobe.exe"],
  whisper: ["whisper.exe", "whisper.dll", "ggml.dll", "ggml-base.dll", "ggml-cpu.dll"]
};

interface RuntimeFileDefinition {
  archiveName: string;
  sha256: string;
}

interface RuntimeComponentDefinition {
  version: string;
  files: Record<string, RuntimeFileDefinition>;
}

interface RuntimeDependencyManifest {
  schemaVersion: number;
  components: {
    ffmpeg: RuntimeComponentDefinition;
    whisper: RuntimeComponentDefinition;
    model: {
      name: string;
      sha256: string;
    };
  };
}

let runtimeDependencyManifest: RuntimeDependencyManifest | null = null;
const knownFilePaths = new Set<string>();
const originalMediaPaths = new Set<string>();
const analyzedSources = new Map<string, AudioAnalysis & { streamIndex: number; fileSignature: string }>();
const renderedAudioCache = new Map<string, { result: AudioRenderResult; fileSignature: string }>();
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024 * 1024;

const settingsStore = new Store<PersistedSettings & { captionProject?: CaptionProjectSession }>({
  defaults: {
    themeMode: "system"
  }
});

interface ActiveMediaRun {
  child: ChildProcessWithoutNullStreams | null;
  cancelled: boolean;
}

const activeMediaRuns = new Map<number, ActiveMediaRun>();

function resolveRuntimeBaseDir(): string {
  return app.isPackaged ? process.resourcesPath : app.getAppPath();
}

function resolveBinaryPath(binaryName: BinaryName): string {
  return path.resolve(resolveRuntimeBaseDir(), "bin", binaryName);
}

function getRuntimeDependencyManifest(): RuntimeDependencyManifest {
  if (runtimeDependencyManifest) {
    return runtimeDependencyManifest;
  }

  const manifestPath = path.resolve(resolveRuntimeBaseDir(), "runtime-dependencies.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Runtime dependency manifest not found: ${manifestPath}`);
  }

  const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as RuntimeDependencyManifest;
  if (parsed.schemaVersion !== 1 || !parsed.components?.ffmpeg || !parsed.components?.whisper || !parsed.components?.model) {
    throw new Error(`Runtime dependency manifest is invalid: ${manifestPath}`);
  }

  const isSha256 = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
  for (const tool of ["ffmpeg", "whisper"] as const) {
    const actualFileNames = Object.keys(parsed.components[tool].files).sort();
    const requiredFileNames = [...REQUIRED_RUNTIME_FILES[tool]].sort();
    if (
      actualFileNames.length !== requiredFileNames.length ||
      actualFileNames.some((fileName, index) => fileName !== requiredFileNames[index]) ||
      actualFileNames.some((fileName) => !isSha256(parsed.components[tool].files[fileName]?.sha256))
    ) {
      throw new Error(`Runtime dependency manifest has an invalid ${tool} file allowlist: ${manifestPath}`);
    }
  }

  if (!isSha256(parsed.components.model.sha256) || parsed.components.model.name !== "ggml-base.en.bin") {
    throw new Error(`Runtime dependency manifest has an invalid model definition: ${manifestPath}`);
  }

  runtimeDependencyManifest = parsed;
  return parsed;
}

function getPathKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function rememberFilePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  knownFilePaths.add(getPathKey(resolved));
  return resolved;
}

function rememberOriginalMediaPath(filePath: string): string {
  originalMediaPaths.add(path.resolve(filePath));
  return rememberFilePath(filePath);
}

function assertNotOriginalDestination(destinationPath: string): void {
  const destinationStat = existsSync(destinationPath) ? statSync(destinationPath) : null;
  for (const originalPath of originalMediaPaths) {
    if (getPathKey(destinationPath) === getPathKey(originalPath)) throw new Error("Choose another file name to keep the original recording safe.");
    if (destinationStat && existsSync(originalPath)) {
      const originalStat = statSync(originalPath);
      if (originalStat.dev === destinationStat.dev && originalStat.ino === destinationStat.ino) throw new Error("The export points to an original recording. Choose another file.");
    }
  }
}

function isKnownFilePath(input: unknown): input is string {
  return typeof input === "string" && input.trim() !== "" && knownFilePaths.has(getPathKey(input));
}

function sha256File(filePath: string, isCancelled?: () => boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => {
      if (isCancelled?.()) stream.destroy(new Error(MEDIA_PROCESS_CANCELLED_MESSAGE));
      else hash.update(chunk);
    });
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function verifyFileIntegrity(filePath: string, expectedSha256: string, label: string): Promise<void> {
  if (!existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }

  const actualSha256 = await sha256File(filePath);
  if (actualSha256 !== expectedSha256.toLowerCase()) {
    throw new Error(
      `${label} failed SHA-256 integrity verification. Expected ${expectedSha256.toLowerCase()} but received ${actualSha256}. Re-run scripts/setup-windows.ps1.`
    );
  }
}

async function verifyRuntimeComponent(tool: ToolName): Promise<void> {
  const component = getRuntimeDependencyManifest().components[tool];
  for (const [fileName, definition] of Object.entries(component.files)) {
    await verifyFileIntegrity(path.resolve(resolveRuntimeBaseDir(), "bin", fileName), definition.sha256, `${tool}/${fileName}`);
  }
}

function resolveAppIconPath(): string {
  return path.resolve(__dirname, process.platform === "win32" ? "app-logo.ico" : "app-logo.svg");
}

function resolveTempDir(): string {
  const tempDir = path.resolve(app.getPath("userData"), "temp");
  mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function resolveModelPath(): string {
  const modelDir = path.resolve(app.getPath("userData"), "models");
  return path.resolve(modelDir, getRuntimeDependencyManifest().components.model.name);
}

function normalizeExistingFile(input: unknown, label: string): string {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }

  const resolved = path.resolve(input);

  if (!existsSync(resolved)) {
    throw new Error(`${label} not found: ${resolved}`);
  }
  if (!statSync(resolved).isFile()) throw new Error(`${label} must be a file`);

  return resolved;
}

function normalizeKnownExistingFile(input: unknown, label: string): string {
  const resolved = normalizeExistingFile(input, label);
  if (!isKnownFilePath(resolved)) {
    throw new Error(`${label} is not a file selected or generated by this application`);
  }

  return resolved;
}

function normalizeSupportedMediaFile(input: unknown, label: string): string {
  const resolved = normalizeExistingFile(input, label);
  const extension = path.extname(resolved).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(extension) && !AUDIO_EXTENSIONS.has(extension)) {
    throw new Error(`${label} is not a supported video or audio file`);
  }

  return resolved;
}

function normalizeClipOutputPath(input: unknown, videoPath: string): string {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error("outputPath must be a non-empty string");
  }

  const outputPath = path.resolve(input);
  const videoDirectory = path.dirname(videoPath);
  const expectedPrefix = `${getSafeBaseName(videoPath)}_clip_`;
  const outputName = path.basename(outputPath);

  if (getPathKey(path.dirname(outputPath)) !== getPathKey(videoDirectory)) {
    throw new Error("outputPath must be beside the selected video");
  }

  if (path.extname(outputPath).toLowerCase() !== ".mp4" || !outputName.toLowerCase().startsWith(expectedPrefix.toLowerCase())) {
    throw new Error(`outputPath must be an MP4 named with the ${expectedPrefix} prefix`);
  }

  if (getPathKey(outputPath) === getPathKey(videoPath)) {
    throw new Error("outputPath must not replace the selected video");
  }

  return outputPath;
}

function getSafeBaseName(filePath: string): string {
  const baseName = path.parse(filePath).name.trim();
  return baseName.length > 0 ? baseName : "output";
}

function getUniqueFilePath(directory: string, baseName: string, extension: string): string {
  let candidatePath = path.resolve(directory, `${baseName}${extension}`);
  let counter = 1;

  while (existsSync(candidatePath)) {
    candidatePath = path.resolve(directory, `${baseName}_${counter}${extension}`);
    counter += 1;
  }

  return candidatePath;
}

function isThemeMode(value: unknown): value is PersistedSettings["themeMode"] {
  return value === "system" || value === "dark" || value === "light" || value === "retro";
}

function getPersistedSettings(): PersistedSettings {
  const themeModeValue = settingsStore.get("themeMode");
  const themeMode = isThemeMode(themeModeValue) ? themeModeValue : "system";

  return {
    themeMode
  };
}

function getAppSettings(): AppSettings {
  return {
    ...getPersistedSettings(),
    documentsDir: path.resolve(app.getPath("documents"))
  };
}

function updatePersistedSettings(partial: Partial<PersistedSettings>): PersistedSettings {
  if (isThemeMode(partial.themeMode)) {
    settingsStore.set("themeMode", partial.themeMode);
  }

  return getPersistedSettings();
}

function getCaptionProjectSession(): CaptionProjectSession | null {
  const stored = settingsStore.get("captionProject");
  if (!stored) return null;
  try {
    return validateCaptionSession(stored);
  } catch (error) {
    console.warn("Saved project is invalid; leaving its stored data unchanged:", error);
    return null;
  }
}

function getCaptionProjectPaths(session: CaptionProjectSession): string[] {
  const queuedClipPaths = Array.isArray(session.queuedClips)
    ? session.queuedClips.flatMap((clip) =>
        clip && typeof clip === "object" && typeof clip.videoPath === "string" ? [clip.videoPath] : []
      )
    : [];

  return [
    session.selectedVideoPath,
    session.audioPath,
    session.srtPath,
    session.vttPath,
    session.audioProject?.sourcePath,
    ...(session.captionSets ?? []).flatMap((set) => [set.mediaPath, set.project.sourcePath]),
    ...queuedClipPaths
  ].filter((filePath): filePath is string => typeof filePath === "string" && filePath.trim() !== "");
}

function rememberPersistedCaptionProjectPaths(): void {
  const session = getCaptionProjectSession();
  if (!session) {
    return;
  }

  for (const filePath of getCaptionProjectPaths(session)) {
    if (existsSync(path.resolve(filePath)) && statSync(filePath).isFile()) {
      rememberFilePath(filePath);
    }
  }
  for (const sourcePath of [session.selectedVideoPath, session.audioPath, session.audioProject?.sourcePath, ...(session.captionSets ?? []).map((set) => set.project.sourcePath)]) {
    if (sourcePath) originalMediaPaths.add(path.resolve(sourcePath));
  }
}

function validateCaptionSession(input: unknown): CaptionProjectSession {
  if (!input || typeof input !== "object" || ![1, 2].includes(Number((input as Partial<CaptionProjectSession>).version))) {
    throw new Error("caption project must be a version 1 or 2 session");
  }
  // A bounded plain JSON copy prevents prototype/undefined values entering storage.
  const encoded = JSON.stringify(input);
  if (encoded.length > 8 * 1024 * 1024) throw new Error("Saved project is too large");
  const session = JSON.parse(encoded) as CaptionProjectSession;
  if (!Array.isArray(session.queuedClips) || session.queuedClips.length > 1000 || !Array.isArray(session.captionSegments)) {
    throw new Error("caption project arrays are invalid");
  }
  for (const filePath of [session.selectedVideoPath, session.audioPath, session.srtPath, session.vttPath]) {
    if (filePath !== null && (typeof filePath !== "string" || filePath.length > 32768 || !path.isAbsolute(filePath))) {
      throw new Error("caption project file paths must be strings or null");
    }
  }
  if (![null, "uploaded", "extracted"].includes(session.audioSourceKind) ||
      !["copy", "encode"].includes(session.clipMode) || typeof session.clipStart !== "string" || typeof session.clipEnd !== "string") {
    throw new Error("Saved caption settings are invalid");
  }
  if (session.queuedClips.some((clip) => !clip || typeof clip !== "object" || typeof clip.videoPath !== "string" || !path.isAbsolute(clip.videoPath) ||
      !Number.isFinite(clip.id) || !["copy", "encode"].includes(clip.mode) || typeof clip.startTime !== "string" || typeof clip.endTime !== "string" || typeof clip.preview !== "string")) {
    throw new Error("caption project queued clip paths are invalid");
  }
  const validateSegments = (segments: CaptionProjectSession["captionSegments"]) => {
    if (!Array.isArray(segments) || segments.length > 50000 || segments.some((segment) => !segment ||
        !Number.isInteger(segment.index) || typeof segment.start !== "string" || segment.start.length > 32 ||
        typeof segment.end !== "string" || segment.end.length > 32 || typeof segment.text !== "string" || segment.text.length > 20000 ||
        (segment.edited !== undefined && typeof segment.edited !== "boolean"))) throw new Error("Saved captions are invalid");
  };
  validateSegments(session.captionSegments);
  if (session.audioProject) session.audioProject = audioEditUtils.validateProject(session.audioProject);
  const savedDuration = session.audioProject ? editedDuration(session.audioProject) : 86400;
  if (session.audioSelection !== undefined) {
    const selection = session.audioSelection;
    if (!selection || !Number.isFinite(selection.start) || !Number.isFinite(selection.end) || selection.start < 0 ||
        selection.end < selection.start || selection.end > savedDuration + 1e-6) throw new Error("Saved audio selection is invalid");
  }
  if (session.audioPlayhead !== undefined && (!Number.isFinite(session.audioPlayhead) || session.audioPlayhead < 0 || session.audioPlayhead > savedDuration + 1e-6)) {
    throw new Error("Saved audio playhead is invalid");
  }
  if (session.captionSource !== undefined && session.captionSource !== "original" && session.captionSource !== "edited") throw new Error("Invalid caption source");
  if (session.captionSets !== undefined) {
    if (!Array.isArray(session.captionSets) || session.captionSets.length > 100) throw new Error("Too many caption versions");
    const ids = new Set<string>();
    for (const set of session.captionSets) {
      if (!set || typeof set.id !== "string" || !set.id || set.id.length > 200 || ids.has(set.id) || typeof set.label !== "string" || set.label.length > 500 ||
          !["original", "edited"].includes(set.sourceKind) || typeof set.mediaPath !== "string" || !path.isAbsolute(set.mediaPath)) throw new Error("Invalid saved caption version");
      ids.add(set.id);
      set.project = audioEditUtils.validateProject(set.project);
      validateSegments(set.segments);
    }
    if (session.activeCaptionSetId != null && !ids.has(session.activeCaptionSetId)) throw new Error("Selected caption version is missing");
  }
  for (const filePath of getCaptionProjectPaths(session)) {
    const extension = path.extname(filePath).toLowerCase();
    if (!path.isAbsolute(filePath) || filePath.length > 32768 || (!AUDIO_EXTENSIONS.has(extension) && !VIDEO_EXTENSIONS.has(extension) && extension !== ".srt" && extension !== ".vtt")) {
      throw new Error("Saved project contains an unsupported file path");
    }
  }
  session.version = 2;
  session.captionSource ??= "original";
  session.captionSets ??= [];
  session.activeCaptionSetId ??= null;
  return session;
}

function setCaptionProjectSession(input: unknown): void {
  const session = validateCaptionSession(input);
  const previous = getCaptionProjectSession();
  const previousPaths = new Set(previous ? getCaptionProjectPaths(previous).map(getPathKey) : []);
  for (const filePath of getCaptionProjectPaths(session)) {
    // Missing saved media stays recoverable, without granting execution access to a new path.
    if (!isKnownFilePath(filePath) && !previousPaths.has(getPathKey(filePath))) {
      throw new Error("caption project contains a path that was not selected or generated by this application");
    }
  }

  settingsStore.set("captionProject", session);
}

function sendSettingsToWindows(settings = getAppSettings()): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send("settings:changed", settings);
    }
  }
}

function setThemeModeFromMenu(themeMode: PersistedSettings["themeMode"]): void {
  updatePersistedSettings({ themeMode });
  createApplicationMenu();
  sendSettingsToWindows();
}

function resolveDefaultSaveDirectory(mediaPathInput?: string | null): string {
  if (isKnownFilePath(mediaPathInput)) {
    const mediaDir = path.dirname(path.resolve(mediaPathInput));
    if (existsSync(mediaDir)) {
      return mediaDir;
    }
  }

  return path.resolve(app.getPath("documents"));
}

function normalizeRunWhisperRequest(input: unknown): RunWhisperRequest {
  if (typeof input === "string") {
    return { audioPath: input };
  }

  if (!input || typeof input !== "object") {
    throw new Error("run-whisper request must be an object");
  }

  const request = input as Partial<RunWhisperRequest>;
  if (typeof request.audioPath !== "string" || request.audioPath.trim() === "") {
    throw new Error("run-whisper request.audioPath must be a non-empty string");
  }

  if (request.sourcePath !== undefined && request.sourcePath !== null && typeof request.sourcePath !== "string") {
    throw new Error("run-whisper request.sourcePath must be a string, null, or undefined");
  }

  return {
    audioPath: request.audioPath,
    sourcePath: request.sourcePath ?? null
  };
}

function emitToolLog(event: IpcMainInvokeEvent, tool: ToolName, stream: StreamName, message: string): void {
  if (event.sender.isDestroyed()) {
    return;
  }

  event.sender.send("tools:log", {
    tool,
    stream,
    message
  } satisfies ToolLogEntry);
}

function getPrimaryWindow(): BrowserWindowType | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

function getOwnerWindowFromEvent(event: IpcMainInvokeEvent): BrowserWindowType | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? getPrimaryWindow();
}

function assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
  const expectedUrl = pathToFileURL(path.join(__dirname, "index.html")).href;
  if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== expectedUrl) {
    throw new Error("Rejected IPC request from an untrusted renderer frame");
  }
}

function registerIpcHandler<TArgs extends unknown[], TResult>(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: TArgs) => TResult | Promise<TResult>
): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedIpcSender(event);
    return listener(event, ...(args as unknown as TArgs));
  });
}

async function showOpenDialogForWindow(
  ownerWindow: BrowserWindowType | undefined,
  options: OpenDialogOptions
): Promise<OpenDialogReturnValue> {
  return ownerWindow ? dialog.showOpenDialog(ownerWindow, options) : dialog.showOpenDialog(options);
}

async function showOpenDialogForSender(
  event: IpcMainInvokeEvent,
  options: OpenDialogOptions
): Promise<OpenDialogReturnValue> {
  return showOpenDialogForWindow(getOwnerWindowFromEvent(event), options);
}

async function showSaveDialogForSender(
  event: IpcMainInvokeEvent,
  options: SaveDialogOptions
): Promise<SaveDialogReturnValue> {
  const ownerWindow = getOwnerWindowFromEvent(event);
  return ownerWindow ? dialog.showSaveDialog(ownerWindow, options) : dialog.showSaveDialog(options);
}

async function promptVideoSelection(ownerWindow?: BrowserWindowType): Promise<string | null> {
  const result = await showOpenDialogForWindow(ownerWindow, {
    title: "Select Video",
    properties: ["openFile"],
    filters: [
      { name: "Video Files", extensions: ["mp4", "mov", "mkv", "avi", "webm", "m4v"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = normalizeSupportedMediaFile(result.filePaths[0], "selected video");
  if (!VIDEO_EXTENSIONS.has(path.extname(selectedPath).toLowerCase())) {
    throw new Error("The selected file is not a supported video");
  }

  return rememberOriginalMediaPath(selectedPath);
}

async function promptAudioSelection(ownerWindow?: BrowserWindowType): Promise<string | null> {
  const result = await showOpenDialogForWindow(ownerWindow, {
    title: "Select Audio",
    properties: ["openFile"],
    filters: [
      { name: "Audio Files", extensions: ["wav", "mp3", "m4a", "aac", "flac", "ogg", "opus", "wma", "aiff", "aif"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = normalizeSupportedMediaFile(result.filePaths[0], "selected audio");
  if (!AUDIO_EXTENSIONS.has(path.extname(selectedPath).toLowerCase())) {
    throw new Error("The selected file is not a supported audio file");
  }

  return rememberOriginalMediaPath(selectedPath);
}

function sendMenuOpenVideo(videoPath: string): void {
  const window = getPrimaryWindow();
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
    return;
  }

  window.webContents.send("menu:open-video", videoPath);
}

function createApplicationMenu(): void {
  const settings = getPersistedSettings();
  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "Open Video...",
          accelerator: "CmdOrCtrl+O",
          click: async () => {
            const videoPath = await promptVideoSelection(getPrimaryWindow());
            if (videoPath) {
              sendMenuOpenVideo(videoPath);
            }
          }
        },
        {
          label: "Reveal Temp Folder",
          click: async () => {
            await shell.openPath(resolveTempDir());
          }
        },
        { type: "separator" },
        {
          role: "quit",
          accelerator: "CmdOrCtrl+Q"
        }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "Settings",
      submenu: [
        {
          label: "Appearance",
          submenu: [
            {
              label: "System",
              type: "radio",
              checked: settings.themeMode === "system",
              click: () => setThemeModeFromMenu("system")
            },
            {
              label: "Dark",
              type: "radio",
              checked: settings.themeMode === "dark",
              click: () => setThemeModeFromMenu("dark")
            },
            {
              label: "Light",
              type: "radio",
              checked: settings.themeMode === "light",
              click: () => setThemeModeFromMenu("light")
            },
            {
              label: "Retro Classic",
              type: "radio",
              checked: settings.themeMode === "retro",
              click: () => setThemeModeFromMenu("retro")
            }
          ]
        }
      ]
    },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" }, { role: "togglefullscreen" }]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About...",
          click: async () => {
            const details = [
              `Version: ${app.getVersion()}`,
              `User data: ${app.getPath("userData")}`,
              `Models dir: ${path.resolve(app.getPath("userData"), "models")}`,
              `Temp dir: ${resolveTempDir()}`
            ].join("\n");

            await dialog.showMessageBox({
              type: "info",
              title: "About Video Caption App",
              message: "Video Caption App",
              detail: details,
              buttons: ["OK"]
            });
          }
        },
        {
          label: "Open README",
          click: async () => {
            const readmePath = path.resolve(app.getAppPath(), "README.md");
            await shell.openPath(readmePath);
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function throwIfMediaRunCancelled(run: ActiveMediaRun): void {
  if (run.cancelled) {
    throw new Error(MEDIA_PROCESS_CANCELLED_MESSAGE);
  }
}

async function withMediaRun<T>(
  event: IpcMainInvokeEvent,
  operation: (run: ActiveMediaRun) => Promise<T>
): Promise<T> {
  const senderId = event.sender.id;
  if (activeMediaRuns.has(senderId)) {
    throw new Error("A media process is already active");
  }

  const run: ActiveMediaRun = {
    child: null,
    cancelled: false
  };
  activeMediaRuns.set(senderId, run);
  const cancelWhenSenderCloses = () => {
    cancelActiveMediaRun(senderId);
  };
  event.sender.once("destroyed", cancelWhenSenderCloses);

  try {
    return await operation(run);
  } finally {
    if (!event.sender.isDestroyed()) {
      event.sender.removeListener("destroyed", cancelWhenSenderCloses);
    }

    if (activeMediaRuns.get(senderId) === run) {
      activeMediaRuns.delete(senderId);
    }
  }
}

function cancelActiveMediaRun(senderId: number): boolean {
  const run = activeMediaRuns.get(senderId);
  if (!run) {
    return false;
  }

  run.cancelled = true;
  if (run.child && !run.child.killed) {
    run.child.kill();
  }

  return true;
}

async function runTool(
  event: IpcMainInvokeEvent,
  run: ActiveMediaRun,
  tool: ToolName,
  binaryPath: string,
  args: string[],
  cwd?: string,
  output?: { stdout?: (chunk: Buffer) => void; stderr?: (chunk: string) => void; quiet?: boolean }
): Promise<void> {
  throwIfMediaRunCancelled(run);

  await verifyRuntimeComponent(tool);
  throwIfMediaRunCancelled(run);

  return new Promise<void>((resolve, reject) => {
    // Selected media is local-only, even if a disguised container references a URL.
    const safeArgs = tool === "ffmpeg" ? ["-protocol_whitelist", "file,pipe", ...args] : args;
    const child = spawn(binaryPath, safeArgs, {
      cwd,
      windowsHide: true,
      shell: false
    });
    run.child = child;
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      if (run.child === child) {
        run.child = null;
      }

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    child.stdout.on("data", (chunk) => {
      if (output?.stdout) output.stdout(chunk as Buffer);
      else if (!output?.quiet) emitToolLog(event, tool, "stdout", chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      output?.stderr?.(chunk.toString());
      if (!output?.quiet) emitToolLog(event, tool, "stderr", chunk.toString());
    });

    child.on("error", (error) => {
      finish(run.cancelled ? new Error(MEDIA_PROCESS_CANCELLED_MESSAGE) : error);
    });

    child.on("close", (code) => {
      if (run.cancelled) {
        finish(new Error(MEDIA_PROCESS_CANCELLED_MESSAGE));
        return;
      }

      if (code === 0) {
        finish();
        return;
      }

      finish(new Error(`${tool} exited with code ${code ?? "null"}`));
    });
  });
}

async function resolveWhisperAudioPath(event: IpcMainInvokeEvent, run: ActiveMediaRun, audioPath: string): Promise<string> {
  const tempDir = resolveTempDir();
  const convertedAudioPath = getUniqueFilePath(tempDir, `${getSafeBaseName(audioPath)}_uploaded`, ".wav");
  const args = [
    "-nostdin", "-y",
    "-i",
    audioPath,
    "-map", "0:a:0",
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    convertedAudioPath
  ];

  try {
    await runTool(event, run, "ffmpeg", resolveBinaryPath("ffmpeg.exe"), args, path.dirname(audioPath));
    throwIfMediaRunCancelled(run);
    return convertedAudioPath;
  } catch (error) {
    removeIncompleteFile(convertedAudioPath);
    throw error;
  }
}

function removeIncompleteFile(filePath: string): void {
  if (existsSync(filePath)) {
    try { unlinkSync(filePath); } catch (error) { console.warn("Could not remove incomplete audio output", filePath, error); }
  }
}

function fileSignature(filePath: string): string {
  const stat = statSync(filePath);
  return `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
}

function checkAudioStorage(directory: string, bytes: number, managedPreview: boolean): void {
  if (managedPreview && bytes > MAX_PREVIEW_BYTES) {
    throw new Error("This recording needs more than 2 GB for an audio preview. Choose a shorter recording or extract a shorter section first.");
  }
  try {
    const space = statfsSync(directory);
    if (space.bavail * space.bsize < bytes + 64 * 1024 * 1024) throw new Error("There is not enough free disk space to prepare this audio. Free some space or choose another export drive.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOSYS" && (error as NodeJS.ErrnoException).code !== "ENOTSUP") throw error;
  }
}

function retainedAudioPaths(): Set<string> {
  const saved = getCaptionProjectSession();
  return new Set(saved ? getCaptionProjectPaths(saved).map(getPathKey) : []);
}

function pruneAudioCaches(): void {
  const retained = retainedAudioPaths();
  while (renderedAudioCache.size > 12) {
    const key = renderedAudioCache.keys().next().value as string;
    const old = renderedAudioCache.get(key)!;
    renderedAudioCache.delete(key);
    if (!retained.has(getPathKey(old.result.outputPath))) {
      removeIncompleteFile(old.result.outputPath);
      knownFilePaths.delete(getPathKey(old.result.outputPath));
    }
  }
  while (analyzedSources.size > 4) {
    const key = analyzedSources.keys().next().value as string;
    const old = analyzedSources.get(key)!;
    analyzedSources.delete(key);
    if (!retained.has(getPathKey(old.previewPath))) {
      removeIncompleteFile(old.previewPath);
      knownFilePaths.delete(getPathKey(old.previewPath));
    }
  }
}

function removeAbandonedAudioPreviews(): void {
  const retained = retainedAudioPaths();
  const tempDir = resolveTempDir();
  const cutoff = Date.now() - 7 * 86400 * 1000;
  for (const name of readdirSync(tempDir)) {
    if (!/^(?:original-[a-f0-9]{64}-[a-f0-9-]{36}\.wav|\.audio-[a-f0-9-]{36}\.(?:wav|mp3|flac)|audio-filter-[a-f0-9-]{36}\.txt)$/.test(name)) continue;
    const candidate = path.join(tempDir, name);
    if (!retained.has(getPathKey(candidate)) && statSync(candidate).mtimeMs < cutoff) removeIncompleteFile(candidate);
  }
}

async function probeAudio(event: IpcMainInvokeEvent, run: ActiveMediaRun, sourcePath: string): Promise<AudioMetadata> {
  let stdout = "";
  await runTool(event, run, "ffmpeg", resolveBinaryPath("ffprobe.exe"), ["-v", "error", "-select_streams", "a:0",
    "-show_entries", "stream=index,sample_rate,channels,duration:format=duration", "-of", "json", sourcePath],
    path.dirname(sourcePath), { quiet: true, stdout: (chunk) => { if (stdout.length < 1024 * 1024) stdout += chunk.toString(); } });
  throwIfMediaRunCancelled(run);
  return parseAudioMetadata(stdout);
}

async function analyzeSource(event: IpcMainInvokeEvent, run: ActiveMediaRun, input: unknown): Promise<AudioAnalysis> {
  const sourcePath = normalizeKnownExistingFile(input, "audio source");
  normalizeSupportedMediaFile(sourcePath, "audio source");
  const signature = fileSignature(sourcePath);
  const key = getPathKey(sourcePath);
  const cached = analyzedSources.get(key);
  if (cached?.fileSignature === signature && existsSync(cached.previewPath)) {
    return { sourcePath, sourceFingerprint: cached.sourceFingerprint, duration: cached.duration, sampleRate: cached.sampleRate,
      channels: cached.channels, peaks: cached.peaks, previewPath: cached.previewPath };
  }
  const metadata = await probeAudio(event, run, sourcePath);
  checkAudioStorage(resolveTempDir(), metadata.duration * metadata.sampleRate * metadata.channels * 3, true);
  const sourceFingerprint = await sha256File(sourcePath, () => run.cancelled);
  throwIfMediaRunCancelled(run);
  const peaks = new PeakAccumulator(metadata.duration);
  const previewPath = path.join(resolveTempDir(), `original-${sourceFingerprint}-${randomUUID()}.wav`);
  try {
    // One decode supplies the bounded overview and a browser-compatible full-quality playback proxy.
    await runTool(event, run, "ffmpeg", resolveBinaryPath("ffmpeg.exe"), ["-nostdin", "-y", "-hide_banner", "-i", sourcePath,
      "-map", `0:${metadata.streamIndex}`, "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", "pipe:1",
      "-map", `0:${metadata.streamIndex}`, "-vn", "-ar", String(metadata.sampleRate), "-ac", String(metadata.channels), "-c:a", "pcm_s24le", "-rf64", "auto", previewPath],
      path.dirname(sourcePath), { stdout: (chunk) => peaks.push(chunk) });
    throwIfMediaRunCancelled(run);
    if (fileSignature(sourcePath) !== signature) throw new Error("The original recording changed while it was loading. Open it again.");
    const result: AudioAnalysis = { sourcePath, sourceFingerprint, duration: metadata.duration, sampleRate: metadata.sampleRate,
      channels: metadata.channels, peaks: peaks.finish(), previewPath: rememberFilePath(previewPath) };
    analyzedSources.set(key, { ...result, streamIndex: metadata.streamIndex, fileSignature: signature });
    pruneAudioCaches();
    return result;
  } catch (error) {
    removeIncompleteFile(previewPath);
    throw error;
  }
}

async function renderAudioProject(event: IpcMainInvokeEvent, run: ActiveMediaRun, input: unknown): Promise<AudioRenderResult | null> {
  if (!input || typeof input !== "object") throw new Error("Audio render request must be an object");
  const request = input as AudioRenderRequest;
  const project: AudioEditProject = audioEditUtils.validateProject(request.project);
  if (!["preview", "caption", "export"].includes(request.purpose)) throw new Error("Invalid audio render purpose");
  const outputProfile = audioOutputArguments(request.format, project.sampleRate, project.channels);
  const sourcePath = normalizeKnownExistingFile(project.sourcePath, "audio source");
  normalizeSupportedMediaFile(sourcePath, "audio source");
  const sourceSignature = fileSignature(sourcePath);
  const fingerprint = await sha256File(sourcePath, () => run.cancelled);
  throwIfMediaRunCancelled(run);
  if (fingerprint !== project.sourceFingerprint) throw new Error("The original recording has changed. Open it again before using these edits.");
  const metadata = await probeAudio(event, run, sourcePath);
  if (Math.abs(metadata.duration - project.duration) > 0.025 || metadata.sampleRate !== project.sampleRate || metadata.channels !== project.channels) {
    throw new Error("The saved audio metadata no longer matches the original recording. Open it again.");
  }
  const cacheKey = createHash("sha256").update(JSON.stringify({ project, format: request.format })).digest("hex");
  const cached = renderedAudioCache.get(cacheKey);
  if (request.purpose !== "export" && cached && existsSync(cached.result.outputPath) && fileSignature(cached.result.outputPath) === cached.fileSignature) {
    if (fileSignature(sourcePath) !== sourceSignature) throw new Error("The original recording changed while loading. Open it again.");
    renderedAudioCache.delete(cacheKey);
    renderedAudioCache.set(cacheKey, cached);
    return cached.result;
  }
  let destinationPath: string | null = null;
  if (request.purpose === "export") {
    const save = await showSaveDialogForSender(event, { title: "Export audio", defaultPath: path.join(path.dirname(sourcePath), `${getSafeBaseName(sourcePath)}_edited.${request.format}`),
      filters: [{ name: `${request.format.toUpperCase()} audio`, extensions: [request.format] }] });
    throwIfMediaRunCancelled(run);
    if (save.canceled || !save.filePath) return null;
    destinationPath = path.resolve(save.filePath);
    if (!path.extname(destinationPath)) destinationPath += `.${request.format}`;
    if (path.extname(destinationPath).toLowerCase() !== `.${request.format}`) throw new Error(`Use a .${request.format} file name for this export.`);
    if (getPathKey(destinationPath) === getPathKey(sourcePath)) throw new Error("Choose another file name to keep the original recording safe.");
    assertNotOriginalDestination(destinationPath);
  }
  // A sibling temporary output makes the final rename atomic on the destination volume.
  const outputPath = path.join(destinationPath ? path.dirname(destinationPath) : resolveTempDir(), `.audio-${randomUUID()}.${request.format}`);
  checkAudioStorage(path.dirname(outputPath), editedDuration(project) * project.sampleRate * project.channels * 3, request.purpose !== "export");
  const filterPath = path.join(resolveTempDir(), `audio-filter-${randomUUID()}.txt`);
  let completed = false;
  try {
    let measurement = null;
    if (project.effects.normalize) {
      let stderr = "";
      writeFileSync(filterPath, buildAudioFilterGraph(project, metadata.streamIndex, "measure"), "utf8");
      await runTool(event, run, "ffmpeg", resolveBinaryPath("ffmpeg.exe"), ["-nostdin", "-hide_banner", "-i", sourcePath,
        "-filter_complex_script", filterPath, "-map", "[out]", "-f", "null", "-"],
        path.dirname(sourcePath), { stderr: (chunk) => { stderr = (stderr + chunk).slice(-65536); } });
      measurement = parseLoudnessMeasurement(stderr);
      if (!measurement) emitToolLog(event, "ffmpeg", "stderr", "The recording is silent or has no measurable loudness; normalization was skipped.\n");
    }
    writeFileSync(filterPath, buildAudioFilterGraph(project, metadata.streamIndex, measurement), "utf8");
    await runTool(event, run, "ffmpeg", resolveBinaryPath("ffmpeg.exe"), ["-nostdin", "-hide_banner", "-y", "-i", sourcePath,
      "-filter_complex_script", filterPath, "-map", "[out]", "-vn", ...outputProfile, outputPath], path.dirname(sourcePath));
    throwIfMediaRunCancelled(run);
    const outputMetadata = await probeAudio(event, run, outputPath);
    const expectedDuration = editedDuration(project);
    // Tempo filters and compressed encoders introduce bounded delay/padding, unlike PCM-only trims.
    const tolerance = request.format === "mp3" || project.effects.speed !== 1 || project.effects.pitchSemitones !== 0 ? 0.2 : 0.025;
    if (Math.abs(outputMetadata.duration - expectedDuration) > tolerance || outputMetadata.sampleRate !== project.sampleRate || outputMetadata.channels !== project.channels) {
      throw new Error("The rendered audio did not match the requested duration or audio quality. The export was not saved.");
    }
    throwIfMediaRunCancelled(run);
    if (fileSignature(sourcePath) !== sourceSignature) throw new Error("The original recording changed during processing. Open it again before exporting.");
    if (destinationPath) {
      assertNotOriginalDestination(destinationPath);
      renameSync(outputPath, destinationPath);
    }
    completed = true;
    const result = { outputPath: rememberFilePath(destinationPath ?? outputPath), format: request.format, duration: outputMetadata.duration };
    if (!destinationPath) {
      renderedAudioCache.set(cacheKey, { result, fileSignature: fileSignature(outputPath) });
      pruneAudioCaches();
    }
    return result;
  } finally {
    removeIncompleteFile(filterPath);
    if (!completed) removeIncompleteFile(outputPath);
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 980,
    height: 760,
    icon: resolveAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

  void mainWindow.loadFile(path.join(__dirname, "index.html"));
}

if (process.platform === "win32") {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

app.whenReady().then(() => {
  rememberPersistedCaptionProjectPaths();
  removeAbandonedAudioPreviews();
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [CONTENT_SECURITY_POLICY]
      }
    });
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createWindow();
  createApplicationMenu();

  registerIpcHandler("settings:get", async (): Promise<AppSettings> => {
    return getAppSettings();
  });

  registerIpcHandler("settings:set", async (_event, partial: Partial<PersistedSettings>): Promise<AppSettings> => {
    updatePersistedSettings(partial ?? {});
    createApplicationMenu();
    const settings = getAppSettings();
    sendSettingsToWindows(settings);
    return settings;
  });

  registerIpcHandler("caption-project:get", async (): Promise<CaptionProjectSession | null> => {
    return getCaptionProjectSession();
  });

  registerIpcHandler("caption-project:set", async (_event, session: CaptionProjectSession): Promise<void> => {
    setCaptionProjectSession(session);
  });

  registerIpcHandler("media-process:cancel", async (event): Promise<boolean> => {
    return cancelActiveMediaRun(event.sender.id);
  });

  registerIpcHandler("known-path-exists", async (_event, targetPath: unknown): Promise<boolean> => {
    return isKnownFilePath(targetPath) && existsSync(path.resolve(targetPath));
  });

  registerIpcHandler("open-temp-folder", async (): Promise<boolean> => {
    const result = await shell.openPath(resolveTempDir());
    return result === "";
  });

  registerIpcHandler("select-video", async (event): Promise<string | null> => {
    return promptVideoSelection(getOwnerWindowFromEvent(event));
  });

  registerIpcHandler("select-audio", async (event): Promise<string | null> => {
    return promptAudioSelection(getOwnerWindowFromEvent(event));
  });

  registerIpcHandler("analyze-audio", async (event, sourcePath: unknown): Promise<AudioAnalysis> =>
    withMediaRun(event, (run) => analyzeSource(event, run, sourcePath)));

  registerIpcHandler("render-edited-audio", async (event, request: unknown): Promise<AudioRenderResult | null> =>
    withMediaRun(event, (run) => renderAudioProject(event, run, request)));

  registerIpcHandler("authorize-dropped-file", async (_event, droppedPath: unknown): Promise<string | null> => {
    if (typeof droppedPath !== "string" || droppedPath.trim() === "") {
      return null;
    }

    try {
      return rememberOriginalMediaPath(normalizeSupportedMediaFile(droppedPath, "dropped file"));
    } catch {
      return null;
    }
  });

  registerIpcHandler("extract-audio", async (event, videoPath: unknown): Promise<ExtractAudioResult> => {
    return withMediaRun(event, async (run) => {
      const resolvedVideoPath = normalizeKnownExistingFile(videoPath, "videoPath");
      const tempDir = resolveTempDir();
      const audioPath = getUniqueFilePath(tempDir, `${getSafeBaseName(resolvedVideoPath)}_audio`, ".wav");
      const metadata = await probeAudio(event, run, resolvedVideoPath);
      try {
        await runTool(event, run, "ffmpeg", resolveBinaryPath("ffmpeg.exe"), ["-nostdin", "-y", "-i", resolvedVideoPath,
          "-map", `0:${metadata.streamIndex}`, "-vn", ...audioOutputArguments("wav", metadata.sampleRate, metadata.channels), audioPath], path.dirname(resolvedVideoPath));
        throwIfMediaRunCancelled(run);
        return { audioPath: rememberFilePath(audioPath) };
      } catch (error) {
        removeIncompleteFile(audioPath);
        throw error;
      }
    });
  });

  console.log("[main] clip-video handler registered");
  registerIpcHandler("clip-video", async (event, request: ClipVideoRequest) => {
    return withMediaRun(event, async (run) => {
      const resolvedVideoPath = normalizeKnownExistingFile(request?.videoPath, "videoPath");
      const startTime = typeof request?.startTime === "string" ? request.startTime.trim() : "";
      const endTime = typeof request?.endTime === "string" ? request.endTime.trim() : "";
      const mode = request?.mode;

      if (startTime === "") {
        throw new Error("startTime must be a non-empty string");
      }

      if (endTime === "") {
        throw new Error("endTime must be a non-empty string");
      }

      if (mode !== "copy" && mode !== "encode") {
        throw new Error("mode must be 'copy' or 'encode'");
      }

      const resolvedOutputPath = normalizeClipOutputPath(request?.outputPath, resolvedVideoPath);

      const args =
        mode === "copy"
          ? ["-y", "-ss", startTime, "-to", endTime, "-i", resolvedVideoPath, "-c", "copy", resolvedOutputPath]
          : [
              "-y",
              "-ss",
              startTime,
              "-to",
              endTime,
              "-i",
              resolvedVideoPath,
              "-c:v",
              "libx264",
              "-preset",
              "veryfast",
              "-crf",
              "20",
              "-c:a",
              "aac",
              "-b:a",
              "192k",
              resolvedOutputPath
            ];

      await runTool(event, run, "ffmpeg", resolveBinaryPath("ffmpeg.exe"), args, path.dirname(resolvedVideoPath));
      throwIfMediaRunCancelled(run);

      return {
        outputPath: rememberFilePath(resolvedOutputPath),
        mode
      };
    });
  });

  registerIpcHandler("run-whisper", async (event, input: unknown): Promise<RunWhisperResult> => {
    return withMediaRun(event, async (run) => {
      const request = normalizeRunWhisperRequest(input);
      const audioPath = normalizeKnownExistingFile(request.audioPath, "audioPath");
      if (request.sourcePath && !isKnownFilePath(request.sourcePath)) {
        throw new Error("sourcePath is not a file selected or generated by this application");
      }

      const tempDir = resolveTempDir();
      const outputBase = path.resolve(tempDir, `captions-${randomUUID()}`);
      const tempSrtPath = `${outputBase}.srt`;
      const tempVttPath = `${outputBase}.vtt`;

      const modelPath = resolveModelPath();

      await verifyFileIntegrity(
        modelPath,
        getRuntimeDependencyManifest().components.model.sha256,
        `Whisper model ${path.basename(modelPath)}`
      );

      const whisperAudioPath = await resolveWhisperAudioPath(event, run, audioPath);
      const args = ["-m", modelPath, "-f", whisperAudioPath, "-of", outputBase, "-osrt", "-ovtt"];
      let completed = false;
      try {
        await runTool(event, run, "whisper", resolveBinaryPath("whisper.exe"), args, path.dirname(whisperAudioPath));
        throwIfMediaRunCancelled(run);
        if (!existsSync(tempSrtPath) || !existsSync(tempVttPath)) throw new Error("Whisper finished without producing expected SRT/VTT files");
        const srtText = readFileSync(tempSrtPath, "utf8");
        throwIfMediaRunCancelled(run);
        completed = true;
        return { srtPath: rememberFilePath(tempSrtPath), vttPath: rememberFilePath(tempVttPath), modelPath, srtText };
      } finally {
        removeIncompleteFile(whisperAudioPath);
        if (!completed) {
          removeIncompleteFile(tempSrtPath);
          removeIncompleteFile(tempVttPath);
        }
      }
    });
  });

  registerIpcHandler("export-edited-audio", async (event, input: unknown): Promise<AudioEditResult> => {
    return withMediaRun(event, async (run) => {
      const request = input as Partial<AudioEditRequest>;
      const sourcePath = normalizeKnownExistingFile(request?.sourcePath, "sourcePath");
      const format = request?.format;
      if (format !== "wav" && format !== "mp3" && format !== "flac") throw new Error("format must be wav, mp3, or flac");
      const analysis = await analyzeSource(event, run, sourcePath);
      const parseTime = (value: unknown, fallback: number): number => {
        if (value === undefined || value === "") return fallback;
        if (typeof value !== "string" || !/^\d{1,4}:[0-5]\d:[0-5]\d(?:\.\d{1,6})?$/.test(value)) throw new Error("Use hours:minutes:seconds for the audio selection");
        const [hours, minutes, seconds] = value.split(":").map(Number);
        return hours * 3600 + minutes * 60 + seconds;
      };
      const project: AudioEditProject = { version: 1, sourcePath, sourceFingerprint: analysis.sourceFingerprint, duration: analysis.duration,
        sampleRate: analysis.sampleRate, channels: analysis.channels, revision: 0,
        clips: [{ id: "legacy-selection", trackId: "track-1", sourceStart: parseTime(request.startTime, 0), sourceEnd: parseTime(request.endTime, analysis.duration),
          gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0 }],
        effects: { gainDb: request.gainDb ?? 0, fadeInSeconds: request.fadeInSeconds ?? 0, fadeOutSeconds: request.fadeOutSeconds ?? 0,
          speed: request.speed ?? 1, pitchSemitones: request.pitchSemitones ?? 0, normalize: request.normalize ?? false, noiseReduction: request.noiseReduction ?? false } };
      return (await renderAudioProject(event, run, { project, format, purpose: "preview" }))!;
    });
  });
  registerIpcHandler("save-file-as", async (event, request: SaveFileAsRequest): Promise<string | null> => {
    const sourcePath = normalizeKnownExistingFile(request?.sourcePath, "sourcePath");
    const sourceExt = path.extname(sourcePath).toLowerCase();
    const expectedExt = sourceExt === ".srt" || sourceExt === ".vtt" || sourceExt === ".wav" || sourceExt === ".mp3" || sourceExt === ".flac" ? sourceExt : "";

    const defaultFileName =
      typeof request?.defaultFileName === "string" && request.defaultFileName.trim() !== ""
        ? request.defaultFileName.trim()
        : path.basename(sourcePath);
    const defaultDirectory = resolveDefaultSaveDirectory(request?.mediaPath);

    const filters =
      expectedExt === ".srt"
        ? [{ name: "SubRip (.srt)", extensions: ["srt"] }]
        : expectedExt === ".vtt"
          ? [{ name: "WebVTT (.vtt)", extensions: ["vtt"] }]
          : expectedExt === ".wav"
            ? [{ name: "Wave Audio (.wav)", extensions: ["wav"] }]
            : expectedExt === ".mp3"
              ? [{ name: "MP3 Audio (.mp3)", extensions: ["mp3"] }]
              : expectedExt === ".flac"
                ? [{ name: "FLAC Audio (.flac)", extensions: ["flac"] }]
                : undefined;

    const saveResult = await showSaveDialogForSender(event, {
      title: expectedExt === ".wav" || expectedExt === ".mp3" || expectedExt === ".flac" ? "Save Audio As" : "Save Captions As",
      defaultPath: path.resolve(defaultDirectory, defaultFileName),
      filters
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return null;
    }

    let destinationPath = path.resolve(saveResult.filePath);
    if (expectedExt && path.extname(destinationPath).toLowerCase() === "") {
      destinationPath += expectedExt;
    }

    assertNotOriginalDestination(destinationPath);
    copyFileSync(sourcePath, destinationPath);
    return rememberFilePath(destinationPath);
  });

  registerIpcHandler("save-text-as", async (event, request: SaveTextAsRequest): Promise<string | null> => {
    if (typeof request?.content !== "string") {
      throw new Error("content must be a string");
    }

    if (typeof request?.defaultFileName !== "string" || request.defaultFileName.trim() === "") {
      throw new Error("defaultFileName must be a non-empty string");
    }

    if (request.extension !== "srt" && request.extension !== "vtt") {
      throw new Error("extension must be srt or vtt");
    }

    const extension = `.${request.extension}`;
    const defaultDirectory = resolveDefaultSaveDirectory(request.mediaPath);
    const filter =
      request.extension === "srt"
        ? { name: "SubRip (.srt)", extensions: ["srt"] }
        : { name: "WebVTT (.vtt)", extensions: ["vtt"] };

    const saveResult = await showSaveDialogForSender(event, {
      title: "Save Captions As",
      defaultPath: path.resolve(defaultDirectory, request.defaultFileName.trim()),
      filters: [filter]
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return null;
    }

    let destinationPath = path.resolve(saveResult.filePath);
    if (path.extname(destinationPath).toLowerCase() === "") {
      destinationPath += extension;
    }

    writeFileSync(destinationPath, request.content, "utf8");
    return rememberFilePath(destinationPath);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});








