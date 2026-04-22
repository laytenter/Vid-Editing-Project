type AppSettings = {
  outputDir: string | null;
  saveWavToOutputDir: boolean;
  saveCaptionsToOutputDir: boolean;
  documentsDir: string;
};

type AudioSourceKind = "uploaded" | "extracted" | null;

function mustGet<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id} in index.html`);
  return el as T;
}

const selectVideoButton = mustGet<HTMLButtonElement>("selectVideoButton");
const selectAudioButton = mustGet<HTMLButtonElement>("selectAudioButton");
const extractAudioButton = mustGet<HTMLButtonElement>("extractAudioButton");
const generateCaptionsButton = mustGet<HTMLButtonElement>("generateCaptionsButton");
const saveSrtButton = mustGet<HTMLButtonElement>("saveSrtButton");
const saveVttButton = mustGet<HTMLButtonElement>("saveVttButton");
const captionSourceStatusNode = mustGet<HTMLElement>("captionSourceStatus");

const selectedVideoPathNode = mustGet<HTMLElement>("selectedVideoPath");
const audioPathNode = mustGet<HTMLElement>("audioPath");
const srtPathNode = mustGet<HTMLElement>("srtPath");
const vttPathNode = mustGet<HTMLElement>("vttPath");
const logPanel = mustGet<HTMLPreElement>("logPanel");

const outputDirLabel = mustGet<HTMLElement>("outputDirLabel");
const chooseOutputDirButton = mustGet<HTMLButtonElement>("chooseOutputDirButton");
const openOutputDirButton = mustGet<HTMLButtonElement>("openOutputDirButton");
const openTempFolderButton = mustGet<HTMLButtonElement>("openTempFolderButton");
const saveWavCheckbox = mustGet<HTMLInputElement>("saveWavCheckbox");
const saveCaptionsCheckbox = mustGet<HTMLInputElement>("saveCaptionsCheckbox");
const dropZone = mustGet<HTMLDivElement>("dropZone");
const showRawLogsCheckbox = mustGet<HTMLInputElement>("showRawLogsCheckbox");
const logFilterSelect = mustGet<HTMLSelectElement>("logFilterSelect");
const copyLogButton = mustGet<HTMLButtonElement>("copyLogButton");
const clipStartInput = mustGet<HTMLInputElement>("clipStart");
const clipEndInput = mustGet<HTMLInputElement>("clipEnd");
const clipModeSelect = mustGet<HTMLSelectElement>("clipMode");
const clipCreateButton = mustGet<HTMLButtonElement>("clipCreateBtn");

let selectedVideoPath: string | null = null;
let audioPath: string | null = null;
let srtPath: string | null = null;
let vttPath: string | null = null;
let audioSourceKind: AudioSourceKind = null;
let isBusy = false;
let settingsBusy = false;
let currentSettings: AppSettings | null = null;

const allowedVideoExtensions = new Set(["mp4", "mov", "mkv", "avi", "webm", "m4v"]);
const allowedAudioExtensions = new Set(["wav", "mp3", "m4a", "aac", "flac", "ogg", "opus", "wma", "aiff", "aif"]);

showRawLogsCheckbox.checked = false;
logFilterSelect.value = "all";

type ToolName = "ffmpeg" | "whisper";
type StreamName = "stdout" | "stderr";
type LogFilter = "all" | "ffmpeg" | "whisper" | "errors";

interface StoredLogEntry {
  tool?: ToolName;
  stream?: StreamName;
  message: string;
  isError: boolean;
  ts: number;
}

const logEntries: StoredLogEntry[] = [];
const maxLogEntries = 5000;
let logRenderScheduled = false;

function isSupportedVideoPath(filePath: string): boolean {
  const extensionMatch = filePath.toLowerCase().match(/\.([^.\\/]+)$/);
  if (!extensionMatch) {
    return false;
  }

  return allowedVideoExtensions.has(extensionMatch[1]);
}

function isSupportedAudioPath(filePath: string): boolean {
  const extensionMatch = filePath.toLowerCase().match(/\.([^.\\/]+)$/);
  if (!extensionMatch) {
    return false;
  }

  return allowedAudioExtensions.has(extensionMatch[1]);
}

function setBusy(next: boolean): void {
  isBusy = next;
  syncButtons();
}

function setSettingsBusy(next: boolean): void {
  settingsBusy = next;
  syncButtons();
}

function syncButtons(): void {
  extractAudioButton.disabled = isBusy || !selectedVideoPath;
  generateCaptionsButton.disabled = isBusy || !audioPath;
  saveSrtButton.disabled = isBusy || !srtPath;
  saveVttButton.disabled = isBusy || !vttPath;
  selectVideoButton.disabled = isBusy;
  selectAudioButton.disabled = isBusy;

  chooseOutputDirButton.disabled = isBusy || settingsBusy;
  openOutputDirButton.disabled = isBusy || settingsBusy;
  openTempFolderButton.disabled = isBusy || settingsBusy;
  saveWavCheckbox.disabled = isBusy || settingsBusy;
  saveCaptionsCheckbox.disabled = isBusy || settingsBusy;
  clipCreateButton.disabled = isBusy || !selectedVideoPath;
}

function getDirectoryFromPath(filePath: string): string | null {
  const normalized = filePath.replace(/\//g, "\\");
  const index = normalized.lastIndexOf("\\");
  if (index <= 0) {
    return null;
  }

  return normalized.slice(0, index);
}

function getBaseNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\//g, "\\");
  const lastSeparatorIndex = normalized.lastIndexOf("\\");
  const fileName = lastSeparatorIndex >= 0 ? normalized.slice(lastSeparatorIndex + 1) : normalized;
  const extensionIndex = fileName.lastIndexOf(".");
  const rawBaseName = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
  const safeBaseName = rawBaseName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim();
  return safeBaseName.length > 0 ? safeBaseName : "video";
}

function getCaptionContextPath(): string | null {
  if (!audioPath) {
    return selectedVideoPath;
  }

  if (audioSourceKind === "uploaded") {
    return audioPath;
  }

  return selectedVideoPath ?? audioPath;
}

function getCaptionSourceStatus(): { label: string; state: string } {
  if (audioSourceKind === "uploaded" && audioPath) {
    return { label: "Uploaded audio ready", state: "uploaded" };
  }

  if (audioSourceKind === "extracted" && audioPath) {
    return { label: "Extracted audio ready", state: "extracted" };
  }

  if (selectedVideoPath) {
    return { label: "Video selected", state: "video-ready" };
  }

  return { label: "No source selected", state: "idle" };
}

function normalizeTimeForFileName(value: string): string {
  return value.replace(/[:.]/g, "-");
}

function joinOutputPath(outputDir: string, fileName: string): string {
  if (outputDir === "") {
    return fileName;
  }

  const separator = outputDir.includes("\\") ? "\\" : "/";
  if (outputDir.endsWith("\\") || outputDir.endsWith("/")) {
    return `${outputDir}${fileName}`;
  }

  return `${outputDir}${separator}${fileName}`;
}

function getEffectiveOutputDirectory(contextPath: string | null = getCaptionContextPath()): string {
  if (!currentSettings) {
    return "(auto)";
  }

  if (currentSettings.outputDir) {
    return currentSettings.outputDir;
  }

  if (contextPath) {
    return getDirectoryFromPath(contextPath) ?? currentSettings.documentsDir;
  }

  return currentSettings.documentsDir;
}

function updateOutputDirLabel(): void {
  if (!currentSettings) {
    outputDirLabel.textContent = "(auto)";
    return;
  }

  if (currentSettings.outputDir) {
    outputDirLabel.textContent = currentSettings.outputDir;
    return;
  }

  outputDirLabel.textContent = `(auto) ${getEffectiveOutputDirectory()}`;
}

function refreshPaths(): void {
  selectedVideoPathNode.textContent = selectedVideoPath ?? "(none)";
  audioPathNode.textContent = audioPath ?? "(none)";
  srtPathNode.textContent = srtPath ?? "(none)";
  vttPathNode.textContent = vttPath ?? "(none)";
  const sourceStatus = getCaptionSourceStatus();
  captionSourceStatusNode.textContent = sourceStatus.label;
  captionSourceStatusNode.dataset.state = sourceStatus.state;
  updateOutputDirLabel();
}

function isNoisyFfmpegProgressLine(message: string): boolean {
  const line = message.trim().toLowerCase();
  return line.startsWith("size=") || (line.includes("time=") && line.includes("bitrate="));
}

function shouldMarkEntryAsError(message: string, stream?: StreamName): boolean {
  if (stream === "stderr") {
    return true;
  }

  return /\berror\b|\bfailed\b/i.test(message);
}

function splitMessageLines(message: string): string[] {
  return message
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

function renderLogPanel(): void {
  const filterValue = (logFilterSelect.value as LogFilter) || "all";
  const showRawLogs = showRawLogsCheckbox.checked;
  const rendered: string[] = [];

  for (const entry of logEntries) {
    if (!showRawLogs && entry.tool === "ffmpeg" && isNoisyFfmpegProgressLine(entry.message)) {
      continue;
    }

    if (filterValue === "ffmpeg" && entry.tool !== "ffmpeg") {
      continue;
    }

    if (filterValue === "whisper" && entry.tool !== "whisper") {
      continue;
    }

    if (filterValue === "errors" && !entry.isError) {
      continue;
    }

    const prefix = entry.tool ? `[${entry.tool}:${entry.stream ?? "stdout"}] ` : "";
    rendered.push(`${prefix}${entry.message}`);
  }

  logPanel.textContent = rendered.join("\n");
  logPanel.scrollTop = logPanel.scrollHeight;
}

function scheduleLogPanelRender(): void {
  if (logRenderScheduled) {
    return;
  }

  logRenderScheduled = true;
  window.requestAnimationFrame(() => {
    logRenderScheduled = false;
    renderLogPanel();
  });
}

function addLogEntries(
  message: string,
  options: {
    tool?: ToolName;
    stream?: StreamName;
    isError?: boolean;
  } = {}
): void {
  const lines = splitMessageLines(message);
  if (lines.length === 0) {
    return;
  }

  const now = Date.now();
  for (const line of lines) {
    logEntries.push({
      tool: options.tool,
      stream: options.stream,
      message: line,
      isError: options.isError ?? shouldMarkEntryAsError(line, options.stream),
      ts: now
    });
  }

  if (logEntries.length > maxLogEntries) {
    logEntries.splice(0, logEntries.length - maxLogEntries);
  }

  scheduleLogPanelRender();
}

function appendLog(message: string): void {
  addLogEntries(message);
}

function renderSettings(settings: AppSettings): void {
  currentSettings = settings;
  updateOutputDirLabel();
  saveWavCheckbox.checked = settings.saveWavToOutputDir;
  saveCaptionsCheckbox.checked = settings.saveCaptionsToOutputDir;
}

async function refreshSettings(): Promise<void> {
  const settings = await window.videoTools.getSettings();
  renderSettings(settings);
}

function appendSetupHintForMissingDependency(errorMessage: string): void {
  const binaryPrefix = "Binary not found:";
  const modelPrefix = "Model not found:";

  if (errorMessage.includes(binaryPrefix)) {
    const missingPath = errorMessage.slice(errorMessage.indexOf(binaryPrefix) + binaryPrefix.length).trim();
    appendLog(`[setup] Missing binary: ${missingPath}`);
    appendLog("[setup] Put ffmpeg.exe, ffprobe.exe, and whisper.exe in <project>\\bin\\.");
    appendLog("[setup] FFmpeg downloads: https://www.gyan.dev/ffmpeg/builds/ or https://github.com/BtbN/FFmpeg-Builds/releases");
    appendLog("[setup] whisper.cpp downloads: https://github.com/ggml-org/whisper.cpp/releases (extract CLI and rename to whisper.exe)");
    return;
  }

  if (errorMessage.includes(modelPrefix)) {
    const missingPath = errorMessage.slice(errorMessage.indexOf(modelPrefix) + modelPrefix.length).trim();
    const modelDir = missingPath.replace(/\\[^\\]+$/, "");
    appendLog(`[setup] Missing model: ${missingPath}`);
    appendLog(`[setup] Place GGML model files in: ${modelDir}`);
    appendLog("[setup] Model download: https://huggingface.co/ggerganov/whisper.cpp (e.g., ggml-base.en.bin)");
  }
}

function applySelectedVideo(videoPath: string): void {
  selectedVideoPath = videoPath;
  audioPath = null;
  srtPath = null;
  vttPath = null;
  audioSourceKind = null;

  refreshPaths();
  syncButtons();
  appendLog(`Selected video: ${selectedVideoPath}`);
}

function applySelectedAudio(nextAudioPath: string): void {
  audioPath = nextAudioPath;
  srtPath = null;
  vttPath = null;
  audioSourceKind = "uploaded";

  refreshPaths();
  syncButtons();
  appendLog(`Selected audio: ${audioPath}`);
}

try {
  window.videoTools.onToolLog((entry) => {
    addLogEntries(entry.message, {
      tool: entry.tool,
      stream: entry.stream
    });
  });
} catch (error) {
  console.error("Failed to subscribe to tools:log", error);
}

if (typeof window.videoTools.onMenuOpenVideo === "function") {
  try {
    window.videoTools.onMenuOpenVideo((videoPath) => {
      if (typeof videoPath !== "string" || videoPath.trim() === "") {
        return;
      }

      applySelectedVideo(videoPath);
    });
  } catch (error) {
    console.error("Failed to subscribe to menu:open-video", error);
  }
}


window.addEventListener("error", (event) => {
  const message =
    event.error instanceof Error
      ? event.error.stack ?? event.error.message
      : event.message || "Unknown renderer error";
  addLogEntries(`Renderer error: ${message}`, { isError: true });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  let reasonText = "Unknown rejection";

  if (reason instanceof Error) {
    reasonText = reason.stack ?? reason.message;
  } else if (typeof reason === "string") {
    reasonText = reason;
  } else if (reason !== null && reason !== undefined) {
    try {
      reasonText = JSON.stringify(reason);
    } catch {
      reasonText = String(reason);
    }
  }

  addLogEntries(`Unhandled rejection: ${reasonText}`, { isError: true });
});

showRawLogsCheckbox.addEventListener("change", () => {
  scheduleLogPanelRender();
});

logFilterSelect.addEventListener("change", () => {
  scheduleLogPanelRender();
});

copyLogButton.addEventListener("click", async () => {
  const text = logPanel.textContent ?? "";

  try {
    await navigator.clipboard.writeText(text);
    appendLog("Log copied to clipboard.");
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);

    try {
      textarea.focus();
      textarea.select();
      const copied = document.execCommand("copy");
      if (!copied) {
        throw new Error("Clipboard copy failed");
      }
      appendLog("Log copied to clipboard.");
    } catch (error) {
      appendLog(`Copy log failed: ${(error as Error).message}`);
    } finally {
      document.body.removeChild(textarea);
    }
  }
});

selectVideoButton.addEventListener("click", async () => {
  setBusy(true);

  try {
    const chosenPath = await window.videoTools.selectVideo();

    if (!chosenPath) {
      appendLog("Video selection cancelled.");
      return;
    }

    applySelectedVideo(chosenPath);
  } catch (error) {
    appendLog(`Select video failed: ${(error as Error).message}`);
  } finally {
    setBusy(false);
  }
});

selectAudioButton.addEventListener("click", async () => {
  setBusy(true);

  try {
    const chosenPath = await window.videoTools.selectAudio();

    if (!chosenPath) {
      appendLog("Audio selection cancelled.");
      return;
    }

    applySelectedAudio(chosenPath);
  } catch (error) {
    appendLog(`Select audio failed: ${(error as Error).message}`);
  } finally {
    setBusy(false);
  }
});

window.addEventListener("menu:open-video", (event: Event) => {
  const customEvent = event as CustomEvent<string>;
  const videoPath = customEvent.detail;

  if (typeof videoPath !== "string" || videoPath.trim() === "") {
    return;
  }

  applySelectedVideo(videoPath);
});

window.addEventListener("dragover", (event) => {
  event.preventDefault();
});

window.addEventListener("drop", (event) => {
  event.preventDefault();
});

dropZone.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dropZone.classList.add("drop-active");
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("drop-active");
});

dropZone.addEventListener("dragleave", (event) => {
  event.preventDefault();
  dropZone.classList.remove("drop-active");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("drop-active");

  const files = event.dataTransfer?.files;
  if (!files || files.length !== 1) {
    appendLog("Drop rejected: not a supported video or audio type");
    return;
  }

  const droppedFile = files[0] as File & { path?: string };
  const droppedPath = typeof droppedFile.path === "string" ? droppedFile.path.trim() : "";

  if (!droppedPath) {
    appendLog("Drop rejected: not a supported video or audio type");
    return;
  }

  if (isSupportedVideoPath(droppedPath)) {
    applySelectedVideo(droppedPath);
    appendLog(`Dropped video: ${droppedPath}`);
    return;
  }

  if (isSupportedAudioPath(droppedPath)) {
    applySelectedAudio(droppedPath);
    appendLog(`Dropped audio: ${droppedPath}`);
    return;
  }

  appendLog("Drop rejected: not a supported video or audio type");
});

chooseOutputDirButton.addEventListener("click", async () => {
  setSettingsBusy(true);

  try {
    const selected = await window.videoTools.chooseOutputFolder();
    await refreshSettings();

    if (selected) {
      appendLog(`Output folder set: ${selected}`);
    } else {
      appendLog("Output folder selection cancelled.");
    }
  } catch (error) {
    appendLog(`Choose output folder failed: ${(error as Error).message}`);
  } finally {
    setSettingsBusy(false);
  }
});

openOutputDirButton.addEventListener("click", async () => {
  setSettingsBusy(true);

  try {
    const targetPath = getEffectiveOutputDirectory();
    const ok = await window.videoTools.openPath(targetPath);
    appendLog(ok ? `Opened output folder: ${targetPath}` : `Could not open output folder: ${targetPath}`);
  } catch (error) {
    appendLog(`Open output folder failed: ${(error as Error).message}`);
  } finally {
    setSettingsBusy(false);
  }
});

openTempFolderButton.addEventListener("click", async () => {
  setSettingsBusy(true);

  try {
    const ok = await window.videoTools.openTempFolder();
    appendLog(ok ? "Opened temp folder." : "Could not open temp folder.");
  } catch (error) {
    appendLog(`Open temp folder failed: ${(error as Error).message}`);
  } finally {
    setSettingsBusy(false);
  }
});

saveWavCheckbox.addEventListener("change", async () => {
  setSettingsBusy(true);

  try {
    const settings = await window.videoTools.setSettings({
      saveWavToOutputDir: saveWavCheckbox.checked
    });
    renderSettings(settings);
  } catch (error) {
    appendLog(`Update setting failed: ${(error as Error).message}`);
    await refreshSettings();
  } finally {
    setSettingsBusy(false);
  }
});

saveCaptionsCheckbox.addEventListener("change", async () => {
  setSettingsBusy(true);

  try {
    const settings = await window.videoTools.setSettings({
      saveCaptionsToOutputDir: saveCaptionsCheckbox.checked
    });
    renderSettings(settings);
  } catch (error) {
    appendLog(`Update setting failed: ${(error as Error).message}`);
    await refreshSettings();
  } finally {
    setSettingsBusy(false);
  }
});

clipCreateButton.addEventListener("click", async () => {
  if (!selectedVideoPath) {
    appendLog("Create clip failed: no video selected.");
    return;
  }

  const startTime = clipStartInput.value.trim();
  const endTime = clipEndInput.value.trim();

  if (startTime === "" || endTime === "") {
    appendLog("Create clip failed: start and end time are required.");
    return;
  }

  const mode = clipModeSelect.value === "encode" ? "encode" : "copy";
  const fallbackOutputDir = getDirectoryFromPath(selectedVideoPath) ?? "";
  let outputDir = currentSettings ? getEffectiveOutputDirectory(selectedVideoPath) : fallbackOutputDir;
  if (outputDir === "(auto)") outputDir = fallbackOutputDir;

  if (outputDir === "") {
    appendLog("Create clip failed: unable to resolve output directory.");
    return;
  }

  const baseName = getBaseNameFromPath(selectedVideoPath);
  const safeStart = normalizeTimeForFileName(startTime);
  const safeEnd = normalizeTimeForFileName(endTime);
  const fileName = `${baseName}_clip_${safeStart}-${safeEnd}_${Date.now()}.mp4`;
  const outputPath = joinOutputPath(outputDir, fileName);

  setBusy(true);

  try {
    const result = await window.videoTools.clipVideo({
      videoPath: selectedVideoPath,
      startTime,
      endTime,
      outputPath,
      mode
    });
    appendLog(`Clip created: ${result.outputPath}`);
  } catch (error) {
    appendLog(`Create clip failed: ${(error as Error).message}`);
  } finally {
    setBusy(false);
  }
});

extractAudioButton.addEventListener("click", async () => {
  if (!selectedVideoPath) {
    return;
  }

  setBusy(true);
  appendLog("Starting audio extraction...");

  try {
    const result = await window.videoTools.extractAudio(selectedVideoPath);
    audioPath = result.audioPath;
    srtPath = null;
    vttPath = null;
    audioSourceKind = "extracted";

    refreshPaths();
    syncButtons();
    appendLog(`Audio extracted: ${audioPath}`);
  } catch (error) {
    const message = (error as Error).message;
    appendLog(`Audio extraction failed: ${message}`);
    appendSetupHintForMissingDependency(message);
  } finally {
    setBusy(false);
  }
});

generateCaptionsButton.addEventListener("click", async () => {
  if (!audioPath) {
    return;
  }

  setBusy(true);
  appendLog("Starting whisper caption generation...");

  try {
    const result = await window.videoTools.runWhisper({
      audioPath,
      sourcePath: getCaptionContextPath()
    });
    srtPath = result.srtPath;
    vttPath = result.vttPath;

    refreshPaths();
    syncButtons();
    appendLog(`Captions generated: ${srtPath}, ${vttPath}`);
  } catch (error) {
    const message = (error as Error).message;
    appendLog(`Caption generation failed: ${message}`);
    appendSetupHintForMissingDependency(message);
  } finally {
    setBusy(false);
  }
});

saveSrtButton.addEventListener("click", async () => {
  if (!srtPath) {
    return;
  }

  setBusy(true);

  try {
    const savedPath = await window.videoTools.saveFileAs({
      sourcePath: srtPath,
      defaultFileName: "captions.srt",
      mediaPath: getCaptionContextPath()
    });

    appendLog(savedPath ? `Saved SRT to: ${savedPath}` : "SRT save cancelled.");
  } catch (error) {
    appendLog(`Save SRT failed: ${(error as Error).message}`);
  } finally {
    setBusy(false);
  }
});

saveVttButton.addEventListener("click", async () => {
  if (!vttPath) {
    return;
  }

  setBusy(true);

  try {
    const savedPath = await window.videoTools.saveFileAs({
      sourcePath: vttPath,
      defaultFileName: "captions.vtt",
      mediaPath: getCaptionContextPath()
    });

    appendLog(savedPath ? `Saved VTT to: ${savedPath}` : "VTT save cancelled.");
  } catch (error) {
    appendLog(`Save VTT failed: ${(error as Error).message}`);
  } finally {
    setBusy(false);
  }
});

async function initSettingsPanel(): Promise<void> {
  setSettingsBusy(true);

  try {
    await refreshSettings();
  } catch (error) {
    appendLog(`Load settings failed: ${(error as Error).message}`);
  } finally {
    setSettingsBusy(false);
  }
}

refreshPaths();
syncButtons();
appendLog("Ready.");
void initSettingsPanel();







