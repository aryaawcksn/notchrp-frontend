// src/stats.js — public stats table for uploaded NotchClone characters.
//
// Read-only: the desktop app uploads one character snapshot at a time from
// Settings → Stats, this page lists GET /api/characters and then fetches
// GET /api/characters/:slug for the full file set. Every number is aggregated
// in the browser by lib/analyze.js, so the backend stays a dumb store and the
// overlay/website always agree.
//
// The page is a table per section (Job, Activity, Mechanic, Farmer, Truck,
// Taxi, Sidejob). Every column is sortable, the name box filters, and the
// pager keeps at most 50 rows on screen. Sections with item-level data (miner
// ores, fishing species, crops, trucker cargo) expose those items as their own
// sortable columns.

import './style.css';
import './stats.css';
import {
  buildDataset,
  fmtMoney,
  fmtInt,
  ACTIVITY_JOBS,
  SIDEJOB_JOBS,
  TRUCK_JOBS,
} from './lib/analyze.js';
import { topItems, filterRows, sortRows, paginate, pageList } from './lib/table.js';

/* Public backend. VITE_STATS_API_URL wins; the production hostname is the
 * fallback so a plain `npm run build` still points at the live leaderboard. */
const API_BASE = String(
  import.meta.env.VITE_STATS_API_URL || 'https://api-notch.elms-ppkn-smego10.my.id',
)
  .trim()
  .replace(/\/+$/, '');

const MAX_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [10, 25, 50];

const $ = (sel) => document.querySelector(sel);

const tabsEl = $('#section-tabs');
const chipsEl = $('#sub-chips');
const searchEl = $('#search');
const pageSizeEl = $('#page-size');
const headEl = $('#lb-head');
const bodyEl = $('#lb-body');
const pagerEl = $('#pager');
const countEl = $('#count-pill');
const statusEl = $('#status-line');
const refreshBtn = $('#refresh-btn');
const emptyEl = $('#empty-state');
const tableWrap = $('#table-wrap');

const SECTIONS = [
  { id: 'job', label: 'Job', emoji: '💼' },
  { id: 'activity', label: 'Activity', emoji: '🎣' },
  { id: 'mechanic', label: 'Mechanic', emoji: '🔧' },
  { id: 'farmer', label: 'Farmer', emoji: '🌾' },
  { id: 'truck', label: 'Truck', emoji: '🚛' },
  { id: 'taxi', label: 'Taxi', emoji: '🚕' },
  { id: 'sidejob', label: 'Sidejob', emoji: '🧰' },
];

const state = {
  players: [],
  section: 'job',
  sub: 'all',
  sortKey: '',
  sortDir: 'desc',
  query: '',
  page: 1,
  pageSize: MAX_PAGE_SIZE,
};

/* --------------------------------------------------------------- format */

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function timeAgo(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const minutes = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}

function fmtKg(grams) {
  return `${(Number(grams || 0) / 1000).toFixed(2)} kg`;
}

/* --------------------------------------------------------------- metrics */

/* Everything the character earned from a tracked job. Kept separate from
 * totals.income because that one prefers the ledger (which also carries shop
 * purchases, bank transfers, …) — a "Job" column should only compare payouts. */
function jobIncome(ds) {
  return (
    ds.activity.total.money +
    ds.farmer.total.sellMoney +
    ds.sidejob.sidejob.total.money +
    ds.sidejob.truck.total.money +
    ds.mechanic.income +
    ds.taxi.income
  );
}

function activityCount(ds) {
  return ds.activity.total.gained + ds.activity.total.sold;
}

/* Keep the fish species readable in the table header. */
function speciesLabel(name) {
  if (/ocean/i.test(name)) return 'Laut';
  if (/river/i.test(name)) return 'Sungai';
  if (/lake/i.test(name)) return 'Lake';
  return name;
}

function jobLabel(list, id) {
  const meta = list.find((j) => j.id === id);
  return meta ? meta.label : String(id || '');
}

/* ----------------------------------------------------------- view builders
 *
 * A "view" is { title, chips, primary, columns }. `columns` hold
 * { id, label, fmt: 'money'|'int'|'kg', value(player), primary? }. The first
 * column marked `primary` is the default sort when the section is opened.
 */

