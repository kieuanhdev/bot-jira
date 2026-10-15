import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { validateProductionSecrets } from "./env";

const setEnv = (key: string, val: string | undefined) => {
  if (val === undefined) {
    delete (process.env as Record<string, string | undefined>)[key];
  } else {
    (process.env as Record<string, string | undefined>)[key] = val;
  }
};

describe("validateProductionSecrets (REF-017)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("does not throw in development or test even when secrets are missing", () => {
    setEnv("NODE_ENV", "development");
    setEnv("NEXTAUTH_SECRET", undefined);
    setEnv("CRED_ENCRYPTION_KEY", undefined);
    expect(() => validateProductionSecrets()).not.toThrow();

    setEnv("NODE_ENV", "test");
    expect(() => validateProductionSecrets()).not.toThrow();
  });

  it("does not throw during next build (phase-production-build) in production", () => {
    setEnv("NODE_ENV", "production");
    setEnv("NEXT_PHASE", "phase-production-build");
    setEnv("NEXTAUTH_SECRET", undefined);
    setEnv("CRED_ENCRYPTION_KEY", undefined);
    expect(() => validateProductionSecrets()).not.toThrow();
  });

  it("throws clear error when NEXTAUTH_SECRET is missing in production runtime", () => {
    setEnv("NODE_ENV", "production");
    setEnv("NEXT_PHASE", undefined);
    setEnv("NEXTAUTH_SECRET", undefined);
    setEnv("CRED_ENCRYPTION_KEY", "dummy-encryption-key-for-test-32chars");

    expect(() => validateProductionSecrets()).toThrowError(/NEXTAUTH_SECRET/);
  });

  it("throws clear error when CRED_ENCRYPTION_KEY is missing in production runtime", () => {
    setEnv("NODE_ENV", "production");
    setEnv("NEXT_PHASE", undefined);
    setEnv("NEXTAUTH_SECRET", "dummy-auth-secret");
    setEnv("CRED_ENCRYPTION_KEY", undefined);

    expect(() => validateProductionSecrets()).toThrowError(/CRED_ENCRYPTION_KEY/);
  });

  it("does not throw in production runtime when all required secrets are provided", () => {
    setEnv("NODE_ENV", "production");
    setEnv("NEXT_PHASE", undefined);
    setEnv("NEXTAUTH_SECRET", "dummy-auth-secret");
    setEnv("CRED_ENCRYPTION_KEY", "dummy-encryption-key-for-test-32chars");

    expect(() => validateProductionSecrets()).not.toThrow();
  });
});
