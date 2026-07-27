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
import ts from 'typescript';
import {
  ProjectError,
  collectSourceFiles,
  findRoutesFile,
  getPropertyValue,
  indexCustomElements,
  lineOf,
  parseSourceFile,
  readStringLiteral,
  resolveModuleSpecifier,
  toRelative,
  unwrapExpression,
  walk,
} from '../project.js';
import type { Diagnostic, RouteEntry, RoutesFileAnalysis } from '../types.js';

/** Matches `:param` segments, mirroring `Route.PARAM` in `@open-cells/core`. */
const PARAM_PATTERN = /:([^/]+)/g;

/** Custom element names must contain a hyphen and no uppercase characters. */
const CUSTOM_ELEMENT_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;

interface RoutesArrayLocation {
  sourceFile: ts.SourceFile;
  array: ts.ArrayLiteralExpression;
  exportName: string | null;
}

/** Extracts the `:param` names declared in a route pattern. */
export function extractParams(pattern: string): string[] {
  const params: string[] = [];
  for (const match of pattern.matchAll(PARAM_PATTERN)) {
    if (match[1]) {
      params.push(match[1]);
    }
  }
  return params;
}

/** Locates the array literal holding the route definitions inside a parsed routes file. */
export function findRoutesArray(sourceFile: ts.SourceFile): RoutesArrayLocation {
  let fallback: RoutesArrayLocation | undefined;

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!declaration.initializer || !ts.isIdentifier(declaration.name)) {
          continue;
        }
        const initializer = unwrapExpression(declaration.initializer);
        if (!ts.isArrayLiteralExpression(initializer)) {
          continue;
        }
        const location: RoutesArrayLocation = {
          sourceFile,
          array: initializer,
          exportName: declaration.name.text,
        };
        if (declaration.name.text === 'routes') {
          return location;
        }
        fallback ??= location;
      }
    }

    if (ts.isExportAssignment(statement)) {
      const expression = unwrapExpression(statement.expression);
      if (ts.isArrayLiteralExpression(expression)) {
        fallback ??= { sourceFile, array: expression, exportName: 'default' };
      }
    }
  }

  if (fallback) {
    return fallback;
  }

  throw new ProjectError(
    `No route array found in ${sourceFile.fileName}.`,
    'The file should export an array of RouteDefinition objects, e.g. `export const routes: RouteDefinition[] = [...]`.',
  );
}

/** Reads a single route object literal into a {@link RouteEntry}. */
function readRoute(
  sourceFile: ts.SourceFile,
  objectLiteral: ts.ObjectLiteralExpression,
): RouteEntry {
  const pathValue = getPropertyValue(objectLiteral, 'path');
  const paths: string[] = [];

  if (pathValue) {
    const unwrapped = unwrapExpression(pathValue);
    if (ts.isArrayLiteralExpression(unwrapped)) {
      for (const element of unwrapped.elements) {
        const literal = readStringLiteral(element);
        if (literal !== null) {
          paths.push(literal);
        }
      }
    } else {
      const literal = readStringLiteral(unwrapped);
      if (literal !== null) {
        paths.push(literal);
      }
    }
  }

  const notFoundValue = getPropertyValue(objectLiteral, 'notFound');
  const actionValue = getPropertyValue(objectLiteral, 'action');
  const lazyImports: string[] = [];

  if (actionValue) {
    walk(actionValue, node => {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const specifier = readStringLiteral(node.arguments[0]);
        if (specifier) {
          lazyImports.push(specifier);
        }
      }
    });
  }

  const params = paths.flatMap(extractParams);

  return {
    name: readStringLiteral(getPropertyValue(objectLiteral, 'name')),
    paths,
    component: readStringLiteral(getPropertyValue(objectLiteral, 'component')),
    params: [...new Set(params)],
    wildcard: paths.some(pattern => pattern.includes('*')),
    notFound: notFoundValue?.kind === ts.SyntaxKind.TrueKeyword,
    hasAction: Boolean(actionValue),
    lazyImports,
    line: lineOf(sourceFile, objectLiteral),
  };
}

/** Parses the routes of an application. */
export function analyzeRoutes(root: string, routesFile?: string): RoutesFileAnalysis {
  const file = findRoutesFile(root, routesFile);
  const sourceFile = parseSourceFile(file);
  const { array, exportName } = findRoutesArray(sourceFile);

  const routes = array.elements
    .map(element => unwrapExpression(element))
    .filter(ts.isObjectLiteralExpression)
    .map(objectLiteral => readRoute(sourceFile, objectLiteral));

  return { file: toRelative(root, file), exportName, routes };
}

