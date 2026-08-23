# Security Policy

## Supported versions

Security fixes are applied to the latest commit on the `main` branch. This project does not currently publish packaged releases. Older commits and locally modified native runtimes are not supported.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through [GitHub's private vulnerability reporting form](https://github.com/laytenter/Vid-Editing-Project/security/advisories/new). Do not open a public issue for an unpatched vulnerability and do not include secrets, personal media, or exploit details in public discussions.

Include the affected commit, Windows and Electron versions, reproduction steps, impact, and any suggested mitigation. You should receive an acknowledgement within seven days. Status updates are normally provided at least every fourteen days until the report is resolved or closed.

If private vulnerability reporting is unavailable, open a public issue containing no sensitive details and ask the maintainer for a private reporting channel.

## Scope and security model

The application processes media locally and executes pinned FFmpeg and whisper.cpp components. Native archives, installed executable files, required DLLs, and the Whisper model are SHA-256 verified against [`video-caption-app/runtime-dependencies.json`](video-caption-app/runtime-dependencies.json) before use. A digest proves byte identity with the documented upstream artifact; it is not a guarantee that upstream code is vulnerability-free.

Reports concerning renderer-to-main privilege escalation, unsafe media handling, native dependency substitution, model tampering, secret exposure, or dependency-chain compromise are in scope. Social engineering, denial of service requiring unrealistic resources, and findings that require an already-compromised operating-system administrator account are generally out of scope unless they cross a meaningful trust boundary.

## Disclosure

Please allow a reasonable remediation period before public disclosure. Once a fix is available, the maintainer will credit reporters who request attribution and will document affected versions and mitigations where practical.

## Automated checks and baseline

The security workflow runs npm advisory auditing, build/tests, dependency review, CodeQL, and a full-history Gitleaks scan. Dependabot monitors npm and GitHub Actions dependencies.

On 2026-08-23, Gitleaks 8.30.1 scanned all 39 commits reachable from every local ref; the only published remote ref was also present locally. It reported zero findings. A separate scan of the changed and newly added source/configuration files also reported zero findings. `npm audit --audit-level=high` reported zero known vulnerabilities after the dependency updates in this hardening change. These are point-in-time results, not a guarantee that the repository will remain free of secrets or vulnerabilities.
