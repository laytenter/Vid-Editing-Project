# Vid Editing

Local-first desktop app for editing audio, generating and correcting captions, and clipping video with FFmpeg and Whisper.

Media processing runs entirely offline after the verified runtime dependencies have been installed.

**Technologies:** Electron, TypeScript, FFmpeg, whisper.cpp, local AI transcription

**Status:** Early development / experimental. Run `npm start` from the repository root. There is no packaged installer yet. Single-track audio editing is implemented; multiple tracks and replacing video soundtracks remain future work.

## Why this project exists

This project brings audio editing, caption correction, and video clipping into one local workflow without uploading media to cloud services.

## Features

- Select video or audio files via file dialog or single-file drag and drop
- Open video through **File > Open Video** or `Ctrl+O`
- Upload existing audio when you only need captions
- Extract mono 16 kHz WAV audio from video with FFmpeg
- Prepare a separate mono 16 kHz transcription copy for every accepted source format
- Generate `.srt` and `.vtt` captions locally with the local Whisper runtime
- Show compact Activity status for extraction, conversion, captioning, and clipping
- Cancel active FFmpeg or Whisper work from the Activity panel
- Inspect and filter FFmpeg/Whisper output in a resizable log drawer
- Preview selected video or uploaded audio in an embedded HTML5 player
- Single-track audio editing with a measured waveform, zoom, split/keep/remove/duplicate, Undo and Redo, per-clip and whole-edit effects, and WAV/MP3/FLAC export
- Compare original playback with an edited preview produced by the same processing graph as export
- Generate captions from the original recording or edited audio without exporting and importing it again
- Preserve separate caption versions and manually corrected text; optionally preview timing changes and create an adjusted copy
- Parse generated captions into a scrollable Caption Segments list
- Click caption segments to seek preview playback and set clip ranges
- Select multi-caption clip ranges with a two-click start/end workflow
- Search/filter caption segments with highlighted matches
- Edit caption text inline before exporting subtitles
- Save extracted audio and edited captions through save dialogs
- Create one-off video clips from start/end timestamps
- Queue multiple clip ranges and export them sequentially
- Restore the most recent caption project after restarting the app
- Choose Appearance theme: System, Dark, or Light

## Screenshots

Screenshots will be added after the UI stabilizes.

## Project structure

This is one desktop application in one repository. The local checkout and GitHub repository are both named **Vid-Editing-Project**. The repository root is the application root; there is no nested application directory.

```text
Vid-Editing-Project/
  .github/                   GitHub checks and dependency updates
  docs/                      Feature plans, architecture and runtime provenance
  scripts/                   Runtime setup, build and test helpers
  src/                       Electron main/preload/renderer, HTML/CSS and app icons
  tests/                     Unit, native audio and Electron integration tests
  bin/.gitkeep               Placeholder for ignored local native tools
  package.json               App identity and npm commands
  package-lock.json          The single dependency lockfile
  runtime-dependencies.json  Pinned native downloads and SHA-256 digests
  tsconfig*.json             App and test compiler settings
  README.md                  Setup, workflows and development
  SECURITY.md                Security policy
  LICENSE                    MIT licence
```

Generated and machine-local directories stay out of Git: `node_modules/`, `dist/`, `.runtime-staging/`, `.tmp-test/`, `.tmp-ts-test/`, and the installed contents of `bin/`. Put temporary fixtures and screenshots under `.tmp-test/`; keep personal media and exported recordings outside the checkout.

The [audio editor plan](docs/audio-editor-plan.md) records current scope and acceptance limits. [Native runtime provenance](docs/native-runtime.md) records the verified processing components. [Repository layout](docs/repository-layout.md) explains the move and compatibility details.

## Installation

### Requirements

- Node.js 22.12+ (recommended: current LTS)
- Windows environment for local runtime binaries

### Setup

```powershell
# Open a terminal in Vid-Editing-Project first.
npm ci
.\scripts\setup-windows.ps1
npm start
```

`npm start` builds the TypeScript and static files before launching Electron.

## Runtime dependencies

Native executables and DLLs are not committed. `scripts/setup-windows.ps1` installs exactly the runtime components the app uses:

- Gyan FFmpeg essentials build 8.1.1: `ffmpeg.exe` and `ffprobe.exe`
- whisper.cpp 1.8.3: `whisper.exe` and its four required DLLs
- `ggml-base.en.bin` from a pinned Hugging Face revision

