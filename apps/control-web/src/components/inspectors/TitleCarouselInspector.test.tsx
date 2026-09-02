import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TitleCarouselInspector, introPresetOptions } from "./TitleCarouselInspector";
import type { StoryboardItem } from "../../storyboard-types";

afterEach(cleanup);

describe("TitleCarouselInspector", () => {
  it("exposes all intro presets including 3d-carousel, parallax, and split dynamic", () => {
    const presetValues = introPresetOptions.map((opt) => opt.value);
    expect(presetValues).toContain("3d-carousel-title-v1");
    expect(presetValues).toContain("title-parallax-cinema-v1");
    expect(presetValues).toContain("title-split-dynamic-v1");
    expect(presetValues).toContain("title-classic-flat-v1");
    expect(presetValues).toContain("title-minimal-badge-v1");
  });

  it("renders 3D Photo Carousel inspector controls by default (Gold Standard)", () => {
    const mockItem: StoryboardItem = {
      id: "title_1",
      kind: "title",
      durationMs: 25300,
      audioPolicy: "mute",
      presetId: "3d-carousel-title-v1",
      params: {
        text: "PSU BROADCAST",
        title: "อาจารย์ตัวอย่างดีเด่น",
        subtitle: "มหาวิทยาลัยสงขลานครินทร์",
        eyebrow: "SPECIAL REPORT",
        rotationSpeed: 1.2,
        cameraTilt: 10,
        enableReflection: true,
        media: ["/tmp/hero.jpg", "/tmp/photo2.jpg"]
      }
    };

    const onParams = vi.fn();
    const onItem = vi.fn();

    render(
      <TitleCarouselInspector
        item={mockItem}
        onParams={onParams}
        onItem={onItem}
      />
    );

    expect(screen.getByText(/3D Showcase Typography/i)).toBeDefined();
    expect(screen.getByText(/3D Camera & Showcase Physics/i)).toBeDefined();
    expect(screen.getByText(/CG Layout Sequencer/i)).toBeDefined();
    expect(screen.getByLabelText("Text")).toBeDefined();
    expect(screen.getByLabelText("Title")).toBeDefined();
    expect(screen.getByLabelText("Subtitle")).toBeDefined();
    expect(screen.getByLabelText("Eyebrow")).toBeDefined();
  });

  it("renders Cinematic Parallax Multi-Layer controls when preset is title-parallax-cinema-v1", () => {
    const parallaxItem: StoryboardItem = {
      id: "title_parallax",
      kind: "title",
      durationMs: 10000,
      audioPolicy: "mute",
      presetId: "title-parallax-cinema-v1",
      params: {
        title: "CINEMATIC HERO",
        subtitle: "PSU HERITAGE",
        eyebrow: "DOCUMENTARY EXCLUSIVE",
        media: ["/tmp/hero.jpg", "/tmp/atmosphere.jpg"]
      }
    };

    render(
      <TitleCarouselInspector
        item={parallaxItem}
        onParams={vi.fn()}
        onItem={vi.fn()}
      />
    );

    expect(screen.getByText(/Cinematic Parallax Typography/i)).toBeDefined();
    expect(screen.getByText(/Parallax Hero & Atmospheric Media/i)).toBeDefined();
    expect(screen.getByLabelText("Title")).toBeDefined();
  });

  it("renders High-Energy Broadcast Split Screen controls when preset is title-split-dynamic-v1", () => {
    const splitItem: StoryboardItem = {
      id: "title_split",
      kind: "title",
      durationMs: 8000,
      audioPolicy: "mute",
      presetId: "title-split-dynamic-v1",
      params: {
        title: "BREAKING NEWS",
        subtitle: "LIVE BROADCAST",
        eyebrow: "EXCLUSIVE",
        splitAngle: -8,
        media: ["/tmp/p1.jpg", "/tmp/p2.jpg", "/tmp/p3.jpg"]
      }
    };

    const onParams = vi.fn();

    render(
      <TitleCarouselInspector
        item={splitItem}
        onParams={onParams}
        onItem={vi.fn()}
      />
    );

    expect(screen.getByText(/High-Energy Split Typography/i)).toBeDefined();
    expect(screen.getByText(/Split Screen Geometry/i)).toBeDefined();
    expect(screen.getByText(/Split Screen Panels Media/i)).toBeDefined();
  });

  it("switches preset and notifies onItem and onParams", () => {
    const mockItem: StoryboardItem = {
      id: "title_1",
      kind: "title",
      durationMs: 10000,
      audioPolicy: "mute",
      presetId: "3d-carousel-title-v1",
      params: {
        title: "Initial Title",
        media: ["/tmp/photo1.jpg"]
      }
    };

    const onParams = vi.fn();
    const onItem = vi.fn();

    render(
      <TitleCarouselInspector
        item={mockItem}
        onParams={onParams}
        onItem={onItem}
      />
    );

    const select = screen.getByLabelText("Preset Style");
    fireEvent.change(select, { target: { value: "title-parallax-cinema-v1" } });

    expect(onItem).toHaveBeenCalledWith(
      expect.objectContaining({
        presetId: "title-parallax-cinema-v1"
      })
    );
    expect(onParams).toHaveBeenCalledWith(
      expect.objectContaining({
        presetId: "title-parallax-cinema-v1"
      })
    );
  });
});
