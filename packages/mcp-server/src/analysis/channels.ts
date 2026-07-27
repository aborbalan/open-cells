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

import ts from 'typescript';
import { INTERNAL_CHANNEL_PREFIX } from '../constants.js';
import {
  collectSourceFiles,
  getPropertyValue,
  lineOf,
  parseSourceFile,
  readStringLiteral,
  toRelative,
  unwrapExpression,
  walk,
} from '../project.js';
import type { ChannelAnalysis, ChannelSummary, ChannelUsage, Diagnostic } from '../types.js';

/** Bridge API calls that take a channel name as their first argument. */
const CHANNEL_CALLS = new Set(['publish', 'publishOn', 'subscribe', 'unsubscribe']);

/** Maximum edit distance at which two channel names are reported as a possible typo. */
const TYPO_DISTANCE = 2;

/** Levenshtein distance, used to spot channel names that differ by a typo. */
export function editDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = previous[j]!;
      previous[j] = Math.min(
        previous[j]! + 1,
        previous[j - 1]! + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = current;
    }
  }

  return previous[b.length]!;
}

/** Name of the class a node belongs to, used to attribute declarative bindings. */
function enclosingClassName(node: ts.Node): string | undefined {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isClassDeclaration(current) || ts.isClassExpression(current)) {
      return current.name?.text ?? '(anonymous class)';
    }
    current = current.parent;
  }
  return undefined;
}

/** A usage together with the channel it refers to. */
type ResolvedUsage = ChannelUsage & { channel: string };

/** Reads `static inbounds = {...}` / `static outbounds = {...}` declarations. */
function readBindings(
  sourceFile: ts.SourceFile,
  relativeFile: string,
  node: ts.PropertyDeclaration,
  usages: ResolvedUsage[],
  dynamic: ChannelUsage[],
): void {
  const isStatic = node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.StaticKeyword);
  if (!isStatic || !ts.isIdentifier(node.name) || !node.initializer) {
    return;
  }

  const kind =
    node.name.text === 'inbounds'
      ? 'inbounds'
      : node.name.text === 'outbounds'
        ? 'outbounds'
        : null;
  if (!kind) {
    return;
  }

  const initializer = unwrapExpression(node.initializer);
  if (!ts.isObjectLiteralExpression(initializer)) {
    return;
  }

  const owner = enclosingClassName(node);

  for (const property of initializer.properties) {
    if (!ts.isPropertyAssignment(property) || !property.name) {
      continue;
    }
    const propertyName = ts.isIdentifier(property.name)
      ? property.name.text
      : ts.isStringLiteral(property.name)
        ? property.name.text
        : null;
    const value = unwrapExpression(property.initializer);
    if (!propertyName || !ts.isObjectLiteralExpression(value)) {
      continue;
    }

    const channelNode = getPropertyValue(value, 'channel');
    const channel = readStringLiteral(channelNode);
    const usage: ChannelUsage = {
      file: relativeFile,
      line: lineOf(sourceFile, property),
      kind,
      ...(owner ? { owner } : {}),
      property: propertyName,
    };

    if (kind === 'inbounds') {
      usage.skipUpdate = getPropertyValue(value, 'skipUpdate')?.kind === ts.SyntaxKind.TrueKeyword;
      usage.hasAction = Boolean(getPropertyValue(value, 'action'));
    }

    if (channel === null) {
      dynamic.push(usage);
    } else {
      usages.push({ ...usage, channel });
    }
  }
}

