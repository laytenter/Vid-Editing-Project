# Video Caption App

Local-first Electron desktop app for generating captions, reviewing transcript segments, and clipping video with FFmpeg and Whisper.

The app lives in [`video-caption-app/`](video-caption-app/). For full setup, architecture, and usage details, see [`video-caption-app/README.md`](video-caption-app/README.md).

## Runtime Prerequisites

Before `npm start` can work, `ffmpeg.exe`, `ffprobe.exe`, and `whisper.exe` must already be present in `video-caption-app/bin/`. The setup script creates the local runtime folders and downloads the required `ggml-base.en.bin` Whisper model, but it does not download these runtime executables.

## Quick Start

```powershell
cd video-caption-app
npm install
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
