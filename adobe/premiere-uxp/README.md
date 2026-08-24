# Premiere UXP bridge

Load this folder as a plugin with Adobe UXP Developer Tool. The installed Premiere version must be 25.6 or newer.

## One-time host setup

1. Install **UXP Developer Tool 2.2+** from Adobe Creative Cloud.
2. In Premiere, open **Settings → Plugins**, enable **Developer Mode**, and restart Premiere.
3. In UXP Developer Tool, add `adobe/premiere-uxp/manifest.json` to the workspace.
4. Load the plugin into Premiere Pro.
5. Open **Window → UXP Plugins → PSU AVA Bridge**.
6. Click **Connect** before the CLI reaches a `premiere.assemble` node.

Run the local readiness check before opening the host applications:

```bash
npm run prototype:doctor
```

The bridge only connects to `http://127.0.0.1:47652`.

## Safety and retry behavior

- Every job must provide a distinct `outputProject`; the bridge never falls back to modifying the active project.
- A template job saves an output copy before importing AE compositions or media.
- Project-open warning, locate, and conversion dialogs are disabled through Premiere's `OpenProjectOptions` for the automated open.
- If reporting to the CLI briefly fails, the completed result is retained and retried without assembling the project again.
- The bridge verifies each imported media item belongs to the new output project before creating the sequence.

Adobe references: [Premiere UXP setup](https://developer.adobe.com/premiere-pro/uxp/plugins/), [plugin installation and Developer Mode](https://developer.adobe.com/premiere-pro/uxp/plugins/distribution/install/), and [Project API](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/project/).
