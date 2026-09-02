import type { StoryboardItem } from "../../storyboard-types";
import { PathField, SecondsField, formatSeconds, formatTimecode } from "./CommonFields";
import "./inspectors.css";

export interface ARollInspectorProps {
  item: StoryboardItem;
  selectedBrollId?: string;
  onSelectBroll?: (id: string) => void;
  onParams: (patch: Record<string, unknown>) => void;
  onItem: (item: StoryboardItem) => void;
  canMerge?: boolean;
  onSplit?: () => void;
  onMerge?: () => void;
}

function uniqueId(prefix: string, existing: string[]) {
  let counter = existing.length + 1;
  while (existing.includes(`${prefix}_${counter}`)) counter++;
  return `${prefix}_${counter}`;
}

export function ARollInspector({
  item,
  selectedBrollId,
  onSelectBroll,
  onParams,
  onItem,
  canMerge = false,
  onSplit,
  onMerge
}: ARollInspectorProps) {
  const broll = item.broll ?? [];

  const updateBroll = (index: number, patch: Partial<(typeof broll)[number]>) =>
    onItem({
      ...item,
      broll: broll.map((val, itemIndex) => (itemIndex === index ? { ...val, ...patch } : val))
    });

  const updateRange = (patch: Record<string, number>) => {
    const params = { ...item.params, ...patch };
    const sourceInMs = Number(params.sourceInMs ?? 0);
    const sourceOutMs = Number(params.sourceOutMs ?? 0);
    onItem({
      ...item,
      params,
      durationMs: Math.max(40, sourceOutMs - sourceInMs)
    });
  };

  return (
    <div className="inspector-container">
      {/* Source Media Card */}
      <div className="inspector-card accent-blue">
        <details open>
          <summary style={{ color: "#60A5FA" }}>📁 Source Video (A-Roll Footage)</summary>
          <div className="inspector-card-body">
            <PathField
              label="Source media"
              value={String(item.params.sourcePath ?? "")}
              filter=".mov,.mp4,.mxf,.avi,.mkv"
              onChange={(sourcePath) => onParams({ sourcePath })}
            />
            <div className="inspector-field">
              <label className="inspector-label">
                Source key
                <input
                  className="inspector-input"
                  value={String(item.params.sourceKey ?? "")}
                  onChange={(event) => onParams({ sourceKey: event.target.value })}
                  placeholder="e.g. C7724"
                />
              </label>
              <small style={{ color: "#64748B", fontSize: "10px" }}>
                รหัสคลิปที่ใช้เชื่อม segment และคำสั่ง merge
              </small>
            </div>
          </div>
        </details>
      </div>

      {/* Source Range & Timing Card */}
      <div className="inspector-card accent-blue">
        <details open>
          <summary style={{ color: "#60A5FA" }}>⏱️ Source Range &amp; Timing (25fps)</summary>
          <div className="inspector-card-body">
            <div className="inspector-grid-2">
              <SecondsField
                label="Source in"
                valueMs={Number(item.params.sourceInMs ?? 0)}
                minMs={0}
                onChange={(sourceInMs) => updateRange({ sourceInMs })}
              />
              <SecondsField
                label="Source out"
                valueMs={Number(item.params.sourceOutMs ?? 0)}
                minMs={40}
                onChange={(sourceOutMs) => updateRange({ sourceOutMs })}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                background: "#1E293B",
                borderRadius: "8px",
                border: "1px solid #334155"
              }}
            >
              <span style={{ fontSize: "12px", color: "#94A3B8" }}>Duration (s)</span>
              <strong style={{ color: "#F8FAFC", fontSize: "14px" }}>
                {formatSeconds(item.durationMs)} s
              </strong>
              <code style={{ color: "#60A5FA", fontSize: "12px" }}>
                {formatTimecode(item.durationMs)}
              </code>
            </div>
          </div>
        </details>
      </div>

      {/* Editorial Dialogue Card */}
      <div className="inspector-card accent-slate">
        <details open>
          <summary style={{ color: "#CBD5E1" }}>✍️ Editorial &amp; Dialogue</summary>
          <div className="inspector-card-body">
            <div className="inspector-field">
              <label className="inspector-label">
                Dialogue note
                <textarea
                  className="inspector-textarea"
                  value={String(item.params.dialogue ?? "")}
                  onChange={(event) => onParams({ dialogue: event.target.value })}
                  placeholder="บทพูด / คำบรรยายของช่วงเวลานี้"
                />
              </label>
            </div>
          </div>
        </details>
      </div>

      {/* B-Roll Overlays Card */}
      <div className="inspector-card accent-blue">
        <details open>
          <summary style={{ color: "#60A5FA" }}>
            <span>🎬</span> <strong>B-roll overlays</strong>
          </summary>
          <div className="inspector-card-body">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "12px", color: "#94A3B8" }}>B-roll inserts on top of this A-roll</span>
              <button
                type="button"
                className="inspector-btn inspector-btn-primary inspector-btn-sm"
                onClick={() => {
                  const next = {
                    id: uniqueId(`${item.id}_broll`, broll.map((val) => val.id)),
                    asset: { path: "" },
                    offsetMs: 0,
                    durationMs: Math.min(4000, item.durationMs),
                    audioPolicy: "mute" as const,
                    fit: "cover" as const
                  };
                  onItem({ ...item, broll: [...broll, next] });
                  onSelectBroll?.(next.id);
                }}
              >
                ＋ Add B-roll under A-roll
              </button>
            </div>

            {broll.map((value, index) => (
              <div
                key={value.id}
                className="inspector-broll-item"
                style={{
                  borderColor: selectedBrollId === value.id ? "#3B82F6" : "#334155"
                }}
                onClick={() => onSelectBroll?.(value.id)}
              >
                <div className="inspector-broll-header">
                  <span style={{ color: "#E5A93C", fontWeight: 700, fontSize: "12px" }}>
                    #{index + 1} ({value.id})
                  </span>
                  <button
                    type="button"
                    className="inspector-btn inspector-btn-secondary inspector-btn-sm"
                    aria-label={`Remove ${value.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onItem({
                        ...item,
                        broll: broll.filter((_, itemIndex) => itemIndex !== index)
                      });
                    }}
                  >
                    × ลบ
                  </button>
                </div>

                <PathField
                  compact
                  label="B-roll path"
                  value={value.asset.path}
                  filter=".mov,.mp4,.mxf,.avi,.mkv"
                  onChange={(mediaPath) =>
                    updateBroll(index, { asset: { ...value.asset, path: mediaPath } })
                  }
                />

                <div className="inspector-grid-2">
                  <SecondsField
                    compact
                    label="B-roll offset"
                    valueMs={value.offsetMs}
                    minMs={0}
                    onChange={(offsetMs) => updateBroll(index, { offsetMs })}
                  />
                  <SecondsField
                    compact
                    label="B-roll duration"
                    valueMs={value.durationMs}
                    minMs={40}
                    onChange={(durationMs) => updateBroll(index, { durationMs })}
                  />
                </div>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
