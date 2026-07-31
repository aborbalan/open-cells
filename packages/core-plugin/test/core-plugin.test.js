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
import { CorePlugin, plugCellsCore } from '../src/CorePlugin.js';

/** The API the plugin grafts onto whatever object it is given. */
const CORE_API = [
  'subscribe',
  'unsubscribe',
  'publish',
  'publishOn',
  'navigate',
  'updateInterceptorContext',
  'resetInterceptorContext',
  'getInterceptorContext',
  'setInterceptorContext',
  'getCurrentRoute',
  'updateSubroute',
];

describe('CorePlugin', () => {
  let corePlugin;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    corePlugin = new CorePlugin();
  });

  afterEach(() => {
    sandbox.restore();
    // registerService writes into a module-level object shared by every instance.
    delete corePlugin.services.customService;
  });

  describe('#constructor', () => {
    it('should register the whole core API as services', () => {
      CORE_API.forEach(name => {
        expect(corePlugin.services[name], name).to.be.a('function');
      });
    });

    it('should share its service registry with every other instance', () => {
      expect(new CorePlugin().services).to.equal(corePlugin.services);
    });
  });

  describe('#registerService', () => {
    it('should add a service of its own', () => {
      const fn = () => {};
      corePlugin.registerService('customService', fn);
      expect(corePlugin.services.customService).to.equal(fn);
    });

    it('should replace a service registered under the same name', () => {
      corePlugin.registerService('customService', () => 'first');
      corePlugin.registerService('customService', () => 'second');
      expect(corePlugin.services.customService()).to.equal('second');
    });
  });

  describe('#_plugCellsCore', () => {
    it('should graft the whole API onto an object', () => {
      const element = {};
      corePlugin._plugCellsCore(element, false);
      CORE_API.forEach(name => {
        expect(element[name], name).to.be.a('function');
      });
    });

    it('should leave the services unbound when asked not to bind', () => {
      const element = { marker: 'element' };
      corePlugin.registerService('customService', function () {
        return this;
      });

      corePlugin._plugCellsCore(element, false);

      // Unbound: `this` is whatever the call site provides, so calling it as a
      // method of the element still resolves to the element.
      expect(element.customService()).to.equal(element);
    });

    it('should bind to the element by default', () => {
      const element = { marker: 'element' };
      const other = {};
      corePlugin.registerService('customService', function () {
        return this;
      });

      corePlugin._plugCellsCore(element);
      other.customService = element.customService;

      expect(other.customService()).to.equal(element);
    });

    it('should bind the services to the element when asked to', () => {
      const element = { marker: 'element' };
      const other = {};
      corePlugin.registerService('customService', function () {
        return this;
      });

      corePlugin._plugCellsCore(element, true);
      other.customService = element.customService;

      // Bound: `this` stays the element even when called from somewhere else.
      expect(other.customService()).to.equal(element);
    });
  });

  describe('#_plugCellsCoreToPrototype', () => {
    it('should put the API on the prototype so every instance has it', () => {
      class Host {}
      corePlugin._plugCellsCoreToPrototype(Host, false);

      const instance = new Host();
      CORE_API.forEach(name => {
        expect(instance[name], name).to.be.a('function');
      });
      expect(Object.prototype.hasOwnProperty.call(instance, 'publish')).to.be.false;
    });

    it('should bind to the class itself by default', () => {
      class Host {}
      corePlugin.registerService('customService', function () {
        return this;
      });

      corePlugin._plugCellsCoreToPrototype(Host);

      // Bound to the constructor, not to the instance, when no flag is given.
      expect(new Host().customService()).to.equal(Host);
    });

    it('should leave the definitions writable and configurable', () => {
      class Host {}
      corePlugin._plugCellsCoreToPrototype(Host, false);

      const descriptor = Object.getOwnPropertyDescriptor(Host.prototype, 'publish');
      expect(descriptor.writable).to.be.true;
      expect(descriptor.configurable).to.be.true;
    });
  });

  describe('#addCellsCoreToPrototype', () => {
    it('should put the API on the prototype', () => {
      class Host {}
      corePlugin.addCellsCoreToPrototype(Host);
      expect(new Host().publish).to.be.a('function');
    });
  });

  describe('plugCellsCore', () => {
    it('should graft the API onto the element and hand it back', () => {
      const element = {};
      expect(plugCellsCore(element)).to.equal(element);
      CORE_API.forEach(name => {
        expect(element[name], name).to.be.a('function');
      });
    });

    it('should work on a custom element instance', () => {
      const element = document.createElement('div');
      plugCellsCore(element);
      expect(element.navigate).to.be.a('function');
    });
  });

  describe('#__callBridge without a bridge', () => {
    // core captured this array at module load, so it has to be emptied in place:
    // replacing window.cellsBridgeQueue would leave core pushing into the old one.
    beforeEach(() => {
      window.cellsBridgeQueue.length = 0;
    });

    it('should queue the command instead of failing', () => {
      const result = corePlugin.__callBridge('navigate', 'home', { id: 1 });

      expect(result).to.be.undefined;
      expect(window.cellsBridgeQueue).to.deep.equal([
        { command: 'navigate', parameters: ['home', { id: 1 }] },
      ]);
    });

    it('should queue a command with no parameters', () => {
      corePlugin.__callBridge('resetInterceptorContext');
      expect(window.cellsBridgeQueue).to.deep.equal([
        { command: 'resetInterceptorContext', parameters: [] },
      ]);
    });

    it('should queue whatever a grafted service is asked to do', () => {
      const element = {};
      plugCellsCore(element);

      element.navigate('home');

      expect(window.cellsBridgeQueue[0].command).to.equal('navigate');
    });
  });
});
