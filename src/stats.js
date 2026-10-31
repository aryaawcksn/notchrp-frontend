// src/stats.js — player statistics page wiring.
//
// Two ways to get data in, both aggregated client-side by lib/analyze.js:
//
//   1. Server mode (VITE_STATS_API_URL set): the desktop app uploads a
//      character snapshot to the self-hosted backend, and this page reads the
//      public GET /api/characters endpoints. Only the JSON files the app
//      already saved are transferred; nothing here writes to the server.
//   2. Local mode (no API URL): files are read with FileReader, parsed, and
//      kept in memory. Nothing leaves the browser.
//
// The drop zone and the "tempel JSON" box keep working in both modes so a
// file can be inspected without uploading it.

import './style.css';
import './stats.css';
import { buildDataset, fmtMoney, fmtInt } from './lib/analyze.js';

/* --------------------------------------------------------- server config */

// Set at build time (Vercel → Environment Variables). Empty means "local
// only", which is also what `npm run dev` does unless a .env.local exists.
const API_BASE = String(import.meta.env.VITE_STATS_API_URL || '')
  .trim()
  .replace(/\/+$/, '');
const SERVER_ENABLED = API_BASE.length > 0;

/* --------------------------------------------------------------- state */

const state = {
  characters: [], // { id, name, files: [{ fileName, json }], fromServer? }
  selectedId: null,
  server: {
    status: SERVER_ENABLED ? 'idle' : 'disabled', // idle | loading | ready | error | disabled
    characters: [],
    error: '',
  },
};

const uid = () => Math.random().toString(36).slice(2, 9);

/* ------------------------------------------------------------ dom refs */

const $ = (sel) => document.querySelector(sel);
const dropzone = $('#dropzone');
const fileInput = $('#file-input');
const emptyState = $('#empty-state');
const dashboard = $('#dashboard');
const charChips = $('#char-chips');
const charName = $('#char-name');

/* ------------------------------------------------------------- helpers */

function currentCharacter() {
  return state.characters.find((c) => c.id === state.selectedId) || null;
}

function datasetOf(character) {
  if (!character) return null;
  return buildDataset(character.files);
}

function hoursLabel(minutes) {
  const m = Number(minutes) || 0;
  if (m < 60) return `${Math.round(m)} mnt`;
  return `${(m / 60).toFixed(1)} jam`;
}

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function toast(message, tone = 'info') {
  let el = document.getElementById('stats-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'stats-toast';
    el.className =
      'fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full border px-5 py-2.5 text-sm font-medium shadow-2xl transition-all duration-200';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.borderColor =
    tone === 'error' ? 'rgba(255,107,107,.5)' : tone === 'ok' ? 'rgba(74,222,128,.5)' : 'rgba(124,156,255,.5)';
  el.style.background = 'rgba(11,11,16,.95)';
  el.style.color = '#f2f3f7';
  el.style.opacity = '1';
  el.style.transform = 'translate(-50%, 0)';
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, 8px)';
  }, 2400);
}

/* ------------------------------------------------------- file ingestion */

async function readFiles(fileList) {
  const files = [];
  const problems = [];
  for (const file of fileList) {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      files.push({ fileName: file.name, json });
    } catch (err) {
      problems.push(file.name);
    }
  }
  return { files, problems };
}

function addFilesToCharacter(files) {
  if (!files.length) return;
  let character = currentCharacter();
  if (!character) {
    character = { id: uid(), name: '', files: [] };
    state.characters.push(character);
    state.selectedId = character.id;
  }
  // Replace files of the same type instead of appending a duplicate, so
  // re-dropping activity.json refreshes rather than doubles it.
  for (const f of files) {
    const type = detectTypeName(f.fileName, f.json);
    character.files = character.files.filter((old) => detectTypeName(old.fileName, old.json) !== type);
    character.files.push(f);
  }
  // Auto-fill the name from money.json when the user has not typed one.
  if (!character.name) {
    const ds = buildDataset(character.files);
    if (ds.name) character.name = ds.name;
  }
}

