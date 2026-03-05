# Video Caption App (Electron + TypeScript)

Local Windows desktop app for extracting audio with FFmpeg and generating captions with `whisper.cpp`.

## Prerequisites (Windows)

You need these local binaries and model files before the workflow can run:

- `ffmpeg.exe`
- `ffprobe.exe`
- `whisper.exe`
- `ggml-base.en.bin` (or another Whisper GGML model)

## Quick setup (Windows)

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
```

What this does:

- Creates `<project>\bin\` if missing
- Creates `%APPDATA%\video-caption-app\models\` if missing
- Downloads `ggml-base.en.bin` to `%APPDATA%\video-caption-app\models\ggml-base.en.bin`

Notes:

- The script does **not** auto-download `ffmpeg.exe`, `ffprobe.exe`, or `whisper.exe`.
- If model file already exists, download is skipped unless you run with `-Force`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1 -Force
```

## 1) Download FFmpeg (Windows static builds)

Use one of these official sources:

- Gyan FFmpeg builds (Windows static): https://www.gyan.dev/ffmpeg/builds/
- BtbN FFmpeg builds releases: https://github.com/BtbN/FFmpeg-Builds/releases

### FFmpeg setup

1. Download a Windows x64 static build zip/7z.
2. Extract it.
3. From the extracted `bin` folder, copy:
   - `ffmpeg.exe`
   - `ffprobe.exe`
4. Place both files into this project folder:
   - `<project>\bin\`

Expected final paths:

- `<project>\bin\ffmpeg.exe`
- `<project>\bin\ffprobe.exe`

## 2) Download whisper.cpp prebuilt Windows binary

Official source:

- whisper.cpp releases: https://github.com/ggml-org/whisper.cpp/releases

What to download:

1. Open the latest release.
2. Download a Windows x64 CLI binary package (asset names can vary by release; one common example is `whisper-bin-x64.zip` when present).
3. Extract the archive.
4. Locate the CLI executable (commonly `whisper-cli.exe`) and rename it to `whisper.exe`.
5. Place it in:
   - `<project>\bin\whisper.exe`

## 3) Download Whisper model file

Official model source referenced by `whisper.cpp`:

- https://huggingface.co/ggerganov/whisper.cpp

Download at least one GGML model, for example `ggml-base.en.bin`.

Place model files in Electron userData models directory:

- `%APPDATA%\video-caption-app\models\`

Expected model path example:

- `%APPDATA%\video-caption-app\models\ggml-base.en.bin`

Note: if the folder does not exist yet, create it. The app runtime error/log also prints the exact model path it expects.

## 4) Required file layout

Project binaries:

- `<project>\bin\ffmpeg.exe`
- `<project>\bin\ffprobe.exe`
- `<project>\bin\whisper.exe`

UserData models:

- `%APPDATA%\video-caption-app\models\ggml-base.en.bin`

## 5) Run

```powershell
npm run build
npm start
```

If files are missing, the app log panel shows the expected full path and setup hints.
