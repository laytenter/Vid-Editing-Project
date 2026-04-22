import type {
  BrowserWindow as BrowserWindowType,
  IpcMainInvokeEvent,
  MenuItemConstructorOptions,
  OpenDialogOptions,
  OpenDialogReturnValue,
  SaveDialogOptions,
  SaveDialogReturnValue
} from "electron";
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import Store from "electron-store";
import type {
  AppSettings,
  ClipVideoRequest,
  ExtractAudioResult,
  PersistedSettings,
  RunWhisperRequest,
  RunWhisperResult,
  SaveFileAsRequest,
  ToolLogEntry
} from "./types";

const electronRuntime = require("electron");
if (typeof electronRuntime === "string") {
  console.error("[fatal] require('electron') returned a string, which indicates this process is running in Node mode instead of Electron app mode.");
  console.error("[fatal] Ensure startup uses Electron as the launcher (for example: .\\node_modules\\.bin\\electron.cmd .) and ELECTRON_RUN_AS_NODE is not set.");
  process.exit(1);
}
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron") as typeof import("electron");

console.log("[startup] process.execPath:", process.execPath);
console.log("[startup] process.argv:", process.argv);
console.log("[startup] process.versions:", process.versions);
console.log("[startup] typeof require('electron'):", typeof electronRuntime);
console.log("[startup] Object.keys(require('electron') || {}):", Object.keys(electronRuntime || {}));

type BinaryName = "ffmpeg.exe" | "whisper.exe";
type ToolName = ToolLogEntry["tool"];
type StreamName = ToolLogEntry["stream"];

const settingsStore = new Store<PersistedSettings>({
  defaults: {
    outputDir: null,
    saveWavToOutputDir: true,
    saveCaptionsToOutputDir: false
  }
});

function resolveBinaryPath(binaryName: BinaryName): string {
  const baseDir = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return path.resolve(baseDir, "bin", binaryName);
}

