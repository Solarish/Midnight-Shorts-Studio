import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { DocumentaryInspector } from "./DocumentaryInspectors";

vi.mock("../api", async () => {
  const actual = await vi.importActual("../api");
  return {
    ...actual,
    previewDocx: vi.fn().mockResolvedValue({
      ok: true,
      path: "assets/input/storyboard.docx",
      segmentCount: 12,
      cardCount: 4,
      totalDialogueMs: 473000,
      totalDialogueFormatted: "07:53 นาที",
      segments: [
        {
          id: "interview_01",
          sourceKey: "C7724",
          sourceInMs: 0,
          sourceOutMs: 25000,
          durationMs: 25000,
          dialogue: "การพัฒนาการเรียนการสอนด้านทันตแพทย์",
          picture: "C7724 00:00 - 00:25",
          sound: "การพัฒนาการเรียนการสอนด้านทันตแพทย์",
          rowIndex: 1
        }
      ],
      cards: []
    }),
    browseDirectory: vi.fn().mockResolvedValue({
      currentPath: "/Volumes/ภาควีดีทัศน์",
      parentPath: "/Volumes",
      breadcrumbs: [{ name: "Root", path: "/" }, { name: "Volumes", path: "/Volumes" }, { name: "ภาควีดีทัศน์", path: "/Volumes/ภาควีดีทัศน์" }],
      bookmarks: [{ id: "nas-kewalin", name: "📁 NAS: อ.เกวลิน 69", path: "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ ", category: "nas", exists: true }],
      entries: [{ name: "SB-เกวลิน.docx", path: "/Volumes/ภาควีดีทัศน์/SB-เกวลิน.docx", isDirectory: false, ext: ".docx", size: 10240 }],
      exists: true,
      accessible: true,
      totalEntries: 1
    })
  };
});

test("renders DocumentaryInspector for docx import, opens remote picker, and triggers change", async () => {
  const onChange = vi.fn();
  render(
    <DocumentaryInspector
      nodeType="storyboard.docx_import"
      config={{ path: "assets/input/storyboard.docx" }}
      onChange={onChange}
    />
  );

  const input = screen.getByLabelText(/ไฟล์สตอรี่บอร์ด DOCX/i);
  expect((input as HTMLInputElement).value).toBe("assets/input/storyboard.docx");

  const browseBtn = screen.getByRole("button", { name: /เลือกจาก NAS/i });
  expect(browseBtn).toBeDefined();
  fireEvent.click(browseBtn);

  expect(screen.getByText(/เลือกไฟล์สตอรี่บอร์ด DOCX จาก NAS/i)).toBeDefined();

  fireEvent.change(input, { target: { value: "assets/input/custom.docx" } });
  expect(onChange).toHaveBeenCalledWith("path", "assets/input/custom.docx");
});

test("renders DocumentaryInspector for media.catalog with NAS browse buttons", () => {
  const onChange = vi.fn();
  render(
    <DocumentaryInspector
      nodeType="media.catalog"
      config={{ root: "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ " }}
      onChange={onChange}
    />
  );

  expect(screen.getByLabelText(/โฟลเดอร์โครงการหลัก/i)).toBeDefined();
  const buttons = screen.getAllByRole("button", { name: /เลือกจาก NAS|เลือกโฟลเดอร์/i });
  expect(buttons.length).toBeGreaterThanOrEqual(2);
});

test("renders DocumentaryInspector for media conform profile", () => {
  const onChange = vi.fn();
  render(
    <DocumentaryInspector
      nodeType="media.conform"
      config={{ profile: "1080p25", cacheRoot: ".ava-cache/conform" }}
      onChange={onChange}
    />
  );

  expect(screen.getByLabelText(/ProRes Conform Profile/i)).toBeDefined();
  expect(screen.getByLabelText(/โฟลเดอร์เก็บแคชไฟล์ Conform/i)).toBeDefined();
});
