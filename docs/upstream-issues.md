# Issues para reportar en `BBVA/open-cells`

Hallazgos de la auditoría de tests de julio de 2026 que **son de upstream**, no de este fork:
defectos y huecos que existen en `BBVA/open-cells` tal cual. Lo que es decisión nuestra de
infraestructura de test (config compartida de vitest, informe de cobertura combinado, los
guards) queda fuera a propósito — a ellos no les sirve.

**Se reportan como _issues_, nunca como PRs**: el upstream no acepta contribuciones externas.
Por eso cada issue es autocontenido y describe el arreglo en prosa, sin enlazar a este fork:
alguien de BBVA tiene que poder leerlo y actuar sin acceso a nuestro repositorio.

Los textos van **en inglés** porque el repositorio de upstream lo es. De cada issue, el
apartado _Título_ va al campo de título y todo lo que hay bajo _Cuerpo_ va al cuerpo.

Todo lo citado está verificado contra el código de upstream en el estado previo a la auditoría,
no de memoria.

**Orden sugerido:** 1 → 4 primero (bugs de runtime con pérdida de datos o de funcionalidad),
luego 7 y 8 (la release y la suite), y el resto cuando haya hueco.

| #   | Asunto                                                    | Severidad | Área          |
| --- | --------------------------------------------------------- | --------- | ------------- |
| 1   | Canales muertos para siempre tras `logout()`              | Crítica   | `core`        |
| 2   | `_hasPublisher()` nunca acierta con RxJS 7                | Alta      | `core`        |
| 3   | `Router.stop()` no para el router                         | Alta      | `core`        |
| 4   | `addCellsCoreToPrototype()` lanza `ReferenceError`        | Alta      | `core-plugin` |
| 5   | Los tipos publicados no compilan en un consumidor         | Alta      | tipos         |
| 6   | `types/` escritos a mano desalineados con `src/`          | Media     | tipos         |
| 7   | Un `npm publish` fallido reporta éxito                    | Alta      | release       |
| 8   | La suite no arranca en un clon limpio                     | Alta      | tests         |
| 9   | ESLint no corre desde que se instaló ESLint 9             | Media     | tooling       |
| 10  | Dos versiones de Playwright, seis descargas de navegador  | Baja      | tooling       |
| 11  | La app de ejemplo no tiene ruta 404                       | Media     | ejemplo       |
| 12  | Botones del ejemplo que devuelven el handler en vez de él | Baja      | ejemplo       |

---

# 1 · Canales muertos tras `logout()`

**Título:** Channel.unsubscribe() reopens the channel by writing the wrong flag, so everything
published after a reset is silently dropped

**Labels:** `bug` · `core` — **Severidad:** crítica (pérdida de datos silenciosa)

## Cuerpo

### Summary

`Channel.unsubscribe()` is documented as "Unsubscribes all observers from the channel keeping
the channel open", but it does not keep it open. It clears `closed` and then writes a property
called `stoped`, which nothing in RxJS reads — the flag is `isStopped`.

In `packages/core/src/state/channel.js`:

    unsubscribe() {
      super.unsubscribe();
      this.closed = false;
      this.stoped = false;   // <- typo: RxJS reads `isStopped`
    }

`Subject.prototype.unsubscribe()` sets `closed = true` **and** `isStopped = true`, and drops the
observer lists. Clearing only `closed` leaves the subject stopped, and a stopped Subject ignores
every `next()` from then on.

### Impact

Silent data loss, with no error anywhere. Any channel that has been through
`resetBridgeChannels()` never emits again. That is the path `Bridge.logout()` takes, so after a
logout the application keeps publishing and no subscriber ever hears anything. The channel looks
alive — it is not closed, `publish()` does not throw — which is what makes this hard to track
down from the application side.

### Reproduction

    import { createChannel } from '@open-cells/core/src/state/channel.js';

    const channel = createChannel('demo');
    const seen = [];
    channel.subscribe(value => seen.push(value));

    channel.next({ value: 'before' });
    channel.unsubscribe();

    channel.subscribe(value => seen.push(value));
    channel.next({ value: 'after' });

    console.log(seen); // only 'before'; 'after' is dropped

### Suggested fix

Reset the flags RxJS actually reads, and the observer lists it dropped:

    unsubscribe() {
      super.unsubscribe();
      this.closed = false;
      this.isStopped = false;
      this.observers = [];
      this.currentObservers = null;  // private in RxJS's typings; needs a cast under checkJs
    }

