import assert from "node:assert/strict";
import { test } from "./test-harness";
import { audioOutputArguments, buildAudioFilterGraph, editedDuration, parseAudioMetadata, parseLoudnessMeasurement, PeakAccumulator } from "../src/audio-processing";
import { createProject, splitAt, updateEffects, validateProject } from "../src/audio-edit-utils";

const project = () => createProject({ sourcePath: "C:/fixtures/stereo.wav", sourceFingerprint: "a".repeat(64),
  duration: 10, sampleRate: 48000, channels: 2, peaks: [0, 0.5], previewPath: "C:/fixtures/stereo.wav" });

test("audio graph trims in source time before speed and places fades on final playback time", () => {
  const edit = project();
  edit.clips[0].sourceStart = 2;
  edit.clips[0].sourceEnd = 6;
  edit.effects.speed = 2;
  edit.effects.fadeOutSeconds = 0.5;
  const graph = buildAudioFilterGraph(validateProject(edit), 2);
  assert.match(graph, /^\[0:2\]atrim=start=2:end=6,asetpts=PTS-STARTPTS\[clip0\];\[clip0\]atempo=2/);
  assert.match(graph, /afade=t=out:st=1.5:d=0.5/);
  assert.equal(editedDuration(edit), 2);
  assert.doesNotMatch(graph, /(?:-ss|-to)/);
});

test("split clips retain separate source intervals and join without changing duration", () => {
  const original = project();
  original.effects.speed = 1.5;
  original.effects.pitchSemitones = 4;
  const edit = splitAt(original, 4);
  const graph = buildAudioFilterGraph(edit, 0);
  assert.equal(edit.clips.length, 2);
  assert.equal(graph, buildAudioFilterGraph(original, 0), "split does not restart stateful tempo or pitch filters");
  assert.equal(editedDuration(edit), 10 / 1.5);
});

test("normalization measurement and render share processing but final fades stay after loudness", () => {
  const edit = updateEffects(project(), { normalize: true, noiseReduction: true, gainDb: -3, fadeOutSeconds: 1 });
  const first = buildAudioFilterGraph(edit, 0, "measure");
  assert.match(first, /afftdn=nf=-25,volume=-3dB,loudnorm=/);
  assert.doesNotMatch(first, /afade=t=out/);
  const second = buildAudioFilterGraph(edit, 0, { input_i: -21, input_tp: -4, input_lra: 3, input_thresh: -31, target_offset: 0 });
  assert.match(second, /linear=true,afade=t=out:st=9:d=1,aresample=48000/);
});

test("splitting a faded clip preserves its envelope rather than restarting fades", () => {
  const original = project();
  original.clips[0].fadeInSeconds = 2;
  original.clips[0].fadeOutSeconds = 3;
  const graph = buildAudioFilterGraph(splitAt(original, 4), 0);
  assert.equal(graph, buildAudioFilterGraph(original, 0));
  const partial = splitAt(original, 4);
  partial.clips.splice(0, 1);
  assert.match(buildAudioFilterGraph(partial, 0), /afade=t=in:d=2,afade=t=out:st=7:d=3,atrim=start=4:end=10,asetpts/);
});

test("fragmented edits run stateful tempo and pitch once after concatenation", () => {
  const edit = project();
  edit.effects.speed = 2;
  edit.effects.pitchSemitones = 3;
  edit.clips = Array.from({ length: 100 }, (_, index) => ({ ...edit.clips[0], id: `clip-${index}`, sourceStart: 0, sourceEnd: 0.1 }));
  const graph = buildAudioFilterGraph(edit, 0);
  assert.equal((graph.match(/atempo=/g) ?? []).length, 1);
  assert.equal((graph.match(/rubberband=/g) ?? []).length, 1);
  assert.ok(graph.indexOf("concat=n=100") < graph.indexOf("atempo=2"));
});

test("output profiles retain rate and stereo and reject silent MP3 conversion", () => {
  assert.deepEqual(audioOutputArguments("wav", 48000, 2), ["-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", "-rf64", "auto"]);
  assert.ok(audioOutputArguments("flac", 96000, 6).includes("flac"));
  assert.throws(() => audioOutputArguments("mp3", 96000, 2), /Choose WAV or FLAC/);
  assert.throws(() => audioOutputArguments("mp3", 48000, 6), /Choose WAV or FLAC/);
});

test("structured metadata rejects missing audio, excessive duration and invalid channels", () => {
  assert.deepEqual(parseAudioMetadata(JSON.stringify({ streams: [{ index: 1, sample_rate: "48000", channels: 2 }], format: { duration: "10.25" } })),
    { streamIndex: 1, sampleRate: 48000, channels: 2, duration: 10.25 });
  assert.throws(() => parseAudioMetadata('{"streams":[]}'), /no supported audio/);
  assert.throws(() => parseAudioMetadata(JSON.stringify({ streams: [{ index: 0, sample_rate: 48000, channels: 99, duration: 4 }] })), /metadata/);
  assert.throws(() => parseAudioMetadata(JSON.stringify({ streams: [{ index: 0, sample_rate: 48000, channels: 2, duration: 90000 }] })), /24 hours/);
});

test("waveform aggregation uses decoded samples across split buffers with bounded bins", () => {
  const values = [0.1, -0.4, 0.8, 0.2, -0.6, 0.1, 0, 0.9];
  const pcm = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => pcm.writeFloatLE(value, index * 4));
  const accumulator = new PeakAccumulator(1, 8, 4);
  accumulator.push(pcm.subarray(0, 3));
  accumulator.push(pcm.subarray(3, 19));
  accumulator.push(pcm.subarray(19));
  const result = accumulator.finish();
  assert.equal(result.length, 4);
  [0.4, 0.8, 0.6, 0.9].forEach((expected, index) => assert.ok(Math.abs(result[index] - expected) < 1e-6));
  assert.throws(() => new PeakAccumulator(1).finish(), /no decoded audio/);
});

test("loudness parser accepts finite measurements and treats silence as unmeasurable", () => {
  assert.equal(parseLoudnessMeasurement('log\n{"input_i":"-inf","input_tp":"-inf","input_lra":"0","input_thresh":"-70","target_offset":"inf"}'), null);
  assert.deepEqual(parseLoudnessMeasurement('{"input_i":"-20","input_tp":"-3","input_lra":"5","input_thresh":"-30","target_offset":"0.2"}'),
    { input_i: -20, input_tp: -3, input_lra: 5, input_thresh: -30, target_offset: 0.2 });
});
