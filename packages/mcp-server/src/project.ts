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
import ts from 'typescript';
import {
  IGNORED_DIRECTORIES,
  PROJECT_ROOT_ENV,
  ROUTE_FILE_CANDIDATES,
  SOURCE_EXTENSIONS,
} from './constants.js';

/** Error carrying a message meant to be shown to the model, with a suggested next step. */
export class ProjectError extends Error {
  constructor(
    message: string,
    readonly suggestion?: string,
  ) {
    super(message);
    this.name = 'ProjectError';
  }
}

let defaultProjectRoot: string | undefined;

/** Sets the project root used when a tool call omits `project_root`. */
export function setDefaultProjectRoot(root: string | undefined): void {
  defaultProjectRoot = root;
}

/**
 * Resolves the project root to work on. Precedence: explicit argument, `--project-root` CLI flag,
 * `OPEN_CELLS_PROJECT_ROOT`, current working directory.
 */
export function resolveProjectRoot(input?: string): string {
  const candidate = input ?? defaultProjectRoot ?? process.env[PROJECT_ROOT_ENV] ?? process.cwd();
  const resolved = path.resolve(candidate);

  if (!fs.existsSync(resolved)) {
    throw new ProjectError(
      `Project root not found: ${resolved}`,
      'Pass an existing directory in "project_root", or start the server with --project-root <path>.',
    );
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new ProjectError(`Project root is not a directory: ${resolved}`);
  }
  return resolved;
}

/**
 * Resolves a user supplied path inside the project, rejecting anything that escapes the root so a
 * tool call cannot read or write outside the analysed application.
 */
export function resolveInsideProject(root: string, relativeOrAbsolute: string): string {
  const resolved = path.resolve(root, relativeOrAbsolute);
  const relative = path.relative(root, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ProjectError(
      `Path "${relativeOrAbsolute}" is outside the project root (${root}).`,
      'Use a path relative to the project root.',
    );
  }
  return resolved;
}

/** Normalises an absolute path to a project relative, POSIX style path for stable output. */
export function toRelative(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join('/');
}

/** Returns true for files that can contain Open Cells application code. */
function isSourceFile(fileName: string): boolean {
  if (fileName.endsWith('.d.ts')) {
    return false;
  }
  return SOURCE_EXTENSIONS.includes(path.extname(fileName));
}

/**
 * Walks the project collecting source files. Scanning starts at `src/` when it exists, which keeps
 * the traversal cheap on real applications, and falls back to the whole root otherwise.
 */
export function collectSourceFiles(root: string, subdirectory?: string): string[] {
  const start = subdirectory
    ? resolveInsideProject(root, subdirectory)
    : fs.existsSync(path.join(root, 'src'))
      ? path.join(root, 'src')
      : root;

  if (!fs.existsSync(start)) {
    throw new ProjectError(
      `Directory not found: ${toRelative(root, start) || start}`,
      'Check the "directory" argument, or omit it to scan the whole project.',
    );
  }

  const files: string[] = [];
  const pending = [start];

  while (pending.length) {
    const current = pending.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          pending.push(full);
        }
      } else if (entry.isFile() && isSourceFile(entry.name)) {
        files.push(full);
      }
    }
  }

  return files.sort();
}

/** Parses a file into a TypeScript AST. No type checker is involved, so this stays fast. */
export function parseSourceFile(filePath: string): ts.SourceFile {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new ProjectError(`Cannot read ${filePath}: ${(error as Error).message}`);
  }

  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
}

/** 1-based line of a node, for diagnostics the user can click through. */
export function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/** Reads a string literal (or a template literal without substitutions) as a plain string. */
export function readStringLiteral(node: ts.Node | undefined): string | null {
  if (!node) {
    return null;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

/** Removes `as T`, `satisfies T` and parentheses so the underlying expression can be inspected. */
export function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/** Returns the property of an object literal by name, ignoring spreads and computed keys. */
export function getProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  name: string,
): ts.ObjectLiteralElementLike | undefined {
  return objectLiteral.properties.find(property => {
    const propertyName = property.name;
    if (!propertyName) {
      return false;
    }
    if (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) {
      return propertyName.text === name;
    }
    return false;
  });
}

/** Returns the initializer of an object literal property, when it has one. */
export function getPropertyValue(
  objectLiteral: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  const property = getProperty(objectLiteral, name);
  if (property && ts.isPropertyAssignment(property)) {
    return property.initializer;
  }
  return undefined;
}

/** Depth-first walk over every node of a subtree. */
export function walk(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node);
  node.forEachChild(child => walk(child, visitor));
}

