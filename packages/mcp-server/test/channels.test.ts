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

import { afterEach, describe, expect, it } from 'vitest';
import { analyzeChannels, editDistance } from '../src/analysis/channels.js';
import { RECIPES_APP, createProject, removeProject } from './helpers.js';

const projects: string[] = [];

function project(files: Record<string, string>): string {
  const root = createProject(files);
  projects.push(root);
  return root;
}

afterEach(() => {
  while (projects.length) {
    removeProject(projects.pop()!);
  }
});

describe('editDistance', () => {
  it('measures single character differences', () => {
    expect(editDistance('categories', 'categories')).toBe(0);
    expect(editDistance('categories', 'categorias')).toBe(1);
    expect(editDistance('liked-recipes', 'like-recipes')).toBe(1);
  });
});

describe('analyzeChannels', () => {
  it('maps declarative bindings and imperative calls', () => {
    const root = project({
      'src/pages/one/one-page.ts': `export class OnePage extends LitElement {
  pageController = new PageController(this);

  static inbounds = {
    _user: { channel: 'user', skipUpdate: true },
  };

  static outbounds = {
    _selected: { channel: 'selection' },
  };

  load() {
    this.pageController.publish('user', { id: 1 });
    this.pageController.subscribe('selection', value => value);
  }
}
`,
    });

    const analysis = analyzeChannels(root);
    const user = analysis.channels.find(channel => channel.name === 'user');
    const selection = analysis.channels.find(channel => channel.name === 'selection');

    expect(user?.subscribers[0]).toMatchObject({
      kind: 'inbounds',
      property: '_user',
      owner: 'OnePage',
      skipUpdate: true,
    });
    expect(user?.publishers[0]).toMatchObject({
      kind: 'publish',
      file: 'src/pages/one/one-page.ts',
    });
    expect(selection?.publishers[0]).toMatchObject({ kind: 'outbounds', property: '_selected' });
    expect(selection?.subscribers[0]).toMatchObject({ kind: 'subscribe' });
    expect(analysis.diagnostics).toEqual([]);
  });

  it('reports channels that nobody consumes or nobody feeds', () => {
    const root = project({
      'src/a.ts': `class A {
  run() {
    this.publish('orphan-out', 1);
    this.subscribe('orphan-in', () => {});
  }
}
`,
    });

    const codes = analyzeChannels(root).diagnostics.map(diagnostic => diagnostic.code);
    expect(codes).toContain('channel-without-subscribers');
    expect(codes).toContain('channel-without-publishers');
  });

  it('suggests possible typos between similar channel names', () => {
    const root = project({
      'src/a.ts': `class A {
  run() {
    this.publish('categories', []);
    this.subscribe('categories', () => {});
    this.publish('categorie', []);
    this.subscribe('categorie', () => {});
  }
}
`,
    });

    const diagnostic = analyzeChannels(root).diagnostics.find(
      entry => entry.code === 'similar-channel-names',
    );
    expect(diagnostic?.message).toContain('categories');
    expect(diagnostic?.severity).toBe('info');
  });

  it('records calls whose channel name is not a literal', () => {
    const root = project({
      'src/a.ts': `class A {
  run(name) {
    this.publish(name, 1);
  }
}
`,
    });

    expect(analyzeChannels(root).dynamic).toHaveLength(1);
  });

  it('expands the array form of unsubscribe', () => {
    const root = project({
      'src/a.ts': `class A {
  run() {
    this.publish('one', 1);
    this.publish('two', 2);
    this.unsubscribe(['one', 'two']);
  }
}
`,
    });

    const analysis = analyzeChannels(root);
    expect(analysis.channels.map(channel => channel.name)).toEqual(['one', 'two']);
  });

  it('finds the channels of the recipes example', () => {
    const analysis = analyzeChannels(RECIPES_APP);
    const names = analysis.channels.map(channel => channel.name);

    expect(names).toContain('categories');
    expect(names).toContain('liked-recipes');

    const categories = analysis.channels.find(channel => channel.name === 'categories');
    expect(categories?.publishers.length).toBeGreaterThan(0);
    expect(categories?.subscribers.length).toBeGreaterThan(0);
  });
});
