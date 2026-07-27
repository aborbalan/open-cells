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

import { CHARACTER_LIMIT } from './constants.js';
import { ProjectError } from './project.js';
import type { Diagnostic } from './types.js';

/** Output formats every data returning tool supports. */
export const RESPONSE_FORMATS = ['markdown', 'json'] as const;

export type ResponseFormat = (typeof RESPONSE_FORMATS)[number];

/** Shape returned to the MCP SDK by every tool handler. */
export interface ToolResponse {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** Cuts an oversized response and explains how to narrow it down. */
export function truncate(text: string, hint: string): string {
  if (text.length <= CHARACTER_LIMIT) {
    return text;
  }
  return `${text.slice(0, CHARACTER_LIMIT)}\n\n---\n\n**Response truncated** at ${CHARACTER_LIMIT} characters. ${hint}`;
}

/** Builds a successful tool response carrying both a readable text and structured data. */
export function toolResponse(
  text: string,
  structuredContent: Record<string, unknown>,
  truncationHint = 'Narrow the request with the available filters.',
): ToolResponse {
  return {
    content: [{ type: 'text', text: truncate(text, truncationHint) }],
    structuredContent,
  };
}

/** Builds an error response. Failures are reported to the model, not thrown at the transport. */
export function toolError(error: unknown): ToolResponse {
  const isProjectError = error instanceof ProjectError;
  const message = error instanceof Error ? error.message : String(error);
  const suggestion = isProjectError && error.suggestion ? `\n\n${error.suggestion}` : '';

  return {
    content: [{ type: 'text', text: `Error: ${message}${suggestion}` }],
    structuredContent: {
      error: message,
      ...(isProjectError && error.suggestion ? { suggestion: error.suggestion } : {}),
    },
    isError: true,
  };
}

/** Wraps a handler so unexpected failures reach the model as actionable text. */
export function safeHandler<Args>(
  handler: (args: Args) => Promise<ToolResponse> | ToolResponse,
): (args: Args) => Promise<ToolResponse> {
  return async (args: Args) => {
    try {
      return await handler(args);
    } catch (error) {
      return toolError(error);
    }
  };
}

const SEVERITY_ICON: Record<Diagnostic['severity'], string> = {
  error: '✖',
  warning: '⚠',
  info: 'ℹ',
};

/** Renders diagnostics as a markdown list, grouped by severity. */
export function renderDiagnostics(diagnostics: Diagnostic[]): string {
  if (!diagnostics.length) {
    return 'No problems found.';
  }

  const lines: string[] = [];
  for (const severity of ['error', 'warning', 'info'] as const) {
    const group = diagnostics.filter(diagnostic => diagnostic.severity === severity);
    if (!group.length) {
      continue;
    }
    lines.push(`## ${severity}s (${group.length})`, '');
    for (const diagnostic of group) {
      const where = diagnostic.file
        ? ` — \`${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ''}\``
        : '';
      lines.push(
        `- ${SEVERITY_ICON[severity]} **[${diagnostic.code}]** ${diagnostic.message}${where}`,
      );
      if (diagnostic.suggestion) {
        lines.push(`  - Fix: ${diagnostic.suggestion}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

/** Counts diagnostics by severity, for response summaries. */
export function countBySeverity(diagnostics: Diagnostic[]): Record<Diagnostic['severity'], number> {
  return {
    error: diagnostics.filter(diagnostic => diagnostic.severity === 'error').length,
    warning: diagnostics.filter(diagnostic => diagnostic.severity === 'warning').length,
    info: diagnostics.filter(diagnostic => diagnostic.severity === 'info').length,
  };
}
