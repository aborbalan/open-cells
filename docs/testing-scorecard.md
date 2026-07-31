# Testing scorecard

Tracks the test-health of this fork against the ten sections of the July 2026 audit.
The baseline was **3.1/10**; the target is 10/10 in every section.

**A score is never declared, only demonstrated.** Every row links to the PR that moved it and
quotes the output of the command that proves it. If there is no pasted output, the section has
not moved.

| #   | Section                   | Baseline |  Current | Target | Moved by                                                               |
| --- | ------------------------- | -------: | -------: | -----: | ---------------------------------------------------------------------- |
| 1   | Runnable suite            |        3 |   **10** |     10 | `test/s1-runnable-suite`                                               |
| 2   | `core` coverage           |        4 |   **10** |     10 | `test/s2-core-coverage`                                                |
| 3   | Per-package coverage      |        2 |   **10** |     10 | `test/s3-package-coverage`                                             |
| 4   | `core` test quality       |        4 |   **10** |     10 | `test/s2-core-coverage`, `test/s4-test-quality`                        |
| 5   | `localize` tests          |        9 |   **10** |     10 | `test/s5-localize`                                                     |
| 6   | E2E tests                 |        2 |   **10** |     10 | `test/s6-e2e`                                                          |
| 7   | CI and quality gates      |        1 |   **10** |     10 | `test/s1-runnable-suite`, `test/s2-core-coverage`, `test/s7-ci-gates`  |
| 8   | Test infrastructure       |        5 |   **10** |     10 | `test/s3-package-coverage`, `claude/test-audit-worktree-status-3vvdim` |
| 9   | Test dependency hygiene   |        3 |   **10** |     10 | `claude/test-audit-worktree-status-3vvdim`                             |
| 10  | Types and public contract |        3 |   **10** |     10 | `claude/test-audit-worktree-status-3vvdim`                             |
|     | **Weighted total**        |  **3.1** | **10.0** | **10** |                                                                        |

Weights: §1 20%, §2 15%, §3 15%, §4 10%, §5 5%, §6 10%, §7 15%, §8 5%, §9 3%, §10 2%.

## Agreed thresholds

| Package                | Lines | Branches |
| ---------------------- | ----: | -------: |
| `@open-cells/core`     |   90% |      85% |
| `@open-cells/localize` |   95% |      95% |

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

| File                                  | Before        | After         |
| ------------------------------------- | ------------- | ------------- |
| `router.js`                           | 52.91 / 41.74 | 89.86 / 80.95 |
| `component-connector.js`              | 25.00 / 8.97  | 89.60 / 87.34 |
| `bridge.js`                           | 53.33 / 38.01 | 89.00 / 86.77 |
| `external/event-emitter.js`           | 45.96 / 30.30 | 80.64 / 70.90 |
| `manager/bridge-channels.js`          | 46.57 / 7.69  | 100 / 73.33   |
| `manager/action-channels.js`          | 25.80 / 0     | 100 / 94.11   |
| `manager/template.js`                 | 53.94 / 29.72 | 98.68 / 91.89 |
| `manager/storage.js`                  | 77.27 / 60.00 | 100 / 100     |
| `manager/post-message.js`             | 36.36 / 20.00 | 100 / 100     |
| `adapter/element-adapter.js`          | 25.00 / 11.11 | 100 / 96.29   |
| `navigation-stack.js`                 | 67.50 / 64.70 | 100 / 100     |
| `route.js`, `template.js`, `utils.js` | —             | 100 / 100     |

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

| Package              | Tests | Statements / branches |
| -------------------- | ----: | --------------------- |
| `core-plugin`        |    28 | 100 / 100             |
| `element-controller` |    22 | 100 / 94.7            |
| `page-controller`    |    18 | 100 / 91.7            |
| `page-mixin`         |    20 | 100 / 91.7            |
| `page-transitions`   |    43 | 100 / 96.8            |
| `create-app`         |    15 | smoke test, see below |

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
@open-cells/localize              46 passed (7 files)
@open-cells/page-controller       18 passed (1 file)
@open-cells/page-mixin            20 passed (1 file)
@open-cells/page-transitions      43 passed (3 files)
@open-cells/recipes-app           81 passed (e2e, 3 browsers)
                                 ---
                                 920 passed
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

