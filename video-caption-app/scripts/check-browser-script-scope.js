const fs = require("fs");
const path = require("path");
const vm = require("vm");

const distDir = path.resolve(__dirname, "..", "dist");
const scriptNames = ["timestamp-utils.js", "subtitle-utils.js", "renderer.js"];
const leakedUtilityNames = [
  "parseTimestampSeconds",
  "normalizeCaptionTime",
  "formatSrtTimestamp",
  "formatVttTimestamp",
  "parseSrtSegments",
  "regenerateSrtFromSegments",
  "regenerateVttFromSegments"
];
const context = vm.createContext({
  exports: {},
  module: { exports: {} },
  console,
  globalThis: null,
  window: {},
  document: {
    getElementById: () => null
  }
});
context.globalThis = context;
context.window = context;

for (const scriptName of scriptNames) {
  const scriptPath = path.resolve(distDir, scriptName);
  const source = fs.readFileSync(scriptPath, "utf8");

  try {
    vm.runInContext(source, context, { filename: scriptName });
  } catch (error) {
    const isExpectedRendererStop =
      scriptName === "renderer.js" &&
      error &&
      typeof error.message === "string" &&
      error.message.startsWith("Missing element #");

    if (!isExpectedRendererStop) {
      throw error;
    }
  }
}

for (const namespace of ["timestampUtils", "subtitleUtils"]) {
  if (!context[namespace] || typeof context[namespace] !== "object") {
    throw new Error(`Missing browser utility namespace: ${namespace}`);
  }
}

for (const name of leakedUtilityNames) {
  if (Object.prototype.hasOwnProperty.call(context, name)) {
    throw new Error(`Unexpected browser utility global: ${name}`);
  }
}

console.log("Browser script scope check passed.");
