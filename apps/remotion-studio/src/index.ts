import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

export { StoryboardSequence } from "./compositions/StoryboardSequence";
export { VerticalComposition } from "./compositions/VerticalComposition";
export { HorizontalComposition } from "./compositions/HorizontalComposition";
export { SquareComposition } from "./compositions/SquareComposition";
export { RemotionRoot } from "./Root";
export * from "./types";
export * from "./media-resolver";

try {
  registerRoot(RemotionRoot);
} catch {
  // Ignored when imported in browser or other bundles
}
