import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api, getHealth, getReadiness, type Artifact, type Readiness, type Run } from "./api";
import { cloneVisualWorkflow, getVisualWorkflow, importWorkflowMedia, listNodeTypes, patchVisualWorkflow, publishVisualWorkflow, runVisualWorkflow, validateVisualWorkflow } from "./graph-api";
import { compatiblePortTypes, computedTimeline, connectionCompatibility, defaultConfig, layoutGraphNodes, serializeEdges, wouldCreateCycle } from "./graph-model";
import { analyzeWorkflowLifecycle, LIFECYCLE_STAGES } from "./lifecycle-model";
import type { ConfigSchema, JsonValue, LifecycleStage, NodePortDescriptor, NodeTypeDescriptor, VisualWorkflow, WorkflowEdge, WorkflowNode, WorkflowProfile, WorkflowValidation } from "./graph-types";
import { GraphShell } from "./WorkflowCatalogPage";
import { ApprovalModal } from "./components/ApprovalModal";
import { DocumentaryInspector } from "./components/DocumentaryInspectors";

type NodeExecStatus = "running" | "success" | "failed" | "pending" | "skipped";

type GraphNodeData = {
  label: string;
  description: string;
  lifecycleStage: LifecycleStage;
  nodeType: string;
  config: Record<string, JsonValue>;
  inputs: NodePortDescriptor[];
  outputs: NodePortDescriptor[];
  dimmed?: boolean;
  attention?: boolean;
  statusBadge?: { ready: boolean; text: string };
  execStatus?: NodeExecStatus;
} & Record<string, unknown>;

type GraphNode = Node<GraphNodeData>;
type EditorSnapshot = { workflow: Pick<VisualWorkflow, "name" | "profile" | "durationFrames">; nodes: GraphNode[]; edges: Edge[]; selectedId?: string };
const graphNodeTypes = { typed: TypedGraphNode };
const HISTORY_LIMIT = 50;

const stageLabels: Record<LifecycleStage, { short: string; title: string }> = {
  assets: { short: "Assets", title: "สื่อนำเข้า" },
  process: { short: "Process / AI", title: "เตรียมและสร้างสื่อ" },
  timeline: { short: "Timeline", title: "จัดลำดับเรื่อง" },
  build: { short: "Build / Render", title: "ประกอบและเรนเดอร์" },
  export: { short: "Export", title: "ส่งออกไฟล์" }
};

