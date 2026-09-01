import { randomUUID } from "node:crypto";
import { GRAPH_MAX_DURATION_FRAMES, type GraphDefinitionV1, type GraphEdgeV1, type GraphNodeV1, type NodeDescriptorV1 } from "@psu-ava/contracts";
import { GraphRevisionConflictError, LocalGraphStore } from "@psu-ava/persistence-local";
import {
  compatiblePortTypes,
  createGraphDefinition,
  graphProfiles,
  nodeDescriptorRegistry,
  validateGraphDefinition
} from "@psu-ava/node-sdk";

export type VisualWorkflowInput = {
  name?: unknown;
  description?: unknown;
  profile?: unknown;
  durationFrames?: unknown;
  nodes?: unknown;
  edges?: unknown;
  expectedRevision?: unknown;
};

export class VisualWorkflowService {
  constructor(readonly store: LocalGraphStore) {}

  async list() {
    return Promise.all((await this.store.listDrafts()).map((graph) => this.toDto(graph)));
  }

  async create(input: VisualWorkflowInput) {
    const name = requiredName(input.name);
    const graph = createGraphDefinition({
      graphId: makeGraphId(name),
      name,
      description: optionalDescription(input.description),
      profile: parseProfile(input.profile),
      durationFrames: parseDurationFrames(input.durationFrames) ?? 5 * 25
    });
    return this.toDto(await this.store.saveDraft(graph, 0));
  }

  async createFromPackage(graph: GraphDefinitionV1) {
    if (await this.store.getDraft(graph.graphId)) throw Object.assign(new Error("Workflow id already exists"), { statusCode: 409 });
    const validation = validateGraphDefinition(graph);
    if (!validation.valid) throw Object.assign(new Error("Starter package graph is invalid"), { statusCode: 422, diagnostics: validation.diagnostics });
    return this.toDto(await this.store.saveDraft(graph, 0));
  }

  async get(graphId: string) {
    const graph = await this.requireDraft(graphId);
    return this.toDto(graph);
  }

  async update(graphId: string, input: VisualWorkflowInput, headerRevision?: string) {
    const graph = await this.requireDraft(graphId);
    const expectedRevision = parseRevision(input.expectedRevision ?? headerRevision);
    if (expectedRevision !== graph.revision) throw conflict(expectedRevision, graph.revision);
    const nodes = parseNodes(input.nodes ?? graph.nodes);
    const edges = parseEdges(input.edges ?? graph.edges, nodes);
    const next: GraphDefinitionV1 = {
      ...graph,
      name: input.name === undefined ? graph.name : requiredName(input.name),
      profile: input.profile === undefined ? graph.profile : structuredClone(graphProfiles[parseProfile(input.profile) ?? "portrait"]),
      durationFrames: input.durationFrames === undefined ? graph.durationFrames : parseDurationFrames(input.durationFrames)!,
      ...(input.description === undefined
        ? {}
        : optionalDescription(input.description)
          ? { description: optionalDescription(input.description) }
          : { description: undefined }),
      nodes,
      edges,
      order: stableTopologicalOrder(nodes, edges)
    };
    return this.toDto(await this.store.saveDraft(next, expectedRevision));
  }

  async validate(graphId: string) {
    const graph = await this.requireDraft(graphId);
    const result = validateGraphDefinition(graph);
    return {
      valid: result.valid,
      errors: result.diagnostics.map(({ nodeId, path, message }) => ({ nodeId, path, message })),
      warnings: []
    };
  }

  async publish(graphId: string) {
    const graph = await this.requireDraft(graphId);
    const validation = validateGraphDefinition(graph);
    if (!validation.valid) {
      throw Object.assign(new Error("Workflow must pass validation before publish"), {
        statusCode: 422,
        diagnostics: validation.diagnostics
      });
    }
    await this.store.publish(graphId, graph.revision);
    return this.toDto(graph);
  }

