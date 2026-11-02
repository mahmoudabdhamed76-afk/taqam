'use strict';
/* طاقم · الباكس — استقبال الحالات من الأجهزة وحفظها وفهرستها وإرسالها */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const dns = require('node:dns');
const zlib = require('node:zlib');
const { db, DATA_DIR } = require('./db');
const U = require('./util');
const D = require('./dicom');

const ROOT = path.join(DATA_DIR, 'pacs');
fs.mkdirSync(ROOT, { recursive: true });
const DEF = { pacs_on: '1', pacs_ae: 'TAQAM', pacs_port: '11112', pacs_strict: '0', pacs_allow: '', pacs_called: '0', pacs_keep_days: '0', pacs_public: '' };
const cfg = k => { const v = U.cfg(k); return v == null ? DEF[k] : v; };
const safe = s => String(s || '').replace(/[^0-9A-Za-z._-]/g, '_').slice(0, 80) || 'x';
const MODE = process.env.TAQAM_MODE === 'pacs' ? 'pacs' : 'full';
/* على Railway (السحابة) الباكس مقفول: الحالات بتتخزن على كمبيوتر المركز بس (نسخة الباكس المحلية) */
const CLOUD = !!process.env.RAILWAY_ENVIRONMENT && MODE !== 'pacs' && process.env.PACS_CLOUD !== '1';
const FIXED_PORT = Number(process.env.RAILWAY_TCP_APPLICATION_PORT || process.env.DICOM_PORT || 0) || null;

let server = null, state = { listening: false, port: null, error: '' };
const prog = new Map();   // study → last emit time

