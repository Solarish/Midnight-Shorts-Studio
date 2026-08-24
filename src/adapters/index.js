import { selectAsset, templatePayload } from "./builtin.js";
import { runLlmChat } from "./llm.js";
import { runComfyWorkflow } from "./comfyui.js";
import { removeBackground } from "./image.js";
import { bindAfterEffectsTemplate, renderAfterEffects } from "./after-effects.js";
import { assemblePremiere } from "./premiere.js";

export const adapters = {
  "asset.select": selectAsset,
  "template.payload": templatePayload,
  "llm.chat": runLlmChat,
  "comfyui.workflow": runComfyWorkflow,
  "image.removeBackground": removeBackground,
  "ae.template": bindAfterEffectsTemplate,
  "ae.render": renderAfterEffects,
  "premiere.assemble": assemblePremiere
};
