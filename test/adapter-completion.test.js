import assert from "node:assert/strict";
import test from "node:test";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { commitAdapterCompletion } from "../src/adapters/completion.js";

const jobId = "ava-0123456789abcdef0123456789abcdef";
const generation = "fedcba9876543210fedcba9876543210";

test("Premiere receipts are removed only when job id and generation match", async () => {
  const mailbox = await mkdtemp(path.join(tmpdir(), "ava-receipts-"));
  const context = { settings: { adobe: { premiere: { bridgeMailbox: mailbox } } } };
  for (const kind of ["started", "completed"]) {
    await writeFile(path.join(mailbox, `${kind}-${jobId}.json`), JSON.stringify({ jobId, generation }));
  }
  await commitAdapterCompletion({ kind: "premiere.receipts.v1", jobId, generation }, context);
  await assert.rejects(access(path.join(mailbox, `started-${jobId}.json`)), (error) => error.code === "ENOENT");
  await assert.rejects(access(path.join(mailbox, `completed-${jobId}.json`)), (error) => error.code === "ENOENT");

  const mismatched = path.join(mailbox, `completed-${jobId}.json`);
  await writeFile(mismatched, JSON.stringify({ jobId, generation: "00000000000000000000000000000000" }));
  await assert.rejects(commitAdapterCompletion({ kind: "premiere.receipts.v1", jobId, generation }, context), /mismatched/);
  assert.equal(JSON.parse(await readFile(mismatched, "utf8")).generation, "00000000000000000000000000000000");
  await rm(mailbox, { recursive: true, force: true });
});