Worth adding a test that asserts the documented invariant directly — that a channel is still
usable after `unsubscribe()` — since that is the whole reason the method is overridden and it is
what distinguishes it from `close()`.

---

# 2 · `_hasPublisher()` nunca acierta con RxJS 7

**Título:** Duplicate DOM listeners and duplicate channel emissions: `_hasPublisher()` reads an
RxJS 6 property name

**Labels:** `bug` · `core` — **Severidad:** alta

## Cuerpo

### Summary

RxJS 7 renamed `Subscription`'s internal list of child subscriptions from `_subscriptions` to
`_finalizers`. Two places in `packages/core/src/` still read the old name, and both swallow the
miss with a fallback.

`component-connector.js`:

    _hasPublisher({ publications }, node, channelName, bindName) {
      return Boolean(
        (publications._subscriptions || []).find(...)   // always []
      );
    }

`manager/bridge-channels.js`, in `getCCSubscriptions()`, reads the same property to build the
list of out connections.

### Impact

Two separate problems, both silent:

1. `_hasPublisher()` always returns `false`, so `addPublication()` believes there is no publisher
   yet and registers another one **every time it is called**. The result is a duplicate DOM
   listener and a duplicate emission on the channel per call — subscribers receive the same event
   two, three, N times.
2. `getCCSubscriptions()` sees no publications at all, so every out connection disappears from
   the cross-component map. Anything relying on that map to disconnect or reconnect components
   silently does nothing.

The `|| []` fallback is what turns a rename into silence: without it this would have been a
`TypeError` on the first call after the RxJS 7 upgrade.

### Suggested fix

Read the new name with the old one as a fallback, so it works on both major versions:

    const registered = publications._finalizers || publications._subscriptions || [];

Both properties are private in RxJS's own declarations, so under `checkJs` this needs an explicit
cast rather than being `any` by accident. Same change in `getCCSubscriptions()`.

A regression test is cheap here: call `addPublication()` twice for the same node, channel and
bind name, and assert exactly one listener and one emission.

---

# 3 · `Router.stop()` no para el router

**Título:** Router.stop() leaves the location subscription running; every bridge leaks one

**Labels:** `bug` · `core` — **Severidad:** alta

## Cuerpo

### Summary

In `packages/core/src/router.js`, `start()` builds the location pipeline and then consumes it
with `forEach`:

    const subscription = source.pipe(
      distinctUntilChanged(),
      map(this.matchRoute.bind(this)),
      filter(...),
    );

    subscription.forEach(route => { ... });

    // _disposables = new Subscription(subscription, active);   <- commented out
    _disposables = active;

`Observable.prototype.forEach` returns a **Promise**, not a `Subscription`. Nothing keeps a handle
to the subscription it creates. `_disposables` ends up holding only `active`, the
`SerialSubscription` used for something else, and the line that would have held both is commented
out.

`stop()` unsubscribes `_disposables`, so it tears down `active` and leaves the location pipeline
subscribed forever.

### Impact

Every `Router` that is started leaks one live subscription to the location observable, and
`stop()` and `destroy()` cannot release it. Every bridge built in a page therefore leaves another
router listening: navigations get handled several times over, by routers that were supposed to be
gone. It compounds across a test suite, or an application that builds more than one bridge.

### Suggested fix

Keep the subscription and add it to the disposables:

    const routeSubscription = subscription.subscribe(route => { ... });

    _disposables = new Subscription();
    _disposables.add(active);
    _disposables.add(routeSubscription);

Testable directly: start a router, stop it, push a location change, and assert the route handler
did not run.

---

# 4 · `addCellsCoreToPrototype()` lanza `ReferenceError`

**Título:** CorePlugin.addCellsCoreToPrototype() calls an out-of-scope identifier and always
throws

**Labels:** `bug` · `core-plugin` — **Severidad:** alta

## Cuerpo

### Summary

`packages/core-plugin/src/CorePlugin.js`:

    _plugCellsCoreToPrototype(element, bindToElement = true) { ... }

    addCellsCoreToPrototype(element) {
      _plugCellsCoreToPrototype(element, false);   // bare identifier, not `this.`
    }

`_plugCellsCoreToPrototype` is an instance method. Called as a bare identifier it is not in scope,
so the call throws `ReferenceError: _plugCellsCoreToPrototype is not defined`.

### Impact

`addCellsCoreToPrototype()` is unusable — every call throws, and the bridge API is never installed
on the prototype. The sibling path (`plugCellsCore`, which calls
`corePlugin._plugCellsCore(element, false)` correctly) works, which is presumably why this went
unnoticed.

