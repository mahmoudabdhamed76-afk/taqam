'use strict';
/* طاقم · صلاحيات المستخدمين — كل مستخدم ليه أقسام معيّنة (المدير العام: الكل) */
const PERMS = {
  team: 'الفريق — الحضور والمهام والخريطة والمحادثة',
  pay: 'المرتبات والسلف والمكافآت',
  clients: 'العملاء والطلبات والمتابعة',
  cases: 'حالات المرضى (QR)',
  pacs: 'الباكس (DICOM)',
  settings: 'الإعدادات والمستخدمين'
};
const KEYS = Object.keys(PERMS);
function list(u) {
  if (!u) return [];
  if (u.role === 'admin' || u.perms == null || u.perms === '') return KEYS.slice();   // القدام من غير صلاحيات = كل حاجة
  return String(u.perms).split(',').filter(k => PERMS[k]);
}
const has = (u, k) => Array.isArray(k) ? k.some(x => list(u).includes(x)) : list(u).includes(k);
/* أي /api/... محتاج أنهي صلاحية (null = مسموح لأي مستخدم داخل) */
const RULES = [
  [/^\/api\/(today|live|emp|attendance|tasks|faults|chat)(\/|$)/, 'team'],
  [/^\/api\/payroll(\/|$)/, 'pay'],
  [/^\/api\/(clients|ledger|followups|follow|requests)(\/|$)/, 'clients'],
  [/^\/api\/portal\/cases(\/|$)/, 'cases'],
  [/^\/api\/pacs(\/|$)/, 'pacs'],
  [/^\/api\/(settings|sites|backup|log)(\/|$)/, 'settings'],
  [/^\/api\/users(\/|$)/, 'settings']
];
function need(p, method) {
  if (method === 'GET' && p === '/api/sites') return null;
  if (method === 'GET' && (p === '/api/clients' || p === '/api/clients/one')) return ['clients', 'cases'];   // صفحة حالات المرضى محتاجة قايمة المراكز
  for (const [rx, k] of RULES) if (rx.test(p)) return k;
  return null;
}
function clean(arr) { return [...new Set((Array.isArray(arr) ? arr : String(arr || '').split(',')).filter(k => PERMS[k]))].join(','); }
module.exports = { PERMS, KEYS, list, has, need, clean };
