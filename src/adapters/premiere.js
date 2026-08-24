import http from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { runProcess } from "../core/process.js";

export async function assemblePremiere(input, context) {
  const config = context.settings.adobe.premiere;
  const host = config.bridgeHost ?? "127.0.0.1";
  const port = Number(config.bridgePort ?? 47652);
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error("Premiere bridge must bind to loopback only");
  }

  const job = {
    id: randomUUID(),
    type: "premiere.assemble",
    templateProject: optionalPath(input.templateProject, context, "config"),
    outputProject: optionalPath(input.outputProject, context, "run"),
    sequenceName: input.sequenceName ?? "AUTO_ASSEMBLY",
    media: (input.media ?? []).map((value) => optionalPath(value, context, "config")),
    aeComps: (input.aeComps ?? []).map((entry) => ({
      project: optionalPath(entry.project, context, "config"),
      compositions: entry.compositions ?? []
    })),
    createSequence: input.createSequence ?? true,
    save: input.save ?? true
  };

  if (context.dryRun) {
    return { jobId: job.id, bridge: `http://${host}:${port}`, job, dryRun: true };
  }

  if (job.outputProject) await mkdir(path.dirname(job.outputProject), { recursive: true });

  const broker = await createBroker(host, port, job);
  try {
    if (config.launch && process.platform === "darwin") {
      await runProcess("open", ["-a", config.applicationName], { timeoutMs: 30_000 });
    }
    context.log(`Premiere bridge waiting at ${broker.url}`);
    const result = await broker.waitForResult(context.timeoutMs);
    if (!result.ok) throw new Error(result.error ?? "Premiere UXP job failed");
    return { jobId: job.id, ...result.outputs };
  } finally {
    await broker.close();
  }
}

function optionalPath(value, context, preference) {
  if (!value) return undefined;
  if (path.isAbsolute(value)) return value;
  if (preference === "run" || value.startsWith("outputs/")) return context.resolveRunPath(value);
  return context.resolvePath(value);
}

export async function createBroker(host, port, job) {
  let resolveResult;
  let rejectResult;
  const resultPromise = new Promise((resolvePromise, rejectPromise) => {
    resolveResult = resolvePromise;
    rejectResult = rejectPromise;
  });

  const server = http.createServer(async (request, response) => {
    setCors(response);
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    if (request.method === "GET" && request.url === "/health") {
      json(response, 200, { ok: true, pendingJobId: job.id });
      return;
    }
    if (request.method === "GET" && request.url === "/job") {
      json(response, 200, job);
      return;
    }
    if (request.method === "POST" && request.url === "/result") {
      try {
        const result = JSON.parse(await readBody(request));
        if (result.jobId !== job.id) {
          json(response, 409, { error: "jobId mismatch" });
          return;
        }
        resolveResult(result);
        json(response, 200, { accepted: true });
      } catch (error) {
        json(response, 400, { error: error.message });
      }
      return;
    }
    json(response, 404, { error: "not found" });
  });

  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(port, host, resolvePromise);
  });
  const address = server.address();
  const activePort = typeof address === "object" && address ? address.port : port;

  return {
    url: `http://${host}:${activePort}`,
    waitForResult(timeoutMs) {
      const timer = setTimeout(() => rejectResult(new Error(
        `Premiere bridge timed out after ${timeoutMs}ms. Open the PSU AVA Bridge panel and click Connect.`
      )), timeoutMs);
      return resultPromise.finally(() => clearTimeout(timer));
    },
    close() {
      return new Promise((resolvePromise, rejectPromise) => {
        server.close((error) => error ? rejectPromise(error) : resolvePromise());
      });
    }
  };
}

function readBody(request) {
  return new Promise((resolvePromise, rejectPromise) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) request.destroy(new Error("request body too large"));
    });
    request.on("end", () => resolvePromise(body));
    request.on("error", rejectPromise);
  });
}

function setCors(response) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function json(response, status, value) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}
