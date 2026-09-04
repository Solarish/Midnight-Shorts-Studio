import React, { useState, useRef, useEffect } from "react";
import { PathField, SecondsField } from "./CommonFields";
import "./inspectors.css";

export interface BgmPreset {
  id: string;
  codeLabel: string;
  thaiLabel: string;
  dbLabel: string;
  label: string;
  path: string;
  defaultVolume: number;
  defaultDuck: number;
  description?: string;
}

export const BGM_PRESETS: BgmPreset[] = [
  {
    id: "news-pulse",
    codeLabel: "NEWS PULSE",
    thaiLabel: "ข่าวสาร & นวัตกรรม",
    dbLabel: "-14 dB",
    label: "PSU News & Tech Pulse",
    path: "assets/input/bgm-news.mp3",
    defaultVolume: 0.6,
    defaultDuck: 0.12,
    description: "ดนตรีอิเล็กทรอนิกส์จังหวะกระชับ สำหรับข่าวสาร เทคโนโลยี และนวัตกรรม"
  },
  {
    id: "inspiring",
    codeLabel: "INSPIRING",
    thaiLabel: "สัมภาษณ์วิชาการ",
    dbLabel: "-14 dB",
    label: "PSU Inspiring Morning",
    path: "assets/input/bgm-inspiring.mp3",
    defaultVolume: 0.65,
    defaultDuck: 0.12,
    description: "อะคูสติกกีตาร์อบอุ่น ฟังสบาย เหมาะกับบทสัมภาษณ์วิชาการและอาจารย์ตัวอย่าง"
  },
  {
    id: "honor",
    codeLabel: "ROYAL HONOR",
    thaiLabel: "พิธีการ & เกียรติยศ",
    dbLabel: "-12 dB",
    label: "PSU Royal Honor & Celebration",
    path: "assets/input/bgm-honor.mp3",
    defaultVolume: 0.65,
    defaultDuck: 0.15,
    description: "ออร์เคสตราสง่างาม สำหรับงานพิธี มอบรางวัล และความภาคภูมิใจมหาวิทยาลัย"
  },
  {
    id: "none",
    codeLabel: "VOICE ONLY",
    thaiLabel: "เฉพาะเสียงบรรยาย",
    dbLabel: "MUTE",
    label: "Speech Only",
    path: "",
    defaultVolume: 0,
    defaultDuck: 0,
    description: "ปิดเสียงดนตรีประกอบ ให้มีเฉพาะเสียงพูดสัมภาษณ์"
  }
];

export interface BgmInspectorProps {
  bgmPresetId: string;
  onPresetChange: (presetId: string) => void;
  bgmPath: string;
  onPathChange: (path: string) => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  duckVolume: number;
  onDuckVolumeChange: (duck: number) => void;
  autoDucking: boolean;
  onAutoDuckingChange: (enabled: boolean) => void;
  fadeInMs?: number;
  onFadeInMsChange?: (ms: number) => void;
  fadeOutMs?: number;
  onFadeOutMsChange?: (ms: number) => void;
  onOpenPicker?: () => void;
  speechWindows?: Array<{ sceneNumber: number; title: string; startSec: number; endSec: number }>;
}

