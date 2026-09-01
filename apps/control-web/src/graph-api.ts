import { api } from "./api";
import type { NodeTypeDescriptor, VisualWorkflow, WorkflowPackage, WorkflowRunRequest, WorkflowValidation } from "./graph-types";

function unwrapList<T>(value: T[] | { items?: T[]; workflows?: T[]; nodeTypes?: T[] }): T[] {
  if (Array.isArray(value)) return value;
  return value.items ?? value.workflows ?? value.nodeTypes ?? [];
}

export async function listNodeTypes() {
  return unwrapList(await api<NodeTypeDescriptor[] | { items?: NodeTypeDescriptor[]; nodeTypes?: NodeTypeDescriptor[] }>("/api/v1/node-types"));
}

export async function listVisualWorkflows() {
  return unwrapList(await api<VisualWorkflow[] | { items?: VisualWorkflow[]; workflows?: VisualWorkflow[] }>("/api/v1/workflows"));
}

export async function listWorkflowPackages() {
  return unwrapList(await api<WorkflowPackage[] | { items?: WorkflowPackage[] }>("/api/v1/workflow-packages"));
}

export async function instantiateWorkflowPackage(packageId: string, name?: string) {
  return api<VisualWorkflow>(`/api/v1/workflow-packages/${encodeURIComponent(packageId)}/instantiate`, { method: "POST", body: JSON.stringify(name ? { name } : {}) });
}

export async function createVisualWorkflow(input: { name: string; description?: string }) {
  return api<VisualWorkflow>("/api/v1/workflows", { method: "POST", body: JSON.stringify(input) });
}

export async function getVisualWorkflow(id: string) {
  return api<VisualWorkflow>(`/api/v1/workflows/${encodeURIComponent(id)}`);
}

export async function patchVisualWorkflow(workflow: VisualWorkflow) {
  return api<VisualWorkflow>(`/api/v1/workflows/${encodeURIComponent(workflow.id)}`, {
    method: "PATCH",
    headers: { "if-match": String(workflow.revision) },
    body: JSON.stringify({
      expectedRevision: workflow.revision,
      name: workflow.name,
      description: workflow.description,
      profile: workflow.profile,
      durationFrames: workflow.durationFrames,
      nodes: workflow.nodes,
      edges: workflow.edges
    })
  });
}

export async function cloneVisualWorkflow(id: string) {
  return api<VisualWorkflow>(`/api/v1/workflows/${encodeURIComponent(id)}/clone`, { method: "POST", body: "{}" });
}

export async function validateVisualWorkflow(id: string) {
  return api<WorkflowValidation>(`/api/v1/workflows/${encodeURIComponent(id)}/validate`, { method: "POST", body: "{}" });
}

export async function publishVisualWorkflow(id: string) {
  return api<VisualWorkflow>(`/api/v1/workflows/${encodeURIComponent(id)}/publish`, { method: "POST", body: "{}" });
}

export async function deleteVisualWorkflow(id: string) {
  return api<{ ok: boolean; id: string }>(`/api/v1/workflows/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function runVisualWorkflow(id: string, request: WorkflowRunRequest, idempotencyKey = `graph-run-${crypto.randomUUID()}`) {
  return api<{ runId: string; monitorUrl?: string }>(`/api/v1/workflows/${encodeURIComponent(id)}/runs`, {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey },
    body: JSON.stringify(request)
  });
}

export async function importWorkflowMedia(file: File) {
  const body = new FormData();
  body.append("file", file);
  return api<{ assetId: string; projectPath: string; originalName: string; mimeType: string }>("/api/v1/media/import", { method: "POST", body });
}