function money(id, label, value, opts = {}) {
  return { id, label, fmt: 'money', value, ...opts };
}
function int(id, label, value, opts = {}) {
  return { id, label, fmt: 'int', value, ...opts };
}

function jobView() {
  return {
    title: 'Job',
    chips: [],
    columns: [
      money('job', 'Total Job', (p) => jobIncome(p.ds), { primary: true }),
      int('activity', 'Activity', (p) => activityCount(p.ds)),
      money('mechanic', 'Mechanic', (p) => p.ds.mechanic.income),
      money('farmer', 'Farmer', (p) => p.ds.farmer.total.sellMoney),
      money('truck', 'Truck', (p) => p.ds.sidejob.truck.total.money),
      money('taxi', 'Taxi', (p) => p.ds.taxi.income),
      money('sidejob', 'Sidejob', (p) => p.ds.sidejob.sidejob.total.money),
    ],
  };
}

function activityChips() {
  return [
    { id: 'all', label: 'Semua' },
    ...ACTIVITY_JOBS.map((j) => ({ id: j.id, label: j.label, emoji: j.emoji })),
  ];
}

function activityView(sub) {
  const players = state.players;

  if (sub === 'all') {
    return {
      title: 'Activity',
      chips: activityChips(),
      columns: [
        int('total', 'Total item', (p) => activityCount(p.ds), { primary: true }),
        money('money', 'Pendapatan', (p) => p.ds.activity.total.money),
        { id: 'weight', label: 'Berat', fmt: 'kg', value: (p) => p.ds.activity.total.grams },
        ...ACTIVITY_JOBS.map((j) => ({
          id: `job-${j.id}`,
          label: `${j.emoji} ${j.label}`,
          fmt: 'int',
          value: (p) => {
            const row = p.ds.activity.rows.find((x) => x.id === j.id);
            return row ? row.count : 0;
          },
        })),
      ],
    };
  }

  const jobOf = (p) => p.ds.activity.rows.find((x) => x.id === sub) || null;
  const names = topItems(players.map((p) => (jobOf(p) ? jobOf(p).items : [])), 10);
  const labelFor = sub === 'fishing' ? speciesLabel : (name) => name;

  return {
    title: `Activity · ${jobLabel(ACTIVITY_JOBS, sub)}`,
    chips: activityChips(),
    columns: [
      int('count', 'Hasil', (p) => {
        const row = jobOf(p);
        return row ? row.count : 0;
      }, { primary: true }),
      money('money', 'Pendapatan', (p) => {
        const row = jobOf(p);
        return row ? row.money : 0;
      }),
      ...(sub === 'fishing'
        ? [{ id: 'weight', label: 'Berat', fmt: 'kg', value: (p) => (jobOf(p) ? jobOf(p).grams : 0) }]
        : []),
      ...names.map((name) => ({
        id: `item-${name}`,
        label: labelFor(name),
        fmt: 'int',
        value: (p) => {
          const row = jobOf(p);
          const item = row && row.items.find((x) => x.name === name);
          return item ? item.count : 0;
        },
      })),
    ],
  };
}

function sidejobChips() {
  return [
    { id: 'all', label: 'Semua' },
    ...SIDEJOB_JOBS.map((j) => ({ id: j.id, label: j.label, emoji: j.emoji })),
  ];
}

