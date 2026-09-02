import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import type { RegisteredDoodleAsset } from "./DoodleAssetLibrary";

let globalCache: RegisteredDoodleAsset[] = [];
const listeners = new Set<(assets: RegisteredDoodleAsset[]) => void>();

function notify(assets: RegisteredDoodleAsset[]) {
  globalCache = assets;
  try {
    localStorage.setItem("ava_global_custom_doodles", JSON.stringify(assets));
  } catch {}
  listeners.forEach((listener) => listener(assets));
}

export async function fetchGlobalCustomDoodles(): Promise<RegisteredDoodleAsset[]> {
  try {
    const list = await api<RegisteredDoodleAsset[]>("/api/v1/doodles/custom");
    if (Array.isArray(list)) {
      notify(list);
      return list;
    }
  } catch (error) {
    // Fallback to local storage
    try {
      const cached = localStorage.getItem("ava_global_custom_doodles");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          notify(parsed);
          return parsed;
        }
      }
    } catch {}
  }
  return globalCache;
}

export async function saveGlobalCustomDoodle(asset: {
  id?: string;
  word: string;
  image: string;
  slot?: number;
  category?: string;
}): Promise<RegisteredDoodleAsset[]> {
  try {
    const updated = await api<RegisteredDoodleAsset[]>("/api/v1/doodles/custom", {
      method: "POST",
      body: JSON.stringify(asset)
    });
    if (Array.isArray(updated)) {
      notify(updated);
      return updated;
    }
  } catch {
    // Local fallback
    const matchIndex = globalCache.findIndex((e) => e.image === asset.image);
    const entry: RegisteredDoodleAsset = {
      id: asset.id || `custom_${Date.now()}`,
      word: asset.word,
      image: asset.image,
      slot: asset.slot ?? (25 + globalCache.length + 1),
      category: asset.category ?? "custom",
      createdAt: new Date().toISOString()
    };
    const next = matchIndex >= 0
      ? globalCache.map((item, idx) => (idx === matchIndex ? { ...item, ...entry } : item))
      : [entry, ...globalCache];
    notify(next);
    return next;
  }
  return globalCache;
}

export async function deleteGlobalCustomDoodle(idOrImage: string): Promise<RegisteredDoodleAsset[]> {
  try {
    const updated = await api<RegisteredDoodleAsset[]>("/api/v1/doodles/custom", {
      method: "DELETE",
      body: JSON.stringify({ id: idOrImage, image: idOrImage })
    });
    if (Array.isArray(updated)) {
      notify(updated);
      return updated;
    }
  } catch {
    const next = globalCache.filter((item) => item.id !== idOrImage && item.image !== idOrImage);
    notify(next);
    return next;
  }
  const next = globalCache.filter((item) => item.id !== idOrImage && item.image !== idOrImage);
  notify(next);
  return next;
}

export function useGlobalCustomDoodles() {
  const [doodles, setDoodles] = useState<RegisteredDoodleAsset[]>(() => {
    if (globalCache.length) return globalCache;
    try {
      const cached = localStorage.getItem("ava_global_custom_doodles");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  useEffect(() => {
    listeners.add(setDoodles);
    void fetchGlobalCustomDoodles();
    return () => {
      listeners.delete(setDoodles);
    };
  }, []);

  const registerDoodle = useCallback(
    async (asset: { id?: string; word: string; image: string; slot?: number; category?: string }) => {
      return saveGlobalCustomDoodle(asset);
    },
    []
  );

  const deleteDoodle = useCallback(async (idOrImage: string) => {
    return deleteGlobalCustomDoodle(idOrImage);
  }, []);

  return {
    customDoodles: doodles,
    registerDoodle,
    deleteDoodle
  };
}
