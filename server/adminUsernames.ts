/** Comma-separated usernames in ADMIN_USERNAMES (case-insensitive). Defaults to mpburton. */
export function adminUsernameSet(): Set<string> {
  const raw = process.env.ADMIN_USERNAMES?.trim();
  const names = raw
    ? raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : ["mpburton"];
  return new Set(names);
}

export function accessLevelForNewUser(username: string): "admin" | "user" {
  return adminUsernameSet().has(username.trim().toLowerCase()) ? "admin" : "user";
}
