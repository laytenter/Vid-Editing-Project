import type { TimestampUtils } from "./timestamp-utils";
import type { CaptionSegment } from "./types";

export interface SubtitleUtils {
  parseSrtSegments: (srtText: string) => CaptionSegment[];
  regenerateSrtFromSegments: (segments: CaptionSegment[]) => string;
  regenerateVttFromSegments: (segments: CaptionSegment[]) => string;
}

export const subtitleUtils: SubtitleUtils = (() => {
  const timestamps = (globalThis as typeof globalThis & { timestampUtils?: TimestampUtils }).timestampUtils;
  if (!timestamps) {
    throw new Error("timestampUtils must be loaded before subtitleUtils");
  }

  const parseSrtSegments = (srtText: string): CaptionSegment[] => {
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
        start: timestamps.normalizeCaptionTime(timingMatch[1]),
        end: timestamps.normalizeCaptionTime(timingMatch[2]),
        text: text || "(no text)"
      });
    }

    return segments;
  };

  const regenerateSrtFromSegments = (segments: CaptionSegment[]): string => {
    if (segments.length === 0) {
      return "";
    }

    return `${segments
      .map((segment, index) => {
        const text = segment.text.trim() || "(no text)";
        return `${index + 1}\n${timestamps.formatSrtTimestamp(segment.start)} --> ${timestamps.formatSrtTimestamp(segment.end)}\n${text}`;
      })
      .join("\n\n")}\n`;
  };

  const regenerateVttFromSegments = (segments: CaptionSegment[]): string => {
    if (segments.length === 0) {
      return "WEBVTT\n";
    }

    return `WEBVTT\n\n${segments
      .map((segment) => {
        const text = segment.text.trim() || "(no text)";
        return `${timestamps.formatVttTimestamp(segment.start)} --> ${timestamps.formatVttTimestamp(segment.end)}\n${text}`;
      })
      .join("\n\n")}\n`;
  };

  return {
    parseSrtSegments,
    regenerateSrtFromSegments,
    regenerateVttFromSegments
  };
})();

export const parseSrtSegments = subtitleUtils.parseSrtSegments;
export const regenerateSrtFromSegments = subtitleUtils.regenerateSrtFromSegments;
export const regenerateVttFromSegments = subtitleUtils.regenerateVttFromSegments;

Object.assign(globalThis, { subtitleUtils });
