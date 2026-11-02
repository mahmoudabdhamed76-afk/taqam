'use strict';
/* ════════════════════════════════════════════════════════════════════
   طاقم (Taqam) — الفريق الميداني ومتابعة العملاء
   Node.js 22+ من غير أي مكتبات: node:http + node:sqlite
   ·  /        لوحة المدير
   ·  /app     تطبيق الموظف (حضور وانصراف بالموقع، مهام، زيارات، أعطال، محادثة)
   ·  /c/xxxx  لينك العميل (حسابه، طلب ورق/صيانة، متابعة الطلب)
════════════════════════════════════════════════════════════════════ */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { db } = require('./lib/db');
const U = require('./lib/util');
const cases = require('./lib/cases');   // حالات المرضى بالباركود (/k/ للمركز، /v/ و /h/ للمريض) — نفس نظام Ozarex
const tiles = require('./lib/tiles');   // صور الخريطة من سيرفرنا (OSM) — CARTO بقى بيطلب مفتاح
cases.setLookup(cid => { const c = db.prepare('SELECT phone FROM clients WHERE id = ?').get(cid); return (c && c.phone) || ''; });

const PORT = Number(process.env.PORT || 8080);
const PUB = path.join(__dirname, 'public');
const VERSION = require('./package.json').version;

/* ── router ── */
const routes = [];
function R(method, pattern, fn) {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, rx, keys, fn, pattern });
}
require('./routes/admin')(R);
require('./routes/staff')(R);
require('./routes/portal')(R);

/* ── sessions ── */
const SESSION_DAYS = 60;
function session(req, kind) {
  const sid = U.cookies(req)[kind === 'user' ? 'tq_u' : 'tq_e'];
  if (!sid) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE id = ? AND kind = ?').get(sid, kind);
  if (!s || Date.now() - s.last_seen > SESSION_DAYS * 864e5) return null;
  if (Date.now() - s.last_seen > 60000) db.prepare('UPDATE sessions SET last_seen = ? WHERE id = ?').run(Date.now(), sid);
  const who = kind === 'user' ? db.prepare('SELECT * FROM users WHERE id = ?').get(s.ref_id) : db.prepare('SELECT * FROM employees WHERE id = ? AND active = 1').get(s.ref_id);
  return who ? { sid, who } : null;
}
function newSession(req, kind, id) {
  const sid = require('node:crypto').randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (id, kind, ref_id, created_at, last_seen, ua) VALUES (?,?,?,?,?,?)').run(sid, kind, id, U.nowTs(), Date.now(), String(req.headers['user-agent'] || '').slice(0, 200));
  return U.setCookie(req, kind === 'user' ? 'tq_u' : 'tq_e', sid, SESSION_DAYS * 86400);
}
const tries = new Map();
function throttle(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const t = (tries.get(ip) || []).filter(x => Date.now() - x < 10 * 60000);
  if (t.length >= 12) U.fail('محاولات كتير — استنى 10 دقايق', 429);
  t.push(Date.now()); tries.set(ip, t);
}

