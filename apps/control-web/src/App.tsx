import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api, getHealth, getReadiness, isReadinessFresh, uploadAsset, type Artifact, type Asset, type Manifest, type Readiness, type Run, type TrialPreset } from "./api";
import WorkflowCatalogPage from "./WorkflowCatalogPage";
import WorkflowGraphEditorPage from "./WorkflowGraphEditorPage";
import StoryboardEditorPage from "./StoryboardEditorPage";
import RunsListPage from "./RunsListPage";
import { ApprovalModal } from "./components/ApprovalModal";
import "./graph.css";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WorkflowCatalogPage />} />
      <Route path="/workflows" element={<Navigate to="/" replace />} />
      <Route path="/recipes/portrait-story" element={<ComposePage />} />
      <Route path="/runs" element={<RunsListPage />} />
      <Route path="/run" element={<Navigate to="/runs" replace />} />
      <Route path="/runs/:runId" element={<RunPage />} />
      <Route path="/run/:runId" element={<RunPage />} />
      <Route path="/admin/workflows" element={<Navigate to="/" replace />} />
      <Route path="/workflows/:workflowId/edit" element={<WorkflowGraphEditorPage />} />
      <Route path="/storyboards" element={<WorkflowCatalogPage />} />
      <Route path="/storyboards/:storyboardId" element={<StoryboardEditorPage />} />
      <Route path="/storyboards/:storyboardId/edit" element={<StoryboardEditorPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-mark">AVA</span>
          <span><strong>Automated Video Assembly</strong><small>PSU Broadcast · Local Control Center</small></span>
        </Link>
        <div className="topbar-links">
          <Link to="/">Workflow Studio</Link>
          <Link to="/runs">Run Monitor</Link>
          <Link to="/recipes/portrait-story">Portrait Story Recipe</Link>
          <span className="local-pill"><i /> Local only · 127.0.0.1</span>
          <span style={{ fontSize: "11px", opacity: 0.8, padding: "2px 6px", background: "rgba(255,255,255,0.1)", borderRadius: "4px" }}>
            v0.2.0 · 2026-08-27 16:15
          </span>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function ComposePage() {
  const navigate = useNavigate();
  const [readiness, setReadiness] = useState<Readiness>();
  const [readinessClock, setReadinessClock] = useState(() => Date.now());
  const [runs, setRuns] = useState<Run[]>([]);
  const [asset, setAsset] = useState<Asset>();
  const [uploading, setUploading] = useState(false);
  const [loadingTrial, setLoadingTrial] = useState(false);
  const [trialPresetId, setTrialPresetId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [operatorConfirmedAdobeReady, setOperatorConfirmedAdobeReady] = useState(false);
  const [error, setError] = useState("");
  const [manifestId] = useState(() => crypto.randomUUID().slice(0, 8));
  const [compiled, setCompiled] = useState<{ workflowDigest: string; compiledSummary: { format: string; durationSeconds: number; steps: number } }>();
  const [form, setForm] = useState({ projectName: "PSU Portrait Story", headline: "PSU BROADCAST", subheadline: "เรื่องเล่าจากมหาวิทยาลัย", backgroundBrief: "ห้องส่งข่าวมหาวิทยาลัยร่วมสมัย บรรยากาศสุขุมและอบอุ่น" });

  const applyReadiness = useCallback((next: Readiness) => {
    setReadiness(next);
    setReadinessClock(Date.now());
    return next;
  }, []);

  const refreshReadiness = useCallback(async () => applyReadiness(await getReadiness()), [applyReadiness]);

  const refresh = useCallback(async () => {
    const [health, history] = await Promise.allSettled([getHealth(), api<Run[]>("/api/v1/runs")]);
    if (health.status === "fulfilled") applyReadiness(health.value.readiness);
    if (history.status === "fulfilled") setRuns(history.value);
    const failure = [health, history].find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }, [applyReadiness]);
  useEffect(() => { refresh().catch((cause) => setError(cause.message)); }, [refresh]);
  useEffect(() => {
    const poll = () => { setReadinessClock(Date.now()); void refreshReadiness().catch(() => {}); };
    const pollTimer = window.setInterval(poll, 3_000);
    const clockTimer = window.setInterval(() => setReadinessClock(Date.now()), 1_000);
    const onVisible = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", poll);
    return () => {
      window.clearInterval(pollTimer);
      window.clearInterval(clockTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", poll);
    };
  }, [refreshReadiness]);
  const manifest = useMemo<Manifest>(() => ({ manifestVersion: 1, recipeId: "portrait-story-v1", id: manifestId, ...form, presenterAsset: asset }), [asset, form, manifestId]);
  useEffect(() => { setCompiled(undefined); }, [manifest]);
  const liveReadinessFresh = isReadinessFresh(readiness, readinessClock);

  async function chooseFile(file?: File) {
    if (!file) return;
    setError(""); setUploading(true);
    try { setAsset(await uploadAsset(file)); setTrialPresetId(""); } catch (cause: any) { setError(cause.message); } finally { setUploading(false); }
  }

  async function loadTrialPreset() {
    setError(""); setLoadingTrial(true); setOperatorConfirmedAdobeReady(false);
    try {
      const preset = await api<TrialPreset>("/api/v1/trial-presets/portrait-story-v1", { method: "POST", body: "{}" });
      setAsset(preset.presenterAsset);
      setForm(preset.form);
      setTrialPresetId(preset.presetId);
    } catch (cause: any) { setError(formatApiError(cause)); }
    finally { setLoadingTrial(false); }
  }

  async function preflight() {
    setError("");
    try { setCompiled(await api("/api/v1/workflows/compile", { method: "POST", body: JSON.stringify({ manifest }) })); }
    catch (cause: any) { setError(formatApiError(cause)); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const mode = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.dataset.mode === "dry-run" ? "dry-run" : "live";
    setError(""); setSubmitting(true);
    try {
      if (mode === "live") {
        const currentReadiness = await refreshReadiness();
        if (!isReadinessFresh(currentReadiness)) {
          setError(formatReadinessFailure(currentReadiness));
          focusReadiness();
          return;
        }
      }
      const created = await api<{ runId: string }>("/api/v1/runs", { method: "POST", headers: { "idempotency-key": `${manifest.id}-${mode}` }, body: JSON.stringify({ manifest, mode, operatorConfirmedAdobeReady, preflightDigest: compiled?.workflowDigest }) });
      navigate(`/runs/${created.runId}`);
    } catch (cause: any) {
      if (cause.details?.readiness) applyReadiness(cause.details.readiness);
      setError(formatApiError(cause));
      if (cause.details?.code === "READINESS_FAILED") focusReadiness();
    } finally { setSubmitting(false); }
  }

  return <Shell><div className="page-grid">
    <section className="hero"><p className="eyebrow">PORTRAIT STORY · 1080 × 1920 · 5 SEC</p><h1>ประกอบวิดีโอให้เสร็จ<br/><em>ทีละขั้น อย่างมั่นใจ</em></h1><p>เลือกภาพ เติมข้อความ และกำหนดบรรยากาศ ระบบจะตัดพื้นหลัง สร้างฉาก ประกอบ AE และส่งต่อ Premiere ตามลำดับเดียวกันทุกครั้ง</p></section>
    <ReadinessCard readiness={readiness} fresh={liveReadinessFresh} onRefresh={refreshReadiness} />
    <form className="composer card" onSubmit={submit} aria-busy={submitting || uploading}>
      <div className={`trial-preset ${trialPresetId ? "active" : ""}`}><div><p className="eyebrow">FIRST-USER PRESET</p><strong>{trialPresetId ? "ชุดทดลองพร้อมแล้ว" : "เริ่มด้วยชุดทดลองมาตรฐาน"}</strong><small>โหลดภาพและข้อความที่ตรวจสอบแล้ว จากนั้นกด Validate ก่อนเริ่ม Live</small></div><button type="button" className="button secondary" onClick={() => void loadTrialPreset()} disabled={loadingTrial || submitting}>{loadingTrial ? "กำลังโหลด…" : trialPresetId ? "โหลดใหม่" : "โหลดชุดทดลอง"}</button></div>
      <div className="divider" />
      <div className="section-heading"><span>01</span><div><h2>Presenter</h2><p>ภาพบุคคลต้นฉบับสำหรับตัดพื้นหลัง</p></div></div>
      <label className={`dropzone ${asset ? "has-file" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event: DragEvent<HTMLLabelElement>) => { event.preventDefault(); void chooseFile(event.dataTransfer.files?.[0]); }}><input type="file" required={!asset} aria-label="เลือกภาพ Presenter" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} />
        {asset ? <><img src={asset.previewUrl} alt="Presenter preview"/><span><strong>{asset.originalName}</strong><small>{asset.width} × {asset.height}px · กดเพื่อเปลี่ยนภาพ</small></span></> : <span><strong>{uploading ? "กำลังตรวจสอบภาพ…" : "วางภาพหรือกดเพื่อเลือก"}</strong><small>PNG, JPEG หรือ WebP · ไม่เกิน 25 MB</small></span>}
      </label>
      <div className="divider" />
      <div className="section-heading"><span>02</span><div><h2>Story Copy</h2><p>ข้อความจะถูกผูกกับ template ตายตัวโดยตรง</p></div></div>
      <div className="field-grid"><Field id="project-name" label="ชื่องาน" value={form.projectName} maxLength={80} onChange={(projectName) => setForm({ ...form, projectName })}/><Field id="headline" label="Headline" value={form.headline} maxLength={32} onChange={(headline) => setForm({ ...form, headline })}/><Field id="subheadline" label="Subheadline" value={form.subheadline} maxLength={64} onChange={(subheadline) => setForm({ ...form, subheadline })}/></div>
      <div className="divider" />
      <div className="section-heading"><span>03</span><div><h2>Background Direction</h2><p>อธิบายฉากที่ต้องการ ระบบจะเติม PSU visual direction ให้อัตโนมัติ</p></div></div>
      <label className="field" htmlFor="background-brief"><span>บรรยากาศฉากหลัง</span><textarea id="background-brief" required minLength={10} aria-describedby="background-brief-help" value={form.backgroundBrief} maxLength={500} rows={4} onChange={(event) => setForm({ ...form, backgroundBrief: event.target.value })}/><small id="background-brief-help">{form.backgroundBrief.length}/500 · ระบบบังคับ no people, no words, no logos</small></label>
      <div className="fixed-summary"><span>FIXED DESIGN</span><ul><li>Midnight-blue studio</li><li>Vector doodle accents</li><li>PSU Broadcast bug</li><li>Lossless master</li></ul></div>
      <label className="operator-confirm"><input type="checkbox" checked={operatorConfirmedAdobeReady} onChange={(event) => setOperatorConfirmedAdobeReady(event.target.checked)}/><span><strong>พร้อมสำหรับ Live Adobe</strong><small>บันทึกงานอื่นแล้ว และ AE/Premiere เป็น session สำหรับ automation โดยเฉพาะ</small></span></label>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {compiled && <div className="preflight" role="status"><strong>Preflight ผ่านแล้ว</strong><span>{compiled.compiledSummary.format} · {compiled.compiledSummary.durationSeconds} วินาที · {compiled.compiledSummary.steps} ขั้นตอน</span><small>Workflow digest {compiled.workflowDigest.slice(0, 12)}</small></div>}
      <p id="live-readiness-note" className="action-note">{!compiled ? "Validate Recipe ก่อนเริ่ม Live" : liveReadinessFresh ? "Preflight และระบบพร้อมสำหรับ Live run" : readiness?.ready ? "ข้อมูล System Readiness หมดอายุ กำลังตรวจสอบใหม่" : "Live run จะเปิดได้เมื่อ System Readiness ผ่านทั้งหมด; Dry Run ยังใช้งานได้"}</p>
      <div className="actions"><button type="button" className="button secondary" onClick={(event) => { if (event.currentTarget.form?.reportValidity()) void preflight(); }} disabled={submitting || uploading || !asset}>Validate Recipe</button><button type="submit" data-mode="dry-run" className="button secondary" disabled={submitting || uploading || !asset}>Dry Run</button><button type="submit" data-mode="live" className="button primary" aria-describedby="live-readiness-note" disabled={submitting || uploading || !asset || !compiled || !liveReadinessFresh || !operatorConfirmedAdobeReady}>{submitting ? "กำลังตรวจระบบ…" : "Create Video"}</button></div>
    </form>
    <RecentRuns runs={runs} />
  </div></Shell>;
}

function ReadinessCard({ readiness, fresh, onRefresh }: { readiness?: Readiness; fresh: boolean; onRefresh: () => Promise<Readiness> }) {
  const labels: Record<string, string> = { system: "System", "after-effects": "After Effects", premiere: "Premiere", ai: "AI / GPU" };
  const grouped = (readiness?.checks ?? []).reduce<Record<string, Readiness["checks"]>>((result, check) => {
    (result[check.category] ??= []).push(check);
    return result;
  }, {});
  const groups = Object.entries(grouped);
  return <aside id="system-readiness" className={`readiness card ${readiness?.ready && !fresh ? "stale" : ""}`} aria-live="polite"><div className="card-title"><div><p className="eyebrow">SYSTEM READINESS</p><h2>{fresh ? "พร้อมเริ่มงาน" : readiness?.ready ? "สถานะหมดอายุ กำลังตรวจใหม่" : "ตรวจพบสิ่งที่ต้องเตรียม"}</h2>{readiness?.checkedAt && <small className="readiness-time">ตรวจล่าสุด {new Date(readiness.checkedAt).toLocaleTimeString("th-TH")}</small>}</div><button className="icon-button" onClick={() => { void onRefresh().catch(() => {}); }} aria-label="ตรวจสอบระบบอีกครั้ง">↻</button></div><div className="checks">{groups.length ? groups.map(([category, checks]) => <section className="check-group" key={category}><h3>{labels[category] ?? category}</h3>{checks.map((check) => <div key={check.id} className={check.ok ? "ok" : "warn"}><i/><span><strong>{check.name}</strong><small>{check.ok ? "Ready" : check.detail}</small>{!check.ok && <em>{check.remediation}</em>}</span></div>)}</section>) : <p>กำลังตรวจสอบ…</p>}</div></aside>;
}

function Field({ id, label, value, maxLength, onChange }: { id: string; label: string; value: string; maxLength: number; onChange: (value: string) => void }) {
  return <label className="field" htmlFor={id}><span>{label}</span><input id={id} required minLength={1} aria-label={label} aria-describedby={`${id}-help`} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)}/><small id={`${id}-help`}>{value.length}/{maxLength}</small></label>;
}

function RecentRuns({ runs }: { runs: Run[] }) {
  return <section className="history card"><div className="card-title"><div><p className="eyebrow">RECENT RUNS</p><h2>งานล่าสุด</h2></div></div>{runs.length ? <div className="run-list">{runs.slice(0, 8).map((run) => <Link to={`/runs/${run.runId}`} key={run.runId}><StatusIcon status={run.status}/><span><strong>{run.projectName}</strong><small>{new Date(run.createdAt).toLocaleString("th-TH")} · {run.dryRun ? "Dry run" : "Live"}</small></span><b>{run.status}</b></Link>)}</div> : <p className="empty">ยังไม่มีงาน เริ่มจากแบบฟอร์มด้านบนได้เลย</p>}</section>;
}

function RunPage() {
  const { runId = "" } = useParams();
  const [run, setRun] = useState<Run>();
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [artifactError, setArtifactError] = useState("");
  const [resumeConfirmed, setResumeConfirmed] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);

  const load = useCallback(async () => {
    const next = await api<Run>(`/api/v1/runs/${runId}`); setRun(next);
    if (next.status === "waiting_approval" && next.approval) {
      setShowApprovalModal(true);
    }
    if (["success", "failed", "partial", "needs_attention"].includes(next.status)) {
      try { setArtifacts(await api<Artifact[]>(`/api/v1/runs/${runId}/artifacts`)); setArtifactError(""); }
      catch (cause: any) { setArtifactError(cause.message); }
    }
  }, [runId]);
  useEffect(() => { load().catch((cause) => setError(cause.message)); const timer = setInterval(() => load().catch(() => {}), 5000); return () => clearInterval(timer); }, [load]);
  useEffect(() => { const events = new EventSource(`/api/v1/runs/${runId}/events`); events.onopen = () => setConnected(true); events.onerror = () => setConnected(false); events.onmessage = () => load(); ["run.queued", "run.started", "run.cancelled", "run.waiting_approval", "approval.recorded", "checkpoint.recovered", "stop.requested", "step.started", "step.attempted", "step.attempt_failed", "step.succeeded", "step.committed", "step.commit_pending", "step.failed", "verification.completed", "run.succeeded", "run.failed", "run.partial"].forEach((name) => events.addEventListener(name, () => load())); return () => events.close(); }, [runId, load]);
  async function action(name: string) {
    setError("");
    try {
      const body = name === "resume" ? { operatorConfirmedAdobeReady: run?.dryRun === false ? resumeConfirmed : undefined } : {};
      await api(`/api/v1/runs/${runId}/actions/${name}`, { method: "POST", body: JSON.stringify(body) });
      setResumeConfirmed(false);
      await load();
    } catch (cause: any) { setError(formatApiError(cause)); }
  }
  if (!run) return <Shell>{error ? <div className="error-banner" role="alert">{error}<br/><Link to="/">← กลับไปหน้าสร้างงาน</Link></div> : <div className="loading">กำลังเปิด run…</div>}</Shell>;
  return <Shell><div className="monitor-page">
    <div className="run-heading"><div><Link to="/" className="back">← New job</Link><p className="eyebrow">RUN MONITOR</p><h1>{run.projectName}</h1><p className="mono">{run.runId}</p></div><div className="run-status" role="status" aria-live="polite"><span className={connected ? "connected" : "disconnected"}><i/>{connected ? "Live updates" : "Reconnecting"}</span><strong data-status={run.status}>{run.status}</strong></div></div>
    <p className="sr-only" role="status" aria-live="polite">สถานะงาน {run.status}; สำเร็จ {run.steps.filter((step) => step.status === "success").length} จาก {run.steps.length} ขั้นตอน</p>
    
    {run.status === "waiting_approval" && run.approval && (
      <div className="card" style={{ background: "rgba(245, 158, 11, 0.15)", border: "1px solid #f59e0b", padding: "16px", marginBottom: "16px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <strong style={{ color: "#fbbf24", fontSize: "16px" }}>⚠️ งานรอการตรวจอนุมัติ B-Roll (Waiting for Operator Approval)</strong>
          <p style={{ margin: "4px 0 0 0", color: "#e2e8f0", fontSize: "13px" }}>
            ระบบ AI ได้จับคู่ B-Roll และภาพปกสำหรับ 12 ช่วงสัมภาษณ์แล้ว กรุณากดตรวจและอนุมัติเพื่อตัดต่อต่อ
          </p>
        </div>
        <button
          type="button"
          className="button primary"
          style={{ background: "#f59e0b", borderColor: "#d97706", fontWeight: 700, padding: "10px 20px" }}
          onClick={() => setShowApprovalModal(true)}
        >
          👉 ตรวจและอนุมัติ B-Roll
        </button>
      </div>
    )}

    {showApprovalModal && run.approval && (
      <ApprovalModal
        runId={run.runId}
        stepId={run.steps.find((s) => s.status === "waiting_approval")?.id ?? "review_approval"}
        approval={run.approval}
        csrfToken=""
        onClose={() => setShowApprovalModal(false)}
        onDecided={() => {
          setShowApprovalModal(false);
          void load();
        }}
      />
    )}

    {error && <div className="error-banner" role="alert">{error}</div>}
    {run.error && <div className="error-banner" role="alert"><strong>งานหยุด:</strong> {run.error}</div>}
    {run.error && <RecoveryCard run={run}/>} 
    {run.dataError && <div className="error-banner" role="alert"><strong>ข้อมูล run ไม่ครบ:</strong> {run.dataError}</div>}
    {run.eventError && <div className="error-banner" role="alert"><strong>Event journal:</strong> {run.eventError}</div>}
    {(artifactError || run.artifactError) && <div className="error-banner" role="alert"><strong>Artifacts:</strong> {artifactError || run.artifactError}</div>}
    {run.verification && <section className={`verification card ${run.verification.status}`}><p className="eyebrow">OUTPUT VERIFICATION</p><h2>{run.verification.status === "passed" ? "หลักฐานครบ พร้อมส่งมอบ" : "ผลลัพธ์ต้องตรวจสอบ"}</h2><strong>{run.verification.passed}/{run.verification.total} checks passed</strong>{run.verification.error && <small>{run.verification.error}</small>}</section>}
    <section className="timeline card"><div className="card-title"><div><p className="eyebrow">SEQUENTIAL PIPELINE</p><h2>ทำงานทีละขั้น</h2></div><span>{run.steps.filter((step) => step.status === "success").length}/{run.steps.length}</span></div><ol>{run.steps.map((step, index) => <li key={step.id} data-status={step.status}><span className="step-index">{step.status === "success" ? "✓" : String(index + 1).padStart(2, "0")}</span><div><strong>{step.label}</strong><small>{step.type}{step.attempts ? ` · attempt ${step.attempts}` : ""}</small>{step.error && <p>{step.error}</p>} {step.outputs && <details><summary>Outputs</summary><pre>{JSON.stringify(step.outputs, null, 2)}</pre></details>}</div><StatusIcon status={step.status}/></li>)}</ol></section>
    <div className="monitor-actions">
      {run.status === "waiting_approval" && run.approval && (
        <button className="button primary" style={{ background: "#f59e0b", borderColor: "#d97706", fontWeight: 700 }} onClick={() => setShowApprovalModal(true)}>
          ⚠️ ตรวจและอนุมัติ B-Roll
        </button>
      )}
      {run.status === "queued" && <button className="button secondary" onClick={() => action("cancel-queued")}>Cancel queued job</button>}
      {run.status === "running" && <button className="button secondary" onClick={() => action("stop-after-step")}>Stop after current step</button>}
      {run.resumable && run.dryRun === false && <label className="operator-confirm"><input type="checkbox" checked={resumeConfirmed} onChange={(event) => setResumeConfirmed(event.target.checked)}/><span><strong>พร้อม Resume Live Adobe</strong><small>บันทึกงานอื่นแล้ว และตรวจว่า Premiere/AE พร้อมทำขั้นตอนที่เหลือ</small></span></label>}
      {run.resumable && <button className="button primary" onClick={() => action("resume")} disabled={run.dryRun === false && !resumeConfirmed}>Resume from checkpoint</button>}
    </div>
    <ArtifactGallery artifacts={artifacts} runId={runId} onError={setArtifactError}/>
  </div></Shell>;
}

function RecoveryCard({ run }: { run: Run }) {
  const unsafe = run.unsafeToResume || ["ADOBE_HOST_AMBIGUOUS", "CONTROL_API_RESTARTED"].includes(run.errorCode ?? "");
  return <section className="recovery card"><p className="eyebrow">RECOVERY</p><h2>{unsafe ? "หยุดและตรวจ Adobe ก่อน" : "แก้สาเหตุแล้ว Resume ได้"}</h2><p>{unsafe ? "ตรวจ AE/Premiere project และ receipt ให้แน่ใจว่างานเดิมไม่ได้ทำต่ออยู่ ห้ามกด Resume แบบเดาสุ่ม" : run.errorCode === "ADAPTER_COMMIT_PENDING" ? "ผล Adobe ถูก checkpoint แล้ว ระบบจะลอง cleanup receipt อีกครั้งโดยไม่ประกอบงานซ้ำ" : "แก้บริการหรือการเชื่อมต่อที่แจ้งด้านบน แล้วใช้ Resume from checkpoint"}</p></section>;
}

function ArtifactGallery({ artifacts, runId, onError }: { artifacts: Artifact[]; runId: string; onError: (message: string) => void }) {
  if (!artifacts.length) return null;
  async function reveal(id: string) { try { await api(`/api/v1/runs/${runId}/artifacts/${id}/reveal`, { method: "POST", body: "{}" }); onError(""); } catch (cause: any) { onError(cause.message); } }
  return <section className="artifacts card"><div className="card-title"><div><p className="eyebrow">EVIDENCE & OUTPUTS</p><h2>Artifacts</h2></div></div><div className="artifact-grid">{artifacts.map((item) => <article key={item.artifactId}>{item.kind === "image" ? <img src={`/api/v1/runs/${runId}/artifacts/${item.artifactId}/content`} alt={item.name}/> : item.kind === "video" ? <video controls preload="metadata" aria-label={item.name} src={`/api/v1/runs/${runId}/artifacts/${item.artifactId}/content`}/> : <div className="file-preview">{item.name.split(".").pop()?.toUpperCase()}</div>}<div><strong>{item.name}</strong><small>{formatBytes(item.size)} · {item.relativePath}</small><button onClick={() => reveal(item.artifactId)}>Reveal in Finder</button></div></article>)}</div></section>;
}

function StatusIcon({ status }: { status: string }) { return <span className="status-icon" data-status={status} role="img" aria-label={status}><i/></span>; }
function formatBytes(value: number) { return value > 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(value / 1024)} KB`; }
function formatReadinessFailure(readiness: Readiness) {
  const failed = readiness.checks.filter((check) => check.blocking && !check.ok);
  if (!failed.length) return "สถานะระบบหมดอายุหรือยังตรวจสอบไม่เสร็จ กรุณารอ System Readiness อัปเดตแล้วลองอีกครั้ง";
  return `ยังไม่เริ่ม Live — ${failed.map((check) => `${check.name}: ${check.detail ?? check.remediation}`).join(" · ")}`;
}
function formatApiError(cause: any) {
  if (cause.details?.code === "READINESS_FAILED" && cause.details.readiness) return formatReadinessFailure(cause.details.readiness);
  const fields = cause.details?.errors?.map((item: any) => item.message).join(" · ");
  return fields || cause.message;
}
function focusReadiness() {
  window.requestAnimationFrame(() => document.getElementById("system-readiness")?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
}
