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
import { NavigationStack } from '../src/navigation-stack';

describe('NavigationStack', () => {
  let navigationStack;

  beforeEach(() => {
    navigationStack = new NavigationStack();
  });

  describe('#constructor', () => {
    it('should construct a new NavigationStack object', () => {
      expect(navigationStack).to.be.instanceOf(NavigationStack);
      expect(navigationStack.navStack).to.deep.equal([]);
      expect(navigationStack.skipNav).to.deep.equal({});
    });
  });

  describe('#length', () => {
    it('should be zero for a new stack', () => {
      expect(navigationStack.length).to.equal(0);
    });

    it('should return the length of the navigation stack', () => {
      navigationStack.push({ page: 'home' });
      navigationStack.push({ page: 'category' });
      expect(navigationStack.length).to.equal(2);
    });
  });

  describe('#createRoute', () => {
    it('should build a route from a page and its params', () => {
      expect(navigationStack.createRoute('category', { name: 'beef' })).to.deep.equal({
        page: 'category',
        params: { name: 'beef' },
      });
    });

    it('should default the params to an empty object', () => {
      expect(navigationStack.createRoute('home')).to.deep.equal({ page: 'home', params: {} });
    });
  });

  describe('#createNavigation', () => {
    it('should build a navigation from two routes', () => {
      const from = navigationStack.createRoute('home');
      const to = navigationStack.createRoute('category');
      expect(navigationStack.createNavigation(from, to)).to.deep.equal({
        from: 'home',
        to: 'category',
      });
    });

    it('should leave the ends undefined when a route is missing', () => {
      expect(navigationStack.createNavigation(undefined, undefined)).to.deep.equal({
        from: undefined,
        to: undefined,
      });
    });
  });

  describe('#_reverseNavigation', () => {
    it('should swap the ends of a navigation', () => {
      expect(navigationStack._reverseNavigation({ from: 'page1', to: 'page2' })).to.deep.equal({
        from: 'page2',
        to: 'page1',
      });
    });
  });

  describe('#addSkipNavigation / #isSkipNavigation', () => {
    it('should mark a navigation as skipped', () => {
      navigationStack.addSkipNavigation({ from: 'page1', to: 'page2', skipHistory: true });
      expect(navigationStack.skipNav['page1:page2']).to.be.true;
      expect(navigationStack.isSkipNavigation({ from: 'page1', to: 'page2' })).to.be.true;
    });

    it('should record an explicit false without marking it as skipped', () => {
      navigationStack.addSkipNavigation({ from: 'page1', to: 'page2', skipHistory: false });
      expect(navigationStack.skipNav['page1:page2']).to.be.false;
      expect(navigationStack.isSkipNavigation({ from: 'page1', to: 'page2' })).to.be.false;
    });

    it('should ignore a navigation with no skipHistory flag', () => {
      navigationStack.addSkipNavigation({ from: 'page1', to: 'page2' });
      expect(navigationStack.skipNav).to.deep.equal({});
    });

    it('should not report an unknown navigation as skipped', () => {
      expect(navigationStack.isSkipNavigation({ from: 'nowhere', to: 'elsewhere' })).to.be.false;
    });

    it('should treat each direction as a separate entry', () => {
      navigationStack.addSkipNavigation({ from: 'page1', to: 'page2', skipHistory: true });
      expect(navigationStack.isSkipNavigation({ from: 'page2', to: 'page1' })).to.be.false;
    });
  });

  describe('#push', () => {
    it('should push a route onto an empty stack', () => {
      navigationStack.push({ page: 'home' });
      expect(navigationStack.navStack).to.deep.equal([{ page: 'home' }]);
    });

    it('should push a route whose page differs from the top', () => {
      navigationStack.push({ page: 'home' });
      navigationStack.push({ page: 'category' });
      expect(navigationStack.length).to.equal(2);
    });

    it('should not push the same page twice in a row', () => {
      navigationStack.push({ page: 'home' });
      navigationStack.push({ page: 'home' });
      expect(navigationStack.length).to.equal(1);
    });

    it('should allow a page to reappear once another page is on top', () => {
      navigationStack.push({ page: 'home' });
      navigationStack.push({ page: 'category' });
      navigationStack.push({ page: 'home' });
      expect(navigationStack.navStack.map(r => r.page)).to.deep.equal(['home', 'category', 'home']);
    });
  });

  describe('#pop', () => {
    it('should remove and return the top route', () => {
      navigationStack.push({ page: 'home' });
      navigationStack.push({ page: 'category' });
      expect(navigationStack.pop()).to.deep.equal({ page: 'category' });
      expect(navigationStack.length).to.equal(1);
    });

    it('should return undefined on an empty stack', () => {
      expect(navigationStack.pop()).to.be.undefined;
    });
  });

  describe('#top', () => {
    it('should return the top route without removing it', () => {
      navigationStack.push({ page: 'home' });
      navigationStack.push({ page: 'category' });
      expect(navigationStack.top()).to.deep.equal({ page: 'category' });
      expect(navigationStack.length).to.equal(2);
    });

    it('should return undefined on an empty stack', () => {
      expect(navigationStack.top()).to.be.undefined;
    });
  });

  describe('#lastNavigation', () => {
    it('should have both ends undefined on an empty stack', () => {
      expect(navigationStack.lastNavigation()).to.deep.equal({ from: undefined, to: undefined });
    });

    it('should only have a destination when a single route is stacked', () => {
      navigationStack.push({ page: 'home' });
      expect(navigationStack.lastNavigation()).to.deep.equal({ from: undefined, to: 'home' });
    });

    it('should report the last two routes as a navigation', () => {
      navigationStack.push({ page: 'home' });
      navigationStack.push({ page: 'category' });
      navigationStack.push({ page: 'recipe' });
      expect(navigationStack.lastNavigation()).to.deep.equal({ from: 'category', to: 'recipe' });
    });
  });

  describe('#isBackwardNavigation', () => {
    it('should recognise a navigation that undoes the last one', () => {
      navigationStack.push({ page: 'home' });
      navigationStack.push({ page: 'category' });
      expect(navigationStack.isBackwardNavigation({ from: 'category', to: 'home' })).to.be.true;
    });

    it('should not recognise a navigation to a new page', () => {
      navigationStack.push({ page: 'home' });
      navigationStack.push({ page: 'category' });
      expect(navigationStack.isBackwardNavigation({ from: 'category', to: 'recipe' })).to.be.false;
    });

    it('should not recognise a repeat of the last navigation', () => {
      navigationStack.push({ page: 'home' });
      navigationStack.push({ page: 'category' });
      expect(navigationStack.isBackwardNavigation({ from: 'home', to: 'category' })).to.be.false;
    });
  });

  describe('#update', () => {
    it('should push the destination on a forward navigation', () => {
      navigationStack.push({ page: 'home', params: {} });
      const top = navigationStack.update(
        { page: 'home', params: {} },
        { page: 'category', params: {} },
      );
      expect(navigationStack.navStack.map(r => r.page)).to.deep.equal(['home', 'category']);
      expect(top).to.deep.equal({ page: 'category', params: {} });
    });

    it('should pop on a backward navigation', () => {
      navigationStack.push({ page: 'home', params: {} });
      navigationStack.push({ page: 'category', params: {} });
      const top = navigationStack.update(
        { page: 'category', params: {} },
        { page: 'home', params: {} },
      );
      expect(navigationStack.navStack.map(r => r.page)).to.deep.equal(['home']);
      expect(top).to.deep.equal({ page: 'home', params: {} });
    });

    it('should skip over pages marked as skip-history when going back', () => {
      navigationStack.push({ page: 'home', params: {} });
      navigationStack.push({ page: 'splash', params: {} });
      navigationStack.push({ page: 'category', params: {} });
      // Router.go() registers the skip reversed: navigating splash -> category with
      // skipHistory records 'category:splash', which is what update() looks up when
      // it walks back over pages that must not be revisited.
      navigationStack.addSkipNavigation({ from: 'category', to: 'splash', skipHistory: true });

      const top = navigationStack.update(
        { page: 'category', params: {} },
        { page: 'splash', params: {} },
      );

      expect(navigationStack.navStack.map(r => r.page)).to.deep.equal(['home']);
      expect(top).to.deep.equal({ page: 'home', params: {} });
    });

    it('should treat a navigation with no origin as forward', () => {
      navigationStack.push({ page: 'home', params: {} });
      const top = navigationStack.update(undefined, { page: 'category', params: {} });
      expect(navigationStack.navStack.map(r => r.page)).to.deep.equal(['home', 'category']);
      expect(top).to.deep.equal({ page: 'category', params: {} });
    });
  });

  describe('#replace', () => {
    it('should replace the top route with a different page', () => {
      navigationStack.push({ page: 'home' });
      navigationStack.push({ page: 'category' });
      navigationStack.replace({ page: 'recipe' });
      expect(navigationStack.navStack.map(r => r.page)).to.deep.equal(['home', 'recipe']);
    });

    it('should leave the stack untouched when the page is already on top', () => {
      navigationStack.push({ page: 'home' });
      navigationStack.replace({ page: 'home' });
      expect(navigationStack.navStack).to.deep.equal([{ page: 'home' }]);
    });
  });

  describe('#replaceRoute', () => {
    it('should replace the top route', () => {
      navigationStack.push({ page: 'home' });
      navigationStack.push({ page: 'category' });
      navigationStack.replaceRoute({ page: 'recipe' });
      expect(navigationStack.navStack.map(r => r.page)).to.deep.equal(['home', 'recipe']);
    });

    it('should push when the stack is empty', () => {
      navigationStack.replaceRoute({ page: 'home' });
      expect(navigationStack.navStack).to.deep.equal([{ page: 'home' }]);
    });

    it('should replace the top even when it is the same page', () => {
      const updated = { page: 'home', params: { a: 2 } };
      navigationStack.push({ page: 'home', params: { a: 1 } });
      navigationStack.replaceRoute(updated);
      expect(navigationStack.navStack).to.deep.equal([updated]);
    });
  });

  describe('#clear', () => {
    it('should empty the navigation stack', () => {
      navigationStack.push({ page: 'home' });
      navigationStack.push({ page: 'category' });
      navigationStack.clear();
      expect(navigationStack.length).to.equal(0);
      expect(navigationStack.top()).to.be.undefined;
    });

    it('should keep the skip-navigation entries', () => {
      navigationStack.addSkipNavigation({ from: 'page1', to: 'page2', skipHistory: true });
      navigationStack.clear();
      expect(navigationStack.isSkipNavigation({ from: 'page1', to: 'page2' })).to.be.true;
    });
  });

  describe('#clearUntil', () => {
    it('should pop everything above and including the target page', () => {
      navigationStack.push({ page: 'home' });
      navigationStack.push({ page: 'category' });
      navigationStack.push({ page: 'recipe' });
      navigationStack.clearUntil('category');
      expect(navigationStack.navStack.map(r => r.page)).to.deep.equal(['home']);
    });

    it('should empty the stack when the target is at the bottom', () => {
      navigationStack.push({ page: 'home' });
      navigationStack.push({ page: 'category' });
      navigationStack.clearUntil('home');
      expect(navigationStack.length).to.equal(0);
    });

    it('should leave the stack untouched when the target is not in it', () => {
      navigationStack.push({ page: 'home' });
      navigationStack.push({ page: 'category' });
      navigationStack.clearUntil('nowhere');
      expect(navigationStack.navStack.map(r => r.page)).to.deep.equal(['home', 'category']);
    });

    it('should do nothing on an empty stack', () => {
      navigationStack.clearUntil('home');
      expect(navigationStack.length).to.equal(0);
    });
  });
});
