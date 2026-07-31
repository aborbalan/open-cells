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
import { Route } from '../src/route';

describe('Route', () => {
  let route;
  let mockAction;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    mockAction = sandbox.stub();
    route = new Route('test', '/test/:id', mockAction);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#constructor', () => {
    it('should create a new Route instance', () => {
      expect(route.name).to.equal('test');
      expect(route.patterns).to.deep.equal(['/test/:id']);
      expect(route.action).to.equal(mockAction);
    });

    it('should wrap a single pattern in an array', () => {
      expect(new Route('single', '/only', mockAction).patterns).to.deep.equal(['/only']);
    });

    it('should keep an array of patterns as given', () => {
      const multi = new Route('multi', ['/a', '/b/:id'], mockAction);
      expect(multi.patterns).to.deep.equal(['/a', '/b/:id']);
      expect(multi.regexps).to.have.lengthOf(2);
    });

    it('should default notFound to false and component to undefined', () => {
      expect(route.notFound).to.be.false;
      expect(route.component).to.be.undefined;
    });

    it('should carry the notFound flag and the component name', () => {
      const notFound = new Route('404', '/not-found', mockAction, true, 'not-found-page');
      expect(notFound.notFound).to.be.true;
      expect(notFound.component).to.equal('not-found-page');
    });
  });

  describe('#_getRegExp', () => {
    it('should return a regular expression for matching the route', () => {
      expect(route._getRegExp('/test/:id')).to.be.instanceOf(RegExp);
    });

    it('should turn a named parameter into a capturing group', () => {
      const regex = route._getRegExp('/test/:id');
      expect(regex.exec('/test/42')[1]).to.equal('42');
    });

    it('should set isWildcarded when the pattern contains a wildcard', () => {
      route._getRegExp('/test/*');
      expect(route.isWildcarded).to.be.true;
    });

    it('should leave isWildcarded false for a plain pattern', () => {
      expect(route.isWildcarded).to.be.false;
    });
  });

  describe('#path', () => {
    it('should generate a path for the route using the specified parameters', () => {
      expect(route.path({ id: 1 })).to.equal('/test/1');
    });

    it('should append the parameters that are not part of the pattern as a query string', () => {
      expect(route.path({ id: 1, foo: 'bar' })).to.equal('/test/1?foo=bar');
    });

    it('should url-encode the query values', () => {
      expect(route.path({ id: 1, q: 'a b&c' })).to.equal('/test/1?q=a%20b%26c');
    });

    it('should tolerate being called without parameters', () => {
      expect(route.path(undefined)).to.equal('/test/undefined');
    });
  });

  describe('#matchPath', () => {
    it('should match the specified path against the route patterns', () => {
      expect(route.matchPath('/test/1')).to.exist;
    });

    it('should report which pattern matched', () => {
      const multi = new Route('multi', ['/a/:id', '/b/:id'], mockAction);
      expect(multi.matchPath('/b/7').pattern).to.equal('/b/:id');
    });

    it('should return null if no match is found', () => {
      expect(route.matchPath('/no-match')).to.be.null;
    });
  });

  describe('#parsePath', () => {
    it('should parse the specified path and extract the route parameters', () => {
      route.parsePath('/test/1');
      expect(route.params).to.deep.equal({ id: 1 });
    });

    it('should keep a non-numeric parameter as a string', () => {
      route.parsePath('/test/beef');
      expect(route.params).to.deep.equal({ id: 'beef' });
    });

    it('should set subroute if path does not fully match pattern', () => {
      const routeAndSubroute = new Route('test', '/test/*', mockAction);
      routeAndSubroute.parsePath('/test/subroute');
      expect(routeAndSubroute.subroute).to.equal('/subroute');
    });

    it('should reset params and subroute when the path does not match', () => {
      route.parsePath('/test/1');
      route.parsePath('/no-match');
      expect(route.params).to.deep.equal({});
      expect(route.subroute).to.be.undefined;
    });
  });

  describe('#parseQuery', () => {
    it('should parse the specified query string and add the parameters to the route', () => {
      route.parseQuery({ foo: 'bar' });
      expect(route.params).to.deep.equal({ foo: 'bar' });
    });

    it('should merge the query on top of the path parameters', () => {
      route.parsePath('/test/1');
      route.parseQuery({ foo: 'bar' });
      expect(route.params).to.deep.equal({ id: 1, foo: 'bar' });
    });

    it('should ignore inherited properties of the query object', () => {
      const query = Object.create({ inherited: 'nope' });
      query.own = 'yes';
      route.parseQuery(query);
      expect(route.params).to.deep.equal({ own: 'yes' });
    });

    it('should leave the params untouched for an empty query', () => {
      route.parsePath('/test/1');
      route.parseQuery({});
      expect(route.params).to.deep.equal({ id: 1 });
    });
  });

  describe('#is404', () => {
    it('should check if the route represents the 404 page', () => {
      expect(route.is404()).to.be.false;
    });

    it('should be true when the route was declared as notFound', () => {
      expect(new Route('404', '/not-found', mockAction, true).is404()).to.be.true;
    });
  });

  describe('#_isNumber', () => {
    it('should check if a value is a number', () => {
      expect(route._isNumber('1')).to.be.true;
    });

    it('should accept a decimal value', () => {
      expect(route._isNumber('1.5')).to.be.true;
    });

    it('should return false if value is not a number', () => {
      expect(route._isNumber('abc')).to.be.false;
    });

    it('should return false for a value that only starts with digits', () => {
      expect(route._isNumber('1abc')).to.be.false;
    });
  });

  describe('#_parseParam', () => {
    it('should convert a numeric parameter to a number', () => {
      expect(route._parseParam('42')).to.equal(42);
    });

    it('should leave a non-numeric parameter alone', () => {
      expect(route._parseParam('beef')).to.equal('beef');
    });
  });

  describe('#handler', () => {
    it('should be a no-op placeholder', () => {
      expect(route.handler()).to.be.undefined;
    });
  });
});
