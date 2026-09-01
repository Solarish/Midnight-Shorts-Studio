export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type ConfigSchema = {
  type?: "object" | "string" | "number" | "integer" | "boolean" | "array";
  title?: string;
  description?: string;
  default?: JsonValue;
  enum?: JsonValue[];
  properties?: Record<string, ConfigSchema>;
  required?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  format?: string;
};

export type NodeTypeDescriptor = {
  type: string;
  label: string;
  category: string;
  description: string;
  lifecycleStage: LifecycleStage;
  version?: string;
  inputs: NodePortDescriptor[];
  outputs: NodePortDescriptor[];
  configSchema: ConfigSchema;
};

export type LifecycleStage = "assets" | "process" | "timeline" | "build" | "export";

export type GraphPortType = "any" | "text" | "json" | "media" | "image" | "video" | "audio" | "after-effects-project" | "premiere-project";

export type NodePortDescriptor = {
  id: string;
  type: GraphPortType;
  required?: boolean;
  multiple?: boolean;
  configKey?: string;
  outputPath?: string;
};

export type WorkflowNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  config: Record<string, JsonValue>;
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
};

export type WorkflowStatus = "draft" | "published" | "archived";
export type WorkflowProfile = "portrait" | "landscape" | "square";

export type VisualWorkflow = {
  id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  revision: number;
  profile: WorkflowProfile;
  durationFrames: number;
  durationSeconds?: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  updatedAt?: string;
  publishedAt?: string;
};

export type WorkflowValidation = {
  valid: boolean;
  errors: Array<{ nodeId?: string; path?: string; message: string }>;
  warnings?: Array<{ nodeId?: string; path?: string; message: string }>;
};

export type WorkflowRunRequest = {
  mode?: "auto" | "dry-run" | "live";
  toNodeId?: string;
  operatorConfirmedAdobeReady?: boolean;
};

export type WorkflowPackage = {
  packageId: string;
  version: number;
  name: string;
  description: string;
  profile: WorkflowProfile;
  durationFrames: number;
  nodeCount: number;
};
