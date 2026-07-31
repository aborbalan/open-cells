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
import { ElementAdapter } from '../../src/adapter/element-adapter.js';

if (!customElements.get('adapter-resolved')) {
  customElements.define('adapter-resolved', class extends HTMLElement {});
}

describe('ElementAdapter', () => {
  let elementAdapter;
  let node;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    elementAdapter = new ElementAdapter({});
    node = document.createElement('div');
  });

  afterEach(() => {
    sandbox.restore();
  });

  /** Builds the kind of event the channels carry. */
  function event(type, detail) {
    const evt = new Event(type);
    evt.detail = detail;
    return evt;
  }

  describe('#isUnresolved', () => {
    it('should say a plain element is resolved', () => {
      expect(elementAdapter.isUnresolved(node)).to.be.false;
    });

    it('should say a registered custom element is resolved', () => {
      expect(elementAdapter.isUnresolved(document.createElement('adapter-resolved'))).to.be.false;
    });

    it('should say an unregistered custom element is unresolved', () => {
      expect(elementAdapter.isUnresolved(document.createElement('adapter-unknown'))).to.be.true;
    });
  });

  describe('#isInstance', () => {
    it('should recognise a registered custom element', () => {
      expect(elementAdapter.isInstance(document.createElement('adapter-resolved'))).to.be.true;
    });

    it('should reject a plain element', () => {
      expect(elementAdapter.isInstance(node)).to.be.false;
    });

    it('should reject an unregistered custom element', () => {
      expect(elementAdapter.isInstance(document.createElement('adapter-unknown'))).to.be.false;
    });
  });

  describe('#isEventAtTarget', () => {
    it('should accept an event that reached its target', () => {
      expect(elementAdapter.isEventAtTarget({ eventPhase: Event.AT_TARGET })).to.be.true;
    });

    it('should reject an event that is only bubbling through', () => {
      expect(elementAdapter.isEventAtTarget({ eventPhase: Event.BUBBLING_PHASE })).to.be.false;
    });

    it('should reject an event in the capturing phase', () => {
      expect(elementAdapter.isEventAtTarget({ eventPhase: Event.CAPTURING_PHASE })).to.be.false;
    });
  });

  describe('#dispatchActionFunction', () => {
    it('should call the given function with the event detail', () => {
      const method = sandbox.spy();
      elementAdapter.dispatchActionFunction(event('picked', { id: 1 }), node, method);
      expect(method.calledOnceWith({ id: 1 })).to.be.true;
    });

    it('should call the named method of the node', () => {
      node.onPicked = sandbox.spy();
      elementAdapter.dispatchActionFunction(event('picked', { id: 1 }), node, 'onPicked');
      expect(node.onPicked.calledOnceWith({ id: 1 })).to.be.true;
    });

    it('should do nothing when the node has no such method', () => {
      expect(() =>
        elementAdapter.dispatchActionFunction(event('picked', {}), node, 'missing'),
      ).to.not.throw();
    });

    it('should do nothing when the named property is not callable', () => {
      node.notAMethod = 'just a string';
      expect(() =>
        elementAdapter.dispatchActionFunction(event('picked', {}), node, 'notAMethod'),
      ).to.not.throw();
    });
  });

  describe('#dispatchActionProperty', () => {
    it('should assign the detail to a property that already holds a value', () => {
      node.recipe = 'initial';
      elementAdapter.dispatchActionProperty(event('picked', { id: 1 }), node, 'recipe');
      expect(node.recipe).to.deep.equal({ id: 1 });
    });

    it('should fall back to an attribute when the property is empty', () => {
      elementAdapter.dispatchActionProperty(event('picked', 'beef'), node, 'recipe');
      expect(node.getAttribute('recipe')).to.equal('beef');
    });

    it('should always write a whitelisted name as an attribute', () => {
      node.disabled = 'initial';
      elementAdapter.dispatchActionProperty(event('picked', 'true'), node, 'disabled');
      expect(node.getAttribute('disabled')).to.equal('true');
    });

    it('should take the value out of a *-changed event', () => {
      node.recipe = 'initial';
      elementAdapter.dispatchActionProperty(
        event('recipe-changed', { value: { id: 2 } }),
        node,
        'recipe',
      );
      expect(node.recipe).to.deep.equal({ id: 2 });
    });

    it('should remove the attribute when a boolean false arrives', () => {
      node.setAttribute('recipe', 'something');
      elementAdapter.dispatchActionProperty(event('picked', false), node, 'recipe');
      expect(node.getAttribute('recipe')).to.be.null;
    });
  });

  describe('#_getPropertyChangedName', () => {
    it('should derive the property from a *-changed event', () => {
      expect(elementAdapter._getPropertyChangedName('recipe-changed')).to.equal('recipe');
    });

    it('should camel-case a dashed property name', () => {
      expect(elementAdapter._getPropertyChangedName('my-recipe-changed')).to.equal('myRecipe');
    });

    it('should return nothing for an event that is not a change', () => {
      expect(elementAdapter._getPropertyChangedName('picked')).to.be.undefined;
    });
  });

  describe('#_parseActionInEvent', () => {
    it('should use the whole detail for a plain event', () => {
      const parsed = elementAdapter._parseActionInEvent(event('picked', { id: 1 }), 'recipe', node);
      expect(parsed).to.deep.equal({ path: 'recipe', value: { id: 1 }, property: 'recipe' });
    });

    it('should unwrap the value of a *-changed event', () => {
      const parsed = elementAdapter._parseActionInEvent(
        event('recipe-changed', { value: 'beef' }),
        'meal',
        node,
      );
      expect(parsed).to.deep.equal({ path: 'meal', value: 'beef', property: 'meal' });
    });

    it('should rewrite the path of a *-changed event onto the target property', () => {
      const parsed = elementAdapter._parseActionInEvent(
        event('recipe-changed', { value: 'beef', path: 'recipe.name' }),
        'meal',
        node,
      );
      expect(parsed.path).to.equal('meal.name');
    });

    it('should fall back to the event property when no target path is given', () => {
      const parsed = elementAdapter._parseActionInEvent(
        event('recipe-changed', { value: 'beef' }),
        undefined,
        node,
      );
      expect(parsed.property).to.equal('recipe');
    });
  });
});