// Lightweight duplicate-type check (mirrors lib/analyze detectType).
function detectTypeName(fileName, obj) {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    if ('byDay' in obj) return 'playtime';
    if ('cash' in obj && 'bank' in obj) return 'money';
    if (Array.isArray(obj.rows) && ('total' in obj || 'fetchedAt' in obj)) return 'taxi';
    const ev = Array.isArray(obj.events) ? obj.events : null;
    if (ev && ev.length && ev[0] && typeof ev[0] === 'object') {
      const e = ev[0];
      if (e.dir === 'in' || e.dir === 'out') return 'ledger';
      if ('type' in e) return 'mechanic';
      if ('group' in e) return 'sidejob';
      if (e.job && e.kind) return 'activity';
      if (e.kind && e.crop) return 'farmer';
    }
    if (Array.isArray(obj.items)) {
      const it = obj.items[0];
      if (it && it.fields) return 'paycheck';
      return 'property';
    }
  }
  const fn = String(fileName || '').toLowerCase();
  for (const type of ['activity', 'farmer', 'sidejob', 'mechanic', 'taxi', 'ledger', 'money', 'playtime', 'paycheck', 'property']) {
    if (fn.includes(type)) return type;
  }
  return 'unknown';
}

/* ----------------------------------------------------------- rendering */

function render() {
  // The server card list shows a "dimuat" badge that depends on state.characters.
  renderServer();

  const hasAny = state.characters.some((c) => c.files.length > 0);
  if (!hasAny) {
    emptyState.classList.remove('hidden');
    dashboard.classList.add('hidden');
    return;
  }
  emptyState.classList.add('hidden');
  dashboard.classList.remove('hidden');

  const character = currentCharacter();
  const ds = datasetOf(character);

  renderChips();
  charName.value = character ? character.name : '';
  // Server characters are renamed in-game; the field is only editable for
  // locally dropped files (where it feeds the chip label).
  charName.readOnly = Boolean(character && character.fromServer);
  charName.title = character && character.fromServer
    ? 'Nama mengikuti data karakter di server.'
    : 'Label tampilan untuk karakter yang kamu muat dari file.';
  renderSummary(ds);
  renderPlaytime(ds);
  renderActivity(ds);
  renderJobs(ds);
  renderLedger(ds);
  renderComparison();
  renderIgnored(ds);
}

function renderChips() {
  charChips.innerHTML = state.characters
    .map((c) => {
      const active = c.id === state.selectedId ? ' active' : '';
      const label = c.name || 'Tanpa Nama';
      const empty = c.files.length === 0 ? ' <span class="text-[10px] text-slate-500">(kosong)</span>' : '';
      const source = c.fromServer
        ? ' <span class="rounded-full bg-accent/15 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-accent-400">server</span>'
        : '';
      return `<span class="char-chip${active}" data-char-id="${c.id}">
        <span class="text-sm font-medium text-white">${esc(label)}</span>${source}${empty}
        <button class="close" data-del-id="${c.id}" aria-label="Hapus karakter">×</button>
      </span>`;
    })
    .join('');
}

function renderSummary(ds) {
  if (!ds) return;
  const balance = ds.money.cash + ds.money.bank;
  const cards = [
    { label: 'Saldo', value: fmtMoney(balance), sub: `cash ${fmtMoney(ds.money.cash)} · bank ${fmtMoney(ds.money.bank)}`, tone: 'text-emerald-400' },
    { label: 'Pendapatan', value: fmtMoney(ds.totals.income), sub: 'semua sumber job', tone: 'text-accent-400' },
    { label: 'Aktivitas', value: fmtInt(ds.totals.items), sub: 'item terkumpul / terjual', tone: 'text-white' },
    { label: 'Playtime', value: hoursLabel(ds.totals.playtimeMinutes), sub: '14 hari terakhir', tone: 'text-sky-400' },
    { label: 'Sumber', value: `${ds.sources.length} file`, sub: ds.sources.length ? ds.sources.join(', ') : 'belum ada', tone: 'text-slate-300' },
  ];
  $('#summary-cards').innerHTML = cards
    .map(
      (c) => `<div class="stat-card">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">${c.label}</div>
        <div class="mt-1.5 font-display text-xl font-bold ${c.tone} sm:text-2xl">${esc(c.value)}</div>
        <div class="mt-1 text-[11px] leading-tight text-slate-500">${esc(c.sub)}</div>
      </div>`,
    )
    .join('');
}

