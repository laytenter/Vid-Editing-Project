# Native runtime provenance

The application uses only these native runtime components:

| Component | Pinned version/revision | Upstream artifact | Archive SHA-256 |
| --- | --- | --- | --- |
| FFmpeg | Gyan essentials build 8.1.1; FFmpeg source `239f2c733d` | `https://github.com/GyanD/codexffmpeg/releases/download/8.1.1/ffmpeg-8.1.1-essentials_build.zip` | `6f58ce889f59c311410f7d2b18895b33c03456463486f3b1ebc93d97a0f54541` |
| whisper.cpp | 1.8.3; source `2eeeba5` | `https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.3/whisper-bin-x64.zip` | `d824b1e37599f882b396e73f1ee0bfd5d0529f700314c48311dcbd00b803321d` |
| Whisper model | Hugging Face revision `5359861c739e955e79d9a303bcbc70fb988958b1` | `ggml-base.en.bin` at the pinned revision | `a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002` |

The machine-readable source of truth is [`../runtime-dependencies.json`](../runtime-dependencies.json). `scripts/setup-windows.ps1` downloads those immutable release URLs, verifies each archive before extraction, copies only the required files, and verifies every installed file again. The Electron main process independently re-hashes the applicable executable and DLL set immediately before each FFmpeg or Whisper invocation, and verifies the model before transcription.

Expected installed files:

| Installed file | SHA-256 |
| --- | --- |
| `ffmpeg.exe` | `228d7a8556258de907fdb55f36850078ebc7680b84ec30d84ea02e99bec1d1eb` |
| `whisper.exe` (upstream `whisper-cli.exe`) | `0ff971e410240a0b97117432d771245698f376e06105c011959d2bfc4bb23311` |
| `whisper.dll` | `4037a6567fbb08fc7efda18e4d128a95df9c31ba171af20439d1a93b785d007e` |
| `ggml.dll` | `bcfeaf6e5b59c315fc36e290715aa7a84b22461e968543c13dfcf57df7b1b81d` |
| `ggml-base.dll` | `61c9c57f49f380896ed54ed3f71735e10a2d986f482c2b0a55e72b47f731b193` |
| `ggml-cpu.dll` | `eb2f1d023e51c40b27463b5ab165600eb48cb60323740f400b1b62e1c8706c56` |

## Audit of the previously tracked binaries

On 2026-08-23, the pre-hardening files were hashed without executing them and compared with the two official archives above. The local ignored `ffmpeg.exe` and `ffprobe.exe` were byte-identical to the Gyan FFmpeg 8.1.1 release. All 21 tracked Whisper-related executables and DLLs were byte-identical to files in the official whisper.cpp 1.8.3 x64 archive; the tracked `whisper.exe` matched upstream `whisper-cli.exe`. None carried an Authenticode signature, so archive digest and release provenance—not a Windows publisher signature—are the applicable identity evidence.

| Previous file | SHA-256 | Result |
| --- | --- | --- |
| `ffmpeg.exe` | `228d7a8556258de907fdb55f36850078ebc7680b84ec30d84ea02e99bec1d1eb` | Exact upstream match |
| `ffprobe.exe` | `0fde260f5abd35c9cafd96f594cc76365a780c1b73a90e35b6a3409ea1db1bf0` | Exact upstream match |
| `SDL2.dll` | `de23db1694a3c7a4a735e7ecd3d214b2023cc2267922c6c35d30c7fc7370d677` | Exact upstream match |
| `bench.exe` | `b4ca25878ab5df1d02b9dcf31dfa2a00e42cf6ad0c8cb786ee5d4d2d3778f887` | Exact upstream match |
| `command.exe` | `610513ea5ac370312cb8b602c84de6e15a8341f3f3349cdee7388abf01ce1497` | Exact upstream match |
| `ggml-base.dll` | `61c9c57f49f380896ed54ed3f71735e10a2d986f482c2b0a55e72b47f731b193` | Exact upstream match |
| `ggml-cpu.dll` | `eb2f1d023e51c40b27463b5ab165600eb48cb60323740f400b1b62e1c8706c56` | Exact upstream match |
| `ggml.dll` | `bcfeaf6e5b59c315fc36e290715aa7a84b22461e968543c13dfcf57df7b1b81d` | Exact upstream match |
| `main.exe` | `902ee1ca8c43630344ec1c8cb660b909a93688b094ebc09003b2b2261ccd0f8d` | Exact upstream match |
| `stream.exe` | `f69a3963ec94a3831c10cba2e70331869f59f09e1e7035e7538c162bc028fa5b` | Exact upstream match |
| `test-vad-full.exe` | `0d73641a18abfb502c41b3e4fe45ff1c501b94ba0f430f19bbecd0a03fe1e829` | Exact upstream match |
| `test-vad.exe` | `6941acd56568d9573701178c0e16219aa03dce05827bb13f22a42158cc3b5582` | Exact upstream match |
| `wchess.exe` | `15184567a322ddd1dea0ffac6451bbca37a79d3c0f3d9af15b701a771b1bb513` | Exact upstream match |
| `whisper-bench.exe` | `96c9853fb7a26e246fa9daf2884379d5a0788e5e2da318ff9c68df40b99a5ae8` | Exact upstream match |
| `whisper-command.exe` | `4557afc4d0d8e96262b77f257e26f4daf75b64033eec7ae8492946f07e0fe7c2` | Exact upstream match |
| `whisper-lsp.exe` | `7e0dfc2543605edfcdff922a9de8310436381340009adb76c4d287e8e47477a7` | Exact upstream match |
| `whisper-quantize.exe` | `495b041555e405bf70d383671a50d4c62e01c64c99c894d1e174b6938334c112` | Exact upstream match |
| `whisper-server.exe` | `65b8779a4944b03ab25fb3a288d534ef20b4b9802fc18beb43c4e17286631136` | Exact upstream match |
| `whisper-stream.exe` | `b31d4da1681a97b7241876537523e44df331e09228fcc409d4e9446e18fb7fa2` | Exact upstream match |
| `whisper-talk-llama.exe` | `85cf54babee1790b4668820bd143748c6617567c279cccdd15b8d03ba8164052` | Exact upstream match |
| `whisper-vad-speech-segments.exe` | `b56d440d74eb61b7cc84faf6350d2407ef089722fb04fe2c047f6cc06dd78e8c` | Exact upstream match |
| `whisper.dll` | `4037a6567fbb08fc7efda18e4d128a95df9c31ba171af20439d1a93b785d007e` | Exact upstream match |
| `whisper.exe` | `0ff971e410240a0b97117432d771245698f376e06105c011959d2bfc4bb23311` | Exact upstream `whisper-cli.exe` match |

This audit establishes the provenance of the removed files but does not justify keeping unused native tools in Git. They are removed from the current tree and remain in older Git objects until repository history is rewritten. Clones should treat commits before this hardening change as containing unauditable native artifacts even though this comparison found exact upstream matches.
