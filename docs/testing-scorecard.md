# Testing scorecard

Tracks the test-health of this fork against the ten sections of the July 2026 audit.
The baseline was **3.1/10**; the target is 10/10 in every section.

**A score is never declared, only demonstrated.** Every row links to the PR that moved it and
quotes the output of the command that proves it. If there is no pasted output, the section has
not moved.

| # | Section | Baseline | Current | Target | Moved by |
|---|---|---:|---:|---:|---|
| 1 | Runnable suite | 3 | **10** | 10 | `test/s1-runnable-suite` |
| 2 | `core` coverage | 4 | 4 | 10 | — |
| 3 | Per-package coverage | 2 | 2 | 10 | — |
| 4 | `core` test quality | 4 | 4 | 10 | — |
| 5 | `localize` tests | 9 | 9 | 10 | — |
| 6 | E2E tests | 2 | 2 | 10 | — |
| 7 | CI and quality gates | 1 | **4** | 10 | `test/s1-runnable-suite` (partial) |
| 8 | Test infrastructure | 5 | 5 | 10 | — |
| 9 | Test dependency hygiene | 3 | 3 | 10 | — |
| 10 | Types and public contract | 3 | 3 | 10 | — |
| | **Weighted total** | **3.1** | **4.95** | **10** | |

Weights: §1 20%, §2 15%, §3 15%, §4 10%, §5 5%, §6 10%, §7 15%, §8 5%, §9 3%, §10 2%.

## Agreed thresholds

| Package | Lines | Branches |
|---|---:|---:|
| `@open-cells/core` | 90% | 85% |
| `@open-cells/localize` | 95% | 95% |

`packages/core/vite.config.ts` carries a **ratchet**: it is set to the level currently achieved and
raised by every PR that adds coverage. It is never lowered. It currently sits at 57 lines /
37 branches — the level the suite reached the day it first ran.

## Evidence

### §1 — Runnable suite: 3 → 10

Before this change the suite could not run at all. `core` failed to load 15 of its 19 test files
because `sinon` was imported but never declared, and the e2e suite ran **zero** tests because
Playwright's `webServer` builds `recipes-app` with `tsc`, which failed with 9 errors.

```
$ npm run -w @open-cells/core test
 Test Files  19 passed (19)
      Tests  105 passed (105)
   Duration  22.19s

File               | % Stmts | % Branch | % Funcs | % Lines |
All files          |   56.18 |    37.41 |   53.01 |   57.04 |
exit: 0
```

```
$ npm exec -w @open-cells/recipes-app -- tsc --noEmit
tsc exit: 0
```

```
$ npm run -w @open-cells/recipes-app test
  18 passed (38.5s)
```

```
$ npm test
✅ Ran 2 scripts and skipped 0 in 44,7s.
exit: 0
```

Two findings surfaced while doing this and are carried forward rather than fixed here:

- **The Playwright toolchain is split.** The tree resolves 1.58.2 for vitest's browser provider and
  `@web/test-runner-playwright`, and 1.62.0 for `recipes-app`'s `@playwright/test`, so browsers must
  be installed per workspace. npm `overrides` cannot fix it — they do not apply to a workspace's
  direct dependencies. Tracked in §9.
- **The e2e suite still calls the live TheMealDB API**, so "green" depends on a third-party service
  being up. Tracked in §6.

### §7 — CI and quality gates: 1 → 4 (partial)

CI ran no tests at all; it ran `npm run build` and nothing else. It now installs browsers and runs
the full suite on every push. The rest of the section — an ungated `npm publish` that swallows its
own failures, coverage reporting, the local husky/lint-staged/commitlint gate, and branch
protection — is untouched and keeps this section short of its target.
