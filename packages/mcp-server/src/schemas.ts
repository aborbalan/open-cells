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

import { z } from 'zod';
import { RESPONSE_FORMATS } from './format.js';
import type { ChannelUsage, Diagnostic } from './types.js';

/** Argument shared by every tool that inspects an application on disk. */
export const projectRootArg = z
  .string()
  .optional()
  .describe(
    'Absolute path of the Open Cells application to analyse. Defaults to the server --project-root, then OPEN_CELLS_PROJECT_ROOT, then the working directory.',
  );

/** Argument shared by every tool that returns data. */
export const responseFormatArg = z
  .enum(RESPONSE_FORMATS)
  .default('markdown')
  .describe("Output format: 'markdown' for a readable summary, 'json' for the raw structure.");

export const routesFileArg = z
  .string()
  .optional()
  .describe(
    'Routes file relative to the project root. Defaults to src/router/routes.ts and the other conventional locations.',
  );

export const diagnosticSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  code: z.string(),
  message: z.string(),
  route: z.string().optional(),
  file: z.string().optional(),
  line: z.number().optional(),
  suggestion: z.string().optional(),
});

export const channelUsageSchema = z.object({
  file: z.string(),
  line: z.number(),
  kind: z.enum(['inbounds', 'outbounds', 'publish', 'subscribe', 'unsubscribe', 'publishOn']),
  owner: z.string().optional(),
  property: z.string().optional(),
  skip_update: z.boolean().optional(),
  has_action: z.boolean().optional(),
});

/** Serialises a diagnostic, dropping the fields that are not set. */
export function serializeDiagnostic(diagnostic: Diagnostic): z.infer<typeof diagnosticSchema> {
  return {
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    ...(diagnostic.route ? { route: diagnostic.route } : {}),
    ...(diagnostic.file ? { file: diagnostic.file } : {}),
    ...(diagnostic.line !== undefined ? { line: diagnostic.line } : {}),
    ...(diagnostic.suggestion ? { suggestion: diagnostic.suggestion } : {}),
  };
}

/** Serialises a channel usage using the snake_case field names of the tool contract. */
export function serializeUsage(usage: ChannelUsage): z.infer<typeof channelUsageSchema> {
  return {
    file: usage.file,
    line: usage.line,
    kind: usage.kind,
    ...(usage.owner ? { owner: usage.owner } : {}),
    ...(usage.property ? { property: usage.property } : {}),
    ...(usage.skipUpdate !== undefined ? { skip_update: usage.skipUpdate } : {}),
    ...(usage.hasAction !== undefined ? { has_action: usage.hasAction } : {}),
  };
}