The script downloads immutable release URLs from [`runtime-dependencies.json`](runtime-dependencies.json), checks each archive before extraction, copies only the allowlisted files, and checks every installed file again. The main process repeats the applicable file checks immediately before execution. A mismatch stops processing and instructs you to rerun setup.

Whisper model files are loaded from the user models directory, for example:

```text
%APPDATA%\video-caption-app\models\
```

The historical `video-caption-app` name is retained only for compatibility with saved settings, projects, caches and models, and the Windows application ID. The app continues using that data in place; no re-import or model download is needed just because the repository layout changed.

Re-run setup with `-Force` to discard the cached downloads and reinstall every pinned component:

```powershell
.\scripts\setup-windows.ps1 -Force
```

See [`docs/native-runtime.md`](docs/native-runtime.md) for provenance, published hashes, and the audit of the binaries formerly tracked in this repository.

## Current workflow

### Start from video

1. Click **Upload Video**, drag one supported video into the drop zone, or use **File > Open Video**.
2. Optionally open **Audio Editor** to edit the video's original-quality audio. **Extract Audio** remains available for saving a separate mono 16 kHz transcription copy.
3. Choose **Original audio** or **Edited audio**, then click **Generate Captions**. Whisper writes temporary SRT/VTT files and populates **Caption Segments**.
4. Review, search, and edit the caption text. Click caption rows to seek the preview and populate the clip start/end fields.
5. Click **Save SRT** or **Save VTT** and choose a destination. The exported file includes current inline edits.
6. Create a single clip with **Create clip**, or click **Add clip range** for each range and then **Export All Clips**.

### Start from audio

1. Click **Upload Audio** or drag one supported audio file into the drop zone.
2. Optionally edit the audio, choose **Original audio** or **Edited audio**, then click **Generate Captions**.
3. Review and edit the generated segments, then save SRT or VTT.

Every accepted source is converted to a separate temporary mono 16 kHz WAV for Whisper. Editing and WAV/FLAC exports retain the source sample rate and channel count; MP3 requires a compatible mono/stereo source at up to 48 kHz.

### Edit audio

Use **Split at playhead** to keep both pieces, **Keep selection** to trim away the rest, or **Remove selection** to close a gap. **Duplicate selection** inserts another copy on the same track. Clip controls change one selected clip; whole-edit controls apply to the assembled recording. Undo and Redo restore committed edits. The saved edit returns after restart; undo history starts afresh.

**Play original** and **Preview edited audio** make the playback source explicit. Edited playback is prepared locally with FFmpeg. Export uses the same processing rules, including independent speed and pitch, fades, noise reduction and two-pass loudness normalization. Master fades are applied after normalization, so the final integrated loudness may be lower than the preset target.

Caption versions retain the audio edit they describe. Changing audio never moves captions automatically. **Adjust caption timings** previews moved, removed and duplicated cues; **Create adjusted copy** keeps the original set and its wording. Cues crossing cuts are marked for review. Multiple tracks and replacing video soundtracks remain future work. See the [implementation plan](docs/audio-editor-plan.md) for verification and remaining acceptance checks.

### Supported source formats

- Video: `.mp4`, `.mov`, `.mkv`, `.avi`, `.webm`, `.m4v`
- Audio: `.wav`, `.mp3`, `.m4a`, `.aac`, `.flac`, `.ogg`, `.opus`, `.wma`, `.aiff`, `.aif`

Selecting new media clears the current caption source, caption segments, clip fields, and queued clips. Temporary audio and subtitle files can be inspected through **File > Reveal Temp Folder**.

The app automatically saves and restores the most recent caption project, including selected source paths, generated or edited caption segments, clip fields, and queued clips.

A subtle source-panel notice confirms restored project state. If saved media files are missing, the notice explains what was restored and which source needs reselecting. Selecting new media clears stale captions, clip fields, and queued clips.

## Caption-assisted editing

After caption generation, the renderer parses the generated SRT text into caption segments. Each row shows start time, end time, and caption text.

- First click on a caption row sets the clip range start anchor.
- Second click on a different row selects the full caption range between both rows.
- Clicking a completed range starts a new selection.
- Escape clears the current caption range highlight without deleting captions.
- Caption row clicks also seek the embedded preview player to that row's start time.
- The active playback segment is highlighted when playback time matches a caption segment.

Caption text can be edited inline:

- Double-click caption text, or use the row's **Edit** button.
- Enter saves.
- Escape cancels.
- Blur saves.
- Only caption text is editable; timestamps are not editable yet.
- Edited rows are marked visually.
- Save SRT/VTT exports regenerated subtitle text from the current caption segment state.

