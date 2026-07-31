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
import { TemplateManager } from '../../src/manager/template.js';
import { Template } from '../../src/template.js';
import { eventManager } from '../../src/manager/events.js';
import { Constants } from '../../src/constants.js';

const { externalEventsCodes } = Constants;

describe('TemplateManager', () => {
  let templateManager;
  let host;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    templateManager = new TemplateManager();
    // removeTemplate() looks its nodes up with document.querySelector, so the
    // templates have to actually live in the document.
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    sandbox.restore();
    host.remove();
  });

  /** Creates a template and mounts its node, the way the bridge does. */
  function mount(name) {
    const template = templateManager.createTemplate(name, { tagName: 'section' });
    host.appendChild(template.node);
    return template;
  }

  describe('#constructor', () => {
    it('should default to a view limit of three', () => {
      expect(templateManager.viewLimit).to.equal(3);
    });

    it('should always keep the cross-container template', () => {
      expect(templateManager.fixedTemplates).to.deep.equal(['__cross']);
    });

    it('should size the cache from the view limit and the fixed templates', () => {
      expect(templateManager.maxSize).to.equal(4);
    });

    it('should honour a configured view limit', () => {
      expect(new TemplateManager({ viewLimit: 5 }).viewLimit).to.equal(5);
    });

    it('should fall back to three for a view limit below one', () => {
      expect(new TemplateManager({ viewLimit: 0 }).viewLimit).to.equal(3);
    });

    it('should add the persistent pages to the fixed templates', () => {
      const manager = new TemplateManager({ persistentPages: ['home'] });
      expect(manager.fixedTemplates).to.deep.equal(['__cross', 'home']);
      expect(manager.maxSize).to.equal(5);
    });
  });

  describe('#computeTemplateId', () => {
    it('should prefix the name', () => {
      expect(templateManager.computeTemplateId('home')).to.equal('cells-template-home');
    });

    it('should turn dots into dashes so the id stays a valid selector', () => {
      expect(templateManager.computeTemplateId('a.b.c')).to.equal('cells-template-a-b-c');
    });
  });

  describe('#parseTemplateName', () => {
    it('should hand the name back untouched', () => {
      expect(templateManager.parseTemplateName('home')).to.equal('home');
    });
  });

  describe('#createTemplate', () => {
    it('should create a template and cache it under its name', () => {
      const template = templateManager.createTemplate('home', { tagName: 'section' });
      expect(template).to.be.instanceOf(Template);
      expect(templateManager.get('home')).to.equal(template);
    });

    it('should give the template node the computed id', () => {
      const template = templateManager.createTemplate('home', { tagName: 'section' });
      expect(template.node.id).to.equal('cells-template-home');
    });

    it('should return the cached template on a second call', () => {
      const first = templateManager.createTemplate('home', { tagName: 'section' });
      expect(templateManager.createTemplate('home', { tagName: 'section' })).to.equal(first);
      expect(templateManager.size).to.equal(1);
    });

    it('should record the node and the insertion order', () => {
      const template = templateManager.createTemplate('home', { tagName: 'section' });
      expect(templateManager.getNode('home')).to.equal(template.node);
      expect(templateManager.locations).to.deep.equal(['home']);
    });
  });

  describe('#select', () => {
    it('should activate the chosen template', () => {
      mount('home');
      templateManager.select('home');
      expect(templateManager.get('home').node.getAttribute('state')).to.equal('active');
      expect(templateManager.selected).to.equal('home');
    });

    it('should deactivate the template that was selected before', () => {
      mount('home');
      mount('category');
      templateManager.select('home');

      templateManager.select('category');

      expect(templateManager.get('home').node.getAttribute('state')).to.equal('inactive');
      expect(templateManager.get('category').node.getAttribute('state')).to.equal('active');
    });

    it('should cache the templates that are neither the old nor the new one', () => {
      mount('home');
      mount('category');
      mount('recipe');
      templateManager.select('home');

      templateManager.select('category');

      expect(templateManager.get('recipe').node.getAttribute('state')).to.equal('cached');
    });

    it('should announce the end of the transition', () => {
      const listener = sandbox.spy();
      eventManager.once(externalEventsCodes.TEMPLATE_TRANSITION_END, listener);
      const template = mount('home');

      templateManager.select('home');

      expect(listener.calledOnceWith(template)).to.be.true;
    });
  });

  describe('cache eviction', () => {
    it('should evict the oldest removable template once the cache is full', () => {
      // maxSize is 4: three views plus the cross container.
      ['a', 'b', 'c', 'd'].forEach(mount);
      expect(templateManager.size).to.equal(4);

      mount('e');

      expect(templateManager.get('a')).to.be.undefined;
      expect(templateManager.locations).to.deep.equal(['b', 'c', 'd', 'e']);
    });

    it('should never evict a persistent page', () => {
      // viewLimit 1 plus the two fixed templates gives a maxSize of 3.
      templateManager = new TemplateManager({ viewLimit: 1, persistentPages: ['home'] });
      mount('home');
      mount('a');
      mount('b');
      expect(templateManager.size).to.equal(3);

      mount('c');

      expect(templateManager.get('home')).to.exist;
      expect(templateManager.get('a')).to.be.undefined;
    });

    it('should warn when everything left in the cache is persistent', () => {
      const warn = sandbox.stub(console, 'warn');
      templateManager = new TemplateManager({ viewLimit: 1, persistentPages: ['home', '__two'] });
      // maxSize is 4 and every one of these is fixed, so nothing can be evicted.
      templateManager.fixedTemplates = ['__cross', 'home', '__two', 'a', 'b'];
      ['__cross', 'home', '__two', 'a'].forEach(mount);

      mount('b');

      expect(warn.calledOnce).to.be.true;
      expect(warn.firstCall.args[0]).to.contain('No space left');
    });

    it('should report no removable template when every location is fixed', () => {
      templateManager.fixedTemplates = ['__cross', 'home'];
      templateManager.locations = ['__cross', 'home'];
      expect(templateManager._getOlderRemovableTemplate()).to.be.undefined;
    });
  });

  describe('#removeTemplate', () => {
    it('should take the node out of the document and forget the template', () => {
      const template = mount('home');

      templateManager.removeTemplate('home');

      expect(document.querySelector('#cells-template-home')).to.be.null;
      expect(templateManager.get('home')).to.be.undefined;
      expect(templateManager.getNode('home')).to.be.undefined;
      expect(templateManager.locations).to.not.include('home');
      expect(templateManager.size).to.equal(0);
      expect(template.node.parentNode).to.be.null;
    });

    it('should do nothing for a template it does not know', () => {
      expect(() => templateManager.removeTemplate('nowhere')).to.not.throw();
    });

    it('should complain when the node is not in the document', () => {
      templateManager.createTemplate('home', { tagName: 'section' });
      expect(() => templateManager.removeTemplate('home')).to.throw(
        'Template home node not found',
      );
    });
  });

  describe('#removeTemplates', () => {
    it('should keep the initial template and the cross container', () => {
      mount('home');
      mount('__cross');
      mount('category');
      mount('recipe');

      templateManager.removeTemplates('home', '__cross');

      expect(templateManager.get('home')).to.exist;
      expect(templateManager.get('__cross')).to.exist;
      expect(templateManager.get('category')).to.be.undefined;
      expect(templateManager.get('recipe')).to.be.undefined;
    });
  });

  describe('#removeTemplateChildrens', () => {
    it('should empty the template node', () => {
      const template = mount('home');
      template.node.appendChild(document.createElement('span'));
      template.node.appendChild(document.createElement('span'));

      templateManager.removeTemplateChildrens('home');

      expect(template.node.children).to.have.lengthOf(0);
    });

    it('should do nothing for a template it does not know', () => {
      expect(() => templateManager.removeTemplateChildrens('nowhere')).to.not.throw();
    });
  });
});
