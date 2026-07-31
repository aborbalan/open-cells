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
import { Channel, generateUUID, createChannel } from '../../src/state/channel.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Channel', () => {
  let channel;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    channel = new Channel('test');
  });

  afterEach(() => {
    sandbox.restore();
  });

  /** Collects everything the channel emits from now on. */
  function record(target = channel) {
    const received = [];
    target.subscribe(value => received.push(value));
    return received;
  }

  describe('#constructor', () => {
    it('should take its name', () => {
      expect(channel.name).to.equal('test');
    });

    it('should start with an empty buffer', () => {
      expect(channel.buffer).to.be.empty;
    });
  });

  describe('#next', () => {
    it('should deliver the value to its observers', () => {
      const received = record();
      const value = { detail: 'something' };

      channel.next(value);

      expect(received).to.deep.equal([value]);
    });

    it('should stamp a uuid on a value that has none', () => {
      const value = {};
      channel.next(value);
      expect(value.uuid).to.match(UUID_PATTERN);
    });

    it('should stamp the current time on a value that has none', () => {
      const before = Date.now();
      const value = {};

      channel.next(value);

      expect(value.time).to.be.a('number');
      expect(value.time).to.be.at.least(before);
    });

    it('should keep a uuid the value already carries', () => {
      const value = { uuid: 'given-uuid' };
      channel.next(value);
      expect(value.uuid).to.equal('given-uuid');
    });

    it('should keep a time the value already carries', () => {
      const value = { time: 1234 };
      channel.next(value);
      expect(value.time).to.equal(1234);
    });

    it('should replay only the last value to a late observer', () => {
      channel.next({ detail: 'first' });
      channel.next({ detail: 'second' });

      const received = record();

      expect(received).to.have.lengthOf(1);
      expect(received[0].detail).to.equal('second');
    });
  });

  describe('#hasObservers', () => {
    it('should be false while nobody is listening', () => {
      expect(channel.hasObservers()).to.be.false;
    });

    it('should be true once someone subscribes', () => {
      record();
      expect(channel.hasObservers()).to.be.true;
    });

    it('should throw once the channel has been closed', () => {
      channel.close();
      expect(() => channel.hasObservers()).to.throw();
    });
  });

  describe('#unsubscribe', () => {
    it('should stop delivering values to its observers', () => {
      const received = record();

      channel.unsubscribe();
      channel.next({ detail: 'after' });

      expect(received).to.be.empty;
    });

    it('should leave the channel usable, which is the point of overriding it', () => {
      record();
      channel.unsubscribe();

      const afterwards = record();
      channel.next({ detail: 'after' });

      expect(channel.closed).to.be.false;
      expect(afterwards).to.have.lengthOf(1);
      expect(afterwards[0].detail).to.equal('after');
    });

    it('should be reachable as unsubscribeAllObservers', () => {
      const received = record();

      channel.unsubscribeAllObservers();
      channel.next({ detail: 'after' });

      expect(received).to.be.empty;
      expect(channel.closed).to.be.false;
    });
  });

  describe('#close', () => {
    it('should stop delivering values', () => {
      const received = record();

      channel.close();

      expect(() => channel.next({ detail: 'after' })).to.throw();
      expect(received).to.be.empty;
    });

    it('should leave the channel closed, unlike unsubscribe', () => {
      channel.close();
      expect(channel.closed).to.be.true;
    });
  });

  describe('#clean', () => {
    it('should empty the buffer so a late observer gets nothing', () => {
      channel.next({ detail: 'buffered' });

      channel.clean();
      const received = record();

      expect(channel.buffer).to.be.empty;
      expect(received).to.be.empty;
    });

    it('should drop the existing observers', () => {
      const received = record();

      channel.clean();
      channel.next({ detail: 'after' });

      expect(received).to.be.empty;
    });

    it('should leave the channel usable', () => {
      channel.next({ detail: 'buffered' });
      channel.clean();

      const afterwards = record();
      channel.next({ detail: 'after' });

      expect(afterwards).to.have.lengthOf(1);
    });
  });

  describe('#buffer', () => {
    it('should expose what would be replayed', () => {
      channel.next({ detail: 'buffered' });
      expect(channel.buffer).to.have.lengthOf(1);
      expect(channel.buffer[0].detail).to.equal('buffered');
    });

    it('should be writable', () => {
      channel.buffer = [];
      expect(channel.buffer).to.be.empty;
    });
  });
});

describe('generateUUID', () => {
  it('should generate a version 4 UUID', () => {
    expect(generateUUID()).to.match(UUID_PATTERN);
  });

  it('should generate a different one every time', () => {
    expect(generateUUID()).to.not.equal(generateUUID());
  });
});

describe('createChannel', () => {
  it('should create a channel with the given name', () => {
    expect(createChannel('test').name).to.equal('test');
  });

  it('should create a Channel', () => {
    expect(createChannel('test')).to.be.instanceOf(Channel);
  });

  it('should create a new one on every call', () => {
    expect(createChannel('test')).to.not.equal(createChannel('test'));
  });
});
