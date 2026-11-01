// src/lib/analyze.js
//
// Pure, dependency-free aggregation for the NotchRP player stats page.
// It mirrors the tracker logic in NotchRP (activity.js / sidejob.js /
// farmer.js / mechanic.js / taxi.js / ledger.js / playtime.js) so the numbers
// shown here line up with what the overlay shows in-game.
//
// A "dataset" is built from the JSON files the player drags out of their
// NotchRP data folder (e.g. characters/<slug>/activity.json).

const DAY_MS = 24 * 60 * 60 * 1000;

// --------------------------------------------------------------------- labels

export function fmtMoney(value) {
  return '$' + Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtInt(value) {
  return Number(value || 0).toLocaleString('en-US');
}

// ------------------------------------------------------------------ activity

export const ACTIVITY_JOBS = [
  { id: 'fishing', label: 'Fishing', emoji: '🎣', noun: 'ikan' },
  { id: 'forager', label: 'Forager', emoji: '🍃', noun: 'item' },
  { id: 'hunter', label: 'Hunter', emoji: '🎯', noun: 'daging' },
  { id: 'prospector', label: 'Prospector', emoji: '💎', noun: 'scrap' },
  { id: 'recycling', label: 'Recycling', emoji: '♻️', noun: 'unit' },
  { id: 'pawn', label: 'Pawn', emoji: '🏷️', noun: 'item' },
];

export const SIDEJOB_JOBS = [
  { id: 'baggage', label: 'Baggage', emoji: '🧳' },
  { id: 'courier', label: 'Courier', emoji: '📦' },
  { id: 'forklift', label: 'Forklift', emoji: '📦' },
  { id: 'miner', label: 'Miner', emoji: '⛏️' },
  { id: 'bus', label: 'Bus Driver', emoji: '🚌' },
  { id: 'sweeper', label: 'Sweeper', emoji: '🧹' },
  { id: 'trashmaster', label: 'Trashmaster', emoji: '🗑️' },
];

export const TRUCK_JOBS = [
  { id: 'hauling', label: 'Hauling', emoji: '🚛' },
  { id: 'trucker', label: 'Trucker', emoji: '📦' },
];

const GAIN_KINDS = new Set(['catch', 'harvest', 'find', 'gut']);
const SELL_KINDS = new Set(['sell']);
const PAYOUT_KINDS = new Set(['earn', 'finish', 'stop']);

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function activityJobMeta(id) {
  return (
    ACTIVITY_JOBS.find((j) => j.id === id) || {
      id,
      label: String(id || ''),
      emoji: '📊',
      noun: 'item',
    }
  );
}

export function analyzeActivity(events) {
  const jobs = new Map(
    ACTIVITY_JOBS.map((j) => [
      j.id,
      { ...j, gained: 0, sold: 0, money: 0, grams: 0, events: 0, items: new Map() },
    ]),
  );
  const total = { gained: 0, sold: 0, money: 0, grams: 0, events: 0 };

  for (const e of events || []) {
    const job = jobs.get(e.job);
    if (!job) continue;
    job.events += 1;
    total.events += 1;

    const kind = e.kind;
    const money = toNum(e.money);
    const qty = e.qty != null ? toNum(e.qty) : 1;

    if (SELL_KINDS.has(kind)) {
      job.money += money;
      total.money += money;
      job.sold += toNum(e.qty);
      total.sold += toNum(e.qty);
    }
    if (GAIN_KINDS.has(kind)) {
      job.gained += qty || 1;
      total.gained += qty || 1;
    }
    if (kind === 'catch') {
      job.grams += toNum(e.weight);
      total.grams += toNum(e.weight);
    }

    // Per-item breakdown. Fishing keeps the species ("Ocean fish", "River
    // fish", "Lake fish"), prospector/forager keep the collected item. The
    // leaderboard turns these into extra sortable columns.
    if (e.item) {
      const row = job.items.get(e.item) || {
        name: String(e.item),
        gained: 0,
        sold: 0,
        money: 0,
        grams: 0,
        events: 0,
      };
      row.events += 1;
      if (SELL_KINDS.has(kind)) {
        row.money += money;
        row.sold += toNum(e.qty);
      }
      if (GAIN_KINDS.has(kind)) row.gained += qty || 1;
      if (kind === 'catch') row.grams += toNum(e.weight);
      job.items.set(e.item, row);
    }
  }

  const rows = [...jobs.values()].map((j) => ({
    ...j,
    items: [...j.items.values()]
      .map((it) => ({ ...it, count: it.gained > 0 ? it.gained : it.sold }))
      .sort((a, b) => b.count - a.count || b.money - a.money),
    // Primary count for a card: gained items for collecting jobs, sold units
    // for the sell-only jobs (recycling / pawn).
    count: j.gained > 0 ? j.gained : j.sold,
    countNoun: j.gained > 0 ? j.noun : j.noun,
  }));

  return {
    rows,
    total,
    top: rows
      .filter((j) => j.events > 0)
      .sort((a, b) => b.money - a.money || b.count - a.count)
      .slice(0, 6),
  };
}

// ------------------------------------------------------------------- farmer

function cropLabel(id) {
  if (!id || id === 'plants') return 'Plants';
  return id
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

export function analyzeFarmer(events) {
  const crops = new Map();
  const total = { seedQty: 0, seedMoney: 0, sellQty: 0, sellMoney: 0, events: 0 };

  for (const e of events || []) {
    total.events += 1;
    const qty = toNum(e.qty);
    const money = toNum(e.money);
    const key = e.crop || 'plants';
    let crop = crops.get(key);
    if (!crop) {
      crop = { id: key, label: cropLabel(key), emoji: '🌾', seedQty: 0, seedMoney: 0, sellQty: 0, sellMoney: 0 };
      crops.set(key, crop);
    }
    if (e.kind === 'seed') {
      crop.seedQty += qty;
      crop.seedMoney += money;
      total.seedQty += qty;
      total.seedMoney += money;
    } else {
      crop.sellQty += qty;
      crop.sellMoney += money;
      total.sellQty += qty;
      total.sellMoney += money;
    }
  }

  const rows = [...crops.values()]
    .filter((c) => c.seedQty > 0 || c.sellQty > 0)
    .sort((a, b) => b.sellMoney - a.sellMoney || b.sellQty - a.sellQty);

  return { rows: rows.slice(0, 12), total };
}

// ------------------------------------------------------------------ sidejob

/* Chat lines spell ores inconsistently ("gold ore" vs "DIAMOND"). Normalise to
 * a single sortable label so the table shows one Gold / Diamond column. */
function prettyItem(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const base = raw.replace(/\s+ore$/i, '').trim() || raw;
  return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
}

function analyzeSidejobGroup(events, group) {
  const meta = group === 'truck' ? TRUCK_JOBS : SIDEJOB_JOBS;
  const jobs = new Map(
    meta.map((j) => [j.id, { ...j, money: 0, payouts: 0, events: 0, items: new Map() }]),
  );
  const total = { money: 0, payouts: 0, events: 0 };

  for (const e of events || []) {
    if (e.group !== group) continue;
    let job = jobs.get(e.job);
    if (!job) {
      const label = String(e.job || '')
        .split('-')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
      job = {
        id: e.job,
        label: label || 'Job',
        emoji: '🔧',
        money: 0,
        payouts: 0,
        events: 0,
        items: new Map(),
      };
      jobs.set(e.job, job);
    }
    job.events += 1;
    total.events += 1;
    if (PAYOUT_KINDS.has(e.kind) && toNum(e.money) > 0) {
      job.money += toNum(e.money);
      job.payouts += 1;
      total.money += toNum(e.money);
      total.payouts += 1;
    }

    // Miner ores (and trucker crates) carry `item`. Group by the normalised
    // label so "gold ore" and "DIAMOND" become Gold / Diamond columns.
    if (e.item) {
      const label = prettyItem(e.item);
      const row = job.items.get(label) || { name: label, count: 0, money: 0, quality: 0 };
      row.count += Number(e.qty) || 1;
      row.money += toNum(e.money);
      if (e.quality) row.quality = Number(e.quality);
      job.items.set(label, row);
    }
  }

  const rows = [...jobs.values()]
    .filter((j) => j.events > 0)
    .map((j) => ({
      ...j,
      items: [...j.items.values()].sort((a, b) => b.count - a.count || b.money - a.money),
    }))
    .sort((a, b) => b.money - a.money || b.payouts - a.payouts);

  return { rows: rows.slice(0, 8), total };
}

export function analyzeSidejob(events) {
  return {
    sidejob: analyzeSidejobGroup(events || [], 'sidejob'),
    truck: analyzeSidejobGroup(events || [], 'truck'),
  };
}

// ----------------------------------------------------------------- mechanic

function dutyOpen(events) {
  let on = false;
  const sorted = [...(events || [])].sort((a, b) => toNum(a.at) - toNum(b.at));
  for (const e of sorted) if (e.type === 'duty') on = Boolean(e.on);
  return on;
}

export function analyzeMechanic(events) {
  const list = events || [];
  let income = 0;
  let components = 0;
  let work = 0;
  let pay = 0;
  let shifts = 0;

  for (const e of list) {
    if (e.type === 'work') {
      work += 1;
      components += toNum(e.components);
    } else if (e.type === 'pay') {
      pay += 1;
      income += toNum(e.amount);
    }
  }

  // Count duty shifts from consecutive on/off pairs.
  const duties = [...list].filter((e) => e.type === 'duty').sort((a, b) => toNum(a.at) - toNum(b.at));
  let open = false;
  for (const e of duties) {
    if (e.on && !open) shifts += 1;
    open = Boolean(e.on);
  }

  return { income, components, work, pay, shifts, on: dutyOpen(list) };
}

// --------------------------------------------------------------------- taxi

// Mirrors the desktop tracker (src/main/taxi.js): a "Transport of passenger …"
// row is one delivered passenger. The duty line can carry a bonus passenger
// ride, which is counted separately so the two never get mixed up.
const DELIVERY_RE = /^Transport of passenger\b/i;
const BONUS_RIDE_RE = /bonus\b.*passenger ride/i;
const DUTY_RE = /^Job duty payment\b/i;
const CANCELLED_RE = /cancelled order/i;

export function analyzeTaxi(data) {
  const rows = Array.isArray(data && data.rows) ? data.rows : [];
  let income = 0;
  let deliveries = 0;
  let bonusRides = 0;
  let dutyPayments = 0;
  let cancelled = 0;
  let other = 0;

  for (const r of rows) {
    income += toNum(r.amount);
    const reason = String((r && r.reason) || '');
    if (DELIVERY_RE.test(reason)) deliveries += 1;
    else if (BONUS_RIDE_RE.test(reason)) bonusRides += 1;
    else if (CANCELLED_RE.test(reason)) cancelled += 1;
    else if (DUTY_RE.test(reason)) dutyPayments += 1;
    else other += 1;
  }

  const pending = data && data.total && toNum(data.total.amount) > 0 ? toNum(data.total.amount) : 0;
  return {
    income,
    // Any passenger ride (strict delivery + bonus ride), matching the old
    // public number while `deliveries` keeps the strict count.
    passengers: deliveries + bonusRides,
    deliveries,
    bonusRides,
    dutyPayments,
    cancelled,
    other,
    records: rows.length,
    pending,
  };
}

// -------------------------------------------------------------------- ledger

export function analyzeLedger(events) {
  let inv = 0;
  let out = 0;
  let count = 0;
  for (const e of events || []) {
    count += 1;
    if (e.dir === 'in') inv += toNum(e.amount);
    else if (e.dir === 'out') out += toNum(e.amount);
  }
  return { in: inv, out, net: inv - out, count };
}

// ------------------------------------------------------------------ playtime

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function analyzePlaytime(byDay) {
  const map = byDay && typeof byDay === 'object' ? byDay : {};
  const now = new Date();
  const days = [];
  let totalMinutes = 0;
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dayKey(d);
    const minutes = toNum(map[key]);
    totalMinutes += minutes;
    days.push({
      day: key,
      label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
      minutes,
    });
  }
  return { days, totalMinutes, activeDays: days.filter((d) => d.minutes > 0).length };
}

// ------------------------------------------------------------------ property

export function analyzeProperty(items) {
  const list = Array.isArray(items) ? items : [];
  return { count: list.length, items: list };
}

export function analyzePaycheck(items) {
  const list = Array.isArray(items) ? items : [];
  let net = 0;
  for (const it of list) {
    const f = it && it.fields ? it.fields : {};
    const n = toNum(f.netIncome != null ? f.netIncome : it && it.netIncome);
    net += n;
  }
  return { count: list.length, net };
}

// -------------------------------------------------------------- file typing

export function detectType(fileName, obj) {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    if ('byDay' in obj) return 'playtime';
    if ('cash' in obj && 'bank' in obj) return 'money';
    if (Array.isArray(obj.rows) && ('total' in obj || 'fetchedAt' in obj)) return 'taxi';

    const ev = Array.isArray(obj.events) ? obj.events : null;
    if (ev && ev.length) {
      const e = ev[0];
      if (e && typeof e === 'object') {
        if (e.dir === 'in' || e.dir === 'out') return 'ledger';
        if ('type' in e) return 'mechanic';
        if ('group' in e) return 'sidejob';
        if (e.job && e.kind) return 'activity';
        if (e.kind && e.crop) return 'farmer';
      }
    }

    if (Array.isArray(obj.items)) {
      const it = obj.items[0];
      if (it && it.fields) return 'paycheck';
      return 'property';
    }
  }

  const fn = String(fileName || '').toLowerCase();
  if (/activity/.test(fn)) return 'activity';
  if (/farmer/.test(fn)) return 'farmer';
  if (/sidejob/.test(fn)) return 'sidejob';
  if (/mechanic/.test(fn)) return 'mechanic';
  if (/taxi/.test(fn)) return 'taxi';
  if (/ledger/.test(fn)) return 'ledger';
  if (/money/.test(fn)) return 'money';
  if (/playtime/.test(fn)) return 'playtime';
  if (/paycheck/.test(fn)) return 'paycheck';
  if (/property/.test(fn)) return 'property';
  return 'unknown';
}

