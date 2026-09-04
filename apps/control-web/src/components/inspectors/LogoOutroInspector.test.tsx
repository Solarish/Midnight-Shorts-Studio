import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoryboardItem } from "../../storyboard-types";
import { LogoOutroInspector, outroPresetOptions, DEFAULT_PSU_LOGO } from "./LogoOutroInspector";

afterEach(cleanup);

describe("LogoOutro Presets and LogoOutroInspector", () => {
  it("includes all 4 presets in outroPresetOptions", () => {
    const values = outroPresetOptions.map((opt) => opt.value);
    expect(values).toContain("logo-outro-v1");
    expect(values).toContain("logo-outro-particle-burst-v1");
    expect(values).toContain("logo-outro-video-v1");
    expect(values).toContain("logo-outro-minimal-v1");
  });

  it("renders Golden Light Streak Ident preset controls correctly", () => {
    const mockItem: StoryboardItem = {
      id: "logo_1",
      kind: "logo_outro",
      durationMs: 4000,
      audioPolicy: "mute",
      presetId: "logo-outro-v1",
      params: {
        sourcePath: DEFAULT_PSU_LOGO,
        title: "PSU BROADCAST",
        subtitle: "Prince of Songkla University",
        eyebrow: "มหาวิทยาลัยสงขลานครินทร์",
        logoScale: 1.0,
        glowIntensity: 1.0
      }
    };

    const onParams = vi.fn();
    const onItem = vi.fn();

    render(
      <LogoOutroInspector
        item={mockItem}
        onParams={onParams}
        onItem={onItem}
      />
    );

    expect(screen.getByText(/PSU Logo Media/i)).toBeDefined();
    expect(screen.getByText(/3-Tier Inverted Mask/i)).toBeDefined();
    expect(screen.getByText(/Laser Streak, Glow & Scale/i)).toBeDefined();
    expect(screen.getByLabelText("Eyebrow")).toHaveValue("มหาวิทยาลัยสงขลานครินทร์");
    expect(screen.getByLabelText("Title")).toHaveValue("PSU BROADCAST");
  });

  it("switches preset and updates params properly", () => {
    const mockItem: StoryboardItem = {
      id: "logo_1",
      kind: "logo_outro",
      durationMs: 4000,
      audioPolicy: "mute",
      presetId: "logo-outro-v1",
      params: {
        sourcePath: DEFAULT_PSU_LOGO,
        title: "PSU BROADCAST"
      }
    };

    const onParams = vi.fn();
    const onItem = vi.fn();

    render(
      <LogoOutroInspector
        item={mockItem}
        onParams={onParams}
        onItem={onItem}
      />
    );

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "logo-outro-particle-burst-v1" } });

    expect(onParams).toHaveBeenCalledWith(
      expect.objectContaining({
        presetId: "logo-outro-particle-burst-v1"
      })
    );
  });

  it("renders Fullscreen Video Sting controls when preset is logo-outro-video-v1", () => {
    const videoItem: StoryboardItem = {
      id: "logo_2",
      kind: "logo_outro",
      durationMs: 4000,
      audioPolicy: "mute",
      presetId: "logo-outro-video-v1",
      params: {
        sourcePath: "/Volumes/video_sting.mov",
        videoFit: "cover",
        fadeInMs: 480,
        fadeOutMs: 480
      }
    };

    render(
      <LogoOutroInspector
        item={videoItem}
        onParams={vi.fn()}
        onItem={vi.fn()}
      />
    );

    expect(screen.getByText(/Outro Video File/i)).toBeDefined();
    expect(screen.getByText(/Video Playback & Transitions/i)).toBeDefined();
    expect(screen.getByLabelText("Fade In (s)")).toHaveValue(0.48);
    expect(screen.getByLabelText("Fade Out (s)")).toHaveValue(0.48);
  });
});
