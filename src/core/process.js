import { spawn } from "node:child_process";

export function runProcess(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
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
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`${command} timed out after ${timeoutMs}ms`));
      else if (code !== 0) reject(new Error(`${command} exited with code ${code ?? signal}: ${stderr.trim()}`));
      else resolve({ code, stdout, stderr });
    });
  });
}