/**
 * True when the file really declares an array of route-like objects. Parsing rather than matching
 * text matters: a JSDoc mention such as `@param {RouteDefinition[]} routesArray` is not a routes
 * file, and picking one up leads the whole analysis astray.
 */
function containsRouteArray(filePath: string): boolean {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return false;
  }

  // Cheap filter before paying for the parse: every routes file assigns a `path`.
  if (!content.includes('path')) {
    return false;
  }

  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  let found = false;

  walk(sourceFile, node => {
    if (found || !ts.isArrayLiteralExpression(node)) {
      return;
    }
    const objects = node.elements
      .map(element => unwrapExpression(element))
      .filter(ts.isObjectLiteralExpression);

    if (!objects.length || objects.length !== node.elements.length) {
      return;
    }
    found =
      objects.every(object => getProperty(object, 'path')) &&
      objects.some(
        object =>
          getProperty(object, 'component') ||
          getProperty(object, 'action') ||
          getProperty(object, 'name'),
      );
  });

  return found;
}

/**
 * Finds the routes file of an application: an explicit path if given, then the conventional
 * locations, then any source file that actually declares a routes array. When several files qualify
 * — the usual case when pointed at a monorepo rather than at one app — it reports the candidates
 * instead of guessing.
 */
export function findRoutesFile(root: string, explicit?: string): string {
  if (explicit) {
    const resolved = resolveInsideProject(root, explicit);
    if (!fs.existsSync(resolved)) {
      throw new ProjectError(
        `Routes file not found: ${toRelative(root, resolved)}`,
        'Omit "routes_file" to let the server look for src/router/routes.ts and similar locations.',
      );
    }
    return resolved;
  }

  for (const candidate of ROUTE_FILE_CANDIDATES) {
    const resolved = path.join(root, candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  const candidates = collectSourceFiles(root).filter(containsRouteArray);

  if (candidates.length === 1) {
    return candidates[0]!;
  }

  if (candidates.length > 1) {
    // A file named routes.* is a far better bet than an inline array somewhere else.
    const named = candidates.filter(file => /^routes\.[cm]?[jt]s$/.test(path.basename(file)));
    if (named.length === 1) {
      return named[0]!;
    }

    const list = (named.length ? named : candidates).map(file => toRelative(root, file));
    throw new ProjectError(
      `${list.length} files under ${root} declare route arrays: ${list.join(', ')}.`,
      'Pass "routes_file" with the one to analyse, or point "project_root" at a single application instead of a monorepo.',
    );
  }

  throw new ProjectError(
    `No routes file found under ${root}.`,
    'Open Cells apps usually declare routes in src/router/routes.ts. Pass "routes_file" to point at a different location, or "project_root" at the application directory.',
  );
}

/**
 * Indexes every custom element defined in the project, mapping tag name to the file that defines
 * it. Both `@customElement('x-y')` and `customElements.define('x-y', …)` are recognised.
 */
export function indexCustomElements(root: string): Map<string, string> {
  const definitions = new Map<string, string>();

  for (const file of collectSourceFiles(root)) {
    const sourceFile = parseSourceFile(file);
    walk(sourceFile, node => {
      if (!ts.isCallExpression(node)) {
        return;
      }
      const callee = node.expression;
      const isDecorator = ts.isIdentifier(callee) && callee.text === 'customElement';
      const isDefine =
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'define' &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'customElements';

      if (!isDecorator && !isDefine) {
        return;
      }
      const tag = readStringLiteral(node.arguments[0]);
      if (tag && !definitions.has(tag)) {
        definitions.set(tag, toRelative(root, file));
      }
    });
  }

  return definitions;
}

/**
 * Resolves a module specifier used inside a route `action` to a file on disk. Applications import
 * the built `.js` path while the source is `.ts`, so both are tried.
 */
export function resolveModuleSpecifier(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base];

  const extension = path.extname(base);
  if (extension === '.js' || extension === '.mjs') {
    const withoutExtension = base.slice(0, -extension.length);
    candidates.push(`${withoutExtension}.ts`, `${withoutExtension}.mts`, `${withoutExtension}.tsx`);
  } else if (!extension) {
    for (const ext of SOURCE_EXTENSIONS) {
      candidates.push(`${base}${ext}`);
      candidates.push(path.join(base, `index${ext}`));
    }
  }

  const match = candidates.find(
    candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
  );
  return match ?? null;
}
