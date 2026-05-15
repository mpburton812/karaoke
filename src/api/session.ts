import { clearSession } from "./auth";

export const SESSION_EXPIRED_MESSAGE =
  "Your session expired. Please sign in again.";

let sessionExpiredHandler: ((message: string) => void) | null = null;

export function setSessionExpiredHandler(
  handler: ((message: string) => void) | null
): void {
  sessionExpiredHandler = handler;
}

/** True when the server rejected the JWT / session (not wrong login password). */
export function shouldExpireSession(
  status: number,
  error: string | undefined
): boolean {
  if (!error) return false;
  const msg = error.toLowerCase();
  if (msg.includes("invalid or expired session")) return true;
  if (msg.includes("authentication required")) return true;
  if (msg.includes("not authenticated")) return true;
  if (status === 401 && msg.includes("please log in")) return true;
  return false;
}

export function expireSession(message = SESSION_EXPIRED_MESSAGE): never {
  clearSession();
  sessionExpiredHandler?.(message);
  throw new Error(message);
}