export const BgmInspector: React.FC<BgmInspectorProps> = ({
  bgmPresetId,
  onPresetChange,
  bgmPath,
  onPathChange,
  volume,
  onVolumeChange,
  duckVolume,
  onDuckVolumeChange,
  autoDucking,
  onAutoDuckingChange,
  fadeInMs = 500,
  onFadeInMsChange,
  fadeOutMs = 1500,
  onFadeOutMsChange,
  speechWindows = []
}) => {
  const [isPlayingAudition, setIsPlayingAudition] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activePreset = BGM_PRESETS.find((p) => p.id === bgmPresetId);
  const effectiveAudioPath = bgmPath || activePreset?.path || "";

  // Apply preset configuration
  const handleSelectPreset = (presetId: string) => {
    onPresetChange(presetId);
    const preset = BGM_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      if (preset.path) {
        onPathChange(preset.path);
      }
      onVolumeChange(preset.defaultVolume);
      onDuckVolumeChange(preset.defaultDuck);
    }
  };

  // Handle Audition Play/Pause
  const toggleAudition = () => {
    if (!audioRef.current || !effectiveAudioPath) return;
    if (isPlayingAudition) {
      try { audioRef.current.pause(); } catch {}
      setIsPlayingAudition(false);
    } else {
      audioRef.current.currentTime = 0;
      audioRef.current.volume = volume;
      try {
        const playPromise = audioRef.current.play();
        if (playPromise) {
          playPromise.then(() => setIsPlayingAudition(true)).catch(() => setIsPlayingAudition(false));
        }
      } catch {
        setIsPlayingAudition(false);
      }
    }
  };

  useEffect(() => {
    if (audioRef.current && isPlayingAudition) {
      audioRef.current.volume = volume;
    }
  }, [volume, isPlayingAudition]);

  // Stop audition when changing audio path
  useEffect(() => {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      setIsPlayingAudition(false);
    }
  }, [effectiveAudioPath]);

  return (
    <div className="inspector-container bgm-inspector">
      {/* Hidden audio element for browser audition */}
      {effectiveAudioPath && (
        <audio
          ref={audioRef}
          src={`/api/v1/media/stream?path=${encodeURIComponent(effectiveAudioPath)}`}
          onEnded={() => setIsPlayingAudition(false)}
          onError={() => setIsPlayingAudition(false)}
        />
      )}

      {/* 1. Preset Selector Card */}
      <div className="inspector-card accent-amber">
        <details open>
          <summary style={{ color: "#FBBF24" }}>
            <span className="tva-lamp" />
            <span className="tva-telemetry-title">BGM PRESET // Background Music Preset</span>
          </summary>
          <div className="inspector-card-body">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
              {BGM_PRESETS.map((p) => {
                const isSelected = bgmPresetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`tva-stacked-card ${isSelected ? "active" : ""}`}
                    onClick={() => handleSelectPreset(p.id)}
                  >
                    <div className="tva-stacked-header">
                      <span className={isSelected ? "tva-lamp" : "tva-lamp-off"} />
                      <span className="tva-stacked-en">{p.codeLabel}</span>
                      <span style={{ marginLeft: "auto", fontSize: "10px", fontWeight: 700, color: isSelected ? "#F59E0B" : "#64748B" }}>
                        {p.dbLabel}
                      </span>
                    </div>
                    <div className="tva-stacked-th">{p.thaiLabel}</div>
                  </button>
                );
              })}
            </div>
            {bgmPresetId === "custom" && (
              <div style={{ fontSize: "11px", color: "#38BDF8", padding: "4px 8px", background: "rgba(56, 189, 248, 0.1)", borderRadius: "5px", border: "1px solid rgba(56, 189, 248, 0.2)" }}>
                [●] CUSTOM AUDIO // กำหนดไฟล์เพลงประกอบเอง
              </div>
            )}
          </div>
        </details>
      </div>

      {/* 2. Audio Media Asset Card (Standard PathField matching Logo/Cover/A-roll) */}
      <div className="inspector-card accent-slate">
        <details open>
          <summary style={{ color: "#CBD5E1", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="tva-lamp" />
              <span className="tva-telemetry-title">AUDIO ASSET // Audio Media Asset</span>
            </div>
            {bgmPresetId !== "none" && (
              <span className="tva-badge">
                STEREO 48kHz
              </span>
            )}
          </summary>
          <div className="inspector-card-body">
            <PathField
              label="Audio Asset Path (ไฟล์เพลงประกอบ)"
              value={bgmPath}
              filter=".mp3,.wav,.m4a,.aac,.flac,.ogg"
              placeholder="assets/input/bgm-news.mp3 หรือเลือกจาก NAS"
              onChange={(val) => {
                onPathChange(val);
                onPresetChange("custom");
              }}
            />

            {/* Space-Age Audition Transport Button */}
            {effectiveAudioPath && (
              <button
                type="button"
                className="inspector-btn"
                onClick={toggleAudition}
                style={{
                  marginTop: "6px",
                  padding: "8px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  fontSize: "12px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  background: isPlayingAudition
                    ? "linear-gradient(135deg, rgba(239, 68, 68, 0.4), rgba(220, 38, 38, 0.3))"
                    : "linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.2))",
                  border: isPlayingAudition ? "1px solid #EF4444" : "1px solid #F59E0B",
                  color: "#FFFFFF",
                  cursor: "pointer",
                  borderRadius: "7px"
                }}
              >
                <span className={isPlayingAudition ? "tva-lamp" : "tva-lamp-off"} style={{ background: isPlayingAudition ? "#EF4444" : "#F59E0B" }} />
                <span>{isPlayingAudition ? "[■] STOP PREVIEW // หยุดเล่น" : "[▶] AUDITION // ทดลองฟังเสียงเพลง"}</span>
              </button>
            )}
          </div>
        </details>
      </div>

      {bgmPresetId !== "none" && (
        <>
          {/* 3. Volume & Dynamic Auto-Ducking Card */}
          <div className="inspector-card accent-amber">
            <details open>
              <summary style={{ color: "#FBBF24" }}>
                <span className="tva-lamp" />
                <span className="tva-telemetry-title">LEVEL &amp; DUCKING // ระดับเสียง</span>
              </summary>
              <div className="inspector-card-body">
                {/* Nominal Volume */}
                <div className="inspector-field">
                  <label className="inspector-label" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>ระดับเสียงปกติ (Nominal Volume)</span>
                    <span style={{ fontWeight: 700, color: "#FBBF24" }}>{Math.round(volume * 100)}%</span>
                  </label>
                  <input
                    className="inspector-input"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                    style={{ accentColor: "#F59E0B", cursor: "pointer" }}
                  />
                </div>

                {/* Auto-Ducking Toggle */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    background: "#161F30",
                    border: "1px solid #2A364F",
                    borderRadius: "6px"
                  }}
                >
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#F8FAFC", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span className={autoDucking ? "tva-lamp-green" : "tva-lamp-off"} />
                      <span>AUTO-DUCKING // Dynamic Auto-Ducking</span>
                    </div>
                    <div style={{ fontSize: "10px", color: "#94A3B8" }}>ลดเสียงเพลงอัตโนมัติเมื่อมีเสียงบรรยาย</div>
                  </div>
                  <label className="toggle-switch" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={autoDucking}
                      onChange={(e) => onAutoDuckingChange(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {/* Ducked Volume Slider */}
                {autoDucking && (
                  <div className="inspector-field" style={{ padding: "8px", background: "rgba(245, 158, 11, 0.06)", border: "1px solid rgba(245, 158, 11, 0.25)", borderRadius: "6px" }}>
                    <label className="inspector-label" style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>ระดับเสียงขณะมีบทพูด (Ducked Volume)</span>
                      <span style={{ fontWeight: 700, color: "#FBBF24" }}>{Math.round(duckVolume * 100)}% (~ -14dB)</span>
                    </label>
                    <input
                      className="inspector-input"
                      type="range"
                      min="0"
                      max="0.5"
                      step="0.01"
                      value={duckVolume}
                      onChange={(e) => onDuckVolumeChange(parseFloat(e.target.value))}
                      style={{ accentColor: "#F59E0B", cursor: "pointer" }}
                    />
                    <small style={{ fontSize: "10px", color: "#FDE68A", marginTop: "4px" }}>
                      [●] Ramp 0.6s หลบล่วงหน้าและดันขึ้นหลังพูดเสร็จอย่างนุ่มนวล
                    </small>
                  </div>
                )}
              </div>
            </details>
          </div>

          {/* 4. Envelopes & Fades Card */}
          <div className="inspector-card accent-slate">
            <details open>
              <summary style={{ color: "#CBD5E1" }}>
                <span className="tva-lamp" />
                <span className="tva-telemetry-title">AUDIO FADES // เวลาเฟดหัว-ท้าย</span>
              </summary>
              <div className="inspector-card-body">
                <div className="inspector-grid-2">
                  {onFadeInMsChange && (
                    <SecondsField
                      label="Fade In หัวรายการ"
                      valueMs={fadeInMs}
                      onChange={(ms) => onFadeInMsChange(ms)}
                      compact
                    />
                  )}
                  {onFadeOutMsChange && (
                    <SecondsField
                      label="Fade Out ท้ายรายการ"
                      valueMs={fadeOutMs}
                      onChange={(ms) => onFadeOutMsChange(ms)}
                      compact
                    />
                  )}
                </div>
              </div>
            </details>
          </div>

          {/* 5. Speech Windows Protected List Card */}
          {speechWindows.length > 0 && (
            <div className="inspector-card accent-slate">
              <details>
                <summary style={{ color: "#CBD5E1" }}>
                  <span className="tva-lamp" />
                  <span className="tva-telemetry-title">SPEECH WINDOWS // ช่วงเวลาเสียงพูด ({speechWindows.length})</span>
                </summary>
                <div className="inspector-card-body">
                  <div
                    style={{
                      maxHeight: "140px",
                      overflowY: "auto",
                      background: "#090D16",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "6px",
                      padding: "6px"
                    }}
                  >
                    {speechWindows.map((sw, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "11px",
                          padding: "4px 6px",
                          borderBottom: idx < speechWindows.length - 1 ? "1px solid rgba(255, 255, 255, 0.04)" : "none",
                          color: "#E2E8F0"
                        }}
                      >
                        <span>#{sw.sceneNumber} {sw.title}</span>
                        <span style={{ color: "#FBBF24", fontFamily: "monospace", fontSize: "10px" }}>
                          {sw.startSec.toFixed(1)}s - {sw.endSec.toFixed(1)}s (-14dB)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            </div>
          )}
        </>
      )}
    </div>
  );
};
