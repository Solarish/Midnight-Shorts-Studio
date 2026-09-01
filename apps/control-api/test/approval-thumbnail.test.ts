import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveApprovalThumbnailPath } from "../src/approval-thumbnail.js";

test("resolveApprovalThumbnailPath permits B-roll thumbnails only inside broll-thumbs cache", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-thumb-broll-"));
  const brollDir = path.join(root, ".ava-cache", "broll-thumbs");
  const runDir = path.join(root, "run-1");
  await mkdir(brollDir, { recursive: true });
  await mkdir(runDir, { recursive: true });

  const validBroll = path.join(brollDir, "thumb1.jpg");
  const outsideBroll = path.join(runDir, "thumb1.jpg");
  await writeFile(validBroll, "valid-image-bytes");
  await writeFile(outsideBroll, "outside-image-bytes");

  const resolved = await resolveApprovalThumbnailPath({
    projectRoot: root,
    runDir,
    approvalKind: "broll",
    thumbnailPath: validBroll
  });
  assert.equal(resolved.target, await realpath(validBroll));
  assert.equal(resolved.contentType, "image/jpeg");

  await assert.rejects(
    resolveApprovalThumbnailPath({
      projectRoot: root,
      runDir,
      approvalKind: "broll",
      thumbnailPath: outsideBroll
    }),
    (err: any) => err.statusCode === 403
  );

  await rm(root, { recursive: true, force: true });
});

test("resolveApprovalThumbnailPath permits cover thumbnails in runDir or comfy cache and rejects symlink escape", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-thumb-cover-"));
  const comfyCache = path.join(root, ".ava-cache", "comfyui", "digest123");
  const runDir = path.join(root, "run-1");
  const forbiddenDir = path.join(root, "secret");
  await mkdir(comfyCache, { recursive: true });
  await mkdir(runDir, { recursive: true });
  await mkdir(forbiddenDir, { recursive: true });

  const coverInRun = path.join(runDir, "cover.png");
  const coverInCache = path.join(comfyCache, "output.webp");
  const secretFile = path.join(forbiddenDir, "secret.png");
  const escapedSymlink = path.join(runDir, "escaped.png");

  await writeFile(coverInRun, "cover-run-bytes");
  await writeFile(coverInCache, "cover-cache-bytes");
  await writeFile(secretFile, "secret-bytes");
  await symlink(secretFile, escapedSymlink);

  // 1. Cover in runDir
  const res1 = await resolveApprovalThumbnailPath({
    projectRoot: root,
    runDir,
    approvalKind: "cover_card",
    thumbnailPath: coverInRun
  });
  assert.equal(res1.target, await realpath(coverInRun));
  assert.equal(res1.contentType, "image/png");

  // 2. Cover in Comfy cache
  const res2 = await resolveApprovalThumbnailPath({
    projectRoot: root,
    runDir,
    approvalKind: "cover_card",
    thumbnailPath: coverInCache
  });
  assert.equal(res2.target, await realpath(coverInCache));
  assert.equal(res2.contentType, "image/webp");

  // 3. Symlink escape to forbidden directory
  await assert.rejects(
    resolveApprovalThumbnailPath({
      projectRoot: root,
      runDir,
      approvalKind: "cover_card",
      thumbnailPath: escapedSymlink
    }),
    (err: any) => err.statusCode === 403
  );

  // 4. Missing file
  await assert.rejects(
    resolveApprovalThumbnailPath({
      projectRoot: root,
      runDir,
      approvalKind: "cover_card",
      thumbnailPath: path.join(runDir, "missing.png")
    }),
    (err: any) => err.statusCode === 404
  );

  // 5. Unsupported extension
  const txtFile = path.join(runDir, "file.txt");
  await writeFile(txtFile, "text");
  await assert.rejects(
    resolveApprovalThumbnailPath({
      projectRoot: root,
      runDir,
      approvalKind: "cover_card",
      thumbnailPath: txtFile
    }),
    (err: any) => err.statusCode === 403
  );

  await rm(root, { recursive: true, force: true });
});
