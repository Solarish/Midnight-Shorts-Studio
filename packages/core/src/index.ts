// Compatibility façade: the CLI and Control API share the same verified engine while
// implementation files move into this package incrementally without changing behavior.
// @ts-ignore JavaScript compatibility module
export { loadWorkflow, loadWorkflowText, validateWorkflow } from "../../../src/core/config.js";
// @ts-ignore JavaScript compatibility module
export { runWorkflow } from "../../../src/core/runner.js";
// @ts-ignore JavaScript compatibility module
export { interpolate } from "../../../src/core/interpolate.js";
// @ts-ignore JavaScript compatibility module
export { readState, writeState, workflowDigest, createRunId } from "../../../src/core/state.js";
// @ts-ignore JavaScript compatibility module
export { acquireResourceLock, acquireInstanceLock, inspectLock, releaseStaleResourceLock, ResourceLockBusyError, DEFAULT_RESOURCE_LOCK_PATH } from "../../../src/core/resource-lock.js";
