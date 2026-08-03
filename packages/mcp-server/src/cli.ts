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
 * The command line, kept apart from the server it starts.
 *
 * `index.ts` connects a transport to stdio, so nothing in it can run inside a test. Argument
 * parsing has no such excuse: it is a pure function with more branches than it looks, and flag
 * parsing is exactly the kind of thing that breaks quietly.
 */

import { SERVER_NAME, SERVER_VERSION } from './constants.js';

export const USAGE = `${SERVER_NAME} ${SERVER_VERSION}

Model Context Protocol server for Open Cells applications (stdio transport).

Usage:
  open-cells-mcp [--project-root <path>]

Options:
  --project-root <path>  Application analysed when a tool call omits "project_root".
                         Can also be set with OPEN_CELLS_PROJECT_ROOT.
  -h, --help             Show this message.
`;

export interface CliOptions {
  projectRoot?: string;
  help: boolean;
}

/** Reads the supported flags. Unknown flags are ignored so clients can pass extras. */
export function parseArgs(argv: string[]): CliOptions {
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
