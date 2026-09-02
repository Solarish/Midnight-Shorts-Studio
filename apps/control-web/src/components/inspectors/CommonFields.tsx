import { useState } from "react";
import { RemoteFilePickerModal } from "../RemoteFilePickerModal";

export const FRAME_MS = 40;

export function snapToFrameMs(ms: number): number {
  return Math.round(ms / FRAME_MS) * FRAME_MS;
}

export function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(2);
}

export function formatTimecode(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const frames = Math.floor((ms % 1000) / FRAME_MS);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

export function directoryForPath(filePath: string): string {
  if (!filePath) return "/";
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return normalized.slice(0, lastSlash);
}

export function PathField({
  label,
  value,
  onChange,
  compact = false,
  filter,
  placeholder = "ยังไม่ได้เลือกไฟล์ (กดปุ่มเพื่อเลือกจาก NAS)"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  filter?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const fileName = value.split(/[\\/]/).filter(Boolean).at(-1) ?? "";

  return (
    <div className={`path-field ${compact ? "compact" : ""}`} style={{ marginBottom: compact ? 0 : "10px" }}>
      <label style={{ display: "block", color: "#94a3b8", fontSize: "12px" }}>
        {label}
        <span style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "4px" }}>
          <input
            aria-label={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            style={{
              flex: 1,
              padding: "7px 10px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: "#f8fafc",
              fontSize: "12px"
            }}
          />
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              padding: "7px 12px",
              background: "linear-gradient(135deg, #0284c7, #0369a1)",
              border: "none",
              borderRadius: "6px",
              color: "#ffffff",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }}
          >
            🔍 เลือกจาก NAS
          </button>
        </span>
        {value && !compact && (
          <small className="path-selection" style={{ color: "#38bdf8", marginTop: "4px", display: "block", fontSize: "11px" }}>
            ✓ เลือกแล้ว: <strong style={{ color: "#f8fafc" }}>{fileName}</strong>
          </small>
        )}
      </label>
      <RemoteFilePickerModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onSelect={(selected) => {
          onChange(selected);
          setOpen(false);
        }}
        initialPath={directoryForPath(value)}
        mode="file"
        filter={filter}
        title={`เลือก ${label} จาก NAS`}
      />
    </div>
  );
}

export function SecondsField({
  label,
  valueMs,
  onChange,
  minMs = 0,
  compact = false
}: {
  label: string;
  valueMs: number;
  onChange: (valueMs: number) => void;
  minMs?: number;
  compact?: boolean;
}) {
  return (
    <label className={`seconds-field ${compact ? "compact" : ""}`}>
      {label}
      <span>
        <input
          aria-label={`${label} (s)`}
          type="number"
          inputMode="decimal"
          step="0.04"
          min={formatSeconds(minMs)}
          value={formatSeconds(valueMs)}
          onChange={(event) => {
            const seconds = Number(event.target.value);
            if (Number.isFinite(seconds)) {
              onChange(Math.max(minMs, snapToFrameMs(seconds * 1000)));
            }
          }}
        />
        <b>s</b>
      </span>
      {!compact && <small className="field-help">25fps · step 0.04 s</small>}
    </label>
  );
}