/** Finds the `startApp({...})` configuration object, when the application has one. */
function findStartAppConfig(root: string): {
  file: string;
  config: ts.ObjectLiteralExpression;
} | null {
  for (const file of collectSourceFiles(root)) {
    if (!fs.readFileSync(file, 'utf8').includes('startApp')) {
      continue;
    }
    const sourceFile = parseSourceFile(file);
    let found: ts.ObjectLiteralExpression | undefined;

    walk(sourceFile, node => {
      if (found || !ts.isCallExpression(node)) {
        return;
      }
      const callee = node.expression;
      const isStartApp =
        (ts.isIdentifier(callee) && callee.text === 'startApp') ||
        (ts.isPropertyAccessExpression(callee) && callee.name.text === 'startApp');
      if (!isStartApp) {
        return;
      }
      const argument = node.arguments[0] ? unwrapExpression(node.arguments[0]) : undefined;
      if (argument && ts.isObjectLiteralExpression(argument)) {
        found = argument;
      }
    });

    if (found) {
      return { file: toRelative(root, file), config: found };
    }
  }
  return null;
}

/** Reads an array of string literals from a config property, e.g. `persistentPages: ['home']`. */
function readStringArrayProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  name: string,
): string[] | null {
  const value = getPropertyValue(objectLiteral, name);
  if (!value) {
    return null;
  }
  const unwrapped = unwrapExpression(value);
  if (!ts.isArrayLiteralExpression(unwrapped)) {
    return null;
  }
  return unwrapped.elements
    .map(element => readStringLiteral(element))
    .filter((entry): entry is string => entry !== null);
}

export interface ValidateRoutesResult {
  file: string;
  routeCount: number;
  diagnostics: Diagnostic[];
}

/**
 * Validates the routes of an application against the rules enforced by `@open-cells/core`: unique
 * names and patterns, resolvable lazy imports, declared components, and a reachable 404 route.
 */
