import test from "node:test";
import assert from "node:assert/strict";
import { runLlmChat } from "../src/adapters/llm.js";
import { runComfyWorkflow } from "../src/adapters/comfyui.js";

const context = { dryRun: true, settings: { services: { llm: { provider: "ollama", model: "test" } } } };

test("llm.chat outputLanguage=en fails closed before a Thai prompt can reach Z-Image", async () => {
  await assert.rejects(runLlmChat({ prompt: "ไทย", mockResponse: "ฉากมหาวิทยาลัย", outputLanguage: "en" }, context), /rejected Thai characters/);
  const result = await runLlmChat({ prompt: "ไทย", mockResponse: "cinematic university background", outputLanguage: "en" }, context);
  assert.equal(result.content, "cinematic university background");
  assert.equal(result.outputLanguage, "en");
});

test("comfyui.workflow promptLanguage=en rejects a Thai prompt even when the translation node is bypassed", async () => {
  const comfyContext = {
    dryRun: true,
    settings: { services: { comfyui: { baseUrl: "http://127.0.0.1:8188" } } },
    configDir: process.cwd(),
    stepDir: "/tmp",
    resolvePath: (value) => new URL(`../${value}`, import.meta.url).pathname,
    resolveRunPath: (value) => `/tmp/${value}`
  };
  await assert.rejects(runComfyWorkflow({ workflowFile: "workflows/generate-cover-background-zimage.api.json", promptLanguage: "en", patches: { "6.inputs.text": "ฉากมหาวิทยาลัย" } }, comfyContext), /rejected Thai characters/);
});
