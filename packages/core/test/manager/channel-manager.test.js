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
import { ChannelManager } from '../../src/manager/channel-manager.js';
import { Channel } from '../../src/state/channel.js';

describe('ChannelManager', () => {
  let channelManager;

  beforeEach(() => {
    channelManager = new ChannelManager();
  });

  describe('#constructor', () => {
    it('should start with no channels', () => {
      expect(channelManager.channels).to.deep.equal({});
    });
  });

  describe('#get', () => {
    it('should create a channel the first time it is asked for', () => {
      const channel = channelManager.get('recipes');
      expect(channel).to.be.instanceOf(Channel);
      expect(channel.name).to.equal('recipes');
    });

    it('should return the same channel on every later call', () => {
      const channel = channelManager.get('recipes');
      expect(channelManager.get('recipes')).to.equal(channel);
    });
  });

  describe('#getUnsafe', () => {
    it('should return nothing for a channel that does not exist', () => {
      expect(channelManager.getUnsafe('recipes')).to.be.undefined;
    });

    it('should return an existing channel without creating one', () => {
      const channel = channelManager.get('recipes');
      expect(channelManager.getUnsafe('recipes')).to.equal(channel);
    });
  });

  describe('#create', () => {
    it('should create and register a channel', () => {
      const channel = channelManager.create('recipes');
      expect(channelManager.getUnsafe('recipes')).to.equal(channel);
    });

    it('should replace an existing channel of the same name', () => {
      const first = channelManager.create('recipes');
      const second = channelManager.create('recipes');
      expect(second).to.not.equal(first);
      expect(channelManager.getUnsafe('recipes')).to.equal(second);
    });
  });

  describe('#has', () => {
    it('should be false for a channel that was never created', () => {
      expect(channelManager.has('recipes')).to.be.false;
    });

    it('should be true once the channel exists', () => {
      channelManager.get('recipes');
      expect(channelManager.has('recipes')).to.be.true;
    });
  });

  describe('#remove', () => {
    it('should drop a channel', () => {
      channelManager.get('recipes');
      channelManager.remove('recipes');
      expect(channelManager.has('recipes')).to.be.false;
    });

    it('should do nothing for a channel it does not hold', () => {
      expect(() => channelManager.remove('nowhere')).to.not.throw();
    });
  });

  describe('#getChannels / #setChannels', () => {
    it('should expose the channels it holds', () => {
      channelManager.get('recipes');
      expect(Object.keys(channelManager.getChannels())).to.deep.equal(['recipes']);
    });

    it('should let the whole collection be replaced', () => {
      const channels = { shared: new Channel('shared') };
      channelManager.setChannels(channels);
      expect(channelManager.getChannels()).to.equal(channels);
      expect(channelManager.has('shared')).to.be.true;
    });
  });

  describe('#cleanAllChannels', () => {
    it('should empty the buffer of every channel without dropping them', () => {
      const recipes = channelManager.get('recipes');
      const categories = channelManager.get('categories');
      recipes.next({ detail: 'a' });
      categories.next({ detail: 'b' });

      channelManager.cleanAllChannels();

      expect(recipes.buffer).to.be.empty;
      expect(categories.buffer).to.be.empty;
      expect(channelManager.has('recipes')).to.be.true;
    });
  });

  describe('#removeAllChannels', () => {
    it('should drop every channel', () => {
      channelManager.get('recipes');
      channelManager.get('categories');

      channelManager.removeAllChannels();

      expect(channelManager.getChannels()).to.deep.equal({});
    });
  });
});