function sidejobView(sub) {
  const players = state.players;
  const groupOf = (p) => p.ds.sidejob.sidejob;

  if (sub === 'all') {
    return {
      title: 'Sidejob',
      chips: sidejobChips(),
      columns: [
        money('money', 'Pendapatan', (p) => groupOf(p).total.money, { primary: true }),
        int('payouts', 'Payout', (p) => groupOf(p).total.payouts),
        ...SIDEJOB_JOBS.map((j) => ({
          id: `job-${j.id}`,
          label: `${j.emoji} ${j.label}`,
          fmt: 'money',
          value: (p) => {
            const row = groupOf(p).rows.find((x) => x.id === j.id);
            return row ? row.money : 0;
          },
        })),
      ],
    };
  }

  const jobOf = (p) => groupOf(p).rows.find((x) => x.id === sub) || null;
  const names = topItems(
    players.map((p) => {
      const row = jobOf(p);
      return row ? row.items : [];
    }),
    12,
  );
  const hasItems = names.length > 0;

  return {
    title: `Sidejob · ${jobLabel(SIDEJOB_JOBS, sub)}`,
    chips: sidejobChips(),
    columns: [
      ...(hasItems
        ? [
            int('count', 'Ore', (p) => {
              const row = jobOf(p);
              return row ? row.items.reduce((sum, it) => sum + it.count, 0) : 0;
            }, { primary: true }),
          ]
        : []),
      money('money', 'Pendapatan', (p) => {
        const row = jobOf(p);
        return row ? row.money : 0;
      }, hasItems ? {} : { primary: true }),
      int('payouts', 'Payout', (p) => {
        const row = jobOf(p);
        return row ? row.payouts : 0;
      }),
      ...names.map((name) => ({
        id: `item-${name}`,
        label: name,
        fmt: 'int',
        value: (p) => {
          const row = jobOf(p);
          const item = row && row.items.find((x) => x.name === name);
          return item ? item.count : 0;
        },
      })),
    ],
  };
}

function farmerChips(players) {
  const seen = new Map();
  for (const p of players) {
    for (const crop of p.ds.farmer.rows) {
      if (!seen.has(crop.id)) seen.set(crop.id, { id: crop.id, label: crop.label, emoji: crop.emoji });
    }
  }
  return [{ id: 'all', label: 'Semua' }, ...[...seen.values()]];
}

function farmerView(sub) {
  const players = state.players;
  const totalOf = (p) => p.ds.farmer.total;
  const rowsOf = (p) => p.ds.farmer.rows;
  const chips = farmerChips(players);

  if (sub === 'all') {
    const crops = [...new Set(players.flatMap((p) => rowsOf(p).map((c) => c.id)))].map((id) => {
      const row = players.flatMap(rowsOf).find((c) => c.id === id);
      return { id, label: row ? row.label : id, emoji: row ? row.emoji : '🌾' };
    });

    return {
      title: 'Farmer',
      chips,
      columns: [
        money('sellMoney', 'Pendapatan', (p) => totalOf(p).sellMoney, { primary: true }),
        int('sellQty', 'Hasil', (p) => totalOf(p).sellQty),
        money('seedMoney', 'Bibit', (p) => totalOf(p).seedMoney),
        ...crops.map((crop) => ({
          id: `crop-${crop.id}`,
          label: `${crop.emoji} ${crop.label}`,
          fmt: 'int',
          value: (p) => {
            const row = rowsOf(p).find((c) => c.id === crop.id);
            return row ? row.sellQty : 0;
          },
        })),
      ],
    };
  }

  const cropOf = (p) => rowsOf(p).find((c) => c.id === sub) || null;
  const label = jobLabel(chips, sub);

  return {
    title: `Farmer · ${label}`,
    chips,
    columns: [
      int('sellQty', 'Hasil', (p) => {
        const row = cropOf(p);
        return row ? row.sellQty : 0;
      }, { primary: true }),
      money('sellMoney', 'Pendapatan', (p) => {
        const row = cropOf(p);
        return row ? row.sellMoney : 0;
      }),
      int('seedQty', 'Bibit', (p) => {
        const row = cropOf(p);
        return row ? row.seedQty : 0;
      }),
      money('seedMoney', 'Biaya bibit', (p) => {
        const row = cropOf(p);
        return row ? row.seedMoney : 0;
      }),
    ],
  };
}

function truckChips() {
  return [
    { id: 'all', label: 'Semua' },
    ...TRUCK_JOBS.map((j) => ({ id: j.id, label: j.label, emoji: j.emoji })),
  ];
}

