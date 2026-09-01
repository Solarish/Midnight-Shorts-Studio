import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ReadinessSnapshot } from "./readiness.js";

export type ReadinessRejection = {
  at: string;
  requestId: string;
  code: "READINESS_FAILED";
  manifestId?: string;
  projectName?: string;
  preflightDigest?: string;
  readinessCheckedAt: string;
  failedChecks: Array<{ id: string; name: string; detail?: string }>;
};

export class ReadinessDiagnostics {
  constructor(private readonly filePath: string) {}

  async record(input: Omit<ReadinessRejection, "at" | "code" | "readinessCheckedAt" | "failedChecks"> & { readiness: ReadinessSnapshot; at?: string }) {
    const value: ReadinessRejection = {
      at: input.at ?? new Date().toISOString(),
      requestId: input.requestId,
      code: "READINESS_FAILED",
      manifestId: input.manifestId,
      projectName: input.projectName,
      preflightDigest: input.preflightDigest,
      readinessCheckedAt: input.readiness.checkedAt,
      failedChecks: input.readiness.checks
        .filter((check) => check.blocking && !check.ok)
        .map(({ id, name, detail }) => ({ id, name, detail }))
    };
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
    return value;
  }

  async list(limit = 20): Promise<ReadinessRejection[]> {
    const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit) || 20));
    try {
      const lines = (await readFile(this.filePath, "utf8")).trim().split("\n").filter(Boolean);
      return lines.slice(-boundedLimit).reverse().flatMap((line) => {
        try { return [JSON.parse(line) as ReadinessRejection]; }
        catch { return []; }
      });
    } catch (error: any) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }
}
