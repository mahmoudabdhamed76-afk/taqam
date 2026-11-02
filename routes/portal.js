'use strict';
/* طاقم · لينك العميل /c/<code> — صفحة لعميل واحد من غير تسجيل دخول:
   حسابه وحركته الشهرية، يطلب ورق/أفلام أو يطلب صيانة، ويتابع حالة طلباته ويقيّمها. */
const { db } = require('../lib/db');
const U = require('../lib/util');
const C = require('../lib/core');

module.exports = function (R) {
  const { str, num, fail, nowTs } = U;
  const hits = new Map();   // simple per-code rate limit for new requests
  function client(code) {
    if (!/^[A-Za-z0-9]{6,16}$/.test(String(code || ''))) fail('اللينك ده مش صحيح', 404);
    const cl = db.prepare('SELECT * FROM clients WHERE portal_code = ?').get(code);
    if (!cl || !cl.portal_on || cl.status !== 'active') fail('اللينك ده متوقف — كلّم الشركة', 404);
    return cl;
  }
  const STATUS = { order: { new: 'اتبعت — مستني التأكيد', ok: 'اتأكد — بيتجهز', sent: 'اتسلّم', no: 'اتلغى' }, maint: { new: 'اتبعت — مستني فني', ok: 'الفني اتحدد', sent: 'اتصلح', no: 'اتلغى' } };

  R('GET', '/c/api/:code', c => {
    const cl = client(c.params.code), s = U.cfgAll();
    db.prepare('UPDATE clients SET portal_seen = ? WHERE id = ?').run(nowTs(), cl.id);
    const reqs = db.prepare('SELECT r.*, t.status t_status, t.dist t_dist, t.d0 t_d0, e.name t_emp FROM requests r LEFT JOIN tasks t ON t.id = r.task_id LEFT JOIN employees e ON e.id = t.emp_id WHERE r.client_id = ? ORDER BY r.id DESC LIMIT 30').all(cl.id);
    return {
      company: s.company, logo: s.logo, currency: s.currency, tagline: s.tagline,
      client: { name: cl.name, grp: cl.grp, contact: cl.contact },
      money: C.balanceOf(cl.id), months: C.monthsOf(cl.id, 12),
      ledger: db.prepare('SELECT date, kind, amount, ref, note FROM ledger WHERE client_id = ? ORDER BY date DESC, id DESC LIMIT 40').all(cl.id),
      items: U.lines('order_items'), devices: U.lines('devices'),
      requests: reqs.map(r => {
        let items = []; try { items = JSON.parse(r.items || '[]'); } catch (_) {}
        const onWay = r.t_status === 'on_way', arrived = r.t_status === 'arrived';
        return { id: r.id, kind: r.kind, items, device: r.device, note: r.note, status: r.status, status_text: (STATUS[r.kind] || STATUS.order)[r.status] + (onWay ? ' — ' + (r.t_emp || 'الفني') + ' في الطريق' : arrived ? ' — ' + (r.t_emp || 'الفني') + ' وصل' : ''), created_at: r.created_at, done_at: r.done_at, reply: r.reply, rating: r.rating, emp: r.t_emp, progress: onWay && r.t_d0 ? Math.max(0, Math.min(1, 1 - (r.t_dist || 0) / r.t_d0)) : null };
      })
    };
  });
  R('POST', '/c/api/:code/request', c => {
    const cl = client(c.params.code), b = c.body;
    const k = cl.id, h = (hits.get(k) || []).filter(t => Date.now() - t < 3600000);
    if (h.length >= 12) fail('طلبات كتير في ساعة — جرّب بعد شوية', 429);
    const kind = b.kind === 'maint' ? 'maint' : 'order';
    let items = [];
    if (kind === 'order') {
      items = (Array.isArray(b.items) ? b.items : []).map(i => ({ name: str(i.name, 60), qty: Math.round(num(i.qty)) })).filter(i => i.name && i.qty > 0 && i.qty < 100000).slice(0, 20);
      if (!items.length) fail('اختار الأصناف والكميات');
    } else if (!str(b.device) && !str(b.note)) fail('قول العطل في إيه');
    const photo = kind === 'maint' && b.photo ? U.savePhoto(b.photo) : null;
    const id = Number(db.prepare('INSERT INTO requests (client_id, kind, items, device, note, contact, status, created_at, photo_id) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(cl.id, kind, JSON.stringify(items), str(b.device, 60), str(b.note, 800), str(b.contact, 80), 'new', nowTs(), photo).lastInsertRowid);
    h.push(Date.now()); hits.set(k, h);
    C.notifyManagers({ title: (kind === 'maint' ? 'طلب صيانة — ' : 'طلب جديد — ') + cl.name, body: kind === 'maint' ? (str(b.device) || '') + ' ' + str(b.note, 80) : items.map(i => i.name + ' × ' + i.qty).join('، '), tag: 'req-' + id, urgent: true }, { type: 'request', data: { id } });
    U.log(cl.name, 'portal.request', kind);
    return { ok: true, id };
  });
  R('POST', '/c/api/:code/rate', c => {
    const cl = client(c.params.code), r = db.prepare('SELECT * FROM requests WHERE id = ? AND client_id = ?').get(num(c.body.id), cl.id);
    if (!r || r.status !== 'sent') fail('التقييم بعد ما الطلب يخلص');
    const n = Math.round(num(c.body.rating)); if (n < 1 || n > 5) fail('اختار من 1 لـ 5');
    db.prepare('UPDATE requests SET rating = ?, rate_note = ? WHERE id = ?').run(n, str(c.body.note, 300), r.id);
    C.notifyManagers({ title: 'تقييم ' + '★'.repeat(n) + ' — ' + cl.name, body: str(c.body.note, 100) || 'على طلب #' + r.id, tag: 'rate-' + r.id }, { type: 'request', data: { id: r.id } });
    return { ok: true };
  });
};
