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
import { createRequire } from 'node:module';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const problems = []; // the contract is wrong
const blockers = []; // the checker could not run — a different thing, reported differently

/**
 * A command that never started, as opposed to one that ran and reported a problem.
 *
 * The difference matters: this script used to report `spawnSync npm.cmd EINVAL` as "types-contract
 * does not compile", which is a lie about the thing being checked.
 */
class ToolingError extends Error {}

function run(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // execFileSync sets `status` only when the process actually ran. Anything else —
    // ENOENT, EINVAL, EACCES — means it never got off the ground.
    if (typeof error.status !== 'number') {
      throw new ToolingError(`could not run ${command}: ${error.message.split('\n')[0]}`);
    }
    throw error;
  }
}

/**
 * Runs a Node CLI by handing its own JavaScript to this same node.
 *
 * On Windows `npm` and `npx` are `.cmd` shims, and Node cannot `execFile` those at all. `shell:
 * true` would fix the spawn, but it hands every argument to the command interpreter for re-parsing
 * — and one of ours is a path to a tsconfig. Resolving the CLI itself keeps the arguments
 * untouched, so a path with a space stays one argument.
 */
function nodeRun(script, args) {
  return run(process.execPath, [script, ...args]);
}

/** Npm's own entry point, next to the node binary running us. */
function npmCli() {
  const nodeDir = dirname(process.execPath);
  const bundled = [
    join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'), // Windows, and nvm-style installs
    join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), // the usual POSIX layout
  ].find(existsSync);

  if (bundled) return bundled;
  if (process.platform !== 'win32') return null; // plain `npm` on PATH is fine off Windows
  throw new ToolingError(`could not find npm-cli.js next to ${process.execPath}`);
}

let npmRun;
try {
  const cli = npmCli();
  npmRun = args => (cli ? nodeRun(cli, args) : run('npm', args));
} catch (error) {
  if (!(error instanceof ToolingError)) throw error;
  blockers.push(error.message);
}

// 1. The consumer application compiles.
try {
  // `npx tsc` would be a `.cmd` on Windows; the compiler's own entry point is not.
  nodeRun(require.resolve('typescript/bin/tsc'), ['-p', 'types-contract/tsconfig.json']);
  console.log('Public types: types-contract compiles under strict.');
} catch (error) {
  if (error instanceof ToolingError) {
    blockers.push(error.message);
  } else {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    problems.push(`types-contract does not compile:\n${output.replace(/^/gm, '      ')}`);
  }
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

for (const pkg of npmRun ? publishablePackages() : []) {
  let packed;
  try {
    packed = JSON.parse(npmRun(['pack', '--dry-run', '--json', '-w', pkg.name]));
  } catch (error) {
    if (error instanceof ToolingError) {
      // npm not starting is not a fact about this package, and it will not be a fact
      // about the next one either. Say it once and stop.
      blockers.push(error.message);
      break;
    }
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

// Reported before, and separately from, the contract itself: a checker that could not
// start knows nothing about the contract, and saying otherwise sends people to fix
// code that was never broken.
if (blockers.length) {
  console.error('\nPublic type contract check could not run:\n');
  for (const blocker of blockers) console.error(`  - ${blocker}\n`);
  console.error('  Nothing above is a claim about the packages.\n');
  process.exit(1);
}

if (problems.length) {
  console.error('\nPublic type contract check failed:\n');
  for (const problem of problems) console.error(`  - ${problem}\n`);
  process.exit(1);
}

console.log('Public types: every declared entry point ships in its tarball.');
