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
import {
  Utils,
  attributeWhiteList,
  camelize,
  dasherize,
  findProperty,
  findPropertyInArray,
  findPropertyInObject,
  isPlainObject,
  setAttribute,
} from '../src/utils.js';

describe('dasherize', () => {
  it('should dasherize a camel-cased string', () => {
    expect(dasherize('myPropertyName')).to.equal('my-property-name');
  });

  it('should turn underscores and spaces into dashes', () => {
    expect(dasherize('my_property name')).to.equal('my-property-name');
  });

  it('should collapse repeated separators', () => {
    expect(dasherize('my__property   name')).to.equal('my-property-name');
  });

  it('should trim the surrounding whitespace', () => {
    expect(dasherize('  spaced  ')).to.equal('spaced');
  });

  it('should leave an already dasherized string alone', () => {
    expect(dasherize('my-property')).to.equal('my-property');
  });
});

describe('camelize', () => {
  it('should camelize a dashed string', () => {
    expect(camelize('my-property-name')).to.equal('myPropertyName');
  });

  it('should camelize an underscored string', () => {
    expect(camelize('my_property_name')).to.equal('myPropertyName');
  });

  it('should camelize a spaced string', () => {
    expect(camelize('my property name')).to.equal('myPropertyName');
  });

  it('should drop a trailing separator', () => {
    expect(camelize('my-property-')).to.equal('myProperty');
  });
});

describe('isPlainObject', () => {
  it('should accept an object literal', () => {
    expect(isPlainObject({})).to.be.true;
  });

  it('should reject an array', () => {
    expect(isPlainObject([])).to.be.false;
  });

  it('should reject null', () => {
    expect(isPlainObject(null)).to.be.false;
  });

  it('should reject a primitive', () => {
    expect(isPlainObject('a string')).to.be.false;
  });
});

describe('findProperty', () => {
  it('should find a property at the top level', () => {
    expect(findProperty('path')({ path: '/home' })).to.deep.equal(['/home']);
  });

  it('should find a property nested inside objects', () => {
    expect(findProperty('path')({ a: { b: { path: '/deep' } } })).to.deep.equal(['/deep']);
  });

  it('should find every occurrence inside an array', () => {
    const collection = [{ path: '/one' }, { nested: { path: '/two' } }];
    expect(findProperty('path')(collection)).to.deep.equal(['/one', '/two']);
  });

  it('should return an empty array for a primitive', () => {
    expect(findProperty('path')('a string')).to.deep.equal([]);
  });

  it('should return an empty array when the property is absent', () => {
    expect(findProperty('path')({ a: 1 })).to.deep.equal([]);
  });

  it('should expose the array and object helpers', () => {
    expect(findPropertyInArray('path')([{ path: '/one' }])).to.deep.equal(['/one']);
    expect(findPropertyInObject('path')({ path: '/one' })).to.deep.equal(['/one']);
  });
});

describe('setAttribute', () => {
  let node;

  beforeEach(() => {
    node = document.createElement('div');
  });

  it('should set the attribute to the specified value', () => {
    setAttribute(node, 'test', 'value');
    expect(node.getAttribute('test')).to.equal('value');
  });

  it('should set the attribute to an empty string if the value is true', () => {
    setAttribute(node, 'test', true);
    expect(node.getAttribute('test')).to.equal('');
  });

  it('should remove the attribute if the value is false', () => {
    node.setAttribute('test', 'value');
    setAttribute(node, 'test', false);
    expect(node.getAttribute('test')).to.be.null;
  });
});

describe('attributeWhiteList', () => {
  it('should list the attributes that are always written as attributes', () => {
    expect(attributeWhiteList).to.deep.equal(['ambient', 'variant', 'disabled']);
  });
});

describe('Utils', () => {
  it('should re-export the helpers as a namespace', () => {
    expect(Utils.dasherize).to.equal(dasherize);
    expect(Utils.camelize).to.equal(camelize);
    expect(Utils.findProperty).to.equal(findProperty);
    expect(Utils.attributeWhiteList).to.equal(attributeWhiteList);
    expect(Utils.setAttribute).to.equal(setAttribute);
  });
});
