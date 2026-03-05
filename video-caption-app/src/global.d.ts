import type { VideoToolsApi } from "./preload";

declare global {
  interface Window {
    videoTools: VideoToolsApi;
  }
}

export {};