// ------------------------------------------------------------------- dataset

function mergeEvents(base, next) {
  // Chatlog-derived events are append-only lists; concatenate and de-dup by a
  // cheap key so dropping the same file twice does not double a number.
  const seen = new Set();
  const out = [];
  for (const e of [...(base || []), ...(next || [])]) {
    if (!e || typeof e !== 'object') continue;
    const key = JSON.stringify(e);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  out.sort((a, b) => toNum(a.at) - toNum(b.at));
  return out;
}

/**
 * Build one character's aggregated dataset from parsed files.
 * @param {{ fileName: string, json: any }[]} files
 */
export function buildDataset(files) {
  const raw = {
    activity: [],
    farmer: [],
    sidejob: [],
    mechanic: [],
    ledger: [],
    taxi: null,
    money: null,
    playtime: null,
    property: null,
    paycheck: null,
  };
  const sources = new Set();
  const ignored = [];

  for (const f of files || []) {
    const type = detectType(f.fileName, f.json);
    if (type === 'unknown') {
      ignored.push(f.fileName);
      continue;
    }
    sources.add(type);
    if (type === 'activity') raw.activity = mergeEvents(raw.activity, f.json.events);
    else if (type === 'farmer') raw.farmer = mergeEvents(raw.farmer, f.json.events);
    else if (type === 'sidejob') raw.sidejob = mergeEvents(raw.sidejob, f.json.events);
    else if (type === 'mechanic') raw.mechanic = mergeEvents(raw.mechanic, f.json.events);
    else if (type === 'ledger') raw.ledger = mergeEvents(raw.ledger, f.json.events);
    else if (type === 'taxi') raw.taxi = f.json;
    else if (type === 'money') raw.money = f.json;
    else if (type === 'playtime') raw.playtime = { ...(raw.playtime || {}), ...(f.json || {}) };
    else if (type === 'property') raw.property = f.json;
    else if (type === 'paycheck') raw.paycheck = f.json;
  }

  const activity = analyzeActivity(raw.activity);
  const farmer = analyzeFarmer(raw.farmer);
  const sidejob = analyzeSidejob(raw.sidejob);
  const mechanic = analyzeMechanic(raw.mechanic);
  const taxi = analyzeTaxi(raw.taxi);
  const ledger = analyzeLedger(raw.ledger);
  const playtime = analyzePlaytime(raw.playtime && raw.playtime.byDay);
  const property = analyzeProperty(raw.property && raw.property.items);
  const paycheck = analyzePaycheck(raw.paycheck && raw.paycheck.items);

  const money = {
    cash: toNum(raw.money && raw.money.cash),
    bank: toNum(raw.money && raw.money.bank),
    at: toNum(raw.money && raw.money.at),
    name: String((raw.money && raw.money.name) || '').trim(),
  };

  // Total income: prefer the ledger (it owns money in/out across every job);
  // fall back to the sum of every tracked source when no ledger was exported.
  const jobMoney =
    activity.total.money +
    farmer.total.sellMoney +
    sidejob.sidejob.total.money +
    sidejob.truck.total.money +
    mechanic.income +
    taxi.income;
  const totalIncome = raw.ledger.length > 0 ? ledger.in : jobMoney;

  const totalItems = activity.total.gained + activity.total.sold;

  return {
    name: money.name,
    money,
    activity,
    farmer,
    sidejob,
    mechanic,
    taxi,
    ledger,
    playtime,
    property,
    paycheck,
    sources: [...sources],
    ignored,
    totals: {
      income: totalIncome,
      expense: raw.ledger.length > 0 ? ledger.out : farmer.total.seedMoney,
      items: totalItems,
      playtimeMinutes: playtime.totalMinutes,
    },
    hasData: sources.size > 0,
  };
}