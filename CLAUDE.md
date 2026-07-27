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
npm run test                             # core (vitest, browser), recipes-app (playwright), mcp-server
npm run build -w @open-cells/mcp-server  # tsc
npm run test  -w @open-cells/mcp-server  # vitest, node
npx prettier --write <files>             # repo style: single quotes, 100 columns, trailing commas
```

Changes to published packages need a changeset: `npm run changeset`.

## Known red, do not chase

These fail on `main` and are unrelated to whatever you are working on:

- `npm run build -w @open-cells/recipes-app` — `tsc` errors on `_categoriesList` / `_likedRecipes`
  (the `inbounds` getters described above) and on the `createRenderRoot` return type.
- `npm run typchk -w @open-cells/core` — the hand written `types/` are out of sync with `src/`.
- Root ESLint config is `.eslintrc.json` while ESLint 9 defaults to flat config, so `npm run lint`
  does not work as-is in the packages.

## Repository conventions

- PRs go to `aborbalan/open-cells`. **Never open a PR against `BBVA/open-cells`** — the upstream
  does not accept external contributions.
- `docs/session-notes.md` is a living document with the state of the work in progress; keep it
  current when you finish something substantial.
