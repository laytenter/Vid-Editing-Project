# Video Caption App

Local-first Electron desktop app for generating captions, reviewing transcript segments, and clipping video with FFmpeg and Whisper.

The app lives in [`video-caption-app/`](video-caption-app/). For full setup, architecture, and usage details, see [`video-caption-app/README.md`](video-caption-app/README.md).

## Verified runtime prerequisites

The repository does not track native executables or DLLs. The Windows setup script downloads pinned FFmpeg 8.1.1, whisper.cpp 1.8.3, and the pinned `ggml-base.en.bin` model from documented upstream releases. It verifies each archive and installed runtime file with the SHA-256 values in [`video-caption-app/runtime-dependencies.json`](video-caption-app/runtime-dependencies.json) before the app can execute them.

## Quick Start

```powershell
cd video-caption-app
npm ci
.\scripts\setup-windows.ps1
npm start
```

## Current Workflow

1. Upload or drag in a video or supported audio file.
2. For video, click **Extract Audio** and choose where to save the extracted WAV.
3. Click **Generate Captions** to run Whisper locally.
4. Review, search, and edit caption segments. Click segments to seek playback and set clip ranges.
5. Save edited captions with **Save SRT** or **Save VTT**.
6. Create a single clip, or queue several ranges and click **Export All Clips**.

Caption and extracted-audio saves use a save dialog. Clips are exported automatically beside the selected video. All media processing stays local.

Active FFmpeg or Whisper work can be cancelled from the compact Activity panel. The most recent caption project is restored automatically after restarting the app.

See [SECURITY.md](SECURITY.md) for private vulnerability reporting and [`video-caption-app/docs/native-runtime.md`](video-caption-app/docs/native-runtime.md) for native dependency provenance and the audit of the binaries formerly tracked in Git.
