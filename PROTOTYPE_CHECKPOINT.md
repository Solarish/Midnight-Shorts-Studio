# Prototype Checkpoint

Updated: 2026-08-24 16:50:04 +07

## Objective

Produce a verified single-JSON, sequential automated video assembly prototype spanning local image preparation, ComfyUI, After Effects, and Premiere Pro.

## Proven working

- Node CLI validates a single JSON workflow and executes nodes sequentially.
- Checkpoint/resume and staged `--to` execution work; all 7 unit tests pass.
- ComfyUI `0.20.1` at `10.135.66.70:8188` is reachable and uses an RTX 3060 12 GB worker.
- The prototype input image exists at `assets/input/prototype-presenter.png` (`1024x1536`).
- `image.removeBackground` uses Apple Vision locally and produced a real RGBA cutout with alpha.
- `comfyui.workflow` used Z-Image Turbo to produce a real vertical background (`768x1344`).
- The fixed AE template was generated at `templates/after-effects/prototype-story.aep` and contains the planned `MASTER` composition and fixed design layers.
- The AE adapter polls for a result file instead of assuming `DoScriptFile` is synchronous.
- The AE runner is now one self-contained JSX file with its job embedded, avoiding nested reads of `ae-job.json` and `assemble.jsx` inside AE.
- AE writes a milestone log and structured failure stage without rethrowing host errors into another AE alert dialog.
- The Premiere loopback broker is covered by an offline integration test for health, job delivery, job-ID rejection, and result acceptance.

Verified media from the successful staged run:

```text
prototype-runs/ava_prototype-2026-08-24T09-25-30-518Z-ba60ccd1/
├── media/presenter-cutout/presenter.png
└── media/generated-background/generated_background_00001_.png
```

## Current stopping point

The latest run reached `ae_bind` and stopped:

```text
prototype-runs/ava_prototype-2026-08-24T09-34-19-343Z-3ee5e7b3/
```

Completed in that run:

- `select_presenter`
- `remove_background`
- `generate_background`
- `fixed_design`

Generated AE request files:

- `ae_bind/ae-job.json`
- `ae_bind/ae-runner.jsx`

Missing evidence:

- `ae_bind/ae-result.json`
- `adobe/prototype-assembled.aep`
- rendered MOV
- Premiere project/sequence

## AE issue observed

`DoScriptFile` caused AE dialogs and did not write `ae-result.json`. A minimal file-write diagnostic created a zero-byte file. The preference file currently shows:

```text
["Main Pref Section"]
  "Pref_SCRIPTING_FILE_NETWORK_SECURITY" = "1"

["Main Pref Section v2"]
  "Pref_SCRIPTING_FILE_NETWORK_SECURITY" = "0"
```

AE was left running intentionally. Do not send more automation commands until a person is present; do not force-quit it because dialog/session state is uncertain.

After the user paused interactive work, no further AE, Premiere, or ComfyUI commands were sent. Only offline source changes, local tests, validation, and dry runs were performed.

## First actions tomorrow

1. In AE, close any warning/error dialog and confirm the current project is empty.
2. Open **After Effects → Settings → Scripting & Expressions** and explicitly enable **Allow Scripts to Write Files and Access Network**.
3. Restart AE manually so the preference is definitely loaded.
4. Run the minimal diagnostic first:

   ```bash
   osascript -e 'tell application id "com.adobe.AfterEffects.application" to DoScriptFile (POSIX file "/Users/louislee/Desktop/Adobe_Plugin/tools/ae-diagnostics.jsx")'
   ```

   Success requires `/tmp/ava-ae-diagnostics.txt` to contain `json=...`, `projectItems=0`, and the AE version.

5. If file access works, resume AE binding with a fresh workflow run or retry the saved `ae-runner.jsx`.
6. Render `MASTER` with `aerender`, inspect the MOV, then load/test the Premiere UXP bridge.

## Diagnostics prepared for tomorrow

The first two fallback items are implemented and pass offline tests:

1. Each new AE step generates a self-contained `ae-runner.jsx` with the job payload and host code embedded.
2. Each new AE step targets `ae-milestones.log`; failure output includes the last completed stage such as `template-opened`, `text-bound`, `footage-bound`, or `project-saved`.
3. The runner catches its own error and writes `ae-result.json` instead of rethrowing, reducing extra AE error dialogs when file access is functional.
4. If AppleScript `DoScriptFile` remains unstable after the preference check, test the AE application executable with `-r` in the dedicated empty session before considering any broader host change.

Offline verification completed at this checkpoint:

```text
npm test                 7 passed, 0 failed
npm run validate         VALID (7 sequential steps)
npm run dry-run          SUCCESS
npm run prototype:dry-run SUCCESS
```

Do not modify or restart ComfyUI; its image-generation path is already proven.
