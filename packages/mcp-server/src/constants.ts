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

export const SERVER_NAME = 'open-cells-mcp-server';

export const SERVER_VERSION = '0.1.0';

/** Maximum size of a tool response, in characters, before it gets truncated. */
export const CHARACTER_LIMIT = 25000;

/** Environment variable used to pin the analysed project when no argument is given. */
export const PROJECT_ROOT_ENV = 'OPEN_CELLS_PROJECT_ROOT';

/** Directories that never contain application sources worth analysing. */
export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.wireit',
  '.next',
  '.cache',
  'out',
]);

/** Extensions scanned when looking for routes, components and channels. */
export const SOURCE_EXTENSIONS = ['.ts', '.js', '.mts', '.mjs', '.cts', '.cjs'];

/** Conventional locations of the route definitions inside an Open Cells app. */
export const ROUTE_FILE_CANDIDATES = [
  'src/router/routes.ts',
  'src/router/routes.js',
  'src/router/routes.mjs',
  'src/routes.ts',
  'src/routes.js',
  'router/routes.ts',
  'router/routes.js',
  'routes.ts',
  'routes.js',
];

/**
 * Prefix used by the core for its internal bridge channels. Channels starting with it are managed
 * by Open Cells itself, so they are excluded from "orphan channel" warnings.
 */
export const INTERNAL_CHANNEL_PREFIX = '__oc_';

/** Prefix of the private channel a `PageController` uses for `onPageEnter` / `onPageLeave`. */
export const PAGE_PRIVATE_CHANNEL_PREFIX = '__oc_page_';
