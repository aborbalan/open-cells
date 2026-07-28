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

import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { Bridge, enqueueCommand } from '../src/bridge.js';
import { eventManager } from '../src/manager/events.js';
import { BRIDGE_CHANNEL_PREFIX } from '../src/constants.js';
import { ComponentConnector } from '../src/component-connector.js';
import { TemplateManager } from '../src/manager/template.js';
import { Router } from '../src/router.js';

class MockWebComponent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.updateComplete = Promise.resolve(true);
    this.params = {};
  }
}

/** The custom element registry is global and cannot be undone, so define each tag once. */
function defineOnce(tagName) {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, class extends MockWebComponent {});
  }
}

['home-page', 'category-page', 'not-found-page', 'some-element'].forEach(defineOnce);

const ROUTES = {
  home: { path: '/', action: () => {} },
  category: { path: '/categories/:name', action: () => {} },
  'not-found': { path: '/not-found', action: () => {}, notFound: true },
};

/**
 * The bridge shares a lot of module-level state: the Router is a singleton, the channel
 * collection is a module constant when `channel` is 'global', and eventManager listeners are
 * never removed. So every test builds exactly one bridge and afterEach puts all of that back.
 */
describe('Bridge', () => {
  let bridge;
  let container;
  let sandbox;

  function makeBridge(overrides = {}) {
    bridge = new Bridge({
      debug: true,
      routes: { ...ROUTES },
      mainNode: '__main_node__',
      ...overrides,
    });
    return bridge;
  }

  /**
   * Waits until a condition holds. Page rendering is asynchronous and the bridge renders the
   * initial page during construction, so waiting on the 'template-registered' event races with
   * that first render; waiting on the observable outcome does not.
   */
  async function waitFor(predicate, description) {
    const deadline = Date.now() + 4000;
    while (!predicate()) {
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for ${description}`);
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    container = document.createElement('div');
    container.setAttribute('id', 'container');
    const mainNode = document.createElement('div');
    mainNode.setAttribute('id', '__main_node__');
    container.appendChild(mainNode);
    document.body.appendChild(container);
  });

  afterEach(async () => {
    if (bridge) {
      const router = bridge.Router;
      // The Router is a module-level singleton: destroy() only stops it and drops the
      // routes, so everything else it remembers has to be cleared by hand.
      router.destroy();
      router.setInterceptorContext({});
      router.currentRoute = undefined;
      router.useHistory = false;
      router.navigationStack.clear();
      router.navigationStack.skipNav = {};
      delete router.isNavigationInProgress;
      delete router.hashIsDirty;
      delete router.cancelledNavigation;
      delete router.interceptor;
      delete router.handler;

      // Router.stop() unsubscribes the `active` subscription but not the hashchange source
      // start() built, so resetting the hash still drives one more navigation. Let that
      // stray event run to completion *before* wiping the channels, or it publishes a
      // stale page status into the collection the next test inherits.
      window.location.hash = '';
      await new Promise(resolve => setTimeout(resolve, 0));

      bridge.ComponentConnector.unregisterAllSubscriptors(true);
      // With `channel: 'global'` the channel collection is a module constant shared by
      // every bridge, so its contents have to go too.
      const channels = bridge.ComponentConnector.getChannels();
      Object.keys(channels).forEach(name => delete channels[name]);
      bridge = undefined;
    }
    eventManager.removeAllListeners();
    sandbox.restore();
    container.remove();
    // _initCrossComponents() mounts the cross-component container on document.body and
    // nothing takes it down, so the next bridge would find it and treat it as declarative.
    document.querySelectorAll('#cells-template-__cross').forEach(node => node.remove());
  });

  describe('#constructor', () => {
    it('should create a new Bridge instance sitting on the home route', () => {
      makeBridge();
      expect(bridge).to.be.an.instanceof(Bridge);
      expect(bridge.getCurrentRoute().name).to.equal('home');
    });

    it('should copy the configuration onto itself', () => {
      makeBridge();
      expect(bridge.mainNode).to.equal('__main_node__');
      expect(bridge.debug).to.be.true;
    });

    it('should fall back to the default channel prefix', () => {
      makeBridge();
      expect(bridge.channelPrefix).to.equal(BRIDGE_CHANNEL_PREFIX);
      expect(bridge.storagePrefix).to.equal(`${BRIDGE_CHANNEL_PREFIX}-`);
    });

    it('should honour a custom channel prefix', () => {
      makeBridge({ channelPrefix: '__myapp' });
      expect(bridge.channelPrefix).to.equal('__myapp');
      expect(bridge.storagePrefix).to.equal('__myapp-');
    });

    it('should warn and then fail when no main node is configured', () => {
      const warn = sandbox.stub(console, 'warn');
      expect(() => makeBridge({ mainNode: undefined })).to.throw(
        'The defined main node does not exist',
      );
      expect(warn.calledWith('You should indicate the main node of your app')).to.be.true;
    });

    it('should build all of its managers', () => {
      makeBridge();
      expect(bridge.ComponentConnector).to.be.instanceOf(ComponentConnector);
      expect(bridge.TemplateManager).to.be.instanceOf(TemplateManager);
      expect(bridge.Router).to.be.instanceOf(Router);
      expect(bridge.BridgeChannelManager).to.exist;
      expect(bridge.ActionChannelManager).to.exist;
      expect(bridge.PostMessageManager).to.exist;
      expect(bridge.ApplicationConfigManager).to.exist;
      expect(bridge.ApplicationStateManager).to.exist;
    });

    it('should accept the routes as an array', () => {
      makeBridge({
        routes: [
          { name: 'home', path: '/', action: () => {} },
          { name: 'category', path: '/categories/:name', action: () => {} },
        ],
      });
      expect(Object.keys(bridge.Router.routes)).to.include('category');
    });

    it('should mark the configured skip navigations', () => {
      makeBridge({ skipNavigations: [{ from: 'home', to: 'category' }] });
      expect(bridge.Router.navigationStack.isSkipNavigation({ from: 'home', to: 'category' })).to.be
        .true;
    });
  });

  describe('#_parseRoutes', () => {
    it('should turn an array of route definitions into a map keyed by name', () => {
      makeBridge();
      const parsed = bridge._parseRoutes([
        { name: 'home', path: '/', action: () => {} },
        { name: 'category', path: '/categories/:name', action: () => {} },
      ]);
      expect(Object.keys(parsed)).to.deep.equal(['home', 'category']);
      expect(parsed.category.path).to.equal('/categories/:name');
    });
  });

  describe('#navigate', () => {
    it('should start at the home page', () => {
      makeBridge();
      expect(bridge.getCurrentRoute().name).to.equal('home');
      expect(location.hash).to.equal('');
    });

    it('should load the page and hand it the route params', async () => {
      makeBridge();
      await waitFor(() => bridge.TemplateManager.selected === 'home', 'the initial page');

      bridge.navigate('category', { name: 'service' });
      await waitFor(() => document.body.querySelector('category-page'), 'the category page');

      expect(bridge.getCurrentRoute().name).to.equal('category');
      expect(location.hash).to.equal('#!/categories/service');
      expect(document.body.querySelector('category-page').params).to.deep.equal({
        name: 'service',
      });
    });

    it('should delegate to the router', () => {
      makeBridge();
      const go = sandbox.stub(bridge.Router, 'go');
      bridge.navigate('category', { name: 'beef' });
      expect(go.calledOnceWith('category', { name: 'beef' })).to.be.true;
    });
  });

  describe('#getCurrentRoute', () => {
    it('should describe the route the application is on', () => {
      makeBridge();
      const current = bridge.getCurrentRoute();
      expect(current.name).to.equal('home');
      expect(current.params).to.deep.equal({});
      expect(current.subroute).to.be.undefined;
      expect(current.hashPath).to.equal('/');
    });
  });

  describe('#updateSubroute', () => {
    it('should ask the router to put the subroute in the address bar', () => {
      makeBridge();
      const update = sandbox.stub(bridge.Router, 'updateSubrouteInBrowser');
      bridge.updateSubroute('/step-2');
      expect(update.calledOnceWith('/step-2')).to.be.true;
    });
  });

  describe('interceptor context', () => {
    it('should start empty', () => {
      makeBridge();
      expect(bridge.getInterceptorContext()).to.deep.equal({});
    });

    it('should replace the context on set', () => {
      makeBridge();
      bridge.setInterceptorContext({ token: 'a' });
      expect(bridge.getInterceptorContext()).to.deep.equal({ token: 'a' });
    });

    it('should merge into the context on update', () => {
      makeBridge();
      bridge.setInterceptorContext({ token: 'a' });
      bridge.updateInterceptorContext({ user: 'b' });
      expect(bridge.getInterceptorContext()).to.deep.equal({ token: 'a', user: 'b' });
    });

    it('should empty the context on reset', () => {
      makeBridge();
      bridge.setInterceptorContext({ token: 'a' });
      bridge.resetInterceptorContext();
      expect(bridge.getInterceptorContext()).to.deep.equal({});
    });
  });

  describe('going back', () => {
    it('should ask the router to go back', () => {
      makeBridge();
      const back = sandbox.stub(bridge.Router, 'back').returns({ from: {}, to: {} });
      bridge.goBack();
      expect(back.calledOnce).to.be.true;
    });

    it('should go back when handling the back event', () => {
      makeBridge();
      const back = sandbox.stub(bridge.Router, 'back').returns({ from: {}, to: {} });
      bridge.handleBack();
      expect(back.calledOnce).to.be.true;
    });

    it('should go back when the backstep command is issued', () => {
      makeBridge();
      const back = sandbox.stub(bridge.Router, 'back').returns({ from: {}, to: {} });
      bridge.backStep();
      expect(back.calledOnce).to.be.true;
    });
  });

  describe('#publish', () => {
    it('should publish onto the channel', () => {
      makeBridge();
      const received = [];
      bridge.ComponentConnector.getChannel('recipes').subscribe(evt => received.push(evt));

      bridge.publish('recipes', { id: 1 });

      expect(received).to.have.lengthOf(1);
      expect(received[0].detail).to.deep.equal({ id: 1 });
    });

    it('should not persist the value by default', () => {
      makeBridge();
      const save = sandbox.stub(bridge.ApplicationStateManager, 'saveAppState');
      bridge.publish('recipes', { id: 1 });
      expect(save.called).to.be.false;
    });

    it('should persist the value when asked to', () => {
      makeBridge();
      const save = sandbox.stub(bridge.ApplicationStateManager, 'saveAppState');
      bridge.publish('recipes', { id: 1 }, { sessionStorage: true });
      expect(save.calledOnceWith('recipes', { id: 1 })).to.be.true;
    });
  });

  describe('#updateApplicationConfig', () => {
    it('should publish the configuration on the config channel', () => {
      makeBridge();
      const received = [];
      bridge.ComponentConnector.getChannel(`${BRIDGE_CHANNEL_PREFIX}_ch_config`).subscribe(evt =>
        received.push(evt),
      );

      bridge.updateApplicationConfig({ someSetting: false });

      expect(received).to.have.lengthOf(1);
      expect(received[0].detail).to.deep.equal({ someSetting: false });
    });

    it('should not persist the configuration by default', () => {
      makeBridge();
      const save = sandbox.stub(bridge.ApplicationConfigManager, 'saveAppConfig');
      bridge.updateApplicationConfig({ someSetting: false });
      expect(save.called).to.be.false;
    });

    it('should persist the configuration when asked to', () => {
      makeBridge();
      const save = sandbox.stub(bridge.ApplicationConfigManager, 'saveAppConfig');
      bridge.updateApplicationConfig({ someSetting: false }, { sessionStorage: true });
      expect(save.calledOnceWith({ someSetting: false })).to.be.true;
    });
  });

  describe('connections', () => {
    let node;

    beforeEach(() => {
      node = document.createElement('some-element');
      document.body.appendChild(node);
    });

    afterEach(() => {
      node.remove();
    });

    it('should register an in connection so the node receives values', () => {
      makeBridge();
      node.recipe = 'initial';
      bridge.registerInConnection('recipes', node, 'recipe');

      bridge.publish('recipes', { id: 4 });

      expect(node.recipe).to.deep.equal({ id: 4 });
    });

    it('should register an out connection so node events reach the channel', () => {
      makeBridge();
      const received = [];
      bridge.ComponentConnector.getChannel('recipes').subscribe(evt => received.push(evt));

      bridge.registerOutConnection('recipes', node, 'picked', undefined);
      node.dispatchEvent(new CustomEvent('picked', { detail: { id: 5 } }));

      expect(received).to.have.lengthOf(1);
      expect(received[0].detail).to.deep.equal({ id: 5 });
    });

    it('should stop delivering values after unsubscribing', () => {
      makeBridge();
      node.recipe = 'initial';
      bridge.registerInConnection('recipes', node, 'recipe');

      bridge.unsubscribe('recipes', node);
      bridge.publish('recipes', { id: 4 });

      expect(node.recipe).to.equal('initial');
    });
  });

  describe('#subscribeToEvent', () => {
    it('should refuse an event the application did not declare', () => {
      makeBridge();
      const warn = sandbox.stub(console, 'warn');
      bridge.subscribeToEvent('not-an-event', () => {});
      expect(warn.calledOnce).to.be.true;
      expect(warn.firstCall.args[0]).to.contain('non existing event');
    });

    it('should refuse a callback that is not a function', () => {
      makeBridge();
      const warn = sandbox.stub(console, 'warn');
      bridge.subscribeToEvent(bridge.externalEvents[0], 'not a function');
      expect(warn.calledOnce).to.be.true;
      expect(warn.firstCall.args[0]).to.contain('function callback');
    });

    it('should subscribe the main node to a declared event', () => {
      makeBridge();
      const subscribe = sandbox.stub(bridge.BridgeChannelManager, 'subscribeToEvent');
      const callback = () => {};

      bridge.subscribeToEvent(bridge.externalEvents[0], callback);

      expect(subscribe.calledOnce).to.be.true;
      expect(subscribe.firstCall.args[1]).to.equal(bridge.externalEvents[0]);
      expect(subscribe.firstCall.args[2]).to.equal(callback);
    });
  });

  describe('#getMainNode', () => {
    it('should find the configured main node', () => {
      makeBridge();
      expect(bridge.getMainNode().id).to.equal('__main_node__');
    });

    it('should remember the node it found', () => {
      makeBridge();
      const first = bridge.getMainNode();
      expect(bridge.getMainNode()).to.equal(first);
    });

    it('should complain when the configured main node is not in the document', () => {
      makeBridge();
      const found = bridge.getMainNode();

      bridge.__mainNodeElement = null;
      bridge.mainNode = 'nowhere';
      expect(() => bridge.getMainNode()).to.throw('The defined main node does not exist');

      // The initial render is still in flight and dispatches its events on the main node,
      // so put it back rather than leaving an async failure behind.
      bridge.mainNode = '__main_node__';
      bridge.__mainNodeElement = found;
    });
  });

  describe('#_dispatchEvent', () => {
    it('should dispatch a custom event on the main node', () => {
      makeBridge();
      const listener = sandbox.spy();
      bridge.getMainNode().addEventListener('custom-thing', listener);

      bridge._dispatchEvent('custom-thing', { a: 1 });

      expect(listener.calledOnce).to.be.true;
      expect(listener.firstCall.args[0].detail).to.deep.equal({ a: 1 });
    });

    it('should dispatch an event without payload', () => {
      makeBridge();
      const listener = sandbox.spy();
      bridge.getMainNode().addEventListener('custom-thing', listener);

      bridge._dispatchEvent('custom-thing', undefined);

      expect(listener.firstCall.args[0].detail).to.be.null;
    });

    it('should complain when the main node is gone', () => {
      makeBridge();
      const found = bridge.getMainNode();

      bridge.__mainNodeElement = null;
      bridge.mainNode = 'nowhere';
      expect(() => bridge._dispatchEvent('custom-thing')).to.throw(
        'The defined main node does not exist',
      );

      bridge.mainNode = '__main_node__';
      bridge.__mainNodeElement = found;
    });
  });

  describe('#computeTemplateId', () => {
    it('should prefix the template name', () => {
      makeBridge();
      expect(bridge.computeTemplateId('home')).to.equal('cells-template-home');
    });

    it('should turn dots into dashes', () => {
      makeBridge();
      expect(bridge.computeTemplateId('a.b')).to.equal('cells-template-a-b');
    });
  });

  describe('#_insideLayout', () => {
    it('should recognise a zone written as layout.zone', () => {
      makeBridge();
      expect(bridge._insideLayout('layout.header')).to.be.true;
    });

    it('should reject a plain zone', () => {
      makeBridge();
      expect(bridge._insideLayout('header')).to.be.false;
    });

    it('should reject a missing zone', () => {
      makeBridge();
      expect(bridge._insideLayout(undefined)).to.be.false;
    });
  });

  describe('#createPageFromWebComponent', () => {
    it('should create the template for a resolved component', async () => {
      makeBridge();
      await bridge.createPageFromWebComponent('category', 'category-page');
      expect(bridge.TemplateManager.get('category')).to.exist;
    });

    it('should open the private channel of the page', async () => {
      makeBridge();
      await bridge.createPageFromWebComponent('category', 'category-page');
      expect(
        bridge.BridgeChannelManager.isActivePrivateChannel(
          `${BRIDGE_CHANNEL_PREFIX}_page_category`,
        ),
      ).to.be.true;
    });

    it('should derive the component name from the route name', async () => {
      makeBridge();
      await bridge.createPageFromWebComponent('home', undefined);
      expect(bridge.TemplateManager.get('home').node.tagName.toLowerCase()).to.equal('home-page');
    });

    it('should ask the loader for a component that is not defined yet', async () => {
      makeBridge();
      const loadCellsPage = sandbox.stub().resolves();
      bridge.loadCellsPage = loadCellsPage;

      await bridge.createPageFromWebComponent('unknown', 'unknown-page');

      expect(loadCellsPage.calledOnceWith('unknown')).to.be.true;
    });
  });

  describe('#printDebugInfo', () => {
    it('should log the bridge version and cache setting', () => {
      makeBridge();
      const log = sandbox.stub(console, 'log');
      bridge.printDebugInfo();
      expect(log.calledOnce).to.be.true;
      expect(log.firstCall.args[0]).to.contain('bridge version');
    });
  });

  describe('the pending command queue', () => {
    it('should run the queued commands once the bridge is up', () => {
      sandbox.stub(console, 'log');
      enqueueCommand('setInterceptorContext', [{ queued: true }]);

      makeBridge();

      expect(bridge.getInterceptorContext()).to.deep.equal({ queued: true });
    });

    it('should report a queued command that does not exist', () => {
      const log = sandbox.stub(console, 'log');
      enqueueCommand('nonExistingCommand', []);

      makeBridge();

      expect(
        log.getCalls().some(c => String(c.args[0]).includes('Invalid cells bridge command')),
      ).to.be.true;
    });
  });

  describe('private page channels', () => {
    it('should announce that the page being entered is active', async () => {
      makeBridge();
      await waitFor(() => bridge.TemplateManager.selected === 'home', 'the initial page');

      bridge.navigate('category', { name: 'food' });
      await waitFor(() => bridge.getCurrentRoute().name === 'category', 'the category route');

      const elemStub = document.createElement('some-element');
      bridge.registerInConnection(`${BRIDGE_CHANNEL_PREFIX}_page_category`, elemStub, evt => {
        elemStub.category = evt.value;
      });

      expect(elemStub.category).to.equal(true);
    });
  });

  describe('#_initCrossComponents', () => {
    it('should build the cross-component container when there is none', () => {
      makeBridge();
      const crossContainer = bridge.TemplateManager.get('__cross');
      expect(crossContainer).to.exist;
      expect(crossContainer.node.parentNode).to.equal(document.body);
      expect(bridge.usingDeclarativeCrossContainer).to.not.be.true;
      crossContainer.node.remove();
    });

    it('should adopt a cross-component container already in the markup', () => {
      const declared = document.createElement('div');
      declared.id = 'cells-template-__cross';
      document.body.appendChild(declared);

      makeBridge();

      expect(bridge.usingDeclarativeCrossContainer).to.be.true;
      expect(bridge.TemplateManager.get('__cross').node).to.equal(declared);
      declared.remove();
    });
  });

  describe('external events', () => {
    it('should dispatch an external event on the main node', () => {
      makeBridge();
      const eventName = bridge.externalEvents[0];
      const listener = sandbox.spy();
      bridge.getMainNode().addEventListener(eventName, listener);

      eventManager.emit(eventName, { a: 1 });

      expect(listener.calledOnce).to.be.true;
      expect(listener.firstCall.args[0].detail).to.deep.equal({ a: 1 });
    });

    it('should open a channel per external event and forward what the node emits', () => {
      makeBridge();
      const eventName = bridge.externalEvents[0];
      bridge._initEventChannels();
      const received = [];
      bridge.ComponentConnector.getChannel(`${BRIDGE_CHANNEL_PREFIX}_evt_${eventName}`).subscribe(
        evt => received.push(evt),
      );

      bridge.getMainNode().dispatchEvent(new CustomEvent(eventName, { detail: { a: 1 } }));

      expect(received.length).to.be.at.least(1);
      expect(received[0].detail).to.deep.equal({ a: 1 });
    });

    it('should hook up the subscriptions declared in the configuration', () => {
      const callback = sinon.spy();
      const eventName = 'template-registered';
      makeBridge({ eventSubscriptions: [{ event: eventName, callback }] });
      const subscribe = sandbox.spy(bridge, 'subscribeToEvent');

      bridge._addInitialSubscribersToEvents();

      expect(subscribe.calledOnceWith(eventName, callback)).to.be.true;
    });

    it('should do nothing when no subscriptions are declared', () => {
      makeBridge();
      const subscribe = sandbox.spy(bridge, 'subscribeToEvent');
      bridge._addInitialSubscribersToEvents();
      expect(subscribe.called).to.be.false;
    });
  });

  describe('#routeHandler', () => {
    it('should publish each route parameter on a channel of its own name', () => {
      makeBridge();
      sandbox.stub(bridge, '_handleRouteLoading');
      bridge.Router.currentRoute = { name: 'category', params: { categoryName: 'beef' } };
      const received = [];
      bridge.ComponentConnector.getChannel('categoryName').subscribe(evt => received.push(evt));

      bridge.routeHandler();

      expect(received).to.have.lengthOf(1);
      expect(received[0].type).to.equal('category-name-changed');
      expect(received[0].detail).to.deep.equal({ value: 'beef' });
    });

    it('should announce the parsed route', () => {
      makeBridge();
      sandbox.stub(bridge, '_handleRouteLoading');
      const listener = sandbox.spy();
      eventManager.on('parse-route', listener);
      bridge.Router.currentRoute = { name: 'home', params: {} };

      bridge.routeHandler();

      expect(listener.calledOnce).to.be.true;
    });

    it('should ask for the page of the route to be loaded', () => {
      makeBridge();
      const load = sandbox.stub(bridge, '_handleRouteLoading');
      const route = { name: 'home', params: {} };
      bridge.Router.currentRoute = route;

      bridge.routeHandler();

      expect(load.calledOnceWith(route)).to.be.true;
    });
  });

  describe('#_handleRouteLoading', () => {
    it('should create the page and then select it', async () => {
      makeBridge();
      const select = sandbox.stub(bridge, 'selectPage');

      bridge._handleRouteLoading({ name: 'category', component: 'category-page', params: {} });
      await waitFor(
        () => select.getCalls().some(call => call.args[0] === 'category'),
        'the category page to be selected',
      );

      expect(select.calledWith('category', {})).to.be.true;
    });
  });

  describe('#_updateChannels', () => {
    it('should hand the old and new template names to the channel manager', () => {
      makeBridge();
      const update = sandbox.stub(bridge.BridgeChannelManager, 'updateBridgeChannels');

      bridge._updateChannels({ name: 'home' }, { name: 'category' });

      expect(update.calledOnce).to.be.true;
      expect(update.firstCall.args[0]).to.equal('home');
      expect(update.firstCall.args[1]).to.equal('category');
    });

    it('should leave the old name undefined when there is no previous template', () => {
      makeBridge();
      const update = sandbox.stub(bridge.BridgeChannelManager, 'updateBridgeChannels');

      bridge._updateChannels(undefined, { name: 'home' });

      expect(update.firstCall.args[0]).to.be.undefined;
    });
  });

  describe('#_handleParams', () => {
    it('should copy the params onto a node that expects them', () => {
      makeBridge();
      const node = { params: {} };
      bridge._handleParams(node, { name: 'beef' });
      expect(node.params).to.deep.equal({ name: 'beef' });
    });

    it('should clear the params when there are none', () => {
      makeBridge();
      const node = { params: { stale: true } };
      bridge._handleParams(node, {});
      expect(node.params).to.deep.equal({});
    });

    it('should leave a node without a params property alone', () => {
      makeBridge();
      const node = {};
      bridge._handleParams(node, { name: 'beef' });
      expect(node.params).to.be.undefined;
    });
  });

  describe('#_waitRenderComplete', () => {
    it('should wait for the render promise of the node', async () => {
      makeBridge();
      const template = { node: { updateComplete: Promise.resolve('rendered') } };
      expect(await bridge._waitRenderComplete(template)).to.equal('rendered');
    });

    it('should resolve straight away for a node that does not render', async () => {
      makeBridge();
      expect(await bridge._waitRenderComplete({ node: {} })).to.be.true;
    });
  });

  describe('#onRender', () => {
    it('should mount an unattached template inside the main node', () => {
      makeBridge();
      const template = document.createElement('div');

      bridge.onRender(template);

      expect(template.parentNode).to.equal(bridge.getMainNode());
    });

    it('should announce that the components of the template are loaded', () => {
      makeBridge();
      const listener = sandbox.spy();
      document.body.addEventListener('componentsInTemplateLoaded', listener);

      bridge.onRender(document.createElement('div'));

      expect(listener.calledOnce).to.be.true;
      document.body.removeEventListener('componentsInTemplateLoaded', listener);
    });

    it('should leave a template that is already mounted where it is', () => {
      makeBridge();
      const elsewhere = document.createElement('div');
      document.body.appendChild(elsewhere);
      const template = document.createElement('div');
      elsewhere.appendChild(template);

      bridge.onRender(template);

      expect(template.parentNode).to.equal(elsewhere);
      elsewhere.remove();
    });
  });

  describe('#loadCellsPage / #_lazyLoadPages', () => {
    it('should run the action of the route', () => {
      const action = sinon.stub().returns('loaded');
      makeBridge({ routes: { home: { path: '/', action } } });

      expect(bridge.loadCellsPage('home')).to.equal('loaded');
    });

    it('should load every common page up front', () => {
      const action = sinon.stub();
      makeBridge({ routes: { home: { path: '/', action } }, commonPages: ['home'] });

      // The constructor lazy-loads them, so the action has already run.
      expect(action.called).to.be.true;
    });
  });

  describe('cross-component connections', () => {
    let node;

    beforeEach(() => {
      node = document.createElement('some-element');
      document.body.appendChild(node);
    });

    afterEach(() => {
      node.remove();
    });

    it('should unregister the components of every connection when disconnecting', () => {
      makeBridge();
      bridge.registerInConnection('recipes', node, 'recipe');

      bridge._disconnectCrossComponents(
        { inConnections: [{ component: node }], outConnections: [] },
        true,
      );

      expect(bridge.ComponentConnector.subscriptors.has(node)).to.be.false;
    });

    it('should tolerate a connection set with nothing in it', () => {
      makeBridge();
      expect(() =>
        bridge._disconnectCrossComponents({ inConnections: undefined, outConnections: undefined }, true),
      ).to.not.throw();
    });

    it('should register the connections again when reconnecting', () => {
      makeBridge();
      node.recipe = 'initial';

      bridge._reconnectCrossComponents({
        inConnections: [{ channel: 'recipes', component: node, bind: 'recipe' }],
        outConnections: [],
      });
      bridge.publish('recipes', { id: 8 });

      expect(node.recipe).to.deep.equal({ id: 8 });
    });

    it('should keep the cross-component connections across a channel reset', () => {
      makeBridge();
      const crossContainer = bridge.TemplateManager.get('__cross');
      crossContainer.node.appendChild(node);
      node.recipe = 'initial';
      bridge.registerInConnection('recipes', node, 'recipe');

      bridge._resetBridgeChannels();
      bridge.publish('recipes', { id: 9 });

      expect(node.recipe).to.deep.equal({ id: 9 });
      crossContainer.node.remove();
    });
  });

  describe('#logout', () => {
    it('should do nothing when the initial template is already the selected one', () => {
      makeBridge({ initialTemplate: 'home' });
      bridge.TemplateManager.selected = 'home';
      const reset = sandbox.stub(bridge, '_resetBridgeChannels');

      bridge.logout();

      expect(reset.called).to.be.false;
    });

    it('should reset the channels and go back to the initial page', async () => {
      makeBridge({ initialTemplate: 'home' });
      await waitFor(() => bridge.TemplateManager.selected === 'home', 'the initial page');
      bridge.TemplateManager.selected = 'category';
      const category = bridge.TemplateManager.createTemplate('category', {
        tagName: 'category-page',
      });
      // removeTemplates() looks its nodes up in the document, so mount it like the bridge does.
      bridge.getMainNode().appendChild(category.node);
      const go = sandbox.stub(bridge.Router, 'go');
      const reset = sandbox.stub(bridge, '_resetBridgeChannels');

      bridge.logout();

      expect(reset.calledOnce).to.be.true;
      expect(go.calledOnceWith('home')).to.be.true;
      expect(bridge.getInterceptorContext()).to.deep.equal({});
    });
  });

  describe('the application context channel', () => {
    it('should carry the current page and the interceptor context', async () => {
      makeBridge();
      await waitFor(() => bridge.TemplateManager.selected === 'home', 'the initial page');

      bridge.navigate('category', { name: 'food' });
      await waitFor(() => bridge.getCurrentRoute().name === 'category', 'the category route');

      const elemStub = document.createElement('some-element');
      bridge.registerInConnection(`${BRIDGE_CHANNEL_PREFIX}_app`, elemStub, evt => {
        elemStub.app = evt.value;
      });

      expect(elemStub.app.currentPage).to.equal('category');
      expect(elemStub.app.interceptorContext).to.deep.equal({});
      expect(elemStub.app.currentRoute.name).to.equal('category');
    });
  });
});
