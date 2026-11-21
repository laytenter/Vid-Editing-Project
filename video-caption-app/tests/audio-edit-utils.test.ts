import assert from "assert";
import { test } from "./test-harness";
import type { AudioAnalysis, AudioEditProject, CaptionSegment } from "../src/types";
import {
  createProject, cloneProject, getDuration, validateProject, getTimeline,
  splitAt, keepSelection, removeSelection, duplicateSelection, updateEffects,
  timelineMatches, remapCaptions
} from "../src/audio-edit-utils";

const analysis: AudioAnalysis = {
  sourcePath: "C:/recording.wav", sourceFingerprint: "recording-v1",
  duration: 10, sampleRate: 48000, channels: 2, peaks: [0.1, 0.8], previewPath: "C:/preview.wav"
};
const make = (): AudioEditProject => createProject(analysis);
const caption = (start = "00:00:04.000", end = "00:00:06.000"): CaptionSegment =>
  ({ index: 7, start, end, text: "Manually corrected words.", edited: true });

test("audio project creates full-quality immutable source metadata", () => {
  const project = make();
  assert.strictEqual(project.sampleRate, 48000);
  assert.strictEqual(project.channels, 2);
  assert.strictEqual(getDuration(project), 10);
  assert.deepStrictEqual(validateProject(JSON.parse(JSON.stringify(project))), project);
  assert.deepStrictEqual(analysis.peaks, [0.1, 0.8]);
});

test("split retains both source ranges, unique IDs and exact timeline continuity", () => {
  const source = make();
  const split = splitAt(source, 3);
  assert.strictEqual(getDuration(split), 10);
  assert.strictEqual(split.revision, source.revision + 1);
  assert.deepStrictEqual(split.clips.map(({ sourceStart, sourceEnd, trackId }) => ({ sourceStart, sourceEnd, trackId })), [
    { sourceStart: 0, sourceEnd: 3, trackId: "track-1" },
    { sourceStart: 3, sourceEnd: 10, trackId: "track-1" }
  ]);
  assert.strictEqual(new Set(split.clips.map((clip) => clip.id)).size, 2);
  assert(timelineMatches(source, split));
  assert.strictEqual(source.clips.length, 1);
  assert.deepStrictEqual(splitAt(split, 3), split);
});

test("nonzero edited selection maps to source time at two-times speed", () => {
  const fast = updateEffects(make(), { speed: 2 });
  const kept = keepSelection(fast, 1, 3);
  assert.strictEqual(getDuration(kept), 2);
  assert.strictEqual(kept.clips[0].sourceStart, 2);
  assert.strictEqual(kept.clips[0].sourceEnd, 6);
  const split = splitAt(fast, 2);
  assert.strictEqual(split.clips[0].sourceEnd, 4);
  assert.strictEqual(getDuration(split), 5);
});

test("remove closes a middle gap while preserving the source", () => {
  const source = make();
  const result = removeSelection(source, 2, 6);
  assert.strictEqual(getDuration(result), 6);
  assert.deepStrictEqual(result.clips.map((clip) => [clip.sourceStart, clip.sourceEnd]), [[0, 2], [6, 10]]);
  assert.deepStrictEqual(getTimeline(result).map((clip) => [clip.start, clip.end]), [[0, 2], [2, 6]]);
  assert.deepStrictEqual(source, make());
});

test("selection spanning split boundaries keeps precise source continuity", () => {
  const source = splitAt(splitAt(make(), 3), 7);
  const selected = keepSelection(source, 2, 8);
  assert.deepStrictEqual(selected.clips.map((clip) => [clip.sourceStart, clip.sourceEnd]), [[2, 3], [3, 7], [7, 8]]);
  assert.strictEqual(getDuration(selected), 6);
  assert(timelineMatches(selected, keepSelection(make(), 2, 8)));
});

