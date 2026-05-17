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
const captionSegmentsCountNode = mustGet<HTMLElement>("captionSegmentsCount");
const captionSegmentListNode = mustGet<HTMLElement>("captionSegmentList");
const captionSelectionSummaryNode = mustGet<HTMLElement>("captionSelectionSummary");
const captionClearSelectionButton = mustGet<HTMLButtonElement>("captionClearSelectionButton");
const previewStatusNode = mustGet<HTMLElement>("previewStatus");
const previewVideoNode = mustGet<HTMLVideoElement>("previewVideo");
const previewAudioNode = mustGet<HTMLAudioElement>("previewAudio");
const previewEmptyNode = mustGet<HTMLElement>("previewEmpty");
const actionStatusNode = mustGet<HTMLElement>("actionStatus");
const actionProgressTrackNode = mustGet<HTMLElement>("actionProgressTrack");
const actionProgressBarNode = mustGet<HTMLElement>("actionProgressBar");
const actionProgressTextNode = mustGet<HTMLElement>("actionProgressText");

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
const rawLogDetails = mustGet<HTMLElement>("rawLogDetails");
const rawLogsToggleLabel = mustGet<HTMLElement>("rawLogsToggleLabel");
const rawLogsToggleText = mustGet<HTMLElement>("rawLogsToggleText");
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
type ActiveActionKind = "extract" | "caption" | "clip";
type ActionStatusMode = "idle" | "indeterminate" | "determinate" | "done" | "failed";

interface StoredLogEntry {
  tool?: ToolName;
  stream?: StreamName;
  message: string;
  isError: boolean;
  ts: number;
}

interface CaptionSegment {
  index: number;
  start: string;
  end: string;
  text: string;
}

interface ActiveAction {
  kind: ActiveActionKind;
  label: string;
  startedAtMs: number;
  totalDurationSeconds: number | null;
}

const logEntries: StoredLogEntry[] = [];
const maxLogEntries = 5000;
let logRenderScheduled = false;
let captionSegments: CaptionSegment[] = [];
let activeAction: ActiveAction | null = null;
let whisperStdoutBuffer = "";
let captionSegmentUserScrolledUp = false;
let captionRangeAnchorIndex: number | null = null;
let captionRangeFocusIndex: number | null = null;
let captionRangeComplete = false;
let activePlaybackSegmentIndex: number | null = null;
let currentPreviewKind: "video" | "audio" | null = null;
let currentPreviewUrl: string | null = null;

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

function isM4aAudioPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".m4a");
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

function getPreviewSource(): { kind: "video" | "audio"; mediaPath: string } | null {
  if (audioSourceKind === "uploaded" && audioPath) {
    return { kind: "audio", mediaPath: audioPath };
  }

  if (selectedVideoPath) {
    return { kind: "video", mediaPath: selectedVideoPath };
  }

  if (audioPath) {
    return { kind: "audio", mediaPath: audioPath };
  }

  return null;
}

function encodeFileUrlPath(filePath: string): string {
  return filePath
    .replace(/\\/g, "/")
    .split("/")
    .map((part, index) => (index === 0 && /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part)))
    .join("/");
}

function filePathToFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");

  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${encodeFileUrlPath(normalized)}`;
  }

  if (normalized.startsWith("/")) {
    return `file://${encodeFileUrlPath(normalized)}`;
  }

  return `file:///${encodeFileUrlPath(normalized)}`;
}

function getActivePreviewElement(): HTMLMediaElement | null {
  if (currentPreviewKind === "video" && !previewVideoNode.hidden) {
    return previewVideoNode;
  }

  if (currentPreviewKind === "audio" && !previewAudioNode.hidden) {
    return previewAudioNode;
  }

  return null;
}

function clearActivePlaybackSegment(): void {
  if (activePlaybackSegmentIndex === null) {
    return;
  }

  activePlaybackSegmentIndex = null;
  renderCaptionSegments();
}

