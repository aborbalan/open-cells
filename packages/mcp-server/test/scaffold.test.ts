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
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeRoutes, validateRoutes } from '../src/analysis/routes.js';
import { applyChanges, scaffoldPage } from '../src/scaffold/page.js';
import { createProject, fullProjectFiles, removeProject } from './helpers.js';

const projects: string[] = [];

function project(files: Record<string, string> = fullProjectFiles()): string {
  const root = createProject(files);
  projects.push(root);
  return root;
}

afterEach(() => {
  while (projects.length) {
    removeProject(projects.pop()!);
  }
});

describe('scaffoldPage', () => {
  it('builds the component and the route without writing anything', () => {
    const root = project();
    const result = scaffoldPage({ root, pageName: 'user-profile' });

    expect(result.tag).toBe('user-profile-page');
    expect(result.className).toBe('UserProfilePage');
    expect(result.routeName).toBe('user-profile');
    expect(result.routePath).toBe('/user-profile');
    expect(result.pageFile).toBe('src/pages/user-profile/user-profile-page.ts');

    expect(fs.existsSync(path.join(root, result.pageFile))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'src/router/routes.ts'), 'utf8')).not.toContain(
      'user-profile',
    );

    const page = result.changes.find(change => change.action === 'create')!;
    expect(page.content).toContain(`@customElement('user-profile-page')`);
    expect(page.content).toContain('pageController = new PageController(this)');
    expect(page.content).toContain('onPageEnter()');

    const routes = result.changes.find(change => change.action === 'update')!;
    expect(routes.diff).toContain("+    name: 'user-profile',");
  });

  it('accepts a name that already carries the -page suffix', () => {
    const root = project();
    const result = scaffoldPage({ root, pageName: 'user-profile-page' });

    expect(result.tag).toBe('user-profile-page');
    expect(result.routeName).toBe('user-profile');
  });

  it('keeps the 404 route last', () => {
    const root = project();
    applyChanges(root, scaffoldPage({ root, pageName: 'settings' }).changes);

    const names = analyzeRoutes(root).routes.map(route => route.name);
    expect(names).toEqual(['home', 'detail', 'settings', 'not-found']);
  });

  it('appends when the routes array has no 404 route', () => {
    const root = project({
      'src/router/routes.ts': `export const routes = [
  {
    path: '/',
    name: 'home',
    component: 'home-page',
    action: async () => {
      await import('../pages/home/home-page.js');
    },
  },
];
`,
    });
    applyChanges(root, scaffoldPage({ root, pageName: 'settings' }).changes);

    expect(analyzeRoutes(root).routes.map(route => route.name)).toEqual(['home', 'settings']);
  });

  it('produces a project that still validates', () => {
    const root = project();
    applyChanges(root, scaffoldPage({ root, pageName: 'settings' }).changes);

    const errors = validateRoutes(root).diagnostics.filter(
      diagnostic => diagnostic.severity === 'error',
    );
    expect(errors).toEqual([]);
  });

  it('writes the files when the changes are applied', () => {
    const root = project();
    const result = scaffoldPage({ root, pageName: 'settings' });
    const written = applyChanges(root, result.changes);

    expect(written).toEqual([result.pageFile, result.routesFile]);
    expect(fs.existsSync(path.join(root, result.pageFile))).toBe(true);
  });

  it('renders inbound bindings and the transitions mixin', () => {
    const root = project();
    const result = scaffoldPage({
      root,
      pageName: 'dashboard',
      transitions: true,
      lifecycleHooks: false,
      inbounds: [{ property: '_user', channel: 'user' }],
    });

    const page = result.changes[0]!.content;
    expect(page).toContain('PageTransitionsMixin(LitElement)');
    expect(page).toContain(`_user: { channel: 'user' },`);
    expect(page).toContain('declare _user: any;');
    expect(page).not.toContain('onPageEnter');
  });

  it('generates JavaScript without type-only syntax', () => {
    const root = project();
    const result = scaffoldPage({
      root,
      pageName: 'plain',
      language: 'js',
      inbounds: [{ property: '_user', channel: 'user' }],
    });

    expect(result.pageFile).toBe('src/pages/plain/plain-page.js');
    expect(result.changes[0]!.content).not.toContain('declare ');
    expect(result.changes[0]!.content).not.toContain('@ts-ignore');
  });

  it('registers a new 404 route at the end', () => {
    const root = project({
      'src/router/routes.ts': `export const routes = [
  { path: '/', name: 'home', component: 'home-page', action: async () => {} },
];
`,
    });
    applyChanges(root, scaffoldPage({ root, pageName: 'not-found', notFound: true }).changes);

    const routes = analyzeRoutes(root).routes;
    expect(routes[routes.length - 1]).toMatchObject({ name: 'not-found', notFound: true });
  });

  it('refuses to reuse a route name, path or component', () => {
    const root = project();

    expect(() => scaffoldPage({ root, pageName: 'other', routeName: 'home' })).toThrow(
      /already exists/,
    );
    expect(() => scaffoldPage({ root, pageName: 'other', routePath: '/' })).toThrow(
      /already used by route "home"/,
    );
    expect(() =>
      scaffoldPage({ root, pageName: 'home', routeName: 'home-alt', routePath: '/home-alt' }),
    ).toThrow(/already rendered/);
  });

  it('rejects invalid names', () => {
    const root = project();

    expect(() => scaffoldPage({ root, pageName: 'UserProfile' })).toThrow(/Invalid page name/);
    expect(() => scaffoldPage({ root, pageName: 'valid', routePath: 'no-slash' })).toThrow(
      /Invalid route path/,
    );
  });

  it('refuses to overwrite an existing page file', () => {
    const files = fullProjectFiles();
    files['src/pages/settings/settings-page.ts'] = '// already here\n';
    const root = project(files);

    expect(() => scaffoldPage({ root, pageName: 'settings' })).toThrow(/already exists/);
  });
});
