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

/** A route as declared in the application `RouteDefinition[]` array. */
export interface RouteEntry {
  /** Route name, used by `navigate()` and by `persistentPages` / `commonPages`. */
  name: string | null;
  /** Declared patterns. A route may declare several (`path` accepts `string | string[]`). */
  paths: string[];
  /** Custom element tag rendered for the route. */
  component: string | null;
  /** Dynamic parameters found in the patterns, e.g. `:recipeId` -> `recipeId`. */
  params: string[];
  /** Whether any pattern uses the `*` wildcard. */
  wildcard: boolean;
  /** Value of the `notFound` flag; `true` marks the route resolved for unknown paths. */
  notFound: boolean;
  /** Whether an `action` property is present. */
  hasAction: boolean;
  /** Module specifiers dynamically imported from `action`, e.g. `../pages/home/home-page.js`. */
  lazyImports: string[];
  /** 1-based line of the route object inside the routes file. */
  line: number;
}

/** Result of parsing a routes file. */
export interface RoutesFileAnalysis {
  /** Path of the routes file, relative to the project root. */
  file: string;
  /** Name of the exported binding holding the array, e.g. `routes`. */
  exportName: string | null;
  routes: RouteEntry[];
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/** A problem found while validating routes. */
export interface Diagnostic {
  severity: DiagnosticSeverity;
  /** Stable machine-readable identifier, e.g. `duplicate-path`. */
  code: string;
  message: string;
  /** Route name the diagnostic refers to, when it applies to a single route. */
  route?: string;
  /** File the diagnostic points at, relative to the project root. */
  file?: string;
  line?: number;
  /** Concrete next step to fix the problem. */
  suggestion?: string;
}

/** Where and how a channel is used. */
export interface ChannelUsage {
  /** File, relative to the project root. */
  file: string;
  line: number;
  /**
   * How the channel is reached:
   *
   * - `inbounds` / `outbounds`: declarative binding on a component class.
   * - `publish` / `subscribe` / `unsubscribe` / `publishOn`: imperative call.
   */
  kind: 'inbounds' | 'outbounds' | 'publish' | 'subscribe' | 'unsubscribe' | 'publishOn';
  /** Class the binding belongs to, for declarative usages. */
  owner?: string;
  /** Component property bound to the channel, for declarative usages. */
  property?: string;
  /** `skipUpdate` flag of an `inbounds` binding. */
  skipUpdate?: boolean;
  /** Whether the `inbounds` binding declares a transform `action`. */
  hasAction?: boolean;
}

/** Aggregated view of a single channel across the project. */
export interface ChannelSummary {
  name: string;
  /** True for channels owned by the core (prefix `__oc_`). */
  internal: boolean;
  publishers: ChannelUsage[];
  subscribers: ChannelUsage[];
}

/** Result of scanning a project for state channels. */
export interface ChannelAnalysis {
  channels: ChannelSummary[];
  /** Calls whose channel name is not a string literal, so it cannot be resolved statically. */
  dynamic: ChannelUsage[];
  diagnostics: Diagnostic[];
  /** Number of source files scanned. */
  scannedFiles: number;
}

/** A file created or modified by a scaffolding operation. */
export interface FileChange {
  /** Path relative to the project root. */
  file: string;
  action: 'create' | 'update';
  /** Full contents the file would have after the change. */
  content: string;
  /** Unified-style diff, only for updates. */
  diff?: string;
}