### Reproduction

    import { CorePlugin } from '@open-cells/core-plugin';

    class MyElement extends HTMLElement {}
    new CorePlugin().addCellsCoreToPrototype(MyElement);
    // ReferenceError: _plugCellsCoreToPrototype is not defined

### Suggested fix

    addCellsCoreToPrototype(element) {
      this._plugCellsCoreToPrototype(element, false);
    }

---

# 5 · Los tipos publicados no compilan en un consumidor

**Título:** TS7016 on import: the published declarations point at a .js file, and Bridge is
exported as a type

**Labels:** `bug` · `typescript` — **Severidad:** alta

## Cuerpo

### Summary

A TypeScript application that installs the packages and imports them under `strict` does not
compile. Four separate defects, all on the first import.

**1. `@open-cells/core`'s declarations point at a source file.** `types/bridge.ts` contains
`export { Bridge } from '../src/bridge'`, which is a `.js` file that ships no declarations of its
own, so consumers get:

    error TS7016: Could not find a declaration file for module '../src/bridge'.
    'packages/core/src/bridge.js' implicitly has an 'any' type.

**2. `Bridge` is re-exported as a type.** `types/index.d.ts` lists it inside
`export type { ... }`, but `src/index.js` exports it as a value (a class), so `new Bridge(config)`
fails:

    error TS1362: 'Bridge' cannot be used as a value because it was exported using 'export type'.

Constructing it is the whole reason the class is public.

**3. `CoreAPI` declares a constructor inside an interface.** `@open-cells/core-plugin`'s
`types/index.d.ts` has `constructor(host: any);` as an interface member. That is not a constructor
signature — it is a method named `constructor` with an implicit `any` return, which errors under
`strict` (`TS7010`) and makes `ElementController implements CoreAPI` fail with `TS2420`.

**4. `@open-cells/element-controller` uses `RouteData` without importing it** in its declarations:
`TS2304: Cannot find name 'RouteData'`.

### Impact

The packages advertise types and ship types, but no strict TypeScript consumer can use them.
Anyone hitting this falls back to `// @ts-ignore` or `allowJs`, which loses the type safety the
declarations were for.

### Reproduction

Install the packages in an application with `"strict": true` and no `allowJs`, then:

    import { Bridge, startApp } from '@open-cells/core';
    import { ElementController } from '@open-cells/element-controller';

    const bridge = new Bridge();

### Suggested fix

- Declare `Bridge` properly in `types/bridge.ts` — `export declare class Bridge { ... }` with its
  public surface — instead of re-exporting from `../src/bridge`.
- Move `Bridge` out of the `export type { ... }` block in `types/index.d.ts` and export it as a
  value.
- Drop the `constructor(host: any);` member from the `CoreAPI` interface.
- Import `RouteData` in `element-controller`'s declarations.

What keeps this from coming back is compiling the packages the way a consumer does: a small
fixture application that imports each public API under `strict`, with no access to the sources,
type-checked in CI. It catches all four of the above and it is what found them.

Worth pairing with a check that each declared entry point is actually inside the tarball
`npm publish` produces — a `types` field pointing at a file that `files` does not ship
type-checks inside the monorepo and still gives consumers TS7016.

---

# 6 · `types/` desalineados con `src/`

**Título:** typchk fails: the hand-written declarations have drifted from the code they describe

**Labels:** `bug` · `typescript` — **Severidad:** media

## Cuerpo

### Summary

`tsc -p packages/core/tsconfig-typchk.json` does not pass. The declarations under `types/` are
maintained by hand and have drifted from `src/`. The substantive mismatches:

- **`Channel` is missing `close()`.** The class in `src/state/channel.js` has both `unsubscribe()`
  (keeps the channel usable) and `close()` (does not), but the `Channel` interface only declares
  the first. Three call sites that pass a channel around fail to type-check as a result.
- **`publishInterceptedNavigation` is declared with the wrong parameter type.** It is annotated
  `@param {Navigation}`, whose `from`/`to` are plain strings, but `router.js` calls it with
  `{ from: { page, params }, to: { page, params } }` — a `NavigationWithParams`.
- **`window.cellsBridgeQueue` is undeclared**, although `enqueueCommand` is public API and that
  global is where it writes.
- `Object.defineProperty(wrappedCallback, /** @type {WCNode} */ 'node', …)` in
  `component-connector.js` casts the property **key** to a node, which leaves the property
  unassignable on the next line.