function renderPlaytime(ds) {
  const section = $('#playtime-section');
  const pt = ds.playtime;
  if (!pt || pt.totalMinutes <= 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  const max = Math.max(1, ...pt.days.map((d) => d.minutes));
  $('#playtime-chart').innerHTML = pt.days
    .map((d) => {
      const h = Math.round((d.minutes / max) * 100);
      const active = d.minutes > 0;
      return `<div class="pt-bar" title="${d.day}: ${d.minutes} menit">
        <span class="val">${active ? d.minutes : ''}</span>
        <span class="bar" style="height:${active ? Math.max(4, h) : 2}%;${active ? '' : 'opacity:.25'}"></span>
        <span class="lab">${d.label}</span>
      </div>`;
    })
    .join('');
  $('#playtime-summary').innerHTML = `Total <b class="text-white">${hoursLabel(pt.totalMinutes)}</b> · ${pt.activeDays} hari aktif dari 14 hari terakhir.`;
}

function renderActivity(ds) {
  const section = $('#activity-section');
  const rows = ds.activity.top;
  if (!rows.length) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  $('#activity-grid').innerHTML = rows
    .map((job) => {
      const extras = [];
      if (job.grams > 0) extras.push(`${(job.grams / 1000).toFixed(2)} kg`);
      if (job.sold > 0 && job.gained > 0) extras.push(`${fmtInt(job.sold)} terjual`);
      extras.push(`${fmtInt(job.events)} event`);
      return `<div class="stat-card">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-lg">${job.emoji}</span>
            <span class="font-display text-sm font-semibold text-white">${esc(job.label)}</span>
          </div>
          <span class="font-mono text-sm font-semibold text-emerald-400">${fmtMoney(job.money)}</span>
        </div>
        <div class="mt-3 flex items-baseline gap-1.5">
          <span class="font-display text-2xl font-bold text-white">${fmtInt(job.count)}</span>
          <span class="text-sm text-slate-400">${esc(job.countNoun)}</span>
        </div>
        <div class="mt-1 text-[11px] text-slate-500">${esc(extras.join(' · '))}</div>
      </div>`;
    })
    .join('');
}

function jobCard(title, emoji, rows, emptyText, formatter) {
  const body = rows.length
    ? rows
        .map(
          (r) => `<div class="flex items-center justify-between gap-3 border-b border-white/[0.04] py-1.5 last:border-0">
            <span class="flex items-center gap-2 text-sm text-slate-300">
              <span class="text-base">${r.emoji || '•'}</span>${esc(r.label)}
            </span>
            <span class="text-right text-sm">${formatter(r)}</span>
          </div>`,
        )
        .join('')
    : `<p class="py-2 text-sm text-slate-500">${esc(emptyText)}</p>`;
  return `<div class="rounded-2xl border border-white/[0.07] bg-ink-900/50 p-5">
    <h3 class="mb-2 flex items-center gap-2 font-display text-sm font-semibold text-white">
      <span class="text-base">${emoji}</span>${esc(title)}
    </h3>
    ${body}
  </div>`;
}

function renderJobs(ds) {
  const section = $('#jobs-section');
  const cards = [];

  // Sidejob
  if (ds.sidejob.sidejob.rows.length) {
    cards.push(
      jobCard(
        `Sidejob · ${fmtMoney(ds.sidejob.sidejob.total.money)}`,
        '🧰',
        ds.sidejob.sidejob.rows,
        'Belum ada sidejob',
        (r) => `<b class="text-emerald-400">${fmtMoney(r.money)}</b> <span class="text-[11px] text-slate-500">${fmtInt(r.payouts)}×</span>`,
      ),
    );
  }
  // Truck
  if (ds.sidejob.truck.rows.length) {
    cards.push(
      jobCard(
        `Truck · ${fmtMoney(ds.sidejob.truck.total.money)}`,
        '🚛',
        ds.sidejob.truck.rows,
        'Belum ada kerja truck',
        (r) => `<b class="text-emerald-400">${fmtMoney(r.money)}</b> <span class="text-[11px] text-slate-500">${fmtInt(r.payouts)}×</span>`,
      ),
    );
  }
  // Farmer
  if (ds.farmer.rows.length) {
    cards.push(
      jobCard(
        `Farmer · ${fmtMoney(ds.farmer.total.sellMoney)}`,
        '🌾',
        ds.farmer.rows,
        'Belum ada panen',
        (r) => `<b class="text-emerald-400">${fmtMoney(r.sellMoney)}</b> <span class="text-[11px] text-slate-500">${fmtInt(r.sellQty)} unit</span>`,
      ),
    );
  }
  // Mechanic
  if (ds.mechanic.work > 0 || ds.mechanic.income > 0) {
    const m = ds.mechanic;
    cards.push(`<div class="rounded-2xl border border-white/[0.07] bg-ink-900/50 p-5">
      <h3 class="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-white"><span class="text-base">🔧</span>Mekanik${m.on ? ' <span class="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">on duty</span>' : ''}</h3>
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div class="rounded-xl bg-white/[0.04] p-3"><div class="text-[10px] uppercase text-slate-500">Pendapatan</div><div class="mt-0.5 font-semibold text-emerald-400">${fmtMoney(m.income)}</div></div>
        <div class="rounded-xl bg-white/[0.04] p-3"><div class="text-[10px] uppercase text-slate-500">Shift</div><div class="mt-0.5 font-semibold text-white">${fmtInt(m.shifts)}</div></div>
        <div class="rounded-xl bg-white/[0.04] p-3"><div class="text-[10px] uppercase text-slate-500">Repair</div><div class="mt-0.5 font-semibold text-white">${fmtInt(m.work)}</div></div>
        <div class="rounded-xl bg-white/[0.04] p-3"><div class="text-[10px] uppercase text-slate-500">Komponen</div><div class="mt-0.5 font-semibold text-white">${fmtInt(m.components)}</div></div>
      </div>
    </div>`);
  }
  // Taxi
  if (ds.taxi.records > 0 || ds.taxi.income > 0) {
    const t = ds.taxi;
    cards.push(`<div class="rounded-2xl border border-white/[0.07] bg-ink-900/50 p-5">
      <h3 class="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-white"><span class="text-base">🚕</span>Taxi</h3>
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div class="rounded-xl bg-white/[0.04] p-3"><div class="text-[10px] uppercase text-slate-500">Pendapatan</div><div class="mt-0.5 font-semibold text-emerald-400">${fmtMoney(t.income)}</div></div>
        <div class="rounded-xl bg-white/[0.04] p-3"><div class="text-[10px] uppercase text-slate-500">Penumpang</div><div class="mt-0.5 font-semibold text-white">${fmtInt(t.passengers)}</div></div>
        <div class="rounded-xl bg-white/[0.04] p-3"><div class="text-[10px] uppercase text-slate-500">Slip gaji</div><div class="mt-0.5 font-semibold text-white">${fmtInt(t.records)}</div></div>
        <div class="rounded-xl bg-white/[0.04] p-3"><div class="text-[10px] uppercase text-slate-500">Pending</div><div class="mt-0.5 font-semibold text-amber-400">${fmtMoney(t.pending)}</div></div>
      </div>
    </div>`);
  }

  if (!cards.length) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  $('#jobs-grid').innerHTML = cards.join('');
}

function renderLedger(ds) {
  const section = $('#ledger-section');
  if (ds.ledger.count <= 0 && ds.farmer.total.seedMoney <= 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  const l = ds.ledger;
  const cards = [
    { label: 'Masuk', value: fmtMoney(l.in), tone: 'text-emerald-400' },
    { label: 'Keluar', value: fmtMoney(l.out), tone: 'text-rose-400' },
    { label: 'Net', value: `${l.net >= 0 ? '+' : '−'}${fmtMoney(Math.abs(l.net))}`, tone: l.net >= 0 ? 'text-emerald-400' : 'text-rose-400' },
    { label: 'Transaksi', value: fmtInt(l.count), tone: 'text-white' },
  ];
  $('#ledger-cards').innerHTML = cards
    .map(
      (c) => `<div class="rounded-xl bg-white/[0.04] p-4">
        <div class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">${c.label}</div>
        <div class="mt-1 font-display text-lg font-bold ${c.tone}">${esc(c.value)}</div>
      </div>`,
    )
    .join('');
}

function compareLines(ds) {
  const lines = [];
  for (const job of ds.activity.rows) {
    if (job.events <= 0) continue;
    lines.push({
      label: job.label,
      emoji: job.emoji,
      value: `${fmtInt(job.count)} ${job.countNoun} · ${fmtMoney(job.money)}`,
    });
  }
  if (ds.farmer.total.sellQty > 0) {
    lines.push({ label: 'Farmer', emoji: '🌾', value: `${fmtInt(ds.farmer.total.sellQty)} unit · ${fmtMoney(ds.farmer.total.sellMoney)}` });
  }
  const sj = ds.sidejob.sidejob.total;
  if (sj.money > 0) lines.push({ label: 'Sidejob', emoji: '🧰', value: `${fmtInt(sj.payouts)}× · ${fmtMoney(sj.money)}` });
  const tr = ds.sidejob.truck.total;
  if (tr.money > 0) lines.push({ label: 'Truck', emoji: '🚛', value: `${fmtInt(tr.payouts)}× · ${fmtMoney(tr.money)}` });
  if (ds.mechanic.income > 0) lines.push({ label: 'Mekanik', emoji: '🔧', value: `${fmtInt(ds.mechanic.shifts)} shift · ${fmtMoney(ds.mechanic.income)}` });
  if (ds.taxi.income > 0) lines.push({ label: 'Taxi', emoji: '🚕', value: `${fmtInt(ds.taxi.passengers)} penumpang · ${fmtMoney(ds.taxi.income)}` });
  return lines;
}

function renderComparison() {
  const section = $('#comparison-section');
  const filled = state.characters.filter((c) => c.files.length > 0);
  if (filled.length < 2) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  $('#comparison-grid').innerHTML = filled
    .map((c) => {
      const ds = datasetOf(c);
      const lines = compareLines(ds);
      const body = lines.length
        ? lines
            .map(
              (l) => `<div class="flex items-center justify-between gap-2 border-b border-white/[0.04] py-1.5 last:border-0">
                <span class="flex items-center gap-2 text-sm text-slate-300"><span>${l.emoji}</span>${esc(l.label)}</span>
                <span class="text-sm font-medium text-slate-200">${esc(l.value)}</span>
              </div>`,
            )
            .join('')
        : '<p class="py-2 text-sm text-slate-500">Belum ada aktivitas.</p>';
      return `<div class="rounded-2xl border border-white/[0.07] bg-ink-900/50 p-5">
        <div class="flex items-center justify-between">
          <h3 class="font-display text-base font-semibold text-white">${esc(c.name || 'Tanpa Nama')}</h3>
          <span class="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">${fmtMoney(ds.totals.income)}</span>
        </div>
        <div class="mt-1 text-[11px] text-slate-500">Saldo ${fmtMoney(ds.money.cash + ds.money.bank)} · Playtime ${hoursLabel(ds.totals.playtimeMinutes)}</div>
        <div class="mt-3">${body}</div>
      </div>`;
    })
    .join('');
}

function renderIgnored(ds) {
  const note = $('#ignored-note');
  if (ds && ds.ignored && ds.ignored.length) {
    note.textContent = `Dilewati (format tidak dikenali): ${ds.ignored.join(', ')}`;
    note.classList.remove('hidden');
  } else {
    note.classList.add('hidden');
  }
}

/* ------------------------------------------------------------ server mode */

async function fetchJson(pathname, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${pathname}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((body && body.error) || `HTTP ${res.status}`);
    }
    return body || {};
  } finally {
    clearTimeout(timer);
  }
}

