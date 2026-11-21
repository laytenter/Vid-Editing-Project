import assert from "assert";
import { test } from "./test-harness";
import type { CaptionSegment } from "../src/types";
import "../src/timestamp-utils";
import { parseSrtSegments, regenerateSrtFromSegments, regenerateVttFromSegments } from "../src/subtitle-utils";

const segments: CaptionSegment[] = [
  { index: 7, start: "00:00:01.250", end: "00:00:03.500", text: "First caption" },
  { index: 9, start: "00:00:04.000", end: "00:00:06.000", text: "Second caption", edited: true }
];

test("parseSrtSegments normalizes timestamps and multiline text", () => {
  const parsed = parseSrtSegments(
    "1\r\n00:00:01,250 --> 00:00:03,500\r\nFirst line\r\nsecond line\r\n\r\n" +
      "2\r\n00:00:04,000 --> 00:00:06,000\r\nSecond caption\r\n"
  );

  assert.deepStrictEqual(parsed, [
    { index: 1, start: "00:00:01.250", end: "00:00:03.500", text: "First line second line" },
    { index: 2, start: "00:00:04.000", end: "00:00:06.000", text: "Second caption" }
  ]);
});

test("regenerateSrtFromSegments reindexes and emits SRT timestamps", () => {
  assert.strictEqual(
    regenerateSrtFromSegments(segments),
    "1\n00:00:01,250 --> 00:00:03,500\nFirst caption\n\n" +
      "2\n00:00:04,000 --> 00:00:06,000\nSecond caption\n"
  );
});

test("regenerateVttFromSegments emits a WEBVTT document", () => {
  assert.strictEqual(
    regenerateVttFromSegments(segments),
    "WEBVTT\n\n00:00:01.250 --> 00:00:03.500\nFirst caption\n\n" +
      "00:00:04.000 --> 00:00:06.000\nSecond caption\n"
  );
});

test("empty subtitle exports have valid empty output", () => {
  assert.strictEqual(regenerateSrtFromSegments([]), "");
  assert.strictEqual(regenerateVttFromSegments([]), "WEBVTT\n");
});
