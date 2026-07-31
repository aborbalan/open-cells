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
import { PostMessageManager } from '../../src/manager/post-message.js';
import { BridgeChannelManager } from '../../src/manager/bridge-channels.js';
import { ComponentConnector } from '../../src/component-connector.js';
import { BRIDGE_CHANNEL_PREFIX } from '../../src/constants.js';

const P = BRIDGE_CHANNEL_PREFIX;
const ORIGIN = 'https://parent.example';

describe('PostMessageManager', () => {
  let componentConnector;
  let bridgeChannelManager;
  let sandbox;
  let postMessage;

  function makeBridge(postMessageTargetOrigin) {
    componentConnector = new ComponentConnector(P);
    bridgeChannelManager = new BridgeChannelManager({
      ComponentConnector: componentConnector,
      channelPrefix: P,
    });
    return {
      ComponentConnector: componentConnector,
      BridgeChannelManager: bridgeChannelManager,
      channelPrefix: P,
      postMessageTargetOrigin,
    };
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    postMessage = sandbox.stub(window.parent, 'postMessage');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#constructor', () => {
    it('should stay disabled when no target origin is configured', () => {
      const manager = new PostMessageManager(makeBridge(undefined));
      expect(manager.enabled).to.be.false;
      expect(manager.postMessageTargetOrigin).to.equal('');
    });

    it('should refuse the wildcard origin and say why', () => {
      const warn = sandbox.stub(console, 'warn');

      const manager = new PostMessageManager(makeBridge('*'));

      expect(manager.enabled).to.be.false;
      expect(warn.calledOnce).to.be.true;
      expect(warn.firstCall.args[0]).to.contain("can't be the wildcard");
    });

    it('should enable itself for a concrete origin', () => {
      const manager = new PostMessageManager(makeBridge(ORIGIN));
      expect(manager.enabled).to.be.true;
      expect(manager.postMessageTargetOrigin).to.equal(ORIGIN);
    });

    it('should keep hold of the connector, the channel manager and the prefix', () => {
      const manager = new PostMessageManager(makeBridge(ORIGIN));
      expect(manager.componentConnector).to.equal(componentConnector);
      expect(manager.bridgeChannelManager).to.equal(bridgeChannelManager);
      expect(manager.channelPrefix).to.equal(P);
    });
  });

  describe('#setupPostMessages', () => {
    it('should do nothing at all while disabled', () => {
      const manager = new PostMessageManager(makeBridge(undefined));

      manager.setupPostMessages();

      expect(postMessage.called).to.be.false;
    });

    it('should tell the parent window that it is ready', () => {
      const manager = new PostMessageManager(makeBridge(ORIGIN));

      manager.setupPostMessages();

      expect(postMessage.calledOnce).to.be.true;
      expect(postMessage.firstCall.args[0]).to.deep.equal({
        eventName: `${P}-ready`,
        eventDetail: undefined,
      });
      expect(postMessage.firstCall.args[1]).to.equal(ORIGIN);
    });

    it('should republish an incoming message onto its post-message channel', async () => {
      const manager = new PostMessageManager(makeBridge(ORIGIN));
      manager.setupPostMessages();

      const received = [];
      bridgeChannelManager.getPostMessageChannel('user-ready').subscribe(evt => received.push(evt));

      window.postMessage({ event: 'user-ready', detail: { id: 7 } }, '*');
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(received).to.have.lengthOf(1);
      expect(received[0].type).to.equal('user-ready');
      expect(received[0].detail).to.deep.equal({ value: { id: 7 } });
    });

    it('should ignore an incoming message that names no event', async () => {
      const manager = new PostMessageManager(makeBridge(ORIGIN));
      manager.setupPostMessages();
      const create = sandbox.spy(componentConnector, 'createEvent');

      window.postMessage({ detail: 'nameless' }, '*');
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(create.called).to.be.false;
    });

    it('should forward what the application publishes on the send channel', () => {
      const manager = new PostMessageManager(makeBridge(ORIGIN));
      manager.setupPostMessages();
      postMessage.resetHistory();

      componentConnector.publish(`${P}_ch_send_post_message`, {
        event: 'checkout',
        detail: { total: 10 },
      });

      expect(postMessage.calledOnce).to.be.true;
      expect(postMessage.firstCall.args[0]).to.deep.equal({
        eventName: 'checkout',
        eventDetail: { total: 10 },
      });
      expect(postMessage.firstCall.args[1]).to.equal(ORIGIN);
    });
  });

  describe('#_sendPostMessage', () => {
    it('should send the event name and detail to the parent window', () => {
      const manager = new PostMessageManager(makeBridge(ORIGIN));

      manager._sendPostMessage({ event: 'ping', detail: { a: 1 } });

      expect(
        postMessage.calledOnceWith({ eventName: 'ping', eventDetail: { a: 1 } }, ORIGIN),
      ).to.be.true;
    });
  });
});