## Search and filtering

The Caption Segments search box filters rows live while typing.

- Search is case-insensitive.
- Search matches caption text only.
- Matching text is highlighted with `<mark>`.
- Non-matching rows are hidden from the rendered list but remain in memory.
- Escape clears search when the search field is focused.

## Preview player

The Preview section uses:

- `<video>` when a video source is selected
- `<audio>` when only uploaded audio is available

The preview never autoplays. Caption row clicks pause the active player if needed, seek to the segment start timestamp, and keep the existing clip-selection behavior.

## Clip export

Enter or select a start/end range in `HH:MM:SS.mmm` format, then choose an FFmpeg clipping mode:

- **Copy (fast)** uses stream copy. It is faster, but cuts may align to nearby keyframes.
- **Encode (accurate)** re-encodes H.264 video and AAC audio for more accurate boundaries.

**Create clip** exports one timestamped MP4 beside the selected video. **Add clip range** stores the current range and mode in the in-memory queue.

- Queued clips are restored with the most recent saved project.
- Each row shows start/end time, optional caption preview, and a remove button.
- **Export All Clips** runs clips sequentially, not in parallel.
- The currently exporting queued clip is highlighted.
- Batch output is written beside the selected video with incremental names such as `_clip_001.mp4`, `_clip_002.mp4`, and so on.
- Failed queued clips are logged and the remaining queue continues.

Clip exports do not open a save dialog.

## Settings

Persisted settings use `electron-store`.

The only current persisted setting is **Settings > Appearance**:

- **System** follows `prefers-color-scheme`
- **Dark** forces dark mode
- **Light** forces light mode

Theme changes apply immediately without restarting the app.

## Uploaded audio support

- Uploaded audio becomes the active caption source and is shown in the preview player.
- Every accepted audio format gets a separate temporary mono 16 kHz WAV transcription copy before Whisper runs.
- Uploading audio alone does not enable video clipping.

## Logs and progress

Click **Show Log** to open the resizable log drawer. It can filter entries by FFmpeg, Whisper, or errors, copy the visible log, and optionally show noisy raw FFmpeg progress lines.

The compact Activity panel shows the current stage, such as extracting audio, converting audio, generating captions, exporting clips, cancelled, or complete. Its progress bar appears only during active work, and percentages appear only when reliable tool progress is available.

Click **Cancel** in the Activity panel to stop the active FFmpeg or Whisper process. Cancelling a batch clip export stops the current clip, leaves remaining clips unexported, and reports the completed count.

## Current limitations

- Currently Windows-focused because the local runtime binaries are Windows builds.
- The app currently uses the English `ggml-base.en.bin` Whisper model.
- No packaged installer yet; run with `npm start`.
- Only the most recent caption project is restored. Missing media paths are omitted while saved captions and clip fields remain available.
- Caption timestamp editing is not available yet.

## Development

### Build

```powershell
npm run build
```

### Test

```powershell
npm test
```

### Start

```powershell
npm start
```

Run every command above from the repository root. Additional checks on Windows with the verified runtime installed:

```powershell
npm run test:native
npm run test:electron
```

The native tests check processing against synthetic audio. The Electron suite uses isolated test profiles and fixtures under `.tmp-test/`; it does not use personal recordings. Automated checks do not establish listening quality, long-recording performance, or screen-reader acceptance. See the [audio editor plan](docs/audio-editor-plan.md) for remaining checks.

If Windows Controlled Folder Access blocks a newly installed Electron from creating test files under Documents, keep protection enabled and use an isolated temporary test directory:

```powershell
$env:AUDIO_SMOKE_WORK = Join-Path $env:TEMP ('vid-editing-smoke-' + [guid]::NewGuid().ToString('N'))
npm run test:electron
Remove-Item Env:AUDIO_SMOKE_WORK
```

This changes the test fixtures/profile location only. The default remains `.tmp-test/` in the repository.
GitHub Actions and Dependabot use this same root package and lockfile. The [GitHub repository](https://github.com/laytenter/Vid-Editing-Project) is the source of truth; commit source/configuration/docs, not installed runtimes or generated output.

### Architecture

- `src/main.ts` - Electron main process, window lifecycle, menus, IPC handlers, settings, and process spawning
- `src/preload.ts` - secure bridge API exposed to renderer (`contextIsolation=true`, `nodeIntegration=false`)
- `src/renderer.ts` - UI workflow, caption segment state, preview, editing, queueing, logging, settings interactions, and IPC calls

## License

MIT License. See `LICENSE` for full text.
