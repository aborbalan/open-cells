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
import { EventEmitter, once as onceAsync } from '../../src/external/event-emitter.js';

describe('EventEmitter', () => {
  let emitter;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    emitter = new EventEmitter();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#emit / #on', () => {
    it('should call the listener when the event is emitted', () => {
      const listener = sandbox.spy();
      emitter.on('ping', listener);

      expect(emitter.emit('ping')).to.be.true;
      expect(listener.calledOnce).to.be.true;
    });

    it('should report false when nobody is listening', () => {
      expect(emitter.emit('ping')).to.be.false;
    });

    it('should pass every argument through', () => {
      const listener = sandbox.spy();
      emitter.on('ping', listener);

      emitter.emit('ping', 1, 'two', { three: true });

      expect(listener.calledOnceWith(1, 'two', { three: true })).to.be.true;
    });

    it('should call the listeners in the order they were added', () => {
      const order = [];
      emitter.on('ping', () => order.push('first'));
      emitter.on('ping', () => order.push('second'));

      emitter.emit('ping');

      expect(order).to.deep.equal(['first', 'second']);
    });

    it('should call the same listener again on a second emit', () => {
      const listener = sandbox.spy();
      emitter.on('ping', listener);

      emitter.emit('ping');
      emitter.emit('ping');

      expect(listener.calledTwice).to.be.true;
    });

    it('should keep the events apart', () => {
      const ping = sandbox.spy();
      const pong = sandbox.spy();
      emitter.on('ping', ping);
      emitter.on('pong', pong);

      emitter.emit('ping');

      expect(ping.calledOnce).to.be.true;
      expect(pong.called).to.be.false;
    });

    it('should announce a new listener before adding it', () => {
      const added = [];
      emitter.on('newListener', type => added.push(type));

      emitter.on('ping', () => {});

      expect(added).to.deep.equal(['ping']);
    });

    it('should refuse a listener that is not a function', () => {
      expect(() => emitter.on('ping', 'not a function')).to.throw(TypeError);
    });
  });

  describe('#once', () => {
    it('should call the listener only for the first emit', () => {
      const listener = sandbox.spy();
      emitter.once('ping', listener);

      emitter.emit('ping');
      emitter.emit('ping');

      expect(listener.calledOnce).to.be.true;
    });

    it('should pass the arguments through', () => {
      const listener = sandbox.spy();
      emitter.once('ping', listener);

      emitter.emit('ping', 'payload');

      expect(listener.calledOnceWith('payload')).to.be.true;
    });

    it('should leave no listener behind', () => {
      emitter.once('ping', () => {});
      emitter.emit('ping');
      expect(emitter.listenerCount('ping')).to.equal(0);
    });

    it('should refuse a listener that is not a function', () => {
      expect(() => emitter.once('ping', null)).to.throw(TypeError);
    });
  });

  describe('#prependListener / #prependOnceListener', () => {
    it('should put the listener at the front of the queue', () => {
      const order = [];
      emitter.on('ping', () => order.push('existing'));
      emitter.prependListener('ping', () => order.push('prepended'));

      emitter.emit('ping');

      expect(order).to.deep.equal(['prepended', 'existing']);
    });

    it('should put a one-shot listener at the front of the queue', () => {
      const order = [];
      emitter.on('ping', () => order.push('existing'));
      emitter.prependOnceListener('ping', () => order.push('prepended'));

      emitter.emit('ping');
      emitter.emit('ping');

      expect(order).to.deep.equal(['prepended', 'existing', 'existing']);
    });

    it('should refuse a listener that is not a function', () => {
      expect(() => emitter.prependOnceListener('ping', 42)).to.throw(TypeError);
    });
  });

  describe('#removeListener / #off', () => {
    it('should stop calling a removed listener', () => {
      const listener = sandbox.spy();
      emitter.on('ping', listener);

      emitter.removeListener('ping', listener);
      emitter.emit('ping');

      expect(listener.called).to.be.false;
    });

    it('should be reachable as off', () => {
      const listener = sandbox.spy();
      emitter.on('ping', listener);

      emitter.off('ping', listener);
      emitter.emit('ping');

      expect(listener.called).to.be.false;
    });

    it('should only remove the listener it was given', () => {
      const kept = sandbox.spy();
      const removed = sandbox.spy();
      emitter.on('ping', kept);
      emitter.on('ping', removed);

      emitter.removeListener('ping', removed);
      emitter.emit('ping');

      expect(kept.calledOnce).to.be.true;
      expect(removed.called).to.be.false;
    });

    it('should remove a once listener before it has fired', () => {
      const listener = sandbox.spy();
      emitter.once('ping', listener);

      emitter.removeListener('ping', listener);
      emitter.emit('ping');

      expect(listener.called).to.be.false;
    });

    it('should do nothing for an event with no listeners', () => {
      expect(() => emitter.removeListener('ping', () => {})).to.not.throw();
    });

    it('should do nothing for a listener that was never added', () => {
      emitter.on('ping', () => {});
      expect(() => emitter.removeListener('ping', () => {})).to.not.throw();
      expect(emitter.listenerCount('ping')).to.equal(1);
    });

    it('should announce the removal', () => {
      const removed = [];
      const listener = () => {};
      emitter.on('ping', listener);
      emitter.on('removeListener', type => removed.push(type));

      emitter.removeListener('ping', listener);

      expect(removed).to.deep.equal(['ping']);
    });

    it('should refuse a listener that is not a function', () => {
      expect(() => emitter.removeListener('ping', 'nope')).to.throw(TypeError);
    });
  });

  describe('#removeAllListeners', () => {
    it('should clear the listeners of one event', () => {
      const ping = sandbox.spy();
      const pong = sandbox.spy();
      emitter.on('ping', ping);
      emitter.on('pong', pong);

      emitter.removeAllListeners('ping');
      emitter.emit('ping');
      emitter.emit('pong');

      expect(ping.called).to.be.false;
      expect(pong.calledOnce).to.be.true;
    });

    it('should clear every listener when given no event', () => {
      const ping = sandbox.spy();
      const pong = sandbox.spy();
      emitter.on('ping', ping);
      emitter.on('pong', pong);

      emitter.removeAllListeners();
      emitter.emit('ping');
      emitter.emit('pong');

      expect(ping.called).to.be.false;
      expect(pong.called).to.be.false;
    });

    it('should do nothing on an emitter with no listeners', () => {
      expect(() => emitter.removeAllListeners()).to.not.throw();
    });

    it('should do nothing for an event with no listeners', () => {
      emitter.on('ping', () => {});
      expect(() => emitter.removeAllListeners('pong')).to.not.throw();
      expect(emitter.listenerCount('ping')).to.equal(1);
    });
  });

  describe('#listenerCount / #listeners / #rawListeners / #eventNames', () => {
    it('should count nothing on a fresh emitter', () => {
      expect(emitter.listenerCount('ping')).to.equal(0);
      expect(emitter.listeners('ping')).to.deep.equal([]);
      expect(emitter.eventNames()).to.deep.equal([]);
    });

    it('should count the listeners of an event', () => {
      emitter.on('ping', () => {});
      emitter.on('ping', () => {});
      expect(emitter.listenerCount('ping')).to.equal(2);
    });

    it('should list the listeners of an event', () => {
      const listener = () => {};
      emitter.on('ping', listener);
      expect(emitter.listeners('ping')).to.deep.equal([listener]);
    });

    it('should unwrap a once listener when listing', () => {
      const listener = () => {};
      emitter.once('ping', listener);
      expect(emitter.listeners('ping')).to.deep.equal([listener]);
    });

    it('should keep the wrapper when listing raw listeners', () => {
      const listener = () => {};
      emitter.once('ping', listener);
      const raw = emitter.rawListeners('ping');
      expect(raw).to.have.lengthOf(1);
      expect(raw[0]).to.not.equal(listener);
      expect(raw[0].listener).to.equal(listener);
    });

    it('should return an empty list of raw listeners for an unknown event', () => {
      expect(emitter.rawListeners('ping')).to.deep.equal([]);
    });

    it('should name the events it has listeners for', () => {
      emitter.on('ping', () => {});
      emitter.on('pong', () => {});
      expect(emitter.eventNames()).to.deep.equal(['ping', 'pong']);
    });

    it('should count listeners through the static helper', () => {
      emitter.on('ping', () => {});
      expect(EventEmitter.listenerCount(emitter, 'ping')).to.equal(1);
    });
  });

  describe('max listeners', () => {
    it('should start at the default', () => {
      expect(emitter.getMaxListeners()).to.equal(EventEmitter.defaultMaxListeners);
    });

    it('should round-trip a new limit', () => {
      emitter.setMaxListeners(42);
      expect(emitter.getMaxListeners()).to.equal(42);
    });

    it('should refuse a negative limit', () => {
      expect(() => emitter.setMaxListeners(-1)).to.throw(RangeError);
    });

    it('should refuse a limit that is not a number', () => {
      expect(() => emitter.setMaxListeners('many')).to.throw(RangeError);
    });

    it('should warn once the limit is passed', () => {
      const warn = sandbox.stub(console, 'warn');
      emitter.setMaxListeners(1);

      emitter.on('ping', () => {});
      emitter.on('ping', () => {});

      expect(warn.calledOnce).to.be.true;
      expect(String(warn.firstCall.args[0])).to.contain('MaxListenersExceededWarning');
    });

    it('should not warn when the limit is zero', () => {
      const warn = sandbox.stub(console, 'warn');
      emitter.setMaxListeners(0);

      for (let i = 0; i < 20; i++) {
        emitter.on('ping', () => {});
      }

      expect(warn.called).to.be.false;
    });
  });

  describe("the 'error' event", () => {
    it('should deliver it to a listener like any other event', () => {
      const listener = sandbox.spy();
      const error = new Error('boom');
      emitter.on('error', listener);

      emitter.emit('error', error);

      expect(listener.calledOnceWith(error)).to.be.true;
    });

    it('should throw the emitted error when nobody is listening', () => {
      const error = new Error('boom');
      expect(() => emitter.emit('error', error)).to.throw(error);
    });

    it('should throw a wrapper when the emitted value is not an error', () => {
      expect(() => emitter.emit('error', 'just a string')).to.throw();
    });

    it('should throw when emitting error with no argument at all', () => {
      expect(() => emitter.emit('error')).to.throw();
    });
  });

  describe('the once() helper', () => {
    it('should resolve with the arguments of the next emit', async () => {
      const pending = onceAsync(emitter, 'ping');
      emitter.emit('ping', 'payload', 2);
      expect(await pending).to.deep.equal(['payload', 2]);
    });

    it('should reject when the emitter errors first', async () => {
      const error = new Error('boom');
      const pending = onceAsync(emitter, 'ping');
      emitter.emit('error', error);

      let caught;
      try {
        await pending;
      } catch (err) {
        caught = err;
      }
      expect(caught).to.equal(error);
    });

    it('should work with a DOM EventTarget', async () => {
      const target = document.createElement('div');
      const pending = onceAsync(target, 'custom-thing');
      target.dispatchEvent(new CustomEvent('custom-thing'));
      await pending;
    });

    it('should refuse something that is neither an emitter nor a target', async () => {
      let caught;
      try {
        await onceAsync({}, 'ping');
      } catch (err) {
        caught = err;
      }
      expect(caught).to.be.instanceOf(TypeError);
    });
  });

  describe('inheritance', () => {
    it('should work as a base class', () => {
      class Custom extends EventEmitter {}
      const custom = new Custom();
      const listener = sandbox.spy();

      custom.on('ping', listener);
      custom.emit('ping');

      expect(listener.calledOnce).to.be.true;
    });

    it('should give each instance its own listeners', () => {
      const other = new EventEmitter();
      const listener = sandbox.spy();
      emitter.on('ping', listener);

      other.emit('ping');

      expect(listener.called).to.be.false;
    });

    it('should expose itself as EventEmitter.EventEmitter', () => {
      expect(EventEmitter.EventEmitter).to.equal(EventEmitter);
    });
  });
});
