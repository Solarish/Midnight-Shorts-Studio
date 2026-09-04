import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalStoryboardStore } from "@psu-ava/persistence-local";
import { StoryboardService } from "../src/storyboards.ts";

test("storyboard export defaults correctly resolves <DOCX_DIR>/Export and fallback", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-render-test-"));
  try {
    const store = new LocalStoryboardStore(root);
    await store.init();

    const nasSimDir = path.join(root, "Volumes/Nas/Project1");
    await mkdir(nasSimDir, { recursive: true });
    const docxFile = path.join(nasSimDir, "Story.docx");
    await writeFile(docxFile, "docx-content");

    await store.saveImport({
      schemaVersion: 2,
      importId: "import_nas",
      docxPath: docxFile,
      sourceDigest: "digest1",
      importedAt: new Date().toISOString(),
      rawRows: [],
      proposals: [],
      diagnostics: []
    });

    const service = new StoryboardService(store, root);
    const createdWithDocx = await service.create({
      importId: "import_nas",
      name: "ดร.ปฐวี อินทร์สุวรรณโณ"
    });

    // Verify DOCX parent Export resolution
    const docxParentDir = path.dirname(docxFile);
    const expectedExportDir = path.join(docxParentDir, "Export");

    assert.equal(createdWithDocx.sourceImport?.docxPath, docxFile);
    assert.equal(path.join(path.dirname(createdWithDocx.sourceImport!.docxPath!), "Export"), expectedExportDir);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
