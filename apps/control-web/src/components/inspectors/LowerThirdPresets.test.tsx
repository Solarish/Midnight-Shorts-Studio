import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StoryboardItem } from "../../storyboard-types";
import { ARollInspector, lowerThirdPresetOptions } from "./ARollInspector";

describe("LowerThird Presets and ARollInspector", () => {
  it("includes all 3 broadcast-grade presets in lowerThirdPresetOptions", () => {
    const values = lowerThirdPresetOptions.map((opt) => opt.value);
    expect(values).toContain("lowerthird-glass-beacon-v1");
    expect(values).toContain("lowerthird-kinetic-ribbon-v1");
    expect(values).toContain("lowerthird-tech-hud-v1");
  });

  it("renders Lower Third toggle and toggles enabled state", () => {
    const mockItem: StoryboardItem = {
      id: "item_1",
      kind: "a_roll",
      durationMs: 5000,
      audioPolicy: "preserve",
      presetId: "a-roll-segment-v1",
      params: {
        sourcePath: "footage/sample.mov",
        speaker: "ผศ.ดร. นพ.วิโรจน์",
        lowerThird: {
          enabled: false,
          presetId: "lowerthird-glass-beacon-v1",
          name: "ผศ.ดร. นพ.วิโรจน์",
          title: "รองศาสตราจารย์",
          department: "คณะแพทยศาสตร์ ม.อ."
        }
      }
    };

    const onParams = vi.fn();
    const onItem = vi.fn();

    const { rerender } = render(
      <ARollInspector
        item={mockItem}
        onParams={onParams}
        onItem={onItem}
      />
    );

    // Initial state is OFF
    expect(screen.getByText(/○ Lower Third OFF/i)).toBeDefined();

    // Toggle Lower Third ON (first checkbox in inspector)
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);

    expect(onParams).toHaveBeenCalledWith(
      expect.objectContaining({
        enableLowerThird: true,
        lowerThird: expect.objectContaining({
          enabled: true,
          presetId: "lowerthird-glass-beacon-v1"
        })
      })
    );

    // Re-render with enabled = true
    const enabledItem: StoryboardItem = {
      ...mockItem,
      params: {
        ...mockItem.params,
        lowerThird: {
          ...(mockItem.params.lowerThird as any),
          enabled: true
        }
      }
    };

    rerender(
      <ARollInspector
        item={enabledItem}
        onParams={onParams}
        onItem={onItem}
      />
    );

    expect(screen.getByText(/● Lower Third ON/i)).toBeDefined();
    expect(screen.getByText(/Live Design Preview:/i)).toBeDefined();
  });

  it("renders live preview for Editorial Kinetic Ribbon preset", () => {
    const ribbonItem: StoryboardItem = {
      id: "item_2",
      kind: "a_roll",
      durationMs: 5000,
      audioPolicy: "preserve",
      params: {
        lowerThird: {
          enabled: true,
          presetId: "lowerthird-kinetic-ribbon-v1",
          name: "ดร. สมชาย มงคล",
          title: "ผู้อำนวยการศูนย์",
          department: "PSU Digital Hub"
        }
      }
    };

    render(
      <ARollInspector
        item={ribbonItem}
        onParams={vi.fn()}
        onItem={vi.fn()}
      />
    );

    expect(screen.getByText(/◆ PSU BROADCAST OFFICIAL/i)).toBeDefined();
    expect(screen.getByText(/ดร. สมชาย มงคล/i)).toBeDefined();
    expect(screen.getByText(/ผู้อำนวยการศูนย์/i)).toBeDefined();
  });

  it("renders live preview for Cyber Tech HUD preset", () => {
    const hudItem: StoryboardItem = {
      id: "item_3",
      kind: "a_roll",
      durationMs: 5000,
      audioPolicy: "preserve",
      params: {
        lowerThird: {
          enabled: true,
          presetId: "lowerthird-tech-hud-v1",
          name: "วิศวกรระบบ AI",
          title: "Lead AI Researcher",
          department: "Robotics PSU"
        }
      }
    };

    render(
      <ARollInspector
        item={hudItem}
        onParams={vi.fn()}
        onItem={vi.fn()}
      />
    );

    expect(screen.getByText(/● SYS:\/\/NODE\.LIVE/i)).toBeDefined();
    expect(screen.getByText(/\/\/ PSU\.AV\.01/i)).toBeDefined();
    expect(screen.getByText(/วิศวกรระบบ AI/i)).toBeDefined();
    expect(screen.getByText(/Lead AI Researcher/i)).toBeDefined();
  });
});