function updateMediaPreview(): void {
  const source = getPreviewSource();

  if (!source) {
    previewStatusNode.textContent = "No media selected";
    previewEmptyNode.hidden = false;
    previewVideoNode.hidden = true;
    previewAudioNode.hidden = true;
    previewVideoNode.removeAttribute("src");
    previewAudioNode.removeAttribute("src");
    previewVideoNode.load();
    previewAudioNode.load();
    currentPreviewKind = null;
    currentPreviewUrl = null;
    clearActivePlaybackSegment();
    return;
  }

  const nextUrl = filePathToFileUrl(source.mediaPath);
  const nextElement = source.kind === "video" ? previewVideoNode : previewAudioNode;
  const otherElement = source.kind === "video" ? previewAudioNode : previewVideoNode;
  const changed = currentPreviewKind !== source.kind || currentPreviewUrl !== nextUrl;

  previewStatusNode.textContent = source.kind === "video" ? "Video preview ready" : "Audio preview ready";
  previewEmptyNode.hidden = true;
  nextElement.hidden = false;
  otherElement.hidden = true;

  if (changed) {
    previewVideoNode.pause();
    previewAudioNode.pause();
    otherElement.removeAttribute("src");
    otherElement.load();
    nextElement.src = nextUrl;
    nextElement.load();
    currentPreviewKind = source.kind;
    currentPreviewUrl = nextUrl;
    clearActivePlaybackSegment();
  }
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
  updateMediaPreview();
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

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseTimestampSeconds(value: string): number | null {
  const match = value
    .trim()
    .replace(",", ".")
    .match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fraction = match[4] ? Number(`0.${match[4]}`) : 0;

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds) || !Number.isFinite(fraction)) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds + fraction;
}

function getClipDurationSeconds(startTime: string, endTime: string): number | null {
  const startSeconds = parseTimestampSeconds(startTime);
  const endSeconds = parseTimestampSeconds(endTime);

  if (startSeconds === null || endSeconds === null || endSeconds <= startSeconds) {
    return null;
  }

  return endSeconds - startSeconds;
}

