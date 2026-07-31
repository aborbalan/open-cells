# Testing scorecard

Tracks the test-health of this fork against the ten sections of the July 2026 audit.
The baseline was **3.1/10**; the target is 10/10 in every section.

**A score is never declared, only demonstrated.** Every row links to the PR that moved it and
quotes the output of the command that proves it. If there is no pasted output, the section has
not moved.

| # | Section | Baseline | Current | Target | Moved by |
|---|---|---:|---:|---:|---|
| 1 | Runnable suite | 3 | **10** | 10 | `test/s1-runnable-suite` |
| 2 | `core` coverage | 4 | **10** | 10 | `test/s2-core-coverage` |
| 3 | Per-package coverage | 2 | **10** | 10 | `test/s3-package-coverage` |
| 4 | `core` test quality | 4 | **10** | 10 | `test/s2-core-coverage`, `test/s4-test-quality` |
| 5 | `localize` tests | 9 | 9 | 10 | — |
| 6 | E2E tests | 2 | 2 | 10 | — |
| 7 | CI and quality gates | 1 | **5** | 10 | `test/s1-runnable-suite`, `test/s2-core-coverage` (partial) |
| 8 | Test infrastructure | 5 | **6** | 10 | `test/s3-package-coverage` (partial) |
| 9 | Test dependency hygiene | 3 | 3 | 10 | — |
| 10 | Types and public contract | 3 | 3 | 10 | — |
| | **Weighted total** | **3.1** | **7.85** | **10** | |

Weights: §1 20%, §2 15%, §3 15%, §4 10%, §5 5%, §6 10%, §7 15%, §8 5%, §9 3%, §10 2%.

## Agreed thresholds

| Package | Lines | Branches |
|---|---:|---:|
| `@open-cells/core` | 90% | 85% |
| `@open-cells/localize` | 95% | 95% |

`packages/core/vite.config.ts` carries a **ratchet**: raise it in the PR that adds the coverage,
never lower it to make a run pass. It now sits at the agreed target and CI fails below it.

## Evidence

### §1 — Runnable suite: 3 → 10

Before this change the suite could not run at all. `core` failed to load 15 of its 19 test files
because `sinon` was imported but never declared, and the e2e suite ran **zero** tests because
Playwright's `webServer` builds `recipes-app` with `tsc`, which failed with 9 errors.

```
$ npm run -w @open-cells/core test
 Test Files  19 passed (19)
      Tests  105 passed (105)
All files          |   56.18 |    37.41 |   53.01 |   57.04 |

$ npm exec -w @open-cells/recipes-app -- tsc --noEmit
tsc exit: 0

$ npm run -w @open-cells/recipes-app test
  18 passed (38.5s)

$ npm test
✅ Ran 2 scripts and skipped 0 in 44,7s.
```

Carried forward: the split Playwright toolchain (§9) and the e2e suite's dependency on the live
TheMealDB API (§6).

### §2 — `core` coverage: 4 → 10

```
$ npm run -w @open-cells/core test
 Test Files  20 passed (20)
      Tests  611 passed (611)

Statements   : 92.15%
Branches     : 85.38%
Functions    : 91.58%
Lines        : 92.57%
exit: 0

$ npm test
✅ Ran 2 scripts and skipped 0 in 52,3s.
exit: 0
```

The larger unit suite also exposed a scheduling problem: wireit ran `core:test` and
`recipes-app:test` concurrently, and two browser stacks at once crash the browser process on
Windows (`STATUS_STACK_BUFFER_OVERRUN`). Both suites passed alone and the pair failed. The e2e
script now declares a wireit dependency on the unit suite so they run in sequence.

Per file, statements / branches, from the audit baseline:

| File | Before | After |
|---|---|---|
| `router.js` | 52.91 / 41.74 | 89.86 / 80.95 |
| `component-connector.js` | 25.00 / 8.97 | 89.60 / 87.34 |
| `bridge.js` | 53.33 / 38.01 | 89.00 / 86.77 |
| `external/event-emitter.js` | 45.96 / 30.30 | 80.64 / 70.90 |
| `manager/bridge-channels.js` | 46.57 / 7.69 | 100 / 73.33 |
| `manager/action-channels.js` | 25.80 / 0 | 100 / 94.11 |
| `manager/template.js` | 53.94 / 29.72 | 98.68 / 91.89 |
| `manager/storage.js` | 77.27 / 60.00 | 100 / 100 |
| `manager/post-message.js` | 36.36 / 20.00 | 100 / 100 |
| `adapter/element-adapter.js` | 25.00 / 11.11 | 100 / 96.29 |
| `navigation-stack.js` | 67.50 / 64.70 | 100 / 100 |
| `route.js`, `template.js`, `utils.js` | — | 100 / 100 |

#### Three defects the coverage work uncovered

1. **`_hasPublisher()` never matched.** RxJS renamed `Subscription`'s child list from
   `_subscriptions` to `_finalizers` in v7 and the `|| []` fallback turned the miss into a silent
   `false`, so `addPublication()` registered a duplicate DOM listener — and a duplicate channel
   emission — on every call. The same read in `getCCSubscriptions()` made every out connection
   disappear.
2. **`Router.stop()` did not stop the router.** `start()` attached its handler with
   `subscription.forEach(...)`, which returns a Promise rather than a Subscription, so nothing
   held a handle to the location pipeline. Every bridge built in a page left another one alive.
