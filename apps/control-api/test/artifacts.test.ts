import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listArtifacts, resolveArtifact } from "../src/artifacts.ts";

test("artifact catalog stays inside the run root and ignores symlinks", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-artifacts-"));
  await mkdir(path.join(root, "renders"));
  await writeFile(path.join(root, "renders", "master.mov"), "fixture");
  await symlink("/etc/passwd", path.join(root, "escape"));
  const artifacts = await listArtifacts(root);
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0]?.kind, "video");
  const resolved = await resolveArtifact(root, artifacts[0]!.artifactId);
  assert.equal(resolved.target, path.join(await realpath(root), "renders", "master.mov"));
});
