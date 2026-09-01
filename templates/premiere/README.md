# PSU Cover Text MOGRT contract

The layered Cover Card preset expects `psu-cover-text.mogrt` in this directory (or an absolute path selected in Storyboard).

Expose these editable Essential Graphics parameters exactly:

- `PERSON_NAME` — person name
- `POSITION_TITLE` — position/title
- `AWARD` — award line

The pipeline deliberately fails readiness when the selected MOGRT is missing or any parameter is absent. The text is inserted on V4 and remains editable in Premiere Pro; ComfyUI never renders these fields.

## Safe generator

Preview the operation first (this is the default and does not launch Adobe):

```bash
npm run cover:text-mogrt
```

When operator Adobe sessions are closed, generate with a separate pinned stable After Effects 2026 instance:

```bash
npm run cover:text-mogrt -- --execute \
  --app "/Applications/Adobe After Effects 2026/Adobe After Effects 2026.app"
```

If the generated output already exists, replacement requires explicit `--overwrite`. Adobe After Effects Beta paths are refused. The host script also refuses any saved, populated, or dirty project before its first mutation, saves its isolated generator project before export, writes a receipt, and never quits After Effects.
