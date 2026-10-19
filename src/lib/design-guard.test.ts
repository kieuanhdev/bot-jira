import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Design regression guard test.
 *
 * Scans directories that have undergone migration to enforce:
 * 1. No ad-hoc micro-text classes text-[(8|9|10|11|13)px] (except jira-avatar.tsx for xs avatar).
 * 2. No hardcoded Tailwind palette classes ((bg|text|border|ring)-<color>-<shade>).
 *
 * MIGRATED_DIRS starts with ["src/components"] in Phase 1 and expands in subsequent phases.
 */
export const MIGRATED_DIRS = [
  "src/components",
  "src/app/(app)",
  "src/app/(app)/board",
  "src/app/(app)/issue",
  "src/app/(app)/bulk",
  "src/app/(app)/reports",
  "src/app/(app)/stale",
  "src/app/(app)/branches",
  "src/app/(app)/release",
  "src/app/(app)/leaderboard",
  "src/app/(app)/admin",
  "src/app/(app)/settings",
  "src/app/(app)/notifications",
  "src/app/(app)/sentry",
  "src/app/(app)/watch",
  "src/app/(auth)",
];

const FORBIDDEN_MICRO_TEXT_REGEX = /text-\[(8|9|10|11|13)px\]/g;
const FORBIDDEN_PALETTE_REGEX =
  /\b(?:bg|text|border|ring)-(?:emerald|purple|sky|amber|red|rose|green|blue|yellow|orange|violet|indigo|slate|gray|zinc)-\d+\b/g;

// Directories where only top-level files are migrated in current phase
const SHALLOW_DIRS = new Set(["src/app/(app)"]);

function collectTsxFiles(dirPath: string): string[] {
  const fullPath = path.resolve(process.cwd(), dirPath);
  if (!fs.existsSync(fullPath)) return [];

  const results: string[] = [];
  const entries = fs.readdirSync(fullPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryFullPath = path.join(fullPath, entry.name);
    if (entry.isDirectory()) {
      if (!SHALLOW_DIRS.has(dirPath)) {
        results.push(...collectTsxFiles(path.relative(process.cwd(), entryFullPath)));
      }
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      results.push(path.relative(process.cwd(), entryFullPath));
    }
  }

  return results;
}

describe("design guard regression tests", () => {
  const allFiles = MIGRATED_DIRS.flatMap((dir) => collectTsxFiles(dir));

  it("finds tsx files in migrated directories", () => {
    expect(allFiles.length).toBeGreaterThan(0);
  });

  it("does not contain forbidden micro-text classes in migrated directories", () => {
    const violations: string[] = [];

    for (const filePath of allFiles) {
      const content = fs.readFileSync(path.resolve(process.cwd(), filePath), "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        // jira-avatar.tsx is explicitly permitted to use text-[9px] for xs avatar
        if (filePath.endsWith("jira-avatar.tsx") && line.includes("text-[9px]")) {
          return;
        }

        const matches = line.match(FORBIDDEN_MICRO_TEXT_REGEX);
        if (matches) {
          violations.push(
            `${filePath}:${index + 1} contains micro-text "${matches.join(", ")}":\n  ${line.trim()}`
          );
        }
      });
    }

    expect(
      violations,
      `Found forbidden micro-text classes in migrated files:\n${violations.join("\n")}`
    ).toEqual([]);
  });

  it("does not contain raw palette classes in migrated directories", () => {
    const violations: string[] = [];

    for (const filePath of allFiles) {
      const content = fs.readFileSync(path.resolve(process.cwd(), filePath), "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        const matches = line.match(FORBIDDEN_PALETTE_REGEX);
        if (matches) {
          violations.push(
            `${filePath}:${index + 1} contains raw palette class "${matches.join(", ")}":\n  ${line.trim()}`
          );
        }
      });
    }

    expect(
      violations,
      `Found forbidden raw palette classes in migrated files:\n${violations.join("\n")}`
    ).toEqual([]);
  });
});