function timeAgo(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const minutes = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}

function renderServer() {
  if (!SERVER_ENABLED) return;
  const status = $('#server-status');
  const grid = $('#server-chars');
  const s = state.server;
  if (!status || !grid) return;

  if (s.status === 'loading') {
    status.textContent = 'Memuat daftar karakter…';
  } else if (s.status === 'error') {
    status.textContent = `Tidak bisa menghubungi server: ${s.error}`;
  } else if (!s.characters.length) {
    status.textContent = 'Belum ada karakter di server. Unggah dari aplikasi NotchClone (Settings → Statistik).';
  } else {
    status.textContent = `${s.characters.length} karakter tersedia — klik kartu untuk membuka.`;
  }

  grid.innerHTML = s.characters
    .map((c) => {
      const summary = c.summary || {};
      const loaded = state.characters.some((x) => x.id === `srv:${c.slug}`);
      const balance = (Number(summary.cash) || 0) + (Number(summary.bank) || 0);
      const minutes = Number(summary.playtimeMinutes) || 0;
      const meta = [
        `Saldo ${fmtMoney(balance)}`,
        minutes > 0 ? `Playtime ${hoursLabel(minutes)}` : '',
        timeAgo(c.updatedAt),
      ].filter(Boolean);
      return `<button type="button" data-srv-slug="${esc(c.slug)}"
        class="group flex w-full flex-col gap-1 rounded-2xl border border-white/[0.07] bg-ink-950/60 p-4 text-left transition hover:border-accent/40 hover:bg-ink-850">
        <span class="flex items-center justify-between gap-2">
          <span class="font-display text-sm font-semibold text-white">${esc(c.name || c.slugDisplay || c.slug)}</span>
          <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            loaded ? 'bg-emerald-500/15 text-emerald-300' : 'bg-accent/15 text-accent-400'
          }">${loaded ? 'dimuat' : 'buka'}</span>
        </span>
        <span class="text-[11px] text-slate-500">${esc(meta.join(' · '))}</span>
      </button>`;
    })
    .join('');
}