/* ── auth endpoints (no session needed) ── */
async function authRoutes(req, res, url) {
  const p = url.pathname;
  if (p === '/api/health') return U.send(res, 200, { ok: true, v: VERSION });
  if (p === '/api/auth/state') return U.send(res, 200, { setup: !db.prepare('SELECT 1 FROM users LIMIT 1').get(), company: U.cfg('company'), logo: U.cfg('logo') });
  if (p === '/api/auth/setup' && req.method === 'POST') {
    if (db.prepare('SELECT 1 FROM users LIMIT 1').get()) U.fail('الحساب الأساسي متعمل بالفعل', 403);
    const b = await U.readBody(req);
    const name = U.str(b.name, 60), username = U.str(b.username, 40).toLowerCase();
    if (!name || !/^[a-z0-9._-]{3,40}$/.test(username)) U.fail('اكتب اسمك واسم دخول إنجليزي (3 حروف على الأقل)');
    if (String(b.password || '').length < 6) U.fail('الباسورد 6 حروف على الأقل');
    const id = U.uid();
    db.prepare('INSERT INTO users (id, name, username, pass, role, created_at) VALUES (?,?,?,?,?,?)').run(id, name, username, U.hash(b.password), 'admin', U.nowTs());
    if (U.str(b.company)) U.cfgSet('company', U.str(b.company, 60));
    return U.send(res, 200, { ok: true }, { 'Set-Cookie': newSession(req, 'user', id) });
  }
  if (p === '/api/auth/login' && req.method === 'POST') {
    throttle(req);
    const b = await U.readBody(req);
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(U.str(b.username, 40).toLowerCase());
    if (!u || !U.verify(b.password, u.pass)) U.fail('اسم الدخول أو الباسورد غلط', 401);
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(U.nowTs(), u.id);
    U.log(u.name, 'login', '');
    return U.send(res, 200, { ok: true }, { 'Set-Cookie': newSession(req, 'user', u.id) });
  }
  if (p === '/api/auth/logout' && req.method === 'POST') {
    const sid = U.cookies(req).tq_u; if (sid) db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
    return U.send(res, 200, { ok: true }, { 'Set-Cookie': U.setCookie(req, 'tq_u', '', 0) });
  }
  if (p === '/s/api/brand') return U.send(res, 200, { company: U.cfg('company'), logo: U.cfg('logo') });
  if (p === '/s/api/login' && req.method === 'POST') {
    throttle(req);
    const b = await U.readBody(req);
    const e = db.prepare('SELECT * FROM employees WHERE username = ?').get(U.str(b.username, 40).toLowerCase());
    if (!e || !U.verify(b.password, e.pass)) U.fail('اسم الدخول أو الباسورد غلط', 401);
    if (!e.active) U.fail('الحساب ده موقوف — كلّم الإدارة', 403);
    db.prepare('UPDATE employees SET last_login_at = ? WHERE id = ?').run(U.nowTs(), e.id);
    return U.send(res, 200, { ok: true }, { 'Set-Cookie': newSession(req, 'emp', e.id) });
  }
  if (p === '/s/api/logout' && req.method === 'POST') {
    const sid = U.cookies(req).tq_e; if (sid) db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
    return U.send(res, 200, { ok: true }, { 'Set-Cookie': U.setCookie(req, 'tq_e', '', 0) });
  }
  return false;
}

