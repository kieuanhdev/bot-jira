import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
  ]),
  // Import boundary: shared/ must not import from route/domain/hook layers.
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
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
