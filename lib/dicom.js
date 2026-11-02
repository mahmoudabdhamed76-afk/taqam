'use strict';
/* ════════════════════════════════════════════════════════════════════
   طاقم · محرّك DICOM (PACS) — من غير أي مكتبات، node:net بس
   ·  SCP: بيستقبل من الأجهزة (C-ECHO + C-STORE) على بورت و AE Title
   ·  SCU: بيبعت دراسة كاملة لأي جهاز/PACS تاني (C-STORE) + اختبار C-ECHO
   الملفات بتتحفظ Part-10 (.dcm) زي ما وصلت من غير أي تعديل في الصور.
════════════════════════════════════════════════════════════════════ */
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');

const IMPL_UID = '1.2.826.0.1.3680043.10.1201.1';
const IMPL_VER = 'TAQAM_PACS_1';
const APP_CTX = '1.2.840.10008.3.1.1.1';
const VERIFY = '1.2.840.10008.1.1';
const TS_IMPLICIT = '1.2.840.10008.1.2';
const TS_EXPLICIT = '1.2.840.10008.1.2.1';
const TS_BIG = '1.2.840.10008.1.2.2';
const MAX_PDU = 1048576 - 6;             // ما نستقبلهش أكبر من كده في PDU واحد
const MAX_INSTANCE = 1500 * 1048576;     // حماية من ملف عملاق

/* ── helpers ── */
const pad = (s, n) => { const b = Buffer.alloc(n, 0x20); b.write(String(s || '').slice(0, n), 'ascii'); return b; };
const uidBuf = u => { let s = String(u || ''); if (s.length % 2) s += '\0'; return Buffer.from(s, 'ascii'); };
const clean = b => b.toString('ascii').replace(/[\0 ]+$/g, '').replace(/^\s+/, '');
const ae = s => String(s || '').trim().toUpperCase().slice(0, 16);
function item(type, body) { const h = Buffer.alloc(4); h[0] = type; h.writeUInt16BE(body.length, 2); return Buffer.concat([h, body]); }
function pdu(type, body) { const h = Buffer.alloc(6); h[0] = type; h.writeUInt32BE(body.length, 2); return Buffer.concat([h, body]); }

/* ── command sets (Implicit VR Little Endian دايمًا) ── */
function elem(g, e, val) { const h = Buffer.alloc(8); h.writeUInt16LE(g, 0); h.writeUInt16LE(e, 2); h.writeUInt32LE(val.length, 4); return Buffer.concat([h, val]); }
const us = v => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
function buildCmd(f) {
  const parts = [];
  if (f.sopClass) parts.push(elem(0, 0x0002, uidBuf(f.sopClass)));
  parts.push(elem(0, 0x0100, us(f.cmd)));
  if (f.msgId != null) parts.push(elem(0, 0x0110, us(f.msgId)));
  if (f.respTo != null) parts.push(elem(0, 0x0120, us(f.respTo)));
  if (f.priority != null) parts.push(elem(0, 0x0700, us(f.priority)));
  parts.push(elem(0, 0x0800, us(f.hasData ? 0x0000 : 0x0101)));
  if (f.status != null) parts.push(elem(0, 0x0900, us(f.status)));
  if (f.sopInst) parts.push(elem(0, 0x1000, uidBuf(f.sopInst)));
  const body = Buffer.concat(parts), gl = Buffer.alloc(4); gl.writeUInt32LE(body.length);
  return Buffer.concat([elem(0, 0, gl), body]);
}
function parseCmd(buf) {
  const o = {}; let p = 0;
  while (p + 8 <= buf.length) {
    const e = buf.readUInt16LE(p + 2), len = buf.readUInt32LE(p + 4), v = buf.subarray(p + 8, p + 8 + len);
    if (e === 0x0002) o.sopClass = clean(v); else if (e === 0x0100) o.cmd = v.readUInt16LE(0);
    else if (e === 0x0110) o.msgId = v.readUInt16LE(0); else if (e === 0x0120) o.respTo = v.readUInt16LE(0);
    else if (e === 0x0800) o.dsType = v.readUInt16LE(0); else if (e === 0x0900) o.status = v.readUInt16LE(0);
    else if (e === 0x1000) o.sopInst = clean(v); else if (e === 0x1030) o.moveAe = clean(v);
    p += 8 + len;
  }
  return o;
}

