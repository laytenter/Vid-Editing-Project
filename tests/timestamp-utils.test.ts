import assert from "assert";
import { test } from "./test-harness";
import {
  formatSrtTimestamp,
  formatVttTimestamp,
  normalizeCaptionTime,
  parseTimestampSeconds
} from "../src/timestamp-utils";

test("parseTimestampSeconds accepts SRT and VTT timestamps", () => {
  assert.strictEqual(parseTimestampSeconds("00:01:02.500"), 62.5);
  assert.strictEqual(parseTimestampSeconds("01:02:03,250"), 3723.25);
  assert.strictEqual(parseTimestampSeconds("100:00:00"), 360000);
});

test("parseTimestampSeconds rejects malformed or out-of-range timestamps", () => {
  assert.strictEqual(parseTimestampSeconds(""), null);
  assert.strictEqual(parseTimestampSeconds("01:60:00.000"), null);
  assert.strictEqual(parseTimestampSeconds("01:00:60.000"), null);
  assert.strictEqual(parseTimestampSeconds("1:02"), null);
});

test("caption timestamp formatters convert decimal separators", () => {
  assert.strictEqual(normalizeCaptionTime("00:00:01,250"), "00:00:01.250");
  assert.strictEqual(formatSrtTimestamp("00:00:01.250"), "00:00:01,250");
  assert.strictEqual(formatVttTimestamp("00:00:01,250"), "00:00:01.250");
});