test("duplicate inserts a reusable copy immediately after the selected section", () => {
  const result = duplicateSelection(make(), 2, 4);
  assert.deepStrictEqual(result.clips.map((clip) => [clip.sourceStart, clip.sourceEnd]), [[0, 4], [2, 4], [4, 10]]);
  assert.strictEqual(getDuration(result), 12);
  assert.strictEqual(new Set(result.clips.map((clip) => clip.id)).size, result.clips.length);
  assert.strictEqual(result.clips[0].trackId, result.clips[1].trackId);
});

test("edits reject empty, reversed, out-of-bounds and nonfinite ranges", () => {
  const source = make();
  for (const operation of [keepSelection, removeSelection, duplicateSelection]) {
    assert.throws(() => operation(source, 4, 4));
    assert.throws(() => operation(source, 7, 3));
    assert.throws(() => operation(source, -1, 3));
    assert.throws(() => operation(source, 1, 11));
    assert.throws(() => operation(source, Number.NaN, 3));
  }
  assert.throws(() => removeSelection(source, 0, 10), /Keep some audio/);
  assert.throws(() => splitAt(source, Infinity));
});

test("project validation rejects malformed IPC and returns an isolated clean object", () => {
  const source = make();
  for (const bad of [null, [], {}, { ...source, version: 2 }, { ...source, duration: Infinity },
    { ...source, sourcePath: "" }, { ...source, sourceFingerprint: "" }, { ...source, channels: 0 },
    { ...source, sampleRate: 48000.5 }, { ...source, revision: -1 }, { ...source, clips: [] },
    { ...source, effects: { ...source.effects, normalize: "true" } },
    { ...source, effects: { ...source.effects, speed: 0 } },
    { ...source, effects: { ...source.effects, fadeInSeconds: 11 } },
    { ...source, clips: [source.clips[0], source.clips[0]] },
    { ...source, clips: [{ ...source.clips[0], sourceEnd: 12 }] },
    { ...source, clips: [source.clips[0], { ...source.clips[0], id: "second", trackId: "track-2" }] }
  ]) assert.throws(() => validateProject(bad));
  const cleaned = validateProject({ ...source, arbitraryFilter: "unexpected" });
  assert(!("arbitraryFilter" in cleaned));
  cleaned.clips[0].sourceStart = 3;
  assert.strictEqual(source.clips[0].sourceStart, 0);
});

test("effects change pitch and gain without marking caption timelines stale", () => {
  const source = make();
  const effected = updateEffects(source, { gainDb: 3, normalize: true, noiseReduction: true, pitchSemitones: -2, fadeOutSeconds: 1 });
  assert(timelineMatches(source, effected));
  assert(!timelineMatches(source, updateEffects(source, { speed: 2 })));
  assert.deepStrictEqual(source, make());
});

test("shortening and speeding audio keep final-time fades within duration", () => {
  const source = updateEffects(make(), { fadeInSeconds: 8, fadeOutSeconds: 8 });
  const kept = keepSelection(source, 2, 5);
  assert.strictEqual(kept.effects.fadeInSeconds, 3);
  assert.strictEqual(kept.effects.fadeOutSeconds, 3);
  assert.strictEqual(updateEffects(source, { speed: 2 }).effects.fadeOutSeconds, 5);
});

test("caption remapping moves cues after deletion and preserves corrected text", () => {
  const source = make();
  const originalCue = caption();
  const result = remapCaptions(source, removeSelection(source, 1, 3), [originalCue]);
  assert.deepStrictEqual(result.segments, [{ ...originalCue, index: 1, start: "00:00:02.000", end: "00:00:04.000" }]);
  assert.strictEqual(result.changes[0].kind, "moved");
  assert.deepStrictEqual(result.warnings, []);
  assert.strictEqual(originalCue.start, "00:00:04.000");
  result.segments[0].text = "Changed copy";
  assert.strictEqual(originalCue.text, "Manually corrected words.");
});

