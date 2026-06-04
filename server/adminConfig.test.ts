import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accessLevelForNewUser,
  adminUsernameSet,
} from "./adminUsernames.js";

describe("adminConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults admin usernames to mpburton", () => {
    expect(adminUsernameSet().has("mpburton")).toBe(true);
    expect(accessLevelForNewUser("mpburton")).toBe("admin");
    expect(accessLevelForNewUser("other")).toBe("user");
  });

  it("reads ADMIN_USERNAMES from env", () => {
    vi.stubEnv("ADMIN_USERNAMES", "Alice, bob");
    expect(adminUsernameSet().has("alice")).toBe(true);
    expect(adminUsernameSet().has("bob")).toBe(true);
    expect(accessLevelForNewUser("Alice")).toBe("admin");
    expect(accessLevelForNewUser("stranger")).toBe("user");
  });
});
