import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cloneVisualWorkflow, createVisualWorkflow, deleteVisualWorkflow, instantiateWorkflowPackage, listVisualWorkflows, listWorkflowPackages } from "./graph-api";
import type { VisualWorkflow, WorkflowPackage } from "./graph-types";
import { createStoryboardFromDocx, DEFAULT_DOCUMENTARY_DOCX, listStoryboards } from "./storyboard-api";
import type { Storyboard } from "./storyboard-types";

export const APP_VERSION = "0.2.0";
export const BUILD_TIMESTAMP = "2026-08-27 16:15:00";

export function GraphShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="graph-shell">
      <header className="graph-topbar">
        <Link to="/" className="graph-brand">
          <span>AVA</span>
          <strong>Workflow Studio</strong>
          <span style={{ fontSize: "11px", opacity: 0.8, marginLeft: "8px", padding: "2px 6px", background: "rgba(255,255,255,0.1)", borderRadius: "4px" }}>
            v{APP_VERSION} · {BUILD_TIMESTAMP}
          </span>
        </Link>
        <nav aria-label="Workflow Studio">
          <Link to="/">Workflow Catalog</Link>
          <Link to="/">Storyboards</Link>
          <Link to="/runs">Run Monitor</Link>
          <Link to="/recipes/portrait-story">Portrait Guided Form</Link>
        </nav>
      </header>
      {children}
    </div>
  );
}