test("caption remapping applies nonzero trim and speed together", () => {
  const source = make();
  const target = updateEffects(keepSelection(source, 2, 8), { speed: 2 });
  const result = remapCaptions(source, target, [caption()]);
  assert.strictEqual(result.segments[0].start, "00:00:01.000");
  assert.strictEqual(result.segments[0].end, "00:00:02.000");
});

test("fully deleted cues are removed and crossing cues are flagged for review", () => {
  const source = make();
  const target = removeSelection(source, 3, 5);
  const result = remapCaptions(source, target, [caption("00:00:03.200", "00:00:04.900"), caption("00:00:02.000", "00:00:06.000")]);
  assert.strictEqual(result.changes[0].kind, "removed");
  assert.strictEqual(result.changes[0].outputs.length, 0);
  assert.strictEqual(result.changes[1].kind, "review");
  assert.strictEqual(result.changes[1].outputs.length, 2);
  assert.strictEqual(result.warnings.length, 1);
  assert(result.segments.every((segment) => segment.text === "Manually corrected words." && segment.edited));
});

test("duplicated audio creates duplicated cue proposals and flags ambiguous reverse mappings", () => {
  const source = make();
  const duplicated = duplicateSelection(source, 4, 6);
  const forward = remapCaptions(source, duplicated, [caption()]);
  assert.strictEqual(forward.changes[0].kind, "duplicated");
  assert.deepStrictEqual(forward.segments.map((cue) => [cue.start, cue.end]), [["00:00:04.000", "00:00:06.000"], ["00:00:06.000", "00:00:08.000"]]);
  const reverse = remapCaptions(duplicated, source, [caption()]);
  assert.strictEqual(reverse.changes[0].kind, "review");
  assert.strictEqual(reverse.warnings.length, 1);
});

test("split-only and effects-only remaps preserve duplicate occurrence identity", () => {
  const source = duplicateSelection(make(), 4, 6);
  const target = updateEffects(splitAt(source, 7), { gainDb: -3 });
  const result = remapCaptions(source, target, [caption("00:00:06.000", "00:00:08.000")]);
  assert.strictEqual(result.segments.length, 1);
  assert.strictEqual(result.segments[0].start, "00:00:06.000");
  assert.strictEqual(result.changes[0].kind, "unchanged");
  assert.deepStrictEqual(result.warnings, []);
});

test("remapping rejects source mismatches and flags invalid cue times", () => {
  const source = make();
  assert.throws(() => remapCaptions(source, { ...make(), sourceFingerprint: "changed" }, [caption()]), /different recording/);
  assert.throws(() => remapCaptions(source, { ...make(), sourcePath: "C:/other.wav" }, [caption()]), /different recording/);
  const invalid = remapCaptions(source, source, [caption("00:99:00.000", "00:00:06.000"), caption("00:00:09.000", "00:00:11.000")]);
  assert.strictEqual(invalid.segments.length, 0);
  assert.strictEqual(invalid.warnings.length, 2);
});

test("cloned snapshots reproduce state after undo or redo without aliasing", () => {
  const before = make();
  const after = removeSelection(before, 2, 4);
  const undo = cloneProject(before);
  const redo = cloneProject(after);
  assert.deepStrictEqual(undo, before);
  assert.deepStrictEqual(redo, after);
  redo.clips[0].gainDb = 12;
  redo.effects.speed = 2;
  assert.strictEqual(after.clips[0].gainDb, 0);
  assert.strictEqual(after.effects.speed, 1);
});

test("splitting a faded clip preserves the original envelope on both pieces", () => {
  const source = make();
  source.clips[0].fadeInSeconds = 4;
  source.clips[0].fadeOutSeconds = 3;
  const result = splitAt(source, 2);
  assert.strictEqual(getDuration(result), 10);
  assert(timelineMatches(source, result));
  assert.deepStrictEqual(result.clips.map((clip) => ({
    start: clip.sourceStart, end: clip.sourceEnd,
    effectStart: clip.effectSourceStart, effectEnd: clip.effectSourceEnd,
    fadeIn: clip.fadeInSeconds, fadeOut: clip.fadeOutSeconds
  })), [
    { start: 0, end: 2, effectStart: 0, effectEnd: 10, fadeIn: 4, fadeOut: 3 },
    { start: 2, end: 10, effectStart: 0, effectEnd: 10, fadeIn: 4, fadeOut: 3 }
  ]);
  assert.strictEqual(source.clips[0].effectSourceStart, undefined);
  assert.deepStrictEqual(validateProject(JSON.parse(JSON.stringify(result))), result);
});

