import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const SERVER_ONLY_IMPORT_RESTRICTION = {
  group: [
    "@/lib/prisma",
    "@/lib/prisma/**",
    "@/lib/session",
    "@/lib/session/**",
    "@/lib/env",
    "@/lib/env/**",
    "@/lib/user-creds",
    "@/lib/user-creds/**",
  ],
  message:
    "Client modules must not import server-only modules (@/lib/prisma, @/lib/session, @/lib/env, @/lib/user-creds). Use API routes or server actions instead.",
  allowTypeImports: true,
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".kilo/**",
    ".kilocode/**",
    ".cleanup/**",
  ]),
  // Import boundary: reusable production modules must not depend on app routes/features.
  {
    files: [
      "src/components/**/*.{ts,tsx}",
      "src/hooks/**/*.{ts,tsx}",
      "src/lib/**/*.{ts,tsx}",
    ],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/*", "@/app/**"],
              message: "Reusable modules must not import route or feature implementation from @/app.",
            },
          ],
        },
      ],
    },
  },
  // Import boundary (REF-040): Reusable client UI and hooks must not import server-only modules.
  {
    files: [
      "src/components/**/*.{ts,tsx}",
      "src/hooks/**/*.{ts,tsx}",
    ],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/*", "@/app/**"],
              message: "Reusable modules must not import route or feature implementation from @/app.",
            },
            SERVER_ONLY_IMPORT_RESTRICTION,
          ],
        },
      ],
    },
  },
  // Import boundary: shared/ must not import from route/domain/hook layers or server-only modules.
  {
    files: ["src/components/shared/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/*", "@/app/**"],
              message: "shared/ components must not import from route files (@/app).",
            },
            {
              group: ["@/hooks/*", "@/hooks/**"],
              message: "shared/ components must not import domain hooks. Pass callbacks via props.",
            },
            {
              group: ["@/lib/releases/*", "@/lib/releases/**", "@/lib/branches/*", "@/lib/branches/**", "@/lib/board/*", "@/lib/board/**"],
              message: "shared/ components must not import domain lib. Keep domain logic out of the shared layer.",
            },
            SERVER_ONLY_IMPORT_RESTRICTION,
          ],
        },
      ],
    },
  },
  // Import boundary (REF-040): Client components must not import server-only modules at runtime.
  {
    files: ["src/app/**/*-client.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [SERVER_ONLY_IMPORT_RESTRICTION],
        },
      ],
    },
  },
]);

export default eslintConfig;
