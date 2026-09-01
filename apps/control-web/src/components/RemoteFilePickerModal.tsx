import { useEffect, useState, useMemo } from "react";
import { browseDirectory, type FsBookmark, type FsBrowseResult, type FsEntry } from "../api";

export interface RemoteFilePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selectedPath: string) => void;
  initialPath?: string;
  mode?: "file" | "folder";
  filter?: string;
  title?: string;
  multiple?: boolean;
  onSelectMultiple?: (selectedPaths: string[]) => void;
}

export function RemoteFilePickerModal({
  isOpen,
  onClose,
  onSelect,
  initialPath,
  mode = "file",
  filter,
  title = "เลือกไฟล์/โฟลเดอร์จาก NAS สตูดิโอ",
  multiple = false,
  onSelectMultiple
}: RemoteFilePickerModalProps) {
  const [currentPath, setCurrentPath] = useState<string>(initialPath || "");
  const [browseData, setBrowseData] = useState<FsBrowseResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedEntry, setSelectedEntry] = useState<FsEntry | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<FsEntry[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSelectedEntries([]);
      loadDirectory(initialPath);
    }
  }, [isOpen, initialPath]);

  const loadDirectory = async (targetPath?: string) => {
    setLoading(true);
    setError(null);
    setSelectedEntry(null);
    try {
      const data = await browseDirectory(targetPath, filter);
      setBrowseData(data);
      setCurrentPath(data.currentPath);
    } catch (err: any) {
      setError(err?.message || "ไม่สามารถเชื่อมต่อหรือเปิดไดเรกทอรีบนเซิร์ฟเวอร์ได้");
    } finally {
      setLoading(false);
    }
  };

  const filteredEntries = useMemo(() => {
    if (!browseData?.entries) return [];
    if (!searchTerm.trim()) return browseData.entries;
    const term = searchTerm.toLowerCase();
    return browseData.entries.filter((entry) =>
      entry.name.toLowerCase().includes(term)
    );
  }, [browseData, searchTerm]);

  if (!isOpen) return null;

  const handleEntryClick = (entry: FsEntry) => {
    if (entry.isDirectory) {
      loadDirectory(entry.path);
    } else if (multiple) {
      setSelectedEntries((current) => current.some((value) => value.path === entry.path)
        ? current.filter((value) => value.path !== entry.path)
        : [...current, entry]);
    } else {
      setSelectedEntry(entry);
    }
  };

  const handleConfirm = () => {
    if (mode === "folder") {
      onSelect(currentPath);
      onClose();
    } else if (multiple && selectedEntries.length > 0) {
      onSelectMultiple?.(selectedEntries.map((entry) => entry.path));
      onClose();
    } else if (selectedEntry) {
      onSelect(selectedEntry.path);
      onClose();
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (bytes === undefined || bytes === null) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const getFileIcon = (entry: FsEntry) => {
    if (entry.isDirectory) return "📁";
    const ext = entry.ext?.toLowerCase();
    if (ext === ".docx" || ext === ".doc") return "📄";
    if (ext === ".mov" || ext === ".mp4" || ext === ".mxf") return "🎬";
    if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") return "🖼️";
    if (ext === ".aep" || ext === ".prproj") return "⚡";
    if (ext === ".wav" || ext === ".mp3" || ext === ".m4a") return "🎵";
    return "📎";
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px"
      }}
      onClick={onClose}
    >
      <div
        className="modal-content"
        style={{
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "860px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          color: "#f8fafc",
          overflow: "hidden"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #1e293b",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#1e293b"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}>🌐</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#e2e8f0" }}>{title}</h3>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                Remote Filesystem Explorer (เชื่อมต่อไปยัง Server & Internal NAS)
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              fontSize: "20px",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: "4px"
            }}
          >
            ✕
          </button>
        </div>

        {/* Bookmarks bar */}
        {browseData?.bookmarks && (
          <div
            style={{
              padding: "10px 16px",
              background: "#090d16",
              borderBottom: "1px solid #1e293b",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              overflowX: "auto",
              whiteSpace: "nowrap"
            }}
          >
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>Bookmarks:</span>
            {browseData.bookmarks.map((bm: FsBookmark) => {
              const isCurrent = currentPath.startsWith(bm.path);
              return (
                <button
                  key={bm.id}
                  type="button"
                  onClick={() => loadDirectory(bm.path)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: isCurrent ? "1px solid #38bdf8" : "1px solid #334155",
                    background: isCurrent ? "rgba(56, 189, 248, 0.15)" : "#1e293b",
                    color: isCurrent ? "#38bdf8" : bm.exists ? "#cbd5e1" : "#64748b",
                    fontSize: "12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                  title={bm.path}
                >
                  {bm.name}
                  {!bm.exists && <span style={{ color: "#ef4444", fontSize: "10px" }}>(Unmounted)</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Navigation & Search bar */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #1e293b",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            background: "#0f172a"
          }}
        >
          {/* Breadcrumbs */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              flexWrap: "wrap",
              fontSize: "13px"
            }}
          >
            {browseData?.parentPath && (
              <button
                type="button"
                onClick={() => loadDirectory(browseData.parentPath!)}
                style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  color: "#94a3b8",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "12px",
                  marginRight: "6px"
                }}
                title="ย้อนกลับ (Up one level)"
              >
                ⬆️ Up
              </button>
            )}
            {browseData?.breadcrumbs.map((crumb, idx) => {
              const isLast = idx === browseData.breadcrumbs.length - 1;
              return (
                <span key={crumb.path} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  {idx > 0 && <span style={{ color: "#475569" }}>/</span>}
                  <button
                    type="button"
                    onClick={() => loadDirectory(crumb.path)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: isLast ? "#38bdf8" : "#94a3b8",
                      fontWeight: isLast ? 600 : 400,
                      cursor: "pointer",
                      padding: "2px 4px",
                      borderRadius: "4px"
                    }}
                  >
                    {crumb.name}
                  </button>
                </span>
              );
            })}
          </div>

          {/* Search box */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <input
              type="text"
              placeholder={`ค้นหาในโฟลเดอร์นี้... ${filter ? `(แสดงเฉพาะ ${filter})` : ""}`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                padding: "8px 12px",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#f8fafc",
                fontSize: "13px"
              }}
            />
            {filter && (
              <span
                style={{
                  background: "rgba(56, 189, 248, 0.1)",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  color: "#38bdf8",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  whiteSpace: "nowrap"
                }}
              >
                Filter: {filter}
              </span>
            )}
          </div>
        </div>

        {/* Content list */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 16px",
            minHeight: "260px"
          }}
        >
          {loading && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
              ⏳ กำลังโหลดรายการไฟล์จาก Server...
            </div>
          )}

          {error && (
            <div
              style={{
                padding: "16px",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid #ef4444",
                borderRadius: "8px",
                color: "#fca5a5",
                fontSize: "13px",
                margin: "12px 0"
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {!loading && !error && filteredEntries.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
              ไม่พบไฟล์หรือโฟลเดอร์ในตำแหน่งนี้
            </div>
          )}

          {!loading && !error && filteredEntries.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {filteredEntries.map((entry) => {
                const isSelected = multiple
                  ? selectedEntries.some((value) => value.path === entry.path)
                  : selectedEntry?.path === entry.path;
                return (
                  <div
                    key={entry.path}
                    onClick={() => handleEntryClick(entry)}
                    onDoubleClick={() => {
                      if (!multiple && !entry.isDirectory) {
                        onSelect(entry.path);
                        onClose();
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      background: isSelected
                        ? "rgba(56, 189, 248, 0.2)"
                        : entry.isDirectory
                        ? "rgba(255, 255, 255, 0.02)"
                        : "transparent",
                      border: isSelected ? "1px solid #38bdf8" : "1px solid transparent",
                      cursor: "pointer",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
                      {multiple && !entry.isDirectory && <input type="checkbox" readOnly checked={isSelected} aria-label={`Select ${entry.name}`}/>} 
                      <span style={{ fontSize: "16px" }}>{getFileIcon(entry)}</span>
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: entry.isDirectory ? 600 : 400,
                          color: entry.isDirectory ? "#e2e8f0" : isSelected ? "#38bdf8" : "#cbd5e1",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }}
                      >
                        {entry.name}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "16px", color: "#64748b", fontSize: "12px" }}>
                      {!entry.isDirectory && <span>{formatFileSize(entry.size)}</span>}
                      {entry.isDirectory && <span style={{ color: "#38bdf8" }}>➔</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid #1e293b",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#090d16"
          }}
        >
          <div style={{ fontSize: "12px", color: "#94a3b8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: "16px" }}>
            {mode === "folder" ? (
              <span>โฟลเดอร์ปัจจุบัน: <code>{currentPath}</code></span>
            ) : multiple && selectedEntries.length > 0 ? (
              <span>เลือกแล้ว <code style={{ color: "#38bdf8" }}>{selectedEntries.length} ไฟล์</code></span>
            ) : selectedEntry ? (
              <span>เลือก: <code style={{ color: "#38bdf8" }}>{selectedEntry.name}</code> ({selectedEntry.path})</span>
            ) : (
              <span>คลิกเพื่อเลือกไฟล์ที่ต้องการ หรือดับเบิลคลิกเพื่อยืนยัน</span>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                background: "#1e293b",
                border: "1px solid #334155",
                color: "#94a3b8",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "13px"
              }}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={mode === "file" && (multiple ? selectedEntries.length === 0 : !selectedEntry)}
              onClick={handleConfirm}
              style={{
                padding: "8px 20px",
                background: (mode === "folder" || selectedEntry || selectedEntries.length > 0) ? "#0284c7" : "#334155",
                border: "none",
                color: "#ffffff",
                borderRadius: "6px",
                cursor: (mode === "folder" || selectedEntry || selectedEntries.length > 0) ? "pointer" : "not-allowed",
                fontWeight: 600,
                fontSize: "13px",
                boxShadow: (mode === "folder" || selectedEntry || selectedEntries.length > 0) ? "0 4px 12px rgba(2, 132, 199, 0.4)" : "none"
              }}
            >
              {mode === "folder" ? "เลือกโฟลเดอร์นี้" : multiple ? `เพิ่ม ${selectedEntries.length} ไฟล์` : "ยืนยันเลือกไฟล์"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
