'use strict';
/* طاقم · منطق الشغل المشترك: الحضور، حالة اليوم، المرتبات، أرصدة العملاء، الإشعارات */
const { db } = require('./db');
const U = require('./util');
const webpush = require('./webpush');

const HUES = [222, 32, 152, 280, 4, 190, 330, 96, 260, 12];

function empPublic(e) {
  if (!e) return null;
  return {
    id: e.id, name: e.name, job: e.job || '', phone: e.phone || '', username: e.username,
    active: !!e.active, track: !!e.track, shift_start: e.shift_start || '', shift_end: e.shift_end || '',
    rest_days: e.rest_days == null ? '' : e.rest_days, site_id: e.site_id || '', salary: e.salary || 0, hue: e.hue == null ? 222 : e.hue,
    photo: e.photo ? '/api/emp-photo/' + e.id + '?v=' + String(e.photo.length) : '',
    last_login_at: e.last_login_at, last_lat: e.last_lat, last_lng: e.last_lng, last_at: e.last_at, last_battery: e.last_battery
  };
}
const shiftOf = e => ({ start: e.shift_start || U.cfg('shift_start'), end: e.shift_end || U.cfg('shift_end') });
const restOf = e => String(e.rest_days != null && e.rest_days !== '' ? e.rest_days : U.cfg('rest_days')).split(',').map(s => s.trim()).filter(s => s !== '').map(Number);
const isRest = (e, ds) => restOf(e).includes(U.dow(ds));

/* nearest workplace to a point */
function nearestSite(lat, lng) {
  let best = null;
  for (const s of db.prepare('SELECT * FROM sites').all()) {
    const d = U.haversine(lat, lng, s.lat, s.lng); if (d == null) continue;
    if (!best || d < best.dist) best = { id: s.id, name: s.name, radius: s.radius, dist: d };
  }
  return best;
}

function openAtt(empId) { return db.prepare('SELECT * FROM attendance WHERE emp_id = ? AND out_at IS NULL ORDER BY id DESC LIMIT 1').get(empId); }
function lateOf(e, inAt) {
  const s = U.minOf(shiftOf(e).start), m = U.tsMin(inAt), g = U.cfgNum('grace_min');
  if (s == null || m == null) return 0;
  return m - s > g ? m - s : 0;
}
function otOf(e, outAt) {
  const s = U.minOf(shiftOf(e).end), m = U.tsMin(outAt);
  if (s == null || m == null) return 0;
  return m - s > 15 ? m - s : 0;
}

/* the board: where every employee is today */
function dayBoard(date) {
  const ds = date || U.today(), now = U.nowTs();
  const emps = db.prepare('SELECT * FROM employees WHERE active = 1 ORDER BY name').all();
  const att = db.prepare('SELECT * FROM attendance WHERE date = ? ORDER BY id').all(ds);
  const vis = db.prepare('SELECT * FROM visits WHERE date = ? ORDER BY id').all(ds);
  const tasks = db.prepare("SELECT * FROM tasks WHERE status IN ('new','accepted','on_way','arrived') OR substr(done_at,1,10) = ? ORDER BY id DESC").all(ds);
  const nowMin = U.tsMin(now);
  return emps.map(e => {
    const a = att.filter(x => x.emp_id === e.id);
    const v = vis.filter(x => x.emp_id === e.id);
    const t = tasks.filter(x => x.emp_id === e.id);
    const sh = shiftOf(e);
    let state = 'absent';
    const open = a.find(x => !x.out_at);
    if (isRest(e, ds) && !a.length) state = 'rest';
    else if (open) state = t.some(x => x.status === 'on_way') ? 'on_way' : v.some(x => !x.end_at) ? 'visit' : 'in';
    else if (a.length) state = 'out';
    else if (ds === U.today() && U.minOf(sh.start) != null && nowMin < U.minOf(sh.start) + U.cfgNum('grace_min')) state = 'not_yet';
    return {
      emp: empPublic(e), state, shift: sh,
      late_min: a.length ? a[0].late_min : 0,
      att: a.map(x => ({ id: x.id, in_at: x.in_at, out_at: x.out_at, in_dist: x.in_dist, in_site: x.in_site, late_min: x.late_min, source: x.source })),
      visits: v.map(x => ({ id: x.id, client_name: x.client_name, start_at: x.start_at, end_at: x.end_at, purpose: x.purpose })),
      tasks: t.map(x => ({ id: x.id, title: x.title, client_name: x.client_name, status: x.status, dist: x.dist, d0: x.d0 }))
    };
  });
}

