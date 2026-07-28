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
import { Bridge } from '@open-cells/core';
import { eventManager } from '@open-cells/core/src/manager/events.js';
import { ElementController } from '../src/ElementController.js';

/** The smallest thing a ReactiveController host has to be. */
class TestHost extends HTMLElement {
  constructor() {
    super();
    this.controllers = [];
    this.updateCount = 0;
  }

  addController(controller) {
    this.controllers.push(controller);
  }

  requestUpdate() {
    this.updateCount++;
  }
}

class PlainHost extends TestHost {}

class InboundHost extends TestHost {
  static inbounds = { recipe: { channel: 'recipes' } };
}

class OutboundHost extends TestHost {
  static outbounds = { picked: { channel: 'picks' } };
}

class BothWaysHost extends TestHost {
  static inbounds = { recipe: { channel: 'recipes' } };
  static outbounds = { recipe: { channel: 'recipes' } };
}

class TransformingHost extends TestHost {
  static inbounds = {
    recipe: { channel: 'recipes', action: value => ({ ...value, seen: true }) },
  };
}

class QuietHost extends TestHost {
  static inbounds = { recipe: { channel: 'recipes', skipUpdate: true } };
}

let nextTag = 0;
/** Registers a fresh tag for a host class; the registry is global and append-only. */
function define(HostClass) {
  const tagName = `ec-host-${nextTag++}`;
  customElements.define(tagName, class extends HostClass {});
  return tagName;
}

const TAGS = {
  plain: define(PlainHost),
  inbound: define(InboundHost),
  outbound: define(OutboundHost),
  bothWays: define(BothWaysHost),
  transforming: define(TransformingHost),
  quiet: define(QuietHost),
};

