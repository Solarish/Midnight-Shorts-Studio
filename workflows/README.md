# ComfyUI workflows

Export each ComfyUI graph in **API format** and store it here. Node IDs in the exported JSON are used by `patches` and `uploads[].patch` in the single pipeline config.

Recommended initial graphs:

- `remove-background.api.json`
- `generate-background.api.json`
- `doodle-composite.api.json` (only if doodle compositing is not handled in AE)

Do not store API keys or user credentials in these files.

