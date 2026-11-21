const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const testDir = path.resolve(__dirname, "..", ".tmp-test", "tests");
const sourceDir = path.resolve(__dirname, "..", "tests");
// Enumerate source tests so removed files left in the compiler output cannot run.
const tests = fs.readdirSync(sourceDir)
  .filter((file) => file.endsWith(".test.ts") && !file.endsWith(".native.test.ts"))
  .sort();

if (tests.length === 0) throw new Error("No unit tests found");
for (const test of tests) {
  const compiled = path.join(testDir, test.replace(/\.ts$/, ".js"));
  const result = spawnSync(process.execPath, [compiled], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
