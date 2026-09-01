/**
 * Media Source Resolver for Remotion Studio
 *
 * Converts local filesystem paths (e.g. /Volumes/..., /Users/...) into
 * streamable loopback URLs served by Control API with byte-range support.
 */

let activeApiPort = 47650;

export function setActiveApiPort(port: number): void {
  if (port > 0 && port < 65536) {
    activeApiPort = port;
  }
}

export function getActiveApiPort(): number {
  return activeApiPort;
}

export function isVideoFile(filePath: string | undefined | null): boolean {
  if (!filePath || typeof filePath !== "string") return false;
  return /\.(mp4|mov|webm|m4v|mkv|avi)$/i.test(filePath);
}

export function isImageFile(filePath: string | undefined | null): boolean {
  if (!filePath || typeof filePath !== "string") return false;
  return /\.(png|jpe?g|webp|gif|svg|bmp|tiff?)$/i.test(filePath);
}

export function isAudioFile(filePath: string | undefined | null): boolean {
  if (!filePath || typeof filePath !== "string") return false;
  return /\.(wav|mp3|m4a|aac|ogg|flac|aiff)$/i.test(filePath);
}

export function getMediaBasename(filePath: string | undefined | null): string {
  if (!filePath || typeof filePath !== "string") return "";
  const cleaned = filePath.replace(/\\/g, "/");
  return cleaned.substring(cleaned.lastIndexOf("/") + 1) || filePath;
}

/**
 * Resolves any raw path or asset identifier into a browser-safe URL for Remotion.
 */
export function resolveMediaUrl(rawPath: string | undefined | null): string | undefined {
  if (!rawPath || typeof rawPath !== "string") {
    return undefined;
  }

  const trimmed = rawPath.trim();
  if (!trimmed) {
    return undefined;
  }

  // Already a full web URL, blob, or data URI
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("/static-")
  ) {
    return trimmed;
  }

  // Relative or static path in Remotion public bundle
  if (trimmed.startsWith("static:") || trimmed.startsWith("./public/")) {
    return trimmed.replace(/^(\.\/public\/|static:)/, "/");
  }

  // Local filesystem path (Unix absolute or Windows drive)
  const port = getActiveApiPort();
  const host = typeof window !== "undefined" && window.location?.hostname ? window.location.hostname : "127.0.0.1";
  const protocol = typeof window !== "undefined" && window.location?.protocol ? window.location.protocol : "http:";
  return `${protocol}//${host}:${port}/api/v1/media/stream?path=${encodeURIComponent(trimmed)}`;
}
