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
import { CellsStorage } from '../../src/manager/storage.js';

describe('CellsStorage', () => {
  let cellsStorage;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    window.sessionStorage.clear();
    window.localStorage.clear();
    cellsStorage = new CellsStorage({ prefix: 'test_', persistent: false });
  });

  afterEach(() => {
    sandbox.restore();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  describe('#constructor', () => {
    it('should take the prefix and the persistence flag from its options', () => {
      expect(cellsStorage.prefix).to.equal('test_');
      expect(cellsStorage.persistent).to.be.false;
    });

    it('should default to an empty prefix and no persistence', () => {
      const bare = new CellsStorage({});
      expect(bare.prefix).to.equal('');
      expect(bare.persistent).to.be.false;
    });

    it('should wipe its own keys when it is persistent', () => {
      window.localStorage.setItem('test_stale', JSON.stringify('old'));
      window.localStorage.setItem('other_kept', JSON.stringify('keep'));

      new CellsStorage({ prefix: 'test_', persistent: true });

      expect(window.localStorage.getItem('test_stale')).to.be.null;
      expect(window.localStorage.getItem('other_kept')).to.not.be.null;
    });
  });

  describe('#storage', () => {
    it('should use session storage when it is not persistent', () => {
      expect(cellsStorage.storage).to.equal(window.sessionStorage);
    });

    it('should use local storage when it is persistent', () => {
      const persistent = new CellsStorage({ prefix: 'test_', persistent: true });
      expect(persistent.storage).to.equal(window.localStorage);
    });

    it('should fall back to memory when web storage is unavailable', () => {
      // Private browsing and some embedded webviews make setItem throw.
      //
      // The stub goes on `Storage.prototype`, not on `window.sessionStorage`. A Storage object
      // is a legacy platform object with a named property setter: outside Chromium, defining
      // `setItem` on the instance writes a storage *entry* called "setItem" instead of shadowing
      // the method, so the stub never runs and the fallback never engages. The prototype is an
      // ordinary object in every engine.
      sandbox.stub(Storage.prototype, 'setItem').throws(new DOMException('QuotaExceeded'));
      expect(cellsStorage.storage).to.equal(cellsStorage.internalStorage);
    });
  });

  describe('#setItem / #getItem', () => {
    it('should round-trip a value', () => {
      cellsStorage.setItem('key', 'value');
      expect(cellsStorage.getItem('key')).to.equal('value');
    });

    it('should round-trip an object', () => {
      cellsStorage.setItem('key', { a: 1, b: [2, 3] });
      expect(cellsStorage.getItem('key')).to.deep.equal({ a: 1, b: [2, 3] });
    });

    it('should store the value under the prefixed key', () => {
      cellsStorage.setItem('key', 'value');
      expect(window.sessionStorage.getItem('test_key')).to.equal('"value"');
    });

    it('should return null for a key that was never set', () => {
      expect(cellsStorage.getItem('missing')).to.be.null;
    });

    it('should keep the storages of two prefixes apart', () => {
      const other = new CellsStorage({ prefix: 'other_', persistent: false });
      cellsStorage.setItem('key', 'mine');
      other.setItem('key', 'theirs');

      expect(cellsStorage.getItem('key')).to.equal('mine');
      expect(other.getItem('key')).to.equal('theirs');
    });
  });

  describe('#clear', () => {
    it('should remove the items carrying its prefix', () => {
      cellsStorage.setItem('key1', 'value1');
      cellsStorage.setItem('key2', 'value2');

      cellsStorage.clear();

      expect(cellsStorage.getItem('key1')).to.be.null;
      expect(cellsStorage.getItem('key2')).to.be.null;
    });

    it('should leave the items of another prefix alone', () => {
      const other = new CellsStorage({ prefix: 'other_', persistent: false });
      cellsStorage.setItem('key', 'mine');
      other.setItem('key', 'theirs');

      cellsStorage.clear();

      expect(other.getItem('key')).to.equal('theirs');
    });
  });

  describe('the in-memory fallback', () => {
    beforeEach(() => {
      // Force the fallback for the whole block.
      sandbox.stub(Storage.prototype, 'setItem').throws(new DOMException('QuotaExceeded'));
    });

    it('should round-trip a value', () => {
      cellsStorage.setItem('key', 'value');
      expect(cellsStorage.getItem('key')).to.equal('value');
    });

    it('should return null for a key that was never set', () => {
      expect(cellsStorage.getItem('missing')).to.be.null;
    });

    it('should remove an item', () => {
      cellsStorage.setItem('key', 'value');
      cellsStorage.internalStorage.removeItem('test_key');
      expect(cellsStorage.getItem('key')).to.be.null;
    });
  });
});
