/* طاقم · لوحة الإدارة */
(function () {
  'use strict';
  const { esc, $, $$, get, post, n, money, hm, hm24, dm, dmy, ic, av, toast, err, modal, confirm, form, busy } = K;
  const S = { me: null, boot: null, world: 'team', page: 'today', counts: {}, cache: {}, maps: {} };
  const cur = () => (S.boot && S.boot.settings.currency) || 'ج.م';
  const NAV = [
    ['الفريق', [['today', 'لوحة اليوم', 'today'], ['map', 'الخريطة الحيّة', 'map'], ['team', 'الموظفين', 'users'], ['att', 'الحضور والانصراف', 'cal'], ['tasks', 'المهام', 'task'], ['pay', 'المرتبات', 'cash'], ['chat', 'المحادثات', 'chat'], ['faults', 'بنك الأعطال', 'tool']]],
    ['متابعة العملاء', [['clients', 'العملاء والمراكز', 'store'], ['cases', 'حالات المرضى (باركود)', 'qr'], ['requests', 'طلبات العملاء', 'inbox'], ['follow', 'المتابعات', 'phone']]],
    ['الأشعة', [['pacs', 'الباكس (DICOM)', 'scan']]],
    ['النظام', [['settings', 'الإعدادات', 'gear']]]
  ];
  /* الصلاحيات: كل صفحة تبع أنهي قسم */
  const PAGE_PERM = { today: 'team', map: 'team', team: 'team', att: 'team', tasks: 'team', chat: 'team', faults: 'team', pay: 'pay', clients: 'clients', requests: 'clients', follow: 'clients', cases: 'cases', pacs: 'pacs' };
  const PACS_ONLY = ['pacs', 'settings'];
  const has = k => !!(S.me && (S.me.perms || []).includes(k)) && (S.mode !== 'pacs' || k === 'pacs' || k === 'settings');
  const can = p => (S.mode !== 'pacs' || PACS_ONLY.includes(p)) && (!PAGE_PERM[p] || has(PAGE_PERM[p]));
  const firstPage = () => (NAV.flatMap(g => g[1]).find(x => can(x[0])) || ['settings'])[0];
  function applyPerms() {
    for (let i = NAV.length - 1; i >= 0; i--) { NAV[i][1] = NAV[i][1].filter(x => can(x[0])); if (!NAV[i][1].length) NAV.splice(i, 1); }
    ALLP.length = 0; NAV.flatMap(g => g[1]).forEach(x => ALLP.push(x));
    BNAV = [['today', 'الرئيسية', 'home'], ['tasks', 'المهام', 'task'], ['pacs', 'الباكس', 'scan'], ['team', 'الفريق', 'users'], ['clients', 'العملاء', 'store'], ['cases', 'الحالات', 'qr'], ['requests', 'الطلبات', 'inbox'], ['settings', 'الإعدادات', 'gear']].filter(x => can(x[0])).slice(0, 4);
  }
  const ALLP = NAV.flatMap(g => g[1]);
  const titleOf = p => (ALLP.find(x => x[0] === p) || ['', 'طاقم'])[1];
  let BNAV = [['today', 'الرئيسية', 'home'], ['tasks', 'المهام', 'task'], ['team', 'الفريق', 'users'], ['clients', 'العملاء', 'store']];
  const STATE = { in: ['في الشغل', 'go'], on_way: ['في الطريق لمهمة', 'hivis'], visit: ['في زيارة', 'hivis'], out: ['انصرف', ''], absent: ['مجاش', 'stop'], rest: ['أجازة', ''], not_yet: ['لسه ميعاده مجاش', ''] };
  const TASK = { new: ['جديدة', 'sky'], accepted: ['اتقبلت', 'brand'], on_way: ['في الطريق', 'hivis'], arrived: ['وصل', 'go'], done: ['خلصت', ''], cancelled: ['اتلغت', 'stop'] };
  const REQ = { new: ['جديد', 'hivis'], ok: ['اتأكد', 'sky'], sent: ['خلص', 'go'], no: ['اتلغى', 'stop'] };
  const FU = { call: ['مكالمة', 'phone'], whatsapp: ['واتساب', 'wa'], visit: ['زيارة', 'pin'], meeting: ['مقابلة', 'users'], note: ['ملحوظة', 'edit'] };
  const chip = (t, k) => '<span class="chip ' + (k || '') + '">' + esc(t) + '</span>';
  const empById = id => (S.boot.employees || []).find(e => e.id === id);
  const view = () => $('#view');
  const today = () => S.boot.today;
  const addDays = (ds, k) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
  const monthAdd = (m, k) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + k, 1)); return d.toISOString().slice(0, 7); };

  /* ════════ الدخول ════════ */
  async function start() {
    let st; try { st = await get('/api/auth/state'); } catch (e) { st = { setup: false }; }
    if (st.setup) return gate(true, st);
    try { const me = await get('/api/me'); S.me = me.user; S.allPerms = me.all_perms || {}; S.mode = me.mode; S.cloudPacs = me.cloud_pacs; if (S.mode === 'pacs') { delete S.allPerms.team; delete S.allPerms.pay; delete S.allPerms.clients; delete S.allPerms.cases; } } catch (e) { return gate(false, st); }
    applyPerms();
    await loadBoot();
    shell();
    window.addEventListener('hashchange', route);
    route();
    live();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').then(() => { K.pushAuto('/api'); K.seen('/api'); }).catch(() => {});
    setTimeout(() => K.pushPrompt('/api', S.mode === 'pacs' ? 'يوصلك إشعار أول ما حالة أشعة توصل من أي جهاز.' : 'يوصلك حضور وانصراف الموظفين وطلبات العملاء والرسايل — برقم على الأيقونة وحتى والبرنامج مقفول.'), 2500);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { K.seen('/api'); refreshCounts(); ticker(true); } });
  }
  const logoSrc = st => esc((st && st.logo) || '/icons/icon.svg');
  function gate(setup, st) {
    const name = (st && st.company) || 'طاقم';
    const splash = sessionStorage.getItem('tq-splash') ? '' :
      '<div class="splash" id="splash"><div class="aur a1"></div><div class="aur a2"></div><div class="aur a3"></div><div class="grid-bg"></div><div class="sp-in"><div class="sp-word">' +
      (w => w.length > 1 ? '<span>' + esc(w[0]) + '</span> <span class="r">' + esc(w.slice(1).join(' ')) + '</span>' : '<span>' + esc(name) + '</span>')(name.trim().split(/\s+/)) +
      '</div><div class="sp-tag">' + esc(name) + ' · <b>الفريق في الميدان</b> والعملاء على الخط</div><div class="sp-line"></div></div><div class="sp-hint">دوس في أي حتة للدخول</div></div>';
    $('#root').innerHTML = splash + '<div class="gate"><div class="aur a1"></div><div class="aur a2"></div><form class="gate-card" id="gf" autocomplete="on">' +
      '<div class="gate-logo"><img src="' + logoSrc(st) + '" alt=""></div>' +
      (setup ? '<h2>أهلاً بيك</h2><p class="sub">اعمل حساب المدير العام عشان تبدأ</p>' +
        '<div class="gin">' + ic('users', 18) + '<input class="input" name="name" placeholder="اسمك" required></div>' +
        '<div class="gin">' + ic('store', 18) + '<input class="input" name="company" placeholder="اسم الشركة"></div>' +
        '<div class="gin">' + ic('key', 18) + '<input class="input" name="username" dir="ltr" placeholder="اسم الدخول (إنجليزي)" autocomplete="username" required style="text-align:right"></div>' +
        '<div class="gin">' + ic('key', 18) + '<input class="input" type="password" name="password" placeholder="الباسورد (6 حروف على الأقل)" autocomplete="new-password" required minlength="6"><button type="button" class="eye" aria-label="إظهار الباسورد">' + ic('eye', 18) + '</button></div>' +
        '<button class="btn primary">ابدأ</button>'
        : '<h2>' + esc(name) + '</h2><p class="sub">سجّل دخولك إلى لوحة الإدارة</p>' +
        '<div class="gin">' + ic('user', 18) + '<input class="input" name="username" dir="ltr" placeholder="اسم المستخدم" autocomplete="username" required style="text-align:right"></div>' +
        '<div class="gin">' + ic('lock', 18) + '<input class="input" type="password" name="password" placeholder="كلمة المرور" autocomplete="current-password" required><button type="button" class="eye" aria-label="إظهار الباسورد">' + ic('eye', 18) + '</button></div>' +
        '<button class="btn primary">تسجيل الدخول</button>') +
      '<div class="gchips"><span><i style="background:#34D399"></i>مزامنة لحظية</span><span><i style="background:#60A5FA"></i>تتبع بالموقع</span><span><i style="background:#C084FC"></i>آمن ومشفّر</span></div>' +
      '</form><div class="gate-foot">' + esc(name) + ' — الموظفين بيدخلوا من <a href="/app">تطبيق الموظف</a></div></div>';
    const sp = $('#splash');
    const openGate = () => { if (!sp || sp.classList.contains('go')) return; sp.classList.add('go'); sessionStorage.setItem('tq-splash', '1'); setTimeout(() => { sp.remove(); const i = $('#gf input'); if (i) i.focus(); }, 600); };
    if (sp) { sp.onclick = openGate; document.addEventListener('keydown', openGate, { once: true }); setTimeout(openGate, 4200); }
    else setTimeout(() => { const i = $('#gf input'); if (i) i.focus(); }, 80);
    $$('.eye').forEach(b => b.onclick = () => { const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; b.innerHTML = ic(i.type === 'password' ? 'eye' : 'eyeoff', 18); });
    $('#gf').onsubmit = e => { e.preventDefault(); busy(e.submitter, async () => { await post(setup ? '/api/auth/setup' : '/api/auth/login', form($('#gf'))); location.reload(); }); };
  }
  async function loadBoot() { S.boot = await get('/api/boot'); S.counts = S.boot.counts; }

  /* ════════ الهيكل: قايمة جانبية + شريط علوي (زي EmdadX) ════════ */
  const badgeOf = k => can(k) ? ({ requests: S.counts.requests, follow: S.counts.follow, chat: S.counts.chat, tasks: S.counts.tasks, pacs: S.counts.pacs })[k] || 0 : 0;
  function shell() {
    const s = S.boot.settings;
    let rail = false; try { rail = localStorage.getItem('tq-rail') === '1'; } catch (_) {}
    const liveBox = '<div class="livebox" id="live"><div class="live-tag"><span class="dot live"></span>مباشر</div><div class="live-win"><div class="live-track" id="live-track"><span>بيحمّل…</span></div></div></div>';
    $('#root').innerHTML = '<div class="app ' + (rail ? 'rail' : '') + '" id="app">' +
      '<aside class="side"><a class="brand" href="#/' + firstPage() + '"><span class="logo"><img src="' + logoSrc(s) + '" alt=""></span><span class="brand-t"><b>' + esc(s.company) + '</b><span>نظام الإدارة</span></span><button class="rail-btn" data-act="rail" title="تصغير القايمة" aria-label="تصغير القايمة">' + ic('panel', 16) + '</button></a>' +
      '<nav class="nav" id="nav"></nav><div class="side-foot"><button class="out-btn" data-act="logout">' + ic('out', 18) + '<span>تسجيل خروج</span></button></div></aside>' +
      '<div class="main"><header class="top"><button class="ib" data-act="rail" aria-label="القايمة">' + ic('menu', 20) + '</button><button class="ib" data-act="back" aria-label="رجوع" id="backb">' + ic('back', 18) + '</button><h1 class="top-title" id="ttl"></h1><button class="ib" data-act="go" data-p="' + firstPage() + '" aria-label="الرئيسية">' + ic('home', 19) + '</button>' +
      '<button class="top-search" data-act="quick">' + ic('search', 16) + '<span>ابحث… أو اضغط</span><kbd>Ctrl+K</kbd></button>' + liveBox + '<span class="top-sp"></span>' +
      '<button class="ib" data-act="refresh" aria-label="تحديث">' + ic('refresh', 18) + '</button><button class="ib" data-act="theme" aria-label="فاتح / غامق" id="thb">' + ic(K.theme.dark() ? 'sun' : 'moon', 18) + '</button><button class="ib" data-act="bell" aria-label="التنبيهات">' + ic('bell', 19) + '<span class="nd" id="bell-dot" hidden></span></button></header>' +
      '<header class="mhead"><div class="mhead-row"><button class="ib" data-act="more" aria-label="القايمة">' + ic('menu', 20) + '</button><span class="brand-t"><b>' + esc(s.company) + '</b><span>' + esc(S.me.name) + '</span></span><button class="ib" data-act="bell" aria-label="التنبيهات">' + ic('bell', 19) + '<span class="nd" id="bell-dot2" hidden></span></button><button class="ib" data-act="quick" aria-label="بحث">' + ic('search', 19) + '</button><button class="ib" data-act="theme" aria-label="فاتح / غامق">' + ic(K.theme.dark() ? 'sun' : 'moon', 18) + '</button></div>' + liveBox.replace('id="live"', '').replace('id="live-track"', 'id="live-track2"') + '</header>' +
      '<main class="page" id="view"></main></div></div>' +
      '<nav class="bnav gbar" id="bnav"></nav>';
    document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); quick(); } });
  }
  function tabs() {
    const nav = $('#nav'); if (!nav) return;
    nav.innerHTML = NAV.map(([sec, items]) => '<div class="nav-sec">' + sec + '</div>' + items.map(([k, t, i]) => { const b = badgeOf(k); return '<a class="nav-item ' + (k === S.page ? 'on' : '') + '" href="#/' + k + '" title="' + t + '"><span class="ni">' + ic(i, 19) + '</span><span class="lbl">' + t + '</span>' + (b ? '<span class="badge">' + b + '</span><i class="dotb"></i>' : '') + '</a>'; }).join('')).join('');
    const bn = $('#bnav');
    const inMore = !BNAV.some(x => x[0] === S.page);
    const moreN = ['requests', 'follow', 'chat'].reduce((s2, k) => s2 + badgeOf(k), 0);
    bn.innerHTML = BNAV.map(([k, t, i]) => '<button class="bn-item ' + (k === S.page ? 'on' : '') + '" data-act="go" data-p="' + k + '">' + ic(i, 22) + t + (badgeOf(k) ? '<span class="badge">' + badgeOf(k) + '</span>' : '') + '</button>').join('') +
      '<button class="bn-item ' + (inMore ? 'on' : '') + '" data-act="more">' + ic('grid', 22) + 'المزيد' + (moreN ? '<span class="badge">' + moreN + '</span>' : '') + '</button>';
    K.glass(bn);
    $('#ttl').textContent = titleOf(S.page);
    const alerts = badgeOf('requests') + badgeOf('follow') + badgeOf('chat') + badgeOf('pacs');
    ['#bell-dot', '#bell-dot2'].forEach(x => { const d = $(x); if (d) { d.hidden = !alerts; d.parentNode.classList.toggle('ring-bell', !!alerts); } });
  }
  function route() {
    const p = (location.hash.replace(/^#\/?/, '').split('?')[0]) || firstPage();
    S.page = R[p] && can(p) ? p : firstPage();
    closeDrawer(); $$('.scrim').forEach(x => x.remove());
    Object.values(S.maps).forEach(m => { try { m.remove(); } catch (_) {} }); S.maps = {};
    tabs();
    document.title = titleOf(S.page) + ' — ' + S.boot.settings.company;
    view().classList.remove('enter');
    view().innerHTML = '<div class="empty faint">بيحمّل…</div>';
    R[S.page]().then(() => { const v = view(); v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); K.countUp(v); }).catch(e => { if (e.status === 401) location.reload(); else view().innerHTML = '<div class="empty"><b>محصلش</b>' + esc(e.message) + '</div>'; });
    window.scrollTo(0, 0);
    ticker();
  }
  async function refreshCounts() { try { S.counts = await get('/api/counts'); tabs(); } catch (_) {} }
  const go = p => { if (location.hash === '#/' + p) route(); else location.hash = '#/' + p; };

  /* شريط «مباشر»: آخر حالة لكل موظف + أرقام اليوم */
  let tickAt = 0;
  async function ticker(force) {
    if (!force && Date.now() - tickAt < 20000) return; tickAt = Date.now();
    if (!has('team')) { const t = S.counts, items = [has('pacs') ? '<span><i>▾</i>' + (t.pacs || 0) + ' حالة أشعة جديدة</span>' : '', has('clients') ? '<span><i>▾</i>' + (t.requests || 0) + ' طلب جديد</span><span><i>▾</i>' + (t.follow || 0) + ' متابعة</span>' : ''].join('') || '<span>' + esc(S.me.name) + '</span>'; ['#live-track', '#live-track2'].forEach(x => { const el = $(x); if (el) el.innerHTML = items + items; }); return; }
    const d = await get('/api/today').catch(() => null); if (!d) return;
    const STX = { in: 'في الشغل', on_way: 'في الطريق', visit: 'عند عميل', out: 'انصرف', absent: 'مجاش', rest: 'أجازة', not_yet: 'لسه' };
    const items = [['في الشغل', d.board.filter(b => ['in', 'on_way', 'visit'].includes(b.state)).length], ['طلبات جديدة', d.counts.requests || 0], ['متابعات النهارده', d.counts.follow || 0]].map(([t, v]) => '<span><i>▾</i>' + v + ' ' + t + '</span>')
      .concat(d.board.map(b => { const t = b.tasks.find(x => x.status === 'on_way'); return '<span><i>▾</i>' + esc(b.emp.name) + ' — ' + (t ? 'في الطريق لـ ' + esc(t.client_name || t.title) : (STX[b.state] || '')) + '</span>'; }));
    const html = items.concat(items).join('');
    ['#live-track', '#live-track2'].forEach(x => { const el = $(x); if (el) el.innerHTML = html; });
  }

  /* المزيد (موبايل) */
  function moreSheet() {
    const m = modal('<div class="modal-hd"><h3>كل الأقسام</h3><button class="btn ghost icon" data-close aria-label="قفل">' + ic('x') + '</button></div>' +
      NAV.map(([sec, items]) => '<div class="small muted" style="margin:12px 4px 8px;font-weight:700">' + sec + '</div><div class="sheet-grid">' + items.map(([k, t, i]) => '<button class="sheet-tile ' + (k === S.page ? 'on' : '') + '" data-go="' + k + '"><span class="ti">' + ic(i, 22) + '</span>' + t + (badgeOf(k) ? '<span class="badge">' + badgeOf(k) + '</span>' : '') + '</button>').join('') + '</div>').join('') +
      '<button class="out-btn" style="width:100%;margin-top:16px;justify-content:center" data-act="logout">' + ic('out', 18) + '<span>تسجيل خروج</span></button>');
    $$('[data-go]', m.el).forEach(b => b.onclick = () => { m.close(); go(b.dataset.go); });
  }
  /* Ctrl+K: انتقال سريع لأي قسم أو موظف أو عميل */
  async function quick() {
    if ($('#qk')) return;
    const m = modal('<div id="qk"><div class="gin">' + ic('search', 18) + '<input class="input" id="qk-q" placeholder="اكتب اسم قسم أو موظف أو عميل…" autocomplete="off"></div><div class="qk-list" id="qk-l"></div></div>');
    const cl = has('clients') ? await clientsList().catch(() => []) : [];
    const all = ALLP.map(([k, t, i]) => ({ t, i, sub: 'قسم', run: () => go(k) }))
      .concat((has('team') ? S.boot.employees || [] : []).map(e => ({ t: e.name, i: 'users', sub: e.job || 'موظف', run: () => empDay(e.id) })))
      .concat(cl.map(c => ({ t: c.name, i: 'store', sub: c.grp || 'عميل', run: () => clientDrawer(c.id) })));
    let sel = 0, list = [];
    const nq = x => String(x || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
    const draw = () => {
      const q = nq($('#qk-q', m.el).value.trim());
      list = (q ? all.filter(x => nq(x.t + ' ' + x.sub).includes(q)) : all.slice(0, ALLP.length)).slice(0, 30);
      sel = Math.min(sel, Math.max(0, list.length - 1));
      $('#qk-l', m.el).innerHTML = list.map((x, i) => '<button class="qk-it ' + (i === sel ? 'sel' : '') + '" data-i="' + i + '">' + ic(x.i, 17) + esc(x.t) + '<small>' + esc(x.sub) + '</small></button>').join('') || '<div class="empty small">مفيش نتايج</div>';
      $$('[data-i]', m.el).forEach(b => b.onclick = () => { m.close(); list[+b.dataset.i].run(); });
    };
    $('#qk-q', m.el).oninput = () => { sel = 0; draw(); };
    $('#qk-q', m.el).onkeydown = e => { if (e.key === 'ArrowDown') { sel++; draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); } else if (e.key === 'Enter' && list[sel]) { m.close(); list[sel].run(); } };
    draw();
  }
  /* التنبيهات */
  async function bell() {
    if (!has('team')) {
      const it = [has('pacs') && S.counts.pacs ? '<button class="qk-it" data-act="go" data-p="pacs">' + ic('scan', 17) + S.counts.pacs + ' حالة أشعة جديدة<small>الباكس</small></button>' : '', has('clients') && S.counts.requests ? '<button class="qk-it" data-act="go" data-p="requests">' + ic('inbox', 17) + S.counts.requests + ' طلب جديد<small>العملاء</small></button>' : ''].join('');
      const m = modal('<div class="modal-hd"><h3>التنبيهات</h3><button class="btn ghost icon" data-close aria-label="قفل">' + ic('x') + '</button></div><div class="qk-list">' + (it || '<div class="empty"><b>كله تمام</b>مفيش جديد.</div>') + '</div>');
      m.el.addEventListener('click', e => { if (e.target.closest('[data-act]')) m.close(); }); return;
    }
    const d = await get('/api/today').catch(err); if (!d) return;
    const late = d.board.filter(b => b.late_min > 0 && b.att.length), absent = d.board.filter(b => b.state === 'absent');
    const row = (i, cls, t, sub, act) => '<button class="qk-it" ' + act + '><span class="ic" style="width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:var(--' + cls + '-soft);color:var(--' + cls + ')">' + ic(i, 17) + '</span><span style="display:grid;text-align:start"><b>' + t + '</b><small style="margin:0">' + sub + '</small></span></button>';
    const items = [].concat(
      d.requests.filter(r => r.status === 'new').map(r => row(r.kind === 'maint' ? 'tool' : 'box', 'brand', esc(r.client_name), r.kind === 'maint' ? 'طلب صيانة جديد' : 'طلب ورق جديد', 'data-act="go" data-p="requests"')),
      d.follow.map(c => row('phone', 'sky', esc(c.name), c.next_follow < today() ? 'متابعة متأخرة من ' + dm(c.next_follow) : 'متابعة النهارده', 'data-act="client" data-id="' + c.id + '"')),
      S.counts.chat ? [row('chat', 'go', S.counts.chat + ' رسالة جديدة', 'من الموظفين', 'data-act="go" data-p="chat"')] : [],
      late.map(b => row('clock', 'late', esc(b.emp.name), 'اتأخر ' + K.mins(b.late_min), 'data-act="emp" data-id="' + b.emp.id + '"')),
      absent.map(b => row('x', 'stop', esc(b.emp.name), 'مسجّلش حضور النهارده', 'data-act="emp" data-id="' + b.emp.id + '"')));
    const m = modal('<div class="modal-hd"><h3>التنبيهات</h3><button class="btn ghost icon" data-close aria-label="قفل">' + ic('x') + '</button></div><div class="qk-list" style="max-height:65vh">' + (items.join('') || '<div class="empty"><b>كله تمام</b>مفيش حاجة محتاجة انتباهك دلوقتي.</div>') + '</div>');
    m.el.addEventListener('click', e => { if (e.target.closest('[data-act]')) m.close(); });
  }

  /* ── البث المباشر ── */
  let lastSoft = 0, softT = null;
  function live() {
    let es;
    const open = () => {
      es = new EventSource('/api/events');
      const soft = (pages) => { if (!pages || pages.includes(S.page)) { clearTimeout(softT); softT = setTimeout(() => { if (Date.now() - lastSoft > 1500 && !$('.scrim') && !$('.drawer')) { lastSoft = Date.now(); R[S.page](true).catch(() => {}); } }, 600); } refreshCounts(); };
      es.addEventListener('request', () => { toast('طلب جديد من عميل', 'hivis'); soft(['today', 'requests', 'clients']); });
      es.addEventListener('chat', ev => { const d = JSON.parse(ev.data || '{}'); if (S.page === 'chat') R.chat(true, d.emp); else { const e = empById(d.emp); toast('رسالة من ' + (e ? e.name : 'موظف')); refreshCounts(); } });
      es.addEventListener('att', ev => { const d = JSON.parse(ev.data || '{}'), e = empById(d.emp); if (e) toast(e.name + (d.kind === 'out' ? ' سجّل انصراف' : ' سجّل حضور'), d.kind === 'out' ? '' : 'hivis'); soft(['today', 'att', 'map']); ticker(true); });
      es.addEventListener('task', ev => { const d = JSON.parse(ev.data || '{}'); const e = empById(d.emp), nm = e ? e.name : 'الموظف'; if (d.step === 'accepted') toast(nm + ' قبل المهمة'); else if (d.step === 'on_way') toast(nm + ' في الطريق'); else if (d.arrived) toast(nm + ' وصل للعميل ✓', 'hivis'); else if (d.done) toast(nm + ' حلّ المشكلة ✓', 'hivis'); soft(['today', 'tasks', 'map']); ticker(true); });
      es.addEventListener('taskmove', ev => { const d = JSON.parse(ev.data || '{}'); $$('[data-tk="' + d.id + '"]').forEach(el => { const p = d.d0 ? Math.max(0, Math.min(1, 1 - (d.dist || 0) / d.d0)) : 0, pc = 50 + 25 * p; el.style.setProperty('--p', pc + '%'); el.style.setProperty('--to', pc + '%'); if (S.tkPrev[d.id]) S.tkPrev[d.id].pct = pc; const dd = $('.tk-d', el); if (dd) dd.textContent = K.dist(d.dist); }); });
      es.addEventListener('visit', () => soft(['today', 'map']));
      es.addEventListener('pacs', ev => { if (!has('pacs')) return; const d = JSON.parse(ev.data || '{}'); if (d.done) { toast('وصلت حالة أشعة — ' + (d.patient || 'من غير اسم') + ' · ' + d.n + ' صورة', 'hivis'); refreshCounts(); } if (S.page === 'pacs' && PACS.onEvent) PACS.onEvent(d); });
      es.addEventListener('pacsjob', ev => { if (!has('pacs')) return; const j = JSON.parse(ev.data || '{}'); PACS.job(j); });
      es.addEventListener('client', () => soft(['clients', 'follow']));
      es.addEventListener('loc', ev => { const d = JSON.parse(ev.data || '{}'); moveEmp(d); });
      es.onerror = () => {};
    };
    open();
  }
  function moveEmp(d) {
    const e = empById(d.emp); if (!e) return;
    Object.assign(e, { last_lat: d.lat, last_lng: d.lng, last_at: d.at });
    Object.values(S.maps).forEach(m => { if (m._emps && m._emps[d.emp]) m._emps[d.emp].setLatLng([d.lat, d.lng]); });
  }

  /* ── الأفعال ── */
  const ACT = {
    go: b => go(can(b.dataset.p) ? b.dataset.p : firstPage()),
    rail: () => { if (innerWidth <= 900) return moreSheet(); const a = $('#app'); a.classList.toggle('rail'); try { localStorage.setItem('tq-rail', a.classList.contains('rail') ? '1' : '0'); } catch (_) {} Object.values(S.maps).forEach(m => setTimeout(() => m.invalidateSize(), 300)); },
    back: () => { if (history.length > 1) history.back(); else go('today'); },
    more: () => moreSheet(),
    quick: () => quick(),
    bell: () => bell(),
    theme: () => { K.theme.set(K.theme.dark() ? 'light' : 'dark'); $$('[data-act=theme]').forEach(x => { x.innerHTML = ic(K.theme.dark() ? 'sun' : 'moon', 18); }); if (Object.keys(S.maps).length) route(); },
    logout: async () => { if (await confirm('تسجيل خروج؟', '', 'خروج')) { await post('/api/auth/logout'); location.reload(); } },
    emp: b => empDay(b.dataset.id),
    client: b => clientDrawer(b.dataset.id),
    newTask: b => taskForm({ emp_id: b.dataset.emp || '', client_id: b.dataset.client || '' }),
    copy: b => { navigator.clipboard.writeText(b.dataset.text).then(() => toast('اتنسخ'), () => toast('انسخه يدوي', 'err')); },
    photo: b => modal('<img src="' + esc(b.dataset.src) + '" style="width:100%;border-radius:14px">'),
    refresh: b => { b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin'); tickAt = 0; route(); }
  };
  document.addEventListener('click', e => { const a = e.target.closest('[data-act]'); if (a && ACT[a.dataset.act]) { e.preventDefault(); ACT[a.dataset.act](a, e); } });

  /* ════════ الصفحات ════════ */
  const R = {};


  /* ════ متابعة المهمة لحظة بلحظة: اتبعتت ← قبلها ← في الطريق ← وصل ← اتحلّت ════ */
  const STEPS = [['new', 'اتبعتت', 'send'], ['accepted', 'قبلها', 'check'], ['on_way', 'في الطريق', 'route'], ['arrived', 'وصل', 'pin'], ['done', 'اتحلّت', 'star']];
  const stepIdx = st => Math.max(0, STEPS.findIndex(x => x[0] === st));
  S.tkPrev = S.tkPrev || {};
  function tkPct(t) {
    const i = stepIdx(t.status);
    if (t.status === 'on_way') { const p = t.d0 ? Math.max(0, Math.min(1, 1 - (t.dist || 0) / t.d0)) : 0; return 50 + 25 * p; }
    return i * 25;
  }
  function tracker(t) {
    const i = stepIdx(t.status), pct = tkPct(t), prev = S.tkPrev[t.id], burst = prev && prev.step !== t.status && ['arrived', 'done', 'accepted'].includes(t.status) ? ' burst' : '';
    const times = { new: t.created_at, accepted: t.accepted_at, on_way: t.started_at, arrived: t.arrived_at, done: t.done_at };
    const from = prev ? prev.pct : pct;
    S.tkPrev[t.id] = { step: t.status, pct };
    const e = t.emp || empById(t.emp_id) || { name: '؟' };
    return '<div class="trk ' + t.status + burst + '" data-tk="' + t.id + '" style="--p:' + from + '%;--to:' + pct + '%">' +
      '<div class="trk-hd">' + av(e, 'sm') + '<div class="grow" style="min-width:0"><b>' + esc(e.name) + '</b> <span class="muted small">' + esc(t.title) + '</span><div class="xs muted">' + (t.client_name ? ic('pin', 12) + ' ' + esc(t.client_name) : '') + (t.self ? ' · <span style="color:var(--hivis)">سجّلها بنفسه</span>' : '') + '</div></div>' +
      '<span class="trk-st">' + (t.status === 'on_way' ? '<span class="dot live"></span>فاضل <b class="tk-d">' + K.dist(t.dist) + '</b>' : t.status === 'done' ? ic('check', 14) + 'اتحلّت المشكلة' : STEPS[i][1]) + '</span></div>' +
      '<div class="trk-line"><div class="trk-rail"></div><div class="trk-fill"></div>' +
      STEPS.map(([k, lbl, icn], j) => '<div class="trk-node ' + (j < i ? 'done' : j === i ? 'cur' : '') + '" style="inset-inline-start:' + (j * 25) + '%"><span class="trk-dot">' + ic(j < i || (j === i && k === 'done') ? 'check' : icn, 13) + '</span><span class="trk-lbl">' + lbl + (times[k] && j <= i ? '<i>' + hm(times[k]) + '</i>' : '') + '</span></div>').join('') +
      (t.status === 'on_way' ? '<div class="trk-car">' + ic('route', 15) + '</div>' : '') +
      '</div></div>';
  }
  function animTrackers(root) {
    requestAnimationFrame(() => requestAnimationFrame(() => $$('.trk', root).forEach(el => el.style.setProperty('--p', el.style.getPropertyValue('--to')))));
  }
  function liveTasksCard(list) {
    const act = list.filter(t => t.status !== 'done'), done = list.filter(t => t.status === 'done');
    return '<div class="card pad tk-live" id="tk-live"><div class="row" style="margin-bottom:6px"><h3 class="grow">المهام دلوقتي</h3>' + (act.length ? '<span class="chip brand"><span class="dot live"></span>' + act.length + ' شغالة</span>' : '') + '<button class="btn sm primary" data-act="newTask">' + ic('plus', 15) + 'مهمة</button></div>' +
      (list.length ? '<div class="trk-list">' + act.concat(done.slice(0, 4)).map(tracker).join('') + '</div>' : '<div class="empty small" style="padding:18px">مفيش مهام النهارده — ابعت موظف لعميل وتابعه هنا خطوة بخطوة.</div>') + '</div>';
  }

  /* ── اليوم ── */
  R.today = async function () {
    const d = await get('/api/today'); S.counts = d.counts; tabs();
    const B = d.board;
    const cnt = k => B.filter(b => k.includes(b.state)).length;
    const late = B.filter(b => b.late_min > 0 && b.att.length).length;
    view().innerHTML =
      '<div class="ph"><div><h1>' + K.dayName(d.date) + '، ' + dm(d.date) + '</h1><div class="sub">' + B.length + ' موظف في الخدمة — آخر تحديث ' + hm(d.now) + '</div></div>' +
      '<div class="acts"><button class="btn" data-act="refresh">' + ic('refresh', 16) + 'تحديث</button><button class="btn primary" data-act="newTask">' + ic('plus', 16) + 'مهمة جديدة</button></div></div>' +
      '<div class="tally draw"><div class="go"><span class="ic">' + ic('users', 18) + '</span><b data-count="' + cnt(['in', 'on_way', 'visit']) + '">' + cnt(['in', 'on_way', 'visit']) + '</b><span>في الشغل دلوقتي</span></div><div><span class="ic">' + ic('route', 18) + '</span><b data-count="' + cnt(['on_way', 'visit']) + '">' + cnt(['on_way', 'visit']) + '</b><span>في الطريق أو عند عميل</span></div><div class="late"><span class="ic">' + ic('clock', 18) + '</span><b data-count="' + late + '">' + late + '</b><span>اتأخروا النهارده</span></div><div class="stop"><span class="ic">' + ic('x', 18) + '</span><b data-count="' + cnt(['absent']) + '">' + cnt(['absent']) + '</b><span>مجوش</span></div><div class="hv rp" data-act="go" data-p="requests"><span class="ic">' + ic('inbox', 18) + '</span><b data-count="' + (d.counts.requests || 0) + '">' + (d.counts.requests || 0) + '</b><span>طلبات عملاء جديدة</span></div></div>' +
      liveTasksCard(d.live_tasks || []) +
      '<div class="cols"><div class="stack">' + timeline(B, d) + '<div class="card" style="padding:0;overflow:hidden"><div class="blk-hd"><h3>فين الفريق دلوقتي</h3><button class="btn sm ghost" data-act="go" data-p="map">' + ic('map', 15) + 'الخريطة كاملة</button></div><div class="map" id="m-today" style="border:0;border-radius:0;height:340px"></div></div></div>' +
      '<div class="stack">' + reqList(d.requests) + followList(d.follow) + '</div></div>';
    animTrackers(view());
    liveMap('m-today', await get('/api/live'));
  };
  function timeline(B, d) {
    if (!B.length) return '<div class="card day"><div class="empty"><b>مفيش موظفين لسه</b>ضيف أول موظف من «الموظفين» وابعتله اللينك.<br><br><button class="btn primary" data-act="go" data-p="team">' + ic('plus', 16) + 'ضيف موظف</button></div></div>';
    const mins = []; const mm = ts => K.hm24(ts) ? (+ts.slice(11, 13)) * 60 + (+ts.slice(14, 16)) : null;
    const toM = s => { const p = /^(\d{1,2}):(\d{2})/.exec(s || ''); return p ? (+p[1]) * 60 + (+p[2]) : null; };
    B.forEach(b => { mins.push(toM(b.shift.start), toM(b.shift.end)); b.att.forEach(a => { mins.push(mm(a.in_at)); if (a.out_at) mins.push(mm(a.out_at)); }); });
    const nowM = d.date === today() ? mm(d.now) : null; if (nowM != null) mins.push(nowM);
    const ok = mins.filter(x => x != null);
    const s0 = Math.max(0, Math.min(8 * 60, Math.floor((Math.min(...ok) - 30) / 60) * 60)), s1 = Math.min(24 * 60, Math.max(18 * 60, Math.ceil((Math.max(...ok) + 30) / 60) * 60));
    const pct = m => Math.max(0, Math.min(100, (m - s0) / (s1 - s0) * 100));
    const hours = []; for (let h = s0 / 60; h <= s1 / 60; h++) hours.push(h);
    const step = (s1 - s0) / 60 > 12 ? 2 : 1;
    const grid = '<div class="tl-grid">' + hours.map(h => '<i style="inset-inline-start:' + pct(h * 60) + '%"></i>').join('') + '</div>';
    const rows = B.map(b => {
      const st = STATE[b.state] || ['', ''];
      let tr = grid;
      const ss = toM(b.shift.start), se = toM(b.shift.end);
      if (ss != null && se != null && b.state !== 'rest') tr += '<div class="tl-shift" style="inset-inline-start:' + pct(ss) + '%;width:' + (pct(se) - pct(ss)) + '%"></div>';
      b.att.forEach((a, i) => {
        const a0 = mm(a.in_at), a1 = a.out_at ? mm(a.out_at) : (nowM != null ? nowM : a0);
        if (i === 0 && a.late_min && ss != null) { const g1 = Math.min(a0, se != null ? se : a0); if (g1 > ss) tr += '<div class="tl-late" style="inset-inline-start:' + pct(ss) + '%;width:' + (pct(g1) - pct(ss)) + '%" title="' + esc('اتأخر ' + K.mins(a.late_min)) + '"></div>'; }
        tr += '<div class="tl-bar ' + (a.out_at ? '' : 'open') + '" style="inset-inline-start:' + pct(a0) + '%;width:' + Math.max(1.2, pct(a1) - pct(a0)) + '%" title="' + esc('حضر ' + hm(a.in_at) + (a.out_at ? ' — انصرف ' + hm(a.out_at) : ' — لسه في الشغل')) + '">' + (a.out_at ? '' : '<i class="tl-live"></i>') + '</div>';
      });
      b.visits.forEach(v => { const v0 = mm(v.start_at), v1 = v.end_at ? mm(v.end_at) : (nowM != null ? nowM : v0 + 10); tr += '<div class="tl-visit" style="inset-inline-start:' + pct(v0) + '%;width:' + Math.max(1, pct(v1) - pct(v0)) + '%" title="' + esc(v.client_name + ' — ' + (v.purpose || '')) + '"></div>'; });
      if (!b.att.length) tr += '<div class="tl-note">' + (b.state === 'rest' ? 'أجازة' : b.state === 'not_yet' ? 'ميعاده ' + hm('x ' + b.shift.start) : 'مسجّلش حضور') + '</div>';
      if (nowM != null) tr += '<div class="tl-now" style="inset-inline-start:' + pct(nowM) + '%"></div>';
      const sub = b.att.length ? 'من ' + hm(b.att[0].in_at) + (b.late_min ? ' · <span style="color:var(--late)">متأخر ' + K.mins(b.late_min) + '</span>' : '') : '';
      const task = b.tasks.find(t => t.status === 'on_way');
      return '<div class="tl-row" data-act="emp" data-id="' + b.emp.id + '"><div class="tl-who">' + av(b.emp) + '<div><b>' + esc(b.emp.name) + '</b><small><span class="dot ' + (['in', 'on_way', 'visit'].includes(b.state) ? 'live' : '') + ' state-' + b.state + '"></span>' + st[0] + (task ? ' ← ' + esc(task.client_name || task.title) : sub ? ' · ' + sub : '') + '</small></div></div><div class="tl-track">' + tr + '</div></div>';
    }).join('');
    const scale = '<div class="tl-scale"><div class="lbl">الساعة</div><div class="tl-track tl-hours" style="height:28px">' + hours.filter(h => (h - s0 / 60) % step === 0).map(h => '<span style="inset-inline-start:' + pct(h * 60) + '%">' + ((h % 12) || 12) + (h < 12 ? 'ص' : 'م') + '</span>').join('') + (nowM != null ? '<div class="tl-now" data-t="' + hm24(d.now) + '" style="inset-inline-start:' + pct(nowM) + '%;background:transparent"></div>' : '') + '</div></div>';
    return '<div class="card day"><div class="day-hd"><h2>شريط اليوم</h2><div class="legend"><span><i style="background:var(--brand)"></i>حضور</span><span><i style="background:var(--hivis)"></i>زيارة عميل</span><span><i class="lg-late"></i>تأخير</span><span><i style="border:1px dashed var(--line-2)"></i>الوردية</span></div></div><div class="tl">' + scale + rows + '</div></div>';
  }
  function reqList(list) {
    return '<div class="card list" style="padding-bottom:4px"><div class="blk-hd"><h3>طلبات العملاء</h3><button class="btn sm ghost" data-act="go" data-p="requests">الكل</button></div>' +
      (list.length ? list.map(r => '<div class="it" data-act="go" data-p="requests"><span class="ic ' + r.kind + '">' + ic(r.kind === 'maint' ? 'tool' : 'box', 17) + '</span><div class="grow"><b>' + esc(r.client_name || '') + '</b><div class="meta">' + (r.kind === 'maint' ? 'صيانة: ' + esc(r.device || '') : esc(r.items.map(i => i.name + ' × ' + n(i.qty)).join('، '))) + '</div></div>' + chip(REQ[r.status][0], REQ[r.status][1]) + '</div>').join('')
        : '<div class="empty small" style="padding:18px">مفيش طلبات مفتوحة.</div>') + '</div>';
  }
  function followList(list) {
    return '<div class="card list" style="padding-bottom:4px"><div class="blk-hd"><h3>متابعات مستحقة</h3><button class="btn sm ghost" data-act="go" data-p="follow">الكل</button></div>' +
      (list.length ? list.map(c => '<div class="it" data-act="client" data-id="' + c.id + '"><span class="ic">' + ic('phone', 16) + '</span><div class="grow"><b>' + esc(c.name) + '</b><div class="meta">' + (c.next_follow < today() ? '<span style="color:var(--stop)">متأخرة من ' + dm(c.next_follow) + '</span>' : 'النهارده') + (c.grp ? ' · ' + esc(c.grp) : '') + '</div></div></div>').join('')
        : '<div class="empty small" style="padding:18px">مفيش متابعات مستحقة النهارده.</div>') + '</div>';
  }
  function liveMap(id, L0, opts) {
    const el = document.getElementById(id); if (!el || !window.L) return;
    const m = L.map(el, { zoomControl: true, attributionControl: true }); K.tiles(m); S.maps[id] = m; m._emps = {};
    const pts = [];
    (L0.sites || []).forEach(s => { if (s.lat != null) { L.circle([s.lat, s.lng], { radius: s.radius, color: '#FF3B47', weight: 1, fillOpacity: .06, dashArray: '4 4' }).addTo(m).bindTooltip(esc(s.name)); pts.push([s.lat, s.lng]); } });
    (L0.clients || []).forEach(c => { L.marker([c.lat, c.lng], { icon: K.clientPin() }).addTo(m).bindTooltip(esc(c.name)).on('click', () => clientDrawer(c.id)); if (opts && opts.allClients) pts.push([c.lat, c.lng]); });
    const tasks = L0.tasks || [];
    (L0.emps || []).forEach(e => {
      const t = tasks.find(x => x.emp_id === e.id);
      const mk = L.marker([e.last_lat, e.last_lng], { icon: K.empPin(e, !!t, K.ago(e.last_at, S.boot.now || L0.now)), zIndexOffset: 1000 }).addTo(m)
        .bindTooltip('<b>' + esc(e.name) + '</b><br>' + K.ago(e.last_at, S.boot.now || L0.now) + (t ? '<br>في الطريق: ' + esc(t.client_name || t.title) + ' (' + K.dist(t.dist) + ')' : ''), { direction: 'top' })
        .on('click', () => empDay(e.id));
      m._emps[e.id] = mk; pts.push([e.last_lat, e.last_lng]);
    });
    if (pts.length > 1) m.fitBounds(pts, { padding: [40, 40], maxZoom: 15 }); else if (pts.length) m.setView(pts[0], 14); else m.setView([30.05, 31.24], 10);
    setTimeout(() => m.invalidateSize(), 80);
    return m;
  }

  /* ── الخريطة ── */
  R.map = async function () {
    const d = await get('/api/live');
    view().innerHTML = '<div class="ph"><div><h1>الخريطة</h1><div class="sub">آخر مكان لكل موظف، وأماكن العملاء ومقرات الشغل — بتتحرك لوحدها.</div></div><div class="acts"><button class="btn" data-act="refresh">' + ic('refresh', 16) + 'تحديث</button></div></div>' +
      '<div class="row wrap" style="margin-bottom:12px">' + (d.emps.length ? d.emps.map(e => '<button class="chip" style="height:34px;cursor:pointer;border:0" data-act="empfocus" data-id="' + e.id + '">' + esc(e.name) + ' · ' + K.ago(e.last_at, d.now) + '</button>').join('') : '<span class="muted">لسه مفيش مواقع — المواقع بتظهر لما الموظف يسجّل حضور من التطبيق.</span>') + '</div>' +
      '<div class="map tall" id="m-full"></div>';
    liveMap('m-full', d, { allClients: true });
  };
  ACT.empfocus = b => { const m = S.maps['m-full'], mk = m && m._emps[b.dataset.id]; if (mk) { m.setView(mk.getLatLng(), 16); mk.openTooltip(); } };

  /* ── يوم موظف (لوحة جانبية) ── */
  async function empDay(id, date) {
    const d = await get('/api/emp/day?id=' + encodeURIComponent(id) + (date ? '&date=' + date : '')).catch(err); if (!d) return;
    const e = d.emp, a = d.att[0], last = d.att[d.att.length - 1];
    const worked = d.att.reduce((s, x) => { const t0 = Date.parse(x.in_at.replace(' ', 'T')), t1 = x.out_at ? Date.parse(x.out_at.replace(' ', 'T')) : (d.date === today() ? Date.parse(S.boot.now.replace(' ', 'T')) : t0); return s + (t1 - t0) / 60000; }, 0);
    const dr = drawer('<div class="row" style="gap:12px;flex:1;min-width:0">' + av(e, 'lg') + '<div style="min-width:0"><h2>' + esc(e.name) + '</h2><div class="muted small">' + esc(e.job || '') + (e.phone ? ' · ' + esc(e.phone) : '') + '</div></div></div>',
      '<div class="row wrap"><input type="date" class="input" style="max-width:190px" id="ed-date" value="' + d.date + '"><span class="grow"></span>' +
      (e.phone ? '<a class="btn sm" href="tel:' + esc(e.phone) + '">' + ic('phone', 15) + 'اتصال</a><a class="btn sm" target="_blank" rel="noopener" href="' + K.wa(e.phone) + '">' + ic('wa', 15) + 'واتساب</a>' : '') +
      '<button class="btn sm" data-act="newTask" data-emp="' + e.id + '">' + ic('plus', 15) + 'مهمة</button><button class="btn sm" id="ed-edit">' + ic('edit', 15) + 'تعديل</button></div>' +
      '<div class="kv"><div><span>حضور</span><b>' + (a ? hm(a.in_at) : '—') + '</b></div><div><span>انصراف</span><b>' + (last && last.out_at ? hm(last.out_at) : a ? 'لسه' : '—') + '</b></div><div><span>تأخير</span><b style="color:' + (a && a.late_min ? 'var(--late)' : 'inherit') + '">' + (a ? K.mins(a.late_min) : '—') + '</b></div><div><span>وقت الشغل</span><b>' + (worked ? K.mins(worked) : '—') + '</b></div><div><span>زيارات</span><b>' + d.visits.length + '</b></div></div>' +
      '<div class="map" id="m-emp" style="height:330px"></div>' +
      (a && a.in_site ? '<p class="small muted">' + ic('pin', 14) + ' سجّل حضوره على بعد ' + K.dist(a.in_dist) + ' من ' + esc(a.in_site) + '</p>' : '') +
      '<div class="card pad"><h4 style="margin-bottom:6px">الزيارات والمهام</h4><div class="feed">' +
      (d.visits.map(v => '<div class="fd"><span class="ic visit">' + ic('pin', 16) + '</span><div><b>' + esc(v.client_name || '') + '</b> <span class="muted small">' + esc(v.purpose || '') + '</span><div class="small muted">' + hm(v.start_at) + (v.end_at ? ' ← ' + hm(v.end_at) : ' — لسه هناك') + (v.dist != null ? ' · على بعد ' + K.dist(v.dist) + ' من مكان العميل' : '') + '</div>' + (v.note ? '<div class="small">' + esc(v.note) + '</div>' : '') + (v.handed_to ? '<div class="small muted">استلم: ' + esc(v.handed_to) + '</div>' : '') + '</div></div>').join('') +
        d.tasks.map(t => '<div class="fd"><span class="ic">' + ic('task', 16) + '</span><div><b>' + esc(t.title) + '</b> ' + chip(TASK[t.status][0], TASK[t.status][1]) + '<div class="small muted">' + esc(t.client_name || '') + (t.arrived_at ? ' · وصل ' + hm(t.arrived_at) : '') + (t.done_at ? ' · خلص ' + hm(t.done_at) : '') + '</div>' + (t.done_note ? '<div class="small">' + esc(t.done_note) + '</div>' : '') + (t.photo_id ? '<img class="thumb" style="margin-top:6px" data-act="photo" data-src="/api/photo/' + t.photo_id + '" src="/api/photo/' + t.photo_id + '" alt="">' : '') + '</div></div>').join('') ||
        '<div class="muted small">مفيش زيارات أو مهام في اليوم ده.</div>') + '</div></div>');
    $('#ed-date', dr).onchange = ev => { closeDrawer(); empDay(id, ev.target.value); };
    $('#ed-edit', dr).onclick = () => { closeDrawer(); empForm(empById(id)); };
    const el = $('#m-emp', dr);
    const m = L.map(el); K.tiles(m); S.maps['m-emp'] = m;
    const pts = d.path.map(p => [p.lat, p.lng]);
    if (pts.length) {
      L.polyline(pts, { color: '#FF3B47', weight: 4, opacity: .85 }).addTo(m);
      d.path.forEach(p => { if (p.kind !== 'ping') L.circleMarker([p.lat, p.lng], { radius: 6, color: '#fff', weight: 2, fillColor: p.kind === 'in' ? '#0F9D63' : p.kind === 'out' ? '#C8312F' : '#FFC21A', fillOpacity: 1 }).addTo(m).bindTooltip(hm(p.at) + ' · ' + ({ in: 'حضور', out: 'انصراف', visit: 'بداية زيارة', visit_end: 'نهاية زيارة', task: 'مهمة', arrive: 'وصل', task_done: 'خلّص مهمة' }[p.kind] || '')); });
      L.marker(pts[pts.length - 1], { icon: K.empPin(e, d.date === today() && d.att.some(x => !x.out_at)) }).addTo(m);
      m.fitBounds(pts, { padding: [30, 30], maxZoom: 16 });
    } else { m.setView([30.05, 31.24], 10); L.popup({ closeButton: false }).setLatLng([30.05, 31.24]).setContent('مفيش مواقع في اليوم ده').openOn(m); }
    setTimeout(() => m.invalidateSize(), 120);
  }

  /* ── لوحة جانبية ── */
  function drawer(head, body) {
    closeDrawer();
    const s = document.createElement('div'); s.className = 'drawer-scrim'; s.onclick = closeDrawer;
    const d = document.createElement('aside'); d.className = 'drawer'; d.setAttribute('role', 'dialog');
    d.innerHTML = '<div class="drawer-hd">' + head + '<button class="btn ghost icon" data-close aria-label="قفل">' + ic('x') + '</button></div><div class="drawer-bd">' + body + '</div>';
    d.querySelector('[data-close]').onclick = closeDrawer;
    document.body.append(s, d);
    document.addEventListener('keydown', escDrawer);
    return d;
  }
  function escDrawer(e) { if (e.key === 'Escape' && !$('.scrim')) closeDrawer(); }
  function closeDrawer() { $$('.drawer,.drawer-scrim').forEach(x => x.remove()); document.removeEventListener('keydown', escDrawer); ['m-emp', 'm-cl'].forEach(k => { if (S.maps[k]) { S.maps[k].remove(); delete S.maps[k]; } }); }

  /* ── الموظفين ── */
  R.team = async function () {
    await loadBoot(); tabs();
    const d = await get('/api/today'); const st = new Map(d.board.map(b => [b.emp.id, b]));
    const E = S.boot.employees;
    view().innerHTML = '<div class="ph"><div><h1>الموظفين</h1><div class="sub">' + E.filter(e => e.active).length + ' شغالين' + (E.some(e => !e.active) ? ' · ' + E.filter(e => !e.active).length + ' موقوفين' : '') + '. كل موظف بيدخل من تطبيق الموظف باسم دخول وباسورد خاصين بيه.</div></div><div class="acts"><button class="btn" data-act="copy" data-text="' + esc(location.origin + '/app') + '">' + ic('link', 16) + 'نسخ لينك التطبيق</button><button class="btn primary" id="add-emp">' + ic('plus', 16) + 'موظف جديد</button></div></div>' +
      (E.length ? '<div class="team">' + E.map(e => {
        const b = st.get(e.id), s = b ? STATE[b.state] : ['موقوف', ''];
        return '<div class="card emp ' + (e.active ? '' : 'off') + '" data-act="emp" data-id="' + e.id + '"><div class="emp-top">' + av(e, 'lg') + '<div class="grow"><h4>' + esc(e.name) + '</h4><div class="muted small">' + esc(e.job || 'موظف') + '</div></div></div>' +
          '<div class="emp-kv">' + chip(s[0], s[1]) + chip(((e.shift_start || S.boot.settings.shift_start) + ' – ' + (e.shift_end || S.boot.settings.shift_end)).replace(/(\d{2}):(\d{2})/g, (m, h, mi) => ((+h % 12) || 12) + ':' + mi)) + (e.last_at ? chip('آخر موقع ' + K.ago(e.last_at, S.boot.now)) : '') + '</div>' +
          '<div class="row" style="gap:6px"><button class="btn sm" data-act="empedit" data-id="' + e.id + '">' + ic('edit', 14) + 'تعديل</button><button class="btn sm" data-act="empreset" data-id="' + e.id + '">' + ic('key', 14) + 'باسورد جديد</button><span class="grow"></span><span class="faint xs" dir="ltr">@' + esc(e.username) + '</span></div></div>';
      }).join('') + '</div>' : '<div class="card empty"><b>ابدأ بأول موظف</b>هتاخد اسم دخول وباسورد تبعتهم له على الواتساب، ويسجّل حضوره من موبايله.<br><br><button class="btn primary" id="add-emp2">' + ic('plus', 16) + 'موظف جديد</button></div>');
    const a = $('#add-emp'); a.onclick = () => empForm(); const a2 = $('#add-emp2'); if (a2) a2.onclick = () => empForm();
  };
  ACT.empedit = (b, e) => { e.stopPropagation(); empForm(empById(b.dataset.id)); };
  ACT.empreset = async (b, e) => {
    e.stopPropagation(); const emp = empById(b.dataset.id);
    if (!await confirm('باسورد جديد لـ ' + emp.name + '؟', 'الباسورد القديم هيبطل وهيخرج من التطبيق.', 'اعمل باسورد جديد')) return;
    const r = await post('/api/emp/reset', { id: emp.id }).catch(err); if (r) credentials(emp, r.username, r.password);
  };
  function dayPick(name, val) {
    const set = new Set(String(val || '').split(',').filter(Boolean));
    return '<div class="daypick" data-days="' + name + '">' + K.DAYS.map((d, i) => '<label><input type="checkbox" value="' + i + '" ' + (set.has(String(i)) ? 'checked' : '') + '><span>' + d + '</span></label>').join('') + '</div>';
  }
  const readDays = el => $$('input:checked', el).map(i => i.value).join(',');
  function empForm(e) {
    e = e || {};
    const s = S.boot.settings;
    const m = modal('<div class="modal-hd"><h3>' + (e.id ? 'تعديل ' + esc(e.name) : 'موظف جديد') + '</h3><button class="btn ghost icon" data-close aria-label="قفل">' + ic('x') + '</button></div><form id="ef" style="display:grid;gap:12px">' +
      '<div class="row">' + '<span id="ef-av">' + av(e.name ? e : { name: '+', hue: 222 }, 'lg') + '</span><div class="grid2 grow"><label class="field"><span>الاسم</span><input class="input" name="name" value="' + esc(e.name || '') + '" required></label><label class="field"><span>الوظيفة</span><input class="input" name="job" value="' + esc(e.job || '') + '" placeholder="مهندس صيانة"></label></div></div>' +
      '<div class="row"><button type="button" class="btn sm" id="ef-ph">' + ic('camera', 15) + 'صورة الموظف</button>' + (e.photo ? '<button type="button" class="btn sm ghost danger" id="ef-noph">شيل الصورة</button>' : '') + '</div>' +
      '<div class="grid2"><label class="field"><span>الموبايل</span><input class="input" name="phone" inputmode="tel" dir="ltr" value="' + esc(e.phone || '') + '"></label>' + (e.id ? '<label class="field"><span>اسم الدخول</span><input class="input" value="' + esc(e.username) + '" dir="ltr" disabled></label>' : '<label class="field"><span>اسم الدخول (اختياري)</span><input class="input" name="username" dir="ltr" placeholder="يتعمل لوحده"></label>') + '</div>' +
      '<div class="grid3"><label class="field"><span>بداية الوردية</span><input class="input" type="time" name="shift_start" value="' + esc(e.shift_start || s.shift_start) + '"></label><label class="field"><span>نهاية الوردية</span><input class="input" type="time" name="shift_end" value="' + esc(e.shift_end || s.shift_end) + '"></label><label class="field"><span>المرتب الشهري</span><input class="input" type="number" min="0" name="salary" value="' + (e.salary || '') + '" inputmode="decimal"></label></div>' +
      '<div class="field"><span>أيام الأجازة</span>' + dayPick('rest', e.rest_days != null && e.rest_days !== '' ? e.rest_days : s.rest_days) + '</div>' +
      (S.boot.sites.length ? '<label class="field"><span>مقر الشغل</span><select class="input" name="site_id"><option value="">أقرب مقر</option>' + S.boot.sites.map(x => '<option value="' + x.id + '" ' + (x.id === e.site_id ? 'selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></label>' : '') +
      '<label class="check"><input type="checkbox" name="track" ' + (e.track === false ? '' : 'checked') + '> يبعت موقعه كل ' + esc(s.ping_min) + ' دقيقة وهو في الشغل</label>' +
      (e.id ? '<label class="check"><input type="checkbox" name="active" ' + (e.active === false ? '' : 'checked') + '> الحساب شغال</label>' : '') +
      '<div class="modal-ft">' + (e.id ? '<button type="button" class="btn danger" id="ef-del" style="margin-inline-end:auto">' + ic('trash', 15) + 'حذف</button>' : '') + '<button type="button" class="btn" data-close>رجوع</button><button class="btn primary">' + (e.id ? 'حفظ' : 'إضافة الموظف') + '</button></div></form>');
    let photo;
    $('#ef-ph', m.el).onclick = async () => { const p = await K.pickImage(320, .6); if (p) { photo = p; $('#ef-av', m.el).innerHTML = '<span class="av lg"><img src="' + p + '"></span>'; } };
    const np = $('#ef-noph', m.el); if (np) np.onclick = () => { photo = ''; $('#ef-av', m.el).innerHTML = av({ name: e.name, hue: e.hue }, 'lg'); };
    const del = $('#ef-del', m.el); if (del) del.onclick = async () => { if (!await confirm('حذف ' + e.name + '؟', 'لو ليه حضور متسجل هيتوقف بس عشان التقارير متبوظش.', 'حذف', true)) return; const r = await post('/api/emp/del', { id: e.id }).catch(err); if (r) { m.close(); toast(r.archived ? 'اتوقف الحساب' : 'اتحذف'); route(); } };
    $('#ef', m.el).onsubmit = ev => {
      ev.preventDefault();
      busy(ev.submitter, async () => {
        const f = form($('#ef', m.el)); f.id = e.id; f.rest_days = readDays($('[data-days]', m.el)); if (photo !== undefined) f.photo = photo;
        const r = await post('/api/emp', f);
        m.close(); await loadBoot();
        if (r.password) credentials(r.emp, r.username, r.password); else toast('اتحفظ');
        if (S.page === 'team' || S.page === 'today') route();
      });
    };
  }
  function credentials(emp, user, pass) {
    const link = location.origin + '/app';
    const msg = 'أهلاً ' + emp.name + '\nده لينك تطبيق ' + S.boot.settings.company + ' تسجّل منه حضورك وانصرافك ومهامك:\n' + link + '\nاسم الدخول: ' + user + '\nالباسورد: ' + pass + '\n\nافتح اللينك من الموبايل واختار «إضافة إلى الشاشة الرئيسية».';
    modal('<div class="modal-hd"><h3>بيانات دخول ' + esc(emp.name) + '</h3></div><p class="muted" style="margin-bottom:12px">الباسورد بيظهر المرة دي بس — ابعته للموظف دلوقتي.</p>' +
      '<div class="secret"><span class="small muted">اللينك</span><code style="font-size:15px;letter-spacing:0">' + esc(link) + '</code><span class="small muted" style="margin-top:8px">اسم الدخول</span><code>' + esc(user) + '</code><span class="small muted" style="margin-top:8px">الباسورد</span><code>' + esc(pass) + '</code></div>' +
      '<div class="modal-ft"><button class="btn" data-act="copy" data-text="' + esc(msg) + '">' + ic('copy', 15) + 'نسخ الرسالة</button>' + (emp.phone ? '<a class="btn go" target="_blank" rel="noopener" href="' + K.wa(emp.phone, msg) + '">' + ic('wa', 15) + 'ابعتها واتساب</a>' : '') + '<button class="btn primary" data-close>تمام</button></div>');
  }

  /* ── الحضور ── */
  R.att = async function () {
    const mo = S.attMonth || today().slice(0, 7);
    const d = await get('/api/attendance?month=' + mo);
    const byKey = new Map(); d.rows.forEach(r => { const k = r.emp_id + '|' + r.date; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(r); });
    const days = []; for (let i = 1; i <= d.days; i++) days.push(mo + '-' + String(i).padStart(2, '0'));
    const emps = d.emps.filter(e => e.active || d.rows.some(r => r.emp_id === e.id));
    view().innerHTML = '<div class="ph"><div><h1>الحضور</h1><div class="sub">دوس على أي يوم تعدّله أو تضيف حضور يدوي.</div></div><div class="acts"><div class="seg"><button data-act="attm" data-k="-1" aria-label="الشهر اللي فات">' + ic('back', 16) + '</button><button class="on">' + K.monthName(mo) + '</button><button data-act="attm" data-k="1" aria-label="الشهر الجاي" style="transform:scaleX(-1)">' + ic('back', 16) + '</button></div><button class="btn" id="csv">' + ic('download', 16) + 'Excel</button></div></div>' +
      '<div class="row wrap small muted" style="margin-bottom:10px;gap:14px"><span><span class="cell p" style="display:inline-grid;width:22px;height:22px;margin:0 4px 0 0;vertical-align:middle">٩</span>حضر (الرقم = ساعة الحضور)</span><span><span class="cell l" style="display:inline-grid;width:22px;height:22px;vertical-align:middle"></span> اتأخر</span><span><span class="cell o" style="display:inline-grid;width:22px;height:22px;vertical-align:middle"></span> لسه في الشغل</span><span><span class="cell a" style="display:inline-grid;width:22px;height:22px;vertical-align:middle">غ</span> غياب</span><span>— أجازة</span></div>' +
      (emps.length ? '<div class="tbl-wrap"><table class="mx"><thead><tr><th class="nm">الموظف</th>' + days.map(ds => { const w = new Date(ds + 'T12:00:00Z').getUTCDay(); return '<th class="' + (w === 5 || w === 6 ? 'wk' : '') + '">' + (+ds.slice(8)) + '<br><span style="font-weight:400">' + K.D3[w] + '</span></th>'; }).join('') + '<th class="sum">حضر</th><th class="sum">غاب</th><th class="sum">تأخير</th></tr></thead><tbody>' +
        emps.map(e => {
          let pres = 0, abs = 0, late = 0;
          const cells = days.map(ds => {
            const rs = byKey.get(e.id + '|' + ds) || [], rest = e.rest.includes(new Date(ds + 'T12:00:00Z').getUTCDay());
            let cls = 'f', txt = '';
            if (rs.length) { pres++; late += rs[0].late_min || 0; cls = rs.some(r => !r.out_at) && ds === d.today ? 'o' : rs[0].late_min ? 'l' : 'p'; txt = (+rs[0].in_at.slice(11, 13) % 12) || 12; }
            else if (rest) { cls = 'r'; txt = '—'; }
            else if (ds < d.today) { cls = 'a'; txt = 'غ'; abs++; }
            return '<td><button class="cell ' + cls + (ds === d.today ? ' t' : '') + '" data-act="attcell" data-emp="' + e.id + '" data-date="' + ds + '" title="' + esc(e.name + ' — ' + K.dayName(ds) + ' ' + dm(ds) + (rs.length ? ': ' + rs.map(r => hm(r.in_at) + ' ← ' + (r.out_at ? hm(r.out_at) : '…')).join(' / ') : '')) + '">' + txt + '</button></td>';
          }).join('');
          return '<tr><td class="nm"><div class="row" style="gap:8px">' + av(e, 'sm') + '<b style="font-weight:600">' + esc(e.name) + '</b></div></td>' + cells + '<td class="sum">' + pres + '</td><td class="sum" style="color:' + (abs ? 'var(--stop)' : 'inherit') + '">' + abs + '</td><td class="sum">' + K.mins(late) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="card empty"><b>مفيش موظفين</b>ضيف موظفين الأول.</div>');
    S.attData = d;
    $('#csv').onclick = () => {
      const rows = [['الموظف', 'اليوم', 'حضور', 'انصراف', 'تأخير (دقيقة)', 'إضافي (دقيقة)', 'المصدر']];
      d.rows.forEach(r => { const e = d.emps.find(x => x.id === r.emp_id); rows.push([e ? e.name : '', r.date, hm24(r.in_at), hm24(r.out_at), r.late_min, r.ot_min, r.source === 'manual' ? 'يدوي' : 'التطبيق']); });
      download('حضور-' + mo + '.csv', '﻿' + rows.map(r => r.map(x => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"').join(',')).join('\r\n'), 'text/csv');
    };
  };
  ACT.attm = b => { S.attMonth = monthAdd(S.attMonth || today().slice(0, 7), +b.dataset.k); R.att(); };
  ACT.attcell = b => {
    const d = S.attData, e = d.emps.find(x => x.id === b.dataset.emp), ds = b.dataset.date;
    const rs = d.rows.filter(r => r.emp_id === e.id && r.date === ds), r = rs[0] || {};
    const m = modal('<div class="modal-hd"><h3>' + esc(e.name) + ' — ' + K.dayName(ds) + ' ' + dm(ds) + '</h3><button class="btn ghost icon" data-close>' + ic('x') + '</button></div>' +
      (rs.length > 1 ? '<p class="small muted" style="margin-bottom:10px">في اليوم ده ' + rs.length + ' تسجيلات — بتعدّل الأولى.</p>' : '') +
      '<form id="af" style="display:grid;gap:12px"><div class="grid2"><label class="field"><span>حضور</span><input class="input" type="time" name="in" value="' + hm24(r.in_at) + '" required></label><label class="field"><span>انصراف</span><input class="input" type="time" name="out" value="' + hm24(r.out_at) + '"></label></div>' +
      '<label class="field"><span>ملحوظة</span><input class="input" name="note" value="' + esc(r.note || '') + '" placeholder="مثلاً: نسي يسجّل من التطبيق"></label>' +
      (r.in_site ? '<p class="small muted">سجّل من التطبيق على بعد ' + K.dist(r.in_dist) + ' من ' + esc(r.in_site) + '</p>' : '') +
      '<div class="modal-ft">' + (r.id ? '<button type="button" class="btn danger" id="af-del" style="margin-inline-end:auto">' + ic('trash', 15) + 'مسح</button>' : '') + '<button type="button" class="btn" data-close>رجوع</button><button class="btn primary">حفظ</button></div></form>');
    $('#af', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => { await post('/api/attendance', Object.assign(form($('#af', m.el)), { id: r.id, emp_id: e.id, date: ds })); m.close(); toast('اتحفظ'); R.att(); }); };
    const del = $('#af-del', m.el); if (del) del.onclick = async () => { await post('/api/attendance/del', { id: r.id }).catch(err); m.close(); R.att(); };
  };
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

  /* ── المهام ── */
  R.tasks = async function () {
    const d = await get('/api/tasks'); const T = d.tasks;
    const recent = ds => ds && ds.slice(0, 10) >= addDays(today(), -2);
    const groups = { act: T.filter(t => ['new', 'accepted', 'on_way', 'arrived'].includes(t.status)), way: T.filter(t => t.status === 'on_way' || t.status === 'arrived'), done: T.filter(t => t.status === 'done' && recent(t.done_at)), cancel: T.filter(t => t.status === 'cancelled' && recent(t.done_at)) };
    const f = S.tkf || 'act'; const list = groups[f] || [];
    const tab = (k, t, i) => '<button class="tkf ' + (k === f ? 'on' : '') + '" data-act="tkf" data-k="' + k + '">' + ic(i, 16) + t + '<em>' + groups[k].length + '</em></button>';
    view().innerHTML = '<div class="ph"><div><h1>المهام</h1><div class="sub">ابعت موظف لعميل وتابعه خطوة بخطوة لحد ما يحلّ المشكلة.</div></div><div class="acts"><button class="btn primary" data-act="newTask">' + ic('plus', 16) + 'مهمة جديدة</button></div></div>' +
      '<div class="tkfs">' + tab('act', 'شغالة', 'task') + tab('way', 'في الطريق ووصل', 'route') + tab('done', 'خلصت', 'check') + tab('cancel', 'اتلغت', 'x') + '</div>' +
      (list.length ? '<div class="tk-cards">' + list.map((t, i) => '<div class="card tk-card ' + t.status + '" style="animation-delay:' + Math.min(i * .06, .5) + 's">' + tracker(t) +
        (t.note ? '<div class="tk-note">' + esc(t.note) + '</div>' : '') +
        (t.status === 'done' ? (t.done_note ? '<div class="tk-note ok">' + ic('check', 14) + ' ' + esc(t.done_note) + '</div>' : '') + (t.photo_id ? '<img class="thumb" style="margin:8px 4px 0" data-act="photo" data-src="/api/photo/' + t.photo_id + '" src="/api/photo/' + t.photo_id + '" alt="">' : '') : '') +
        '<div class="tk-ft"><span class="xs faint">' + (t.self ? 'سجّلها الموظف' : 'من ' + esc(t.created_by || 'الإدارة')) + ' · ' + K.ago(t.created_at, S.boot.now) + '</span>' + (['new', 'accepted', 'on_way', 'arrived'].includes(t.status) ? '<button class="btn sm ghost danger" data-act="taskcancel" data-id="' + t.id + '">' + ic('x', 14) + 'إلغاء</button>' : '') + '</div></div>').join('') + '</div>'
        : '<div class="card tk-empty"><span class="tk-empty-ic float-y">' + ic(f === 'done' ? 'star' : 'route', 34) + '</span><b>' + ({ act: 'مفيش مهام شغالة دلوقتي', way: 'محدش في الطريق دلوقتي', done: 'مفيش مهام خلصت آخر 3 أيام', cancel: 'مفيش مهام اتلغت' })[f] + '</b><span class="muted small">ابعت موظف لعميل من «مهمة جديدة» وهتتابعه هنا.</span><button class="btn primary" data-act="newTask" style="margin-top:12px">' + ic('plus', 16) + 'مهمة جديدة</button></div>');
    animTrackers(view());
  };
  ACT.tkf = b => { S.tkf = b.dataset.k; R.tasks().then(() => K.countUp(view())); };
  ACT.taskcancel = async b => { if (await confirm('إلغاء المهمة؟', 'الموظف هيشوفها اتلغت.', 'إلغاء المهمة', true)) { await post('/api/tasks/cancel', { id: +b.dataset.id }).catch(err); R[S.page](); } };
  async function clientsList() { if (!S.cache.clients || Date.now() - S.cache.at > 30000) { S.cache.clients = (await get('/api/clients')).clients; S.cache.at = Date.now(); } return S.cache.clients; }
  async function taskForm(pre) {
    const cl = (await clientsList()).filter(c => c.status === 'active');
    const E = S.boot.employees.filter(e => e.active);
    if (!E.length) return toast('ضيف موظف الأول', 'err');
    const m = modal('<div class="modal-hd"><h3>مهمة جديدة</h3><button class="btn ghost icon" data-close>' + ic('x') + '</button></div><form id="tf" style="display:grid;gap:12px">' +
      '<label class="field"><span>مين يروح؟</span><select class="input" name="emp_id" required><option value="">اختار موظف</option>' + E.map(e => '<option value="' + e.id + '" ' + (e.id === pre.emp_id ? 'selected' : '') + '>' + esc(e.name) + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>العميل</span><input class="input" list="tf-cl" id="tf-c" placeholder="اكتب اسم العميل" value="' + esc((cl.find(c => c.id === pre.client_id) || {}).name || '') + '"><datalist id="tf-cl">' + cl.map(c => '<option value="' + esc(c.name) + '">').join('') + '</datalist></label>' +
      '<label class="field"><span>المطلوب</span><input class="input" name="title" placeholder="مثلاً: توصيل 5 كرتونة ورق A4"></label>' +
      '<label class="field"><span>تفاصيل</span><textarea class="input" name="note" placeholder="أي حاجة الموظف محتاج يعرفها"></textarea></label>' +
      '<div class="modal-ft"><button type="button" class="btn" data-close>رجوع</button><button class="btn primary">ابعت المهمة</button></div></form>');
    $('#tf', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => {
      const f = form($('#tf', m.el)), name = $('#tf-c', m.el).value.trim(), c = cl.find(x => x.name === name);
      if (name && !c) f.place = name; if (c) f.client_id = c.id;
      await post('/api/tasks', f); m.close(); toast('المهمة اتبعتت للموظف'); refreshCounts(); if (['tasks', 'today'].includes(S.page)) route();
    }); };
  }

  /* ── المرتبات ── */
  R.pay = async function () {
    const mo = S.payMonth || today().slice(0, 7);
    const d = await get('/api/payroll?month=' + mo); S.payData = d;
    const tot = d.rows.reduce((s, r) => s + r.net, 0);
    const sc = v => '<span class="score" style="--v:' + v + ';--c:' + (v >= 85 ? 'var(--go)' : v >= 65 ? 'var(--hivis)' : 'var(--stop)') + '"><span>' + v + '</span></span>';
    view().innerHTML = '<div class="ph"><div><h1>المرتبات</h1><div class="sub">محسوبة من الحضور: خصم التأخير والغياب، والإضافي، والمكافآت، وأقساط السلف. إجمالي الشهر <b class="tnum">' + money(tot, cur()) + '</b></div></div><div class="acts"><div class="seg"><button data-act="paym" data-k="-1" aria-label="الشهر اللي فات">' + ic('back', 16) + '</button><button class="on">' + K.monthName(mo) + '</button><button data-act="paym" data-k="1" aria-label="الشهر الجاي" style="transform:scaleX(-1)">' + ic('back', 16) + '</button></div><button class="btn" data-act="go" data-p="settings" onclick="sessionStorage.setItem(\'tq-set\',\'pay\')">' + ic('gear', 16) + 'قواعد الحساب</button></div></div>' +
      (d.rows.length ? '<div class="tbl-wrap"><table class="tbl pay"><thead><tr><th>الموظف</th><th>المرتب</th><th>حضر / غاب</th><th>تأخير</th><th>إضافي</th><th>مكافآت</th><th>خصومات</th><th>سلف</th><th>الصافي</th><th>التقييم</th><th></th></tr></thead><tbody>' +
        d.rows.map(r => '<tr><td><div class="row" style="gap:8px">' + av(r.emp, 'sm') + '<b style="font-weight:600">' + esc(r.emp.name) + '</b></div></td>' +
          '<td class="n"><button class="btn sm ghost" data-act="salary" data-id="' + r.emp.id + '">' + money(r.salary) + '</button></td><td class="n">' + r.present + ' / <span style="color:' + (r.absent ? 'var(--stop)' : 'inherit') + '">' + r.absent + '</span></td>' +
          '<td class="n">' + (r.lateMin ? K.mins(r.lateMin) + '<div class="xs" style="color:var(--late)">−' + money(r.lateDed) + '</div>' : '—') + '</td><td class="n">' + (r.otMin ? K.mins(r.otMin) + '<div class="xs" style="color:var(--go)">+' + money(r.otPay) + '</div>' : '—') + '</td>' +
          '<td class="n">' + (r.bonus ? '<span dir="ltr" style="color:var(--go);unicode-bidi:isolate">+' + money(r.bonus) + '</span>' : '—') + '</td><td class="n">' + (r.absentDed + r.deduct ? '<span dir="ltr" style="color:var(--stop);unicode-bidi:isolate">−' + money(r.absentDed + r.deduct) + '</span>' : '—') + '</td><td class="n">' + (r.loanDed ? '<bdi dir="ltr">−' + money(r.loanDed) + '</bdi>' : '—') + '</td>' +
          '<td class="n net">' + money(r.net) + '</td><td>' + sc(r.score) + '</td><td><div class="row" style="gap:4px;justify-content:flex-end"><button class="btn sm" data-act="reward" data-id="' + r.emp.id + '">' + ic('gift', 14) + 'مكافأة</button><button class="btn sm" data-act="adj" data-id="' + r.emp.id + '">±</button><button class="btn sm" data-act="slip" data-id="' + r.emp.id + '">' + ic('print', 14) + 'كشف</button></div></td></tr>').join('') +
        '</tbody></table></div><div class="row wrap" style="margin-top:14px"><button class="btn" id="loan">' + ic('cash', 16) + 'سلفة بالتقسيط</button><button class="btn ghost" id="loans">السلف الجارية</button></div>' : '<div class="card empty"><b>مفيش موظفين</b></div>');
    const lb = $('#loan'); if (lb) lb.onclick = () => loanForm();
    const ls = $('#loans'); if (ls) ls.onclick = loansList;
  };
  ACT.paym = b => { S.payMonth = monthAdd(S.payMonth || today().slice(0, 7), +b.dataset.k); R.pay(); };
  const payRow = id => S.payData.rows.find(r => r.emp.id === id);
  ACT.salary = b => {
    const r = payRow(b.dataset.id);
    const m = modal('<div class="modal-hd"><h3>مرتب ' + esc(r.emp.name) + '</h3></div><form id="sf"><label class="field"><span>المرتب الشهري (' + cur() + ')</span><input class="input" type="number" min="0" name="salary" value="' + r.salary + '" inputmode="decimal"></label><div class="modal-ft"><button type="button" class="btn" data-close>رجوع</button><button class="btn primary">حفظ</button></div></form>');
    $('#sf', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => { await post('/api/payroll/salary', { emp_id: r.emp.id, salary: form($('#sf', m.el)).salary }); m.close(); R.pay(); }); };
  };
  ACT.reward = b => {
    const r = payRow(b.dataset.id);
    const m = modal('<div class="modal-hd"><h3>مكافأة لـ ' + esc(r.emp.name) + '</h3></div><p class="muted small" style="margin-bottom:12px">هتوصله إشعار ويشوف احتفال على التطبيق.</p><form id="rf" style="display:grid;gap:12px"><label class="field"><span>المبلغ</span><input class="input" type="number" min="1" name="amount" required inputmode="decimal"></label><label class="field"><span>السبب</span><input class="input" name="reason" placeholder="مثلاً: خلّص 20 مهمة في الشهر"></label><div class="modal-ft"><button type="button" class="btn" data-close>رجوع</button><button class="btn hivis">' + ic('gift', 16) + 'ابعت المكافأة</button></div></form>' +
      (r.rewards.length ? '<hr class="sep"><div class="small muted">مكافآت الشهر</div>' + r.rewards.map(x => '<div class="row" style="padding:6px 0"><span class="grow">' + esc(x.reason || '') + '</span><b class="tnum">' + money(x.amount) + '</b><button class="btn sm ghost danger" data-act="rwdel" data-id="' + x.id + '">' + ic('trash', 14) + '</button></div>').join('') : ''));
    $('#rf', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => { await post('/api/payroll/reward', Object.assign(form($('#rf', m.el)), { emp_id: r.emp.id, month: S.payData.month })); m.close(); toast('المكافأة اتبعتت 🎉', 'hivis'); R.pay(); }); };
  };
  ACT.rwdel = async b => { await post('/api/payroll/reward/del', { id: +b.dataset.id }).catch(err); $('.scrim').remove(); R.pay(); };
  ACT.adj = b => {
    const r = payRow(b.dataset.id);
    const m = modal('<div class="modal-hd"><h3>إضافة أو خصم — ' + esc(r.emp.name) + '</h3></div><form id="jf" style="display:grid;gap:12px"><div class="seg" id="jk"><button type="button" class="on" data-k="bonus">إضافة</button><button type="button" data-k="deduct">خصم</button></div><label class="field"><span>المبلغ</span><input class="input" type="number" min="1" name="amount" required inputmode="decimal"></label><label class="field"><span>السبب</span><input class="input" name="note"></label><div class="modal-ft"><button type="button" class="btn" data-close>رجوع</button><button class="btn primary">حفظ</button></div></form>' +
      (r.adjustments.length ? '<hr class="sep">' + r.adjustments.map(x => '<div class="row" style="padding:6px 0">' + chip(x.kind === 'bonus' ? 'إضافة' : 'خصم', x.kind === 'bonus' ? 'go' : 'stop') + '<span class="grow">' + esc(x.note || '') + '</span><b class="tnum">' + money(x.amount) + '</b><button class="btn sm ghost danger" data-act="adjdel" data-id="' + x.id + '">' + ic('trash', 14) + '</button></div>').join('') : ''));
    let kind = 'bonus'; $$('#jk button', m.el).forEach(x => x.onclick = () => { kind = x.dataset.k; $$('#jk button', m.el).forEach(y => y.classList.toggle('on', y === x)); });
    $('#jf', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => { await post('/api/payroll/adj', Object.assign(form($('#jf', m.el)), { emp_id: r.emp.id, month: S.payData.month, kind })); m.close(); R.pay(); }); };
  };
  ACT.adjdel = async b => { await post('/api/payroll/adj/del', { id: +b.dataset.id }).catch(err); $('.scrim').remove(); R.pay(); };
  function loanForm() {
    const E = S.boot.employees.filter(e => e.active);
    const m = modal('<div class="modal-hd"><h3>سلفة بالتقسيط</h3></div><form id="lf" style="display:grid;gap:12px"><label class="field"><span>الموظف</span><select class="input" name="emp_id" required>' + E.map(e => '<option value="' + e.id + '">' + esc(e.name) + '</option>').join('') + '</select></label><div class="grid3"><label class="field"><span>المبلغ</span><input class="input" type="number" min="1" name="total" required></label><label class="field"><span>عدد الأقساط</span><input class="input" type="number" min="1" max="36" name="n" value="3" required></label><label class="field"><span>أول قسط</span><input class="input" type="month" name="start_month" value="' + S.payData.month + '" required></label></div><label class="field"><span>ملحوظة</span><input class="input" name="note"></label><div class="modal-ft"><button type="button" class="btn" data-close>رجوع</button><button class="btn primary">حفظ</button></div></form>');
    $('#lf', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => { await post('/api/payroll/loan', form($('#lf', m.el))); m.close(); toast('اتسجلت'); R.pay(); }); };
  }
  async function loansList() {
    const d = await get('/api/payroll/loans');
    const m = modal('<div class="modal-hd"><h3>السلف</h3><button class="btn ghost icon" data-close>' + ic('x') + '</button></div>' + (d.loans.length ? d.loans.map(l => { const e = empById(l.emp_id) || { name: '؟' }; return '<div class="row" style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="grow"><b>' + esc(e.name) + '</b> — ' + money(l.total) + ' على ' + l.n + ' شهور من ' + K.monthName(l.start_month) + '<div class="small muted">' + esc(l.note || '') + '</div></div>' + (l.active ? '<button class="btn sm" data-act="loanstop" data-id="' + l.id + '">إيقاف</button>' : chip('متوقفة')) + '</div>'; }).join('') : '<div class="empty">مفيش سلف.</div>'));
  }
  ACT.loanstop = async b => { await post('/api/payroll/loan/stop', { id: +b.dataset.id }).catch(err); $('.scrim').remove(); loansList(); R.pay(); };
  ACT.slip = b => {
    const r = payRow(b.dataset.id), s = S.boot.settings;
    const L = (t, v, c) => '<div class="line"><span>' + t + '</span><b class="tnum" style="color:' + (c || 'inherit') + '"><bdi dir="ltr">' + v + '</bdi></b></div>';
    modal('<div class="slip" id="slip"><div class="row" style="margin-bottom:14px"><div class="grow"><h3>' + esc(s.company) + '</h3><div class="muted small">كشف مرتب ' + K.monthName(S.payData.month) + '</div></div>' + av(r.emp, 'lg') + '</div><h4 style="margin-bottom:8px">' + esc(r.emp.name) + ' <span class="muted small">' + esc(r.emp.job || '') + '</span></h4>' +
      L('المرتب الأساسي', money(r.salary, cur())) + L('أيام الحضور', r.present + ' من ' + r.workDays) + (r.otPay ? L('إضافي (' + K.mins(r.otMin) + ')', '+' + money(r.otPay), 'var(--go)') : '') + (r.bonus ? L('مكافآت وإضافات', '<bdi dir="ltr">+' + money(r.bonus) + '</bdi>', 'var(--go)') : '') +
      (r.lateDed ? L('خصم تأخير (' + K.mins(r.lateMin) + ')', '−' + money(r.lateDed), 'var(--stop)') : '') + (r.absentDed ? L('خصم غياب (' + r.absent + ' يوم)', '−' + money(r.absentDed), 'var(--stop)') : '') + (r.deduct ? L('خصومات تانية', '−' + money(r.deduct), 'var(--stop)') : '') +
      r.loans.map(l => L('قسط سلفة ' + l.idx + ' من ' + l.n, '−' + money(l.part), 'var(--stop)')).join('') + L('الصافي', money(r.net, cur())) + '<p class="small muted" style="margin-top:10px">تقييم الشهر: ' + r.score + ' من 100 · مهام خلصت: ' + r.tasksDone + ' · زيارات: ' + r.visits + '</p></div>' +
      '<div class="modal-ft no-print"><button class="btn" data-close>قفل</button><button class="btn primary" onclick="window.print()">' + ic('print', 16) + 'اطبع</button></div>');
  };

  /* ── المحادثات ── */
  R.chat = async function (soft, focus) {
    const d = await get('/api/chat');
    const sel = focus || S.chatWith || (d.threads.find(t => t.unread) || {}).id || (window.innerWidth > 760 && d.threads[0] ? d.threads[0].id : null);
    if (soft && focus && focus !== S.chatWith && S.chatWith) { refreshCounts(); return R.chat(false, S.chatWith); }
    S.chatWith = sel;
    view().innerHTML = '<div class="ph"><div><h1>المحادثات</h1><div class="sub">' + (d.on ? 'الموظفين يقدروا يكلموا الإدارة من التطبيق.' : '<span style="color:var(--stop)">المحادثة مقفولة للموظفين</span> — افتحها من الإعدادات.') + '</div></div></div>' +
      '<div class="card chat ' + (sel ? 'has' : '') + '"><div class="threads">' + (d.threads.map(t => '<div class="thr ' + (t.id === sel ? 'on' : '') + '" data-act="thr" data-id="' + t.id + '">' + av({ name: t.name, hue: t.hue, photo: t.photo }) + '<div class="t"><b>' + esc(t.name) + '</b><small>' + esc(t.last || 'مفيش رسايل') + '</small></div>' + (t.unread ? '<span class="badge">' + t.unread + '</span>' : '') + '</div>').join('') || '<div class="empty small">مفيش موظفين.</div>') + '</div>' +
      '<div class="conv" id="conv"></div></div>';
    if (sel) openThread(sel, d.threads.find(t => t.id === sel));
    refreshCounts();
  };
  ACT.thr = b => { S.chatWith = b.dataset.id; R.chat(); };
  async function openThread(id, t) {
    const d = await get('/api/chat/thread?id=' + id);
    const c = $('#conv'); if (!c) return;
    c.innerHTML = '<div class="conv-hd"><button class="btn sm ghost icon" data-act="chatback" aria-label="رجوع" style="display:' + (window.innerWidth <= 760 ? 'inline-flex' : 'none') + '">' + ic('back', 16) + '</button>' + av({ name: t.name, hue: t.hue, photo: t.photo }, 'sm') + '<b class="grow">' + esc(t.name) + '</b></div>' +
      '<div class="msgs" id="msgs">' + (d.messages.map(m => '<div class="msg ' + (m.side === 'mgr' ? 'me' : 'them') + '">' + esc(m.body) + '<small>' + (m.side === 'mgr' && m.by_name ? esc(m.by_name) + ' · ' : '') + K.dm(m.at) + ' ' + hm(m.at) + '</small></div>').join('') || '<div class="empty small">ابدأ الكلام.</div>') + '</div>' +
      '<form class="composer" id="cmp"><input class="input" name="body" placeholder="اكتب رسالة…" autocomplete="off"><button class="btn primary icon" aria-label="ابعت">' + ic('send', 17) + '</button></form>';
    const ms = $('#msgs'); ms.scrollTop = ms.scrollHeight;
    $('#cmp').onsubmit = ev => { ev.preventDefault(); const i = $('#cmp input'); const v = i.value.trim(); if (!v) return; i.value = ''; post('/api/chat/send', { id, body: v }).then(() => openThread(id, t)).catch(err); };
  }
  ACT.chatback = () => { S.chatWith = null; R.chat(); };

  /* ── بنك الأعطال ── */
  R.faults = async function () {
    const q = S.faultQ || '';
    const d = await get('/api/faults?q=' + encodeURIComponent(q));
    view().innerHTML = '<div class="ph"><div><h1>بنك الأعطال</h1><div class="sub">كل عطل اتصلح بيتحفظ بحلّه — أي مهندس يدوّر بالكود أو بالكلام ويشوف مين صلّحه.</div></div><div class="acts"><button class="btn primary" id="fadd">' + ic('plus', 16) + 'عطل وحله</button></div></div>' +
      '<div class="toolbar"><div class="search">' + ic('search', 17) + '<input class="input" id="fq" placeholder="دوّر: كود العطل، اسم الطابعة، المشكلة…" value="' + esc(q) + '"></div></div>' +
      (d.faults.length ? '<div class="faults">' + d.faults.map(f => '<div class="card fault"><div class="row">' + (f.code ? chip(f.code, 'sky') : '') + '<b class="grow">' + esc(f.title) + '</b><span class="chip">' + ic('up', 13) + ' ' + f.votes + '</span></div><div class="sol">' + esc(f.solution) + '</div><div class="row xs muted"><span class="grow">' + esc(f.emp_name || '') + (f.client_name ? ' · عند ' + esc(f.client_name) : '') + ' · ' + dm(f.at) + '</span><button class="btn sm ghost" data-act="fedit" data-id="' + f.id + '">' + ic('edit', 14) + '</button><button class="btn sm ghost danger" data-act="fdel" data-id="' + f.id + '">' + ic('trash', 14) + '</button></div></div>').join('') + '</div>'
        : '<div class="card empty"><b>' + (q ? 'مفيش نتايج' : 'البنك فاضي لسه') + '</b>' + (q ? 'جرّب كلمة تانية.' : 'الأعطال بتتضاف لوحدها لما المهندس يخلّص زيارة ويكتب الحل، أو ضيفها إنت.') + '</div>');
    S.faults = d.faults;
    let t; $('#fq').oninput = ev => { clearTimeout(t); t = setTimeout(() => { S.faultQ = ev.target.value; R.faults().then(() => { const i = $('#fq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 350); };
    $('#fadd').onclick = () => faultForm({});
  };
  ACT.fedit = b => faultForm(S.faults.find(f => f.id === +b.dataset.id));
  ACT.fdel = async b => { if (await confirm('مسح العطل ده؟', '', 'مسح', true)) { await post('/api/faults/del', { id: +b.dataset.id }); R.faults(); } };
  function faultForm(f) {
    const m = modal('<div class="modal-hd"><h3>' + (f.id ? 'تعديل' : 'عطل وحله') + '</h3></div><form id="ff" style="display:grid;gap:12px"><div class="grid2"><label class="field"><span>كود العطل (لو فيه)</span><input class="input" name="code" dir="ltr" value="' + esc(f.code || '') + '"></label><label class="field"><span>العطل</span><input class="input" name="title" required value="' + esc(f.title || '') + '"></label></div><label class="field"><span>الحل</span><textarea class="input" name="solution" required style="min-height:120px">' + esc(f.solution || '') + '</textarea></label><div class="modal-ft"><button type="button" class="btn" data-close>رجوع</button><button class="btn primary">حفظ</button></div></form>');
    $('#ff', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => { await post('/api/faults', Object.assign(form($('#ff', m.el)), { id: f.id })); m.close(); R.faults(); }); };
  }

  /* ════════ العملاء ════════ */
  R.clients = async function () {
    S.cache.clients = null; const C = await clientsList();
    const groups = [...new Set(C.map(c => c.grp).filter(Boolean))].sort();
    const f = S.clf || { q: '', g: '', st: 'active' };
    S.clf = f;
    const nq = s => String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
    const list = C.filter(c => (f.st === 'all' || c.status === f.st) && (!f.g || c.grp === f.g) && (!f.q || nq(c.name + ' ' + c.phone + ' ' + c.contact + ' ' + c.address).includes(nq(f.q))));
    const totBal = C.filter(c => c.status === 'active').reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0);
    view().innerHTML = '<div class="ph"><div><h1>العملاء</h1><div class="sub">' + C.filter(c => c.status === 'active').length + ' عميل · مستحق عليهم <b class="tnum">' + money(totBal, cur()) + '</b>. كل عميل ليه لينك يتابع منه حسابه ويطلب ورق أو صيانة.</div></div><div class="acts"><button class="btn" data-act="qrall">' + ic('qr', 16) + 'اطبع كل الباركودات</button><button class="btn" id="cimp">' + ic('download', 16) + 'استيراد</button><button class="btn primary" id="cadd">' + ic('plus', 16) + 'عميل جديد</button></div></div>' +
      '<div class="toolbar"><div class="search">' + ic('search', 17) + '<input class="input" id="cq" placeholder="دوّر بالاسم أو الموبايل…" value="' + esc(f.q) + '"></div>' +
      (groups.length ? '<select class="input" id="cg" style="max-width:200px"><option value="">كل المناطق</option>' + groups.map(g => '<option ' + (g === f.g ? 'selected' : '') + '>' + esc(g) + '</option>').join('') + '</select>' : '') +
      '<div class="seg"><button data-act="clst" data-k="active" class="' + (f.st === 'active' ? 'on' : '') + '">شغالين</button><button data-act="clst" data-k="paused" class="' + (f.st === 'paused' ? 'on' : '') + '">متوقفين</button><button data-act="clst" data-k="all" class="' + (f.st === 'all' ? 'on' : '') + '">الكل</button></div></div>' +
      (list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>العميل</th><th>المنطقة</th><th>الموبايل</th><th>المستحق</th><th>آخر تواصل</th><th>المتابعة الجاية</th><th>اللينك</th></tr></thead><tbody>' +
        list.map(c => '<tr class="cl-row" data-act="client" data-id="' + c.id + '"><td>' + esc(c.name) + ' <button class="btn sm ghost icon" data-act="cases" data-id="' + c.id + '" title="حالات المرضى — رفع PDF وباركود للمريض" aria-label="حالات المرضى">' + ic('qr', 15) + '</button>' + (c.open_req ? ' <span class="chip hivis">' + c.open_req + ' طلب</span>' : '') + '</td><td class="muted">' + esc(c.grp || '—') + '</td><td dir="ltr" style="text-align:end" class="tnum muted">' + esc(c.phone || '') + '</td><td class="tnum ' + (c.balance > 0 ? 'bal-pos' : c.balance < 0 ? 'bal-neg' : '') + '">' + (c.balance ? money(c.balance) : '—') + '</td><td class="muted small">' + (c.last_touch ? dm(c.last_touch) : '—') + '</td><td>' + (c.next_follow ? (c.next_follow < today() ? chip('متأخرة · ' + dm(c.next_follow), 'stop') : c.next_follow === today() ? chip('النهارده', 'hivis') : chip(dm(c.next_follow))) : '<span class="faint">—</span>') + '</td><td>' + (c.portal_on ? '<span class="chip go"><span class="dot"></span>' + (c.portal_seen ? 'فتحه ' + dm(c.portal_seen) : 'شغال') + '</span>' : chip('متوقف')) + '</td></tr>').join('') +
        '</tbody></table></div>' : '<div class="card empty"><b>' + (C.length ? 'مفيش نتايج' : 'ضيف أول عميل') + '</b>' + (C.length ? 'غيّر البحث أو الفلتر.' : 'أو استورد قايمة العملاء مرة واحدة من Excel.') + '</div>');
    let t; $('#cq').oninput = ev => { clearTimeout(t); t = setTimeout(() => { f.q = ev.target.value; R.clients().then(() => { const i = $('#cq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 300); };
    const g = $('#cg'); if (g) g.onchange = ev => { f.g = ev.target.value; R.clients(); };
    $('#cadd').onclick = () => clientForm({});
    $('#cimp').onclick = importClients;
  };
  ACT.clst = b => { S.clf.st = b.dataset.k; R.clients(); };
  function clientForm(c) {
    const m = modal('<div class="modal-hd"><h3>' + (c.id ? 'تعديل ' + esc(c.name) : 'عميل جديد') + '</h3><button class="btn ghost icon" data-close>' + ic('x') + '</button></div><form id="cf" style="display:grid;gap:12px">' +
      '<div class="grid2"><label class="field"><span>اسم العميل / المركز</span><input class="input" name="name" required value="' + esc(c.name || '') + '"></label><label class="field"><span>المنطقة / المجموعة</span><input class="input" name="grp" list="grps" value="' + esc(c.grp || '') + '"><datalist id="grps">' + [...new Set((S.cache.clients || []).map(x => x.grp).filter(Boolean))].map(g => '<option value="' + esc(g) + '">').join('') + '</datalist></label></div>' +
      '<div class="grid2"><label class="field"><span>المسؤول</span><input class="input" name="contact" value="' + esc(c.contact || '') + '"></label><label class="field"><span>الموبايل</span><input class="input" name="phone" dir="ltr" inputmode="tel" value="' + esc(c.phone || '') + '"></label></div>' +
      '<label class="field"><span>العنوان</span><input class="input" name="address" value="' + esc(c.address || '') + '"></label>' +
      '<div class="field"><span>المكان على الخريطة <span class="faint">(اختياري — بيتعلم لوحده من أول زيارة)</span></span><div class="minimap" id="cf-map"></div><input type="hidden" name="lat" value="' + (c.lat == null ? '' : c.lat) + '"><input type="hidden" name="lng" value="' + (c.lng == null ? '' : c.lng) + '"></div>' +
      '<label class="field"><span>ملاحظات</span><textarea class="input" name="notes">' + esc(c.notes || '') + '</textarea></label>' +
      (c.id ? '<label class="check"><input type="checkbox" id="cf-st" ' + (c.status !== 'paused' ? 'checked' : '') + '> عميل شغال</label>' : '') +
      '<div class="modal-ft">' + (c.id ? '<button type="button" class="btn danger" id="cf-del" style="margin-inline-end:auto">' + ic('trash', 15) + 'حذف</button>' : '') + '<button type="button" class="btn" data-close>رجوع</button><button class="btn primary">حفظ</button></div></form>', { wide: true });
    const mm = L.map($('#cf-map', m.el)); K.tiles(mm);
    let mk = null; const set = (lat, lng) => { $('[name=lat]', m.el).value = lat.toFixed(6); $('[name=lng]', m.el).value = lng.toFixed(6); if (mk) mk.setLatLng([lat, lng]); else mk = L.marker([lat, lng], { icon: K.clientPin(), draggable: true }).addTo(mm).on('dragend', e => { const p = e.target.getLatLng(); set(p.lat, p.lng); }); };
    if (c.lat != null) { mm.setView([c.lat, c.lng], 15); set(c.lat, c.lng); } else mm.setView([30.05, 31.24], 8);
    mm.on('click', e => set(e.latlng.lat, e.latlng.lng)); setTimeout(() => mm.invalidateSize(), 150);
    const del = $('#cf-del', m.el); if (del) del.onclick = async () => { if (!await confirm('حذف ' + c.name + '؟', 'لو ليه حساب أو زيارات هيتوقف بس.', 'حذف', true)) return; const r = await post('/api/clients/del', { id: c.id }).catch(err); if (r) { m.close(); closeDrawer(); toast(r.archived ? 'اتوقف العميل' : 'اتحذف'); S.cache.clients = null; route(); } };
    $('#cf', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => {
      const f = form($('#cf', m.el)); f.id = c.id; const st = $('#cf-st', m.el); if (st) f.status = st.checked ? 'active' : 'paused';
      const r = await post('/api/clients', f); m.close(); S.cache.clients = null; toast('اتحفظ');
      if (S.page === 'clients') await R.clients(); clientDrawer(r.id);
    }); };
  }
  function importClients() {
    const m = modal('<div class="modal-hd"><h3>استيراد عملاء</h3><button class="btn ghost icon" data-close>' + ic('x') + '</button></div><p class="muted small" style="margin-bottom:10px">انسخ من Excel أعمدة: <b>الاسم</b>، <b>الموبايل</b>، <b>المنطقة</b>، <b>العنوان</b>، <b>المسؤول</b> (بنفس الترتيب) والصقها هنا. الأسماء الموجودة بتتساب.</p><textarea class="input" id="imp" style="min-height:220px" placeholder="مركز النور للأشعة	01001234567	منوف"></textarea><div class="modal-ft"><button class="btn" data-close>رجوع</button><button class="btn primary" id="impgo">استيراد</button></div>', { wide: true });
    $('#impgo', m.el).onclick = ev => busy(ev.target, async () => {
      const rows = $('#imp', m.el).value.split(/\r?\n/).map(l => l.split(/\t|,|؛|;/).map(s => s.trim())).filter(r => r[0]).map(r => ({ name: r[0], phone: r[1], grp: r[2], address: r[3], contact: r[4] }));
      const r = await post('/api/clients/import', { rows }); m.close(); toast('اتضاف ' + r.added + ' عميل'); R.clients();
    });
  }
  async function clientDrawer(id, tab) {
    const d = await get('/api/clients/one?id=' + encodeURIComponent(id)).catch(err); if (!d) return;
    const c = d.client, url = location.origin + '/c/' + c.portal_code, s = S.boot.settings;
    S.clTab = tab || S.clTab || 'follow';
    const linkMsg = 'أهلاً ' + (c.contact || c.name) + '\nده لينك ' + c.name + ' عند ' + s.company + ' — تقدر منه تشوف حسابك وتطلب ورق أو صيانة وتتابع طلبك:\n' + url;
    const maxV = Math.max(1, ...d.months.map(x => Math.max(x.invoiced, x.paid)));
    const dr = drawer('<div style="flex:1;min-width:0"><h2>' + esc(c.name) + '</h2><div class="muted small">' + [c.grp, c.contact, c.address].filter(Boolean).map(esc).join(' · ') + '</div></div>',
      '<div class="row wrap">' + (c.phone ? '<a class="btn sm" href="tel:' + esc(c.phone) + '">' + ic('phone', 15) + 'اتصال</a><a class="btn sm" target="_blank" rel="noopener" href="' + K.wa(c.phone) + '">' + ic('wa', 15) + 'واتساب</a>' : '') + '<button class="btn sm" data-act="newTask" data-client="' + c.id + '">' + ic('task', 15) + 'ابعت موظف</button>' + (c.lat != null ? '<a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + c.lat + ',' + c.lng + '">' + ic('pin', 15) + 'الخريطة</a>' : '') + '<button class="btn sm" data-act="cases" data-id="' + c.id + '">' + ic('file', 15) + 'حالات المرضى</button><span class="grow"></span><button class="btn sm" id="cd-edit">' + ic('edit', 15) + 'تعديل</button></div>' +
      '<div class="kv"><div><span>المستحق</span><b style="color:' + (d.money.balance > 0 ? 'var(--late)' : 'var(--go)') + '">' + money(d.money.balance) + '</b></div><div><span>إجمالي الفواتير</span><b>' + money(d.money.invoiced) + '</b></div><div><span>اتحصّل</span><b>' + money(d.money.paid) + '</b></div><div><span>المتابعة الجاية</span><b style="font-size:18px">' + (c.next_follow ? dm(c.next_follow) : '—') + '</b></div></div>' +
      '<div class="linkbox">' + ic('link', 18) + '<code>' + esc(url) + '</code>' + (c.portal_on ? '<button class="btn sm" data-act="copy" data-text="' + esc(url) + '">' + ic('copy', 14) + 'نسخ</button><a class="btn sm" target="_blank" rel="noopener" href="' + esc(url) + '">' + ic('ext', 14) + 'فتح</a>' + (c.phone ? '<a class="btn sm go" target="_blank" rel="noopener" href="' + K.wa(c.phone, linkMsg) + '">' + ic('wa', 14) + 'ابعته</a>' : '') + '<button class="btn sm" data-act="qr" data-id="' + c.id + '">' + ic('qr', 14) + 'باركود</button>' + '<button class="btn sm ghost" data-act="clink" data-id="' + c.id + '" data-a="rotate" title="لينك جديد (القديم يبطل)">' + ic('refresh', 14) + '</button><button class="btn sm ghost danger" data-act="clink" data-id="' + c.id + '" data-a="off">إيقاف</button>' : '<span class="chip stop">متوقف</span><button class="btn sm" data-act="clink" data-id="' + c.id + '" data-a="on">تشغيل</button>') + '</div>' +
      '<div class="seg" id="cd-tabs"><button data-t="follow">المتابعة</button><button data-t="money">الحساب</button><button data-t="req">الطلبات ' + (d.requests.filter(r => ['new', 'ok'].includes(r.status)).length || '') + '</button><button data-t="visits">الزيارات</button></div><div id="cd-body"></div>');
    $('#cd-edit', dr).onclick = () => clientForm(c);
    const tabsEl = $('#cd-tabs', dr), body = $('#cd-body', dr);
    const show = t => {
      S.clTab = t; $$('button', tabsEl).forEach(b => b.classList.toggle('on', b.dataset.t === t));
      if (t === 'follow') {
        body.innerHTML = '<div class="card pad"><form id="fu" style="display:grid;gap:10px"><div class="seg" id="fu-k">' + Object.entries(FU).filter(([k]) => k !== 'meeting').map(([k, v], i) => '<button type="button" data-k="' + k + '" class="' + (i === 0 ? 'on' : '') + '">' + ic(v[1], 15) + v[0] + '</button>').join('') + '</div>' +
          '<textarea class="input" name="note" placeholder="حصل إيه؟ مثلاً: كلمت د. أحمد، محتاجين 10 علب فيلم الأسبوع الجاي"></textarea>' +
          '<div class="row wrap"><span class="small muted">المتابعة الجاية:</span><div class="seg" id="fu-n"><button type="button" data-d="1">بكرة</button><button type="button" data-d="3">بعد 3 أيام</button><button type="button" data-d="7" class="on">أسبوع</button><button type="button" data-d="30">شهر</button><button type="button" data-d="">مفيش</button></div><input type="date" class="input" name="next_date" style="max-width:170px" value="' + addDays(today(), 7) + '"><span class="grow"></span><button class="btn primary">سجّل</button></div></form></div>' +
          '<div class="card pad"><div class="feed">' + (d.followups.map(f => '<div class="fd"><span class="ic ' + f.kind + '">' + ic((FU[f.kind] || FU.note)[1], 16) + '</span><div><div class="row" style="gap:8px"><b>' + (FU[f.kind] || FU.note)[0] + '</b><span class="small muted grow">' + esc(f.by_name || '') + ' · ' + dm(f.at) + ' ' + hm(f.at) + '</span><button class="btn sm ghost icon" data-act="fudel" data-id="' + f.id + '" data-c="' + c.id + '" aria-label="مسح">' + ic('trash', 14) + '</button></div>' + (f.note ? '<div style="white-space:pre-wrap">' + esc(f.note) + '</div>' : '') + (f.next_date ? '<div class="xs muted">المتابعة الجاية: ' + dm(f.next_date) + '</div>' : '') + '</div></div>').join('') || '<div class="empty small">لسه مفيش متابعات — أول مكالمة تتسجل هنا.</div>') + '</div></div>';
        let kind = 'call';
        $$('#fu-k button', body).forEach(b => b.onclick = () => { kind = b.dataset.k; $$('#fu-k button', body).forEach(x => x.classList.toggle('on', x === b)); });
        $$('#fu-n button', body).forEach(b => b.onclick = () => { $$('#fu-n button', body).forEach(x => x.classList.toggle('on', x === b)); $('[name=next_date]', body).value = b.dataset.d ? addDays(today(), +b.dataset.d) : ''; });
        $('#fu', body).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => { await post('/api/followups', Object.assign(form($('#fu', body)), { client_id: c.id, kind })); toast('اتسجلت'); clientDrawer(c.id, 'follow'); refreshCounts(); if (['clients', 'follow'].includes(S.page)) R[S.page](true); }); };
      } else if (t === 'money') {
        body.innerHTML = '<div class="card pad"><div class="row"><h4 class="grow">آخر 12 شهر</h4><div class="legend"><span><i style="background:var(--brand)"></i>فواتير</span><span><i style="background:var(--hivis)"></i>تحصيل</span></div></div><div class="bars">' + d.months.map(x => '<div class="b" title="' + K.monthName(x.month) + ': فواتير ' + money(x.invoiced) + ' · تحصيل ' + money(x.paid) + '"><div class="st"><i class="inv" style="height:' + (x.invoiced / maxV * 100) + '%"></i><i class="pay" style="height:' + (x.paid / maxV * 100) + '%"></i></div><small>' + K.MON[+x.month.slice(5) - 1].slice(0, 3) + '</small></div>').join('') + '</div></div>' +
          '<div class="card pad"><form id="lg" class="row wrap"><div class="seg" id="lg-k"><button type="button" data-k="invoice" class="on">فاتورة</button><button type="button" data-k="payment">تحصيل</button></div><input class="input" type="number" min="0" step="0.01" name="amount" placeholder="المبلغ" style="max-width:140px" required inputmode="decimal"><input class="input" type="date" name="date" value="' + today() + '" style="max-width:170px"><input class="input grow" name="note" placeholder="البيان (اختياري)" style="min-width:140px"><button class="btn primary">إضافة</button></form></div>' +
          '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>المبلغ</th><th></th></tr></thead><tbody>' + (d.ledger.map(l => '<tr><td class="tnum">' + dmy(l.date) + '</td><td>' + (l.kind === 'invoice' ? chip('فاتورة') : chip('تحصيل', 'go')) + '</td><td class="muted">' + esc([l.ref, l.note].filter(Boolean).join(' — ')) + '</td><td class="tnum" style="font-weight:600">' + money(l.amount) + '</td><td><button class="btn sm ghost icon" data-act="lgdel" data-id="' + l.id + '" data-c="' + c.id + '" aria-label="مسح">' + ic('trash', 14) + '</button></td></tr>').join('') || '<tr><td colspan="5" class="muted" style="text-align:center;padding:20px">مفيش حركات لسه. الحساب ده هو اللي العميل بيشوفه على اللينك.</td></tr>') + '</tbody></table></div>';
        let kind = 'invoice';
        $$('#lg-k button', body).forEach(b => b.onclick = () => { kind = b.dataset.k; $$('#lg-k button', body).forEach(x => x.classList.toggle('on', x === b)); });
        $('#lg', body).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => { await post('/api/ledger', Object.assign(form($('#lg', body)), { client_id: c.id, kind })); toast('اتضافت'); clientDrawer(c.id, 'money'); if (S.page === 'clients') R.clients(true); }); };
      } else if (t === 'req') {
        body.innerHTML = '<div class="reqs">' + (d.requests.map(r => reqCard(Object.assign(r, { client_name: c.name, client_phone: c.phone }), true)).join('') || '<div class="card empty small">مفيش طلبات من اللينك لسه.</div>') + '</div>';
      } else {
        body.innerHTML = '<div class="card pad"><div class="feed">' + (d.visits.map(v => '<div class="fd"><span class="ic visit">' + ic('pin', 16) + '</span><div><b>' + esc(v.emp_name || '') + '</b> <span class="muted small">' + esc(v.purpose || '') + '</span><div class="small muted">' + K.dayName(v.date) + ' ' + dm(v.date) + ' · ' + hm(v.start_at) + (v.end_at ? ' ← ' + hm(v.end_at) : '') + '</div>' + (v.note ? '<div class="small">' + esc(v.note) + '</div>' : '') + '</div></div>').join('') + d.tasks.filter(t => t.status !== 'done').map(t => '<div class="fd"><span class="ic">' + ic('task', 16) + '</span><div><b>' + esc(t.title) + '</b> ' + chip(TASK[t.status][0], TASK[t.status][1]) + '<div class="small muted">' + esc(t.emp_name || '') + '</div></div></div>').join('') || '<div class="empty small">مفيش زيارات متسجلة.</div>') + '</div></div>';
      }
    };
    $$('button', tabsEl).forEach(b => b.onclick = () => show(b.dataset.t));
    show(S.clTab);
  }
  ACT.clink = async b => {
    const a = b.dataset.a;
    if (a === 'rotate' && !await confirm('لينك جديد؟', 'اللينك القديم هيبطل يفتح.', 'اعمل لينك جديد')) return;
    if (a === 'off' && !await confirm('إيقاف اللينك؟', 'العميل مش هيقدر يفتح صفحته لحد ما تشغّله تاني.', 'إيقاف', true)) return;
    await post('/api/clients/link', { id: b.dataset.id, action: a }).catch(err); clientDrawer(b.dataset.id); S.cache.clients = null;
  };
  ACT.fudel = async b => { await post('/api/followups/del', { id: +b.dataset.id }).catch(err); clientDrawer(b.dataset.c, 'follow'); };
  ACT.lgdel = async b => { if (await confirm('مسح الحركة دي؟', '', 'مسح', true)) { await post('/api/ledger/del', { id: +b.dataset.id }).catch(err); clientDrawer(b.dataset.c, 'money'); } };

  /* ── الطلبات ── */
  function reqCard(r, inDrawer) {
    const st = REQ[r.status];
    return '<div class="card req ' + (r.status === 'new' ? 'new' : '') + '"><span class="ic ' + r.kind + '" style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:' + (r.kind === 'maint' ? 'var(--late-soft);color:var(--late)' : 'var(--sky-soft);color:var(--sky)') + '">' + ic(r.kind === 'maint' ? 'tool' : 'box', 19) + '</span>' +
      '<div style="min-width:0"><div class="row wrap" style="gap:8px">' + (inDrawer ? '' : '<b style="font-size:16px;cursor:pointer" data-act="client" data-id="' + r.client_id + '">' + esc(r.client_name || '') + '</b>') + '<span class="chip">' + (r.kind === 'maint' ? 'صيانة' : 'طلب ورق') + '</span>' + chip(st[0], st[1]) + '<span class="faint xs">#' + r.id + ' · ' + K.dayName(r.created_at.slice(0, 10)) + ' ' + dm(r.created_at) + ' ' + hm(r.created_at) + '</span></div>' +
      (r.kind === 'maint' ? '<div style="margin-top:6px"><b>' + esc(r.device || '') + '</b>' + (r.note ? ' — ' + esc(r.note) : '') + '</div>' : '<div class="items">' + r.items.map(i => '<span class="chip sky" style="height:30px;font-size:14px">' + esc(i.name) + ' × <b class="tnum">' + n(i.qty) + '</b></span>').join('') + '</div>' + (r.note ? '<div class="small" style="margin-top:6px">' + esc(r.note) + '</div>' : '')) +
      (r.contact ? '<div class="small muted" style="margin-top:4px">' + ic('phone', 13) + ' ' + esc(r.contact) + '</div>' : '') +
      (r.photo_id ? '<img class="thumb" style="margin-top:8px" data-act="photo" data-src="/api/photo/' + r.photo_id + '" src="/api/photo/' + r.photo_id + '" alt="">' : '') +
      (r.task_emp ? '<div class="small" style="margin-top:6px">' + ic('route', 13) + ' ' + esc(r.task_emp) + ' — ' + (TASK[r.task_status] || ['', ''])[0] + '</div>' : '') +
      (r.reply ? '<div class="small muted" style="margin-top:4px">الرد: ' + esc(r.reply) + '</div>' : '') +
      (r.rating ? '<div style="margin-top:4px"><span class="stars">' + '★'.repeat(r.rating) + '</span><span class="faint">' + '★'.repeat(5 - r.rating) + '</span> ' + esc(r.rate_note || '') + '</div>' : '') + '</div>' +
      '<div class="acts">' + (['new', 'ok'].includes(r.status) ? (r.status === 'new' ? '<button class="btn sm primary" data-act="rqst" data-id="' + r.id + '" data-s="ok">' + ic('check', 14) + 'تأكيد</button>' : '') + (!r.task_id ? '<button class="btn sm" data-act="rqassign" data-id="' + r.id + '">' + ic('route', 14) + 'حوّل لموظف</button>' : '') + '<button class="btn sm go" data-act="rqst" data-id="' + r.id + '" data-s="sent">' + (r.kind === 'maint' ? 'اتصلح' : 'اتسلّم') + '</button><button class="btn sm ghost danger" data-act="rqst" data-id="' + r.id + '" data-s="no">إلغاء</button>' : '') +
      (r.client_phone && !inDrawer ? '<a class="btn sm ghost icon" target="_blank" rel="noopener" href="' + K.wa(r.client_phone) + '" aria-label="واتساب">' + ic('wa', 15) + '</a>' : '') + '</div></div>';
  }
  R.requests = async function () {
    const f = S.rqf || 'open';
    const d = await get('/api/requests?status=' + f); refreshCounts();
    view().innerHTML = '<div class="ph"><div><h1>الطلبات</h1><div class="sub">اللي العملاء بيبعتوه من اللينك — طلب ورق أو صيانة. العميل بيشوف الحالة أول بأول.</div></div><div class="acts"><div class="seg"><button data-act="rqf" data-k="open" class="' + (f === 'open' ? 'on' : '') + '">مفتوحة</button><button data-act="rqf" data-k="done" class="' + (f === 'done' ? 'on' : '') + '">خلصت</button><button data-act="rqf" data-k="all" class="' + (f === 'all' ? 'on' : '') + '">الكل</button></div></div></div>' +
      '<div class="reqs">' + (d.requests.map(r => reqCard(r)).join('') || '<div class="card empty"><b>' + (f === 'open' ? 'مفيش طلبات مفتوحة' : 'مفيش طلبات') + '</b>ابعت للعملاء لينكاتهم من صفحة العميل عشان يطلبوا منها.</div>') + '</div>';
  };
  ACT.rqf = b => { S.rqf = b.dataset.k; R.requests(); };
  ACT.rqst = async b => {
    const s = b.dataset.s; let reply = null;
    if (s === 'no') { if (!await confirm('إلغاء الطلب؟', 'العميل هيشوف إنه اتلغى.', 'إلغاء الطلب', true)) return; }
    await post('/api/requests/status', { id: +b.dataset.id, status: s, reply }).catch(err);
    toast(s === 'ok' ? 'اتأكد — العميل هيشوف إنه بيتجهز' : s === 'sent' ? 'خلص ✓' : 'اتلغى'); refreshCounts();
    if ($('.drawer')) { const id = $('.drawer [data-act=newTask]'); if (id) clientDrawer(id.dataset.client, 'req'); } else R[S.page]();
  };
  ACT.rqassign = b => {
    const E = S.boot.employees.filter(e => e.active);
    const m = modal('<div class="modal-hd"><h3>حوّل الطلب لموظف</h3></div><p class="muted small" style="margin-bottom:10px">هتتعمل مهمة على موبايله، والعميل هيشوف اسمه ولما يكون في الطريق.</p><div style="display:grid;gap:8px">' + E.map(e => '<button class="btn" style="justify-content:flex-start;min-height:52px" data-e="' + e.id + '">' + av(e, 'sm') + esc(e.name) + '<span class="faint small" style="margin-inline-start:auto">' + esc(e.job || '') + '</span></button>').join('') + '</div>');
    $$('[data-e]', m.el).forEach(x => x.onclick = () => busy(x, async () => { await post('/api/requests/assign', { id: +b.dataset.id, emp_id: x.dataset.e }); m.close(); toast('اتحوّلت لـ ' + empById(x.dataset.e).name); refreshCounts(); if ($('.drawer')) { const c = $('.drawer [data-act=newTask]'); if (c) clientDrawer(c.dataset.client, 'req'); } else R[S.page](); }));
  };

  /* ── المتابعات ── */
  R.follow = async function () {
    const d = await get('/api/follow'); const td = d.today, wk = addDays(td, 7);
    const G = [
      ['متأخرة', 'stop', d.rows.filter(c => c.next_follow && c.next_follow < td)],
      ['النهارده', 'hivis', d.rows.filter(c => c.next_follow === td)],
      ['الأسبوع ده', 'sky', d.rows.filter(c => c.next_follow > td && c.next_follow <= wk)],
      ['محدش كلمهم من شهر', '', d.rows.filter(c => !c.next_follow && (!c.last_f || c.last_f.slice(0, 10) < addDays(td, -30)))]
    ];
    view().innerHTML = '<div class="ph"><div><h1>المتابعات</h1><div class="sub">مين محتاج تكلمه النهارده. سجّل المكالمة وحدد المتابعة الجاية — وهو يطلع هنا في ميعاده.</div></div></div>' +
      G.map(([t, k, list]) => list.length ? '<div class="due-group"><h3>' + chip(String(list.length), k) + t + '</h3><div class="card list" style="padding:0">' + list.map(c => '<div class="it" data-act="client" data-id="' + c.id + '" style="border-top:0;border-bottom:1px solid var(--line)"><span class="ic">' + ic('store', 16) + '</span><div class="grow" style="min-width:0"><b>' + esc(c.name) + '</b>' + (c.grp ? ' <span class="faint small">' + esc(c.grp) + '</span>' : '') + '<div class="meta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (c.last_note ? esc(c.last_note) : 'مفيش متابعات قبل كده') + (c.last_f ? ' · ' + dm(c.last_f) : '') + '</div></div>' + (c.next_follow ? '<span class="small muted">' + dm(c.next_follow) + '</span>' : '') + (c.phone ? '<a class="btn sm ghost icon" href="tel:' + esc(c.phone) + '" aria-label="اتصال" onclick="event.stopPropagation()">' + ic('phone', 15) + '</a><a class="btn sm ghost icon" target="_blank" rel="noopener" href="' + K.wa(c.phone) + '" aria-label="واتساب" onclick="event.stopPropagation()">' + ic('wa', 15) + '</a>' : '') + '</div>').join('') + '</div></div>' : '').join('') +
      (G.every(g => !g[2].length) ? '<div class="card empty"><b>مفيش حد مستني مكالمة</b>لما تسجّل متابعة لعميل وتحدد ميعاد، هيظهر هنا في يومه.</div>' : '');
  };

  /* ════════ الإعدادات ════════ */
  R.settings = async function () {
    await loadBoot(); tabs();
    const s = S.boot.settings;
    const sec = sessionStorage.getItem('tq-set') || S.setSec || (has('settings') ? 'company' : 'me'); sessionStorage.removeItem('tq-set'); S.setSec = sec;
    const NAV = (has('settings') ? (S.mode === 'pacs' ? [['company', 'المركز'], ['users', 'المستخدمين والصلاحيات']] : [['company', 'الشركة'], ['shift', 'الدوام'], ['track', 'الموقع والتتبع'], ['portal', 'لينك العميل'], ['pay', 'المرتبات'], ['users', 'المستخدمين والصلاحيات']]) : []).concat([['me', 'حسابي والإشعارات']], has('settings') ? [['data', 'النسخة الاحتياطية']] : []);
    if (!NAV.some(x => x[0] === sec)) { S.setSec = 'me'; return R.settings(); }
    const F = (k, label, attrs) => '<label class="field"><span>' + label + '</span><input class="input" name="' + k + '" value="' + esc(s[k]) + '" ' + (attrs || '') + '></label>';
    const T = (k, label, ph) => '<label class="field"><span>' + label + '</span><textarea class="input" name="' + k + '" placeholder="' + esc(ph || '') + '">' + esc(s[k]) + '</textarea></label>';
    const save = '<div class="row"><span class="grow"></span><button class="btn primary">حفظ</button></div>';
    const body = {
      company: '<form class="card pad" data-save><section><h3>الشركة</h3>' + F('company', 'اسم الشركة') + F('tagline', 'سطر تحت الاسم') + F('currency', 'العملة', 'style="max-width:160px"') + '<div class="field"><span>اللوجو</span><div class="row"><span class="mark" style="width:56px;height:56px">' + '<img src="' + esc(s.logo || '/icons/icon.svg') + '">' + '</span><button type="button" class="btn sm" id="logo">' + ic('camera', 15) + 'اختار صورة</button>' + (s.logo ? '<button type="button" class="btn sm ghost danger" id="nologo">شيله</button>' : '') + '</div></div>' + save + '</section></form>',
      shift: '<form class="card pad" data-save><section><h3>الدوام الافتراضي</h3><p class="muted small">ينفع تغيّره لكل موظف لوحده من صفحته.</p><div class="grid3">' + F('shift_start', 'بداية الوردية', 'type="time"') + F('shift_end', 'نهاية الوردية', 'type="time"') + F('grace_min', 'سماح التأخير (دقيقة)', 'type="number" min="0"') + '</div><div class="field"><span>أيام الأجازة</span>' + dayPick('rest', s.rest_days) + '</div>' + T('purposes', 'أسباب الزيارة (سطر لكل سبب)') + '<label class="check"><input type="checkbox" name="chat_on" ' + (s.chat_on === '1' ? 'checked' : '') + '> الموظفين يقدروا يكلموا الإدارة من التطبيق</label>' + save + '</section></form>',
      track: '<form class="card pad" data-save><section><h3>الموقع والتتبع</h3><label class="check"><input type="checkbox" name="require_location" ' + (s.require_location === '1' ? 'checked' : '') + '> لازم الموقع يكون شغال عشان يسجّل حضور</label><div class="grid3">' + F('ping_min', 'يبعت موقعه كل (دقيقة)', 'type="number" min="1" max="120"') + F('arrive_radius', 'يعتبر وصل للعميل على بعد (متر)', 'type="number" min="30"') + '<label class="field"><span>لو سجّل بعيد عن المقر</span><select class="input" name="geofence"><option value="off" ' + (s.geofence === 'off' ? 'selected' : '') + '>عادي</option><option value="warn" ' + (s.geofence === 'warn' ? 'selected' : '') + '>يتسجل وتبان علامة</option><option value="block" ' + (s.geofence === 'block' ? 'selected' : '') + '>ممنوع يسجّل</option></select></label></div>' + save + '</section></form>' +
        '<div class="card pad" style="margin-top:16px"><section><div class="row"><h3 class="grow">مقرات الشغل</h3><button class="btn sm" id="site-add">' + ic('plus', 15) + 'مقر</button></div><p class="muted small">الحضور بيتحسب على أقرب مقر. دوس على الخريطة عشان تحدد المكان.</p>' + (S.boot.sites.map(x => '<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">' + ic('pin', 16) + '<b class="grow">' + esc(x.name) + '</b><span class="muted small">نطاق ' + x.radius + ' م</span><button class="btn sm ghost" data-act="site" data-id="' + x.id + '">' + ic('edit', 14) + '</button></div>').join('') || '<div class="muted small">مفيش مقرات — الحضور بيتسجل من أي مكان.</div>') + '</section></div>',
      portal: '<form class="card pad" data-save><section><h3>لينك العميل</h3><p class="muted small">اللي العميل يقدر يطلبه من صفحته.</p>' + T('order_items', 'الأصناف (سطر لكل صنف)') + T('devices', 'أنواع الأجهزة في طلب الصيانة') + save + '</section></form>',
      pay: '<form class="card pad" data-save><section><h3>قواعد المرتبات</h3><div class="grid2">' + F('pay_days', 'أيام الشهر في الحساب', 'type="number" min="20" max="31"') + F('late_mult', 'مضاعف خصم التأخير', 'type="number" step="0.25" min="0"') + F('absent_mult', 'مضاعف خصم الغياب', 'type="number" step="0.25" min="0"') + F('ot_mult', 'مضاعف الإضافي', 'type="number" step="0.25" min="0"') + '</div><p class="muted small">أجر اليوم = المرتب ÷ أيام الشهر. دقيقة التأخير = أجر اليوم ÷ دقايق الوردية × المضاعف.</p>' + save + '</section></form>',
      users: '<div class="card pad"><section><div class="row"><h3 class="grow">المستخدمين والصلاحيات</h3>' + (S.me.role === 'admin' ? '<button class="btn sm primary" id="u-add">' + ic('plus', 15) + 'مستخدم</button>' : '') + '</div><p class="muted small">كل مستخدم بيشوف الأقسام اللي معلّم عليها بس — مثلا موظف الاستقبال: «حالات المرضى (QR)» و«الباكس». المدير العام بيشوف كل حاجة.</p><div id="ulist" class="muted small">بيحمّل…</div></section></div>',
      me: '<form class="card pad" id="pwf"><section><h3>حسابي</h3><p class="muted small">' + esc(S.me.name) + ' · @' + esc(S.me.username) + '</p><div class="grid2"><label class="field"><span>الباسورد الحالي</span><input class="input" type="password" name="old" autocomplete="current-password" required></label><label class="field"><span>الباسورد الجديد</span><input class="input" type="password" name="pw" autocomplete="new-password" minlength="6" required></label></div><div class="row"><span class="grow"></span><button class="btn primary">غيّر الباسورد</button></div></section></form>' +
        '<div class="card pad" style="margin-top:16px"><section><h3>الإشعارات على الجهاز ده</h3><p class="muted small">حضور وانصراف، طلبات العملاء، الرسايل، ووصول الموظفين — حتى والبرنامج مقفول.</p><div class="row"><button class="btn hivis" id="push-on">' + ic('bell', 16) + 'شغّل الإشعارات</button><button class="btn" id="push-test">جرّب</button></div></section></div>' +
        '<div class="card pad" style="margin-top:16px"><section><h3>الشكل</h3><div class="seg"><button data-act="th" data-v="auto" class="' + (K.theme.get() === 'auto' ? 'on' : '') + '">زي الجهاز</button><button data-act="th" data-v="light" class="' + (K.theme.get() === 'light' ? 'on' : '') + '">فاتح</button><button data-act="th" data-v="dark" class="' + (K.theme.get() === 'dark' ? 'on' : '') + '">غامق</button></div></section></div>',
      data: '<div class="card pad"><section><h3>النسخة الاحتياطية</h3><p class="muted small">ملف واحد فيه كل حاجة (موظفين، حضور، عملاء، حسابات، طلبات). احتفظ بيه في مكان آمن.</p><div class="row"><a class="btn primary" href="/api/backup">' + ic('download', 16) + 'نزّل نسخة دلوقتي</a></div></section></div><div class="card pad" style="margin-top:16px"><section><h3>سجل العمليات</h3><div id="logs" class="small muted">بيحمّل…</div></section></div>'
    };
    view().innerHTML = '<div class="ph"><div><h1>الإعدادات</h1></div></div><div class="set"><nav class="set-nav">' + NAV.map(([k, t]) => '<button data-act="setsec" data-k="' + k + '" class="' + (k === sec ? 'on' : '') + '">' + t + '</button>').join('') + '</nav><div>' + body[sec] + '</div></div>';
    $$('[data-save]').forEach(f => f.onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => {
      const o = form(f); ['require_location', 'chat_on'].forEach(k => { if (k in o) o[k] = o[k] ? '1' : '0'; });
      const dp = $('[data-days]', f); if (dp) o.rest_days = readDays(dp);
      if (S.newLogo !== undefined) { o.logo = S.newLogo; delete S.newLogo; }
      await post('/api/settings', o); toast('اتحفظ'); await loadBoot(); shell(); tabs(); R.settings();
    }); });
    const lg = $('#logo'); if (lg) lg.onclick = async () => { const p = await K.pickImage(256, .85); if (p) { S.newLogo = p; $('.set .mark').innerHTML = '<img src="' + p + '">'; } };
    const nl = $('#nologo'); if (nl) nl.onclick = () => { S.newLogo = ''; $('.set .mark').innerHTML = '<img src="/icons/icon.svg">'; };
    const sa = $('#site-add'); if (sa) sa.onclick = () => siteForm({});
    const pw = $('#pwf'); if (pw) pw.onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => { await post('/api/me/password', form(pw)); pw.reset(); toast('الباسورد اتغيّر'); }); };
    const po = $('#push-on'); if (po) po.onclick = () => busy(po, async () => { await K.push('/api'); toast('الإشعارات اشتغلت ✓'); });
    const pt = $('#push-test'); if (pt) pt.onclick = () => busy(pt, async () => { const r = await post('/api/push/test'); toast(r.devices ? 'اتبعت لـ ' + r.devices + ' جهاز' : 'شغّل الإشعارات الأول', r.devices ? '' : 'err'); });
    if (sec === 'users') loadUsers();
    if (sec === 'data') get('/api/log').then(d => { $('#logs').innerHTML = d.rows.length ? '<div class="tbl-wrap"><table class="tbl"><tbody>' + d.rows.slice(0, 100).map(r => '<tr><td class="tnum xs" style="white-space:nowrap">' + dmy(r.at) + ' ' + hm(r.at) + '</td><td>' + esc(r.who) + '</td><td class="muted">' + esc(r.action) + '</td><td class="muted xs">' + esc(String(r.detail || '').slice(0, 80)) + '</td></tr>').join('') + '</tbody></table></div>' : 'فاضي'; });
  };
  ACT.setsec = b => { S.setSec = b.dataset.k; R.settings(); };
  ACT.th = b => { K.theme.set(b.dataset.v); R.settings(); };
  ACT.site = b => siteForm(S.boot.sites.find(x => x.id === b.dataset.id));
  function siteForm(x) {
    const m = modal('<div class="modal-hd"><h3>' + (x.id ? 'تعديل المقر' : 'مقر جديد') + '</h3></div><form id="stf" style="display:grid;gap:12px"><div class="grid2"><label class="field"><span>الاسم</span><input class="input" name="name" value="' + esc(x.name || '') + '" required></label><label class="field"><span>النطاق (متر)</span><input class="input" type="number" name="radius" min="50" value="' + (x.radius || 250) + '"></label></div><div class="minimap" id="st-map"></div><input type="hidden" name="lat" value="' + (x.lat || '') + '"><input type="hidden" name="lng" value="' + (x.lng || '') + '"><button type="button" class="btn sm" id="st-here" style="justify-self:start">' + ic('pin', 15) + 'استخدم مكاني الحالي</button><div class="modal-ft">' + (x.id ? '<button type="button" class="btn danger" id="st-del" style="margin-inline-end:auto">مسح</button>' : '') + '<button type="button" class="btn" data-close>رجوع</button><button class="btn primary">حفظ</button></div></form>', { wide: true });
    const mm = L.map($('#st-map', m.el)); K.tiles(mm); let mk, ci;
    const set = (lat, lng) => { $('[name=lat]', m.el).value = lat; $('[name=lng]', m.el).value = lng; const r = +$('[name=radius]', m.el).value || 250; if (mk) { mk.setLatLng([lat, lng]); ci.setLatLng([lat, lng]).setRadius(r); } else { mk = L.marker([lat, lng], { icon: K.clientPin() }).addTo(mm); ci = L.circle([lat, lng], { radius: r, color: '#FF3B47', weight: 1, fillOpacity: .08 }).addTo(mm); } };
    if (x.lat) { mm.setView([x.lat, x.lng], 16); set(x.lat, x.lng); } else mm.setView([30.05, 31.24], 8);
    mm.on('click', e => set(e.latlng.lat, e.latlng.lng)); setTimeout(() => mm.invalidateSize(), 150);
    $('[name=radius]', m.el).oninput = () => { if (ci) ci.setRadius(+$('[name=radius]', m.el).value || 250); };
    $('#st-here', m.el).onclick = ev => busy(ev.target, async () => { const p = await K.locate(); if (!p) throw new Error('مش قادر أحدد مكانك'); set(p.lat, p.lng); mm.setView([p.lat, p.lng], 17); });
    const del = $('#st-del', m.el); if (del) del.onclick = async () => { await post('/api/sites/del', { id: x.id }); m.close(); R.settings(); };
    $('#stf', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => { await post('/api/sites', Object.assign(form($('#stf', m.el)), { id: x.id })); m.close(); toast('اتحفظ'); R.settings(); }); };
  }
  async function loadUsers() {
    const d = await get('/api/users'), AP = d.all_perms || S.allPerms || {}, isA = S.me.role === 'admin';
    const PI = { team: 'users', pay: 'cash', clients: 'store', cases: 'qr', pacs: 'scan', settings: 'gear' };
    $('#ulist').innerHTML = '<div class="ulist">' + d.users.map(u => '<div class="urow"><span class="uav">' + esc((u.name || '?').trim().charAt(0)) + '</span><div class="grow" style="min-width:0"><b>' + esc(u.name) + '</b> <span class="faint small" dir="ltr">@' + esc(u.username) + '</span>' +
      '<div class="uperms">' + (u.role === 'admin' ? '<span class="chip brand">' + ic('star', 12) + ' مدير عام — كل الصلاحيات</span>' : u.perms.map(k => '<span class="chip">' + ic(PI[k] || 'check', 12) + ' ' + esc((AP[k] || k).split(' — ')[0].split(' (')[0]) + '</span>').join('')) + '</div>' +
      '<div class="xs faint">' + (u.last_login_at ? 'آخر دخول ' + dmy(u.last_login_at) + ' ' + hm(u.last_login_at) : 'لسه مدخلش') + '</div></div>' +
      (isA && u.id !== S.me.id ? '<div class="row" style="gap:6px"><button class="btn sm" data-act="uedit" data-id="' + u.id + '">' + ic('edit', 14) + 'الصلاحيات</button><button class="btn sm ghost" data-act="ureset" data-id="' + u.id + '" title="باسورد جديد">' + ic('key', 14) + '</button><button class="btn sm ghost danger" data-act="udel" data-id="' + u.id + '">' + ic('trash', 14) + '</button></div>' : '') + '</div>').join('') + '</div>';
    S.users = d.users;
    const a = $('#u-add'); if (a) a.onclick = () => userForm({}, AP);
  }
  function permBoxes(sel, AP, role) {
    const PI = { team: 'users', pay: 'cash', clients: 'store', cases: 'qr', pacs: 'scan', settings: 'gear' };
    return '<div class="perm-role seg"><button type="button" data-role="manager" class="' + (role !== 'admin' ? 'on' : '') + '">صلاحيات محددة</button><button type="button" data-role="admin" class="' + (role === 'admin' ? 'on' : '') + '">مدير عام (كل حاجة)</button></div>' +
      '<div class="perm-grid" ' + (role === 'admin' ? 'hidden' : '') + '>' + Object.entries(AP).map(([k, t]) => '<label class="perm"><input type="checkbox" name="p_' + k + '" ' + (sel.includes(k) ? 'checked' : '') + '><span class="pi">' + ic(PI[k] || 'check', 18) + '</span><span>' + esc(t) + '</span><i>' + ic('check', 13) + '</i></label>').join('') + '</div>';
  }
  function wirePerms(root) {
    let role = $('.perm-role .on', root).dataset.role;
    $$('.perm-role button', root).forEach(b => b.onclick = () => { role = b.dataset.role; $$('.perm-role button', root).forEach(x => x.classList.toggle('on', x === b)); $('.perm-grid', root).hidden = role === 'admin'; });
    return () => ({ role, perms: $$('.perm input:checked', root).map(i => i.name.slice(2)) });
  }
  function credModal(r, t) { modal('<div class="modal-hd"><h3>' + (t || 'بيانات الدخول') + '</h3></div><div class="secret"><span class="small muted">اسم الدخول</span><code dir="ltr">' + esc(r.username) + '</code><span class="small muted">الباسورد</span><code dir="ltr">' + esc(r.password) + '</code></div><p class="small muted" style="margin-top:10px">بيدخل من نفس لينك لوحة الإدارة: <b dir="ltr">' + esc(location.host) + '</b></p><div class="modal-ft"><button class="btn" data-act="copy" data-text="' + esc('لينك: ' + location.origin + '\nاسم الدخول: ' + r.username + '\nالباسورد: ' + r.password) + '">' + ic('copy', 15) + 'انسخ</button><button class="btn primary" data-close>تمام</button></div>'); }
  function userForm(u, AP) {
    const isNew = !u.id;
    const m = modal('<div class="modal-hd"><h3>' + (isNew ? 'مستخدم جديد' : 'صلاحيات ' + esc(u.name)) + '</h3></div><form id="uf" style="display:grid;gap:12px">' +
      (isNew ? '<div class="grid2"><label class="field"><span>الاسم</span><input class="input" name="name" required></label><label class="field"><span>اسم الدخول (إنجليزي)</span><input class="input" name="username" dir="ltr" required></label></div>' : '') +
      '<div class="field"><span>يقدر يفتح</span>' + permBoxes(u.perms || ['cases', 'pacs'], AP, u.role) + '</div>' +
      '<div class="modal-ft"><button type="button" class="btn" data-close>رجوع</button><button class="btn primary">' + (isNew ? 'إضافة' : 'حفظ') + '</button></div></form>', { wide: true });
    const read = wirePerms(m.el);
    $('#uf', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => {
      const p = read();
      if (isNew) { const f = form($('#uf', m.el)); const r = await post('/api/users', { name: f.name, username: f.username, role: p.role, perms: p.perms }); m.close(); credModal(r); }
      else { await post('/api/users/perms', { id: u.id, role: p.role, perms: p.perms }); m.close(); toast('الصلاحيات اتحفظت — هتتطبق أول ما يعمل تحديث'); }
      loadUsers();
    }); };
  }
  ACT.uedit = b => userForm(S.users.find(x => x.id === b.dataset.id), S.allPerms);
  ACT.ureset = async b => { const u = S.users.find(x => x.id === b.dataset.id); if (!await confirm('باسورد جديد لـ ' + u.name + '؟', 'الباسورد القديم هيوقف ويتعمله خروج من كل الأجهزة.', 'غيّره')) return; const r = await post('/api/users/reset', { id: u.id }); credModal(r, 'الباسورد الجديد'); };

  ACT.udel = async b => { if (await confirm('مسح المدير ده؟', '', 'مسح', true)) { await post('/api/users/del', { id: b.dataset.id }).catch(err); loadUsers(); } };

  /* ════ باركود لينك العميل — استيكر يتلزق على الطابعة (نفس Ozarex) ════ */
  function qrSvg(text, px) {
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(), m = 2, sz = n + m * 2; let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + sz + ' ' + sz + '" width="' + px + '" height="' + px + '" shape-rendering="crispEdges"><rect width="' + sz + '" height="' + sz + '" fill="#fff"/><path d="' + d + '" fill="#0F172A"/></svg>';
  }
  const QS_CSS = '.qs{width:64mm;background:#fff;color:#0F172A;border:1.5px dashed #94A3B8;border-radius:5mm;padding:4mm 4mm 3.5mm;text-align:center;font-family:Tahoma,Arial,sans-serif;box-sizing:border-box;break-inside:avoid;page-break-inside:avoid}' +
    '.qs.big{width:auto;max-width:340px;margin:auto;border-style:solid;border-color:#E2E8F0;padding:18px;border-radius:22px;box-shadow:0 12px 30px -18px rgba(15,23,42,.4)}' +
    '.qs-h{display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px}.qs-h img{width:22px;height:22px;object-fit:contain;border-radius:5px}.qs-h b{font-size:13px}' +
    '.qs-c{font-weight:800;font-size:15px;margin:2mm 0 1mm;line-height:1.3}.qs.big .qs-c{font-size:19px;margin:8px 0 4px}' +
    '.qs-q svg{display:block;margin:0 auto;max-width:100%;height:auto}.qs-t{font-weight:700;font-size:12px;margin-top:1.5mm}.qs.big .qs-t{font-size:14px;margin-top:6px}' +
    '.qs-s{font-size:10px;color:#475569;margin-top:.5mm}.qs.big .qs-s{font-size:12.5px}.qs-u{font-family:monospace;font-size:10.5px;color:#0F172A;direction:ltr;margin-top:1mm;letter-spacing:.3px}.qs.big .qs-u{font-size:13px;margin-top:6px}';
  const portalUrl = c => location.origin + '/c/' + c.portal_code;
  function sticker(c, big) {
    const u = portalUrl(c), logo = S.boot.settings.logo;
    return '<div class="qs' + (big ? ' big' : '') + '"><div class="qs-h">' + (logo ? '<img src="' + esc(logo) + '" alt="">' : '') + '<b>' + esc(S.boot.settings.company) + '</b></div>' +
      '<div class="qs-c">' + esc(c.name) + '</div><div class="qs-q">' + qrSvg(u, big ? 240 : 170) + '</div>' +
      '<div class="qs-t">📱 امسح الكود بكاميرا الموبايل</div><div class="qs-s">حسابكم · سحبكم كل شهر · اطلبوا ورق أو صيانة</div><div class="qs-u">' + esc(u.replace(/^https?:\/\//, '')) + '</div></div>';
  }
  async function qrModal(cid) {
    const c = (await get('/api/clients/one?id=' + encodeURIComponent(cid))).client;
    if (!c.portal_on) return toast('شغّل اللينك الأول', 'err');
    if (!$('#qs-css')) { const st = document.createElement('style'); st.id = 'qs-css'; st.textContent = QS_CSS; document.head.appendChild(st); }
    const m = modal('<div class="modal-hd"><h3>باركود ' + esc(c.name) + '</h3><button class="btn ghost icon" data-close aria-label="قفل">' + ic('x') + '</button></div><div style="padding:6px 0">' + sticker(c, true) + '<p class="small muted" style="text-align:center;margin-top:12px">اطبعه والزقه على الطابعة عند المركز. لو عملت «لينك جديد» الباركود القديم بيقف — اطبع الجديد.</p></div>' +
      '<div class="modal-ft"><button class="btn" data-close>قفل</button><button class="btn" id="qr-png">' + ic('download', 16) + 'صورة</button><button class="btn primary" id="qr-print">' + ic('print', 16) + 'اطبع الاستيكر</button></div>');
    $('#qr-print', m.el).onclick = () => qrPrint([c]);
    $('#qr-png', m.el).onclick = () => qrPng(c);
  }
  function qrPrint(list) {
    const w = window.open('', '_blank'); if (!w) return toast('المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة', 'err');
    w.document.open();
    w.document.write('<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>باركود المراكز</title><style>@page{size:A4;margin:8mm}body{margin:0;background:#fff}.g{display:flex;flex-wrap:wrap;gap:5mm;justify-content:center}' + QS_CSS + '</style></head><body><div class="g">' +
      list.map(c => sticker(c, false)).join('') + '</div><script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>');
    w.document.close();
  }
  function qrPng(c) {
    const u = portalUrl(c), q = qrcode(0, 'M'); q.addData(u); q.make();
    const n = q.getModuleCount(), cell = 12, pad = 40, qs = n * cell, W = qs + pad * 2, H = qs + pad * 2 + 120;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#0F172A';
    g.font = 'bold 30px Tahoma, Arial'; g.textAlign = 'center'; g.direction = 'rtl'; g.fillText(String(c.name).slice(0, 40), W / 2, 56);
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect(pad + k * cell, 80 + r * cell, cell, cell);
    g.font = '22px monospace'; g.direction = 'ltr'; g.fillText(u.replace(/^https?:\/\//, ''), W / 2, 80 + qs + 40);
    g.font = 'bold 20px Tahoma, Arial'; g.direction = 'rtl'; g.fillText('امسح الكود — حسابكم وطلب الورق', W / 2, 80 + qs + 76);
    const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = 'باركود-' + String(c.name).replace(/[\\/:*?"<>|]/g, '') + '.png'; document.body.appendChild(a); a.click(); a.remove();
  }
  ACT.qr = b => qrModal(b.dataset.id).catch(err);
  ACT.qrall = async () => { const cl = (await clientsList()).filter(c => c.status === 'active' && c.portal_on); if (!cl.length) return toast('مفيش عملاء ليهم لينك', 'err'); if (!$('#qs-css')) { const st = document.createElement('style'); st.id = 'qs-css'; st.textContent = QS_CSS; document.head.appendChild(st); } qrPrint(cl); };

  /* ════ حالات المرضى: لينك منفصل للمركز بباسوورد (/k/xxxxxxxx) — نفس Ozarex ════ */
  const capi = (method, path, body) => K.api(method, '/api/portal/cases' + path, body);
  async function casesModal(cid, fresh) {
    const c = (await get('/api/clients/one?id=' + encodeURIComponent(cid))).client;
    const r = await capi('GET', '?cid=' + encodeURIComponent(cid)); const s = r.site;
    if (!s) {
      const m = modal('<div class="modal-hd"><h3>حالات المرضى — ' + esc(c.name) + '</h3><button class="btn ghost icon" data-close aria-label="قفل">' + ic('x') + '</button></div>' +
        '<p class="muted">لينك منفصل للمركز بباسوورد، يفتحه من الكمبيوتر بتاعه ويرفع PDF الحالة، ويطلعله باركود يتلزق للمريض. المريض يمسحه ويشوف حالته على موبايله.</p>' +
        '<ul style="margin:10px 18px 14px;line-height:1.9;font-size:13.5px;color:var(--ink-2)"><li>الملف بيتشفّر على جهاز المركز، والأصل بيفضل عنده.</li><li>نسخة مشفّرة مؤقتة على السيرفر أول 7 أيام بس — بعدها المريض بيفتح من جهاز المركز لايف (لو صفحته مفتوحة).</li><li>الباسوورد مختلف عن لينك الحساب.</li></ul>' +
        '<label class="field"><span>الباسوورد (سيبه فاضي ونعملك واحد 6 أرقام)</span><input class="input" id="cs-pw" maxlength="40" placeholder="مثلاً 482913"></label>' +
        '<div class="modal-ft"><button class="btn" data-close>إلغاء</button><button class="btn primary" id="cs-go">' + ic('file', 16) + 'اعمل لينك الحالات</button></div>');
      $('#cs-go', m.el).onclick = ev => busy(ev.currentTarget, async () => { const x = await capi('POST', '/make', { cid, name: c.name, wa: c.phone || '', pass: $('#cs-pw', m.el).value || '' }); m.close(); casesModal(cid, x.pass); if (S.page === 'cases') R.cases(); });
      return;
    }
    if (!s.wa && c.phone) capi('POST', '/wa', { cid, wa: c.phone, ifEmpty: true }).catch(() => {});
    const u = location.origin + '/k/' + s.code, fixedU = location.origin + '/h/' + s.pub;
    const msg = 'السلام عليكم ' + c.name + ' 🌿\nده لينك «حالات المرضى» من *' + S.boot.settings.company + '*:\n' + u + (fresh ? '\nالباسوورد: ' + fresh : '') + '\n\nافتحوه من كمبيوتر المركز، اسحبوا PDF الحالة، وهيطلعلكم باركود تلزقوه للمريض — المريض يمسحه ويشوف أشعته على موبايله.\nسيبوا الصفحة مفتوحة على الكمبيوتر عشان الحالات القديمة تفضل تفتح.';
    const m = modal('<div class="modal-hd"><h3>حالات المرضى — ' + esc(c.name) + '</h3><button class="btn ghost icon" data-close aria-label="قفل">' + ic('x') + '</button></div>' +
      (fresh ? '<div class="secret" style="text-align:center;margin-bottom:12px"><span class="small muted">الباسوورد (اكتبه دلوقتي — مش هيظهر تاني)</span><code style="font-size:30px;letter-spacing:4px;text-align:center">' + esc(fresh) + '</code></div>' : '') +
      '<div class="linkbox">' + ic('link', 18) + '<code>' + esc(u) + '</code><button class="btn sm" data-act="copy" data-text="' + esc(u) + '">' + ic('copy', 14) + 'نسخ</button><a class="btn sm" target="_blank" rel="noopener" href="' + esc(u) + '">' + ic('ext', 14) + 'فتح</a></div>' +
      '<div class="kv" style="margin-top:12px"><div><span>الحالة</span><b style="font-size:17px;color:' + (s.online ? 'var(--go)' : 'var(--ink-2)') + '">' + (s.online ? '● متصل دلوقتي' : (s.last_seen ? 'آخر دخول ' + esc(String(s.last_seen).slice(0, 16)) : 'لسه مدخلش')) + '</b></div><div><span>حالات</span><b>' + s.cases + '</b></div><div><span>مرة اتفتحت</span><b>' + s.views + '</b></div></div>' +
      (s.pub ? '<div class="fixqr"><div class="fixqr-q">' + qrSvg(fixedU, 150) + '</div><div class="grow"><b>' + ic('qr', 16) + ' الباركود الثابت للورق</b><p class="small muted">باركود واحد للمركز يتحط في هيدر سيرفر الطباعة فيتطبع على كل التقارير — المريض يمسحه ويكتب موبايله وأول اسمه ويوصل لحالته.</p><div class="row wrap" style="gap:6px;margin-top:8px"><button class="btn sm primary" id="fx-print">' + ic('print', 14) + 'اطبع</button><button class="btn sm" id="fx-png">' + ic('download', 14) + 'صورة</button><button class="btn sm" data-act="copy" data-text="' + esc(fixedU) + '">' + ic('copy', 14) + 'نسخ اللينك</button></div></div></div>' : '') +
      (s.pub ? '<p class="small muted" style="margin-top:12px">📌 الباركود الثابت للورق (المريض يكتب موبايله وأول اسمه): <a href="' + esc(fixedU) + '" target="_blank" rel="noopener" style="direction:ltr;unicode-bidi:isolate;color:var(--brand-2)">' + esc(fixedU) + '</a>' + (s.fixed ? '' : ' — <b>موقوف من المركز</b>') + '</p>' : '') +
      '<div class="row" style="margin-top:12px"><span class="small" style="white-space:nowrap;font-weight:700">💬 واتساب طلبات المرضى</span><input class="input" id="cs-wa-n" value="' + esc(s.wa || '') + '" placeholder="' + esc(c.phone || '01xxxxxxxxx') + '" style="direction:ltr;text-align:right"><button class="btn sm" id="cs-wa-s">حفظ</button></div>' +
      '<p class="small muted" style="margin-top:6px">المريض اللي مايلاقيش نتيجته بيبعت على الرقم ده' + (s.wa ? '' : ' (فاضي → بيتبعت على رقم المركز)') + '.' + (s.asks ? ' <b style="color:var(--go)">' + s.asks + ' طلب مفتوح</b>' : '') + '</p>' +
      (!s.active ? '<p class="small" style="color:var(--stop);font-weight:700;margin-top:6px">⏸ اللينك موقوف — المركز مش هيقدر يدخل والمرضى مش هيفتحوا.</p>' : '') +
      '<div class="modal-ft"><button class="btn ghost" id="cs-rt">' + ic('refresh', 15) + 'لينك جديد</button><button class="btn ghost" id="cs-st">' + (s.active ? '⏸ إيقاف' : '▶ تشغيل') + '</button><button class="btn" id="cs-pw2">' + ic('key', 15) + 'باسوورد جديد</button>' + (c.phone ? '<a class="btn go" target="_blank" rel="noopener" href="' + K.wa(c.phone, msg) + '">' + ic('wa', 15) + 'واتساب' + (fresh ? ' (اللينك + الباسوورد)' : '') + '</a>' : '') + '</div>', { wide: true });
    const fp = $('#fx-print', m.el); if (fp) fp.onclick = () => fixedPrint(c, fixedU);
    const fg = $('#fx-png', m.el); if (fg) fg.onclick = () => qrPngOf(fixedU, c.name, 'امسح الكود — نتيجة الأشعة بتاعتك', 'باركود-ثابت-' + c.name);
    $('#cs-wa-s', m.el).onclick = ev => busy(ev.currentTarget, async () => { await capi('POST', '/wa', { cid, wa: $('#cs-wa-n', m.el).value.trim() }); toast('اتحفظ رقم الواتساب'); });
    $('#cs-pw2', m.el).onclick = async () => { if (!await confirm('تعمل باسوورد جديد؟', 'المركز هيخرج ولازم يدخل بالجديد.', 'باسوورد جديد')) return; const x = await capi('POST', '/pass', { cid }).catch(err); if (x) { m.close(); casesModal(cid, x.pass); } };
    $('#cs-st', m.el).onclick = async () => { await capi('POST', '/stop', { cid, on: !s.active }).catch(err); toast(s.active ? 'لينك الحالات اتوقف' : 'لينك الحالات اشتغل'); m.close(); casesModal(cid); };
    $('#cs-rt', m.el).onclick = async () => { if (!await confirm('تعمل لينك جديد؟', 'اللينك القديم هيقف (الباركودات اللي اتطبعت للمرضى مش بتتأثر).', 'لينك جديد')) return; await capi('POST', '/rotate', { cid }).catch(err); toast('اتعمل لينك جديد — ابعته للمركز'); m.close(); casesModal(cid); };
  }
  ACT.cases = (b, e) => { if (e) e.stopPropagation(); casesModal(b.dataset.id).then(() => { if (S.page === 'cases') {} }).catch(err); };
  function fixedPrint(c, u) {
    const w = window.open('', '_blank'); if (!w) return toast('المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة', 'err');
    w.document.open();
    w.document.write('<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>الباركود الثابت</title><style>@page{size:A4;margin:10mm}body{margin:0;font-family:Tahoma,Arial,sans-serif;text-align:center;color:#0F172A}.b{display:inline-block;border:1.5px dashed #94A3B8;border-radius:5mm;padding:6mm;margin-top:10mm}.b h2{margin:0 0 2mm;font-size:18px}.b p{margin:2mm 0 0;font-size:13px}.u{font-family:monospace;direction:ltr;font-size:12px;margin-top:2mm}</style></head><body><div class="b"><h2>' + esc(c.name) + '</h2>' + qrSvg(u, 220) + '<p><b>📱 امسح الكود واكتب موبايلك وأول اسمك</b></p><p>نتيجة الأشعة بتاعتك هتظهر على موبايلك</p><div class="u">' + esc(u.replace(/^https?:\/\//, '')) + '</div></div><script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>');
    w.document.close();
  }
  function qrPngOf(u, title, line, file) {
    const q = qrcode(0, 'M'); q.addData(u); q.make();
    const n = q.getModuleCount(), cell = 12, pad = 40, qs = n * cell, W = qs + pad * 2, H = qs + pad * 2 + 120;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#0F172A'; g.textAlign = 'center';
    g.font = 'bold 30px Tahoma, Arial'; g.direction = 'rtl'; g.fillText(String(title).slice(0, 40), W / 2, 56);
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect(pad + k * cell, 80 + r * cell, cell, cell);
    g.font = '22px monospace'; g.direction = 'ltr'; g.fillText(u.replace(/^https?:\/\//, ''), W / 2, 80 + qs + 40);
    g.font = 'bold 20px Tahoma, Arial'; g.direction = 'rtl'; g.fillText(line, W / 2, 80 + qs + 76);
    const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = String(file).replace(/[\\/:*?"<>|]/g, '') + '.png'; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ── صفحة حالات المرضى: كل المراكز ولينكاتها ── */
  R.cases = async function () {
    const [cl, cs] = await Promise.all([clientsList(), capi('GET', '')]);
    const sites = cs.sites || {}, list = cl.filter(c => c.status === 'active');
    const on = list.filter(c => sites[c.id]), off = list.filter(c => !sites[c.id]);
    view().innerHTML = '<div class="ph"><div><h1>حالات المرضى</h1><div class="sub">لكل مركز لينك بباسوورد يفتحه من كمبيوتره: يرفع PDF الحالة (أو DICOM ويحوّله) ويطلعله باركود للمريض — المريض يمسحه ويشوف أشعته على موبايله. وفيه باركود ثابت يتطبع على كل التقارير.</div></div></div>' +
      '<div class="tally" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="go"><span class="ic">' + ic('qr', 18) + '</span><b data-count="' + on.length + '">' + on.length + '</b><span>مراكز ليها لينك حالات</span></div><div><span class="ic">' + ic('users', 18) + '</span><b data-count="' + on.filter(c => sites[c.id].online).length + '">' + on.filter(c => sites[c.id].online).length + '</b><span>متصلين دلوقتي</span></div><div><span class="ic">' + ic('store', 18) + '</span><b data-count="' + off.length + '">' + off.length + '</b><span>لسه من غير لينك</span></div></div>' +
      (list.length ? '<div class="cases-grid">' + on.concat(off).map(c => { const st = sites[c.id];
        return '<div class="card case-card ' + (st ? '' : 'off') + '" data-act="cases" data-id="' + c.id + '"><div class="row"><span class="cc-ic">' + ic(st ? 'qr' : 'file', 22) + '</span><div class="grow" style="min-width:0"><b>' + esc(c.name) + '</b><div class="xs muted">' + esc(c.grp || '') + '</div></div>' +
          (st ? (st.active ? (st.online ? '<span class="chip go"><span class="dot live"></span>متصل</span>' : '<span class="chip">شغال</span>') : '<span class="chip stop">موقوف</span>') : '<span class="chip">مفيش لينك</span>') + '</div>' +
          '<button class="btn sm ' + (st ? '' : 'primary') + '" data-act="cases" data-id="' + c.id + '" style="width:100%;margin-top:12px">' + (st ? ic('gear', 14) + 'الإدارة والباركود الثابت' : ic('plus', 14) + 'اعمل لينك الحالات') + '</button></div>'; }).join('') + '</div>'
        : '<div class="card empty"><b>ضيف عملاء الأول</b>من «العملاء والمراكز».</div>');
  };
  /* casesModal يعيد تحميل الصفحة لما يتقفل */


  /* ════════ الباكس (DICOM): استقبال من الأجهزة · عرض · PDF · إرسال ════════ */
  const PACS = { jobs: {}, tab: 'studies', q: '', mod: '', sel: new Set() };
  const MODN = { CT: 'مقطعية', MR: 'رنين', US: 'سونار', CR: 'أشعة عادية', DX: 'أشعة رقمية', DR: 'أشعة رقمية', MG: 'ماموجرام', XA: 'قسطرة', RF: 'صبغة', NM: 'مسح ذري', PT: 'PET', OT: 'أخرى', SC: 'صور', PX: 'بانوراما', IO: 'أسنان', ES: 'مناظير', BMD: 'كثافة عظام', SR: 'تقرير' };
  const fmtB = b => !b ? '0' : b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const dcmD = d => d && d.length >= 8 ? d.slice(6, 8) + '/' + d.slice(4, 6) + '/' + d.slice(0, 4) : '';
  const modOf = s => String(s.modality || '').split(',')[0] || 'OT';
  let dcmP = null;
  const needDicom = () => dcmP || (dcmP = new Promise((ok, no) => { if (window.OZDicom) return ok(window.OZDicom); const sc = document.createElement('script'); sc.src = '/cases-dicom.js?v=2'; sc.onload = () => ok(window.OZDicom); sc.onerror = () => { dcmP = null; no(new Error('مش قادر أحمّل قارئ الـ DICOM')); }; document.head.appendChild(sc); }));
  const imgCache = new Map();
  async function dcmImg(sop, win, q) {
    const k = sop + '|' + (win || 'auto') + '|' + (q || .85); if (imgCache.has(k)) return imgCache.get(k);
    const D = await needDicom(), r = await fetch('/api/pacs/file/' + encodeURIComponent(sop), { credentials: 'same-origin' });
    if (!r.ok) throw new Error('الملف مش موجود');
    const out = D.decode(new Uint8Array(await r.arrayBuffer()), { win: win || 'auto', inv: false, q: q || .85 });
    if (!out) throw new Error('مش صورة');
    if (imgCache.size > 400) imgCache.delete(imgCache.keys().next().value);
    imgCache.set(k, out); return out;
  }
  const copyBtn = t => '<button class="pc-copy" data-act="copy" data-text="' + esc(t) + '" title="انسخ">' + ic('copy', 14) + '</button>';

  R.pacs = async function (soft) {
    if (S.cloudPacs) return pacsCloud();
    const qs = '?q=' + encodeURIComponent(PACS.q) + '&mod=' + encodeURIComponent(PACS.mod);
    const [st, li] = await Promise.all([get('/api/pacs/status'), get('/api/pacs/studies' + qs)]);
    PACS.st = st; PACS.list = li.studies; PACS.mods = li.mods;
    (st.jobs || []).forEach(j => { PACS.jobs[j.id] = j; });
    if (soft && $('#pbody') && PACS.tab === 'studies') { $('#pbody').innerHTML = studiesHtml(); heroNums(); return; }
    const S0 = st.status, ep = st.endpoints || [], main = ep[0];
    const pill = S0.listening ? '<span class="pstat on"><i></i>بيستقبل دلوقتي</span>' : st.settings.pacs_on !== '1' ? '<span class="pstat off"><i></i>الاستقبال مقفول</span>' : '<span class="pstat err"><i></i>' + esc(S0.error || 'مش شغال') + '</span>';
    const tile = (lbl, val, sub, icn) => '<div class="pc-tile"><span class="pc-ic">' + ic(icn, 18) + '</span><div class="grow" style="min-width:0"><small>' + lbl + '</small><b dir="ltr">' + esc(val || '—') + '</b>' + (sub ? '<i dir="ltr">' + esc(sub) + '</i>' : '') + '</div>' + (val ? copyBtn(val) : '') + '</div>';
    view().innerHTML = '<div class="ph"><div><h1>الباكس <span class="faint" style="font-size:.55em;font-weight:600">DICOM</span></h1><div class="sub">الأجهزة بتبعت الحالات هنا على طول · تتعرض وتتحول PDF وتتبعت لأي جهاز تاني</div></div><div class="row"><button class="btn" data-act="pupload">' + ic('upload', 16) + 'رفع ملفات</button></div></div>' +
      '<div class="card pacs-hero"><div class="ph-top">' + pill + '<span class="grow"></span><span class="xs faint">اكتب البيانات دي في إعدادات الجهاز (DICOM Send / Store)</span></div>' +
      '<div class="pc-tiles">' + tile('AE Title', S0.ae, 'Called AE', 'scan') + tile('Port', main ? String(main.port) : String(S0.port || ''), main && main.kind === 'public' ? 'البورت الخارجي' : 'TCP', 'server') + tile(main && main.kind === 'public' ? 'IP' : 'IP / Host', main ? (main.ip || main.host) : '', main && main.ip && main.host !== main.ip ? main.host : '', 'wifi') + '</div>' +
      (ep.length > 1 ? '<div class="pc-more">' + ep.slice(1).map(e => '<div class="pc-ep"><span class="chip">' + esc(e.label) + '</span><code dir="ltr">' + esc(e.ip || e.host) + ':' + e.port + '</code>' + copyBtn((e.ip || e.host) + ':' + e.port) + '</div>').join('') + '</div>' : '') +
      (!ep.length ? '<p class="small muted" style="margin-top:10px">' + (S0.railway ? 'السيرفر محتاج TCP Proxy عشان الأجهزة توصله من برّه.' : 'ضيف العنوان العام من «الإعدادات» تحت لو الأجهزة بتبعت من برّه الشبكة.') + '</p>' : '') +
      '<div class="pc-nums" id="pnums"></div></div>' +
      '<div class="seg ptabs" id="ptabs">' + [['studies', 'الحالات', 'layers'], ['nodes', 'الأجهزة', 'send'], ['set', 'الإعدادات', 'gear'], ['log', 'السجل', 'clock']].map(([k, t, i]) => '<button data-act="ptab" data-k="' + k + '" class="' + (PACS.tab === k ? 'on' : '') + '">' + ic(i, 15) + t + '</button>').join('') + '</div>' +
      '<div id="pjobs" class="pjobs"></div><div id="pbody"></div>';
    heroNums(); drawJobs(); await ptab();
  };
  /* على السيرفر (Railway): مفيش تخزين — الباكس بيتسطّب على كمبيوتر المركز */
  function pacsCloud() {
    let lan = ''; try { lan = localStorage.getItem('tq-pacs-lan') || ''; } catch (_) {}
    const step = (n, t, d) => '<div class="ag-step"><span class="ag-n">' + n + '</span><div><b>' + t + '</b><div class="small muted">' + d + '</div></div></div>';
    view().innerHTML = '<div class="ph"><div><h1>الباكس <span class="faint" style="font-size:.55em;font-weight:600">DICOM</span></h1><div class="sub">الحالات بتتخزن على كمبيوتر المركز نفسه — مفيش ولا صورة بتترفع على النت</div></div></div>' +
      '<div class="card pacs-hero ag-hero"><div class="ag-ic">' + ic('server', 34) + '</div><div class="grow"><h2 style="margin:0 0 6px">الباكس على كمبيوتر المركز</h2><p class="muted" style="margin:0 0 14px">نزّل الحزمة على كمبيوتر في المركز (ويندوز). الأجهزة بتبعتله على الشبكة الداخلية بسرعة ومن غير نت، والحالات بتتحفظ على الهارد بتاعه — وتفتحها من أي جهاز على نفس الشبكة.</p>' +
      '<div class="row" style="flex-wrap:wrap"><a class="btn primary" href="/pacs-agent.zip">' + ic('download', 16) + 'نزّل الباكس للكمبيوتر</a><a class="btn" href="http://localhost:8686/" target="_blank" rel="noopener">' + ic('scan', 16) + 'افتح الباكس (على الكمبيوتر ده)</a></div></div></div>' +
      '<div class="card pad" style="margin-top:16px"><h3 style="margin-top:0">التسطيب — مرة واحدة</h3><div class="ag-steps">' +
      step(1, 'سطّب Node.js 22 أو أحدث', 'من <a href="https://nodejs.org/en/download" target="_blank" rel="noopener">nodejs.org</a> — لو مش متسطّب.') +
      step(2, 'فك الـ ZIP في مكان ثابت', 'مثلا <code dir="ltr">D:\\Taqam-PACS</code>') +
      step(3, 'دبل كليك على <code dir="ltr">PACS-INSTALL.bat</code>', 'وافق على صلاحيات المدير: بيفتح البورتات في الفايروول، ويشغّل الباكس في الخلفية مع كل تشغيل للويندوز، ويعمل اختصار على سطح المكتب.') +
      step(4, 'اعمل حساب المدير وظبّط الأجهزة', 'هتلاقي الـ AE Title والـ IP والبورت فوق في صفحة الباكس — اكتبهم في إعدادات DICOM Send على كل جهاز.') +
      '</div></div>' +
      '<div class="card pad" style="margin-top:16px"><h3 style="margin-top:0">فتح الباكس من جهاز تاني على الشبكة</h3><p class="small muted">اكتب عنوان كمبيوتر الباكس مرة (الـ IP بتاعه ظاهر في صفحة الباكس عنده) وهيتحفظ على الجهاز ده.</p><div class="row" style="flex-wrap:wrap"><input class="input" id="ag-lan" dir="ltr" placeholder="192.168.1.10" value="' + esc(lan) + '" style="max-width:240px"><button class="btn" id="ag-go">' + ic('scan', 15) + 'افتح</button></div></div>';
    $('#ag-go').onclick = () => { let v = $('#ag-lan').value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''); if (!v) return toast('اكتب الـ IP', 'err'); if (!/:\d+$/.test(v)) v += ':8686'; try { localStorage.setItem('tq-pacs-lan', v.replace(/:8686$/, '')); } catch (_) {} window.open('http://' + v + '/', '_blank', 'noopener'); };
    return Promise.resolve();
  }
  function heroNums() {
    const st = PACS.st, t = st.totals, dk = st.disk, el = $('#pnums'); if (!el) return;
    el.innerHTML = '<div><b>' + n(t.n) + '</b><small>حالة</small></div><div><b>' + n(t.i) + '</b><small>صورة</small></div><div><b>' + fmtB(t.b) + '</b><small>المساحة</small></div>' + (dk ? '<div><b>' + fmtB(dk.free) + '</b><small>' + (S.mode === 'pacs' ? 'فاضي على الهارد' : 'فاضي على السيرفر') + '</small></div>' : '');
  }
  async function ptab() {
    const b = $('#pbody'); if (!b) return;
    $$('#ptabs button').forEach(x => x.classList.toggle('on', x.dataset.k === PACS.tab));
    if (PACS.tab === 'studies') { b.innerHTML = studiesHtml(); return; }
    if (PACS.tab === 'nodes') { const d = await get('/api/pacs/nodes'); PACS.nodes = d.nodes; b.innerHTML = nodesHtml(); return; }
    if (PACS.tab === 'log') { const d = await get('/api/pacs/log'); b.innerHTML = logHtml(d.log); return; }
    if (PACS.tab === 'set') { b.innerHTML = setHtml(); wireSet(); }
  }
  ACT.ptab = b => { PACS.tab = b.dataset.k; ptab().catch(err); };

  function studiesHtml() {
    const L = PACS.list || [];
    const filt = '<div class="pfilt"><div class="gin grow">' + ic('search', 17) + '<input class="input" id="pq" placeholder="اسم المريض، رقمه، الـ Accession، الجهاز…" value="' + esc(PACS.q) + '"></div><div class="chips-row">' + ['', ...(PACS.mods || [])].map(m => '<button class="fchip ' + (PACS.mod === m ? 'on' : '') + '" data-act="pmod" data-m="' + esc(m) + '">' + (m ? esc(m) + ' <small>' + esc(MODN[m] || '') + '</small>' : 'الكل') + '</button>').join('') + '</div></div>';
    if (!L.length) return filt + '<div class="card empty pempty"><span class="pe-ic">' + ic('scan', 34) + '</span><b>' + (PACS.q || PACS.mod ? 'مفيش نتايج' : 'مستني أول حالة') + '</b>' + (PACS.q || PACS.mod ? 'جرّب كلمة تانية.' : 'ابعت من الجهاز على الـ AE Title والبورت اللي فوق — أول ما توصل هتظهر هنا لوحدها.') + '</div>';
    return filt + '<div class="pst-list">' + L.map((s, i) => {
      const m = modOf(s);
      return '<div class="pst ' + (s.new ? 'new' : '') + '" data-act="pstudy" data-uid="' + esc(s.uid) + '" style="--i:' + Math.min(i, 14) + '"><span class="pst-mod m-' + esc(m) + '">' + esc(m) + '</span>' +
        '<div class="grow" style="min-width:0"><div class="pst-nm"><b>' + esc(s.patient_name || 'من غير اسم') + '</b>' + (s.patient_id ? '<span class="faint small" dir="ltr">#' + esc(s.patient_id) + '</span>' : '') + (s.new ? '<span class="chip hivis">جديد</span>' : '') + '</div>' +
        '<div class="small muted pst-ds">' + esc([MODN[m] || m, s.description, dcmD(s.study_date)].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="xs faint pst-meta"><span>' + ic('layers', 12) + n(s.n_series) + ' سيريز</span><span>' + ic('scan', 12) + '<b data-pn="' + esc(s.uid) + '">' + n(s.n_inst) + '</b> صورة</span><span>' + fmtB(s.bytes) + '</span><span dir="ltr">' + ic('server', 12) + esc(s.source_ae || s.source_ip || '') + '</span><span>' + dm(s.received_at) + ' ' + hm(s.received_at) + '</span></div></div>' +
        '<div class="pst-acts"><button class="btn sm" data-act="ppdf" data-uid="' + esc(s.uid) + '" title="PDF">' + ic('file', 15) + '<span>PDF</span></button><button class="btn sm" data-act="psend" data-uid="' + esc(s.uid) + '" title="إرسال">' + ic('send', 15) + '<span>إرسال</span></button></div></div>';
    }).join('') + '</div>';
  }
  let pqT;
  document.addEventListener('input', e => { if (e.target.id === 'pq') { clearTimeout(pqT); pqT = setTimeout(() => { PACS.q = e.target.value.trim(); R.pacs(true).then(() => { const i = $('#pq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 350); } });
  ACT.pmod = b => { PACS.mod = b.dataset.m; R.pacs(true); };
  PACS.onEvent = d => {
    if (d.live && d.uid) { const el = $('[data-pn="' + d.uid + '"]'); if (el) { el.textContent = n(d.n); el.closest('.pst').classList.add('recv'); return; } }
    clearTimeout(PACS.evT); PACS.evT = setTimeout(() => { if (!$('.scrim')) R.pacs(true).catch(() => {}); }, d.done ? 200 : 1200);
  };

  /* ── شريط الإرسال الجاري ── */
  PACS.job = j => {
    const old = PACS.jobs[j.id]; PACS.jobs[j.id] = j;
    if (old && old.status === 'run' && j.status !== 'run') {
      if (j.status === 'done') toast('اتبعتت ' + j.sent + ' صورة لـ ' + j.node + ' ✓', 'hivis');
      else toast('الإرسال لـ ' + j.node + ': ' + (j.error || (j.failed + ' صورة فشلت')), 'err');
    }
    drawJobs();
  };
  function drawJobs() {
    const el = $('#pjobs'); if (!el) return;
    const L = Object.values(PACS.jobs).filter(j => j.status === 'run' || Date.now() - j.started < 10 * 60000).sort((a, b) => b.id - a.id).slice(0, 4);
    el.innerHTML = L.map(j => { const p = j.total ? Math.round((j.sent + j.failed) / j.total * 100) : 0; return '<div class="pjob ' + j.status + '"><span class="pj-ic">' + ic(j.status === 'run' ? 'send' : j.status === 'done' ? 'check' : 'x', 15) + '</span><div class="grow" style="min-width:0"><div class="row" style="gap:6px"><b class="small">' + esc(j.patient || 'حالة') + '</b><span class="xs muted">← ' + esc(j.node) + '</span><span class="grow"></span><span class="xs tnum">' + (j.sent + j.failed) + '/' + j.total + (j.status === 'run' ? '' : j.status === 'done' ? ' · ' + ((j.ms || 0) / 1000).toFixed(1) + ' ث' : '') + '</span></div><div class="pj-bar"><i style="width:' + p + '%"></i></div>' + (j.error ? '<div class="xs" style="color:var(--stop)">' + esc(j.error) + '</div>' : '') + '</div></div>'; }).join('');
  }

  /* ── عرض الدراسة ── */
  ACT.pstudy = (b, e) => { if (e && e.target.closest('.pst-acts')) return; studyModal(b.dataset.uid).catch(err); };
  async function studyModal(uid) {
    const d = await get('/api/pacs/study?uid=' + encodeURIComponent(uid)), s = d.study;
    const ser = d.series.filter(x => x.modality !== 'SR' && x.modality !== 'PR' && x.modality !== 'KO');
    const kv = (k, v) => v ? '<div><small>' + k + '</small><b>' + esc(v) + '</b></div>' : '';
    const m = modal('<div class="modal-hd"><div class="grow"><h3>' + esc(s.patient_name || 'من غير اسم') + '</h3><div class="small muted">' + esc([MODN[modOf(s)] || s.modality, s.description, dcmD(s.study_date)].filter(Boolean).join(' · ')) + '</div></div><button class="btn ghost icon" data-close aria-label="قفل">' + ic('x') + '</button></div>' +
      '<div class="pv"><div class="pv-main"><div class="pv-stage" id="pv-st"><div class="pv-load">بيحمّل…</div></div><div class="pv-ctl"><input type="range" id="pv-r" min="0" max="0" value="0"><span class="xs tnum" id="pv-n"></span><select class="input sm" id="pv-w"><option value="auto">تلقائي</option><option value="wl">من الجهاز</option><option value="soft">أنسجة</option><option value="brain">مخ</option><option value="bone">عظام</option><option value="lung">رئة</option><option value="full">كامل</option></select></div></div>' +
      '<div class="pv-side"><div class="pv-series" id="pv-se">' + (ser.length ? ser.map((x, i) => '<button class="pv-s ' + (i ? '' : 'on') + '" data-i="' + i + '"><span class="pv-th" data-th="' + esc(x.sops[0]) + '"></span><span><b class="small">' + esc(x.desc || ('Series ' + (x.no || i + 1))) + '</b><small>' + x.n + ' صورة · ' + esc(x.modality || '') + '</small></span></button>').join('') : '<div class="muted small">مفيش صور</div>') + '</div>' +
      '<div class="pv-info">' + kv('رقم المريض', s.patient_id) + kv('النوع / السن', [s.sex, s.age].filter(Boolean).join(' · ')) + kv('Accession', s.accession) + kv('الطبيب', s.referring) + kv('المكان', s.institution) + kv('من جهاز', (s.source_ae || '') + (s.source_ip ? ' (' + s.source_ip + ')' : '')) + kv('وصلت', dmy(s.received_at) + ' ' + hm(s.received_at)) + kv('الحجم', n(s.n_inst) + ' صورة · ' + fmtB(s.bytes)) + '</div></div></div>' +
      '<div class="modal-ft"><button class="btn danger ghost" id="pv-del" style="margin-inline-end:auto">' + ic('trash', 15) + 'مسح</button><a class="btn" href="/api/pacs/zip?uid=' + encodeURIComponent(uid) + '">' + ic('download', 15) + 'ZIP</a><button class="btn" id="pv-send">' + ic('send', 15) + 'إرسال</button><button class="btn primary" id="pv-pdf">' + ic('file', 15) + 'PDF</button></div>', { wide: true });
    m.el.classList.add('pv-modal');
    let si = 0, ii = 0, tok = 0;
    const show = async () => {
      const x = ser[si]; if (!x) return; const my = ++tok;
      $('#pv-r', m.el).max = x.n - 1; $('#pv-r', m.el).value = ii; $('#pv-n', m.el).textContent = (ii + 1) + ' / ' + x.n;
      try { const r = await dcmImg(x.sops[ii], $('#pv-w', m.el).value); if (my !== tok) return; $('#pv-st', m.el).innerHTML = '<img src="' + r.img + '" alt="">'; }
      catch (e) { if (my === tok) $('#pv-st', m.el).innerHTML = '<div class="pv-load">' + esc(e.message) + '</div>'; }
    };
    $$('.pv-s', m.el).forEach(bb => bb.onclick = () => { si = +bb.dataset.i; ii = Math.floor((ser[si].n - 1) / 2); $$('.pv-s', m.el).forEach(z => z.classList.toggle('on', z === bb)); show(); });
    $('#pv-r', m.el).oninput = ev => { ii = +ev.target.value; show(); };
    $('#pv-w', m.el).onchange = show;
    $('#pv-st', m.el).addEventListener('wheel', ev => { ev.preventDefault(); const x = ser[si]; if (!x) return; ii = Math.max(0, Math.min(x.n - 1, ii + (ev.deltaY > 0 ? 1 : -1))); show(); }, { passive: false });
    if (ser[0]) { ii = Math.floor((ser[0].n - 1) / 2); show(); }
    (async () => { for (const th of $$('[data-th]', m.el)) { try { const r = await dcmImg(th.dataset.th, 'auto', .6); th.style.backgroundImage = 'url(' + r.img + ')'; } catch (_) { th.classList.add('bad'); } } })();
    $('#pv-pdf', m.el).onclick = () => pdfModal(uid, d);
    $('#pv-send', m.el).onclick = () => sendModal([uid], d);
    $('#pv-del', m.el).onclick = async () => { if (!await confirm('مسح الحالة دي من السيرفر؟', n(s.n_inst) + ' صورة · ' + fmtB(s.bytes) + ' — مش هترجع.', 'امسح', true)) return; await post('/api/pacs/study/del', { uid }); m.close(); toast('اتمسحت'); R.pacs(true); };
    const row = $('[data-uid="' + uid + '"].pst'); if (row) row.classList.remove('new');
    refreshCounts();
  }

  /* ── PDF ── */
  ACT.ppdf = async b => { const d = await get('/api/pacs/study?uid=' + encodeURIComponent(b.dataset.uid)).catch(err); if (d) pdfModal(b.dataset.uid, d); };
  function pdfModal(uid, d) {
    const s = d.study, ser = d.series.filter(x => !['SR', 'PR', 'KO'].includes(x.modality));
    let o = {}; try { o = JSON.parse(localStorage.getItem('tq-pdf') || '{}'); } catch (_) {}
    o = Object.assign({ grid: '4x5', page: 'a3', ori: 'portrait', every: 1, win: 'auto', black: true, hdr: true, meta: true, clinic: true }, o);
    const G = ['1x1', '2x2', '3x3', '3x4', '4x4', '4x5', '5x6', '6x8'];
    const opt = (v, t, cur) => '<option value="' + v + '" ' + (String(cur) === String(v) ? 'selected' : '') + '>' + t + '</option>';
    const total = () => ser.filter((x, i) => $('#ps' + i, m.el) && $('#ps' + i, m.el).checked).reduce((a, x) => a + Math.ceil(x.n / (+$('[name=every]', m.el).value || 1)), 0);
    const m = modal('<div class="modal-hd"><div class="grow"><h3>تحويل لـ PDF</h3><div class="small muted">' + esc(s.patient_name || '') + ' · ' + esc(s.modality || '') + '</div></div><button class="btn ghost icon" data-close aria-label="قفل">' + ic('x') + '</button></div>' +
      '<form id="pf" style="display:grid;gap:12px"><div class="field"><span>السيريز</span><div class="pdf-ser">' + ser.map((x, i) => '<label class="check"><input type="checkbox" id="ps' + i + '" ' + (x.n > 1 || ser.length < 4 ? 'checked' : '') + '> ' + esc(x.desc || 'Series ' + (x.no || i + 1)) + ' <span class="faint xs">(' + x.n + ')</span></label>').join('') + '</div></div>' +
      '<div class="grid3"><label class="field"><span>الشبكة</span><select class="input" name="grid">' + G.map(g => opt(g, g.replace('x', ' × '), o.grid)).join('') + '</select></label><label class="field"><span>الورقة</span><select class="input" name="page">' + opt('a3', 'A3', o.page) + opt('a4', 'A4', o.page) + opt('letter', 'Letter', o.page) + '</select></label><label class="field"><span>الاتجاه</span><select class="input" name="ori">' + opt('portrait', 'طولي', o.ori) + opt('landscape', 'عرضي', o.ori) + '</select></label>' +
      '<label class="field"><span>كل كام صورة</span><select class="input" name="every">' + [1, 2, 3, 4, 5, 10].map(k => opt(k, k === 1 ? 'كل الصور' : 'صورة من كل ' + k, o.every)).join('') + '</select></label><label class="field"><span>النافذة</span><select class="input" name="win">' + opt('auto', 'تلقائي', o.win) + opt('wl', 'من الجهاز', o.win) + opt('soft', 'أنسجة', o.win) + opt('brain', 'مخ', o.win) + opt('bone', 'عظام', o.win) + opt('lung', 'رئة', o.win) + '</select></label><div class="field"><span>&nbsp;</span><div class="small muted" id="pf-n"></div></div></div>' +
      '<div class="row" style="flex-wrap:wrap;gap:14px"><label class="check"><input type="checkbox" name="black" ' + (o.black ? 'checked' : '') + '> خلفية سودا</label><label class="check"><input type="checkbox" name="hdr" ' + (o.hdr ? 'checked' : '') + '> اسم المريض فوق</label><label class="check"><input type="checkbox" name="clinic" ' + (o.clinic ? 'checked' : '') + '> اسم المركز</label><label class="check"><input type="checkbox" name="meta" ' + (o.meta ? 'checked' : '') + '> بيانات على الصور</label></div>' +
      '<div class="pdf-bar" id="pf-bar" hidden><i></i></div><div id="pf-out"></div>' +
      '<div class="modal-ft"><button type="button" class="btn" data-close>رجوع</button><button class="btn primary">' + ic('file', 15) + 'اعمل الـ PDF</button></div></form>', { wide: true });
    const upd = () => { const t = total(), [c, r] = $('[name=grid]', m.el).value.split('x').map(Number); $('#pf-n', m.el).textContent = t + ' صورة · ' + Math.ceil(t / (c * r) || 0) + ' صفحة'; };
    $$('input,select', m.el).forEach(x => x.addEventListener('change', upd)); upd();
    $('#pf', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => {
      const f = form($('#pf', m.el)); localStorage.setItem('tq-pdf', JSON.stringify({ grid: f.grid, page: f.page, ori: f.ori, every: +f.every, win: f.win, black: !!f.black, hdr: !!f.hdr, meta: !!f.meta, clinic: !!f.clinic }));
      const every = +f.every || 1, sops = [];
      ser.forEach((x, i) => { if ($('#ps' + i, m.el).checked) x.sops.forEach((sp, k) => { if (k % every === 0) sops.push(sp); }); });
      if (!sops.length) throw new Error('اختار سيريز واحدة على الأقل');
      const D = await needDicom(), bar = $('#pf-bar', m.el), out = new Array(sops.length); bar.hidden = false;
      const setP = (p, t) => { bar.firstChild.style.width = Math.round(p * 100) + '%'; $('#pf-n', m.el).textContent = t; };
      let done = 0, idx = 0, bad = 0;
      await Promise.all(Array.from({ length: 4 }, async () => { while (idx < sops.length) { const k = idx++; try { out[k] = await dcmImg(sops[k], f.win, .9); } catch (_) { bad++; } done++; setP(done / sops.length * .6, 'بنقرا الصور ' + done + '/' + sops.length); } }));
      const list = out.filter(Boolean); if (!list.length) throw new Error('مقدرتش أقرا ولا صورة' + (bad ? ' — ممكن تكون مضغوطة بنوع مش مدعوم' : ''));
      const JsPDF = await new Promise(r => D.jspdf(r)); if (!JsPDF) throw new Error('مش قادر أحمّل مكتبة الـ PDF');
      const [cols, rows] = f.grid.split('x').map(Number);
      const r = await D.buildPdf(JsPDF, list, { cols, rows, page: f.page, ori: f.ori, margin: 6, hdr: !!f.hdr, clinic: !!f.clinic, meta: !!f.meta, black: !!f.black, clinicName: S.boot.settings.company, doctor: s.referring || '' }, (dd, tt) => setP(.6 + dd / tt * .4, 'بنرسم الصفحات ' + dd + '/' + tt));
      setP(1, 'خلص ✓ ' + r.pages + ' صفحة' + (bad ? ' · ' + bad + ' صورة اتشالت' : ''));
      const nm = ((s.patient_name || 'حالة') + (s.modality ? ' - ' + modOf(s) : '') + (s.study_date ? ' - ' + dcmD(s.study_date).replace(/\//g, '-') : '')).replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.pdf';
      const file = new File([r.blob], nm, { type: 'application/pdf' }), url = URL.createObjectURL(file);
      const a = document.createElement('a'); a.href = url; a.download = nm; document.body.appendChild(a); a.click(); a.remove();
      $('#pf-out', m.el).innerHTML = '<div class="pdf-done">' + ic('file', 22) + '<div class="grow"><b class="small">' + esc(nm) + '</b><div class="xs muted">' + r.pages + ' صفحة · ' + fmtB(file.size) + '</div></div><a class="btn sm" href="' + url + '" target="_blank" rel="noopener">فتح</a><a class="btn sm" href="' + url + '" download="' + esc(nm) + '">' + ic('download', 14) + 'تنزيل</a>' + (navigator.canShare && navigator.canShare({ files: [file] }) ? '<button type="button" class="btn sm primary" id="pf-share">' + ic('wa', 14) + 'مشاركة</button>' : '') + '</div>' + (has('cases') ? '<p class="xs muted" style="margin-top:8px">عايز المريض يفتحه بالباركود؟ ارفعه من «حالات المرضى (باركود)» في صفحة المركز.</p>' : '');
      const sh = $('#pf-share', m.el); if (sh) sh.onclick = () => navigator.share({ files: [file], title: nm }).catch(() => {});
    }); };
  }

  /* ── الإرسال ── */
  ACT.psend = async b => { const d = await get('/api/pacs/study?uid=' + encodeURIComponent(b.dataset.uid)).catch(err); if (d) sendModal([b.dataset.uid], d); };
  async function sendModal(uids, d) {
    const nodes = (await get('/api/pacs/nodes')).nodes;
    if (!nodes.length) { if (await confirm('مفيش أجهزة متسجلة', 'ضيف الجهاز أو الـ PACS اللي عايز تبعتله الأول (AE Title + IP + Port).', 'ضيف جهاز')) nodeForm({}); return; }
    let pick = nodes[0].id;
    const ser = d ? d.series : [];
    const m = modal('<div class="modal-hd"><div class="grow"><h3>إرسال الحالة</h3><div class="small muted">' + esc(d ? (d.study.patient_name || '') + ' · ' + n(d.study.n_inst) + ' صورة' : uids.length + ' حالة') + '</div></div><button class="btn ghost icon" data-close aria-label="قفل">' + ic('x') + '</button></div>' +
      '<div class="node-pick">' + nodes.map((x, i) => '<button class="np ' + (i ? '' : 'on') + '" data-id="' + x.id + '"><span class="np-ic">' + ic('server', 18) + '</span><span class="grow"><b>' + esc(x.name) + '</b><small dir="ltr">' + esc(x.ae) + ' @ ' + esc(x.host) + ':' + x.port + '</small></span><i>' + ic('check', 14) + '</i></button>').join('') + '</div>' +
      (ser.length > 1 ? '<details class="small" style="margin-top:12px"><summary class="muted">سيريز معيّنة بس؟</summary><div class="pdf-ser" style="margin-top:8px">' + ser.map((x, i) => '<label class="check"><input type="checkbox" data-su="' + esc(x.uid) + '" checked> ' + esc(x.desc || 'Series ' + (x.no || i + 1)) + ' <span class="faint xs">(' + x.n + ')</span></label>').join('') + '</div></details>' : '') +
      '<div class="modal-ft"><button class="btn" data-close>رجوع</button><button class="btn primary" id="sd-go">' + ic('send', 15) + 'ابعت دلوقتي</button></div>');
    $$('.np', m.el).forEach(bb => bb.onclick = () => { pick = bb.dataset.id; $$('.np', m.el).forEach(z => z.classList.toggle('on', z === bb)); });
    $('#sd-go', m.el).onclick = ev => busy(ev.target, async () => {
      const boxes = $$('[data-su]', m.el), series = boxes.length && boxes.some(x => !x.checked) ? boxes.filter(x => x.checked).map(x => x.dataset.su) : null;
      if (series && !series.length) throw new Error('اختار سيريز');
      const r = await post('/api/pacs/send', { uids, node: pick, series });
      r.jobs.forEach(j => { PACS.jobs[j.id] = j; }); drawJobs(); m.close(); toast('بدأ الإرسال…');
    });
  }

  /* ── الأجهزة ── */
  function nodesHtml() {
    const L = PACS.nodes || [];
    return '<div class="row" style="margin-bottom:12px"><p class="muted small grow" style="margin:0">الأجهزة أو الـ PACS أو الـ Workstations اللي بتبعتلها الحالات.</p><button class="btn primary sm" data-act="pnode">' + ic('plus', 15) + 'جهاز</button></div>' +
      (L.length ? '<div class="nodes">' + L.map(x => '<div class="card node"><span class="np-ic">' + ic('server', 20) + '</span><div class="grow" style="min-width:0"><b>' + esc(x.name) + '</b>' + (x.auto ? ' <span class="chip hivis">' + ic('zap', 11) + ' بيتبعتله تلقائي</span>' : '') + '<div class="small muted" dir="ltr" style="text-align:right">' + esc(x.ae) + ' @ ' + esc(x.host) + ':' + x.port + '</div><div class="xs faint">' + (x.last_ok ? 'آخر اتصال ناجح ' + dm(x.last_ok) + ' ' + hm(x.last_ok) : 'لسه متجرّبش') + (x.parallel > 1 ? ' · ' + x.parallel + ' اتصالات مع بعض' : '') + '</div></div><div class="row" style="gap:6px"><button class="btn sm" data-act="pecho" data-id="' + x.id + '">' + ic('wifi', 14) + 'اختبار</button><button class="btn sm ghost" data-act="pnode" data-id="' + x.id + '">' + ic('edit', 14) + '</button></div></div>').join('') + '</div>'
        : '<div class="card empty"><b>مفيش أجهزة لسه</b>ضيف جهاز عشان تقدر تبعت له الحالات.</div>');
  }
  ACT.pnode = b => nodeForm((PACS.nodes || []).find(x => x.id === b.dataset.id) || {});
  ACT.pecho = b => busy(b, async () => { const r = await post('/api/pacs/echo', { id: b.dataset.id }); toast('الجهاز رد ✓ (' + r.ms + ' ms)', 'hivis'); });
  function nodeForm(x) {
    const m = modal('<div class="modal-hd"><h3>' + (x.id ? 'تعديل الجهاز' : 'جهاز جديد') + '</h3></div><form id="nf" style="display:grid;gap:12px"><label class="field"><span>الاسم</span><input class="input" name="name" value="' + esc(x.name || '') + '" placeholder="مثلا: PACS المستشفى / جهاز المقطعية" required></label>' +
      '<div class="grid3"><label class="field"><span>AE Title</span><input class="input" name="ae" dir="ltr" maxlength="16" value="' + esc(x.ae || '') + '" required></label><label class="field"><span>IP / Host</span><input class="input" name="host" dir="ltr" value="' + esc(x.host || '') + '" placeholder="192.168.1.20" required></label><label class="field"><span>Port</span><input class="input" name="port" type="number" dir="ltr" value="' + (x.port || 104) + '" required></label></div>' +
      '<div class="grid2"><label class="field"><span>السرعة (اتصالات مع بعض)</span><select class="input" name="parallel">' + [1, 2, 3, 4].map(k => '<option value="' + k + '" ' + ((x.parallel || 1) === k ? 'selected' : '') + '>' + k + (k === 1 ? ' (الأضمن)' : k === 4 ? ' (أسرع)' : '') + '</option>').join('') + '</select></label><label class="check" style="align-self:end;padding-bottom:10px"><input type="checkbox" name="auto" ' + (x.auto ? 'checked' : '') + '> ابعت له أي حالة توصل تلقائي</label></div>' +
      '<div class="row"><button type="button" class="btn sm" id="nf-t">' + ic('wifi', 14) + 'اختبار الاتصال (C-ECHO)</button><span class="small muted" id="nf-r"></span></div>' +
      '<div class="modal-ft">' + (x.id ? '<button type="button" class="btn danger ghost" id="nf-del" style="margin-inline-end:auto">مسح</button>' : '') + '<button type="button" class="btn" data-close>رجوع</button><button class="btn primary">حفظ</button></div></form>', { wide: true });
    $('#nf-t', m.el).onclick = ev => busy(ev.target, async () => { const f = form($('#nf', m.el)); $('#nf-r', m.el).textContent = 'بنجرّب…'; try { const r = await post('/api/pacs/echo', f); $('#nf-r', m.el).innerHTML = '<b style="color:var(--go)">رد ✓ ' + r.ms + ' ms</b>'; } catch (e) { $('#nf-r', m.el).innerHTML = '<b style="color:var(--stop)">' + esc(e.message) + '</b>'; } });
    const del = $('#nf-del', m.el); if (del) del.onclick = async () => { await post('/api/pacs/nodes/del', { id: x.id }); m.close(); PACS.tab = 'nodes'; ptab(); };
    $('#nf', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => { await post('/api/pacs/nodes', Object.assign(form($('#nf', m.el)), { id: x.id })); m.close(); toast('اتحفظ'); if (PACS.tab === 'nodes') ptab(); }); };
  }

  /* ── الإعدادات ── */
  function setHtml() {
    const s = PACS.st.settings, st = PACS.st.status;
    const ck = (k, t, sub) => '<label class="check"><input type="checkbox" name="' + k + '" ' + (s[k] === '1' ? 'checked' : '') + '> <span>' + t + (sub ? '<br><small class="muted">' + sub + '</small>' : '') + '</span></label>';
    return '<form class="card pad" id="psf"><section><h3>الاستقبال</h3>' + ck('pacs_on', 'استقبل الحالات من الأجهزة') +
      '<div class="grid2"><label class="field"><span>AE Title بتاعنا</span><input class="input" name="pacs_ae" dir="ltr" maxlength="16" value="' + esc(s.pacs_ae) + '"></label><label class="field"><span>Port</span><input class="input" name="pacs_port" type="number" dir="ltr" value="' + esc(st.fixed_port || s.pacs_port) + '" ' + (st.fixed_port ? 'disabled' : '') + '>' + (st.fixed_port ? '<small class="muted">ثابت على السيرفر — الأجهزة تبعت على البورت الخارجي اللي فوق</small>' : '') + '</label></div>' +
      '<label class="field"><span>العنوان العام (اختياري)</span><input class="input" name="pacs_public" dir="ltr" value="' + esc(s.pacs_public) + '" placeholder="41.33.20.10:11112"><small class="muted">لو عامل Port Forwarding من الراوتر — بيظهر فوق للأجهزة</small></label></section>' +
      '<section><h3>الأمان</h3>' + ck('pacs_called', 'ارفض لو الجهاز باعت على AE Title غير بتاعنا') + ck('pacs_strict', 'استقبل من الأجهزة دي بس', 'الـ AE Title بتاع كل جهاز في سطر') +
      '<textarea class="input" name="pacs_allow" dir="ltr" rows="3" placeholder="CT_SCANNER&#10;US_ROOM1">' + esc(s.pacs_allow) + '</textarea></section>' +
      '<section><h3>المساحة</h3><label class="field"><span>امسح الحالات الأقدم من (يوم)</span><input class="input" name="pacs_keep_days" type="number" min="0" value="' + esc(s.pacs_keep_days) + '" style="max-width:160px"><small class="muted">0 = متمسحش أبدا</small></label></section>' +
      '<div class="row"><span class="grow"></span><button class="btn primary">حفظ وإعادة تشغيل الاستقبال</button></div></form>';
  }
  function wireSet() {
    const f = $('#psf'); f.onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => { const o = form(f); ['pacs_on', 'pacs_called', 'pacs_strict'].forEach(k => { o[k] = !!o[k]; }); if (PACS.st.status.fixed_port) delete o.pacs_port; const r = await post('/api/pacs/settings', o); toast(r.status.listening ? 'اتحفظ — بيستقبل على البورت ' + r.status.port : r.status.error || 'اتحفظ — الاستقبال مقفول', r.status.error ? 'err' : ''); PACS.tab = 'set'; R.pacs(); }); };
  }
  function logHtml(L) {
    return '<div class="card">' + (L.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الوقت</th><th></th><th>الجهاز</th><th>صور</th><th>المدة</th><th></th></tr></thead><tbody>' + L.map(r => '<tr><td class="xs tnum" style="white-space:nowrap">' + dm(r.at) + ' ' + hm(r.at) + '</td><td>' + (r.dir === 'in' ? '<span class="chip go">' + ic('download', 11) + ' استقبال</span>' : '<span class="chip sky">' + ic('send', 11) + ' إرسال</span>') + '</td><td dir="ltr" class="small" style="text-align:right">' + esc(r.ae || '') + ' <span class="faint">' + esc(r.ip || '') + '</span></td><td class="tnum">' + (r.n || 0) + '</td><td class="xs tnum">' + (r.ms ? (r.ms / 1000).toFixed(1) + ' ث' : '') + '</td><td class="xs ' + (r.ok ? 'muted' : '') + '" style="' + (r.ok ? '' : 'color:var(--stop)') + '">' + (r.ok ? '✓ ' : '') + esc(r.note || '') + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="empty">لسه مفيش حاجة</div>') + '</div>';
  }

  /* ── رفع ملفات DICOM يدوي ── */
  ACT.pupload = () => {
    const m = modal('<div class="modal-hd"><h3>رفع ملفات DICOM</h3><button class="btn ghost icon" data-close aria-label="قفل">' + ic('x') + '</button></div><div class="pdrop" id="pdrop">' + ic('upload', 30) + '<b>اسحب الفولدر أو الملفات هنا</b><span class="small muted">أو</span><div class="row" style="justify-content:center"><button class="btn sm" id="pu-f">اختار ملفات</button><button class="btn sm" id="pu-d">اختار فولدر</button></div></div><div class="pdf-bar" id="pu-bar" hidden><i></i></div><div class="small muted" id="pu-t"></div>');
    const run = async files => {
      files = files.filter(f => f.size > 132 && !/\.(txt|xml|html?|exe|ini|inf|jpe?g|png|pdf|dll|js|css|json|zip)$/i.test(f.name));
      if (!files.length) return toast('مفيش ملفات DICOM', 'err');
      const bar = $('#pu-bar', m.el); bar.hidden = false; let ok = 0, bad = 0, i = 0;
      await Promise.all(Array.from({ length: 3 }, async () => { while (i < files.length) { const f = files[i++]; try { const r = await fetch('/api/pacs/upload', { method: 'POST', body: f, credentials: 'same-origin', headers: { 'Content-Type': 'application/dicom' } }); if (!r.ok) throw 0; ok++; } catch (_) { bad++; } bar.firstChild.style.width = Math.round((ok + bad) / files.length * 100) + '%'; $('#pu-t', m.el).textContent = 'اترفع ' + ok + '/' + files.length + (bad ? ' · ' + bad + ' مش DICOM' : ''); } }));
      toast('اترفع ' + ok + ' ملف', ok ? 'hivis' : 'err'); if (ok) R.pacs(true);
    };
    const pick = dir => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; if (dir) i.webkitdirectory = true; i.onchange = () => run([...i.files]); i.click(); };
    $('#pu-f', m.el).onclick = () => pick(false); $('#pu-d', m.el).onclick = () => pick(true);
    const dz = $('#pdrop', m.el);
    dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); const out = [], items = [...(e.dataTransfer.items || [])].map(x => x.webkitGetAsEntry && x.webkitGetAsEntry()).filter(Boolean);
      if (!items.length) return run([...e.dataTransfer.files]);
      let pend = 0; const fin = () => { if (!pend) run(out); };
      const walk = en => { pend++; if (en.isFile) en.file(f => { out.push(f); pend--; fin(); }, () => { pend--; fin(); }); else if (en.isDirectory) { const rd = en.createReader(); const more = () => rd.readEntries(L => { if (L.length) { L.forEach(walk); more(); } else { pend--; fin(); } }, () => { pend--; fin(); }); more(); } else { pend--; fin(); } };
      items.forEach(walk); };
  };

  start();
})();