function resolveTempDir(): string {
  const tempDir = path.resolve(app.getPath("userData"), "temp");
  mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function resolveModelPath(): string {
  const modelDir = path.resolve(app.getPath("userData"), "models");
  return path.resolve(modelDir, "ggml-base.en.bin");
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
  const outputDirValue = settingsStore.get("outputDir");
  const outputDir =
    typeof outputDirValue === "string" && outputDirValue.trim() !== "" ? path.resolve(outputDirValue) : null;

  return {
    outputDir,
    saveWavToOutputDir: settingsStore.get("saveWavToOutputDir") !== false,
    saveCaptionsToOutputDir: settingsStore.get("saveCaptionsToOutputDir") === true
  };
}

function getAppSettings(): AppSettings {
  return {
    ...getPersistedSettings(),
    documentsDir: path.resolve(app.getPath("documents"))
  };
}

function updatePersistedSettings(partial: Partial<PersistedSettings>): PersistedSettings {
  if (Object.prototype.hasOwnProperty.call(partial, "outputDir")) {
    const value = partial.outputDir;
    if (typeof value === "string" && value.trim() !== "") {
      settingsStore.set("outputDir", path.resolve(value));
    } else {
      settingsStore.set("outputDir", null);
    }
  }

  if (typeof partial.saveWavToOutputDir === "boolean") {
    settingsStore.set("saveWavToOutputDir", partial.saveWavToOutputDir);
  }

  if (typeof partial.saveCaptionsToOutputDir === "boolean") {
    settingsStore.set("saveCaptionsToOutputDir", partial.saveCaptionsToOutputDir);
  }

  return getPersistedSettings();
}

function resolveDefaultSaveDirectory(mediaPathInput?: string | null): string {
  const settings = getPersistedSettings();

  if (settings.outputDir && existsSync(settings.outputDir)) {
    return settings.outputDir;
  }

  if (typeof mediaPathInput === "string" && mediaPathInput.trim() !== "") {
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

  return path.resolve(result.filePaths[0]);
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

  return path.resolve(result.filePaths[0]);
}

async function promptOutputFolder(ownerWindow?: BrowserWindowType): Promise<string | null> {
  const result = await showOpenDialogForWindow(ownerWindow, {
    title: "Choose Output Folder",
    properties: ["openDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedDir = path.resolve(result.filePaths[0]);
  updatePersistedSettings({ outputDir: selectedDir });
  return selectedDir;
}

function sendMenuOpenVideo(videoPath: string): void {
  const window = getPrimaryWindow();
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
    return;
  }

  window.webContents.send("menu:open-video", videoPath);
}

function createApplicationMenu(): void {
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
          label: "Choose Output Folder...",
          click: async () => {
            await promptOutputFolder(getPrimaryWindow());
          }
        },
        {
          label: "Reveal Output Folder",
          click: async () => {
            const targetPath = resolveDefaultSaveDirectory(null);
            await shell.openPath(targetPath);
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

function runTool(
  event: IpcMainInvokeEvent,
  tool: ToolName,
  binaryPath: string,
  args: string[],
  cwd?: string
): Promise<void> {
  if (!existsSync(binaryPath)) {
    throw new Error(`Binary not found: ${binaryPath}`);
  }

  return new Promise<void>((resolve, reject) => {
    const child = spawn(binaryPath, args, {
      cwd,
      windowsHide: true,
      shell: false
    });

    child.stdout.on("data", (chunk) => {
      emitToolLog(event, tool, "stdout", chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      emitToolLog(event, tool, "stderr", chunk.toString());
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${tool} exited with code ${code ?? "null"}`));
    });
  });
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 980,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  void mainWindow.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  createApplicationMenu();

  ipcMain.handle("settings:get", async (): Promise<AppSettings> => {
    return getAppSettings();
  });

  ipcMain.handle("settings:set", async (_event, partial: Partial<PersistedSettings>): Promise<AppSettings> => {
    updatePersistedSettings(partial ?? {});
    return getAppSettings();
  });

  ipcMain.handle("choose-output-folder", async (event): Promise<string | null> => {
    return promptOutputFolder(getOwnerWindowFromEvent(event));
  });

  ipcMain.handle("open-path", async (_event, targetPath: unknown): Promise<boolean> => {
    if (typeof targetPath !== "string" || targetPath.trim() === "") {
      throw new Error("open-path requires a non-empty path string");
    }

    const result = await shell.openPath(path.resolve(targetPath));
    return result === "";
  });

  ipcMain.handle("open-temp-folder", async (): Promise<boolean> => {
    const result = await shell.openPath(resolveTempDir());
    return result === "";
  });

  ipcMain.handle("select-video", async (event): Promise<string | null> => {
    return promptVideoSelection(getOwnerWindowFromEvent(event));
  });

  ipcMain.handle("select-audio", async (event): Promise<string | null> => {
    return promptAudioSelection(getOwnerWindowFromEvent(event));
  });

  ipcMain.handle("extract-audio", async (event, videoPath: unknown): Promise<ExtractAudioResult> => {
    const resolvedVideoPath = normalizeExistingFile(videoPath, "videoPath");
    const settings = getPersistedSettings();

    let audioPath: string;
    if (settings.saveWavToOutputDir) {
      const outputDir = resolveDefaultSaveDirectory(resolvedVideoPath);
      const baseName = getSafeBaseName(resolvedVideoPath);
      audioPath = getUniqueFilePath(outputDir, baseName, ".wav");
    } else {
      const tempDir = resolveTempDir();
      audioPath = path.resolve(tempDir, "audio.wav");
    }

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

    await runTool(event, "ffmpeg", resolveBinaryPath("ffmpeg.exe"), args, path.dirname(resolvedVideoPath));

    return { audioPath };
  });

  console.log("[main] clip-video handler registered");
  ipcMain.handle("clip-video", async (event, request: ClipVideoRequest) => {
    const resolvedVideoPath = normalizeExistingFile(request?.videoPath, "videoPath");
    const startTime = typeof request?.startTime === "string" ? request.startTime.trim() : "";
    const endTime = typeof request?.endTime === "string" ? request.endTime.trim() : "";
    const outputPathInput = typeof request?.outputPath === "string" ? request.outputPath.trim() : "";
    const mode = request?.mode;

    if (startTime === "") {
      throw new Error("startTime must be a non-empty string");
    }

    if (endTime === "") {
      throw new Error("endTime must be a non-empty string");
    }

    if (outputPathInput === "") {
      throw new Error("outputPath must be a non-empty string");
    }

    if (mode !== "copy" && mode !== "encode") {
      throw new Error("mode must be 'copy' or 'encode'");
    }

    const resolvedOutputPath = path.resolve(outputPathInput);
    const outputDir = path.dirname(resolvedOutputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

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

    await runTool(event, "ffmpeg", resolveBinaryPath("ffmpeg.exe"), args, path.dirname(resolvedVideoPath));

    return {
      outputPath: resolvedOutputPath,
      mode
    };
  });

  ipcMain.handle("run-whisper", async (event, input: unknown): Promise<RunWhisperResult> => {
    const request = normalizeRunWhisperRequest(input);
    const audioPath = normalizeExistingFile(request.audioPath, "audioPath");
    const normalizedSourcePath =
      typeof request.sourcePath === "string" && request.sourcePath.trim() !== "" ? path.resolve(request.sourcePath) : null;
    const baseName = getSafeBaseName(normalizedSourcePath ?? audioPath);

    const tempDir = resolveTempDir();
    const outputBase = path.resolve(tempDir, "captions");
    const tempSrtPath = `${outputBase}.srt`;
    const tempVttPath = `${outputBase}.vtt`;

    const modelPath = resolveModelPath();

    if (!existsSync(modelPath)) {
      throw new Error(`Model not found: ${modelPath}`);
    }

    const args = ["-m", modelPath, "-f", audioPath, "-of", outputBase, "-osrt", "-ovtt"];

    await runTool(event, "whisper", resolveBinaryPath("whisper.exe"), args, path.dirname(audioPath));

    if (!existsSync(tempSrtPath) || !existsSync(tempVttPath)) {
      throw new Error("Whisper finished without producing expected SRT/VTT files");
    }

    let srtPath = tempSrtPath;
    let vttPath = tempVttPath;
    const settings = getPersistedSettings();

    if (settings.saveCaptionsToOutputDir) {
      const outputDir = resolveDefaultSaveDirectory(normalizedSourcePath ?? audioPath);
      const copiedSrtPath = getUniqueFilePath(outputDir, baseName, ".srt");
      const copiedVttPath = getUniqueFilePath(outputDir, baseName, ".vtt");

      copyFileSync(tempSrtPath, copiedSrtPath);
      copyFileSync(tempVttPath, copiedVttPath);

      srtPath = copiedSrtPath;
      vttPath = copiedVttPath;
    }

    return { srtPath, vttPath, modelPath };
  });

  ipcMain.handle("save-file-as", async (event, request: SaveFileAsRequest): Promise<string | null> => {
    const sourcePath = normalizeExistingFile(request?.sourcePath, "sourcePath");
    const sourceExt = path.extname(sourcePath).toLowerCase();
    const expectedExt = sourceExt === ".srt" || sourceExt === ".vtt" ? sourceExt : "";

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
          : undefined;

    const saveResult = await showSaveDialogForSender(event, {
      title: "Save Captions As",
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
    return destinationPath;
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








