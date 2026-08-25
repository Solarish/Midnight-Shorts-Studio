const { entrypoints } = require("uxp");
const ppro = require("premierepro");
const fs = require("fs");
const { assemblePremiereJob } = globalThis.AvaPremiereAssembly;

const BRIDGE = "http://127.0.0.1:47652";
const MAILBOX_JOB = "/tmp/psu-ava-premiere-bridge/job.json";
const MAILBOX_RESULT = "/tmp/psu-ava-premiere-bridge/result.json";
let connected = false;
let busy = false;
let timer;
let lastCompletedJobId;
let lastProcessedJobId;
let pendingResult;

entrypoints.setup({
  plugin: {
    create() {
      console.log("[PSU AVA] plugin loaded; starting bridge poller");
      connected = true;
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
        if (connected) schedulePoll(0);
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
    const job = await receiveJob();
    if (job.id && job.id !== lastProcessedJobId && job.id !== lastCompletedJobId) await executeAndReport(job);
    else setStatus("Connected — waiting", "ok");
  } catch (error) {
    console.log(`[PSU AVA] waiting for CLI job: ${error.message}`);
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
  try {
    const response = await fetch(`${BRIDGE}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pendingResult)
    });
    if (!response.ok) throw new Error(`Bridge rejected result with HTTP ${response.status}`);
    const accepted = await response.json();
    if (!accepted.accepted) throw new Error("Bridge did not accept the result");
  } catch (httpError) {
    await fs.writeFile(MAILBOX_RESULT, `${JSON.stringify(pendingResult, null, 2)}\n`, { encoding: "utf-8" });
    console.log(`[PSU AVA] reported through file mailbox after HTTP failure: ${httpError.message}`);
  }
  lastCompletedJobId = pendingResult.jobId;
  appendLog(`Reported ${pendingResult.ok ? "success" : "failure"}: ${pendingResult.jobId}`);
  setStatus(pendingResult.ok ? "Job complete" : "Failure reported", pendingResult.ok ? "ok" : "error");
  pendingResult = undefined;
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
