# Acceptance Report — Local Control Center Architecture

Date: 2026-08-27 12:20 +07

## Workflow Studio Gate 5 update — 2026-08-27 12:20 +07

- Gate 3 PASS: PSU AVA Bridge `0.4.4` is loaded in Premiere Pro Beta 26.5.0 and reports `timeline.build`, `sequence.export`, and `staged.receipts`.
- Exact host pin PASS: Premiere Pro Beta 26.5.0 and Media Encoder Beta 26.5.0 both satisfy the blocking readiness gate. The operator has disabled auto-update; changing either version requires re-acceptance.
- Gate 5 BUILD PASS: published Beta graph `starter_mtb239r1_b0257b86`, revision 1, completed the supervised build gate with a saved 11,306-byte `AVA_MAIN` project and sequence GUID `1cfbc81e-6b03-4451-bdd1-cfaa10d2d614`.
- Gate 5 EXPORT PASS: run `starter_mtb239r1_b0257b86-2026-08-27T05-18-51-034Z-2c9c1a84` produced H.264 MP4 and ProRes 422 MOV sequentially and finished `success`.
- The H.264 artifact is 1,346,869 bytes; the ProRes artifact is 68,946,580 bytes. Both are 1920×1080, 25fps, and 5.00 seconds. SHA-256 checks match their durable receipts.
- Sequential proof PASS: H.264 finished at `05:18:58.398Z`; ProRes started at `05:18:58.420Z`.
- Scheduler verification and the independent graph verifier both pass 43/43.
- Premiere Beta did not reliably settle `exportSequence()` or emit `EXPORT_MEDIA_COMPLETE`. Bridge 0.4.4 keeps the event path, maintains heartbeat while busy, and accepts only a fresh unique stable exact output before committing a completion receipt and starting the next codec.
- `npm test` passes 66 root and 50 workspace tests (116 total). All nine workspace builds pass.
- Workflow Studio Live decision: **GO for the first supervised user trial on the pinned Beta 26.5.0 pair**. Earlier failed/ambiguous runs remain retained and must not be force-resumed.

## Historical Gate 1–5 snapshot — 2026-08-26 23:32 +07 (superseded)

- Gate 1 PASS: exact typed ports, shared config contracts, 25fps profile injection, frame-aligned scene/audio timing, and declared-duration enforcement.
- Gate 2 PASS: streaming media import, capability-scoped readiness, graph-specific evidence verification, JaiTTS ambiguity fencing, and staged Premiere build/H264/ProRes receipts.
- Gate 3 PASS: the preset-driven Premiere 25.6 host capability, unit tests, and supervised PSU AVA Bridge v0.3.0 reload are complete.
- Gate 4 PASS: versioned **Timeline Assembly Live** starter package, exact typed handles, config inspector, duration/time preview, validation-gated publish/run, and duplicate-submit/unload guards.
- Gate 5 AUTOMATED PASS / SUPERVISED EXPORT BLOCKED: `npm test` passes 114 total tests, all workspace builds pass, and the current revision completes the live Premiere build gate. Real H264/ProRes artifacts remain blocked only by the missing matching Media Encoder 2025 installation; the UI now catches that dependency before queueing a new Live run.

## Outcome

The decoupled `UI <> Control API/Core <> one-shot macOS worker <> AE/PR/AI adapters` implementation is ready for the existing portrait-story developer/operator trial and the first supervised Workflow Studio trial. The Premiere build/export path is now proven end to end on the exact-pinned Premiere Pro Beta 26.5.0 and Media Encoder Beta 26.5.0 pair.

The current-code live run `portrait_story_73c6211c-2026-08-25T10-24-07-769Z-fb41937f` completed all seven steps sequentially in about 62 seconds. Its scheduler verification and independent CLI verification both passed 30/30. The generated MOV is 435,202,855 bytes and the Premiere project is 10,900 bytes.

## Verification results

