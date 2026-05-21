import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { messageFromReason, recoverFromChunkError } from "./chunkRecovery";
import { isChunkLoadError } from "./forceAppReload";

/**
 * Wraps React.lazy with automatic recovery when a dynamic import fails
 * (common after deploy when the browser still has an old main bundle).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await importer();
    } catch (err) {
      if (isChunkLoadError(messageFromReason(err))) {
        await recoverFromChunkError(err);
        return new Promise(() => {
          /* reload in progress */
        });
      }
      throw err;
    }
  });
}