  async clone(graphId: string) {
    const source = await this.requireDraft(graphId);
    const cloneId = makeGraphId(`${source.name}-copy`);
    const versions = await this.store.listPublished(graphId);
    const clone = versions.length
      ? await this.store.clonePublished(graphId, versions.at(-1)!.version, { graphId: cloneId })
      : await this.store.saveDraft({
          ...structuredClone(source),
          graphId: cloneId,
          name: `${source.name} copy`,
          revision: 0,
          lineage: undefined
        }, 0);
    return this.toDto(clone);
  }

  async delete(graphId: string) {
    await this.requireDraft(graphId);
    await this.store.deleteDraft(graphId);
    return { ok: true, id: graphId };
  }

  async requireDraft(graphId: string) {
    const graph = await this.store.getDraft(graphId);
    if (!graph) throw Object.assign(new Error("Workflow not found"), { statusCode: 404 });
    return graph;
  }

  async requireCurrentPublished(graphId: string) {
    const draft = await this.requireDraft(graphId);
    const latest = (await this.store.listPublished(graphId)).at(-1);
    if (!latest || latest.sourceRevision !== draft.revision) {
      throw Object.assign(new Error("Publish the current workflow revision before starting a Live run"), {
        statusCode: 409,
        code: "PUBLISH_REQUIRED"
      });
    }
    return structuredClone(latest.graph);
  }

  async toDto(graph: GraphDefinitionV1) {
    const latest = (await this.store.listPublished(graph.graphId)).at(-1);
    const isPublished = latest?.sourceRevision === graph.revision;
    return {
      id: graph.graphId,
      name: graph.name,
      description: graph.description,
      status: isPublished ? "published" : "draft",
      revision: graph.revision,
      profile: graph.profile.id,
      durationFrames: graph.durationFrames,
      durationSeconds: graph.durationFrames / 25,
      nodes: graph.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position ?? { x: 80, y: 80 },
        config: node.config
      })),
      edges: graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.from.nodeId,
        sourcePort: edge.from.port,
        target: edge.to.nodeId,
        targetPort: edge.to.port
      })),
      publishedAt: isPublished ? latest?.publishedAt : undefined
    };
  }
}

function parseDurationFrames(value: unknown) {
  if (value === undefined) return undefined;
  const frames = Number(value);
  if (!Number.isSafeInteger(frames) || frames < 1 || frames > GRAPH_MAX_DURATION_FRAMES) {
    throw Object.assign(new Error(`durationFrames must be an integer between 1 and ${GRAPH_MAX_DURATION_FRAMES}`), { statusCode: 422 });
  }
  return frames;
}

function parseNodes(value: unknown): GraphNodeV1[] {
  if (!Array.isArray(value)) throw Object.assign(new Error("nodes must be an array"), { statusCode: 422 });
  return value.map((item: any, index) => {
    if (!item || typeof item !== "object" || !safeId(item.id) || typeof item.type !== "string") {
      throw Object.assign(new Error(`nodes[${index}] is invalid`), { statusCode: 422 });
    }
    const position = item.position && Number.isFinite(item.position.x) && Number.isFinite(item.position.y)
      ? { x: Number(item.position.x), y: Number(item.position.y) }
      : { x: 80 + index * 40, y: 80 + index * 40 };
    return { id: item.id, type: item.type, position, config: plainObject(item.config) };
  });
}

