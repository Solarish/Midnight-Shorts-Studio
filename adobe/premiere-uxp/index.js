const { entrypoints } = require("uxp");
const ppro = require("premierepro");
const fs = require("fs");
const { assemblePremiereJob, executePremiereJob } = globalThis.AvaPremiereAssembly;

const BRIDGE = "http://127.0.0.1:47652";
const MAILBOX_JOB = "/tmp/psu-ava-premiere-bridge/job.json";
const MAILBOX_RESULT = "/tmp/psu-ava-premiere-bridge/result.json";
const MAILBOX_ROOT = "/tmp/psu-ava-premiere-bridge";
const HEARTBEAT = `${MAILBOX_ROOT}/plugin-heartbeat.json`;
let connected = false;
let busy = false;
let timer;
let heartbeatTimer;
let heartbeatWriting = false;
let lastCompletedJobKey;
let lastProcessedJobKey;
let pendingResult;

entrypoints.setup({
  plugin: {
    create() {
      console.log("[PSU AVA] plugin loaded; starting bridge poller");
      connected = true;
      startHeartbeat();
      schedulePoll(0);
    },
    destroy() { stopPolling(); }
  },
  panels: {
    avaBridge: {
      show() {
        const toggle = document.getElementById("toggle");
        toggle.onclick = toggleConnection;
        toggle.textContent = connected ? "Disconnect" : "Connect";
        setStatus(connected ? "Waiting for CLI job…" : "Disconnected", connected ? "ok" : "idle");
        if (connected) {
          startHeartbeat();
          schedulePoll(0);
        }
      },
      hide() {},
      destroy() {}
    }
  }
});

function toggleConnection() {
  connected = !connected;
  document.getElementById("toggle").textContent = connected ? "Disconnect" : "Connect";
  if (connected) {
    setStatus("Waiting for CLI job…", "ok");
    startHeartbeat();
    schedulePoll(0);
  } else {
    stopPolling();
    setStatus("Disconnected", "idle");
  }
}

function schedulePoll(delay) {
  clearTimeout(timer);
  if (connected) timer = setTimeout(poll, delay);
}

function stopPolling() {
  connected = false;
  clearTimeout(timer);
  clearInterval(heartbeatTimer);
  if (typeof fs.unlink === "function") fs.unlink(HEARTBEAT).catch(() => {});
}

function startHeartbeat() {
  clearInterval(heartbeatTimer);
  pulseHeartbeat();
  heartbeatTimer = setInterval(pulseHeartbeat, 1000);
}

async function pulseHeartbeat() {
  if (!connected || heartbeatWriting) return;
  heartbeatWriting = true;
  try { await writeHeartbeat(); }
  finally { heartbeatWriting = false; }
}

async function poll() {
  if (!connected || busy) return schedulePoll(1000);
  try {
    await pulseHeartbeat();
    const job = await receiveJob();
    if (pendingResult) {
      if (resultKey(pendingResult) === jobKey(job)) {
        await reportPendingResult();
        return;
      }
      appendLog(`Pending result ${resultKey(pendingResult)} is no longer the active mailbox job`);
      pendingResult = undefined;
    }
    if (job.id) {
      if (job.protocolVersion !== 1 || !job.generation) {
        appendLog(`Rejected unsafe legacy job ${job.id}: protocolVersion 1 and generation are required`);
        setStatus("Rejected unsafe legacy job", "error");
        return;
      }
      const recovered = await recoverJob(job);
      const key = jobKey(job);
      if (recovered) {
        pendingResult = recovered;
        lastProcessedJobKey = key;
        await reportPendingResult();
      } else if (key !== lastProcessedJobKey && key !== lastCompletedJobKey) {
        await executeAndReport(job);
      } else setStatus("Connected — waiting", "ok");
    }
    else setStatus("Connected — waiting", "ok");
  } catch (error) {
    console.log(`[PSU AVA] waiting for CLI job: ${error.message}`);
    setStatus(pendingResult ? "Result ready — bridge unavailable" : "CLI bridge unavailable", "idle");
  } finally {
    schedulePoll(1000);
  }
}

async function writeHeartbeat() {
  try {
    if (typeof fs.mkdir === "function") {
      try {
        await fs.mkdir(MAILBOX_ROOT, { recursive: true });
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
      }
    }
    await fs.writeFile(HEARTBEAT, `${JSON.stringify({ protocolVersion: 1, pluginVersion: "0.4.4", connected: true, capabilities: ["timeline.build", "sequence.export", "staged.receipts"], pid: typeof process !== "undefined" ? process.pid : undefined, at: new Date().toISOString() }, null, 2)}\n`, { encoding: "utf-8" });
  } catch (error) {
    console.log(`[PSU AVA] heartbeat unavailable: ${error.message}`);
  }
}

function isAlreadyExists(error) {
  return error && (error.code === "EEXIST" || /already exists/i.test(error.message || ""));
}

