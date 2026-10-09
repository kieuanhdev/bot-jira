import { describe, it, expect } from "vitest";
import { SERVICE_KEYS, getServiceHealthBadge } from "./settings-model";

describe("settings-model", () => {
  it("defines expected service keys", () => {
    expect(SERVICE_KEYS).toEqual(["db", "jira", "bitbucket", "sentry", "openai", "ollama"]);
  });

  it("returns correct badge variants and localized labels", () => {
    expect(getServiceHealthBadge(true)).toEqual({
      variant: "success",
      label: "hoạt động",
    });
    expect(getServiceHealthBadge(false)).toEqual({
      variant: "danger",
      label: "mất kết nối",
    });
  });
});
