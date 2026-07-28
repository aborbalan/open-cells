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
import { ComponentConnector } from '../src/component-connector.js';
import { Subscriptor } from '../src/state/subscriptor.js';
import { Channel } from '../src/state/channel.js';
import { ChannelManager } from '../src/manager/channel-manager.js';
import { ElementAdapter } from '../src/adapter/element-adapter.js';
import { eventManager } from '../src/manager/events.js';
import { Constants } from '../src/constants.js';
import { BRIDGE_CHANNEL_PREFIX } from '../src/constants.js';

const { externalEventsCodes } = Constants;

describe('ComponentConnector', () => {
  let componentConnector;
  let node;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    componentConnector = new ComponentConnector(BRIDGE_CHANNEL_PREFIX);
    node = document.createElement('div');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#constructor', () => {
    it('should wire up its adapter, channel manager and subscriptor map', () => {
      expect(componentConnector.adapter).to.be.instanceOf(ElementAdapter);
      expect(componentConnector.manager).to.be.instanceOf(ChannelManager);
      expect(componentConnector.subscriptors).to.be.instanceOf(Map);
      expect(componentConnector.subscriptors.size).to.equal(0);
    });

    it('should build the private-channel pattern from the given prefix', () => {
      expect(componentConnector.channelPrefix).to.equal(BRIDGE_CHANNEL_PREFIX);
      expect(componentConnector.bridgeChannelPrefixRegex).to.be.instanceOf(RegExp);
    });
  });

  describe('#isBridgeChannel', () => {
    it('should recognise a framework-owned channel', () => {
      expect(componentConnector.isBridgeChannel(`${BRIDGE_CHANNEL_PREFIX}_app`)).to.be.true;
    });

    it('should recognise a page status channel', () => {
      expect(componentConnector.isBridgeChannel(`${BRIDGE_CHANNEL_PREFIX}_page_home`)).to.be.true;
    });

    it('should not claim an application channel', () => {
      expect(componentConnector.isBridgeChannel('recipes')).to.be.false;
    });

    it('should leave the _ch_ escape hatch open to applications', () => {
      // The pattern carries a negative lookahead for "ch", which is what lets an
      // application own a channel that still lives under the bridge prefix.
      expect(componentConnector.isBridgeChannel(`${BRIDGE_CHANNEL_PREFIX}_ch_custom`)).to.be.false;
    });

    it('should honour a custom prefix', () => {
      const custom = new ComponentConnector('__myapp');
      expect(custom.isBridgeChannel('__myapp_app')).to.be.true;
      expect(custom.isBridgeChannel(`${BRIDGE_CHANNEL_PREFIX}_app`)).to.be.false;
    });
  });

  describe('#isActiveBridgeChannel', () => {
    it('should be false for a channel that has not been created yet', () => {
      expect(componentConnector.isActiveBridgeChannel(`${BRIDGE_CHANNEL_PREFIX}_app`)).to.be.false;
    });

    it('should be true once the private channel exists', () => {
      componentConnector.getChannel(`${BRIDGE_CHANNEL_PREFIX}_app`);
      expect(componentConnector.isActiveBridgeChannel(`${BRIDGE_CHANNEL_PREFIX}_app`)).to.be.true;
    });

    it('should be false for an existing application channel', () => {
      componentConnector.getChannel('recipes');
      expect(componentConnector.isActiveBridgeChannel('recipes')).to.be.false;
    });
  });

  describe('#getSubscriptor', () => {
    it('should create a subscriptor for a node it has not seen', () => {
      expect(componentConnector.getSubscriptor(node)).to.be.instanceOf(Subscriptor);
    });

    it('should return the same subscriptor for the same node', () => {
      const first = componentConnector.getSubscriptor(node);
      expect(componentConnector.getSubscriptor(node)).to.equal(first);
    });

    it('should hand the channel prefix down to the subscriptor', () => {
      expect(componentConnector.getSubscriptor(node).channelPrefix).to.equal(
        BRIDGE_CHANNEL_PREFIX,
      );
    });

    it('should keep a separate subscriptor per node', () => {
      const other = document.createElement('div');
      expect(componentConnector.getSubscriptor(node)).to.not.equal(
        componentConnector.getSubscriptor(other),
      );
    });
  });

  describe('channel access', () => {
    it('should create a channel on first access and reuse it afterwards', () => {
      const channel = componentConnector.getChannel('recipes');
      expect(channel).to.be.instanceOf(Channel);
      expect(componentConnector.getChannel('recipes')).to.equal(channel);
    });

    it('should expose every channel it holds', () => {
      componentConnector.getChannel('recipes');
      expect(Object.keys(componentConnector.getChannels())).to.deep.equal(['recipes']);
    });

    it('should let the whole channel collection be replaced', () => {
      const channels = { one: new Channel('one') };
      componentConnector.setChannels(channels);
      expect(componentConnector.getChannels()).to.equal(channels);
    });

    it('should clean every channel it holds', () => {
      const channel = componentConnector.getChannel('recipes');
      channel.next({ value: 'something' });
      componentConnector.cleanAllChannels();
      expect(channel.buffer).to.be.empty;
    });
  });

  describe('#publish', () => {
    it('should push a custom event carrying the value onto the channel', () => {
      const channel = componentConnector.getChannel('recipes');
      const received = [];
      channel.subscribe(evt => received.push(evt));

      componentConnector.publish('recipes', { id: 1 });

      expect(received).to.have.lengthOf(1);
      expect(received[0].type).to.equal('recipes-publish');
      expect(received[0].detail).to.deep.equal({ id: 1 });
    });

    it('should refuse to write to a private channel and say so', () => {
      const warn = sandbox.stub(console, 'warn');
      const channel = componentConnector.getChannel(`${BRIDGE_CHANNEL_PREFIX}_app`);
      const received = [];
      channel.subscribe(evt => received.push(evt));

      componentConnector.publish(`${BRIDGE_CHANNEL_PREFIX}_app`, { tampered: true });

      expect(received).to.be.empty;
      expect(warn.calledOnce).to.be.true;
      expect(warn.firstCall.args[0]).to.contain('Forbidden operation');
      expect(warn.firstCall.args[0]).to.contain(`${BRIDGE_CHANNEL_PREFIX}_app`);
    });

    it('should allow writing to the _ch_ escape hatch', () => {
      const warn = sandbox.stub(console, 'warn');
      const name = `${BRIDGE_CHANNEL_PREFIX}_ch_custom`;
      const received = [];
      componentConnector.getChannel(name).subscribe(evt => received.push(evt));

      componentConnector.publish(name, { ok: true });

      expect(received).to.have.lengthOf(1);
      expect(warn.called).to.be.false;
    });
  });

  describe('#addPublication', () => {
    it('should forward a DOM event from the node to the channel', () => {
      const received = [];
      componentConnector.getChannel('recipes').subscribe(evt => received.push(evt));
      document.body.appendChild(node);

      componentConnector.addPublication('recipes', node, 'recipe-picked', undefined);
      node.dispatchEvent(new CustomEvent('recipe-picked', { detail: { id: 7 } }));

      expect(received).to.have.lengthOf(1);
      expect(received[0].detail).to.deep.equal({ id: 7 });
      node.remove();
    });

    it('should refuse to publish onto a private channel and say so', () => {
      const warn = sandbox.stub(console, 'warn');
      componentConnector.addPublication(
        `${BRIDGE_CHANNEL_PREFIX}_app`,
        node,
        'whatever',
        undefined,
      );

      expect(warn.calledOnce).to.be.true;
      expect(warn.firstCall.args[0]).to.contain('Forbidden operation');
      expect(componentConnector.subscriptors.has(node)).to.be.false;
    });

    it('should not register the same publication twice', () => {
      const received = [];
      componentConnector.getChannel('recipes').subscribe(evt => received.push(evt));
      document.body.appendChild(node);

      componentConnector.addPublication('recipes', node, 'recipe-picked', undefined);
      componentConnector.addPublication('recipes', node, 'recipe-picked', undefined);
      node.dispatchEvent(new CustomEvent('recipe-picked', { detail: { id: 7 } }));

      expect(componentConnector.getSubscriptor(node).publications._finalizers).to.have.lengthOf(1);
      expect(received).to.have.lengthOf(1);
      node.remove();
    });

    it('should register a second publication for a different event', () => {
      componentConnector.addPublication('recipes', node, 'recipe-picked', undefined);
      componentConnector.addPublication('recipes', node, 'recipe-dropped', undefined);
      expect(componentConnector.getSubscriptor(node).publications._finalizers).to.have.lengthOf(2);
    });
  });

  describe('#_hasPublisher', () => {
    it('should be false before anything is published', () => {
      const subscriptor = componentConnector.getSubscriptor(node);
      expect(componentConnector._hasPublisher(subscriptor, node, 'recipes', 'picked')).to.be.false;
    });

    it('should be true once a matching publication exists', () => {
      componentConnector.addPublication('recipes', node, 'picked', undefined);
      const subscriptor = componentConnector.getSubscriptor(node);
      expect(componentConnector._hasPublisher(subscriptor, node, 'recipes', 'picked')).to.be.true;
    });

    it('should tell publications on different channels apart', () => {
      componentConnector.addPublication('recipes', node, 'picked', undefined);
      const subscriptor = componentConnector.getSubscriptor(node);
      expect(componentConnector._hasPublisher(subscriptor, node, 'other', 'picked')).to.be.false;
    });
  });

  describe('#addSubscription', () => {
    it('should write the published value onto the bound property of the node', () => {
      // The adapter only writes to the property when the node already holds a truthy
      // value there; otherwise it falls back to setting an attribute.
      node.recipe = 'initial';
      componentConnector.addSubscription('recipes', node, 'recipe');

      componentConnector.publish('recipes', { id: 3 });

      expect(node.recipe).to.deep.equal({ id: 3 });
    });

    it('should fall back to an attribute when the bound property is empty', () => {
      node.recipe = null;
      componentConnector.addSubscription('recipes', node, 'recipe');

      componentConnector.publish('recipes', 'beef');

      expect(node.getAttribute('recipe')).to.equal('beef');
    });

    it('should call the bound function when the binding is a function', () => {
      const received = [];
      componentConnector.addSubscription('recipes', node, value => received.push(value));

      componentConnector.publish('recipes', { id: 3 });

      expect(received).to.deep.equal([{ id: 3 }]);
    });

    it('should register the subscription on the node subscriptor', () => {
      componentConnector.addSubscription('recipes', node, 'recipe');
      expect(componentConnector.getSubscriptor(node).subscriptions).to.have.lengthOf(1);
    });
  });

  describe('#hasSubscriptions', () => {
    it('should be false for a channel the node is not subscribed to', () => {
      const subscriptor = componentConnector.getSubscriptor(node);
      expect(componentConnector.hasSubscriptions(subscriptor, 'recipes')).to.be.false;
    });

    it('should be true once the node is subscribed', () => {
      componentConnector.addSubscription('recipes', node, 'recipe');
      const subscriptor = componentConnector.getSubscriptor(node);
      expect(componentConnector.hasSubscriptions(subscriptor, 'recipes')).to.be.true;
    });
  });

  describe('#updateSubscription', () => {
    it('should subscribe a node that has no subscription yet', () => {
      componentConnector.updateSubscription('recipes', node, 'recipe');
      expect(componentConnector.getSubscriptor(node).subscriptions).to.have.lengthOf(1);
    });

    it('should not subscribe twice to the same application channel', () => {
      componentConnector.updateSubscription('recipes', node, 'recipe');
      componentConnector.updateSubscription('recipes', node, 'recipe');
      expect(componentConnector.getSubscriptor(node).subscriptions).to.have.lengthOf(1);
    });

    it('should re-subscribe on an active private channel', () => {
      const name = `${BRIDGE_CHANNEL_PREFIX}_app`;
      componentConnector.getChannel(name);
      componentConnector.updateSubscription(name, node, 'app');
      const subscriptor = componentConnector.getSubscriptor(node);
      // The Subscriptor itself refuses a duplicate channel, but the connector must
      // still take the private-channel branch rather than the has-subscription one.
      componentConnector.updateSubscription(name, node, 'app');
      expect(subscriptor.subscriptions).to.have.lengthOf(1);
    });
  });

  describe('#wrapCallback', () => {
    it('should carry the node on the returned callback', () => {
      const callback = componentConnector._wrapCallbackWithNode(node, 'recipe');
      expect(callback.node).to.equal(node);
    });

    it('should set the value on the node property', () => {
      node.recipe = 'initial';
      const callback = componentConnector.wrapCallback(node, 'recipe');
      callback(componentConnector.createEvent('recipes', { id: 1 }));
      expect(node.recipe).to.deep.equal({ value: { id: 1 } });
    });

    it('should fall back to an attribute when the node has no such property', () => {
      const callback = componentConnector.wrapCallback(node, 'data-recipe');
      callback({ type: 'recipes', detail: 'beef' });
      expect(node.getAttribute('data-recipe')).to.equal('beef');
    });

    it('should call the node method when the binding names one', () => {
      const spy = sandbox.spy();
      node.onRecipe = spy;
      const callback = componentConnector.wrapCallback(node, 'onRecipe');
      callback({ type: 'recipes', detail: { id: 2 } });
      expect(spy.calledOnceWith({ id: 2 })).to.be.true;
    });
  });

  describe('#createEvent', () => {
    it('should build an event carrying the value in its detail', () => {
      const event = componentConnector.createEvent('recipes', { id: 1 });
      expect(event).to.be.instanceOf(Event);
      expect(event.type).to.equal('recipes');
      expect(event.detail).to.deep.equal({ value: { id: 1 } });
    });
  });

  describe('#_wrapEvent', () => {
    let channel;

    beforeEach(() => {
      channel = componentConnector.getChannel('recipes');
      document.body.appendChild(node);
    });

    afterEach(() => {
      node.remove();
    });

    function dispatch(detail = {}) {
      node.dispatchEvent(new CustomEvent('picked', { detail }));
    }

    it('should describe the publication it wraps', () => {
      const wrapped = componentConnector._wrapEvent(node, 'picked', channel, undefined);
      expect(wrapped.node).to.equal(node);
      expect(wrapped.eventName).to.equal('picked');
      expect(wrapped.channelName).to.equal('recipes');
    });

    it('should announce every publication on the AFTER_PUBLISH event', () => {
      const listener = sandbox.spy();
      eventManager.on(externalEventsCodes.AFTER_PUBLISH, listener);
      componentConnector._wrapEvent(node, 'picked', channel, undefined);

      dispatch({ id: 1 });

      expect(listener.calledOnce).to.be.true;
      eventManager.off(externalEventsCodes.AFTER_PUBLISH, listener);
    });

    it('should ignore an event that only bubbled through the node', () => {
      const received = [];
      channel.subscribe(evt => received.push(evt));
      componentConnector._wrapEvent(node, 'picked', channel, undefined);
      sandbox.stub(componentConnector.adapter, 'isEventAtTarget').returns(false);

      dispatch({ id: 1 });

      expect(received).to.be.empty;
    });

    it('should ask for a navigation when the connection declares a link', () => {
      const listener = sandbox.spy();
      eventManager.on(externalEventsCodes.NAV_REQUEST, listener);
      componentConnector._wrapEvent(node, 'picked', channel, { link: { page: 'recipe' } });

      dispatch({ id: 1 });

      expect(listener.calledOnce).to.be.true;
      expect(listener.firstCall.args[0].detail).to.deep.equal({ page: 'recipe' });
      eventManager.off(externalEventsCodes.NAV_REQUEST, listener);
    });

    it('should take the target page out of the event when the link binds it', () => {
      const listener = sandbox.spy();
      eventManager.on(externalEventsCodes.NAV_REQUEST, listener);
      componentConnector._wrapEvent(node, 'picked', channel, {
        link: { page: { bind: 'target' } },
      });

      dispatch({ target: 'recipe' });

      expect(listener.firstCall.args[0].detail.page).to.equal('recipe');
      eventManager.off(externalEventsCodes.NAV_REQUEST, listener);
    });

    it('should take cleanUntil out of the event when the link binds it', () => {
      const listener = sandbox.spy();
      eventManager.on(externalEventsCodes.NAV_REQUEST, listener);
      componentConnector._wrapEvent(node, 'picked', channel, {
        link: { page: 'recipe', cleanUntil: { bind: 'until' } },
      });

      dispatch({ until: 'home' });

      expect(listener.firstCall.args[0].detail.cleanUntil).to.equal('home');
      eventManager.off(externalEventsCodes.NAV_REQUEST, listener);
    });

    it('should ask for a back step when the connection declares one', () => {
      const listener = sandbox.spy();
      eventManager.on(externalEventsCodes.ROUTER_BACKSTEP, listener);
      componentConnector._wrapEvent(node, 'picked', channel, { backStep: true });

      dispatch();

      expect(listener.calledOnce).to.be.true;
      eventManager.off(externalEventsCodes.ROUTER_BACKSTEP, listener);
    });

    it('should emit the analytics payload when the connection declares one', () => {
      const listener = sandbox.spy();
      eventManager.on(externalEventsCodes.TRACK_EVENT, listener);
      componentConnector._wrapEvent(node, 'picked', channel, { analytics: { name: 'picked' } });

      dispatch();

      expect(listener.firstCall.args[0].detail).to.deep.equal({ name: 'picked' });
      eventManager.off(externalEventsCodes.TRACK_EVENT, listener);
    });

    it('should emit the log payload when the connection declares one', () => {
      const listener = sandbox.spy();
      eventManager.on(externalEventsCodes.LOG_EVENT, listener);
      componentConnector._wrapEvent(node, 'picked', channel, { log: { level: 'info' } });

      dispatch();

      expect(listener.firstCall.args[0].detail).to.deep.equal({ level: 'info' });
      eventManager.off(externalEventsCodes.LOG_EVENT, listener);
    });
  });

  describe('#unsubscribe', () => {
    it('should do nothing without a channel list', () => {
      expect(() => componentConnector.unsubscribe(undefined, node)).to.not.throw();
    });

    it('should do nothing without a node', () => {
      expect(() => componentConnector.unsubscribe('recipes', undefined)).to.not.throw();
    });

    it('should do nothing for a node it never registered', () => {
      expect(() => componentConnector.unsubscribe('recipes', node)).to.not.throw();
    });

    it('should stop delivering values for the named channel', () => {
      node.recipe = 'initial';
      componentConnector.addSubscription('recipes', node, 'recipe');

      componentConnector.unsubscribe('recipes', node);
      componentConnector.publish('recipes', { id: 9 });

      expect(node.recipe).to.equal('initial');
      expect(componentConnector.getSubscriptor(node).subscriptions).to.be.empty;
    });

    it('should accept a list of channels', () => {
      componentConnector.addSubscription('recipes', node, 'recipe');
      componentConnector.addSubscription('categories', node, 'category');

      componentConnector.unsubscribe(['recipes', 'categories'], node);

      expect(componentConnector.getSubscriptor(node).subscriptions).to.be.empty;
    });

    it('should leave the channels it was not asked about alone', () => {
      componentConnector.addSubscription('recipes', node, 'recipe');
      componentConnector.addSubscription('categories', node, 'category');

      componentConnector.unsubscribe('recipes', node);

      const remaining = componentConnector.getSubscriptor(node).subscriptions;
      expect(remaining).to.have.lengthOf(1);
      expect(remaining[0].channel.name).to.equal('categories');
    });
  });

  describe('#unregisterComponent', () => {
    it('should do nothing without a node', () => {
      expect(() => componentConnector.unregisterComponent(undefined, true)).to.not.throw();
    });

    it('should do nothing for a node it never registered', () => {
      expect(() => componentConnector.unregisterComponent(node, true)).to.not.throw();
    });

    it('should drop the subscriptor of the node', () => {
      componentConnector.addSubscription('recipes', node, 'recipe');
      componentConnector.unregisterComponent(node, true);
      expect(componentConnector.subscriptors.has(node)).to.be.false;
    });

    it('should stop delivering values to the node', () => {
      node.recipe = 'initial';
      componentConnector.addSubscription('recipes', node, 'recipe');

      componentConnector.unregisterComponent(node, true);
      componentConnector.publish('recipes', { id: 9 });

      expect(node.recipe).to.equal('initial');
    });

    it('should keep the private channels alive when asked not to clean them', () => {
      const name = `${BRIDGE_CHANNEL_PREFIX}_app`;
      node.app = 'initial';
      componentConnector.addSubscription(name, node, 'app');

      componentConnector.unregisterComponent(node, false);
      componentConnector.getChannel(name).next(componentConnector.createEvent(name, { a: 1 }));

      expect(node.app).to.deep.equal({ value: { a: 1 } });
    });
  });

  describe('#unregisterAllSubscriptors', () => {
    it('should empty the subscriptor map', () => {
      const other = document.createElement('div');
      componentConnector.addSubscription('recipes', node, 'recipe');
      componentConnector.addSubscription('recipes', other, 'recipe');

      componentConnector.unregisterAllSubscriptors(true);

      expect(componentConnector.subscriptors.size).to.equal(0);
    });

    it('should stop delivering values to every node', () => {
      node.recipe = 'initial';
      componentConnector.addSubscription('recipes', node, 'recipe');

      componentConnector.unregisterAllSubscriptors(true);
      componentConnector.publish('recipes', { id: 9 });

      expect(node.recipe).to.equal('initial');
    });
  });
});