export function validateRoutes(
  root: string,
  options: { routesFile?: string; checkStartApp?: boolean } = {},
): ValidateRoutesResult {
  const analysis = analyzeRoutes(root, options.routesFile);
  const diagnostics: Diagnostic[] = [];
  const routesFilePath = findRoutesFile(root, options.routesFile);
  const definedElements = indexCustomElements(root);

  const add = (diagnostic: Omit<Diagnostic, 'file'> & { file?: string }): void => {
    diagnostics.push({ file: analysis.file, ...diagnostic });
  };

  const namesSeen = new Map<string, number>();
  const pathsSeen = new Map<string, number>();

  for (const route of analysis.routes) {
    const label = route.name ?? `route at line ${route.line}`;

    if (!route.name) {
      add({
        severity: 'error',
        code: 'missing-name',
        message: `Route at line ${route.line} has no "name". navigate() addresses routes by name.`,
        line: route.line,
        suggestion: 'Add a unique "name" property to the route definition.',
      });
    } else if (namesSeen.has(route.name)) {
      add({
        severity: 'error',
        code: 'duplicate-name',
        message: `Route name "${route.name}" is already used at line ${namesSeen.get(route.name)}. Routes are keyed by name, so the later definition overwrites the earlier one.`,
        route: route.name,
        line: route.line,
        suggestion: 'Rename one of the routes.',
      });
    } else {
      namesSeen.set(route.name, route.line);
    }

    if (!route.paths.length) {
      add({
        severity: 'error',
        code: 'missing-path',
        message: `Route "${label}" has no static "path". The pattern could not be read as a string literal.`,
        route: route.name ?? undefined,
        line: route.line,
        suggestion: 'Declare "path" as a string literal (or an array of string literals).',
      });
    }

    for (const pattern of route.paths) {
      if (!pattern.startsWith('/')) {
        add({
          severity: 'error',
          code: 'path-not-absolute',
          message: `Route "${label}" declares the pattern "${pattern}", which does not start with "/".`,
          route: route.name ?? undefined,
          line: route.line,
          suggestion: `Use "/${pattern}".`,
        });
      }
      if (pathsSeen.has(pattern)) {
        add({
          severity: 'error',
          code: 'duplicate-path',
          message: `Pattern "${pattern}" is already declared at line ${pathsSeen.get(pattern)}. Only one of the routes will ever match.`,
          route: route.name ?? undefined,
          line: route.line,
          suggestion: 'Give each route a distinct pattern.',
        });
      } else {
        pathsSeen.set(pattern, route.line);
      }

      const patternParams = extractParams(pattern);
      const duplicated = patternParams.filter(
        (param, index) => patternParams.indexOf(param) !== index,
      );
      for (const param of new Set(duplicated)) {
        add({
          severity: 'error',
          code: 'duplicate-param',
          message: `Pattern "${pattern}" declares the parameter ":${param}" more than once, so only the last value reaches the page.`,
          route: route.name ?? undefined,
          line: route.line,
          suggestion: 'Rename one of the parameters.',
        });
      }
    }

    if (!route.hasAction) {
      add({
        severity: 'warning',
        code: 'missing-action',
        message: `Route "${label}" has no "action", so the page module is never imported. It only renders if the component is registered elsewhere.`,
        route: route.name ?? undefined,
        line: route.line,
        suggestion: `Add "action: async () => { await import('../pages/…'); }".`,
      });
    }

    if (!route.component) {
      add({
        severity: 'error',
        code: 'missing-component',
        message: `Route "${label}" has no "component", so the router does not know which element to render.`,
        route: route.name ?? undefined,
        line: route.line,
        suggestion: 'Add the custom element tag name in "component".',
      });
    } else {
      if (!CUSTOM_ELEMENT_PATTERN.test(route.component)) {
        add({
          severity: 'error',
          code: 'invalid-component-tag',
          message: `"${route.component}" is not a valid custom element name: it must be lowercase and contain a hyphen.`,
          route: route.name ?? undefined,
          line: route.line,
        });
      } else if (!definedElements.has(route.component)) {
        add({
          severity: 'warning',
          code: 'component-not-defined',
          message: `No definition of <${route.component}> was found in the project (looked for @customElement and customElements.define).`,
          route: route.name ?? undefined,
          line: route.line,
          suggestion: 'Define the element, or ignore this if it comes from an external package.',
        });
      }
    }

    for (const specifier of route.lazyImports) {
      const resolved = resolveModuleSpecifier(routesFilePath, specifier);
      if (!resolved) {
        add({
          severity: 'error',
          code: 'lazy-import-unresolved',
          message: `Route "${label}" imports "${specifier}" in its action, but no such file exists (".js" specifiers are also checked against ".ts" sources).`,
          route: route.name ?? undefined,
          line: route.line,
          suggestion: 'Fix the path, or create the page module.',
        });
        continue;
      }
      if (route.component) {
        const definedIn = definedElements.get(route.component);
        const resolvedRelative = toRelative(root, resolved);
        if (definedIn && definedIn !== resolvedRelative) {
          add({
            severity: 'warning',
            code: 'component-file-mismatch',
            message: `Route "${label}" imports ${specifier} but <${route.component}> is defined in ${definedIn}.`,
            route: route.name ?? undefined,
            line: route.line,
            suggestion: 'Point the action at the module that defines the component.',
          });
        }
      }
    }
  }

  const notFoundRoutes = analysis.routes.filter(route => route.notFound);
  if (!notFoundRoutes.length) {
    const candidate = analysis.routes.find(
      route => route.name?.includes('not-found') || route.paths.some(p => p.includes('not-found')),
    );
    add({
      severity: 'warning',
      code: 'no-not-found-route',
      message: candidate
        ? `No route declares "notFound: true". Route "${candidate.name}" looks like the 404 page but its flag is not set, so unknown paths resolve to nothing.`
        : 'No route declares "notFound: true", so navigating to an unknown path renders nothing.',
      route: candidate?.name ?? undefined,
      line: candidate?.line,
      suggestion: candidate
        ? `Set "notFound: true" on route "${candidate.name}".`
        : 'Add a catch-all route with "notFound: true".',
    });
  } else if (notFoundRoutes.length > 1) {
    add({
      severity: 'warning',
      code: 'multiple-not-found-routes',
      message: `${notFoundRoutes.length} routes declare "notFound: true" (${notFoundRoutes.map(route => route.name).join(', ')}); the core only uses one of them.`,
      suggestion: 'Keep a single 404 route.',
    });
  }

  if (options.checkStartApp !== false) {
    const startApp = findStartAppConfig(root);
    if (startApp) {
      const knownNames = new Set(
        analysis.routes.map(route => route.name).filter((name): name is string => Boolean(name)),
      );
      for (const property of ['persistentPages', 'commonPages'] as const) {
        const declared = readStringArrayProperty(startApp.config, property);
        for (const pageName of declared ?? []) {
          if (!knownNames.has(pageName)) {
            add({
              severity: 'error',
              code: 'unknown-page-reference',
              message: `startApp() lists "${pageName}" in "${property}", but no route with that name exists.`,
              file: startApp.file,
              suggestion: `Use one of: ${[...knownNames].join(', ') || '(no named routes)'}.`,
            });
          }
        }
      }
    }
  }

  return { file: analysis.file, routeCount: analysis.routes.length, diagnostics };
}
