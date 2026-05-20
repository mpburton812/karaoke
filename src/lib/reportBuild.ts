import { logUserAction } from "../api/eventLog";

const STORAGE_KEY = "karaoke_reported_build";

function buildMessage(prefix: string): string {
  const commit = __COMMIT_HASH__;
  const branch = __BRANCH_NAME__;
  const branchPart = branch && branch !== "unknown" ? ` (${branch})` : "";
  return `${prefix} ${commit}${branchPart}`;
}

/** Log once per browser session when the user runs a new frontend build. */
export function reportClientBuildOnce(): void {
  const commit = __COMMIT_HASH__;
  if (!commit || commit === "unknown") return;
  if (sessionStorage.getItem(STORAGE_KEY) === commit) return;
  sessionStorage.setItem(STORAGE_KEY, commit);
  logUserAction(buildMessage("Client loaded build"), "release");
}

/** Log when an admin explicitly reloads to pick up a new deploy. */
export function reportAppReloadRequest(): void {
  logUserAction(buildMessage("Requested app reload for build"), "release");
}
