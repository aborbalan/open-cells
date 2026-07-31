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
import { ActionChannelManager } from '../../src/manager/action-channels.js';
import { BridgeChannelManager } from '../../src/manager/bridge-channels.js';
import { ComponentConnector } from '../../src/component-connector.js';
import { eventManager } from '../../src/manager/events.js';
import { Constants } from '../../src/constants.js';
import { BRIDGE_CHANNEL_PREFIX } from '../../src/constants.js';

const { externalEventsCodes } = Constants;

describe('ActionChannelManager', () => {
  let actionChannelManager;
  let bridge;
  let componentConnector;
  let bridgeChannelManager;
  let templateManager;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    componentConnector = new ComponentConnector(BRIDGE_CHANNEL_PREFIX);
    bridgeChannelManager = new BridgeChannelManager({
      ComponentConnector: componentConnector,
      channelPrefix: BRIDGE_CHANNEL_PREFIX,
    });
    templateManager = {
      selected: 'home',
      removeTemplates: sandbox.spy(),
      removeTemplate: sandbox.spy(),
    };
    bridge = {
      BridgeChannelManager: bridgeChannelManager,
      TemplateManager: templateManager,
      crossContainerId: 'cross-container',
      logout: sandbox.spy(),
      setInterceptorContext: sandbox.spy(),
    };
    actionChannelManager = new ActionChannelManager(bridge);
  });

  afterEach(() => {
    sandbox.restore();
    delete window.AppConfig;
    delete window.I18nMsg;
  });

  /** Publishes onto one of the four action channels the manager listens to. */
  function publishAction(channelName, detail) {
    const evt = new Event(channelName);
    evt.detail = detail;
    bridgeChannelManager.getBridgeChannel(channelName).next(evt);
  }

  describe('#constructor', () => {
    it('should hold on to the bridge and its two managers', () => {
      expect(actionChannelManager.bridge).to.equal(bridge);
      expect(actionChannelManager.ChannelManager).to.equal(bridgeChannelManager);
      expect(actionChannelManager.TemplateManager).to.equal(templateManager);
    });
  });

  describe('#isAllowedProperty', () => {
    it('should allow a plain value property', () => {
      bridge.debug = false;
      expect(actionChannelManager.isAllowedProperty('debug')).to.be.true;
    });

    it('should allow a property that does not exist yet', () => {
      expect(actionChannelManager.isAllowedProperty('brandNew')).to.be.true;
    });

    it('should refuse to overwrite a method', () => {
      expect(actionChannelManager.isAllowedProperty('logout')).to.be.false;
    });
  });

  describe('#updateProperty', () => {
    it('should update a property of the bridge', () => {
      actionChannelManager.updateProperty('testProp', 'testValue');
      expect(bridge.testProp).to.equal('testValue');
    });

    it('should not overwrite a method of the bridge', () => {
      actionChannelManager.updateProperty('logout', 'testValue');
      expect(bridge.logout).to.be.a('function');
    });

    it('should mirror the value onto the global AppConfig when there is one', () => {
      window.AppConfig = {};
      actionChannelManager.updateProperty('testProp', 'testValue');
      expect(window.AppConfig.testProp).to.equal('testValue');
    });

    it('should not fail when there is no global AppConfig', () => {
      expect(() => actionChannelManager.updateProperty('testProp', 'testValue')).to.not.throw();
    });
  });

  describe('#subscribeAll', () => {
    it('should apply a configuration published on the config channel', () => {
      actionChannelManager.subscribeAll();

      publishAction('config', { debug: true });

      expect(bridge.debug).to.be.true;
    });

    it('should log out when the logout channel fires', () => {
      actionChannelManager.subscribeAll();

      publishAction('logout', {});

      expect(bridge.logout.calledOnce).to.be.true;
    });

    it('should set the interceptor context from the interceptor_context channel', () => {
      actionChannelManager.subscribeAll();

      publishAction('interceptor_context', { token: 'abc' });

      expect(bridge.setInterceptorContext.calledOnceWith({ token: 'abc' })).to.be.true;
    });

    it('should set the language from the locales channel', () => {
      window.I18nMsg = { lang: 'en' };
      actionChannelManager.subscribeAll();

      publishAction('locales', { lang: 'es' });

      expect(window.I18nMsg.lang).to.equal('es');
    });
  });

  describe('#_configSubscriptor', () => {
    it('should apply every property of the configuration', () => {
      actionChannelManager._configSubscriptor({ detail: { debug: true, mainNode: 'app' } });
      expect(bridge.debug).to.be.true;
      expect(bridge.mainNode).to.equal('app');
    });

    it('should ignore an event with no detail', () => {
      expect(() => actionChannelManager._configSubscriptor({ detail: undefined })).to.not.throw();
      expect(templateManager.removeTemplates.called).to.be.false;
    });

    it('should drop the cached templates when the app changes', () => {
      actionChannelManager._configSubscriptor({ detail: { app: 'other-app' } });
      expect(templateManager.removeTemplates.calledOnceWith('home', 'cross-container')).to.be.true;
    });

    it('should drop the cached templates when the pages path changes', () => {
      actionChannelManager._configSubscriptor({ detail: { pagesPath: '/other/pages' } });
      expect(templateManager.removeTemplates.calledOnce).to.be.true;
    });

    it('should keep the templates when neither app nor pagesPath change', () => {
      actionChannelManager._configSubscriptor({ detail: { debug: true } });
      expect(templateManager.removeTemplates.called).to.be.false;
    });

    it('should remove the previously selected template once the new one is registered', () => {
      actionChannelManager._configSubscriptor({ detail: { app: 'other-app' } });

      eventManager.emit(externalEventsCodes.TEMPLATE_REGISTERED, {});

      expect(templateManager.removeTemplate.calledOnceWith('home')).to.be.true;
    });
  });

  describe('#_localesSubscriptor', () => {
    it('should set the language on the global I18nMsg', () => {
      window.I18nMsg = { lang: 'en' };
      actionChannelManager._localesSubscriptor({ detail: { lang: 'es' } });
      expect(window.I18nMsg.lang).to.equal('es');
    });

    it('should do nothing when there is no global I18nMsg', () => {
      expect(() =>
        actionChannelManager._localesSubscriptor({ detail: { lang: 'es' } }),
      ).to.not.throw();
    });

    it('should do nothing when the event carries no language', () => {
      window.I18nMsg = { lang: 'en' };
      actionChannelManager._localesSubscriptor({ detail: {} });
      expect(window.I18nMsg.lang).to.equal('en');
    });

    it('should do nothing when the event has no detail', () => {
      window.I18nMsg = { lang: 'en' };
      actionChannelManager._localesSubscriptor({ detail: undefined });
      expect(window.I18nMsg.lang).to.equal('en');
    });
  });

  describe('#_logoutSubscriptor', () => {
    it('should ask the bridge to log out', () => {
      actionChannelManager._logoutSubscriptor();
      expect(bridge.logout.calledOnce).to.be.true;
    });
  });

  describe('#_appContextSubscriptor', () => {
    it('should hand the detail to the bridge as the interceptor context', () => {
      actionChannelManager._appContextSubscriptor({ detail: { token: 'abc' } });
      expect(bridge.setInterceptorContext.calledOnceWith({ token: 'abc' })).to.be.true;
    });
  });
});
