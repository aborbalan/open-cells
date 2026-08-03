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

/**
 * The stdio entry point, and nothing else.
 *
 * Everything here needs a live transport, so none of it can execute inside a test. That is why the
 * command line moved to `cli.ts`: what is left is the wiring, and its 0 % is honest rather than a
 * place for logic to hide. Keep it that way — anything worth asserting goes next door.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { USAGE, parseArgs } from './cli.js';
import { SERVER_NAME, SERVER_VERSION } from './constants.js';
import { setDefaultProjectRoot } from './project.js';
import { createServer } from './server.js';

export { createServer } from './server.js';

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
