# PSU Automated Video Assembly

A CLI-driven, sequential video assembly pipeline that coordinates image selection, ComfyUI, optional LLM steps, After Effects templates, and Premiere Pro assembly from one JSON file.

The pipeline is deliberately sequential: only one node runs at a time, and each successful node writes a checkpoint before the next node begins. This keeps RAM/VRAM usage predictable and allows a failed run to resume.

## Current baseline

- Premiere Pro 25.6+ is controlled through the included UXP bridge panel.
- After Effects template binding uses ExtendScript; final AE rendering uses `aerender`.
- ComfyUI defaults to the existing internal GPU worker at `http://10.135.66.70:8188`.
- LLM steps support Ollama and OpenAI-compatible chat endpoints.
- No credentials are stored in workflow files.

## Quick start

```bash
node ./src/cli.js validate ./examples/assembly.workflow.json
node ./src/cli.js run ./examples/assembly.workflow.json --dry-run
node ./src/cli.js run ./examples/assembly.workflow.json
node ./src/cli.js run ./examples/prototype.workflow.json --to generate_background
```

Create the included AE prototype template once:

```bash
npm run prototype:template
```

Resume a failed run:

```bash
node ./src/cli.js run ./examples/assembly.workflow.json --resume ./.pipeline-runs/<run-id>
```

Start at a specific step while still preserving prior checkpoint outputs:

```bash
node ./src/cli.js run ./examples/assembly.workflow.json --resume ./.pipeline-runs/<run-id> --from ae_bind
```

## Node types

| Type | Purpose |
|---|---|
| `asset.select` | Resolve and verify a source image/video path |
| `image.removeBackground` | Remove a person background locally with Apple Vision |
| `template.payload` | Produce fixed text/asset bindings without generation |
| `llm.chat` | Optional structured LLM assistance |
| `comfyui.workflow` | Upload inputs, patch an API workflow, submit, poll, and download outputs |
| `ae.template` | Bind footage and fixed text into an AE template project |
| `ae.render` | Render one AE composition with `aerender` |
| `premiere.assemble` | Send an assembly job to the local Premiere UXP bridge |

Values can reference earlier outputs. An exact reference preserves its original type:

```json
"path": "${steps.remove_background.outputs.images.0.localPath}"
```

## Project layout

```text
src/                       CLI, runner, and adapters
schema/                    JSON Schema for the single workflow config
examples/                  Dry-run-safe example workflow
workflows/                 Exported ComfyUI API workflows go here
templates/                 AE/PR template placeholders and binding maps
adobe/after-effects/       ExtendScript host script
adobe/premiere-uxp/        Premiere bridge panel
test/                      Node tests
```

## Important host behavior

`aerender` normally launches a render instance and closes it when finished, which fits the sequential resource policy. AE template binding and the Premiere UXP bridge operate inside their host applications. The pipeline does not force-quit either host because that could destroy unsaved work.

The AE binding script refuses to run if AE already contains project items. Start with a clean/dedicated AE session so automation cannot replace a user's open project.

Premiere UXP commands and panels run inside Premiere, not as a truly headless CLI. Load the bridge once with Adobe UXP Developer Tool, open **Window → UXP Plugins → PSU AVA Bridge**, and connect it before a `premiere.assemble` node begins.
