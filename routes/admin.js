'use strict';
/* طاقم · واجهة المدير — كل /api/* (لازم جلسة مدير) */
const fs = require('node:fs');
const path = require('node:path');
const { db, DATA_DIR } = require('../lib/db');
const U = require('../lib/util');
const C = require('../lib/core');
const webpush = require('../lib/webpush');
const PERMS = require('../lib/perms');

module.exports = function (R) {
  const { str, num, fail, nowTs, today } = U;
  const who = c => c.user.name;

  /* ── الحساب ── */
  R('GET', '/api/me', c => ({ user: { id: c.user.id, name: c.user.name, username: c.user.username, role: c.user.role, perms: PERMS.list(c.user) }, all_perms: PERMS.PERMS, mode: process.env.TAQAM_MODE === 'pacs' ? 'pacs' : 'full', cloud_pacs: require('../lib/pacs').CLOUD }));
  R('POST', '/api/me/password', c => {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(c.user.id);
    if (!U.verify(c.body.old, u.pass)) fail('الباسورد الحالي غلط');
    if (String(c.body.pw || '').length < 6) fail('الباسورد الجديد 6 حروف على الأقل');
    db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(U.hash(c.body.pw), u.id);
    db.prepare("DELETE FROM sessions WHERE kind = 'user' AND ref_id = ? AND id <> ?").run(u.id, c.sid);
    return { ok: true };
  });
  R('GET', '/api/users', c => ({ users: db.prepare('SELECT id, name, username, role, perms, last_login_at FROM users ORDER BY created_at').all().map(u => ({ ...u, perms: PERMS.list(u) })), all_perms: PERMS.PERMS }));
  R('POST', '/api/users', c => {
    if (c.user.role !== 'admin') fail('ده للمدير العام بس', 403);
    const name = str(c.body.name, 60), username = str(c.body.username, 40).toLowerCase();
    if (!name || !/^[a-z0-9._-]{3,40}$/.test(username)) fail('اكتب الاسم واسم دخول إنجليزي (3 حروف على الأقل)');
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username) || db.prepare('SELECT 1 FROM employees WHERE username = ?').get(username)) fail('اسم الدخول ده مستخدم');
    const pw = U.genPass() + U.genPass().slice(0, 2);
    const role = c.body.role === 'admin' ? 'admin' : 'manager', perms = role === 'admin' ? null : PERMS.clean(c.body.perms);
    if (role !== 'admin' && !perms) fail('اختار صلاحية واحدة على الأقل');
    db.prepare('INSERT INTO users (id, name, username, pass, role, created_at, perms) VALUES (?, ?, ?, ?, ?, ?, ?)').run(U.uid(), name, username, U.hash(pw), role, nowTs(), perms);
    U.log(who(c), 'user.add', username);
    return { ok: true, username, password: pw };
  });
  R('POST', '/api/users/perms', c => {
    if (c.user.role !== 'admin') fail('ده للمدير العام بس', 403);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(str(c.body.id)); if (!u) fail('المستخدم مش موجود');
    if (u.id === c.user.id) fail('مينفعش تغيّر صلاحياتك انت');
    const role = c.body.role === 'admin' ? 'admin' : 'manager', perms = role === 'admin' ? null : PERMS.clean(c.body.perms);
    if (role !== 'admin' && !perms) fail('اختار صلاحية واحدة على الأقل');
    db.prepare('UPDATE users SET role = ?, perms = ? WHERE id = ?').run(role, perms, u.id);
    U.log(who(c), 'user.perms', u.username + ' ' + (perms || 'admin'));
    return { ok: true };
  });
  R('POST', '/api/users/reset', c => {
    if (c.user.role !== 'admin') fail('ده للمدير العام بس', 403);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(str(c.body.id)); if (!u) fail('المستخدم مش موجود');
    const pw = U.genPass() + U.genPass().slice(0, 2);
    db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(U.hash(pw), u.id);
    db.prepare("DELETE FROM sessions WHERE kind = 'user' AND ref_id = ?").run(u.id);
    return { ok: true, username: u.username, password: pw };
  });
  R('POST', '/api/users/del', c => {
    if (c.user.role !== 'admin') fail('ده للمدير العام بس', 403);
    if (c.body.id === c.user.id) fail('مينفعش تمسح نفسك');
    db.prepare('DELETE FROM users WHERE id = ?').run(str(c.body.id));
    db.prepare("DELETE FROM sessions WHERE kind = 'user' AND ref_id = ?").run(str(c.body.id));
    return { ok: true };
  });

  /* ── التحميل الأول ── */
  R('GET', '/api/boot', c => ({
    settings: U.cfgAll(), today: today(), now: nowTs(),
    sites: db.prepare('SELECT * FROM sites ORDER BY name').all(),
    employees: db.prepare('SELECT * FROM employees ORDER BY active DESC, name').all().map(C.empPublic),
    counts: counts()
  }));
  function counts() {
    return {
      requests: db.prepare("SELECT COUNT(*) n FROM requests WHERE status = 'new'").get().n,
      follow: db.prepare("SELECT COUNT(*) n FROM clients WHERE status = 'active' AND next_follow IS NOT NULL AND next_follow <> '' AND next_follow <= ?").get(today()).n,
      chat: db.prepare("SELECT COUNT(*) n FROM messages WHERE side = 'emp' AND read_at IS NULL").get().n,
      tasks: db.prepare("SELECT COUNT(*) n FROM tasks WHERE status IN ('new','accepted','on_way','arrived')").get().n,
      pacs: db.prepare('SELECT COUNT(*) n FROM pacs_studies WHERE seen = 0').get().n
    };
  }
  R('GET', '/api/counts', () => counts());

  /* ── لوحة اليوم ── */
  R('GET', '/api/today', c => {
    const ds = U.isDate(c.query.date) ? c.query.date : today();
    return {
      date: ds, now: nowTs(), board: C.dayBoard(ds), counts: counts(),
      live_tasks: db.prepare("SELECT t.*, e.name emp_name, e.hue emp_hue, e.photo IS NOT NULL has_photo, length(e.photo) pv FROM tasks t LEFT JOIN employees e ON e.id = t.emp_id WHERE t.status IN ('new','accepted','on_way','arrived') OR (t.status = 'done' AND substr(t.done_at,1,10) = ?) ORDER BY CASE t.status WHEN 'on_way' THEN 0 WHEN 'arrived' THEN 1 WHEN 'accepted' THEN 2 WHEN 'new' THEN 3 ELSE 4 END, t.id DESC LIMIT 30").all(ds).map(t => Object.assign(t, { emp: { id: t.emp_id, name: t.emp_name || '؟', hue: t.emp_hue, photo: t.has_photo ? '/api/emp-photo/' + t.emp_id + '?v=' + t.pv : '' } })),
      requests: db.prepare("SELECT r.*, cl.name client_name FROM requests r LEFT JOIN clients cl ON cl.id = r.client_id WHERE r.status IN ('new','ok') ORDER BY r.id DESC LIMIT 8").all().map(reqOut),
      follow: db.prepare("SELECT id, name, grp, phone, next_follow FROM clients WHERE status = 'active' AND next_follow IS NOT NULL AND next_follow <> '' AND next_follow <= ? ORDER BY next_follow LIMIT 8").all(today())
    };
  });
  R('GET', '/api/live', () => ({
    now: nowTs(),
    emps: db.prepare('SELECT * FROM employees WHERE active = 1 AND last_lat IS NOT NULL').all().map(C.empPublic),
    clients: db.prepare("SELECT id, name, lat, lng FROM clients WHERE lat IS NOT NULL AND status = 'active'").all(),
    sites: db.prepare('SELECT * FROM sites').all(),
    tasks: db.prepare("SELECT * FROM tasks WHERE status IN ('on_way','arrived')").all()
  }));

  /* ── الموظفين ── */
  R('POST', '/api/emp', c => {
    const b = c.body, id = str(b.id, 20);
    const name = str(b.name, 60); if (!name) fail('اكتب اسم الموظف');
    const f = {
      name, job: str(b.job, 60), phone: str(b.phone, 20).replace(/[^\d+]/g, ''), track: b.track === false ? 0 : 1, active: b.active === false ? 0 : 1,
      shift_start: /^\d{2}:\d{2}$/.test(b.shift_start || '') ? b.shift_start : null, shift_end: /^\d{2}:\d{2}$/.test(b.shift_end || '') ? b.shift_end : null,
      rest_days: b.rest_days == null ? null : str(b.rest_days, 20).replace(/[^0-6,]/g, ''), site_id: str(b.site_id, 20) || null, salary: Math.max(0, num(b.salary))
    };
    let photo; if (b.photo === '') photo = null; else if (b.photo && /^data:image\/(jpeg|png|webp);base64,/.test(b.photo) && b.photo.length < 400000) photo = b.photo;
    if (id) {
      const e = db.prepare('SELECT * FROM employees WHERE id = ?').get(id); if (!e) fail('الموظف مش موجود', 404);
      db.prepare('UPDATE employees SET name=?, job=?, phone=?, track=?, active=?, shift_start=?, shift_end=?, rest_days=?, site_id=?, salary=? WHERE id=?')
        .run(f.name, f.job, f.phone, f.track, f.active, f.shift_start, f.shift_end, f.rest_days, f.site_id, f.salary, id);
      if (photo !== undefined) db.prepare('UPDATE employees SET photo = ? WHERE id = ?').run(photo, id);
      if (!f.active) db.prepare("DELETE FROM sessions WHERE kind = 'emp' AND ref_id = ?").run(id);
      U.log(who(c), 'emp.edit', name); U.emit('emp', { id });
      return { ok: true, emp: C.empPublic(db.prepare('SELECT * FROM employees WHERE id = ?').get(id)) };
    }
    let username = str(b.username, 40).toLowerCase();
    if (!username) { const base = 'emp'; let i = db.prepare('SELECT COUNT(*) n FROM employees').get().n + 1; do { username = base + (i++); } while (db.prepare('SELECT 1 FROM employees WHERE username = ?').get(username)); }
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) fail('اسم الدخول حروف إنجليزي وأرقام بس');
    if (db.prepare('SELECT 1 FROM employees WHERE username = ?').get(username) || db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) fail('اسم الدخول ده مستخدم');
    const pw = U.genPass(), nid = U.uid(8), n = db.prepare('SELECT COUNT(*) n FROM employees').get().n;
    db.prepare('INSERT INTO employees (id, name, job, phone, photo, username, pass, active, track, shift_start, shift_end, rest_days, site_id, salary, hue, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(nid, f.name, f.job, f.phone, photo || null, username, U.hash(pw), 1, f.track, f.shift_start, f.shift_end, f.rest_days, f.site_id, f.salary, C.HUES[n % C.HUES.length], nowTs());
    U.log(who(c), 'emp.add', name); U.emit('emp', { id: nid });
    return { ok: true, emp: C.empPublic(db.prepare('SELECT * FROM employees WHERE id = ?').get(nid)), username, password: pw };
  });
  R('POST', '/api/emp/reset', c => {
    const e = db.prepare('SELECT * FROM employees WHERE id = ?').get(str(c.body.id)); if (!e) fail('الموظف مش موجود', 404);
    const pw = U.genPass();
    db.prepare('UPDATE employees SET pass = ? WHERE id = ?').run(U.hash(pw), e.id);
    db.prepare("DELETE FROM sessions WHERE kind = 'emp' AND ref_id = ?").run(e.id);
    U.log(who(c), 'emp.reset', e.name);
    return { ok: true, username: e.username, password: pw };
  });
  R('POST', '/api/emp/del', c => {
    const e = db.prepare('SELECT * FROM employees WHERE id = ?').get(str(c.body.id)); if (!e) fail('الموظف مش موجود', 404);
    const used = db.prepare('SELECT COUNT(*) n FROM attendance WHERE emp_id = ?').get(e.id).n;
    if (used) { db.prepare('UPDATE employees SET active = 0 WHERE id = ?').run(e.id); db.prepare("DELETE FROM sessions WHERE kind = 'emp' AND ref_id = ?").run(e.id); return { ok: true, archived: true }; }
    db.prepare('DELETE FROM employees WHERE id = ?').run(e.id);
    U.log(who(c), 'emp.del', e.name);
    return { ok: true };
  });
  R('GET', '/api/emp/day', c => {
    const id = str(c.query.id), ds = U.isDate(c.query.date) ? c.query.date : today();
    const e = db.prepare('SELECT * FROM employees WHERE id = ?').get(id); if (!e) fail('الموظف مش موجود', 404);
    return {
      emp: C.empPublic(e), date: ds,
      att: db.prepare('SELECT * FROM attendance WHERE emp_id = ? AND date = ? ORDER BY id').all(id, ds),
      path: db.prepare('SELECT at, lat, lng, acc, kind, battery FROM locations WHERE emp_id = ? AND substr(at,1,10) = ? ORDER BY at').all(id, ds),
      visits: db.prepare('SELECT * FROM visits WHERE emp_id = ? AND date = ? ORDER BY id').all(id, ds),
      tasks: db.prepare("SELECT * FROM tasks WHERE emp_id = ? AND (substr(created_at,1,10) = ? OR substr(done_at,1,10) = ?) ORDER BY id").all(id, ds, ds)
    };
  });

  /* ── الحضور ── */
  R('GET', '/api/attendance', c => {
    const m = U.isMonth(c.query.month) ? c.query.month : U.thisMonth();
    return { month: m, days: U.daysIn(m), today: today(), rows: db.prepare("SELECT * FROM attendance WHERE substr(date,1,7) = ? ORDER BY date, in_at").all(m),
      emps: db.prepare('SELECT * FROM employees ORDER BY active DESC, name').all().map(e => Object.assign(C.empPublic(e), { rest: C.restOf(e) })) };
  });
  R('POST', '/api/attendance', c => {
    const b = c.body, e = db.prepare('SELECT * FROM employees WHERE id = ?').get(str(b.emp_id)); if (!e) fail('اختار الموظف');
    if (!U.isDate(b.date) || !/^\d{2}:\d{2}$/.test(b.in || '')) fail('اكتب اليوم ووقت الحضور');
    const inAt = b.date + ' ' + b.in + ':00', outAt = /^\d{2}:\d{2}$/.test(b.out || '') ? b.date + ' ' + b.out + ':00' : null;
    if (outAt && outAt <= inAt) fail('الانصراف لازم بعد الحضور');
    const late = C.lateOf(e, inAt), ot = outAt ? C.otOf(e, outAt) : 0;
    if (b.id) db.prepare('UPDATE attendance SET in_at=?, out_at=?, late_min=?, ot_min=?, note=?, source=? WHERE id=?').run(inAt, outAt, late, ot, str(b.note, 200), 'manual', num(b.id));
    else db.prepare('INSERT INTO attendance (emp_id, date, in_at, out_at, late_min, ot_min, source, note) VALUES (?,?,?,?,?,?,?,?)').run(e.id, b.date, inAt, outAt, late, ot, 'manual', str(b.note, 200));
    U.log(who(c), 'att.manual', e.name + ' ' + b.date); U.emit('att', { emp: e.id });
    return { ok: true };
  });
  R('POST', '/api/attendance/del', c => { db.prepare('DELETE FROM attendance WHERE id = ?').run(num(c.body.id)); U.log(who(c), 'att.del', String(c.body.id)); return { ok: true }; });

  /* ── المهام ── */
  R('GET', '/api/tasks', c => {
    const st = str(c.query.status, 10);
    const rows = st === 'open' ? db.prepare("SELECT * FROM tasks WHERE status IN ('new','accepted','on_way','arrived') ORDER BY id DESC").all()
      : db.prepare('SELECT * FROM tasks ORDER BY id DESC LIMIT 200').all();
    return { tasks: rows };
  });
  R('POST', '/api/tasks', c => {
    const b = c.body, e = db.prepare('SELECT * FROM employees WHERE id = ? AND active = 1').get(str(b.emp_id)); if (!e) fail('اختار الموظف');
    const cl = b.client_id ? db.prepare('SELECT * FROM clients WHERE id = ?').get(str(b.client_id)) : null;
    const title = str(b.title, 120) || (cl ? 'زيارة ' + cl.name : ''); if (!title) fail('اكتب المهمة');
    const id = Number(db.prepare('INSERT INTO tasks (emp_id, client_id, client_name, title, note, status, request_id, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(e.id, cl ? cl.id : null, cl ? cl.name : str(b.place, 100), title, str(b.note, 500), 'new', b.request_id ? num(b.request_id) : null, nowTs(), who(c)).lastInsertRowid);
    C.notifyEmp(e.id, { title: 'مهمة جديدة', body: title + (cl ? ' — ' + cl.name : ''), tag: 'task-' + id, urgent: true });
    U.emit('task', { id }); U.log(who(c), 'task.add', e.name + ': ' + title);
    return { ok: true, id };
  });
  R('POST', '/api/tasks/cancel', c => { db.prepare("UPDATE tasks SET status = 'cancelled', done_at = ? WHERE id = ? AND status <> 'done'").run(nowTs(), num(c.body.id)); U.emit('task', {}); return { ok: true }; });

  /* ── المرتبات ── */
  R('GET', '/api/payroll', c => ({ month: U.isMonth(c.query.month) ? c.query.month : U.thisMonth(), rows: C.payroll(c.query.month), settings: { pay_days: U.cfg('pay_days'), late_mult: U.cfg('late_mult'), absent_mult: U.cfg('absent_mult'), ot_mult: U.cfg('ot_mult') } }));
  R('POST', '/api/payroll/salary', c => { db.prepare('UPDATE employees SET salary = ? WHERE id = ?').run(Math.max(0, num(c.body.salary)), str(c.body.emp_id)); return { ok: true }; });
  R('POST', '/api/payroll/adj', c => {
    const b = c.body; if (!U.isMonth(b.month) || !(num(b.amount) > 0)) fail('اكتب الشهر والمبلغ');
    db.prepare('INSERT INTO adjustments (emp_id, month, kind, amount, note, created_at) VALUES (?,?,?,?,?,?)').run(str(b.emp_id), b.month, b.kind === 'deduct' ? 'deduct' : 'bonus', num(b.amount), str(b.note, 200), nowTs());
    return { ok: true };
  });
  R('POST', '/api/payroll/adj/del', c => { db.prepare('DELETE FROM adjustments WHERE id = ?').run(num(c.body.id)); return { ok: true }; });
  R('POST', '/api/payroll/reward', c => {
    const b = c.body, e = db.prepare('SELECT * FROM employees WHERE id = ?').get(str(b.emp_id)); if (!e || !(num(b.amount) > 0)) fail('اختار الموظف واكتب المبلغ');
    db.prepare('INSERT INTO rewards (emp_id, month, amount, reason, created_at) VALUES (?,?,?,?,?)').run(e.id, U.isMonth(b.month) ? b.month : U.thisMonth(), num(b.amount), str(b.reason, 200), nowTs());
    C.notifyEmp(e.id, { title: 'مكافأة 🎉', body: (str(b.reason, 100) || 'شغلك متقدّر') + ' — ' + num(b.amount) + ' ' + U.cfg('currency'), tag: 'reward', urgent: true });
    U.log(who(c), 'reward', e.name + ' ' + b.amount);
    return { ok: true };
  });
  R('POST', '/api/payroll/reward/del', c => { db.prepare('DELETE FROM rewards WHERE id = ?').run(num(c.body.id)); return { ok: true }; });
  R('POST', '/api/payroll/loan', c => {
    const b = c.body; if (!(num(b.total) > 0) || !(num(b.n) >= 1) || !U.isMonth(b.start_month)) fail('اكتب المبلغ وعدد الأقساط وأول شهر');
    db.prepare('INSERT INTO loans (emp_id, total, n, start_month, note, created_at) VALUES (?,?,?,?,?,?)').run(str(b.emp_id), num(b.total), Math.min(36, Math.round(num(b.n))), b.start_month, str(b.note, 200), nowTs());
    return { ok: true };
  });
  R('GET', '/api/payroll/loans', c => ({ loans: db.prepare('SELECT * FROM loans ORDER BY id DESC').all() }));
  R('POST', '/api/payroll/loan/stop', c => { db.prepare('UPDATE loans SET active = 0 WHERE id = ?').run(num(c.body.id)); return { ok: true }; });

  /* ── العملاء ── */
  R('GET', '/api/clients', c => {
    const rows = db.prepare('SELECT * FROM clients ORDER BY status, name').all();
    const bal = new Map(db.prepare("SELECT client_id, SUM(CASE WHEN kind='invoice' THEN amount ELSE -amount END) b, MAX(date) last FROM ledger GROUP BY client_id").all().map(r => [r.client_id, r]));
    const lastF = new Map(db.prepare('SELECT client_id, MAX(at) at FROM followups GROUP BY client_id').all().map(r => [r.client_id, r.at]));
    const lastV = new Map(db.prepare('SELECT client_id, MAX(start_at) at FROM visits GROUP BY client_id').all().map(r => [r.client_id, r.at]));
    const open = new Map(db.prepare("SELECT client_id, COUNT(*) n FROM requests WHERE status IN ('new','ok') GROUP BY client_id").all().map(r => [r.client_id, r.n]));
    return { today: today(), clients: rows.map(r => Object.assign(r, { balance: C.r2((bal.get(r.id) || {}).b), last_ledger: (bal.get(r.id) || {}).last || null, last_touch: [lastF.get(r.id), lastV.get(r.id)].filter(Boolean).sort().pop() || null, open_req: open.get(r.id) || 0 })) };
  });
  R('POST', '/api/clients', c => {
    const b = c.body, name = str(b.name, 100); if (!name) fail('اكتب اسم العميل');
    const f = [name, str(b.grp, 60), str(b.contact, 60), str(b.phone, 20).replace(/[^\d+]/g, ''), str(b.address, 200),
      b.lat === '' || b.lat == null ? null : num(b.lat, null), b.lng === '' || b.lng == null ? null : num(b.lng, null), str(b.notes, 1000), b.status === 'paused' ? 'paused' : 'active'];
    if (b.id) {
      db.prepare('UPDATE clients SET name=?, grp=?, contact=?, phone=?, address=?, lat=?, lng=?, notes=?, status=? WHERE id=?').run(...f, str(b.id));
      U.emit('client', { id: b.id }); return { ok: true, id: b.id };
    }
    const id = U.uid(8);
    db.prepare('INSERT INTO clients (name, grp, contact, phone, address, lat, lng, notes, status, id, created_at, portal_code, portal_on) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)').run(...f, id, nowTs(), U.shortCode());
    U.log(who(c), 'client.add', name); U.emit('client', { id });
    return { ok: true, id };
  });
  R('POST', '/api/clients/del', c => {
    const id = str(c.body.id);
    const used = db.prepare('SELECT (SELECT COUNT(*) FROM ledger WHERE client_id = ?) + (SELECT COUNT(*) FROM visits WHERE client_id = ?) n').get(id, id).n;
    if (used) { db.prepare("UPDATE clients SET status = 'paused', portal_on = 0 WHERE id = ?").run(id); return { ok: true, archived: true }; }
    db.prepare('DELETE FROM followups WHERE client_id = ?').run(id); db.prepare('DELETE FROM requests WHERE client_id = ?').run(id);
    db.prepare('DELETE FROM clients WHERE id = ?').run(id);
    return { ok: true };
  });
  R('POST', '/api/clients/import', c => {
    const list = Array.isArray(c.body.rows) ? c.body.rows.slice(0, 2000) : []; let n = 0;
    for (const r of list) {
      const name = str(r.name, 100); if (!name || db.prepare('SELECT 1 FROM clients WHERE name = ?').get(name)) continue;
      db.prepare('INSERT INTO clients (id, name, grp, phone, address, contact, created_at, portal_code, portal_on) VALUES (?,?,?,?,?,?,?,?,1)').run(U.uid(8), name, str(r.grp, 60), str(r.phone, 20).replace(/[^\d+]/g, ''), str(r.address, 200), str(r.contact, 60), nowTs(), U.shortCode());
      n++;
    }
    U.emit('client', {}); return { ok: true, added: n };
  });
  R('GET', '/api/clients/one', c => {
    const cl = db.prepare('SELECT * FROM clients WHERE id = ?').get(str(c.query.id)); if (!cl) fail('العميل مش موجود', 404);
    return {
      client: cl, money: C.balanceOf(cl.id), months: C.monthsOf(cl.id, 12),
      ledger: db.prepare('SELECT * FROM ledger WHERE client_id = ? ORDER BY date DESC, id DESC LIMIT 300').all(cl.id),
      followups: db.prepare('SELECT * FROM followups WHERE client_id = ? ORDER BY at DESC LIMIT 200').all(cl.id),
      visits: db.prepare('SELECT v.*, e.name emp_name FROM visits v LEFT JOIN employees e ON e.id = v.emp_id WHERE v.client_id = ? ORDER BY v.id DESC LIMIT 100').all(cl.id),
      requests: db.prepare('SELECT * FROM requests WHERE client_id = ? ORDER BY id DESC LIMIT 100').all(cl.id).map(reqOut),
      tasks: db.prepare('SELECT t.*, e.name emp_name FROM tasks t LEFT JOIN employees e ON e.id = t.emp_id WHERE t.client_id = ? ORDER BY t.id DESC LIMIT 50').all(cl.id)
    };
  });
  R('POST', '/api/clients/link', c => {
    const id = str(c.body.id), a = str(c.body.action, 10);
    const cl = db.prepare('SELECT * FROM clients WHERE id = ?').get(id); if (!cl) fail('العميل مش موجود', 404);
    if (a === 'rotate' || !cl.portal_code) db.prepare('UPDATE clients SET portal_code = ?, portal_on = 1 WHERE id = ?').run(U.shortCode(), id);
    else if (a === 'off') db.prepare('UPDATE clients SET portal_on = 0 WHERE id = ?').run(id);
    else if (a === 'on') db.prepare('UPDATE clients SET portal_on = 1 WHERE id = ?').run(id);
    U.log(who(c), 'link.' + a, cl.name);
    return { ok: true, client: db.prepare('SELECT * FROM clients WHERE id = ?').get(id) };
  });
  R('POST', '/api/ledger', c => {
    const b = c.body; if (!db.prepare('SELECT 1 FROM clients WHERE id = ?').get(str(b.client_id))) fail('العميل مش موجود');
    if (!(num(b.amount) > 0)) fail('اكتب المبلغ');
    db.prepare('INSERT INTO ledger (client_id, date, kind, amount, ref, note, created_at, created_by) VALUES (?,?,?,?,?,?,?,?)')
      .run(str(b.client_id), U.isDate(b.date) ? b.date : today(), b.kind === 'payment' ? 'payment' : 'invoice', num(b.amount), str(b.ref, 40), str(b.note, 200), nowTs(), who(c));
    return { ok: true };
  });
  R('POST', '/api/ledger/del', c => { db.prepare('DELETE FROM ledger WHERE id = ?').run(num(c.body.id)); return { ok: true }; });
  R('POST', '/api/followups', c => {
    const b = c.body, cl = db.prepare('SELECT * FROM clients WHERE id = ?').get(str(b.client_id)); if (!cl) fail('العميل مش موجود');
    const kind = ['call', 'visit', 'whatsapp', 'note', 'meeting'].includes(b.kind) ? b.kind : 'note';
    if (!str(b.note) && !b.next_date) fail('اكتب حصل إيه');
    const next = U.isDate(b.next_date) ? b.next_date : null;
    db.prepare('INSERT INTO followups (client_id, at, kind, note, by_name, next_date, outcome) VALUES (?,?,?,?,?,?,?)').run(cl.id, nowTs(), kind, str(b.note, 1000), who(c), next, str(b.outcome, 20));
    db.prepare('UPDATE clients SET next_follow = ? WHERE id = ?').run(next, cl.id);
    U.emit('client', { id: cl.id });
    return { ok: true };
  });
  R('POST', '/api/followups/snooze', c => { db.prepare('UPDATE clients SET next_follow = ? WHERE id = ?').run(U.isDate(c.body.date) ? c.body.date : null, str(c.body.id)); U.emit('client', {}); return { ok: true }; });
  R('POST', '/api/followups/del', c => { db.prepare('DELETE FROM followups WHERE id = ?').run(num(c.body.id)); return { ok: true }; });
  R('GET', '/api/follow', c => {
    const td = today();
    const rows = db.prepare("SELECT c.*, (SELECT MAX(at) FROM followups f WHERE f.client_id = c.id) last_f, (SELECT note FROM followups f WHERE f.client_id = c.id ORDER BY at DESC LIMIT 1) last_note FROM clients c WHERE c.status = 'active' ORDER BY c.next_follow IS NULL, c.next_follow, c.name").all();
    return { today: td, rows };
  });

  /* ── الطلبات (من لينك العميل) ── */
  function reqOut(r) { let items = []; try { items = JSON.parse(r.items || '[]'); } catch (_) {} return Object.assign({}, r, { items }); }
  R('GET', '/api/requests', c => {
    const st = str(c.query.status, 10);
    const where = st === 'open' ? "WHERE r.status IN ('new','ok')" : st === 'done' ? "WHERE r.status IN ('sent','no')" : '';
    const rows = db.prepare(`SELECT r.*, cl.name client_name, cl.phone client_phone, cl.grp client_grp, t.status task_status, e.name task_emp FROM requests r LEFT JOIN clients cl ON cl.id = r.client_id LEFT JOIN tasks t ON t.id = r.task_id LEFT JOIN employees e ON e.id = t.emp_id ${where} ORDER BY r.id DESC LIMIT 300`).all();
    db.prepare("UPDATE requests SET seen_at = ? WHERE seen_at IS NULL").run(nowTs());
    return { requests: rows.map(reqOut) };
  });
  R('POST', '/api/requests/status', c => {
    const id = num(c.body.id), st = str(c.body.status, 6);
    if (!['new', 'ok', 'sent', 'no'].includes(st)) fail('حالة غلط');
    db.prepare('UPDATE requests SET status = ?, reply = COALESCE(?, reply), done_at = ? WHERE id = ?').run(st, c.body.reply == null ? null : str(c.body.reply, 300), st === 'sent' || st === 'no' ? nowTs() : null, id);
    U.emit('request', { id }); U.log(who(c), 'req.' + st, String(id));
    return { ok: true };
  });
  R('POST', '/api/requests/assign', c => {
    const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(num(c.body.id)); if (!r) fail('الطلب مش موجود', 404);
    const e = db.prepare('SELECT * FROM employees WHERE id = ? AND active = 1').get(str(c.body.emp_id)); if (!e) fail('اختار الموظف');
    const cl = db.prepare('SELECT * FROM clients WHERE id = ?').get(r.client_id);
    const title = r.kind === 'maint' ? 'صيانة: ' + (r.device || 'عطل') : 'توصيل طلب';
    let items = []; try { items = JSON.parse(r.items || '[]'); } catch (_) {}
    const note = [r.note, items.map(i => i.name + ' × ' + i.qty).join('، ')].filter(Boolean).join(' — ');
    const tid = Number(db.prepare('INSERT INTO tasks (emp_id, client_id, client_name, title, note, status, request_id, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(e.id, cl.id, cl.name, title, note.slice(0, 500), 'new', r.id, nowTs(), who(c)).lastInsertRowid);
    db.prepare("UPDATE requests SET status = 'ok', task_id = ? WHERE id = ?").run(tid, r.id);
    C.notifyEmp(e.id, { title: 'مهمة جديدة', body: title + ' — ' + cl.name, tag: 'task-' + tid, urgent: true });
    U.emit('task', { id: tid }); U.emit('request', { id: r.id });
    return { ok: true, task_id: tid };
  });

  /* ── بنك الأعطال ── */
  R('GET', '/api/faults', c => ({ faults: searchFaults(c.query.q) }));
  R('POST', '/api/faults', c => {
    const b = c.body; if (!str(b.title) || !str(b.solution)) fail('اكتب العطل والحل');
    if (b.id) db.prepare('UPDATE faults SET code=?, title=?, solution=? WHERE id=?').run(str(b.code, 30), str(b.title, 150), str(b.solution, 2000), num(b.id));
    else db.prepare('INSERT INTO faults (code, title, solution, emp_name, at) VALUES (?,?,?,?,?)').run(str(b.code, 30), str(b.title, 150), str(b.solution, 2000), who(c), nowTs());
    return { ok: true };
  });
  R('POST', '/api/faults/del', c => { db.prepare('DELETE FROM fault_votes WHERE fault_id = ?').run(num(c.body.id)); db.prepare('DELETE FROM faults WHERE id = ?').run(num(c.body.id)); return { ok: true }; });

  /* ── المحادثات ── */
  R('GET', '/api/chat', c => ({
    on: U.cfg('chat_on') === '1',
    threads: db.prepare("SELECT e.id, e.name, e.job, e.photo IS NOT NULL has_photo, length(e.photo) pv, e.hue, (SELECT body FROM messages m WHERE m.emp_id = e.id ORDER BY id DESC LIMIT 1) last, (SELECT at FROM messages m WHERE m.emp_id = e.id ORDER BY id DESC LIMIT 1) last_at, (SELECT COUNT(*) FROM messages m WHERE m.emp_id = e.id AND side = 'emp' AND read_at IS NULL) unread FROM employees e WHERE e.active = 1 ORDER BY last_at IS NULL, last_at DESC, e.name").all()
      .map(t => Object.assign(t, { photo: t.has_photo ? '/api/emp-photo/' + t.id + '?v=' + t.pv : '' }))
  }));
  R('GET', '/api/chat/thread', c => {
    const id = str(c.query.id);
    db.prepare("UPDATE messages SET read_at = ? WHERE emp_id = ? AND side = 'emp' AND read_at IS NULL").run(nowTs(), id);
    return { messages: db.prepare('SELECT * FROM messages WHERE emp_id = ? ORDER BY id DESC LIMIT 200').all(id).reverse() };
  });
  R('POST', '/api/chat/send', c => {
    const id = str(c.body.id), body = str(c.body.body, 1000); if (!body) fail('اكتب الرسالة');
    if (!db.prepare('SELECT 1 FROM employees WHERE id = ?').get(id)) fail('الموظف مش موجود');
    db.prepare('INSERT INTO messages (emp_id, side, body, at, by_name) VALUES (?,?,?,?,?)').run(id, 'mgr', body, nowTs(), who(c));
    C.notifyEmp(id, { title: 'رسالة من الإدارة', body: body.slice(0, 120), tag: 'chat' });
    U.emit('chat', { emp: id });
    return { ok: true };
  });

  /* ── الإعدادات ── */
  const EDITABLE = ['company', 'tagline', 'logo', 'currency', 'shift_start', 'shift_end', 'rest_days', 'grace_min', 'ping_min', 'require_location', 'geofence', 'arrive_radius', 'chat_on', 'pay_days', 'late_mult', 'absent_mult', 'ot_mult', 'order_items', 'devices', 'purposes'];
  R('POST', '/api/settings', c => {
    for (const k of EDITABLE) if (c.body[k] !== undefined) {
      let v = c.body[k];
      if (k === 'logo') { if (v && (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(v) || v.length > 300000)) fail('اللوجو لازم صورة صغيرة'); }
      else v = str(v, 3000);
      U.cfgSet(k, v);
    }
    U.log(who(c), 'settings', Object.keys(c.body).join(','));
    U.emit('settings', {});
    return { ok: true, settings: U.cfgAll() };
  });
  R('POST', '/api/sites', c => {
    const b = c.body, name = str(b.name, 60); if (!name) fail('اكتب اسم المكان');
    if (!Number.isFinite(+b.lat) || !Number.isFinite(+b.lng)) fail('حدد المكان على الخريطة');
    const radius = Math.max(50, Math.min(5000, Math.round(num(b.radius, 250))));
    if (b.id) db.prepare('UPDATE sites SET name=?, lat=?, lng=?, radius=? WHERE id=?').run(name, +b.lat, +b.lng, radius, str(b.id));
    else db.prepare('INSERT INTO sites (id, name, lat, lng, radius) VALUES (?,?,?,?,?)').run(U.uid(6), name, +b.lat, +b.lng, radius);
    return { ok: true, sites: db.prepare('SELECT * FROM sites ORDER BY name').all() };
  });
  R('POST', '/api/sites/del', c => { db.prepare('DELETE FROM sites WHERE id = ?').run(str(c.body.id)); return { ok: true, sites: db.prepare('SELECT * FROM sites ORDER BY name').all() }; });
  R('GET', '/api/log', () => ({ rows: db.prepare('SELECT * FROM log ORDER BY id DESC LIMIT 300').all() }));
  R('GET', '/api/backup', c => {
    const tmp = path.join(DATA_DIR, 'backup-' + Date.now() + '.db');
    db.exec("VACUUM INTO '" + tmp.replace(/'/g, "''") + "'");
    const buf = fs.readFileSync(tmp); fs.unlinkSync(tmp);
    c.res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="taqam-' + today() + '.db"', 'Content-Length': buf.length });
    c.res.end(buf); return null;
  });

  /* ── الإشعارات للمدير ── */
  R('GET', '/api/push/key', () => ({ key: webpush.publicKey() }));
  R('POST', '/api/push/subscribe', c => { webpush.subscribe({ id: 'u:' + c.user.id }, c.body.sub, c.req.headers['user-agent']); return { ok: true }; });
  R('POST', '/api/push/seen', c => { webpush.seen('u:' + c.user.id); return { ok: true }; });
  R('GET', '/api/push/status', c => ({ devices: webpush.countFor('u:' + c.user.id) }));
  R('POST', '/api/push/test', c => webpush.send(['u:' + c.user.id], { title: 'طاقم', body: 'الإشعارات شغالة على الجهاز ده ✓', url: '/', noBadge: true }).then(r => ({ ok: true, devices: r.devices, sent: r.ok })));

  function searchFaults(q) {
    const s = str(q, 80);
    if (!s) return db.prepare('SELECT * FROM faults ORDER BY votes DESC, id DESC LIMIT 200').all();
    const like = '%' + s.replace(/[%_]/g, '') + '%';
    return db.prepare('SELECT * FROM faults WHERE code LIKE ? OR title LIKE ? OR solution LIKE ? OR client_name LIKE ? ORDER BY votes DESC, id DESC LIMIT 100').all(like, like, like, like);
  }
  return { searchFaults, reqOut };
};
