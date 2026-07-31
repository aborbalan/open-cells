#!/usr/bin/env node
/**
 * One coverage report for the whole monorepo.
 *
 * Nine workspaces each write their own `coverage/lcov.info`, which is what their own gate needs but
 * leaves nobody able to answer "how covered is Open Cells?". This merges them into
 * `coverage/lcov.info` at the root, rewriting each `SF:` path to be repo-relative so
 * `page-mixin/src/index.js` stops colliding with `core-plugin/src/index.js`, and prints the
 * per-package table.
 *
 * It reports what the suites left behind; it does not run them. `npm test` first, then `npm run
 * coverage:report`.
 *
 * `--check` additionally fails if a workspace that declares a coverage-producing test script left
 * no report — the failure mode where a suite silently stops being counted.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'coverage');
const CHECK = process.argv.includes('--check');

/** Workspaces, in the order npm runs them. */
function workspaces() {
  const found = [];
  for (const group of ['packages', 'packages/example']) {
    for (const entry of readdirSync(join(ROOT, group), { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (!entry.isDirectory()) continue;
      const dir = join(ROOT, group, entry.name);
      const manifest = join(dir, 'package.json');
      if (!existsSync(manifest)) continue;
      found.push({ dir, pkg: JSON.parse(readFileSync(manifest, 'utf8')) });
    }
  }
  return found;
}

/** Split an lcov file into records and re-root every `SF:` path at the repo root. */
function rebase(lcov, packageDir) {
  const prefix = relative(ROOT, packageDir);
  return lcov.replace(/^SF:(.*)$/gm, (_, file) => `SF:${join(prefix, file.trim())}`);
}

/**
 * Suites that run but produce no coverage, and why. Anything else with a `test` script is expected
 * to leave a report behind, and `--check` says so if it does not.
 */
const NO_COVERAGE = new Map([
  ['@open-cells/create-app', 'runs the published entry point as a child process'],
  ['@open-cells/recipes-app', 'end-to-end suite: it covers the application, not a package'],
  ['blank-app', 'template, no suite'],
]);

const EMPTY = { lines: [0, 0], branches: [0, 0], functions: [0, 0] };
const KEYS = {
  LF: ['lines', 1],
  LH: ['lines', 0],
  BRF: ['branches', 1],
  BRH: ['branches', 0],
  FNF: ['functions', 1],
  FNH: ['functions', 0],
};

/** Totals from the per-record summary lines istanbul writes (`LF`/`LH`, `BRF`/`BRH`, …). */
function totals(lcov) {
  const sum = { lines: [0, 0], branches: [0, 0], functions: [0, 0] };
  for (const line of lcov.split('\n')) {
    const [tag, value] = line.split(':');
    const target = KEYS[tag];
    if (!target) continue;
    const [metric, index] = target;
    sum[metric][index] += Number(value) || 0;
  }
  return sum;
}

const percent = ([hit, found]) => (found === 0 ? null : (hit / found) * 100);
const format = value => (value === null ? '     —' : `${value.toFixed(2).padStart(6)}`);

const merged = [];
const rows = [];
const missing = [];

for (const { dir, pkg } of workspaces()) {
  const lcov = join(dir, 'coverage', 'lcov.info');
  const producesCoverage = Boolean(pkg.scripts?.test) && !NO_COVERAGE.has(pkg.name);

  if (!existsSync(lcov)) {
    if (producesCoverage) missing.push(pkg.name);
    continue;
  }

  const content = readFileSync(lcov, 'utf8');
  merged.push(rebase(content, dir));
  rows.push({ name: pkg.name, ...totals(content) });
}

if (!rows.length) {
  console.error('No coverage found. Run `npm test` first.');
  process.exit(1);
}

const combined = rows.reduce((acc, row) => {
  for (const metric of ['lines', 'branches', 'functions']) {
    acc[metric][0] += row[metric][0];
    acc[metric][1] += row[metric][1];
  }
  return acc;
}, structuredClone(EMPTY));

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'lcov.info'), merged.join(''));

const width = Math.max(...rows.map(row => row.name.length), 'All packages'.length);
const rule = `${'-'.repeat(width)}-+--------+----------+----------`;

console.log('');
console.log(`${'Package'.padEnd(width)} |  Lines | Branches | Functions`);
console.log(rule);
for (const row of rows) {
  console.log(
    `${row.name.padEnd(width)} | ${format(percent(row.lines))} | ${format(percent(row.branches))}   | ${format(percent(row.functions))}`,
  );
}
console.log(rule);
console.log(
  `${'All packages'.padEnd(width)} | ${format(percent(combined.lines))} | ${format(percent(combined.branches))}   | ${format(percent(combined.functions))}`,
);
console.log('');
console.log(`Merged ${rows.length} reports into ${relative(ROOT, join(OUT_DIR, 'lcov.info'))}`);

if (missing.length) {
  const message = `No coverage report from: ${missing.join(', ')}`;
  if (CHECK) {
    console.error(`\n${message}`);
    process.exit(1);
  }
  console.log(message);
}
