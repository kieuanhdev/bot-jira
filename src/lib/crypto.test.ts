import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt, safeDecrypt } from "./crypto";

// The crypto helper reads CRED_ENCRYPTION_KEY from env via the `env` singleton.
beforeAll(() => {
  process.env.CRED_ENCRYPTION_KEY = "0".repeat(64);
});

describe("crypto (AES-256-GCM)", () => {
  it("round-trips a token", () => {
    const secret = "a-jira-api-token-123";
    const enc = encrypt(secret);
    expect(enc).not.toContain(secret);
    expect(decrypt(enc)).toBe(secret);
  });

  it("produces different ciphertext for the same input (fresh IV)", () => {
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  it("safeDecrypt returns null on bad input", () => {
    expect(safeDecrypt(null)).toBeNull();
    expect(safeDecrypt("not-valid-base64!!!")).toBeNull();
  });

  it("fails to decrypt with a different key", () => {
    const enc = encrypt("secret");
    process.env.CRED_ENCRYPTION_KEY = "1".repeat(64);
    expect(safeDecrypt(enc)).toBeNull();
    process.env.CRED_ENCRYPTION_KEY = "0".repeat(64);
  });
});