function truckView(sub) {
  const players = state.players;
  const groupOf = (p) => p.ds.sidejob.truck;

  if (sub === 'all') {
    return {
      title: 'Truck',
      chips: truckChips(),
      columns: [
        money('money', 'Pendapatan', (p) => groupOf(p).total.money, { primary: true }),
        int('payouts', 'Payout', (p) => groupOf(p).total.payouts),
        ...TRUCK_JOBS.map((j) => ({
          id: `job-${j.id}`,
          label: `${j.emoji} ${j.label}`,
          fmt: 'money',
          value: (p) => {
            const row = groupOf(p).rows.find((x) => x.id === j.id);
            return row ? row.money : 0;
          },
        })),
      ],
    };
  }

  const jobOf = (p) => groupOf(p).rows.find((x) => x.id === sub) || null;
  const names = topItems(
    players.map((p) => {
      const row = jobOf(p);
      return row ? row.items : [];
    }),
    8,
  );

  return {
    title: `Truck · ${jobLabel(TRUCK_JOBS, sub)}`,
    chips: truckChips(),
    columns: [
      money('money', 'Pendapatan', (p) => {
        const row = jobOf(p);
        return row ? row.money : 0;
      }, { primary: true }),
      int('payouts', 'Payout', (p) => {
        const row = jobOf(p);
        return row ? row.payouts : 0;
      }),
      ...names.map((name) => ({
        id: `item-${name}`,
        label: name,
        fmt: 'int',
        value: (p) => {
          const row = jobOf(p);
          const item = row && row.items.find((x) => x.name === name);
          return item ? item.count : 0;
        },
      })),
    ],
  };
}

function taxiView() {
  return {
    title: 'Taxi',
    chips: [],
    columns: [
      int('passengers', 'Penumpang', (p) => p.ds.taxi.passengers, { primary: true }),
      int('deliveries', 'Delivery', (p) => p.ds.taxi.deliveries),
      int('bonus', 'Bonus ride', (p) => p.ds.taxi.bonusRides),
      int('duty', 'Duty', (p) => p.ds.taxi.dutyPayments),
      int('cancelled', 'Batal', (p) => p.ds.taxi.cancelled),
      money('income', 'Pendapatan', (p) => p.ds.taxi.income),
      int('records', 'Slip', (p) => p.ds.taxi.records),
    ],
  };
}

function mechanicView() {
  return {
    title: 'Mechanic',
    chips: [],
    columns: [
      money('income', 'Pendapatan', (p) => p.ds.mechanic.income, { primary: true }),
      int('work', 'Repair', (p) => p.ds.mechanic.work),
      int('pay', 'Pay', (p) => p.ds.mechanic.pay),
      int('shifts', 'Shift', (p) => p.ds.mechanic.shifts),
      int('components', 'Komponen', (p) => p.ds.mechanic.components),
    ],
  };
}

function currentView() {
  switch (state.section) {
    case 'activity':
      return activityView(state.sub);
    case 'mechanic':
      return mechanicView();
    case 'farmer':
      return farmerView(state.sub);
    case 'truck':
      return truckView(state.sub);
    case 'taxi':
      return taxiView();
    case 'sidejob':
      return sidejobView(state.sub);
    case 'job':
    default:
      return jobView();
  }
}

/* ---------------------------------------------------------------- render */

function rankClass(index) {
  if (index === 0) return ' gold';
  if (index === 1) return ' silver';
  if (index === 2) return ' bronze';
  return '';
}

function activeSortKey(view) {
  if (state.sortKey === 'name') return 'name';
  if (state.sortKey && view.columns.some((c) => c.id === state.sortKey)) return state.sortKey;
  const primary = view.columns.find((c) => c.primary) || view.columns[0];
  return primary ? primary.id : 'name';
}

function arrowMarkup(key, activeKey) {
  if (key !== activeKey) return '<span class="sort-arrow">↕</span>';
  return `<span class="sort-arrow active">${state.sortDir === 'asc' ? '▲' : '▼'}</span>`;
}

function formatCell(col, value) {
  if (col.fmt === 'money') {
    const num = Number(value) || 0;
    return `<td class="num${num === 0 ? ' zero' : ''}">${num === 0 ? '—' : esc(fmtMoney(num))}</td>`;
  }
  if (col.fmt === 'kg') {
    const num = Number(value) || 0;
    return `<td class="num${num === 0 ? ' zero' : ''}">${num === 0 ? '—' : esc(fmtKg(num))}</td>`;
  }
  const num = Number(value) || 0;
  return `<td class="num${num === 0 ? ' zero' : ''}">${num === 0 ? '—' : esc(fmtInt(num))}</td>`;
}

