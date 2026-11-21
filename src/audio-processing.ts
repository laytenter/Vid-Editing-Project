import type { AudioClip, AudioEditProject, AudioExportFormat } from "./types";

export interface AudioMetadata {
  duration: number;
  sampleRate: number;
  channels: number;
  streamIndex: number;
}

export interface LoudnessMeasurement {
  input_i: number;
  input_tp: number;
  input_lra: number;
  input_thresh: number;
  target_offset: number;
}

/** Only the first audio stream is supported by the first single-track editor. */
export function parseAudioMetadata(text: string): AudioMetadata {
  const value = JSON.parse(text) as { streams?: Array<Record<string, unknown>>; format?: { duration?: unknown } };
  const stream = value.streams?.[0];
  const duration = Number(stream?.duration ?? value.format?.duration);
  const sampleRate = Number(stream?.sample_rate);
  const channels = Number(stream?.channels);
  const streamIndex = Number(stream?.index);
  if (!stream || !Number.isFinite(duration) || duration <= 0 || duration > 86400 ||
      !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 ||
      !Number.isInteger(channels) || channels < 1 || channels > 8 ||
      !Number.isInteger(streamIndex) || streamIndex < 0 || streamIndex > 1024) {
    throw new Error("This file has no supported audio stream, or its audio metadata is invalid (maximum length: 24 hours).");
  }
  return { duration, sampleRate, channels, streamIndex };
}

export function editedDuration(project: AudioEditProject): number {
  return project.clips.reduce((sum, clip) => sum + clip.sourceEnd - clip.sourceStart, 0) / project.effects.speed;
}

export function parseLoudnessMeasurement(text: string): LoudnessMeasurement | null {
  const matches = text.match(/\{[^{}]*"input_i"[^{}]*\}/g);
  if (!matches?.length) return null;
  const parsed = JSON.parse(matches[matches.length - 1]) as Record<string, unknown>;
  const measurement = Object.fromEntries(["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"]
    .map((key) => [key, Number(parsed[key])])) as unknown as LoudnessMeasurement;
  return Object.values(measurement).every(Number.isFinite) ? measurement : null;
}

