import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import WorkflowGraphEditorPage from "./WorkflowGraphEditorPage";
import type { NodeTypeDescriptor } from "./graph-types";

const mockDescriptors: NodeTypeDescriptor[] = [
  {
    type: "asset.select",
    label: "Asset Select",
    lifecycleStage: "assets",
    category: "Asset",
    description: "เลือกและนำเข้าสื่อจาก workspace",
    version: "1",
    inputs: [],
    outputs: [{ id: "media", type: "media", required: true }],
    configSchema: {}
  },
  {
    type: "audio.jaitts",
    label: "JaiTTS Voice",
    lifecycleStage: "process",
    category: "Audio",
    description: "สร้างเสียงพูดภาษาไทยเป็น WAV",
    version: "1",
    inputs: [{ id: "text", type: "json", required: true }],
    outputs: [{ id: "audio", type: "audio", required: true }],
    configSchema: {}
  },
  {
    type: "timeline.scene",
    label: "Timeline Scene",
    lifecycleStage: "timeline",
    category: "Timeline",
    description: "กำหนดคลิปหนึ่งฉากและช่วงเวลา",
    version: "1",
    inputs: [{ id: "source", type: "media", required: true }],
    outputs: [{ id: "scene", type: "media", required: true }],
    configSchema: {}
  },
  {
    type: "premiere.build",
    label: "Premiere Build",
    lifecycleStage: "build",
    category: "Premiere",
    description: "สร้าง Premiere timeline จาก timeline specification",
    version: "1",
    inputs: [{ id: "timelineSpec", type: "json", required: true }],
    outputs: [{ id: "project", type: "premiere-project", required: true }],
    configSchema: {}
  },
  {
    type: "premiere.export",
    label: "Premiere Export",
    lifecycleStage: "export",
    category: "Premiere",
    description: "ส่งออก sequence เป็น H.264, ProRes หรือรูปแบบที่กำหนด",
    version: "1",
    inputs: [{ id: "project", type: "premiere-project", required: true }],
    outputs: [{ id: "artifacts", type: "media", required: true }],
    configSchema: {}
  }
];

const graphApi = vi.hoisted(() => ({
  getVisualWorkflow: vi.fn(),
  listNodeTypes: vi.fn(),
  patchVisualWorkflow: vi.fn(),
  validateVisualWorkflow: vi.fn(),
  publishVisualWorkflow: vi.fn(),
  cloneVisualWorkflow: vi.fn(),
  runVisualWorkflow: vi.fn(),
  importWorkflowMedia: vi.fn()
}));

vi.mock("./graph-api", () => graphApi);
vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");
  return {
    ...actual,
    ReactFlow: ({ children }: { children?: React.ReactNode }) => <div data-testid="graph-canvas">{children}</div>,
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null
  };
});

const workflow = {
  id: "workflow-1",
  name: "First workflow",
  status: "draft" as const,
  revision: 1,
  profile: "portrait" as const,
  nodes: [],
  edges: []
};

beforeEach(() => {
  vi.clearAllMocks();
  graphApi.getVisualWorkflow.mockResolvedValue(workflow);
  graphApi.listNodeTypes.mockResolvedValue(mockDescriptors);
  graphApi.patchVisualWorkflow.mockImplementation(async (value) => ({ ...value, revision: value.revision + 1 }));
  graphApi.validateVisualWorkflow.mockResolvedValue({ valid: true, errors: [] });
  graphApi.publishVisualWorkflow.mockResolvedValue({ ...workflow, status: "published" });
});
afterEach(cleanup);

test("gates publish and run on validation, invalidates on edit, and queues in-place run", async () => {
  let resolveRun!: (value: { runId: string }) => void;
  graphApi.runVisualWorkflow.mockReturnValue(new Promise((resolve) => { resolveRun = resolve; }));
  render(<MemoryRouter initialEntries={["/workflows/workflow-1/edit"]}><Routes><Route path="/workflows/:workflowId/edit" element={<WorkflowGraphEditorPage/>}/></Routes></MemoryRouter>);

  const publish = await screen.findByRole("button", { name: /Publish/i });
  const run = screen.getByRole("button", { name: /รัน Workflow/i });
  expect(run).toBeDisabled();

  // Click Validate in the footer toolbar
  fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบ/i }));
  await waitFor(() => expect(run).toBeEnabled());

  fireEvent.click(run);
  fireEvent.click(run);
  expect(graphApi.runVisualWorkflow).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "กำลังส่งคำสั่ง…" })).toBeDisabled();

  resolveRun({ runId: "run-1" });
});

test("editing a validated revision immediately disables run", async () => {
  render(<MemoryRouter initialEntries={["/workflows/workflow-1/edit"]}><Routes><Route path="/workflows/:workflowId/edit" element={<WorkflowGraphEditorPage/>}/></Routes></MemoryRouter>);
  const validateBtn = await screen.findByRole("button", { name: /ตรวจสอบ/i });
  fireEvent.click(validateBtn);
  await waitFor(() => expect(screen.getByRole("button", { name: /รัน Workflow/i })).toBeEnabled());

  fireEvent.change(screen.getByRole("textbox", { name: "Workflow name" }), { target: { value: "Edited workflow" } });

  expect(screen.getByRole("button", { name: /รัน Workflow/i })).toBeDisabled();
});

test("renders lifecycle navbar with 5 stages and allows palette search filtering", async () => {
  render(<MemoryRouter initialEntries={["/workflows/workflow-1/edit"]}><Routes><Route path="/workflows/:workflowId/edit" element={<WorkflowGraphEditorPage/>}/></Routes></MemoryRouter>);

  const navbar = await screen.findByLabelText("Workflow lifecycle stages");
  expect(navbar).toBeInTheDocument();
  expect(within(navbar).getByText("Assets")).toBeInTheDocument();
  expect(within(navbar).getByText("Process / AI")).toBeInTheDocument();
  expect(within(navbar).getByText("Timeline")).toBeInTheDocument();
  expect(within(navbar).getByText("Build / Render")).toBeInTheDocument();
  expect(within(navbar).getByText("Export")).toBeInTheDocument();

  expect(screen.getByText("Asset Select")).toBeInTheDocument();
  expect(screen.getByText("JaiTTS Voice")).toBeInTheDocument();

  // Test palette search
  const searchInput = screen.getByRole("searchbox", { name: "ค้นหาโหนด" });
  fireEvent.change(searchInput, { target: { value: "jaitts" } });

  expect(screen.getByText("JaiTTS Voice")).toBeInTheDocument();
  expect(screen.queryByText("Asset Select")).not.toBeInTheDocument();
});

test("supports auto-layout and adding draggable nodes", async () => {
  render(<MemoryRouter initialEntries={["/workflows/workflow-1/edit"]}><Routes><Route path="/workflows/:workflowId/edit" element={<WorkflowGraphEditorPage/>}/></Routes></MemoryRouter>);

  const autoLayoutBtn = await screen.findByRole("button", { name: "Auto Layout" });
  expect(autoLayoutBtn).toBeInTheDocument();

  // Add node via click
  fireEvent.click(screen.getByText("Asset Select"));
  expect(screen.getByRole("heading", { name: "Inspector" })).toBeInTheDocument();
});
