import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Run } from "./api";
import { ApprovalModal } from "./components/ApprovalModal";
import { APP_VERSION, BUILD_TIMESTAMP } from "./WorkflowCatalogPage";

export default function RunsListPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "success" | "failed">("all");
  const [activeApprovalRun, setActiveApprovalRun] = useState<Run | null>(null);

  async function fetchRuns() {
    try {
      const list = await api<Run[]>("/api/v1/runs");
      setRuns(list);
    } catch {
      // Ignore network errors on polling
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchRuns();
    const timer = setInterval(() => void fetchRuns(), 3000);
    return () => clearInterval(timer);
  }, []);

  const waitingApprovalRun = runs.find((r) => r.status === "waiting_approval");
  const activeRuns = runs.filter((r) => ["running", "queued", "waiting_approval"].includes(r.status));
  const successRuns = runs.filter((r) => r.status === "success");
  const failedRuns = runs.filter((r) => ["failed", "partial", "needs_attention"].includes(r.status));

  const filteredRuns = runs.filter((r) => {
    if (filter === "active") return ["running", "queued", "waiting_approval"].includes(r.status);
    if (filter === "success") return r.status === "success";
    if (filter === "failed") return ["failed", "partial", "needs_attention"].includes(r.status);
    return true;
  });

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
          <Link to="/runs" style={{ color: "#38bdf8", fontWeight: 700, borderBottom: "2px solid #38bdf8", paddingBottom: "4px" }}>
            Run Monitor
          </Link>
          <Link to="/recipes/portrait-story">Portrait Guided Form</Link>
        </nav>
      </header>

      <main style={{ maxWidth: "1280px", margin: "0 auto", padding: "28px 24px" }}>
        {/* Top Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                📊 Run Monitor & Execution History
              </h1>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", background: "rgba(34, 197, 94, 0.15)", color: "#4ade80", padding: "3px 10px", borderRadius: "12px", border: "1px solid rgba(34, 197, 94, 0.3)" }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#4ade80", animation: "pulse 1.5s infinite" }} />
                Live Polling (3s)
              </span>
            </div>
            <p style={{ margin: "6px 0 0 0", color: "#94a3b8", fontSize: "14px" }}>
              ตรวจสอบความคืบหน้าของกระบวนการเรนเดอร์, จัดการการตรวจอนุมัติ (Approval Gate) และดูประวัติการรันทั้งหมด
            </p>
          </div>
          <Link to="/" className="button ghost" style={{ border: "1px solid rgba(255,255,255,0.15)", padding: "8px 16px" }}>
            ← กลับไป Workflow Catalog
          </Link>
        </div>

        {/* Action Banner for Waiting Approval */}
        {waitingApprovalRun && (
          <div
            style={{
              background: "linear-gradient(90deg, rgba(245, 158, 11, 0.2) 0%, rgba(217, 119, 6, 0.1) 100%)",
              border: "1px solid #f59e0b",
              borderRadius: "10px",
              padding: "18px 22px",
              marginBottom: "24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              boxShadow: "0 4px 20px rgba(245, 158, 11, 0.15)"
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "20px" }}>⚠️</span>
                <strong style={{ color: "#fbbf24", fontSize: "16px" }}>
                  มีงานรอการตรวจอนุมัติ B-Roll (Operator Approval Required)
                </strong>
                <span style={{ background: "#78350f", color: "#fef3c7", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px" }}>
                  {waitingApprovalRun.projectName}
                </span>
              </div>
              <p style={{ margin: "6px 0 0 0", color: "#fde68a", fontSize: "13px" }}>
                ระบบตัดต่อหยุดพักที่จุดตรวจอนุมัติเพื่อรอให้ท่านยืนยันภาพประกอบ B-Roll และภาพปกก่อนดำเนินขั้นตอนตัดต่อและเรนเดอร์
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                className="button primary"
                style={{ background: "#f59e0b", borderColor: "#d97706", color: "#000", fontWeight: 800, padding: "10px 20px", cursor: "pointer" }}
                onClick={() => setActiveApprovalRun(waitingApprovalRun)}
              >
                👉 ตรวจและอนุมัติทันที
              </button>
              <Link
                to={`/runs/${waitingApprovalRun.runId}`}
                className="button ghost"
                style={{ background: "rgba(0,0,0,0.3)", borderColor: "rgba(255,255,255,0.2)", padding: "10px 16px" }}
              >
                เปิดดูสด ↗
              </Link>
            </div>
          </div>
        )}

        {/* Stats Metrics Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", marginBottom: "24px" }}>
          <div
            onClick={() => setFilter("all")}
            style={{
              background: filter === "all" ? "rgba(56, 189, 248, 0.1)" : "rgba(30, 41, 59, 0.6)",
              border: `1px solid ${filter === "all" ? "#38bdf8" : "rgba(255,255,255,0.08)"}`,
              borderRadius: "8px",
              padding: "14px 18px",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            <span style={{ fontSize: "12px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 600 }}>งานทั้งหมด (Total)</span>
            <div style={{ fontSize: "26px", fontWeight: 800, color: "#f8fafc", marginTop: "4px" }}>{runs.length}</div>
          </div>

          <div
            onClick={() => setFilter("active")}
            style={{
              background: filter === "active" ? "rgba(56, 189, 248, 0.1)" : "rgba(30, 41, 59, 0.6)",
              border: `1px solid ${filter === "active" ? "#38bdf8" : "rgba(255,255,255,0.08)"}`,
              borderRadius: "8px",
              padding: "14px 18px",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            <span style={{ fontSize: "12px", color: "#38bdf8", textTransform: "uppercase", fontWeight: 600 }}>กำลังทำงาน / รออนุมัติ</span>
            <div style={{ fontSize: "26px", fontWeight: 800, color: "#38bdf8", marginTop: "4px" }}>{activeRuns.length}</div>
          </div>

          <div
            onClick={() => setFilter("success")}
            style={{
              background: filter === "success" ? "rgba(34, 197, 94, 0.1)" : "rgba(30, 41, 59, 0.6)",
              border: `1px solid ${filter === "success" ? "#22c55e" : "rgba(255,255,255,0.08)"}`,
              borderRadius: "8px",
              padding: "14px 18px",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            <span style={{ fontSize: "12px", color: "#4ade80", textTransform: "uppercase", fontWeight: 600 }}>สำเร็จเรียบร้อย (Success)</span>
            <div style={{ fontSize: "26px", fontWeight: 800, color: "#4ade80", marginTop: "4px" }}>{successRuns.length}</div>
          </div>

          <div
            onClick={() => setFilter("failed")}
            style={{
              background: filter === "failed" ? "rgba(239, 68, 68, 0.1)" : "rgba(30, 41, 59, 0.6)",
              border: `1px solid ${filter === "failed" ? "#ef4444" : "rgba(255,255,255,0.08)"}`,
              borderRadius: "8px",
              padding: "14px 18px",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            <span style={{ fontSize: "12px", color: "#f87171", textTransform: "uppercase", fontWeight: 600 }}>พบข้อผิดพลาด (Failed)</span>
            <div style={{ fontSize: "26px", fontWeight: 800, color: "#f87171", marginTop: "4px" }}>{failedRuns.length}</div>
          </div>
        </div>

        {/* Filter Navigation Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "18px", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "12px" }}>
          <button
            onClick={() => setFilter("all")}
            className={`button ghost ${filter === "all" ? "primary" : ""}`}
            style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "6px" }}
          >
            ทั้งหมด ({runs.length})
          </button>
          <button
            onClick={() => setFilter("active")}
            className={`button ghost ${filter === "active" ? "primary" : ""}`}
            style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "6px" }}
          >
            กำลังทำงาน ({activeRuns.length})
          </button>
          <button
            onClick={() => setFilter("success")}
            className={`button ghost ${filter === "success" ? "primary" : ""}`}
            style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "6px" }}
          >
            สำเร็จ ({successRuns.length})
          </button>
          <button
            onClick={() => setFilter("failed")}
            className={`button ghost ${filter === "failed" ? "primary" : ""}`}
            style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "6px" }}
          >
            ผิดพลาด ({failedRuns.length})
          </button>
        </div>

        {/* Runs List Cards */}
        {loading && !runs.length ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>กำลังโหลดข้อมูลการรัน…</div>
        ) : !filteredRuns.length ? (
          <div style={{ textAlign: "center", padding: "60px 0", background: "rgba(30, 41, 59, 0.4)", borderRadius: "8px", border: "1px dashed rgba(255,255,255,0.1)" }}>
            <p style={{ color: "#94a3b8", fontSize: "15px", margin: "0 0 14px 0" }}>ไม่พบรายการงานในหมวดหมู่นี้</p>
            <Link to="/" className="button primary" style={{ display: "inline-block" }}>
              ไปเลือก Workflow ที่ต้องการรัน
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {filteredRuns.map((run) => {
              const completedCount = run.steps?.filter((s) => s.status === "success").length ?? 0;
              const totalCount = run.steps?.length || 1;
              const percent = Math.round((completedCount / totalCount) * 100);
              const isActive = ["running", "queued", "waiting_approval"].includes(run.status);

              return (
                <div
                  key={run.runId}
                  style={{
                    background: "rgba(30, 41, 59, 0.7)",
                    border: `1px solid ${
                      run.status === "waiting_approval"
                        ? "#f59e0b"
                        : isActive
                        ? "rgba(56, 189, 248, 0.4)"
                        : "rgba(255, 255, 255, 0.08)"
                    }`,
                    borderRadius: "10px",
                    padding: "16px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    boxShadow: isActive ? "0 4px 20px rgba(0,0,0,0.3)" : "none",
                    transition: "all 0.2s"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          background:
                            run.status === "success"
                              ? "rgba(34, 197, 94, 0.2)"
                              : run.status === "waiting_approval"
                              ? "rgba(245, 158, 11, 0.2)"
                              : run.status === "running"
                              ? "rgba(56, 189, 248, 0.2)"
                              : run.status === "failed"
                              ? "rgba(239, 68, 68, 0.2)"
                              : "rgba(148, 163, 184, 0.2)",
                          color:
                            run.status === "success"
                              ? "#4ade80"
                              : run.status === "waiting_approval"
                              ? "#fbbf24"
                              : run.status === "running"
                              ? "#38bdf8"
                              : run.status === "failed"
                              ? "#f87171"
                              : "#cbd5e1",
                          border: `1px solid ${
                            run.status === "success"
                              ? "rgba(34, 197, 94, 0.4)"
                              : run.status === "waiting_approval"
                              ? "rgba(245, 158, 11, 0.4)"
                              : run.status === "running"
                              ? "rgba(56, 189, 248, 0.4)"
                              : run.status === "failed"
                              ? "rgba(239, 68, 68, 0.4)"
                              : "rgba(148, 163, 184, 0.4)"
                          }`
                        }}
                      >
                        {run.status === "waiting_approval" ? "⚠️ Waiting Approval" : run.status}
                      </span>
                      <strong style={{ fontSize: "16px", color: "#f8fafc" }}>
                        {run.projectName || run.recipeId || "Workflow Execution"}
                      </strong>
                      <span
                        style={{
                          fontSize: "11px",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: run.dryRun ? "rgba(148, 163, 184, 0.15)" : "rgba(34, 197, 94, 0.15)",
                          color: run.dryRun ? "#cbd5e1" : "#4ade80",
                          border: `1px solid ${run.dryRun ? "rgba(148, 163, 184, 0.3)" : "rgba(34, 197, 94, 0.3)"}`
                        }}
                      >
                        {run.dryRun ? "🧪 Dry Run" : "⚡ Live Run"}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      {run.status === "waiting_approval" && run.approval && (
                        <button
                          type="button"
                          className="button primary"
                          style={{ background: "#f59e0b", borderColor: "#d97706", color: "#000", fontWeight: 700, padding: "6px 14px", fontSize: "13px" }}
                          onClick={() => setActiveApprovalRun(run)}
                        >
                          👉 ตรวจอนุมัติ
                        </button>
                      )}
                      <Link
                        to={`/runs/${run.runId}`}
                        className="button ghost"
                        style={{ padding: "6px 14px", fontSize: "13px", border: "1px solid rgba(255,255,255,0.15)" }}
                      >
                        เปิดดู Run Monitor ↗
                      </Link>
                    </div>
                  </div>

                  {/* Progress Bar & Details */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                      <span style={{ fontFamily: "monospace", fontSize: "11px" }}>{run.runId}</span>
                      <span>
                        ความคืบหน้า: <strong>{completedCount}/{totalCount} ขั้นตอน</strong> ({percent}%)
                      </span>
                    </div>
                    <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${percent}%`,
                          height: "100%",
                          background:
                            run.status === "failed"
                              ? "#ef4444"
                              : run.status === "waiting_approval"
                              ? "#f59e0b"
                              : run.status === "success"
                              ? "#22c55e"
                              : "#38bdf8",
                          transition: "width 0.3s ease"
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", color: "#64748b" }}>
                    <span>
                      สร้างเมื่อ: {new Date(run.createdAt || Date.now()).toLocaleString("th-TH")}
                      {run.updatedAt && ` · อัปเดตล่าสุด: ${new Date(run.updatedAt).toLocaleTimeString("th-TH")}`}
                    </span>
                    {run.error && (
                      <span style={{ color: "#f87171", fontWeight: 600 }}>
                        ✕ ข้อผิดพลาด: {run.error}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Approval Modal if opened from list */}
      {activeApprovalRun && activeApprovalRun.approval && (
        <ApprovalModal
          runId={activeApprovalRun.runId}
          stepId={activeApprovalRun.steps.find((s) => s.status === "waiting_approval")?.id ?? "review_approval"}
          approval={activeApprovalRun.approval}
          csrfToken=""
          onClose={() => setActiveApprovalRun(null)}
          onDecided={() => {
            setActiveApprovalRun(null);
            void fetchRuns();
          }}
        />
      )}
    </div>
  );
}