/* ── حفظ صورة واحدة ── */
async function onInstance({ ds, ts, sopClass, sopInst, calling, ip }) {
  const t = D.readTags(ds, ts !== D.TS_IMPLICIT, 0);
  const sop = sopInst || t.sopInst || ('x' + Date.now() + Math.random().toString(36).slice(2));
  const study = t.studyUid || ('nostudy.' + (t.patId || 'x') + '.' + (t.studyDate || U.today().replace(/-/g, '')));
  const dir = path.join(ROOT, safe(study)); await fsp.mkdir(dir, { recursive: true });
  const file = path.join(dir, safe(sop) + '.dcm');
  const head = D.metaHeader(sopClass || t.sopClass, sop, ts, calling);
  const fh = await fsp.open(file, 'w'); try { await fh.writev([head, ds]); } finally { await fh.close(); }
  const size = head.length + ds.length, now = U.nowTs();
  const old = db.prepare('SELECT bytes FROM pacs_instances WHERE sop_uid = ?').get(sop);
  db.prepare('INSERT OR REPLACE INTO pacs_instances (sop_uid, study_uid, series_uid, series_no, series_desc, inst_no, modality, sop_class, ts, path, bytes, received_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(sop, study, t.seriesUid, parseInt(t.seriesNo, 10) || 0, t.seriesDesc, parseInt(t.instNo, 10) || 0, t.modality, sopClass || t.sopClass, ts, path.relative(ROOT, file), size, now);
  const st = db.prepare('SELECT uid FROM pacs_studies WHERE uid = ?').get(study);
  if (!st) {
    db.prepare('INSERT INTO pacs_studies (uid, patient_name, patient_id, birth, sex, age, study_date, study_time, modality, description, accession, referring, institution, body_part, source_ae, source_ip, n_series, n_inst, bytes, received_at, updated_at, seen) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)')
      .run(study, t.patName, t.patId, t.birth, t.sex, t.age, t.studyDate, t.studyTime, t.modality, t.studyDesc, t.accession, t.referring, t.institution, t.bodyPart, calling, ip, 1, 1, size, now, now);
  } else {
    db.prepare('UPDATE pacs_studies SET n_inst = n_inst + ?, bytes = bytes + ?, updated_at = ?, seen = 0, source_ae = COALESCE(source_ae, ?) WHERE uid = ?').run(old ? 0 : 1, size - (old ? old.bytes : 0), now, calling, study);
  }
  const last = prog.get(study) || 0;
  if (Date.now() - last > 800) { prog.set(study, Date.now()); const s = db.prepare('SELECT n_inst FROM pacs_studies WHERE uid = ?').get(study); U.emit('pacs', { uid: study, n: s.n_inst, patient: t.patName, live: true }); }
  return { studyUid: study };
}
function recount(uid) {
  const a = db.prepare('SELECT COUNT(*) n, COUNT(DISTINCT series_uid) s, COALESCE(SUM(bytes),0) b, GROUP_CONCAT(DISTINCT modality) m FROM pacs_instances WHERE study_uid = ?').get(uid);
  const mods = [...new Set(String(a.m || '').split(',').filter(Boolean))].filter(m => m !== 'SR' && m !== 'PR' && m !== 'KO').join(',') || String(a.m || '');
  db.prepare('UPDATE pacs_studies SET n_inst = ?, n_series = ?, bytes = ?, modality = ? WHERE uid = ?').run(a.n, a.s, a.b, mods, uid);
}
function onAssocEnd(s) {
  const C = require('./core');
  for (const uid of s.studies) recount(uid);
  db.prepare('INSERT INTO pacs_log (at, dir, ae, ip, study_uid, n, ok, ms, note) VALUES (?,?,?,?,?,?,?,?,?)').run(U.nowTs(), 'in', s.calling, s.ip, s.studies.join(','), s.n, s.fails ? 0 : 1, s.ms, s.fails ? s.fails + ' صورة فشلت' : '');
  const st = s.studies.length ? db.prepare('SELECT * FROM pacs_studies WHERE uid = ?').get(s.studies[0]) : null;
  if (st) {
    C.notifyManagers({ title: 'وصلت حالة — ' + (st.patient_name || 'من غير اسم'), body: [st.modality, st.description].filter(Boolean).join(' · ') + ' · ' + s.n + ' صورة من ' + (s.calling || s.ip), tag: 'pacs-' + st.uid.slice(-12) }, { type: 'pacs', data: { uid: st.uid, done: true, n: st.n_inst, patient: st.patient_name } }, 'pacs');
  }
  /* توجيه تلقائي: أي جهاز معلّم عليه "ابعت تلقائي" */
  const autos = db.prepare('SELECT * FROM pacs_nodes WHERE auto = 1').all();
  for (const n of autos) for (const uid of s.studies) { try { startSend(uid, n.id, 'تلقائي'); } catch (e) { console.error('[pacs auto]', e.message); } }
}

/* ── تشغيل/إيقاف المستقبل ── */
function allow(calling, ip, called) {
  if (cfg('pacs_called') === '1' && D.ae(called) !== D.ae(cfg('pacs_ae'))) return 'called';
  if (cfg('pacs_strict') === '1') {
    const list = String(cfg('pacs_allow') || '').split(/[\n,]/).map(D.ae).filter(Boolean);
    if (!list.includes(D.ae(calling))) return 'AE مش في القائمة المسموحة';
  }
  return true;
}
function logIn(dir, ae, ip, note) { try { db.prepare('INSERT INTO pacs_log (at, dir, ae, ip, n, ok, note) VALUES (?,?,?,?,0,0,?)').run(U.nowTs(), dir, ae, ip, note); } catch (_) {} }
function port() { return FIXED_PORT || Number(cfg('pacs_port')) || 11112; }
function start() {
  stop();
  if (CLOUD) { state = { listening: false, port: null, error: '' }; return; }
  if (cfg('pacs_on') !== '1') { state = { listening: false, port: null, error: '' }; return; }
  const p = port();
  if (p === Number(process.env.PORT || 8080)) { state = { listening: false, port: p, error: 'بورت الباكس نفس بورت البرنامج — غيّره' }; console.error('[pacs]', state.error); return; }
  server = D.createScp({ allow, onInstance, onAssocEnd, log: logIn });
  server.on('error', e => { state = { listening: false, port: p, error: e.code === 'EADDRINUSE' ? 'البورت ' + p + ' مستخدم في برنامج تاني' : e.code === 'EACCES' ? 'البورت ' + p + ' محتاج صلاحيات — اختار بورت أكبر من 1024' : e.message }; console.error('[pacs]', state.error); });
  server.listen(p, '0.0.0.0', () => { state = { listening: true, port: p, error: '' }; console.log('  الباكس (DICOM) شغّال على البورت ' + p + ' · AE ' + D.ae(cfg('pacs_ae'))); });
}
function stop() { if (server) { try { server.close(); } catch (_) {} server = null; } state = { listening: false, port: null, error: '' }; }

/* ── العناوين اللي الأجهزة تبعت عليها ── */
let pubIp = { host: '', ip: '', at: 0 };
function lanIps() { const out = []; for (const [n, L] of Object.entries(os.networkInterfaces())) for (const a of L || []) if (a.family === 'IPv4' && !a.internal) out.push({ ip: a.address, nic: n }); return out; }
async function endpoints() {
  const ae = D.ae(cfg('pacs_ae')), out = [];
  const host = process.env.RAILWAY_TCP_PROXY_DOMAIN, rport = process.env.RAILWAY_TCP_PROXY_PORT;
  if (host && rport) {
    if (pubIp.host !== host || Date.now() - pubIp.at > 600000) { try { const r = await dns.promises.lookup(host, { family: 4 }); pubIp = { host, ip: r.address, at: Date.now() }; } catch (_) { pubIp = { host, ip: '', at: Date.now() }; } }
    out.push({ kind: 'public', label: 'من أي مكان (إنترنت)', host, ip: pubIp.ip, port: Number(rport), ae });
  }
  const man = String(cfg('pacs_public') || '').trim();
  if (man) { const [h, pp] = man.split(':'); out.push({ kind: 'manual', label: 'العنوان العام', host: h, ip: /^\d+\.\d+\.\d+\.\d+$/.test(h) ? h : '', port: Number(pp) || port(), ae }); }
  if (!process.env.RAILWAY_ENVIRONMENT) for (const l of lanIps()) out.push({ kind: 'lan', label: 'على نفس الشبكة (' + l.nic + ')', host: l.ip, ip: l.ip, port: port(), ae });
  return out;
}
function status() {
  return { ...state, ae: D.ae(cfg('pacs_ae')), fixed_port: FIXED_PORT, cloud: CLOUD, mode: MODE, railway: !!process.env.RAILWAY_ENVIRONMENT, has_proxy: !!process.env.RAILWAY_TCP_PROXY_DOMAIN };
}

/* ── الإرسال ── */
const jobs = new Map(); let jobSeq = 0;
function filesOf(uid, series) {
  let rows = db.prepare('SELECT * FROM pacs_instances WHERE study_uid = ? ORDER BY series_no, inst_no').all(uid);
  if (series && series.length) rows = rows.filter(r => series.includes(r.series_uid));
  return rows.map(r => ({ path: path.join(ROOT, r.path), sopClass: r.sop_class, sopInst: r.sop_uid, ts: r.ts, bytes: r.bytes }));
}
function startSend(uid, nodeId, by, series) {
  const node = db.prepare('SELECT * FROM pacs_nodes WHERE id = ?').get(nodeId);
  if (!node) U.fail('الجهاز ده مش موجود');
  const st = db.prepare('SELECT * FROM pacs_studies WHERE uid = ?').get(uid);
  if (!st) U.fail('الدراسة دي مش موجودة');
  const files = filesOf(uid, series).filter(f => fs.existsSync(f.path));
  if (!files.length) U.fail('مفيش صور في الدراسة دي');
  const id = ++jobSeq, job = { id, uid, patient: st.patient_name, node: node.name, node_id: node.id, total: files.length, sent: 0, failed: 0, bytes: 0, status: 'run', started: Date.now(), by: by || '' };
  jobs.set(id, job); U.emit('pacsjob', job);
  let lastEmit = 0;
  D.sendFiles(node, cfg('pacs_ae'), files, p => { Object.assign(job, p); if (Date.now() - lastEmit > 400) { lastEmit = Date.now(); U.emit('pacsjob', job); } }, node.parallel || 1)
    .then(r => { Object.assign(job, r, { status: r.failed ? (r.sent ? 'partial' : 'fail') : 'done', ms: Date.now() - job.started }); if (!r.failed) db.prepare('UPDATE pacs_nodes SET last_ok = ? WHERE id = ?').run(U.nowTs(), node.id); })
    .catch(e => { Object.assign(job, { status: 'fail', error: e.message, ms: Date.now() - job.started }); })
    .finally(() => {
      U.emit('pacsjob', job);
      db.prepare('INSERT INTO pacs_log (at, dir, ae, ip, study_uid, n, ok, ms, note) VALUES (?,?,?,?,?,?,?,?,?)').run(U.nowTs(), 'out', node.ae, node.host + ':' + node.port, uid, job.sent, job.status === 'done' ? 1 : 0, job.ms || 0, job.error || (job.errors || []).join(' | ') || by || '');
      setTimeout(() => jobs.delete(id), 30 * 60000).unref();
    });
  return job;
}

/* ── ملف ZIP للدراسة (من غير ضغط — الصور أصلا مش بتتضغط كويس) ── */
/* zip عام: items = [{ name, read() → Buffer }] — من غير ضغط، أسماء UTF-8 */
function zipStream(res, fileName, items) {
  const crc32 = zlib.crc32 || (b => { let c, crc = 0xFFFFFFFF; for (let n = 0; n < b.length; n++) { c = (crc ^ b[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; });
  res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(fileName), 'Cache-Control': 'no-store' });
  const central = []; let off = 0, i = 0;
  (function next() {
    if (i >= items.length) {
      let cdSize = 0; for (const c of central) { res.write(c); cdSize += c.length; }
      const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10); end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(off, 16);
      return res.end(end);
    }
    const it = items[i++]; let data; try { data = it.read(); } catch (_) { return next(); }
    const fname = Buffer.from(it.name, 'utf8'), crc = crc32(data) >>> 0;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(fname.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(fname.length, 28); ch.writeUInt32LE(off, 42);
    central.push(Buffer.concat([ch, fname])); off += 30 + fname.length + data.length;
    const ok = res.write(Buffer.concat([lh, fname, data]));
    if (ok) setImmediate(next); else res.once('drain', next);
  })();
}
function zipStudy(res, uid, name) {
  const rows = db.prepare('SELECT * FROM pacs_instances WHERE study_uid = ? ORDER BY series_no, inst_no').all(uid);
  zipStream(res, name + '.zip', rows.map((r, k) => ({ name: 'S' + String(r.series_no || 0).padStart(3, '0') + '/IM' + String(r.inst_no || k + 1).padStart(5, '0') + '_' + safe(r.sop_uid).slice(-12) + '.dcm', read: () => fs.readFileSync(path.join(ROOT, r.path)) })));
}

/* ── رفع ملفات DICOM من المتصفح (لو الجهاز مش متوصل) ── */
async function importFile(buf, by) {
  if (CLOUD) U.fail('الباكس بيشتغل على كمبيوتر المركز — مش على السيرفر', 403);
  if (buf.length < 144 || buf.toString('latin1', 128, 132) !== 'DICM') U.fail('الملف ده مش DICOM (Part-10)');
  const tmp = path.join(ROOT, '.up-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  fs.writeFileSync(tmp, buf);
  try { const r = D.readPart10(tmp); const out = await onInstance({ ds: Buffer.from(r.dataset), ts: r.ts || D.TS_EXPLICIT, sopClass: r.sopClass, sopInst: r.sopInst, calling: 'UPLOAD', ip: by || '' }); return out; }
  finally { try { fs.unlinkSync(tmp); } catch (_) {} }
}

function removeStudy(uid) {
  db.prepare('DELETE FROM pacs_instances WHERE study_uid = ?').run(uid);
  db.prepare('DELETE FROM pacs_studies WHERE uid = ?').run(uid);
  try { fs.rmSync(path.join(ROOT, safe(uid)), { recursive: true, force: true }); } catch (_) {}
}
function sweep() {
  const days = Number(cfg('pacs_keep_days')) || 0; if (days <= 0) return;
  const lim = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  for (const r of db.prepare('SELECT uid FROM pacs_studies WHERE received_at < ?').all(lim)) removeStudy(r.uid);
  db.prepare('DELETE FROM pacs_log WHERE at < ?').run(lim);
}
setInterval(() => { try { sweep(); } catch (e) { console.error('[pacs sweep]', e.message); } }, 6 * 3600 * 1000).unref();
function disk() { try { const s = fs.statfsSync(DATA_DIR); return { free: s.bavail * s.bsize, total: s.blocks * s.bsize }; } catch (_) { return null; } }

module.exports = { MODE, CLOUD, zipStream, ROOT, DEF, cfg, start, stop, status, endpoints, startSend, jobs, filesOf, zipStudy, importFile, removeStudy, recount, disk, port, safe };
