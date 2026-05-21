import { forceAppReload, isChunkLoadError } from "./forceAppReload";

const CHUNK_RETRY_KEY = "karaoke_chunk_retry";

export function messageFromReason(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  return String(reason ?? "");
}

/** One soft reload, then clear caches and hard reload (helps Android Chrome PWA). */
export async function recoverFromChunkError(reason: unknown): Promise<void> {
  const message = messageFromReason(reason);
  if (!isChunkLoadError(message)) return;

  const tried = sessionStorage.getItem(CHUNK_RETRY_KEY);
  if (!tried) {
    sessionStorage.setItem(CHUNK_RETRY_KEY, "1");
    window.location.reload();
    return;
  }

  sessionStorage.removeItem(CHUNK_RETRY_KEY);
  await forceAppReload();
}
