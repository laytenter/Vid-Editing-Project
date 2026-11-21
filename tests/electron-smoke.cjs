/* Real Electron/main/preload/FFmpeg smoke tests. Only native file dialogs are
 * substituted. All files and application state are isolated under .tmp-test. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { app, BrowserWindow, dialog } = require("electron");

const root = path.resolve(__dirname, "..");
const restoring = process.env.AUDIO_SMOKE_PHASE === "restore";
const work = process.env.AUDIO_SMOKE_WORK || path.join(root, ".tmp-test", `electron-smoke-${Date.now()}`);
fs.mkdirSync(work, { recursive: true });
const userData = path.join(work, "profile");
fs.mkdirSync(userData, {recursive:true});
const manifest = JSON.parse(fs.readFileSync(path.join(root, "runtime-dependencies.json"), "utf8"));
function verifiedBinary(name) {
  const definition = manifest.components.ffmpeg.files[name];
  assert.ok(definition, `${name} must be pinned in the runtime manifest`);
  const file = path.join(root, "bin", name);
  const digest = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  assert.equal(digest, definition.sha256, `${name} integrity`);
  return file;
}
const ffmpeg = verifiedBinary("ffmpeg.exe");
const ffprobe = verifiedBinary("ffprobe.exe");
const fixture = path.join(work, "stereo source.wav");
if (!restoring) {
  const generate = spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i",
    "sine=frequency=440:duration=10:sample_rate=48000", "-af", "afade=t=in:d=2",
    "-ac", "2", "-c:a", "pcm_s16le", fixture], { windowsHide: true, encoding: "utf8" });
  assert.equal(generate.status, 0, generate.stderr);
}
const originalHash = crypto.createHash("sha256").update(fs.readFileSync(fixture)).digest("hex");
const installedModel = path.join(app.getPath("appData"), "video-caption-app", "models", manifest.components.model.name);
if (!fs.existsSync(installedModel)) throw new Error("Run verified setup before the native smoke test; the Whisper model is missing.");
fs.mkdirSync(path.join(userData, "models"), {recursive:true});
if (!restoring) fs.copyFileSync(installedModel, path.join(userData, "models", manifest.components.model.name));
// Remove just the last caption proxy from our isolated test profile. A real
// restart must preserve its caption set and allow unrelated autosaves.
if (restoring) {
  const expected = JSON.parse(fs.readFileSync(path.join(work, "expected-session.json"), "utf8"));
  const proxy = expected.captionSets.at(-1).mediaPath;
  assert.ok(path.resolve(proxy).startsWith(path.resolve(userData) + path.sep));
  if (fs.existsSync(proxy)) fs.unlinkSync(proxy);
}
app.setPath("userData", userData);
app.getAppPath = () => root;

let saveTarget = path.join(work, "export.wav");
let openTarget = fixture;
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [openTarget] });
dialog.showSaveDialog = async () => saveTarget
  ? ({ canceled: false, filePath: saveTarget }) : ({ canceled: true });
dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
const rendererErrors = [];
app.on("browser-window-created", (_event, win) => {
  win.hide();
  win.webContents.setAudioMuted(true);
  win.webContents.on("console-message", (event) => {
    if (event.level === "error") rendererErrors.push(event.message);
  });
  win.webContents.on("preload-error", (_event, _file, error) => rendererErrors.push(String(error)));
});
require(path.join(root, "dist", "main.js"));
assert.equal(app.getPath("userData"), userData, "app naming must preserve an explicit isolated profile");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label, timeout = 90000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}
function probe(file) {
  const result = spawnSync(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
    { windowsHide: true, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
function decodedPcm(file) {
  const result = spawnSync(ffmpeg, ["-v", "error", "-i", file, "-f", "f32le", "-c:a", "pcm_f32le", "pipe:1"],
    { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}
let win;
const js = async (code) => {
  try { return await win.webContents.executeJavaScript(code, true); }
  catch (error) { console.error("Failed renderer expression:", code.slice(0,240), rendererErrors); throw error; }
};
const click = (id) => js(`document.getElementById(${JSON.stringify(id)}).click()`);
const field = (id, value) => js(`(() => { const el=document.getElementById(${JSON.stringify(id)}); el.value=${JSON.stringify(value)}; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
const saved = async () => { await delay(450); return js("window.videoTools.getCaptionProject()"); };
const pass = (name) => console.log(`PASS Electron: ${name}`);
async function screenshot(name, width=1280, height=900, theme="dark") {
  win.setSize(width,height);
  await js(`window.videoTools.setSettings({themeMode:${JSON.stringify(theme)}})`);
  // Windows needs a composited surface; showing without focus preserves other apps.
  win.showInactive();
  await delay(300);
  fs.writeFileSync(path.join(work, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  win.hide();
}

async function main() {
  await app.whenReady();
  win = await until(() => BrowserWindow.getAllWindows()[0], "window created");
  await until(() => js("Boolean(window.videoTools && document.getElementById('audioSplit'))").catch(() => false), "renderer ready");
  await js("window.confirm = () => true; window.__smokeErrors=[]; window.addEventListener('unhandledrejection',e=>window.__smokeErrors.push(String(e.reason)))");
  await delay(300);
  assert.equal(rendererErrors.length, 0, rendererErrors.join("\n"));
  if (restoring) {
    await until(() => js("document.getElementById('audioEditorStatus').textContent.includes('Ready')"), "source restored after full app restart");
    const expected = JSON.parse(fs.readFileSync(path.join(work, "expected-session.json"), "utf8"));
    const actual = await saved();
    assert.deepEqual(actual.audioProject, expected.audioProject);
    assert.deepEqual(actual.captionSets, expected.captionSets);
    assert.equal(actual.captionSource, expected.captionSource);
    await field("audioPlayhead", "00:00:01.500");
    const playheadSession = await until(async () => {
      const current = await saved();
      return current.audioPlayhead === 1.5 ? current : false;
    }, "playhead autosaved despite missing caption proxy");
    assert.equal(playheadSession.audioPlayhead, 1.5, "missing caption proxy must not block autosaving edits");
    assert.equal(rendererErrors.length, 0, rendererErrors.join("\n"));
    pass("full application restart preserves edits and captions despite missing cached audio");
    openTarget = path.join(work, "video source.mkv");
    const video = spawnSync(ffmpeg, ["-v","error","-f","lavfi","-i","color=c=black:s=160x90:r=10:d=3",
      "-f","lavfi","-i","sine=frequency=660:sample_rate=48000:duration=3","-ac","2","-c:v","ffv1","-c:a","pcm_s16le",openTarget],
      {windowsHide:true,encoding:"utf8"});
    assert.equal(video.status,0,video.stderr);
    await click("selectVideoButton");
    await until(async () => (await saved())?.audioProject?.sourcePath === openTarget, "new video audio analysis");
    const videoSession=await saved();
    assert.equal(videoSession.audioProject.sampleRate,48000);
    assert.equal(videoSession.audioProject.channels,2);
    assert.equal(videoSession.audioProject.clips.length,1);
    assert.equal(videoSession.captionSource,"original");
    assert.equal(videoSession.audioProject.effects.speed,1);
    pass("video audio opens at original quality and new source resets edit state");
    return;
  }
  await click("selectAudioButton");
  await until(() => js("document.getElementById('audioEditorStatus').textContent.includes('Ready')"), "audio analysis");
  await js(`(async () => { window.__smoke={analysis:await window.videoTools.analyzeAudio(${JSON.stringify(fixture)})}; window.__smoke.base=window.audioEditUtils.createProject(window.__smoke.analysis); })()`);
  const analysis = await js("window.__smoke.analysis");
  assert.equal(analysis.channels, 2);
  assert.equal(analysis.sampleRate, 48000);
  assert.ok(Math.abs(analysis.duration - 10) < 0.02);
  assert.ok(analysis.peaks.length > 20 && analysis.peaks.some((x) => x > 0));
  assert.ok(Math.max(...analysis.peaks) - Math.min(...analysis.peaks) > 0.01, "waveform follows signal amplitude");
  pass("real peaks and original stereo metadata");

  await js("document.querySelector('[data-workflow-target=editor]').click()");
  await field("audioPlayhead", "00:00:04.000");
  await click("audioSplit");
  let session = await saved();
  assert.equal(session.audioProject.clips.length, 2, "split creates two clips");
  await click("audioEditUndoButton");
  await until(async () => (await saved()).audioProject.clips.length === 1, "undo autosaved");
  await click("audioEditRedoButton");
  await until(async () => (await saved()).audioProject.clips.length === 2, "redo autosaved");
  await field("audioEditStart", "00:00:02.000");
  await field("audioEditEnd", "00:00:06.000");
  await click("audioKeep");
  session = await until(async () => {
    const current = await saved();
    return Math.abs(current.audioProject.clips.reduce((n,c)=>n+c.sourceEnd-c.sourceStart,0)-4)<0.001 ? current : false;
  }, "keep selection autosaved");
  assert.ok(Math.abs(session.audioProject.clips.reduce((n,c)=>n+c.sourceEnd-c.sourceStart,0)-4)<0.001);
  pass("split, keep, undo and redo through the real interface");
  await screenshot("editor-first");
  console.log(`Early UI screenshot: ${path.join(work,"editor-first.png")}`);

  if (process.env.AUDIO_SMOKE_FOCUS !== "workflow") {
  const rendered = await js(`(() => { const u=window.audioEditUtils; const p=u.updateEffects(u.keepSelection(window.__smoke.base,2,6),{speed:2,fadeOutSeconds:0.5}); return window.videoTools.renderEditedAudio({project:p,format:'wav',purpose:'preview'}); })()`);
  let media = probe(rendered.outputPath);
  assert.ok(Math.abs(Number(media.format.duration) - 2) < 0.06, media.format.duration);
  assert.equal(media.streams[0].sample_rate, "48000");
  assert.equal(media.streams[0].channels, 2);
  const normalized = await js("window.videoTools.renderEditedAudio({project:window.audioEditUtils.updateEffects(window.__smoke.base,{normalize:true}),format:'wav',purpose:'preview'})");
  media = probe(normalized.outputPath);
  assert.equal(media.streams[0].sample_rate, "48000", "normalization preserves output rate");
  assert.equal(media.streams[0].channels, 2);
  pass("correct trim/speed duration, normalization rate and stereo output");

  // A cut which keeps both pieces must not restart their fade or tempo filters.
  for (const effects of [{}, {speed: 1.5, pitchSemitones: 3}]) {
    const pair = await js(`(async () => { const u=window.audioEditUtils; const p=u.updateEffects(u.cloneProject(window.__smoke.base),${JSON.stringify(effects)}); p.clips[0].fadeInSeconds=4; p.clips[0].fadeOutSeconds=2; const whole=await window.videoTools.renderEditedAudio({project:p,format:'wav',purpose:'preview'}); const split=await window.videoTools.renderEditedAudio({project:u.splitAt(p,2),format:'wav',purpose:'preview'}); return [whole,split]; })()`);
    assert.deepEqual(decodedPcm(pair[1].outputPath), decodedPcm(pair[0].outputPath), "split preserves decoded audio including fades and tempo/pitch");
  }
  pass("split preserves real fade and tempo/pitch output sample for sample");

  for (const format of ["mp3", "flac"]) {
    saveTarget = path.join(work, `export.${format}`);
    const result = await js(`window.videoTools.renderEditedAudio({project:window.__smoke.base,format:${JSON.stringify(format)},purpose:'export'})`);
    assert.ok(fs.existsSync(result.outputPath));
    assert.equal(probe(result.outputPath).streams[0].channels, 2);
  }
  saveTarget = null;
  assert.equal(await js("window.videoTools.renderEditedAudio({project:window.__smoke.base,format:'wav',purpose:'export'})"), null);
  pass("MP3/FLAC saves and save-dialog cancellation");

  const badInput = await js("window.videoTools.renderEditedAudio({project:{...window.__smoke.base,clips:[{...window.__smoke.base.clips[0],sourceEnd:999}]},format:'wav',purpose:'preview'}).then(()=>false,()=>true)");
  assert.equal(badInput, true);
  const cancelResult = await js(`(async () => { const request=window.videoTools.renderEditedAudio({project:window.__smoke.base,format:'wav',purpose:'preview'}); await new Promise(r=>setTimeout(r,10)); await window.videoTools.cancelActiveMediaProcess(); return request.then(()=>false,e=>String(e).toLowerCase().includes('cancel')); })()`);
  assert.equal(cancelResult, true);
  pass("invalid edits rejected and active rendering cancelled");
  }

  // Exercise real local Whisper in both routes. The synthetic tone checks the
  // pipeline and caption provenance, not speech-recognition quality.
  await click("captionSourceOriginal");
  await click("generateCaptionsButton");
  await until(async () => (await saved())?.captionSets?.length >= 1, "original caption generation", 180000);
  const originalSession = await saved();
  assert.equal(originalSession.captionSets[0].sourceKind, "original");
  await click("captionSourceEdited");
  await click("generateCaptionsButton");
  await until(async () => (await saved())?.captionSets?.length >= 2, "edited caption generation", 180000);
  session = await saved();
  assert.ok(session.captionSets.some((s) => s.sourceKind === "edited"));
  assert.deepEqual(session.captionSets[0], originalSession.captionSets[0]);
  pass("both real caption routes preserve separate source-bound sets");

  // Deterministic corrected-text fixture supplements the real Whisper pipeline.
  // It proves remapping semantics without pretending a tone tests recognition.
  const corrected = [
    {index:1,start:"00:00:03.000",end:"00:00:04.000",text:"Manually corrected wording",edited:true},
    {index:2,start:"00:00:08.000",end:"00:00:09.000",text:"Outside the selected section",edited:true}
  ];
  await field("captionSetSelect",session.captionSets[0].id);
  await js(`setCaptionSegments(${JSON.stringify(corrected)}); persistActiveCaptionSet(); scheduleCaptionProjectSave()`);
  await until(async () => (await saved()).captionSets[0].segments[0]?.text === corrected[0].text, "corrected caption fixture saved");
  await click("captionRemapButton");
  assert.equal(await js("document.getElementById('captionRemapDialog').open"), true);
  await screenshot("caption-timing-preview");
  const cancelSnapshot = await saved();
  await click("captionRemapCancel");
  assert.deepEqual((await saved()).captionSets, cancelSnapshot.captionSets, "cancelled remap leaves captions intact");
  await click("captionRemapButton");
  await click("captionRemapCreate");
  await until(async () => (await saved()).captionSets.length === 3, "adjusted caption copy");
  session = await saved();
  assert.deepEqual(session.captionSets[0].segments, corrected);
  const adjusted = session.captionSets[2].segments;
  assert.equal(adjusted.length, 1);
  assert.equal(adjusted[0].text, corrected[0].text);
  assert.equal(adjusted[0].start, "00:00:01.000");
  assert.equal(adjusted[0].end, "00:00:02.000");
  pass("optional timing preview, cancel, and adjusted copy preserve corrected originals");
  await screenshot("caption-versions");

  const beforeReload = await saved();
  const reloaded = new Promise(resolve => win.webContents.once("did-finish-load", resolve));
  win.webContents.reload();
  await reloaded;
  await until(() => js("document.getElementById('audioEditorStatus')?.textContent.includes('Ready')").catch(()=>false), "restore analysis");
  const restored = await saved();
  assert.deepEqual(restored.audioProject, beforeReload.audioProject);
  assert.equal(restored.captionSets.length, beforeReload.captionSets.length);
  assert.equal(restored.captionSource, beforeReload.captionSource);
  pass("editor and caption versions restore after renderer restart");

  await js("document.querySelector('[data-workflow-target=editor]').click()");
  for (const [name, width, height, theme] of [["editor-dark",1280,900,"dark"],["editor-light",1100,820,"light"],["editor-narrow",780,760,"dark"]]) {
    await screenshot(name,width,height,theme);
    assert.equal(await js("(() => {const e=document.getElementById('audioWaveformScroll');return e.scrollWidth <= e.clientWidth+1;})()"),true,"Fit track waveform fits its viewport");
  }
  await js("document.getElementById('audioEditExportButton').scrollIntoView({block:'end'})");
  await screenshot("editor-export-narrow",780,760,"dark");
  assert.equal(await js("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"),true,"no page-wide horizontal overflow");
  assert.deepEqual(await js("window.__smokeErrors || []"), []);
  assert.equal(rendererErrors.length, 0, rendererErrors.join("\n"));
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(fixture)).digest("hex"), originalHash);
  fs.writeFileSync(path.join(work, "expected-session.json"), JSON.stringify(await saved()));
  console.log(`Native smoke artifacts: ${work}`);
  console.log("PASS Electron smoke suite (speech recognition quality and human listening not assessed)");
}

const watchdog = setTimeout(() => { console.error("Electron smoke timeout"); app.exit(1); }, 600000);
main().then(() => { clearTimeout(watchdog); app.exit(0); }).catch((error) => {
  console.error(error);
  console.error(`Smoke files retained at ${work}`);
  clearTimeout(watchdog);
  if (win && !win.isDestroyed()) {
    win.webContents.capturePage().then(image => fs.writeFileSync(path.join(work,"failure.png"),image.toPNG())).finally(()=>app.exit(1));
  } else app.exit(1);
});
