import type { StoryboardItem } from "../../storyboard-types";
import "./inspectors.css";

export interface NoteInspectorProps {
  item: StoryboardItem;
  onParams: (patch: Record<string, unknown>) => void;
}

export function NoteInspector({ item, onParams }: NoteInspectorProps) {
  return (
    <div className="inspector-container">
      <div className="inspector-card accent-slate">
        <details open>
          <summary style={{ color: "#F8F6F0", letterSpacing: "0.05em", fontWeight: 700 }}>
            <span className="tva-lamp" style={{ marginRight: 6 }}>●</span> EDITORIAL NOTE <span style={{ color: "#94A3B8", fontWeight: 400, fontSize: "11px", marginLeft: 4 }}>// บันทึกข้อความกองบรรณาธิการ</span>
          </summary>
          <div className="inspector-card-body">
            <div className="inspector-field">
              <label className="inspector-label">
                Editorial note
                <textarea
                  className="inspector-textarea"
                  value={String(item.params.text ?? "")}
                  onChange={(event) => onParams({ text: event.target.value })}
                  rows={5}
                  placeholder="บันทึกข้อความภายในทีมงาน..."
                />
              </label>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