### Impact

The check exists but cannot be kept green, so it stops being run and the declarations drift
further. The `Channel.close()` gap is the one with teeth: it is exactly the distinction the
`unsubscribe()` bug reported separately depends on.

### Suggested fix

Align `types/` with `src/` for the four points above and put `typchk` in CI so it stays green.

Two things make it easier to hold:

- Have the internal managers type against the implementation (`import('../bridge').Bridge`) rather
  than against the narrower public declaration. They reach into internals the public contract does
  not expose, and conflating the two is what lets the declaration drift.
- Set `"types": []` in `tsconfig-typchk.json`, so the check stops failing on unrelated `@types/*`
  packages in the workspace (today it also reports `@types/sinon` disagreeing with the
  `@sinonjs/fake-timers` it resolves to, which has nothing to do with `core`).

---

# 7 · Un `npm publish` fallido reporta éxito

**Título:** publish.yml swallows publish failures and publishes without running the tests

**Labels:** `bug` · `ci` · `release` — **Severidad:** alta

## Cuerpo

### Summary

Two problems in `.github/workflows/publish.yml`.

**Failures are swallowed.** Every one of the nine publish steps ends the same way:

    npm publish || echo "Publish failed"

`|| echo` makes the step succeed regardless, so the workflow goes green whether or not the package
reached the registry. A release that did not happen is indistinguishable from one that did.

**Nothing is tested before publishing.** The workflow runs `npm ci` and `npm run build`, then
publishes. The test suite never runs on the code being released.

### Impact

A broken or missing release looks like a successful one, and the only signal that a version did
not go out is someone noticing later. Combined with the second point, a release can ship code the
suite would have rejected.

### Suggested fix

- Drop `|| echo "Publish failed"` so a genuine failure fails the job. To keep re-runs harmless,
  check whether the version is already on the registry and skip it explicitly, rather than
  ignoring all errors.
- Gate publishing on the build workflow — call it through `workflow_call` and publish only if it
  passes.

The nine near-identical publish blocks also collapse into one loop over the package list, which
removes the chance of the blocks drifting apart.

---

# 8 · La suite no arranca en un clon limpio

**Título:** Neither suite runs on a fresh clone: undeclared test dependencies in core, and the
e2e web server fails to build

**Labels:** `bug` · `tests` — **Severidad:** alta

## Cuerpo

### Summary

**`@open-cells/core` fails to load most of its test files.** The suites import `sinon` and
`@esm-bundle/chai`, and the package declares neither. `sinon` exists in the lockfile only nested
under `localize` and `page-mixin`, so it cannot be resolved from `core` and the files error out
before a single test runs — 15 of 19 files on a clean install.

**The e2e suite runs zero tests.** Playwright's `webServer` builds the example app with
`tsc && vite build`, and `tsc` fails with 9 errors, so the server never starts and Playwright
reports no tests rather than a failure. The 9 errors have two causes:

- Eight are `_categoriesList` and `_likedRecipes`, which exist only because
  `ElementController._inOut()` installs them at runtime with `Object.defineProperties` from
  `static inbounds`. TypeScript cannot see them, so they need `declare`ing on the class.
- One is `createRenderRoot` annotated with a return type Lit does not accept.

Typing the two properties then exposes a latent error the implicit `any` was hiding:
`Array.prototype.find` returns `undefined`, not `null`.

### Impact

A contributor cloning the repository cannot run the tests, and CI does not run them either, so
neither of these was visible. It is also why several runtime defects went unnoticed: the suites
that would have caught them were not executing.

### Suggested fix

- Declare `sinon` and `@esm-bundle/chai` in `@open-cells/core`'s `devDependencies`.
- `declare` the two `inbounds` properties on the components that use them, and fix the
  `createRenderRoot` annotation and the `find()` result handling.
- Run the suite in CI, which currently only runs the build.

Unrelated but adjacent: WebKit workers crash on Windows when run in parallel
(`STATUS_STACK_BUFFER_OVERRUN`), failing five e2e tests that pass when run one at a time. A single
worker on Windows, as CI already does, avoids it.

---

# 9 · ESLint no corre desde ESLint 9

**Título:** npm run lint fails everywhere: ESLint 9 does not read .eslintrc.json, and the parser
points at a path that does not exist

**Labels:** `bug` · `tooling` — **Severidad:** media

## Cuerpo

### Summary

The repository has ESLint 9 as a dependency and a `.eslintrc.json` config. ESLint 9 defaults to
flat config and does not read `.eslintrc.json`:

    $ npm run lint
    ESLint couldn't find an eslint.config.(js|mjs|cjs) file.

