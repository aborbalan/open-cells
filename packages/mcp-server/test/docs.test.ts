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

import { describe, expect, it } from 'vitest';
import { API_MODULES, GUIDES, findModule } from '../src/docs/reference.js';
import { searchDocs } from '../src/docs/search.js';

describe('reference', () => {
  it('documents every package of the monorepo', () => {
    const ids = API_MODULES.map(module => module.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'core',
        'element-controller',
        'page-controller',
        'page-mixin',
        'page-transitions',
        'localize',
        'core-plugin',
        'create-app',
      ]),
    );
  });

  it('resolves a module by id or package name', () => {
    expect(findModule('core')?.package).toBe('@open-cells/core');
    expect(findModule('@open-cells/page-controller')?.id).toBe('page-controller');
    expect(findModule('unknown')).toBeUndefined();
  });

  it('gives every entry a signature and a summary', () => {
    for (const module of API_MODULES) {
      for (const entry of module.entries) {
        expect(entry.signature.length, `${module.id}.${entry.name}`).toBeGreaterThan(0);
        expect(entry.summary.length, `${module.id}.${entry.name}`).toBeGreaterThan(0);
      }
    }
  });

  it('gives every guide a body', () => {
    for (const guide of GUIDES) {
      expect(guide.content.length, guide.id).toBeGreaterThan(100);
    }
  });
});

describe('searchDocs', () => {
  it('ranks the API entry above the guide that mentions it', () => {
    const [first] = searchDocs('publish');

    expect(first?.type).toBe('api');
    expect(first?.id).toBe('core.publish');
  });

  it('finds concepts described in the guides', () => {
    const results = searchDocs('inbounds channel binding');
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.some(hit => hit.id.includes('state-channels') || hit.id.includes('inbounds')),
    ).toBe(true);
  });

  it('answers a natural language question about the lifecycle', () => {
    const ids = searchDocs('when does onPageEnter run', 5).map(hit => hit.id);
    expect(ids).toContain('page-controller.onPageEnter');
  });

  it('respects the limit and returns nothing for gibberish', () => {
    expect(searchDocs('navigate', 2)).toHaveLength(2);
    expect(searchDocs('zzzzqqqq')).toEqual([]);
  });
});
