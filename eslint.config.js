import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import tsParser from '@typescript-eslint/parser';

/**
 * ESLint 9 flat configuration.
 *
 * The repository carried a `.eslintrc.json` that ESLint 9 no longer reads, so `npm run lint` had
 * been failing with "couldn't find an eslint.config.js" for as long as ESLint 9 has been installed.
 * That file also pointed its TypeScript parser at `./packages/bridge/tsconfig-typchk.json`, a path
 * that does not exist in this repository.
 *
 * This replaces it. The type-aware parser is gone: nothing in the old rule set needed type
 * information, and `npm run typchk` is what checks types.
 */
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.wireit/**',
      '**/test-results/**',
      '**/playwright-report/**',
      // Scratch git worktrees, not part of the repository.
      '.claude/**',
      // Templates the scaffolder copies out; they are not part of this codebase.
      'packages/create-app/src/*/static/**',
      'packages/create-app/src/*/templates/**',
      'packages/example/*/dist/**',
    ],
  },

  js.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
      // Formatting is prettier's job; these are the ones that carry meaning.
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      // The codebase calls obj.hasOwnProperty(...) directly in sixteen places. The rule is
      // right that this breaks on null-prototype objects, but rewriting the call sites is a
      // change to framework behaviour and does not belong in a CI pull request. Warn, so it
      // is visible without blocking a commit.
      'no-prototype-builtins': 'warn',
    },
  },

  {
    // A vendored port of Node's EventEmitter. Left as it came so it can be diffed against
    // upstream; its style is not this repository's to enforce.
    files: ['packages/core/src/external/**'],
    rules: {
      'no-redeclare': 'off',
    },
  },

  {
    // TypeScript sources: parsed, not type-checked. `npm run typchk` does the types.
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { decorators: true } },
    },
    rules: {
      // The TypeScript compiler reports these, and it understands type-only imports and
      // declaration merging, which the base rule does not.
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },

  {
    // Test files run under a describe/it globals harness.
    files: ['**/test/**/*.js', '**/tests/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        ...globals.mocha,
        expect: 'readonly',
        sinon: 'readonly',
      },
    },
  },

  // Keep prettier last so it switches off anything that would fight the formatter.
  prettier,
];