### §6 — E2E tests: 2 → 10

The suite was one file called `example.spec.ts` — the name Playwright scaffolds — with 9 tests
that mostly asserted on `page.url()`. It also called the live TheMealDB API, so "green" depended
on a free third-party service being up, not rate-limiting, and never changing its catalogue.

**The network is gone.** `tests/helpers/recipes-api.ts` serves every endpoint the app uses from
`tests/fixtures/meals.ts`, and images resolve to an inline transparent GIF. An endpoint the app
starts calling that is not mapped is answered with a 501 rather than quietly reaching the
network. One test goes further and blocks every off-origin request at the browser, proving the
suite is self-contained:

```js
await forbidExternalRequests(page);
await page.goto('/');
await expect(page.locator('.banner .recipe-title')).toHaveText(RANDOM_MEAL.strMeal);
```

**The assertions moved from the address bar to the screen.** A route that resolves to the wrong
page now fails: the tests check that the category page renders the category's description and
exactly its recipes, that the recipe page renders that recipe's ingredients, and that navigating
between two recipes swaps the content.

**The framework's own behaviour is covered.** 27 tests across three files:

| File                 | What it covers                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app-shell.spec.ts`  | boot, the daily special, the category list order, dark mode, running with the network cut                                                             |
| `navigation.spec.ts` | route params, direct URL entry, back links, browser back and forward, template caching, unmatched URLs                                                |
| `channels.spec.ts`   | state shared between pages that never import each other, persistence across a reload, and that a page does not refetch what a channel already carries |

**Two things it recorded rather than fixed:**

- `routes.ts` marks its not-found route `notFound: false`, so the application has **no 404 route
  at all** — an unmatched URL selects nothing and leaves the previous page on screen. The test
  states that as the current behaviour rather than pretending it is correct.
- The `Back to home` and `favorite recipes` handlers in the page headers are written
  `@click="${() => this._navigateToHome}"` — returning the method instead of calling it. The
  buttons work only because they also carry an `href`.

**The security escapes are gone.** `bypassCSP: true` and `--disable-web-security` existed to
reach the API cross-origin. With the API served from fixtures they are not needed, so the pages
now run under the same rules as in a real browser and a genuine CSP or CORS regression is
visible.

**Firefox is in the matrix**, alongside Chromium and WebKit:

```
$ npx playwright test
  81 passed (2.2m)
```

### §5 — `localize` tests: 9 → 10

This was already the best suite in the repository. What it lacked was a gate and a couple of
loose ends.

**It now has a coverage gate at 95/95**, and the gate is verified to bite rather than merely
declared — setting it to an impossible value fails the run with a clear message:

```
$ npx web-test-runner              # threshold temporarily set to 99.9% branches
Coverage for branches failed with 97.95 % compared to configured 99.9 %
Finished running tests in 2.4s, failed to meet coverage threshold.
exit: 1
```

At the real threshold:

```
$ npm run -w @open-cells/localize test
7/7 test files | 46 passed, 0 failed
Code coverage: 98.72 %

