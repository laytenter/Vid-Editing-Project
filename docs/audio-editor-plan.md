# Audio editor implementation plan

Updated 21 November 2026. The first single-track implementation is present. This document retains the roadmap, records the processing contract, and separates automated verification from remaining listening and accessibility acceptance.

The app now runs from the **Vid-Editing-Project** repository root. This plan lives in `docs/audio-editor-plan.md`; all npm commands below run at the root. See [repository layout](repository-layout.md) for directory organization and saved-project compatibility.

The implementation uses the existing Electron, TypeScript and verified FFmpeg stack. It includes the foundation and single-track features below, together with basic noise reduction and independent speed/pitch. Multiple-track placement remains later work.

## Confirmed direction

The user confirmed these requirements after the feasibility review:

1. Deliver single-track editing first, with a cut/split capability that supports later multi-track work.
2. Keep the original recording available. Let the user generate captions from it, or edit the audio first and then generate captions from the edited version.
3. Adjust existing caption timings only when the user explicitly chooses to do so. Editing audio never starts caption remapping automatically.
4. Use Aesthetics Director and the Dumb It Down plain-language review together for the editing and caption workflows.

Implementation follows the single-track-first proposal: split audio into reusable clips on one track, with multiple-track placement later. Split keeps both pieces; Remove closes the gap; Duplicate inserts a copy on the same track. The first release covers Stages 1 and 2 below.

Source sample rate and channels are preserved, with a separate mono 16 kHz Whisper copy. Edited previews render the current edit through the export graph. A decoded preview is limited to 2 GiB (about 124 minutes at 48 kHz stereo); available disk space is checked first. The structural limits are 24 hours, 192 kHz, eight channels and 1,000 clips, but the preview storage limit may be reached sooner. Long-recording latency and human listening acceptance remain unmeasured.

## Editing and caption workflow

Keep the original recording unchanged and the edited version available in the same project. The user can move between the two routes without starting a new project or importing the file again.

| User goal | Visible choice and next step | Result |
| --- | --- | --- |
| Make captions from the recording as it is | Under **Generate captions from**, choose **Original audio**, then **Generate captions**. | Captions belong to the original recording and its timeline. Existing audio edits remain available. |
| Improve or cut the audio before captioning | Open **Audio Editor**, edit and listen, then choose **Edited audio** under **Generate captions from** and **Generate captions**. | The app prepares the current edited audio internally and runs Whisper on it. No export, save dialog or re-import is required. |
| Keep corrected caption wording after a timing change | With an existing caption set selected, choose **Adjust caption timings…**. | Preview the proposed timing changes, then choose **Create adjusted copy** or **Cancel**. The original caption set and manually edited wording remain available. |

Place the caption-source choice beside Generate captions rather than adding a separate setup wizard. On a new source, select Original audio initially; remember the user's later explicit choice within that project. Label saved caption sets with their original or edited audio source. Switching the playback source must not silently change the caption-generation choice or overwrite captions.

In the editor, keep selection and audition controls prominent. Use **Split at playhead** for a cut that keeps both pieces, **Remove selection** for deletion, and **Keep selection** for trimming away the rest. Explain that removing a section closes the gap and shortens the edited audio. Splits produce independently addressable clips with unchanged source references, ready for later track placement. Do not show an inactive Move to another track control before that action exists.

Show **Play original** and **Preview edited audio** with a visible source label. Editing has normal Undo and Redo controls. Put advanced effects behind an expandable section; include units such as **Gain (dB)**, **Fade in (seconds)** and **Speed**. Use **Export audio** with an explicit whole-track or selection choice, separate from generating captions.

### Caption versions and optional timing adjustment

Every caption set records the original source identity or edited-audio revision it describes, its timeline revision, and its manual text changes. Retain the reproducible edit snapshot or associated rendered audio while that caption set remains available. Generating edited-audio captions creates a separate result instead of replacing original captions. Preparing audio and transcription operate on a fixed edit snapshot; an older result must never be presented as matching a newer edit.

Caption-row seeking uses the audio version associated with the selected caption set. Original captions seek the original recording; edited captions seek their matching edited audio. An unchanged video must not appear synchronized to duration-altered audio. Keep video replacement and synchronization as the explicit later feature described below.

