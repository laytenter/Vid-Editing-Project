import type { AudioAnalysis, AudioClip, AudioEditProject, AudioEffects, CaptionSegment } from "./types";

export interface AudioTimelineClip {
  clipId: string;
  sourceStart: number;
  sourceEnd: number;
  start: number;
  end: number;
}

export interface CaptionTimingChange {
  originalIndex: number;
  kind: "unchanged" | "moved" | "removed" | "duplicated" | "review";
  outputs: CaptionSegment[];
  message: string;
}

export interface CaptionRemapResult {
  segments: CaptionSegment[];
  changes: CaptionTimingChange[];
  warnings: string[];
}

export interface AudioEditUtils {
  defaultEffects: () => AudioEffects;
  createProject: (analysis: AudioAnalysis) => AudioEditProject;
  cloneProject: (project: AudioEditProject) => AudioEditProject;
  getDuration: (project: AudioEditProject) => number;
  validateProject: (input: unknown) => AudioEditProject;
  getTimeline: (project: AudioEditProject) => AudioTimelineClip[];
  splitAt: (project: AudioEditProject, time: number) => AudioEditProject;
  keepSelection: (project: AudioEditProject, start: number, end: number) => AudioEditProject;
  removeSelection: (project: AudioEditProject, start: number, end: number) => AudioEditProject;
  duplicateSelection: (project: AudioEditProject, start: number, end: number) => AudioEditProject;
  updateEffects: (project: AudioEditProject, effects: Partial<AudioEffects>) => AudioEditProject;
  timelineMatches: (from: AudioEditProject, to: AudioEditProject) => boolean;
  remapCaptions: (from: AudioEditProject, to: AudioEditProject, segments: CaptionSegment[]) => CaptionRemapResult;
}

/** Pure, immutable timeline operations shared by the renderer and main process.
 * There are intentionally no runtime imports: this file also runs as a browser script.
 */
