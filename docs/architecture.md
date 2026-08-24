# Architecture

```text
single workflow.json
        |
        v
 Node CLI + validator
        |
        v
 Sequential runner -----> checkpoint/state.json after every node
        |
        +--> local asset/template nodes
        +--> LLM adapter (optional)
        +--> ComfyUI adapter (GPU worker; submit -> poll -> download)
        +--> AE adapter (ExtendScript binding -> aerender)
        +--> Premiere adapter (localhost broker <-> UXP panel)
```

## Resource model

The runner uses a plain `for` loop and never schedules node promises concurrently. A node owns its timeout and cleanup. Remote ComfyUI work must finish before an Adobe node starts. `aerender` is invoked without `-reuse`, so its render process is disposable by default.

## Checkpoint model

Each run has a directory under `settings.runRoot` containing:

- `state.json`: workflow digest, status, node attempts, outputs, and errors
- `<step-id>/`: per-step job payloads and host result files

Resume is allowed only when the current workflow digest matches the checkpoint digest. Successful nodes are skipped and their outputs remain available for interpolation.

## Premiere constraint

Premiere exposes the modern project/sequence DOM through UXP, but UXP entrypoints execute inside the Premiere host. The CLI therefore opens a short-lived HTTP broker on `127.0.0.1`; the included panel polls the broker, performs the DOM operation, and posts the result. The broker never binds to a LAN/public interface.

## AE constraint

AE template mutation uses ExtendScript because it can address project items, layers, footage, and text documents. Rendering is a separate `aerender` node so the mutation host and render process do not overlap with Premiere work.

