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
import { createHash } from "node:crypto";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Store from "electron-store";
import type {
  AppSettings,
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

type BinaryName = "ffmpeg.exe" | "whisper.exe";
type ToolName = ToolLogEntry["tool"];
type StreamName = ToolLogEntry["stream"];

const APP_USER_MODEL_ID = "com.local.video-caption-app";
const MEDIA_PROCESS_CANCELLED_MESSAGE = "Media process cancelled";
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' file: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"]);
const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma", ".aiff", ".aif"]);
const REQUIRED_RUNTIME_FILES: Record<ToolName, readonly string[]> = {
  ffmpeg: ["ffmpeg.exe"],
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

function isKnownFilePath(input: unknown): input is string {
  return typeof input === "string" && input.trim() !== "" && knownFilePaths.has(getPathKey(input));
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
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

function getPersistedSettings(): PersistedSettings {
  const themeModeValue = settingsStore.get("themeMode");
  const themeMode =
    themeModeValue === "dark" || themeModeValue === "light" || themeModeValue === "system" ? themeModeValue : "system";

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
  if (partial.themeMode === "system" || partial.themeMode === "dark" || partial.themeMode === "light") {
    settingsStore.set("themeMode", partial.themeMode);
  }

  return getPersistedSettings();
}

function getCaptionProjectSession(): CaptionProjectSession | null {
  return settingsStore.get("captionProject") ?? null;
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
    ...queuedClipPaths
  ].filter((filePath): filePath is string => typeof filePath === "string" && filePath.trim() !== "");
}

function rememberPersistedCaptionProjectPaths(): void {
  const session = getCaptionProjectSession();
  if (!session || session.version !== 1) {
    return;
  }

  for (const filePath of getCaptionProjectPaths(session)) {
    if (existsSync(path.resolve(filePath))) {
      rememberFilePath(filePath);
    }
  }
}

function setCaptionProjectSession(input: unknown): void {
  if (!input || typeof input !== "object" || (input as Partial<CaptionProjectSession>).version !== 1) {
    throw new Error("caption project must be a version 1 session");
  }

  const session = input as CaptionProjectSession;
  if (!Array.isArray(session.queuedClips) || !Array.isArray(session.captionSegments)) {
    throw new Error("caption project arrays are invalid");
  }

  for (const filePath of [session.selectedVideoPath, session.audioPath, session.srtPath, session.vttPath]) {
    if (filePath !== null && typeof filePath !== "string") {
      throw new Error("caption project file paths must be strings or null");
    }
  }

  if (session.queuedClips.some((clip) => !clip || typeof clip !== "object" || typeof clip.videoPath !== "string")) {
    throw new Error("caption project queued clip paths are invalid");
  }

  for (const filePath of getCaptionProjectPaths(session)) {
    if (!isKnownFilePath(filePath)) {
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

  return rememberFilePath(selectedPath);
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

  return rememberFilePath(selectedPath);
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
  cwd?: string
): Promise<void> {
  throwIfMediaRunCancelled(run);

  await verifyRuntimeComponent(tool);
  throwIfMediaRunCancelled(run);

  return new Promise<void>((resolve, reject) => {
    const child = spawn(binaryPath, args, {
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
      emitToolLog(event, tool, "stdout", chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      emitToolLog(event, tool, "stderr", chunk.toString());
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
  if (path.extname(audioPath).toLowerCase() !== ".m4a") {
    return audioPath;
  }

  const tempDir = resolveTempDir();
  const convertedAudioPath = getUniqueFilePath(tempDir, `${getSafeBaseName(audioPath)}_uploaded`, ".wav");
  const args = [
    "-y",
    "-i",
    audioPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    convertedAudioPath
  ];

  await runTool(event, run, "ffmpeg", resolveBinaryPath("ffmpeg.exe"), args, path.dirname(audioPath));
  throwIfMediaRunCancelled(run);

  return rememberFilePath(convertedAudioPath);
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

  registerIpcHandler("authorize-dropped-file", async (_event, droppedPath: unknown): Promise<string | null> => {
    if (typeof droppedPath !== "string" || droppedPath.trim() === "") {
      return null;
    }

    try {
      return rememberFilePath(normalizeSupportedMediaFile(droppedPath, "dropped file"));
    } catch {
      return null;
    }
  });

  registerIpcHandler("extract-audio", async (event, videoPath: unknown): Promise<ExtractAudioResult> => {
    return withMediaRun(event, async (run) => {
      const resolvedVideoPath = normalizeKnownExistingFile(videoPath, "videoPath");
      const tempDir = resolveTempDir();
      const audioPath = getUniqueFilePath(tempDir, `${getSafeBaseName(resolvedVideoPath)}_audio`, ".wav");

      const args = [
        "-y",
        "-i",
        resolvedVideoPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        audioPath
      ];

      await runTool(event, run, "ffmpeg", resolveBinaryPath("ffmpeg.exe"), args, path.dirname(resolvedVideoPath));
      throwIfMediaRunCancelled(run);

      return { audioPath: rememberFilePath(audioPath) };
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
      const outputBase = path.resolve(tempDir, "captions");
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

      await runTool(event, run, "whisper", resolveBinaryPath("whisper.exe"), args, path.dirname(whisperAudioPath));
      throwIfMediaRunCancelled(run);

      if (!existsSync(tempSrtPath) || !existsSync(tempVttPath)) {
        throw new Error("Whisper finished without producing expected SRT/VTT files");
      }

      const srtText = readFileSync(tempSrtPath, "utf8");
      throwIfMediaRunCancelled(run);

      return {
        srtPath: rememberFilePath(tempSrtPath),
        vttPath: rememberFilePath(tempVttPath),
        modelPath,
        srtText
      };
    });
  });

  registerIpcHandler("save-file-as", async (event, request: SaveFileAsRequest): Promise<string | null> => {
    const sourcePath = normalizeKnownExistingFile(request?.sourcePath, "sourcePath");
    const sourceExt = path.extname(sourcePath).toLowerCase();
    const expectedExt = sourceExt === ".srt" || sourceExt === ".vtt" || sourceExt === ".wav" ? sourceExt : "";

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
            : undefined;

    const saveResult = await showSaveDialogForSender(event, {
      title: expectedExt === ".wav" ? "Save Audio As" : "Save Captions As",
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








