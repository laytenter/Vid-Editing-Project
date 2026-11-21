type AppSettings = {
  themeMode: ThemeMode;
  documentsDir: string;
};

type AudioSourceKind = "uploaded" | "extracted" | null;
type ClipMode = "copy" | "encode";
type ThemeMode = "system" | "dark" | "light" | "retro";
type WorkflowSection = "source" | "process" | "clip" | "editor" | "captions";
type WorkflowNavTarget = WorkflowSection | "details" | "log";
type EditorProject = import("./types").AudioEditProject;
type EditorAnalysis = import("./types").AudioAnalysis;
type EditorCaptionSet = { id: string; label: string; sourceKind: "original" | "edited"; project: EditorProject; mediaPath: string; segments: CaptionSegment[] };
type EditorHistoryEntry = { project: EditorProject; start: number; end: number; playhead: number; clipId: string | null };

function mustGet<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id} in index.html`);
  return el as T;
}

const selectVideoButton = mustGet<HTMLButtonElement>("selectVideoButton");
const selectAudioButton = mustGet<HTMLButtonElement>("selectAudioButton");
const extractAudioButton = mustGet<HTMLButtonElement>("extractAudioButton");
const generateCaptionsButton = mustGet<HTMLButtonElement>("generateCaptionsButton");
const saveAudioButton = mustGet<HTMLButtonElement>("saveAudioButton");
const saveSrtButton = mustGet<HTMLButtonElement>("saveSrtButton");
const saveVttButton = mustGet<HTMLButtonElement>("saveVttButton");
const captionSourceStatusNode = mustGet<HTMLElement>("captionSourceStatus");
const captionSegmentsCountNode = mustGet<HTMLElement>("captionSegmentsCount");
const captionSegmentListNode = mustGet<HTMLElement>("captionSegmentList");
const captionSelectionSummaryNode = mustGet<HTMLElement>("captionSelectionSummary");
const captionClearSelectionButton = mustGet<HTMLButtonElement>("captionClearSelectionButton");
const captionSearchInput = mustGet<HTMLInputElement>("captionSearchInput");
const captionSearchCountNode = mustGet<HTMLElement>("captionSearchCount");
const previewStatusNode = mustGet<HTMLElement>("previewStatus");
const previewVideoNode = mustGet<HTMLVideoElement>("previewVideo");
const previewAudioNode = mustGet<HTMLAudioElement>("previewAudio");
const previewEmptyNode = mustGet<HTMLElement>("previewEmpty");
const actionStatusPanelNode = mustGet<HTMLElement>("actionStatusPanel");
const actionStatusNode = mustGet<HTMLElement>("actionStatus");
const actionProgressTrackNode = mustGet<HTMLElement>("actionProgressTrack");
const actionProgressBarNode = mustGet<HTMLElement>("actionProgressBar");
const actionProgressTextNode = mustGet<HTMLElement>("actionProgressText");
const cancelActionButton = mustGet<HTMLButtonElement>("cancelActionButton");
const sessionNoticeNode = mustGet<HTMLElement>("sessionNotice");
const sessionNoticeTitleNode = mustGet<HTMLElement>("sessionNoticeTitle");
const sessionNoticeDetailNode = mustGet<HTMLElement>("sessionNoticeDetail");

const selectedVideoPathNode = mustGet<HTMLElement>("selectedVideoPath");
const audioPathNode = mustGet<HTMLElement>("audioPath");
const srtPathNode = mustGet<HTMLElement>("srtPath");
const vttPathNode = mustGet<HTMLElement>("vttPath");
const logPanel = mustGet<HTMLPreElement>("logPanel");

const dropZone = mustGet<HTMLDivElement>("dropZone");
const detailsToggleButton = mustGet<HTMLButtonElement>("detailsToggleButton");
const closeDetailsButton = mustGet<HTMLButtonElement>("closeDetailsButton");
const detailsDrawer = mustGet<HTMLElement>("detailsDrawer");
const detailsDrawerBackdrop = mustGet<HTMLElement>("detailsDrawerBackdrop");
const showLogButton = mustGet<HTMLButtonElement>("showLogButton");
const closeLogButton = mustGet<HTMLButtonElement>("closeLogButton");
const logDrawer = mustGet<HTMLElement>("logDrawer");
const logDrawerBackdrop = mustGet<HTMLElement>("logDrawerBackdrop");
const logDrawerResizeHandle = mustGet<HTMLElement>("logDrawerResizeHandle");
const showRawLogsCheckbox = mustGet<HTMLInputElement>("showRawLogsCheckbox");
const logFilterSelect = mustGet<HTMLSelectElement>("logFilterSelect");
const copyLogButton = mustGet<HTMLButtonElement>("copyLogButton");
const clipStartInput = mustGet<HTMLInputElement>("clipStart");
const clipEndInput = mustGet<HTMLInputElement>("clipEnd");
const clipModeSelect = mustGet<HTMLSelectElement>("clipMode");
const clipCreateButton = mustGet<HTMLButtonElement>("clipCreateBtn");
const clipAddRangeButton = mustGet<HTMLButtonElement>("clipAddRangeBtn");
const queuedClipsCountNode = mustGet<HTMLElement>("queuedClipsCount");
const queuedClipsListNode = mustGet<HTMLElement>("queuedClipsList");
const queuedClipsExportButton = mustGet<HTMLButtonElement>("queuedClipsExportBtn");
const audioEditorStatus = mustGet<HTMLElement>("audioEditorStatus");
const audioWaveformCanvas = mustGet<HTMLCanvasElement>("audioWaveformCanvas");
const audioEditorSelection = mustGet<HTMLElement>("audioEditorSelection");
const audioEditorDuration = mustGet<HTMLElement>("audioEditorDuration");
const audioEditStart = mustGet<HTMLInputElement>("audioEditStart");
const audioEditEnd = mustGet<HTMLInputElement>("audioEditEnd");
const audioEditGain = mustGet<HTMLInputElement>("audioEditGain");
const audioEditFadeIn = mustGet<HTMLInputElement>("audioEditFadeIn");
const audioEditFadeOut = mustGet<HTMLInputElement>("audioEditFadeOut");
const audioEditSpeed = mustGet<HTMLInputElement>("audioEditSpeed");
const audioEditPitch = mustGet<HTMLInputElement>("audioEditPitch");
const audioEditNormalize = mustGet<HTMLInputElement>("audioEditNormalize");
const audioEditNoise = mustGet<HTMLInputElement>("audioEditNoise");
const audioEditFormat = mustGet<HTMLSelectElement>("audioEditFormat");
const audioEditUndoButton = mustGet<HTMLButtonElement>("audioEditUndoButton");
const audioEditResetButton = mustGet<HTMLButtonElement>("audioEditResetButton");
const audioEditExportButton = mustGet<HTMLButtonElement>("audioEditExportButton");
const audioEditorPanel = mustGet<HTMLElement>("audioEditorPanel");
const audioEditorSource = mustGet<HTMLElement>("audioEditorSource");
const audioEditorError = mustGet<HTMLElement>("audioEditorError");
const audioEditorRetry = mustGet<HTMLButtonElement>("audioEditorRetry");
const audioPlayOriginal = mustGet<HTMLButtonElement>("audioPlayOriginal");
const audioPreviewEdited = mustGet<HTMLButtonElement>("audioPreviewEdited");
const audioWaveformScroll = mustGet<HTMLElement>("audioWaveformScroll");
const audioZoom = mustGet<HTMLSelectElement>("audioZoom");
const audioPlayheadInput = mustGet<HTMLInputElement>("audioPlayhead");
const audioSplit = mustGet<HTMLButtonElement>("audioSplit");
const audioKeep = mustGet<HTMLButtonElement>("audioKeep");
const audioRemove = mustGet<HTMLButtonElement>("audioRemove");
const audioDuplicate = mustGet<HTMLButtonElement>("audioDuplicate");
const audioUseCaptionRange = mustGet<HTMLButtonElement>("audioUseCaptionRange");
const audioClipList = mustGet<HTMLElement>("audioClipList");
const audioClipSettings = mustGet<HTMLFieldSetElement>("audioClipSettings");
const audioClipGain = mustGet<HTMLInputElement>("audioClipGain");
const audioClipFadeIn = mustGet<HTMLInputElement>("audioClipFadeIn");
const audioClipFadeOut = mustGet<HTMLInputElement>("audioClipFadeOut");
const audioExportScope = mustGet<HTMLSelectElement>("audioExportScope");
const audioEditRedoButton = mustGet<HTMLButtonElement>("audioEditRedoButton");
const captionSourceOriginal = mustGet<HTMLInputElement>("captionSourceOriginal");
const captionSourceEdited = mustGet<HTMLInputElement>("captionSourceEdited");
const captionSourceHelp = mustGet<HTMLElement>("captionSourceHelp");
const captionSetSelect = mustGet<HTMLSelectElement>("captionSetSelect");
const captionTimingNotice = mustGet<HTMLElement>("captionTimingNotice");
const captionRemapButton = mustGet<HTMLButtonElement>("captionRemapButton");
const captionRemapDialog = mustGet<HTMLDialogElement>("captionRemapDialog");
const captionRemapSummary = mustGet<HTMLElement>("captionRemapSummary");
const captionRemapChanges = mustGet<HTMLElement>("captionRemapChanges");
const captionRemapReview = mustGet<HTMLElement>("captionRemapReview");
const captionRemapCreate = mustGet<HTMLButtonElement>("captionRemapCreate");
const captionRemapCancel = mustGet<HTMLButtonElement>("captionRemapCancel");
const workflowNavButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-workflow-target]"));

let selectedVideoPath: string | null = null;
let audioPath: string | null = null;
let srtPath: string | null = null;
let vttPath: string | null = null;
let audioSourceKind: AudioSourceKind = null;
let isBusy = false;
let isCancelling = false;
let currentThemeMode: ThemeMode = "system";
let currentWorkflowSection: WorkflowSection = "captions";
let logDrawerWidth = 460;

const allowedVideoExtensions = new Set(["mp4", "mov", "mkv", "avi", "webm", "m4v"]);
const allowedAudioExtensions = new Set(["wav", "mp3", "m4a", "aac", "flac", "ogg", "opus", "wma", "aiff", "aif"]);

showRawLogsCheckbox.checked = false;
logFilterSelect.value = "all";

type ToolName = "ffmpeg" | "whisper";
type StreamName = "stdout" | "stderr";
type LogFilter = "all" | "ffmpeg" | "whisper" | "errors";
type ActiveActionKind = "extract" | "caption" | "clip" | "editor";
type ActionStatusMode = "idle" | "indeterminate" | "determinate" | "done" | "failed" | "cancelled";

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
  edited?: boolean;
}

interface ActiveAction {
  kind: ActiveActionKind;
  label: string;
  totalDurationSeconds: number | null;
}

interface QueuedClip {
  id: number;
  videoPath: string;
  startTime: string;
  endTime: string;
  mode: ClipMode;
  preview: string;
}

interface CaptionProjectSession {
  version: 1 | 2;
  selectedVideoPath: string | null;
  audioPath: string | null;
  audioSourceKind: AudioSourceKind;
  srtPath: string | null;
  vttPath: string | null;
  captionSegments: CaptionSegment[];
  queuedClips: QueuedClip[];
  clipStart: string;
  clipEnd: string;
  clipMode: ClipMode;
  audioProject?: EditorProject;
  captionSource?: "original" | "edited";
  captionSets?: EditorCaptionSet[];
  activeCaptionSetId?: string | null;
  audioSelection?: { start: number; end: number };
  audioPlayhead?: number;
}

const logEntries: StoredLogEntry[] = [];
const maxLogEntries = 5000;
const MEDIA_PROCESS_CANCELLED_MESSAGE = "Media process cancelled";
const timestampToSeconds = window.timestampUtils.parseTimestampSeconds;
const normalizeSubtitleTimestamp = window.timestampUtils.normalizeCaptionTime;
const parseSrtDocument = window.subtitleUtils.parseSrtSegments;
const createSrtText = window.subtitleUtils.regenerateSrtFromSegments;
const createVttText = window.subtitleUtils.regenerateVttFromSegments;
let logRenderScheduled = false;
let captionSegments: CaptionSegment[] = [];
let queuedClips: QueuedClip[] = [];
let nextQueuedClipId = 1;
let activeQueuedClipId: number | null = null;
let activeAction: ActiveAction | null = null;
let whisperStdoutBuffer = "";
let captionSegmentUserScrolledUp = false;
let captionRangeAnchorIndex: number | null = null;
let captionRangeFocusIndex: number | null = null;
let captionRangeComplete = false;
let activePlaybackSegmentIndex: number | null = null;
let editingCaptionIndex: number | null = null;
let currentPreviewKind: "video" | "audio" | null = null;
let currentPreviewUrl: string | null = null;
let captionProjectPersistenceReady = false;
let captionProjectSaveTimer: number | null = null;
let audioProject: EditorProject | null = null;
let audioAnalysis: EditorAnalysis | null = null;
let audioLoadState: "empty" | "loading" | "ready" | "error" = "empty";
let audioLoadingPath: string | null = null;
let audioLoadToken = 0;
let audioEditorRegionStartSeconds = 0;
let audioEditorRegionEndSeconds = 0;
let audioEditorPlayhead = 0;
let audioSelectedClipId: string | null = null;
let audioUndoHistory: EditorHistoryEntry[] = [];
let audioRedoHistory: EditorHistoryEntry[] = [];
let audioPointerAnchor: number | null = null;
let audioTimelineFrame: number | null = null;
let audioObservedWidth = -1;
let captionSets: EditorCaptionSet[] = [];
let activeCaptionSetId: string | null = null;
let captionSource: "original" | "edited" = "original";
let audioPreviewOverride: { kind: "audio"; mediaPath: string; label: string; project: EditorProject } | null = null;
let editorCancelRequested = false;
let editorPipelineActive = false;
let captionGenerationPending = false;
let pendingRemap: { project: EditorProject; segments: CaptionSegment[]; warnings: string[] } | null = null;
let pendingRestoredProject: EditorProject | null = null;
let pendingRestoredSelection: { start: number; end: number } | null = null;
let pendingRestoredPlayhead = 0;
let projectSaveFailed = false;

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
  if (!next && getEditorSourcePath() && audioLoadingPath !== getEditorSourcePath()) {
    void Promise.resolve().then(() => ensureAudioEditorSource());
  }
}

function syncButtons(): void {
  extractAudioButton.disabled = isBusy || !selectedVideoPath;
  generateCaptionsButton.disabled = isBusy || audioLoadState !== "ready" || !audioProject;
  saveAudioButton.disabled = isBusy || !audioPath || audioSourceKind !== "extracted";
  saveSrtButton.disabled = isBusy || (getActiveCaptionSet() ? captionSegments.length === 0 : !srtPath && captionSegments.length === 0);
  saveVttButton.disabled = isBusy || (getActiveCaptionSet() ? captionSegments.length === 0 : !vttPath && captionSegments.length === 0);
  selectVideoButton.disabled = isBusy;
  selectAudioButton.disabled = isBusy;

  clipCreateButton.disabled = isBusy || !selectedVideoPath;
  clipAddRangeButton.disabled = isBusy || !selectedVideoPath;
  queuedClipsExportButton.disabled = isBusy || queuedClips.length === 0;
  cancelActionButton.hidden = !isBusy || activeAction === null;
  cancelActionButton.disabled = !isBusy || activeAction === null || isCancelling;
  cancelActionButton.textContent = isCancelling ? "Cancelling..." : "Cancel";
  syncAudioEditorButtons();
}

const systemThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");

function applyThemeMode(themeMode: ThemeMode): void {
  currentThemeMode = themeMode;
  const resolvedTheme = themeMode === "system" ? (systemThemeMedia.matches ? "dark" : "light") : themeMode;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themeMode = themeMode;
  drawAudioEditorTimeline();
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
  if (audioPreviewOverride) return audioPreviewOverride;
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

  previewStatusNode.textContent = audioPreviewOverride?.label ?? (source.kind === "video" ? "Original video" : "Original audio");
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

function refreshPaths(): void {
  selectedVideoPathNode.textContent = selectedVideoPath ?? "(none)";
  audioPathNode.textContent = audioPath ?? "(none)";
  srtPathNode.textContent = srtPath ?? "(none)";
  vttPathNode.textContent = vttPath ?? "(none)";
  selectedVideoPathNode.title = selectedVideoPath ?? "";
  audioPathNode.title = audioPath ?? "";
  srtPathNode.title = srtPath ?? "";
  vttPathNode.title = vttPath ?? "";
  const sourceStatus = getCaptionSourceStatus();
  captionSourceStatusNode.textContent = sourceStatus.label;
  captionSourceStatusNode.dataset.state = sourceStatus.state;
  updateMediaPreview();
  void ensureAudioEditorSource();
}

function showSessionNotice(title: string, detail: string, state: "restored" | "warning" | "reset"): void {
  sessionNoticeTitleNode.textContent = title;
  sessionNoticeDetailNode.textContent = detail;
  sessionNoticeDetailNode.title = detail;
  sessionNoticeNode.dataset.state = state;
  sessionNoticeNode.hidden = false;
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

function getClipDurationSeconds(startTime: string, endTime: string): number | null {
  const startSeconds = timestampToSeconds(startTime);
  const endSeconds = timestampToSeconds(endTime);

  if (startSeconds === null || endSeconds === null || endSeconds <= startSeconds) {
    return null;
  }

  return endSeconds - startSeconds;
}

function parseFfmpegDurationSeconds(message: string): number | null {
  const match = message.match(/Duration:\s*(\d+:\d{2}:\d{2}(?:[,.]\d+)?)/i);
  return match ? timestampToSeconds(match[1]) : null;
}

function parseFfmpegProgressSeconds(message: string): number | null {
  const match = message.match(/\btime=\s*(\d+:\d{2}:\d{2}(?:[,.]\d+)?)/i);
  return match ? timestampToSeconds(match[1]) : null;
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
    start: normalizeSubtitleTimestamp(match[1]),
    end: normalizeSubtitleTimestamp(match[2]),
    text: text || "(no text)"
  };
}

function setActionStatus(label: string, text: string, mode: ActionStatusMode, percent = 0): void {
  const clampedPercent = clampNumber(percent, 0, 100);
  const showProgressTrack = mode === "indeterminate" || mode === "determinate";
  actionStatusPanelNode.dataset.state = mode;
  actionStatusNode.textContent = label;
  actionStatusNode.title = label;
  actionProgressTextNode.textContent = text;
  actionProgressTextNode.title = text;
  actionProgressTrackNode.hidden = !showProgressTrack;
  actionProgressBarNode.classList.toggle("is-indeterminate", mode === "indeterminate");
  actionProgressBarNode.classList.toggle("is-complete", mode === "done");
  actionProgressBarNode.classList.toggle("is-failed", mode === "failed");
  actionProgressBarNode.classList.toggle("is-cancelled", mode === "cancelled");
  actionProgressBarNode.style.width = mode === "indeterminate" ? "34%" : `${clampedPercent}%`;

  if (mode === "determinate" || mode === "done" || mode === "failed" || mode === "cancelled") {
    actionProgressTrackNode.setAttribute("aria-valuenow", String(Math.round(clampedPercent)));
  } else {
    actionProgressTrackNode.removeAttribute("aria-valuenow");
  }

  actionProgressTrackNode.setAttribute("aria-busy", mode === "indeterminate" ? "true" : "false");
}

function setIdleActionStatus(): void {
  activeAction = null;
  isCancelling = false;
  setActionStatus("Idle", "Ready", "idle", 0);
  syncButtons();
}

function startActionStatus(kind: ActiveActionKind, label: string, totalDurationSeconds: number | null = null): void {
  if (kind === "caption") {
    whisperStdoutBuffer = "";
    captionSegmentUserScrolledUp = false;
  }

  activeAction = {
    kind,
    label,
    totalDurationSeconds
  };
  isCancelling = false;
  syncButtons();

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
  setActionStatus(activeAction.label, `${Math.round(percent)}%`, "determinate", percent);
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

  const endSeconds = timestampToSeconds(endTime);
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
      const startSeconds = timestampToSeconds(candidate.start);
      const endSeconds = timestampToSeconds(candidate.end);
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
  const set = getActiveCaptionSet();
  if (set && audioPreviewOverride?.mediaPath !== set.mediaPath) {
    void playCaptionSet(set, timestampToSeconds(timestamp) ?? 0);
    return;
  }
  const seconds = timestampToSeconds(timestamp);
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

  const set = getActiveCaptionSet();
  if (!set || audioPreviewOverride?.mediaPath === set.mediaPath) {
    setActivePlaybackSegmentForSeconds(mediaElement.currentTime);
  } else {
    clearActivePlaybackSegment();
  }
  if (audioPreviewOverride && audioProject && window.audioEditUtils.timelineMatches(audioPreviewOverride.project, audioProject)) {
    setAudioPlayhead(mediaElement.currentTime, false);
  }
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
  captionSelectionSummaryNode.replaceChildren();

  const titleNode = document.createElement("div");
  titleNode.className = "caption-selection-title";
  const detailNode = document.createElement("div");
  detailNode.className = "caption-selection-detail";

  if (!anchorSegment) {
    captionSelectionSummaryNode.dataset.state = "neutral";
    titleNode.textContent = "No range selected";
    detailNode.textContent = "Click a caption to choose the start.";
  } else if (!captionRangeComplete || !focusSegment) {
    captionSelectionSummaryNode.dataset.state = "pending";
    titleNode.textContent = "Start selected - click another caption to choose the end.";
    detailNode.textContent = `${anchorSegment.start} - ${getShortCaptionPreview(anchorSegment.text)}`;
  } else {
    const startSegment = anchorSegment.index <= focusSegment.index ? anchorSegment : focusSegment;
    const endSegment = anchorSegment.index <= focusSegment.index ? focusSegment : anchorSegment;
    captionSelectionSummaryNode.dataset.state = "complete";
    titleNode.textContent = `Selected range: ${startSegment.start} ? ${endSegment.end}`;
    detailNode.textContent = `${getShortCaptionPreview(startSegment.text)} / ${getShortCaptionPreview(endSegment.text)}`;
  }

  detailNode.title = detailNode.textContent;
  captionSelectionSummaryNode.append(titleNode, detailNode);
  syncAudioEditorButtons();
}

function selectCaptionSegment(segment: CaptionSegment): void {
  const set = getActiveCaptionSet();
  if (set) {
    const original = window.audioEditUtils.createProject({ ...set.project, peaks: [], previewPath: set.project.sourcePath });
    if (set.project.sourcePath !== selectedVideoPath || !window.audioEditUtils.timelineMatches(set.project, original)) {
      if (captionRangeAnchorIndex === null || captionRangeComplete) {
        captionRangeAnchorIndex = segment.index;
        captionRangeFocusIndex = segment.index;
        captionRangeComplete = false;
      } else {
        captionRangeFocusIndex = segment.index;
        captionRangeComplete = captionRangeAnchorIndex !== segment.index;
      }
      renderCaptionSegments();
      syncAudioEditorButtons();
      return;
    }
  }
  if (captionRangeAnchorIndex === null || captionRangeComplete) {
    captionRangeAnchorIndex = segment.index;
    captionRangeFocusIndex = segment.index;
    captionRangeComplete = false;
    clipStartInput.value = segment.start;
    clipEndInput.value = segment.end;
    renderCaptionSegments();
    appendLog("Clip range start set from caption segment.");
    scheduleCaptionProjectSave();
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
    scheduleCaptionProjectSave();
    return;
  }

  if (segment.index === anchorSegment.index) {
    clipStartInput.value = segment.start;
    clipEndInput.value = segment.end;
    renderCaptionSegments();
    appendLog("Clip range start set from caption segment.");
    scheduleCaptionProjectSave();
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
  scheduleCaptionProjectSave();
}

function startCaptionEdit(segment: CaptionSegment): void {
  editingCaptionIndex = segment.index;
  renderCaptionSegments();
}

function cancelCaptionEdit(): void {
  if (editingCaptionIndex === null) {
    return;
  }

  editingCaptionIndex = null;
  persistActiveCaptionSet();
  renderCaptionSegments();
}

function saveCaptionEdit(index: number, text: string): void {
  const segment = findCaptionSegment(index);
  if (!segment) {
    editingCaptionIndex = null;
    renderCaptionSegments();
    return;
  }

  const normalizedText = text.trim() || "(no text)";
  if (segment.text !== normalizedText) {
    segment.text = normalizedText;
    segment.edited = true;
    appendLog("Caption text updated.");
  }

  editingCaptionIndex = null;
  renderCaptionSegments();
  scheduleCaptionProjectSave();
}

function handleLiveWhisperCaptionLine(line: string): void {
  const segment = parseWhisperCaptionLine(line);
  if (!segment) {
    return;
  }
  if (captionGenerationPending) {
    updateCaptionProgressFromTimestamp(segment.end);
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
  scheduleCaptionProjectSave();

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
  isCancelling = false;
  setActionStatus("Complete", "Task finished", "done", 100);
  syncButtons();
}

function failActionStatus(message: string): void {
  activeAction = null;
  isCancelling = false;
  setActionStatus("Failed", message, "failed", 100);
  syncButtons();
}

function cancelActionStatus(detail = "Current task stopped", label = "Cancelled"): void {
  activeAction = null;
  isCancelling = false;
  setActionStatus(label, detail, "cancelled", 100);
  syncButtons();
}

function isMediaProcessCancellation(message: string): boolean {
  return message.includes(MEDIA_PROCESS_CANCELLED_MESSAGE);
}

function getMaxLogDrawerWidth(): number {
  return Math.max(320, Math.min(900, window.innerWidth - 32));
}

function setLogDrawerWidth(width: number): void {
  const maxWidth = getMaxLogDrawerWidth();
  const nextWidth = clampNumber(Number.isFinite(width) ? width : 460, 320, maxWidth);
  logDrawerWidth = nextWidth;
  document.documentElement.style.setProperty("--log-drawer-width", `${Math.round(nextWidth)}px`);
}

function getWorkflowNavTarget(button: HTMLButtonElement): WorkflowNavTarget | null {
  const target = button.dataset.workflowTarget;
  if (
    target === "source" ||
    target === "process" ||
    target === "clip" ||
    target === "editor" ||
    target === "captions" ||
    target === "details" ||
    target === "log"
  ) {
    return target;
  }

  return null;
}

function updateWorkflowNavigationState(): void {
  document.documentElement.dataset.workflowSection = currentWorkflowSection;
  const activeTarget: WorkflowNavTarget = isLogDrawerOpen()
    ? "log"
    : isDetailsDrawerOpen()
      ? "details"
      : currentWorkflowSection;

  for (const button of workflowNavButtons) {
    const target = getWorkflowNavTarget(button);
    const isActive = target === activeTarget;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  }
}

function setWorkflowSection(section: WorkflowSection): void {
  currentWorkflowSection = section;
  document.documentElement.dataset.workflowSection = section;

  if (isDetailsDrawerOpen()) {
    setDetailsDrawerOpen(false);
  }

  if (isLogDrawerOpen()) {
    closeLogDrawer();
  }

  updateWorkflowNavigationState();
  if (section === "editor") window.requestAnimationFrame(drawAudioEditorTimeline);
}

function activateWorkflowNavTarget(target: WorkflowNavTarget): void {
  if (target === "details") {
    if (isLogDrawerOpen()) {
      closeLogDrawer();
    }
    setDetailsDrawerOpen(true);
    updateWorkflowNavigationState();
    return;
  }

  if (target === "log") {
    if (isDetailsDrawerOpen()) {
      setDetailsDrawerOpen(false);
    }
    openLogDrawer();
    updateWorkflowNavigationState();
    return;
  }

  setWorkflowSection(target);
}

function openLogDrawer(): void {
  logDrawer.classList.add("is-open");
  logDrawer.setAttribute("aria-hidden", "false");
  logDrawerBackdrop.hidden = false;
  showLogButton.textContent = "Hide Log";
  scheduleLogPanelRender();
  updateWorkflowNavigationState();
}

function closeLogDrawer(): void {
  logDrawer.classList.remove("is-open");
  logDrawer.setAttribute("aria-hidden", "true");
  logDrawerBackdrop.hidden = true;
  showLogButton.textContent = "Show Log";
  updateWorkflowNavigationState();
}

function isLogDrawerOpen(): boolean {
  return logDrawer.classList.contains("is-open");
}

function toggleLogDrawer(): void {
  if (isLogDrawerOpen()) {
    closeLogDrawer();
    return;
  }

  openLogDrawer();
}

function setDetailsDrawerOpen(isOpen: boolean): void {
  detailsDrawer.classList.toggle("is-open", isOpen);
  detailsDrawer.setAttribute("aria-hidden", isOpen ? "false" : "true");
  detailsToggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
  detailsToggleButton.textContent = isOpen ? "Hide Details" : "Clips & Files";
  detailsDrawerBackdrop.hidden = !isOpen;
  updateWorkflowNavigationState();
}

function isDetailsDrawerOpen(): boolean {
  return detailsDrawer.classList.contains("is-open");
}

function toggleDetailsDrawer(): void {
  setDetailsDrawerOpen(!isDetailsDrawerOpen());
}

function getCaptionPreview(text: string): string {
  return text.length <= 120 ? text : `${text.slice(0, 117).trimEnd()}...`;
}

function appendHighlightedText(parent: HTMLElement, text: string, query: string): void {
  if (query === "") {
    parent.textContent = text;
    return;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let cursor = 0;
  let matchIndex = lowerText.indexOf(lowerQuery, cursor);

  while (matchIndex >= 0) {
    if (matchIndex > cursor) {
      parent.appendChild(document.createTextNode(text.slice(cursor, matchIndex)));
    }

    const markNode = document.createElement("mark");
    markNode.textContent = text.slice(matchIndex, matchIndex + query.length);
    parent.appendChild(markNode);
    cursor = matchIndex + query.length;
    matchIndex = lowerText.indexOf(lowerQuery, cursor);
  }

  if (cursor < text.length) {
    parent.appendChild(document.createTextNode(text.slice(cursor)));
  }
}

function getShortCaptionPreview(text: string): string {
  return text.length <= 72 ? text : `${text.slice(0, 69).trimEnd()}...`;
}

function getQueuedClipPreview(startTime: string, endTime: string): string {
  const startSeconds = timestampToSeconds(startTime);
  const endSeconds = timestampToSeconds(endTime);

  if (startSeconds === null || endSeconds === null) {
    return "";
  }

  const selectedSegments = captionSegments.filter((segment) => {
    const segmentStart = timestampToSeconds(segment.start);
    const segmentEnd = timestampToSeconds(segment.end);
    return segmentStart !== null && segmentEnd !== null && segmentEnd > startSeconds && segmentStart < endSeconds;
  });

  if (selectedSegments.length === 0) {
    return "";
  }

  if (selectedSegments.length === 1) {
    return getShortCaptionPreview(selectedSegments[0].text);
  }

  return `${getShortCaptionPreview(selectedSegments[0].text)} / ${getShortCaptionPreview(selectedSegments[selectedSegments.length - 1].text)}`;
}

function appendCaptionEmptyState(title: string, detail: string): void {
  const emptyNode = document.createElement("div");
  emptyNode.className = "caption-segments-empty";

  const titleNode = document.createElement("strong");
  titleNode.textContent = title;

  const detailNode = document.createElement("span");
  detailNode.textContent = detail;

  emptyNode.append(titleNode, detailNode);
  captionSegmentListNode.appendChild(emptyNode);
}

function renderCaptionSegments(): void {
  const captionLabel = captionSegments.length === 1 ? "caption" : "captions";
  captionSegmentsCountNode.textContent = `${captionSegments.length} ${captionLabel}`;
  captionSegmentListNode.replaceChildren();
  const searchQuery = captionSearchInput.value.trim();
  const lowerSearchQuery = searchQuery.toLowerCase();
  const visibleSegments =
    lowerSearchQuery === ""
      ? captionSegments
      : captionSegments.filter((segment) => segment.text.toLowerCase().includes(lowerSearchQuery));
  captionSearchCountNode.textContent =
    lowerSearchQuery === "" ? "" : `${visibleSegments.length} ${visibleSegments.length === 1 ? "match" : "matches"}`;
  const rangeStartIndex =
    captionRangeComplete && captionRangeAnchorIndex !== null && captionRangeFocusIndex !== null
      ? Math.min(captionRangeAnchorIndex, captionRangeFocusIndex)
      : null;
  const rangeEndIndex =
    captionRangeComplete && captionRangeAnchorIndex !== null && captionRangeFocusIndex !== null
      ? Math.max(captionRangeAnchorIndex, captionRangeFocusIndex)
      : null;
  const pendingStartIndex = !captionRangeComplete ? captionRangeAnchorIndex : null;

  if (captionSegments.length === 0) {
    appendCaptionEmptyState("No captions yet", "Select or extract audio, then click Generate Captions.");
    renderCaptionSelectionSummary();
    return;
  }

  if (visibleSegments.length === 0) {
    appendCaptionEmptyState(
      "No matching captions",
      `No captions match "${searchQuery}". Clear or change the search to show the hidden captions.`
    );
    renderCaptionSelectionSummary();
    return;
  }

  for (const segment of visibleSegments) {
    const row = document.createElement("div");
    row.className = "caption-segment-row";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.title = "Click to set clip range start or end";
    const isRangeStart =
      (pendingStartIndex !== null && segment.index === pendingStartIndex) ||
      (rangeStartIndex !== null && segment.index === rangeStartIndex);
    const isRangeEnd = rangeEndIndex !== null && segment.index === rangeEndIndex;
    const isInsideRange =
      rangeStartIndex !== null && rangeEndIndex !== null && segment.index > rangeStartIndex && segment.index < rangeEndIndex;
    const isPlaybackActive = activePlaybackSegmentIndex === segment.index;
    const isEdited = segment.edited === true;

    row.classList.toggle("is-range-start", isRangeStart);
    row.classList.toggle("is-range-end", isRangeEnd);
    row.classList.toggle("is-in-range", isInsideRange);
    row.classList.toggle("is-playback-active", isPlaybackActive);
    row.classList.toggle("is-edited", isEdited);
    row.classList.toggle("is-editing", editingCaptionIndex === segment.index);

    const activateSegment = () => {
      seekMediaToTimestamp(segment.start);
      selectCaptionSegment(segment);
    };

    row.addEventListener("click", activateSegment);
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      activateSegment();
    });

    const timeNode = document.createElement("span");
    timeNode.className = "caption-segment-time";

    const startNode = document.createElement("span");
    startNode.textContent = segment.start;

    const endNode = document.createElement("span");
    endNode.textContent = segment.end;

    timeNode.append(startNode, endNode);

    const badgesNode = document.createElement("span");
    badgesNode.className = "caption-segment-badges";

    const appendBadge = (label: string, kind: string) => {
      const badgeNode = document.createElement("span");
      badgeNode.className = `caption-segment-badge is-${kind}`;
      badgeNode.textContent = label;
      badgesNode.appendChild(badgeNode);
    };

    if (isRangeStart) {
      appendBadge("Start", "start");
    }
    if (isRangeEnd) {
      appendBadge("End", "end");
    }
    if (isPlaybackActive) {
      appendBadge("Playing", "playing");
    }
    if (isEdited) {
      appendBadge("Edited", "edited");
    }
    if (badgesNode.childElementCount > 0) {
      timeNode.appendChild(badgesNode);
    }

    if (editingCaptionIndex === segment.index) {
      const editorNode = document.createElement("textarea");
      editorNode.className = "caption-segment-editor";
      editorNode.value = segment.text;
      editorNode.setAttribute("aria-label", "Edit caption text");
      let finished = false;

      editorNode.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      editorNode.addEventListener("keydown", (event) => {
        event.stopPropagation();

        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          finished = true;
          saveCaptionEdit(segment.index, editorNode.value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finished = true;
          cancelCaptionEdit();
        }
      });
      editorNode.addEventListener("blur", () => {
        if (!finished) {
          finished = true;
          saveCaptionEdit(segment.index, editorNode.value);
        }
      });

      row.append(timeNode, editorNode);
      captionSegmentListNode.appendChild(row);

      window.requestAnimationFrame(() => {
        editorNode.focus();
        editorNode.select();
      });
      continue;
    }

    const textNode = document.createElement("span");
    textNode.className = "caption-segment-text";
    appendHighlightedText(textNode, getCaptionPreview(segment.text), searchQuery);
    textNode.title = segment.text;
    textNode.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      startCaptionEdit(segment);
    });

    if (segment.edited) {
      const editedNode = document.createElement("span");
      editedNode.className = "caption-edited-dot";
      editedNode.title = "Edited";
      editedNode.setAttribute("aria-label", "Edited");
      textNode.appendChild(editedNode);
    }

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "caption-segment-edit";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", (event) => {
      event.stopPropagation();
      startCaptionEdit(segment);
    });
    editButton.addEventListener("keydown", (event) => {
      event.stopPropagation();
    });

    row.append(timeNode, textNode, editButton);
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
    editingCaptionIndex = null;
  }

  captionSegments = segments;
  renderCaptionSegments();

  if (shouldScroll) {
    scrollCaptionSegmentsToBottom();
  }

  scheduleCaptionProjectSave();
}

function renderQueuedClips(): void {
  const clipLabel = queuedClips.length === 1 ? "clip" : "clips";
  queuedClipsCountNode.textContent = `${queuedClips.length} ${clipLabel}`;
  queuedClipsListNode.replaceChildren();

  if (queuedClips.length === 0) {
    const emptyNode = document.createElement("p");
    emptyNode.className = "queued-clips-empty";
    emptyNode.textContent = "Add clip ranges to queue them for batch export.";
    queuedClipsListNode.appendChild(emptyNode);
    syncButtons();
    return;
  }

  for (const clip of queuedClips) {
    const row = document.createElement("div");
    row.className = "queued-clip-row";
    const isExporting = clip.id === activeQueuedClipId;
    row.classList.toggle("is-exporting", isExporting);
    if (isExporting) {
      row.setAttribute("aria-current", "step");
    }

    const metadataNode = document.createElement("div");
    metadataNode.className = "queued-clip-metadata";

    const timeNode = document.createElement("div");
    timeNode.className = "queued-clip-time";
    timeNode.textContent = `${clip.startTime} -> ${clip.endTime}`;

    const modeNode = document.createElement("span");
    modeNode.className = "queued-clip-mode";
    modeNode.textContent = clip.mode === "encode" ? "Encode" : "Copy";

    metadataNode.append(timeNode, modeNode);
    if (isExporting) {
      const exportingNode = document.createElement("span");
      exportingNode.className = "queued-clip-exporting";
      exportingNode.textContent = "Exporting";
      metadataNode.appendChild(exportingNode);
    }

    const previewNode = document.createElement("div");
    previewNode.className = "queued-clip-preview";
    previewNode.textContent = clip.preview || "(manual range)";
    previewNode.title = previewNode.textContent;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "queued-clip-remove";
    removeButton.textContent = "Remove";
    removeButton.disabled = isBusy;
    removeButton.addEventListener("click", () => {
      queuedClips = queuedClips.filter((candidate) => candidate.id !== clip.id);
      renderQueuedClips();
      scheduleCaptionProjectSave();
    });

    row.append(metadataNode, previewNode, removeButton);
    queuedClipsListNode.appendChild(row);
    if (isExporting) {
      window.requestAnimationFrame(() => {
        row.scrollIntoView({ block: "nearest" });
      });
    }
  }

  syncButtons();
}

function clearQueuedClips(): void {
  queuedClips = [];
  renderQueuedClips();
  scheduleCaptionProjectSave();
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

function getCaptionProjectSnapshot(): CaptionProjectSession {
  persistActiveCaptionSet();
  return {
    version: 2,
    selectedVideoPath,
    audioPath,
    audioSourceKind,
    srtPath,
    vttPath,
    captionSegments: captionSegments.map((segment) => ({ ...segment })),
    queuedClips: queuedClips.map((clip) => ({ ...clip })),
    clipStart: clipStartInput.value.trim(),
    clipEnd: clipEndInput.value.trim(),
    clipMode: clipModeSelect.value === "encode" ? "encode" : "copy",
    ...((audioProject ?? pendingRestoredProject) ? { audioProject: window.audioEditUtils.cloneProject((audioProject ?? pendingRestoredProject)!) } : {}),
    captionSource,
    captionSets: captionSets.map((set) => ({ ...set, project: window.audioEditUtils.cloneProject(set.project), segments: set.segments.map((segment) => ({ ...segment })) })),
    activeCaptionSetId,
    audioSelection: audioProject ? { start: audioEditorRegionStartSeconds, end: audioEditorRegionEndSeconds } : pendingRestoredSelection ?? undefined,
    audioPlayhead: audioProject ? audioEditorPlayhead : pendingRestoredPlayhead
  };
}

function scheduleCaptionProjectSave(): void {
  if (!captionProjectPersistenceReady) {
    return;
  }

  if (captionProjectSaveTimer !== null) {
    window.clearTimeout(captionProjectSaveTimer);
  }

  captionProjectSaveTimer = window.setTimeout(() => {
    captionProjectSaveTimer = null;
    void window.videoTools.setCaptionProject(getCaptionProjectSnapshot()).then(() => { projectSaveFailed = false; }).catch((error) => {
      projectSaveFailed = true;
      setAudioEditorError("Your latest edits could not be saved. Keep this window open and retry before switching recordings.");
      appendLog(`Save caption project failed: ${(error as Error).message}`);
    });
  }, 250);
}

async function restoreCaptionProject(): Promise<void> {
  let restoredProjectChanged = false;
  const missingPaths: string[] = [];
  let omittedQueuedClipCount = 0;

  try {
    const session = await window.videoTools.getCaptionProject();
    if (!session || (session.version !== 1 && session.version !== 2)) {
      return;
    }

    const restoreExistingPath = async (savedPath: string | null, label: string): Promise<string | null> => {
      if (!savedPath) {
        return null;
      }

      if (await window.videoTools.knownPathExists(savedPath)) {
        return savedPath;
      }

      restoredProjectChanged = true;
      missingPaths.push(label);
      return null;
    };

    selectedVideoPath = await restoreExistingPath(session.selectedVideoPath, "video");
    audioPath = await restoreExistingPath(session.audioPath, "audio");
    audioSourceKind = audioPath ? session.audioSourceKind : null;
    srtPath = await restoreExistingPath(session.srtPath, "SRT");
    vttPath = await restoreExistingPath(session.vttPath, "VTT");
    captionSets = (session.captionSets ?? []).map((set) => ({ ...set, segments: set.segments.map((segment) => ({ ...segment })) }));
    activeCaptionSetId = session.activeCaptionSetId ?? null;
    captionSource = session.captionSource === "edited" ? "edited" : "original";
    captionSourceOriginal.checked = captionSource === "original";
    captionSourceEdited.checked = captionSource === "edited";
    if (session.audioProject) {
      try { pendingRestoredProject = window.audioEditUtils.validateProject(session.audioProject); }
      catch (error) { appendLog(`Audio edit restoration skipped: ${(error as Error).message}`); }
    }
    pendingRestoredSelection = session.audioSelection ?? null;
    pendingRestoredPlayhead = session.audioPlayhead ?? 0;

    const savedQueuedClips = Array.isArray(session.queuedClips) ? session.queuedClips : [];
    const restoredQueuedClips = await Promise.all(
      savedQueuedClips.map(async (clip): Promise<QueuedClip | null> => {
        if (await window.videoTools.knownPathExists(clip.videoPath)) {
          return { ...clip };
        }

        restoredProjectChanged = true;
        omittedQueuedClipCount += 1;
        return null;
      })
    );
    queuedClips = restoredQueuedClips.filter((clip): clip is QueuedClip => clip !== null);
    nextQueuedClipId = queuedClips.reduce((maximum, clip) => Math.max(maximum, clip.id), 0) + 1;
    clipStartInput.value = session.clipStart ?? "";
    clipEndInput.value = session.clipEnd ?? "";
    clipModeSelect.value = session.clipMode === "encode" ? "encode" : "copy";

    setCaptionSegments(
      getActiveCaptionSet()?.segments.map((segment) => ({ ...segment })) ?? (Array.isArray(session.captionSegments) ? session.captionSegments.map((segment) => ({ ...segment })) : [])
    );
    renderCaptionSets();
    refreshPaths();
    renderQueuedClips();
    syncButtons();
    const restoredItems: string[] = [];
    if (captionSegments.length > 0) {
      restoredItems.push(`${captionSegments.length} ${captionSegments.length === 1 ? "caption" : "captions"}`);
    }
    if (queuedClips.length > 0) {
      restoredItems.push(`${queuedClips.length} queued ${queuedClips.length === 1 ? "clip" : "clips"}`);
    }
    if (clipStartInput.value || clipEndInput.value) {
      restoredItems.push("clip fields");
    }
    if (selectedVideoPath || audioPath) {
      restoredItems.push("available media");
    }

    const restoredSummary =
      restoredItems.length > 0 ? `${restoredItems.join(", ")} restored.` : "Previous project state restored.";
    if (restoredProjectChanged) {
      const missingSources = missingPaths.filter((label) => label === "video" || label === "audio");
      const missingArtifacts = missingPaths.filter((label) => label === "SRT" || label === "VTT");
      const missingDetail =
        missingSources.length > 0
          ? ` Reselect the missing ${missingSources.join(" and ")} ${missingSources.length === 1 ? "source" : "sources"} to continue.`
          : "";
      const artifactDetail =
        missingArtifacts.length > 0 ? ` Missing ${missingArtifacts.join(" and ")} paths were omitted.` : "";
      const omittedQueueDetail =
        omittedQueuedClipCount > 0
          ? ` ${omittedQueuedClipCount} queued ${omittedQueuedClipCount === 1 ? "clip was" : "clips were"} omitted because ${omittedQueuedClipCount === 1 ? "its video is" : "their videos are"} unavailable.`
          : "";
      showSessionNotice(
        "Previous project restored with missing files",
        `${restoredSummary}${missingDetail}${artifactDetail}${omittedQueueDetail}`,
        "warning"
      );
    } else if (restoredItems.length > 0) {
      showSessionNotice("Previous project restored", restoredSummary, "restored");
    }
    appendLog(
      restoredProjectChanged
        ? "Restored previous caption project; missing media paths were omitted."
        : "Restored previous caption project."
    );
  } catch (error) {
    appendLog(`Restore caption project failed: ${(error as Error).message}`);
  } finally {
    captionProjectPersistenceReady = true;
    if (restoredProjectChanged) {
      scheduleCaptionProjectSave();
    }
  }
}

function renderSettings(settings: AppSettings): void {
  applyThemeMode(settings.themeMode);
}

async function refreshSettings(): Promise<void> {
  const settings = await window.videoTools.getSettings();
  renderSettings(settings);
}

async function promptSaveExtractedAudio(): Promise<void> {
  if (!audioPath || audioSourceKind !== "extracted") {
    appendLog("Save audio skipped: no extracted audio is available.");
    return;
  }

  const defaultBaseName = selectedVideoPath ? getBaseNameFromPath(selectedVideoPath) : getBaseNameFromPath(audioPath);

  try {
    const savedPath = await window.videoTools.saveFileAs({
      sourcePath: audioPath,
      defaultFileName: `${defaultBaseName}_audio.wav`,
      mediaPath: selectedVideoPath ?? audioPath
    });

    appendLog(savedPath ? `Saved audio to: ${savedPath}` : "Audio save cancelled.");
  } catch (error) {
    appendLog(`Save audio failed: ${(error as Error).message}`);
  }
}

function appendSetupHintForMissingDependency(errorMessage: string): void {
  const runtimeIssue = ["ffmpeg/", "whisper/", "Whisper model", "Runtime dependency manifest"].some((label) =>
    errorMessage.includes(label)
  );

  if (runtimeIssue) {
    appendLog(`[setup] Runtime verification failed: ${errorMessage}`);
    appendLog("[setup] From video-caption-app, run: .\\scripts\\setup-windows.ps1 -Force");
    appendLog("[setup] Setup uses the pinned URLs and SHA-256 hashes in runtime-dependencies.json.");
  }
}

function applySelectedVideo(videoPath: string): void {
  if (!confirmAudioSourceReplacement(videoPath)) return;
  resetCaptionSourceForNewRecording(videoPath);
  detachCaptionSet();
  audioPreviewOverride = null;
  const clearedPreviousWork =
    captionSegments.length > 0 || queuedClips.length > 0 || clipStartInput.value !== "" || clipEndInput.value !== "";
  selectedVideoPath = videoPath;
  audioPath = null;
  srtPath = null;
  vttPath = null;
  audioSourceKind = null;
  clipStartInput.value = "";
  clipEndInput.value = "";
  setCaptionSegments([]);
  clearQueuedClips();

  refreshPaths();
  syncButtons();
  showSessionNotice(
    "New video selected",
    clearedPreviousWork
      ? "Saved caption copies were kept. Video clip fields and queued clips were cleared."
      : "Choose Original audio for captions, or open Audio Editor first.",
    "reset"
  );
  if (!activeAction) {
    setIdleActionStatus();
  }
  appendLog(`Selected video: ${selectedVideoPath}`);
  scheduleCaptionProjectSave();
}

function applySelectedAudio(nextAudioPath: string): void {
  if (!confirmAudioSourceReplacement(nextAudioPath)) return;
  resetCaptionSourceForNewRecording(nextAudioPath);
  detachCaptionSet();
  audioPreviewOverride = null;
  const clearedPreviousWork =
    captionSegments.length > 0 || queuedClips.length > 0 || clipStartInput.value !== "" || clipEndInput.value !== "";
  audioPath = nextAudioPath;
  srtPath = null;
  vttPath = null;
  audioSourceKind = "uploaded";
  clipStartInput.value = "";
  clipEndInput.value = "";
  setCaptionSegments([]);
  clearQueuedClips();

  refreshPaths();
  syncButtons();
  showSessionNotice(
    "New audio selected",
    clearedPreviousWork
      ? "Saved caption copies were kept. Video clip fields and queued clips were cleared."
      : "Generate captions when you are ready.",
    "reset"
  );
  if (!activeAction) {
    setIdleActionStatus();
  }
  appendLog(`Selected audio: ${audioPath}`);
  scheduleCaptionProjectSave();
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

if (typeof window.videoTools.onSettingsChanged === "function") {
  try {
    window.videoTools.onSettingsChanged((settings) => {
      renderSettings(settings);
    });
  } catch (error) {
    console.error("Failed to subscribe to settings:changed", error);
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

window.addEventListener("beforeunload", () => {
  if (captionProjectPersistenceReady) {
    void window.videoTools.setCaptionProject(getCaptionProjectSnapshot()).catch(() => undefined);
  }
});

showRawLogsCheckbox.addEventListener("change", () => {
  scheduleLogPanelRender();
});

systemThemeMedia.addEventListener("change", () => {
  if (currentThemeMode === "system") {
    applyThemeMode("system");
  }
});

logFilterSelect.addEventListener("change", () => {
  scheduleLogPanelRender();
});

cancelActionButton.addEventListener("click", async () => {
  if (!activeAction || isCancelling) {
    return;
  }

  isCancelling = true;
  editorCancelRequested = true;
  syncButtons();
  setActionStatus(activeAction.label, "Cancelling...", "indeterminate", 0);
  appendLog("Cancellation requested.");

  try {
    const cancelled = await window.videoTools.cancelActiveMediaProcess();
    if (!cancelled && !editorPipelineActive) {
      appendLog("Cancellation skipped: no active media process.");
      isCancelling = false;
      if (activeAction) {
        setActionStatus(activeAction.label, "Finishing...", "indeterminate", 0);
      }
      syncButtons();
    }
  } catch (error) {
    appendLog(`Cancellation request failed: ${(error as Error).message}`);
    isCancelling = false;
    if (activeAction) {
      setActionStatus(activeAction.label, "Cancellation failed; task still running", "indeterminate", 0);
    }
    syncButtons();
  }
});

showLogButton.addEventListener("click", () => {
  toggleLogDrawer();
});

detailsToggleButton.addEventListener("click", () => {
  toggleDetailsDrawer();
});

for (const button of workflowNavButtons) {
  button.addEventListener("click", () => {
    const target = getWorkflowNavTarget(button);
    if (target) {
      activateWorkflowNavTarget(target);
    }
  });
}

closeDetailsButton.addEventListener("click", () => {
  setDetailsDrawerOpen(false);
  detailsToggleButton.focus();
});

detailsDrawerBackdrop.addEventListener("click", () => {
  setDetailsDrawerOpen(false);
});

closeLogButton.addEventListener("click", () => {
  closeLogDrawer();
});

logDrawerBackdrop.addEventListener("click", () => {
  closeLogDrawer();
});

logDrawerResizeHandle.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  document.body.classList.add("is-resizing-log-drawer");

  const handlePointerMove = (moveEvent: PointerEvent) => {
    setLogDrawerWidth(window.innerWidth - moveEvent.clientX);
  };

  const handlePointerUp = () => {
    document.body.classList.remove("is-resizing-log-drawer");
    window.removeEventListener("pointermove", handlePointerMove);
  };

  setLogDrawerWidth(window.innerWidth - event.clientX);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp, { once: true });
});

window.addEventListener("resize", () => {
  setLogDrawerWidth(logDrawerWidth);
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

captionSearchInput.addEventListener("input", () => {
  renderCaptionSegments();
});

clipStartInput.addEventListener("input", scheduleCaptionProjectSave);
clipEndInput.addEventListener("input", scheduleCaptionProjectSave);
clipModeSelect.addEventListener("change", scheduleCaptionProjectSave);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (isLogDrawerOpen()) {
    closeLogDrawer();
    event.preventDefault();
    return;
  }

  if (isDetailsDrawerOpen()) {
    setDetailsDrawerOpen(false);
    event.preventDefault();
    return;
  }

  if (document.activeElement === captionSearchInput) {
    if (captionSearchInput.value !== "") {
      captionSearchInput.value = "";
      renderCaptionSegments();
      event.preventDefault();
    }
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

clipAddRangeButton.addEventListener("click", () => {
  if (!selectedVideoPath) {
    appendLog("Add clip range failed: no video selected.");
    return;
  }

  const startTime = clipStartInput.value.trim();
  const endTime = clipEndInput.value.trim();

  if (startTime === "" || endTime === "") {
    appendLog("Add clip range failed: start and end time are required.");
    return;
  }

  if (getClipDurationSeconds(startTime, endTime) === null) {
    appendLog("Add clip range failed: end time must be after start time.");
    return;
  }

  queuedClips.push({
    id: nextQueuedClipId,
    videoPath: selectedVideoPath,
    startTime,
    endTime,
    mode: clipModeSelect.value === "encode" ? "encode" : "copy",
    preview: getQueuedClipPreview(startTime, endTime)
  });
  nextQueuedClipId += 1;

  renderQueuedClips();
  appendLog(`Queued clip range: ${startTime} - ${endTime}`);
  scheduleCaptionProjectSave();
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

dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  dropZone.classList.remove("drop-active");

  const files = event.dataTransfer?.files;
  if (!files || files.length !== 1) {
    appendLog("Drop rejected: not a supported video or audio type");
    return;
  }

  const droppedPath = await window.videoTools.authorizeDroppedFile(files[0]);

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
  const outputDir = getDirectoryFromPath(selectedVideoPath) ?? "";

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
    if (isMediaProcessCancellation(message)) {
      appendLog("Create clip cancelled.");
      cancelActionStatus();
    } else {
      appendLog(`Create clip failed: ${message}`);
      failActionStatus(message);
    }
  } finally {
    setBusy(false);
  }
});

queuedClipsExportButton.addEventListener("click", async () => {
  if (queuedClips.length === 0) {
    return;
  }

  const clipsToExport = [...queuedClips];
  const totalClips = clipsToExport.length;
  let exportedCount = 0;
  let failedCount = 0;
  let cancelled = false;

  setBusy(true);
  renderQueuedClips();

  try {
    for (let index = 0; index < clipsToExport.length; index += 1) {
      const clip = clipsToExport[index];
      const clipNumber = index + 1;
      activeQueuedClipId = clip.id;
      renderQueuedClips();
      const outputDir = getDirectoryFromPath(clip.videoPath) ?? "";

      if (outputDir === "") {
        failedCount += 1;
        appendLog(`Export queued clip ${clipNumber} failed: unable to resolve output directory.`);
        continue;
      }

      const suffix = String(clipNumber).padStart(3, "0");
      const outputPath = joinOutputPath(outputDir, `${getBaseNameFromPath(clip.videoPath)}_clip_${suffix}.mp4`);
      startActionStatus(
        "clip",
        `Exporting clip ${clipNumber} of ${totalClips}...`,
        getClipDurationSeconds(clip.startTime, clip.endTime)
      );

      try {
        const result = await window.videoTools.clipVideo({
          videoPath: clip.videoPath,
          startTime: clip.startTime,
          endTime: clip.endTime,
          outputPath,
          mode: clip.mode
        });
        exportedCount += 1;
        appendLog(`Queued clip ${clipNumber} exported: ${result.outputPath}`);
      } catch (error) {
        const message = (error as Error).message;
        if (isMediaProcessCancellation(message)) {
          cancelled = true;
          appendLog(`Queued clip export cancelled during clip ${clipNumber}.`);
          break;
        }

        failedCount += 1;
        appendLog(`Export queued clip ${clipNumber} failed: ${message}`);
      }
    }

    if (cancelled) {
      const cancelledMessage = `Batch export cancelled after ${exportedCount} of ${totalClips} clips exported. Remaining clips were not exported.`;
      appendLog(cancelledMessage);
      cancelActionStatus(`${exportedCount}/${totalClips} exported; remaining clips stopped`, "Batch cancelled");
    } else {
      activeAction = null;
      isCancelling = false;
      setActionStatus("Complete", `${exportedCount} exported, ${failedCount} failed`, "done", 100);
      appendLog(`Batch export complete: ${exportedCount} exported, ${failedCount} failed.`);
    }
  } finally {
    activeQueuedClipId = null;
    setBusy(false);
    renderQueuedClips();
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
    persistActiveCaptionSet();

    refreshPaths();
    syncButtons();
    appendLog(`Audio extracted: ${audioPath}`);
    scheduleCaptionProjectSave();
    completeActionStatus();
    appendLog("Choose where to save the extracted audio.");
    await promptSaveExtractedAudio();
  } catch (error) {
    const message = (error as Error).message;
    if (isMediaProcessCancellation(message)) {
      appendLog("Audio extraction cancelled.");
      cancelActionStatus();
    } else {
      appendLog(`Audio extraction failed: ${message}`);
      appendSetupHintForMissingDependency(message);
      failActionStatus(message);
    }
  } finally {
    setBusy(false);
  }
});

saveAudioButton.addEventListener("click", async () => {
  setBusy(true);

  try {
    await promptSaveExtractedAudio();
  } finally {
    setBusy(false);
  }
});

generateCaptionsButton.addEventListener("click", () => { void generateAudioCaptions(); });

saveSrtButton.addEventListener("click", async () => {
  if (!srtPath && captionSegments.length === 0) {
    return;
  }

  setBusy(true);

  try {
    const savedPath =
      captionSegments.length > 0
        ? await window.videoTools.saveTextAs({
            content: createSrtText(captionSegments),
            defaultFileName: "captions.srt",
            mediaPath: getCaptionContextPath(),
            extension: "srt"
          })
        : await window.videoTools.saveFileAs({
            sourcePath: srtPath!,
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
  if (!vttPath && captionSegments.length === 0) {
    return;
  }

  setBusy(true);

  try {
    const savedPath =
      captionSegments.length > 0
        ? await window.videoTools.saveTextAs({
            content: createVttText(captionSegments),
            defaultFileName: "captions.vtt",
            mediaPath: getCaptionContextPath(),
            extension: "vtt"
          })
        : await window.videoTools.saveFileAs({
            sourcePath: vttPath!,
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

async function initSettings(): Promise<void> {
  try {
    await refreshSettings();
  } catch (error) {
    appendLog(`Load settings failed: ${(error as Error).message}`);
  }
}

setIdleActionStatus();
applyThemeMode("system");
setLogDrawerWidth(logDrawerWidth);
updateWorkflowNavigationState();
refreshPaths();
renderCaptionSegments();
renderQueuedClips();
syncButtons();
appendLog("Ready.");
void Promise.all([initSettings(), restoreCaptionProject()]);








// Audio editor: model-backed workflow.
function formatEditorTimestamp(seconds: number): string {
  const total = Math.round(Math.max(0, Number.isFinite(seconds) ? seconds : 0) * 1000);
  return `${String(Math.floor(total / 3600000)).padStart(2, "0")}:${String(Math.floor(total / 60000) % 60).padStart(2, "0")}:${String(Math.floor(total / 1000) % 60).padStart(2, "0")}.${String(total % 1000).padStart(3, "0")}`;
}

function parseEditorTimestamp(value: string): number {
  const match = value.trim().match(/^(\d+):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?$/);
  if (!match) throw new Error("Enter a time as hours:minutes:seconds.milliseconds, for example 00:01:25.500.");
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number((match[4] ?? "0").padEnd(3, "0")) / 1000;
}

function getEditorSourcePath(): string | null {
  return audioSourceKind === "uploaded" ? audioPath : selectedVideoPath ?? audioPath;
}

function getActiveCaptionSet(): EditorCaptionSet | undefined {
  return captionSets.find((set) => set.id === activeCaptionSetId);
}

function persistActiveCaptionSet(): void {
  const set = getActiveCaptionSet();
  if (set && !captionGenerationPending) set.segments = captionSegments.map((segment) => ({ ...segment }));
}

function detachCaptionSet(): void {
  persistActiveCaptionSet();
  activeCaptionSetId = null;
  renderCaptionSets();
}

function confirmAudioSourceReplacement(path: string): boolean {
  if (audioProject && audioProject.sourcePath !== path && (audioProject.revision > 0 || projectSaveFailed)) {
    return window.confirm("Switch recording? The current audio edit will be replaced. Existing caption copies and their text corrections stay available.");
  }
  return true;
}

function resetCaptionSourceForNewRecording(path: string): void {
  if ((audioProject ?? pendingRestoredProject)?.sourcePath === path) return;
  captionSource = "original";
  captionSourceOriginal.checked = true;
  captionSourceEdited.checked = false;
  if (pendingRestoredProject?.sourcePath !== path) pendingRestoredProject = null;
}

function setAudioEditorError(message: string): void {
  audioEditorError.textContent = message;
  audioEditorError.hidden = !message;
  syncAudioEditorButtons();
}

function getEditorDuration(): number {
  return audioProject ? window.audioEditUtils.getDuration(audioProject) : 0;
}

function hasAudioSelection(): boolean {
  return audioEditorRegionEndSeconds > audioEditorRegionStartSeconds && audioEditorRegionEndSeconds <= getEditorDuration() + 0.001;
}

function syncAudioEditorButtons(): void {
  const ready = audioLoadState === "ready" && audioProject !== null;
  const locked = isBusy || !ready;
  const invalid = audioEditorPanel.querySelector('[aria-invalid="true"]') !== null;
  for (const control of Array.from(audioEditorPanel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input, select, button"))) control.disabled = locked;
  audioEditorRetry.disabled = isBusy;
  audioEditUndoButton.disabled = locked || audioUndoHistory.length === 0;
  audioEditRedoButton.disabled = locked || audioRedoHistory.length === 0;
  audioEditResetButton.disabled = locked || audioProject?.revision === 0;
  audioSplit.disabled = locked || audioEditorPlayhead <= 0 || audioEditorPlayhead >= getEditorDuration();
  for (const control of [audioKeep, audioRemove, audioDuplicate]) control.disabled = locked || !hasAudioSelection();
  audioRemove.disabled = audioRemove.disabled || (audioEditorRegionStartSeconds === 0 && audioEditorRegionEndSeconds >= getEditorDuration());
  audioEditExportButton.disabled = locked || invalid || (audioExportScope.value === "selection" && !hasAudioSelection());
  audioPreviewEdited.disabled = locked || invalid;
  generateCaptionsButton.disabled = locked || (captionSource === "edited" && invalid);
  audioClipSettings.disabled = locked || !audioProject?.clips.some((clip) => clip.id === audioSelectedClipId);
  audioWaveformCanvas.setAttribute("aria-disabled", String(locked));
  audioUseCaptionRange.disabled = locked || captionRangeAnchorIndex === null;
  captionSetSelect.disabled = isBusy || captionSets.length === 0;
  captionSourceOriginal.disabled = isBusy;
  captionSourceEdited.disabled = isBusy || !ready;
  const set = getActiveCaptionSet();
  captionRemapButton.disabled = locked || !set || set.segments.length === 0 || set.project.sourceFingerprint !== audioProject?.sourceFingerprint;
  captionSourceHelp.textContent = captionSource === "edited"
    ? "Use the current cuts and sound adjustments. The app prepares the audio for you; existing captions are kept."
    : "Use the recording as imported. Existing captions are kept.";
}

async function ensureAudioEditorSource(force = false): Promise<void> {
  const sourcePath = getEditorSourcePath();
  if (!sourcePath) {
    if (audioLoadState !== "empty") {
      audioLoadToken++;
      audioProject = null;
      audioAnalysis = null;
      audioLoadingPath = null;
      audioLoadState = "empty";
      audioUndoHistory = [];
      audioRedoHistory = [];
      audioEditorStatus.textContent = "Choose a recording";
      audioEditorStatus.dataset.state = "idle";
      renderAudioEditor();
    }
    return;
  }
  if (isBusy || (!force && audioLoadingPath === sourcePath)) return;
  const token = ++audioLoadToken;
  audioLoadingPath = sourcePath;
  audioLoadState = "loading";
  audioEditorRetry.hidden = true;
  audioEditorStatus.textContent = "Loading audio...";
  audioEditorStatus.dataset.state = "idle";
  audioEditorSource.textContent = getBaseNameFromPath(sourcePath);
  setAudioEditorError("");
  editorCancelRequested = false;
  editorPipelineActive = true;
  setBusy(true);
  startActionStatus("editor", "Reading audio and waveform...");
  try {
    const analysis = await window.videoTools.analyzeAudio(sourcePath);
    if (editorCancelRequested) throw new Error(MEDIA_PROCESS_CANCELLED_MESSAGE);
    if (token !== audioLoadToken || sourcePath !== getEditorSourcePath()) return;
    audioAnalysis = analysis;
    const restored = pendingRestoredProject ?? (audioProject?.sourcePath === sourcePath ? audioProject : null);
    if (restored && restored.sourcePath === sourcePath && restored.sourceFingerprint === analysis.sourceFingerprint) {
      audioProject = window.audioEditUtils.validateProject(restored);
    } else {
      audioProject = window.audioEditUtils.createProject(analysis);
      if (restored?.sourcePath === sourcePath) setAudioEditorError("This recording has changed. A fresh edit is open; earlier caption copies are kept and must be checked against their original recording.");
    }
    const restoredView = pendingRestoredProject?.sourceFingerprint === analysis.sourceFingerprint;
    pendingRestoredProject = null;
    audioUndoHistory = [];
    audioRedoHistory = [];
    audioSelectedClipId = audioProject.clips[0]?.id ?? null;
    audioLoadState = "ready";
    audioEditorStatus.textContent = "Ready";
    audioEditorStatus.dataset.state = "ready";
    updateAudioEditorRegion(restoredView ? pendingRestoredSelection?.start ?? 0 : 0, restoredView ? pendingRestoredSelection?.end ?? getEditorDuration() : getEditorDuration());
    setAudioPlayhead(restoredView ? pendingRestoredPlayhead : 0, false);
    pendingRestoredSelection = null;
    pendingRestoredPlayhead = 0;
    if (!activeCaptionSetId && captionSets.length === 0 && captionSegments.length > 0) {
      addCaptionSet("Original audio  /  restored captions", "original", window.audioEditUtils.createProject(analysis), analysis.previewPath, captionSegments);
    }
    renderAudioEditor();
    renderCaptionSets();
    scheduleCaptionProjectSave();
    completeActionStatus();
  } catch (error) {
    if (token !== audioLoadToken) return;
    audioLoadState = "error";
    audioEditorStatus.textContent = editorCancelRequested ? "Loading cancelled" : "Audio unavailable";
    audioEditorStatus.dataset.state = "idle";
    audioEditorRetry.hidden = false;
    const message = (error as Error).message;
    setAudioEditorError(editorCancelRequested || isMediaProcessCancellation(message) ? "Audio loading stopped. Retry when you are ready." : message);
    if (editorCancelRequested || isMediaProcessCancellation(message)) cancelActionStatus(); else failActionStatus(message);
  } finally {
    editorPipelineActive = false;
    setBusy(false);
  }
}

function renderAudioEditor(): void {
  const project = audioProject;
  audioEditorSource.textContent = project
    ? `${project.sourcePath.split(/[\\/]/).pop()}  /  ${project.sampleRate.toLocaleString()} Hz  /  ${project.channels === 1 ? "mono" : `${project.channels} channels`}  /  Original recording preserved`
    : "Choose a video or audio recording to begin. Your original stays unchanged.";
  audioEditorDuration.textContent = `Track length ${formatEditorTimestamp(getEditorDuration())}`;
  audioClipList.replaceChildren();
  if (project) {
    for (const input of Array.from(audioEditorPanel.querySelectorAll("[aria-invalid]"))) input.removeAttribute("aria-invalid");
    audioEditGain.value = String(project.effects.gainDb);
    audioEditFadeIn.value = String(project.effects.fadeInSeconds);
    audioEditFadeOut.value = String(project.effects.fadeOutSeconds);
    audioEditSpeed.value = String(project.effects.speed);
    audioEditPitch.value = String(project.effects.pitchSemitones);
    audioEditNormalize.checked = project.effects.normalize;
    audioEditNoise.checked = project.effects.noiseReduction;
    if (!project.clips.some((clip) => clip.id === audioSelectedClipId)) audioSelectedClipId = project.clips[0]?.id ?? null;
    window.audioEditUtils.getTimeline(project).forEach((entry, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.clipId = entry.clipId;
      button.textContent = `Clip ${index + 1}  /  ${formatEditorTimestamp(entry.start)}-${formatEditorTimestamp(entry.end)}`;
      button.setAttribute("aria-pressed", String(entry.clipId === audioSelectedClipId));
      button.addEventListener("click", () => {
        audioSelectedClipId = entry.clipId;
        updateAudioEditorRegion(entry.start, entry.end);
        setAudioPlayhead(entry.start, false);
        renderAudioEditor();
      });
      audioClipList.appendChild(button);
    });
    const selected = project.clips.find((clip) => clip.id === audioSelectedClipId);
    audioClipGain.value = String(selected?.gainDb ?? 0);
    audioClipFadeIn.value = String(selected?.fadeInSeconds ?? 0);
    audioClipFadeOut.value = String(selected?.fadeOutSeconds ?? 0);
  }
  drawAudioEditorTimeline();
  syncAudioEditorButtons();
}

function updateAudioEditorRegion(start: number, end: number): void {
  const duration = getEditorDuration();
  audioEditorRegionStartSeconds = Math.max(0, Math.min(start, end, duration));
  audioEditorRegionEndSeconds = Math.max(0, Math.min(Math.max(start, end), duration));
  audioEditStart.value = formatEditorTimestamp(audioEditorRegionStartSeconds);
  audioEditEnd.value = formatEditorTimestamp(audioEditorRegionEndSeconds);
  audioEditStart.removeAttribute("aria-invalid");
  audioEditEnd.removeAttribute("aria-invalid");
  audioEditorSelection.textContent = `Selection ${audioEditStart.value}-${audioEditEnd.value}`;
  drawAudioEditorTimeline();
  syncAudioEditorButtons();
}

function readAudioSelection(): [number, number] {
  const start = parseEditorTimestamp(audioEditStart.value);
  const end = parseEditorTimestamp(audioEditEnd.value);
  const duration = getEditorDuration();
  if (start < 0 || end <= start || end > duration + 0.001) throw new Error("Choose a selection that ends after it starts and stays within the track.");
  return [Math.min(start, duration), Math.min(end, duration)];
}

function setAudioPlayhead(seconds: number, seek: boolean): void {
  audioEditorPlayhead = Math.max(0, Math.min(seconds, getEditorDuration()));
  audioPlayheadInput.removeAttribute("aria-invalid");
  audioPlayheadInput.value = formatEditorTimestamp(audioEditorPlayhead);
  audioWaveformCanvas.setAttribute("aria-valuemax", String(getEditorDuration()));
  audioWaveformCanvas.setAttribute("aria-valuenow", String(audioEditorPlayhead));
  audioWaveformCanvas.setAttribute("aria-valuetext", audioPlayheadInput.value);
  if (seek && audioPreviewOverride && audioProject && window.audioEditUtils.timelineMatches(audioPreviewOverride.project, audioProject)) {
    try { previewAudioNode.currentTime = audioEditorPlayhead; } catch { /* Metadata may still be loading. */ }
  }
  drawAudioEditorTimeline();
  syncAudioEditorButtons();
}

function drawAudioEditorTimeline(): void {
  const context = audioWaveformCanvas.getContext("2d");
  if (!context || audioWaveformScroll.clientWidth === 0) return;
  const width = Math.max(320, Math.round(audioWaveformScroll.clientWidth * Number(audioZoom.value || 1)));
  if (audioWaveformCanvas.style.width !== `${width}px`) audioWaveformCanvas.style.width = `${width}px`;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(160 * ratio);
  if (audioWaveformCanvas.width !== pixelWidth) audioWaveformCanvas.width = pixelWidth;
  if (audioWaveformCanvas.height !== pixelHeight) audioWaveformCanvas.height = pixelHeight;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const style = getComputedStyle(document.documentElement);
  context.fillStyle = style.getPropertyValue("--surface");
  context.fillRect(0, 0, width, 160);
  if (!audioProject || !audioAnalysis || !audioAnalysis.peaks.length || audioLoadState !== "ready") return;
  const duration = getEditorDuration();
  const timeline = window.audioEditUtils.getTimeline(audioProject);
  context.strokeStyle = style.getPropertyValue("--primary");
  context.lineWidth = 1;
  context.beginPath();
  let entryIndex = 0;
  for (let x = 0; x < width; x += 2) {
    const time = x / width * duration;
    while (entryIndex < timeline.length - 1 && timeline[entryIndex].end <= time) entryIndex++;
    const entry = timeline[entryIndex];
    if (!entry) continue;
    const sourceTime = entry.sourceStart + (time - entry.start) * audioProject.effects.speed;
    const bin = Math.min(audioAnalysis.peaks.length - 1, Math.max(0, Math.floor(sourceTime / audioAnalysis.duration * audioAnalysis.peaks.length)));
    const peak = Math.min(1, Math.max(0, audioAnalysis.peaks[bin])) * 55;
    context.moveTo(x, 80 - peak);
    context.lineTo(x, 80 + peak);
  }
  context.stroke();
  context.globalAlpha = 0.22;
  context.fillStyle = style.getPropertyValue("--primary");
  context.fillRect(audioEditorRegionStartSeconds / duration * width, 0, (audioEditorRegionEndSeconds - audioEditorRegionStartSeconds) / duration * width, 160);
  context.globalAlpha = 1;
  context.fillStyle = style.getPropertyValue("--text");
  context.font = "11px Segoe UI, sans-serif";
  for (const entry of timeline) context.fillRect(entry.start / duration * width, 0, 1, 160);
  const rulerStep = Math.max(1, Math.ceil(width / 180));
  for (let i = 0; i <= rulerStep; i++) context.fillText(formatEditorTimestamp(duration * i / rulerStep), Math.min(width - 88, i / rulerStep * width + 4), 15);
  context.fillStyle = style.getPropertyValue("--danger");
  context.fillRect(audioEditorPlayhead / duration * width, 0, 2, 160);
}

function commitAudioProject(next: EditorProject, message: string): void {
  if (!audioProject || isBusy) return;
  const validated = window.audioEditUtils.validateProject(next);
  if (JSON.stringify(validated) === JSON.stringify(audioProject)) return;
  audioUndoHistory.push(captureEditorHistory());
  if (audioUndoHistory.length > 100) audioUndoHistory.shift();
  audioRedoHistory = [];
  audioProject = validated;
  invalidateEditedPreview();
  updateAudioEditorRegion(Math.min(audioEditorRegionStartSeconds, getEditorDuration()), Math.min(audioEditorRegionEndSeconds, getEditorDuration()));
  setAudioPlayhead(audioEditorPlayhead, false);
  setAudioEditorError("");
  audioEditorStatus.textContent = message;
  renderAudioEditor();
  renderCaptionSets();
  scheduleCaptionProjectSave();
}

function captureEditorHistory(): EditorHistoryEntry {
  return { project: window.audioEditUtils.cloneProject(audioProject!), start: audioEditorRegionStartSeconds, end: audioEditorRegionEndSeconds, playhead: audioEditorPlayhead, clipId: audioSelectedClipId };
}

function invalidateEditedPreview(): void {
  if (audioPreviewOverride?.label === "Edited audio preview") {
    previewAudioNode.pause();
    audioPreviewOverride = null;
    updateMediaPreview();
  }
}

function applyAudioOperation(operation: "split" | "keep" | "remove" | "duplicate"): void {
  if (!audioProject || isBusy) return;
  try {
    let next: EditorProject;
    let selectionAfter: [number, number] | undefined;
    let playheadAfter = audioEditorPlayhead;
    if (operation === "split") next = window.audioEditUtils.splitAt(audioProject, audioEditorPlayhead);
    else {
      const [start, end] = readAudioSelection();
      next = operation === "keep" ? window.audioEditUtils.keepSelection(audioProject, start, end)
        : operation === "remove" ? window.audioEditUtils.removeSelection(audioProject, start, end)
        : window.audioEditUtils.duplicateSelection(audioProject, start, end);
      if (operation === "keep") {
        selectionAfter = [0, end - start];
        playheadAfter = Math.max(0, Math.min(audioEditorPlayhead - start, end - start));
      } else if (operation === "remove") {
        selectionAfter = [start, start];
        playheadAfter = start;
      } else {
        selectionAfter = [end, end + end - start];
        playheadAfter = end;
      }
    }
    commitAudioProject(next, operation === "split" ? "Clip split; all audio kept" : operation === "remove" ? "Selection removed; gap closed" : operation === "keep" ? "Selection kept" : "Selection duplicated");
    if (selectionAfter) {
      updateAudioEditorRegion(...selectionAfter);
      setAudioPlayhead(playheadAfter, false);
      scheduleCaptionProjectSave();
    }
  } catch (error) { setAudioEditorError((error as Error).message); }
}

function readNumberInput(control: HTMLInputElement): number {
  if (!control.value.trim() || !control.checkValidity() || !Number.isFinite(control.valueAsNumber)) {
    control.setAttribute("aria-invalid", "true");
    throw new Error(`Check ${control.parentElement?.textContent?.trim() ?? "the number"}. Enter a value within the displayed limits.`);
  }
  control.removeAttribute("aria-invalid");
  return control.valueAsNumber;
}

function commitEffectControls(clipOnly = false, changedControl?: HTMLInputElement): void {
  if (!audioProject || isBusy) return;
  try {
    if (clipOnly) {
      const next = window.audioEditUtils.cloneProject(audioProject);
      const clip = next.clips.find((item) => item.id === audioSelectedClipId);
      if (!clip) return;
      clip.gainDb = readNumberInput(audioClipGain);
      clip.fadeInSeconds = readNumberInput(audioClipFadeIn);
      clip.fadeOutSeconds = readNumberInput(audioClipFadeOut);
      if (changedControl === audioClipFadeIn || changedControl === audioClipFadeOut) {
        delete clip.effectSourceStart;
        delete clip.effectSourceEnd;
        const clipDuration = (clip.sourceEnd - clip.sourceStart) / next.effects.speed;
        if (readNumberInput(changedControl) > clipDuration) throw new Error("A clip fade cannot be longer than the selected clip.");
        clip.fadeInSeconds = Math.min(clip.fadeInSeconds, clipDuration);
        clip.fadeOutSeconds = Math.min(clip.fadeOutSeconds, clipDuration);
      }
      next.revision++;
      commitAudioProject(next, "Clip sound updated");
    } else {
      commitAudioProject(window.audioEditUtils.updateEffects(audioProject, {
        gainDb: readNumberInput(audioEditGain), fadeInSeconds: readNumberInput(audioEditFadeIn), fadeOutSeconds: readNumberInput(audioEditFadeOut),
        speed: readNumberInput(audioEditSpeed), pitchSemitones: readNumberInput(audioEditPitch),
        normalize: audioEditNormalize.checked, noiseReduction: audioEditNoise.checked
      }), "Track sound updated");
    }
  } catch (error) { changedControl?.setAttribute("aria-invalid", "true"); setAudioEditorError((error as Error).message); }
}

async function showAudioPlayback(path: string, label: string, project: EditorProject, time = 0, play = false): Promise<void> {
  audioPreviewOverride = { kind: "audio", mediaPath: path, label, project: window.audioEditUtils.cloneProject(project) };
  updateMediaPreview();
  const url = filePathToFileUrl(path);
  const apply = () => {
    if (previewAudioNode.src !== url) return;
    try { previewAudioNode.currentTime = Math.max(0, Math.min(time, Number.isFinite(previewAudioNode.duration) ? previewAudioNode.duration : time)); } catch { /* Native player still loading. */ }
    if (play) void previewAudioNode.play().catch((error) => setAudioEditorError(`Playback could not start: ${(error as Error).message}`));
  };
  if (previewAudioNode.readyState >= 1) apply();
  else previewAudioNode.addEventListener("loadedmetadata", apply, { once: true });
}

async function runAudioRender(purpose: "preview" | "export"): Promise<void> {
  if (!audioProject || isBusy) return;
  try {
    let project = window.audioEditUtils.cloneProject(audioProject);
    if (purpose === "export" && audioExportScope.value === "selection") {
      const [start, end] = readAudioSelection();
      project = window.audioEditUtils.keepSelection(project, start, end);
    }
    editorCancelRequested = false;
    editorPipelineActive = true;
    setBusy(true);
    startActionStatus("editor", purpose === "preview" ? "Preparing edited preview..." : "Exporting audio...", window.audioEditUtils.getDuration(project));
    const result = await window.videoTools.renderEditedAudio({ project, format: purpose === "preview" ? "wav" : audioEditFormat.value as "wav" | "mp3" | "flac", purpose });
    if (editorCancelRequested) throw new Error(MEDIA_PROCESS_CANCELLED_MESSAGE);
    if (!result) { cancelActionStatus("No audio file was saved", "Save cancelled"); return; }
    if (purpose === "preview") {
      await showAudioPlayback(result.outputPath, "Edited audio preview", project, audioEditorPlayhead, true);
      audioEditorStatus.textContent = "Edited preview ready";
    } else {
      appendLog(`Edited audio saved: ${result.outputPath}`);
      audioEditorStatus.textContent = "Audio saved";
      audioEditorSource.textContent = `Saved: ${result.outputPath}`;
    }
    completeActionStatus();
  } catch (error) {
    const message = (error as Error).message;
    if (editorCancelRequested || isMediaProcessCancellation(message)) cancelActionStatus();
    else { setAudioEditorError(message); failActionStatus(message); }
  } finally {
    editorPipelineActive = false;
    setBusy(false);
  }
}

function addCaptionSet(label: string, sourceKind: "original" | "edited", project: EditorProject, mediaPath: string, segments: CaptionSegment[]): void {
  persistActiveCaptionSet();
  const set: EditorCaptionSet = {
    id: `captions-${Date.now()}-${captionSets.length}`, label, sourceKind,
    project: window.audioEditUtils.cloneProject(project), mediaPath,
    segments: segments.map((segment) => ({ ...segment }))
  };
  captionSets.push(set);
  activeCaptionSetId = set.id;
  captionSegments = set.segments.map((segment) => ({ ...segment }));
  captionRangeAnchorIndex = null;
  captionRangeFocusIndex = null;
  captionRangeComplete = false;
  editingCaptionIndex = null;
  renderCaptionSegments();
  renderCaptionSets();
  scheduleCaptionProjectSave();
}

function renderCaptionSets(): void {
  captionSetSelect.replaceChildren();
  if (!captionSets.length) {
    const option = document.createElement("option");
    option.textContent = "No caption sets yet";
    captionSetSelect.appendChild(option);
  } else {
    if (!activeCaptionSetId) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Choose a saved caption set";
      captionSetSelect.appendChild(option);
    }
    for (const set of captionSets) {
      const option = document.createElement("option");
      option.value = set.id;
      option.textContent = set.label;
      captionSetSelect.appendChild(option);
    }
    captionSetSelect.value = activeCaptionSetId ?? "";
  }
  const set = getActiveCaptionSet();
  let notice = "";
  if (set && audioProject) {
    if (set.project.sourceFingerprint !== audioProject.sourceFingerprint) notice = "These captions belong to another recording. Caption playback uses that recording; your current audio edit is unchanged.";
    else if (!window.audioEditUtils.timelineMatches(set.project, audioProject)) notice = set.sourceKind === "original"
      ? "These captions use original-audio timing. Choose Edited audio to create new captions, or adjust timing to create a separate copy."
      : "These captions use an earlier audio edit. Generate new captions or adjust timing to create a separate copy.";
  }
  captionTimingNotice.textContent = notice;
  captionTimingNotice.hidden = !notice;
  syncAudioEditorButtons();
}

async function playCaptionSet(set: EditorCaptionSet, time = 0): Promise<void> {
  if (isBusy) return;
  let ownsJob = false;
  try {
    if (!(await window.videoTools.knownPathExists(set.mediaPath))) {
      if (isBusy) return;
      editorCancelRequested = false;
      editorPipelineActive = true;
      ownsJob = true;
      setBusy(true);
      startActionStatus("editor", "Restoring caption audio...");
      const result = await window.videoTools.renderEditedAudio({ project: set.project, format: "wav", purpose: "preview" });
      if (editorCancelRequested) throw new Error(MEDIA_PROCESS_CANCELLED_MESSAGE);
      if (!result) throw new Error("Caption audio is unavailable. Reselect the original recording to recover it.");
      set.mediaPath = result.outputPath;
      scheduleCaptionProjectSave();
    }
    if (activeCaptionSetId !== set.id) return;
    await showAudioPlayback(set.mediaPath, `${set.sourceKind === "original" ? "Original" : "Edited"} audio for these captions`, set.project, time);
    if (ownsJob) completeActionStatus();
  } catch (error) {
    const message = (error as Error).message;
    captionTimingNotice.textContent = `Caption playback unavailable: ${message}. Your captions are still kept.`;
    captionTimingNotice.hidden = false;
    if (ownsJob) {
      if (editorCancelRequested || isMediaProcessCancellation(message)) cancelActionStatus(); else failActionStatus(message);
    }
  } finally {
    if (ownsJob) { editorPipelineActive = false; setBusy(false); }
  }
}

async function generateAudioCaptions(): Promise<void> {
  if (!audioProject || !audioAnalysis || isBusy) return;
  persistActiveCaptionSet();
  const project = captionSource === "edited" ? window.audioEditUtils.cloneProject(audioProject) : window.audioEditUtils.createProject(audioAnalysis);
  const sourceKind = captionSource;
  editorCancelRequested = false;
  editorPipelineActive = true;
  captionGenerationPending = true;
  setBusy(true);
  startActionStatus("caption", sourceKind === "edited" ? "Preparing edited audio for captions..." : "Preparing original audio for captions...");
  try {
    const render = await window.videoTools.renderEditedAudio({ project, format: "wav", purpose: "caption" });
    if (editorCancelRequested) throw new Error(MEDIA_PROCESS_CANCELLED_MESSAGE);
    if (!render) throw new Error("Audio preparation did not complete.");
    setActiveActionStage("Generating captions...", render.duration);
    const result = await window.videoTools.runWhisper({ audioPath: render.outputPath, sourcePath: project.sourcePath });
    if (editorCancelRequested) throw new Error(MEDIA_PROCESS_CANCELLED_MESSAGE);
    srtPath = result.srtPath;
    vttPath = result.vttPath;
    captionGenerationPending = false;
    const number = captionSets.filter((set) => set.sourceKind === sourceKind).length + 1;
    addCaptionSet(`${sourceKind === "original" ? "Original audio" : "Edited audio"}  /  captions ${number}`, sourceKind, project, render.outputPath, parseSrtDocument(result.srtText));
    await showAudioPlayback(render.outputPath, `${sourceKind === "original" ? "Original" : "Edited"} audio for these captions`, project);
    setWorkflowSection("captions");
    appendLog("New captions created. Earlier caption sets and manual corrections were kept.");
    completeActionStatus();
  } catch (error) {
    const message = (error as Error).message;
    if (editorCancelRequested || isMediaProcessCancellation(message)) cancelActionStatus("Existing captions and audio edits were kept");
    else { appendLog(`Caption generation failed: ${message}`); appendSetupHintForMissingDependency(message); failActionStatus(message); }
  } finally {
    captionGenerationPending = false;
    editorPipelineActive = false;
    setBusy(false);
    scheduleCaptionProjectSave();
  }
}

function openCaptionRemap(): void {
  const set = getActiveCaptionSet();
  if (!set || !audioProject || isBusy) return;
  persistActiveCaptionSet();
  try {
    const result = window.audioEditUtils.remapCaptions(set.project, audioProject, set.segments);
    pendingRemap = { project: window.audioEditUtils.cloneProject(audioProject), segments: result.segments, warnings: result.warnings };
    captionRemapChanges.replaceChildren();
    const changed = result.changes.filter((change) => change.kind !== "unchanged");
    const review = result.changes.some((change) => change.kind === "review" || change.kind === "removed" || change.kind === "duplicated") || result.warnings.length > 0;
    captionRemapSummary.textContent = `${changed.length} caption ${changed.length === 1 ? "change" : "changes"}. ${result.segments.length} ${result.segments.length === 1 ? "caption" : "captions"} in the new copy.${result.warnings.length ? ` ${result.warnings.join(" ")}` : " Original text corrections will be preserved."}`;
    for (const change of result.changes) {
      const original = set.segments.find((segment) => segment.index === change.originalIndex);
      const row = document.createElement("div");
      row.className = "caption-remap-change";
      row.dataset.review = String(["review", "removed", "duplicated"].includes(change.kind));
      const title = document.createElement("strong");
      title.textContent = `${change.kind === "review" ? "Needs review" : change.kind.charAt(0).toUpperCase() + change.kind.slice(1)}  /  Caption ${change.originalIndex}`;
      const before = document.createElement("p");
      before.textContent = `Before: ${original?.start ?? ""}-${original?.end ?? ""}  /  ${original?.text ?? ""}`;
      const after = document.createElement("p");
      after.textContent = change.outputs.length ? `After: ${change.outputs.map((segment) => `${segment.start}-${segment.end}`).join("; ")}` : "After: outside the kept audio; omitted from this copy only.";
      const note = document.createElement("p");
      note.textContent = change.message;
      row.append(title, before, after, note);
      captionRemapChanges.appendChild(row);
    }
    captionRemapReview.hidden = !review;
    captionRemapCreate.disabled = result.segments.length === 0;
    captionRemapDialog.showModal();
    captionRemapCancel.focus();
  } catch (error) { setAudioEditorError((error as Error).message); setWorkflowSection("editor"); }
}

async function createRemappedCaptionCopy(): Promise<void> {
  if (!pendingRemap || captionRemapCreate.disabled || isBusy) return;
  const pending = pendingRemap;
  captionRemapDialog.close();
  pendingRemap = null;
  editorCancelRequested = false;
  editorPipelineActive = true;
  setBusy(true);
  startActionStatus("editor", "Preparing audio for the caption copy...");
  try {
    const result = await window.videoTools.renderEditedAudio({ project: pending.project, format: "wav", purpose: "preview" });
    if (editorCancelRequested) throw new Error(MEDIA_PROCESS_CANCELLED_MESSAGE);
    if (!result) throw new Error("Audio preparation did not complete.");
    addCaptionSet(`Edited audio  /  adjusted copy ${captionSets.length + 1}`, "edited", pending.project, result.outputPath, pending.segments);
    await showAudioPlayback(result.outputPath, "Edited audio for these captions", pending.project);
    if (pending.warnings.length) {
      captionTimingNotice.textContent = "Adjusted caption copy created. Review captions flagged in the timing preview before saving subtitles.";
      captionTimingNotice.hidden = false;
    }
    completeActionStatus();
  } catch (error) {
    const message = (error as Error).message;
    if (editorCancelRequested || isMediaProcessCancellation(message)) cancelActionStatus(); else failActionStatus(message);
  } finally { editorPipelineActive = false; setBusy(false); captionRemapButton.focus(); }
}

function useCaptionRangeForAudio(): void {
  if (!audioProject || captionRangeAnchorIndex === null) return;
  const set = getActiveCaptionSet();
  if (set && !window.audioEditUtils.timelineMatches(set.project, audioProject)) {
    setAudioEditorError("These captions use a different timeline. Generate captions for this edit or create an adjusted timing copy first.");
    return;
  }
  const anchor = findCaptionSegment(captionRangeAnchorIndex);
  const focus = findCaptionSegment(captionRangeFocusIndex) ?? anchor;
  if (!anchor || !focus) return;
  const start = Math.min(timestampToSeconds(anchor.start) ?? 0, timestampToSeconds(focus.start) ?? 0);
  const end = Math.max(timestampToSeconds(anchor.end) ?? 0, timestampToSeconds(focus.end) ?? 0);
  updateAudioEditorRegion(start, end);
  setAudioPlayhead(start, false);
  setAudioEditorError("");
}

for (const control of [audioEditStart, audioEditEnd]) {
  control.addEventListener("change", () => {
    try { const [start, end] = readAudioSelection(); updateAudioEditorRegion(start, end); setAudioEditorError(""); scheduleCaptionProjectSave(); }
    catch (error) { control.setAttribute("aria-invalid", "true"); setAudioEditorError((error as Error).message); }
  });
}
audioPlayheadInput.addEventListener("change", () => {
  try {
    const time = parseEditorTimestamp(audioPlayheadInput.value);
    if (time > getEditorDuration() + 0.001) throw new Error("The playhead must stay within the track.");
    setAudioPlayhead(time, true);
    setAudioEditorError("");
    scheduleCaptionProjectSave();
  } catch (error) { audioPlayheadInput.setAttribute("aria-invalid", "true"); setAudioEditorError((error as Error).message); }
});
audioWaveformCanvas.addEventListener("pointerdown", (event) => {
  if (isBusy || audioLoadState !== "ready") return;
  audioWaveformCanvas.focus();
  const rect = audioWaveformCanvas.getBoundingClientRect();
  audioPointerAnchor = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * getEditorDuration();
  updateAudioEditorRegion(audioPointerAnchor, audioPointerAnchor);
  setAudioPlayhead(audioPointerAnchor, true);
  audioWaveformCanvas.setPointerCapture(event.pointerId);
});
audioWaveformCanvas.addEventListener("pointermove", (event) => {
  if (audioPointerAnchor === null) return;
  const rect = audioWaveformCanvas.getBoundingClientRect();
  const time = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * getEditorDuration();
  updateAudioEditorRegion(audioPointerAnchor, time);
});
for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
  audioWaveformCanvas.addEventListener(name, () => { audioPointerAnchor = null; scheduleCaptionProjectSave(); });
}
audioWaveformCanvas.addEventListener("keydown", (event) => {
  if (isBusy || audioLoadState !== "ready") return;
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? getEditorDuration() : audioEditorPlayhead + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 1 : 0.1);
  setAudioPlayhead(next, true);
  scheduleCaptionProjectSave();
});
audioZoom.addEventListener("change", drawAudioEditorTimeline);
for (const control of [audioEditGain, audioEditFadeIn, audioEditFadeOut, audioEditSpeed, audioEditPitch, audioEditNormalize, audioEditNoise]) control.addEventListener("change", () => commitEffectControls(false, control));
for (const control of [audioClipGain, audioClipFadeIn, audioClipFadeOut]) control.addEventListener("change", () => commitEffectControls(true, control));
audioSplit.addEventListener("click", () => applyAudioOperation("split"));
audioKeep.addEventListener("click", () => applyAudioOperation("keep"));
audioRemove.addEventListener("click", () => applyAudioOperation("remove"));
audioDuplicate.addEventListener("click", () => applyAudioOperation("duplicate"));
audioUseCaptionRange.addEventListener("click", useCaptionRangeForAudio);
audioEditorRetry.addEventListener("click", () => { void ensureAudioEditorSource(true); });
audioPreviewEdited.addEventListener("click", () => { void runAudioRender("preview"); });
audioPlayOriginal.addEventListener("click", () => {
  if (audioAnalysis) void showAudioPlayback(audioAnalysis.previewPath, "Original audio", window.audioEditUtils.createProject(audioAnalysis), 0, true);
});
audioEditExportButton.addEventListener("click", () => { void runAudioRender("export"); });
audioExportScope.addEventListener("change", syncAudioEditorButtons);
audioEditResetButton.addEventListener("click", () => {
  if (!audioAnalysis || !audioProject || isBusy) return;
  const reset = window.audioEditUtils.createProject(audioAnalysis);
  reset.revision = audioProject.revision + 1;
  commitAudioProject(reset, "Audio edits reset  /  Undo is available");
  updateAudioEditorRegion(0, getEditorDuration());
});
function restoreAudioHistory(redo: boolean): void {
  if (!audioProject || isBusy) return;
  const from = redo ? audioRedoHistory : audioUndoHistory;
  const to = redo ? audioUndoHistory : audioRedoHistory;
  const next = from.pop();
  if (!next) return;
  to.push(captureEditorHistory());
  audioProject = next.project;
  audioSelectedClipId = next.clipId;
  invalidateEditedPreview();
  updateAudioEditorRegion(next.start, next.end);
  setAudioPlayhead(next.playhead, false);
  renderAudioEditor();
  renderCaptionSets();
  setAudioEditorError("");
  audioEditorStatus.textContent = redo ? "Edit restored" : "Edit undone";
  scheduleCaptionProjectSave();
}
audioEditUndoButton.addEventListener("click", () => restoreAudioHistory(false));
audioEditRedoButton.addEventListener("click", () => restoreAudioHistory(true));
for (const radio of [captionSourceOriginal, captionSourceEdited]) radio.addEventListener("change", () => {
  captionSource = captionSourceEdited.checked ? "edited" : "original";
  syncAudioEditorButtons();
  scheduleCaptionProjectSave();
});
captionSetSelect.addEventListener("change", () => {
  persistActiveCaptionSet();
  activeCaptionSetId = captionSetSelect.value || null;
  const set = getActiveCaptionSet();
  setCaptionSegments(set?.segments.map((segment) => ({ ...segment })) ?? []);
  renderCaptionSets();
  if (set) void playCaptionSet(set);
});
captionRemapButton.addEventListener("click", openCaptionRemap);
captionRemapCancel.addEventListener("click", () => { pendingRemap = null; captionRemapDialog.close(); captionRemapButton.focus(); });
captionRemapDialog.addEventListener("cancel", () => { pendingRemap = null; });
captionRemapDialog.addEventListener("close", () => captionRemapButton.focus());
captionRemapCreate.addEventListener("click", () => { void createRemappedCaptionCopy(); });
previewAudioNode.addEventListener("error", () => {
  if (audioPreviewOverride) setAudioEditorError("This audio preview could not be played. Prepare the preview again or check that the recording is still available.");
});
const audioEditorObserver = new ResizeObserver((entries) => {
  const width = entries[0]?.contentRect.width ?? 0;
  if (width === audioObservedWidth) return;
  audioObservedWidth = width;
  if (audioTimelineFrame !== null) return;
  audioTimelineFrame = window.requestAnimationFrame(() => {
    audioTimelineFrame = null;
    drawAudioEditorTimeline();
  });
});
audioEditorObserver.observe(audioWaveformScroll);
renderAudioEditor();
