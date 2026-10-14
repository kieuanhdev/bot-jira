import { describe, it, expect } from "vitest";
import { maskSecrets } from "./mask-secrets";

describe("maskSecrets", () => {
  it("handles null and undefined safely", () => {
    expect(maskSecrets(null)).toBe("");
    expect(maskSecrets(undefined)).toBe("");
    expect(maskSecrets("")).toBe("");
  });

  it("masks token, bearer, password, auth, apiKey, secret", () => {
    expect(maskSecrets("Failed: bearer eyJhbGciOi... with error")).toBe("Failed: bearer=*** with error");
    expect(maskSecrets("token=secret123456")).toBe("token=***");
    expect(maskSecrets("password: myPassword;")).toBe("password=***;");
    expect(maskSecrets("auth=Bearer 99999")).toBe("auth=*** 99999");
    expect(maskSecrets("apiKey=xyz123, code=401")).toBe("apiKey=***, code=401");
    expect(maskSecrets("secret: topsecret")).toBe("secret=***");
  });

  it("leaves normal error text untouched", () => {
    const msg = "Connection refused to database on port 5432";
    expect(maskSecrets(msg)).toBe(msg);
  });

  it("truncates very long error text to 500 characters", () => {
    const longText = "x".repeat(600);
    expect(maskSecrets(longText).length).toBe(500);
  });
});