async function executeAndReport(job) {
  busy = true;
  setStatus(`Running ${job.id}`, "ok");
  appendLog(`Received ${job.type}: ${job.id}`);
  let result;
  let mutationStarted = false;
  try {
    const capabilityError = premiereCapabilityError(job, globalThis.AvaPremiereHostCapabilities);
    if (capabilityError) throw new Error(capabilityError);
    await writeReceipt("started", job, { stage: "host-mutation-pending" });
    mutationStarted = true;
    const hostCapabilities = withDurableStageReceipts(globalThis.AvaPremiereHostCapabilities);
    const outputs = executePremiereJob
      ? await executePremiereJob(ppro, job, appendLog, hostCapabilities)
      : await assemblePremiereJob(ppro, job, appendLog);
    result = { protocolVersion: 1, jobId: job.id, generation: job.generation, ok: true, outputs };
    setStatus("Assembly complete — reporting", "ok");
  } catch (error) {
    const message = errorMessage(error);
    result = { protocolVersion: 1, jobId: job.id, generation: job.generation, ok: false, error: message, stack: error && error.stack };
    setStatus(`Failed: ${message}`, "error");
  }
  if (mutationStarted) {
    try {
      await writeReceipt("completed", job, result);
    } catch (receiptError) {
      result.receiptWarning = receiptError.message;
      appendLog(`Could not persist completion receipt: ${receiptError.message}`);
    }
  }
  pendingResult = result;
  lastProcessedJobKey = jobKey(job);
  try {
    await reportPendingResult();
  } finally {
    busy = false;
  }
}

function errorMessage(error) {
  if (typeof error === "string" && error) return error;
  if (error && typeof error.message === "string" && error.message) return error.message;
  const details = [];
  if (error && error.name) details.push(`name=${error.name}`);
  if (error && error.code) details.push(`code=${error.code}`);
  if (error && error.description) details.push(`description=${error.description}`);
  if (details.length > 0) return details.join(", ");
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") return serialized;
  } catch (_) {}
  return "Unknown Premiere host error";
}

function premiereCapabilityError(job, capabilities) {
  if (job.type === "premiere.assemble") return undefined;
  if (job.type !== "premiere.build" && job.type !== "premiere.export") return `Unsupported Premiere job type '${job.type}'`;
  if (!capabilities || typeof capabilities.exportSequence !== "function") {
    return "Premiere export host capability is not installed for this Premiere 25.6 build";
  }
  if (job.type === "premiere.build" && typeof capabilities.buildTimeline !== "function") {
    return "Premiere TimelineSpec build capability is not installed for this Premiere 25.6 build";
  }
  return undefined;
}

async function recoverJob(job) {
  try {
    const completed = JSON.parse(await fs.readFile(receiptPath("completed", job.id), { encoding: "utf-8" }));
    if (completed.jobId === job.id && completed.generation === job.generation) {
      if (completed.ok !== false || (job.type !== "premiere.build" && job.type !== "premiere.export")) {
        appendLog(`Recovered completed job ${job.id}; reporting without reassembly`);
        return completed;
      }
      // A failed top-level result does not prove the staged Adobe mutation is
      // incomplete. Let build/export stage receipts decide whether to recover
      // a completed stage or stop on an ambiguous started stage.
      appendLog(`Retrying staged ${job.type} wrapper after failed result ${job.id}`);
    }
  } catch (_) {}
  try {
    const started = JSON.parse(await fs.readFile(receiptPath("started", job.id), { encoding: "utf-8" }));
    if (started.jobId === job.id && started.generation === job.generation) {
      if (job.type === "premiere.build" || job.type === "premiere.export") {
        appendLog(`Recovering staged ${job.type} job ${job.id}`);
        return undefined;
      }
      appendLog(`Recovered ambiguous job ${job.id}; refusing automatic reassembly`);
      return {
        protocolVersion: 1,
        jobId: job.id,
        generation: job.generation,
        ok: false,
        ambiguous: true,
        error: "Premiere restarted after this job began. Inspect the output project before retrying."
      };
    }
  } catch (_) {}
  return undefined;
}

function withDurableStageReceipts(capabilities) {
  if (!capabilities || typeof capabilities !== "object") return capabilities;
  return Object.assign({}, capabilities, {
    recoverBuild: async function (job) {
      return recoverStage(job, "build", undefined, "target");
    },
    startBuild: async function (job) {
      await writeStageReceipt("started", job, "build", undefined, {});
    },
    completeBuild: async function (job, target) {
      await writeStageReceipt("completed", job, "build", undefined, { target: target });
    },
    recoverExport: async function (job, request) {
      return recoverStage(job, "export", request, "receipt");
    },
    startExport: async function (job, request) {
      await writeStageReceipt("started", job, "export", request, { request: request });
    },
    completeExport: async function (job, request, receipt) {
      try {
        const started = JSON.parse(await fs.readFile(stageReceiptPath("started", job, "export", request), { encoding: "utf-8" }));
        if (stageReceiptMatches(started, job, "export", request)) receipt.startedAt = receipt.startedAt || started.at;
      } catch (_) {}
      receipt.finishedAt = receipt.finishedAt || receipt.completedAt || new Date().toISOString();
      await writeStageReceipt("completed", job, "export", request, { request: request, receipt: receipt });
    }
  });
}

