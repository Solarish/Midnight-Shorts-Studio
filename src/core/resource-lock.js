import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const DEFAULT_RESOURCE_LOCK_PATH = path.join(tmpdir(), "psu-ava-resource-lock.json");

export class ResourceLockBusyError extends Error {
  constructor(lockPath, owner) {
    const detail = owner?.runId
      ? `run '${owner.runId}' (pid ${owner.pid ?? "unknown"})`
      : `pid ${owner?.pid ?? "unknown"}`;
    super(`Shared Adobe/GPU resources are locked by ${detail}. Inspect ${lockPath} before retrying.`);
    this.name = "ResourceLockBusyError";
    this.code = "RESOURCE_LOCK_BUSY";
    this.statusCode = 409;
    this.lockPath = lockPath;
    this.owner = owner;
  }
}

export async function acquireResourceLock(options = {}) {
  return acquireFileLock({
    lockPath: options.lockPath ?? DEFAULT_RESOURCE_LOCK_PATH,
    owner: { kind: "resource", ...options.owner },
    recoverStaleOwner: false
  });
}

export async function acquireInstanceLock(lockPath, owner = {}) {
  return acquireFileLock({
    lockPath,
    owner: { kind: "control-api", ...owner },
    recoverStaleOwner: true
  });
}

export async function inspectLock(lockPath = DEFAULT_RESOURCE_LOCK_PATH) {
  try {
    const owner = JSON.parse(await readFile(lockPath, "utf8"));
    return { exists: true, lockPath, owner, ownerAlive: isProcessAlive(owner.pid) };
  } catch (error) {
    if (error?.code === "ENOENT") return { exists: false, lockPath };
    return { exists: true, lockPath, owner: undefined, ownerAlive: undefined, error: error?.message ?? String(error) };
  }
}

export async function releaseStaleResourceLock(confirmation, lockPath = DEFAULT_RESOURCE_LOCK_PATH) {
  if (confirmation !== "inspected-adobe") {
    throw new Error("Refusing to unlock: pass --confirm-inspected-adobe after checking AE, Premiere, aerender, and ComfyUI.");
  }
  const status = await inspectLock(lockPath);
  if (!status.exists) return { released: false, reason: "not_locked", lockPath };
  if (status.ownerAlive) {
    throw new Error(`Refusing to unlock while owner pid ${status.owner?.pid} is still alive.`);
  }
  await rm(lockPath, { force: true });
  return { released: true, lockPath, previousOwner: status.owner, previousError: status.error };
}

async function acquireFileLock({ lockPath, owner, recoverStaleOwner }) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = randomUUID();
    const record = {
      schemaVersion: 1,
      token,
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
      ...owner
    };
    let handle;
    try {
      handle = await open(lockPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      let released = false;
      return {
        lockPath,
        owner: record,
        async release() {
          if (released) return false;
          released = true;
          let current;
          try { current = JSON.parse(await readFile(lockPath, "utf8")); }
          catch (error) { if (error?.code === "ENOENT") return false; throw error; }
          if (current.token !== token) return false;
          await rm(lockPath, { force: true });
          return true;
        }
      };
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      if (error?.code !== "EEXIST") throw error;
      const status = await inspectLock(lockPath);
      if (recoverStaleOwner && status.owner && status.ownerAlive === false && attempt === 0) {
        await rm(lockPath, { force: true });
        continue;
      }
      throw new ResourceLockBusyError(lockPath, status.owner);
    }
  }
  throw new ResourceLockBusyError(lockPath, (await inspectLock(lockPath)).owner);
}

function isProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === "EPERM"; }
}
