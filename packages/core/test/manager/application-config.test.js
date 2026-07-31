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
import { ApplicationConfigManager } from '../../src/manager/application-config.js';
import { ActionChannelManager } from '../../src/manager/action-channels.js';
import { CellsStorage } from '../../src/manager/storage.js';

describe('ApplicationConfigManager', () => {
  let applicationConfigManager;
  let actionChannelManager;
  let storageStub;
  let bridge;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // A bare object rather than a stubbed Bridge: updateProperty writes onto it, and
    // isAllowedProperty asks whether the target is already a function.
    bridge = { logout() {} };
    actionChannelManager = new ActionChannelManager({
      BridgeChannelManager: {},
      TemplateManager: {},
      ...bridge,
    });
    actionChannelManager.bridge = bridge;

    storageStub = sandbox.createStubInstance(CellsStorage);
    sandbox.stub(ApplicationConfigManager.prototype, '_getAppConfigStorage').returns(storageStub);

    applicationConfigManager = new ApplicationConfigManager({
      ActionChannelManager: actionChannelManager,
    });
  });

  afterEach(() => {
    sandbox.restore();
    delete window.AppConfig;
  });

  describe('#constructor', () => {
    it('should keep the action channel manager it was given', () => {
      expect(applicationConfigManager.ActionChannelManager).to.equal(actionChannelManager);
    });

    it('should open its own storage', () => {
      expect(applicationConfigManager.storage).to.equal(storageStub);
    });
  });

  describe('#saveAppConfig', () => {
    it('should store the properties the bridge allows', () => {
      applicationConfigManager.saveAppConfig({ debug: true, mainNode: 'app' });

      expect(storageStub.setItem.calledOnce).to.be.true;
      expect(storageStub.setItem.firstCall.args[0]).to.equal('config');
      expect(storageStub.setItem.firstCall.args[1]).to.deep.equal({
        debug: true,
        mainNode: 'app',
      });
    });

    it('should leave out a property that would overwrite a method', () => {
      applicationConfigManager.saveAppConfig({ debug: true, logout: 'nope' });

      expect(storageStub.setItem.firstCall.args[1]).to.deep.equal({ debug: true });
    });

    it('should store nothing when no property is allowed', () => {
      applicationConfigManager.saveAppConfig({ logout: 'nope' });

      expect(storageStub.setItem.called).to.be.false;
    });

    it('should store nothing for an empty configuration', () => {
      applicationConfigManager.saveAppConfig({});

      expect(storageStub.setItem.called).to.be.false;
    });
  });

  describe('#loadAppConfig', () => {
    it('should apply every stored property to the bridge', () => {
      storageStub.getItem.returns({ debug: true, mainNode: 'app' });

      applicationConfigManager.loadAppConfig();

      expect(bridge.debug).to.be.true;
      expect(bridge.mainNode).to.equal('app');
    });

    it('should read the configuration under the config key', () => {
      storageStub.getItem.returns({});

      applicationConfigManager.loadAppConfig();

      expect(storageStub.getItem.calledOnceWith('config')).to.be.true;
    });

    it('should do nothing when nothing was stored', () => {
      storageStub.getItem.returns(null);
      const update = sandbox.spy(actionChannelManager, 'updateProperty');

      applicationConfigManager.loadAppConfig();

      expect(update.called).to.be.false;
    });
  });
});
