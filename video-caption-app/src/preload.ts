import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  ClipVideoRequest,
  ClipVideoResult,
  PersistedSettings,
  ExtractAudioResult,
  RunWhisperRequest,
  RunWhisperResult,
  SaveFileAsRequest,
  ToolLogEntry
} from "./types";

const videoToolsApi = {
  getSettings: (): Promise<AppSettings> => {
    return ipcRenderer.invoke("settings:get");
  },
  setSettings: (partial: Partial<PersistedSettings>): Promise<AppSettings> => {
    return ipcRenderer.invoke("settings:set", partial);
  },
  chooseOutputFolder: (): Promise<string | null> => {
    return ipcRenderer.invoke("choose-output-folder");
  },
  openPath: (targetPath: string): Promise<boolean> => {
    return ipcRenderer.invoke("open-path", targetPath);
  },
  openTempFolder: (): Promise<boolean> => {
    return ipcRenderer.invoke("open-temp-folder");
  },
  selectVideo: (): Promise<string | null> => {
    return ipcRenderer.invoke("select-video");
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
  saveFileAs: (request: SaveFileAsRequest): Promise<string | null> => {
    return ipcRenderer.invoke("save-file-as", request);
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




