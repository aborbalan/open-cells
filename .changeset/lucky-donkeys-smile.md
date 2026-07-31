---
'@open-cells/element-controller': patch
'@open-cells/core-plugin': patch
'@open-cells/core': patch
---

Make the published type declarations usable from a TypeScript application.

Four defects a consumer hit on the first import:

- `@open-cells/core` declared `Bridge` with `export { Bridge } from '../src/bridge'`, pointing
  the published declarations at a `.js` file that ships no types of its own, so every consumer
  got `TS7016`. It is declared properly now, with its public surface.
- `Bridge` was also re-exported with `export type`, so `new Bridge(config)` did not compile even
  though `src/index.js` exports it as a value.
- `@open-cells/core-plugin` declared `constructor(host: any)` as a member of the `CoreAPI`
  _interface_, which is a method with an implicit `any` return rather than a constructor
  signature. It broke `CoreAPI` under `strict` and made `ElementController implements CoreAPI`
  fail.
- `@open-cells/element-controller` used `RouteData` in its declarations without importing it.

Also aligned the hand-written declarations with the code they describe: `Channel` was missing
`close()`, and `publishInterceptedNavigation` was declared as taking a `Navigation` when the
router passes it a `NavigationWithParams`.

No runtime behaviour changes.
