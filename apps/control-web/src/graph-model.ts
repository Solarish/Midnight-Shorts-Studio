import type { ConfigSchema, GraphPortType, JsonValue, NodeTypeDescriptor, VisualWorkflow, WorkflowEdge, WorkflowNode } from "./graph-types";

export function defaultConfig(descriptor: NodeTypeDescriptor): Record<string, JsonValue> {
  return Object.fromEntries(Object.entries(descriptor.configSchema?.properties ?? {}).map(([key, schema]) => [key, schema.default ?? defaultForSchema(schema)]));
}

function defaultForSchema(schema: ConfigSchema): JsonValue {
  if (schema.enum?.length) return schema.enum[0] ?? null;
  if (schema.type === "boolean") return false;
  if (schema.type === "number" || schema.type === "integer") return 0;
  if (schema.type === "array") return [];
  if (schema.type === "object") return {};
  return "";
}

export function wouldCreateCycle(nodes: Pick<WorkflowNode, "id">[], edges: Pick<WorkflowEdge, "source" | "target">[], source: string, target: string) {
  if (!source || !target || source === target) return true;
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) outgoing.get(edge.source)?.push(edge.target);
  outgoing.get(source)?.push(target);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of outgoing.get(id) ?? []) if (visit(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return nodes.some((node) => visit(node.id));
}

export function compatiblePortTypes(source: GraphPortType, target: GraphPortType) {
  if (source === "any" || target === "any" || source === target) return true;
  if (target === "media") return source === "image" || source === "video" || source === "audio";
  if (source === "media") return target === "image" || target === "video" || target === "audio";
  return false;
}

export function connectionCompatibility(
  descriptors: Map<string, NodeTypeDescriptor>,
  nodes: Array<{ id: string; nodeType: string }>,
  connection: { source?: string | null; target?: string | null; sourceHandle?: string | null; targetHandle?: string | null }
) {
  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);
  const sourcePort = sourceNode ? descriptors.get(sourceNode.nodeType)?.outputs.find((port) => port.id === connection.sourceHandle) : undefined;
  const targetPort = targetNode ? descriptors.get(targetNode.nodeType)?.inputs.find((port) => port.id === connection.targetHandle) : undefined;
  if (!sourceNode || !targetNode) return { valid: false, reason: "Both nodes are required." };
  if (!sourcePort || !targetPort) return { valid: false, reason: "Choose a labeled output and input port." };
  if (!compatiblePortTypes(sourcePort.type, targetPort.type)) {
    return { valid: false, reason: `Cannot connect ${sourcePort.type} to ${targetPort.type}.` };
  }
  return { valid: true, sourcePort: sourcePort.id, targetPort: targetPort.id };
}

export function serializeEdges(edges: Array<{ id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null; sourcePort?: string; targetPort?: string }>): WorkflowEdge[] {
  return edges.filter((edge) => edge.source && edge.target).map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle || edge.sourcePort ? { sourcePort: edge.sourceHandle ?? edge.sourcePort } : {}),
    ...(edge.targetHandle || edge.targetPort ? { targetPort: edge.targetHandle ?? edge.targetPort } : {})
  }));
}

export function computedTimeline(workflow: Pick<VisualWorkflow, "nodes" | "edges">) {
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const indegree = new Map(workflow.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(workflow.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of workflow.edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }
  const ready = workflow.nodes.filter((node) => indegree.get(node.id) === 0).sort(positionOrder);
  const result: WorkflowNode[] = [];
  while (ready.length) {
    const node = ready.shift()!;
    result.push(node);
    for (const target of outgoing.get(node.id) ?? []) {
      indegree.set(target, (indegree.get(target) ?? 1) - 1);
      if (indegree.get(target) === 0) ready.push(nodeById.get(target)!);
    }
    ready.sort(positionOrder);
  }
  let cursorMs = 0;
  const scenes = result.filter((node) => node.type === "timeline.scene").map((node) => {
    const durationMs = typeof node.config.durationMs === "number" ? node.config.durationMs : 0;
    const startMs = typeof node.config.startMs === "number" ? node.config.startMs : cursorMs;
    cursorMs = Math.max(cursorMs, startMs + durationMs);
    return { nodeId: node.id, startMs, durationMs, endMs: startMs + durationMs };
  });
  return { nodes: result, scenes, durationMs: Math.max(0, ...scenes.map((scene) => scene.endMs)), cyclic: result.length !== workflow.nodes.length };
}

const STAGE_ORDER: Record<string, number> = {
  assets: 0,
  process: 1,
  timeline: 2,
  build: 3,
  export: 4
};

export function layoutGraphNodes<T extends { id: string; position: { x: number; y: number }; data?: { lifecycleStage?: string; nodeType?: string } }>(
  nodes: T[],
  edges: Array<{ source: string; target: string }>
): T[] {
  if (!nodes.length) return [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }

  const levels = new Map<string, number>();
  for (const node of nodes) {
    const stage = node.data?.lifecycleStage ?? "assets";
    const stageIdx = STAGE_ORDER[stage] ?? 0;
    levels.set(node.id, stageIdx);
  }

  const ready = nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0);
  const queue = [...ready];
  while (queue.length) {
    const current = queue.shift()!;
    const currentLevel = levels.get(current.id) ?? 0;
    for (const nextId of outgoing.get(current.id) ?? []) {
      const nextNode = nodeById.get(nextId);
      if (nextNode) {
        const nextStageIdx = STAGE_ORDER[nextNode.data?.lifecycleStage ?? "assets"] ?? 0;
        const targetLevel = Math.max(currentLevel + 1, nextStageIdx);
        if (targetLevel > (levels.get(nextId) ?? 0)) {
          levels.set(nextId, targetLevel);
        }
        indegree.set(nextId, (indegree.get(nextId) ?? 1) - 1);
        if (indegree.get(nextId) === 0) queue.push(nextNode);
      }
    }
  }

  const stageBuckets = new Map<number, T[]>();
  for (const node of nodes) {
    const lvl = levels.get(node.id) ?? 0;
    if (!stageBuckets.has(lvl)) stageBuckets.set(lvl, []);
    stageBuckets.get(lvl)!.push(node);
  }

  const COLUMN_WIDTH = 290;
  const ROW_HEIGHT = 160;
  const START_X = 60;
  const START_Y = 60;

  return nodes.map((node) => {
    const lvl = levels.get(node.id) ?? 0;
    const bucket = stageBuckets.get(lvl) ?? [node];
    const rowIdx = bucket.findIndex((n) => n.id === node.id);
    return {
      ...node,
      position: {
        x: START_X + lvl * COLUMN_WIDTH,
        y: START_Y + (rowIdx >= 0 ? rowIdx : 0) * ROW_HEIGHT
      }
    };
  });
}

function positionOrder(a: WorkflowNode, b: WorkflowNode) {
  return a.position.x - b.position.x || a.position.y - b.position.y || a.id.localeCompare(b.id);
}

