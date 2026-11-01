// src/lib/table.js
//
// Pure helpers for the stats leaderboard table: dynamic item columns, name
// filtering, sorting and pagination. No DOM and no fetch, so `node --test`
// can exercise every rule without a browser.

/**
 * Union of item names across every player's per-job item list, ordered by the
 * total count and capped. Used to build the extra breakdown columns (miner
 * Gold/Diamond, fishing Ocean/River/Lake, …) shown when a job is selected.
 *
 * @param {Array<Array<{name: string, count?: number}>>} lists
 * @param {number} limit
 * @returns {string[]}
 */
export function topItems(lists, limit = 10) {
  const totals = new Map();
  for (const items of lists || []) {
    for (const it of items || []) {
      const name = it && it.name;
      if (!name) continue;
      totals.set(name, (totals.get(name) || 0) + (Number(it.count) || 0));
    }
  }
  return [...totals.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, Math.max(1, Number(limit) || 1))
    .map(([name]) => name);
}

/** Case-insensitive substring match on the character name (falls back to slug). */
export function filterRows(rows, query) {
  const list = Array.isArray(rows) ? rows : [];
  const q = String(query || '').trim().toLowerCase();
  if (!q) return list.slice();
  return list.filter((row) => {
    const name = String((row && (row.name || row.slug)) || '').toLowerCase();
    return name.includes(q);
  });
}

/**
 * Stable-ish sort by a value getter. Numbers sort numerically, everything else
 * uses a case-insensitive locale compare. Ties fall back to the character name
 * so the order never depends on fetch timing.
 */
export function sortRows(rows, getValue, dir = 'desc') {
  const sign = dir === 'asc' ? 1 : -1;
  return [...(rows || [])].sort((a, b) => {
    const va = getValue(a);
    const vb = getValue(b);
    if (typeof va === 'number' && typeof vb === 'number') {
      if (va !== vb) return (va - vb) * sign;
    } else {
      const cmp = String(va == null ? '' : va).localeCompare(
        String(vb == null ? '' : vb),
        'en',
        { sensitivity: 'base' },
      );
      if (cmp) return cmp * sign;
    }
    return String((a && a.name) || '').localeCompare(String((b && b.name) || ''));
  });
}

/**
 * Clamp the requested page and slice out one page. `pages` is always >= 1 so
 * the UI can render a pager even for an empty result set.
 */
export function paginate(rows, page, pageSize) {
  const list = Array.isArray(rows) ? rows : [];
  const size = Math.max(1, Math.min(50, Number(pageSize) || 50));
  const pages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(1, Math.floor(Number(page) || 1)), pages);
  const start = (current - 1) * size;
  return {
    items: list.slice(start, start + size),
    page: current,
    pages,
    size,
    start,
    end: Math.min(start + size, list.length),
    total: list.length,
  };
}

/**
 * Page numbers to render, with "…" gaps when there are many pages. Always
 * includes the first and last page.
 *
 * @returns {Array<number|'…'>}
 */
export function pageList(current, pages) {
  const total = Math.max(1, Math.floor(Number(pages) || 1));
  const cur = Math.min(Math.max(1, Math.floor(Number(current) || 1)), total);
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const out = [1];
  const start = Math.max(2, cur - 1);
  const end = Math.min(total - 1, cur + 1);
  if (start > 2) out.push('…');
  for (let i = start; i <= end; i += 1) out.push(i);
  if (end < total - 1) out.push('…');
  out.push(total);
  return out;
}