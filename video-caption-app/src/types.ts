export interface ToolLogEntry {
  tool: "ffmpeg" | "whisper";
  stream: "stdout" | "stderr";
  message: string;
}

export interface PersistedSettings {
  outputDir: string | null;
  saveWavToOutputDir: boolean;
  saveCaptionsToOutputDir: boolean;
}

export interface AppSettings extends PersistedSettings {
  documentsDir: string;
}

export interface ExtractAudioResult {
  audioPath: string;
}

export interface RunWhisperRequest {
  audioPath: string;
  videoPath?: string | null;
}

export interface RunWhisperResult {
  srtPath: string;
  vttPath: string;
  modelPath: string;
}

export type ClipMode = "copy" | "encode";

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
  videoPath?: string | null;
}
