export const LIFECYCLE_STAGES = ["assets", "process", "timeline", "build", "export"] as const;

export type LifecycleStage = typeof LIFECYCLE_STAGES[number];
export type LifecycleStatus = "empty" | "optional" | "needs-attention" | "ready" | "invalid";

export type LifecycleNodeLike = {
  id: string;
  type: string;
  config?: Record<string, unknown>;
};

export type LifecycleEdgeLike = {
  id?: string;
  source?: string;
  target?: string;
  sourcePort?: string;
  targetPort?: string;
  from?: { nodeId?: string; port?: string };
  to?: { nodeId?: string; port?: string };
};

export type LifecyclePortLike = {
  id: string;
  required?: boolean;
  configKey?: string;
};

export type LifecycleDescriptorLike = {
  type: string;
  lifecycleStage: LifecycleStage;
  inputs?: readonly LifecyclePortLike[];
};

export type LifecycleValidationErrorLike = {
  nodeId?: string;
  path?: string;
  message: string;
};

export type LifecycleIssue = {
  code:
    | "unknown-node-type"
    | "missing-required-input"
    | "validation-error"
    | "cycle"
    | "disconnected-graph"
    | "phase-order"
    | "required-path";
  message: string;
  stage?: LifecycleStage;
  nodeId?: string;
  edgeId?: string;
  path?: string;
};

export type LifecycleStageAnalysis = {
  stage: LifecycleStage;
  required: boolean;
  nodeCount: number;
  nodeIds: string[];
  status: LifecycleStatus;
  issues: LifecycleIssue[];
};

export type WorkflowLifecycleInput = {
  nodes: readonly LifecycleNodeLike[];
  edges: readonly LifecycleEdgeLike[];
  descriptors: readonly LifecycleDescriptorLike[];
  validationErrors?: readonly LifecycleValidationErrorLike[];
};

export type WorkflowLifecycleAnalysis = {
  stages: LifecycleStageAnalysis[];
  complete: boolean;
  nextRequiredStage?: LifecycleStage;
  issues: LifecycleIssue[];
  structural: {
    hasCycle: boolean;
    disconnected: boolean;
    monotonicOrder: boolean;
    requiredPathComplete: boolean;
  };
};

type NormalizedEdge = {
  id?: string;
  source?: string;
  target?: string;
  sourcePort?: string;
  targetPort?: string;
};

const REQUIRED_STAGES: readonly LifecycleStage[] = ["assets", "timeline", "build", "export"];
const STAGE_INDEX = new Map(LIFECYCLE_STAGES.map((stage, index) => [stage, index]));

