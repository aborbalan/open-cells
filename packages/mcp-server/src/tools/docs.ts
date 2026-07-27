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
import { API_MODULES, GUIDES, MODULE_IDS, findModule } from '../docs/reference.js';
import type { ApiEntry, ApiModule, Guide } from '../docs/reference.js';
import { searchDocs } from '../docs/search.js';

const entrySchema = z.object({
  name: z.string(),
  kind: z.string(),
  signature: z.string(),
  summary: z.string(),
  example: z.string().optional(),
});

/** Renders one API entry as markdown. */
export function renderEntry(entry: ApiEntry): string {
  const parts = [
    `### \`${entry.name}\` — ${entry.kind}`,
    '',
    '```ts',
    entry.signature,
    '```',
    '',
    entry.summary,
  ];

  if (entry.example) {
    parts.push('', '```ts', entry.example, '```');
  }

  return parts.join('\n');
}

/** Renders a whole module as markdown. */
export function renderModule(module: ApiModule): string {
  return [
    `# \`${module.package}\``,
    '',
    module.summary,
    '',
    ...module.entries.map(renderEntry),
  ].join('\n');
}

/** Renders a guide as markdown. */
export function renderGuide(guide: Guide): string {
  return [`# ${guide.title}`, '', guide.summary, '', guide.content].join('\n');
}

function serializeEntry(entry: ApiEntry): z.infer<typeof entrySchema> {
  return {
    name: entry.name,
    kind: entry.kind,
    signature: entry.signature,
    summary: entry.summary,
    ...(entry.example ? { example: entry.example } : {}),
  };
}

export function registerDocsTools(server: McpServer): void {
  server.registerTool(
    'open_cells_api_reference',
    {
      title: 'Open Cells API reference',
      description: `Return the API of an Open Cells package: signatures, semantics and working examples.

Covers @open-cells/core (startApp, navigate, publish/subscribe, RouteDefinition, CellsConfig, the interceptor), element-controller and page-controller (the controllers, 'static inbounds' / 'static outbounds', onPageEnter / onPageLeave, params), page-mixin, page-transitions, localize, core-plugin and create-app.

Args:
  - module ('${MODULE_IDS.join("' | '")}'): package to document; the '@open-cells/' prefix is also accepted
  - symbol (string, optional): return only this symbol, e.g. 'navigate'
  - response_format ('markdown' | 'json'): output format (default: 'markdown')

Returns:
  { "module": string, "package": string, "summary": string, "entries": [{ "name", "kind", "signature", "summary", "example" }] }

Use when: writing or reviewing Open Cells code, before guessing an API that does not exist.
Don't use when: you are looking for a concept rather than a symbol — use open_cells_docs_search, which also covers the guides.`,
      inputSchema: {
        module: z.string().describe(`Package to document. One of: ${MODULE_IDS.join(', ')}.`),
        symbol: z.string().optional().describe("Single symbol to return, e.g. 'navigate'."),
        response_format: z
          .enum(['markdown', 'json'])
          .default('markdown')
          .describe('Output format.'),
      },
      outputSchema: {
        module: z.string(),
        package: z.string(),
        summary: z.string(),
        entries: z.array(entrySchema),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    safeHandler(({ module, symbol, response_format }) => {
      const found = findModule(module);
      if (!found) {
        return toolResponse(
          `Unknown module "${module}". Available modules: ${MODULE_IDS.join(', ')}.`,
          { module, package: '', summary: '', entries: [] },
        );
      }

      const entries = symbol
        ? found.entries.filter(entry => entry.name.toLowerCase() === symbol.toLowerCase())
        : found.entries;

      if (symbol && !entries.length) {
        return toolResponse(
          `"${symbol}" is not documented in ${found.package}. Documented symbols: ${found.entries
            .map(entry => entry.name)
            .join(', ')}.`,
          { module: found.id, package: found.package, summary: found.summary, entries: [] },
        );
      }

      const output = {
        module: found.id,
        package: found.package,
        summary: found.summary,
        entries: entries.map(serializeEntry),
      };

      const text =
        response_format === 'json'
          ? JSON.stringify(output, null, 2)
          : symbol
            ? [`# \`${found.package}\``, '', ...entries.map(renderEntry)].join('\n')
            : renderModule({ ...found, entries });

      return toolResponse(text, output, 'Request a single "symbol" to narrow the answer.');
    }),
  );

  server.registerTool(
    'open_cells_docs_search',
    {
      title: 'Search the Open Cells documentation',
      description: `Search the Open Cells API reference and concept guides.

Ranks symbol names and signatures above prose, so a query like 'publish' returns the API entry before the guide that mentions it. The guides cover project anatomy, routing and navigation, state channels and bindings, the page lifecycle, and the startApp configuration.

Args:
  - query (string): free text, e.g. 'how do I subscribe to a channel'
  - limit (number): maximum results, 1-20 (default: 5)
  - response_format ('markdown' | 'json'): output format (default: 'markdown')

Returns:
  { "query": string, "count": number, "results": [{ "type": "api"|"guide", "id", "title", "package", "summary", "snippet", "score" }] }

Use when: you do not know which symbol or package solves the problem. Follow up with open_cells_api_reference for the full signature and example.`,
      inputSchema: {
        query: z.string().min(2).describe('Free text query.'),
        limit: z.number().int().min(1).max(20).default(5).describe('Maximum number of results.'),
        response_format: z
          .enum(['markdown', 'json'])
          .default('markdown')
          .describe('Output format.'),
      },
      outputSchema: {
        query: z.string(),
        count: z.number(),
        results: z.array(
          z.object({
            type: z.enum(['api', 'guide']),
            id: z.string(),
            title: z.string(),
            package: z.string().optional(),
            summary: z.string(),
            snippet: z.string(),
            score: z.number(),
          }),
        ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    safeHandler(({ query, limit, response_format }) => {
      const results = searchDocs(query, limit);
      const output = { query, count: results.length, results };

      if (!results.length) {
        return toolResponse(
          `No documentation matches "${query}". Available guides: ${GUIDES.map(
            guide => guide.id,
          ).join(', ')}. Available modules: ${API_MODULES.map(module => module.id).join(', ')}.`,
          output,
        );
      }

      const text =
        response_format === 'json'
          ? JSON.stringify(output, null, 2)
          : [
              `# Documentation matches for "${query}"`,
              '',
              ...results.map(hit =>
                [
                  `## ${hit.title}`,
                  '',
                  `- id: \`${hit.id}\` (${hit.type})`,
                  hit.package ? `- package: \`${hit.package}\`` : '',
                  '',
                  hit.summary,
                  '',
                  `> ${hit.snippet}`,
                  '',
                ]
                  .filter(Boolean)
                  .join('\n'),
              ),
              hint(results),
            ].join('\n');

      return toolResponse(text, output, 'Lower "limit" or refine the query.');
    }),
  );
}

/** Closing hint pointing at the tool that returns the full entry. */
function hint(results: { type: string; id: string }[]): string {
  const api = results.find(result => result.type === 'api');
  if (!api) {
    return '';
  }
  const [moduleId, symbol] = api.id.split('.');
  return `_Full signature and example: \`open_cells_api_reference\` with module="${moduleId}", symbol="${symbol}"._`;
}
