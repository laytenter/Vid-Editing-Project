# Video Caption App

Local-first Electron desktop app for generating captions, reviewing transcript segments, and clipping video with FFmpeg and Whisper.

The app lives in [`video-caption-app/`](video-caption-app/). For full setup, architecture, and usage details, see [`video-caption-app/README.md`](video-caption-app/README.md).

## Quick Start

```powershell
cd video-caption-app
npm install
npm start
```

## Features

- Local Whisper transcription
- FFmpeg clipping
- SRT/VTT export
- Caption segment selection
- Local-first workflow

## Runtime Binaries

FFmpeg binaries are not committed because of GitHub file-size limits. Keep `ffmpeg.exe` and `ffprobe.exe` locally in `video-caption-app/bin/`.