function formatRemainingTime(secondsInput: number): string {
  const totalSeconds = Math.max(0, Math.ceil(secondsInput));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${paddedMinutes}:${paddedSeconds}`;
  }

  return `${paddedMinutes}:${paddedSeconds}`;
}

function parseFfmpegDurationSeconds(message: string): number | null {
  const match = message.match(/Duration:\s*(\d+:\d{2}:\d{2}(?:[,.]\d+)?)/i);
  return match ? parseTimestampSeconds(match[1]) : null;
}

function parseFfmpegProgressSeconds(message: string): number | null {
  const match = message.match(/\btime=\s*(\d+:\d{2}:\d{2}(?:[,.]\d+)?)/i);
  return match ? parseTimestampSeconds(match[1]) : null;
}

function parseWhisperPercent(message: string): number | null {
  const match = message.match(/\b(\d{1,3}(?:\.\d+)?)\s*%/);
  if (!match) {
    return null;
  }

  const percent = Number(match[1]);
  return Number.isFinite(percent) ? clampNumber(percent, 0, 100) : null;
}

function parseWhisperDurationSeconds(message: string): number | null {
  const match = message.match(/\(\d+\s+samples,\s*(\d+(?:\.\d+)?)\s*sec\)/i);
  if (!match) {
    return null;
  }

  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function parseWhisperCaptionLine(line: string): CaptionSegment | null {
  const match = line.match(
    /^\s*\[(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})\]\s*(.*)$/
  );

  if (!match) {
    return null;
  }

  const text = match[3].trim();
  return {
    index: captionSegments.length + 1,
    start: normalizeCaptionTime(match[1]),
    end: normalizeCaptionTime(match[2]),
    text: text || "(no text)"
  };
}

function setActionStatus(label: string, text: string, mode: ActionStatusMode, percent = 0): void {
  const clampedPercent = clampNumber(percent, 0, 100);
  actionStatusNode.textContent = label;
  actionProgressTextNode.textContent = text;
  actionProgressBarNode.classList.toggle("is-indeterminate", mode === "indeterminate");
  actionProgressBarNode.classList.toggle("is-complete", mode === "done");
  actionProgressBarNode.classList.toggle("is-failed", mode === "failed");
  actionProgressBarNode.style.width = mode === "indeterminate" ? "34%" : `${clampedPercent}%`;

  if (mode === "determinate" || mode === "done" || mode === "failed") {
    actionProgressTrackNode.setAttribute("aria-valuenow", String(Math.round(clampedPercent)));
  } else {
    actionProgressTrackNode.removeAttribute("aria-valuenow");
  }

  actionProgressTrackNode.setAttribute("aria-busy", mode === "indeterminate" ? "true" : "false");
}

function setIdleActionStatus(): void {
  activeAction = null;
  setActionStatus("Idle", "Idle", "idle", 0);
}

function startActionStatus(kind: ActiveActionKind, label: string, totalDurationSeconds: number | null = null): void {
  if (kind === "caption") {
    whisperStdoutBuffer = "";
    captionSegmentUserScrolledUp = false;
  }

  activeAction = {
    kind,
    label,
    startedAtMs: Date.now(),
    totalDurationSeconds
  };

  if (totalDurationSeconds !== null) {
    setActionStatus(label, "0%", "determinate", 0);
    return;
  }

  setActionStatus(label, "Working...", "indeterminate", 0);
}

function setActiveActionStage(label: string, totalDurationSeconds: number | null = null): void {
  if (!activeAction || activeAction.label === label) {
    return;
  }

  activeAction.label = label;
  activeAction.startedAtMs = Date.now();
  activeAction.totalDurationSeconds = totalDurationSeconds;

  if (totalDurationSeconds !== null) {
    setActionStatus(label, "0%", "determinate", 0);
    return;
  }

  setActionStatus(label, "Working...", "indeterminate", 0);
}

function updateDeterminateActionProgress(percentInput: number): void {
  if (!activeAction) {
    return;
  }

  const percent = clampNumber(percentInput, 0, 100);
  const fraction = percent / 100;
  let text = `${Math.round(percent)}%`;

  if (fraction > 0 && fraction < 1) {
    const elapsedWallSeconds = (Date.now() - activeAction.startedAtMs) / 1000;
    const remainingSeconds = elapsedWallSeconds / fraction - elapsedWallSeconds;

    if (Number.isFinite(remainingSeconds) && remainingSeconds >= 0) {
      text = `${text} - about ${formatRemainingTime(remainingSeconds)} remaining`;
    }
  }

  setActionStatus(activeAction.label, text, "determinate", percent);
}

function updateFfmpegActionProgress(message: string): void {
  if (!activeAction) {
    return;
  }

  const durationSeconds = parseFfmpegDurationSeconds(message);
  if (durationSeconds !== null && activeAction.totalDurationSeconds === null) {
    activeAction.totalDurationSeconds = durationSeconds;
  }

  const progressSeconds = parseFfmpegProgressSeconds(message);
  if (progressSeconds === null) {
    return;
  }

  if (activeAction.totalDurationSeconds === null || activeAction.totalDurationSeconds <= 0) {
    setActionStatus(activeAction.label, "Working...", "indeterminate", 0);
    return;
  }

  updateDeterminateActionProgress((progressSeconds / activeAction.totalDurationSeconds) * 100);
}

function getCaptionStatusText(): string {
  const segmentLabel = captionSegments.length === 1 ? "segment" : "segments";
  return captionSegments.length > 0 ? `Generating captions... ${captionSegments.length} ${segmentLabel}` : "Generating captions...";
}

function updateWhisperActionProgress(message: string): void {
  if (!activeAction) {
    return;
  }

  const durationSeconds = parseWhisperDurationSeconds(message);
  if (durationSeconds !== null && activeAction.totalDurationSeconds === null) {
    activeAction.totalDurationSeconds = durationSeconds;
  }

  const percent = parseWhisperPercent(message);
  if (percent === null) {
    setActionStatus(activeAction.label, getCaptionStatusText(), "indeterminate", 0);
    return;
  }

  updateDeterminateActionProgress(percent);
}

function updateCaptionProgressFromTimestamp(endTime: string): void {
  if (!activeAction || activeAction.kind !== "caption") {
    return;
  }

  const endSeconds = parseTimestampSeconds(endTime);
  if (endSeconds === null || activeAction.totalDurationSeconds === null || activeAction.totalDurationSeconds <= 0) {
    setActionStatus(activeAction.label, getCaptionStatusText(), "indeterminate", 0);
    return;
  }

  updateDeterminateActionProgress((endSeconds / activeAction.totalDurationSeconds) * 100);
}

function shouldAutoScrollCaptionSegments(): boolean {
  if (!activeAction || activeAction.kind !== "caption") {
    return false;
  }

  return !captionSegmentUserScrolledUp;
}

function scrollCaptionSegmentsToBottom(): void {
  captionSegmentListNode.scrollTop = captionSegmentListNode.scrollHeight;
}

function findCaptionSegment(index: number | null): CaptionSegment | null {
  if (index === null) {
    return null;
  }

  return captionSegments.find((segment) => segment.index === index) ?? null;
}

function setActivePlaybackSegmentForSeconds(seconds: number): void {
  const segment =
    captionSegments.find((candidate) => {
      const startSeconds = parseTimestampSeconds(candidate.start);
      const endSeconds = parseTimestampSeconds(candidate.end);
      return startSeconds !== null && endSeconds !== null && seconds >= startSeconds && seconds < endSeconds;
    }) ?? null;
  const nextIndex = segment?.index ?? null;

  if (activePlaybackSegmentIndex === nextIndex) {
    return;
  }

  activePlaybackSegmentIndex = nextIndex;
  renderCaptionSegments();
}

function seekMediaToTimestamp(timestamp: string): void {
  const seconds = parseTimestampSeconds(timestamp);
  const mediaElement = getActivePreviewElement();

  if (seconds === null || !mediaElement) {
    return;
  }

  mediaElement.pause();

  try {
    mediaElement.currentTime = seconds;
  } catch {
    return;
  }

  setActivePlaybackSegmentForSeconds(seconds);
}

function updateActivePlaybackSegmentFromMedia(): void {
  const mediaElement = getActivePreviewElement();
  if (!mediaElement) {
    return;
  }

  setActivePlaybackSegmentForSeconds(mediaElement.currentTime);
}

function clearCaptionRangeSelection(): void {
  captionRangeAnchorIndex = null;
  captionRangeFocusIndex = null;
  captionRangeComplete = false;
  renderCaptionSegments();
}

function renderCaptionSelectionSummary(): void {
  const anchorSegment = findCaptionSegment(captionRangeAnchorIndex);
  const focusSegment = findCaptionSegment(captionRangeFocusIndex);
  captionClearSelectionButton.hidden = !anchorSegment;

  if (!anchorSegment) {
    captionSelectionSummaryNode.hidden = true;
    captionSelectionSummaryNode.replaceChildren();
    return;
  }

  captionSelectionSummaryNode.hidden = false;
  captionSelectionSummaryNode.replaceChildren();

  const titleNode = document.createElement("div");
  titleNode.className = "caption-selection-title";
  const detailNode = document.createElement("div");
  detailNode.className = "caption-selection-detail";

  if (!captionRangeComplete || !focusSegment) {
    titleNode.textContent = `Start: ${anchorSegment.start} - ${getShortCaptionPreview(anchorSegment.text)}`;
    detailNode.textContent = "Click another segment to set the end.";
  } else {
    const startSegment = anchorSegment.index <= focusSegment.index ? anchorSegment : focusSegment;
    const endSegment = anchorSegment.index <= focusSegment.index ? focusSegment : anchorSegment;
    titleNode.textContent = `Range: ${startSegment.start} -> ${endSegment.end}`;
    detailNode.textContent = `${getShortCaptionPreview(startSegment.text)} / ${getShortCaptionPreview(endSegment.text)}`;
  }

  captionSelectionSummaryNode.append(titleNode, detailNode);
}

function selectCaptionSegment(segment: CaptionSegment): void {
  if (captionRangeAnchorIndex === null || captionRangeComplete) {
    captionRangeAnchorIndex = segment.index;
    captionRangeFocusIndex = segment.index;
    captionRangeComplete = false;
    clipStartInput.value = segment.start;
    clipEndInput.value = segment.end;
    renderCaptionSegments();
    appendLog("Clip range start set from caption segment.");
    return;
  }

  const anchorSegment = findCaptionSegment(captionRangeAnchorIndex);
  if (!anchorSegment) {
    captionRangeAnchorIndex = segment.index;
    captionRangeFocusIndex = segment.index;
    captionRangeComplete = false;
    clipStartInput.value = segment.start;
    clipEndInput.value = segment.end;
    renderCaptionSegments();
    appendLog("Clip range start set from caption segment.");
    return;
  }

  if (segment.index === anchorSegment.index) {
    clipStartInput.value = segment.start;
    clipEndInput.value = segment.end;
    renderCaptionSegments();
    appendLog("Clip range start set from caption segment.");
    return;
  }

  captionRangeFocusIndex = segment.index;
  captionRangeComplete = true;

  if (segment.index < anchorSegment.index) {
    clipStartInput.value = segment.start;
    clipEndInput.value = anchorSegment.end;
  } else {
    clipStartInput.value = anchorSegment.start;
    clipEndInput.value = segment.end;
  }

  renderCaptionSegments();
  appendLog("Clip range set from caption segments.");
}

function handleLiveWhisperCaptionLine(line: string): void {
  const segment = parseWhisperCaptionLine(line);
  if (!segment) {
    return;
  }

  const duplicate = captionSegments.some(
    (existing) => existing.start === segment.start && existing.end === segment.end && existing.text === segment.text
  );

  if (duplicate) {
    return;
  }

  const shouldScroll = shouldAutoScrollCaptionSegments();
  captionSegments.push(segment);
  renderCaptionSegments();

  if (shouldScroll) {
    scrollCaptionSegmentsToBottom();
  }

  updateCaptionProgressFromTimestamp(segment.end);
}

function processWhisperStdoutChunk(message: string): void {
  // whisper.cpp may buffer stdout until late; only update live rows when timestamped chunks actually arrive.
  whisperStdoutBuffer += message.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const lines = whisperStdoutBuffer.split("\n");
  whisperStdoutBuffer = lines.pop() ?? "";

  for (const line of lines) {
    handleLiveWhisperCaptionLine(line);
  }
}

function updateActionProgressFromToolLog(entry: { tool: ToolName; stream?: StreamName; message: string }): void {
  if (!activeAction) {
    return;
  }

  if (activeAction.kind === "caption" && entry.tool === "whisper" && entry.stream === "stdout") {
    processWhisperStdoutChunk(entry.message);
  }

  for (const line of splitMessageLines(entry.message)) {
    if (activeAction.kind === "caption") {
      if (entry.tool === "ffmpeg") {
        setActiveActionStage("Converting audio...");
        updateFfmpegActionProgress(line);
      } else if (entry.tool === "whisper") {
        setActiveActionStage("Generating captions...");
        if (entry.stream !== "stdout" || !parseWhisperCaptionLine(line)) {
          updateWhisperActionProgress(line);
        }
      }

      continue;
    }

    if (entry.tool === "ffmpeg") {
      updateFfmpegActionProgress(line);
    }
  }
}

function completeActionStatus(): void {
  activeAction = null;
  setActionStatus("Done", "Done", "done", 100);
}

function failActionStatus(message: string): void {
  activeAction = null;
  setActionStatus(`Failed: ${message}`, "Failed", "failed", 100);
}

function syncRawLogVisibility(): void {
  const showRawLogs = showRawLogsCheckbox.checked;
  rawLogDetails.hidden = !showRawLogs;
  rawLogsToggleLabel.classList.toggle("is-active", showRawLogs);
  rawLogsToggleText.textContent = showRawLogs ? "Hide raw logs" : "Show raw logs";
}

function normalizeCaptionTime(value: string): string {
  return value.replace(",", ".");
}

function getCaptionPreview(text: string): string {
  return text.length <= 120 ? text : `${text.slice(0, 117).trimEnd()}...`;
}

function getShortCaptionPreview(text: string): string {
  return text.length <= 72 ? text : `${text.slice(0, 69).trimEnd()}...`;
}

function parseSrtSegments(srtText: string): CaptionSegment[] {
  const normalizedText = srtText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (normalizedText === "") {
    return [];
  }

  const segments: CaptionSegment[] = [];
  const blocks = normalizedText.split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const timingLineIndex = lines.findIndex((line) => line.includes("-->"));

    if (timingLineIndex < 0) {
      continue;
    }

    const timingMatch = lines[timingLineIndex].match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
    );

    if (!timingMatch) {
      continue;
    }

    const text = lines.slice(timingLineIndex + 1).join(" ").trim();
    segments.push({
      index: segments.length + 1,
      start: normalizeCaptionTime(timingMatch[1]),
      end: normalizeCaptionTime(timingMatch[2]),
      text: text || "(no text)"
    });
  }

  return segments;
}

function renderCaptionSegments(): void {
  const captionLabel = captionSegments.length === 1 ? "caption" : "captions";
  captionSegmentsCountNode.textContent = `${captionSegments.length} ${captionLabel}`;
  captionSegmentListNode.replaceChildren();
  const rangeStartIndex =
    captionRangeAnchorIndex !== null && captionRangeFocusIndex !== null
      ? Math.min(captionRangeAnchorIndex, captionRangeFocusIndex)
      : null;
  const rangeEndIndex =
    captionRangeAnchorIndex !== null && captionRangeFocusIndex !== null
      ? Math.max(captionRangeAnchorIndex, captionRangeFocusIndex)
      : null;

  if (captionSegments.length === 0) {
    const emptyNode = document.createElement("p");
    emptyNode.className = "caption-segments-empty";
    emptyNode.textContent = "Generate captions to see segments.";
    captionSegmentListNode.appendChild(emptyNode);
    renderCaptionSelectionSummary();
    return;
  }

  for (const segment of captionSegments) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "caption-segment-row";
    row.classList.toggle("is-range-start", rangeStartIndex !== null && segment.index === rangeStartIndex);
    row.classList.toggle("is-range-end", rangeEndIndex !== null && segment.index === rangeEndIndex);
    row.classList.toggle(
      "is-in-range",
      rangeStartIndex !== null && rangeEndIndex !== null && segment.index >= rangeStartIndex && segment.index <= rangeEndIndex
    );
    row.classList.toggle("is-playback-active", activePlaybackSegmentIndex === segment.index);
    row.addEventListener("click", () => {
      seekMediaToTimestamp(segment.start);
      selectCaptionSegment(segment);
    });

    const timeNode = document.createElement("span");
    timeNode.className = "caption-segment-time";

    const startNode = document.createElement("span");
    startNode.textContent = segment.start;

    const endNode = document.createElement("span");
    endNode.textContent = segment.end;

    const textNode = document.createElement("span");
    textNode.className = "caption-segment-text";
    textNode.textContent = getCaptionPreview(segment.text);
    textNode.title = segment.text;

    timeNode.append(startNode, endNode);
    row.append(timeNode, textNode);
    captionSegmentListNode.appendChild(row);
  }

  renderCaptionSelectionSummary();
}

function setCaptionSegments(segments: CaptionSegment[]): void {
  const shouldScroll = shouldAutoScrollCaptionSegments();
  if (segments.length === 0) {
    captionSegmentUserScrolledUp = false;
    captionRangeAnchorIndex = null;
    captionRangeFocusIndex = null;
    captionRangeComplete = false;
    activePlaybackSegmentIndex = null;
  }

  captionSegments = segments;
  renderCaptionSegments();

  if (shouldScroll) {
    scrollCaptionSegmentsToBottom();
  }
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
  setCaptionSegments([]);

  refreshPaths();
  syncButtons();
  appendLog(`Selected video: ${selectedVideoPath}`);
}

function applySelectedAudio(nextAudioPath: string): void {
  audioPath = nextAudioPath;
  srtPath = null;
  vttPath = null;
  audioSourceKind = "uploaded";
  setCaptionSegments([]);

  refreshPaths();
  syncButtons();
  appendLog(`Selected audio: ${audioPath}`);
}

try {
  window.videoTools.onToolLog((entry) => {
    updateActionProgressFromToolLog(entry);
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
  syncRawLogVisibility();
  scheduleLogPanelRender();
});

logFilterSelect.addEventListener("change", () => {
  scheduleLogPanelRender();
});

captionSegmentListNode.addEventListener("scroll", () => {
  if (!activeAction || activeAction.kind !== "caption") {
    return;
  }

  const distanceFromBottom =
    captionSegmentListNode.scrollHeight - captionSegmentListNode.scrollTop - captionSegmentListNode.clientHeight;
  captionSegmentUserScrolledUp = distanceFromBottom > 16;
});

captionClearSelectionButton.addEventListener("click", () => {
  clearCaptionRangeSelection();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (captionRangeAnchorIndex === null) {
    return;
  }

  clearCaptionRangeSelection();
});

previewVideoNode.addEventListener("timeupdate", updateActivePlaybackSegmentFromMedia);
previewAudioNode.addEventListener("timeupdate", updateActivePlaybackSegmentFromMedia);
previewVideoNode.addEventListener("seeked", updateActivePlaybackSegmentFromMedia);
previewAudioNode.addEventListener("seeked", updateActivePlaybackSegmentFromMedia);
previewVideoNode.addEventListener("ended", clearActivePlaybackSegment);
previewAudioNode.addEventListener("ended", clearActivePlaybackSegment);

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
  startActionStatus("clip", "Creating clip...", getClipDurationSeconds(startTime, endTime));

  try {
    const result = await window.videoTools.clipVideo({
      videoPath: selectedVideoPath,
      startTime,
      endTime,
      outputPath,
      mode
    });
    appendLog(`Clip created: ${result.outputPath}`);
    completeActionStatus();
  } catch (error) {
    const message = (error as Error).message;
    appendLog(`Create clip failed: ${message}`);
    failActionStatus(message);
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
  startActionStatus("extract", "Extracting audio...");

  try {
    const result = await window.videoTools.extractAudio(selectedVideoPath);
    audioPath = result.audioPath;
    srtPath = null;
    vttPath = null;
    audioSourceKind = "extracted";
    setCaptionSegments([]);

    refreshPaths();
    syncButtons();
    appendLog(`Audio extracted: ${audioPath}`);
    completeActionStatus();
  } catch (error) {
    const message = (error as Error).message;
    appendLog(`Audio extraction failed: ${message}`);
    appendSetupHintForMissingDependency(message);
    failActionStatus(message);
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
  setCaptionSegments([]);
  startActionStatus("caption", isM4aAudioPath(audioPath) ? "Converting audio..." : "Generating captions...");

  try {
    const result = await window.videoTools.runWhisper({
      audioPath,
      sourcePath: getCaptionContextPath()
    });
    srtPath = result.srtPath;
    vttPath = result.vttPath;
    setCaptionSegments(parseSrtSegments(result.srtText));

    refreshPaths();
    syncButtons();
    appendLog(`Captions generated: ${srtPath}, ${vttPath}`);
    completeActionStatus();
  } catch (error) {
    const message = (error as Error).message;
    appendLog(`Caption generation failed: ${message}`);
    appendSetupHintForMissingDependency(message);
    failActionStatus(message);
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

setIdleActionStatus();
syncRawLogVisibility();
refreshPaths();
renderCaptionSegments();
syncButtons();
appendLog("Ready.");
void initSettingsPanel();