/** Collects every static channel usage in a single file. */
function scanFile(root: string, file: string, resolved: ResolvedUsage[], dynamic: ChannelUsage[]) {
  const sourceFile = parseSourceFile(file);
  const relativeFile = toRelative(root, file);

  walk(sourceFile, node => {
    if (ts.isPropertyDeclaration(node)) {
      readBindings(sourceFile, relativeFile, node, resolved, dynamic);
      return;
    }

    if (!ts.isCallExpression(node)) {
      return;
    }

    const callee = node.expression;
    const methodName = ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : ts.isIdentifier(callee)
        ? callee.text
        : null;

    if (!methodName || !CHANNEL_CALLS.has(methodName)) {
      return;
    }

    const kind = methodName as ChannelUsage['kind'];
    const usage: ChannelUsage = {
      file: relativeFile,
      line: lineOf(sourceFile, node),
      kind,
      ...(enclosingClassName(node) ? { owner: enclosingClassName(node) } : {}),
    };

    const first = node.arguments[0];
    const channel = readStringLiteral(first ? unwrapExpression(first) : undefined);

    if (channel === null) {
      // `unsubscribe` also accepts an array of channel names.
      const unwrapped = first ? unwrapExpression(first) : undefined;
      if (unwrapped && ts.isArrayLiteralExpression(unwrapped)) {
        for (const element of unwrapped.elements) {
          const name = readStringLiteral(element);
          if (name !== null) {
            resolved.push({ ...usage, channel: name });
          } else {
            dynamic.push(usage);
          }
        }
        return;
      }
      dynamic.push(usage);
      return;
    }

    resolved.push({ ...usage, channel });
  });
}

/** Groups usages into per-channel summaries. */
function summarize(usages: ResolvedUsage[]): ChannelSummary[] {
  const byName = new Map<string, ChannelSummary>();

  for (const usage of usages) {
    const { channel, ...rest } = usage;
    let summary = byName.get(channel);
    if (!summary) {
      summary = {
        name: channel,
        internal: channel.startsWith(INTERNAL_CHANNEL_PREFIX),
        publishers: [],
        subscribers: [],
      };
      byName.set(channel, summary);
    }

    if (rest.kind === 'publish' || rest.kind === 'publishOn' || rest.kind === 'outbounds') {
      summary.publishers.push(rest);
    } else if (rest.kind === 'subscribe' || rest.kind === 'inbounds') {
      summary.subscribers.push(rest);
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Builds the warnings that make a channel map actionable. */
function buildDiagnostics(channels: ChannelSummary[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const appChannels = channels.filter(channel => !channel.internal);

  for (const channel of appChannels) {
    if (channel.publishers.length && !channel.subscribers.length) {
      const first = channel.publishers[0]!;
      diagnostics.push({
        severity: 'warning',
        code: 'channel-without-subscribers',
        message: `Channel "${channel.name}" is published in ${channel.publishers.length} place(s) but nothing subscribes to it.`,
        file: first.file,
        line: first.line,
        suggestion:
          'Remove the publication, or bind it through "static inbounds" where it is used.',
      });
    }
    if (channel.subscribers.length && !channel.publishers.length) {
      const first = channel.subscribers[0]!;
      diagnostics.push({
        severity: 'warning',
        code: 'channel-without-publishers',
        message: `Channel "${channel.name}" has ${channel.subscribers.length} subscriber(s) but nothing publishes to it, so those properties stay undefined.`,
        file: first.file,
        line: first.line,
        suggestion: 'Publish the channel, or drop the binding.',
      });
    }
  }

  for (let i = 0; i < appChannels.length; i += 1) {
    for (let j = i + 1; j < appChannels.length; j += 1) {
      const a = appChannels[i]!;
      const b = appChannels[j]!;
      const distance = editDistance(a.name, b.name);
      if (distance > 0 && distance <= TYPO_DISTANCE) {
        diagnostics.push({
          severity: 'info',
          code: 'similar-channel-names',
          message: `Channels "${a.name}" and "${b.name}" differ by ${distance} character(s); one of them may be a typo.`,
          file: (a.publishers[0] ?? a.subscribers[0])?.file,
          line: (a.publishers[0] ?? a.subscribers[0])?.line,
          suggestion: 'Check whether both names are intentional.',
        });
      }
    }
  }

  return diagnostics;
}

/** Scans a project and returns its state channel map plus the problems found. */
export function analyzeChannels(root: string, directory?: string): ChannelAnalysis {
  const files = collectSourceFiles(root, directory);
  const resolved: ResolvedUsage[] = [];
  const dynamic: ChannelUsage[] = [];

  for (const file of files) {
    scanFile(root, file, resolved, dynamic);
  }

  const channels = summarize(resolved);

  return {
    channels,
    dynamic,
    diagnostics: buildDiagnostics(channels),
    scannedFiles: files.length,
  };
}