/** Times are source seconds for trim and final playback seconds for fades. */
export function buildAudioFilterGraph(project: AudioEditProject, streamIndex: number,
  normalization: LoudnessMeasurement | "measure" | null = null): string {
  if (!Number.isInteger(streamIndex) || streamIndex < 0) throw new Error("Invalid audio stream");
  // A split with no audio change must not restart stateful tempo/pitch filters.
  // Keep model clips independent; coalesce compatible neighbours only for DSP.
  const clips: AudioClip[] = [];
  for (const clip of project.clips) {
    const previous = clips[clips.length - 1];
    const hasFades = clip.fadeInSeconds > 0 || clip.fadeOutSeconds > 0;
    if (previous && Math.abs(previous.sourceEnd - clip.sourceStart) < 1e-8 && previous.gainDb === clip.gainDb &&
        previous.fadeInSeconds === clip.fadeInSeconds && previous.fadeOutSeconds === clip.fadeOutSeconds &&
        (!hasFades || ((previous.effectSourceStart ?? previous.sourceStart) === (clip.effectSourceStart ?? clip.sourceStart) &&
          (previous.effectSourceEnd ?? previous.sourceEnd) === (clip.effectSourceEnd ?? clip.sourceEnd)))) {
      previous.sourceEnd = clip.sourceEnd;
    } else clips.push({ ...clip });
  }
  const count = clips.length;
  if (!count) throw new Error("Add an audio clip before rendering");
  const parts: string[] = [];
  if (count > 1) parts.push(`[0:${streamIndex}]asplit=${count}${clips.map((_, i) => `[src${i}]`).join("")}`);
  clips.forEach((clip, index) => {
    const envelopeStart = clip.effectSourceStart ?? clip.sourceStart;
    const envelopeEnd = clip.effectSourceEnd ?? clip.sourceEnd;
    const filters = [`atrim=start=${envelopeStart}:end=${envelopeEnd}`, "asetpts=PTS-STARTPTS"];
    if (clip.gainDb !== 0) filters.push(`volume=${clip.gainDb}dB`);
    const duration = envelopeEnd - envelopeStart;
    // Clip fades are specified in final seconds, then expressed in source time.
    // Tempo/pitch run once on the joined signal to avoid per-clip latency drift.
    const fadeIn = clip.fadeInSeconds * project.effects.speed;
    const fadeOut = clip.fadeOutSeconds * project.effects.speed;
    if (fadeIn > 0) filters.push(`afade=t=in:d=${fadeIn}`);
    if (fadeOut > 0) filters.push(`afade=t=out:st=${Math.max(0, duration - fadeOut)}:d=${fadeOut}`);
    if (envelopeStart !== clip.sourceStart || envelopeEnd !== clip.sourceEnd) {
      filters.push(`atrim=start=${clip.sourceStart - envelopeStart}:end=${clip.sourceEnd - envelopeStart}`, "asetpts=PTS-STARTPTS");
    }
    parts.push(`${count > 1 ? `[src${index}]` : `[0:${streamIndex}]`}${filters.join(",")}[clip${index}]`);
  });
  const joined = count > 1 ? "joined" : "clip0";
  if (count > 1) parts.push(`${clips.map((_, i) => `[clip${i}]`).join("")}concat=n=${count}:v=0:a=1[joined]`);
  const master: string[] = [];
  if (project.effects.speed !== 1) master.push(`atempo=${project.effects.speed}`);
  if (project.effects.pitchSemitones !== 0) master.push(`rubberband=pitch=${2 ** (project.effects.pitchSemitones / 12)}:tempo=1`);
  if (project.effects.noiseReduction) master.push("afftdn=nf=-25");
  if (project.effects.gainDb !== 0) master.push(`volume=${project.effects.gainDb}dB`);
  if (normalization === "measure") {
    master.push("loudnorm=I=-16:LRA=11:TP=-1.5:print_format=json");
  } else if (normalization) {
    master.push(`loudnorm=I=-16:LRA=11:TP=-1.5:measured_I=${normalization.input_i}:measured_TP=${normalization.input_tp}:measured_LRA=${normalization.input_lra}:measured_thresh=${normalization.input_thresh}:offset=${normalization.target_offset}:linear=true`);
  }
  // Master fades follow normalization, so normalization cannot raise quiet fade tails.
  if (normalization !== "measure") {
    if (project.effects.fadeInSeconds > 0) master.push(`afade=t=in:d=${project.effects.fadeInSeconds}`);
    if (project.effects.fadeOutSeconds > 0) master.push(`afade=t=out:st=${Math.max(0, editedDuration(project) - project.effects.fadeOutSeconds)}:d=${project.effects.fadeOutSeconds}`);
  }
  master.push(`aresample=${project.sampleRate}`, "asetpts=PTS-STARTPTS");
  parts.push(`[${joined}]${master.join(",")}[out]`);
  return parts.join(";");
}

export function audioOutputArguments(format: AudioExportFormat, sampleRate: number, channels: number): string[] {
  if (!["wav", "mp3", "flac"].includes(format)) throw new Error("Unsupported audio format");
  if (format === "mp3" && (channels > 2 || ![8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000].includes(sampleRate))) {
    throw new Error("MP3 supports mono/stereo up to 48 kHz. Choose WAV or FLAC to keep this recording's audio quality.");
  }
  return ["-ar", String(sampleRate), "-ac", String(channels),
    ...(format === "wav" ? ["-c:a", "pcm_s24le", "-rf64", "auto"] : format === "flac" ? ["-c:a", "flac", "-sample_fmt", "s32"] : ["-c:a", "libmp3lame", "-q:a", "2"])];
}

/** Streaming mono float samples -> bounded peak array, including chunks split mid-sample. */
export class PeakAccumulator {
  private readonly peaks: number[];
  private sampleIndex = 0;
  private remainder = Buffer.alloc(0);
  constructor(private readonly duration: number, private readonly sampleRate = 8000, bins = 4096) {
    this.peaks = new Array(bins).fill(0) as number[];
  }
  push(chunk: Buffer): void {
    const data = this.remainder.length ? Buffer.concat([this.remainder, chunk]) : chunk;
    const usable = data.length - data.length % 4;
    for (let offset = 0; offset < usable; offset += 4) {
      const value = data.readFloatLE(offset);
      const bin = Math.min(this.peaks.length - 1, Math.floor(this.sampleIndex++ / (this.duration * this.sampleRate) * this.peaks.length));
      if (Number.isFinite(value)) this.peaks[bin] = Math.max(this.peaks[bin], Math.min(1, Math.abs(value)));
    }
    this.remainder = Buffer.from(data.subarray(usable));
  }
  finish(): number[] {
    if (!this.sampleIndex) throw new Error("The recording contains no decoded audio samples");
    return this.peaks;
  }
}
