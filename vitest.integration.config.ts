import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    cache: false,
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    fileParallelism: false,
  },
});