/* ── P-DATA: نقسّم الرسالة على PDVs بحجم اللي الطرف التاني قابله ── */
function pdata(pcId, isCmd, buf, maxLen) {
  const chunk = Math.max(1024, (maxLen || 16384) - 6), out = [];
  for (let p = 0; p < buf.length || (p === 0 && !buf.length); p += chunk) {
    const part = buf.subarray(p, Math.min(buf.length, p + chunk)), last = p + chunk >= buf.length;
    const h = Buffer.alloc(6); h.writeUInt32BE(part.length + 2, 0); h[4] = pcId; h[5] = (isCmd ? 1 : 0) | (last ? 2 : 0);
    out.push(pdu(0x04, Buffer.concat([h, part])));
    if (!buf.length) break;
  }
  return out;
}

/* ── A-ASSOCIATE parse / build ── */
function parseAssoc(b) {
  const r = { called: clean(b.subarray(4, 20)), calling: clean(b.subarray(20, 36)), pcs: [], maxLen: 16384 };
  let p = 68;
  while (p + 4 <= b.length) {
    const t = b[p], len = b.readUInt16BE(p + 2), body = b.subarray(p + 4, p + 4 + len);
    if (t === 0x20 || t === 0x21) {
      const pc = { id: body[0], result: body[2], abs: '', ts: [] }; let q = 4;
      while (q + 4 <= body.length) { const st = body[q], sl = body.readUInt16BE(q + 2), sv = clean(body.subarray(q + 4, q + 4 + sl)); if (st === 0x30) pc.abs = sv; else if (st === 0x40) pc.ts.push(sv); q += 4 + sl; }
      r.pcs.push(pc);
    } else if (t === 0x50) {
      let q = 0;
      while (q + 4 <= body.length) { const st = body[q], sl = body.readUInt16BE(q + 2); if (st === 0x51 && sl >= 4) r.maxLen = body.readUInt32BE(q + 4) || 0x7fffffff; else if (st === 0x52) r.impl = clean(body.subarray(q + 4, q + 4 + sl)); q += 4 + sl; }
    }
    p += 4 + len;
  }
  return r;
}
function userInfo() {
  const ml = Buffer.alloc(4); ml.writeUInt32BE(MAX_PDU);
  return item(0x50, Buffer.concat([item(0x51, ml), item(0x52, Buffer.from(IMPL_UID)), item(0x55, Buffer.from(IMPL_VER))]));
}
function assocHead(called, calling) { const h = Buffer.alloc(68); h.writeUInt16BE(1, 0); pad(called, 16).copy(h, 4); pad(calling, 16).copy(h, 20); return h; }
function buildAC(rq, accepted) {
  const pcs = accepted.map(a => item(0x21, Buffer.concat([Buffer.from([a.id, 0, a.result, 0]), a.ts ? item(0x40, Buffer.from(a.ts)) : item(0x40, Buffer.from(TS_IMPLICIT))])));
  return pdu(0x02, Buffer.concat([assocHead(rq.called, rq.calling), item(0x10, Buffer.from(APP_CTX)), ...pcs, userInfo()]));
}
function buildRQ(called, calling, pcs) {
  const items = pcs.map(pc => item(0x20, Buffer.concat([Buffer.from([pc.id, 0, 0, 0]), item(0x30, Buffer.from(pc.abs)), ...pc.ts.map(t => item(0x40, Buffer.from(t)))])));
  return pdu(0x01, Buffer.concat([assocHead(called, calling), item(0x10, Buffer.from(APP_CTX)), ...items, userInfo()]));
}
const rejectPdu = (reason) => pdu(0x03, Buffer.from([0, 1, 1, reason]));   // rejected-permanent, service-user
const abortPdu = () => pdu(0x07, Buffer.from([0, 0, 0, 0]));
const releaseRQ = () => pdu(0x05, Buffer.alloc(4));
const releaseRP = () => pdu(0x06, Buffer.alloc(4));