export function analyzeWorkflowLifecycle(input: WorkflowLifecycleInput): WorkflowLifecycleAnalysis {
  const nodes = [...input.nodes];
  const edges = input.edges.map(normalizeEdge);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const descriptorByType = new Map(input.descriptors.map((descriptor) => [descriptor.type, descriptor]));
  const stageByNode = new Map<string, LifecycleStage>();
  const issues: LifecycleIssue[] = [];

  for (const node of nodes) {
    const descriptor = descriptorByType.get(node.type);
    if (!descriptor || !STAGE_INDEX.has(descriptor.lifecycleStage)) {
      issues.push({ code: "unknown-node-type", nodeId: node.id, message: `Node '${node.id}' has no lifecycle descriptor` });
      continue;
    }
    stageByNode.set(node.id, descriptor.lifecycleStage);
  }

  for (const node of nodes) {
    const descriptor = descriptorByType.get(node.type);
    const stage = stageByNode.get(node.id);
    if (!descriptor || !stage) continue;
    for (const port of descriptor.inputs ?? []) {
      if (!port.required) continue;
      const connected = edges.some((edge) => edge.target === node.id && edge.targetPort === port.id && nodeById.has(edge.source ?? ""));
      const configured = Boolean(port.configKey && isNonempty(readConfigPath(node.config ?? {}, port.configKey)));
      if (!connected && !configured) {
        issues.push({
          code: "missing-required-input",
          stage,
          nodeId: node.id,
          path: port.configKey,
          message: `Node '${node.id}' requires input '${port.id}'`
        });
      }
    }
  }

  for (const error of input.validationErrors ?? []) {
    const location = validationLocation(error, nodes, edges, stageByNode);
    issues.push({
      code: "validation-error",
      message: error.message,
      ...(location.stage ? { stage: location.stage } : {}),
      ...(location.nodeId ? { nodeId: location.nodeId } : {}),
      ...(error.path ? { path: error.path } : {})
    });
  }

  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  const undirected = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of edges) {
    if (!edge.source || !edge.target || !nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    adjacency.get(edge.source)?.add(edge.target);
    undirected.get(edge.source)?.add(edge.target);
    undirected.get(edge.target)?.add(edge.source);
  }

  const cycleNodes = findCycleNodes(adjacency);
  const hasCycle = cycleNodes.size > 0;
  for (const stage of uniqueStages(cycleNodes, stageByNode)) {
    issues.push({ code: "cycle", stage, message: "Workflow contains a directed cycle" });
  }

  const disconnected = nodes.length > 1 && weakComponentCount(nodes.map((node) => node.id), undirected) > 1;
  if (disconnected) {
    for (const stage of uniqueStages(new Set(nodes.map((node) => node.id)), stageByNode)) {
      issues.push({ code: "disconnected-graph", stage, message: "Workflow nodes do not form one connected graph" });
    }
  }

  let monotonicOrder = true;
  for (const edge of edges) {
    const sourceStage = edge.source ? stageByNode.get(edge.source) : undefined;
    const targetStage = edge.target ? stageByNode.get(edge.target) : undefined;
    if (!sourceStage || !targetStage || STAGE_INDEX.get(sourceStage)! <= STAGE_INDEX.get(targetStage)!) continue;
    monotonicOrder = false;
    issues.push({
      code: "phase-order",
      stage: targetStage,
      nodeId: edge.target,
      edgeId: edge.id,
      message: `Connection from ${sourceStage} to ${targetStage} moves backward in the lifecycle`
    });
  }

  const requiredPathComplete = hasRequiredLifecyclePath(nodes, adjacency, stageByNode);
  if (!requiredPathComplete && nodes.length > 0) {
    for (const stage of REQUIRED_STAGES) {
      issues.push({ code: "required-path", stage, message: "A directed assets → timeline → build → export path is required" });
    }
  }

  const stages = LIFECYCLE_STAGES.map<LifecycleStageAnalysis>((stage) => {
    const stageNodes = nodes.filter((node) => stageByNode.get(node.id) === stage);
    const stageIssues = issues.filter((issue) => issue.stage === stage);
    const required = REQUIRED_STAGES.includes(stage);
    let status: LifecycleStatus;
    if (stageNodes.length === 0) status = required ? "empty" : "optional";
    else if (stageIssues.some((issue) => issue.code === "validation-error")) status = "invalid";
    else if (stageIssues.length > 0) status = "needs-attention";
    else status = "ready";
    return { stage, required, nodeCount: stageNodes.length, nodeIds: stageNodes.map((node) => node.id), status, issues: stageIssues };
  });

  const complete = issues.length === 0 && requiredPathComplete && stages.every((stage) =>
    stage.required ? stage.status === "ready" : stage.status === "optional" || stage.status === "ready"
  );
  const nextRequiredStage = REQUIRED_STAGES.find((stage) => stages.find((value) => value.stage === stage)?.status !== "ready");

  return {
    stages,
    complete,
    ...(nextRequiredStage ? { nextRequiredStage } : {}),
    issues,
    structural: { hasCycle, disconnected, monotonicOrder, requiredPathComplete }
  };
}