/* ── payroll for one month (computed from attendance; nothing stored but the inputs) ── */
function payroll(month) {
  const m = U.isMonth(month) ? month : U.thisMonth();
  const dIn = U.daysIn(m), td = U.today();
  const payDays = U.cfgNum('pay_days') || 30;
  const emps = db.prepare('SELECT * FROM employees ORDER BY active DESC, name').all();
  const att = db.prepare("SELECT * FROM attendance WHERE substr(date,1,7) = ?").all(m);
  const rewards = db.prepare('SELECT * FROM rewards WHERE month = ?').all(m);
  const adjs = db.prepare('SELECT * FROM adjustments WHERE month = ?').all(m);
  const loans = db.prepare('SELECT * FROM loans WHERE active = 1').all();
  const tasksDone = db.prepare("SELECT emp_id, COUNT(*) n FROM tasks WHERE status = 'done' AND substr(done_at,1,7) = ? GROUP BY emp_id").all(m);
  const visitsN = db.prepare('SELECT emp_id, COUNT(*) n FROM visits WHERE substr(date,1,7) = ? GROUP BY emp_id').all(m);
  return emps.filter(e => e.active || att.some(a => a.emp_id === e.id)).map(e => {
    const sh = shiftOf(e);
    const shiftMin = Math.max(60, (U.minOf(sh.end) || 1020) - (U.minOf(sh.start) || 540));
    const daily = (e.salary || 0) / payDays, perMin = daily / shiftMin;
    const mine = att.filter(a => a.emp_id === e.id);
    const daysPresent = new Set(mine.map(a => a.date));
    let workDays = 0, absent = 0;
    for (let d = 1; d <= dIn; d++) {
      const ds = m + '-' + String(d).padStart(2, '0');
      if (ds > td) break;
      if (isRest(e, ds)) continue;
      workDays++;
      if (!daysPresent.has(ds) && ds < td) absent++;
    }
    const lateMin = mine.reduce((s, a) => s + (a.late_min || 0), 0);
    const otMin = mine.reduce((s, a) => s + (a.ot_min || 0), 0);
    const lateDed = r2(lateMin * perMin * U.cfgNum('late_mult'));
    const absentDed = r2(absent * daily * U.cfgNum('absent_mult'));
    const otPay = r2(otMin * perMin * U.cfgNum('ot_mult'));
    const rw = rewards.filter(r => r.emp_id === e.id);
    const ad = adjs.filter(a => a.emp_id === e.id);
    const bonus = r2(rw.reduce((s, r) => s + r.amount, 0) + ad.filter(a => a.kind === 'bonus').reduce((s, a) => s + a.amount, 0));
    const deduct = r2(ad.filter(a => a.kind === 'deduct').reduce((s, a) => s + a.amount, 0));
    const myLoans = loans.filter(l => l.emp_id === e.id).map(l => {
      const [y0, m0] = l.start_month.split('-').map(Number), [y1, m1] = m.split('-').map(Number);
      const idx = (y1 - y0) * 12 + (m1 - m0);
      return idx >= 0 && idx < l.n ? { id: l.id, part: r2(l.total / l.n), idx: idx + 1, n: l.n, note: l.note, total: l.total } : null;
    }).filter(Boolean);
    const loanDed = r2(myLoans.reduce((s, l) => s + l.part, 0));
    const net = r2((e.salary || 0) + otPay + bonus - lateDed - absentDed - deduct - loanDed);
    const tdn = (tasksDone.find(x => x.emp_id === e.id) || {}).n || 0;
    const vn = (visitsN.find(x => x.emp_id === e.id) || {}).n || 0;
    const score = Math.max(0, Math.min(100, Math.round(100 - absent * 8 - Math.min(30, lateMin / 6) + Math.min(10, tdn * 1.5) + Math.min(5, vn * 0.3))));
    return {
      emp: empPublic(e), salary: e.salary || 0, workDays, present: daysPresent.size, absent, lateMin, otMin,
      lateDed, absentDed, otPay, bonus, deduct, loanDed, loans: myLoans, net, score, tasksDone: tdn, visits: vn,
      rewards: rw.map(r => ({ id: r.id, amount: r.amount, reason: r.reason })), adjustments: ad.map(a => ({ id: a.id, kind: a.kind, amount: a.amount, note: a.note }))
    };
  });
}
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

/* ── clients: balance + months ── */
function balanceOf(cid) {
  const r = db.prepare("SELECT COALESCE(SUM(CASE WHEN kind='invoice' THEN amount ELSE 0 END),0) inv, COALESCE(SUM(CASE WHEN kind='payment' THEN amount ELSE 0 END),0) pay FROM ledger WHERE client_id = ?").get(cid);
  return { invoiced: r2(r.inv), paid: r2(r.pay), balance: r2(r.inv - r.pay) };
}
function monthsOf(cid, n = 12) {
  const out = [], [y, m] = U.thisMonth().split('-').map(Number);
  const rows = db.prepare("SELECT substr(date,1,7) mo, kind, SUM(amount) s FROM ledger WHERE client_id = ? GROUP BY mo, kind").all(cid);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1)), mo = d.toISOString().slice(0, 7);
    out.push({ month: mo, invoiced: r2((rows.find(r => r.mo === mo && r.kind === 'invoice') || {}).s), paid: r2((rows.find(r => r.mo === mo && r.kind === 'payment') || {}).s) });
  }
  return out;
}

/* ── notifications: phones (web push) + open screens (SSE) ── */
function managerIds() { return db.prepare('SELECT id FROM users').all().map(u => 'u:' + u.id); }
function notifyManagers(msg, ev) {
  if (ev) U.emit(ev.type || 'change', ev.data || {});
  webpush.send(managerIds(), Object.assign({ url: '/' }, msg)).catch(() => {});
}
function notifyEmp(empId, msg) { webpush.send(['e:' + empId], Object.assign({ url: '/app' }, msg)).catch(() => {}); }

module.exports = { HUES, empPublic, shiftOf, restOf, isRest, nearestSite, openAtt, lateOf, otOf, dayBoard, payroll, balanceOf, monthsOf, notifyManagers, notifyEmp, r2 };
