type CoverPreviewParams = Record<string, unknown>;

import { renderCoverPrompt } from "./CoverPromptPartsEditor";

function streamUrl(path: string) { return `/api/v1/media/stream?path=${encodeURIComponent(path)}`; }

export function CoverCardOutputPreview({ params, onSelectHistory }: { params: CoverPreviewParams; onSelectHistory?: (entry: Record<string, unknown>, key: string) => void }) {
  const outputs = [
    { key: "backgroundImage", label: "ComfyUI background" },
    { key: "doodleImage", label: "ComfyUI doodle / alpha" },
    { key: "personImage", label: "Person cutout" }
  ].map(({ key, label }) => ({ key, label, path: String(params[key] ?? "").trim() })).filter((item) => item.path);
  const userPrompt = String(params.prompt ?? "").trim();
  const doodlePrompt = String(params.doodlePrompt ?? "").trim();
  const promptParts = (params.promptParts ?? {}) as Record<string, string>;
  const history = Array.isArray(params.outputHistory) ? params.outputHistory as Array<Record<string, unknown>> : [];
  return <section className="cover-output-preview" aria-label="Cover Card ComfyUI output preview">
    <header><div><h3>Output preview</h3><small>Real files returned by the current node run</small></div><span>{outputs.length ? `${outputs.length} outputs` : "No generated output yet"}</span></header>
    {outputs.length ? <div className="cover-output-grid">{outputs.map((output) => <figure key={output.key}><img src={streamUrl(output.path)} alt={output.label}/><figcaption><strong>{output.label}</strong><code title={output.path}>{output.path.split(/[\\/]/).filter(Boolean).at(-1)}</code></figcaption></figure>)}</div> : <p className="cover-output-empty">Run this Cover Card node to populate real ComfyUI output paths here.</p>}
    {history.length > 0 && <details className="cover-output-history"><summary>Image history ({history.length}) · choose per layer</summary><div className="cover-history-grid">{history.flatMap((entry, index) => outputs.map((output) => ({ entry, index, output, path: String(entry[output.key] ?? "").trim() }))).filter((item) => item.path).map(({ entry, index, output, path }) => <figure key={`${String(entry.runId)}-${output.key}-${index}`}><img src={streamUrl(path)} alt={`${output.label} history ${index + 1}`}/><figcaption><strong>{output.label}</strong><small>{new Date(String(entry.createdAt)).toLocaleTimeString()}</small><button type="button" onClick={() => onSelectHistory?.(entry, output.key)}>Use this</button></figcaption></figure>)}</div><small>Each layer can restore an independent real output.</small></details>}
    <details className="cover-prompt-template"><summary>View prompt template used by the node</summary><div><label>Grouped background template<pre>{renderCoverPrompt(promptParts, userPrompt)}</pre></label><label>Prompt parts<pre>{JSON.stringify(promptParts, null, 2)}</pre></label>{params.doodleEnabled === true && <label>Doodle direction<pre>{doodlePrompt || "(empty)"}</pre></label>}</div></details>
  </section>;
}
