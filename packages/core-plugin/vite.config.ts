/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { browserTestConfig, DEFAULT_THRESHOLDS } from '../../vitest.shared.mjs';

export default defineConfig({
  test: browserTestConfig({ thresholds: DEFAULT_THRESHOLDS }),
});
