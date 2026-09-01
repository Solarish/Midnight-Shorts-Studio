import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browseDirectory, getNasBookmarks, previewDocxStoryboard, validateFsPath } from "../src/filesystem-service.ts";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "../../..");

test("getNasBookmarks exposes NAS and local bookmarks with existence status", async () => {
  const bookmarks = await getNasBookmarks(projectRoot);
  assert.ok(bookmarks.length >= 4);
  const localAssetBookmark = bookmarks.find((b) => b.id === "project-assets-input");
  assert.ok(localAssetBookmark);
  assert.equal(localAssetBookmark.exists, true);
  assert.equal(localAssetBookmark.category, "project");

  const projectRootBookmark = bookmarks.find((b) => b.id === "project-root");
  assert.ok(projectRootBookmark);
  assert.equal(projectRootBookmark.exists, true);
});

test("browseDirectory lists folders and files with filtering and breadcrumbs", async () => {
  const inputDir = path.join(projectRoot, "assets/input");
  const result = await browseDirectory(inputDir, ".docx", projectRoot);

  assert.equal(result.exists, true);
  assert.equal(result.accessible, true);
  assert.ok(result.breadcrumbs.length >= 2);
  assert.ok(result.entries.some((e) => e.name === "storyboard.docx" && !e.isDirectory && e.ext === ".docx"));
});

test("validateFsPath accurately inspects path existence and type", async () => {
  const docxPath = path.join(projectRoot, "assets/input/storyboard.docx");
  const validResult = await validateFsPath(docxPath, projectRoot);
  assert.equal(validResult.exists, true);
  assert.equal(validResult.isFile, true);
  assert.equal(validResult.isDirectory, false);
  assert.equal(validResult.ext, ".docx");

  const invalidResult = await validateFsPath("/nonexistent/path/for/testing/12345.xyz", projectRoot);
  assert.equal(invalidResult.exists, false);
});

test("previewDocxStoryboard parses storyboard and extracts interview segments", async () => {
  const docxPath = path.join(projectRoot, "assets/input/storyboard.docx");
  const preview = await previewDocxStoryboard(docxPath, projectRoot);

  assert.equal(preview.ok, true);
  assert.ok(preview.segmentCount > 0);
  assert.ok(preview.totalDialogueMs > 0);
  assert.match(preview.totalDialogueFormatted, /\d{2}:\d{2}/);
  assert.ok(preview.segments.length > 0);
  assert.ok(preview.segments[0].sourceKey.startsWith("C"));
});