async function recoverStage(job, stage, request, valueKey) {
  const completedPath = stageReceiptPath("completed", job, stage, request);
  try {
    const completed = JSON.parse(await fs.readFile(completedPath, { encoding: "utf-8" }));
    if (stageReceiptMatches(completed, job, stage, request)) {
      appendLog(`Recovered completed Premiere ${stage}${request ? ` ${request.format}` : ""}`);
      return completed[valueKey];
    }
  } catch (_) {}
  try {
    const started = JSON.parse(await fs.readFile(stageReceiptPath("started", job, stage, request), { encoding: "utf-8" }));
    if (stageReceiptMatches(started, job, stage, request)) {
      throw new Error(`Premiere ${stage}${request ? ` ${request.format}` : ""} has an ambiguous started receipt. Inspect its output before retrying.`);
    }
  } catch (error) {
    if (error && /ambiguous started receipt/.test(error.message || "")) throw error;
  }
  return undefined;
}

function stageReceiptMatches(receipt, job, stage, request) {
  return receipt && receipt.protocolVersion === 1 && receipt.jobId === job.id && receipt.generation === job.generation &&
    receipt.stage === stage && (!request || (receipt.format === request.format && receipt.output === request.output));
}

async function writeStageReceipt(kind, job, stage, request, value) {
  const receipt = {
    protocolVersion: 1,
    jobId: job.id,
    generation: job.generation,
    stage: stage,
    format: request && request.format,
    output: request && request.output,
    at: new Date().toISOString(),
    ...value
  };
  await fs.writeFile(stageReceiptPath(kind, job, stage, request), `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf-8" });
}

function stageReceiptPath(kind, job, stage, request) {
  if (!/^[A-Za-z0-9-]+$/.test(job.id)) throw new Error("Unsafe Premiere bridge job id");
  const suffix = request ? `-${request.format}` : "";
  return `${MAILBOX_ROOT}/${stage}-${kind}-${job.id}${suffix}.json`;
}

async function writeReceipt(kind, job, value) {
  const receipt = kind === "started"
    ? { protocolVersion: 1, jobId: job.id, generation: job.generation, at: new Date().toISOString(), ...value }
    : value;
  await fs.writeFile(receiptPath(kind, job.id), `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf-8" });
}

function receiptPath(kind, jobId) {
  if (!/^[A-Za-z0-9-]+$/.test(jobId)) throw new Error("Unsafe Premiere bridge job id");
  return `${MAILBOX_ROOT}/${kind}-${jobId}.json`;
}

async function reportPendingResult() {
  if (!pendingResult) return;
  try {
    const response = await fetch(`${BRIDGE}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pendingResult)
    });
    if (response.status === 409) {
      appendLog(`Bridge rejected stale result ${resultKey(pendingResult)} with HTTP 409`);
      setStatus("Result rejected — waiting for matching job", "error");
      return;
    }
    if (!response.ok) throw new Error(`Bridge unavailable with HTTP ${response.status}`);
    const accepted = await response.json();
    if (!accepted.accepted) {
      appendLog(`Bridge did not acknowledge result ${resultKey(pendingResult)}`);
      setStatus("Result unacknowledged — retrying", "idle");
      return;
    }
  } catch (httpError) {
    await fs.writeFile(MAILBOX_RESULT, `${JSON.stringify(pendingResult, null, 2)}\n`, { encoding: "utf-8" });
    console.log(`[PSU AVA] published through file mailbox after HTTP failure: ${httpError.message}`);
    appendLog(`Published result ${resultKey(pendingResult)} to mailbox; awaiting acknowledgement`);
    setStatus("Result published — awaiting acknowledgement", "idle");
    return;
  }
  lastCompletedJobKey = resultKey(pendingResult);
  appendLog(`Reported ${pendingResult.ok ? "success" : "failure"}: ${pendingResult.jobId}`);
  setStatus(pendingResult.ok ? "Job complete" : "Failure reported", pendingResult.ok ? "ok" : "error");
  pendingResult = undefined;
}

function jobKey(job) {
  return `${job.id || ""}:${job.generation || ""}`;
}

function resultKey(result) {
  return `${result.jobId || ""}:${result.generation || ""}`;
}

async function receiveJob() {
  try {
    const response = await fetch(`${BRIDGE}/job`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Bridge HTTP ${response.status}`);
    return response.json();
  } catch (httpError) {
    const content = await fs.readFile(MAILBOX_JOB, { encoding: "utf-8" });
    console.log(`[PSU AVA] received job through file mailbox after HTTP failure: ${httpError.message}`);
    return JSON.parse(content);
  }
}

function setStatus(message, kind) {
  const element = document.getElementById("status");
  if (!element) return;
  element.textContent = message;
  element.dataset.kind = kind;
}

function appendLog(message) {
  const element = document.getElementById("log");
  if (!element) return;
  element.textContent = `${new Date().toLocaleTimeString()} ${message}\n${element.textContent}`;
}