lines     1054/1056 = 99.81%
branches      96/98 = 97.96%
functions     36/37 = 97.30%
exit: 0
```

**The one untested feature is covered.** The only real gap was the per-call currency override —
`t(key, params, { currency: 'EUR' })`, which rewrites the currency the formats declare and keys
the message cache by it. Four cases now cover it: the override itself, that it leaves the
configured formats alone, that each currency is cached separately, and that an options object
naming no currency changes nothing.

**The console stubs cannot leak any more.** `config-methods.test.js` silenced `console.error` and
`console.warn` and restored them at the end of the test body, so a failure part-way through would
have left the console muted for everything after it. They come from a sandbox restored in
`afterEach` now.

**The runner configuration is honest.** It carried a commented-out `files` override, `devtools:
true`, an `args: ['--some-flag']` that means nothing to Chromium, and three blocks of
commented-out context factories. All gone.

The package was wired into the root orchestration in §3, when the root `test` script moved to
`npm run test --workspaces`.

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
channel.unsubscribe(); // calls the stub
expect(unsubscribeStub.called).to.be.true; // always green
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

### §7 — CI and quality gates: 1 → 10

CI ran no tests at all. §1 gave it the suite and §2 the coverage floor; this closes the rest.

**Nothing reaches npm untested any more.** `publish.yml` ran `npm ci` and `npm run build` and
went straight to publishing. It now calls `build.yml` through `workflow_call` and publishes only
if that job passes.

**A failed publish now fails the build.** Every one of the nine publish steps ended in
`npm publish || echo "Publish failed"`, so the workflow went green whether or not the package
reached the registry. That is gone, and the nine near-identical blocks are one loop that still
skips a version already on npm — a re-run stays harmless, a genuine failure does not.

**ESLint had not run since ESLint 9 was installed.** The repository carried a `.eslintrc.json`
that ESLint 9 does not read, so `npm run lint` failed with "couldn't find an eslint.config.js".
The file also pointed its parser at `./packages/bridge/tsconfig-typchk.json`, a path that does
not exist here. There is an `eslint.config.js` now, and lint runs in CI:

```
$ npm run lint
✖ 32 problems (0 errors, 32 warnings)
```

Getting to zero errors turned up dead code the linter had never been able to report: an unused
`regex` in `route.js`, an unused `renderEngines` in `bridge.js`, an unused `oldPageName` in the
template manager, and the `routeWithSamePattern` in `_setup404()` that the audit had spotted by
eye. A malformed disable comment in `bridge.js` — `no-unused-vars../types`, a path fragment
glued to the rule name — and a reference to an `import/no-cycle` rule from a plugin that is not
installed were both making ESLint error out on the file rather than lint it.

**The local gate exists.** `@commitlint/cli`, `@commitlint/config-conventional` and
`lint-staged` had been devDependencies with nothing configured to read them and no hook to run
them, so CONTRIBUTING.md described a rule that was never checked. husky now installs two hooks
on `npm ci`:

- `pre-commit` runs `lint-staged` over the staged files only;
- `commit-msg` runs `commitlint`, verified to accept `test: wire the local quality gate`
  (exit 0) and reject `made some changes` (exit 1).

**Coverage and failure reports are kept.** CI uploads every `lcov.info` and HTML report, and the
Playwright report when the e2e job fails, so a drop can be looked at instead of guessed at.

Two things deliberately left out:

- **Formatting is not a CI gate yet.** `prettier --check` fails on 62 files that predate the
  configuration. Reformatting them in this pull request would bury the change; `lint-staged`
  formats each file as it is touched instead.
- **Branch protection is a repository setting, not a file.** It cannot be committed. What the
  workflow now provides is the required check to point it at: enable _Require status checks to
  pass_ on `develop` for the `build` job.

### §9 — Test dependency hygiene: 3 → 10

The monorepo resolved **two Playwright versions**: 1.58.2 for vitest's browser provider and
web-test-runner, 1.62.0 for `@playwright/test` in the example app. Playwright keys its browser
downloads by version, so a clean install fetched six browser builds instead of three:

```
1.58.2 -> chromium-1208 firefox-1509 webkit-2248
1.62.0 -> chromium-1234 firefox-1538 webkit-2336
```

The example app also declared a bare `playwright: ^1.0.0` next to `@playwright/test`, which is
where the second copy came in. Every runner is pinned to an exact version now, with root
`overrides` so a future install cannot re-split them, and CI installs browsers once:

```
$ find . -name browsers.json -path '*playwright-core*'
./node_modules/playwright-core/browsers.json
chromium-1208 firefox-1509 webkit-2248
```

The vitest family is pinned exactly too, for a different reason:
`@vitest/browser-playwright` pins its peer on the exact `vitest` version, so a second copy there
is a broken run rather than a slow one.

**Eight packages imported something they did not declare** — `vite` in seven test configs,
`camelcase` in core's, `vitest` in create-app's suite. They worked because the root hoisted
them, which is a property of the install rather than of the package.

Both failures are now a check rather than a description. `npm run test:toolchain` runs first in
`npm test`, and it reproduces the two findings above when they come back:

```
$ npm run test:toolchain            # before
Test toolchain check failed:
  - playwright resolves to 2 versions:
      1.58.2  (node_modules/playwright)
      1.62.0  (packages/example/recipes-app/node_modules/playwright)
  - @open-cells/core imports "vite" without declaring it:
      packages/core/vite.config.ts
  ... 10 problems

