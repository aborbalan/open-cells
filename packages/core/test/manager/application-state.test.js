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
import { ApplicationStateManager } from '../../src/manager/application-state.js';
import { ComponentConnector } from '../../src/component-connector.js';
import { CellsStorage } from '../../src/manager/storage.js';

describe('ApplicationStateManager', () => {
  let applicationStateManager;
  let componentConnectorStub;
  let storageStub;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    componentConnectorStub = sandbox.createStubInstance(ComponentConnector);
    storageStub = sandbox.createStubInstance(CellsStorage);
    // The manager builds its own storage in the constructor, so it has to be
    // intercepted on the prototype before the instance exists.
    sandbox.stub(ApplicationStateManager.prototype, '_getAppStateStorage').returns(storageStub);
    applicationStateManager = new ApplicationStateManager({
      ComponentConnector: componentConnectorStub,
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#constructor', () => {
    it('should keep the connector it was given', () => {
      expect(applicationStateManager.ComponentConnector).to.equal(componentConnectorStub);
    });

    it('should open its own storage', () => {
      expect(applicationStateManager.storage).to.equal(storageStub);
    });
  });

  describe('#saveAppState', () => {
    it('should add the channel value to the stored state', () => {
      const state = {};
      storageStub.getItem.returns(state);

      applicationStateManager.saveAppState('recipes', { id: 1 });

      expect(state.recipes).to.deep.equal({ id: 1 });
      expect(storageStub.setItem.calledOnceWith('state', state)).to.be.true;
    });

    it('should keep the values already in the state', () => {
      const state = { categories: ['beef'] };
      storageStub.getItem.returns(state);

      applicationStateManager.saveAppState('recipes', { id: 1 });

      expect(state).to.deep.equal({ categories: ['beef'], recipes: { id: 1 } });
    });

    it('should overwrite the value of a channel already stored', () => {
      const state = { recipes: { id: 1 } };
      storageStub.getItem.returns(state);

      applicationStateManager.saveAppState('recipes', { id: 2 });

      expect(state.recipes).to.deep.equal({ id: 2 });
    });

    it('should write nothing when there is no state to add to', () => {
      storageStub.getItem.returns(null);

      applicationStateManager.saveAppState('recipes', { id: 1 });

      expect(storageStub.setItem.called).to.be.false;
    });
  });

  describe('#loadAppState', () => {
    it('should publish every stored channel', () => {
      storageStub.getItem.returns({ recipes: { id: 1 }, categories: ['beef'] });

      applicationStateManager.loadAppState();

      expect(componentConnectorStub.publish.calledWith('recipes', { id: 1 })).to.be.true;
      expect(componentConnectorStub.publish.calledWith('categories', ['beef'])).to.be.true;
      expect(componentConnectorStub.publish.callCount).to.equal(2);
    });

    it('should publish nothing when there is no stored state', () => {
      storageStub.getItem.returns(null);

      applicationStateManager.loadAppState();

      expect(componentConnectorStub.publish.called).to.be.false;
    });

    it('should publish nothing when the stored state is empty', () => {
      storageStub.getItem.returns({});

      applicationStateManager.loadAppState();

      expect(componentConnectorStub.publish.called).to.be.false;
    });
  });
});
