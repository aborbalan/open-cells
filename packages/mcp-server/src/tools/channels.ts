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

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeChannels } from '../analysis/channels.js';
import { countBySeverity, renderDiagnostics, safeHandler, toolResponse } from '../format.js';
import { resolveProjectRoot } from '../project.js';
import {
  channelUsageSchema,
  diagnosticSchema,
  projectRootArg,
  responseFormatArg,
  serializeDiagnostic,
  serializeUsage,
} from '../schemas.js';
import type { ChannelSummary } from '../types.js';

function renderChannels(channels: ChannelSummary[]): string {
  if (!channels.length) {
    return '_No state channels found._';
  }

  const lines: string[] = [];

  for (const channel of channels) {
    lines.push(`## \`${channel.name}\`${channel.internal ? ' _(core internal)_' : ''}`);
    lines.push('');
    lines.push(
      `- Publishers (${channel.publishers.length}): ${
        channel.publishers
          .map(
            usage =>
              `\`${usage.file}:${usage.line}\` (${usage.kind}${usage.property ? ` → ${usage.property}` : ''})`,
          )
          .join(', ') || '—'
      }`,
    );
    lines.push(
      `- Subscribers (${channel.subscribers.length}): ${
        channel.subscribers
          .map(
            usage =>
              `\`${usage.file}:${usage.line}\` (${usage.kind}${usage.property ? ` → ${usage.property}` : ''})`,
          )
          .join(', ') || '—'
      }`,
    );
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

export function registerChannelTools(server: McpServer): void {
  server.registerTool(
    'open_cells_list_channels',
    {
      title: 'Map Open Cells state channels',
      description: `Map the pub/sub state channels of an Open Cells application.

Scans the sources with the TypeScript parser and collects every channel reached declaratively ('static inbounds' / 'static outbounds') or imperatively (publish, publishOn, subscribe, unsubscribe), reporting who publishes and who subscribes to each one, with file and line. Warns about channels that are published but never consumed, channels consumed but never published, and pairs of names that differ by one or two characters (likely typos). Channels prefixed '__oc_' belong to the core and are excluded from those warnings.

Args:
  - project_root (string, optional): application to analyse
  - directory (string, optional): subdirectory to scan, relative to the project root (default: src/)
  - channel (string, optional): return only this channel
  - include_internal (boolean): include the core '__oc_' channels (default: false)
  - response_format ('markdown' | 'json'): output format (default: 'markdown')

Returns:
  {
    "scanned_files": number,
    "count": number,
    "channels": [{ "name", "internal", "publishers": [usage], "subscribers": [usage] }],
    "dynamic_usages": [usage],   // calls whose channel name is not a literal
    "summary": { "error": number, "warning": number, "info": number },
    "diagnostics": [diagnostic]
  }
  where usage = { "file", "line", "kind", "owner", "property", "skip_update", "has_action" }

Use when: you need to know where a piece of state comes from, whether a channel is still used, or why a bound property stays undefined.`,
      inputSchema: {
        project_root: projectRootArg,
        directory: z
          .string()
          .optional()
          .describe('Subdirectory to scan, relative to the project root. Defaults to src/.'),
        channel: z.string().optional().describe('Return only the channel with this exact name.'),
        include_internal: z
          .boolean()
          .default(false)
          .describe("Include the core's own '__oc_' channels."),
        response_format: responseFormatArg,
      },
      outputSchema: {
        scanned_files: z.number(),
        count: z.number(),
        channels: z.array(
          z.object({
            name: z.string(),
            internal: z.boolean(),
            publishers: z.array(channelUsageSchema),
            subscribers: z.array(channelUsageSchema),
          }),
        ),
        dynamic_usages: z.array(channelUsageSchema),
        summary: z.object({ error: z.number(), warning: z.number(), info: z.number() }),
        diagnostics: z.array(diagnosticSchema),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    safeHandler(({ project_root, directory, channel, include_internal, response_format }) => {
      const root = resolveProjectRoot(project_root);
      const analysis = analyzeChannels(root, directory);

      const channels = analysis.channels
        .filter(entry => include_internal || !entry.internal)
        .filter(entry => !channel || entry.name === channel);

      if (channel && !channels.length) {
        const known = analysis.channels.map(entry => entry.name).join(', ');
        return toolResponse(
          `Channel "${channel}" is not used anywhere in ${analysis.scannedFiles} scanned file(s).${
            known ? ` Known channels: ${known}.` : ''
          }`,
          {
            scanned_files: analysis.scannedFiles,
            count: 0,
            channels: [],
            dynamic_usages: analysis.dynamic.map(serializeUsage),
            summary: { error: 0, warning: 0, info: 0 },
            diagnostics: [],
          },
        );
      }

      const diagnostics = channel
        ? analysis.diagnostics.filter(diagnostic => diagnostic.message.includes(`"${channel}"`))
        : analysis.diagnostics;

      const output = {
        scanned_files: analysis.scannedFiles,
        count: channels.length,
        channels: channels.map(entry => ({
          name: entry.name,
          internal: entry.internal,
          publishers: entry.publishers.map(serializeUsage),
          subscribers: entry.subscribers.map(serializeUsage),
        })),
        dynamic_usages: analysis.dynamic.map(serializeUsage),
        summary: countBySeverity(diagnostics),
        diagnostics: diagnostics.map(serializeDiagnostic),
      };

      const text =
        response_format === 'json'
          ? JSON.stringify(output, null, 2)
          : [
              '# State channels',
              '',
              `${channels.length} channel(s) across ${analysis.scannedFiles} scanned file(s).`,
              analysis.dynamic.length
                ? `\n${analysis.dynamic.length} call(s) use a non-literal channel name and could not be resolved statically.`
                : '',
              '',
              renderChannels(channels),
              '',
              '# Diagnostics',
              '',
              renderDiagnostics(diagnostics),
            ]
              .filter(Boolean)
              .join('\n');

      return toolResponse(
        text,
        output,
        'Filter with "channel" or "directory", or use json format.',
      );
    }),
  );
}
