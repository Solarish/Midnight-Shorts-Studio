import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cloneVisualWorkflow, createVisualWorkflow, deleteVisualWorkflow, instantiateWorkflowPackage, listVisualWorkflows, listWorkflowPackages } from "./graph-api";
import type { VisualWorkflow, WorkflowPackage } from "./graph-types";
import { cloneStoryboard, createStoryboardFromDocx, DEFAULT_DOCUMENTARY_DOCX, deleteStoryboard, listStoryboards } from "./storyboard-api";
import type { Storyboard } from "./storyboard-types";
import { CreateStoryboardModal } from "./components/CreateStoryboardModal";

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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { const [nextWorkflows, nextPackages, nextStoryboards] = await Promise.all([listVisualWorkflows(), listWorkflowPackages(), listStoryboards().catch(() => [])]); setWorkflows(nextWorkflows); setPackages(nextPackages); setStoryboards(Array.isArray(nextStoryboards) ? nextStoryboards : []); }
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

  const [storyboardSearch, setStoryboardSearch] = useState("");
  const [storyboardFilter, setStoryboardFilter] = useState<"all" | "draft" | "approved">("all");

  async function handleCloneStoryboard(storyboard: Storyboard) {
    setError("");
    setCreating(true);
    try {
      const copy = await cloneStoryboard(storyboard.storyboardId);
      setStoryboards((prev) => [copy, ...prev]);
    } catch (cause: any) {
      setError(endpointMessage(cause));
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteStoryboard(storyboard: Storyboard) {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ Storyboard "${storyboard.name}"?\nข้อมูลการตัดต่อและแคชที่เกี่ยวข้องทั้งหมดจะถูกลบถาวร`)) return;
    setError("");
    setDeletingId(storyboard.storyboardId);
    try {
      await deleteStoryboard(storyboard.storyboardId);
      setStoryboards((prev) => prev.filter((item) => item.storyboardId !== storyboard.storyboardId));
    } catch (cause: any) {
      setError(endpointMessage(cause));
    } finally {
      setDeletingId(null);
    }
  }

  const safeStoryboards = Array.isArray(storyboards) ? storyboards : [];
  const filteredStoryboards = safeStoryboards.filter((item) => {
    if (storyboardFilter === "draft" && item.status !== "draft") return false;
    if (storyboardFilter === "approved" && item.status !== "approved") return false;
    if (storyboardSearch.trim()) {
      const q = storyboardSearch.toLowerCase();
      return (item?.name || "").toLowerCase().includes(q) || (item?.sourceImport?.docxPath || "").toLowerCase().includes(q);
    }
    return true;
  });

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
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="button primary"
            onClick={() => setIsCreateModalOpen(true)}
            style={{
              background: "linear-gradient(135deg, #10B981, #059669)",
              fontWeight: 700,
              fontSize: "14px",
              padding: "10px 20px",
              boxShadow: "0 4px 14px rgba(16, 185, 129, 0.4)",
              cursor: "pointer",
              border: "none",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <span>➕</span> สร้าง Storyboard ใหม่จาก DOCX
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={openOrLaunchDocumentary}
            disabled={creating}
            style={{
              borderColor: "rgba(59, 130, 246, 0.5)",
              color: "#60A5FA",
              fontWeight: 600,
              fontSize: "13px",
              padding: "9px 16px"
            }}
          >
            {creating ? "กำลังเปิด..." : "🎬 เปิดโปรเจกต์ตัวอย่าง (อ.เกวลิน)"}
          </button>
        </div>
      </div>
    </section>

    <section className="documentary-storyboards-catalog">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "32px 0 16px 0", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ margin: 0 }}>Documentary Storyboards</h2>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#94A3B8" }}>
            โปรเจกต์สตอรี่บอร์ดสารคดีทั้งหมดที่สร้างจากไฟล์ DOCX ในสตูดิโอ ({filteredStoryboards.length}/{storyboards.length})
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="🔍 ค้นหา Storyboard..."
            value={storyboardSearch}
            onChange={(e) => setStoryboardSearch(e.target.value)}
            style={{
              padding: "6px 12px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "6px",
              color: "#fff",
              fontSize: "13px",
              minWidth: "200px"
            }}
          />
          <div style={{ display: "inline-flex", background: "rgba(255,255,255,0.05)", borderRadius: "6px", padding: "2px", border: "1px solid rgba(255,255,255,0.1)" }}>
            <button
              type="button"
              onClick={() => setStoryboardFilter("all")}
              style={{
                padding: "4px 10px",
                fontSize: "12px",
                border: "none",
                borderRadius: "4px",
                background: storyboardFilter === "all" ? "rgba(255,255,255,0.2)" : "transparent",
                color: "#fff",
                cursor: "pointer"
              }}
            >
              ทั้งหมด
            </button>
            <button
              type="button"
              onClick={() => setStoryboardFilter("draft")}
              style={{
                padding: "4px 10px",
                fontSize: "12px",
                border: "none",
                borderRadius: "4px",
                background: storyboardFilter === "draft" ? "rgba(255,255,255,0.2)" : "transparent",
                color: "#fff",
                cursor: "pointer"
              }}
            >
              ร่าง
            </button>
            <button
              type="button"
              onClick={() => setStoryboardFilter("approved")}
              style={{
                padding: "4px 10px",
                fontSize: "12px",
                border: "none",
                borderRadius: "4px",
                background: storyboardFilter === "approved" ? "rgba(16, 185, 129, 0.4)" : "transparent",
                color: "#fff",
                cursor: "pointer"
              }}
            >
              อนุมัติแล้ว
            </button>
          </div>
          <button
            type="button"
            className="button secondary"
            onClick={() => setIsCreateModalOpen(true)}
            style={{
              borderColor: "rgba(16, 185, 129, 0.5)",
              color: "#34D399",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <span>➕</span> สร้าง Storyboard ใหม่
          </button>
        </div>
      </div>
      {filteredStoryboards.length > 0 ? (
        <div className="workflow-cards">
          {filteredStoryboards.map((storyboard) => (
            <article className="workflow-card card" key={storyboard.storyboardId}>
              <div>
                <span className={`workflow-badge ${storyboard.status === "approved" ? "published" : "draft"}`}>
                  {storyboard.status}
                </span>
                <h2>
                  <Link to={`/storyboards/${storyboard.storyboardId}/edit`}>{storyboard.name}</Link>
                </h2>
                <p>
                  {storyboard.items.length} editorial items · source revision {storyboard.revision}
                </p>
              </div>
              <dl>
                <div>
                  <dt>Profile</dt>
                  <dd>1080p25</dd>
                </div>
                <div>
                  <dt>Approved</dt>
                  <dd>{storyboard.approvedVersion ? `v${storyboard.approvedVersion}` : "—"}</dd>
                </div>
              </dl>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "16px" }}>
                <Link
                  className="button primary"
                  to={`/storyboards/${storyboard.storyboardId}/edit`}
                  style={{ flex: "1 1 auto", textAlign: "center" }}
                >
                  🎬 เปิดตัดต่อ
                </Link>
                <button
                  type="button"
                  className="button secondary"
                  title="ทำสำเนา Storyboard นี้"
                  onClick={() => handleCloneStoryboard(storyboard)}
                  disabled={creating}
                  style={{ padding: "6px 10px" }}
                >
                  📋 สำเนา
                </button>
                <button
                  type="button"
                  className="button secondary"
                  title="ลบ Storyboard นี้"
                  onClick={() => handleDeleteStoryboard(storyboard)}
                  disabled={deletingId === storyboard.storyboardId}
                  style={{ padding: "6px 10px", color: "#EF4444", borderColor: "rgba(239, 68, 68, 0.3)" }}
                >
                  🗑️
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: "32px", textAlign: "center", color: "#94A3B8" }}>
          <p style={{ fontSize: "15px", margin: "0 0 16px 0" }}>ยังไม่มี Storyboard ที่ถูกสร้างขึ้นในระบบ</p>
          <button
            type="button"
            className="button primary"
            onClick={() => setIsCreateModalOpen(true)}
            style={{
              background: "linear-gradient(135deg, #10B981, #059669)",
              fontWeight: 700,
              padding: "10px 22px"
            }}
          >
            ➕ เลือกไฟล์ DOCX และสร้าง Storyboard แรก
          </button>
        </div>
      )}
    </section>

    {packages.length > 0 && <section className="starter-packages"><h2>Starter packages</h2><div className="workflow-cards">{packages.map((item) => <article className="workflow-card card" key={item.packageId}><div><span className="workflow-badge published">v{item.version}</span><h2>{item.name}</h2><p>{item.description}</p></div><dl><div><dt>Profile</dt><dd>{item.profile}</dd></div><div><dt>Duration</dt><dd>{item.durationFrames / 25}s</dd></div><div><dt>Nodes</dt><dd>{item.nodeCount}</dd></div></dl><button className="button primary" onClick={() => void usePackage(item)} disabled={creating}>Use starter</button></article>)}</div></section>}
    <form className="catalog-create card" onSubmit={create}><label htmlFor="workflow-name">New workflow name</label><input id="workflow-name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Weekly campus recap"/><button className="button primary" disabled={creating}>{creating ? "Creating…" : "Create workflow"}</button></form>
    {loading ? <p className="loading" role="status">Loading workflows…</p> : workflows.length ? <div className="workflow-cards">{workflows.map((workflow) => <article className="workflow-card card" key={workflow.id}><div><span className={`workflow-badge ${workflow.status}`}>{workflow.status}</span><h2><Link to={`/workflows/${workflow.id}/edit`}>{workflow.name}</Link></h2><p>{workflow.description || "No description"}</p></div><dl><div><dt>Revision</dt><dd>{workflow.revision}</dd></div><div><dt>Nodes</dt><dd>{workflow.nodes?.length ?? 0}</dd></div><div><dt>Updated</dt><dd>{workflow.updatedAt ? new Date(workflow.updatedAt).toLocaleString() : "—"}</dd></div></dl><div className="workflow-card-actions"><Link className="button secondary" to={`/workflows/${workflow.id}/edit`}>Open editor</Link><button className="button secondary" onClick={() => void clone(workflow)}>Clone</button><button className="button secondary danger" style={{ color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.4)" }} onClick={() => void remove(workflow)} disabled={deletingId === workflow.id}>{deletingId === workflow.id ? "Deleting…" : "Delete"}</button></div></article>)}</div> : !error && <p className="empty">No visual workflows yet.</p>}

    <CreateStoryboardModal
      isOpen={isCreateModalOpen}
      onClose={() => {
        setIsCreateModalOpen(false);
        void load();
      }}
    />
  </main></GraphShell>;
}

function endpointMessage(cause: any) {
  return cause?.status === 404 ? "This Control API does not expose the visual workflow endpoints yet." : cause?.message ?? "Unable to reach the visual workflow service.";
}
