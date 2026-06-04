import { db } from "./db.js";
import { adminUsernameSet } from "./adminUsernames.js";

export { accessLevelForNewUser, adminUsernameSet } from "./adminUsernames.js";

/** Idempotent: ensure configured admin usernames have access_level admin. */
export async function syncAdminAccessLevels(): Promise<void> {
  for (const name of adminUsernameSet()) {
    await db.execute({
      sql: "UPDATE users SET access_level = 'admin' WHERE LOWER(username) = LOWER(?)",
      args: [name],
    });
  }
}
