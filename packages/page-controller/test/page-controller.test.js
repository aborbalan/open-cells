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
import { ElementController } from '@open-cells/element-controller';
import { PageController } from '../src/PageController.js';

/** The smallest thing a ReactiveController host has to be. */
class TestPage extends HTMLElement {
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

// The channel a page listens on is derived from its tag, so each kind needs its own.
customElements.define('plain-page', class extends TestPage {});
customElements.define('entering-page', class extends TestPage {});
customElements.define('leaving-page', class extends TestPage {});
customElements.define('both-page', class extends TestPage {});

describe('PageController', () => {
  let bridge;
  let container;
  let sandbox;
  let page;

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
      routes: { home: { path: '/', action: () => Promise.resolve() } },
    });
  });

  afterEach(() => {
    page?.remove();
    page = undefined;
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

  /** Mounts a page of the given tag and attaches a connected PageController. */
  function build(tagName, hooks = {}) {
    page = document.createElement(tagName);
    Object.assign(page, hooks);
    document.body.appendChild(page);
    const controller = new PageController(page);
    controller.hostConnected();
    return { page, controller };
  }

  describe('#getPagePrivateChannel', () => {
    it('should derive the channel from the page tag', () => {
      expect(PageController.getPagePrivateChannel('HOME-PAGE')).to.equal('__oc_page_home');
    });

    it('should lower-case the tag', () => {
      expect(PageController.getPagePrivateChannel('Category-Page')).to.equal('__oc_page_category');
    });

    it('should leave a tag without the page suffix alone', () => {
      expect(PageController.getPagePrivateChannel('sidebar')).to.equal('__oc_page_sidebar');
    });

    it('should expose the prefix it uses', () => {
      expect(PageController.BRIDGE_PAGE_PRIVATE_CHANNEL_PREFIX).to.equal('__oc_page_');
    });
  });

  describe('#constructor', () => {
    it('should extend the element controller', () => {
      const { controller } = build('plain-page');
      expect(controller).to.be.instanceOf(ElementController);
    });

    it('should start with empty params', () => {
      const { controller } = build('plain-page');
      expect(controller.params).to.deep.equal({});
    });

    it('should declare params as a reactive property', () => {
      expect(PageController.properties).to.deep.equal({ params: { type: Object } });
    });

    it('should register itself as a controller of the page', () => {
      const { page: element, controller } = build('plain-page');
      expect(element.controllers).to.deep.equal([controller]);
    });
  });

  describe('#__hasPageHandlers', () => {
    it('should be false for a page with neither hook', () => {
      const { controller } = build('plain-page');
      expect(controller.__hasPageHandlers()).to.be.false;
    });

    it('should be true for a page that only enters', () => {
      const { controller } = build('entering-page', { onPageEnter: () => {} });
      expect(controller.__hasPageHandlers()).to.be.true;
    });

    it('should be true for a page that only leaves', () => {
      const { controller } = build('leaving-page', { onPageLeave: () => {} });
      expect(controller.__hasPageHandlers()).to.be.true;
    });
  });

  describe('the page lifecycle hooks', () => {
    it('should call onPageEnter when the page becomes active', () => {
      const onPageEnter = sandbox.spy();
      build('entering-page', { onPageEnter });

      bridge.BridgeChannelManager.publishPrivatePageStatus('entering', true);

      expect(onPageEnter.calledOnce).to.be.true;
    });

    it('should call onPageLeave when the page stops being active', () => {
      const onPageLeave = sandbox.spy();
      build('leaving-page', { onPageLeave });

      bridge.BridgeChannelManager.publishPrivatePageStatus('leaving', false);

      expect(onPageLeave.calledOnce).to.be.true;
    });

    it('should call the right hook for each status', () => {
      const onPageEnter = sandbox.spy();
      const onPageLeave = sandbox.spy();
      build('both-page', { onPageEnter, onPageLeave });

      bridge.BridgeChannelManager.publishPrivatePageStatus('both', true);
      bridge.BridgeChannelManager.publishPrivatePageStatus('both', false);

      expect(onPageEnter.calledOnce).to.be.true;
      expect(onPageLeave.calledOnce).to.be.true;
    });

    it('should not call the missing hook of a page that only enters', () => {
      const onPageEnter = sandbox.spy();
      build('entering-page', { onPageEnter });

      expect(() =>
        bridge.BridgeChannelManager.publishPrivatePageStatus('entering', false),
      ).to.not.throw();
      expect(onPageEnter.called).to.be.false;
    });

    it('should not subscribe a page that declares no hooks', () => {
      const { page: element } = build('plain-page');
      expect(bridge.ComponentConnector.subscriptors.has(element)).to.be.false;
    });
  });

  describe('#__wrapPrivateChannelCallback', () => {
    it('should route a true status to onPageEnter', () => {
      const onPageEnter = sandbox.spy();
      const { controller } = build('entering-page', { onPageEnter });

      controller.__wrapPrivateChannelCallback()({ value: true });

      expect(onPageEnter.calledOnce).to.be.true;
    });

    it('should route a false status to onPageLeave', () => {
      const onPageLeave = sandbox.spy();
      const { controller } = build('leaving-page', { onPageLeave });

      controller.__wrapPrivateChannelCallback()({ value: false });

      expect(onPageLeave.calledOnce).to.be.true;
    });
  });
});
