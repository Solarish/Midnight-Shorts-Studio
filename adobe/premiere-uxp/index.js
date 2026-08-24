const { entrypoints } = require("uxp");
const ppro = require("premierepro");

const BRIDGE = "http://127.0.0.1:47652";
let connected = false;
let busy = false;
let timer;
let lastCompletedJobId;

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
    const response = await fetch(`${BRIDGE}/job`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Bridge HTTP ${response.status}`);
    const job = await response.json();
    if (job.id && job.id !== lastCompletedJobId) await executeAndReport(job);
    else setStatus("Connected — waiting", "ok");
  } catch (error) {
    setStatus("CLI bridge unavailable", "idle");
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
    const outputs = await assemble(job);
    result = { jobId: job.id, ok: true, outputs };
    lastCompletedJobId = job.id;
    setStatus("Job complete", "ok");
  } catch (error) {
    result = { jobId: job.id, ok: false, error: error.message, stack: error.stack };
    setStatus(`Failed: ${error.message}`, "error");
  }

  await fetch(`${BRIDGE}/result`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(result)
  });
  busy = false;
}

async function assemble(job) {
  let project;
  if (job.templateProject) {
    project = await ppro.Project.open(job.templateProject, {});
  } else if (job.outputProject) {
    project = await ppro.Project.createProject(job.outputProject);
  } else {
    project = await ppro.Project.getActiveProject();
  }
  if (!project) throw new Error("No Premiere project is available");

  const rootFolder = await project.getRootItem();
  const rootItem = ppro.ProjectItem.cast(rootFolder);

  for (const ae of job.aeComps || []) {
    if (ae.compositions && ae.compositions.length > 0) {
      await project.importAEComps(ae.project, ae.compositions, rootItem);
    } else {
      await project.importAllAEComps(ae.project, rootItem);
    }
  }

  if (job.media && job.media.length > 0) {
    const imported = await project.importFiles(job.media, true, rootItem, false);
    if (!imported) throw new Error("Premiere failed to import one or more media files");
  }

  let sequence;
  if (job.createSequence && job.media && job.media.length > 0) {
    const clips = [];
    for (const mediaPath of job.media) {
      const matches = await ppro.ClipProjectItem.findItemsMatchingMediaPath(mediaPath, false);
      if (!matches || matches.length === 0) throw new Error(`Imported media not found: ${mediaPath}`);
      clips.push(ppro.ClipProjectItem.cast(matches[0]));
    }
    sequence = await project.createSequenceFromMedia(job.sequenceName, clips, rootItem);
    await project.setActiveSequence(sequence);
  }

  if (job.outputProject && project.path !== job.outputProject) await project.saveAs(job.outputProject);
  if (job.save) await project.save();
  return {
    project: job.outputProject || project.path,
    sequenceName: sequence ? job.sequenceName : undefined,
    sequenceGuid: sequence ? sequence.guid : undefined,
    importedMedia: job.media || []
  };
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

