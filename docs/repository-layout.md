# Repository layout

Updated 21 November 2026.

## One repository, one desktop app

The GitHub repository is [laytenter/Vid-Editing-Project](https://github.com/laytenter/Vid-Editing-Project). The matching local folder is `Vid-Editing-Project`; the app is called **Vid Editing**. Audio editing, captions and video clips are features of the same application.

The former `video-caption-app/` directory has been flattened into the repository root. Source remains in [`src/`](../src/), tests in [`tests/`](../tests/), automation in [`scripts/`](../scripts/) and plans/provenance in [`docs/`](./). There is one [`package.json`](../package.json), one [`package-lock.json`](../package-lock.json) and one [README](../README.md). Run all npm and setup commands from the root.

This move changes directory organization and app naming. It does not implement further audio/video features or change the acceptance status in the [audio editor plan](audio-editor-plan.md). Git retains the history of the moved files.

## Local files and compatibility

- Installed dependencies, compiled files, native tools and runtime download caches are local and ignored by Git. Existing installations move with the application; a fresh clone uses `npm ci` and `scripts/setup-windows.ps1`.
- Temporary fixtures, screenshots and isolated test profiles belong under `.tmp-test/`. Earlier root visual-review files were moved into `.tmp-test/visual-reviews/` without publishing them.
- Personal media and exports belong outside the source checkout.
- Settings, saved projects, render caches and models keep their historical `%APPDATA%\video-caption-app\` location. The displayed app name and npm package name can change without losing the existing profile. An explicit Electron `userData` override remains respected for isolated tests.
- The Windows application ID remains `com.local.video-caption-app` to retain existing OS identity. These compatibility identifiers are intentional; do not replace them with a global search-and-replace.

## GitHub and ongoing work

The default `main` branch should represent the current maintained app. Use short-lived feature branches and pull requests for later changes. Keep existing branches until their work has been incorporated and their owners no longer need them; this reorganization does not require deleting branches or rewriting history.

GitHub Actions builds, tests and audits the root package. Dependabot monitors `/` for npm and GitHub Actions. Relative documentation links point to the flattened source tree. The repository's broader existing name and remote URL are retained.

The root move itself preserved the dependency graph. The first GitHub check then found current advisories in existing packages, so a separate follow-up updates Electron to 43.8.12, fast-uri to 3.1.9 and undici to 7.30.2. Native FFmpeg/Whisper versions and verification digests are unchanged. Dependency review also requires Dependency graph to be enabled in GitHub repository security settings; keep that check enabled.