test("trim, remove and repeated slicing retain partial fade envelopes", () => {
  const source = make();
  source.clips[0].fadeInSeconds = 4;
  source.clips[0].fadeOutSeconds = 4;
  const trimmed = keepSelection(source, 1, 9);
  const trimmedAgain = keepSelection(trimmed, 1, 7);
  assert.deepStrictEqual(trimmedAgain.clips.map((clip) => [clip.sourceStart, clip.sourceEnd, clip.effectSourceStart, clip.effectSourceEnd]), [[2, 8, 0, 10]]);
  assert.strictEqual(trimmedAgain.clips[0].fadeInSeconds, 4);
  assert.strictEqual(trimmedAgain.clips[0].fadeOutSeconds, 4);
  const removed = removeSelection(source, 1, 9);
  assert.deepStrictEqual(removed.clips.map((clip) => [clip.sourceStart, clip.sourceEnd, clip.effectSourceStart, clip.effectSourceEnd]), [[0, 1, 0, 10], [9, 10, 0, 10]]);
  assert(removed.clips.every((clip) => clip.fadeInSeconds === 4 && clip.fadeOutSeconds === 4));
});

test("duplicating an excerpt retains the same fade envelope as its original", () => {
  const source = make();
  source.clips[0].fadeInSeconds = 4;
  const duplicated = duplicateSelection(source, 1, 2);
  const excerpt = duplicated.clips.find((clip) => clip.sourceStart === 1 && clip.sourceEnd === 2);
  assert(excerpt);
  assert.strictEqual(excerpt.effectSourceStart, 0);
  assert.strictEqual(excerpt.effectSourceEnd, 10);
  assert.strictEqual(excerpt.fadeInSeconds, 4);
  const fast = updateEffects(duplicated, { speed: 2 });
  assert(fast.clips.every((clip) => clip.fadeInSeconds === 4));
  assert.strictEqual(getDuration(fast), 5.5);
});

test("effect envelope validation rejects incomplete or non-enclosing bounds", () => {
  const source = make();
  for (const bounds of [
    { effectSourceStart: 0 },
    { effectSourceEnd: 10 },
    { effectSourceStart: -1, effectSourceEnd: 10 },
    { effectSourceStart: 3, effectSourceEnd: 10 },
    { effectSourceStart: 0, effectSourceEnd: 7 },
    { effectSourceStart: 0, effectSourceEnd: 11 },
    { effectSourceStart: NaN, effectSourceEnd: 10 }
  ]) assert.throws(() => validateProject({ ...source, clips: [{ ...source.clips[0], sourceStart: 2, sourceEnd: 8, ...bounds }] }));
  const valid = validateProject({ ...source, clips: [{ ...source.clips[0], sourceStart: 2, sourceEnd: 3, effectSourceStart: 0, effectSourceEnd: 10, fadeInSeconds: 4 }] });
  assert.strictEqual(valid.clips[0].fadeInSeconds, 4);
});

test("model limits match supported metadata and prevent unrenderable long duplicates", () => {
  const source = make();
  assert.throws(() => validateProject({ ...source, duration: 86401 }));
  assert.throws(() => validateProject({ ...source, sampleRate: 384000 }));
  assert.throws(() => validateProject({ ...source, channels: 9 }));
  const long = createProject({ ...analysis, duration: 13 * 3600 });
  assert.throws(() => duplicateSelection(long, 0, 13 * 3600), /24-hour/);
});