| Check | Result |
|---|---|
| `npm run build` | PASS — 9 workspaces built |
| Current `npm test` | PASS — 66 root + 50 workspace tests (116 total) |
| `npm test` | PASS — 38 root tests and 25 workspace tests (63 total) |
| `npm run test:e2e` | PASS — 3 standard Playwright scenarios; live scenario safely skipped without opt-in |
| `npm run test:live-acceptance` | PASS — 1 browser-driven live AE/ComfyUI/Premiere scenario in 1.1 minutes |
| Node 20.19.5 compatibility | PASS — 38 root tests and 10 Control API tests |
| `npm audit --omit=dev` | PASS — 0 vulnerabilities |
| `npm run validate` | PASS — fixed 7-step workflow |
| `npm run dry-run` | PASS — 7/7 sequential steps |
| `npm run prototype:dry-run` | PASS — 7/7 sequential steps |
| `npm run prototype:verify -- <current-live-run> --write` | PASS — 30/30 current-code live-evidence checks |
| Resource lock after tests | PASS — no shared lock remains |
| Control API SIGTERM cleanup with active SSE | PASS — stream closed and singleton lock removed in about 0.7 seconds |
| `npm run prototype:doctor` | 0 failures, 1 interactive setup item; exit 2 by design |
| Current Live `/api/v1/readiness` | PASS — 12/12 on Premiere/AME Beta 26.5.0 and bridge 0.4.4 |
| Workflow Studio live graph verifier | PASS — 43/43 automatic and independent checks |

Current live evidence is stored at `prototype-runs/portrait_story_73c6211c-2026-08-25T10-24-07-769Z-fb41937f/prototype-evidence.json`.

## Acceptance coverage

- Workflow schema and semantic validation, exact typed references, resume bounds, checkpoint-before-event ordering, and pre-adapter failure checkpoints.
- Durable queue restart, idempotency payload/mode conflicts, tampered workflow snapshot refusal, queue/cancel race, event-write failure recovery, and cross-scheduler capacity 1.
- Crash-torn NDJSON recovery and collision-free concurrent atomic writes.
- Process timeout escalation from TERM to KILL.
- AE clean-session guard, generation receipts, terminal-result recovery, and ambiguous-host state refusal without auto-quitting AE.
- Premiere v1 job/result generation fencing, legacy-job refusal before host mutation, mailbox/HTTP conflict behavior, result validation, and loopback-only broker behavior.
- Premiere job generations include streamed SHA-256 content identity for the template, render media, and AE project; exact-generation mailbox receipts are removed only after the success checkpoint is durable.
- CSRF, MIME-content mismatch, server-owned asset paths, idempotent trial-preset creation, stale UI preflight invalidation, live confirmation/readiness gate, readiness expiry/polling/focus refresh, authoritative 409 state replacement, rejected-live diagnostics, unsafe-resume refusal, invalid-run error state, artifact containment, byte ranges, and complete seven-step browser dry run.
- Automatic post-run verification is persisted before the terminal success record, avoiding a status/artifact race for UI and API clients.
- The opt-in live browser test exercises the exact first-user path: load preset, validate recipe, confirm Adobe readiness, submit, wait for a terminal run, assert 7/7, assert 30/30, and verify MOV/PRPROJ/evidence artifacts.

## Errors encountered and resolved

