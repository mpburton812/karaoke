import { forceAppReload } from "./forceAppReload";

const BUILD_SYNC_KEY = "karaoke_build_sync_retry";

/**
 * After deploy, Chrome (especially installed PWAs) may run an old main bundle while
 * hashed chunk files on the server have changed. Compare embedded commit to live stamp.
 */
export async function ensureLatestBuild(): Promise<void> {
  if (import.meta.env.DEV) return;
  const embedded = __COMMIT_HASH__;
  if (!embedded || embedded === "unknown") return;

  try {
    const res = await fetch("/build-stamp.json", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { commit?: string };
    const live = data.commit?.trim();
    if (!live || live === "unknown" || live === embedded) return;
    if (sessionStorage.getItem(BUILD_SYNC_KEY)) return;
    sessionStorage.setItem(BUILD_SYNC_KEY, "1");
    await forceAppReload();
  } catch {
    /* offline or stamp missing — keep running */
  }
}