If a later cut, rearrangement or speed change invalidates timing, show **These captions match an earlier edit** with choices to view that version, generate new captions, or adjust timings. A split alone does not change timing. Gain, fades or noise reduction must not trigger needless timing adjustment. Users may continue editing; there is no automatic remap or repeated blocking prompt.

Timing adjustment preserves wording and creates a new copy only after preview and explicit application. Preview moved, removed and duplicated cues, and flag cues crossing edited boundaries for review. Do not silently rewrite text or claim a reliable mapping where one is unavailable; offer generation from edited audio instead. Cancel leaves the caption sets and selection unchanged. Original captions remain valid for the original recording even when the edited timeline differs.

### Feedback and recovery

- Show **Preparing edited audio…**, then **Generating captions…**, followed by a result labelled with its audio source. Do not ask the user to manage temporary files.
- Cancel stops the active work, removes only incomplete job output, and preserves edits and existing captions. A failed job retains the selected route and supports retry.
- A disabled action has an adjacent reason, such as **Select a section first** or **Add audio to begin**. Metadata errors are not presented as Ready.
- Keep source replacement and discarding unsaved edits distinct from switching original/edited playback. Preserve normal focus, keyboard alternatives and status announcements.

Keep the current desktop visual system for bounded repairs. Aesthetics Director owns layout, hierarchy, interaction states and rendered checks; the plain-language review follows both caption routes and recovery paths before handoff. If implementation requires a new interface or major redesign, show two rendered directions for selection before full UI implementation. This workflow specification is not rendered or user-tested acceptance.

## Original review findings and corrections

The earlier plan lived in the Audio editor feature planning session, outside the repository. It included a real waveform, trim/delete/split/duplicate operations, undo/redo, saved edits, cleanup, independent speed/pitch, and eventual multi-track mixing. The table below records defects in the initial prototype, before this implementation; its line references describe that reviewed snapshot, not the current source.

| Finding | Evidence | Required change |
| --- | --- | --- |
| Nonzero selections combined with speed export the wrong duration. | [main.ts](../src/main.ts), lines 1037–1056. A synthetic 10-second input, selection 2–6 seconds and 2× speed produced 3.00 seconds. Trimming and resetting timestamps before speed produced about 1.99 seconds. | Trim in source time, reset timestamps, then process the selected audio. Define source time and edited time separately. |
| Fades are positioned against the wrong timeline. | [main.ts](../src/main.ts), lines 1041–1048. The same 2–6 second selection with a one-second fade-out left roughly the last two seconds silent. | Apply fades relative to the selected clip after trimming. Define fade lengths in final playback seconds and validate them against edited duration. |
| Video audio loses quality before editing. | [main.ts](../src/main.ts), line 891, extracts mono 16 kHz audio; [renderer.ts](../src/renderer.ts), line 2672, uses that copy for editing. | Edit from the original media stream or a full-quality editing proxy. Generate a separate transcription proxy. |
| Waveform and navigation are unfinished. | [renderer.ts](../src/renderer.ts), line 2529, draws mathematical sine waves, not measured samples; navigation at line 945 omits the editor target. | Use real peaks, wire navigation, and verify the rendered layout. |
| Undo and edit persistence are incomplete. | [renderer.ts](../src/renderer.ts), lines 214, 1498, 2499 and 2623. Editor controls are absent from button-state updates; history is one snapshot captured after form changes; sessions omit audio edits. | Use a source-bound project model, before/after commands, undo/redo, and versioned persistence. |
| Metadata loading can reset edits or report false success. | [renderer.ts](../src/renderer.ts), lines 405 and 2561. Path refresh reloads the player and selection; errors become Ready. Initial loading at line 2423 precedes editor state initialization. | Initialize state first, analyze only on source change, reject stale results, and distinguish loading/error/ready states. |
| Normalization can change sample rate unexpectedly. | [main.ts](../src/main.ts), line 1039. The current loudnorm-only synthetic check changed a 48 kHz input to 192 kHz output. WAV currently always uses 16-bit PCM. | Set explicit output profiles for sample rate, channel layout and bit depth; verify normalization on the processed output. |
| Validation and output cleanup are incomplete. | [main.ts](../src/main.ts), lines 1013–1065, and [types.ts](../src/types.ts), line 70. Timestamp bounds are not validated against duration; cancelled partial output is not removed; the request includes an unused output path. | Validate in main, allocate output paths there, and clean job-owned temporary files. |

