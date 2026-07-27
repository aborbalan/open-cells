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

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** The recipes example shipped in the monorepo, used as a realistic fixture. */
export const RECIPES_APP = path.resolve(here, '../../example/recipes-app');

/** Creates a throwaway project from a map of relative path to file contents. */
export function createProject(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'open-cells-mcp-'));

  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }

  return root;
}

/** Removes a project created with {@link createProject}. */
export function removeProject(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

/** A minimal but valid routes file: two pages plus the 404 route. */
export const ROUTES_FIXTURE = `import { RouteDefinition } from '@open-cells/core/types';

export const routes: RouteDefinition[] = [
  {
    path: '/',
    name: 'home',
    component: 'home-page',
    action: async () => {
      await import('../pages/home/home-page.js');
    },
  },
  {
    path: '/detail/:detailId',
    name: 'detail',
    component: 'detail-page',
    action: async () => {
      await import('../pages/detail/detail-page.js');
    },
  },
  {
    path: '/not-found',
    name: 'not-found',
    notFound: true,
    component: 'not-found-page',
    action: async () => {
      await import('../pages/not-found/not-found-page.js');
    },
  },
];
`;

/** A page component defining its custom element, so route validation can resolve it. */
export function pageFixture(tag: string): string {
  const className = tag
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  return `import { html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';
import { PageController } from '@open-cells/page-controller';

@customElement('${tag}')
export class ${className} extends LitElement {
  pageController = new PageController(this);

  render() {
    return html\`<h1>${tag}</h1>\`;
  }
}
`;
}

/** A complete project: routes, the three pages they reference and a shell calling startApp. */
export function fullProjectFiles(): Record<string, string> {
  return {
    'src/router/routes.ts': ROUTES_FIXTURE,
    'src/pages/home/home-page.ts': pageFixture('home-page'),
    'src/pages/detail/detail-page.ts': pageFixture('detail-page'),
    'src/pages/not-found/not-found-page.ts': pageFixture('not-found-page'),
    'src/components/app-index.ts': `import { startApp } from '@open-cells/core';
import { routes } from '../router/routes.js';

startApp({
  routes,
  mainNode: 'app-content',
  persistentPages: ['home'],
});
`,
  };
}
