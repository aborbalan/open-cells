/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    globals: true,
    // The scaffolder writes files: this one runs in Node, not in a browser.
    environment: 'node',
    // Generating a whole application tree is slower than a unit test.
    testTimeout: 60000,
    // No coverage gate here on purpose. The suite runs the published entry point as a
    // child process — the way `npx @open-cells/create-app` does — so the generator's
    // statements execute outside this process and istanbul cannot see them. What this
    // suite proves is that both templates generate an application that is actually
    // there and well formed, which line coverage would not tell us either way.
    coverage: {
      enabled: false,
    }
  },
})
