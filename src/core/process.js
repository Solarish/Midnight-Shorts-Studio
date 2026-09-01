import { spawn } from "node:child_process";

export function runProcess(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32"
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let forceTimer;

    const timer = setTimeout(() => {
      timedOut = true;
      signalProcessGroup("SIGTERM");
      forceTimer = setTimeout(() => signalProcessGroup("SIGKILL"), options.killGraceMs ?? 5_000);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      options.onStdout?.(String(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      options.onStderr?.(String(chunk));
    });
    child.on("error", (error) => {
      finish(error);
    });
    child.on("close", (code, signal) => {
      if (timedOut) finish(new Error(`${command} timed out after ${timeoutMs}ms`));
      else if (code !== 0) finish(new Error(`${command} exited with code ${code ?? signal}: ${stderr.trim()}`));
      else finish(undefined, { code, stdout, stderr });
    });

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      error ? reject(error) : resolve(value);
    }

    function signalProcessGroup(signal) {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch (error) {
        if (error?.code !== "ESRCH") stderr += `\nUnable to signal process: ${error?.message ?? error}`;
      }
    }
  });
}
