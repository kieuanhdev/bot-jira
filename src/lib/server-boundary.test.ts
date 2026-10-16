import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";

describe("Server-only import boundaries (REF-040)", () => {
  const eslint = new ESLint();

  it("blocks runtime imports of server modules in client components", async () => {
    const code = `import { prisma } from "@/lib/prisma";\nexport function Component() { return <div>{String(Boolean(prisma))}</div>; }\n`;
    const [result] = await eslint.lintText(code, {
      filePath: "src/app/(app)/board/test-client.tsx",
    });

    const restrictedError = result.messages.find(
      (m) => m.ruleId === "no-restricted-imports"
    );
    expect(restrictedError).toBeDefined();
    expect(restrictedError?.message).toContain("Client modules must not import server-only modules");
  });

  it("allows type-only imports of server modules in client components", async () => {
    const code = `import type { Prisma } from "@/lib/prisma";\nexport type UserSelect = Prisma.UserSelect;\n`;
    const [result] = await eslint.lintText(code, {
      filePath: "src/app/(app)/board/test-client.tsx",
    });

    const restrictedError = result.messages.find(
      (m) => m.ruleId === "no-restricted-imports"
    );
    expect(restrictedError).toBeUndefined();
  });

  it("blocks runtime imports of server modules in reusable components", async () => {
    const code = `import { env } from "@/lib/env";\nexport function Header() { return <div>{env.NODE_ENV}</div>; }\n`;
    const [result] = await eslint.lintText(code, {
      filePath: "src/components/shared/test-header.tsx",
    });

    const restrictedError = result.messages.find(
      (m) => m.ruleId === "no-restricted-imports"
    );
    expect(restrictedError).toBeDefined();
    expect(restrictedError?.message).toContain("Client modules must not import server-only modules");
  });

  it("blocks runtime imports of server modules in hooks", async () => {
    const code = `import { getSession } from "@/lib/session";\nexport function useSessionGate() { return getSession(); }\n`;
    const [result] = await eslint.lintText(code, {
      filePath: "src/hooks/use-session-gate.ts",
    });

    const restrictedError = result.messages.find(
      (m) => m.ruleId === "no-restricted-imports"
    );
    expect(restrictedError).toBeDefined();
    expect(restrictedError?.message).toContain("Client modules must not import server-only modules");
  });

  it("allows server modules in src/lib to import prisma, session, env, and user-creds", async () => {
    const code = `import { prisma } from "@/lib/prisma";\nimport { env } from "@/lib/env";\nexport async function getStats() { return { prisma, env }; }\n`;
    const [result] = await eslint.lintText(code, {
      filePath: "src/lib/test-service.ts",
    });

    const restrictedError = result.messages.find(
      (m) => m.ruleId === "no-restricted-imports"
    );
    expect(restrictedError).toBeUndefined();
  });
});