export const audioEditUtils: AudioEditUtils = (() => {
  const EPSILON = 1e-7;
  const MAX_CLIPS = 1000;
  const MAX_DURATION = 24 * 60 * 60;
  const defaultEffects = (): AudioEffects => ({
    gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0,
    normalize: false, noiseReduction: false, speed: 1, pitchSemitones: 0
  });
  const cloneProject = (project: AudioEditProject): AudioEditProject => ({
    ...project, effects: { ...project.effects }, clips: project.clips.map((clip) => ({ ...clip }))
  });
  const getDuration = (project: AudioEditProject): number =>
    project.clips.reduce((total, clip) => total + (clip.sourceEnd - clip.sourceStart) / project.effects.speed, 0);
  const record = (value: unknown, name: string): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object.`);
    return value as Record<string, unknown>;
  };
  const finite = (value: unknown, name: string, min: number, max: number, integer = false): number => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      throw new Error(`${name} must be ${integer ? "a whole number" : "a number"} from ${min} to ${max}.`);
    }
    return value;
  };
  const text = (value: unknown, name: string, max = 512): string => {
    if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\0")) throw new Error(`${name} is missing or invalid.`);
    return value;
  };
  const boolean = (value: unknown, name: string): boolean => {
    if (typeof value !== "boolean") throw new Error(`${name} must be true or false.`);
    return value;
  };
  const validateProject = (input: unknown): AudioEditProject => {
    const project = record(input, "Audio project");
    if (project.version !== 1) throw new Error("This audio project version is not supported.");
    const duration = finite(project.duration, "Source duration", Number.EPSILON, MAX_DURATION);
    const data = record(project.effects, "Audio effects");
    const effects: AudioEffects = {
      gainDb: finite(data.gainDb, "Gain", -60, 24),
      fadeInSeconds: finite(data.fadeInSeconds, "Fade in", 0, MAX_DURATION),
      fadeOutSeconds: finite(data.fadeOutSeconds, "Fade out", 0, MAX_DURATION),
      normalize: boolean(data.normalize, "Normalize"),
      noiseReduction: boolean(data.noiseReduction, "Noise reduction"),
      speed: finite(data.speed, "Speed", 0.5, 2),
      pitchSemitones: finite(data.pitchSemitones, "Pitch", -12, 12)
    };
    if (!Array.isArray(project.clips) || !project.clips.length || project.clips.length > MAX_CLIPS) {
      throw new Error(`The edit must contain 1 to ${MAX_CLIPS} clips.`);
    }
    const ids = new Set<string>();
    const clips: AudioClip[] = project.clips.map((value, index) => {
      const clip = record(value, `Clip ${index + 1}`);
      const id = text(clip.id, "Clip ID", 128);
      if (ids.has(id)) throw new Error("Clip IDs must be unique.");
      ids.add(id);
      const trackId = text(clip.trackId, "Track ID", 128);
      if (index > 0 && trackId !== (project.clips as Array<Record<string, unknown>>)[0].trackId) throw new Error("This editor currently supports one track.");
      const sourceStart = finite(clip.sourceStart, "Clip start", 0, duration);
      const sourceEnd = finite(clip.sourceEnd, "Clip end", 0, duration);
      if (sourceEnd - sourceStart <= EPSILON) throw new Error("Every clip must end after it starts.");
      const hasEnvelope = clip.effectSourceStart !== undefined || clip.effectSourceEnd !== undefined;
      const effectSourceStart = hasEnvelope ? finite(clip.effectSourceStart, "Clip effect start", 0, sourceStart) : sourceStart;
      const effectSourceEnd = hasEnvelope ? finite(clip.effectSourceEnd, "Clip effect end", sourceEnd, duration) : sourceEnd;
      const envelopeDuration = (effectSourceEnd - effectSourceStart) / effects.speed;
      return {
        id, trackId, sourceStart, sourceEnd,
        ...(hasEnvelope ? { effectSourceStart, effectSourceEnd } : {}),
        gainDb: finite(clip.gainDb, "Clip gain", -60, 24),
        fadeInSeconds: finite(clip.fadeInSeconds, "Clip fade in", 0, envelopeDuration + EPSILON),
        fadeOutSeconds: finite(clip.fadeOutSeconds, "Clip fade out", 0, envelopeDuration + EPSILON)
      };
    });
    const result: AudioEditProject = {
      version: 1,
      sourcePath: text(project.sourcePath, "Audio source", 32768),
      sourceFingerprint: text(project.sourceFingerprint, "Audio source identity"),
      duration,
      sampleRate: finite(project.sampleRate, "Sample rate", 8000, 192000, true),
      channels: finite(project.channels, "Channel count", 1, 8, true),
      clips, effects,
      revision: finite(project.revision, "Edit revision", 0, Number.MAX_SAFE_INTEGER - 1, true)
    };
    const editedDuration = getDuration(result);
    if (editedDuration > MAX_DURATION) throw new Error("The edited audio exceeds the 24-hour duration limit.");
    if (effects.fadeInSeconds > editedDuration + EPSILON || effects.fadeOutSeconds > editedDuration + EPSILON) {
      throw new Error("Fade lengths cannot exceed the edited audio duration.");
    }
    return result;
  };
  const createProject = (analysis: AudioAnalysis): AudioEditProject => validateProject({
    version: 1, sourcePath: analysis.sourcePath, sourceFingerprint: analysis.sourceFingerprint,
    duration: analysis.duration, sampleRate: analysis.sampleRate, channels: analysis.channels,
    clips: [{ id: "clip-1", trackId: "track-1", sourceStart: 0, sourceEnd: analysis.duration, gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0 }],
    effects: defaultEffects(), revision: 0
  });
  const getTimeline = (project: AudioEditProject): AudioTimelineClip[] => {
    let position = 0;
    return project.clips.map((clip) => {
      const start = position;
      position += (clip.sourceEnd - clip.sourceStart) / project.effects.speed;
      return { clipId: clip.id, sourceStart: clip.sourceStart, sourceEnd: clip.sourceEnd, start, end: position };
    });
  };
  const validateRange = (project: AudioEditProject, start: number, end: number): [number, number] => {
    const duration = getDuration(project);
    finite(start, "Selection start", 0, duration + EPSILON);
    finite(end, "Selection end", 0, duration + EPSILON);
    if (end - start <= EPSILON) throw new Error("Select a section with an end after its start.");
    return [Math.min(start, duration), Math.min(end, duration)];
  };
  const nextId = (project: AudioEditProject): (() => string) => {
    const ids = new Set(project.clips.map((clip) => clip.id));
    let count = 0;
    return () => {
      let candidate: string;
      do { candidate = `clip-${project.revision + 1}-${++count}`; } while (ids.has(candidate));
      ids.add(candidate);
      return candidate;
    };
  };
  const slice = (project: AudioEditProject, start: number, end: number, id: () => string, copy = false): AudioClip[] => {
    const timeline = getTimeline(project);
    return timeline.flatMap((entry, index) => {
      const left = Math.max(start, entry.start);
      const right = Math.min(end, entry.end);
      if (right - left <= EPSILON) return [];
      const original = project.clips[index];
      const whole = Math.abs(left - entry.start) < EPSILON && Math.abs(right - entry.end) < EPSILON;
      // A cut must retain the original fade envelope rather than restart a fade
      // on each piece. Processing renders this envelope, then selects the piece.
      const envelope = !whole && (original.fadeInSeconds > 0 || original.fadeOutSeconds > 0) ? {
        effectSourceStart: original.effectSourceStart ?? original.sourceStart,
        effectSourceEnd: original.effectSourceEnd ?? original.sourceEnd
      } : {};
      return [{
        ...original,
        ...envelope,
        id: whole && !copy ? original.id : id(),
        sourceStart: Math.min(original.sourceEnd, original.sourceStart + (left - entry.start) * project.effects.speed),
        sourceEnd: Math.min(original.sourceEnd, original.sourceStart + (right - entry.start) * project.effects.speed)
      }];
    });
  };
  const commit = (project: AudioEditProject, clips: AudioClip[]): AudioEditProject => {
    const result = cloneProject(project);
    result.clips = clips;
    result.revision++;
    const duration = getDuration(result);
    result.effects.fadeInSeconds = Math.min(result.effects.fadeInSeconds, duration);
    result.effects.fadeOutSeconds = Math.min(result.effects.fadeOutSeconds, duration);
    return validateProject(result);
  };
  const splitAt = (project: AudioEditProject, time: number): AudioEditProject => {
    finite(time, "Playhead", 0, getDuration(project));
    const timeline = getTimeline(project);
    if (!timeline.some((entry) => time > entry.start + EPSILON && time < entry.end - EPSILON)) return cloneProject(project);
    const id = nextId(project);
    return commit(project, [...slice(project, 0, time, id), ...slice(project, time, getDuration(project), id)]);
  };
  const keepSelection = (project: AudioEditProject, start: number, end: number): AudioEditProject => {
    [start, end] = validateRange(project, start, end);
    if (start < EPSILON && Math.abs(end - getDuration(project)) < EPSILON) return cloneProject(project);
    return commit(project, slice(project, start, end, nextId(project)));
  };
  const removeSelection = (project: AudioEditProject, start: number, end: number): AudioEditProject => {
    [start, end] = validateRange(project, start, end);
    if (end - start >= getDuration(project) - EPSILON) throw new Error("Keep some audio in the edit, or reset to the original recording.");
    const id = nextId(project);
    return commit(project, [...slice(project, 0, start, id), ...slice(project, end, getDuration(project), id)]);
  };
  const duplicateSelection = (project: AudioEditProject, start: number, end: number): AudioEditProject => {
    [start, end] = validateRange(project, start, end);
    const id = nextId(project);
    return commit(project, [
      ...slice(project, 0, end, id), ...slice(project, start, end, id, true), ...slice(project, end, getDuration(project), id)
    ]);
  };
  const updateEffects = (project: AudioEditProject, effects: Partial<AudioEffects>): AudioEditProject => {
    const result = cloneProject(project);
    result.effects = { ...result.effects, ...effects };
    result.revision++;
    // A faster tempo shortens the final timeline; retain valid fade lengths.
    const duration = getDuration(result);
    result.effects.fadeInSeconds = Math.min(result.effects.fadeInSeconds, duration);
    result.effects.fadeOutSeconds = Math.min(result.effects.fadeOutSeconds, duration);
    result.clips = result.clips.map((clip) => ({ ...clip,
      fadeInSeconds: Math.min(clip.fadeInSeconds, ((clip.effectSourceEnd ?? clip.sourceEnd) - (clip.effectSourceStart ?? clip.sourceStart)) / result.effects.speed),
      fadeOutSeconds: Math.min(clip.fadeOutSeconds, ((clip.effectSourceEnd ?? clip.sourceEnd) - (clip.effectSourceStart ?? clip.sourceStart)) / result.effects.speed)
    }));
    return validateProject(result);
  };
  const mergedTimeline = (project: AudioEditProject): AudioTimelineClip[] => {
    const result: AudioTimelineClip[] = [];
    for (const entry of getTimeline(project)) {
      const previous = result.at(-1);
      if (previous && Math.abs(previous.sourceEnd - entry.sourceStart) < EPSILON) {
        previous.sourceEnd = entry.sourceEnd;
        previous.end = entry.end;
      } else result.push({ ...entry });
    }
    return result;
  };
  const sameSource = (from: AudioEditProject, to: AudioEditProject): boolean =>
    from.sourcePath === to.sourcePath && from.sourceFingerprint === to.sourceFingerprint;
  const timelineMatches = (from: AudioEditProject, to: AudioEditProject): boolean => {
    if (!sameSource(from, to) || Math.abs(from.effects.speed - to.effects.speed) > EPSILON) return false;
    const a = mergedTimeline(from);
    const b = mergedTimeline(to);
    return a.length === b.length && a.every((entry, index) =>
      Math.abs(entry.sourceStart - b[index].sourceStart) < EPSILON && Math.abs(entry.sourceEnd - b[index].sourceEnd) < EPSILON);
  };
  const parseTime = (value: string): number | null => {
    const match = /^(\d+):(\d{2}):(\d{2})(?:[.,](\d+))?$/.exec(value.trim());
    if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) return null;
    const result = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(`0.${match[4] || "0"}`);
    return Number.isFinite(result) ? result : null;
  };
  const formatTime = (seconds: number): string => {
    const milliseconds = Math.max(0, Math.round(seconds * 1000));
    const hours = Math.floor(milliseconds / 3600000).toString().padStart(2, "0");
    const minutes = Math.floor(milliseconds % 3600000 / 60000).toString().padStart(2, "0");
    const secs = Math.floor(milliseconds % 60000 / 1000).toString().padStart(2, "0");
    return `${hours}:${minutes}:${secs}.${(milliseconds % 1000).toString().padStart(3, "0")}`;
  };
  const remapCaptions = (from: AudioEditProject, to: AudioEditProject, segments: CaptionSegment[]): CaptionRemapResult => {
    validateProject(from);
    validateProject(to);
    if (!sameSource(from, to)) throw new Error("These captions refer to a different recording. Generate captions from the selected audio instead.");
    if (!Array.isArray(segments) || segments.length > 100000) throw new Error("The caption list is invalid or too large.");
    const sourceTimeline = mergedTimeline(from);
    const targetTimeline = mergedTimeline(to);
    const unchangedTimeline = timelineMatches(from, to);
    const changes: CaptionTimingChange[] = [];
    const warnings: string[] = [];
    const outputs: CaptionSegment[] = [];
    for (const cue of segments) {
      const start = parseTime(cue.start);
      const end = parseTime(cue.end);
      if (start === null || end === null || end <= start || start < 0 || end > getDuration(from) + 0.001) {
        changes.push({ originalIndex: cue.index, kind: "review", outputs: [], message: "Invalid or out-of-range caption timing. Generate captions again or correct this cue." });
        warnings.push(`Caption ${cue.index} has invalid timing and cannot be mapped.`);
        continue;
      }
      if (unchangedTimeline) {
        const copy = { ...cue };
        changes.push({ originalIndex: cue.index, kind: "unchanged", outputs: [copy], message: "Timing and wording unchanged." });
        outputs.push(copy);
        continue;
      }
      // A contiguous cue maps through its source interval. Discontinuous input
      // spans cannot safely be assigned one phrase to multiple source passages.
      const origins = sourceTimeline.filter((entry) => end > entry.start + EPSILON && start < entry.end - EPSILON);
      const candidates: Array<{ start: number; end: number; partial: boolean }> = [];
      let ambiguousOrigin = origins.length !== 1;
      for (const origin of origins) {
        const sourceStart = origin.sourceStart + (Math.max(start, origin.start) - origin.start) * from.effects.speed;
        const sourceEnd = origin.sourceStart + (Math.min(end, origin.end) - origin.start) * from.effects.speed;
        for (const target of targetTimeline) {
          const left = Math.max(sourceStart, target.sourceStart);
          const right = Math.min(sourceEnd, target.sourceEnd);
          if (right - left <= EPSILON) continue;
          candidates.push({
            start: target.start + (left - target.sourceStart) / to.effects.speed,
            end: target.start + (right - target.sourceStart) / to.effects.speed,
            partial: left > sourceStart + EPSILON || right < sourceEnd - EPSILON
          });
        }
        // Mapping from an edit with repeated source intervals to a changed edit
        // cannot identify which repeated occurrence the user meant to preserve.
        if (sourceTimeline.filter((entry) => sourceEnd > entry.sourceStart + EPSILON && sourceStart < entry.sourceEnd - EPSILON).length > 1) {
          ambiguousOrigin = true;
        }
      }
      candidates.sort((a, b) => a.start - b.start || a.end - b.end);
      const unique = candidates.filter((candidate, index) => index === 0 ||
        Math.abs(candidate.start - candidates[index - 1].start) > EPSILON || Math.abs(candidate.end - candidates[index - 1].end) > EPSILON);
      const needsReview = ambiguousOrigin || unique.some((candidate) => candidate.partial);
      const mapped = unique.map((candidate) => ({ ...cue, start: formatTime(candidate.start), end: formatTime(candidate.end) }));
      const kind: CaptionTimingChange["kind"] = needsReview ? "review" : !mapped.length ? "removed" : mapped.length > 1 ? "duplicated" :
        Math.abs(unique[0].start - start) < 0.0005 && Math.abs(unique[0].end - end) < 0.0005 ? "unchanged" : "moved";
      const message = kind === "review" ? "This caption crosses a cut or a repeated passage. Review its wording and timing before use." :
        kind === "removed" ? "The audio for this caption was removed." : kind === "duplicated" ? "This caption appears in each copy of its audio." :
          kind === "moved" ? "Timing adjusted; wording preserved." : "Timing and wording unchanged.";
      if (needsReview) warnings.push(`Caption ${cue.index}: ${message}`);
      changes.push({ originalIndex: cue.index, kind, outputs: mapped, message });
      outputs.push(...mapped);
    }
    outputs.sort((a, b) => (parseTime(a.start) ?? 0) - (parseTime(b.start) ?? 0) || (parseTime(a.end) ?? 0) - (parseTime(b.end) ?? 0));
    outputs.forEach((cue, index) => { cue.index = index + 1; });
    return { segments: outputs, changes, warnings };
  };
  return { defaultEffects, createProject, cloneProject, getDuration, validateProject, getTimeline,
    splitAt, keepSelection, removeSelection, duplicateSelection, updateEffects, timelineMatches, remapCaptions };
})();

export const defaultEffects = audioEditUtils.defaultEffects;
export const createProject = audioEditUtils.createProject;
export const cloneProject = audioEditUtils.cloneProject;
export const getDuration = audioEditUtils.getDuration;
export const validateProject = audioEditUtils.validateProject;
export const validateAudioEditProject = audioEditUtils.validateProject;
export const getTimeline = audioEditUtils.getTimeline;
export const splitAt = audioEditUtils.splitAt;
export const keepSelection = audioEditUtils.keepSelection;
export const removeSelection = audioEditUtils.removeSelection;
export const duplicateSelection = audioEditUtils.duplicateSelection;
export const updateEffects = audioEditUtils.updateEffects;
export const timelineMatches = audioEditUtils.timelineMatches;
export const remapCaptions = audioEditUtils.remapCaptions;

Object.assign(globalThis, { audioEditUtils });