/* ── PDU reader على socket ── */
function reader(sock, onPdu) {
  let bufs = [], have = 0;
  sock.on('data', d => {
    bufs.push(d); have += d.length;
    while (have >= 6) {
      const head = bufs.length === 1 ? bufs[0] : (bufs = [Buffer.concat(bufs)])[0];
      const len = head.readUInt32BE(2);
      if (len > 64 * 1048576) { sock.destroy(); return; }
      if (have < 6 + len) break;
      const type = head[0], body = head.subarray(6, 6 + len), rest = head.subarray(6 + len);
      bufs = rest.length ? [rest] : []; have = rest.length;
      try { onPdu(type, body); } catch (e) { console.error('[dicom] pdu', e.message); try { sock.write(abortPdu()); } catch (_) {} sock.destroy(); return; }
    }
  });
}
function* pdvs(body) { let p = 0; while (p + 6 <= body.length) { const len = body.readUInt32BE(p); yield { pc: body[p + 4], ctl: body[p + 5], data: body.subarray(p + 6, p + 4 + len) }; p += 4 + len; } }

/* ── قراءة الوسوم من الـ dataset (Implicit/Explicit LE) — من غير قاموس ── */
const LONGVR = new Set(['OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'SQ', 'SV', 'UC', 'UN', 'UR', 'UT', 'UV']);
function skipUndef(b, p, explicit) {   // بعد عنصر طوله مش محدد — ندوّر على نهايته
  let depth = 1;
  while (p + 8 <= b.length && depth > 0) {
    const g = b.readUInt16LE(p), e = b.readUInt16LE(p + 2);
    if (g === 0xFFFE) { const l = b.readUInt32LE(p + 4); p += 8; if (e === 0xE0DD) depth--; else if (e === 0xE000 && l !== 0xFFFFFFFF) p += l; continue; }
    let len, vs;
    if (explicit) { const vr = b.toString('latin1', p + 4, p + 6); if (LONGVR.has(vr)) { len = b.readUInt32LE(p + 8); vs = p + 12; } else { len = b.readUInt16LE(p + 6); vs = p + 8; } }
    else { len = b.readUInt32LE(p + 4); vs = p + 8; }
    if (len === 0xFFFFFFFF) { depth++; p = vs; } else p = vs + len;
  }
  return p;
}
const WANT = {
  0x00080005: 'charset', 0x00080016: 'sopClass', 0x00080018: 'sopInst', 0x00080020: 'studyDate', 0x00080030: 'studyTime',
  0x00080050: 'accession', 0x00080060: 'modality', 0x00080080: 'institution', 0x00080090: 'referring', 0x00081030: 'studyDesc',
  0x0008103E: 'seriesDesc', 0x00100010: 'patName', 0x00100020: 'patId', 0x00100030: 'birth', 0x00100040: 'sex', 0x00101010: 'age',
  0x00180015: 'bodyPart', 0x0020000D: 'studyUid', 0x0020000E: 'seriesUid', 0x00200011: 'seriesNo', 0x00200013: 'instNo'
};
function readTags(b, explicit, start) {
  const raw = {}; let p = start || 0;
  while (p + 8 <= b.length) {
    const g = b.readUInt16LE(p), e = b.readUInt16LE(p + 2), tag = ((g << 16) | e) >>> 0;
    if (g > 0x0020 && g !== 0xFFFE) break;
    let len, vs;
    if (explicit) { const vr = b.toString('latin1', p + 4, p + 6); if (LONGVR.has(vr)) { len = b.readUInt32LE(p + 8); vs = p + 12; } else { len = b.readUInt16LE(p + 6); vs = p + 8; } }
    else { len = b.readUInt32LE(p + 4); vs = p + 8; }
    if (len === 0xFFFFFFFF) { p = skipUndef(b, vs, explicit); continue; }
    if (WANT[tag] && vs + len <= b.length) raw[WANT[tag]] = b.subarray(vs, vs + len);
    p = vs + len;
  }
  const cs = raw.charset ? raw.charset.toString('latin1').toUpperCase() : '';
  const enc = /ISO_IR 192/.test(cs) ? 'utf-8' : /ISO_IR 127/.test(cs) ? 'iso-8859-6' : /ISO_IR 100/.test(cs) ? 'latin1' : 'latin1';
  const o = {};
  for (const k of Object.values(WANT)) {
    const v = raw[k]; if (!v) { o[k] = ''; continue; }
    let s; try { s = new TextDecoder(enc).decode(v); } catch (_) { s = v.toString('latin1'); }
    o[k] = s.replace(/\0/g, '').trim();
  }
  o.patName = o.patName.replace(/\^+/g, ' ').replace(/=.*$/, '').replace(/\s+/g, ' ').trim();
  o.referring = o.referring.replace(/\^+/g, ' ').replace(/\s+/g, ' ').trim();
  return o;
}

/* ── Part-10 ── */
function metaHeader(sopClass, sopInst, ts, srcAe) {
  const el = (e, vr, val) => {
    if (vr === 'OB') { const h = Buffer.alloc(12); h.writeUInt16LE(2, 0); h.writeUInt16LE(e, 2); h.write('OB', 4, 'latin1'); h.writeUInt32LE(val.length, 8); return Buffer.concat([h, val]); }
    const h = Buffer.alloc(8); h.writeUInt16LE(2, 0); h.writeUInt16LE(e, 2); h.write(vr, 4, 'latin1'); h.writeUInt16LE(val.length, 6); return Buffer.concat([h, val]);
  };
  const sh = s => { let x = String(s || ''); if (x.length % 2) x += ' '; return Buffer.from(x, 'latin1'); };
  const body = Buffer.concat([
    el(0x0001, 'OB', Buffer.from([0, 1])), el(0x0002, 'UI', uidBuf(sopClass)), el(0x0003, 'UI', uidBuf(sopInst)),
    el(0x0010, 'UI', uidBuf(ts)), el(0x0012, 'UI', uidBuf(IMPL_UID)), el(0x0013, 'SH', sh(IMPL_VER)), ...(srcAe ? [el(0x0016, 'AE', sh(ae(srcAe)))] : [])
  ]);
  const gl = Buffer.alloc(4); gl.writeUInt32LE(body.length);
  return Buffer.concat([Buffer.alloc(128), Buffer.from('DICM'), el(0x0000, 'UL', gl), body]);
}
/* بيرجع { ts, sopClass, sopInst, dataset (Buffer) } من ملف .dcm */
function readPart10(file) {
  const b = fs.readFileSync(file);
  if (b.length < 144 || b.toString('latin1', 128, 132) !== 'DICM') throw new Error('مش ملف DICOM');
  let p = 132; const m = {};
  while (p + 8 <= b.length && b.readUInt16LE(p) === 2) {
    const e = b.readUInt16LE(p + 2), vr = b.toString('latin1', p + 4, p + 6); let len, vs;
    if (LONGVR.has(vr)) { len = b.readUInt32LE(p + 8); vs = p + 12; } else { len = b.readUInt16LE(p + 6); vs = p + 8; }
    if (e === 0x0002) m.sopClass = clean(b.subarray(vs, vs + len)); else if (e === 0x0003) m.sopInst = clean(b.subarray(vs, vs + len)); else if (e === 0x0010) m.ts = clean(b.subarray(vs, vs + len));
    p = vs + len;
  }
  return { ...m, dataset: b.subarray(p) };
}

/* ── Explicit → Implicit (لو الجهاز التاني مش بيقبل Explicit) ── */
function toImplicit(b) {
  const out = []; let p = 0;
  const hdr = (g, e, len) => { const h = Buffer.alloc(8); h.writeUInt16LE(g, 0); h.writeUInt16LE(e, 2); h.writeUInt32LE(len >>> 0, 4); return h; };
  function seq(buf) {   // محتوى SQ: items
    const parts = []; let q = 0;
    while (q + 8 <= buf.length) {
      const g = buf.readUInt16LE(q), e = buf.readUInt16LE(q + 2), l = buf.readUInt32LE(q + 4);
      if (g !== 0xFFFE) break;
      if (e === 0xE000) {
        if (l === 0xFFFFFFFF) { const end = findDelim(buf, q + 8, 0xE00D); parts.push(hdr(0xFFFE, 0xE000, 0xFFFFFFFF), toImplicit(buf.subarray(q + 8, end)), hdr(0xFFFE, 0xE00D, 0)); q = end + 8; }
        else { const conv = toImplicit(buf.subarray(q + 8, q + 8 + l)); parts.push(hdr(0xFFFE, 0xE000, conv.length), conv); q += 8 + l; }
      } else q += 8;
    }
    return Buffer.concat(parts);
  }
  function findDelim(buf, q, de) {   // يلاقي delimiter على نفس المستوى (Explicit)
    while (q + 8 <= buf.length) {
      const g = buf.readUInt16LE(q), e = buf.readUInt16LE(q + 2);
      if (g === 0xFFFE) { if (e === de) return q; const l = buf.readUInt32LE(q + 4); q += 8; if (e === 0xE000 && l !== 0xFFFFFFFF) q += l; continue; }
      const vr = buf.toString('latin1', q + 4, q + 6); let len, vs;
      if (LONGVR.has(vr)) { len = buf.readUInt32LE(q + 8); vs = q + 12; } else { len = buf.readUInt16LE(q + 6); vs = q + 8; }
      if (len === 0xFFFFFFFF) { q = findDelim(buf, vs, 0xE0DD) + 8; } else q = vs + len;
    }
    return buf.length;
  }
  while (p + 8 <= b.length) {
    const g = b.readUInt16LE(p), e = b.readUInt16LE(p + 2), vr = b.toString('latin1', p + 4, p + 6);
    let len, vs;
    if (LONGVR.has(vr)) { len = b.readUInt32LE(p + 8); vs = p + 12; } else { len = b.readUInt16LE(p + 6); vs = p + 8; }
    if (vr === 'SQ') {
      if (len === 0xFFFFFFFF) { const end = findDelim(b, vs, 0xE0DD); const c = seq(b.subarray(vs, end)); out.push(hdr(g, e, 0xFFFFFFFF), c, hdr(0xFFFE, 0xE0DD, 0)); p = end + 8; }
      else { const c = seq(b.subarray(vs, vs + len)); out.push(hdr(g, e, c.length), c); p = vs + len; }
      continue;
    }
    if (len === 0xFFFFFFFF) throw new Error('encapsulated');
    out.push(hdr(g, e, len), b.subarray(vs, vs + len)); p = vs + len;
  }
  return Buffer.concat(out);
}

/* ════════════════ SCP — الاستقبال ════════════════ */
function chooseTs(offered) {
  if (offered.includes(TS_EXPLICIT)) return TS_EXPLICIT;
  if (offered.includes(TS_IMPLICIT)) return TS_IMPLICIT;
  const other = offered.find(t => t !== TS_BIG && !/1\.2\.840\.10008\.1\.2\.1\.99/.test(t)); // deflate مش مدعوم
  return other || null;
}
const QR = /^1\.2\.840\.10008\.5\.1\.4\.(1\.2|31|32|33|34|38)\b/;   // query/retrieve/worklist/MPPS — مش بنقدمها

function createScp(opt) {
  /* opt: { getAe(), allow(callingAe, ip) → true|string, onInstance(info) → Promise, onAssocEnd(summary), log(...) } */
  return net.createServer(sock => {
    sock.setNoDelay(true); sock.setTimeout(120000, () => sock.destroy());
    const ip = String(sock.remoteAddress || '').replace(/^::ffff:/, '');
    let A = null, cmdBufs = {}, dataBufs = {}, dataLen = {}, pending = {}, chain = Promise.resolve();
    const sum = { calling: '', ip, n: 0, bytes: 0, studies: new Set(), fails: 0, started: Date.now() };
    const send = b => { try { sock.write(b); } catch (_) {} };
    function respond(pcId, f) { pdata(pcId, true, buildCmd(f), A.maxLen).forEach(send); }
    reader(sock, (type, body) => {
      if (type === 0x01) {
        const rq = parseAssoc(body); sum.calling = rq.calling;
        const ok = opt.allow(rq.calling, ip, rq.called);
        if (ok !== true) { opt.log && opt.log('in', rq.calling, ip, 'رفض الاتصال: ' + ok); send(rejectPdu(ok === 'called' ? 7 : 3)); return sock.end(); }
        const accepted = rq.pcs.map(pc => {
          if (QR.test(pc.abs)) return { id: pc.id, result: 3 };
          const ts = chooseTs(pc.ts);
          return ts ? { id: pc.id, result: 0, ts, abs: pc.abs } : { id: pc.id, result: 4 };
        });
        A = { ...rq, accepted: Object.fromEntries(accepted.filter(a => !a.result).map(a => [a.id, a])) };
        send(buildAC(rq, accepted));
      } else if (type === 0x04) {
        if (!A) return sock.destroy();
        for (const v of pdvs(body)) {
          const isCmd = v.ctl & 1, last = v.ctl & 2, id = v.pc;
          if (isCmd) {
            (cmdBufs[id] = cmdBufs[id] || []).push(Buffer.from(v.data));
            if (last) {
              const c = parseCmd(Buffer.concat(cmdBufs[id])); cmdBufs[id] = [];
              if (c.cmd === 0x0030) respond(id, { sopClass: VERIFY, cmd: 0x8030, respTo: c.msgId, status: 0 });
              else if (c.cmd === 0x0001) { pending[id] = c; dataBufs[id] = []; dataLen[id] = 0; }
              else if (c.dsType === 0x0101 || c.cmd === 0x0FFF) respond(id, { sopClass: c.sopClass, cmd: c.cmd | 0x8000, respTo: c.msgId, status: 0x0211 });
              else { pending[id] = { ...c, unsupported: true }; dataBufs[id] = []; dataLen[id] = 0; }
            }
          } else {
            const c = pending[id]; if (!c) continue;
            dataLen[id] += v.data.length;
            if (dataLen[id] > MAX_INSTANCE) { send(abortPdu()); return sock.destroy(); }
            dataBufs[id].push(Buffer.from(v.data));
            if (last) {
              const ds = Buffer.concat(dataBufs[id]); dataBufs[id] = []; pending[id] = null;
              if (c.unsupported) { respond(id, { sopClass: c.sopClass, cmd: c.cmd | 0x8000, respTo: c.msgId, status: 0x0211 }); continue; }
              const pc = A.accepted[id];
              chain = chain.then(() => opt.onInstance({ ds, ts: pc.ts, sopClass: c.sopClass || pc.abs, sopInst: c.sopInst, calling: A.calling, ip }))
                .then(r => { sum.n++; sum.bytes += ds.length; if (r && r.studyUid) sum.studies.add(r.studyUid); respond(id, { sopClass: c.sopClass, cmd: 0x8001, respTo: c.msgId, status: 0, sopInst: c.sopInst }); })
                .catch(e => { sum.fails++; console.error('[dicom] store', e.message); respond(id, { sopClass: c.sopClass, cmd: 0x8001, respTo: c.msgId, status: 0xA700, sopInst: c.sopInst }); });
            }
          }
        }
      } else if (type === 0x05) { chain.then(() => { send(releaseRP()); sock.end(); }); }
      else if (type === 0x07) sock.destroy();
    });
    let ended = false;
    const fin = () => { if (ended) return; ended = true; chain.then(() => { if (A && (sum.n || sum.fails)) opt.onAssocEnd && opt.onAssocEnd({ ...sum, studies: [...sum.studies], ms: Date.now() - sum.started }); }); };
    sock.on('close', fin); sock.on('error', () => {});
  });
}

/* ════════════════ SCU — الإرسال ════════════════ */
class Assoc {
  constructor(node, myAe) { this.node = node; this.myAe = myAe; this.q = []; this.waiters = []; }
  open(pcs, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const s = this.sock = net.connect({ host: this.node.host, port: Number(this.node.port) });
      s.setNoDelay(true);
      const t = setTimeout(() => { s.destroy(); reject(new Error('الجهاز مش بيرد (timeout) — اتأكد من الـ IP والبورت')); }, timeout);
      s.on('error', e => { clearTimeout(t); const m = e.code === 'ECONNREFUSED' ? 'الجهاز رفض الاتصال — البورت مقفول أو غلط' : e.code === 'ENOTFOUND' ? 'العنوان ده مش موجود' : e.code === 'EHOSTUNREACH' || e.code === 'ENETUNREACH' ? 'مش واصل للجهاز — هو على نفس الشبكة؟' : e.message; this.fail(new Error(m)); reject(new Error(m)); });
      s.on('close', () => this.fail(new Error('الاتصال اتقفل')));
      s.on('connect', () => s.write(buildRQ(ae(this.node.ae), ae(this.myAe), pcs)));
      let cmdBufs = {};
      reader(s, (type, body) => {
        if (type === 0x02) { clearTimeout(t); const ac = parseAssoc(body); this.maxLen = Math.min(ac.maxLen || 16384, 4 * 1048576); this.pcs = Object.fromEntries(ac.pcs.map(p => [p.id, p])); resolve(this); }
        else if (type === 0x03) { clearTimeout(t); const why = body[3]; reject(new Error(why === 7 ? 'الجهاز رفض الـ AE Title بتاعه (Called AE غلط)' : why === 3 ? 'الجهاز رفض الـ AE Title بتاعنا — ضيفه عنده' : 'الجهاز رفض الاتصال')); s.destroy(); }
        else if (type === 0x04) {
          for (const v of pdvs(body)) if (v.ctl & 1) { (cmdBufs[v.pc] = cmdBufs[v.pc] || []).push(Buffer.from(v.data)); if (v.ctl & 2) { const c = parseCmd(Buffer.concat(cmdBufs[v.pc])); cmdBufs[v.pc] = []; const w = this.waiters.shift(); if (w) w.res(c); } }
        } else if (type === 0x06) { s.end(); }
        else if (type === 0x07) { this.fail(new Error('الجهاز قطع الاتصال (abort)')); s.destroy(); }
      });
    });
  }
  fail(e) { const w = this.waiters; this.waiters = []; w.forEach(x => x.rej(e)); }
  async write(bufs) { for (const b of bufs) if (!this.sock.write(b)) await new Promise(r => this.sock.once('drain', r)); }
  async request(pcId, cmd, data, timeout = 120000) {
    const p = new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('الجهاز اتأخر في الرد')), timeout); this.waiters.push({ res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } }); });
    await this.write(pdata(pcId, true, buildCmd(cmd), this.maxLen));
    if (data) await this.write(pdata(pcId, false, data, this.maxLen));
    return p;
  }
  release() { return new Promise(r => { if (!this.sock || this.sock.destroyed) return r(); const t = setTimeout(() => { this.sock.destroy(); r(); }, 3000); this.sock.once('close', () => { clearTimeout(t); r(); }); this.sock.write(releaseRQ()); }); }
}