async function refreshServer({ autoOpen = false } = {}) {
  if (!SERVER_ENABLED) return;
  const s = state.server;
  s.status = 'loading';
  s.error = '';
  renderServer();

  try {
    const body = await fetchJson('/api/characters');
    s.characters = Array.isArray(body.characters) ? body.characters : [];
    s.status = 'ready';
  } catch (err) {
    s.characters = [];
    s.status = 'error';
    s.error = err && err.name === 'AbortError' ? 'server tidak merespons' : (err && err.message) || 'gagal memuat';
  }

  renderServer();

  // First visit with an empty page: open the newest character so the visitor
  // lands on real data instead of an empty dashboard.
  if (autoOpen && s.status === 'ready' && s.characters.length && !state.characters.length) {
    await openServerCharacter(s.characters[0].slug, { silent: true });
  }
}

async function openServerCharacter(slug, { silent = false } = {}) {
  const clean = String(slug || '').trim();
  if (!clean) return;
  const id = `srv:${clean.toLowerCase()}`;
  if (!silent) toast('Memuat karakter…', 'info');

  try {
    const body = await fetchJson(`/api/characters/${encodeURIComponent(clean)}`);
    const character = body.character || {};
    // The API stores files as an object map; the dashboard expects the same
    // [{ fileName, json }] shape the file input produces.
    const files = Object.entries(character.files || {})
      .filter(([, json]) => json && typeof json === 'object')
      .map(([name, json]) => ({ fileName: `${name}.json`, json }));

    let entry = state.characters.find((c) => c.id === id);
    if (!entry) {
      entry = { id, name: '', files: [], fromServer: true };
      state.characters.push(entry);
    }
    entry.name = character.name || entry.name || '';
    entry.files = files;
    entry.fromServer = true;
    state.selectedId = id;

    render();
    if (!silent) toast(`${entry.name || clean}: ${files.length} file dimuat`, 'ok');
  } catch (err) {
    const message = err && err.name === 'AbortError' ? 'server tidak merespons' : (err && err.message) || err;
    toast(`Gagal memuat ${clean}: ${message}`, 'error');
  }
}