/* ── static files ── */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const cache = new Map();
function serveFile(req, res, file, opts = {}) {
  const ext = path.extname(file);
  let entry = cache.get(file);
  try {
    const st = fs.statSync(file);
    if (!entry || entry.mtime !== st.mtimeMs) {
      const raw = fs.readFileSync(file);
      const gz = /\.(html|js|css|json|svg)$/.test(file) && raw.length > 1024 ? zlib.gzipSync(raw) : null;
      entry = { raw, gz, mtime: st.mtimeMs, etag: '"' + st.size.toString(36) + '-' + Math.floor(st.mtimeMs).toString(36) + '"' };
      cache.set(file, entry);
    }
  } catch (_) { return false; }
  if (req.headers['if-none-match'] === entry.etag) { res.writeHead(304); res.end(); return true; }
  const h = { 'Content-Type': MIME[ext] || 'application/octet-stream', ETag: entry.etag, 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': ext === '.html' || opts.noCache ? 'no-cache' : /\.(woff2|png)$/.test(ext) || file.includes('/vendor/') ? 'public, max-age=604800' : 'no-cache' };
  if (opts.sw) h['Service-Worker-Allowed'] = '/';
  const useGz = entry.gz && /gzip/.test(req.headers['accept-encoding'] || '');
  if (useGz) h['Content-Encoding'] = 'gzip';
  const body = useGz ? entry.gz : entry.raw;
  h['Content-Length'] = body.length;
  res.writeHead(200, h); res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}

/* ── the server ── */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  try {
    if (p.startsWith('/tiles/') && tiles.handle(req, res, p)) return;
    if ((p.startsWith('/k/') || p.startsWith('/v/') || p.startsWith('/h/')) && await cases.handle(req, res, p) !== false) return;
    if (p === '/api/portal/cases' || p.startsWith('/api/portal/cases/')) { const s = session(req, 'user'); if (!s) return U.send(res, 401, { message: 'سجّل دخول' }); return await cases.adminApi(req, res, p, s.who); }
    if (await authRoutes(req, res, url) !== false) return;

    /* photos */
    let m;
    if ((m = /^\/api\/emp-photo\/([a-z0-9]+)$/.exec(p))) {
      const u = session(req, 'user'), e = session(req, 'emp');
      if (!u && !(e && e.who.id === m[1])) return U.send(res, 401, { message: 'سجّل دخول' });
      const row = db.prepare('SELECT photo FROM employees WHERE id = ?').get(m[1]);
      const mm = row && /^data:(image\/[a-z+]+);base64,(.+)$/.exec(row.photo || '');
      if (!mm) { res.writeHead(404); return res.end(); }
      const buf = Buffer.from(mm[2], 'base64');
      res.writeHead(200, { 'Content-Type': mm[1], 'Cache-Control': 'private, max-age=86400', 'Content-Length': buf.length }); return res.end(buf);
    }
    if ((m = /^\/api\/photo\/(\d+)$/.exec(p))) {
      if (!session(req, 'user')) return U.send(res, 401, { message: 'سجّل دخول' });
      const row = db.prepare('SELECT mime, data FROM photos WHERE id = ?').get(Number(m[1]));
      if (!row) { res.writeHead(404); return res.end(); }
      const buf = Buffer.from(row.data);
      res.writeHead(200, { 'Content-Type': row.mime, 'Cache-Control': 'private, max-age=604800', 'Content-Length': buf.length }); return res.end(buf);
    }
    if (p === '/api/events') { if (!session(req, 'user')) return U.send(res, 401, { message: 'سجّل دخول' }); return U.sseOpen(req, res); }

    /* API */
    if (p.startsWith('/api/') || p.startsWith('/s/api/') || p.startsWith('/c/api/')) {
      const r = routes.find(x => x.method === req.method && x.rx.test(p));
      if (!r) return U.send(res, 404, { message: 'مش موجود' });
      const ctx = { req, res, query: Object.fromEntries(url.searchParams), params: {} };
      const mm = r.rx.exec(p); r.keys.forEach((k, i) => { ctx.params[k] = mm[i + 1]; });
      if (p.startsWith('/api/')) { const s = session(req, 'user'); if (!s) return U.send(res, 401, { message: 'سجّل دخول' }); ctx.user = s.who; ctx.sid = s.sid; }
      else if (p.startsWith('/s/api/')) { const s = session(req, 'emp'); if (!s) return U.send(res, 401, { message: 'سجّل دخول' }); ctx.emp = s.who; ctx.sid = s.sid; }
      if (req.method === 'POST') ctx.body = await U.readBody(req);
      const out = await r.fn(ctx);
      if (out === null) return;   // handler wrote the response
      return U.send(res, 200, out);
    }

    /* pages */
    if (p === '/' || p === '/index.html') return serveFile(req, res, path.join(PUB, 'admin.html'));
    if (p === '/app' || p === '/app/') return serveFile(req, res, path.join(PUB, 'app.html'));
    if (/^\/c\/[A-Za-z0-9]{6,16}\/?$/.test(p)) return serveFile(req, res, path.join(PUB, 'portal.html'));
    if (p === '/sw.js' || p === '/app-sw.js') return serveFile(req, res, path.join(PUB, p.slice(1)), { sw: true, noCache: true });
    const file = path.normalize(path.join(PUB, p));
    if (file.startsWith(PUB + path.sep) && !p.endsWith('.html') && serveFile(req, res, file)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('مش موجود');
  } catch (e) {
    if (e instanceof U.Fail) return U.send(res, e.code, { message: e.message });
    console.error('[err]', req.method, p, e);
    if (!res.headersSent) U.send(res, 500, { message: 'حصلت مشكلة في السيرفر — جرّب تاني' });
  }
});

/* housekeeping: old locations + stale sessions */
setInterval(() => {
  try {
    db.prepare('DELETE FROM sessions WHERE last_seen < ?').run(Date.now() - SESSION_DAYS * 864e5);
    db.prepare("DELETE FROM locations WHERE at < ? AND kind = 'ping'").run(new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10));
  } catch (e) { console.error('[cleanup]', e.message); }
}, 6 * 3600 * 1000).unref();

server.listen(PORT, () => {
  console.log('');
  console.log('  طاقم ' + VERSION + ' شغّال');
  console.log('  لوحة المدير:   http://localhost:' + PORT + '/');
  console.log('  تطبيق الموظف:  http://localhost:' + PORT + '/app');
  console.log('');
});
module.exports = server;
