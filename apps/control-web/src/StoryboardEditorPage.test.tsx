import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import StoryboardEditorPage from "./StoryboardEditorPage";

const storyboardApi = vi.hoisted(() => ({
  getStoryboard: vi.fn(),
  getStoryboardImport: vi.fn(),
  getStoryboardCompilation: vi.fn(),
  patchStoryboard: vi.fn(),
  validateStoryboard: vi.fn(),
  approveAndCompileStoryboard: vi.fn()
}));
vi.mock("./storyboard-api", () => storyboardApi);

const fsApi = vi.hoisted(() => ({ browseDirectory: vi.fn() }));
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, browseDirectory: fsApi.browseDirectory };
});

const storyboard = {
  schemaVersion: 2 as const,
  storyboardId: "story-1",
  name: "Kewalin documentary",
  revision: 1,
  profile: { width: 1920 as const, height: 1080 as const, frameRate: 25 as const },
  sourceImport: { importId: "import-1", docxPath: "/Volumes/story.docx", sourceDigest: "digest", importedAt: "now" },
  status: "draft" as const,
  items: [
    { id: "title_1", kind: "title" as const, durationMs: 10000, audioPolicy: "mute" as const, presetId: "ae-3d-carousel-title-v1", params: { composition: "Main", media: ["/tmp/title.jpg"], texts: { title: "PSU" } } },
    { id: "interview_1", kind: "a_roll" as const, durationMs: 4000, audioPolicy: "preserve" as const, presetId: "a-roll-segment-v1", params: { sourceKey: "C7724", sourcePath: "/tmp/interview.mov", sourceInMs: 0, sourceOutMs: 4000, dialogue: "Hello" }, broll: [] },
    { id: "cover_1", kind: "cover_card" as const, durationMs: 6000, audioPolicy: "mute" as const, presetId: "comfy-cover-card-v2", params: { sourceImage: "/tmp/person.jpg", prompt: "ฉากมหาวิทยาลัย", title: "ชื่อเดิม", subtitle: "ตำแหน่งเดิม", eyebrow: "รางวัลเดิม", seed: 1 } }
  ]
};
const imported = { schemaVersion: 2, importId: "import-1", docxPath: "/Volumes/story.docx", sourceDigest: "digest", importedAt: "now", rawRows: [{ rowIndex: 2, rowNumber: 3, cells: ["ภาพปก", ""], picture: "ภาพปก", sound: "" }], proposals: [], diagnostics: [] };
const compilation = { schemaVersion: 2, storyboardId: "story-1", storyboardVersion: 1, storyboardDigest: "storydigest", graphDigest: "graphdigest123456", compiledAt: "now", executable: false as const, graph: { graphId: "graph", name: "Compiled", nodes: [{ id: "sb_title_1__carousel", type: "effect.3d_carousel", config: {} }], edges: [], order: ["sb_title_1__carousel"] }, timeline: { durationMs: 14000, items: [] }, provenance: { sb_title_1__carousel: "title_1" }, diagnostics: [] };

beforeEach(() => {
  vi.clearAllMocks();
  storyboardApi.getStoryboard.mockResolvedValue(structuredClone(storyboard));
  storyboardApi.getStoryboardImport.mockResolvedValue(imported);
  storyboardApi.patchStoryboard.mockImplementation(async (value) => ({ ...value, revision: value.revision + 1 }));
  storyboardApi.validateStoryboard.mockResolvedValue({ valid: true, diagnostics: [] });
  storyboardApi.approveAndCompileStoryboard.mockResolvedValue({ approved: { version: 1, storyboardDigest: "storydigest" }, compilation, diagnostics: [] });
  fsApi.browseDirectory.mockResolvedValue({
    currentPath: "/tmp",
    parentPath: "/",
    breadcrumbs: [{ name: "tmp", path: "/tmp" }],
    bookmarks: [],
    entries: [
      { name: "carousel-02.jpg", path: "/tmp/carousel-02.jpg", isDirectory: false, ext: ".jpg", size: 200 },
      { name: "carousel-03.png", path: "/tmp/carousel-03.png", isDirectory: false, ext: ".png", size: 300 }
    ],
    exists: true,
    accessible: true,
    totalEntries: 2
  });
});
afterEach(cleanup);

function renderPage() {
  return render(<MemoryRouter initialEntries={["/storyboards/story-1/edit"]}><Routes><Route path="/storyboards/:storyboardId/edit" element={<StoryboardEditorPage/>}/></Routes></MemoryRouter>);
}

