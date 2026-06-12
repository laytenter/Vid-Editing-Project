import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  CaptionProjectSession,
  ClipVideoRequest,
  ClipVideoResult,
  PersistedSettings,
  ExtractAudioResult,
  RunWhisperRequest,
  RunWhisperResult,
  SaveFileAsRequest,
  SaveTextAsRequest,
  ToolLogEntry
} from "./types";

const videoToolsApi = {
  getSettings: (): Promise<AppSettings> => {
    return ipcRenderer.invoke("settings:get");
  },
  setSettings: (partial: Partial<PersistedSettings>): Promise<AppSettings> => {
    return ipcRenderer.invoke("settings:set", partial);
  },
  getCaptionProject: (): Promise<CaptionProjectSession | null> => {
    return ipcRenderer.invoke("caption-project:get");
  },
  setCaptionProject: (session: CaptionProjectSession): Promise<void> => {
    return ipcRenderer.invoke("caption-project:set", session);
  },
  cancelActiveMediaProcess: (): Promise<boolean> => {
    return ipcRenderer.invoke("media-process:cancel");
  },
  openPath: (targetPath: string): Promise<boolean> => {
    return ipcRenderer.invoke("open-path", targetPath);
  },
  pathExists: (targetPath: string): Promise<boolean> => {
    return ipcRenderer.invoke("path-exists", targetPath);
  },
  openTempFolder: (): Promise<boolean> => {
    return ipcRenderer.invoke("open-temp-folder");
  },
  selectVideo: (): Promise<string | null> => {
    return ipcRenderer.invoke("select-video");
  },
  selectAudio: (): Promise<string | null> => {
    return ipcRenderer.invoke("select-audio");
  },
  extractAudio: (videoPath: string): Promise<ExtractAudioResult> => {
    return ipcRenderer.invoke("extract-audio", videoPath);
  },
  runWhisper: (request: RunWhisperRequest): Promise<RunWhisperResult> => {
    return ipcRenderer.invoke("run-whisper", request);
  },
  clipVideo: (request: ClipVideoRequest): Promise<ClipVideoResult> => {
    return ipcRenderer.invoke("clip-video", request);
  },
  onMenuOpenVideo: (callback: (videoPath: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, videoPath: unknown) => {
      if (typeof videoPath === "string" && videoPath.trim() !== "") {
        callback(videoPath);
      }
    };

    ipcRenderer.on("menu:open-video", listener);

    return () => {
      ipcRenderer.removeListener("menu:open-video", listener);
    };
  },
  onSettingsChanged: (callback: (settings: AppSettings) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: AppSettings) => {
      callback(settings);
    };

    ipcRenderer.on("settings:changed", listener);

    return () => {
      ipcRenderer.removeListener("settings:changed", listener);
    };
  },
  saveFileAs: (request: SaveFileAsRequest): Promise<string | null> => {
    return ipcRenderer.invoke("save-file-as", request);
  },
  saveTextAs: (request: SaveTextAsRequest): Promise<string | null> => {
    return ipcRenderer.invoke("save-text-as", request);
  },
  onToolLog: (callback: (entry: ToolLogEntry) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, entry: ToolLogEntry) => {
      callback(entry);
    };

    ipcRenderer.on("tools:log", listener);

    return () => {
      ipcRenderer.removeListener("tools:log", listener);
    };
  }
};

contextBridge.exposeInMainWorld("videoTools", videoToolsApi);

export type VideoToolsApi = typeof videoToolsApi;




