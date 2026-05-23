export interface ToolLogEntry {
  tool: "ffmpeg" | "whisper";
  stream: "stdout" | "stderr";
  message: string;
}

export interface PersistedSettings {
  themeMode: "system" | "dark" | "light";
}

export interface AppSettings extends PersistedSettings {
  documentsDir: string;
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
