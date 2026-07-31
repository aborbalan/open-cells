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
import { CorePlugin, plugCellsCore } from '../src/CorePlugin.js';

/**
 * `$bridge` is module state in core: once a Bridge exists it stays. These cases therefore
 * live apart from the ones that need the queue, which only fills while no bridge is up.
 */
describe('CorePlugin with a live bridge', () => {
  const bridgeFixture = useBridge({
    routes: {
      home: { path: '/', action: () => Promise.resolve() },
      category: { path: '/categories/:name', action: () => Promise.resolve() },
    },
  });
  let corePlugin;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    corePlugin = new CorePlugin();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#__callBridge', () => {
    it('should run the command on the bridge and hand back its result', () => {
      bridgeFixture.bridge.setInterceptorContext({ token: 'abc' });
      expect(corePlugin.__callBridge('getInterceptorContext')).to.deep.equal({ token: 'abc' });
    });

    it('should pass the parameters through', () => {
      const go = sandbox.stub(bridgeFixture.bridge.Router, 'go');
      corePlugin.__callBridge('navigate', 'category', { name: 'beef' });
      expect(go.calledOnceWith('category', { name: 'beef' })).to.be.true;
    });

    it('should refuse a command the bridge does not have', () => {
      expect(() => corePlugin.__callBridge('notACommand')).to.throw(
        'Invalid cells bridge command execution: notACommand',
      );
    });
  });

  describe('the grafted API', () => {
    let element;

    beforeEach(() => {
      element = document.createElement('div');
      document.body.appendChild(element);
      plugCellsCore(element);
    });

    afterEach(() => {
      element.remove();
    });

    it('should subscribe the element to a channel', () => {
      element.recipe = 'initial';
      element.subscribe('recipes', value => {
        element.recipe = value;
      });

      element.publish('recipes', { id: 1 });

      expect(element.recipe).to.deep.equal({ id: 1 });
    });

    it('should unsubscribe the element from a channel', () => {
      element.recipe = 'initial';
      element.subscribe('recipes', value => {
        element.recipe = value;
      });

      element.unsubscribe('recipes');
      element.publish('recipes', { id: 1 });

      expect(element.recipe).to.equal('initial');
    });

    it('should publish an element event onto a channel', () => {
      const received = [];
      bridgeFixture.bridge.ComponentConnector.getChannel('recipes').subscribe(evt => received.push(evt));

      element.publishOn('recipes', element, 'picked');
      element.dispatchEvent(new CustomEvent('picked', { detail: { id: 2 } }));

      expect(received).to.have.lengthOf(1);
      expect(received[0].detail).to.deep.equal({ id: 2 });
    });

    it('should navigate through the router', () => {
      const go = sandbox.stub(bridgeFixture.bridge.Router, 'go');
      element.navigate('category', { name: 'beef' });
      expect(go.calledOnceWith('category', { name: 'beef' })).to.be.true;
    });

    it('should read the current route', () => {
      expect(element.getCurrentRoute().name).to.equal('home');
    });

    it('should update the subroute', () => {
      const update = sandbox.stub(bridgeFixture.bridge.Router, 'updateSubrouteInBrowser');
      element.updateSubroute('/step-2');
      expect(update.calledOnceWith('/step-2')).to.be.true;
    });

    it('should round-trip the interceptor context', () => {
      element.setInterceptorContext({ token: 'a' });
      expect(element.getInterceptorContext()).to.deep.equal({ token: 'a' });

      element.updateInterceptorContext({ user: 'b' });
      expect(element.getInterceptorContext()).to.deep.equal({ token: 'a', user: 'b' });

      element.resetInterceptorContext();
      expect(element.getInterceptorContext()).to.deep.equal({});
    });

    it('should subscribe with the element as the subscribing node', () => {
      element.recipe = 'initial';
      element.subscribe('recipes', value => {
        element.recipe = value;
      });

      expect(bridgeFixture.bridge.ComponentConnector.subscriptors.has(element)).to.be.true;
    });
  });
});