function renderTabs() {
  tabsEl.innerHTML = SECTIONS.map(
    (section) => `<button type="button" class="tab${section.id === state.section ? ' active' : ''}" data-section="${section.id}">
      <span class="tab-emoji">${section.emoji}</span><span>${esc(section.label)}</span>
    </button>`,
  ).join('');
}

function renderChips(view) {
  const chips = Array.isArray(view.chips) ? view.chips : [];
  if (chips.length <= 1) {
    chipsEl.innerHTML = '';
    chipsEl.hidden = true;
    return;
  }
  chipsEl.hidden = false;
  chipsEl.innerHTML = chips
    .map(
      (chip) => `<button type="button" class="chip${chip.id === state.sub ? ' active' : ''}" data-sub="${esc(chip.id)}">
        ${chip.emoji ? `<span class="chip-emoji">${chip.emoji}</span>` : ''}<span>${esc(chip.label)}</span>
      </button>`,
    )
    .join('');
}

function renderHead(view, activeKey) {
  headEl.innerHTML = `<tr>
    <th class="col-rank">#</th>
    <th class="col-name sortable" data-sort="name">Player${arrowMarkup('name', activeKey)}</th>
    ${view.columns
      .map(
        (col) => `<th class="sortable num" data-sort="${esc(col.id)}">${esc(col.label)}${arrowMarkup(col.id, activeKey)}</th>`,
      )
      .join('')}
  </tr>`;
}

function renderBody(view, pageData) {
  if (!pageData.items.length) {
    bodyEl.innerHTML = `<tr><td class="no-rows" colspan="${view.columns.length + 2}">Tidak ada karakter yang cocok dengan filter.</td></tr>`;
    return;
  }
  bodyEl.innerHTML = pageData.items
    .map((player, index) => {
      const rank = pageData.start + index + 1;
      const cells = view.columns.map((col) => formatCell(col, col.value(player))).join('');
      return `<tr>
        <td class="col-rank"><span class="rank${rankClass(rank - 1)}">${rank}</span></td>
        <td class="col-name">
          <span class="player-name">${esc(player.name)}</span>
          <span class="player-sub">${esc(player.slug || '')}${player.updatedAt ? ` · ${esc(timeAgo(player.updatedAt))}` : ''}</span>
        </td>
        ${cells}
      </tr>`;
    })
    .join('');
}

function renderPager(pageData) {
  if (!pageData.total) {
    pagerEl.innerHTML = '';
    return;
  }
  const buttons = [];
  buttons.push(
    `<button type="button" class="page-btn" data-page="${pageData.page - 1}" ${pageData.page <= 1 ? 'disabled' : ''}>‹</button>`,
  );
  for (const item of pageList(pageData.page, pageData.pages)) {
    if (item === '…') buttons.push('<span class="page-gap">…</span>');
    else
      buttons.push(
        `<button type="button" class="page-btn${item === pageData.page ? ' active' : ''}" data-page="${item}">${item}</button>`,
      );
  }
  buttons.push(
    `<button type="button" class="page-btn" data-page="${pageData.page + 1}" ${pageData.page >= pageData.pages ? 'disabled' : ''}>›</button>`,
  );
  pagerEl.innerHTML = `<div class="pager-wrap">${buttons.join('')}<span class="page-info">${fmtInt(pageData.start + 1)}–${fmtInt(pageData.end)} dari ${fmtInt(pageData.total)}</span></div>`;
}

function renderStatus() {
  countEl.textContent = `${fmtInt(state.players.length)} karakter`;
  if (!state.players.length) return;
  const newest = state.players
    .map((player) => Date.parse(player.updatedAt || ''))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  statusEl.textContent = newest
    ? `Data publik · diperbarui ${timeAgo(new Date(newest).toISOString())}`
    : 'Data publik dari server statistik NotchClone.';
  statusEl.classList.add('ok');
}

function render() {
  const view = currentView();
  const activeKey = activeSortKey(view);
  const key = activeKey;
  const isName = key === 'name';
  const column = isName ? null : (view.columns.find((c) => c.id === key) || { value: () => 0 });
  const getValue = isName ? (player) => player.name : (player) => column.value(player);

  const filtered = filterRows(state.players, state.query);
  const sorted = sortRows(filtered, getValue, state.sortDir);
  const pageData = paginate(sorted, state.page, state.pageSize);
  state.page = pageData.page;

  renderTabs();
  renderChips(view);
  renderHead(view, activeKey);
  renderBody(view, pageData);
  renderPager(pageData);
  renderStatus();

  const hasPlayers = state.players.length > 0;
  emptyEl.hidden = hasPlayers;
  tableWrap.hidden = !hasPlayers;
  pagerEl.hidden = !hasPlayers;
}

