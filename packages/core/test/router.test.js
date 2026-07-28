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
import { Router } from '../src/router.js';
import { Route } from '../src/route.js';
import { NavigationStack } from '../src/navigation-stack.js';

/**
 * The Router keeps its routes, current route, 404 route and history flag in module-level
 * variables, and its constructor hands back the one instance that already exists. Every test
 * therefore works on the same object and has to put it back to a known state itself.
 */
function resetRouter(router) {
  router.stop();
  router.routes = {};
  router.currentRoute = undefined;
  router.useHistory = false;
  router.interceptorContext = {};
  router.channelManager = null;
  router.navigationStack.clear();
  router.navigationStack.skipNav = {};
  // These are written through `this`, so they live as own properties on the instance.
  // Deleting them uncovers the prototype/static defaults again.
  delete router.isNavigationInProgress;
  delete router.hashIsDirty;
  delete router.cancelledNavigation;
  delete router.interceptor;
  delete router.handler;
}

describe('Router', () => {
  let router;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    router = new Router();
    resetRouter(router);

    // Keep every test out of the real address bar: the four methods that touch
    // window.history and window.location are the only way the router mutates it.
    sandbox.stub(router, 'historyPushState');
    sandbox.stub(router, 'historyReplaceState');
    sandbox.stub(router, 'locationHash');
    sandbox.stub(router, 'locationReplace');
    sandbox.stub(router, '_getHashPath').returns('/current');
  });

  afterEach(() => {
    router.stop();
    sandbox.restore();
    resetRouter(router);
  });

  function addSampleRoutes() {
    router.addRoutes({
      home: { path: '/', action: () => {} },
      category: { path: '/categories/:name', action: () => {} },
      recipe: { path: '/recipe/:id', action: () => {} },
    });
  }

  describe('#constructor', () => {
    it('should be a singleton', () => {
      expect(new Router()).to.equal(router);
    });

    it('should own a navigation stack', () => {
      expect(router.navigationStack).to.be.instanceOf(NavigationStack);
    });
  });

  describe('#addRoute', () => {
    it('should register a route and return it', () => {
      const added = router.addRoute('home', '/', () => {});
      expect(added).to.be.instanceOf(Route);
      expect(router.routes.home).to.equal(added);
    });

    it('should accept several patterns for one route', () => {
      const added = router.addRoute('home', ['/', '/start'], () => {});
      expect(added.patterns).to.deep.equal(['/', '/start']);
    });

    it('should carry the notFound flag and the component name', () => {
      const added = router.addRoute('404', '/not-found', () => {}, true, 'not-found-page');
      expect(added.is404()).to.be.true;
      expect(added.component).to.equal('not-found-page');
    });
  });

  describe('#addRoutes', () => {
    it('should register every route of the definition', () => {
      addSampleRoutes();
      expect(Object.keys(router.routes)).to.deep.equal(['home', 'category', 'recipe']);
    });

    it('should throw when no routes are given', () => {
      expect(() => router.addRoutes(undefined)).to.throw('Routes must be defined');
    });

    it('should pass notFound and component through', () => {
      router.addRoutes({
        notFound: { path: '/not-found', action: () => {}, notFound: true, component: 'nf-page' },
      });
      expect(router.routes.notFound.is404()).to.be.true;
      expect(router.routes.notFound.component).to.equal('nf-page');
    });
  });

  describe('#getRouteWithPattern', () => {
    beforeEach(addSampleRoutes);

    it('should return the route declaring that pattern', () => {
      expect(router.getRouteWithPattern('/categories/:name')).to.equal(router.routes.category);
    });

    it('should return null when no route declares it', () => {
      expect(router.getRouteWithPattern('/nowhere')).to.be.null;
    });

    it('should ignore 404 routes', () => {
      router.addRoute('404', '/only-404', () => {}, true);
      expect(router.getRouteWithPattern('/only-404')).to.be.null;
    });
  });

  describe('#matchRoute', () => {
    beforeEach(addSampleRoutes);

    it('should match a static path', () => {
      expect(router.matchRoute('/')).to.equal(router.routes.home);
    });

    it('should match a parameterised path and expose its params', () => {
      const matched = router.matchRoute('/categories/beef');
      expect(matched).to.equal(router.routes.category);
      expect(matched.params).to.deep.equal({ name: 'beef' });
    });

    it('should merge the query string into the params', () => {
      const matched = router.matchRoute('/categories/beef?page=2');
      expect(matched.params).to.deep.equal({ name: 'beef', page: '2' });
    });

    it('should return undefined when nothing matches', () => {
      expect(router.matchRoute('/nowhere')).to.be.undefined;
    });

    it('should skip a 404 route that is not accessible', () => {
      const notFound = router.addRoute('404', '/not-found', () => {}, true);
      notFound.isAccessible = false;
      expect(router.matchRoute('/not-found')).to.be.undefined;
    });

    it('should match a 404 route once it is accessible', () => {
      const notFound = router.addRoute('404', '/not-found', () => {}, true);
      notFound.isAccessible = true;
      expect(router.matchRoute('/not-found')).to.equal(notFound);
    });

    it('should hand the full path to a wildcarded route so it can keep the subroute', () => {
      const wild = router.addRoute('wild', '/wild/*', () => {});
      expect(router.matchRoute('/wild/deep/inside')).to.equal(wild);
      expect(wild.subroute).to.equal('/deep/inside');
    });
  });

  describe('#_parseQuery', () => {
    it('should return an empty object when there is no query string', () => {
      expect(router._parseQuery(undefined)).to.deep.equal({});
      expect(router._parseQuery('')).to.deep.equal({});
    });

    it('should parse a single pair', () => {
      expect(router._parseQuery('foo=bar')).to.deep.equal({ foo: 'bar' });
    });

    it('should parse several pairs', () => {
      expect(router._parseQuery('foo=bar&page=2')).to.deep.equal({ foo: 'bar', page: '2' });
    });

    it('should decode the values', () => {
      expect(router._parseQuery('q=a%20b%26c')).to.deep.equal({ q: 'a b&c' });
    });
  });

  describe('#_setup404', () => {
    it('should return null when no route is marked as notFound', () => {
      addSampleRoutes();
      expect(router._setup404()).to.be.null;
    });

    it('should make a single-pattern 404 route redirect to itself', () => {
      addSampleRoutes();
      const notFound = router.addRoute('404', '/not-found', () => {}, true);
      expect(router._setup404()).to.equal(notFound);
      expect(notFound.redirectPage).to.equal('404');
      expect(notFound.isAccessible).to.be.true;
    });

    it('should leave a multi-pattern 404 route without a redirect page', () => {
      const notFound = router.addRoute('404', ['/not-found', '/missing'], () => {}, true);
      expect(router._setup404()).to.equal(notFound);
      expect(notFound.redirectPage).to.be.null;
    });
  });

  describe('#getPath', () => {
    beforeEach(addSampleRoutes);

    it('should resolve the route parameters', () => {
      expect(router.getPath('category', { name: 'beef' })).to.equal('/categories/beef');
    });

    it('should append the extra parameters as a query string', () => {
      expect(router.getPath('category', { name: 'beef', page: 2 })).to.equal(
        '/categories/beef?page=2',
      );
    });

    it('should strip the wildcard from the resolved path', () => {
      router.addRoute('wild', '/wild/*', () => {});
      expect(router.getPath('wild', undefined)).to.equal('/wild/');
    });

    it('should strip the wildcard and keep the query string', () => {
      router.addRoute('wild', '/wild/*', () => {});
      expect(router.getPath('wild', { page: 2 })).to.equal('/wild/?page=2');
    });

    it('should report an unknown route and return undefined', () => {
      const error = sandbox.stub(console, 'error');
      expect(router.getPath('nowhere', undefined)).to.be.undefined;
      expect(error.calledOnce).to.be.true;
    });
  });

  describe('#newNavigation / #reverseNavigation', () => {
    it('should build a navigation from the current route', () => {
      router.currentRoute = { name: 'home' };
      expect(router.newNavigation('category')).to.deep.equal({ from: 'home', to: 'category' });
    });

    it('should leave the origin undefined when there is no current route', () => {
      expect(router.newNavigation('home')).to.deep.equal({ from: undefined, to: 'home' });
    });

    it('should swap the ends of a navigation', () => {
      expect(router.reverseNavigation({ from: 'a', to: 'b' })).to.deep.equal({
        from: 'b',
        to: 'a',
      });
    });
  });

  describe('interceptor context', () => {
    it('should not intercept by default', () => {
      expect(router.interceptor({}, {})).to.deep.equal({ intercept: false });
    });

    it('should start with an empty context', () => {
      expect(router.getInterceptorContext()).to.deep.equal({});
    });

    it('should replace the context on set', () => {
      router.setInterceptorContext({ token: 'a' });
      router.setInterceptorContext({ user: 'b' });
      expect(router.getInterceptorContext()).to.deep.equal({ user: 'b' });
    });

    it('should merge into the context on update', () => {
      router.setInterceptorContext({ token: 'a' });
      router.updateInterceptorContext({ user: 'b' });
      expect(router.getInterceptorContext()).to.deep.equal({ token: 'a', user: 'b' });
    });

    it('should hand out a copy, not the context itself', () => {
      router.setInterceptorContext({ token: 'a' });
      router.getInterceptorContext().token = 'tampered';
      expect(router.getInterceptorContext()).to.deep.equal({ token: 'a' });
    });
  });

  describe('#intercept', () => {
    beforeEach(addSampleRoutes);

    it('should describe the navigation being attempted', () => {
      const routeFrom = { page: 'home', params: {} };
      const routeTo = router.routes.category;
      routeTo.params = { name: 'beef' };

      const result = router.intercept(routeFrom, routeTo);

      expect(result.intercept).to.be.false;
      expect(result.from).to.deep.equal({ page: 'home', params: {} });
      expect(result.to).to.deep.equal({
        page: 'category',
        path: '/categories/:name',
        params: { name: 'beef' },
      });
    });

    it('should pass the context to the interceptor', () => {
      router.setInterceptorContext({ loggedIn: false });
      router.interceptor = sandbox.stub().returns({ intercept: true });

      const result = router.intercept({ page: 'home', params: {} }, router.routes.category);

      expect(result.intercept).to.be.true;
      expect(router.interceptor.firstCall.args[1]).to.deep.equal({ loggedIn: false });
    });

    it('should let the navigation description win over the interceptor result', () => {
      router.interceptor = () => ({ intercept: true, from: 'ignored', to: 'ignored' });
      const result = router.intercept({ page: 'home', params: {} }, router.routes.category);
      expect(result.from).to.deep.equal({ page: 'home', params: {} });
    });
  });

  describe('#go', () => {
    beforeEach(addSampleRoutes);

    it('should push the resolved path to the browser', () => {
      router.go('category', { name: 'beef' });
      expect(router.locationHash.calledOnceWith('/categories/beef')).to.be.true;
    });

    it('should mark the navigation as in progress', () => {
      router.go('category', { name: 'beef' });
      expect(router.isNavigationInProgress).to.be.true;
    });

    it('should do nothing while another navigation is in progress', () => {
      router.isNavigationInProgress = true;
      router.go('category', { name: 'beef' });
      expect(router.locationHash.called).to.be.false;
    });

    it('should strip a leading slash from the route name', () => {
      router.go('/category', { name: 'beef' });
      expect(router.locationHash.calledOnceWith('/categories/beef')).to.be.true;
    });

    it('should not navigate when the path is already the current one', () => {
      router._getHashPath.returns('/categories/beef');
      router.go('category', { name: 'beef' });
      expect(router.locationHash.called).to.be.false;
      expect(router.isNavigationInProgress).to.not.be.true;
    });

    it('should not navigate to an unknown route', () => {
      sandbox.stub(console, 'error');
      router.go('nowhere');
      expect(router.locationHash.called).to.be.false;
    });

    it('should replace instead of pushing when asked to', () => {
      router.go('category', { name: 'beef' }, true);
      expect(router.locationReplace.calledOnceWith('/categories/beef')).to.be.true;
      expect(router.locationHash.called).to.be.false;
    });

    it('should record the reverse navigation as a skip when asked to', () => {
      router.currentRoute = { name: 'home' };
      router.go('category', { name: 'beef' }, false, true);
      expect(router.navigationStack.isSkipNavigation({ from: 'category', to: 'home' })).to.be.true;
    });
  });

  describe('#goReplacing', () => {
    beforeEach(addSampleRoutes);

    it('should navigate replacing the current entry', () => {
      router.goReplacing('category', { name: 'beef' });
      expect(router.locationReplace.calledOnceWith('/categories/beef')).to.be.true;
    });
  });

  describe('#updatePathInBrowser', () => {
    it('should set the hash when not using the History API', () => {
      router.updatePathInBrowser('/somewhere', false);
      expect(router.locationHash.calledOnceWith('/somewhere')).to.be.true;
    });

    it('should replace the location when not using the History API', () => {
      router.updatePathInBrowser('/somewhere', true);
      expect(router.locationReplace.calledOnceWith('/somewhere')).to.be.true;
    });

    it('should push a history entry when using the History API', () => {
      router.useHistory = true;
      router.updatePathInBrowser('/somewhere', false);
      expect(router.historyPushState.calledOnceWith('/somewhere')).to.be.true;
    });

    it('should replace the history entry when using the History API', () => {
      router.useHistory = true;
      router.updatePathInBrowser('/somewhere', true);
      expect(router.historyReplaceState.calledOnceWith('/somewhere')).to.be.true;
    });
  });

  describe('#updateSubrouteInBrowser', () => {
    beforeEach(() => {
      addSampleRoutes();
      router.currentRoute = router.routes.category;
      router.currentRoute.params = { name: 'beef' };
    });

    it('should append the subroute to the current path', () => {
      router.updateSubrouteInBrowser('/step-2');
      expect(router.locationReplace.calledOnceWith('/categories/beef/step-2')).to.be.true;
    });

    it('should not double the separating slash', () => {
      router.addRoute('wild', '/wild/*', () => {});
      router.currentRoute = router.routes.wild;
      router.currentRoute.params = {};
      router.updateSubrouteInBrowser('/step-2');
      expect(router.locationReplace.calledOnceWith('/wild/step-2')).to.be.true;
    });

    it('should keep the plain path when no subroute is given', () => {
      router.updateSubrouteInBrowser('');
      expect(router.locationReplace.calledOnceWith('/categories/beef')).to.be.true;
    });

    it('should mark the hash as dirty so the router ignores its own change', () => {
      router.updateSubrouteInBrowser('/step-2');
      expect(router.hashIsDirty).to.be.true;
    });

    it('should do nothing when the current path cannot be resolved', () => {
      sandbox.stub(console, 'error');
      router.currentRoute = { name: 'nowhere', params: {} };
      router.updateSubrouteInBrowser('/step-2');
      expect(router.locationReplace.called).to.be.false;
    });
  });

  describe('#back', () => {
    beforeEach(addSampleRoutes);

    it('should navigate to the previous page and describe the move', () => {
      router.navigationStack.push({ page: 'home', params: {} });
      router.navigationStack.push({ page: 'category', params: { name: 'beef' } });

      const navigation = router.back();

      expect(navigation.from).to.deep.equal({ page: 'category', params: { name: 'beef' } });
      expect(navigation.to).to.deep.equal({ page: 'home', params: {} });
      expect(router.locationHash.calledOnceWith('/')).to.be.true;
    });

    it('should stay put when there is only one entry in the stack', () => {
      router.navigationStack.push({ page: 'home', params: {} });

      const navigation = router.back();

      expect(navigation.from).to.deep.equal({ page: 'home', params: {} });
      expect(navigation.to).to.deep.equal({ page: 'home', params: {} });
      expect(router.locationHash.called).to.be.false;
    });

    it('should step over pages marked as skip-history', () => {
      router.navigationStack.push({ page: 'home', params: {} });
      router.navigationStack.push({ page: 'recipe', params: { id: 1 } });
      router.navigationStack.push({ page: 'category', params: { name: 'beef' } });
      router.navigationStack.addSkipNavigation({
        from: 'category',
        to: 'recipe',
        skipHistory: true,
      });

      const navigation = router.back();

      expect(navigation.to).to.deep.equal({ page: 'home', params: {} });
      expect(router.locationHash.calledOnceWith('/')).to.be.true;
    });

    it('should throw when the entry it lands on has no page', () => {
      router.navigationStack.navStack = [{ params: {} }, { page: 'home', params: {} }];
      expect(() => router.back()).to.throw('No page to go back to');
    });
  });

  describe('navigation stack helpers', () => {
    it('should expose the top of the stack as the last route', () => {
      router.navigationStack.push({ page: 'home', params: {} });
      expect(router.getLastRoute()).to.deep.equal({ page: 'home', params: {} });
    });

    it('should clear the stack on init', () => {
      router.navigationStack.push({ page: 'home', params: {} });
      router.init();
      expect(router.navigationStack.length).to.equal(0);
    });

    it('should clear the stack down to a given page', () => {
      router.navigationStack.push({ page: 'home', params: {} });
      router.navigationStack.push({ page: 'category', params: {} });
      router.navigationStack.push({ page: 'recipe', params: {} });
      router.clearStackUntil('category');
      expect(router.navigationStack.navStack.map(r => r.page)).to.deep.equal(['home']);
    });

    it('should register several skip navigations at once', () => {
      router.addSkipNavigations([
        { from: 'a', to: 'b', skipHistory: true },
        { from: 'c', to: 'd', skipHistory: true },
      ]);
      expect(router.navigationStack.isSkipNavigation({ from: 'a', to: 'b' })).to.be.true;
      expect(router.navigationStack.isSkipNavigation({ from: 'c', to: 'd' })).to.be.true;
    });

    it('should build a fresh navigation stack', () => {
      expect(router._createNavigationStack()).to.be.instanceOf(NavigationStack);
    });
  });

  describe('accessors', () => {
    it('should round-trip the useHistory flag', () => {
      expect(router.useHistory).to.be.false;
      router.useHistory = true;
      expect(router.useHistory).to.be.true;
    });

    it('should round-trip the channel manager', () => {
      const channelManager = { publishInterceptedNavigation() {} };
      router.channelManager = channelManager;
      expect(router.channelManager).to.equal(channelManager);
    });

    it('should round-trip the current route', () => {
      const route = { name: 'home' };
      router.currentRoute = route;
      expect(router.currentRoute).to.equal(route);
    });

    it('should round-trip the routes', () => {
      const routes = { home: new Route('home', '/', () => {}) };
      router.routes = routes;
      expect(router.routes).to.equal(routes);
    });
  });

  describe('#_getURLPath', () => {
    it('should strip the leading slashes of the pathname', () => {
      expect(router._getURLPath()).to.equal(location.pathname.replace(/^\/*/, '/'));
    });
  });

  describe('#handler', () => {
    it('should be a no-op placeholder', () => {
      expect(router.handler({ name: 'home' })).to.be.undefined;
    });
  });

  describe('#start / #stop / #destroy', () => {
    it('should return a subscription and reuse it while running', () => {
      const first = router.start();
      expect(first).to.exist;
      expect(router.start()).to.equal(first);
    });

    it('should let a new subscription be created after stopping', () => {
      const first = router.start();
      router.stop();
      expect(router.start()).to.not.equal(first);
    });

    it('should clear the in-progress flags on stop', () => {
      router.isNavigationInProgress = true;
      router.hashIsDirty = true;
      router.stop();
      expect(router.isNavigationInProgress).to.be.false;
      expect(router.hashIsDirty).to.be.false;
    });

    it('should tolerate being stopped when it was never started', () => {
      expect(() => router.stop()).to.not.throw();
    });

    it('should adopt the route matching the current location on start', () => {
      const handler = sandbox.stub();
      router.handler = handler;
      const current = router.addRoute('current', '/current', () => {});

      router.start();

      expect(router.currentRoute).to.equal(current);
      expect(handler.calledOnceWith(current)).to.be.true;
    });

    it('should redirect to the 404 page when the location matches nothing', () => {
      router.addRoute('home', '/', () => {});
      router.addRoute('404', '/not-found', () => {}, true);
      const goReplacing = sandbox.stub(router, 'goReplacing');

      router.start();

      expect(goReplacing.calledOnceWith('404')).to.be.true;
    });

    it('should drop the routes on destroy', () => {
      addSampleRoutes();
      router.destroy();
      expect(router.routes).to.deep.equal({});
    });
  });
});
