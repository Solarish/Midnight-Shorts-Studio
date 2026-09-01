export async function previewMedia(input, context) {
  const source = input.source;
  const rawPath = typeof source === "string" ? source : source?.path || source?.output || source?.previewUrl || "";
  const kind = typeof source === "object" && source?.kind ? source.kind : (rawPath.endsWith(".mp4") || rawPath.endsWith(".mov")) ? "video" : "media";
  
  context?.log?.(`[PREVIEW] ComfyUI Preview Node (${context?.step?.id ?? "preview"}): source=${rawPath || JSON.stringify(source).slice(0, 60)}`);
  
  return {
    preview: source,
    passthrough: source,
    previewUrl: rawPath,
    kind,
    ready: true
  };
}