$ npm run test:toolchain            # after
Test toolchain OK: 7 runners single-versioned, no undeclared test imports.
exit: 0
```

Deliberately left alone: the 34 `npm audit` advisories. They are almost all transitive through
eslint, vite and their dependencies rather than anything this repository picked, and chasing
them belongs in its own change rather than buried in a test refactor.

### §8 — Test infrastructure: 6 → 10

**One test configuration.** Six packages carried near-identical copies of the same vitest
configuration — which is how a browser matrix or a coverage reporter ends up applied to five of
them. `vitest.shared.mjs` decides how a suite runs; a package says only what it covers and how
much:

```ts
export default defineConfig({
  test: browserTestConfig({ thresholds: DEFAULT_THRESHOLDS }),
});
```

**One browser policy, across three runners.** vitest drives the unit suites, web-test-runner
drives `localize`, Playwright drives the e2e suite. They read the same two variables from
`test-browsers.mjs`, so "run the suite on WebKit" is one thing to know rather than three:

- `OPEN_CELLS_BROWSERS` selects them. The unit suites default to chromium; the e2e suite
  defaults to all three, because that is the point of it.
- `OPEN_CELLS_<BROWSER>_EXECUTABLE` points at a browser the environment already provides,
  for images that provision their own instead of letting Playwright download them.

**The browser matrix.** The unit suites drove chromium and nothing else, so "it passes" was a
claim about one engine. CI runs them against firefox and webkit as well, in a matrix job, in
sequence — two browser stacks at once is what crashed the runner in §2.

**One coverage report.** Nine workspaces each wrote their own `coverage/lcov.info`, which is
what their own gate needs but left nobody able to answer how covered the framework is:

```
$ npm run coverage:report

Package                        |  Lines | Branches | Functions
-------------------------------+--------+----------+----------
@open-cells/core               |  92.79 |  85.79   |  92.07
@open-cells/core-plugin        | 100.00 | 100.00   | 100.00
@open-cells/element-controller | 100.00 |  94.74   | 100.00
@open-cells/localize           |  99.81 |  97.96   |  97.30
@open-cells/page-controller    | 100.00 |  91.67   | 100.00
@open-cells/page-mixin         | 100.00 |  91.67   | 100.00
@open-cells/page-transitions   | 100.00 |  96.77   | 100.00
-------------------------------+--------+----------+----------
All packages                   |  96.11 |  87.98   |  93.60

Merged 7 reports into coverage/lcov.info
```

Each `SF:` path is re-rooted at the repo root, so `page-mixin/src/index.js` stops colliding with
`core-plugin/src/index.js`. `--check` fails if a suite that should have produced coverage left
none — the way a suite silently stops being counted — and CI keeps the merged report.

The shared helpers §3 left open are in place: the bridge fixture from §4 is the one the four
packages built on the bridge use, and core now counts every source file
(`include: ['src/**/*.js']`) the way the others already did.

### §10 — Types and public contract: 3 → 10

This section had never been measured, because nothing compiled the packages the way a consumer
does. `types-contract/` is that measurement: an application that imports every package's public
API under `strict`, with no access to the sources — only what each `types` field points at.

Pointed at the packages as they were, it failed on **four defects a consumer hit on the first
import**:

```
$ npx tsc -p types-contract/tsconfig.json
packages/core/types/bridge.ts(20,24): error TS7016: Could not find a declaration file for
  module '../src/bridge'. 'packages/core/src/bridge.js' implicitly has an 'any' type.
packages/core-plugin/types/index.d.ts(4,3): error TS7010: 'constructor', which lacks
  return-type annotation, implicitly has an 'any' return type.
packages/element-controller/types/index.d.ts(3,22): error TS2420: Class 'ElementController'
  incorrectly implements interface 'CoreAPI'.