1. Control API TypeScript build rejected indexing a narrow MIME map with Sharp's broad format union. Replaced it with explicit format branches and rebuilt successfully.
2. The upload E2E expected a MIME mismatch but initially sent a PNG declared as PNG. Changed the declared type to JPEG so the test exercises the intended 415 path.
3. Playwright's `getByLabel("Headline")` also matched `Subheadline`. Switched to exact label matching.
4. Acceptance shutdown left `.ava-control/control-api.lock` after Ctrl-C. Added SIGINT/SIGTERM graceful shutdown, rebuilt, restarted, and confirmed both singleton and resource locks are absent.
5. Playwright's default web-server teardown used SIGKILL and again left a dead singleton lock. Changed the E2E server to run the API directly with a five-second SIGTERM graceful-shutdown policy; the repeated E2E pass now leaves no lock or listener.
6. The foreground-launcher test could inspect output before the ready message and orphan its child API on assertion failure. The test now waits for readiness, registers the exit promise before signaling, and always performs graceful cleanup.
7. The second UI test found duplicate headings because the first React tree was still mounted. Added explicit Testing Library cleanup after every test.
8. Node 20 exposed a race where a run record became `success` before automatic verification and artifact writes completed. The scheduler now writes the terminal record last; the API suites pass 10/10 on both the current runtime and Node 20.19.5.
9. Running the evidence verifier against a dry-run correctly produced a non-passing report because no live media or Adobe artifacts exist. The required `--write` verification was then run against the existing live run and passed 30/30.
10. The live acceptance gate exposed that Premiere UXP's `fs.mkdir(..., { recursive: true })` reports `file already exists` for an existing mailbox directory and prevented the subsequent heartbeat write. The bridge now treats only the expected existing-directory condition as success; a regression test covers it, the real plugin was reloaded, and readiness reached 11/11.
11. A Live click could be rejected by a dependency that changed after the UI's initial green check, while the page continued showing the stale green state and only a generic English error. Readiness now has a five-second server expiry; the UI polls, refreshes on focus and immediately before submit, consumes the authoritative 409 snapshot, shows the failed check and remediation in Thai, disables Live, and records a bounded diagnostic without creating a run.
12. The SSE lifecycle regression test initially appeared to show a shutdown hang. The event endpoint was not flushing an empty stream's headers until its first 15-second heartbeat, and there was a short registration race before shutdown cleanup. It now registers cleanup before exposing HTTP 200, flushes headers immediately, closes hijacked SSE sockets during shutdown, and has a deterministic SIGTERM regression test.
13. The first Premiere export attempt used misleadingly named presets: the H264 preset produced QuickTime MOV and the ProRes preset produced MXF. The starter now points to Premiere 2025's MP4 H.264 and MOV ProRes presets, and regression tests assert both container families and output suffixes.
14. Premiere can reject a native export with a non-Error value. The panel previously serialized this as `{ok:false}` without an error string, hiding the actual cause. Host and panel boundaries now normalize opaque failures and identify whether preset inspection or `exportSequence` failed.
15. The normalized live failure proved that Premiere Pro 25.6.4 cannot hand off to the installed Media Encoder 26.2.2. A matching-encoder readiness gate now blocks before mutation and directs the operator to install Media Encoder 2025.
16. Preset/container inspection originally happened after the durable `export-started` receipt. It now runs first, so a bad user-selected preset fails retry-safe without creating a false ambiguous-export fence.
17. Premiere and Media Encoder were moved together to the installed Beta 26.5.0 pair and readiness now enforces the exact configured version rather than only checking that an app bundle exists.
18. Premiere Beta could finish a valid H.264 file while leaving the native `exportSequence()` Promise pending. The bridge no longer treats that Promise as the sole completion barrier.
19. Premiere Beta also omitted the documented in-app completion event in the observed run. Bridge 0.4.4 requires a fresh unique output path and a stable nonzero artifact before committing the completion receipt; this preserves strict sequential export without replaying ambiguous work.
20. The original heartbeat was tied to the job polling loop and appeared stale during long host work. A dedicated guarded heartbeat now advances while the bridge is busy.

## Live acceptance result

- Portrait Story decision: **GO for the first supervised developer/operator user trial**.
- Workflow Studio Premiere export decision: **GO on the pinned Premiere/AME Beta 26.5.0 pair**.
- No failed or retried live steps; every step used attempt 1.
- The Premiere started/completed receipts and job/result mailbox files were cleaned after the durable checkpoint; only the continuously refreshed plugin heartbeat remains.
- The shared Adobe/GPU lease was released. The Control API singleton lock remains intentionally present while the local UI is running.

## Deferred production work

- Package/sign the macOS launcher and Premiere panel when moving beyond developer/operator trials.
- Add production persistence adapters (PostgreSQL/object storage), authentication, and a remote deployment topology only when moving beyond the current loopback workstation deployment.
- Define long-term run/artifact retention after real trial volume is known; current receipt cleanup is exact-generation and post-checkpoint, while run artifacts remain intentionally durable for diagnosis.
