// Table helper tests for the stats leaderboard.
// Run with: cd website && npm test

import assert from 'node:assert/strict';
import test from 'node:test';

import { topItems, filterRows, sortRows, paginate, pageList } from '../src/lib/table.js';

test('topItems aggregates counts, orders desc and caps', () => {
  const lists = [
    [{ name: 'Gold', count: 2 }, { name: 'Diamond', count: 1 }],
    [{ name: 'Gold', count: 3 }, { name: 'Iron', count: 4 }],
  ];
  assert.deepEqual(topItems(lists, 2), ['Gold', 'Iron']);
  assert.deepEqual(topItems(lists, 10), ['Gold', 'Iron', 'Diamond']);
});

test('topItems ignores empty names and zero counts', () => {
  assert.deepEqual(topItems([[{ name: '', count: 5 }, { name: 'A', count: 0 }]]), []);
  assert.deepEqual(topItems(null), []);
});

test('filterRows matches name case-insensitively', () => {
  const rows = [{ name: 'Alexander_Dicky' }, { name: 'Noah Ascendant' }, { name: 'Khaleed_Mactavish' }];
  assert.equal(filterRows(rows, 'dicky').length, 1);
  assert.equal(filterRows(rows, '  NOAH ').length, 1);
  assert.equal(filterRows(rows, '').length, 3);
  assert.equal(filterRows(rows, 'zzz').length, 0);
});

test('sortRows sorts numbers both directions with a name tiebreak', () => {
  const rows = [
    { name: 'b', v: 10 },
    { name: 'a', v: 10 },
    { name: 'c', v: 30 },
  ];
  assert.deepEqual(sortRows(rows, (r) => r.v, 'desc').map((r) => r.name), ['c', 'a', 'b']);
  assert.deepEqual(sortRows(rows, (r) => r.v, 'asc').map((r) => r.name), ['a', 'b', 'c']);
});

test('sortRows sorts strings case-insensitively', () => {
  const rows = [{ name: 'Noah' }, { name: 'alexander' }, { name: 'Khaleed' }];
  assert.deepEqual(sortRows(rows, (r) => r.name, 'asc').map((r) => r.name), ['alexander', 'Khaleed', 'Noah']);
});

test('paginate clamps the page and slices 50-row pages', () => {
  const rows = Array.from({ length: 120 }, (_, i) => ({ name: `p${i}` }));
  const first = paginate(rows, 1, 50);
  assert.equal(first.items.length, 50);
  assert.equal(first.pages, 3);
  assert.equal(first.start, 0);
  assert.equal(first.end, 50);

  const last = paginate(rows, 99, 50);
  assert.equal(last.page, 3);
  assert.equal(last.items.length, 20);
  assert.equal(last.start, 100);

  const zero = paginate([], 5, 50);
  assert.equal(zero.page, 1);
  assert.equal(zero.pages, 1);
  assert.equal(zero.total, 0);
});

test('paginate caps the page size at 50', () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({ name: `p${i}` }));
  const page = paginate(rows, 1, 500);
  assert.equal(page.items.length, 50);
});

test('pageList shows every page when there are few', () => {
  assert.deepEqual(pageList(1, 1), [1]);
  assert.deepEqual(pageList(3, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test('pageList inserts gaps around the current page', () => {
  assert.deepEqual(pageList(1, 20), [1, 2, '…', 20]);
  assert.deepEqual(pageList(10, 20), [1, '…', 9, 10, 11, '…', 20]);
  assert.deepEqual(pageList(20, 20), [1, '…', 19, 20]);
});