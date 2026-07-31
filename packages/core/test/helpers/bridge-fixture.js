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

import { Bridge } from '../../src/bridge.js';
import { eventManager } from '../../src/manager/events.js';

/**
 * Test fixture for the packages built on top of the bridge.
 *
 * A bridge is expensive to stand up and, more importantly, most of what it touches is
 * module-level state that outlives it:
 *
 * - The `Router` is a singleton whose `destroy()` only stops it and drops its routes.
 * - With the default `channel: 'global'`, the channel collection is a module constant that
 *   every bridge writes into.
 * - Each bridge registers listeners on the shared `eventManager` and removes none, so the
 *   emitter starts warning about a leak after twenty or so tests.
 * - `_initCrossComponents()` mounts a container on `document.body` and nothing takes it down,
 *   so the next bridge finds it and treats it as declaratively provided.
 *
 * Getting any of that wrong shows up as a test that passes alone and fails in a suite, which
 * is why it lives in one place rather than being copied into every package.
 *
 * Sibling packages reach it through their `@open-cells/core` devDependency. It is not part of
 * the published package — `files` does not include `test/` — and is only ever resolved through
 * the workspace symlink.
 *
 * @example
 *   const bridgeFixture = useBridge();
 *
 *   it('does something', () => {
 *     bridgeFixture.bridge.publish('recipes', { id: 1 });
 *   });
 *
 * @param {object} [options]
 * @param {object} [options.routes] Routes for the bridge. Route actions must return a promise:
 *   the bridge chains `.then()` onto whatever `loadCellsPage()` gives back, and it takes that
 *   path for any page tag that is not in the custom element registry.
 * @param {object} [options.config] Anything else to merge into the bridge configuration.
 * @returns {{ bridge: import('../../src/bridge.js').Bridge }} A holder whose `bridge` is
 *   replaced before each test.
 */
export function useBridge({ routes, config } = {}) {
  const holder = { bridge: undefined };
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    const mainNode = document.createElement('div');
    mainNode.setAttribute('id', '__main_node__');
    container.appendChild(mainNode);
    document.body.appendChild(container);

    holder.bridge = new Bridge({
      debug: true,
      mainNode: '__main_node__',
      routes: routes || { home: { path: '/', action: () => Promise.resolve() } },
      ...config,
    });
  });

  afterEach(() => {
    const { bridge } = holder;

    bridge.Router.destroy();
    bridge.Router.setInterceptorContext({});
    bridge.Router.currentRoute = undefined;
    bridge.Router.useHistory = false;
    bridge.Router.navigationStack.clear();
    bridge.Router.navigationStack.skipNav = {};
    delete bridge.Router.isNavigationInProgress;
    delete bridge.Router.hashIsDirty;
    delete bridge.Router.cancelledNavigation;
    delete bridge.Router.interceptor;
    delete bridge.Router.handler;

    bridge.ComponentConnector.unregisterAllSubscriptors(true);
    const channels = bridge.ComponentConnector.getChannels();
    Object.keys(channels).forEach(name => delete channels[name]);

    eventManager.removeAllListeners();

    container.remove();
    document.querySelectorAll('#cells-template-__cross').forEach(node => node.remove());
    window.location.hash = '';

    holder.bridge = undefined;
  });

  return holder;
}
