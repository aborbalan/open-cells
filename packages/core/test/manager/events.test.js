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
import { eventManager } from '../../src/manager/events.js';

describe('CustomEventEmitter', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#listenToOnce', () => {
    it('should call back when the event fires on the node', () => {
      const node = document.createElement('div');
      const callback = sandbox.spy();
      eventManager.listenToOnce(node, 'testEvent', callback);

      node.dispatchEvent(new Event('testEvent'));

      expect(callback.calledOnce).to.be.true;
    });

    it('should stop listening after the first time', () => {
      const node = document.createElement('div');
      const callback = sandbox.spy();
      eventManager.listenToOnce(node, 'testEvent', callback);

      node.dispatchEvent(new Event('testEvent'));
      node.dispatchEvent(new Event('testEvent'));

      expect(callback.calledOnce).to.be.true;
    });

    it('should take the listener off the node itself', () => {
      const node = { addEventListener: sandbox.stub(), removeEventListener: sandbox.stub() };
      const callback = sandbox.spy();
      eventManager.listenToOnce(node, 'testEvent', callback);

      const registered = node.addEventListener.firstCall.args[1];
      registered({ currentTarget: node, type: 'testEvent' });

      expect(node.removeEventListener.calledOnceWith('testEvent', registered)).to.be.true;
    });

    it('should keep listening on other events', () => {
      const node = document.createElement('div');
      const callback = sandbox.spy();
      eventManager.listenToOnce(node, 'testEvent', callback);

      node.dispatchEvent(new Event('otherEvent'));

      expect(callback.called).to.be.false;
    });
  });

  describe('#createEvent', () => {
    it('should build an event of the given type', () => {
      const event = eventManager.createEvent('testEvent', 'testValue');
      expect(event).to.be.instanceOf(Event);
      expect(event.type).to.equal('testEvent');
    });

    it('should wrap the value in the detail', () => {
      expect(eventManager.createEvent('testEvent', 'testValue').detail).to.deep.equal({
        value: 'testValue',
      });
    });

    it('should carry an object value through', () => {
      expect(eventManager.createEvent('testEvent', { id: 1 }).detail).to.deep.equal({
        value: { id: 1 },
      });
    });

    it('should carry a false value rather than dropping it', () => {
      expect(eventManager.createEvent('page-load', false).detail).to.deep.equal({ value: false });
    });
  });

  describe('the shared emitter', () => {
    it('should be raised above the default listener limit', () => {
      // Every bridge, template and page registers on this one emitter.
      expect(eventManager.getMaxListeners()).to.equal(20);
    });

    it('should deliver an emitted event to its listeners', () => {
      const listener = sandbox.spy();
      eventManager.on('a-test-event', listener);

      eventManager.emit('a-test-event', { id: 1 });

      expect(listener.calledOnceWith({ id: 1 })).to.be.true;
      eventManager.off('a-test-event', listener);
    });
  });
});
