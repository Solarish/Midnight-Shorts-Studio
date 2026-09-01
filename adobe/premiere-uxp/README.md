# Premiere UXP bridge

Current bridge protocol: v1 · plugin version 0.4.4. Reload the plugin after updating so TimelineSpec build/export capabilities, busy heartbeat, and staged restart-safe receipts are active.

Load this folder as a plugin with Adobe UXP Developer Tool. The currently accepted host is Premiere Pro Beta 26.5.0 paired with Media Encoder Beta 26.5.0; both are exact-pinned for the first user trial.

## One-time host setup

1. Install **UXP Developer Tool 2.2+** from Adobe Creative Cloud.
2. In Premiere, open **Settings → Plugins**, enable **Developer Mode**, and restart Premiere.
3. In UXP Developer Tool, add `adobe/premiere-uxp/manifest.json` to the workspace.
4. Load the plugin into Premiere Pro.
5. Open **Window → UXP Plugins → PSU AVA Bridge**.
6. The bridge connects automatically when Premiere loads the plugin. The panel button can still pause or resume the connection manually.

Run the local readiness check before opening the host applications:

```bash
npm run prototype:doctor
```

The bridge uses `http://127.0.0.1:47652` where the host permits local HTTP. On macOS,
where Premiere UXP blocks HTTP, it automatically falls back to the local
`/tmp/psu-ava-premiere-bridge` file mailbox.

## Safety and retry behavior

- Every job must provide a distinct `outputProject`; the bridge never falls back to modifying the active project.
- A template job saves an output copy before importing AE compositions or media.
- Project-open warning, locate, and conversion dialogs are disabled through Premiere's `OpenProjectOptions` for the automated open.
- If reporting to the CLI briefly fails, the completed result is retained and retried without assembling the project again.
- The plugin polls the loopback bridge in the background after host startup; the panel does not need to remain open.
- The bridge verifies each imported media item belongs to the new output project before creating the sequence.
- H.264 and ProRes export one at a time. A completion receipt is written only after the exact fresh output is stable and nonzero; an ambiguous started receipt is never replayed automatically.
- The heartbeat runs independently from the job poller so readiness remains observable during long Premiere operations.

Adobe references: [Premiere UXP setup](https://developer.adobe.com/premiere-pro/uxp/plugins/), [plugin installation and Developer Mode](https://developer.adobe.com/premiere-pro/uxp/plugins/distribution/install/), and [Project API](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/project/).
