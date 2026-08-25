# Prototype Checkpoint

Updated: 2026-08-25 14:15:00 +07

## Status

The live single-JSON, sequential AE + Premiere prototype is complete and verified.

Successful run:

```text
prototype-runs/ava_prototype-2026-08-25T06-32-46-480Z-7cf5cce1/
```

Final acceptance command:

```bash
npm run prototype:verify -- ./prototype-runs/ava_prototype-2026-08-25T06-32-46-480Z-7cf5cce1 --write
```

Result: `30/30 checks passed`; `prototype-evidence.json` contains `"ok": true`.

## Proven live pipeline

All seven nodes completed in sequence:

1. `select_presenter`
2. `remove_background`
3. `generate_background`
4. `fixed_design`
5. `ae_bind`
6. `ae_render`
7. `premiere_assembly`

Verified outputs include:

- RGBA presenter cutout: `1202120` bytes, `1024x1536`
- generated background: `687250` bytes, `768x1344`
- assembled After Effects project: `198192` bytes
- AE master render: `454875082` bytes, `1080x1920`, 5 seconds
- Premiere project: `10731` bytes
- Premiere sequence: `AVA_PROTOTYPE`
- Premiere sequence GUID: `a5d54bfc-ddcc-4760-945e-0c0799f06c6c`
- imported media path matches the verified AE render exactly

## Host compatibility completed

- After Effects scripting file/network access is enabled and the AE bind milestone log reaches `project-closed`.
- Premiere UXP Developer Mode is enabled and `PSU AVA Bridge` is loaded through Adobe UXP Developer Tools 2.2.1.
- macOS Premiere UXP blocks plain HTTP loopback, so the bridge now falls back to the local `/tmp/psu-ava-premiere-bridge` mailbox while retaining the HTTP broker for compatible hosts and tests.
- Premiere 25.6.4 omits the documented static `ClipProjectItem.findItemsMatchingMediaPath` at runtime. The plugin now traverses the output project's bins through `FolderItem.getItems()` as a compatible fallback.
- Native Premiere `Guid` values are converted to strings before checkpoint serialization.
- A successful resume clears stale workflow and step errors from prior failed attempts.

## Verification

```text
npm test
13 passed, 0 failed

npm run prototype:verify -- <run-dir> --write
30 passed, 0 failed
```

The run directory also retains recovery artifacts from the two diagnosed attempts:

- `renders/prototype-master.interrupted-complete.mov`
- `adobe/prototype-final.failed-static-api.prproj`
- `adobe/prototype-final.pre-guid-fix.prproj`

They are not referenced by the successful checkpoint or final evidence.
