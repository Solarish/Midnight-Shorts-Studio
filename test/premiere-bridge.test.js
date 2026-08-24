import test from "node:test";
import assert from "node:assert/strict";
import { createBroker } from "../src/adapters/premiere.js";

test("Premiere bridge serves one job and accepts only its matching result", async () => {
  const job = { id: "bridge-test-job", type: "premiere.assemble", media: [] };
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
      body: JSON.stringify({ jobId: "wrong-job", ok: true })
    });
    assert.equal(mismatchResponse.status, 409);

    const pendingResult = broker.waitForResult(1_000);
    const acceptedResponse = await fetch(`${broker.url}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: job.id, ok: true, outputs: { project: "/tmp/final.prproj" } })
    });
    assert.equal(acceptedResponse.status, 200);
    assert.deepEqual(await pendingResult, {
      jobId: job.id,
      ok: true,
      outputs: { project: "/tmp/final.prproj" }
    });
  } finally {
    await broker.close();
  }
});
