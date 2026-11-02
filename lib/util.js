'use strict';
/* طاقم · أدوات مشتركة: الوقت بتوقيت القاهرة، المسافات، الباسوردات، الإعدادات، البث المباشر */
const crypto = require('node:crypto');
const { db } = require('./db');

const TZ = process.env.TZ_APP || 'Africa/Cairo';
const fmtTs = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
/* the server's clock, in Cairo — never the phone's */
const nowTs = () => fmtTs.format(new Date()).replace('T', ' ');
const today = () => nowTs().slice(0, 10);
const thisMonth = () => today().slice(0, 7);
const minOf = hhmm => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; };
const tsMin = ts => minOf(String(ts || '').slice(11, 16));
const dow = ds => new Date(ds + 'T12:00:00Z').getUTCDay();   // 0 = الأحد … 5 = الجمعة
const daysIn = month => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const isMonth = s => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s || ''));

function haversine(a, b, c, d) {
  if ([a, b, c, d].some(v => v == null || !Number.isFinite(+v))) return null;
  const R = 6371000, r = x => x * Math.PI / 180;
  const dLat = r(c - a), dLng = r(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/* scrypt — same strength as the ERP's own users */
function hash(pw) { const salt = crypto.randomBytes(16); const k = crypto.scryptSync(String(pw), salt, 64); return 's1$' + salt.toString('hex') + '$' + k.toString('hex'); }
function verify(pw, stored) {
  const p = String(stored || '').split('$'); if (p.length !== 3) return false;
  const k = crypto.scryptSync(String(pw), Buffer.from(p[1], 'hex'), 64);
  const s = Buffer.from(p[2], 'hex'); return s.length === k.length && crypto.timingSafeEqual(s, k);
}
const uid = (n = 10) => { const AB = 'abcdefghijkmnpqrstuvwxyz23456789'; return Array.from(crypto.randomBytes(n), b => AB[b % AB.length]).join(''); };
function genPass() { const AB = '23456789'; return Array.from(crypto.randomBytes(6), b => AB[b % AB.length]).join(''); }
function shortCode() {
  const AB = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let c; do { c = Array.from(crypto.randomBytes(7), b => AB[b % AB.length]).join(''); } while (!/\d/.test(c) || db.prepare('SELECT 1 FROM clients WHERE portal_code = ?').get(c));
  return c;
}

/* ── settings ── */
const DEFAULTS = {
  company: 'طاقم', tagline: 'الفريق الميداني ومتابعة العملاء', logo: '', currency: 'ج.م',
  shift_start: '09:00', shift_end: '17:00', rest_days: '5', grace_min: '10',
  ping_min: '15', require_location: '1', geofence: 'warn', arrive_radius: '200',
  chat_on: '1', pay_days: '30', late_mult: '1', absent_mult: '1', ot_mult: '1.5',
  order_items: 'ورق A3\nورق A4\nفيلم أشعة 8×10\nفيلم أشعة 10×12\nفيلم أشعة 14×17',
  devices: 'طابعة أفلام\nطابعة ورق\nجهاز الأشعة\nكمبيوتر / سيستم\nحاجة تانية',
  purposes: 'توصيل ورق\nتحصيل\nمتابعة / زيارة\nصيانة\nاستلام مرتجع\nتاني'
};
function cfgAll() { const o = Object.assign({}, DEFAULTS); for (const r of db.prepare('SELECT k, v FROM settings').all()) o[r.k] = r.v; return o; }
const cfg = k => { const r = db.prepare('SELECT v FROM settings WHERE k = ?').get(k); return r ? r.v : DEFAULTS[k]; };
const cfgNum = k => { const n = Number(cfg(k)); return Number.isFinite(n) ? n : Number(DEFAULTS[k]); };
function cfgSet(k, v) { db.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, String(v == null ? '' : v)); }
const lines = k => String(cfg(k) || '').split('\n').map(s => s.trim()).filter(Boolean);

function log(who, action, detail) { try { db.prepare('INSERT INTO log (at, who, action, detail) VALUES (?, ?, ?, ?)').run(nowTs(), String(who || ''), action, typeof detail === 'string' ? detail : JSON.stringify(detail || '')); } catch (_) {} }

/* ── live events for open manager screens (Server-Sent Events) ── */
const clients = new Set();
function sseOpen(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 4000\n\n');
  clients.add(res);
  const t = setInterval(() => { try { res.write(': k\n\n'); } catch (_) {} }, 25000);
  req.on('close', () => { clearInterval(t); clients.delete(res); });
}
function emit(type, data) { const s = 'event: ' + type + '\ndata: ' + JSON.stringify(data || {}) + '\n\n'; for (const r of clients) { try { r.write(s); } catch (_) {} } }

/* ── http ── */
class Fail extends Error { constructor(msg, code) { super(msg); this.code = code || 400; } }
const fail = (m, c) => { throw new Fail(m, c); };
const str = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
function readBody(req, limit = 3_000_000) {
  return new Promise((ok, no) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { no(new Fail('الملف كبير', 413)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!chunks.length) return ok({}); try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { no(new Fail('بيانات مش مفهومة')); } });
    req.on('error', no);
  });
}
function send(res, code, obj, headers) {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': b.length }, headers || {}));
  res.end(b);
}
function cookies(req) { const o = {}; String(req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }); return o; }
const secure = req => req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === '1';
const setCookie = (req, name, val, maxAge) => name + '=' + encodeURIComponent(val) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAge + (secure(req) ? '; Secure' : '');

/* photos: a data URL from the phone → a small BLOB row */
function savePhoto(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64'); if (buf.length > 900_000) fail('الصورة كبيرة');
  return Number(db.prepare('INSERT INTO photos (mime, data, created_at) VALUES (?, ?, ?)').run(m[1], buf, nowTs()).lastInsertRowid);
}

module.exports = { TZ, nowTs, today, thisMonth, minOf, tsMin, dow, daysIn, isDate, isMonth, haversine, hash, verify, uid, genPass, shortCode, cfgAll, cfg, cfgNum, cfgSet, lines, DEFAULTS, log, sseOpen, emit, Fail, fail, str, num, readBody, send, cookies, setCookie, savePhoto };
