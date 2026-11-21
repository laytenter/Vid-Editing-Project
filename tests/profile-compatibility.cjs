/* Verify renamed-app startup against a legacy profile without opening personal data. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const root = path.resolve(__dirname, "..");
const work = path.join(process.env.AUDIO_SMOKE_WORK || path.join(root, ".tmp-test", `profile-${Date.now()}`), "profile-compatibility");
const appData = path.join(work, "appdata");
const legacy = path.join(appData, "video-caption-app");
app.setName(require(path.join(root, "package.json")).productName);
const renamedDefault = path.join(appData, app.getName());
fs.mkdirSync(legacy, { recursive: true });
fs.mkdirSync(renamedDefault, { recursive: true });
fs.writeFileSync(path.join(legacy, "config.json"), JSON.stringify({ themeMode: "dark", profileCompatibilityMarker: true }));
app.setPath("appData", appData);
app.setPath("userData", renamedDefault);
app.setPath("sessionData", renamedDefault);
app.getAppPath = () => root;

const timeout = setTimeout(() => { console.error("Profile compatibility check timed out"); app.exit(1); }, 30000);
app.on("browser-window-created", (_event, win) => {
  win.hide();
  win.webContents.on("did-finish-load", async () => {
    try {
      assert.equal(app.getPath("userData"), legacy, "renaming must reuse the established profile");
      const settings = await win.webContents.executeJavaScript("window.videoTools.getSettings()");
      assert.equal(settings.themeMode, "dark", "existing settings must load");
      assert.equal(await win.webContents.executeJavaScript("document.title"), "Vid Editing");
      assert.equal(await win.webContents.executeJavaScript("document.querySelector('h1').textContent"), "Vid Editing");
      assert.equal(JSON.parse(fs.readFileSync(path.join(legacy, "config.json"), "utf8")).profileCompatibilityMarker, true);
      assert.equal(fs.existsSync(path.join(renamedDefault, "config.json")), false, "no second settings store should be created");
      console.log("Renamed app reused legacy settings; displayed name and isolated profile checks passed.");
      clearTimeout(timeout);
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
});
require(path.join(root, "dist", "main.js"));