/* ---------------------------------------------------------- sample data */

function at(daysAgo, hh = 12, mm = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hh, mm, 0, 0);
  return d.getTime();
}

function playtimeMap(entries) {
  const byDay = {};
  for (const [daysAgo, minutes] of entries) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    byDay[key] = minutes;
  }
  return byDay;
}

function sampleFishing() {
  const activity = [];
  // 10 fish caught over the last week (matches "10 fish").
  const spots = ['Ocean', 'Lake', 'River', 'Ocean', 'Ocean', 'Lake', 'River', 'Ocean', 'Lake', 'Ocean'];
  spots.forEach((spot, i) => {
    const weight = 180 + i * 47;
    activity.push({
      at: at(6 - Math.floor(i / 2), 9 + (i % 5), 10 + i),
      job: 'fishing',
      kind: 'catch',
      item: `${spot} fish`,
      qty: 1,
      weight,
      text: `${spot} fish · ${weight} g`,
    });
  });
  activity.push({ at: at(3, 14, 2), job: 'fishing', kind: 'junk', text: 'hanya dapat sampah' });
  activity.push({ at: at(2, 15, 12), job: 'fishing', kind: 'sell', item: 'Fish', weight: 2200, money: 38.17, text: 'jual 2.2 kg ikan · $38.17' });
  activity.push({ at: at(1, 16, 40), job: 'fishing', kind: 'sell', item: 'Fish', weight: 3150, money: 61.83, text: 'jual 3.15 kg ikan · $61.83' });
  // A little forager + hunter so the other cards are alive.
  activity.push({ at: at(4, 11, 5), job: 'forager', kind: 'harvest', item: 'wild berries', qty: 6, text: '6 wild berries' });
  activity.push({ at: at(4, 11, 9), job: 'forager', kind: 'sell', item: 'wild berries', qty: 6, money: 6.0, text: 'jual 6 wild berries · $6.00' });
  activity.push({ at: at(2, 10, 20), job: 'hunter', kind: 'gut', item: 'Animal meat & skin', qty: 1, quality: 55, text: 'Animal meat & skin · 55q' });
  activity.push({ at: at(2, 10, 44), job: 'hunter', kind: 'sell', item: 'Hunted meat', quality: 55, money: 110.0, text: 'jual daging (55q) · $110.00' });

  const ledger = activity
    .filter((e) => e.kind === 'sell' && e.money > 0)
    .map((e) => ({ at: e.at, dir: 'in', amount: e.money, source: e.job, detail: e.item }));

  return [
    { fileName: 'money.json', json: { cash: 412.5, bank: 128000, at: at(0, 12, 0), name: 'Aldi_Rusmana' } },
    { fileName: 'activity.json', json: { events: activity, updatedAt: at(0, 12, 0) } },
    { fileName: 'ledger.json', json: { events: ledger, updatedAt: at(0, 12, 0) } },
    { fileName: 'playtime.json', json: { byDay: playtimeMap([[0, 120], [1, 95], [2, 60], [3, 140], [4, 30], [5, 210], [6, 75], [8, 45], [10, 90]]) } },
  ];
}