async function echo(node, myAe) {
  const t0 = Date.now(), a = new Assoc(node, myAe);
  await a.open([{ id: 1, abs: VERIFY, ts: [TS_IMPLICIT, TS_EXPLICIT] }]);
  if (!a.pcs[1] || a.pcs[1].result !== 0) { await a.release(); throw new Error('الجهاز مش بيدعم C-ECHO'); }
  const r = await a.request(1, { sopClass: VERIFY, cmd: 0x0030, msgId: 1 }, null, 15000);
  await a.release();
  if (r.status !== 0) throw new Error('رد بحالة 0x' + r.status.toString(16));
  return { ms: Date.now() - t0 };
}

/* files: [{ path, sopClass, sopInst, ts }] — بيبعتهم كلهم على اتصال (أو أكتر بالتوازي) */
async function sendFiles(node, myAe, files, onProgress, parallel = 1) {
  const groups = Math.max(1, Math.min(4, parallel | 0, files.length));
  const keyOf = f => f.sopClass + '|' + f.ts;
  const kinds = [...new Set(files.map(keyOf))];
  if (kinds.length > 60) throw new Error('أنواع صور كتير في دراسة واحدة');
  let sent = 0, failed = 0, bytes = 0; const errors = [];
  const lanes = Array.from({ length: groups }, (_, i) => files.filter((_, k) => k % groups === i));
  await Promise.all(lanes.map(async lane => {
    const pcs = []; let id = 1; const map = {};
    for (const k of kinds) {
      const [abs, ts] = k.split('|');
      map[k] = { main: id }; pcs.push({ id, abs, ts: [ts] }); id += 2;
      if (ts === TS_EXPLICIT) { map[k].alt = id; pcs.push({ id, abs, ts: [TS_IMPLICIT] }); id += 2; }
    }
    const a = new Assoc(node, myAe); await a.open(pcs);
    let msg = 1;
    try {
      for (const f of lane) {
        const m = map[keyOf(f)], okMain = a.pcs[m.main] && a.pcs[m.main].result === 0, okAlt = m.alt && a.pcs[m.alt] && a.pcs[m.alt].result === 0;
        if (!okMain && !okAlt) { failed++; errors.push('الجهاز رفض نوع الصورة ' + f.sopClass); onProgress && onProgress({ sent, failed, bytes }); continue; }
        try {
          const r10 = readPart10(f.path); let ds = r10.dataset, pc = m.main;
          if (!okMain) { ds = toImplicit(ds); pc = m.alt; }
          const r = await a.request(pc, { sopClass: f.sopClass, cmd: 0x0001, msgId: msg++ & 0xffff, priority: 0, hasData: true, sopInst: f.sopInst }, ds);
          if (r.status === 0 || (r.status & 0xF000) === 0xB000) { sent++; bytes += ds.length; } else { failed++; errors.push('0x' + r.status.toString(16)); }
        } catch (e) { failed++; errors.push(e.message); if (/اتقفل|abort|timeout|اتأخر/.test(e.message)) throw e; }
        onProgress && onProgress({ sent, failed, bytes });
      }
    } finally { await a.release(); }
  }));
  return { sent, failed, bytes, errors: [...new Set(errors)].slice(0, 5) };
}

module.exports = { createScp, readTags, metaHeader, readPart10, echo, sendFiles, toImplicit, TS_IMPLICIT, TS_EXPLICIT, ae };