/* -------------------------------------------------------------- controls */

function resetPaging() {
  state.page = 1;
  state.sortKey = '';
  state.sortDir = 'desc';
}

tabsEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-section]');
  if (!button) return;
  const id = button.dataset.section;
  if (!id || id === state.section) return;
  state.section = id;
  state.sub = 'all';
  resetPaging();
  render();
});

chipsEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-sub]');
  if (!button) return;
  const id = button.dataset.sub;
  if (!id || id === state.sub) return;
  state.sub = id;
  resetPaging();
  render();
});

headEl.addEventListener('click', (event) => {
  const th = event.target.closest('[data-sort]');
  if (!th) return;
  const key = th.dataset.sort;
  if (!key) return;
  const activeKey = activeSortKey(currentView());
  if (key === activeKey) {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortKey = key;
    state.sortDir = key === 'name' ? 'asc' : 'desc';
  }
  // Pin the implicit primary so the next click toggles it instead of
  // re-applying the default direction.
  if (state.sortKey === '') state.sortKey = key;
  state.page = 1;
  render();
});

searchEl.addEventListener('input', () => {
  state.query = searchEl.value;
  state.page = 1;
  render();
});

pageSizeEl.addEventListener('change', () => {
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(pageSizeEl.value) || MAX_PAGE_SIZE));
  state.pageSize = size;
  state.page = 1;
  render();
});

pagerEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-page]');
  if (!button || button.disabled) return;
  const next = Number(button.dataset.page);
  if (!Number.isFinite(next)) return;
  state.page = next;
  render();
});

/* ---------------------------------------------------------------- fetch */

async function fetchJson(pathname, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${pathname}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error((body && body.error) || `HTTP ${res.status}`);
    return body || {};
  } finally {
    clearTimeout(timer);
  }
}

async function loadCharacter(meta) {
  const body = await fetchJson(`/api/characters/${encodeURIComponent(meta.slug)}`);
  const character = body.character || {};
  const files = Object.entries(character.files || {})
    .filter(([, json]) => json && typeof json === 'object' && !Array.isArray(json))
    .map(([name, json]) => ({ fileName: `${name}.json`, json }));

  return {
    name: character.name || meta.name || meta.slugDisplay || meta.slug,
    slug: meta.slug,
    updatedAt: character.updatedAt || meta.updatedAt || '',
    ds: buildDataset(files),
  };
}

async function load() {
  refreshBtn.disabled = true;
  statusEl.textContent = 'Memuat data…';
  statusEl.classList.remove('ok', 'error');
  countEl.textContent = '';

  try {
    const list = await fetchJson('/api/characters');
    const characters = Array.isArray(list.characters) ? list.characters : [];

    if (!characters.length) {
      state.players = [];
      render();
      statusEl.textContent = 'Belum ada karakter yang diunggah.';
      return;
    }

    // One request per character for the full snapshot. A broken or removed
    // character is skipped instead of taking the whole page down.
    const settled = await Promise.allSettled(characters.map(loadCharacter));
    state.players = settled
      .filter((entry) => entry.status === 'fulfilled' && entry.value)
      .map((entry) => entry.value)
      .sort((a, b) => a.name.localeCompare(b.name));

    state.page = 1;
    render();
  } catch (err) {
    const message =
      err && err.name === 'AbortError' ? 'server tidak merespons' : (err && err.message) || 'gagal memuat';
    state.players = [];
    render();
    statusEl.textContent = `Tidak bisa menghubungi server: ${message}`;
    statusEl.classList.add('error');
  } finally {
    refreshBtn.disabled = false;
  }
}

pageSizeEl.innerHTML = PAGE_SIZE_OPTIONS.map(
  (size) => `<option value="${size}"${size === state.pageSize ? ' selected' : ''}>${size} baris</option>`,
).join('');

refreshBtn.addEventListener('click', load);
load();