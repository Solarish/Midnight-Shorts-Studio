import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { createBroker, createPremiereJob } from "../src/adapters/premiere.js";

test("Premiere job generation changes when input content changes at the same path", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ava-premiere-identity-"));
  const media = path.join(root, "master.mov");
  await writeFile(media, "first-content");
  const context = {
    runDir: root,
    step: { id: "premiere_assembly" },
    dryRun: false,
    resolvePath: (value) => path.resolve(root, value),
    resolveRunPath: (value) => path.resolve(root, value)
  };
  const first = await createPremiereJob({ outputProject: "final.prproj", media: ["master.mov"] }, context);
  await writeFile(media, "second-content");
  const second = await createPremiereJob({ outputProject: "final.prproj", media: ["master.mov"] }, context);
  assert.notEqual(first.generation, second.generation);
  assert.notEqual(first.contentIdentity[0].sha256, second.contentIdentity[0].sha256);
  await rm(root, { recursive: true, force: true });
});

test("Premiere bridge serves one job and accepts only its matching result", async () => {
  const job = { protocolVersion: 1, id: "bridge-test-job", generation: "gen-1", type: "premiere.assemble", media: [] };
  const broker = await createBroker("127.0.0.1", 0, job);

  try {
    const healthResponse = await fetch(`${broker.url}/health`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), { ok: true, pendingJobId: job.id });

    const jobResponse = await fetch(`${broker.url}/job`);
    assert.equal(jobResponse.status, 200);
    assert.deepEqual(await jobResponse.json(), job);

    const mismatchResponse = await fetch(`${broker.url}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ protocolVersion: 1, jobId: "wrong-job", generation: job.generation, ok: true, outputs: {} })
    });
    assert.equal(mismatchResponse.status, 409);

    const pendingResult = broker.waitForResult(1_000);
    const acceptedResponse = await fetch(`${broker.url}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ protocolVersion: 1, jobId: job.id, generation: job.generation, ok: true, outputs: { project: "/tmp/final.prproj" } })
    });
    assert.equal(acceptedResponse.status, 200);
    assert.deepEqual(await pendingResult, {
      protocolVersion: 1,
      jobId: job.id,
      generation: job.generation,
      ok: true,
      outputs: { project: "/tmp/final.prproj" }
    });
  } finally {
    await broker.close();
  }
});

test("Premiere bridge exchanges a job and result through its file mailbox", async () => {
  const mailboxDir = await mkdtemp(path.join(os.tmpdir(), "ava-premiere-test-"));
  const job = { protocolVersion: 1, id: "mailbox-test-job", generation: "gen-1", type: "premiere.assemble", media: [] };
  const broker = await createBroker("127.0.0.1", 0, job, { mailboxDir });

  try {
    assert.deepEqual(
      JSON.parse(await readFile(path.join(mailboxDir, "job.json"), "utf8")),
      job
    );

    const pendingResult = broker.waitForResult(1_000);
    const result = { protocolVersion: 1, jobId: job.id, generation: job.generation, ok: true, outputs: { project: "/tmp/final.prproj" } };
    await writeFile(path.join(mailboxDir, "result.json"), JSON.stringify(result), "utf8");
    assert.deepEqual(await pendingResult, result);
  } finally {
    await broker.close();
    await rm(mailboxDir, { recursive: true, force: true });
  }
});

test("Premiere bridge rejects a stale generation for the matching job id", async () => {
  const job = { protocolVersion: 1, id: "generation-test-job", generation: "current", type: "premiere.assemble", media: [] };
  const broker = await createBroker("127.0.0.1", 0, job);
  try {
    const stale = await fetch(`${broker.url}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ protocolVersion: 1, jobId: job.id, generation: "stale", ok: true, outputs: {} })
    });
    assert.equal(stale.status, 409);
    const pending = broker.waitForResult(1_000);
    const result = { protocolVersion: 1, jobId: job.id, generation: job.generation, ok: true, outputs: {} };
    const accepted = await fetch(`${broker.url}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result)
    });
    assert.equal(accepted.status, 200);
    assert.deepEqual(await pending, result);
  } finally {
    await broker.close();
  }
});

test("Premiere bridge rejects malformed matching results and never enables wildcard CORS", async () => {
  const job = { protocolVersion: 1, id: "protocol-test-job", generation: "current", type: "premiere.assemble", media: [] };
  const broker = await createBroker("127.0.0.1", 0, job);
  try {
    const response = await fetch(`${broker.url}/result`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://example.invalid" },
      body: JSON.stringify({ protocolVersion: 1, jobId: job.id, generation: job.generation, ok: "yes" })
    });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  } finally {
    await broker.close();
  }
});

test("Premiere bridge never publishes a mailbox job when its loopback port cannot bind", async () => {
  const mailboxDir = await mkdtemp(path.join(os.tmpdir(), "ava-premiere-bind-test-"));
  const blocker = createServer();
  await new Promise((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const address = blocker.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const job = { protocolVersion: 1, id: "bind-failure-job", generation: "gen-1", type: "premiere.assemble", media: [] };
  try {
    await assert.rejects(createBroker("127.0.0.1", port, job, { mailboxDir }), /EADDRINUSE|address already in use/i);
    await assert.rejects(access(path.join(mailboxDir, "job.json")), /ENOENT/);
  } finally {
    await new Promise((resolve) => blocker.close(() => resolve()));
    await rm(mailboxDir, { recursive: true, force: true });
  }
});
