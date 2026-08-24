const { entrypoints } = require("uxp");
const ppro = require("premierepro");
const { assemblePremiereJob } = globalThis.AvaPremiereAssembly;

const BRIDGE = "http://127.0.0.1:47652";
let connected = false;
let busy = false;
let timer;
let lastCompletedJobId;
let lastProcessedJobId;
let pendingResult;

entrypoints.setup({
  panels: {
    avaBridge: {
      show() {
        document.getElementById("toggle").onclick = toggleConnection;
        setStatus("Disconnected", "idle");
      },
      hide() {},
      destroy() { stopPolling(); }
    }
  }
});

function toggleConnection() {
  connected = !connected;
  document.getElementById("toggle").textContent = connected ? "Disconnect" : "Connect";
  if (connected) {
    setStatus("Waiting for CLI job…", "ok");
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
}

async function poll() {
  if (!connected || busy) return schedulePoll(1000);
  try {
    if (pendingResult) {
      await reportPendingResult();
      return;
    }
    const response = await fetch(`${BRIDGE}/job`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Bridge HTTP ${response.status}`);
    const job = await response.json();
    if (job.id && job.id !== lastProcessedJobId && job.id !== lastCompletedJobId) await executeAndReport(job);
    else setStatus("Connected — waiting", "ok");
  } catch (error) {
    setStatus(pendingResult ? "Result ready — bridge unavailable" : "CLI bridge unavailable", "idle");
  } finally {
    schedulePoll(1000);
  }
}

async function executeAndReport(job) {
  busy = true;
  setStatus(`Running ${job.id}`, "ok");
  appendLog(`Received ${job.type}: ${job.id}`);
  let result;
  try {
    const outputs = await assemblePremiereJob(ppro, job, appendLog);
    result = { jobId: job.id, ok: true, outputs };
    setStatus("Assembly complete — reporting", "ok");
  } catch (error) {
    result = { jobId: job.id, ok: false, error: error.message, stack: error.stack };
    setStatus(`Failed: ${error.message}`, "error");
  }
  pendingResult = result;
  lastProcessedJobId = job.id;
  try {
    await reportPendingResult();
  } finally {
    busy = false;
  }
}

async function reportPendingResult() {
  if (!pendingResult) return;
  const response = await fetch(`${BRIDGE}/result`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(pendingResult)
  });
  if (!response.ok) throw new Error(`Bridge rejected result with HTTP ${response.status}`);
  const accepted = await response.json();
  if (!accepted.accepted) throw new Error("Bridge did not accept the result");
  lastCompletedJobId = pendingResult.jobId;
  appendLog(`Reported ${pendingResult.ok ? "success" : "failure"}: ${pendingResult.jobId}`);
  setStatus(pendingResult.ok ? "Job complete" : "Failure reported", pendingResult.ok ? "ok" : "error");
  pendingResult = undefined;
}

function setStatus(message, kind) {
  const element = document.getElementById("status");
  element.textContent = message;
  element.dataset.kind = kind;
}

function appendLog(message) {
  const element = document.getElementById("log");
  element.textContent = `${new Date().toLocaleTimeString()} ${message}\n${element.textContent}`;
}