function parseEdges(value: unknown, nodes: GraphNodeV1[]): GraphEdgeV1[] {
  if (!Array.isArray(value)) throw Object.assign(new Error("edges must be an array"), { statusCode: 422 });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return value.map((item: any, index) => {
    const source = item?.source ?? item?.from?.nodeId;
    const target = item?.target ?? item?.to?.nodeId;
    const requestedSourcePort = item?.sourcePort ?? item?.from?.port;
    const requestedTargetPort = item?.targetPort ?? item?.to?.port;
    if (!item || typeof item !== "object" || !safeId(item.id) || !safeId(source) || !safeId(target)) {
      throw Object.assign(new Error(`edges[${index}] is invalid`), { statusCode: 422 });
    }
    const sourceNode = byId.get(source);
    const targetNode = byId.get(target);
    const sourceDescriptor = descriptorFor(sourceNode);
    const targetDescriptor = descriptorFor(targetNode);
    if (!sourceNode || !targetNode || !sourceDescriptor || !targetDescriptor) {
      throw edgeError(index, source, target, "Connection references an unknown node or node type");
    }
    const pairs = compatiblePairs(sourceDescriptor, targetDescriptor);
    const pair = requestedSourcePort || requestedTargetPort
      ? pairs.find(({ output, input }) => output.id === requestedSourcePort && input.id === requestedTargetPort)
      : pairs.length === 1 ? pairs[0] : undefined;
    if (!pair) {
      const reason = requestedSourcePort || requestedTargetPort
        ? `Ports '${String(requestedSourcePort)}' → '${String(requestedTargetPort)}' are missing or incompatible`
        : pairs.length > 1
          ? "Connection is ambiguous; sourcePort and targetPort are required"
          : "Node types do not have compatible ports";
      throw edgeError(index, source, target, reason);
    }
    return {
      id: item.id,
      from: { nodeId: source, port: pair.output.id },
      to: { nodeId: target, port: pair.input.id }
    };
  });
}

function compatiblePairs(source: NodeDescriptorV1, target: NodeDescriptorV1) {
  const pairs: Array<{ output: NodeDescriptorV1["outputs"][number]; input: NodeDescriptorV1["inputs"][number] }> = [];
  for (const input of [...target.inputs].sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required)))) {
    for (const output of source.outputs) if (compatiblePortTypes(output.type, input.type)) pairs.push({ output, input });
  }
  return pairs;
}

function descriptorFor(node?: GraphNodeV1) { return node ? nodeDescriptorRegistry.get(node.type) : undefined; }

function stableTopologicalOrder(nodes: GraphNodeV1[], edges: GraphEdgeV1[]) {
  const index = new Map(nodes.map((node, position) => [node.id, position]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of edges) {
    if (!indegree.has(edge.from.nodeId) || !indegree.has(edge.to.nodeId)) continue;
    if (!adjacency.get(edge.from.nodeId)!.has(edge.to.nodeId)) {
      adjacency.get(edge.from.nodeId)!.add(edge.to.nodeId);
      indegree.set(edge.to.nodeId, indegree.get(edge.to.nodeId)! + 1);
    }
  }
  const ready = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const order: string[] = [];
  while (ready.length) {
    ready.sort((a, b) => index.get(a)! - index.get(b)!);
    const current = ready.shift()!;
    order.push(current);
    for (const target of adjacency.get(current) ?? []) {
      indegree.set(target, indegree.get(target)! - 1);
      if (indegree.get(target) === 0) ready.push(target);
    }
  }
  for (const node of nodes) if (!order.includes(node.id)) order.push(node.id);
  return order;
}

function requiredName(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw Object.assign(new Error("name is required"), { statusCode: 422 });
  return value.trim().slice(0, 120);
}
function optionalDescription(value: unknown) { return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : undefined; }
function parseProfile(value: unknown) {
  if (value === undefined) return undefined;
  if (value === "portrait" || value === "landscape" || value === "square") return value;
  throw Object.assign(new Error("profile must be portrait, landscape, or square"), { statusCode: 422 });
}
function parseRevision(value: unknown) {
  const revision = typeof value === "string" ? Number(value.replace(/^W\//, "").replaceAll('"', "")) : Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) throw Object.assign(new Error("A valid If-Match revision is required"), { statusCode: 428 });
  return revision;
}
function makeGraphId(name: string) {
  const slug = name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workflow";
  return `${slug}-${randomUUID().slice(0, 8)}`;
}
function safeId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value); }
function plainObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? structuredClone(value as Record<string, unknown>) : {}; }
function conflict(expected: number, actual: number) { return Object.assign(new GraphRevisionConflictError(expected, actual), { statusCode: 409 }); }
function edgeError(index: number, source: string, target: string, message: string) {
  return Object.assign(new Error(`edges[${index}]: ${message}`), {
    statusCode: 422,
    diagnostics: [{ path: `/edges/${index}`, message, sourceNodeId: source, targetNodeId: target }]
  });
}