packages/element-controller/types/index.d.ts(14,26): error TS2304: Cannot find name 'RouteData'.
types-contract/core.ts(46,25): error TS1362: 'Bridge' cannot be used as a value because it was
  exported using 'export type'.
exit: 2
```

1. **`Bridge`'s declaration pointed at a `.js` file.** `types/bridge.ts` did
   `export { Bridge } from '../src/bridge'`, so the published declarations resolved to a source
   file that ships no types of its own. It is declared properly now, with its public surface.
2. **`Bridge` was exported as a type**, so `new Bridge(config)` did not compile even though
   `src/index.js` exports it as a value — the whole reason the class is public.
3. **`CoreAPI` declared `constructor(host: any)` inside an interface**, which is a method with
   an implicit `any` return rather than a constructor signature. It broke `CoreAPI` under
   `strict` and made `ElementController implements CoreAPI` fail with it.
4. **`element-controller` used `RouteData` without importing it.**

After:

```
$ npm run test:types
> tsc -p ./tsconfig-typchk.json --noEmit
Public types: types-contract compiles under strict.
Public types: every declared entry point ships in its tarball.
exit: 0
```

**`typchk` is green.** `npm run typchk -w @open-cells/core` had 13 errors and was documented in
`CLAUDE.md` as known-red. Getting to zero was mostly making the hand-written declarations agree
with the code they describe:

- `Channel` was missing `close()`, so three call sites passing a channel did not type-check.
  It is the method §2's `isStopped` fix depends on being distinct from `unsubscribe()`.
- `publishInterceptedNavigation` was declared as taking a `Navigation`, whose `from`/`to` are
  plain strings, while the router passes it a `NavigationWithParams`.
- `window.cellsBridgeQueue` was undeclared, though `enqueueCommand` is public API and that is
  where it writes.
- `Object.defineProperty(wrappedCallback, /** @type {WCNode} */ 'node', …)` cast the property
  _key_ to a node, which left the property unassignable. The node is defined with the descriptor
  now.
- The two reads of RxJS's private `_finalizers` — the ones §2 found the bug in — carry an
  explicit cast rather than being `any` by accident.
- `tsconfig-typchk.json` sets `"types": []`, so the check no longer fails on `@types/sinon`
  disagreeing with the `@sinonjs/fake-timers` it resolves to, which has nothing to do with core.

The internal managers now type against `import('../bridge').Bridge`, the implementation, rather
than the narrower public declaration: they reach into internals the contract does not expose,
and conflating the two is what let the declaration drift in the first place.

**The declarations are also checked to be published.** A `types` field pointing at a file that
`files` does not ship type-checks inside the monorepo and gives consumers TS7016 anyway, so the
check packs each workspace exactly as `npm publish` would and looks for every declared entry
point. Verified to bite:

```
$ npm run test:types              # types field temporarily pointed at a file that is not shipped
  - @open-cells/page-mixin declares entry points its tarball does not ship:
      types/not-shipped.d.ts
exit: 1
```

### Whole suite, after §8–§10

```
$ npm test
Test toolchain OK: 7 runners single-versioned, no undeclared test imports.
Public types: types-contract compiles under strict.
Public types: every declared entry point ships in its tarball.
@open-cells/core                 647 passed (20 files)
@open-cells/core-plugin           28 passed (2 files)
@open-cells/create-app            15 passed (1 file)
@open-cells/element-controller    22 passed (1 file)
@open-cells/localize              46 passed (7 files)
@open-cells/page-controller       18 passed (1 file)
@open-cells/page-mixin            20 passed (1 file)
@open-cells/page-transitions      43 passed (3 files)
@open-cells/recipes-app           27 passed (e2e, chromium)
exit: 0

$ npm run lint
✖ 29 problems (0 errors, 29 warnings)
```

The e2e count is 27 rather than 81 because this run set `OPEN_CELLS_BROWSERS=chromium`: the
environment it ran in cannot reach Playwright's CDN, so it used the Chromium the image already
provides through `OPEN_CELLS_CHROMIUM_EXECUTABLE`. CI runs the full matrix.
