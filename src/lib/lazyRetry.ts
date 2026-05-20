import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const CHUNK_RETRY_KEY = "karaoke_chunk_retry";

/**
 * Wraps React.lazy with one automatic reload per session when a dynamic import fails
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
      const tried = sessionStorage.getItem(CHUNK_RETRY_KEY);
      if (!tried) {
        sessionStorage.setItem(CHUNK_RETRY_KEY, "1");
        window.location.reload();
        return new Promise(() => {
          /* reload in progress */
        });
      }
      sessionStorage.removeItem(CHUNK_RETRY_KEY);
      throw err;
    }
  });
}
