import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const API_DIR = join(process.cwd(), "src/app/api");
const SRC_DIR = join(process.cwd(), "src");

// Routes that authenticate by other means than a user session.
const PUBLIC_ROUTES = new Map<string, string>([
  ["auth/[...nextauth]/route.ts", "NextAuth handler"],
  
]);

const AUTH_PATTERN =
  /getSession|requireUser|getServerSession|guardProjectReport|verifyWebhook|verifySignature|timingSafeEqual|checkWebhook|webhookSecret|WEBHOOK_SECRET|CRON_SECRET/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function resolveAlias(spec: string): string | null {
  if (!spec.startsWith("@/")) return null;
  const base = join(SRC_DIR, spec.slice(2));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Route source plus the sources of the local modules it imports (one level deep). */
function sourceWithImports(file: string): string {
  const src = readFileSync(file, "utf8");
  const imported = [...src.matchAll(/from\s+["'](@\/[^"']+)["']/g)]
    .map((m) => resolveAlias(m[1]))
    .filter((p): p is string => p !== null)
    .map((p) => readFileSync(p, "utf8"));
  const relative_ = [...src.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)]
    .map((m) => join(file, "..", m[1]))
    .flatMap((base) => [`${base}.ts`, join(base, "index.ts")])
    .filter((p) => existsSync(p))
    .map((p) => readFileSync(p, "utf8"));
  return [src, ...imported, ...relative_].join("\n");
}

describe("API route authentication", () => {
  const routes = walk(API_DIR).filter((f) => f.endsWith("/route.ts"));

  it("finds the API routes", () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it.each(routes.map((f) => [relative(API_DIR, f), f]))("%s authenticates the caller", (rel, file) => {
    if (PUBLIC_ROUTES.has(rel)) return;
    expect(sourceWithImports(file)).toMatch(AUTH_PATTERN);
  });
});