These defects have been addressed in the current code. Source-bound immutable edits, measured peaks, explicit original/edited playback, busy/error states and versioned persistence replace the prototype behaviour. Native tests additionally caught accumulated tempo error across small clips: speed and pitch now run once after concatenation. Splitting faded audio retains its original envelope, and adjacent equivalent clips are combined only for rendering to preserve DSP continuity.

## Architecture and open source components

- **FFmpeg remains the processing authority.** The installed 8.1.1 executable matches the SHA-256 in [runtime-dependencies.json](../runtime-dependencies.json): `228d7a8556258de907fdb55f36850078ebc7680b84ec30d84ea02e99bec1d1eb`. Its capability listings include `atrim`, `asetpts`, `afade`, `atempo`, `afftdn`, `loudnorm`, `rubberband`, and PCM, MP3 and FLAC encoders. Independent pitch processing needs no runtime replacement.
- **Use the existing canvas with real precomputed peaks.** The first implementation has bounded peak aggregation, zoom, pointer selection, keyboard navigation and explicit time fields without adding a browser audio dependency. WaveSurfer remains an optional later replacement if its region/timeline interactions become useful; no third-party waveform library or CDN is required now.
- **Generate peaks without loading entire recordings into the renderer.** Stream decoded samples from verified FFmpeg into bounded peak aggregation, with caching and cancellation. Keep original channel information even when a combined waveform is displayed. Use a compatible playback proxy where Electron cannot decode an accepted input format.
- **Use structured metadata.** ffprobe from the same pinned archive is now allowlisted and hash-verified for duration, first audio stream, sample rate and channels. The setup script installs it alongside FFmpeg; its provenance is recorded in [native-runtime.md](native-runtime.md).
- **Use FFmpeg for edited previews.** Preview and export share a processing graph, with explicit playback labels. Identical project/profile requests reuse a render. Managed caches retain caption-associated audio while evicting unreferenced old previews.
- **Keep optional dependencies optional.** Noise profiling with `afftdn`, measured de-click/de-clip and silence helpers follow the core editor. RNNoise requires a separate capability, model and provenance check; it is not promised by the current verification. SoX is unnecessary for the planned operations. Record actual native component notices before packaging.