describe('ElementController', () => {
  let bridge;
  let container;
  let sandbox;
  let host;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    container = document.createElement('div');
    const mainNode = document.createElement('div');
    mainNode.setAttribute('id', '__main_node__');
    container.appendChild(mainNode);
    document.body.appendChild(container);

    bridge = new Bridge({
      debug: true,
      mainNode: '__main_node__',
      // The bridge chains `.then()` onto whatever loadCellsPage() returns, and it goes
      // down that path for any page tag that is not registered — as `home-page` is not
      // here. A real route action dynamically imports the page, so it returns a promise.
      routes: { home: { path: '/', action: () => Promise.resolve() } },
    });
  });

  afterEach(() => {
    host?.remove();
    host = undefined;
    bridge.Router.destroy();
    bridge.ComponentConnector.unregisterAllSubscriptors(true);
    const channels = bridge.ComponentConnector.getChannels();
    Object.keys(channels).forEach(name => delete channels[name]);
    eventManager.removeAllListeners();
    sandbox.restore();
    container.remove();
    document.querySelectorAll('#cells-template-__cross').forEach(node => node.remove());
    window.location.hash = '';
  });

  /** Builds a host of the given kind with its controller attached. */
  function build(kind) {
    host = document.createElement(TAGS[kind]);
    document.body.appendChild(host);
    const controller = new ElementController(host);
    return { host, controller };
  }

  describe('#constructor', () => {
    it('should register itself as a controller of its host', () => {
      const { host: element, controller } = build('plain');
      expect(element.controllers).to.deep.equal([controller]);
      expect(controller.host).to.equal(element);
    });

    it('should graft the core API onto itself', () => {
      const { controller } = build('plain');
      expect(controller.subscribe).to.be.a('function');
      expect(controller.unsubscribe).to.be.a('function');
      expect(controller.publish).to.be.a('function');
      expect(controller.navigate).to.be.a('function');
    });

    it('should start with no subscriptions when the host declares no bindings', () => {
      const { controller } = build('plain');
      expect(controller.subscriptions).to.be.empty;
    });

    it('should subscribe on behalf of the host, not of itself', () => {
      const { host: element, controller } = build('inbound');
      controller.hostConnected();
      expect(bridge.ComponentConnector.subscriptors.has(element)).to.be.true;
      expect(bridge.ComponentConnector.subscriptors.has(controller)).to.be.false;
    });
  });

  describe('#_mergeBounds', () => {
    it('should return nothing for empty bindings', () => {
      const { controller } = build('plain');
      expect(Object.keys(controller._mergeBounds({}, {}))).to.be.empty;
    });

    it('should carry the inbound channel, skipUpdate and action', () => {
      const { controller } = build('plain');
      const action = () => {};
      const merged = controller._mergeBounds(
        { recipe: { channel: 'recipes', skipUpdate: true, action } },
        {},
      );
      expect(merged.recipe).to.deep.equal({ input: 'recipes', skipUpdate: true, action });
    });

    it('should carry the outbound channel', () => {
      const { controller } = build('plain');
      const merged = controller._mergeBounds({}, { picked: { channel: 'picks' } });
      expect(merged.picked).to.deep.equal({ output: 'picks' });
    });

    it('should merge both directions of the same property', () => {
      const { controller } = build('plain');
      const merged = controller._mergeBounds(
        { recipe: { channel: 'in' } },
        { recipe: { channel: 'out' } },
      );
      expect(merged.recipe.input).to.equal('in');
      expect(merged.recipe.output).to.equal('out');
    });

    it('should default both sides to empty', () => {
      const { controller } = build('plain');
      expect(Object.keys(controller._mergeBounds())).to.be.empty;
    });
  });

  describe('inbound bindings', () => {
    it('should expose a read-only property for an inbound channel', () => {
      const { host: element } = build('inbound');
      const descriptor = Object.getOwnPropertyDescriptor(element, 'recipe');
      expect(descriptor.get).to.be.a('function');
      expect(descriptor.set).to.be.undefined;
    });

    it('should record the subscription without connecting yet', () => {
      const { controller } = build('inbound');
      expect(controller.subscriptions).to.have.lengthOf(1);
      expect(controller.subscriptions[0].channel).to.equal('recipes');
    });

    it('should hand the published value to the property once connected', () => {
      const { host: element, controller } = build('inbound');
      controller.hostConnected();

      bridge.publish('recipes', { id: 1 });

      expect(element.recipe).to.deep.equal({ id: 1 });
    });

    it('should ask the host to update when a value arrives', () => {
      const { host: element, controller } = build('inbound');
      controller.hostConnected();

      bridge.publish('recipes', { id: 1 });

      expect(element.updateCount).to.equal(1);
    });

    it('should run the value through the declared action', () => {
      const { host: element, controller } = build('transforming');
      controller.hostConnected();

      bridge.publish('recipes', { id: 1 });

      expect(element.recipe).to.deep.equal({ id: 1, seen: true });
    });

    it('should not ask the host to update when the binding says to skip it', () => {
      const { host: element, controller } = build('quiet');
      controller.hostConnected();

      bridge.publish('recipes', { id: 1 });

      expect(element.recipe).to.deep.equal({ id: 1 });
      expect(element.updateCount).to.equal(0);
    });
  });

  describe('outbound bindings', () => {
    it('should expose a writable property for an outbound channel', () => {
      const { host: element } = build('outbound');
      const descriptor = Object.getOwnPropertyDescriptor(element, 'picked');
      expect(descriptor.get).to.be.a('function');
      expect(descriptor.set).to.be.a('function');
    });

    it('should publish on assignment', () => {
      const { host: element } = build('outbound');
      const received = [];
      bridge.ComponentConnector.getChannel('picks').subscribe(evt => received.push(evt));

      element.picked = { id: 3 };

      expect(received).to.have.lengthOf(1);
      expect(received[0].detail).to.deep.equal({ id: 3 });
    });

    it('should read back what was assigned', () => {
      const { host: element } = build('outbound');
      element.picked = { id: 3 };
      expect(element.picked).to.deep.equal({ id: 3 });
    });

    it('should round-trip a property bound in both directions', () => {
      const { host: element, controller } = build('bothWays');
      controller.hostConnected();

      element.recipe = { id: 4 };

      expect(element.recipe).to.deep.equal({ id: 4 });
    });
  });

  describe('#hostConnected / #hostDisconnected', () => {
    it('should connect every declared subscription', () => {
      const { host: element, controller } = build('inbound');

      controller.hostConnected();
      bridge.publish('recipes', { id: 1 });

      expect(element.recipe).to.deep.equal({ id: 1 });
    });

    it('should stop listening once disconnected', () => {
      const { host: element, controller } = build('inbound');
      controller.hostConnected();
      bridge.publish('recipes', { id: 1 });

      controller.hostDisconnected();
      bridge.publish('recipes', { id: 2 });

      expect(element.recipe).to.deep.equal({ id: 1 });
    });

    it('should do nothing for a host with no bindings', () => {
      const { controller } = build('plain');
      expect(() => {
        controller.hostConnected();
        controller.hostDisconnected();
      }).to.not.throw();
    });
  });
});
