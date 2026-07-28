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
import { Subscriptor } from '../../src/state/subscriptor.js';
import { Channel } from '../../src/state/channel.js';
import { Subscription } from 'rxjs';
import { BRIDGE_CHANNEL_PREFIX } from '../../src/constants.js';

describe('Subscriptor', () => {
  let subscriptor;
  let node;
  let channel;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    node = document.createElement('div');
    channel = new Channel('recipes');
    subscriptor = new Subscriptor(node, BRIDGE_CHANNEL_PREFIX);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#constructor', () => {
    it('should start with no subscriptions and no channel data', () => {
      expect(subscriptor.node).to.equal(node);
      expect(subscriptor.subscriptions).to.be.an('array').that.is.empty;
      expect(subscriptor.publications).to.be.an.instanceof(Subscription);
      expect(subscriptor.nodeChannelData).to.be.an('object').that.is.empty;
      expect(subscriptor.channelPrefix).to.equal(BRIDGE_CHANNEL_PREFIX);
    });
  });

  describe('#hasSubscription', () => {
    it('should be false for a channel it never subscribed to', () => {
      expect(subscriptor.hasSubscription(channel)).to.be.false;
    });

    it('should be true once subscribed', () => {
      subscriptor.subscribe(channel, () => {}, true, 'recipe');
      expect(subscriptor.hasSubscription(channel)).to.be.true;
    });

    it('should tell two channels apart', () => {
      subscriptor.subscribe(channel, () => {}, true, 'recipe');
      expect(subscriptor.hasSubscription(new Channel('other'))).to.be.false;
    });
  });

  describe('#publish', () => {
    it('should keep the publication so it can be torn down later', () => {
      const publication = new Subscription();
      subscriptor.publish(publication);

      subscriptor.publications.unsubscribe();

      expect(publication.closed).to.be.true;
    });
  });

  describe('#subscribe', () => {
    it('should deliver the values of the channel to the callback', () => {
      const received = [];
      subscriptor.subscribe(channel, value => received.push(value), true, 'recipe');

      channel.next({ detail: { id: 1 } });

      expect(received).to.have.lengthOf(1);
    });

    it('should record what it subscribed to', () => {
      subscriptor.subscribe(channel, () => {}, true, 'recipe');

      expect(subscriptor.subscriptions).to.have.lengthOf(1);
      expect(subscriptor.subscriptions[0].channel).to.equal(channel);
      expect(subscriptor.subscriptions[0].bind).to.equal('recipe');
      expect(subscriptor.subscriptions[0].node).to.equal(node);
    });

    it('should refuse a second subscription to the same channel', () => {
      subscriptor.subscribe(channel, () => {}, true, 'recipe');
      subscriptor.subscribe(channel, () => {}, true, 'other');

      expect(subscriptor.subscriptions).to.have.lengthOf(1);
    });

    it('should replay the last value to a late subscriber asking for it', () => {
      channel.next({ detail: 'buffered' });
      const received = [];

      subscriptor.subscribe(channel, value => received.push(value), true, 'recipe');

      expect(received).to.have.lengthOf(1);
    });
  });

  describe('replay suppression', () => {
    it('should not hand a late subscriber a value it has already seen', () => {
      channel.next({ detail: 'first' });
      const received = [];
      subscriptor.subscribe(channel, value => received.push(value), false, 'recipe');
      const afterFirst = received.length;

      // Same buffered value, a second subscriptor pass must not repeat it.
      subscriptor.nodeChannelData[channel.name].id = subscriptor.getIdFromChannel(channel);
      const callback = subscriptor.makeCallbackWithNoReplay(channel, value => received.push(value));
      callback();

      expect(received).to.have.lengthOf(afterFirst);
    });

    it('should hand over a value that is newer than the one it saw', () => {
      const received = [];
      subscriptor.subscribe(channel, value => received.push(value), false, 'recipe');

      channel.next({ detail: 'first' });
      channel.next({ detail: 'second' });

      expect(received).to.have.lengthOf(2);
    });
  });

  describe('channel bookkeeping', () => {
    it('should report the time of the buffered value', () => {
      channel.next({ detail: 'buffered' });
      expect(subscriptor.getTimeFromChannel(channel)).to.equal(channel.buffer[0].time);
    });

    it('should report a time of one for an empty channel', () => {
      expect(subscriptor.getTimeFromChannel(channel)).to.equal(1);
    });

    it('should report the id of the buffered value', () => {
      channel.next({ detail: 'buffered' });
      expect(subscriptor.getIdFromChannel(channel)).to.equal(channel.buffer[0].uuid);
    });

    it('should report no id for an empty channel', () => {
      expect(subscriptor.getIdFromChannel(channel)).to.be.null;
    });

    it('should round-trip the time it has seen for a channel', () => {
      subscriptor.nodeChannelData[channel.name] = { interval: null, id: null };
      subscriptor.setTimeForNode(channel.name, 1234);
      expect(subscriptor.getTimeFromNode(channel.name)).to.equal(1234);
    });

    it('should round-trip the id it has seen for a channel', () => {
      subscriptor.nodeChannelData[channel.name] = { interval: null, id: null };
      subscriptor.setIdForNode(channel.name, 'abc');
      expect(subscriptor.getIdFromNode(channel.name)).to.equal('abc');
    });
  });

  describe('#unsubscribe', () => {
    it('should tear down every subscription when asked to clean everything', () => {
      const received = [];
      subscriptor.subscribe(channel, value => received.push(value), true, 'recipe');

      subscriptor.unsubscribe(true);
      channel.next({ detail: 'after' });

      expect(received).to.be.empty;
    });

    it('should leave the private channels connected when asked to keep them', () => {
      const privateChannel = new Channel(`${BRIDGE_CHANNEL_PREFIX}_page_home`);
      const received = [];
      subscriptor.subscribe(privateChannel, value => received.push(value), true, 'status');

      subscriptor.unsubscribe(false);
      privateChannel.next({ detail: 'after' });

      expect(received).to.have.lengthOf(1);
    });

    it('should tear down an application channel even when keeping the private ones', () => {
      const received = [];
      subscriptor.subscribe(channel, value => received.push(value), true, 'recipe');

      subscriptor.unsubscribe(false);
      channel.next({ detail: 'after' });

      expect(received).to.be.empty;
    });

    it('should tear down the publications too', () => {
      const publication = new Subscription();
      subscriptor.publish(publication);

      subscriptor.unsubscribe(true);

      expect(publication.closed).to.be.true;
    });
  });

  describe('#_firstInstanceOfObserver', () => {
    it('should report -1 when the node is not observing the channel', () => {
      expect(subscriptor._firstInstanceOfObserver(node, channel)).to.equal(-1);
    });

    it('should report the position of an existing observation', () => {
      subscriptor.subscribe(channel, () => {}, true, 'recipe');
      expect(subscriptor._firstInstanceOfObserver(node, channel)).to.equal(0);
    });
  });
});
