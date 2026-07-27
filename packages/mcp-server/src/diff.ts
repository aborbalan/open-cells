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

const CONTEXT_LINES = 3;

/**
 * Builds a readable diff of a single edited region. Scaffolding only ever inserts or replaces one
 * contiguous block, so matching the common prefix and suffix is enough and keeps the output small.
 */
export function buildDiff(before: string, after: string, file: string): string {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const removed = beforeLines.slice(prefix, beforeLines.length - suffix);
  const added = afterLines.slice(prefix, afterLines.length - suffix);

  if (!removed.length && !added.length) {
    return `--- ${file}\n+++ ${file}\n(no changes)`;
  }

  const contextStart = Math.max(0, prefix - CONTEXT_LINES);
  const leadingContext = beforeLines.slice(contextStart, prefix);
  const trailingContext = beforeLines.slice(
    beforeLines.length - suffix,
    Math.min(beforeLines.length, beforeLines.length - suffix + CONTEXT_LINES),
  );

  const hunkHeader = `@@ -${contextStart + 1},${leadingContext.length + removed.length + trailingContext.length} +${contextStart + 1},${leadingContext.length + added.length + trailingContext.length} @@`;

  return [
    `--- ${file}`,
    `+++ ${file}`,
    hunkHeader,
    ...leadingContext.map(line => ` ${line}`),
    ...removed.map(line => `-${line}`),
    ...added.map(line => `+${line}`),
    ...trailingContext.map(line => ` ${line}`),
  ].join('\n');
}
