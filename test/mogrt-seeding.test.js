import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { seedEditableMogrt } from "../src/adapters/mogrt.js";
import { runProcess } from "../src/core/process.js";

test("seeds all Cover Card text defaults into a distinct editable MOGRT with durable evidence", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-seeded-mogrt-test-"));
  try {
    const templatePath = path.resolve("templates/premiere/psu-cover-text.mogrt");
    const templateBefore = await readFile(templatePath);
    const outputPath = path.join(root, "cover-kewalin.mogrt");
    const text = {
      personName: "รองศาสตราจารย์ ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
      positionTitle: "คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์",
      award: "อาจารย์ตัวอย่างดีเด่นด้านการเรียนการสอน"
    };
    const parameterMap = { personName: "PERSON_NAME", positionTitle: "POSITION_TITLE", award: "AWARD" };
    const receipt = await seedEditableMogrt({ templatePath, outputPath, text, parameterMap });
    assert.equal(receipt.mode, "preseeded");
    assert.equal(receipt.outputPath, outputPath);
    assert.deepEqual(receipt.parameterNames, ["AWARD", "PERSON_NAME", "POSITION_TITLE"]);
    assert.match(receipt.capsuleID, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.match(receipt.capsuleName, /^psu-cover-[0-9a-f]{12}$/);
    assert.match(receipt.aegraphicSha256, /^[0-9a-f]{64}$/);
    assert.match(receipt.aepSha256, /^[0-9a-f]{64}$/);
    assert.notEqual(receipt.outputSha256, receipt.templateSha256);
    assert.deepEqual(await readFile(templatePath), templateBefore, "base template must remain unchanged");

    const { stdout } = await runProcess("unzip", ["-p", outputPath, "definition.json"], { timeoutMs: 30_000 });
    const definition = JSON.parse(stdout);
    const controls = Object.fromEntries(definition.clientControls.map((control) => [control.uiName.strDB[0].str, control.value.strDB[0].str]));
    assert.deepEqual(controls, {
      AWARD: text.award,
      POSITION_TITLE: text.positionTitle,
      PERSON_NAME: text.personName
    });
    assert.deepEqual(receipt.text, {
      PERSON_NAME: text.personName,
      POSITION_TITLE: text.positionTitle,
      AWARD: text.award
    });

    const secondOutputPath = path.join(root, "cover-kewalin-second.mogrt");
    const secondReceipt = await seedEditableMogrt({ templatePath, outputPath: secondOutputPath, text, parameterMap });
    assert.notEqual(secondReceipt.capsuleID, receipt.capsuleID, "each timeline instance must have a distinct capsule identity");
    assert.notEqual(secondReceipt.capsuleName, receipt.capsuleName);
    assert.notEqual(secondReceipt.aegraphicSha256, receipt.aegraphicSha256, "Premiere must not deduplicate distinct seeded payloads");
    assert.notEqual(secondReceipt.aepSha256, receipt.aepSha256, "embedded AE projects must have distinct byte identities");

    const firstArchive = path.join(root, "first-archive");
    await runProcess("unzip", ["-q", outputPath, "project.aegraphic", "-d", firstArchive], { timeoutMs: 30_000 });
    const firstAegraphic = path.join(firstArchive, "project.aegraphic");
    const { stdout: innerEntries } = await runProcess("unzip", ["-Z1", firstAegraphic], { timeoutMs: 30_000 });
    const reportEntry = innerEntries.split(/\r?\n/).find((entry) => /Report\.txt$/i.test(entry));
    const { stdout: report } = await runProcess("unzip", ["-p", firstAegraphic, reportEntry], { timeoutMs: 30_000 });
    assert.match(report, /AVA seeded instance: [0-9a-f]{64}/);
    const aepEntry = innerEntries.split(/\r?\n/).find((entry) => /\.aep$/i.test(entry));
    const { stdout: aepTail } = await runProcess("unzip", ["-p", firstAegraphic, aepEntry], { timeoutMs: 30_000 });
    assert.match(aepTail, /AVA_MOGRT_INSTANCE:[0-9a-f]{64}/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