function sampleFarmer() {
  const farmer = [
    { at: at(5, 8, 0), kind: 'seed', crop: 'wheat', qty: 100, money: 28, src: 'chat', text: 'beli 100 Wheat · $28.00' },
    { at: at(4, 17, 30), kind: 'sell', crop: 'wheat', qty: 47, money: 26.79, src: 'chat', text: 'jual 47 Wheat · $26.79' },
    { at: at(3, 8, 15), kind: 'seed', crop: 'corn', qty: 60, money: 22, src: 'chat', text: 'beli 60 Corn · $22.00' },
    { at: at(2, 18, 5), kind: 'sell', crop: 'corn', qty: 39, money: 18.12, src: 'chat', text: 'jual 39 Corn · $18.12' },
    { at: at(1, 9, 0), kind: 'seed', crop: 'onion', qty: 40, money: 14.5, src: 'chat', text: 'beli 40 Onion · $14.50' },
    { at: at(0, 16, 45), kind: 'sell', crop: 'onion', qty: 55, money: 41.2, src: 'chat', text: 'jual 55 Onion · $41.20' },
  ];
  const sidejob = [
    { at: at(6, 10, 0), group: 'sidejob', job: 'courier', kind: 'finish', close: true, qty: 10, total: 10, text: '10 paket terkirim' },
    { at: at(5, 13, 0), group: 'sidejob', job: 'miner', kind: 'stop', close: true, money: 283.15, text: 'berhenti menambang · $283.15' },
    { at: at(4, 15, 0), group: 'truck', job: 'hauling', kind: 'earn', close: true, money: 394.12, text: 'kargo terkirim · $394.12' },
    { at: at(4, 15, 2), group: 'truck', job: 'hauling', kind: 'earn', close: false, money: 99.38, text: 'bonus no damage · $99.38' },
    { at: at(2, 11, 0), group: 'sidejob', job: 'trashmaster', kind: 'earn', close: true, deferred: true, money: 192.1, text: 'selesai (paycheck) · $192.10' },
  ];
  const mechanic = [
    { at: at(3, 19, 0), type: 'duty', on: true, text: 'on duty' },
    { at: at(3, 19, 20), type: 'work', vehicle: 'Sultan', part: 'engine', label: 'Engine', components: 94, text: 'Sultan · Engine · 94 comp' },
    { at: at(3, 19, 40), type: 'work', vehicle: 'Sultan', part: 'body', label: 'Body', components: 12, text: 'Sultan · Body · 12 comp' },
    { at: at(3, 19, 55), type: 'pay', amount: 90, payer: 'Isidoro Carballar', duty: true, text: 'Isidoro Carballar · $90.00' },
    { at: at(3, 21, 0), type: 'duty', on: false, text: 'off duty' },
  ];
  const ledger = [
    ...farmer.filter((e) => e.kind === 'sell').map((e) => ({ at: e.at, dir: 'in', amount: e.money, source: 'farmer', detail: e.crop })),
    { at: at(5, 13, 0), dir: 'in', amount: 283.15, source: 'sidejob', detail: 'Miner' },
    { at: at(4, 15, 2), dir: 'in', amount: 493.5, source: 'truck', detail: 'Hauling' },
    { at: at(2, 11, 0), dir: 'in', amount: 192.1, source: 'sidejob', detail: 'Trashmaster (paycheck)' },
    { at: at(3, 19, 55), dir: 'in', amount: 90, source: 'mechanic', detail: 'Mekanik · Isidoro Carballar' },
    { at: at(5, 8, 0), dir: 'out', amount: 28, source: 'farmer', detail: 'Wheat seeds' },
  ];

  return [
    { fileName: 'money.json', json: { cash: 1890.4, bank: 45210, at: at(0, 12, 0), name: 'Salsa_Putri' } },
    { fileName: 'farmer.json', json: { events: farmer, updatedAt: at(0, 12, 0) } },
    { fileName: 'sidejob.json', json: { events: sidejob, updatedAt: at(0, 12, 0) } },
    { fileName: 'mechanic.json', json: { events: mechanic, updatedAt: at(0, 12, 0) } },
    { fileName: 'ledger.json', json: { events: ledger, updatedAt: at(0, 12, 0) } },
    { fileName: 'playtime.json', json: { byDay: playtimeMap([[0, 60], [1, 180], [2, 240], [3, 300], [4, 120], [5, 90], [7, 150]]) } },
  ];
}

