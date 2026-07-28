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
import { PageTransitionsMixin } from '../src/PageTransitionsMixin.js';
import defaultPageTransitions from '../src/default-page-transitions.js';

/** Stands in for LitElement: the mixin calls up to both of these. */
class PageBase extends HTMLElement {
  connectedCallback() {
    this.connectedCount = (this.connectedCount || 0) + 1;
  }

  updated(props) {
    this.updatedWith = props;
  }
}

const Mixed = PageTransitionsMixin(PageBase);

customElements.define('pt-page', class extends Mixed {});
customElements.define(
  'pt-custom-page',
  class extends Mixed {
    static pageTransitionDefinitions = {
      ...defaultPageTransitions,
      custom: {
        forwardsIn: 'customIn',
        forwardsOut: 'customOut',
        backwardsIn: 'customIn',
        backwardsOut: 'customOut',
      },
    };
  },
);

describe('PageTransitionsMixin', () => {
  let container;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    sandbox.restore();
    container.remove();
  });

  /** The animation attributes settle on the next frame. */
  function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  function mount(tagName = 'pt-page') {
    const page = document.createElement(tagName);
    container.appendChild(page);
    return page;
  }

  /** The change map Lit hands to updated(). */
  function changed(...names) {
    return new Map(names.map(name => [name, undefined]));
  }

  describe('the mixin itself', () => {
    it('should not apply itself twice to the same class', () => {
      expect(PageTransitionsMixin(Mixed)).to.equal(Mixed);
    });

    it('should keep the base class in the chain', () => {
      expect(mount()).to.be.instanceOf(PageBase);
    });

    it('should still run the connectedCallback of the base', () => {
      expect(mount().connectedCount).to.equal(1);
    });

    it('should still run the updated of the base', () => {
      const page = mount();
      const props = changed('somethingElse');
      page.updated(props);
      expect(page.updatedWith).to.equal(props);
    });
  });

  describe('reactive properties', () => {
    it('should reflect the page state', () => {
      expect(Mixed.properties.state).to.deep.equal({ reflect: true });
    });

    it('should read the transition type from an attribute', () => {
      expect(Mixed.properties.pageTransitionType).to.deep.equal({
        attribute: 'page-transition-type',
      });
    });

    it('should read the disabled flag from a boolean attribute', () => {
      expect(Mixed.properties.pageTransitionDisabled).to.deep.equal({
        type: Boolean,
        attribute: 'page-transition-disabled',
      });
    });
  });

  describe('defaults', () => {
    it('should fade by default', () => {
      expect(mount().pageTransitionType).to.equal('fade');
    });

    it('should be enabled by default', () => {
      expect(mount().pageTransitionDisabled).to.be.false;
    });

    it('should start from the packaged animation definitions', () => {
      expect(Mixed.pageTransitionDefinitions).to.deep.equal(defaultPageTransitions);
    });

    it('should expose the definitions of its own class', () => {
      expect(mount('pt-custom-page')._pageTransitions).to.have.property('custom');
    });
  });

  describe('#connectedCallback', () => {
    it('should mark itself as a page so the stylesheet can find it', () => {
      expect(mount().dataset.cellsPage).to.equal('');
    });
  });

  describe('#updated', () => {
    it('should transition when the page turns active', async () => {
      const leaving = mount();
      leaving.setAttribute('state', 'inactive');
      const entering = mount();
      entering.state = 'active';
      entering.pageTransitionType = 'horizontal';

      entering.updated(changed('state'));
      await nextFrame();

      expect(entering.getAttribute('page-animation')).to.equal('moveFromRight');
      expect(leaving.getAttribute('page-animation')).to.equal('moveToLeft');
    });

    it('should do nothing when some other property changed', async () => {
      const leaving = mount();
      leaving.setAttribute('state', 'inactive');
      const entering = mount();
      entering.state = 'active';

      entering.updated(changed('pageTransitionType'));
      await nextFrame();

      expect(entering.hasAttribute('page-animation')).to.be.false;
    });

    it('should do nothing when the page did not turn active', async () => {
      const leaving = mount();
      leaving.setAttribute('state', 'inactive');
      const entering = mount();
      entering.state = 'cached';

      entering.updated(changed('state'));
      await nextFrame();

      expect(entering.hasAttribute('page-animation')).to.be.false;
    });

    it('should honour the disabled flag', async () => {
      const leaving = mount();
      leaving.setAttribute('state', 'inactive');
      const entering = mount();
      entering.state = 'active';
      entering.pageTransitionDisabled = true;
      const listener = sandbox.spy();
      entering.addEventListener('page-active', listener);

      entering.updated(changed('state'));
      await nextFrame();

      expect(entering.hasAttribute('page-animation')).to.be.false;
      expect(listener.calledOnce).to.be.true;
    });

    it('should use the animations declared by its own class', async () => {
      const leaving = mount('pt-custom-page');
      leaving.setAttribute('state', 'inactive');
      const entering = mount('pt-custom-page');
      entering.state = 'active';
      entering.pageTransitionType = 'custom';

      entering.updated(changed('state'));
      await nextFrame();

      expect(entering.getAttribute('page-animation')).to.equal('customIn');
      expect(leaving.getAttribute('page-animation')).to.equal('customOut');
    });
  });
});
