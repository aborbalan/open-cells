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
import { transitionPage } from '../src/page-transitions.js';
import defaultPageTransitions from '../src/default-page-transitions.js';

describe('transitionPage', () => {
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

  /** Adds a page in the given state to the shared container. */
  function page(state) {
    const node = document.createElement('div');
    if (state) {
      node.setAttribute('state', state);
    }
    container.appendChild(node);
    return node;
  }

  /** The animation attributes settle on the next frame. */
  function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  describe('with no page to transition from', () => {
    it('should announce the page as active straight away', () => {
      const active = page('active');
      const listener = sandbox.spy();
      active.addEventListener('page-active', listener);

      transitionPage(active, { animations: defaultPageTransitions, type: 'fade' });

      expect(listener.calledOnce).to.be.true;
    });

    it('should not put any animation attribute on the page', () => {
      const active = page('active');
      transitionPage(active, { animations: defaultPageTransitions, type: 'fade' });
      expect(active.hasAttribute('page-animation')).to.be.false;
    });

    it('should ignore a sibling that is not leaving', () => {
      page('cached');
      const active = page('active');
      const listener = sandbox.spy();
      active.addEventListener('page-active', listener);

      transitionPage(active, { animations: defaultPageTransitions, type: 'fade' });

      expect(listener.calledOnce).to.be.true;
    });

    it('should tolerate being called with no options', () => {
      const active = page('active');
      expect(() => transitionPage(active)).to.not.throw();
    });
  });

  describe('when the transition is disabled', () => {
    it('should show the page without animating', () => {
      const leaving = page('inactive');
      const active = page('active');
      const listener = sandbox.spy();
      active.addEventListener('page-active', listener);

      transitionPage(active, { disabled: true, animations: defaultPageTransitions, type: 'fade' });

      expect(listener.calledOnce).to.be.true;
      expect(active.hasAttribute('page-animation')).to.be.false;
      expect(leaving.hasAttribute('page-animation')).to.be.false;
    });
  });

  describe('a forward transition', () => {
    it('should animate both pages with the forward animations', async () => {
      const leaving = page('inactive');
      const entering = page('active');

      transitionPage(entering, { animations: defaultPageTransitions, type: 'horizontal' });
      await nextFrame();

      expect(entering.getAttribute('page-animation')).to.equal('moveFromRight');
      expect(entering.getAttribute('page-animation-direction')).to.equal('forward');
      expect(leaving.getAttribute('page-animation')).to.equal('moveToLeft');
      expect(leaving.getAttribute('page-animation-direction')).to.equal('forward');
    });

    it('should tell the leaving page that its animation is starting', async () => {
      const leaving = page('inactive');
      const entering = page('active');
      const listener = sandbox.spy();
      leaving.addEventListener('animation-forward', listener);

      transitionPage(entering, { animations: defaultPageTransitions, type: 'fade' });
      await nextFrame();

      expect(listener.calledOnce).to.be.true;
    });

    it('should remember which page it came from, for the way back', async () => {
      const leaving = page('inactive');
      const entering = page('active');

      transitionPage(entering, { animations: defaultPageTransitions, type: 'horizontal' });
      await nextFrame();

      expect(leaving._isPreviousNavigationFor.page).to.equal(entering);
      expect(leaving._isPreviousNavigationFor.type).to.equal('horizontal');
    });

    it('should fall back to the static animation for an unknown type', async () => {
      const leaving = page('inactive');
      const entering = page('active');

      transitionPage(entering, { animations: defaultPageTransitions, type: 'nope' });
      await nextFrame();

      expect(entering.getAttribute('page-animation')).to.equal('static');
      expect(leaving.getAttribute('page-animation')).to.equal('static');
    });

    it('should fall back to the static animation when no animations are given', async () => {
      const leaving = page('inactive');
      const entering = page('active');

      transitionPage(entering, { type: 'horizontal' });
      await nextFrame();

      expect(entering.getAttribute('page-animation')).to.equal('static');
      expect(leaving.getAttribute('page-animation')).to.equal('static');
    });
  });

  describe('a backward transition', () => {
    it('should use the backward animations when returning to the previous page', async () => {
      const first = page('inactive');
      const second = page('active');

      // Forward: first -> second.
      transitionPage(second, { animations: defaultPageTransitions, type: 'horizontal' });
      await nextFrame();

      // Now go back: second becomes the leaving page, first the entering one.
      second.setAttribute('state', 'inactive');
      first.setAttribute('state', 'active');
      transitionPage(first, { animations: defaultPageTransitions, type: 'horizontal' });
      await nextFrame();

      expect(first.getAttribute('page-animation')).to.equal('moveFromLeft');
      expect(first.getAttribute('page-animation-direction')).to.equal('backward');
      expect(second.getAttribute('page-animation')).to.equal('moveToRight');
    });

    it('should forget the previous navigation once it has been used', async () => {
      const first = page('inactive');
      const second = page('active');

      transitionPage(second, { animations: defaultPageTransitions, type: 'horizontal' });
      await nextFrame();

      second.setAttribute('state', 'inactive');
      first.setAttribute('state', 'active');
      transitionPage(first, { animations: defaultPageTransitions, type: 'horizontal' });
      await nextFrame();

      expect(first._isPreviousNavigationFor).to.be.null;
    });

    it('should use the animation type of the original navigation, not the new one', async () => {
      const first = page('inactive');
      const second = page('active');

      transitionPage(second, { animations: defaultPageTransitions, type: 'verticalUp' });
      await nextFrame();

      second.setAttribute('state', 'inactive');
      first.setAttribute('state', 'active');
      transitionPage(first, { animations: defaultPageTransitions, type: 'horizontal' });
      await nextFrame();

      expect(first.getAttribute('page-animation')).to.equal('static');
      expect(second.getAttribute('page-animation')).to.equal('moveToBottom');
    });
  });

  describe('when the animation ends', () => {
    it('should clear the animation attributes of both pages', async () => {
      const leaving = page('inactive');
      const entering = page('active');

      transitionPage(entering, { animations: defaultPageTransitions, type: 'fade' });
      await nextFrame();

      entering.dispatchEvent(new AnimationEvent('animationend'));
      leaving.dispatchEvent(new AnimationEvent('animationend'));

      expect(entering.hasAttribute('page-animation')).to.be.false;
      expect(leaving.hasAttribute('page-animation')).to.be.false;
    });

    it('should announce the active page once both have finished', async () => {
      const leaving = page('inactive');
      const entering = page('active');
      entering.state = 'active';
      const listener = sandbox.spy();
      entering.addEventListener('page-active', listener);

      transitionPage(entering, { animations: defaultPageTransitions, type: 'fade' });
      await nextFrame();

      entering.dispatchEvent(new AnimationEvent('animationend'));
      leaving.dispatchEvent(new AnimationEvent('animationend'));
      await nextFrame();

      expect(listener.calledOnce).to.be.true;
    });

    it('should not announce anything while the other page is still animating', async () => {
      const leaving = page('inactive');
      const entering = page('active');
      const listener = sandbox.spy();
      entering.addEventListener('page-active', listener);

      transitionPage(entering, { animations: defaultPageTransitions, type: 'fade' });
      await nextFrame();

      entering.dispatchEvent(new AnimationEvent('animationend'));
      await nextFrame();

      expect(listener.called).to.be.false;
    });

    it('should ignore an animation that bubbled up from a child', async () => {
      const leaving = page('inactive');
      const entering = page('active');
      const child = document.createElement('span');
      entering.appendChild(child);

      transitionPage(entering, { animations: defaultPageTransitions, type: 'fade' });
      await nextFrame();

      child.dispatchEvent(new AnimationEvent('animationend', { bubbles: true }));

      expect(entering.hasAttribute('page-animation')).to.be.true;
      expect(leaving.hasAttribute('page-animation')).to.be.true;
    });

    it('should also clean up on a cancelled animation', async () => {
      const leaving = page('inactive');
      const entering = page('active');

      transitionPage(entering, { animations: defaultPageTransitions, type: 'fade' });
      await nextFrame();

      entering.dispatchEvent(new AnimationEvent('animationcancel'));

      expect(entering.hasAttribute('page-animation')).to.be.false;
    });
  });

  describe('finding the page it transitions from', () => {
    it('should accept a sibling whose state is a property rather than an attribute', async () => {
      const leaving = document.createElement('div');
      leaving.state = 'inactive';
      container.appendChild(leaving);
      const entering = page('active');

      transitionPage(entering, { animations: defaultPageTransitions, type: 'fade' });
      await nextFrame();

      expect(leaving.getAttribute('page-animation')).to.equal('fadeOut');
    });
  });
});

describe('defaultPageTransitions', () => {
  it('should define the four directions for every animation', () => {
    Object.entries(defaultPageTransitions).forEach(([name, animation]) => {
      expect(animation, name).to.have.all.keys(
        'forwardsIn',
        'forwardsOut',
        'backwardsIn',
        'backwardsOut',
      );
    });
  });

  it('should provide the static animation used as the fallback', () => {
    expect(defaultPageTransitions.static).to.deep.equal({
      forwardsIn: 'static',
      forwardsOut: 'static',
      backwardsIn: 'static',
      backwardsOut: 'static',
    });
  });

  it('should provide fade, horizontal and vertical animations', () => {
    expect(defaultPageTransitions).to.include.all.keys(
      'fade',
      'horizontal',
      'verticalUp',
      'verticalDownForwards',
    );
  });
});
