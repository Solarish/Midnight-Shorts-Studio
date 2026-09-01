import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  acquireInstanceLock,
  acquireResourceLock,
  inspectLock,
  releaseStaleResourceLock
} from "../src/core/resource-lock.js";

test("resource lock excludes concurrent owners and releases only its token", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-resource-lock-"));
  const lockPath = path.join(root, "resource.json");
  const lease = await acquireResourceLock({ lockPath, owner: { runId: "first" } });
  await assert.rejects(
    acquireResourceLock({ lockPath, owner: { runId: "second" } }),
    (error) => error.code === "RESOURCE_LOCK_BUSY" && error.owner.runId === "first"
  );
  assert.equal((await inspectLock(lockPath)).ownerAlive, true);
  assert.equal(await lease.release(), true);
  assert.equal((await inspectLock(lockPath)).exists, false);
  await rm(root, { recursive: true, force: true });
});

test("instance locks recover a dead owner but resource unlock requires operator confirmation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-instance-lock-"));
  const instancePath = path.join(root, "instance.json");
  const resourcePath = path.join(root, "resource.json");
  const dead = { schemaVersion: 1, token: "dead", pid: 99999999, runId: "ambiguous" };
  await writeFile(instancePath, JSON.stringify(dead));
  const instance = await acquireInstanceLock(instancePath);
  assert.equal(instance.owner.pid, process.pid);
  await instance.release();

  await writeFile(resourcePath, JSON.stringify(dead));
  await assert.rejects(releaseStaleResourceLock(undefined, resourcePath), /confirm-inspected-adobe/);
  assert.equal((await releaseStaleResourceLock("inspected-adobe", resourcePath)).released, true);
  await rm(root, { recursive: true, force: true });
});
