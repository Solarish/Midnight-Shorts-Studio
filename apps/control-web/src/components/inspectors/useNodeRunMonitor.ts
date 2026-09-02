import { useState, useEffect, useRef, useCallback } from "react";
import type { StoryboardItem } from "../../storyboard-types";
import { runStoryboardNode } from "../../storyboard-api";
import { api } from "../../api";
import { saveGlobalCustomDoodle } from "../useGlobalCustomDoodles";

export interface NodeRunState {
  runId: string;
  stage?: "background" | "doodle" | "person" | "assets";
  status: string;
  dryRun?: boolean;
  progress?: { percent: number; completed: number; total: number };
  steps?: Array<{ id: string; status: string; label?: string; outputs?: any }>;
  health?: "active" | "stalled" | "terminal" | "connection_lost";
  lastHeartbeatAt?: string;
  systemStatus?: { reachable: boolean; data?: any; error?: string };
  comfyStatus?: { reachable: boolean; queue?: { running: any[]; pending: any[] }; error?: string };
  error?: string;
}

export function useNodeRunMonitor({
  storyboardId,
  item,
  onUpdateParams,
  onError
}: {
  storyboardId: string;
  item: StoryboardItem | null;
  onUpdateParams?: (patch: Record<string, unknown>) => void;
  onError?: (message: string) => void;
}) {
  const [nodeRun, setNodeRun] = useState<NodeRunState | null>(null);
  const [nodeRunBusy, setNodeRunBusy] = useState(false);
  const nodeRunSignature = useRef("");
  const nodeRunProgressAt = useRef(Date.now());

  const triggerRun = useCallback(
    async (stage: "background" | "doodle" | "person" | "assets" = "assets") => {
      if (!item || !storyboardId) return;
      setNodeRunBusy(true);
      try {
        const result = await runStoryboardNode(storyboardId, item.id, "live", item, stage);
        setNodeRun({
          runId: result.runId,
          stage,
          status: result.status,
          dryRun: result.dryRun,
          health: "active",
          lastHeartbeatAt: new Date().toISOString()
        });
      } catch (cause: any) {
        const errorMsg = cause instanceof Error ? cause.message : "สั่งรันโหนดไม่สำเร็จ";
        onError?.(errorMsg);
        setNodeRun((prev) => (prev ? { ...prev, health: "terminal", error: errorMsg } : null));
      } finally {
        setNodeRunBusy(false);
      }
    },
    [storyboardId, item, onError]
  );

  useEffect(() => {
    if (!nodeRun?.runId) return;
    let active = true;
    nodeRunSignature.current = "";
    nodeRunProgressAt.current = Date.now();

    const poll = async () => {
      try {
        const current = await api<any>(`/api/v1/runs/${encodeURIComponent(nodeRun.runId)}`);
        if (!active) return;

        let systemStatus: { reachable: boolean; data?: any; error?: string } | undefined;
        try {
          const sys = await api<any>("/api/v1/system/status");
          systemStatus = { reachable: true, data: sys?.data ?? sys };
        } catch (sysErr: any) {
          systemStatus = { reachable: false, error: sysErr?.message ?? "unreachable" };
        }

        let comfyStatus: { reachable: boolean; queue?: { running: any[]; pending: any[] }; error?: string } | undefined;
        try {
          const comfy = await api<any>("/api/v1/comfyui/status");
          comfyStatus = { reachable: true, queue: comfy?.queue };
        } catch (comfyErr: any) {
          comfyStatus = { reachable: false, error: comfyErr?.message ?? "unreachable" };
        }

        const signature = `${current.status}:${current.progress?.percent}:${current.steps?.map((step: any) => `${step.id}:${step.status}`).join(",")}`;
        if (signature !== nodeRunSignature.current) {
          nodeRunSignature.current = signature;
          nodeRunProgressAt.current = Date.now();
        }

        const terminal = ["success", "failed", "partial", "cancelled", "needs_attention"].includes(current.status);
        const health = terminal ? "terminal" : "active";

        setNodeRun((prev) =>
          prev
            ? {
                ...prev,
                status: current.status,
                dryRun: current.dryRun,
                progress: current.progress,
                steps: current.steps,
                health,
                lastHeartbeatAt: current.updatedAt ?? new Date().toISOString(),
                systemStatus,
                comfyStatus,
                error: current.error
              }
            : prev
        );

        if (current.steps && onUpdateParams) {
          const outputFor = (suffix: string) => {
            const step = current.steps.find((value: any) => value.id.endsWith(suffix));
            const output = step?.outputs ?? {};
            return step?.status === "success" ? output.images?.[0]?.localPath ?? output.image ?? output.path : undefined;
          };

          const generated =
            nodeRun.stage === "background"
              ? { backgroundImage: outputFor("__generate_bg") }
              : nodeRun.stage === "person"
                ? { personImage: outputFor("__cutout") }
                : nodeRun.stage === "doodle"
                  ? { doodleImage: outputFor("__doodle_alpha") }
                  : {
                      backgroundImage: outputFor("__generate_bg"),
                      personImage: outputFor("__cutout"),
                      doodleImage: outputFor("__doodle_alpha")
                    };

          const changed = Object.fromEntries(
            Object.entries(generated).filter(([, value]) => typeof value === "string" && value)
          );

          if (Object.keys(changed).length) {
            const createdAt = new Date().toISOString();
            const customWord = String(item?.params?.customDoodleWord ?? "").trim().split(/\s+/)[0] ?? "";
            const existingDoodleAssets = Array.isArray(item?.params?.customDoodleAssets)
              ? (item.params.customDoodleAssets as Array<{ slot?: number; image?: string; word?: string }>)
              : [];
            const alreadyExists = existingDoodleAssets.some((a) => a.image === changed.doodleImage);
            let nextCustomDoodleAssets = existingDoodleAssets;
            if (changed.doodleImage && !alreadyExists) {
              const usedSlots = new Set(existingDoodleAssets.map((asset, index) => Number(asset.slot ?? index + 1)));
              const nextSlot = Array.from({ length: 25 }, (_, index) => index + 1).find((slot) => !usedSlots.has(slot)) ?? 25;
              const newAsset = {
                id: `custom_${nodeRun.runId}`,
                word: customWord || "custom",
                image: changed.doodleImage,
                slot: nextSlot,
                createdAt
              };
              nextCustomDoodleAssets = [newAsset, ...existingDoodleAssets].slice(0, 25);
              void saveGlobalCustomDoodle(newAsset);
            } else if (changed.doodleImage) {
              void saveGlobalCustomDoodle({
                id: `custom_${nodeRun.runId}`,
                word: customWord || "custom",
                image: changed.doodleImage
              });
            }

            const currentAssetSet = Array.isArray(item?.params?.doodleAssetSet) ? (item.params.doodleAssetSet as string[]) : [];
            const nextAssetSet = changed.doodleImage && !currentAssetSet.includes(changed.doodleImage)
              ? [...currentAssetSet, changed.doodleImage]
              : currentAssetSet;

            onUpdateParams({
              ...changed,
              ...(nextCustomDoodleAssets !== existingDoodleAssets ? { customDoodleAssets: nextCustomDoodleAssets } : {}),
              ...(nextAssetSet !== currentAssetSet ? { doodleAssetSet: nextAssetSet } : {}),
              outputHistory: [
                { runId: nodeRun.runId, createdAt, ...changed },
                ...(Array.isArray(item?.params?.outputHistory) ? item?.params?.outputHistory : [])
              ].slice(0, 12)
            });
          }
        }

        if (terminal) return;
        window.setTimeout(() => void poll(), 1200);
      } catch (error) {
        if (active) {
          setNodeRun((prev) =>
            prev
              ? {
                  ...prev,
                  health: "connection_lost",
                  error: error instanceof Error ? error.message : "ไม่สามารถอ่านสถานะ run ได้"
                }
              : prev
          );
          window.setTimeout(() => void poll(), 1800);
        }
      }
    };

    void poll();
    return () => {
      active = false;
    };
  }, [nodeRun?.runId, item?.id]);

  return {
    nodeRun,
    setNodeRun,
    nodeRunBusy,
    triggerRun
  };
}
