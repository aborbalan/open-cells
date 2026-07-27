/*
 * Copyright 2024 Bilbao Vizcaya Argentaria, S.A.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeRoutes, validateRoutes } from '../analysis/routes.js';
import { countBySeverity, renderDiagnostics, safeHandler, toolResponse } from '../format.js';
import { resolveProjectRoot } from '../project.js';
import {
  diagnosticSchema,
  projectRootArg,
  responseFormatArg,
  routesFileArg,
  serializeDiagnostic,
} from '../schemas.js';
import type { RouteEntry } from '../types.js';

const routeSchema = z.object({
  name: z.string().nullable(),
  paths: z.array(z.string()),
  component: z.string().nullable(),
  params: z.array(z.string()),
  wildcard: z.boolean(),
  not_found: z.boolean(),
  has_action: z.boolean(),
  lazy_imports: z.array(z.string()),
  line: z.number(),
});

function serializeRoute(route: RouteEntry): z.infer<typeof routeSchema> {
  return {
    name: route.name,
    paths: route.paths,
    component: route.component,
    params: route.params,
    wildcard: route.wildcard,
    not_found: route.notFound,
    has_action: route.hasAction,
    lazy_imports: route.lazyImports,
    line: route.line,
  };
}

function renderRoutesTable(routes: RouteEntry[]): string {
  if (!routes.length) {
    return '_The routes array is empty._';
  }

  const lines = [
    '| name | path | component | params | flags | line |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const route of routes) {
    const flags = [
      route.notFound ? '404' : '',
      route.wildcard ? 'wildcard' : '',
      route.hasAction ? '' : 'no action',
    ]
      .filter(Boolean)
      .join(', ');

    lines.push(
      `| ${route.name ?? '—'} | ${route.paths.join('<br>') || '—'} | ${route.component ?? '—'} | ${
        route.params.map(param => `:${param}`).join(', ') || '—'
      } | ${flags || '—'} | ${route.line} |`,
    );
  }

  return lines.join('\n');
}

export function registerRouteTools(server: McpServer): void {
  server.registerTool(
    'open_cells_list_routes',
    {
      title: 'List Open Cells routes',
      description: `List the routes declared by an Open Cells application.

Reads the RouteDefinition array (src/router/routes.ts by convention) with the TypeScript parser and returns, for each route: name, patterns, component tag, ':param' names, wildcard and notFound flags, and the modules its 'action' imports lazily.

Args:
  - project_root (string, optional): application to analyse
  - routes_file (string, optional): routes file, relative to the project root
  - response_format ('markdown' | 'json'): output format (default: 'markdown')

Returns:
  {
    "file": string,             // routes file, relative to the project root
    "export_name": string|null, // exported binding holding the array
    "count": number,
    "routes": [{ "name", "paths", "component", "params", "wildcard", "not_found", "has_action", "lazy_imports", "line" }]
  }

Use when: you need to know which routes exist, what a page is called for navigate(), or which params a route accepts.
Don't use when: you want to find problems in the routing — use open_cells_validate_routes.`,
      inputSchema: {
        project_root: projectRootArg,
        routes_file: routesFileArg,
        response_format: responseFormatArg,
      },
      outputSchema: {
        file: z.string(),
        export_name: z.string().nullable(),
        count: z.number(),
        routes: z.array(routeSchema),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    safeHandler(({ project_root, routes_file, response_format }) => {
      const root = resolveProjectRoot(project_root);
      const analysis = analyzeRoutes(root, routes_file);

      const output = {
        file: analysis.file,
        export_name: analysis.exportName,
        count: analysis.routes.length,
        routes: analysis.routes.map(serializeRoute),
      };

      const text =
        response_format === 'json'
          ? JSON.stringify(output, null, 2)
          : [
              `# Routes — \`${analysis.file}\``,
              '',
              `${analysis.routes.length} route(s) in \`${analysis.exportName ?? 'default export'}\`.`,
              '',
              renderRoutesTable(analysis.routes),
            ].join('\n');

      return toolResponse(
        text,
        output,
        'Point "routes_file" at a single file, or use json format.',
      );
    }),
  );

  server.registerTool(
    'open_cells_validate_routes',
    {
      title: 'Validate Open Cells routes',
      description: `Check the routing of an Open Cells application for problems.

Verifies what the core actually requires: unique route names (routes are keyed by name, so duplicates overwrite each other) and unique patterns, absolute paths, valid custom element tags, components that are really defined in the project, 'action' imports that resolve on disk, and exactly one route flagged 'notFound: true'. Also cross-checks the route names listed in startApp's persistentPages and commonPages.

Args:
  - project_root (string, optional): application to analyse
  - routes_file (string, optional): routes file, relative to the project root
  - check_start_app (boolean): also validate the startApp() configuration (default: true)
  - response_format ('markdown' | 'json'): output format (default: 'markdown')

Returns:
  {
    "file": string,
    "route_count": number,
    "summary": { "error": number, "warning": number, "info": number },
    "diagnostics": [{ "severity", "code", "message", "route", "file", "line", "suggestion" }]
  }

Use when: a navigation does not work, a page never renders, or before shipping route changes.`,
      inputSchema: {
        project_root: projectRootArg,
        routes_file: routesFileArg,
        check_start_app: z
          .boolean()
          .default(true)
          .describe('Validate the route names referenced by the startApp() configuration.'),
        response_format: responseFormatArg,
      },
      outputSchema: {
        file: z.string(),
        route_count: z.number(),
        summary: z.object({ error: z.number(), warning: z.number(), info: z.number() }),
        diagnostics: z.array(diagnosticSchema),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    safeHandler(({ project_root, routes_file, check_start_app, response_format }) => {
      const root = resolveProjectRoot(project_root);
      const result = validateRoutes(root, {
        ...(routes_file ? { routesFile: routes_file } : {}),
        checkStartApp: check_start_app,
      });
      const summary = countBySeverity(result.diagnostics);

      const output = {
        file: result.file,
        route_count: result.routeCount,
        summary,
        diagnostics: result.diagnostics.map(serializeDiagnostic),
      };

      const text =
        response_format === 'json'
          ? JSON.stringify(output, null, 2)
          : [
              `# Route validation — \`${result.file}\``,
              '',
              `${result.routeCount} route(s) checked: ${summary.error} error(s), ${summary.warning} warning(s), ${summary.info} note(s).`,
              '',
              renderDiagnostics(result.diagnostics),
            ].join('\n');

      return toolResponse(text, output, 'Use json format to read the remaining diagnostics.');
    }),
  );
}