test("uses editorial order as the primary surface and exposes no live run action", async () => {
  renderPage();
  expect(await screen.findByText("1. 3D Title")).toBeInTheDocument();
  expect(screen.getByText("2. A-roll")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /run|live|export/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Compare DOCX import" }));
  expect(screen.getByText("Row 3")).toBeInTheDocument();
});

test("saves an edit before validation and preserves revision locking", async () => {
  renderPage();
  const duration = await screen.findByLabelText("Duration (s)");
  expect(duration).toHaveValue(10);
  fireEvent.change(duration, { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "Validate" }));
  await waitFor(() => expect(storyboardApi.patchStoryboard).toHaveBeenCalledTimes(1));
  expect(storyboardApi.patchStoryboard.mock.calls[0]?.[0].items[0]?.durationMs).toBe(12000);
  await waitFor(() => expect(storyboardApi.validateStoryboard).toHaveBeenCalledWith("story-1"));
});

test("keeps global Text and Title independent through a persisted title edit", async () => {
  renderPage();
  const text = await screen.findByLabelText("Text");
  const title = screen.getByLabelText("Title");
  fireEvent.change(text, { target: { value: "Global message" } });
  fireEvent.change(title, { target: { value: "Editorial title" } });
  await waitFor(() => expect(storyboardApi.patchStoryboard).toHaveBeenCalled());
  const savedTitle = storyboardApi.patchStoryboard.mock.calls.at(-1)?.[0].items.find((item: any) => item.id === "title_1");
  expect(savedTitle.params).toMatchObject({ text: "Global message", title: "Editorial title", texts: { text: "Global message", title: "Editorial title" } });
});

test("uses a typed preset selector and Finder media picker for A-roll", async () => {
  renderPage();
  fireEvent.click(await screen.findByText("2. A-roll"));
  expect(screen.getByLabelText("Preset")).toHaveValue("a-roll-segment-v1");
  expect(screen.getByRole("button", { name: /เลือกจาก NAS|Open Finder/ })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Duration (s)"), { target: { value: "6.2" } });
  await waitFor(() => expect(screen.getByLabelText("Source out (s)")).toHaveValue(6.2));
});

test("shows B-roll as a selectable child of A-roll in editorial order", async () => {
  renderPage();
  const addButtons = await screen.findAllByRole("button", { name: "＋ Add B-roll under A-roll" });
  fireEvent.click(addButtons[0]!);
  expect(await screen.findByRole("button", { name: /B-roll 1/ })).toHaveTextContent("V2");
  expect(screen.getByText("B-roll overlays")).toBeInTheDocument();
});

test("adds multiple carousel images from Finder and keeps an ordered media list", async () => {
  renderPage();
  expect(await screen.findByText("title.jpg")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open Finder…" }));
  fireEvent.click(await screen.findByText("carousel-02.jpg"));
  fireEvent.click(screen.getByText("carousel-03.png"));
  fireEvent.click(screen.getByRole("button", { name: "เพิ่ม 2 ไฟล์" }));
  expect(await screen.findByText("carousel-02.jpg")).toBeInTheDocument();
  expect(screen.getByText("carousel-03.png")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Move 1 up" })).toBeDisabled();
});

test("Cover Card exposes required editorial text inputs and an explicit English-only ComfyUI prompt", async () => {
  renderPage();
  fireEvent.click(await screen.findByText("3. Cover card"));
  expect(screen.getByLabelText("Cover person name")).toHaveValue("ชื่อเดิม");
  expect(screen.getByLabelText("Cover position title")).toHaveValue("ตำแหน่งเดิม");
  expect(screen.getByLabelText("Cover award")).toHaveValue("รางวัลเดิม");
  expect(screen.getByLabelText("Cover background direction")).toHaveValue("ฉากมหาวิทยาลัย");
  expect(screen.getByText("English prompt")).toBeInTheDocument();
  expect(screen.getByText(/รับ prompt ภาษาอังกฤษโดยตรง/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "เติมจากข้อมูลเดิม" }));
  fireEvent.change(screen.getByLabelText("Cover person name"), { target: { value: "ชื่อใหม่" } });
  await waitFor(() => expect(storyboardApi.patchStoryboard).toHaveBeenCalled());
  const savedCover = storyboardApi.patchStoryboard.mock.calls.at(-1)?.[0].items.find((item: any) => item.id === "cover_1");
  expect(savedCover.params).toMatchObject({ personName: "ชื่อใหม่", positionTitle: "ตำแหน่งเดิม", award: "รางวัลเดิม" });
});

test("approval opens a read-only compiled graph with storyboard provenance", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Approve Storyboard & Compile Graph" }));
  expect(await screen.findByText("effect.3d_carousel")).toBeInTheDocument();
  expect(screen.getByText("source: title_1")).toBeInTheDocument();
  expect(screen.getAllByText(/graphdigest1/)).toHaveLength(2);
});
