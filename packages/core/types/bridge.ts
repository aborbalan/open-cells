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

import { NavigationWithParams } from './navigation-stack';
import { Navigation, QueryParams } from './navigation-stack';
import { RouteData } from './route';

/** A command enqueued through `enqueueCommand` before the bridge exists. */
export type QueuedCommand = { command: string; parameters: any };

declare global {
  interface Window {
    /**
     * Commands issued before `startApp` has built the bridge. The bridge drains it on start. Part
     * of the contract: `enqueueCommand` is public API and this is where it writes.
     */
    cellsBridgeQueue?: QueuedCommand[];
  }
}

/**
 * The application bridge.
 *
 * This used to be `export { Bridge } from '../src/bridge'`, which pointed the published
 * declarations at a `.js` file that ships no types of its own: every consumer got TS7016 for a
 * class that `src/index.js` exports as a value. Declared here instead, so `new Bridge(config)`
 * compiles.
 *
 * Only the public surface is declared. Everything prefixed with `_` is internal and was never part
 * of the contract.
 */
export declare class Bridge {
  constructor(config?: CellsConfig);

  /** Registers a subscription to a channel for a node. */
  registerInConnection(channelName: string, node: object, callback?: Function): void;

  /** Registers a DOM event of a node as a publisher on a channel. */
  registerOutConnection(
    channelName: string,
    htmlElement: HTMLElement,
    bindName: string,
    extraParameters?: unknown,
  ): void;

  /** Removes a node's subscriptions to one or more channels. */
  unsubscribe(channels: string | string[], node: object): void;

  /** Publishes a value on a channel. */
  publish(channelName: string, value: unknown, options?: { sessionStorage?: boolean }): void;

  /** Subscribes a callback to one of the bridge's own events. */
  subscribeToEvent(eventName: string, callback: Function): void;

  /** Navigates to a route by name. Never by path. */
  navigate(page: string, params?: QueryParams): void;

  /** The route currently on screen. */
  getCurrentRoute(): RouteData;

  /** Replaces the subroute of the current route. */
  updateSubroute(subroute: string): void;

  /** Steps back through the navigation stack. */
  backStep(): void;

  /** Steps back through the browser history. */
  goBack(): void;

  /** Merges values into the application configuration. */
  updateApplicationConfig(
    config: Record<string, any>,
    options?: { sessionStorage?: boolean },
  ): void;

  /** Merges values into the interceptor context. */
  updateInterceptorContext(ctx: object): void;

  /** Empties the interceptor context. */
  resetInterceptorContext(): void;

  /** The current interceptor context. */
  getInterceptorContext(): object;

  /** Replaces the interceptor context. */
  setInterceptorContext(ctx: object): void;

  /** Resets the bridge channels, dropping the state the session had accumulated. */
  logout(): void;

  /** The node the application renders into. */
  getMainNode(): HTMLElement;
}

export type BridgeAPI = {
  logout: Function;
  subscribeToEvent: Function;
  registerInConnection: Function;
  unsubscribe: Function;
  registerOutConnection: Function;
  publish: Function;
  updateSubroute: Function;
  getCurrentRoute: Function;
  navigate: Function;
  updateApplicationConfig: Function;
  updateInterceptorContext: Function;
  resetInterceptorContext: Function;
  getInterceptorContext: Function;
  setInterceptorContext: Function;
};

export type EventSubscription = { event: string; callback: Function };

export type CellsConfig = {
  mainNode: string;
  postMessageTargetOrigin?: string;
  eventSubscriptions?: EventSubscription[];
  interceptor?: InterceptorFunction;
  skipNavigations?: Navigation[];
  routes?: RouteDefinition[];
  viewLimit?: number;
  persistentPages?: string[];
  initialTemplate?: string;
  appConfig?: Record<string, any>;
  commonPages?: string[];
};

export type RouteDefinition = {
  name: string;
  path: string;
  action: Function;
  notFound?: boolean;
  component: string;
};

export type ParsedRoute = {
  [name: string]: {
    path: string;
    action: Function;
    notFound: boolean;
    component: string;
  };
};

export type RouteMap = {
  [name: string]:
    | {
        path: string;
        action: Function;
      }
    | { path: string; action: Function }[];
};

export type InterceptorFunction = (
  navigation: NavigationWithParams,
  ctx: object,
) => { intercept: boolean; redirect: string };