That file also points its TypeScript parser at a path that does not exist in this repository:

    "parserOptions": { "project": "./packages/bridge/tsconfig-typchk.json" }

There is no `packages/bridge`. So `npm run lint -w @open-cells/core` has been failing for as long
as ESLint 9 has been installed, and CI never calls lint at all.

### Impact

No linting anywhere, and things only a linter reports have accumulated unseen. Adding a flat
config turns up, among others:

- an unused `regex` in `route.js`;
- an unused `renderEngines` in `bridge.js`;
- an unused `oldPageName` in the template manager;
- an unreachable `routeWithSamePattern` in `_setup404()`.

Two config-level problems also make ESLint error out on a file rather than lint it: a malformed
disable comment in `bridge.js` — `no-unused-vars../types`, a path fragment glued onto the rule
name — and a reference to an `import/no-cycle` rule from a plugin that is not installed.

### Suggested fix

Add an `eslint.config.js` flat config, drop `.eslintrc.json`, fix the malformed disable comment
and the reference to the uninstalled rule, and run lint in CI.

---

# 10 · Dos versiones de Playwright

**Título:** The monorepo resolves two Playwright versions, so a clean install downloads two full
browser sets

**Labels:** `tooling` · `dependencies` — **Severidad:** baja

## Cuerpo

### Summary

The example application declares `@playwright/test`, and the packages that run browser tests
declare `playwright` for the vitest browser provider and `@web/test-runner-playwright`. The ranges
do not agree, so two versions resolve at once. Playwright keys its browser downloads by version,
so a clean install fetches six browser builds instead of three:

    1.58.2 -> chromium-1208 firefox-1509 webkit-2248
    1.62.0 -> chromium-1234 firefox-1538 webkit-2336

The example app also declares a bare `playwright: ^1.0.0` next to `@playwright/test`, which is
redundant — `@playwright/test` brings its own — and it is what lets the second copy in.

### Impact

Every clean install and every CI run downloads and stores twice the browsers it needs, and CI has
to install them once per workspace. Two drivers also have to keep working against the same suite.

### Suggested fix

Pin every Playwright package to one exact version across the workspaces, add a root `overrides`
entry so a future install cannot re-split them, and drop the bare `playwright` from the example
app. One `npx playwright install` then covers the whole repository.

The same argument applies with more force to the vitest family: `@vitest/browser-playwright` pins
its peer on the exact `vitest` version, so a second copy there is a broken run rather than a slow
one.

---

# 11 · La app de ejemplo no tiene ruta 404

**Título:** recipes-app declares notFound: false on its not-found route, so unmatched URLs render
nothing

**Labels:** `bug` · `example` — **Severidad:** media

## Cuerpo

### Summary

`packages/example/recipes-app/src/router/routes.ts`:

    {
      path: '/not-found',
      name: 'not-found',
      notFound: false,      // <- disables the only 404 candidate
      component: 'not-found-page',
    },

The 404 page is the route flagged `notFound: true`. With the flag set to `false` the application
has no 404 route at all: an unmatched URL matches nothing, selects no page, and leaves whatever
was previously on screen.

### Impact

The example is what new users copy, so the mistake propagates. It also hides the framework's own
404 behaviour from anyone learning from it — the page exists and is reachable by its own route,
which makes it look like 404 handling works.

### Suggested fix

Set `notFound: true`. Worth an end-to-end test that navigates to an unmatched URL and asserts the
not-found page renders, since the current behaviour fails silently.

---

# 12 · Botones del ejemplo que no llaman al handler

**Título:** "Back to home" and "favorite recipes" buttons bind a function that returns the handler
and never calls it

**Labels:** `bug` · `example` — **Severidad:** baja

## Cuerpo

### Summary

In the page headers of the example application:

    @click="${() => this._navigateToHome}"

The arrow function _returns_ the method instead of calling it, so clicking runs nothing. It
appears in `category-page.ts`, `recipe-page.ts` and `favorite-recipes-page.ts`, for both
`_navigateToHome` and `_navigateToFavoriteRecipes`.

### Impact

The buttons look like they work, because the same elements also carry an `href` and the browser
navigates for that reason. Anyone copying the pattern into a component without an `href` gets a
button that does nothing, with no error.

### Suggested fix

    @click="${() => this._navigateToHome()}"

or bind the method directly. The pattern is worth a grep across the example — it is duplicated in
three files.
