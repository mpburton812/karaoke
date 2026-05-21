import { describe, expect, it } from "vitest";
import {
  EVENT_CATALOG,
  EVENT_CATALOG_ENTRIES,
  isEventCode,
  labelForEvent,
  levelForEvent,
} from "./eventCatalog";

describe("eventCatalog", () => {
  it("defines 38 canonical events", () => {
    expect(EVENT_CATALOG_ENTRIES).toHaveLength(38);
    expect(Object.keys(EVENT_CATALOG)).toHaveLength(38);
  });

  it("maps critical security and auth failures to expected levels", () => {
    expect(levelForEvent("uncaught_runtime_exception")).toBe("C");
    expect(levelForEvent("failed_user_authentication_attempt")).toBe("W");
    expect(levelForEvent("user_login_success")).toBe("I");
  });

  it("resolves labels for catalog and legacy categories", () => {
    expect(labelForEvent("user_logout")).toBe("User logout");
    expect(labelForEvent("auth")).toBe("Authentication");
    expect(isEventCode("not_a_real_event")).toBe(false);
  });
});
