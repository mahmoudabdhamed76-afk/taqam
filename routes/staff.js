'use strict';
/* طاقم · تطبيق الموظف — كل /s/api/* (جلسة موظف، ومينفعش توصل لأي حاجة تانية) */
const { db } = require('../lib/db');
const U = require('../lib/util');
const C = require('../lib/core');
const webpush = require('../lib/webpush');

module.exports = function (R) {
  const { str, num, fail, nowTs, today } = U;
  const loc = b => {
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng, acc: Number.isFinite(+b.acc) ? Math.round(+b.acc) : null, battery: Number.isFinite(+b.battery) ? Math.round(+b.battery) : null };
  };
  function track(e, p, kind) {
    if (!p) return;
    db.prepare('INSERT INTO locations (emp_id, at, lat, lng, acc, battery, kind) VALUES (?,?,?,?,?,?,?)').run(e.id, nowTs(), p.lat, p.lng, p.acc, p.battery, kind);
    db.prepare('UPDATE employees SET last_lat=?, last_lng=?, last_acc=?, last_at=?, last_battery=COALESCE(?, last_battery) WHERE id=?').run(p.lat, p.lng, p.acc, nowTs(), p.battery, e.id);
    U.emit('loc', { emp: e.id, lat: p.lat, lng: p.lng, at: nowTs(), kind });
  }
  const clientsFor = () => db.prepare("SELECT id, name, grp, address, phone, lat, lng FROM clients WHERE status = 'active' ORDER BY name").all();

  function home(e) {
    const att = C.openAtt(e.id);
    const todayAtt = db.prepare('SELECT * FROM attendance WHERE emp_id = ? AND date = ? ORDER BY id').all(e.id, today());
    const s = U.cfgAll();
    return {
      me: C.empPublic(e), now: nowTs(), today: today(), shift: C.shiftOf(e), rest: C.isRest(e, today()),
      settings: { company: s.company, logo: s.logo, currency: s.currency, ping_min: +s.ping_min || 15, require_location: s.require_location === '1', geofence: s.geofence, chat_on: s.chat_on === '1', purposes: U.lines('purposes'), arrive_radius: +s.arrive_radius || 200 },
      open: att || null, today_att: todayAtt,
      visit: db.prepare('SELECT * FROM visits WHERE emp_id = ? AND end_at IS NULL ORDER BY id DESC LIMIT 1').get(e.id) || null,
      tasks: db.prepare("SELECT t.*, c.lat c_lat, c.lng c_lng, c.address c_address, c.phone c_phone FROM tasks t LEFT JOIN clients c ON c.id = t.client_id WHERE t.emp_id = ? AND t.status IN ('new','on_way','arrived') ORDER BY CASE t.status WHEN 'on_way' THEN 0 WHEN 'arrived' THEN 1 ELSE 2 END, t.id").all(e.id),
      unread: db.prepare("SELECT COUNT(*) n FROM messages WHERE emp_id = ? AND side = 'mgr' AND read_at IS NULL").get(e.id).n,
      rewards: db.prepare('SELECT * FROM rewards WHERE emp_id = ? AND seen = 0 ORDER BY id').all(e.id),
      push: webpush.countFor('e:' + e.id) > 0
    };
  }
  R('GET', '/s/api/home', c => home(c.emp));

  R('POST', '/s/api/punch', c => {
    const e = c.emp, p = loc(c.body), open = C.openAtt(e.id), now = nowTs();
    if (U.cfg('require_location') === '1' && !p) fail('افتح الموقع (GPS) الأول عشان تسجّل');
    const site = p ? C.nearestSite(p.lat, p.lng) : null;
    const outside = site && site.dist > site.radius;
    if (!open) {
      if (outside && U.cfg('geofence') === 'block' && !c.body.at_client) fail('إنت بعيد عن ' + site.name + ' بـ ' + site.dist + ' متر — قرّب وجرّب تاني');
      if (db.prepare('SELECT 1 FROM attendance WHERE emp_id = ? AND date = ? AND out_at IS NOT NULL AND out_at > ?').get(e.id, today(), now.slice(0, 11) + '00:00:00') && !c.body.again) {
        /* a second check-in the same day is allowed (split shift) — the phone asks first */
      }
      const late = C.lateOf(e, now);
      const id = Number(db.prepare('INSERT INTO attendance (emp_id, date, in_at, in_lat, in_lng, in_dist, in_site, late_min, source) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(e.id, today(), now, p && p.lat, p && p.lng, site ? site.dist : null, site ? site.name : null, late, 'app').lastInsertRowid);
      track(e, p, 'in');
      C.notifyManagers({ title: e.name + ' سجّل حضور', body: (late ? 'متأخر ' + late + ' دقيقة' : 'في الميعاد') + (outside ? ' — بعيد عن ' + site.name + ' (' + site.dist + 'م)' : ''), tag: 'att-' + e.id }, { type: 'att', data: { emp: e.id, kind: 'in' } });
      return { ok: true, kind: 'in', id, late, outside: !!outside, site, home: home(e) };
    }
    const ot = C.otOf(e, now);
    db.prepare('UPDATE attendance SET out_at=?, out_lat=?, out_lng=?, out_dist=?, ot_min=? WHERE id=?').run(now, p && p.lat, p && p.lng, site ? site.dist : null, ot, open.id);
    db.prepare('UPDATE visits SET end_at = ? WHERE emp_id = ? AND end_at IS NULL').run(now, e.id);
    track(e, p, 'out');
    C.notifyManagers({ title: e.name + ' سجّل انصراف', body: 'من ' + open.in_at.slice(11, 16) + ' لـ ' + now.slice(11, 16), tag: 'att-' + e.id }, { type: 'att', data: { emp: e.id, kind: 'out' } });
    return { ok: true, kind: 'out', ot, home: home(e) };
  });

  R('POST', '/s/api/ping', c => {
    const e = c.emp, p = loc(c.body); if (!p) fail('مفيش موقع');
    if (!C.openAtt(e.id) || !e.track) return { ok: true, skipped: true };
    const last = db.prepare('SELECT at FROM locations WHERE emp_id = ? ORDER BY id DESC LIMIT 1').get(e.id);
    const asMs = ts => Date.parse(String(ts).replace(' ', 'T') + 'Z');
    if (last && asMs(nowTs()) - asMs(last.at) < 20000) return { ok: true, skipped: true };   // too soon
    track(e, p, 'ping');
    return { ok: true };
  });

  R('GET', '/s/api/clients', () => ({ clients: clientsFor() }));

  /* زيارة عميل */
  R('POST', '/s/api/visit', c => {
    const e = c.emp, p = loc(c.body); if (!C.openAtt(e.id)) fail('سجّل حضور الأول');
    if (db.prepare('SELECT 1 FROM visits WHERE emp_id = ? AND end_at IS NULL').get(e.id)) fail('إنت في زيارة دلوقتي — خلّصها الأول');
    const cl = db.prepare('SELECT * FROM clients WHERE id = ?').get(str(c.body.client_id)); if (!cl) fail('اختار العميل');
    const dist = p ? U.haversine(p.lat, p.lng, cl.lat, cl.lng) : null;
    if (p && cl.lat == null) db.prepare('UPDATE clients SET lat = ?, lng = ? WHERE id = ?').run(p.lat, p.lng, cl.id);   // learn the place from the first visit
    const id = Number(db.prepare('INSERT INTO visits (emp_id, client_id, client_name, date, start_at, lat, lng, dist, purpose) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(e.id, cl.id, cl.name, today(), nowTs(), p && p.lat, p && p.lng, dist, str(c.body.purpose, 60)).lastInsertRowid);
    track(e, p, 'visit');
    U.emit('visit', { emp: e.id, client: cl.id });
    return { ok: true, id, dist, home: home(e) };
  });
  R('POST', '/s/api/visit/end', c => {
    const e = c.emp, v = db.prepare('SELECT * FROM visits WHERE emp_id = ? AND end_at IS NULL ORDER BY id DESC LIMIT 1').get(e.id); if (!v) fail('مفيش زيارة مفتوحة');
    db.prepare('UPDATE visits SET end_at = ?, note = ?, handed_to = ? WHERE id = ?').run(nowTs(), str(c.body.note, 1000), str(c.body.handed_to, 80), v.id);
    if (str(c.body.note)) db.prepare('INSERT INTO followups (client_id, at, kind, note, by_name) VALUES (?,?,?,?,?)').run(v.client_id, nowTs(), 'visit', (v.purpose ? v.purpose + ': ' : '') + str(c.body.note, 1000) + (str(c.body.handed_to) ? ' — استلم: ' + str(c.body.handed_to, 80) : ''), e.name);
    if (str(c.body.fault_title) && str(c.body.fault_solution)) addFault(e, { title: c.body.fault_title, solution: c.body.fault_solution, code: c.body.fault_code, client_id: v.client_id, client_name: v.client_name });
    track(e, loc(c.body), 'visit_end');
    U.emit('visit', { emp: e.id });
    return { ok: true, home: home(e) };
  });

  /* المهام */
  function myTask(c) { const t = db.prepare('SELECT t.*, cl.lat c_lat, cl.lng c_lng FROM tasks t LEFT JOIN clients cl ON cl.id = t.client_id WHERE t.id = ? AND t.emp_id = ?').get(num(c.body.id), c.emp.id); if (!t) fail('المهمة مش موجودة', 404); return t; }
  R('POST', '/s/api/task/start', c => {
    const e = c.emp, t = myTask(c), p = loc(c.body);
    if (!C.openAtt(e.id)) fail('سجّل حضور الأول');
    if (t.status !== 'new') return { ok: true, home: home(e) };
    const d0 = p ? U.haversine(p.lat, p.lng, t.c_lat, t.c_lng) : null;
    db.prepare("UPDATE tasks SET status = 'on_way', started_at = ?, d0 = ?, dist = ?, last_lat = ?, last_lng = ?, last_at = ? WHERE id = ?").run(nowTs(), d0, d0, p && p.lat, p && p.lng, nowTs(), t.id);
    track(e, p, 'task');
    C.notifyManagers({ title: e.name + ' في الطريق', body: t.title + (t.client_name ? ' — ' + t.client_name : '') + (d0 != null ? ' (' + fmtDist(d0) + ')' : ''), tag: 'task-' + t.id }, { type: 'task', data: { id: t.id } });
    return { ok: true, home: home(e) };
  });
  R('POST', '/s/api/task/ping', c => {
    const e = c.emp, t = myTask(c), p = loc(c.body); if (!p || t.status !== 'on_way') return { ok: true };
    const d = U.haversine(p.lat, p.lng, t.c_lat, t.c_lng);
    db.prepare('UPDATE tasks SET dist = ?, last_lat = ?, last_lng = ?, last_at = ? WHERE id = ?').run(d, p.lat, p.lng, nowTs(), t.id);
    track(e, p, 'task');
    if (d != null && d <= U.cfgNum('arrive_radius')) return arrive(e, t, p);
    return { ok: true, dist: d };
  });
  R('POST', '/s/api/task/arrive', c => arrive(c.emp, myTask(c), loc(c.body)));
  function arrive(e, t, p) {
    if (t.status === 'arrived' || t.status === 'done') return { ok: true, home: home(e) };
    db.prepare("UPDATE tasks SET status = 'arrived', arrived_at = ?, dist = ? WHERE id = ?").run(nowTs(), p ? U.haversine(p.lat, p.lng, t.c_lat, t.c_lng) : t.dist, t.id);
    if (p && t.client_id && t.c_lat == null) db.prepare('UPDATE clients SET lat = ?, lng = ? WHERE id = ?').run(p.lat, p.lng, t.client_id);
    track(e, p, 'arrive');
    C.notifyManagers({ title: e.name + ' وصل', body: t.title + (t.client_name ? ' — ' + t.client_name : ''), tag: 'task-' + t.id }, { type: 'task', data: { id: t.id, arrived: true } });
    return { ok: true, arrived: true, home: home(e) };
  }
  R('POST', '/s/api/task/done', c => {
    const e = c.emp, t = myTask(c);
    if (t.status === 'done') return { ok: true, home: home(e) };
    const photo = c.body.photo ? U.savePhoto(c.body.photo) : null;
    db.prepare("UPDATE tasks SET status = 'done', done_at = ?, done_note = ?, photo_id = COALESCE(?, photo_id) WHERE id = ?").run(nowTs(), str(c.body.note, 1000), photo, t.id);
    if (t.request_id) db.prepare("UPDATE requests SET status = 'sent', done_at = ?, reply = COALESCE(reply, ?) WHERE id = ?").run(nowTs(), str(c.body.note, 300) || null, t.request_id);
    if (t.client_id) db.prepare('INSERT INTO followups (client_id, at, kind, note, by_name) VALUES (?,?,?,?,?)').run(t.client_id, nowTs(), 'visit', 'تمت المهمة: ' + t.title + (str(c.body.note) ? ' — ' + str(c.body.note, 800) : '') + (str(c.body.handed_to) ? ' — استلم: ' + str(c.body.handed_to, 80) : ''), e.name);
    if (str(c.body.fault_title) && str(c.body.fault_solution)) addFault(e, { title: c.body.fault_title, solution: c.body.fault_solution, code: c.body.fault_code, client_id: t.client_id, client_name: t.client_name });
    track(e, loc(c.body), 'task_done');
    C.notifyManagers({ title: e.name + ' خلّص مهمة', body: t.title + (t.client_name ? ' — ' + t.client_name : ''), tag: 'task-' + t.id }, { type: 'task', data: { id: t.id, done: true } });
    return { ok: true, home: home(e) };
  });

  /* بنك الأعطال */
  function addFault(e, f) {
    const id = Number(db.prepare('INSERT INTO faults (code, title, solution, client_id, client_name, emp_id, emp_name, at) VALUES (?,?,?,?,?,?,?,?)')
      .run(str(f.code, 30), str(f.title, 150), str(f.solution, 2000), f.client_id || null, f.client_name || null, e.id, e.name, nowTs()).lastInsertRowid);
    U.emit('fault', { id });
    return id;
  }
  R('GET', '/s/api/faults', c => {
    const s = str(c.query.q, 80), like = '%' + s.replace(/[%_]/g, '') + '%';
    const rows = s ? db.prepare('SELECT * FROM faults WHERE code LIKE ? OR title LIKE ? OR solution LIKE ? ORDER BY votes DESC, id DESC LIMIT 60').all(like, like, like)
      : db.prepare('SELECT * FROM faults ORDER BY votes DESC, id DESC LIMIT 60').all();
    const mine = new Set(db.prepare('SELECT fault_id FROM fault_votes WHERE voter = ?').all('e:' + c.emp.id).map(r => r.fault_id));
    return { faults: rows.map(r => Object.assign(r, { voted: mine.has(r.id) })) };
  });
  R('POST', '/s/api/fault', c => { if (!str(c.body.title) || !str(c.body.solution)) fail('اكتب العطل والحل'); return { ok: true, id: addFault(c.emp, c.body) }; });
  R('POST', '/s/api/fault/vote', c => {
    const id = num(c.body.id), v = 'e:' + c.emp.id;
    if (db.prepare('SELECT 1 FROM fault_votes WHERE fault_id = ? AND voter = ?').get(id, v)) { db.prepare('DELETE FROM fault_votes WHERE fault_id = ? AND voter = ?').run(id, v); db.prepare('UPDATE faults SET votes = MAX(0, votes - 1) WHERE id = ?').run(id); return { ok: true, voted: false }; }
    db.prepare('INSERT INTO fault_votes (fault_id, voter) VALUES (?, ?)').run(id, v); db.prepare('UPDATE faults SET votes = votes + 1 WHERE id = ?').run(id);
    return { ok: true, voted: true };
  });

  /* شهري */
  R('GET', '/s/api/month', c => {
    const m = U.isMonth(c.query.month) ? c.query.month : U.thisMonth();
    const row = C.payroll(m).find(r => r.emp.id === c.emp.id) || null;
    return { month: m, days: U.daysIn(m), today: today(), rest: C.restOf(c.emp), att: db.prepare('SELECT date, in_at, out_at, late_min, ot_min FROM attendance WHERE emp_id = ? AND substr(date,1,7) = ? ORDER BY date, in_at').all(c.emp.id, m), pay: row };
  });

  /* المحادثة */
  R('GET', '/s/api/chat', c => {
    if (U.cfg('chat_on') !== '1') return { on: false, messages: [] };
    db.prepare("UPDATE messages SET read_at = ? WHERE emp_id = ? AND side = 'mgr' AND read_at IS NULL").run(nowTs(), c.emp.id);
    return { on: true, messages: db.prepare('SELECT * FROM messages WHERE emp_id = ? ORDER BY id DESC LIMIT 150').all(c.emp.id).reverse() };
  });
  R('POST', '/s/api/chat', c => {
    if (U.cfg('chat_on') !== '1') fail('المحادثة مقفولة من الإدارة');
    const body = str(c.body.body, 1000); if (!body) fail('اكتب الرسالة');
    db.prepare('INSERT INTO messages (emp_id, side, body, at, by_name) VALUES (?,?,?,?,?)').run(c.emp.id, 'emp', body, nowTs(), c.emp.name);
    C.notifyManagers({ title: 'رسالة من ' + c.emp.name, body: body.slice(0, 120), tag: 'chat-' + c.emp.id }, { type: 'chat', data: { emp: c.emp.id } });
    return { ok: true };
  });

  R('POST', '/s/api/reward/seen', c => { db.prepare('UPDATE rewards SET seen = 1 WHERE emp_id = ?').run(c.emp.id); return { ok: true }; });
  R('POST', '/s/api/password', c => {
    const e = db.prepare('SELECT * FROM employees WHERE id = ?').get(c.emp.id);
    if (!U.verify(c.body.old, e.pass)) fail('الباسورد الحالي غلط');
    if (String(c.body.pw || '').length < 4) fail('الباسورد الجديد 4 حروف على الأقل');
    db.prepare('UPDATE employees SET pass = ? WHERE id = ?').run(U.hash(c.body.pw), e.id);
    return { ok: true };
  });
  R('POST', '/s/api/photo', c => {
    if (!c.body.photo || !/^data:image\/(jpeg|png|webp);base64,/.test(c.body.photo) || c.body.photo.length > 400000) fail('الصورة مش مناسبة');
    db.prepare('UPDATE employees SET photo = ? WHERE id = ?').run(c.body.photo, c.emp.id);
    return { ok: true };
  });
  R('GET', '/s/api/push/key', () => ({ key: webpush.publicKey() }));
  R('POST', '/s/api/push/subscribe', c => { webpush.subscribe({ id: 'e:' + c.emp.id }, c.body.sub, c.req.headers['user-agent']); return { ok: true }; });

  function fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(1) + ' كم' : m + ' م'; }
};