export default function WorkflowGraphEditorPage() {
  const { workflowId = "" } = useParams();
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState<VisualWorkflow>();
  const [descriptors, setDescriptors] = useState<NodeTypeDescriptor[]>([]);
  const [nodes, setNodes, applyNodeChanges] = useNodesState<GraphNode>([]);
  const [edges, setEdges, applyEdgeChanges] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "conflict" | "error">("idle");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [validation, setValidation] = useState<WorkflowValidation>();
  const [validationRevision, setValidationRevision] = useState<number>();
  const [validating, setValidating] = useState(false);
  const [queuingRun, setQueuingRun] = useState(false);
  const [nodeSearch, setNodeSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<LifecycleStage>();
  const [, setHistoryRevision] = useState(0);

  // System & Adobe Readiness live probe
  const [readiness, setReadiness] = useState<Readiness>();
  const [showReadinessModal, setShowReadinessModal] = useState(false);

  // In-place live run state
  const [activeRunId, setActiveRunId] = useState<string>();
  const [activeRun, setActiveRun] = useState<Run>();
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [showArtifactsModal, setShowArtifactsModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");
  const [runActionBusy, setRunActionBusy] = useState(false);

  const editVersion = useRef(0);
  const lastSavedEditVersion = useRef(0);
  const savePromise = useRef<Promise<VisualWorkflow | undefined> | undefined>(undefined);
  const workflowRef = useRef<VisualWorkflow | undefined>(undefined);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const runSubmitting = useRef(false);
  const runIdempotencyKey = useRef<string | undefined>(undefined);
  const invalidConnectionReason = useRef("");
  const flowInstance = useRef<ReactFlowInstance<GraphNode, Edge> | undefined>(undefined);
  const past = useRef<EditorSnapshot[]>([]);
  const future = useRef<EditorSnapshot[]>([]);
  const historyAction = useRef<string | undefined>(undefined);

  workflowRef.current = workflow;
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const descriptorByType = useMemo(() => new Map(descriptors.map((item) => [item.type, item])), [descriptors]);
  const selectedNode = nodes.find((node) => node.id === selectedId);
  const localWorkflow = useMemo(() => workflow ? serializeWorkflow(workflow, nodes, edges) : undefined, [workflow, nodes, edges]);
  const timeline = useMemo(() => localWorkflow ? computedTimeline(localWorkflow) : { nodes: [], scenes: [], durationMs: 0, cyclic: false }, [localWorkflow]);

  const lifecycle = useMemo(() => {
    if (!workflow) return undefined;
    return analyzeWorkflowLifecycle({
      nodes: nodes.map((n) => ({ id: n.id, type: n.data.nodeType, config: n.data.config })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourcePort: e.sourceHandle ?? undefined, targetPort: e.targetHandle ?? undefined })),
      descriptors,
      validationErrors: validation?.errors
    });
  }, [workflow, nodes, edges, descriptors, validation]);

  // CSRF token initial load
  useEffect(() => {
    void getHealth().then((h: any) => { if (h?.csrfToken) setCsrfToken(h.csrfToken); }).catch(() => {});
  }, []);

  // Periodic readiness polling
  const refreshReadiness = useCallback(async () => {
    try {
      const res = await getReadiness();
      setReadiness(res);
    } catch { /* ignore offline readiness error */ }
  }, []);

  useEffect(() => {
    void refreshReadiness();
    const timer = setInterval(() => void refreshReadiness(), 4000);
    return () => clearInterval(timer);
  }, [refreshReadiness]);

  // Track active run updates via polling and SSE
  const loadActiveRun = useCallback(async (runId: string) => {
    try {
      const next = await api<Run>(`/api/v1/runs/${runId}`);
      setActiveRun(next);
      if (next.status === "waiting_approval" && next.approval) {
        setShowApprovalModal(true);
      }
      if (["success", "failed", "partial", "needs_attention"].includes(next.status)) {
        try {
          const runArtifacts = await api<Artifact[]>(`/api/v1/runs/${runId}/artifacts`);
          setArtifacts(runArtifacts);
        } catch { /* no artifacts */ }
      }
    } catch { /* ignore poll error */ }
  }, []);

  // Auto-detect active run if none set
  useEffect(() => {
    if (!activeRunId && workflowId) {
      void api<Run[]>("/api/v1/runs").then((runs) => {
        const matching = runs
          .filter((r) => r.recipeId === workflowId || r.projectName.includes(workflow?.name ?? ""))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (matching[0]) {
          setActiveRunId(matching[0].runId);
        }
      }).catch(() => {});
    }
  }, [workflowId, workflow?.name, activeRunId]);

  useEffect(() => {
    if (!activeRunId) return;
    void loadActiveRun(activeRunId);
    const interval = setInterval(() => void loadActiveRun(activeRunId), 2500);
    const events = new EventSource(`/api/v1/runs/${activeRunId}/events`);
    const onEvent = () => void loadActiveRun(activeRunId);
    ["run.started", "run.succeeded", "run.failed", "run.cancelled", "run.waiting_approval", "approval.recorded", "step.started", "step.succeeded", "step.failed", "verification.completed"].forEach((e) => events.addEventListener(e, onEvent));
    return () => {
      clearInterval(interval);
      events.close();
    };
  }, [activeRunId, loadActiveRun]);

  const displayedNodes = useMemo(() => {
    const stepStatusMap = new Map<string, NodeExecStatus>();
    if (activeRun) {
      for (const step of activeRun.steps) {
        stepStatusMap.set(step.id, step.status as NodeExecStatus);
      }
    }

    return nodes.map((node) => {
      const isDimmed = Boolean(stageFilter && node.data.lifecycleStage !== stageFilter);
      const isSelected = node.id === selectedId;
      const issues = lifecycle?.issues.filter((i) => i.nodeId === node.id) ?? [];
      const hasIssue = issues.length > 0;
      const hasMissingInput = node.data.inputs?.some((inp) => inp.required && !edges.some((e) => e.target === node.id && (e.targetHandle === inp.id || !e.targetHandle)));
      const ready = !hasIssue && !hasMissingInput;
      const execStatus = stepStatusMap.get(node.id);

      return {
        ...node,
        data: {
          ...node.data,
          dimmed: isDimmed,
          execStatus,
          statusBadge: {
            ready,
            text: ready ? "พร้อม" : "ต้องตั้งค่า"
          }
        },
        selected: isSelected
      };
    });
  }, [nodes, selectedId, stageFilter, lifecycle, edges, activeRun]);

  const load = useCallback(async () => {
    setLoading(true); setMessage("");
    try {
      const [nextWorkflow, nextDescriptors] = await Promise.all([getVisualWorkflow(workflowId), listNodeTypes()]);
      const normalizedWorkflow = { ...nextWorkflow, durationFrames: nextWorkflow.durationFrames ?? 125 };
      setWorkflow(normalizedWorkflow); setDescriptors(nextDescriptors);
      setNodes(nextWorkflow.nodes.map((node) => toFlowNode(node, nextDescriptors)));
      setEdges(nextWorkflow.edges.map((edge) => toFlowEdge(edge, nextWorkflow.nodes, nextDescriptors)));
      editVersion.current = 0; lastSavedEditVersion.current = 0;
      past.current = []; future.current = []; historyAction.current = undefined; setHistoryRevision((value) => value + 1);
      setSelectedId(undefined); setSelectedEdgeId(undefined); setDirty(false); setSaveState("idle"); setValidation(undefined); setValidationRevision(undefined);
    } catch (cause: any) { setMessage(endpointMessage(cause)); }
    finally { setLoading(false); }
  }, [setEdges, setNodes, workflowId]);
  useEffect(() => { void load(); }, [load]);

  const markDirty = useCallback(() => { editVersion.current += 1; setDirty(true); setSaveState("idle"); setValidation(undefined); setValidationRevision(undefined); }, []);

  const snapshotEditor = useCallback((): EditorSnapshot | undefined => {
    const currentWorkflow = workflowRef.current;
    if (!currentWorkflow) return undefined;
    return cloneSnapshot({
      workflow: { name: currentWorkflow.name, profile: currentWorkflow.profile, durationFrames: currentWorkflow.durationFrames },
      nodes: nodesRef.current,
      edges: edgesRef.current,
      selectedId
    });
  }, [selectedId]);

  const pushHistory = useCallback((action?: string, snapshot?: EditorSnapshot) => {
    const targetSnapshot = snapshot ?? snapshotEditor();
    if (!targetSnapshot || (action && historyAction.current === action)) return;
    past.current = [...past.current.slice(-(HISTORY_LIMIT - 1)), targetSnapshot];
    future.current = [];
    historyAction.current = action;
    setHistoryRevision((value) => value + 1);
  }, [snapshotEditor]);

  const restoreSnapshot = useCallback((snapshot: EditorSnapshot) => {
    const currentWorkflow = workflowRef.current;
    if (!currentWorkflow) return;
    setWorkflow({ ...currentWorkflow, ...snapshot.workflow });
    setNodes(cloneSnapshot(snapshot).nodes);
    setEdges(cloneSnapshot(snapshot).edges);
    setSelectedId(snapshot.selectedId);
    setSelectedEdgeId(undefined);
    historyAction.current = undefined;
    markDirty();
  }, [markDirty, setEdges, setNodes]);

  const undo = useCallback(() => {
    const previous = past.current.at(-1);
    const current = snapshotEditor();
    if (!previous || !current) return;
    past.current = past.current.slice(0, -1);
    future.current = [current, ...future.current].slice(0, HISTORY_LIMIT);
    restoreSnapshot(previous);
    setHistoryRevision((value) => value + 1);
  }, [restoreSnapshot, snapshotEditor]);

  const redo = useCallback(() => {
    const next = future.current[0];
    const current = snapshotEditor();
    if (!next || !current) return;
    future.current = future.current.slice(1);
    past.current = [...past.current.slice(-(HISTORY_LIMIT - 1)), current];
    restoreSnapshot(next);
    setHistoryRevision((value) => value + 1);
  }, [restoreSnapshot, snapshotEditor]);

  const duplicateSelected = useCallback(() => {
    const source = nodesRef.current.find((node) => node.id === selectedId);
    if (!source) return;
    pushHistory();
    const id = `node_${crypto.randomUUID().slice(0, 8)}`;
    const duplicate = cloneGraphNode(source);
    duplicate.id = id;
    duplicate.selected = false;
    duplicate.position = { x: source.position.x + 28, y: source.position.y + 28 };
    setNodes((current) => [...current, duplicate]);
    setSelectedId(id);
    markDirty();
  }, [markDirty, pushHistory, selectedId, setNodes]);

  const deleteEdge = useCallback((edgeId: string) => {
    pushHistory();
    setEdges((current) => current.filter((edge) => edge.id !== edgeId));
    if (selectedEdgeId === edgeId) setSelectedEdgeId(undefined);
    markDirty();
  }, [markDirty, pushHistory, selectedEdgeId, setEdges]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      } else if (event.key === "Backspace" || event.key === "Delete") {
        const target = event.target as HTMLElement | null;
        const isInput = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
        if (!isInput && selectedEdgeId) {
          event.preventDefault();
          deleteEdge(selectedEdgeId);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteEdge, duplicateSelected, redo, selectedEdgeId, undo]);

  const saveNow = useCallback(async () => {
    if (savePromise.current) await savePromise.current;
    const currentWorkflow = workflowRef.current;
    if (!currentWorkflow) return undefined;
    if (lastSavedEditVersion.current === editVersion.current) return currentWorkflow;
    const version = editVersion.current;
    setSaveState("saving"); setMessage("");
    const pending = (async () => {
      try {
        const saved = await patchVisualWorkflow(serializeWorkflow(currentWorkflow, nodesRef.current, edgesRef.current));
        const merged = { ...currentWorkflow, ...saved };
        workflowRef.current = merged;
        lastSavedEditVersion.current = version;
        setWorkflow(merged);
        if (editVersion.current === version) { setDirty(false); setSaveState("saved"); }
        else setSaveState("idle");
        return merged;
      } catch (cause: any) {
        if (cause.status === 409 || cause.status === 412) { setSaveState("conflict"); setMessage("A newer revision exists on the server. Reload before making further changes."); }
        else { setSaveState("error"); setMessage(endpointMessage(cause)); }
        return undefined;
      }
    })();
    savePromise.current = pending;
    const saved = await pending;
    savePromise.current = undefined;
    if (saved && lastSavedEditVersion.current < editVersion.current) return saveNow();
    return saved;
  }, []);

  useEffect(() => {
    if (!dirty || saveState === "conflict" || loading) return;
    const timer = window.setTimeout(() => { void saveNow(); }, 900);
    return () => window.clearTimeout(timer);
  }, [dirty, loading, saveNow, saveState]);

  useEffect(() => {
    if (!dirty && saveState !== "saving") return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const confirmInternalNavigation = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (link && !window.confirm("This workflow still has unsaved changes. Leave the editor?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", confirmInternalNavigation, true);
    return () => { window.removeEventListener("beforeunload", warnBeforeUnload); document.removeEventListener("click", confirmInternalNavigation, true); };
  }, [dirty, saveState]);

  function onNodesChange(changes: NodeChange<GraphNode>[]) {
    if (changes.some((change) => change.type === "remove")) pushHistory();
    applyNodeChanges(changes);
    const removed = new Set(changes.filter((change) => change.type === "remove").map((change) => change.id));
    if (removed.size) setEdges((current) => current.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target)));
    if (changes.some((change) => change.type === "remove")) markDirty();
  }

  function onConnect(connection: Connection) {
    if (!connection.source || !connection.target || wouldCreateCycle(nodes, edges, connection.source, connection.target)) {
      setMessage("Connection rejected: workflows must remain acyclic."); return;
    }
    const compatibility = connectionCompatibility(descriptorByType, nodes.map((node) => ({ id: node.id, nodeType: node.data.nodeType })), connection);
    if (!compatibility.valid) { setMessage(`Connection rejected: ${compatibility.reason}`); return; }
    pushHistory();
    setMessage("");
    setEdges((current) => addEdge({ ...connection, id: `edge_${crypto.randomUUID().slice(0, 8)}`, type: "deletable" }, current)); markDirty();
  }

  function addNode(descriptor: NodeTypeDescriptor, position?: { x: number; y: number }) {
    pushHistory();
    const id = `node_${crypto.randomUUID().slice(0, 8)}`;
    const baseConfig = defaultConfig(descriptor);
    const profile = workflow?.profile ?? "portrait";

    // Adaptive default config based on format profile
    if (descriptor.type === "comfyui.workflow") {
      baseConfig.workflowFile = "workflows/generate-background.api.json";
      const { width, height } = getComfyDimensions(profile);
      baseConfig.patches = {
        "6.inputs.text": "premium midnight-blue university broadcast studio background, architectural panels, warm amber edge lighting",
        "5.inputs.width": width,
        "5.inputs.height": height
      };
      baseConfig.downloadDir = "media/generated-background";
    } else if (descriptor.type === "ae.template") {
      baseConfig.templateProject = "templates/after-effects/prototype-story.aep";
      baseConfig.outputProject = "projects/ae-composite.aep";
      baseConfig.composition = "MASTER";
      baseConfig.text = { TITLE: "PSU Broadcast Live", PRESENTER_NAME: "ผู้ประกาศข่าว" };
      baseConfig.footage = { PRESENTER: "media/person-cutout.png", BACKGROUND: "media/generated-background/dry-run-output.png" };
    } else if (descriptor.type === "ae.render") {
      baseConfig.project = "projects/ae-composite.aep";
      baseConfig.composition = "MASTER";
      baseConfig.output = "media/rendered-composite.mov";
      baseConfig.renderSettingsTemplate = "Best Settings";
      baseConfig.outputModuleTemplate = "Lossless";
    } else if (descriptor.type === "premiere.export") {
      baseConfig.output = "exports/documentary-master.mp4";
      baseConfig.preset = "Match Source - Adaptive High Bitrate";
    }

    let calculatedPos = position;
    const instance = flowInstance.current;
    if (!calculatedPos && instance) {
      const canvasEl = document.querySelector(".graph-canvas");
      const rect = canvasEl?.getBoundingClientRect();
      const screenX = (rect?.left ?? 0) + (rect ? rect.width / 2 : window.innerWidth / 2);
      const screenY = (rect?.top ?? 0) + (rect ? rect.height / 2 : window.innerHeight / 2);
      calculatedPos = instance.screenToFlowPosition({ x: screenX, y: screenY });
    }

    const finalPos = calculatedPos ?? { x: 100 + (nodes.length % 6) * 60, y: 100 + (nodes.length % 6) * 60 };

    setNodes((current) => [...current, { id, type: "typed", position: finalPos, data: nodeData(descriptor, baseConfig) }]);
    setSelectedId(id);
    setSelectedEdgeId(undefined);
    markDirty();
    setMessage(`✅ เพิ่มโหนด "${descriptor.label}" (${descriptor.type}) บน Canvas แล้ว`);
  }

  function updateConfig(key: string, value: JsonValue) {
    pushHistory(`config:${selectedId}:${key}`);
    setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, config: { ...node.data.config, [key]: value } } } : node)); markDirty();
  }

  function deleteSelected() {
    if (!selectedId) return;
    pushHistory();
    setNodes((current) => current.filter((node) => node.id !== selectedId));
    setEdges((current) => current.filter((edge) => edge.source !== selectedId && edge.target !== selectedId));
    setSelectedId(undefined); markDirty();
  }

  function autoLayout() {
    if (!nodes.length) return;
    pushHistory();
    setNodes(layoutGraphNodes(nodes, edges));
    markDirty();
    window.setTimeout(() => void flowInstance.current?.fitView({ padding: 0.16, duration: 260 }), 0);
  }

  function dropNode(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    const nodeType = event.dataTransfer.getData("application/x-ava-node-type");
    const descriptor = descriptorByType.get(nodeType);
    const instance = flowInstance.current;
    if (!descriptor || !instance) return;
    addNode(descriptor, instance.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }

  async function validate(): Promise<WorkflowValidation | undefined> {
    setValidating(true);
    const saved = await saveNow();
    if (!saved) { setValidating(false); return undefined; }
    const validatedEditVersion = editVersion.current;
    try {
      const result = await validateVisualWorkflow(workflowId);
      setValidation(result);
      if (result.valid && validatedEditVersion === editVersion.current && saved.revision === workflowRef.current?.revision) {
        setValidationRevision(saved.revision);
      } else {
        setValidationRevision(undefined);
      }
      setMessage(result.valid ? "✓ ผัง Workflow ผ่านการตรวจสอบความถูกต้องเรียบร้อย" : "พบข้อผิดพลาดในผัง Workflow");
      return result;
    } catch (cause: any) {
      setMessage(endpointMessage(cause));
      return undefined;
    } finally {
      setValidating(false);
    }
  }

  async function publish() {
    if (timeline.cyclic) { setMessage("Publishing is blocked until the cycle is removed."); return; }
    const saved = await saveNow();
    if (!saved) return;
    try {
      const published = await publishVisualWorkflow(workflowId);
      setWorkflow(published);
      setMessage("Workflow เผยแพร่เข้าสู่ Catalog เรียบร้อยแล้ว");
    }
    catch (cause: any) { setMessage(endpointMessage(cause)); }
  }

  async function clone() {
    if (!await saveNow()) return;
    try { const copy = await cloneVisualWorkflow(workflowId); navigate(`/workflows/${copy.id}/edit`); }
    catch (cause: any) { setMessage(endpointMessage(cause)); }
  }

  async function run(toNodeId?: string) {
    if (runSubmitting.current) return;
    if (isRunActive) {
      setMessage(`⚠️ มีงานกำลังประมวลผลอยู่ (${activeRun?.status || "active"}) กรุณารอให้จบ หรือเปิดดูที่ Run Monitor`);
      return;
    }
    if (!currentValidationPassed) {
      setMessage("กำลังตรวจสอบ Workflow ก่อนสั่งรัน...");
      const valResult = await validate();
      if (!valResult || !valResult.valid) {
        setMessage("ไม่สามารถสั่งรันได้: ผัง Workflow มีจุดที่ยังไม่ถูกต้อง กรุณาตรวจสอบเส้นเชื่อมหรือคอนฟิก");
        return;
      }
    }
    runSubmitting.current = true;
    setQueuingRun(true);
    runIdempotencyKey.current = `graph-run-${crypto.randomUUID()}`;
    try {
      const result = await runVisualWorkflow(workflowId, { mode: "auto", toNodeId }, runIdempotencyKey.current);
      setActiveRunId(result.runId);
      const isLive = readiness?.ready === true;
      setMessage(isLive ? `🚀 เริ่มรัน Live Mode สำเร็จ (${result.runId.slice(0, 8)})` : `🚀 เริ่มรัน Workflow สำเร็จ (${result.runId.slice(0, 8)})`);
      await loadActiveRun(result.runId);
    } catch (cause: any) {
      setMessage(endpointMessage(cause));
    } finally {
      runSubmitting.current = false;
      runIdempotencyKey.current = undefined;
      setQueuingRun(false);
    }
  }

  async function handleRunAction(actionName: "stop-after-step" | "cancel-queued") {
    if (!activeRunId || runActionBusy) return;
    setRunActionBusy(true);
    try {
      await api(`/api/v1/runs/${activeRunId}/actions/${actionName}`, { method: "POST", body: "{}" });
      await loadActiveRun(activeRunId);
    } catch (cause: any) {
      setMessage(cause.message ?? "Action failed");
    } finally {
      setRunActionBusy(false);
    }
  }

  const customEdgeTypes = useMemo(() => ({
    deletable: (props: EdgeProps) => <DeletableEdge {...props} onDelete={deleteEdge} />,
    default: (props: EdgeProps) => <DeletableEdge {...props} onDelete={deleteEdge} />
  }), [deleteEdge]);

  if (loading) return <GraphShell><main className="graph-loading" role="status">Loading workflow editor…</main></GraphShell>;
  if (!workflow) return (
    <GraphShell>
      <main className="workflow-editor-unavailable">
        <section className="graph-unavailable" role="alert">
          <strong>ไม่พบเวิร์กโฟลว์ หรือเกิดข้อผิดพลาดในการโหลด</strong>
          <p>{message}</p>
          <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
            <button className="button secondary" onClick={() => void load()}>ลองใหม่อีกครั้ง (Retry)</button>
            <Link to="/" className="button primary" style={{ textDecoration: "none" }}>← กลับสู่หน้า Workflow Catalog</Link>
          </div>
        </section>
      </main>
    </GraphShell>
  );

  const selectedDescriptor = selectedNode ? descriptorByType.get(selectedNode.data.nodeType) : undefined;
  const currentValidationPassed = Boolean(validation?.valid && validationRevision === workflow.revision && !dirty && saveState !== "saving");
  const actionsBusy = saveState === "saving" || queuingRun || validating;

  const filteredDescriptors = descriptors.filter((descriptor) => {
    if (stageFilter && (descriptor.lifecycleStage ?? "assets") !== stageFilter) return false;
    if (!nodeSearch.trim()) return true;
    const query = nodeSearch.toLowerCase();
    const labelMatch = descriptor.label?.toLowerCase().includes(query);
    const typeMatch = descriptor.type.toLowerCase().includes(query);
    const descMatch = descriptor.description?.toLowerCase().includes(query);
    return labelMatch || typeMatch || descMatch;
  });

  const isRunActive = Boolean(activeRun && ["queued", "running", "stopping"].includes(activeRun.status));
  const isAdobeReady = readiness?.ready === true;

  return <GraphShell><main className="workflow-editor">
    <header className="editor-toolbar">
      <div className="toolbar-inputs">
        <input aria-label="Workflow name" value={workflow.name} onChange={(event) => { setWorkflow({ ...workflow, name: event.target.value }); markDirty(); }}/>
        <label>Format <select aria-label="Workflow format" value={workflow.profile} onChange={(event) => {
          const nextProfile = event.target.value as VisualWorkflow["profile"];
          const comfyDims = getComfyDimensions(nextProfile);
          const formatDims = getFormatDimensions(nextProfile);
          const updatedNodes = nodes.map((n) => {
            if (n.data.type === "comfyui.workflow") {
              const config = { ...(n.data.config ?? {}) };
              const patches = { ...((config.patches as any) ?? {}) };
              patches["5.inputs.width"] = comfyDims.width;
              patches["5.inputs.height"] = comfyDims.height;
              return { ...n, data: { ...n.data, config: { ...config, patches } } };
            }
            if (n.data.type === "image.resize" && (n.id.includes("bg") || n.id.includes("background"))) {
              const config = { ...(n.data.config ?? {}) };
              return { ...n, data: { ...n.data, config: { ...config, width: formatDims.width, height: formatDims.height } } };
            }
            return n;
          });
          setNodes(updatedNodes);
          setWorkflow({ ...workflow, profile: nextProfile });
          markDirty();
        }}><option value="portrait">9:16 · 1080×1920</option><option value="landscape">16:9 · 1920×1080</option><option value="square">1:1 · 1080×1080</option></select></label>
        <label>Duration <input className="duration-input" aria-label="Workflow duration seconds" type="number" min="0.04" max="300" step="0.04" value={workflow.durationFrames / 25} onChange={(event) => { setWorkflow({ ...workflow, durationFrames: Math.max(1, Math.min(7500, Math.round(Number(event.target.value) * 25))) }); markDirty(); }}/><span>s</span></label>
        <span className={`workflow-badge ${workflow.status}`}>{workflow.status}</span>
        <small className="toolbar-subtext">25 fps · rev {workflow.revision}</small>
      </div>
      <div className="toolbar-actions">
        <span className={`save-state ${saveState}`} role="status">{saveLabel(saveState, dirty)}</span>
        <button className="button secondary" onClick={autoLayout} disabled={actionsBusy || !nodes.length} title="จัดผังโหนดซ้ายไปขวาตาม Lifecycle Stage">Auto Layout</button>
        <button className="button secondary" onClick={() => void publish()} disabled={actionsBusy} title="เผยแพร่เข้าสู่ Catalog เพื่อให้ผู้อื่นในทีมนำไปใช้งาน">Publish to Catalog</button>
        <button className="button secondary" onClick={() => void clone()} disabled={actionsBusy}>Clone</button>
        {activeRun && (
          <Link
            to={`/runs/${activeRun.runId}`}
            className="button secondary"
            style={{
              borderColor: activeRun.status === "running" ? "#3b82f6" : activeRun.status === "waiting_approval" ? "#f59e0b" : "#475569",
              background: "rgba(30, 41, 59, 0.8)",
              color: "#93c5fd",
              fontWeight: 700,
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              textDecoration: "none"
            }}
            title="คลิกเพื่อเปิดดูหน้า Run Monitor เต็มจอ"
          >
            <span>{activeRun.status === "running" ? "⏳" : activeRun.status === "waiting_approval" ? "⚠️" : "📊"} ดู Monitor ({activeRun.status})</span>
            <span style={{ fontSize: "10px", opacity: 0.8 }}>↗</span>
          </Link>
        )}
      </div>
    </header>
    {message && <div className={saveState === "conflict" || saveState === "error" ? "error-banner editor-message" : "editor-message"} role="status">{message}{saveState === "conflict" && <button className="button secondary" onClick={() => void load()}>Reload server revision</button>}</div>}
    <div className="editor-grid">
      <aside className="node-palette" aria-label="Node palette">
        <div className="palette-header">
          <h2>Node palette</h2>
          <input
            type="search"
            className="palette-search"
            placeholder="ค้นหาโหนด (เช่น asset, z-image, ae, jaitts)..."
            value={nodeSearch}
            onChange={(e) => setNodeSearch(e.target.value)}
            aria-label="ค้นหาโหนด"
          />
          {stageFilter && (
            <div className="stage-filter-badge">
              <span>กรอง: {stageLabels[stageFilter].short}</span>
              <button onClick={() => setStageFilter(undefined)} title="ยกเลิกการกรอง">×</button>
            </div>
          )}
        </div>
        {filteredDescriptors.length ? groupDescriptors(filteredDescriptors).map(([category, items]) => (
          <section key={category}>
            <h3>{category}</h3>
            {items.map((descriptor) => (
              <button
                key={descriptor.type}
                className="palette-node-item"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/x-ava-node-type", descriptor.type);
                  event.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => addNode(descriptor)}
                title="คลิกหรือลากไปวางบน Canvas"
              >
                <div className="palette-item-header">
                  <strong>{descriptor.label}</strong>
                  <span className={`stage-dot stage-${descriptor.lifecycleStage ?? "assets"}`} />
                </div>
                <code>{descriptor.type}</code>
                <small>{descriptor.description ?? descriptor.type}</small>
              </button>
            ))}
          </section>
        )) : <p className="palette-empty">ไม่พบโหนดที่ตรงกับคำค้นหา</p>}
      </aside>

      <section
        className="graph-canvas"
        aria-label="Workflow graph canvas"
        onDrop={dropNode}
        onDragOver={(event) => event.preventDefault()}
        style={{ position: "relative" }}
      >
        {/* In-Canvas Live Execution HUD & Monitor Bar */}
        {activeRun && (
          <div
            className="canvas-execution-hud"
            style={{
              position: "absolute",
              top: "16px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 100,
              background: activeRun.status === "running"
                ? "rgba(10, 25, 47, 0.96)"
                : activeRun.status === "waiting_approval"
                ? "rgba(35, 23, 5, 0.96)"
                : activeRun.status === "success"
                ? "rgba(6, 32, 22, 0.96)"
                : "rgba(35, 12, 16, 0.96)",
              border: `2px solid ${
                activeRun.status === "running"
                  ? "#3b82f6"
                  : activeRun.status === "waiting_approval"
                  ? "#f59e0b"
                  : activeRun.status === "success"
                  ? "#10b981"
                  : "#ef4444"
              }`,
              borderRadius: "12px",
              padding: "12px 20px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "center",
              gap: "16px",
              backdropFilter: "blur(10px)",
              maxWidth: "92vw",
              flexWrap: "wrap"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "22px" }}>
                {activeRun.status === "running" ? "⏳" : activeRun.status === "waiting_approval" ? "⚠️" : activeRun.status === "success" ? "✅" : "❌"}
              </span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <strong style={{ fontSize: "14px", color: "#f8fafc" }}>
                    {activeRun.status === "running"
                      ? `กำลังประมวลผล Workflow (${activeRun.steps.filter(s => s.status === "success").length + 1}/${activeRun.steps.length})`
                      : activeRun.status === "waiting_approval"
                      ? `หยุดรอการตรวจอนุมัติ B-Roll (${activeRun.approval?.segments?.length ?? 12} ช่วง)`
                      : activeRun.status === "success"
                      ? "Workflow ประมวลผลเสร็จสมบูรณ์ 100%"
                      : "เกิดข้อผิดพลาดในการประมวลผล"}
                  </strong>
                  <span
                    className={`workflow-badge ${activeRun.status}`}
                    style={{
                      fontSize: "10px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: activeRun.status === "running" ? "#2563eb" : activeRun.status === "waiting_approval" ? "#d97706" : activeRun.status === "success" ? "#059669" : "#dc2626",
                      color: "#fff"
                    }}
                  >
                    {activeRun.status.toUpperCase()}
                  </span>
                </div>
                <span style={{ color: "#94a3b8", fontSize: "12px", display: "block", marginTop: "2px" }}>
                  {activeRun.status === "running"
                    ? `โหนดปัจจุบัน: ${activeRun.steps.find(s => s.status === "running")?.label ?? activeRun.steps.find(s => s.status === "running")?.id ?? "กำลังเตรียมระบบ..."}`
                    : activeRun.status === "waiting_approval"
                    ? "AI จับคู่ภาพ B-Roll จาก NAS เรียบร้อยแล้ว กรุณากดปุ่มเพื่อตรวจและอนุมัติ"
                    : activeRun.status === "success"
                    ? "ไฟล์โปรเจกต์ Premiere Pro (.prproj) และวิดีโอ MP4 พร้อมเปิดตรวจแล้ว"
                    : "สามารถเปิดดูบันทึกข้อผิดพลาดได้ในหน้า Run Monitor"}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
              {activeRun.status === "waiting_approval" && (
                <button
                  type="button"
                  className="button primary"
                  style={{
                    background: "#f59e0b",
                    borderColor: "#d97706",
                    fontWeight: 700,
                    padding: "8px 16px",
                    fontSize: "13px",
                    cursor: "pointer"
                  }}
                  onClick={() => setShowApprovalModal(true)}
                >
                  👉 ตรวจและอนุมัติ B-Roll
                </button>
              )}

              {artifacts.length > 0 && (
                <button
                  type="button"
                  className="button secondary"
                  style={{ padding: "8px 14px", fontSize: "12px", background: "#1e293b", borderColor: "#334155", cursor: "pointer" }}
                  onClick={() => setShowArtifactsModal(true)}
                >
                  🎬 ดูผลลัพธ์ ({artifacts.length})
                </button>
              )}

              <Link
                to={`/runs/${activeRun.runId}`}
                target="_blank"
                rel="noreferrer"
                className="button secondary"
                style={{
                  padding: "8px 16px",
                  fontSize: "12px",
                  fontWeight: 700,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "#1e293b",
                  border: "1px solid #475569",
                  color: "#60a5fa"
                }}
              >
                <span>🔗 เปิดหน้า Run Monitor (เต็มจอ)</span>
                <span style={{ fontSize: "11px" }}>↗</span>
              </Link>
            </div>
          </div>
        )}

        <ReactFlow<GraphNode, Edge>
          nodes={displayedNodes}
          edges={edges}
          nodeTypes={graphNodeTypes}
          edgeTypes={customEdgeTypes}
          onInit={(instance) => { flowInstance.current = instance; }}
          onNodesChange={onNodesChange}
          onEdgesChange={(changes) => { applyEdgeChanges(changes); if (changes.some((change) => change.type === "remove")) markDirty(); }}
          onConnect={onConnect}
          isValidConnection={(connection) => {
            if (!connection.source || !connection.target) { invalidConnectionReason.current = "Both nodes are required."; return false; }
            if (wouldCreateCycle(nodes, edges, connection.source, connection.target)) { invalidConnectionReason.current = "Workflows must remain acyclic."; return false; }
            const result = connectionCompatibility(descriptorByType, nodes.map((node) => ({ id: node.id, nodeType: node.data.nodeType })), connection);
            invalidConnectionReason.current = result.valid ? "" : result.reason ?? "Those ports are incompatible.";
            return result.valid;
          }}
          onConnectEnd={() => {
            if (invalidConnectionReason.current) setMessage(`Connection rejected: ${invalidConnectionReason.current}`);
            invalidConnectionReason.current = "";
          }}
          onNodeClick={(_, node) => { setSelectedId(node.id); setSelectedEdgeId(undefined); }}
          onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedId(undefined); }}
          onPaneClick={() => { setSelectedId(undefined); setSelectedEdgeId(undefined); }}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
          edgesFocusable
        >
          <Background color="#162947" gap={20} size={1.2}/>
          <MiniMap pannable zoomable/>
          <Controls/>
        </ReactFlow>
      </section>

      <aside className="node-inspector" aria-label="Selected node inspector">
        <h2>Inspector</h2>
        {selectedNode && selectedDescriptor ? <>
          <div className="inspector-heading">
            <div className="inspector-title-row">
              <strong>{selectedDescriptor.label}</strong>
              <span className={`stage-tag stage-${selectedDescriptor.lifecycleStage ?? "assets"}`}>
                {stageLabels[selectedDescriptor.lifecycleStage ?? "assets"]?.short ?? selectedDescriptor.lifecycleStage}
              </span>
            </div>
            <code>{selectedNode.id} ({selectedNode.data.nodeType})</code>
            {selectedDescriptor.description && <p className="inspector-desc">{selectedDescriptor.description}</p>}
          </div>
          {Object.entries(selectedDescriptor.configSchema?.properties ?? {}).map(([key, schema]) => (
            <SchemaField key={key} name={key} schema={schema} required={selectedDescriptor.configSchema.required?.includes(key) ?? false} value={selectedNode.data.config[key]} onChange={(value) => updateConfig(key, value)}/>
          ))}
          <DocumentaryInspector nodeType={selectedNode.data.nodeType} config={selectedNode.data.config} onChange={(key, val) => updateConfig(key, val)} />
          <div className="inspector-actions">
            <button className="button secondary" onClick={duplicateSelected} title="ทำซ้ำโหนดนี้ (Ctrl/Cmd+D)">Duplicate node</button>
            <button className="button danger" onClick={deleteSelected}>Delete node</button>
          </div>
        </> : selectedEdgeId ? (
          <div className="inspector-edge-selected">
            <h3>เส้นเชื่อมที่เลือก (Edge)</h3>
            <p><code>{selectedEdgeId}</code></p>
            <button className="button danger" onClick={() => deleteEdge(selectedEdgeId)}>ลบเส้นเชื่อมนี้ (Delete)</button>
          </div>
        ) : selectedNode ? <div className="graph-unavailable"><strong>Descriptor missing</strong><p>No config schema was returned for <code>{selectedNode.data.nodeType}</code>.</p></div> : <p className="inspector-empty">Select a node or edge to edit its configuration.</p>}
      </aside>

      <aside className="timeline-preview">
        <div className="timeline-header-row">
          <h2>{activeRun ? `Execution: ${activeRun.status}` : "Computed timeline"}</h2>
          {activeRun && <span className={`run-status-chip status-${activeRun.status}`}>{activeRun.status}</span>}
        </div>
        <p>Declared {workflow.durationFrames / 25}s · Scenes {formatTime(timeline.durationMs)} · 25fps</p>
        {timeline.durationMs > workflow.durationFrames * 40 && <div className="error-banner">Scene timing exceeds declared duration.</div>}
        {timeline.cyclic && <div className="error-banner">Cycle detected; publishing must remain blocked.</div>}

        {activeRun ? (
          <div className="active-run-timeline">
            <ol>
              {activeRun.steps.map((step, index) => {
                const isSelected = selectedId === step.id;
                return (
                  <li key={step.id} className={`run-step-item step-${step.status} ${isSelected ? "selected" : ""}`} onClick={() => setSelectedId(step.id)}>
                    <span className="step-num">{step.status === "success" ? "✓" : step.status === "running" ? "⏳" : step.status === "waiting_approval" ? "⚠️" : String(index + 1).padStart(2, "0")}</span>
                    <div className="step-info">
                      <strong>{step.label}</strong>
                      <small>{step.type} · {step.status}</small>
                      {step.error && <span className="step-err-text">{step.error}</span>}
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="active-run-actions">
              {activeRun.status === "waiting_approval" && (
                <button
                  className="button primary btn-sm"
                  style={{ background: "#f59e0b", borderColor: "#d97706", fontWeight: 700 }}
                  onClick={() => setShowApprovalModal(true)}
                >
                  ⚠️ ตรวจและอนุมัติ B-Roll
                </button>
              )}
              {activeRun.status === "running" && <button className="button danger btn-sm" onClick={() => void handleRunAction("stop-after-step")} disabled={runActionBusy}>Stop after step</button>}
              {activeRun.status === "queued" && <button className="button danger btn-sm" onClick={() => void handleRunAction("cancel-queued")} disabled={runActionBusy}>Cancel queued</button>}
              {artifacts.length > 0 && <button className="button secondary btn-sm" onClick={() => setShowArtifactsModal(true)}>ดูไฟล์ผลลัพธ์ ({artifacts.length})</button>}
              <Link to={`/runs/${activeRun.runId}`} className="button ghost btn-sm" target="_blank" rel="noreferrer">Full Monitor ↗</Link>
            </div>
          </div>
        ) : (
          <ol>{timeline.nodes.map((node, index) => {
            const scene = timeline.scenes.find((item) => item.nodeId === node.id);
            return <li key={node.id} className={node.id === selectedId ? "selected" : ""}>
              <span>{index + 1}</span>
              <button onClick={() => setSelectedId(node.id)}>
                <strong>{descriptorByType.get(node.type)?.label ?? node.type}</strong>
                <small>{scene ? `${formatTime(scene.startMs)} → ${formatTime(scene.endMs)}` : node.id}</small>
              </button>
            </li>;
          })}</ol>
        )}
      </aside>
    </div>

    {validation && <section className={`validation-drawer ${validation.valid ? "valid" : "invalid"}`} aria-live="polite">
      <strong>{validation.valid ? "Workflow is valid" : `${validation.errors.length} validation issue(s)`}</strong>
      {validation.errors.map((error, index) => <button key={`${error.nodeId}-${index}`} onClick={() => error.nodeId && setSelectedId(error.nodeId)}>{error.nodeId && <code>{error.nodeId}</code>} {error.message}</button>)}
      {validation.warnings?.map((warning, index) => <button className="warning" key={`warning-${warning.nodeId}-${index}`} onClick={() => warning.nodeId && setSelectedId(warning.nodeId)}>{warning.nodeId && <code>{warning.nodeId}</code>} {warning.message}</button>)}
    </section>}

    {/* Readiness diagnostic modal */}
    {showReadinessModal && (
      <div className="modal-backdrop" onClick={() => setShowReadinessModal(false)}>
        <div className="readiness-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>สถานะความพร้อมระบบ (System & Adobe Readiness)</h3>
            <button className="close-btn" onClick={() => setShowReadinessModal(false)}>×</button>
          </div>
          <div className="readiness-checks-list">
            {(readiness?.checks ?? []).map((check) => (
              <div key={check.id} className={`readiness-check-row ${check.ok ? "ok" : "warn"}`}>
                <span className="check-icon">{check.ok ? "✓" : "⚠️"}</span>
                <div className="check-body">
                  <div className="check-title-row">
                    <strong>{check.name}</strong>
                    <span className={`check-badge ${check.ok ? "ready" : "needed"}`}>{check.ok ? "พร้อม" : "ต้องเตรียม"}</span>
                  </div>
                  {!check.ok && check.detail && <p className="check-detail">{check.detail}</p>}
                  {!check.ok && check.remediation && <p className="check-remediation">👉 วิธีแก้: {check.remediation}</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="modal-footer">
            <button className="button secondary" onClick={() => void refreshReadiness()}>↻ ตรวจสอบอีกครั้ง</button>
            <button className="button primary" onClick={() => setShowReadinessModal(false)}>ปิด</button>
          </div>
        </div>
      </div>
    )}

    {/* Artifacts modal */}
    {showArtifactsModal && (
      <div className="modal-backdrop" onClick={() => setShowArtifactsModal(false)}>
        <div className="artifacts-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>ไฟล์ผลลัพธ์ (Artifacts)</h3>
            <button className="close-btn" onClick={() => setShowArtifactsModal(false)}>×</button>
          </div>
          <div className="artifacts-modal-grid">
            {artifacts.map((art) => (
              <div className="artifact-item" key={art.artifactId}>
                {art.kind === "image" ? <img src={`/api/v1/runs/${activeRunId}/artifacts/${art.artifactId}/content`} alt={art.name} /> : <div className="art-box">{art.kind}</div>}
                <div className="art-details">
                  <strong>{art.name}</strong>
                  <small>{art.relativePath}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

    {/* B-Roll Approval Modal */}
    {showApprovalModal && activeRun && activeRun.approval && (
      <ApprovalModal
        runId={activeRun.runId}
        stepId={activeRun.steps.find((s) => s.status === "waiting_approval")?.id ?? "review_approval"}
        approval={activeRun.approval}
        csrfToken={csrfToken}
        onClose={() => setShowApprovalModal(false)}
        onDecided={() => {
          if (activeRunId) void loadActiveRun(activeRunId);
        }}
      />
    )}

    <footer className="editor-footer">
      <div className="lifecycle-navbar" aria-label="Workflow lifecycle stages">
        <div className="lifecycle-stages">
          {LIFECYCLE_STAGES.map((stageKey) => {
            const stageInfo = stageLabels[stageKey];
            const stageAnalysis = lifecycle?.stages.find((s) => s.stage === stageKey);
            const status = stageAnalysis?.status ?? "empty";
            const count = stageAnalysis?.nodeCount ?? 0;
            const isFiltered = stageFilter === stageKey;
            return (
              <button
                key={stageKey}
                className={`lifecycle-stage-btn stage-${stageKey} status-${status} ${isFiltered ? "active-filter" : ""}`}
                onClick={() => setStageFilter((current) => current === stageKey ? undefined : stageKey)}
                title={`คลิกเพื่อกรองโหนดกลุ่ม ${stageInfo.title} (${status})`}
              >
                <span className="stage-indicator" />
                <span className="stage-name">{stageInfo.short}</span>
                <span className="stage-count">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="lifecycle-summary">
          {lifecycle?.complete ? (
            <span className="lifecycle-complete-badge">✨ โครงสร้างครบวงจร</span>
          ) : (
            <span className="lifecycle-incomplete-badge">โครงสร้างยังไม่ครบวงจร</span>
          )}
        </div>
      </div>

      <div className="run-controls">
        {/* Live Readiness Badge */}
        <button
          className={`readiness-chip ${isAdobeReady ? "ready" : "offline"}`}
          onClick={() => setShowReadinessModal(true)}
          title="คลิกเพื่อดูรายละเอียดความพร้อมของ Adobe และ AI Services"
        >
          <span className="readiness-dot" />
          <span>{isAdobeReady ? "Adobe พร้อม (Live)" : "Adobe ออฟไลน์ (เตรียม JSON)"}</span>
          <span className="readiness-info-icon">ℹ</span>
        </button>

        {/* Step 1: Validate Button with clear Status Indicator */}
        <button
          className={`button ${currentValidationPassed ? "button-valid-success" : "button-validate-needed"}`}
          onClick={() => void validate()}
          disabled={actionsBusy || isRunActive}
          title="กดเพื่อตรวจสอบความถูกต้องของ Workflow ก่อนสั่งรัน"
        >
          {validating ? "กำลังตรวจสอบ…" : currentValidationPassed ? "✓ ตรวจสอบผ่านแล้ว" : "✔ ตรวจสอบ (Validate)"}
        </button>

        {/* Step 2: Primary Run workflow CTA (Smart Execution) */}
        <button
          className="button primary btn-run-primary"
          onClick={() => void run()}
          disabled={actionsBusy || !currentValidationPassed || isRunActive || queuingRun}
          title={!currentValidationPassed ? "กรุณากดปุ่ม Validate ทางซ้ายเพื่อยืนยันก่อนรัน" : isRunActive ? "กำลังรันงานอยู่…" : undefined}
        >
          {queuingRun ? "กำลังส่งคำสั่ง…" : isRunActive ? "กำลังรันอยู่…" : "▶ รัน Workflow"}
        </button>

        {/* Permanent Run Monitor Button (Immediately adjacent to Run button) */}
        <Link
          to={activeRun ? `/runs/${activeRun.runId}` : "/runs"}
          className={`button ${activeRun ? "btn-monitor-active" : "secondary"}`}
          style={{
            height: "36px",
            padding: "0 16px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            textDecoration: "none",
            color: activeRun ? "#6ee7b7" : "#93c5fd",
            fontWeight: 700,
            fontSize: "13px",
            border: activeRun ? "1px solid #10b981" : "1px solid #3b82f6",
            background: activeRun ? "rgba(16, 185, 129, 0.15)" : "rgba(59, 130, 246, 0.12)",
            borderRadius: "6px",
            transition: "all 0.15s ease"
          }}
          title={activeRun ? `เปิดดูหน้า Monitor ของรอบการรันปัจจุบัน (${activeRun.runId})` : "เปิดดูประวัติและหน้า Run Monitor ทั้งหมด"}
        >
          <span style={{ fontSize: "14px" }}>📊</span>
          <span>{activeRun ? `Run Monitor (${activeRun.status})` : "Run Monitor"}</span>
          {activeRun && <span className="readiness-dot ready" style={{ width: "8px", height: "8px" }} />}
          <span style={{ fontSize: "12px", opacity: 0.8 }}>↗</span>
        </Link>

        {/* Secondary: Run to selected node */}
        <button
          className="button secondary btn-run-partial"
          onClick={() => void run(selectedId)}
          disabled={actionsBusy || !currentValidationPassed || !selectedId || isRunActive || queuingRun}
          title={!selectedId ? "เลือกโหนดใน Canvas ก่อนเพื่อรันเฉพาะโหนดที่เลือก" : undefined}
        >
          รันเฉพาะโหนดที่เลือก
        </button>
      </div>
    </footer>
  </main></GraphShell>;
}

function toFlowNode(node: WorkflowNode, descriptors: NodeTypeDescriptor[]): GraphNode {
  const descriptor = descriptors.find((item) => item.type === node.type);
  return {
    id: node.id,
    type: "typed",
    position: node.position,
    data: {
      label: descriptor?.label ?? node.type,
      description: descriptor?.description ?? "",
      lifecycleStage: descriptor?.lifecycleStage ?? "assets",
      nodeType: node.type,
      config: node.config ?? {},
      inputs: descriptor?.inputs ?? [],
      outputs: descriptor?.outputs ?? []
    }
  };
}

function toFlowEdge(edge: WorkflowEdge, nodes: WorkflowNode[], descriptors: NodeTypeDescriptor[]): Edge {
  let sourcePort = edge.sourcePort;
  let targetPort = edge.targetPort;
  if (!sourcePort || !targetPort) {
    const source = nodes.find((node) => node.id === edge.source);
    const target = nodes.find((node) => node.id === edge.target);
    const sourceDescriptor = descriptors.find((item) => item.type === source?.type);
    const targetDescriptor = descriptors.find((item) => item.type === target?.type);
    for (const input of [...(targetDescriptor?.inputs ?? [])].sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required)))) {
      const output = sourceDescriptor?.outputs?.find((candidate) => compatiblePortTypes(candidate.type, input.type));
      if (output) { sourcePort = output.id; targetPort = input.id; break; }
    }
  }
  return { id: edge.id, source: edge.source, target: edge.target, sourceHandle: sourcePort, targetHandle: targetPort, type: "deletable" };
}

function serializeWorkflow(workflow: VisualWorkflow, nodes: GraphNode[], edges: Edge[]): VisualWorkflow {
  return { ...workflow, nodes: nodes.map((node) => ({ id: node.id, type: node.data.nodeType, position: node.position, config: node.data.config })), edges: serializeEdges(edges) };
}

function nodeData(descriptor: NodeTypeDescriptor, config: Record<string, JsonValue>): GraphNodeData {
  return {
    label: descriptor.label,
    description: descriptor.description ?? "",
    lifecycleStage: descriptor.lifecycleStage ?? "assets",
    nodeType: descriptor.type,
    config,
    inputs: descriptor.inputs,
    outputs: descriptor.outputs
  };
}

function cloneGraphNode(source: GraphNode): GraphNode {
  return {
    ...source,
    data: {
      ...source.data,
      config: JSON.parse(JSON.stringify(source.data.config))
    }
  };
}

function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    workflow: { ...snapshot.workflow },
    nodes: snapshot.nodes.map(cloneGraphNode),
    edges: snapshot.edges.map((edge) => ({ ...edge })),
    selectedId: snapshot.selectedId
  };
}

function TypedGraphNode({ data, selected }: NodeProps<GraphNode>) {
  const stage = data.lifecycleStage || "assets";
  const execClass = data.execStatus ? `exec-${data.execStatus}` : "";
  const isPreview = data.nodeType === "preview.media" || data.nodeType === "preview.video" || data.nodeType === "preview.image";
  const rawSource = String(data.config?.source ?? data.config?.path ?? data.config?.previewUrl ?? "");
  const isVideo = data.nodeType === "preview.video" || rawSource.endsWith(".mp4") || rawSource.endsWith(".mov") || rawSource.includes("mp4");

  return (
    <div className={`typed-graph-node stage-${stage} ${selected ? "selected" : ""} ${data.dimmed ? "dimmed" : ""} ${execClass} ${isPreview ? "node-preview-comfy" : ""}`}>
      <div className={`node-accent-bar stage-${stage}`} />
      <div className="typed-node-header">
        <div className="typed-node-title-row">
          <strong className="typed-node-title">{data.label}</strong>
          <div className="node-badges-row">
            {data.execStatus ? (
              <span className={`node-exec-badge ${data.execStatus}`}>
                {data.execStatus === "running" ? "⏳ Running" : data.execStatus === "success" ? "✓ Done" : data.execStatus === "failed" ? "✕ Failed" : data.execStatus}
              </span>
            ) : data.statusBadge ? (
              <span className={`node-status-badge ${data.statusBadge.ready ? "ready" : "needs-config"}`}>
                {data.statusBadge.text}
              </span>
            ) : null}
          </div>
        </div>
        <code>{data.nodeType}</code>
        {data.description && <p className="typed-node-desc">{data.description}</p>}
      </div>

      {isPreview && (
        <div className="comfy-node-viewport nodrag nopan" style={{ margin: "8px 12px", background: "#090d16", borderRadius: "6px", border: "1px solid #1e293b", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px", background: "#0f172a", borderBottom: "1px solid #1e293b", fontSize: "10px", color: "#94a3b8" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontWeight: 700, color: "#38bdf8" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: data.execStatus === "success" ? "#10b981" : "#0284c7" }} />
              ComfyUI Viewport
            </span>
            <span>{isVideo ? "MP4 / VIDEO" : "IMAGE / BG"}</span>
          </div>
          <div style={{ minHeight: "100px", maxHeight: "140px", display: "flex", alignItems: "center", justifyContent: "center", background: "#020617" }}>
            {rawSource ? (
              isVideo ? (
                <video
                  src={`/api/v1/media/stream?path=${encodeURIComponent(rawSource)}`}
                  controls
                  style={{ width: "100%", maxHeight: "140px", objectFit: "contain", background: "#000" }}
                />
              ) : (
                <img
                  src={`/api/v1/media/stream?path=${encodeURIComponent(rawSource)}`}
                  alt="Preview"
                  style={{ width: "100%", maxHeight: "140px", objectFit: "contain" }}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              )
            ) : (
              <div style={{ padding: "16px 8px", textAlign: "center", color: "#475569" }}>
                <div style={{ fontSize: "20px", marginBottom: "2px" }}>{isVideo ? "🎬" : "🖼️"}</div>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748b" }}>
                  {data.execStatus === "running" ? "กำลังประมวลผล…" : "รอรับสัญญาณภาพสด"}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="typed-port-list inputs">
        {data.inputs.map((port) => (
          <div className="typed-port input" key={port.id}>
            <Handle type="target" position={Position.Left} id={port.id} aria-label={`${port.id} input, ${port.type}`}/>
            <span>{port.id}{port.required ? " *" : ""}</span>
            <small>{port.type}</small>
          </div>
        ))}
      </div>
      <div className="typed-port-list outputs">
        {data.outputs.map((port) => (
          <div className="typed-port output" key={port.id}>
            <Handle type="source" position={Position.Right} id={port.id} aria-label={`${port.id} output, ${port.type}`}/>
            <span>{port.id}</span>
            <small>{port.type}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
  onDelete
}: EdgeProps & { onDelete?: (id: string) => void }) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    targetX,
    targetY
  });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all"
          }}
          className="nodrag nopan"
        >
          <button
            className={`edge-delete-btn ${selected ? "selected" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onDelete?.(id);
            }}
            title="ลบเส้นเชื่อมนี้"
          >
            ×
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function getComfyDimensions(profile: WorkflowProfile): { width: number; height: number } {
  switch (profile) {
    case "portrait":
      return { width: 768, height: 1344 };
    case "landscape":
      return { width: 1344, height: 768 };
    case "square":
    default:
      return { width: 1024, height: 1024 };
  }
}

function getFormatDimensions(profile: WorkflowProfile): { width: number; height: number } {
  switch (profile) {
    case "portrait":
      return { width: 1080, height: 1920 };
    case "landscape":
      return { width: 1920, height: 1080 };
    case "square":
    default:
      return { width: 1080, height: 1080 };
  }
}

function groupDescriptors(descriptors: NodeTypeDescriptor[]) {
  const groups = new Map<string, NodeTypeDescriptor[]>();
  for (const descriptor of descriptors) groups.set(descriptor.category || "Other", [...(groups.get(descriptor.category || "Other") ?? []), descriptor]);
  return [...groups.entries()];
}

function saveLabel(state: string, dirty: boolean) {
  if (state === "saving") return "Saving…";
  if (state === "conflict") return "Revision conflict";
  if (state === "error") return "Save failed";
  if (dirty) return "Unsaved changes";
  return state === "saved" ? "Saved" : "Up to date";
}

function endpointMessage(cause: any) {
  return cause?.status === 404
    ? "ไม่พบข้อมูลเวิร์กโฟลว์นี้บนระบบ (404 Not Found) อาจเกิดจากการรีสตาร์ทเซิร์ฟเวอร์หรือรหัสไม่ถูกต้อง กรุณากลับไปเลือกจากหน้า Catalog"
    : cause?.message ?? "เกิดข้อผิดพลาดในการเชื่อมต่อ Graph Service";
}
function formatTime(milliseconds: number) { return `${(milliseconds / 1000).toFixed(2)}s`; }

function SchemaField({ name, schema, required, value, onChange }: { name: string; schema: ConfigSchema; required: boolean; value: JsonValue | undefined; onChange: (value: JsonValue) => void }) {
  const label = schema.title ?? name;
  if (schema.format === "media-file" || schema.format === "audio-file") return <MediaPathField label={label} required={required} value={String(value ?? "")} accept={schema.format === "audio-file" ? "audio/*" : "image/*,audio/*,video/mp4,video/quicktime"} onChange={onChange}/>;
  if (schema.enum) return <label className="inspector-field"><span>{label}{required && " *"}</span><select value={String(value ?? "")} onChange={(event) => onChange(coerceEnum(event.target.value, schema.enum!))}>{schema.enum.map((option) => <option key={JSON.stringify(option)} value={String(option)}>{String(option)}</option>)}</select><small>{schema.description}</small></label>;
  if (schema.type === "boolean") return <label className="inspector-check"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)}/><span>{label}{required && " *"}<small>{schema.description}</small></span></label>;
  if (schema.type === "object" || schema.type === "array") return <JsonField label={label} description={schema.description} value={value ?? (schema.type === "array" ? [] : {})} onChange={onChange}/>;
  if (schema.type === "number" || schema.type === "integer") return <label className="inspector-field"><span>{label}{required && " *"}</span><input type="number" required={required} min={schema.minimum} max={schema.maximum} step={schema.type === "integer" ? 1 : "any"} value={typeof value === "number" ? value : 0} onChange={(event) => onChange(Number(event.target.value))}/><small>{schema.description}</small></label>;
  const multiline = schema.format === "textarea" || (schema.maxLength ?? 0) > 160;
  return <label className="inspector-field"><span>{label}{required && " *"}</span>{multiline ? <textarea required={required} minLength={schema.minLength} maxLength={schema.maxLength} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}/> : <input required={required} minLength={schema.minLength} maxLength={schema.maxLength} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}/>}<small>{schema.description}</small></label>;
}

function MediaPathField({ label, required, value, accept, onChange }: { label: string; required: boolean; value: string; accept: string; onChange: (value: JsonValue) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  return <div className="inspector-field"><span>{label}{required && " *"}</span><input required={required} value={value} onChange={(event) => onChange(event.target.value)}/><label className="button secondary">{uploading ? "Importing…" : "Choose local file"}<input hidden type="file" accept={accept} disabled={uploading} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setUploading(true); setError(""); try { onChange((await importWorkflowMedia(file)).projectPath); } catch (cause: any) { setError(cause.message ?? "Import failed"); } finally { setUploading(false); event.target.value = ""; } }}/></label><small>{error || "Stored inside the local workspace before execution."}</small></div>;
}

function JsonField({ label, description, value, onChange }: { label: string; description?: string; value: JsonValue; onChange: (value: JsonValue) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState("");
  useEffect(() => { setText(JSON.stringify(value, null, 2)); }, [value]);
  return <label className="inspector-field"><span>{label}</span><textarea className={error ? "invalid" : ""} value={text} onChange={(event) => setText(event.target.value)} onBlur={() => { try { onChange(JSON.parse(text)); setError(""); } catch { setError("Invalid JSON value"); } }}/><small>{error || description}</small></label>;
}

function coerceEnum(value: string, options: JsonValue[]) { return options.find((option) => String(option) === value) ?? value; }
