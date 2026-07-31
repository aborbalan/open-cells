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
import { Template } from '../src/template.js';

describe('Template', () => {
  let template;

  beforeEach(() => {
    template = new Template({ tagName: 'div' });
  });

  describe('#constructor', () => {
    it('should build its own node from a tag name', () => {
      expect(template.node.tagName).to.equal('DIV');
      expect(template.type).to.equal('TEMPLATE');
      expect(template.name).to.equal('');
    });

    it('should adopt a node it is handed', () => {
      const node = document.createElement('section');
      expect(new Template({ node }).node).to.equal(node);
    });

    it('should prefer the given node over the tag name', () => {
      const node = document.createElement('section');
      expect(new Template({ node, tagName: 'div' }).node).to.equal(node);
    });

    it('should throw when given neither a node nor a tag name', () => {
      expect(() => new Template({})).to.throw('Template must have a node or a tagName');
    });
  });

  describe('#getZone', () => {
    it('should find a zone by id inside the template', () => {
      const zone = document.createElement('div');
      zone.id = 'content';
      template.node.appendChild(zone);
      expect(template.getZone('content')).to.equal(zone);
    });

    it('should return the template node itself when no zone is named', () => {
      expect(template.getZone(undefined)).to.equal(template.node);
    });

    it('should fall back to the template node when the zone is not there', () => {
      expect(template.getZone('missing')).to.equal(template.node);
    });
  });

  describe('state', () => {
    it('should mark the template as cached', () => {
      template.cache();
      expect(template.node.getAttribute('state')).to.equal('cached');
    });

    it('should mark the template as active', () => {
      template.activate();
      expect(template.node.getAttribute('state')).to.equal('active');
    });

    it('should mark the template as inactive', () => {
      template.deactivate();
      expect(template.node.getAttribute('state')).to.equal('inactive');
    });
  });

  describe('attributes', () => {
    it('should set an attribute on the template node', () => {
      template._setAttribute('test', 'value');
      expect(template.node.getAttribute('test')).to.equal('value');
    });

    it('should read an attribute back', () => {
      template.node.setAttribute('test', 'value');
      expect(template._getAttribute('test')).to.equal('value');
    });

    it('should read a missing attribute as an empty string', () => {
      expect(template._getAttribute('missing')).to.equal('');
    });

    it('should complain when the node cannot hold attributes', () => {
      const broken = new Template({ node: document.createElement('div') });
      broken.node = { tagName: 'DIV' };
      expect(() => broken._setAttribute('state', 'active')).to.throw('has no valid template');
    });

    it('should complain when reading from a node that cannot hold attributes', () => {
      const broken = new Template({ node: document.createElement('div') });
      broken.node = { tagName: 'DIV' };
      expect(() => broken._getAttribute('state')).to.throw('has no valid template');
    });
  });

  describe('#_getTemplate', () => {
    it('should return a plain node as the template', () => {
      expect(template._getTemplate(template.node)).to.equal(template.node);
    });

    it('should look inside a page for its cells-template', () => {
      const page = document.createElement('home-page');
      const inner = document.createElement('cells-template');
      page.appendChild(inner);
      expect(template._getTemplate(page)).to.equal(inner);
    });

    it('should accept a node marked with data-cells-type', () => {
      const page = document.createElement('home-page');
      const inner = document.createElement('div');
      inner.setAttribute('data-cells-type', 'template');
      page.appendChild(inner);
      expect(template._getTemplate(page)).to.equal(inner);
    });

    it('should fall back to the page itself when it holds no template', () => {
      const page = document.createElement('home-page');
      expect(template._getTemplate(page)).to.equal(page);
    });

    it('should look in the shadow root when the page has one', () => {
      const page = document.createElement('shadow-page');
      const root = page.attachShadow({ mode: 'open' });
      const inner = document.createElement('cells-template');
      root.appendChild(inner);
      expect(template._getTemplate(page)).to.equal(inner);
    });
  });

  describe('#config', () => {
    it('should name the template and its node', () => {
      template.config({ name: 'home', template: { id: 'templateId', name: 'templateName' } });
      expect(template.name).to.equal('home');
      expect(template.node.id).to.equal('templateId');
      expect(template.node.name).to.equal('templateName');
    });
  });
});
