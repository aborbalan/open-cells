#!/usr/bin/env node
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

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SERVER_NAME, SERVER_VERSION } from './constants.js';
import { setDefaultProjectRoot } from './project.js';
import { createServer } from './server.js';

export { createServer } from './server.js';

const USAGE = `${SERVER_NAME} ${SERVER_VERSION}

Model Context Protocol server for Open Cells applications (stdio transport).

Usage:
  open-cells-mcp [--project-root <path>]

Options:
  --project-root <path>  Application analysed when a tool call omits "project_root".
                         Can also be set with OPEN_CELLS_PROJECT_ROOT.
  -h, --help             Show this message.
`;

/** Reads the supported flags. Unknown flags are ignored so clients can pass extras. */
function parseArgs(argv: string[]): { projectRoot?: string; help: boolean } {
  let projectRoot: string | undefined;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      help = true;
    } else if (argument === '--project-root') {
      projectRoot = argv[index + 1];
      index += 1;
    } else if (argument?.startsWith('--project-root=')) {
      projectRoot = argument.slice('--project-root='.length);
    }
  }

  return { ...(projectRoot ? { projectRoot } : {}), help };
}

async function main(): Promise<void> {
  const { projectRoot, help } = parseArgs(process.argv.slice(2));

  if (help) {
    process.stdout.write(USAGE);
    return;
  }

  setDefaultProjectRoot(projectRoot);

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout carries the protocol, so any logging must go to stderr.
  process.stderr.write(`${SERVER_NAME} ${SERVER_VERSION} listening on stdio\n`);
}

main().catch(error => {
  process.stderr.write(`${SERVER_NAME}: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
