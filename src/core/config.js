import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020Import from "ajv/dist/2020.js";

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const Ajv2020 = Ajv2020Import.default ?? Ajv2020Import;
const workflowSchema = JSON.parse(await readFile(new URL("../../schema/workflow.schema.json", import.meta.url), "utf8"));
const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile(workflowSchema);

export async function loadWorkflow(configPath) {
  const absolutePath = path.resolve(configPath);
  const raw = await readFile(absolutePath, "utf8");
  return loadWorkflowText(raw, { configPath: absolutePath, configDir: path.dirname(absolutePath) });
}

export function loadWorkflowText(raw, options = {}) {
  const absolutePath = path.resolve(options.configPath ?? "workflow.json");
  let workflow;

  try {
    workflow = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${absolutePath}: ${error.message}`);
  }

  const errors = validateWorkflow(workflow);
  if (errors.length > 0) {
    throw new Error(`Workflow validation failed:\n- ${errors.join("\n- ")}`);
  }

  return {
    configPath: absolutePath,
    configDir: path.resolve(options.configDir ?? path.dirname(absolutePath)),
    raw,
    workflow: applyDefaults(workflow)
  };
}

export function validateWorkflow(workflow) {
  const errors = [];

  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    return ["root must be a JSON object"];
  }
  if (!validateSchema(workflow)) {
    errors.push(...(validateSchema.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? error.keyword}`));
  }
  if (!Array.isArray(workflow.steps)) return errors;

  const ids = new Set();
  for (const [index, step] of workflow.steps.entries()) {
    const label = `steps[${index}]`;
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    if (typeof step.id === "string" && ids.has(step.id)) {
      errors.push(`${label}.id duplicates '${step.id}'`);
    } else if (typeof step.id === "string" && ID_PATTERN.test(step.id)) {
      ids.add(step.id);
    }
  }

  return errors;
}

function applyDefaults(workflow) {
  const settings = workflow.settings ?? {};
  return {
    ...workflow,
    variables: workflow.variables ?? {},
    settings: {
      runRoot: settings.runRoot ?? ".pipeline-runs",
      stepTimeoutMs: settings.stepTimeoutMs ?? 15 * 60 * 1000,
      retryAttempts: settings.retryAttempts ?? 1,
      pollIntervalMs: settings.pollIntervalMs ?? 1500,
      services: {
        comfyui: {
          baseUrl: "http://10.135.66.70:8188",
          clientId: "psu-ava-cli",
          ...(settings.services?.comfyui ?? {})
        },
        llm: {
          provider: "ollama",
          baseUrl: "http://10.135.66.70:11434",
          model: "gemma4:12b",
          ...(settings.services?.llm ?? {})
        },
        jaitts: {
          baseUrl: "http://10.135.66.70:7861",
          ...(settings.services?.jaitts ?? {})
        }
      },
      adobe: {
        afterEffects: {
          applicationId: "com.adobe.AfterEffects.application",
          aerenderPath: "/Applications/Adobe After Effects 2026/aerender",
          ...(settings.adobe?.afterEffects ?? {})
        },
        premiere: {
          applicationName: "Adobe Premiere Pro (Beta)",
          requiredVersion: "26.5.0",
          bridgeHost: "127.0.0.1",
          bridgePort: 47652,
          bridgeMailbox: "/tmp/psu-ava-premiere-bridge",
          launch: true,
          ...(settings.adobe?.premiere ?? {})
        }
      }
    },
    steps: workflow.steps.map((step) => ({ enabled: true, with: {}, ...step }))
  };
}
