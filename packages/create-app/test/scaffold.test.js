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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(packageRoot, 'src', 'create.js');

/**
 * Runs the scaffolder exactly the way `npx @open-cells/create-app` does, in a throwaway
 * directory. The CLI answers its own prompts from these flags.
 */
async function scaffold(type, name) {
  const workdir = await mkdtemp(join(tmpdir(), 'open-cells-scaffold-'));
  await run(process.execPath, [cli, '--type', type, '--name', name, '--writeToDisk', 'true'], {
    cwd: workdir,
  });
  return { root: join(workdir, name), workdir };
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('scaffolding a blank webapp', () => {
  let root;
  let workdir;

  beforeAll(async () => {
    ({ root, workdir } = await scaffold('blankWebapp', 'blank-smoke-app'));
  });

  afterAll(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it('should write a package.json named after the application', async () => {
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    expect(manifest.name).toBe('blank-smoke-app');
  });

  it('should depend on the framework', async () => {
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    expect(Object.keys(manifest.dependencies)).toContain('@open-cells/core');
  });

  it('should give the application something to run', async () => {
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    expect(Object.keys(manifest.scripts)).toEqual(expect.arrayContaining(['dev', 'build']));
  });

  it('should write an entry document', async () => {
    expect(await readFile(join(root, 'index.html'), 'utf8')).toContain('app-index');
  });

  it('should write a tsconfig', async () => {
    expect(await readFile(join(root, 'tsconfig.json'), 'utf8')).toContain('compilerOptions');
  });

  it('should write the two starter pages', async () => {
    expect(await exists(join(root, 'src/pages/home/home-page.ts'))).toBe(true);
    expect(await exists(join(root, 'src/pages/second/second-page.ts'))).toBe(true);
  });

  it('should route to both of them', async () => {
    const routes = await readFile(join(root, 'src/router/routes.ts'), 'utf8');
    expect(routes).toContain('home');
    expect(routes).toContain('second');
  });

  it('should write the root component', async () => {
    expect(await exists(join(root, 'src/components/app-index.ts'))).toBe(true);
  });

  it('should carry the editor and linter configuration', async () => {
    expect(await exists(join(root, '.editorconfig'))).toBe(true);
    expect(await exists(join(root, '.eslintrc.json'))).toBe(true);
    expect(await exists(join(root, '.prettierrc.json'))).toBe(true);
    expect(await exists(join(root, '.gitignore'))).toBe(true);
  });
});

describe('scaffolding an example webapp', () => {
  let root;
  let workdir;

  beforeAll(async () => {
    ({ root, workdir } = await scaffold('exampleWebapp', 'example-smoke-app'));
  });

  afterAll(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it('should write a package.json named after the application', async () => {
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    expect(manifest.name).toBe('example-smoke-app');
  });

  it('should depend on the framework and on Lit', async () => {
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    expect(Object.keys(manifest.dependencies)).toEqual(
      expect.arrayContaining(['@open-cells/core', 'lit']),
    );
  });

  it('should write every page of the example', async () => {
    for (const page of ['home', 'category', 'recipe', 'favorite-recipes', 'not-found']) {
      expect(await exists(join(root, `src/pages/${page}`)), page).toBe(true);
    }
  });

  it('should route to them', async () => {
    const routes = await readFile(join(root, 'src/router/routes.ts'), 'utf8');
    for (const name of ['home', 'category', 'recipe']) {
      expect(routes, name).toContain(name);
    }
  });

  it('should carry the application configuration', async () => {
    expect(await exists(join(root, 'src/config/app.config.js'))).toBe(true);
  });

  it('should write the shared component library', async () => {
    expect(await exists(join(root, 'src/components/page-layout.ts'))).toBe(true);
    expect(await exists(join(root, 'src/components/meals.ts'))).toBe(true);
  });
});
