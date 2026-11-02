/* طاقم · لوحة الإدارة */
(function () {
  'use strict';
  const { esc, $, $$, get, post, n, money, hm, hm24, dm, dmy, ic, av, toast, err, modal, confirm, form, busy } = K;
  const S = { me: null, boot: null, world: 'team', page: 'today', counts: {}, cache: {}, maps: {} };
  const cur = () => (S.boot && S.boot.settings.currency) || 'ج.م';
  const NAV = [
    ['الفريق', [['today', 'لوحة اليوم', 'today'], ['map', 'الخريطة الحيّة', 'map'], ['team', 'الموظفين', 'users'], ['att', 'الحضور والانصراف', 'cal'], ['tasks', 'المهام', 'task'], ['pay', 'المرتبات', 'cash'], ['chat', 'المحادثات', 'chat'], ['faults', 'بنك الأعطال', 'tool']]],
    ['متابعة العملاء', [['clients', 'العملاء والمراكز', 'store'], ['requests', 'طلبات العملاء', 'inbox'], ['follow', 'المتابعات', 'phone']]],
    ['النظام', [['settings', 'الإعدادات', 'gear']]]
  ];
  const ALLP = NAV.flatMap(g => g[1]);
  const titleOf = p => (ALLP.find(x => x[0] === p) || ['', 'طاقم'])[1];
  const BNAV = [['today', 'الرئيسية', 'home'], ['tasks', 'المهام', 'task'], ['team', 'الفريق', 'users'], ['clients', 'العملاء', 'store']];
  const STATE = { in: ['في الشغل', 'go'], on_way: ['في الطريق لمهمة', 'hivis'], visit: ['في زيارة', 'hivis'], out: ['انصرف', ''], absent: ['مجاش', 'stop'], rest: ['أجازة', ''], not_yet: ['لسه ميعاده مجاش', ''] };
  const TASK = { new: ['جديدة', 'sky'], on_way: ['في الطريق', 'hivis'], arrived: ['وصل', 'go'], done: ['خلصت', ''], cancelled: ['اتلغت', 'stop'] };
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
    try { S.me = (await get('/api/me')).user; } catch (e) { return gate(false, st); }
    await loadBoot();
    shell();
    window.addEventListener('hashchange', route);
    route();
    live();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').then(() => { K.pushAuto('/api'); K.seen('/api'); }).catch(() => {});
    setTimeout(() => K.pushPrompt('/api', 'يوصلك حضور وانصراف الموظفين وطلبات العملاء والرسايل — برقم على الأيقونة وحتى والبرنامج مقفول.'), 2500);
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
  const badgeOf = k => ({ requests: S.counts.requests, follow: S.counts.follow, chat: S.counts.chat, tasks: S.counts.tasks })[k] || 0;
  function shell() {
    const s = S.boot.settings;
    let rail = false; try { rail = localStorage.getItem('tq-rail') === '1'; } catch (_) {}
    const liveBox = '<div class="live" id="live"><div class="live-tag"><span class="dot live"></span>مباشر</div><div class="live-win"><div class="live-track" id="live-track"><span>بيحمّل…</span></div></div></div>';
    $('#root').innerHTML = '<div class="app ' + (rail ? 'rail' : '') + '" id="app">' +
      '<aside class="side"><a class="brand" href="#/today"><span class="logo"><img src="' + logoSrc(s) + '" alt=""></span><span class="brand-t"><b>' + esc(s.company) + '</b><span>نظام الإدارة</span></span><button class="rail-btn" data-act="rail" title="تصغير القايمة" aria-label="تصغير القايمة">' + ic('panel', 16) + '</button></a>' +
      '<nav class="nav" id="nav"></nav><div class="side-foot"><button class="out-btn" data-act="logout">' + ic('out', 18) + '<span>تسجيل خروج</span></button></div></aside>' +
      '<div class="main"><header class="top"><button class="ib" data-act="rail" aria-label="القايمة">' + ic('menu', 20) + '</button><button class="ib" data-act="back" aria-label="رجوع" id="backb">' + ic('back', 18) + '</button><h1 class="top-title" id="ttl"></h1><button class="ib" data-act="go" data-p="today" aria-label="الرئيسية">' + ic('home', 19) + '</button>' +
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
    const alerts = (S.counts.requests || 0) + (S.counts.follow || 0) + (S.counts.chat || 0);
    ['#bell-dot', '#bell-dot2'].forEach(x => { const d = $(x); if (d) { d.hidden = !alerts; d.parentNode.classList.toggle('ring-bell', !!alerts); } });
  }
  function route() {
    const p = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'today';
    S.page = R[p] ? p : 'today';
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
    const cl = await clientsList().catch(() => []);
    const all = ALLP.map(([k, t, i]) => ({ t, i, sub: 'قسم', run: () => go(k) }))
      .concat((S.boot.employees || []).map(e => ({ t: e.name, i: 'users', sub: e.job || 'موظف', run: () => empDay(e.id) })))
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
      es.addEventListener('task', ev => { const d = JSON.parse(ev.data || '{}'); if (d.arrived) toast('موظف وصل للعميل ✓', 'hivis'); else if (d.done) toast('مهمة خلصت ✓'); soft(['today', 'tasks', 'map']); ticker(true); });
      es.addEventListener('visit', () => soft(['today', 'map']));
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
    go: b => go(b.dataset.p),
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
      '<div class="cols"><div class="stack">' + timeline(B, d) + '<div class="card" style="padding:0;overflow:hidden"><div class="blk-hd"><h3>فين الفريق دلوقتي</h3><button class="btn sm ghost" data-act="go" data-p="map">' + ic('map', 15) + 'الخريطة كاملة</button></div><div class="map" id="m-today" style="border:0;border-radius:0;height:340px"></div></div></div>' +
      '<div class="stack">' + reqList(d.requests) + followList(d.follow) + '</div></div>';
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
        tr += '<div class="tl-bar ' + (a.out_at ? '' : 'open') + ' ' + (i === 0 && a.late_min ? 'late-in' : '') + '" style="inset-inline-start:' + pct(a0) + '%;width:' + Math.max(.6, pct(a1) - pct(a0)) + '%" title="' + esc(hm(a.in_at) + (a.out_at ? ' ← ' + hm(a.out_at) : ' — لسه في الشغل')) + '"></div>';
      });
      b.visits.forEach(v => { const v0 = mm(v.start_at), v1 = v.end_at ? mm(v.end_at) : (nowM != null ? nowM : v0 + 10); tr += '<div class="tl-visit" style="inset-inline-start:' + pct(v0) + '%;width:' + Math.max(1, pct(v1) - pct(v0)) + '%" title="' + esc(v.client_name + ' — ' + (v.purpose || '')) + '"></div>'; });
      if (!b.att.length) tr += '<div class="tl-note">' + (b.state === 'rest' ? 'أجازة' : b.state === 'not_yet' ? 'ميعاده ' + hm('x ' + b.shift.start) : 'مسجّلش حضور') + '</div>';
      if (nowM != null) tr += '<div class="tl-now" style="inset-inline-start:' + pct(nowM) + '%"></div>';
      const sub = b.att.length ? 'من ' + hm(b.att[0].in_at) + (b.late_min ? ' · <span style="color:var(--late)">متأخر ' + K.mins(b.late_min) + '</span>' : '') : '';
      const task = b.tasks.find(t => t.status === 'on_way');
      return '<div class="tl-row" data-act="emp" data-id="' + b.emp.id + '"><div class="tl-who">' + av(b.emp) + '<div><b>' + esc(b.emp.name) + '</b><small><span class="dot ' + (['in', 'on_way', 'visit'].includes(b.state) ? 'live' : '') + ' state-' + b.state + '"></span>' + st[0] + (task ? ' ← ' + esc(task.client_name || task.title) : sub ? ' · ' + sub : '') + '</small></div></div><div class="tl-track">' + tr + '</div></div>';
    }).join('');
    const scale = '<div class="tl-scale"><div class="lbl">الساعة</div><div class="tl-track tl-hours" style="height:28px">' + hours.filter(h => (h - s0 / 60) % step === 0).map(h => '<span style="inset-inline-start:' + pct(h * 60) + '%">' + ((h % 12) || 12) + (h < 12 ? 'ص' : 'م') + '</span>').join('') + (nowM != null ? '<div class="tl-now" data-t="' + hm24(d.now) + '" style="inset-inline-start:' + pct(nowM) + '%;background:transparent"></div>' : '') + '</div></div>';
    return '<div class="card day"><div class="day-hd"><h2>شريط اليوم</h2><div class="legend"><span><i style="background:var(--brand)"></i>حضور</span><span><i style="background:var(--hivis)"></i>زيارة عميل</span><span><i style="background:var(--late)"></i>تأخير</span><span><i style="border:1px dashed var(--line-2)"></i>الوردية</span></div></div><div class="tl">' + scale + rows + '</div></div>';
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
      const mk = L.marker([e.last_lat, e.last_lng], { icon: K.empPin(e, !!t), zIndexOffset: 1000 }).addTo(m)
        .bindTooltip('<b>' + esc(e.name) + '</b><br>' + K.ago(e.last_at, S.boot.now || L0.now) + (t ? '<br>في الطريق: ' + esc(t.client_name || t.title) + ' (' + K.dist(t.dist) + ')' : ''), { direction: 'top', offset: [0, -30] })
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
    const lanes = [['new', 'جديدة', T.filter(t => t.status === 'new')], ['on_way', 'في الطريق', T.filter(t => t.status === 'on_way')], ['arrived', 'وصل', T.filter(t => t.status === 'arrived')], ['done', 'خلصت (آخر 3 أيام)', T.filter(t => t.status === 'done' && recent(t.done_at))]];
    view().innerHTML = '<div class="ph"><div><h1>المهام</h1><div class="sub">ابعت موظف لعميل — يشوفها على موبايله، ولما يبدأ تتابع المسافة لحد ما يوصل.</div></div><div class="acts"><button class="btn primary" data-act="newTask">' + ic('plus', 16) + 'مهمة جديدة</button></div></div>' +
      '<div class="lanes">' + lanes.map(([k, t, list]) => '<div class="lane"><div class="lane-hd"><span class="dot ' + (k === 'on_way' ? 'live' : '') + '" style="color:' + ({ new: 'var(--sky)', on_way: '#B88700', arrived: 'var(--go)', done: 'var(--ink-3)' }[k]) + '"></span>' + t + '<span class="n">' + list.length + '</span></div>' +
        (list.map(t => { const e = empById(t.emp_id) || { name: '؟' }; const p = t.status === 'on_way' && t.d0 ? Math.max(0, Math.min(100, (1 - (t.dist || 0) / t.d0) * 100)) : null;
          return '<div class="tk"><div class="row" style="gap:8px">' + av(e, 'sm') + '<span class="small grow">' + esc(e.name) + '</span><span class="faint xs">' + K.ago(t.created_at, S.boot.now) + '</span></div><h5>' + esc(t.title) + '</h5>' + (t.client_name ? '<div class="small muted">' + ic('pin', 13) + ' ' + esc(t.client_name) + '</div>' : '') + (t.note ? '<div class="small">' + esc(t.note) + '</div>' : '') +
            (p != null ? '<div class="prog"><i style="width:' + p + '%"></i></div><div class="xs muted">فاضل ' + K.dist(t.dist) + ' من ' + K.dist(t.d0) + '</div>' : '') +
            (t.status === 'done' ? (t.done_note ? '<div class="small" style="background:var(--paper-2);padding:8px 10px;border-radius:10px">' + esc(t.done_note) + '</div>' : '') + (t.photo_id ? '<img class="thumb" data-act="photo" data-src="/api/photo/' + t.photo_id + '" src="/api/photo/' + t.photo_id + '" alt="">' : '') + '<div class="xs muted">خلصت ' + hm(t.done_at) + (t.arrived_at ? ' · وصل ' + hm(t.arrived_at) : '') + '</div>' : '<div class="row" style="gap:6px"><button class="btn sm ghost danger" data-act="taskcancel" data-id="' + t.id + '">إلغاء</button>' + (t.arrived_at ? '<span class="xs muted">وصل ' + hm(t.arrived_at) + '</span>' : '') + '</div>') + '</div>';
        }).join('') || '<div class="faint small" style="padding:10px 4px">مفيش</div>') + '</div>').join('') + '</div>';
  };
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
        list.map(c => '<tr class="cl-row" data-act="client" data-id="' + c.id + '"><td>' + esc(c.name) + (c.open_req ? ' <span class="chip hivis">' + c.open_req + ' طلب</span>' : '') + '</td><td class="muted">' + esc(c.grp || '—') + '</td><td dir="ltr" style="text-align:end" class="tnum muted">' + esc(c.phone || '') + '</td><td class="tnum ' + (c.balance > 0 ? 'bal-pos' : c.balance < 0 ? 'bal-neg' : '') + '">' + (c.balance ? money(c.balance) : '—') + '</td><td class="muted small">' + (c.last_touch ? dm(c.last_touch) : '—') + '</td><td>' + (c.next_follow ? (c.next_follow < today() ? chip('متأخرة · ' + dm(c.next_follow), 'stop') : c.next_follow === today() ? chip('النهارده', 'hivis') : chip(dm(c.next_follow))) : '<span class="faint">—</span>') + '</td><td>' + (c.portal_on ? '<span class="chip go"><span class="dot"></span>' + (c.portal_seen ? 'فتحه ' + dm(c.portal_seen) : 'شغال') + '</span>' : chip('متوقف')) + '</td></tr>').join('') +
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
    const sec = sessionStorage.getItem('tq-set') || S.setSec || 'company'; sessionStorage.removeItem('tq-set'); S.setSec = sec;
    const NAV = [['company', 'الشركة'], ['shift', 'الدوام'], ['track', 'الموقع والتتبع'], ['portal', 'لينك العميل'], ['pay', 'المرتبات'], ['users', 'المديرين'], ['me', 'حسابي والإشعارات'], ['data', 'النسخة الاحتياطية']];
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
      users: '<div class="card pad"><section><div class="row"><h3 class="grow">المديرين</h3>' + (S.me.role === 'admin' ? '<button class="btn sm" id="u-add">' + ic('plus', 15) + 'مدير</button>' : '') + '</div><div id="ulist" class="muted small">بيحمّل…</div></section></div>',
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
    const d = await get('/api/users');
    $('#ulist').innerHTML = d.users.map(u => '<div class="row" style="padding:10px 0;border-bottom:1px solid var(--line);color:var(--ink)"><b class="grow">' + esc(u.name) + ' <span class="faint small" dir="ltr">@' + esc(u.username) + '</span></b>' + chip(u.role === 'admin' ? 'مدير عام' : 'مدير') + (S.me.role === 'admin' && u.id !== S.me.id ? '<button class="btn sm ghost danger" data-act="udel" data-id="' + u.id + '">' + ic('trash', 14) + '</button>' : '') + '</div>').join('');
    const a = $('#u-add'); if (a) a.onclick = () => {
      const m = modal('<div class="modal-hd"><h3>مدير جديد</h3></div><form id="uf" style="display:grid;gap:12px"><label class="field"><span>الاسم</span><input class="input" name="name" required></label><label class="field"><span>اسم الدخول (إنجليزي)</span><input class="input" name="username" dir="ltr" required></label><label class="check"><input type="checkbox" name="admin"> مدير عام (يضيف ويمسح مديرين)</label><div class="modal-ft"><button type="button" class="btn" data-close>رجوع</button><button class="btn primary">إضافة</button></div></form>');
      $('#uf', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => { const f = form($('#uf', m.el)); const r = await post('/api/users', { name: f.name, username: f.username, role: f.admin ? 'admin' : 'manager' }); m.close(); modal('<div class="modal-hd"><h3>بيانات الدخول</h3></div><div class="secret"><span class="small muted">اسم الدخول</span><code>' + esc(r.username) + '</code><span class="small muted">الباسورد</span><code>' + esc(r.password) + '</code></div><div class="modal-ft"><button class="btn primary" data-close>تمام</button></div>'); loadUsers(); }); };
    };
  }
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
      $('#cs-go', m.el).onclick = ev => busy(ev.currentTarget, async () => { const x = await capi('POST', '/make', { cid, name: c.name, wa: c.phone || '', pass: $('#cs-pw', m.el).value || '' }); m.close(); casesModal(cid, x.pass); });
      return;
    }
    if (!s.wa && c.phone) capi('POST', '/wa', { cid, wa: c.phone, ifEmpty: true }).catch(() => {});
    const u = location.origin + '/k/' + s.code, fixedU = location.origin + '/h/' + s.pub;
    const msg = 'السلام عليكم ' + c.name + ' 🌿\nده لينك «حالات المرضى» من *' + S.boot.settings.company + '*:\n' + u + (fresh ? '\nالباسوورد: ' + fresh : '') + '\n\nافتحوه من كمبيوتر المركز، اسحبوا PDF الحالة، وهيطلعلكم باركود تلزقوه للمريض — المريض يمسحه ويشوف أشعته على موبايله.\nسيبوا الصفحة مفتوحة على الكمبيوتر عشان الحالات القديمة تفضل تفتح.';
    const m = modal('<div class="modal-hd"><h3>حالات المرضى — ' + esc(c.name) + '</h3><button class="btn ghost icon" data-close aria-label="قفل">' + ic('x') + '</button></div>' +
      (fresh ? '<div class="secret" style="text-align:center;margin-bottom:12px"><span class="small muted">الباسوورد (اكتبه دلوقتي — مش هيظهر تاني)</span><code style="font-size:30px;letter-spacing:4px;text-align:center">' + esc(fresh) + '</code></div>' : '') +
      '<div class="linkbox">' + ic('link', 18) + '<code>' + esc(u) + '</code><button class="btn sm" data-act="copy" data-text="' + esc(u) + '">' + ic('copy', 14) + 'نسخ</button><a class="btn sm" target="_blank" rel="noopener" href="' + esc(u) + '">' + ic('ext', 14) + 'فتح</a></div>' +
      '<div class="kv" style="margin-top:12px"><div><span>الحالة</span><b style="font-size:17px;color:' + (s.online ? 'var(--go)' : 'var(--ink-2)') + '">' + (s.online ? '● متصل دلوقتي' : (s.last_seen ? 'آخر دخول ' + esc(String(s.last_seen).slice(0, 16)) : 'لسه مدخلش')) + '</b></div><div><span>حالات</span><b>' + s.cases + '</b></div><div><span>مرة اتفتحت</span><b>' + s.views + '</b></div></div>' +
      (s.pub ? '<p class="small muted" style="margin-top:12px">📌 الباركود الثابت للورق (المريض يكتب موبايله وأول اسمه): <a href="' + esc(fixedU) + '" target="_blank" rel="noopener" style="direction:ltr;unicode-bidi:isolate;color:var(--brand-2)">' + esc(fixedU) + '</a>' + (s.fixed ? '' : ' — <b>موقوف من المركز</b>') + '</p>' : '') +
      '<div class="row" style="margin-top:12px"><span class="small" style="white-space:nowrap;font-weight:700">💬 واتساب طلبات المرضى</span><input class="input" id="cs-wa-n" value="' + esc(s.wa || '') + '" placeholder="' + esc(c.phone || '01xxxxxxxxx') + '" style="direction:ltr;text-align:right"><button class="btn sm" id="cs-wa-s">حفظ</button></div>' +
      '<p class="small muted" style="margin-top:6px">المريض اللي مايلاقيش نتيجته بيبعت على الرقم ده' + (s.wa ? '' : ' (فاضي → بيتبعت على رقم المركز)') + '.' + (s.asks ? ' <b style="color:var(--go)">' + s.asks + ' طلب مفتوح</b>' : '') + '</p>' +
      (!s.active ? '<p class="small" style="color:var(--stop);font-weight:700;margin-top:6px">⏸ اللينك موقوف — المركز مش هيقدر يدخل والمرضى مش هيفتحوا.</p>' : '') +
      '<div class="modal-ft"><button class="btn ghost" id="cs-rt">' + ic('refresh', 15) + 'لينك جديد</button><button class="btn ghost" id="cs-st">' + (s.active ? '⏸ إيقاف' : '▶ تشغيل') + '</button><button class="btn" id="cs-pw2">' + ic('key', 15) + 'باسوورد جديد</button>' + (c.phone ? '<a class="btn go" target="_blank" rel="noopener" href="' + K.wa(c.phone, msg) + '">' + ic('wa', 15) + 'واتساب' + (fresh ? ' (اللينك + الباسوورد)' : '') + '</a>' : '') + '</div>', { wide: true });
    $('#cs-wa-s', m.el).onclick = ev => busy(ev.currentTarget, async () => { await capi('POST', '/wa', { cid, wa: $('#cs-wa-n', m.el).value.trim() }); toast('اتحفظ رقم الواتساب'); });
    $('#cs-pw2', m.el).onclick = async () => { if (!await confirm('تعمل باسوورد جديد؟', 'المركز هيخرج ولازم يدخل بالجديد.', 'باسوورد جديد')) return; const x = await capi('POST', '/pass', { cid }).catch(err); if (x) { m.close(); casesModal(cid, x.pass); } };
    $('#cs-st', m.el).onclick = async () => { await capi('POST', '/stop', { cid, on: !s.active }).catch(err); toast(s.active ? 'لينك الحالات اتوقف' : 'لينك الحالات اشتغل'); m.close(); casesModal(cid); };
    $('#cs-rt', m.el).onclick = async () => { if (!await confirm('تعمل لينك جديد؟', 'اللينك القديم هيقف (الباركودات اللي اتطبعت للمرضى مش بتتأثر).', 'لينك جديد')) return; await capi('POST', '/rotate', { cid }).catch(err); toast('اتعمل لينك جديد — ابعته للمركز'); m.close(); casesModal(cid); };
  }
  ACT.cases = b => casesModal(b.dataset.id).catch(err);

  start();
})();
