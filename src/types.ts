export interface ToolLogEntry {
  tool: "ffmpeg" | "whisper";
  stream: "stdout" | "stderr";
  message: string;
}

export interface PersistedSettings {
  themeMode: "system" | "dark" | "light" | "retro";
}

export type AudioSourceKind = "uploaded" | "extracted" | null;

export interface AppSettings extends PersistedSettings {
  documentsDir: string;
}

export interface CaptionSegment {
  index: number;
  start: string;
  end: string;
  text: string;
  edited?: boolean;
}

export interface ExtractAudioResult {
  audioPath: string;
}

export interface RunWhisperRequest {
  audioPath: string;
  sourcePath?: string | null;
}

export interface RunWhisperResult {
  srtPath: string;
  vttPath: string;
  modelPath: string;
  srtText: string;
}

export type ClipMode = "copy" | "encode";

export interface QueuedClip {
  id: number;
  videoPath: string;
  startTime: string;
  endTime: string;
  mode: ClipMode;
  preview: string;
}

export interface CaptionProjectSession {
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
  audioProject?: AudioEditProject;
  captionSource?: "original" | "edited";
  captionSets?: AudioCaptionSet[];
  activeCaptionSetId?: string | null;
  audioSelection?: { start: number; end: number };
  audioPlayhead?: number;
}

export type AudioExportFormat = "wav" | "mp3" | "flac";

/** Fade lengths use final playback seconds, including the chosen speed. */
export interface AudioEffects {
  gainDb: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  normalize: boolean;
  noiseReduction: boolean;
  speed: number;
  pitchSemitones: number;
}

/** Reusable source references; array order supplies the single-track timeline. */
export interface AudioClip {
  id: string;
  trackId: string;
  sourceStart: number;
  sourceEnd: number;
  /** Original source envelope retained when a faded clip is split or trimmed. */
  effectSourceStart?: number;
  effectSourceEnd?: number;
  gainDb: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

export interface AudioEditProject {
  version: 1;
  sourcePath: string;
  sourceFingerprint: string;
  duration: number;
  sampleRate: number;
  channels: number;
  clips: AudioClip[];
  effects: AudioEffects;
  revision: number;
}

export interface AudioAnalysis {
  sourcePath: string;
  sourceFingerprint: string;
  duration: number;
  sampleRate: number;
  channels: number;
  peaks: number[];
  previewPath: string;
}

export interface AudioRenderRequest {
  project: AudioEditProject;
  format: AudioExportFormat;
  purpose: "preview" | "export" | "caption";
}

export interface AudioRenderResult {
  outputPath: string;
  format: AudioExportFormat;
  duration: number;
}

export interface AudioCaptionSet {
  id: string;
  label: string;
  sourceKind: "original" | "edited";
  /** Immutable snapshot of the exact timeline used for this caption set. */
  project: AudioEditProject;
  mediaPath: string;
  segments: CaptionSegment[];
}

export interface AudioEditRequest {
  sourcePath: string;
  outputPath: string;
  startTime: string;
  endTime: string;
  gainDb: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  normalize: boolean;
  noiseReduction: boolean;
  speed: number;
  pitchSemitones: number;
  format: AudioExportFormat;
}

export interface AudioEditResult {
  outputPath: string;
  format: AudioExportFormat;
}

export interface ClipVideoRequest {
  videoPath: string;
  startTime: string;
  endTime: string;
  outputPath: string;
  mode: ClipMode;
}

export interface ClipVideoResult {
  outputPath: string;
  mode: ClipMode;
}

export interface SaveFileAsRequest {
  sourcePath: string;
  defaultFileName?: string;
  mediaPath?: string | null;
}

export interface SaveTextAsRequest {
  content: string;
  defaultFileName: string;
  mediaPath?: string | null;
  extension: "srt" | "vtt";
}
