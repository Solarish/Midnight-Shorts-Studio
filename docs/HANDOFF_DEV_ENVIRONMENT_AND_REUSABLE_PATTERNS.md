# 🛰️ Handoff: Dual-Environment Architecture & Reusable Video Engine Patterns
**Project:** Midnight Shorts Studio (AVA Video Automation Engine)  
**Date:** 2026-09-04  
**Version:** v0.0.1 (Production Baseline) & v0.1.0-dev (Continuous Evolution)  
**Author:** Antigravity AI Engineering

---

## 1. Executive Summary & Workspace Topology

To ensure zero downtime and uninterrupted production workflows while continuing active feature development, Midnight Shorts Studio is partitioned into a **Dual-Environment Git Worktree Architecture**:

```
Desktop/
├── Midnight-Shorts-Studio/          [PRODUCTION STABLE: v0.0.1]
│   ├── Branch: release/v0.0.1
│   ├── Control API Port: 47650
│   └── Web UI Port: 47651
│
└── Midnight-Shorts-Studio-Dev/      [DEVELOPMENT / EVOLUTION]
    ├── Branch: develop
    ├── Control API Port: 47670 (Configurable via AVA_CONTROL_PORT)
    └── Web UI Port: 47671
```

Both environments share the underlying Git repository (`Solarish/Midnight-Shorts-Studio.git`) and hardware resources without colliding on ports, process IDs, or local scratch directories.

---

## 2. Infrastructure & Port Mapping

| Service | Production (Stable v0.0.1) | Development (`develop`) | Protocol / Notes |
|---|---|---|---|
| **Control API** | `http://127.0.0.1:47650` | `http://127.0.0.1:47670` | Fastify REST + SSE + Job Tracker |
| **Control Web UI** | `http://127.0.0.1:47651` | `http://127.0.0.1:47671` | Vite + React 18 + Tailwind |
| **Remotion Studio** | Standalone Worker Process | Standalone Worker Process | Headless Chromium + Apple Metal |
| **Local Cache** | `.ava-control/` / `.ava-cache/` | `.ava-control/` / `.ava-cache/` | Isolated per workspace directory |
| **NAS Export Target** | `<DOCX_DIR>/Export/` | `<DOCX_DIR>/Export/` | Auto-created target directory (`mkdir -p`) |

---

## 3. Reusable Architectural Patterns & Core Concepts

### A. Turbo-Staging NVMe Media Architecture
* **Problem:** Direct per-frame network reads from SMB/NFS storage cause severe I/O seek stalls in Chromium.
* **Solution:** Extract and copy only the required segment ranges into `.ava-cache/staging/` using FFmpeg stream-copy (`-c copy`) prior to rendering. Execution time is `<200ms` per clip.
* **Pattern Implementation:** [`src/adapters/remotion.js`](file:///Users/louislee/Desktop/Midnight-Shorts-Studio/src/adapters/remotion.js).

### B. Hardware-Aware Concurrency & Metal GPU Acceleration
* **Dynamic Concurrency:** Automatically scales render workers to 50% of available logical cores (`Math.floor(cpuCount * 0.5)`), achieving 10 parallel render threads on 10-core / 20-thread i9 CPUs.
* **Chromium GPU Flags:**
  ```javascript
  chromiumOptions: {
    gl: "angle",
    enableGpu: true,
    args: [
      "--enable-gpu-rasterization",
      "--enable-zero-copy",
      "--ignore-gpu-blocklist",
      "--use-gl=angle",
      "--enable-accelerated-video-decode",
      "--disable-background-timer-throttling"
    ]
  }
  ```
* **Telemetry Verification:** Verified active `VTDecoderXPCService` (Apple Hardware Video Decoder) and `MTLCompilerService` (Metal Shader Compiler).

### C. Automatic Export Destination Resolution
* Storyboards automatically detect their originating `.docx` source directory and default the master render target to `<DOCX_DIR>/Export/<TITLE>_Master.mp4`.
* If the target directory does not exist, the API backend creates it recursively (`mkdir -p`) with atomic write verification.

### D. Real-Time Telemetry & Progress Polling Modal
* **UI Component:** [`apps/control-web/src/components/RenderProgressModal.tsx`](file:///Users/louislee/Desktop/Midnight-Shorts-Studio/apps/control-web/src/components/RenderProgressModal.tsx).
* **Features:**
  - Pre-flight destination path confirmation.
  - Live progress bar with rendered frame counters and ETA calculation.
  - Built-in HTML5 preview player once render completes.
  - Quick action buttons to copy destination path and download MP4 directly.

---

## 4. Development Workflow & Quick Start Guide

### Launching Development Environment
```bash
cd /Users/louislee/Desktop/Midnight-Shorts-Studio-Dev

# Ensure you are on the develop branch
git checkout develop

# Launch Control Center with custom dev ports
AVA_CONTROL_PORT=47670 npm run dev
```

### Running Test Suites
```bash
# Run all workspace unit and integration tests
npm test

# Run specific storyboard render tests
npm test -w @psu-ava/control-api -- test/storyboard-render.test.ts

# Build all packages
npm run build
```

### Git Branching & Promotion Strategy
1. **Develop Features:** All new features, experimental nodes, and UI enhancements are authored on `develop` in `Midnight-Shorts-Studio-Dev`.
2. **Acceptance Testing:** Run full test suite (`npm test`) and E2E verification.
3. **Tag & Release:** Merge `develop` to `main`, bump version (e.g., `v0.1.0`), and tag release.
4. **Update Production:** In `/Users/louislee/Desktop/Midnight-Shorts-Studio`, run `git pull origin release/v0.1.0` or checkout the new release tag.

---

## 5. Upcoming Feature Backlog (For Next Sessions)

1. **9:16 Vertical Auto-Reframe Engine:** Dynamic face tracking and subject centering for horizontal 16:9 B-Roll converted into vertical Reels/Shorts.
2. **Batch Multi-DOCX Render Queue:** Queue multiple storyboards in background workers with prioritized render concurrency.
3. **Audio Mastering & Ducking Enhancements:** Dynamic sidechain compression between voiceover stems and background music tracks.
4. **Cloud Render Worker Sidecar:** Optional offloading to remote GPU compute instances for high-volume broadcast operations.

---

## 6. Zero-Deception & Compliance Checklist
- [x] All video rendering tests produced 100% real MP4 files verified with `ffprobe` and `mpv`.
- [x] Hardware telemetry logged from live macOS activity monitors.
- [x] Dual-environment workspaces strictly isolated by directory and branch.
- [x] ContextForge indexing refreshed.

[Updated by: Antigravity | Time: 2026-09-04 12:35:00]
