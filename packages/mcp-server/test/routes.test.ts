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

import { afterEach, describe, expect, it } from 'vitest';
import { analyzeRoutes, extractParams, validateRoutes } from '../src/analysis/routes.js';
import { RECIPES_APP, createProject, fullProjectFiles, removeProject } from './helpers.js';

const projects: string[] = [];

function project(files: Record<string, string>): string {
  const root = createProject(files);
  projects.push(root);
  return root;
}

afterEach(() => {
  while (projects.length) {
    removeProject(projects.pop()!);
  }
});

describe('extractParams', () => {
  it('reads the dynamic segments of a pattern', () => {
    expect(extractParams('/recipe/:recipeId')).toEqual(['recipeId']);
    expect(extractParams('/a/:one/b/:two')).toEqual(['one', 'two']);
    expect(extractParams('/static')).toEqual([]);
  });
});

describe('analyzeRoutes', () => {
  it('parses the routes of the recipes example', () => {
    const analysis = analyzeRoutes(RECIPES_APP);

    expect(analysis.file).toBe('src/router/routes.ts');
    expect(analysis.exportName).toBe('routes');
    expect(analysis.routes.map(route => route.name)).toEqual([
      'home',
      'category',
      'recipe',
      'favorite-recipes',
      'not-found',
    ]);

    const recipe = analysis.routes.find(route => route.name === 'recipe');
    expect(recipe?.paths).toEqual(['/recipe/:recipeId']);
    expect(recipe?.params).toEqual(['recipeId']);
    expect(recipe?.component).toBe('recipe-page');
    expect(recipe?.lazyImports).toEqual(['../pages/recipe/recipe-page.js']);
    expect(recipe?.hasAction).toBe(true);
  });

  it('ignores files that only mention RouteDefinition in a comment', () => {
    // The core's bridge.js has `@param {RouteDefinition[]} routesArray` in a JSDoc block, which a
    // text based search picks up as the routes file.
    const root = project({
      'src/bridge.js': `/**
 * @param {RouteDefinition[]} routesArray - The array of routes to be parsed.
 */
export function parseRoutes(routesArray) {
  return routesArray;
}
`,
      'src/app/routes.ts': `export const routes = [
  { path: '/', name: 'home', component: 'home-page', action: async () => {} },
];
`,
    });

    expect(analyzeRoutes(root).file).toBe('src/app/routes.ts');
  });

  it('reports the candidates instead of guessing when several apps are in range', () => {
    const routesFile = `export const routes = [
  { path: '/', name: 'home', component: 'home-page', action: async () => {} },
];
`;
    const root = project({
      'packages/one/config/nav.ts': routesFile,
      'packages/two/config/nav.ts': routesFile,
    });

    expect(() => analyzeRoutes(root)).toThrow(/declare route arrays/);
    expect(() => analyzeRoutes(root)).toThrow(/packages\/one\/config\/nav\.ts/);
  });

  it('prefers a file named routes.* over other route arrays', () => {
    const root = project({
      'packages/app/router/routes.ts': `export const routes = [
  { path: '/', name: 'home', component: 'home-page', action: async () => {} },
];
`,
      'packages/app/config/inline.ts': `startApp({
  mainNode: 'app-content',
  routes: [{ path: '/other', name: 'other', component: 'other-page' }],
});
`,
    });

    expect(analyzeRoutes(root).file).toBe('packages/app/router/routes.ts');
  });

  it('supports several patterns on one route', () => {
    const root = project({
      'src/router/routes.ts': `export const routes = [
  { path: ['/a', '/b/*'], name: 'multi', component: 'multi-page', action: async () => {} },
];
`,
    });

    const [route] = analyzeRoutes(root).routes;
    expect(route?.paths).toEqual(['/a', '/b/*']);
    expect(route?.wildcard).toBe(true);
  });
});

describe('validateRoutes', () => {
  it('accepts a well formed application', () => {
    const root = project(fullProjectFiles());
    const { diagnostics } = validateRoutes(root);

    expect(diagnostics.filter(diagnostic => diagnostic.severity === 'error')).toEqual([]);
    expect(diagnostics.map(diagnostic => diagnostic.code)).not.toContain('no-not-found-route');
  });

  it('reports duplicated names and patterns', () => {
    const root = project({
      'src/router/routes.ts': `export const routes = [
  { path: '/', name: 'home', component: 'home-page', action: async () => {} },
  { path: '/', name: 'home', component: 'other-page', action: async () => {} },
];
`,
    });

    const codes = validateRoutes(root).diagnostics.map(diagnostic => diagnostic.code);
    expect(codes).toContain('duplicate-name');
    expect(codes).toContain('duplicate-path');
  });

  it('flags an unresolvable lazy import', () => {
    const files = fullProjectFiles();
    files['src/router/routes.ts'] = files['src/router/routes.ts']!.replace(
      '../pages/detail/detail-page.js',
      '../pages/detail/missing-page.js',
    );
    const root = project(files);

    const diagnostic = validateRoutes(root).diagnostics.find(
      entry => entry.code === 'lazy-import-unresolved',
    );
    expect(diagnostic?.route).toBe('detail');
    expect(diagnostic?.severity).toBe('error');
  });

  it('resolves ".js" specifiers against their ".ts" source', () => {
    const root = project(fullProjectFiles());
    const codes = validateRoutes(root).diagnostics.map(diagnostic => diagnostic.code);

    expect(codes).not.toContain('lazy-import-unresolved');
  });

  it('warns when no route is flagged as the 404 page', () => {
    // This is the case of the recipes example, which declares `notFound: false`.
    const diagnostic = validateRoutes(RECIPES_APP).diagnostics.find(
      entry => entry.code === 'no-not-found-route',
    );

    expect(diagnostic?.severity).toBe('warning');
    expect(diagnostic?.route).toBe('not-found');
  });

  it('cross-checks the route names used by startApp', () => {
    const files = fullProjectFiles();
    files['src/components/app-index.ts'] = files['src/components/app-index.ts']!.replace(
      "persistentPages: ['home']",
      "persistentPages: ['hom']",
    );
    const root = project(files);

    const diagnostic = validateRoutes(root).diagnostics.find(
      entry => entry.code === 'unknown-page-reference',
    );
    expect(diagnostic?.message).toContain('"hom"');
    expect(diagnostic?.file).toBe('src/components/app-index.ts');
  });

  it('warns about a component that is never defined', () => {
    const files = fullProjectFiles();
    delete files['src/pages/detail/detail-page.ts'];
    const root = project(files);

    const codes = validateRoutes(root).diagnostics.map(diagnostic => diagnostic.code);
    expect(codes).toContain('component-not-defined');
  });

  it('rejects an invalid custom element tag', () => {
    const root = project({
      'src/router/routes.ts': `export const routes = [
  { path: '/', name: 'home', component: 'home', action: async () => {} },
];
`,
    });

    const diagnostic = validateRoutes(root).diagnostics.find(
      entry => entry.code === 'invalid-component-tag',
    );
    expect(diagnostic?.severity).toBe('error');
  });
});
