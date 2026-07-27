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
import { analyzeRoutes, findRoutesArray } from '../analysis/routes.js';
import { buildDiff } from '../diff.js';
import {
  ProjectError,
  findRoutesFile,
  parseSourceFile,
  resolveInsideProject,
  toRelative,
} from '../project.js';
import type { FileChange } from '../types.js';

/** Valid custom element / page name: lowercase words separated by hyphens. */
const NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export interface InboundBinding {
  property: string;
  channel: string;
}

export interface ScaffoldPageOptions {
  root: string;
  /** Page name, with or without the `-page` suffix, e.g. `user-profile`. */
  pageName: string;
  routeName?: string;
  routePath?: string;
  language?: 'ts' | 'js';
  /** Render into a shadow root instead of light DOM (the generated apps use light DOM). */
  shadowDom?: boolean;
  /** Apply `PageTransitionsMixin`. */
  transitions?: boolean;
  /** Include `onPageEnter` / `onPageLeave`. */
  lifecycleHooks?: boolean;
  inbounds?: InboundBinding[];
  /** Mark the new route as the 404 page. */
  notFound?: boolean;
  /** Directory holding pages, relative to the project root. */
  pagesDirectory?: string;
  routesFile?: string;
}

export interface ScaffoldPageResult {
  tag: string;
  className: string;
  routeName: string;
  routePath: string;
  pageFile: string;
  routesFile: string;
  changes: FileChange[];
}

