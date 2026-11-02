'use strict';
/* طاقم · واجهة الباكس /api/pacs/* (صلاحية pacs) */
const fs = require('node:fs');
const path = require('node:path');
const { db } = require('../lib/db');
const U = require('../lib/util');
const P = require('../lib/pacs');
const D = require('../lib/dicom');

module.exports = function (R) {
  const { str, num, fail } = U;
  const AE_RX = /^[A-Za-z0-9 ._-]{1,16}$/;
  const studyOut = s => ({ ...s, new: !s.seen });

  R('GET', '/api/pacs/status', async () => ({
    status: P.status(), endpoints: await P.endpoints(), disk: P.disk(),
    settings: Object.fromEntries(Object.keys(P.DEF).map(k => [k, P.cfg(k)])),
    totals: db.prepare('SELECT COUNT(*) n, COALESCE(SUM(n_inst),0) i, COALESCE(SUM(bytes),0) b FROM pacs_studies').get(),
    unseen: db.prepare('SELECT COUNT(*) n FROM pacs_studies WHERE seen = 0').get().n,
    jobs: [...P.jobs.values()].sort((a, b) => b.id - a.id).slice(0, 20)
  }));
  R('POST', '/api/pacs/settings', c => {
    const b = c.body;
    if (b.pacs_ae != null) { const a = str(b.pacs_ae, 16).toUpperCase(); if (!AE_RX.test(a)) fail('الـ AE Title حروف إنجليزي وأرقام بس (لحد 16)'); U.cfgSet('pacs_ae', a); }
    if (b.pacs_port != null) { const p = Math.round(num(b.pacs_port)); if (p < 1 || p > 65535) fail('البورت من 1 لـ 65535'); U.cfgSet('pacs_port', p); }
    for (const k of ['pacs_on', 'pacs_strict', 'pacs_called']) if (b[k] != null) U.cfgSet(k, b[k] ? '1' : '0');
    if (b.pacs_allow != null) U.cfgSet('pacs_allow', String(b.pacs_allow).split(/[\n,]/).map(D.ae).filter(Boolean).slice(0, 100).join('\n'));
    if (b.pacs_keep_days != null) U.cfgSet('pacs_keep_days', Math.max(0, Math.round(num(b.pacs_keep_days))));
    if (b.pacs_public != null) U.cfgSet('pacs_public', str(b.pacs_public, 120));
    P.start();
    U.log(c.user.name, 'pacs.settings', '');
    return new Promise(r => setTimeout(() => r({ ok: true, status: P.status() }), 300));
  });

  /* الدراسات */
  R('GET', '/api/pacs/studies', c => {
    const q = str(c.query.q, 80), mod = str(c.query.mod, 10), from = str(c.query.from, 10), to = str(c.query.to, 10);
    const where = [], args = [];
    if (q) { where.push('(patient_name LIKE ? OR patient_id LIKE ? OR accession LIKE ? OR description LIKE ? OR source_ae LIKE ?)'); const l = '%' + q + '%'; args.push(l, l, l, l, l); }
    if (mod) { where.push('modality LIKE ?'); args.push('%' + mod + '%'); }
    if (U.isDate(from)) { where.push('received_at >= ?'); args.push(from); }
    if (U.isDate(to)) { where.push('received_at <= ?'); args.push(to + ' 99'); }
    const rows = db.prepare('SELECT * FROM pacs_studies ' + (where.length ? 'WHERE ' + where.join(' AND ') : '') + ' ORDER BY updated_at DESC LIMIT 300').all(...args);
    return { studies: rows.map(studyOut), mods: db.prepare("SELECT DISTINCT modality m FROM pacs_studies WHERE modality <> ''").all().map(r => r.m).join(',').split(',').filter((v, i, a) => v && a.indexOf(v) === i) };
  });
  R('GET', '/api/pacs/study', c => {
    const uid = str(c.query.uid, 128), s = db.prepare('SELECT * FROM pacs_studies WHERE uid = ?').get(uid);
    if (!s) fail('الدراسة دي مش موجودة', 404);
    if (!s.seen) db.prepare('UPDATE pacs_studies SET seen = 1 WHERE uid = ?').run(uid);
    const inst = db.prepare('SELECT sop_uid, series_uid, series_no, series_desc, inst_no, modality, ts, bytes FROM pacs_instances WHERE study_uid = ? ORDER BY series_no, inst_no, sop_uid').all(uid);
    const series = []; const by = {};
    for (const i of inst) { let g = by[i.series_uid]; if (!g) { g = by[i.series_uid] = { uid: i.series_uid, no: i.series_no, desc: i.series_desc, modality: i.modality, n: 0, bytes: 0, ts: i.ts, sops: [] }; series.push(g); } g.n++; g.bytes += i.bytes || 0; g.sops.push(i.sop_uid); }
    return { study: studyOut(s), series, log: db.prepare('SELECT * FROM pacs_log WHERE study_uid LIKE ? ORDER BY id DESC LIMIT 20').all('%' + uid + '%') };
  });
  R('POST', '/api/pacs/study/note', c => { db.prepare('UPDATE pacs_studies SET note = ? WHERE uid = ?').run(str(c.body.note, 500), str(c.body.uid, 128)); return { ok: true }; });
  R('POST', '/api/pacs/study/del', c => {
    const uids = (Array.isArray(c.body.uids) ? c.body.uids : [c.body.uid]).map(u => str(u, 128)).filter(Boolean).slice(0, 200);
    uids.forEach(P.removeStudy); U.log(c.user.name, 'pacs.del', uids.length + ''); U.emit('pacs', { removed: uids });
    return { ok: true, n: uids.length };
  });
  R('POST', '/api/pacs/seen', () => { db.prepare('UPDATE pacs_studies SET seen = 1 WHERE seen = 0').run(); return { ok: true }; });

  /* ملف واحد / ZIP */
  R('GET', '/api/pacs/file/:sop', c => {
    const r = db.prepare('SELECT path FROM pacs_instances WHERE sop_uid = ?').get(c.params.sop);
    const f = r && path.join(P.ROOT, r.path);
    if (!f || !f.startsWith(P.ROOT) || !fs.existsSync(f)) fail('الملف مش موجود', 404);
    const st = fs.statSync(f);
    c.res.writeHead(200, { 'Content-Type': 'application/dicom', 'Content-Length': st.size, 'Cache-Control': 'private, max-age=86400' });
    fs.createReadStream(f).pipe(c.res); return null;
  });
  R('GET', '/api/pacs/zip', c => {
    const s = db.prepare('SELECT * FROM pacs_studies WHERE uid = ?').get(str(c.query.uid, 128)); if (!s) fail('مش موجودة', 404);
    P.zipStudy(c.res, s.uid, ((s.patient_name || 'study') + ' ' + (s.modality || '') + ' ' + (s.study_date || '')).replace(/[\\/:*?"<>|]+/g, ' ').trim()); return null;
  });

  /* الأجهزة (اللي بنبعت لها) */
  R('GET', '/api/pacs/nodes', () => ({ nodes: db.prepare('SELECT * FROM pacs_nodes ORDER BY name').all() }));
  R('POST', '/api/pacs/nodes', c => {
    const b = c.body, name = str(b.name, 60), ae = str(b.ae, 16).toUpperCase(), host = str(b.host, 120), port = Math.round(num(b.port));
    if (!name) fail('اكتب اسم الجهاز'); if (!AE_RX.test(ae)) fail('AE Title غلط'); if (!/^[A-Za-z0-9.-]{1,120}$/.test(host)) fail('اكتب IP أو اسم الجهاز صح'); if (port < 1 || port > 65535) fail('البورت غلط');
    const par = Math.max(1, Math.min(4, Math.round(num(b.parallel) || 1))), auto = b.auto ? 1 : 0;
    if (b.id) db.prepare('UPDATE pacs_nodes SET name = ?, ae = ?, host = ?, port = ?, parallel = ?, auto = ? WHERE id = ?').run(name, ae, host, port, par, auto, str(b.id));
    else db.prepare('INSERT INTO pacs_nodes (id, name, ae, host, port, parallel, auto, created_at) VALUES (?,?,?,?,?,?,?,?)').run(U.uid(), name, ae, host, port, par, auto, U.nowTs());
    return { ok: true };
  });
  R('POST', '/api/pacs/nodes/del', c => { db.prepare('DELETE FROM pacs_nodes WHERE id = ?').run(str(c.body.id)); return { ok: true }; });
  R('POST', '/api/pacs/echo', async c => {
    const b = c.body, node = b.id ? db.prepare('SELECT * FROM pacs_nodes WHERE id = ?').get(str(b.id)) : { ae: str(b.ae, 16), host: str(b.host, 120), port: num(b.port) };
    if (!node || !node.host) fail('الجهاز مش موجود');
    try { const r = await D.echo(node, P.cfg('pacs_ae')); if (b.id) db.prepare('UPDATE pacs_nodes SET last_ok = ? WHERE id = ?').run(U.nowTs(), node.id); return { ok: true, ms: r.ms }; }
    catch (e) { fail(e.message); }
  });
  R('POST', '/api/pacs/send', c => {
    const uids = (Array.isArray(c.body.uids) ? c.body.uids : [c.body.uid]).map(u => str(u, 128)).filter(Boolean).slice(0, 50);
    const series = Array.isArray(c.body.series) ? c.body.series.map(s => str(s, 128)) : null;
    const jobs = uids.map(u => P.startSend(u, str(c.body.node), c.user.name, uids.length === 1 ? series : null));
    U.log(c.user.name, 'pacs.send', uids.length + ' → ' + str(c.body.node));
    return { ok: true, jobs };
  });
  R('GET', '/api/pacs/log', () => ({ log: db.prepare('SELECT * FROM pacs_log ORDER BY id DESC LIMIT 150').all() }));
};