export default function WorkflowCatalogPage() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<VisualWorkflow[]>([]);
  const [packages, setPackages] = useState<WorkflowPackage[]>([]);
  const [storyboards, setStoryboards] = useState<Storyboard[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { const [nextWorkflows, nextPackages, nextStoryboards] = await Promise.all([listVisualWorkflows(), listWorkflowPackages(), listStoryboards()]); setWorkflows(nextWorkflows); setPackages(nextPackages); setStoryboards(nextStoryboards); }
    catch (cause: any) { setError(endpointMessage(cause)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function create(event: FormEvent) {
    event.preventDefault(); if (!name.trim()) return;
    setCreating(true); setError("");
    try { const workflow = await createVisualWorkflow({ name: name.trim() }); navigate(`/workflows/${workflow.id}/edit`); }
    catch (cause: any) { setError(endpointMessage(cause)); }
    finally { setCreating(false); }
  }

  async function clone(workflow: VisualWorkflow) {
    setError("");
    try { const copy = await cloneVisualWorkflow(workflow.id); navigate(`/workflows/${copy.id}/edit`); }
    catch (cause: any) { setError(endpointMessage(cause)); }
  }

  async function remove(workflow: VisualWorkflow) {
    if (!window.confirm(`Delete workflow "${workflow.name}"?`)) return;
    setDeletingId(workflow.id);
    setError("");
    try {
      await deleteVisualWorkflow(workflow.id);
      setWorkflows((prev) => prev.filter((item) => item.id !== workflow.id));
    } catch (cause: any) {
      setError(endpointMessage(cause));
    } finally {
      setDeletingId(null);
    }
  }

  async function usePackage(workflowPackage: WorkflowPackage) {
    setCreating(true); setError("");
    try { const workflow = await instantiateWorkflowPackage(workflowPackage.packageId); navigate(`/workflows/${workflow.id}/edit`); }
    catch (cause: any) { setError(endpointMessage(cause)); }
    finally { setCreating(false); }
  }

  async function openOrLaunchDocumentary() {
    setCreating(true);
    setError("");
    try {
      const existing = storyboards.find((value) => value.sourceImport.docxPath === DEFAULT_DOCUMENTARY_DOCX);
      if (existing) {
        navigate(`/storyboards/${existing.storyboardId}/edit`);
      } else {
        const storyboard = await createStoryboardFromDocx(DEFAULT_DOCUMENTARY_DOCX, "สารคดี อาจารย์ตัวอย่าง 69");
        navigate(`/storyboards/${storyboard.storyboardId}/edit`);
      }
    } catch (cause: any) {
      setError(endpointMessage(cause));
    } finally {
      setCreating(false);
    }
  }

  return <GraphShell><main className="workflow-catalog"><header className="catalog-heading"><div><p className="eyebrow"><span>ADMIN · VISUAL WORKFLOWS</span><span style={{ marginLeft: "8px", opacity: 0.85, fontSize: "11px", padding: "2px 6px", background: "rgba(255,255,255,0.1)", borderRadius: "4px" }}>v{APP_VERSION} · {BUILD_TIMESTAMP}</span></p><h1>Workflow catalog</h1><p>Create and govern reusable DAG workflows. The existing Guided Form remains available for portrait-story operators.</p></div><button className="button secondary" onClick={() => void load()} disabled={loading}>Refresh</button></header>
    {error && <section className="graph-unavailable" role="alert"><strong>Graph authoring API is unavailable</strong><p>{error}</p><small>Expected endpoints begin at <code>/api/v1/workflows</code> and <code>/api/v1/node-types</code>. Guided Form and Run Monitor are unaffected.</small></section>}

    {/* Featured Master Documentary Spotlight */}
    <section
      className="card featured-documentary-spotlight"
      style={{
        background: "linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))",
        border: "2px solid #3b82f6",
        borderRadius: "12px",
        padding: "20px 24px",
        marginBottom: "24px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.4), 0 0 20px rgba(59, 130, 246, 0.2)"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <span className="workflow-badge published" style={{ background: "#2563eb", color: "#fff" }}>
              ⭐ STORYBOARD-FIRST DOCUMENTARY
            </span>
            <span style={{ color: "#94a3b8", fontSize: "12px" }}>StoryboardSpec v2 · 16:9 Broadcast · 25fps</span>
          </div>
          <h2 style={{ fontSize: "20px", color: "#f8fafc", margin: "4px 0 8px 0" }}>
            🎬 สารคดี อาจารย์ตัวอย่าง 69 (Full Broadcast Master)
          </h2>
          <p style={{ color: "#cbd5e1", fontSize: "13px", lineHeight: "1.5", margin: 0, maxWidth: "780px" }}>
            DOCX เป็นข้อมูลตั้งต้น แล้วให้ผู้ตัดต่อจัดลำดับ แก้ timecode เลือก 3D title, cover card และ B-roll พร้อมกำหนด audio policy ก่อนอนุมัติและ compile เป็น read-only backend graph
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            className="button primary"
            onClick={openOrLaunchDocumentary}
            disabled={creating}
            style={{
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              fontWeight: 700,
              fontSize: "14px",
              padding: "10px 20px",
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.4)",
              cursor: "pointer"
            }}
          >
            {creating ? "กำลังเปิด..." : "🎬 เปิด Storyboard Editor"}
          </button>
        </div>
      </div>
    </section>

    {storyboards.length > 0 && <section className="starter-packages"><h2>Documentary storyboards</h2><div className="workflow-cards">{storyboards.map((storyboard) => <article className="workflow-card card" key={storyboard.storyboardId}><div><span className={`workflow-badge ${storyboard.status === "approved" ? "published" : "draft"}`}>{storyboard.status}</span><h2><Link to={`/storyboards/${storyboard.storyboardId}/edit`}>{storyboard.name}</Link></h2><p>{storyboard.items.length} editorial items · source revision {storyboard.revision}</p></div><dl><div><dt>Profile</dt><dd>1080p25</dd></div><div><dt>Approved</dt><dd>{storyboard.approvedVersion ? `v${storyboard.approvedVersion}` : "—"}</dd></div></dl><Link className="button primary" to={`/storyboards/${storyboard.storyboardId}/edit`}>Open storyboard</Link></article>)}</div></section>}

    {packages.length > 0 && <section className="starter-packages"><h2>Starter packages</h2><div className="workflow-cards">{packages.map((item) => <article className="workflow-card card" key={item.packageId}><div><span className="workflow-badge published">v{item.version}</span><h2>{item.name}</h2><p>{item.description}</p></div><dl><div><dt>Profile</dt><dd>{item.profile}</dd></div><div><dt>Duration</dt><dd>{item.durationFrames / 25}s</dd></div><div><dt>Nodes</dt><dd>{item.nodeCount}</dd></div></dl><button className="button primary" onClick={() => void usePackage(item)} disabled={creating}>Use starter</button></article>)}</div></section>}
    <form className="catalog-create card" onSubmit={create}><label htmlFor="workflow-name">New workflow name</label><input id="workflow-name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Weekly campus recap"/><button className="button primary" disabled={creating}>{creating ? "Creating…" : "Create workflow"}</button></form>
    {loading ? <p className="loading" role="status">Loading workflows…</p> : workflows.length ? <div className="workflow-cards">{workflows.map((workflow) => <article className="workflow-card card" key={workflow.id}><div><span className={`workflow-badge ${workflow.status}`}>{workflow.status}</span><h2><Link to={`/workflows/${workflow.id}/edit`}>{workflow.name}</Link></h2><p>{workflow.description || "No description"}</p></div><dl><div><dt>Revision</dt><dd>{workflow.revision}</dd></div><div><dt>Nodes</dt><dd>{workflow.nodes?.length ?? 0}</dd></div><div><dt>Updated</dt><dd>{workflow.updatedAt ? new Date(workflow.updatedAt).toLocaleString() : "—"}</dd></div></dl><div className="workflow-card-actions"><Link className="button secondary" to={`/workflows/${workflow.id}/edit`}>Open editor</Link><button className="button secondary" onClick={() => void clone(workflow)}>Clone</button><button className="button secondary danger" style={{ color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.4)" }} onClick={() => void remove(workflow)} disabled={deletingId === workflow.id}>{deletingId === workflow.id ? "Deleting…" : "Delete"}</button></div></article>)}</div> : !error && <p className="empty">No visual workflows yet.</p>}
  </main></GraphShell>;
}

function endpointMessage(cause: any) {
  return cause?.status === 404 ? "This Control API does not expose the visual workflow endpoints yet." : cause?.message ?? "Unable to reach the visual workflow service.";
}
