import type { VideoToolsApi } from "./preload";
import type { SubtitleUtils } from "./subtitle-utils";
import type { TimestampUtils } from "./timestamp-utils";

declare global {
  interface Window {
    videoTools: VideoToolsApi;
    subtitleUtils: SubtitleUtils;
    timestampUtils: TimestampUtils;
  }
}

export {};
