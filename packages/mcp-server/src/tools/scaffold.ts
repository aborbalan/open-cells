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
import { safeHandler, toolResponse } from '../format.js';
import { resolveProjectRoot } from '../project.js';
import { createApp } from '../scaffold/create-app.js';
import { applyChanges, scaffoldPage } from '../scaffold/page.js';
import { projectRootArg, responseFormatArg, routesFileArg } from '../schemas.js';

const changeSchema = z.object({
  file: z.string(),
  action: z.enum(['create', 'update']),
  content: z.string(),
  diff: z.string().optional(),
});

export function registerScaffoldTools(server: McpServer): void {
  server.registerTool(
    'open_cells_scaffold_page',
    {
      title: 'Scaffold an Open Cells page',
      description: `Create a page component and register its route.

Generates a Lit component wired to a PageController (optionally with PageTransitionsMixin, the onPageEnter/onPageLeave hooks and 'static inbounds' channel bindings) and inserts the matching RouteDefinition into the routes array, keeping the 404 route last and matching the file's indentation. Route name, path and component tag are checked against the existing routes first.

Preview first: 'dry_run' defaults to true and returns the full file contents plus a diff of the routes file WITHOUT touching the disk. Call again with dry_run=false to write.

Args:
  - page_name (string): page name, with or without the '-page' suffix, e.g. 'user-profile'
  - project_root (string, optional), routes_file (string, optional)
  - route_name (string, optional): defaults to the page name
  - route_path (string, optional): defaults to '/<page name>'
  - language ('ts' | 'js'): defaults to 'ts'
  - shadow_dom (boolean): render in a shadow root instead of light DOM (default: false)
  - transitions (boolean): apply PageTransitionsMixin (default: false)
  - lifecycle_hooks (boolean): include onPageEnter/onPageLeave (default: true)
  - not_found (boolean): mark the route as the 404 page (default: false)
  - inbounds (array): [{ "property": "_user", "channel": "user" }] channel bindings
  - pages_directory (string): defaults to 'src/pages'
  - dry_run (boolean): preview instead of writing (default: true)

Returns:
  {
    "applied": boolean, "tag", "class_name", "route_name", "route_path",
    "page_file", "routes_file",
    "changes": [{ "file", "action", "content", "diff" }],
    "written_files": [string]
  }

Errors: reports which existing route already uses the name, path or component tag, and refuses to overwrite an existing page file.`,
      inputSchema: {
        page_name: z
          .string()
          .min(1)
          .describe("Page name, with or without the '-page' suffix, e.g. 'user-profile'."),
        project_root: projectRootArg,
        routes_file: routesFileArg,
        route_name: z.string().optional().describe('Route name. Defaults to the page name.'),
        route_path: z.string().optional().describe("Route path. Defaults to '/<page name>'."),
        language: z.enum(['ts', 'js']).default('ts').describe('Language of the generated file.'),
        shadow_dom: z
          .boolean()
          .default(false)
          .describe('Render in a shadow root. The generated apps use light DOM.'),
        transitions: z
          .boolean()
          .default(false)
          .describe('Apply PageTransitionsMixin from @open-cells/page-transitions.'),
        lifecycle_hooks: z
          .boolean()
          .default(true)
          .describe('Include the onPageEnter / onPageLeave hooks.'),
        not_found: z.boolean().default(false).describe('Mark the new route as the 404 page.'),
        inbounds: z
          .array(
            z.object({
              property: z.string().describe('Component property, e.g. "_user".'),
              channel: z.string().describe('Channel feeding the property, e.g. "user".'),
            }),
          )
          .default([])
          .describe('Channel bindings declared in "static inbounds".'),
        pages_directory: z
          .string()
          .default('src/pages')
          .describe('Directory holding the pages, relative to the project root.'),
        dry_run: z
          .boolean()
          .default(true)
          .describe('Preview the changes without writing them to disk.'),
        response_format: responseFormatArg,
      },
      outputSchema: {
        applied: z.boolean(),
        tag: z.string(),
        class_name: z.string(),
        route_name: z.string(),
        route_path: z.string(),
        page_file: z.string(),
        routes_file: z.string(),
        changes: z.array(changeSchema),
        written_files: z.array(z.string()),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    safeHandler(args => {
      const root = resolveProjectRoot(args.project_root);
      const result = scaffoldPage({
        root,
        pageName: args.page_name,
        ...(args.route_name ? { routeName: args.route_name } : {}),
        ...(args.route_path ? { routePath: args.route_path } : {}),
        ...(args.routes_file ? { routesFile: args.routes_file } : {}),
        language: args.language,
        shadowDom: args.shadow_dom,
        transitions: args.transitions,
        lifecycleHooks: args.lifecycle_hooks,
        notFound: args.not_found,
        inbounds: args.inbounds,
        pagesDirectory: args.pages_directory,
      });

      const written = args.dry_run ? [] : applyChanges(root, result.changes);

      const output = {
        applied: !args.dry_run,
        tag: result.tag,
        class_name: result.className,
        route_name: result.routeName,
        route_path: result.routePath,
        page_file: result.pageFile,
        routes_file: result.routesFile,
        changes: result.changes.map(change => ({
          file: change.file,
          action: change.action,
          content: change.content,
          ...(change.diff ? { diff: change.diff } : {}),
        })),
        written_files: written,
      };

      if (args.response_format === 'json') {
        return toolResponse(JSON.stringify(output, null, 2), output);
      }

      const pageChange = result.changes.find(change => change.action === 'create');
      const routesChange = result.changes.find(change => change.action === 'update');

      const text = [
        `# Page \`<${result.tag}>\`${args.dry_run ? ' — preview' : ' — created'}`,
        '',
        `- Route: \`${result.routeName}\` → \`${result.routePath}\``,
        `- Component: \`${result.pageFile}\``,
        `- Routes file: \`${result.routesFile}\``,
        '',
        args.dry_run
          ? '_Nothing was written. Call again with `dry_run: false` to apply._'
          : `Written: ${written.map(file => `\`${file}\``).join(', ')}.`,
        '',
        `## ${result.pageFile}`,
        '',
        '```' + args.language,
        pageChange?.content.trimEnd() ?? '',
        '```',
        '',
        `## ${result.routesFile}`,
        '',
        '```diff',
        routesChange?.diff ?? '',
        '```',
      ].join('\n');

      return toolResponse(text, output, 'Use json format to read the full file contents.');
    }),
  );

  server.registerTool(
    'open_cells_create_app',
    {
      title: 'Create an Open Cells application',
      description: `Scaffold a new Open Cells application with @open-cells/create-app.

Runs the official generator non-interactively and creates <destination>/<name> with a Lit + TypeScript project: routes, shell component, pages and configuration. Downloads the package from npm, so it needs network access, and it does NOT install dependencies — the returned next steps cover that.

Args:
  - name (string): application name (lowercase letters, digits and hyphens)
  - destination (string): existing directory the application folder is created in
  - template ('blank' | 'example'): empty app, or the recipes example (default: 'blank')
  - timeout_ms (number): time budget for the generator (default: 180000)

Returns:
  { "app_directory": string, "command": string, "next_steps": [string], "output": string }

Use when: starting a new application from scratch.
Don't use when: you only need one more page in an existing app — use open_cells_scaffold_page.`,
      inputSchema: {
        name: z.string().min(1).describe('Application name, e.g. "my-app".'),
        destination: z
          .string()
          .describe('Existing directory where the application folder will be created.'),
        template: z
          .enum(['blank', 'example'])
          .default('blank')
          .describe("'blank' for an empty app, 'example' for the recipes example."),
        timeout_ms: z
          .number()
          .int()
          .min(10_000)
          .max(600_000)
          .default(180_000)
          .describe('Maximum time the generator may take.'),
      },
      outputSchema: {
        app_directory: z.string(),
        command: z.string(),
        next_steps: z.array(z.string()),
        output: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    safeHandler(async args => {
      const result = await createApp({
        name: args.name,
        template: args.template,
        destination: args.destination,
        timeoutMs: args.timeout_ms,
      });

      const output = {
        app_directory: result.appDirectory,
        command: result.command,
        next_steps: result.nextSteps,
        output: result.stdout,
      };

      const text = [
        `# Application created in \`${result.appDirectory}\``,
        '',
        '## Next steps',
        '',
        ...result.nextSteps.map(step => `\`\`\`sh\n${step}\n\`\`\``),
      ].join('\n');

      return toolResponse(text, output);
    }),
  );
}
