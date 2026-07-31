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
import { useBridge } from '@open-cells/core/test/helpers/bridge-fixture.js';
import { PageMixin } from '../src/PageMixin.js';

/** The mixin calls super.connectedCallback(), which HTMLElement does not have. */
class PageBase extends HTMLElement {
  connectedCallback() {
    this.connectedCount = (this.connectedCount || 0) + 1;
  }
}

const hooks = {};

class MixedPage extends PageMixin(PageBase) {
  connectedCallback() {
    // The hooks have to exist before the mixin looks for them.
    Object.assign(this, hooks[this.tagName.toLowerCase()] || {});
    super.connectedCallback();
  }
}

// The channel a page listens on comes from its tag, so each kind needs its own.
['plain-page', 'entering-page', 'leaving-page', 'both-page'].forEach(tagName => {
  customElements.define(tagName, class extends MixedPage {});
});

describe('PageMixin', () => {
  const bridgeFixture = useBridge();
  let sandbox;
  let page;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    page?.remove();
    page = undefined;
    Object.keys(hooks).forEach(key => delete hooks[key]);
    sandbox.restore();
  });

  /** Mounts a page of the given tag, with the lifecycle hooks it should carry. */
  function mount(tagName, pageHooks = {}) {
    hooks[tagName] = pageHooks;
    page = document.createElement(tagName);
    document.body.appendChild(page);
    return page;
  }

  describe('the mixin itself', () => {
    it('should not apply itself twice to the same class', () => {
      const Mixed = PageMixin(PageBase);
      expect(PageMixin(Mixed)).to.equal(Mixed);
    });

    it('should keep the base class in the chain', () => {
      expect(mount('plain-page')).to.be.instanceOf(PageBase);
    });

    it('should still run the connectedCallback of the base', () => {
      expect(mount('plain-page').connectedCount).to.equal(1);
    });

    it('should declare params as a reactive property', () => {
      expect(MixedPage.properties).to.deep.equal({ params: { type: Object } });
    });

    it('should start with empty params', () => {
      expect(mount('plain-page').params).to.deep.equal({});
    });

    it('should graft the core API onto the element', () => {
      const element = mount('plain-page');
      expect(element.subscribe).to.be.a('function');
      expect(element.publish).to.be.a('function');
      expect(element.navigate).to.be.a('function');
    });
  });

  describe('#getPagePrivateChannel', () => {
    it('should derive the channel from the page tag', () => {
      expect(MixedPage.getPagePrivateChannel('HOME-PAGE')).to.equal('__oc_page_home');
    });

    it('should lower-case the tag', () => {
      expect(MixedPage.getPagePrivateChannel('Category-Page')).to.equal('__oc_page_category');
    });

    it('should leave a tag without the page suffix alone', () => {
      expect(MixedPage.getPagePrivateChannel('sidebar')).to.equal('__oc_page_sidebar');
    });

    it('should expose the prefix it uses', () => {
      expect(MixedPage.BRIDGE_PAGE_PRIVATE_CHANNEL_PREFIX).to.equal('__oc_page_');
    });
  });

  describe('#__hasPageHandlers', () => {
    it('should be false for a page with neither hook', () => {
      expect(mount('plain-page').__hasPageHandlers()).to.be.false;
    });

    it('should be true for a page that only enters', () => {
      expect(mount('entering-page', { onPageEnter: () => {} }).__hasPageHandlers()).to.be.true;
    });

    it('should be true for a page that only leaves', () => {
      expect(mount('leaving-page', { onPageLeave: () => {} }).__hasPageHandlers()).to.be.true;
    });
  });

  describe('the page lifecycle hooks', () => {
    it('should call onPageEnter when the page becomes active', () => {
      const onPageEnter = sandbox.spy();
      mount('entering-page', { onPageEnter });

      bridgeFixture.bridge.BridgeChannelManager.publishPrivatePageStatus('entering', true);

      expect(onPageEnter.calledOnce).to.be.true;
    });

    it('should call onPageLeave when the page stops being active', () => {
      const onPageLeave = sandbox.spy();
      mount('leaving-page', { onPageLeave });

      bridgeFixture.bridge.BridgeChannelManager.publishPrivatePageStatus('leaving', false);

      expect(onPageLeave.calledOnce).to.be.true;
    });

    it('should call the right hook for each status', () => {
      const onPageEnter = sandbox.spy();
      const onPageLeave = sandbox.spy();
      mount('both-page', { onPageEnter, onPageLeave });

      bridgeFixture.bridge.BridgeChannelManager.publishPrivatePageStatus('both', true);
      bridgeFixture.bridge.BridgeChannelManager.publishPrivatePageStatus('both', false);

      expect(onPageEnter.calledOnce).to.be.true;
      expect(onPageLeave.calledOnce).to.be.true;
    });

    it('should not call the missing hook of a page that only enters', () => {
      const onPageEnter = sandbox.spy();
      mount('entering-page', { onPageEnter });

      expect(() =>
        bridgeFixture.bridge.BridgeChannelManager.publishPrivatePageStatus('entering', false),
      ).to.not.throw();
      expect(onPageEnter.called).to.be.false;
    });

    it('should not subscribe a page that declares no hooks', () => {
      const element = mount('plain-page');
      expect(bridgeFixture.bridge.ComponentConnector.subscriptors.has(element)).to.be.false;
    });
  });

  describe('#__wrapPrivateChannelCallback', () => {
    it('should route a true status to onPageEnter', () => {
      const onPageEnter = sandbox.spy();
      const element = mount('entering-page', { onPageEnter });

      element.__wrapPrivateChannelCallback()({ value: true });

      expect(onPageEnter.calledOnce).to.be.true;
    });

    it('should route a false status to onPageLeave', () => {
      const onPageLeave = sandbox.spy();
      const element = mount('leaving-page', { onPageLeave });

      element.__wrapPrivateChannelCallback()({ value: false });

      expect(onPageLeave.calledOnce).to.be.true;
    });
  });
});

