export interface TimestampUtils {
  parseTimestampSeconds: (value: string) => number | null;
  normalizeCaptionTime: (value: string) => string;
  formatSrtTimestamp: (timestamp: string) => string;
  formatVttTimestamp: (timestamp: string) => string;
}

export const timestampUtils: TimestampUtils = (() => {
  const parseTimestampSeconds = (value: string): number | null => {
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

    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      !Number.isFinite(seconds) ||
      !Number.isFinite(fraction) ||
      minutes >= 60 ||
      seconds >= 60
    ) {
      return null;
    }

    return hours * 3600 + minutes * 60 + seconds + fraction;
  };

  return {
    parseTimestampSeconds,
    normalizeCaptionTime: (value: string) => value.replace(",", "."),
    formatSrtTimestamp: (timestamp: string) => timestamp.replace(".", ","),
    formatVttTimestamp: (timestamp: string) => timestamp.replace(",", ".")
  };
})();

export const parseTimestampSeconds = timestampUtils.parseTimestampSeconds;
export const normalizeCaptionTime = timestampUtils.normalizeCaptionTime;
export const formatSrtTimestamp = timestampUtils.formatSrtTimestamp;
export const formatVttTimestamp = timestampUtils.formatVttTimestamp;

Object.assign(globalThis, { timestampUtils });
