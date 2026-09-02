import React from "react";
import type { NodeRunState } from "./useNodeRunMonitor";

export interface NodeRunStatusBarProps {
  nodeRun: NodeRunState | null;
}

export const NodeRunStatusBar: React.FC<NodeRunStatusBarProps> = ({ nodeRun }) => {
  if (!nodeRun) return null;

  const progressPercent =
    typeof nodeRun.progress?.percent === "number"
      ? nodeRun.progress.percent
      : nodeRun.status === "success"
        ? 100
        : nodeRun.steps?.length
          ? Math.round(
              (nodeRun.steps.filter((s) => s.status === "success" || s.status === "skipped").length /
                nodeRun.steps.length) *
                100
            )
          : nodeRun.status === "running"
            ? 35
            : 0;

  const cpuLoad =
    nodeRun.systemStatus?.data?.cpu?.load ??
    nodeRun.systemStatus?.data?.cpu ??
    nodeRun.systemStatus?.data?.cpuUsage ??
    "—";

  const ramUsage =
    nodeRun.systemStatus?.data?.memory?.percentage ??
    nodeRun.systemStatus?.data?.memory?.usedPercent ??
    nodeRun.systemStatus?.data?.memoryUsage ??
    "—";

  const comfyOnline = nodeRun.comfyStatus?.reachable !== false;
  const runningQueue = nodeRun.comfyStatus?.queue?.running?.length ?? 0;
  const pendingQueue = nodeRun.comfyStatus?.queue?.pending?.length ?? 0;

  return (
    <div className="node-run-status" role="status">
      <div className="node-run-status-copy">
        <span>
          {nodeRun.dryRun ? "🧪 Dry run" : "⚡ Live run"} · {nodeRun.status}
          {nodeRun.error ? ` · ❌ ${nodeRun.error}` : ""}
        </span>
        <a href={`/runs/${encodeURIComponent(nodeRun.runId)}`} target="_blank" rel="noreferrer">
          ดูผลลัพธ์และ artifacts ↗
        </a>
      </div>
      <div
        className="node-run-progress"
        aria-label={`Run progress ${progressPercent}%`}
      >
        <i style={{ width: `${progressPercent}%` }} />
      </div>
      <small>
        · CPU {cpuLoad}% · RAM {ramUsage}% · ComfyUI {comfyOnline ? "online" : "offline"} · queue {runningQueue}/{pendingQueue}
      </small>
    </div>
  );
};
