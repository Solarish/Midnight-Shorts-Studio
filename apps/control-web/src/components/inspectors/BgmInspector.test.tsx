import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BgmInspector, BGM_PRESETS } from "./BgmInspector";

afterEach(cleanup);

describe("BgmInspector", () => {
  it("exposes canonical broadcast music presets", () => {
    const presetIds = BGM_PRESETS.map((p) => p.id);
    expect(presetIds).toContain("news-pulse");
    expect(presetIds).toContain("inspiring");
    expect(presetIds).toContain("honor");
    expect(presetIds).toContain("none");
  });

  it("renders soundtrack controls, volume slider, and ducking toggle", () => {
    const onPresetChange = vi.fn();
    const onPathChange = vi.fn();
    const onVolumeChange = vi.fn();
    const onDuckVolumeChange = vi.fn();
    const onAutoDuckingChange = vi.fn();

    render(
      <BgmInspector
        bgmPresetId="news-pulse"
        onPresetChange={onPresetChange}
        bgmPath=""
        onPathChange={onPathChange}
        volume={0.6}
        onVolumeChange={onVolumeChange}
        duckVolume={0.12}
        onDuckVolumeChange={onDuckVolumeChange}
        autoDucking={true}
        onAutoDuckingChange={onAutoDuckingChange}
        speechWindows={[
          { sceneNumber: 2, title: "รศ.ดร.เกวลิน", startSec: 4.0, endSec: 11.0 }
        ]}
      />
    );

    expect(screen.getByText(/Background Music Preset/i)).toBeDefined();
    expect(screen.getByText(/Audio Media Asset/i)).toBeDefined();
    expect(screen.getByText(/60%/i)).toBeDefined();
    expect(screen.getByText(/12%/i)).toBeDefined();
    expect(screen.getByText(/Dynamic Auto-Ducking/i)).toBeDefined();
    expect(screen.getByText(/รศ.ดร.เกวลิน/i)).toBeDefined();
  });

  it("renders PathField with NAS selector for audio asset path", () => {
    const onPathChange = vi.fn();

    render(
      <BgmInspector
        bgmPresetId="news-pulse"
        onPresetChange={vi.fn()}
        bgmPath="/Volumes/NAS/Audio/theme.mp3"
        onPathChange={onPathChange}
        volume={0.7}
        onVolumeChange={vi.fn()}
        duckVolume={0.15}
        onDuckVolumeChange={vi.fn()}
        autoDucking={true}
        onAutoDuckingChange={vi.fn()}
      />
    );

    // Verify standard PathField input & NAS button exist
    const nasBtn = screen.getByRole("button", { name: /เลือกจาก NAS/i });
    expect(nasBtn).toBeDefined();
    expect(screen.getByText(/theme.mp3/i)).toBeDefined();
  });
});
