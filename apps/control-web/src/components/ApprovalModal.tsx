import { useState } from "react";
import { api } from "../api";

export interface CandidateItem {
  assetId: string;
  path: string;
  relativePath: string;
  kind: string;
  thumbnailPath?: string;
}

export interface ProposalItem {
  segmentId: string;
  segmentDialogue?: string;
  rationale?: string;
  thumbnailPath?: string;
  candidates: CandidateItem[];
  selectedAssetId: string;
}

export interface ApprovalRequest {
  kind?: string;
  stepId: string;
  proposalDigest: string;
  prompt: string;
  coverPhoto?: string;
  items: ProposalItem[];
}

export interface ApprovalModalProps {
  runId: string;
  stepId: string;
  approval: ApprovalRequest;
  csrfToken: string;
  onClose: () => void;
  onDecided: () => void;
}

export function ApprovalModal({
  runId,
  stepId,
  approval,
  csrfToken,
  onClose,
  onDecided
}: ApprovalModalProps) {
  const [selections, setSelections] = useState<ProposalItem[]>(
    approval.items.map((item) => ({ ...item }))
  );
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handleSelectCandidate(segmentIndex: number, candidateId: string) {
    setSelections((prev) =>
      prev.map((item, idx) =>
        idx === segmentIndex ? { ...item, selectedAssetId: candidateId } : item
      )
    );
  }

  async function submitDecision(approved: boolean) {
    setSubmitting(true);
    setError("");
    try {
      await api(`/api/v1/runs/${runId}/approvals/${stepId}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(csrfToken ? { "x-ava-csrf": csrfToken } : {})
        },
        body: JSON.stringify({
          proposalDigest: approval.proposalDigest,
          approved,
          selections,
          note
        })
      });
      onDecided();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Failed to submit approval decision");
    } finally {
      setSubmitting(false);
    }
  }

  const isCover = approval.kind === "cover_card";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="approval-modal card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "880px",
          width: "92vw",
          maxHeight: "85vh",
          overflowY: "auto",
          background: "#121620",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: "12px",
          padding: "24px",
          color: "#e2e8f0"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <span style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", color: "#f59e0b", fontWeight: 700 }}>
              ⚠️ Operator Approval Required
            </span>
            <h3 style={{ fontSize: "20px", fontWeight: 600, margin: "4px 0" }}>
              {approval.prompt || (isCover ? "ตรวจและอนุมัติภาพปก AI (AI Cover Card Approval)" : "ตรวจและอนุมัติ B-roll สำหรับแต่ละช่วงบทสัมภาษณ์")}
            </h3>
            <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
              Step: <code>{stepId}</code> · Digest: <code>{approval.proposalDigest?.slice(0, 12)}…</code>
            </p>
          </div>
          <button
            className="button ghost"
            onClick={onClose}
            style={{ fontSize: "20px", lineHeight: "1", padding: "4px 8px" }}
          >
            ×
          </button>
        </div>

        {approval.coverPhoto && (
          <div style={{ background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "16px" }}>🖼️</span>
            <div>
              <strong style={{ fontSize: "13px", color: "#93c5fd" }}>ภาพนิ่งปกที่เลือก (Selected Cover Photo):</strong>
              <div style={{ fontSize: "12px", color: "#e2e8f0", wordBreak: "break-all" }}>{approval.coverPhoto}</div>
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: "rgba(239, 68, 68, 0.2)", border: "1px solid #ef4444", borderRadius: "6px", padding: "12px", marginBottom: "16px", color: "#fca5a5", fontSize: "14px" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "20px" }}>
          {selections.map((item, segmentIdx) => (
            <div
              key={item.segmentId}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px",
                padding: "16px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                <div>
                  <strong style={{ fontSize: "14px", color: "#60a5fa" }}>
                    {isCover ? "ภาพปก" : "ฉากสัมภาษณ์"}: {item.segmentId}
                  </strong>
                  {item.segmentDialogue && (
                    <div style={{ fontSize: "12px", color: "#cbd5e1", fontStyle: "italic", marginTop: "2px" }}>
                      🗣 "{item.segmentDialogue}"
                    </div>
                  )}
                </div>
                {item.rationale && (
                  <span style={{ fontSize: "11px", background: "rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: "4px", color: "#94a3b8", whiteSpace: "nowrap", marginLeft: "10px" }}>
                    💡 {item.rationale}
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px", marginTop: "10px" }}>
                {item.candidates.map((cand) => {
                  const isSelected = item.selectedAssetId === cand.assetId;
                  return (
                    <div
                      key={cand.assetId}
                      onClick={() => handleSelectCandidate(segmentIdx, cand.assetId)}
                      style={{
                        border: isSelected ? "2px solid #3b82f6" : "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "6px",
                        padding: "8px",
                        cursor: "pointer",
                        background: isSelected ? "rgba(59, 130, 246, 0.15)" : "transparent",
                        transition: "all 0.15s ease"
                      }}
                    >
                      {cand.thumbnailPath && (
                        <img
                          src={`/api/v1/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(stepId)}/candidates/${encodeURIComponent(cand.assetId)}/thumbnail`}
                          alt={`${isCover ? "ภาพปก" : "B-roll"} ${cand.relativePath || cand.assetId}`}
                          loading="lazy"
                          style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: "4px", marginBottom: "8px", background: "#020617" }}
                        />
                      )}
                      <div style={{ fontSize: "12px", fontWeight: 600, wordBreak: "break-all" }}>
                        {cand.relativePath || cand.path}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "11px", color: "#94a3b8" }}>
                        <span>{cand.kind}</span>
                        {isSelected && <span style={{ color: "#60a5fa", fontWeight: 700 }}>✓ เลือก</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label htmlFor="approval-note" style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px", color: "#cbd5e1" }}>
            บันทึกข้อความเพิ่มเติม (Optional Note)
          </label>
          <input
            id="approval-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isCover ? "เช่น อนุมัติภาพปกสำหรับการจัดวางบนไทม์ไลน์" : "เช่น ปรับเปลี่ยนภาพ B-roll ฉากที่ 2 ตามคำขอของผู้กำกับ"}
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "#0f172a",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "6px",
              color: "#fff"
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <button
            className="button secondary danger"
            onClick={() => void submitDecision(false)}
            disabled={submitting}
            style={{ color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.4)" }}
          >
            {submitting ? "กำลังส่งคำสั่ง…" : "✕ ปฏิเสธ (Reject)"}
          </button>
          <button
            className="button primary"
            onClick={() => void submitDecision(true)}
            disabled={submitting}
            style={{ background: "#22c55e", borderColor: "#16a34a" }}
          >
            {submitting ? "กำลังส่งคำสั่ง…" : (isCover ? "✓ ยืนยันอนุมัติภาพปก (Approve Cover)" : "✓ ยืนยันอนุมัติ B-Roll (Approve)")}
          </button>
        </div>
      </div>
    </div>
  );
}
