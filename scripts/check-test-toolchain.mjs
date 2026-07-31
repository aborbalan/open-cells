#!/usr/bin/env node
/**
 * Guards the test toolchain against the two ways it rots:
 *
 * 1. More than one copy of a runner. Playwright keys its browser downloads by version, so two resolved
 *    Playwright versions mean two full browser sets on every clean install and two drivers to keep
 *    working. Vitest is worse: `@vitest/browser-playwright` pins its peer on the exact `vitest`
 *    version, so a second copy is a broken run rather than a slow one.
 * 2. A test or a test config importing something its package does not declare. It works for as long as
 *    the root happens to hoist it, and then it fails somewhere unrelated.
 *
 * Run with `npm run test:toolchain`. Exits non-zero listing what is wrong.
 */

import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Runners that must resolve to exactly one version across the whole install. */
const SINGLETONS = [
  'playwright',
  'playwright-core',
  '@playwright/test',
  'vitest',
  '@vitest/browser',
  '@vitest/browser-playwright',
  '@vitest/coverage-istanbul',
];

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const show = path => relative(ROOT, path) || '.';

/** Every `node_modules` directory in the tree, hoisted and nested alike. */
function nodeModulesDirs(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.name === 'node_modules') found.push(path);
    nodeModulesDirs(path, found);
  }
  return found;
}

function installedVersions(name, moduleDirs) {
  const versions = new Map();
  for (const modules of moduleDirs) {
    const installed = join(modules, name);
    const manifest = join(installed, 'package.json');
    if (!existsSync(manifest)) continue;
    // A workspace symlinked into node_modules is the workspace itself, not a second copy.
    if (lstatSync(installed).isSymbolicLink()) continue;
    const { version } = readJson(manifest);
    if (!versions.has(version)) versions.set(version, []);
    versions.get(version).push(show(installed));
  }
  return versions;
}

/** Shared test infrastructure lives at the root, so the root has to declare what it imports. */
const ROOT_TEST_FILES = ['vitest.shared.mjs', 'test-browsers.mjs'];

function workspaces() {
  const found = [{ dir: ROOT, pkg: readJson(join(ROOT, 'package.json')), files: ROOT_TEST_FILES }];
  for (const group of ['packages', 'packages/example']) {
    for (const entry of readdirSync(join(ROOT, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(ROOT, group, entry.name);
      const manifest = join(dir, 'package.json');
      if (existsSync(manifest)) found.push({ dir, pkg: readJson(manifest) });
    }
  }
  return found;
}

const SOURCE_FILE = /\.(js|mjs|ts)$/;
const CONFIG_FILE = /^(vite|vitest|web-test-runner|playwright)\.[\w.-]*\.(js|mjs|ts)$/;

/** The test files and the test configuration of a workspace — what the suite actually loads. */
function testSources(dir, explicit) {
  if (explicit) return explicit.map(file => join(dir, file));
  const files = [];
  for (const sub of ['test', 'tests']) {
    const path = join(dir, sub);
    if (existsSync(path)) walk(path, files);
  }
  for (const entry of readdirSync(dir)) {
    if (CONFIG_FILE.test(entry)) files.push(join(dir, entry));
  }
  return files;
}

function walk(dir, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, files);
    else if (SOURCE_FILE.test(entry.name)) files.push(path);
  }
}

/** The package a bare specifier resolves to: `@scope/name/sub` -> `@scope/name`. */
const packageOf = specifier => {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
};

const IMPORTS = [/\bfrom\s+['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g];

/**
 * Drops comments and template literals before the import scan.
 *
 * A suite that writes fixture projects to disk holds their source in backticks — the mcp-server
 * tests do exactly that — and an `import` inside one of those strings is not an import the package
 * makes. Reading it as one asks the package to declare dependencies it never loads.
 */
function stripNonCode(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, '``');
}

function importedPackages(file) {
  const source = stripNonCode(readFileSync(file, 'utf8'));
  const names = new Set();
  for (const pattern of IMPORTS) {
    for (const [, specifier] of source.matchAll(pattern)) {
      if (/^[./]/.test(specifier) || specifier.startsWith('node:')) continue;
      names.add(packageOf(specifier));
    }
  }
  return names;
}

const problems = [];
const moduleDirs = nodeModulesDirs(ROOT);

for (const name of SINGLETONS) {
  const versions = installedVersions(name, moduleDirs);
  if (versions.size <= 1) continue;
  const detail = [...versions]
    .map(([version, paths]) => `      ${version}  (${paths.join(', ')})`)
    .join('\n');
  problems.push(`${name} resolves to ${versions.size} versions:\n${detail}`);
}

for (const { dir, pkg, files: explicit } of workspaces()) {
  const declared = new Set([
    pkg.name,
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]);
  const undeclared = new Map();
  for (const file of testSources(dir, explicit)) {
    for (const name of importedPackages(file)) {
      if (declared.has(name)) continue;
      if (!undeclared.has(name)) undeclared.set(name, []);
      undeclared.get(name).push(show(file));
    }
  }
  for (const [name, files] of undeclared) {
    problems.push(
      `${pkg.name} imports "${name}" without declaring it:\n      ${files.join('\n      ')}`,
    );
  }
}

if (problems.length) {
  console.error('Test toolchain check failed:\n');
  for (const problem of problems) console.error(`  - ${problem}\n`);
  process.exit(1);
}

console.log(
  `Test toolchain OK: ${SINGLETONS.length} runners single-versioned, no undeclared test imports.`,
);