The [FFmpeg filter reference](https://ffmpeg.org/ffmpeg-filters.html) defines the individual operations; tests against the pinned binary define this app's supported combinations.

## Project state and processing contract

Maintain a versioned audio project with stable source and clip IDs, authorized source paths, file fingerprints, stream identity, duration, sample rate, channel layout, ordered edits and export settings. Clips retain source offsets, timeline offsets and a track identifier, even while the interface exposes one track. Store metadata in the project session; put peaks and rendered proxies in managed cache files. Migrate existing version-1 caption sessions without dropping caption or clip data.

Persist original and edited-audio identities, the selected caption source, caption sets and their source/timeline revisions. Cache edited renders by immutable edit revision and output profile. The edited-caption route chains rendering and transcription through the existing single-job runner, with cancellation covering both stages. Keep original and edited caption sets, including manually corrected text, separate during generation, recovery and restart.

Represent trims, splits, deletion and duplication as changes to clips that refer to the unchanged source. Keep an undo/redo command history independent of form controls. Persist committed edit state; restart undo history may begin afresh unless persistent history becomes a requirement. Reset, source replacement and missing/changed media must have explicit recovery behaviour.

For each clip, trim its source envelope and reset timestamps, apply clip gain and fades, then select the retained subsection. Fade durations entered in final playback seconds are scaled to source time before global speed. Concatenate clips, then apply speed/pitch once, noise reduction, master gain, two-pass normalization and master fades; set the original sample rate and channels explicitly. Normalization uses a -16 LUFS/-1.5 dBTP preset before master fades, so it is not a guarantee of the final file's integrated loudness. WAV uses 24-bit PCM; FLAC retains lossless output; unsupported MP3 channel/rate combinations ask for WAV or FLAC rather than converting silently. Verify rendered duration and metadata before publishing output.

Main-process IPC accepts validated project IDs or bounded typed edit data, never arbitrary filter strings or renderer-selected output paths. Check finite values, supported formats, selected streams, ordered nonempty regions, source duration, fade lengths, path authorization and operation limits. Reuse the verified process runner and existing single-job exclusion initially. Independent concurrent preview/export jobs would require explicit job IDs, ownership and cancellation, so defer that scheduler until needed.

Choose a save destination before expensive final rendering, retain the source, render to a job-owned temporary output, and publish the completed result to the chosen destination. Cancel or failure must remove only that job's incomplete output. Report render cancellation and save cancellation separately from errors.

## Implementation stages

### Stage 1 Foundation and dependable region export

- Correct startup ordering, editor navigation, button states, invalid timestamp handling, reverse selection, stale metadata results and source-change state.
- Introduce the source-bound project model, structured metadata, separate editing/transcription sources and typed validation.
- Replace decorative waveform data with measured peaks; provide zoom, playhead, keyboard seeking and editable selection times.
- Correct trim, gain and fade exports. Add explicit output profiles, progress, cancellation, cleanup, save handling and original/edited playback labels.
- Add exact-operation previews where required and preserve source files throughout.
- Complete source restoration and persisted region/effect state before calling this stage usable.
- Add the original/edited caption-source choice and internal preparation of edited audio for Whisper. Preserve separate caption sets and label their source.

Exit check: a user can select a nonzero region, audition it, export it accurately, generate captions from either audio version without manual export/re-import, cancel safely, reopen the project and recover the same edit. Existing caption and video-clip workflows still work. This is a foundation milestone; the first single-track release also includes Stage 2.

### Stage 2 First single track release

- Add Keep selection, Remove selection, Split at playhead and duplicate-region operations using reusable clip records. Keep both sides of a split; preserve source offsets for later multi-track placement.
- Add real undo/redo for every committed edit, including effects, selection-related edits, reset and clip operations.
- Add region and project gain, fades, peak or measured loudness normalization, and WAV/MP3/FLAC export.
- Add Use caption range with explicit original/edited timeline context.
- Complete autosave, missing-media recovery and the safeguard before discarding unsaved edits when changing sources.
- Handle caption versioning from the first duration-changing operation. Add explicit Adjust caption timings with a change preview and Create adjusted copy for supported mappings. Keep original captions and manual wording; flag ambiguous boundaries and offer regeneration. Never remap automatically.

Exit check: saved edit state reproduces the same output; undo/redo restores exact state; splitting and rejoining unchanged clips preserves continuity. Both caption routes work without file-management detours, and timing adjustment requires a deliberate action and preserves the original caption set.

### Stage 3 Cleanup and timing changes

- Add noise-only region profiling and reversible cleanup presets with processed previews.
- Independent speed from 0.5× to 2× and pitch from −12 to +12 semitones are already included and tested in the single-track implementation; refine their listening presets with representative media.
- Add measured de-click/de-clip and silence detection/removal only after representative speech tests.
- Extend the existing caption routes and opt-in timing adjustment to speed changes and silence removal. Preserve source/revision labels and flag mappings that need review.

Exit check: timing, pitch, fade lengths and caption actions match the displayed edited timeline, and a listener can compare processed and original samples.

### Stage 4 Multiple tracks and advanced integration

- Add track import/reorder/duplicate, clip move/resize, track gain/pan, mute/solo and volume/fade automation.
- Define source and timeline offsets per clip; support mixed input sample rates and channel layouts through explicit conversion.
- Render mixdown through FFmpeg and provide a preview with documented latency and processing parity.
- Extend reusable single-track clips to placement across tracks. Extend the explicit caption-timing adjustment workflow to supported multi-track edits; it remains opt-in.
- Retain optional replacement of video audio as an explicit integration feature. Duration-changing audio cannot simply replace an unchanged video soundtrack without a synchronization policy.
- Introduce independent preview/export scheduling only if required by the accepted interaction design.

## Verification and acceptance

Replace the earlier blanket 1 ms preview/export promise with separate, measurable checks. Store precise timeline values and test their arithmetic exactly. For unprocessed PCM/FLAC trims, verify decoded sample counts at the selected sample rate. For tempo/pitch and compressed formats, define and record tolerances for filter latency, encoder delay and padding. Measure playback/playhead synchronization separately on Windows; a millisecond input field does not prove millisecond audible accuracy.

| Check | Current result or required acceptance |
| --- | --- |
| TypeScript build and browser script-scope check | Passed with the audio utility loaded in the browser namespace. Editor diagnostics report no errors. |
| Automated unit tests | 38 passing: 22 immutable-project/timing tests, nine processing/metadata/peak tests and seven existing subtitle/timestamp tests. Run `npm test`. |
| Native runtime verification | FFmpeg, ffprobe, Whisper and its model match the pinned manifest. Setup restored the previously missing Whisper executable and DLLs from the verified cached archive. |
| Native integration tests | Synthetic fixtures pass exact trims, stereo/rate preservation, WAV/MP3/FLAC, normalization, fade continuity and tempo/pitch combinations. A 100-fragment 2x edit stays within 50 ms of its expected five seconds. Split and unsplit faded/pitch-shifted output match decoded PCM hashes. Run `npm test`, then `node .tmp-test/tests/audio-processing.native.test.js` on the verified Windows runtime. |
| Electron interaction checks | Real main/preload/renderer checks pass source analysis, split/keep/undo/redo, native export profiles, save cancellation, invalid edits and active-job cancellation. Real Whisper runs both caption routes. Deterministic corrected-caption fixtures verify optional timing preview, Cancel and creating a separate adjusted copy. Renderer reload and full application restart preserve edits/caption versions; a missing cached caption proxy does not block autosave. Native dialog choices alone are substituted; personal media/profile data are not used. |
| Rendered verification | Actual Electron screenshots reviewed in dark/light themes and at 1280x900, 1100x820 and 780x760 window sizes. Fixed collapsed waveform/player controls, clipped source status, source-panel scrolling and resize-observer feedback. Fit-track sizing and absence of page-wide horizontal overflow are asserted. |
| Remaining acceptance | Human speech/music listening, recognition quality, representative long recordings, independent screen-reader/keyboard walkthrough, and additional DPI/text-zoom settings remain unverified. Synthetic audio and automated interaction checks do not establish those outcomes. |

Apply verification during each stage, rather than deferring it to a final integration phase. Run existing regression checks plus tests for the new audio behaviour before presenting a stage as complete.

The repeatable desktop suite is `npm run test:electron`. After native rendering checks pass, set `AUDIO_SMOKE_FOCUS=workflow` to rerun just the real caption/UI/restart paths while correcting presentation issues. Test recordings and isolated profiles are created under ignored `.tmp-test/`; no personal media is processed. Successful screenshot captures are review evidence, not listening or accessibility certification.

### Required workflow scenarios

1. Generate captions from the original, manually correct a line, edit the audio, and generate a separate edited-audio caption set. The corrected original remains available and unchanged.
2. Edit audio first, generate captions directly, cancel during preparation or transcription, and retry. No manual export/re-import is needed and prior edits/captions survive cancellation.
3. Split a clip without deleting audio. Playback duration and caption timings stay unchanged; both clip records retain valid source offsets. Undo restores the original clip.
4. Remove a section after captions exist. No remapping occurs automatically; the app identifies the older caption timeline. Preview Adjust caption timings, cancel, then create an adjusted copy. The original set survives both paths.
5. Edit again while an older render/result is pending or cached. The app never labels stale audio or captions as matching the latest edit.
6. Restart with original and edited captions present. Restore the selected caption source, both sets and their revision associations, and explain missing source media without silently substituting another version.
7. Switch between original and edited caption sets and click a caption. Playback seeks the matching audio version, including an older saved edit, without suggesting that an unchanged video follows an altered audio timeline.