function normalizeEdge(edge: LifecycleEdgeLike): NormalizedEdge {
  return {
    id: edge.id,
    source: edge.source ?? edge.from?.nodeId,
    target: edge.target ?? edge.to?.nodeId,
    sourcePort: edge.sourcePort ?? edge.from?.port,
    targetPort: edge.targetPort ?? edge.to?.port
  };
}

function readConfigPath(value: Record<string, unknown>, expression: string): unknown {
  const parts = expression.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let current: unknown = value;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(part)) return undefined;
      current = current[Number(part)];
    } else current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isNonempty(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function validationLocation(
  error: LifecycleValidationErrorLike,
  nodes: readonly LifecycleNodeLike[],
  edges: readonly NormalizedEdge[],
  stageByNode: ReadonlyMap<string, LifecycleStage>
) {
  let nodeId = error.nodeId;
  if (!nodeId && error.path) {
    const nodeMatch = /^\/nodes\/([^/]+)/.exec(error.path);
    if (nodeMatch) nodeId = /^\d+$/.test(nodeMatch[1]!) ? nodes[Number(nodeMatch[1])]?.id : nodeMatch[1];
    const edgeMatch = /^\/edges\/(\d+)/.exec(error.path);
    if (!nodeId && edgeMatch) nodeId = edges[Number(edgeMatch[1])]?.target ?? edges[Number(edgeMatch[1])]?.source;
  }
  return { nodeId, stage: nodeId ? stageByNode.get(nodeId) : undefined };
}

function findCycleNodes(adjacency: ReadonlyMap<string, ReadonlySet<string>>) {
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const cycleNodes = new Set<string>();
  const visit = (nodeId: string) => {
    color.set(nodeId, 1);
    stack.push(nodeId);
    for (const target of adjacency.get(nodeId) ?? []) {
      if ((color.get(target) ?? 0) === 0) visit(target);
      else if (color.get(target) === 1) {
        const start = stack.lastIndexOf(target);
        for (const value of stack.slice(start)) cycleNodes.add(value);
      }
    }
    stack.pop();
    color.set(nodeId, 2);
  };
  for (const nodeId of adjacency.keys()) if ((color.get(nodeId) ?? 0) === 0) visit(nodeId);
  return cycleNodes;
}

function weakComponentCount(nodeIds: readonly string[], adjacency: ReadonlyMap<string, ReadonlySet<string>>) {
  const seen = new Set<string>();
  let count = 0;
  for (const first of nodeIds) {
    if (seen.has(first)) continue;
    count += 1;
    const pending = [first];
    while (pending.length) {
      const nodeId = pending.pop()!;
      if (seen.has(nodeId)) continue;
      seen.add(nodeId);
      for (const target of adjacency.get(nodeId) ?? []) pending.push(target);
    }
  }
  return count;
}

function uniqueStages(nodeIds: ReadonlySet<string>, stageByNode: ReadonlyMap<string, LifecycleStage>) {
  const values = new Set<LifecycleStage>();
  for (const nodeId of nodeIds) {
    const stage = stageByNode.get(nodeId);
    if (stage) values.add(stage);
  }
  return LIFECYCLE_STAGES.filter((stage) => values.has(stage));
}

function hasRequiredLifecyclePath(
  nodes: readonly LifecycleNodeLike[],
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  stageByNode: ReadonlyMap<string, LifecycleStage>
) {
  const assetNodes = nodes.filter((node) => stageByNode.get(node.id) === "assets");
  const pending = assetNodes.map((node) => ({ nodeId: node.id, progress: 0 }));
  const seen = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    const key = `${current.nodeId}:${current.progress}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let progress = current.progress;
    const stage = stageByNode.get(current.nodeId);
    if (stage === REQUIRED_STAGES[progress + 1]) progress += 1;
    if (progress === REQUIRED_STAGES.length - 1 && stage === "export") return true;
    for (const target of adjacency.get(current.nodeId) ?? []) pending.push({ nodeId: target, progress });
  }
  return false;
}
