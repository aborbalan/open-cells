# Open Cells

Monorepo of the Open Cells framework: SPAs built from web components and web standards. npm
workspaces + [wireit](https://github.com/google/wireit); every package lives in `packages/*`.

## Packages

| Package               | Purpose                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `core`                | Routing, state, configuration and bootstrapping (`startApp`, `navigate`, `publish`/`subscribe`) |
| `element-controller`  | Lit reactive controller that plugs a component into the core                                    |
| `page-controller`     | Extends `element-controller` with the page lifecycle (`onPageEnter`, `onPageLeave`, `params`)   |
| `page-mixin`          | The same page capabilities as a class mixin                                                     |
| `page-transitions`    | CSS driven transitions between pages                                                            |
| `localize`            | i18n and formatting on top of `intl-messageformat`                                              |
| `core-plugin`         | Low level glue that copies the bridge API onto an object                                        |
| `create-app`          | Scaffolder for new applications                                                                 |
| `mcp-server`          | Model Context Protocol server — see below                                                       |
| `example/recipes-app` | Example application, and the fixture the analysers are tested against                           |

## The MCP server is the fastest way to understand an app

`packages/mcp-server` exposes this repository's own knowledge as MCP tools. `.mcp.json` in the root
already registers it, but the server runs from its build output, so it needs one command first:

```sh
npm install
npm run build -w @open-cells/mcp-server
```

Restart the session afterwards and the `open_cells_*` tools appear.

Use them instead of grepping:

- `open_cells_api_reference` / `open_cells_docs_search` — **read one of these before writing Open
  Cells code.** The framework has conventions that are easy to get wrong from intuition alone.
- `open_cells_list_routes` / `open_cells_validate_routes` — what routes exist, and what is broken
  about them.
- `open_cells_list_channels` — where a piece of state comes from and who consumes it.
- `open_cells_scaffold_page` — new page plus its route, previewed as a diff before writing.

`.mcp.json` defaults `--project-root` to `packages/example/recipes-app`. Every tool also takes a
`project_root` argument, which is what you want when analysing another application — pointing it at
the monorepo root finds several routes files and the tool will ask you to disambiguate.

## What you need to know before writing Open Cells code

- **Navigation is by route name, never by path**: `navigate('recipe', { recipeId: 52771 })`.
  Routes are keyed by name, so two routes sharing a name overwrite each other.
- **The 404 page is the route with `notFound: true`.** Without one, unknown paths render nothing.
- **State travels over pub/sub channels**, bound declaratively with `static inbounds` /
  `static outbounds` on the component class, or imperatively through the controller. Channels
  replay their last value, so subscription order does not matter.
- **`inbounds` properties become getters at runtime**, so TypeScript does not see them on the
  class. Declare them (`declare _user: any;`) or the build fails.
- **Page nodes are reused across visits.** `firstUpdated` does not run again; per-visit work goes in
  `onPageEnter`, and reactions to route params go in `willUpdate`.

## Commands

```sh
npm install                              # workspaces
npm run build                            # wireit graph: core, controllers, mcp-server, recipes-app
npm run test                             # the three gates below, then every workspace suite
npm run lint                             # eslint, flat config, zero errors
npm run coverage:report                  # merges every workspace's lcov into one report
npm run build -w @open-cells/mcp-server  # tsc
npm run test  -w @open-cells/mcp-server  # vitest, node
npx prettier --write <files>             # repo style: single quotes, 100 columns, trailing commas
```

Browsers come from Playwright, one version for the whole monorepo:
`npx playwright install --with-deps chromium firefox webkit`.

Changes to published packages need a changeset: `npm run changeset`.

## Gates

`npm test` runs these before any suite, so a failure names itself:

- `npm run test:toolchain` — exactly one version of each test runner, and no test or test config
  importing something its package does not declare.
- `npm run test:types` — core's `typchk`, plus `types-contract/` compiled the way a consumer
  compiles (strict, no access to the sources), plus every declared entry point checked to be
  inside the tarball `npm publish` would produce.

Browser selection is shared by all three runners (vitest, web-test-runner, Playwright) through
`test-browsers.mjs`: `OPEN_CELLS_BROWSERS=chromium,webkit` narrows the matrix, and
`OPEN_CELLS_CHROMIUM_EXECUTABLE=/path/to/chrome` points at a browser the environment already
provides instead of one Playwright downloads.

The coverage thresholds in each `vite.config.ts` are a **ratchet**: raise them in the pull
request that adds the coverage, never lower them to make a run pass.

## Known red, do not chase

- `npx prettier --check .` fails on 67 files that predate the configuration. `lint-staged`
  formats each file as it is touched, so the repository converges instead; it is not a CI gate.
  The count decays on its own — do not read a smaller number as a regression. One of the 67 is
  `packages/labs/pwbrouser/pnpm-lock.yaml`, which came from upstream and must **not** be
  reformatted; there is no `.prettierignore` yet.
- `npm audit` reports 35 advisories, almost all transitive through eslint and vite.

Everything else is green. The three entries that used to live here — the `recipes-app` build,
`npm run typchk -w @open-cells/core` and `npm run lint` — were fixed by the testing audit
(`docs/testing-scorecard.md`). If one of them fails now, it is your change.

## Repository conventions

- **Issues may go to `BBVA/open-cells`. Code never does.** Report a defect of theirs and follow
  up on it; do not send a pull request, a patch, or a diff to paste. The line used to say that
  nothing at all went upstream, on the grounds that they take nothing from outside. That turned
  out to be false: issues [#50][i50] and [#51][i51] were opened from here, and a maintainer
  fixed and shipped both — `@open-cells/core@1.2.0` and `@open-cells/core-plugin@1.2.3`, the
  very versions the August sync pulled back in. What holds is the second half: our code stays
  ours, and the divergence is not something to negotiate with them.
- **A report is not a proposal.** What worked upstream was small, reproducible defects with
  evidence. Suggesting they adopt our architecture — the MCP server, the gates, the audit — is a
  different conversation and does not belong in a bug report.
- PRs go to `aborbalan/open-cells`. `gh pr create` in a fork targets the parent by default, so
  it always needs `--repo aborbalan/open-cells`. The push URL of `upstream` is `DISABLED` on
  purpose; leave it that way, it is what keeps code from going the wrong way by accident.

[i50]: https://github.com/BBVA/open-cells/issues/50
[i51]: https://github.com/BBVA/open-cells/issues/51

- `docs/session-notes.md` is a living document with the state of the work in progress; keep it
  current when you finish something substantial.
