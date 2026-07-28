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
import { BridgeChannelManager } from '../../src/manager/bridge-channels.js';
import { ComponentConnector } from '../../src/component-connector.js';
import { BRIDGE_CHANNEL_PREFIX } from '../../src/constants.js';

const P = BRIDGE_CHANNEL_PREFIX;

describe('BridgeChannelManager', () => {
  let bridgeChannelManager;
  let componentConnector;
  let sandbox;

  /** Collects every value a channel emits, so tests can assert on what was published. */
  function record(channel) {
    const received = [];
    channel.subscribe(evt => received.push(evt));
    return received;
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    componentConnector = new ComponentConnector(P);
    bridgeChannelManager = new BridgeChannelManager({
      ComponentConnector: componentConnector,
      channelPrefix: P,
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('channel naming', () => {
    it('should name the application context channel', () => {
      expect(bridgeChannelManager.getAppContextChannelName()).to.equal(`${P}_app`);
    });

    it('should name the cancelled back navigation channel', () => {
      expect(bridgeChannelManager.getCancelledBackNavigationChannelName()).to.equal(
        `${P}_cancelled_back_navigation`,
      );
    });

    it('should name the intercepted navigation channel', () => {
      expect(bridgeChannelManager.getInterceptedNavigationChannelName()).to.equal(
        `${P}_intercepted_navigation`,
      );
    });

    it('should expose the private, event, bridge and post-message prefixes', () => {
      expect(bridgeChannelManager.getPrivateChannelPrefix()).to.equal(`${P}_page_`);
      expect(bridgeChannelManager.getEventChannelPrefix()).to.equal(`${P}_evt_`);
      expect(bridgeChannelManager.getBridgeChannelPrefix()).to.equal(`${P}_ch_`);
      expect(bridgeChannelManager.getPostMessageChannelPrefix()).to.equal(`${P}_post_message_`);
    });

    it('should honour a custom prefix', () => {
      const custom = new BridgeChannelManager({
        ComponentConnector: componentConnector,
        channelPrefix: '__myapp',
      });
      expect(custom.getAppContextChannelName()).to.equal('__myapp_app');
    });
  });

  describe('channel access', () => {
    it('should get a bridge channel under the application-writable prefix', () => {
      const channel = bridgeChannelManager.getBridgeChannel('config');
      expect(channel).to.equal(componentConnector.getChannel(`${P}_ch_config`));
    });

    it('should get the application context channel', () => {
      expect(bridgeChannelManager.getAppContextChannel()).to.equal(
        componentConnector.getChannel(`${P}_app`),
      );
    });

    it('should get the cancelled back navigation channel', () => {
      expect(bridgeChannelManager.getCancelledBackNavigationChannel()).to.equal(
        componentConnector.getChannel(`${P}_cancelled_back_navigation`),
      );
    });

    it('should get the intercepted navigation channel', () => {
      expect(bridgeChannelManager.getInterceptedNavigationChannel()).to.equal(
        componentConnector.getChannel(`${P}_intercepted_navigation`),
      );
    });

    it('should get the post message channel of an event', () => {
      expect(bridgeChannelManager.getPostMessageChannel('ready')).to.equal(
        componentConnector.getChannel(`${P}_post_message_ready`),
      );
    });

    it('should get the private channel of a page and remember it', () => {
      const channel = bridgeChannelManager.getPrivate('home');
      expect(channel).to.equal(componentConnector.getChannel(`${P}_page_home`));
      expect(bridgeChannelManager.privateChannels.has(`${P}_page_home`)).to.be.true;
    });
  });

  describe('#initAppContextChannel / #initCancelledBackNavigationChannel', () => {
    it('should create the application context channel', () => {
      bridgeChannelManager.initAppContextChannel();
      expect(componentConnector.getChannels()).to.have.property(`${P}_app`);
    });

    it('should create the cancelled back navigation channel', () => {
      bridgeChannelManager.initCancelledBackNavigationChannel();
      expect(componentConnector.getChannels()).to.have.property(`${P}_cancelled_back_navigation`);
    });
  });

  describe('#publishPrivatePageStatus', () => {
    it('should announce that a page is active on its private channel', () => {
      const received = record(bridgeChannelManager.getPrivate('home'));

      bridgeChannelManager.publishPrivatePageStatus('home', true);

      expect(received).to.have.lengthOf(1);
      expect(received[0].type).to.equal('page-load');
      expect(received[0].detail).to.deep.equal({ value: true });
    });

    it('should announce that a page is no longer active', () => {
      const received = record(bridgeChannelManager.getPrivate('home'));

      bridgeChannelManager.publishPrivatePageStatus('home', false);

      expect(received[0].detail).to.deep.equal({ value: false });
    });
  });

  describe('#initPrivateChannel', () => {
    it('should activate the new page and deactivate the old one', () => {
      const home = record(bridgeChannelManager.getPrivate('home'));
      const category = record(bridgeChannelManager.getPrivate('category'));

      bridgeChannelManager.initPrivateChannel('home', 'category');

      expect(category[0].detail).to.deep.equal({ value: true });
      expect(home[0].detail).to.deep.equal({ value: false });
    });

    it('should only activate the new page when there is no previous one', () => {
      const publish = sandbox.spy(bridgeChannelManager, 'publishPrivatePageStatus');

      bridgeChannelManager.initPrivateChannel(undefined, 'home');

      expect(publish.calledOnceWith('home', true)).to.be.true;
    });
  });

  describe('#updateAppContext', () => {
    it('should publish the whole application context', () => {
      const received = record(bridgeChannelManager.getAppContextChannel());
      const currentRoute = { name: 'category', params: { name: 'beef' } };

      bridgeChannelManager.updateAppContext('home', 'category', { token: 'x' }, currentRoute);

      expect(received).to.have.lengthOf(1);
      expect(received[0].type).to.equal('app-context');
      expect(received[0].detail.value).to.deep.equal({
        currentPage: 'category',
        fromPage: 'home',
        interceptorContext: { token: 'x' },
        currentRoute,
      });
    });
  });

  describe('#updateBridgeChannels', () => {
    it('should publish the context and swap the private page channels', () => {
      const appContext = record(bridgeChannelManager.getAppContextChannel());
      const category = record(bridgeChannelManager.getPrivate('category'));
      const home = record(bridgeChannelManager.getPrivate('home'));

      bridgeChannelManager.updateBridgeChannels('home', 'category', {}, { name: 'category' });

      expect(appContext).to.have.lengthOf(1);
      expect(category[0].detail).to.deep.equal({ value: true });
      expect(home[0].detail).to.deep.equal({ value: false });
    });
  });

  describe('navigation announcements', () => {
    it('should publish a cancelled back navigation', () => {
      const received = record(bridgeChannelManager.getCancelledBackNavigationChannel());
      const navigation = { from: 'category', to: 'home' };

      bridgeChannelManager.publishCancelledBackNavigation(navigation);

      expect(received[0].type).to.equal('back-nav-cancelled');
      expect(received[0].detail).to.deep.equal({ value: navigation });
    });

    it('should publish an intercepted navigation', () => {
      const received = record(bridgeChannelManager.getInterceptedNavigationChannel());
      const navigation = { from: { page: 'home' }, to: { page: 'private' } };

      bridgeChannelManager.publishInterceptedNavigation(navigation);

      expect(received[0].type).to.equal('intercepted-navigation');
      expect(received[0].detail).to.deep.equal({ value: navigation });
    });
  });

  describe('#isPrivateChannel / #isActivePrivateChannel', () => {
    it('should recognise a private channel by its prefix', () => {
      expect(bridgeChannelManager.isPrivateChannel(`${P}_page_home`)).to.be.true;
    });

    it('should not claim a channel that merely contains the prefix', () => {
      expect(bridgeChannelManager.isPrivateChannel(`other_${P}_page_home`)).to.be.false;
    });

    it('should not claim an application channel', () => {
      expect(bridgeChannelManager.isPrivateChannel('recipes')).to.be.false;
    });

    it('should only report a private channel as active once it has been created', () => {
      expect(bridgeChannelManager.isActivePrivateChannel(`${P}_page_home`)).to.be.false;
      bridgeChannelManager.getPrivate('home');
      expect(bridgeChannelManager.isActivePrivateChannel(`${P}_page_home`)).to.be.true;
    });
  });

  describe('#resetBridgeChannels', () => {
    it('should clean every channel and drop every subscriptor', () => {
      const node = document.createElement('div');
      node.recipe = 'initial';
      componentConnector.addSubscription('recipes', node, 'recipe');
      componentConnector.publish('recipes', 'buffered');

      bridgeChannelManager.resetBridgeChannels(node, true);

      expect(componentConnector.subscriptors.size).to.equal(0);
      expect(componentConnector.getChannel('recipes').buffer).to.be.empty;
    });
  });

  describe('#getCCSubscriptions', () => {
    let container;
    let node;

    beforeEach(() => {
      container = document.createElement('div');
      container.id = 'cross-container';
      node = document.createElement('div');
      container.appendChild(node);
      document.body.appendChild(container);
    });

    afterEach(() => {
      container.remove();
    });

    it('should report the in connections of the components under the container', () => {
      componentConnector.addSubscription('recipes', node, 'recipe');

      const { inConnections } = bridgeChannelManager.getCCSubscriptions(
        'cross-container',
        'main-node',
      );

      expect(inConnections).to.have.lengthOf(1);
      expect(inConnections[0].channel).to.equal('recipes');
      expect(inConnections[0].bind).to.equal('recipe');
      expect(inConnections[0].component).to.equal(node);
    });

    it('should report the out connections of the components under the container', () => {
      componentConnector.addPublication('recipes', node, 'picked', undefined);

      const { outConnections } = bridgeChannelManager.getCCSubscriptions(
        'cross-container',
        'main-node',
      );

      expect(outConnections).to.have.lengthOf(1);
      expect(outConnections[0].channel).to.equal('recipes');
      expect(outConnections[0].bind).to.equal('picked');
      expect(outConnections[0].component).to.equal(node);
    });

    it('should ignore components that hang somewhere else', () => {
      const stray = document.createElement('div');
      document.body.appendChild(stray);
      componentConnector.addSubscription('recipes', stray, 'recipe');

      const { inConnections } = bridgeChannelManager.getCCSubscriptions(
        'cross-container',
        'main-node',
      );

      expect(inConnections).to.be.empty;
      stray.remove();
    });

    it('should report nothing for a component that neither listens nor publishes', () => {
      componentConnector.getSubscriptor(node);

      const { inConnections, outConnections } = bridgeChannelManager.getCCSubscriptions(
        'cross-container',
        'main-node',
      );

      expect(inConnections).to.be.empty;
      expect(outConnections).to.be.empty;
    });

    it('should survive a subscriptor with no publication or subscription list', () => {
      const subscriptor = componentConnector.getSubscriptor(node);
      subscriptor.publications = undefined;
      subscriptor.subscriptions = undefined;

      const { inConnections, outConnections } = bridgeChannelManager.getCCSubscriptions(
        'cross-container',
        'main-node',
      );

      expect(inConnections).to.be.empty;
      expect(outConnections).to.be.empty;
    });

    it('should include the main node itself', () => {
      const mainNode = document.createElement('div');
      mainNode.id = 'main-node';
      document.body.appendChild(mainNode);
      componentConnector.addSubscription('recipes', mainNode, 'recipe');

      const { inConnections } = bridgeChannelManager.getCCSubscriptions(
        'cross-container',
        'main-node',
      );

      expect(inConnections).to.have.lengthOf(1);
      mainNode.remove();
    });
  });

  describe('#initEventChannels', () => {
    it('should forward the declared events of a node onto their channels', () => {
      const node = document.createElement('div');
      document.body.appendChild(node);
      bridgeChannelManager.initEventChannels(node, ['app-ready']);
      const received = record(componentConnector.getChannel(`${P}_evt_app-ready`));

      node.dispatchEvent(new CustomEvent('app-ready', { detail: { ok: true } }));

      expect(received).to.have.lengthOf(1);
      expect(received[0].detail).to.deep.equal({ ok: true });
      node.remove();
    });
  });

  describe('#subscribeToEvent', () => {
    it('should call back when the event channel emits', () => {
      const node = document.createElement('div');
      const callback = sandbox.spy();
      bridgeChannelManager.subscribeToEvent(node, 'app-ready', callback);

      componentConnector.getChannel(`${P}_evt_app-ready`).next({ detail: { ok: true } });

      expect(callback.calledOnce).to.be.true;
      expect(callback.firstCall.args[0].detail).to.deep.equal({ ok: true });
    });
  });
});
