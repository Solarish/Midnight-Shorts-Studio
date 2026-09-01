# First-User Supervised Live Trial

## Go/No-Go before the user starts

- [ ] All unrelated AE/Premiere work is saved and closed.
- [ ] AE is a clean dedicated session with no open, saved, dirty, or populated project.
- [ ] PSU AVA Bridge reports plugin `0.4.4`, protocol `1`, `timeline.build`, `sequence.export`, `staged.receipts`, and Connected.
- [ ] Premiere Pro Beta and Media Encoder Beta both report exactly `26.5.0`.
- [ ] `npm run control:center` opens `http://127.0.0.1:47650`.
- [ ] Every blocking System Readiness check is green.
- [ ] Shared Adobe/GPU resource lock is free.

If any item is false, do not start Live. The Control Center must never force-quit Adobe or bypass a stale resource lock.

When source code changed while an older bridge was already loaded, select **PSU AVA Bridge** in UXP Developer Tools 2.2 and use **Actions → Reload Selected** (`Option+Command+R`). Accessibility automation may be used only with explicit operator permission; do not send private WebSocket commands or restart Premiere to force a reload.

## User path

1. Click **โหลดชุดทดลอง**.
2. Confirm the presenter preview and the `PSU First User Trial` copy.
3. Click **Validate Recipe** and wait for the current workflow digest.
4. Check **พร้อมสำหรับ Live Adobe** only after the operator confirms the dedicated sessions.
5. Click **Create Video** once.
6. Observe all seven sequential steps. Assist only with expected Adobe dialogs.
7. The run passes only when the status is `success`, output verification is `30/30`, and the video and Premiere project are visible under Artifacts.

## Stop conditions

- An unexpected Adobe dialog appears.
- The run reports `ADOBE_HOST_AMBIGUOUS` or `CONTROL_API_RESTARTED`.
- AE/Premiere continues working after the Node worker stops.
- Verification is below 30/30.
- A resource lock remains after all host work is confirmed idle.

Do not use blind Resume for an unsafe run. Preserve its run directory and receipts for diagnosis.

## Observer notes

| Item | Observation |
|---|---|
| Trial date/time | |
| User/operator | |
| Time to find trial preset | |
| Time to understand readiness | |
| Validation confusion | |
| Adobe dialogs/help required | |
| Failed/retried step | |
| Final verification | |
| User confidence (1–5) | |
| Follow-up improvements | |

Final decision: **GO / NO-GO**

## Workflow Studio first trial

1. Open `http://127.0.0.1:47650/workflows`.
2. Under **Starter packages**, click **Use starter** on **Timeline Assembly Live** and inspect its six typed nodes.
3. Confirm landscape 1920×1080, 25fps, 5.00 seconds, and the computed scene timing; wait for **Saved** after any edit.
4. Click **Validate**, then **Publish**.
5. Keep mode on **Dry run** and click **Run workflow**. All six steps, including predicted Premiere build/export outputs, must finish successfully.
6. Clone the starter, add a Timeline Scene node, and confirm an attempted cycle or incompatible port is rejected.
7. Add an Audio Asset node and use **Choose local file** to import a WAV/MP3/M4A/AAC file.

For the first Workflow Studio Live session, run only through `premiere.build`, inspect the generated Premiere project, then resume `premiere.export`. A Live run must use the current published revision. Live Resume requires a fresh operator confirmation and repeats capability-scoped readiness before it queues. H264 and ProRes require their registered `.epr` presets and execute sequentially. A started stage without its completed receipt is `needs_attention` and must be inspected rather than automatically repeated.

## Current Workflow Studio status — 2026-08-27 12:20 +07

- Published Beta graph: `starter_mtb239r1_b0257b86`, revision 1.
- Accepted live run: `starter_mtb239r1_b0257b86-2026-08-27T05-18-51-034Z-2c9c1a84`.
- Live build creates a saved `AVA_MAIN` project; live export produces H.264 then ProRes sequentially.
- Automatic and independent verification pass 43/43. Both videos are 1920×1080, 25fps, and 5.00 seconds.
- Workflow Studio is **GO for the first supervised user trial** on Premiere Pro Beta 26.5.0, Media Encoder Beta 26.5.0, and PSU AVA Bridge 0.4.4.
- Auto-update is already disabled by the operator. Keep both Adobe Beta apps on 26.5.0 until this acceptance is intentionally repeated on a newer pair.
- Never resume a failed run that has `export-started` without `export-completed`; preserve it, inspect the artifact, and create a fresh run.

## Automated operator baseline

The same UI path passed a current-code self-test on 2026-08-25 at 17:24 +07:

- Run: `portrait_story_73c6211c-2026-08-25T10-24-07-769Z-fb41937f`
- Result: `success`, seven of seven steps, all on attempt 1
- Output verification: 30/30 from the scheduler and the independent CLI verifier
- Runtime: about 62 seconds
- Artifacts: 435,202,855-byte MOV, 10,900-byte Premiere project, AE project, generated images, and evidence JSON
- Decision: **GO for the first supervised developer/operator user trial**
