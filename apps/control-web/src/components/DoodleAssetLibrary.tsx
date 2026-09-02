import React, { useMemo, useState } from "react";
import "./doodle-asset-library.css";

export type RegisteredDoodleAsset = { id: string; word: string; image: string; slot?: number; createdAt?: string; category?: string };
export const SYSTEM_DOODLES = Array.from({ length: 25 }, (_, index) => `doodle-${String(index + 1).padStart(2, "0")}`);
const SYSTEM_ENTRIES = [
  ["Star", "academic"], ["Heart", "psychic"], ["Flower", "celebration"], ["Pencil", "engineering"], ["Book", "academic"],
  ["Tooth", "science"], ["Atom", "science"], ["Ribbon", "celebration"], ["Microscope", "science"], ["Beaker", "science"],
  ["Calculator", "engineering"], ["Ruler", "engineering"], ["Gear", "engineering"], ["Lightbulb", "academic"], ["Brain", "psychic"],
  ["Moon", "psychic"], ["Spark", "celebration"], ["Check", "academic"], ["Arrow", "engineering"], ["Camera", "vlog"],
  ["Chat", "vlog"], ["Smile", "celebration"], ["Leaf", "science"], ["Crown", "celebration"], ["Wave", "vlog"]
] as const;
const SYSTEM_SYMBOLS = ["★", "♥", "✿", "✎", "▤", "♢", "⚛", "⚑", "⌁", "♧", "▦", "⌖", "⚙", "☼", "◉", "☾", "✦", "✓", "➜", "▣", "☁", "☺", "❧", "♛", "〰"];
const FILTERS = ["all", "academic", "science", "psychic", "engineering", "celebration", "vlog", "custom"] as const;

export function DoodleAssetLibrary({
  assets,
  activeIds = SYSTEM_DOODLES,
  onToggle,
  onDelete
}: {
  assets: RegisteredDoodleAsset[];
  activeIds?: string[];
  onToggle?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<typeof FILTERS[number]>("all");

  const entries = useMemo(() => [
    ...SYSTEM_DOODLES.map((id, index) => ({
      id,
      slot: index + 1,
      name: SYSTEM_ENTRIES[index]![0],
      category: SYSTEM_ENTRIES[index]![1],
      custom: false,
      image: undefined as string | undefined,
      symbol: SYSTEM_SYMBOLS[index]
    })),
    ...assets.map((asset, index) => ({
      id: asset.image,
      slot: SYSTEM_DOODLES.length + index + 1,
      name: asset.word,
      category: asset.category ?? "custom",
      custom: true,
      image: asset.image,
      symbol: "✦"
    }))
  ].filter((entry) => filter === "all" || (filter === "custom" ? entry.custom : !entry.custom && entry.category === filter)).filter((entry) => !query.trim() || `${entry.name} ${entry.category} ${entry.id}`.toLowerCase().includes(query.trim().toLowerCase())), [assets, filter, query]);

  return (
    <section className="doodle-asset-library" aria-label="Reusable doodle asset library">
      <header>
        <div>
          <strong>Reusable doodle library</strong>
          <small>{SYSTEM_DOODLES.length} system · {assets.length} custom · centralized registry</small>
        </div>
        <code>asset.library.v3</code>
      </header>
      <div className="doodle-asset-toolbar">
        <input aria-label="Search doodles" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search doodles" />
        <div className="doodle-asset-filters" role="tablist" aria-label="Doodle categories">
          {FILTERS.map((value) => (
            <button type="button" role="tab" aria-selected={filter === value} className={filter === value ? "selected" : ""} key={value} onClick={() => setFilter(value)}>
              {value}
            </button>
          ))}
        </div>
      </div>
      <div className="doodle-asset-grid">
        {entries.map((entry) => {
          const index = SYSTEM_DOODLES.indexOf(entry.id);
          const active = activeIds.includes(entry.id) || (!entry.custom && activeIds.some((value) => /^doodle-\d+$/.test(value) && Number(value.slice(7)) === index + 1));
          return (
            <button
              type="button"
              className={`doodle-asset-slot ${active ? "active" : "inactive"} ${entry.custom ? "filled" : "system"}`}
              key={`${entry.custom ? "custom" : "system"}-${entry.id}`}
              onClick={() => onToggle?.(entry.id)}
              aria-pressed={active}
              title={`${entry.name} · ${entry.category}`}
            >
              <div className="doodle-asset-slot-header">
                <span className="doodle-asset-slot-number">{String(entry.slot).padStart(2, "0")} · {entry.category}</span>
                {entry.custom && onDelete && (
                  <button
                    type="button"
                    className="doodle-asset-delete-btn"
                    title="Delete custom doodle"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(entry.id);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
              {entry.image ? (
                <img src={`/api/v1/media/stream?path=${encodeURIComponent(entry.image)}`} alt={entry.name} />
              ) : (
                <span className="doodle-system-icon">{entry.symbol}</span>
              )}
              <strong>{entry.name}</strong>
              <small>{active ? "On" : "Off"}</small>
            </button>
          );
        })}
      </div>
      {entries.length === 0 && <small className="doodle-asset-empty">No doodles match this filter.</small>}
    </section>
  );
}