function loadSamples() {
  if (state.characters.some((c) => c.files.length > 0)) {
    if (!window.confirm('Muat contoh data akan mengganti data yang sudah dimuat. Lanjutkan?')) return;
  }
  state.characters = [
    { id: uid(), name: '', files: sampleFishing() },
    { id: uid(), name: '', files: sampleFarmer() },
  ];
  // Fill names from money.json.
  for (const c of state.characters) {
    const ds = buildDataset(c.files);
    c.name = ds.name || '';
  }
  state.selectedId = state.characters[0].id;
  render();
  toast('Contoh data dimuat: 2 karakter', 'ok');
}

/* --------------------------------------------------------------- wiring */

function openPicker() {
  fileInput.click();
}

dropzone.addEventListener('click', openPicker);
fileInput.addEventListener('change', async () => {
  const list = [...fileInput.files];
  fileInput.value = '';
  if (!list.length) return;
  const { files, problems } = await readFiles(list);
  if (!files.length) {
    toast('Tidak ada file JSON yang valid', 'error');
    return;
  }
  addFilesToCharacter(files);
  render();
  toast(`${files.length} file dimuat${problems.length ? `, ${problems.length} gagal` : ''}`, problems.length ? 'info' : 'ok');
});

['dragenter', 'dragover'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('dropzone-active');
  }),
);
['dragleave', 'drop'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (evt === 'dragleave' && dropzone.contains(e.relatedTarget)) return;
    dropzone.classList.remove('dropzone-active');
  }),
);
dropzone.addEventListener('drop', async (e) => {
  const list = [...(e.dataTransfer?.files || [])];
  if (!list.length) return;
  const { files, problems } = await readFiles(list);
  if (!files.length) {
    toast('Tidak ada file JSON yang valid', 'error');
    return;
  }
  addFilesToCharacter(files);
  render();
  toast(`${files.length} file dimuat${problems.length ? `, ${problems.length} gagal` : ''}`, problems.length ? 'info' : 'ok');
});

$('#sample-btn').addEventListener('click', loadSamples);

$('#add-char-btn').addEventListener('click', () => {
  const character = { id: uid(), name: '', files: [] };
  state.characters.push(character);
  state.selectedId = character.id;
  render();
  toast('Karakter baru ditambahkan — unggah file-nya', 'info');
});

$('#clear-btn').addEventListener('click', () => {
  if (!state.characters.length) return;
  if (!window.confirm('Hapus semua data yang dimuat?')) return;
  state.characters = [];
  state.selectedId = null;
  render();
  toast('Data dibersihkan', 'info');
});

// Character chips: select / delete.
charChips.addEventListener('click', (e) => {
  const del = e.target.closest('[data-del-id]');
  if (del) {
    const id = del.getAttribute('data-del-id');
    state.characters = state.characters.filter((c) => c.id !== id);
    if (state.selectedId === id) state.selectedId = state.characters[0]?.id || null;
    render();
    return;
  }
  const chip = e.target.closest('[data-char-id]');
  if (chip) {
    state.selectedId = chip.getAttribute('data-char-id');
    render();
  }
});

// Rename the selected character.
charName.addEventListener('input', () => {
  const character = currentCharacter();
  if (!character) return;
  character.name = charName.value.trim();
  // Update only the chip label, not the whole dashboard (keeps focus).
  renderChips();
});

// Paste JSON.
$('#paste-wrap').classList.remove('hidden');
$('#paste-btn').addEventListener('click', () => {
  const raw = $('#paste-area').value.trim();
  if (!raw) return;
  try {
    const json = JSON.parse(raw);
    addFilesToCharacter([{ fileName: 'pasted.json', json }]);
    render();
    toast('JSON diterapkan', 'ok');
  } catch {
    toast('JSON tidak valid', 'error');
  }
});

// Server controls (only when VITE_STATS_API_URL is configured).
if (SERVER_ENABLED) {
  const panel = $('#server-panel');
  if (panel) panel.classList.remove('hidden');

  const refreshBtn = $('#server-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', () => refreshServer());

  const list = $('#server-chars');
  if (list) {
    list.addEventListener('click', (e) => {
      const card = e.target.closest('[data-srv-slug]');
      if (!card) return;
      openServerCharacter(card.getAttribute('data-srv-slug'));
    });
  }
}

/* ---------------------------------------------------------------- init */

render();
if (SERVER_ENABLED) refreshServer({ autoOpen: true });