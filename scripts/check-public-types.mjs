#!/usr/bin/env node
/**
 * Checks the contract the packages publish, rather than the code behind it.
 *
 * Two things, both of which have been wrong here before:
 *
 * 1. The declarations compile for a consumer. `types-contract/` is an application that imports every
 *    package's public API the way an application does, under `strict`, with no access to the
 *    sources — only what each `types` field points at. That is what catches a `.d.ts` that
 *    re-exports from a `.js` file, a name used but never imported, or a class exported as a type so
 *    `new` fails.
 * 2. The declarations are actually published. A `types` field pointing at a file that `files` does not
 *    ship is a package that type-checks in the monorepo and gives consumers TS7016. This packs each
 *    workspace exactly as `npm publish` would and looks for the file.
 *
 * Run with `npm run test:types`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const problems = [];

function run(command, args) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// 1. The consumer application compiles.
try {
  run('npx', ['tsc', '-p', 'types-contract/tsconfig.json']);
  console.log('Public types: types-contract compiles under strict.');
} catch (error) {
  const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
  problems.push(`types-contract does not compile:\n${output.replace(/^/gm, '      ')}`);
}

// 2. Every declared entry point is in the tarball.
function publishablePackages() {
  const found = [];
  for (const entry of readdirSync(join(ROOT, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'example') continue;
    const manifest = join(ROOT, 'packages', entry.name, 'package.json');
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    if (pkg.private) continue;
    found.push(pkg);
  }
  return found;
}

/** The paths a package promises: its `types`, its `main`, and every `exports` target. */
function declaredEntryPoints(pkg) {
  const paths = new Set();
  for (const value of [pkg.types, pkg.main]) if (value) paths.add(value);
  const collect = value => {
    if (typeof value === 'string') paths.add(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  collect(pkg.exports);
  return [...paths].map(path => posix.normalize(path.replace(/^\.\//, '')));
}

for (const pkg of publishablePackages()) {
  let packed;
  try {
    packed = JSON.parse(run(npm, ['pack', '--dry-run', '--json', '-w', pkg.name]));
  } catch (error) {
    problems.push(`${pkg.name}: could not pack (${error.message.split('\n')[0]})`);
    continue;
  }

  const shipped = new Set(packed[0].files.map(file => file.path));
  const missing = declaredEntryPoints(pkg).filter(path => !shipped.has(path));

  if (missing.length) {
    problems.push(
      `${pkg.name} declares entry points its tarball does not ship:\n` +
        missing.map(path => `      ${path}`).join('\n'),
    );
  }
}

if (problems.length) {
  console.error('\nPublic type contract check failed:\n');
  for (const problem of problems) console.error(`  - ${problem}\n`);
  process.exit(1);
}

console.log('Public types: every declared entry point ships in its tarball.');
