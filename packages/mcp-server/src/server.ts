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

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SERVER_NAME, SERVER_VERSION } from './constants.js';
import { API_MODULES, GUIDES } from './docs/reference.js';
import { renderGuide, renderModule } from './tools/docs.js';
import { registerChannelTools } from './tools/channels.js';
import { registerDocsTools } from './tools/docs.js';
import { registerRouteTools } from './tools/routes.js';
import { registerScaffoldTools } from './tools/scaffold.js';

/** Registers the documentation resources, so clients can read them without a tool call. */
function registerResources(server: McpServer): void {
  server.registerResource(
    'open-cells-api',
    new ResourceTemplate('opencells://api/{module}', {
      list: async () => ({
        resources: API_MODULES.map(module => ({
          uri: `opencells://api/${module.id}`,
          name: module.package,
          description: module.summary,
          mimeType: 'text/markdown',
        })),
      }),
    }),
    {
      title: 'Open Cells API reference',
      description: 'Public API of each Open Cells package, with signatures and examples.',
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const id = String(variables.module);
      const module = API_MODULES.find(entry => entry.id === id);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: module
              ? renderModule(module)
              : `Unknown module "${id}". Available: ${API_MODULES.map(entry => entry.id).join(', ')}.`,
          },
        ],
      };
    },
  );

  server.registerResource(
    'open-cells-guide',
    new ResourceTemplate('opencells://guide/{topic}', {
      list: async () => ({
        resources: GUIDES.map(guide => ({
          uri: `opencells://guide/${guide.id}`,
          name: guide.title,
          description: guide.summary,
          mimeType: 'text/markdown',
        })),
      }),
    }),
    {
      title: 'Open Cells guides',
      description:
        'Concept guides: project anatomy, routing, state channels, page lifecycle and configuration.',
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const id = String(variables.topic);
      const guide = GUIDES.find(entry => entry.id === id);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: guide
              ? renderGuide(guide)
              : `Unknown guide "${id}". Available: ${GUIDES.map(entry => entry.id).join(', ')}.`,
          },
        ],
      };
    },
  );
}

/** Builds the server with every tool and resource registered. */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        'Tools for Open Cells applications (web components + Lit). Analyse routes and state channels of a project, scaffold pages and applications, and look up the framework API. ' +
        'Read open_cells_api_reference or open_cells_docs_search before writing Open Cells code: navigation happens by route name, state travels over pub/sub channels bound with "static inbounds" / "static outbounds", and pages use PageController.',
    },
  );

  registerRouteTools(server);
  registerChannelTools(server);
  registerScaffoldTools(server);
  registerDocsTools(server);
  registerResources(server);

  return server;
}
