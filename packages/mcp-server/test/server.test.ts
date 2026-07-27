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

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';
import { RECIPES_APP, createProject, fullProjectFiles, removeProject } from './helpers.js';

let client: Client;
const projects: string[] = [];

function project(): string {
  const root = createProject(fullProjectFiles());
  projects.push(root);
  return root;
}

/** Text content of a tool result, for the assertions that look at the readable output. */
function textOf(result: unknown): string {
  const content = (result as { content: { type: string; text?: string }[] }).content ?? [];
  return content.map(entry => entry.text ?? '').join('\n');
}

beforeEach(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test-client', version: '1.0.0' });

  await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
  while (projects.length) {
    removeProject(projects.pop()!);
  }
});

describe('MCP surface', () => {
  it('exposes every tool with annotations and schemas', async () => {
    const { tools } = await client.listTools();
    const names = tools.map(tool => tool.name).sort();

    expect(names).toEqual([
      'open_cells_api_reference',
      'open_cells_create_app',
      'open_cells_docs_search',
      'open_cells_list_channels',
      'open_cells_list_routes',
      'open_cells_scaffold_page',
      'open_cells_validate_routes',
    ]);

    for (const tool of tools) {
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.inputSchema, tool.name).toBeTruthy();
      expect(tool.annotations, tool.name).toBeTruthy();
    }

    const listRoutes = tools.find(tool => tool.name === 'open_cells_list_routes');
    expect(listRoutes?.annotations?.readOnlyHint).toBe(true);
    expect(listRoutes?.outputSchema).toBeTruthy();
  });

  it('lists the documentation resources', async () => {
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map(template => template.uriTemplate)).toEqual([
      'opencells://api/{module}',
      'opencells://guide/{topic}',
    ]);

    const guide = await client.readResource({ uri: 'opencells://guide/routing' });
    expect(String(guide.contents[0]?.text)).toContain('Navigation is by name');

    const api = await client.readResource({ uri: 'opencells://api/core' });
    expect(String(api.contents[0]?.text)).toContain('startApp');
  });

  it('returns routes as structured content', async () => {
    const result = await client.callTool({
      name: 'open_cells_list_routes',
      arguments: { project_root: RECIPES_APP },
    });

    const structured = result.structuredContent as { count: number; routes: { name: string }[] };
    expect(structured.count).toBe(5);
    expect(structured.routes.map(route => route.name)).toContain('recipe');
    expect(textOf(result)).toContain('| recipe |');
  });

  it('validates routes and summarises the diagnostics', async () => {
    const result = await client.callTool({
      name: 'open_cells_validate_routes',
      arguments: { project_root: project(), response_format: 'json' },
    });

    const structured = result.structuredContent as {
      summary: { error: number };
      route_count: number;
    };
    expect(structured.route_count).toBe(3);
    expect(structured.summary.error).toBe(0);
  });

  it('maps channels and filters by name', async () => {
    const result = await client.callTool({
      name: 'open_cells_list_channels',
      arguments: { project_root: RECIPES_APP, channel: 'categories' },
    });

    const structured = result.structuredContent as { count: number; channels: { name: string }[] };
    expect(structured.count).toBe(1);
    expect(structured.channels[0]?.name).toBe('categories');
  });

  it('previews a page without touching the disk, then writes it', async () => {
    const root = project();

    const preview = await client.callTool({
      name: 'open_cells_scaffold_page',
      arguments: { project_root: root, page_name: 'settings' },
    });
    expect((preview.structuredContent as { applied: boolean }).applied).toBe(false);
    expect((preview.structuredContent as { written_files: string[] }).written_files).toEqual([]);
    expect(textOf(preview)).toContain('dry_run');

    const applied = await client.callTool({
      name: 'open_cells_scaffold_page',
      arguments: { project_root: root, page_name: 'settings', dry_run: false },
    });
    expect((applied.structuredContent as { written_files: string[] }).written_files).toEqual([
      'src/pages/settings/settings-page.ts',
      'src/router/routes.ts',
    ]);

    const routes = await client.callTool({
      name: 'open_cells_list_routes',
      arguments: { project_root: root },
    });
    expect((routes.structuredContent as { count: number }).count).toBe(4);
  });

  it('reports a failed call as an error result instead of throwing', async () => {
    const result = await client.callTool({
      name: 'open_cells_list_routes',
      arguments: { project_root: '/does/not/exist' },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Project root not found');
  });

  it('answers API questions', async () => {
    const reference = await client.callTool({
      name: 'open_cells_api_reference',
      arguments: { module: 'page-controller', symbol: 'onPageEnter' },
    });
    expect(textOf(reference)).toContain('onPageEnter');

    const search = await client.callTool({
      name: 'open_cells_docs_search',
      arguments: { query: 'navigate to a route', limit: 3 },
    });
    expect((search.structuredContent as { count: number }).count).toBeGreaterThan(0);
  });
});
