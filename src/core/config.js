import { readFile } from "node:fs/promises";
import path from "node:path";

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export async function loadWorkflow(configPath) {
  const absolutePath = path.resolve(configPath);
  const raw = await readFile(absolutePath, "utf8");
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
    configDir: path.dirname(absolutePath),
    raw,
    workflow: applyDefaults(workflow)
  };
}

export function validateWorkflow(workflow) {
  const errors = [];

  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    return ["root must be a JSON object"];
  }
  if (workflow.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (typeof workflow.id !== "string" || !ID_PATTERN.test(workflow.id)) {
    errors.push("id must contain only letters, numbers, underscore, or hyphen");
  }
  if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    errors.push("steps must be a non-empty array");
    return errors;
  }

  const ids = new Set();
  for (const [index, step] of workflow.steps.entries()) {
    const label = `steps[${index}]`;
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    if (typeof step.id !== "string" || !ID_PATTERN.test(step.id)) {
      errors.push(`${label}.id is invalid`);
    } else if (ids.has(step.id)) {
      errors.push(`${label}.id duplicates '${step.id}'`);
    } else {
      ids.add(step.id);
    }
    if (typeof step.type !== "string" || step.type.length === 0) {
      errors.push(`${label}.type is required`);
    }
    if (step.with !== undefined && (!step.with || typeof step.with !== "object" || Array.isArray(step.with))) {
      errors.push(`${label}.with must be an object`);
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
        }
      },
      adobe: {
        afterEffects: {
          applicationId: "com.adobe.AfterEffects.application",
          aerenderPath: "/Applications/Adobe After Effects 2026/aerender",
          ...(settings.adobe?.afterEffects ?? {})
        },
        premiere: {
          applicationName: "Adobe Premiere Pro 2025",
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
