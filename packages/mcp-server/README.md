# `@open-cells/mcp-server`

A [Model Context Protocol](https://modelcontextprotocol.io) server for **Open Cells** applications.

It gives an AI assistant two things it cannot get on its own: an accurate reference of the Open
Cells API — navigation happens by route _name_, state travels over pub/sub channels bound with
`static inbounds` / `static outbounds`, pages use `PageController` — and a static analysis of the
application in front of it: which routes exist, which state channels flow between components, and
what is broken.

## Installation

The server speaks the **stdio** transport, so clients spawn it as a subprocess.

Claude Code reads `.mcp.json`; Claude Desktop reads `claude_desktop_config.json`.

<!-- prettier-ignore -->
```json
{
  "mcpServers": {
    "open-cells": {
      "command": "npx",
      "args": ["-y", "@open-cells/mcp-server", "--project-root", "/path/to/my-app"]
    }
  }
}
```

`--project-root` sets the application analysed when a tool call omits `project_root`; it can also
come from `OPEN_CELLS_PROJECT_ROOT`, and falls back to the working directory. Every tool also
accepts `project_root` per call, which is what you want in a monorepo with several apps.

From a checkout of this repository:

```sh
npm install
npm run build -w @open-cells/mcp-server
node packages/mcp-server/dist/index.js --project-root ./packages/example/recipes-app
```

## Tools

| Tool                         | What it does                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open_cells_list_routes`     | Routes declared by the app: name, patterns, component, `:params`, wildcard and 404 flags, lazily imported modules.                                                                                                        |
| `open_cells_validate_routes` | Duplicate names or patterns, non-absolute paths, invalid or undefined component tags, `action` imports that do not resolve, missing 404 route, and unknown route names in `startApp`'s `persistentPages` / `commonPages`. |
| `open_cells_list_channels`   | Map of state channels: who publishes and who subscribes to each one, with file and line. Warns about channels with no consumer, channels with no producer, and names that differ by one or two characters.                |
| `open_cells_scaffold_page`   | Generates a page component (PageController, optional transitions mixin, lifecycle hooks and `inbounds` bindings) and registers its route. Previews by default.                                                            |
| `open_cells_create_app`      | Runs `@open-cells/create-app` non-interactively to scaffold a new application.                                                                                                                                            |
| `open_cells_api_reference`   | Public API of each package, with signatures and working examples.                                                                                                                                                         |
| `open_cells_docs_search`     | Free-text search over the API reference and the concept guides.                                                                                                                                                           |

All data tools accept `response_format: "markdown" | "json"` and return structured content
alongside the readable text.

### Resources

Documentation is also exposed as resources, so a client can read it without a tool call:

- `opencells://api/{module}` — `core`, `element-controller`, `page-controller`, `page-mixin`,
  `page-transitions`, `localize`, `core-plugin`, `create-app`.
- `opencells://guide/{topic}` — `project-structure`, `routing`, `state-channels`,
  `page-lifecycle`, `app-config`.

## Analysis, in practice

Run against the recipes example shipped in this repository:

```
# Route validation — `src/router/routes.ts`

5 route(s) checked: 0 error(s), 1 warning(s), 0 note(s).

## warnings (1)

- ⚠ **[no-not-found-route]** No route declares "notFound: true". Route "not-found" looks like
  the 404 page but its flag is not set, so unknown paths resolve to nothing.
  — `src/router/routes.ts:36`
  - Fix: Set "notFound: true" on route "not-found".
```

Parsing is done with the TypeScript AST, not with regular expressions, so an `action` spread over
several lines or a `path` declared as an array of patterns is read correctly. No type checker is
involved, which keeps every tool call in the tens of milliseconds.

## Scaffolding

`open_cells_scaffold_page` runs with `dry_run: true` by default: it returns the full contents of
the page component and a diff of the routes file **without writing anything**. Call it again with
`dry_run: false` to apply. The route is inserted keeping the 404 route last and matching the
indentation already used in the file, and the name, path and component tag are checked against the
existing routes first.

<!-- prettier-ignore -->
```json
{
  "page_name": "user-profile",
  "route_path": "/profile/:userId",
  "transitions": true,
  "inbounds": [{ "property": "_user", "channel": "user" }]
}
```

## Development

```sh
npm run build -w @open-cells/mcp-server     # tsc
npm run test  -w @open-cells/mcp-server     # vitest
npm run inspect -w @open-cells/mcp-server   # MCP Inspector
```

The test suite covers the analysers against real fixtures (including the recipes example) and the
MCP surface itself through an in-memory client.
