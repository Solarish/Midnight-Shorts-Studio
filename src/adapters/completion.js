import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const DEFAULT_MAILBOX_DIR = path.join(tmpdir(), "psu-ava-premiere-bridge");

export async function commitAdapterCompletion(receipt, context) {
  if (!receipt) return;
  if (receipt.kind !== "premiere.receipts.v1") {
    throw new Error(`Unsupported adapter completion receipt '${receipt.kind ?? "unknown"}'`);
  }
  if (!/^ava-[a-f0-9]{32}$/.test(receipt.jobId) || !/^[a-f0-9]{32}$/.test(receipt.generation)) {
    throw new Error("Premiere completion receipt has an unsafe job id or generation");
  }
  const configured = context.settings?.adobe?.premiere?.bridgeMailbox ?? DEFAULT_MAILBOX_DIR;
  const mailboxDir = path.resolve(configured);
  for (const kind of ["started", "completed"]) {
    const target = path.join(mailboxDir, `${kind}-${receipt.jobId}.json`);
    if (path.dirname(target) !== mailboxDir) throw new Error("Premiere receipt escaped the mailbox directory");
    let value;
    try { value = JSON.parse(await readFile(target, "utf8")); }
    catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (value.jobId !== receipt.jobId || value.generation !== receipt.generation) {
      throw new Error(`Refusing to remove mismatched Premiere ${kind} receipt`);
    }
    await rm(target);
  }
}