/** `user-profile-page` -> `UserProfilePage`. */
function toPascalCase(value: string): string {
  return value
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** `user-profile` -> `User profile`, for the placeholder heading. */
function toTitle(value: string): string {
  const words = value.split('-');
  const first = words[0] ?? '';
  return [first.charAt(0).toUpperCase() + first.slice(1), ...words.slice(1)].join(' ');
}

function assertName(value: string, field: string): void {
  if (!NAME_PATTERN.test(value)) {
    throw new ProjectError(
      `Invalid ${field}: "${value}".`,
      'Use lowercase words separated by hyphens, e.g. "user-profile".',
    );
  }
}

/** Renders the `static inbounds` block and the matching property declarations. */
function renderInbounds(inbounds: InboundBinding[], language: 'ts' | 'js'): string {
  if (!inbounds.length) {
    return '';
  }

  const bindings = inbounds
    .map(binding => `    ${binding.property}: { channel: '${binding.channel}' },`)
    .join('\n');

  const declarations =
    language === 'ts'
      ? `\n${inbounds.map(binding => `  declare ${binding.property}: any;`).join('\n')}\n`
      : '';

  return `
  // ElementController turns these properties into read-only getters fed by the channels,
  // and requests an update on every published value.
  static inbounds = {
${bindings}
  };
${declarations}`;
}

/** Builds the source of the page component. */
export function renderPage(options: {
  tag: string;
  className: string;
  language: 'ts' | 'js';
  shadowDom: boolean;
  transitions: boolean;
  lifecycleHooks: boolean;
  inbounds: InboundBinding[];
}): string {
  const { tag, className, language, shadowDom, transitions, lifecycleHooks, inbounds } = options;
  const isTypeScript = language === 'ts';

  const imports = [
    `import { html, LitElement } from 'lit';`,
    `import { customElement } from 'lit/decorators.js';`,
    `import { PageController } from '@open-cells/page-controller';`,
  ];
  if (transitions) {
    imports.push(`import { PageTransitionsMixin } from '@open-cells/page-transitions';`);
  }

  const base = transitions ? 'PageTransitionsMixin(LitElement)' : 'LitElement';

  const renderRoot = shadowDom
    ? ''
    : isTypeScript
      ? `
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }
`
      : `
  createRenderRoot() {
    return this;
  }
`;

  const hooks = lifecycleHooks
    ? `
  // Runs every time the page becomes active, including revisits where the node is reused
  // and firstUpdated() no longer fires.
  onPageEnter() {}

  onPageLeave() {}
`
    : '';

  return `${imports.join('\n')}

${isTypeScript ? '// @ts-ignore\n' : ''}@customElement('${tag}')
export class ${className} extends ${base} {
  pageController = new PageController(this);
${renderInbounds(inbounds, language)}${renderRoot}${hooks}
  render() {
    return html\`<h1>${toTitle(tag.replace(/-page$/, ''))}</h1>\`;
  }
}
`;
}

/** Builds the route object literal inserted into the routes array. */
function renderRouteEntry(options: {
  routePath: string;
  routeName: string;
  tag: string;
  importSpecifier: string;
  notFound: boolean;
  indent: string;
  /** Appending after the last element reuses the comma already present in the file. */
  trailingComma: boolean;
}): string {
  const { routePath, routeName, tag, importSpecifier, notFound, indent, trailingComma } = options;
  const inner = `${indent}  `;

  return [
    `${indent}{`,
    `${inner}path: '${routePath}',`,
    `${inner}name: '${routeName}',`,
    ...(notFound ? [`${inner}notFound: true,`] : []),
    `${inner}component: '${tag}',`,
    `${inner}action: async () => {`,
    `${inner}  await import('${importSpecifier}');`,
    `${inner}},`,
    `${indent}}${trailingComma ? ',' : ''}`,
  ].join('\n');
}

/** Indentation of the line the node starts on, so generated code matches the file style. */
function indentOf(sourceFile: ts.SourceFile, node: ts.Node): string {
  const text = sourceFile.getFullText();
  const start = node.getStart(sourceFile);
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  return text.slice(lineStart, start).match(/^[ \t]*/)?.[0] ?? '  ';
}

/** Module specifier used by the route `action`, always a runtime-resolvable `.js` path. */
function buildImportSpecifier(routesFile: string, pageFile: string): string {
  const relative = path
    .relative(path.dirname(routesFile), pageFile)
    .split(path.sep)
    .join('/')
    .replace(/\.(ts|mts)$/, '.js');

  return relative.startsWith('.') ? relative : `./${relative}`;
}

/** Inserts the new route into the routes array, keeping the 404 route last. */
function insertRoute(
  routesFilePath: string,
  entryOptions: Omit<Parameters<typeof renderRouteEntry>[0], 'indent' | 'trailingComma'>,
): { before: string; after: string } {
  const sourceFile = parseSourceFile(routesFilePath);
  const { array } = findRoutesArray(sourceFile);
  const before = sourceFile.getFullText();
  const elements = array.elements;

  if (!elements.length) {
    const entry = renderRouteEntry({ ...entryOptions, indent: '  ', trailingComma: true });
    const position = array.getStart(sourceFile) + 1;
    const after = `${before.slice(0, position)}\n${entry}\n${before.slice(position)}`;
    return { before, after };
  }

  // The 404 route stays last, as in the applications generated by create-app.
  const anchorIndex = elements.findIndex(element => {
    if (!ts.isObjectLiteralExpression(element)) {
      return false;
    }
    return element.properties.some(
      property =>
        ts.isPropertyAssignment(property) &&
        property.name &&
        ts.isIdentifier(property.name) &&
        property.name.text === 'notFound' &&
        property.initializer.kind === ts.SyntaxKind.TrueKeyword,
    );
  });

  if (!entryOptions.notFound && anchorIndex !== -1) {
    const anchor = elements[anchorIndex]!;
    const indent = indentOf(sourceFile, anchor);
    const entry = renderRouteEntry({ ...entryOptions, indent, trailingComma: true });
    const position = anchor.getStart(sourceFile) - indent.length;
    const after = `${before.slice(0, position)}${entry}\n${before.slice(position)}`;
    return { before, after };
  }

  const last = elements[elements.length - 1]!;
  const indent = indentOf(sourceFile, last);
  const entry = renderRouteEntry({ ...entryOptions, indent, trailingComma: false });
  const position = last.getEnd();
  const after = `${before.slice(0, position)},\n${entry}${before.slice(position)}`;

  return { before, after };
}

/**
 * Prepares a new page: the component file and the route registration. Nothing is written here; the
 * caller decides whether to apply the returned changes.
 */
export function scaffoldPage(options: ScaffoldPageOptions): ScaffoldPageResult {
  const { root } = options;
  const rawName = options.pageName.trim();
  assertName(rawName, 'page name');

  const base = rawName.replace(/-page$/, '');
  if (!base) {
    throw new ProjectError('Invalid page name: "-page" is not a name.');
  }
  const tag = `${base}-page`;
  if (!tag.includes('-')) {
    throw new ProjectError(
      `"${tag}" is not a valid custom element name.`,
      'Custom element names must contain a hyphen.',
    );
  }

  const language = options.language ?? 'ts';
  const routeName = options.routeName ?? base;
  assertName(routeName, 'route name');

  const routePath = options.routePath ?? `/${base}`;
  if (!routePath.startsWith('/')) {
    throw new ProjectError(
      `Invalid route path: "${routePath}".`,
      `Paths are absolute, e.g. "/${base}".`,
    );
  }

  const routesFilePath = findRoutesFile(root, options.routesFile);
  const existing = analyzeRoutes(root, options.routesFile);

  const nameClash = existing.routes.find(route => route.name === routeName);
  if (nameClash) {
    throw new ProjectError(
      `A route named "${routeName}" already exists (line ${nameClash.line}).`,
      'Pass a different "route_name".',
    );
  }
  const pathClash = existing.routes.find(route => route.paths.includes(routePath));
  if (pathClash) {
    throw new ProjectError(
      `The path "${routePath}" is already used by route "${pathClash.name}" (line ${pathClash.line}).`,
      'Pass a different "route_path".',
    );
  }
  const tagClash = existing.routes.find(route => route.component === tag);
  if (tagClash) {
    throw new ProjectError(
      `The component <${tag}> is already rendered by route "${tagClash.name}" (line ${tagClash.line}).`,
      'Pass a different "page_name".',
    );
  }

  const pagesDirectory = options.pagesDirectory ?? 'src/pages';
  const pageFilePath = resolveInsideProject(
    root,
    path.join(pagesDirectory, base, `${tag}.${language}`),
  );
  if (fs.existsSync(pageFilePath)) {
    throw new ProjectError(
      `The file ${toRelative(root, pageFilePath)} already exists.`,
      'Remove it, or scaffold the page under a different name.',
    );
  }

  const className = toPascalCase(tag);
  const pageContent = renderPage({
    tag,
    className,
    language,
    shadowDom: options.shadowDom ?? false,
    transitions: options.transitions ?? false,
    lifecycleHooks: options.lifecycleHooks ?? true,
    inbounds: options.inbounds ?? [],
  });

  const { before, after } = insertRoute(routesFilePath, {
    routePath,
    routeName,
    tag,
    importSpecifier: buildImportSpecifier(routesFilePath, pageFilePath),
    notFound: options.notFound ?? false,
  });

  const routesRelative = toRelative(root, routesFilePath);

  return {
    tag,
    className,
    routeName,
    routePath,
    pageFile: toRelative(root, pageFilePath),
    routesFile: routesRelative,
    changes: [
      { file: toRelative(root, pageFilePath), action: 'create', content: pageContent },
      {
        file: routesRelative,
        action: 'update',
        content: after,
        diff: buildDiff(before, after, routesRelative),
      },
    ],
  };
}

/** Writes the changes produced by {@link scaffoldPage} to disk. */
export function applyChanges(root: string, changes: FileChange[]): string[] {
  const written: string[] = [];

  for (const change of changes) {
    const target = resolveInsideProject(root, change.file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, change.content, 'utf8');
    written.push(change.file);
  }

  return written;
}
