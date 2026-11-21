const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.AUDIO_SMOKE_WORK = env.AUDIO_SMOKE_WORK || path.join(root, ".tmp-test", `electron-smoke-${Date.now()}`);
function run(phase, file = "electron-smoke.cjs") {
  return new Promise((resolve, reject) => {
    const child = spawn(require("electron"), [path.join(root, "tests", file)], {
      cwd: root, env: {...env, AUDIO_SMOKE_PHASE:phase}, stdio:"inherit", windowsHide:true
    });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${phase} smoke exited ${code}`)));
  });
}
(async () => { await run("profile", "profile-compatibility.cjs"); await run("edit"); await run("restore"); })().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
