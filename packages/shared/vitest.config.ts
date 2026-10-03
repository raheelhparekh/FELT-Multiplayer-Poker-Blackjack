import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // When source imports use `.js` extensions (correct for Node ESM output),
    // Vitest/Vite must be told to also look for `.ts` files.
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },
  test: {
    globals: false,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    },
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
  },
});