3. **A reset channel was dead for good.** `Channel.unsubscribe()` is documented as keeping the
   channel open but reopened it by writing `this.stoped`; the flag is `isStopped`. Everything
   published on a channel that had been through `resetBridgeChannels()` — the path `logout()`
   takes — was silently dropped.

### §3 — Per-package coverage: 2 → 10

Six packages that ship to npm had no test at all, and `create-app` — the scaffolder every new
user meets first — had none either. Every package now has its own vitest harness with its test
dependencies declared explicitly, and `include: ['src/**/*.js']` so the report counts every
source file rather than only the ones a test happened to import.

| Package | Tests | Statements / branches |
|---|---:|---|
| `core-plugin` | 28 | 100 / 100 |
| `element-controller` | 22 | 100 / 94.7 |
| `page-controller` | 18 | 100 / 91.7 |
| `page-mixin` | 20 | 100 / 91.7 |
| `page-transitions` | 43 | 100 / 96.8 |
| `create-app` | 15 | smoke test, see below |

`create-app` carries no coverage gate on purpose: the suite runs the published entry point as a
child process, the way `npx @open-cells/create-app` does, so the generator's statements execute
outside the test process. What it proves is that both templates generate an application that is
actually there and well formed — line coverage would not tell us that either way.

**The defect it found:** `CorePlugin.addCellsCoreToPrototype()` called the bare identifier
`_plugCellsCoreToPrototype(...)`, which is not in scope. Every call threw a `ReferenceError`
instead of installing the API on the prototype.

`page-mixin` had declared `@open-wc/testing` and `lit-element` as devDependencies without having
a single test; they are gone.

Every workspace now runs from the root, in sequence:

```
$ npm test
@open-cells/core                 647 passed (20 files)
@open-cells/core-plugin           28 passed (2 files)
@open-cells/create-app            15 passed (1 file)
@open-cells/element-controller    22 passed (1 file)
@open-cells/localize              42 passed (7 files)
@open-cells/page-controller       18 passed (1 file)
@open-cells/page-mixin            20 passed (1 file)
@open-cells/page-transitions      43 passed (3 files)
@open-cells/recipes-app           18 passed (e2e)
                                 ---
                                 853 passed
exit: 0
```

That is up from 105 tests actually running at the time of the audit.

### §8 — Test infrastructure: 5 → 6 (partial)

The root `test` script no longer goes through wireit. wireit ran the workspace suites
concurrently and, with nine of them driving real browsers, the machine ran out of memory — the
run died with `VirtualAlloc ... failed` before a single suite finished. Since no wireit caching
was configured for tests, it was providing parallelism and nothing else. `npm run test
--workspaces --if-present` runs them in sequence, which is what this workload needs. Still open
for §8: the combined coverage report, the browser matrix, and the shared helpers.

### §4 — `core` test quality: 4 → 10

Part of this fell out of §2 and §3: the duplicated `router.test.js` (which declared
`describe('Router')` but exercised `Route`) is gone, the three assertion-free
`subscriptor.test.js` cases now assert, and every `describe.skip`, commented-out test block and
`// Add more tests` placeholder in the repository is gone. A sweep confirms it:

```
$ # skip / commented-out test / TODO markers across every *.test.js
(no matches)
```

The rest landed here.

**The tautological test is finally gone.** The §2 pull request claimed it had been removed; that
was wrong, it was still in `channel.test.js`:

```js
const unsubscribeStub = sinon.stub(channel, 'unsubscribe');
channel.unsubscribe();                      // calls the stub
expect(unsubscribeStub.called).to.be.true;  // always green
```

The file now has 26 cases that assert on behaviour, including the one that test was pretending
to cover: that `unsubscribe()` leaves the channel usable, which is the whole reason the method
is overridden — and the invariant the `isStopped` fix in §2 restored.

**Every `core` suite now isolates through a sinon sandbox.** Five files used the global `sinon`,
one of them with no `restore()` at all, so a stub could outlive its test. `application-state`,
`application-config`, `events`, `channel` and `route` were rewritten around
`sinon.createSandbox()` with a matching `afterEach`. Four `localize` suites still use the global
sinon; that package is §5's.

**Isolation is verified, not assumed.** The suite is run under `--sequence.shuffle` with several
fixed seeds:

```
$ npx vitest --run --sequence.shuffle=true --sequence.seed=<seed>
seed 1234:      Test Files  20 passed (20) | Tests  647 passed (647)
seed 7:         Test Files  20 passed (20) | Tests  647 passed (647)
seed 20260729:  Test Files  20 passed (20) | Tests  647 passed (647)
```

**Shared fixtures replace the copy-paste.** The bridge is expensive to stand up and most of what
it touches outlives it — the Router singleton, the module-level channel collection, the shared
event emitter, the cross-component container on `document.body`. That teardown had been copied
into four packages, and getting it wrong shows up as a test that passes alone and fails in a
suite. It now lives once, in `packages/core/test/helpers/bridge-fixture.js`, and the packages
built on top of the bridge use it:

```js
const bridgeFixture = useBridge();
```

Weak assertions in `core` went from 22 of 145 to 18 of 887 — from 15% of the expectations to 2%
— and the ones left are genuine type or instance checks rather than `expect(x).to.exist` standing
in for a real expectation.

### §7 — CI and quality gates: 1 → 5 (partial)

CI ran no tests at all; it now installs browsers, runs the full suite on every push, and fails
when coverage drops below 90% lines / 85% branches. Still open: the ungated `npm publish` that
swallows its own failures, coverage reporting, the local husky/lint-staged/commitlint gate, and
branch protection.
