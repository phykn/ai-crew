import { defineConfig } from "vitest/config";

// Source lives under src/{backend,frontend,shared}; every test lives under tests/
// in the same shape, so the suite and the code it checks stay apart.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
