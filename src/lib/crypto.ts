import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * AES-256-GCM encryption for per-user Jira/Bitbucket credentials.
 *
 * The master key comes from CRED_ENCRYPTION_KEY (a 64-char hex string = 32 bytes,
 * or any string which we hash to 32 bytes). Each encrypt() call generates a fresh
 * 12-byte IV and a 16-byte auth tag; the stored value is base64(iv:tag:ciphertext).
 *
 * We deliberately use a constant-time tag check implicitly provided by GCM's
 * built-in auth: a wrong key makes decryption throw.
 */

function masterKey(): Buffer {
  // Read live from process.env so the key can be swapped (tests) and is always
  // current, rather than a value frozen at module load.
  const raw = process.env.CRED_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("CRED_ENCRYPTION_KEY is not set. Add a 64-char hex key to .env");
  }
  // If it's exactly 64 hex chars, use it directly as 32 bytes.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  // Otherwise derive a stable 32-byte key via SHA-256.
  return createHash("sha256").update(raw).digest();
}

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

export function encrypt(plaintext: string): string {
  const key = masterKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(ciphertext: string): string {
  const key = masterKey();
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Decrypt a stored credential blob, returning null on failure (bad key / corrupt). */
export function safeDecrypt(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  try {
    return decrypt(ciphertext);
  } catch {
    return null;
  }
}

/** Generate a fresh 64-char hex key (for `npx tsx -e` setup helpers). */
export function generateKey(): string {
  return randomBytes(32).toString("hex");
}
