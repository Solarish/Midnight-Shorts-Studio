# Automated Video Assembly — Agent Rules

## Non-negotiable architecture

- The CLI accepts one JSON workflow as its source of truth.
- Workflow steps execute sequentially. Do not introduce parallel node execution.
- Keep Adobe, ComfyUI, and LLM integrations behind adapters.
- Fixed text and visual templates are data-bound; an LLM must not rewrite them unless a workflow explicitly contains an LLM step.
- Never place credentials in workflow JSON. Read secrets from environment variables.
- Do not expose a new public service. The Premiere bridge binds to `127.0.0.1` only.
- Do not automatically quit an Adobe host that may contain a user's unsaved work.
- A failed step must leave a checkpoint that can be resumed.

## Compatibility baseline

- Node.js 20+
- Premiere Pro 25.6+ using UXP
- After Effects using ExtendScript for template binding and `aerender` for rendering
- ComfyUI API workflow format (`/prompt`, `/history`, `/view`, `/upload/image`)

## Verification

Run these before handing off a change:

```bash
npm test
npm run validate
npm run dry-run
```

