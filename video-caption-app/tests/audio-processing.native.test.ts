/** Opt-in native checks: compile tests, then run this file with Node on Windows. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { audioOutputArguments, buildAudioFilterGraph, parseAudioMetadata, parseLoudnessMeasurement } from "../src/audio-processing";
import { createProject, splitAt } from "../src/audio-edit-utils";
import type { AudioEditProject, AudioExportFormat } from "../src/types";

const appRoot = path.resolve(__dirname, "../..");
const manifest = JSON.parse(readFileSync(path.join(appRoot, "runtime-dependencies.json"), "utf8"));
for (const [name, definition] of Object.entries(manifest.components.ffmpeg.files) as Array<[string, { sha256: string }]>) {
  assert.equal(createHash("sha256").update(readFileSync(path.join(appRoot, "bin", name))).digest("hex"), definition.sha256, `${name} integrity`);
}
const run = (tool: "ffmpeg" | "ffprobe", args: string[]) => {
  const result = spawnSync(path.join(appRoot, "bin", `${tool}.exe`), args, { windowsHide: true, encoding: "utf8", timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result;
};
const scratch = mkdtempSync(path.join(os.tmpdir(), "video-caption-audio-native-"));
try {
  const source = path.join(scratch, "stereo.wav");
  run("ffmpeg", ["-nostdin", "-y", "-f", "lavfi", "-i", "aevalsrc=0.5*sin(2*PI*440*t)|0.25*sin(2*PI*880*t):s=48000:d=10", "-c:a", "pcm_s24le", source]);
  const make = () => createProject({ sourcePath: source, sourceFingerprint: "a".repeat(64), duration: 10, sampleRate: 48000, channels: 2, previewPath: source, peaks: [0] });
  const metadata = (target: string) => parseAudioMetadata(run("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index,sample_rate,channels,duration:format=duration", "-of", "json", target]).stdout);
  const render = (project: AudioEditProject, name: string, format: AudioExportFormat = "wav") => {
    let measurement = null;
    if (project.effects.normalize) measurement = parseLoudnessMeasurement(run("ffmpeg", ["-nostdin", "-i", source, "-filter_complex", buildAudioFilterGraph(project, 0, "measure"), "-map", "[out]", "-f", "null", "-"]).stderr);
    const output = path.join(scratch, `${name}.${format}`);
    run("ffmpeg", ["-nostdin", "-y", "-i", source, "-filter_complex", buildAudioFilterGraph(project, 0, measurement), "-map", "[out]", ...audioOutputArguments(format, project.sampleRate, project.channels), output]);
    return output;
  };
  const trim = make();
  trim.clips[0].sourceStart = 2;
  trim.clips[0].sourceEnd = 6;
  const exact = metadata(render(trim, "trim"));
  assert.equal(exact.duration, 4);
  assert.equal(exact.sampleRate, 48000);
  assert.equal(exact.channels, 2);
  trim.effects.speed = 2;
  trim.effects.fadeOutSeconds = 0.5;
  const sped = metadata(render(trim, "sped"));
  assert.ok(Math.abs(sped.duration - 2) < 0.05, `speed duration ${sped.duration}`);
  trim.effects.pitchSemitones = 7;
  trim.effects.speed = 0.75;
  const pitched = metadata(render(trim, "pitched"));
  assert.ok(Math.abs(pitched.duration - 4 / 0.75) < 0.2, `pitch+speed duration ${pitched.duration}`);
  const faded = make();
  faded.clips[0].fadeInSeconds = 2;
  faded.clips[0].fadeOutSeconds = 3;
  const wholeFaded = render(faded, "whole-faded");
  const splitFaded = render(splitAt(faded, 4), "split-faded");
  const pcmHash = (target: string) => {
    const result = spawnSync(path.join(appRoot, "bin", "ffmpeg.exe"), ["-v", "error", "-i", target, "-f", "s24le", "-"], { windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr.toString());
    return createHash("sha256").update(result.stdout).digest("hex");
  };
  assert.equal(pcmHash(wholeFaded), pcmHash(splitFaded), "split/rejoin retains exact faded PCM samples");
  const fragmented = make();
  fragmented.effects.speed = 2;
  fragmented.clips = Array.from({ length: 100 }, (_, index) => ({ ...fragmented.clips[0], id: `fragment-${index}`, sourceStart: 0, sourceEnd: 0.1 }));
  assert.ok(Math.abs(metadata(render(fragmented, "fragmented")).duration - 5) < 0.05, "100 tiny clips do not accumulate tempo delay");
  const pitchSplit = make();
  pitchSplit.effects.speed = 1.5;
  pitchSplit.effects.pitchSemitones = 4;
  assert.equal(pcmHash(render(pitchSplit, "whole-pitch")), pcmHash(render(splitAt(pitchSplit, 3), "split-pitch")), "split with speed/pitch is identical");
  const normalized = make();
  normalized.effects.normalize = true;
  normalized.effects.noiseReduction = true;
  for (const format of ["wav", "mp3", "flac"] as const) {
    const result = metadata(render(normalized, `normalized-${format}`, format));
    assert.equal(result.sampleRate, 48000);
    assert.equal(result.channels, 2);
    assert.ok(Math.abs(result.duration - 10) < 0.2);
  }
  console.log("PASS native audio: exact trim; stereo/rate; speed+fade; speed+pitch; split fade/pitch continuity; 100-fragment speed timing; measured normalization WAV/MP3/FLAC");
} finally {
  // Only the unique directory this test created is removed.
  rmSync(scratch, { recursive: true, force: true });
}
