/* طاقم · تطبيق الموظف */
(function () {
  'use strict';
  const { esc, $, $$, get, post, n, money, hm, dm, ic, av, toast, err, modal, confirm, form, busy } = K;
  let H = null, tab = 'home', skew = 0, lastPing = 0, watchId = null, lastTaskPing = 0, wake = null, tickT = null, homeT = null;
  const serverNow = () => new Date(Date.now() + skew);
  const cairoParts = d => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d); return { h: +p.find(x => x.type === 'hour').value, m: +p.find(x => x.type === 'minute').value }; };
  const toM = s => { const p = /(\d{1,2}):(\d{2})/.exec(String(s || '')); return p ? (+p[1]) * 60 + (+p[2]) : null; };
  const tsMs = ts => Date.parse(String(ts).replace(' ', 'T') + 'Z');

  async function start() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/app-sw.js', { scope: '/app' }).then(() => { K.pushAuto('/s/api').then(ok => { if (ok && H && !H.push) { H.push = true; if (tab === 'home') render(); } }); K.seen('/s/api'); }).catch(() => {});
    try { await loadHome(); } catch (e) { if (e.status === 401) return login(); $('#root').innerHTML = '<div class="wrap-app"><div class="empty"><b>مفيش اتصال</b>اتأكد من النت وجرّب تاني.<br><br><button class="btn primary" onclick="location.reload()">جرّب تاني</button></div></div>'; return; }
    shell(); render();
    tickT = setInterval(tick, 15000);
    homeT = setInterval(() => { if (!document.hidden) loadHome().then(render).catch(() => {}); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { K.seen('/s/api'); loadHome().then(render).catch(() => {}); maybePing(); } });
    setTimeout(() => { if (!H.push) K.pushPrompt('/s/api', 'توصلك المهام الجديدة ورسايل الإدارة والمكافآت — برقم على الأيقونة وحتى والتطبيق مقفول.'); }, 2000);
    setInterval(maybePing, 60000); maybePing();
  }
  async function loadHome() {
    H = await get('/s/api/home');
    skew = tsMs(H.now) - Date.now();   // the server's Cairo wall-clock, read as if it were UTC (only used for showing time and durations)
    syncTaskWatch();
    if (H.rewards && H.rewards.length) celebrate(H.rewards);
  }
  const nowWall = () => Date.now() + skew;   // Cairo wall time as if it were UTC

  function login() {
    $('#root').innerHTML = '<div class="gate"><div class="aur a1"></div><div class="aur a2"></div><form class="gate-card" id="lf" autocomplete="on"><div class="gate-logo"><img src="/icons/icon.svg" alt="" id="lg-img"></div><h2 id="lg-name">طاقم</h2><p class="sub">دخول الموظف — سجّل حضورك ومهامك</p>' +
      '<div class="gin">' + ic('user', 18) + '<input class="input" name="username" dir="ltr" placeholder="اسم المستخدم" autocomplete="username" autocapitalize="off" required style="text-align:right"></div>' +
      '<div class="gin">' + ic('lock', 18) + '<input class="input" type="password" name="password" placeholder="كلمة المرور" autocomplete="current-password" inputmode="numeric" required><button type="button" class="eye" aria-label="إظهار الباسورد">' + ic('eye', 18) + '</button></div>' +
      '<button class="btn primary bigbtn">تسجيل الدخول</button><div class="gchips"><span><i style="background:#34D399"></i>بالموقع</span><span><i style="background:#60A5FA"></i>بتوقيت السيرفر</span><span><i style="background:#C084FC"></i>آمن</span></div></form></div>';
    get('/s/api/brand').then(b => { if (b.company) $('#lg-name').textContent = b.company; if (b.logo) $('#lg-img').src = b.logo; }).catch(() => {});
    const eb = $('.eye'); eb.onclick = () => { const i = eb.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; eb.innerHTML = ic(i.type === 'password' ? 'eye' : 'eyeoff', 18); };
    $('#lf').onsubmit = e => { e.preventDefault(); busy(e.submitter, async () => { await post('/s/api/login', form($('#lf'))); location.reload(); }); };
  }

  function shell() {
    $('#root').innerHTML = '<header class="mhead" id="mhead"></header><main class="wrap-app" id="view"></main><nav class="gbar" id="dock">' +
      [['home', 'الرئيسية', 'home'], ['faults', 'الأعطال', 'tool'], ['month', 'شهري', 'cal'], ['chat', 'الإدارة', 'chat']].map(([k, t, i]) => '<button class="bn-item" data-tab="' + k + '">' + ic(i, 22) + t + (k === 'chat' ? '<span class="badge" id="unr" hidden></span>' : '') + '</button>').join('') + '</nav>';
    $$('#dock .bn-item').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); window.scrollTo(0, 0); });
  }
  let lastTab = null;
  function render() {
    $$('#dock .bn-item').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    K.glass($('#dock'));
    const u = $('#unr'); if (u) { u.hidden = !H.unread; u.textContent = H.unread; }
    const chatBtn = $('#dock [data-tab=chat]'); if (chatBtn) chatBtn.hidden = !H.settings.chat_on;
    head();
    ({ home, faults, month, chat })[tab]();
    const v = $('#view'); if (lastTab !== tab) { v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); lastTab = tab; }
  }
  function head() {
    const me = H.me, s = H.settings, open = H.open, hr = cairoParts(new Date()).h;
    const t = H.tasks.find(x => x.status === 'on_way');
    const status = t ? 'في الطريق لـ ' + (t.client_name || t.title) : H.visit ? 'عند ' + H.visit.client_name : open ? 'في الشغل من ' + hm(open.in_at) : H.rest ? 'النهارده أجازتك' : 'لسه مسجّلتش حضور';
    $('#mhead').innerHTML = '<div class="mhead-row"><span class="logo"><img src="' + esc(s.logo || '/icons/icon.svg') + '" alt=""></span><div class="who"><small>' + (hr < 12 ? 'صباح الخير' : 'مساء الخير') + '</small><b>' + esc(me.name.split(' ')[0]) + '</b></div>' +
      '<button class="ib" id="h-theme" aria-label="فاتح / غامق">' + ic(K.theme.dark() ? 'sun' : 'moon', 18) + '</button><button class="ib" id="h-me" aria-label="حسابي">' + av(me, 'sm') + '</button></div>' +
      '<div class="strip"><span class="tag"><span class="dot ' + (open ? 'live' : '') + '"></span>' + (open ? 'شغّال' : 'مش في الشغل') + '</span><span class="txt">' + esc(status) + '</span></div>';
    $('#h-theme').onclick = () => { K.theme.set(K.theme.dark() ? 'light' : 'dark'); render(); };
    $('#h-me').onclick = meSheet;
  }
  function meSheet() {
    const m = modal('<div class="modal-hd">' + av(H.me, 'lg') + '<div class="grow"><h3>' + esc(H.me.name) + '</h3><div class="muted small">' + esc(H.me.job || '') + '</div></div><button class="btn ghost icon" data-close aria-label="قفل">' + ic('x') + '</button></div>' +
      '<div style="display:grid;gap:8px"><button class="btn bigbtn" id="me-photo">' + ic('camera', 18) + 'غيّر صورتي</button><button class="btn bigbtn" id="me-pw">' + ic('key', 18) + 'غيّر الباسورد</button>' + (!H.push && 'Notification' in window ? '<button class="btn bigbtn" id="me-push">' + ic('bell', 18) + 'شغّل الإشعارات</button>' : '') + '<button class="btn bigbtn danger" id="me-out">' + ic('out', 18) + 'تسجيل خروج</button></div>');
    $('#me-photo', m.el).onclick = async () => { const p = await K.pickImage(320, .6); if (!p) return; await post('/s/api/photo', { photo: p }).catch(err); m.close(); await loadHome(); render(); toast('الصورة اتغيرت'); };
    $('#me-pw', m.el).onclick = () => { m.close(); changePw(); };
    const pu = $('#me-push', m.el); if (pu) pu.onclick = () => busy(pu, async () => { await K.push('/s/api'); H.push = true; m.close(); toast('الإشعارات اشتغلت ✓'); render(); });
    $('#me-out', m.el).onclick = async () => { m.close(); if (await confirm('تسجيل خروج من التطبيق؟', H.open ? 'الحضور مش هيتقفل — سجّل انصراف الأول لو خلصت.' : '', 'خروج')) { await post('/s/api/logout'); location.reload(); } };
  }

  /* ════ الرئيسية ════ */
  function home() {
    $('#view').innerHTML =
      (!H.push && 'Notification' in window ? '<div class="banner">' + ic('bell', 18) + '<span class="grow">شغّل الإشعارات عشان المهام توصلك فورًا.</span><button class="btn sm primary" id="pushon">شغّل</button></div>' : '') +
      clock() + visitBlock() + tasksBlock();
    tick();
    $('#punch').onclick = punch;
    const po = $('#pushon'); if (po) po.onclick = () => busy(po, async () => { await K.push('/s/api'); H.push = true; toast('الإشعارات اشتغلت ✓'); render(); });
    const vb = $('#v-start'); if (vb) vb.onclick = visitStart;
    const ve = $('#v-end'); if (ve) ve.onclick = visitEnd;
    $$('[data-task]').forEach(b => b.onclick = () => taskAct(b.dataset.task, +b.dataset.id, b));
  }
  function clock() {
    const open = H.open, sh = H.shift;
    const nm = (() => { const p = cairoParts(new Date()); return p.h * 60 + p.m; })();
    const s0 = toM(sh.start), s1 = toM(sh.end), span = Math.max(60, (s1 || 1020) - (s0 || 540));
    let frac = 0, label;
    if (open) { const mins = (nowWall() - tsMs(open.in_at)) / 60000; frac = Math.max(0, Math.min(1, mins / span)); label = 'في الشغل من ' + K.mins(mins); }
    else if (H.rest) label = 'النهارده أجازتك';
    else if (H.today_att.length) label = 'انصرفت ' + hm(H.today_att[H.today_att.length - 1].out_at);
    else label = 'ورديتك ' + hm('x ' + sh.start) + ' – ' + hm('x ' + sh.end);
    const C = 2 * Math.PI * 46;
    const late = open && open.late_min ? '<span class="chip late">متأخر ' + K.mins(open.late_min) + '</span>' : '';
    return '<section class="clock ' + (open ? 'on' : '') + '"><div class="ring"><svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF5A65"/><stop offset="1" stop-color="#C8161F"/></linearGradient></defs><circle class="trk" cx="50" cy="50" r="46" fill="none" stroke-width="6"/><circle class="shift" cx="50" cy="50" r="46" fill="none" stroke-width="1.2"/>' + (frac > 0.005 ? '<circle class="done" cx="50" cy="50" r="46" fill="none" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + (frac * C).toFixed(1) + ' ' + C.toFixed(1) + '"/>' : '') + '</svg>' +
      '<div class="face"><div><span class="t" id="ck-t">--:--</span> <span class="ap" id="ck-ap"></span></div><div class="lbl muted" id="ck-l">' + esc(label) + '</div></div></div>' +
      '<div class="clock-meta">' + (open && open.in_site ? '<span class="chip">' + ic('pin', 13) + ' ' + esc(open.in_site) + (open.in_dist != null ? ' · ' + K.dist(open.in_dist) : '') + '</span>' : '') + late + '</div>' +
      '<button class="punch" id="punch">' + ic(open ? 'out' : 'play', 24) + (open ? 'سجّل انصراف' : 'سجّل حضور') + '</button>' +
      '<div class="geo muted" id="geo">' + (s => s.require_location ? ic('pin', 14) + 'الحضور بيتسجل بموقعك وبتوقيت السيرفر' : ic('clock', 14) + 'الحضور بيتسجل بتوقيت السيرفر')(H.settings) + '</div></section>';
  }
  function tick() {
    const d = new Date(nowWall()), h = d.getUTCHours(), m = d.getUTCMinutes();
    const t = $('#ck-t'), ap = $('#ck-ap'); if (!t) return;
    t.textContent = ((h % 12) || 12) + ':' + String(m).padStart(2, '0'); ap.textContent = h < 12 ? 'ص' : 'م';
    if (H.open) { const l = $('#ck-l'); if (l) l.textContent = 'في الشغل من ' + K.mins((nowWall() - tsMs(H.open.in_at)) / 60000); }
  }
  async function punch(e) {
    const b = e.currentTarget, wasOpen = !!H.open;
    if (wasOpen && !await confirm('تسجيل انصراف؟', H.visit ? 'الزيارة المفتوحة هتتقفل كمان.' : 'هيتسجل دلوقتي ' + hm(new Date(nowWall()).toISOString().replace('T', ' ')), 'سجّل انصراف')) return;
    busy(b, async () => {
      $('#geo').innerHTML = '<span class="dot live" style="color:var(--hivis)"></span> بنحدد مكانك…';
      const p = await K.locate(20000);
      if (!p && H.settings.require_location) { $('#geo').innerHTML = ic('pin', 14) + 'افتح الموقع (GPS) واسمح للمتصفح يستخدمه'; throw new Error('مش قادرين نحدد مكانك — افتح الـ GPS'); }
      const bat = await K.battery();
      const r = await post('/s/api/punch', Object.assign({ battery: bat }, p || {}));
      H = Object.assign(H, r.home); lastPing = Date.now();
      if (r.kind === 'in') toast(r.late ? 'اتسجل حضورك — متأخر ' + K.mins(r.late) : 'اتسجل حضورك ✓ يوم موفق', r.late ? 'err' : 'hivis');
      else toast('اتسجل انصرافك ✓ تعيش');
      if (r.outside) toast('إنت بعيد عن ' + r.site.name + ' بـ ' + K.dist(r.site.dist) + ' — الإدارة هتشوف ده', 'err');
      if (navigator.vibrate) navigator.vibrate(60);
      render();
    });
  }
  async function maybePing() {
    if (!H || !H.open || !H.me.track) return;
    if (Date.now() - lastPing < (H.settings.ping_min || 15) * 60000 - 5000) return;
    const p = await K.locate(15000); if (!p) return;
    lastPing = Date.now();
    post('/s/api/ping', Object.assign({ battery: await K.battery() }, p)).catch(() => {});
  }

  /* ── الزيارة ── */
  function visitBlock() {
    const v = H.visit;
    if (v) return '<section class="visit-on"><div class="row">' + ic('pin', 20) + '<div class="grow"><b>إنت عند ' + esc(v.client_name) + '</b><div class="small muted">' + esc(v.purpose || '') + ' · من ' + hm(v.start_at) + '</div></div></div><button class="btn primary bigbtn" id="v-end">' + ic('check', 18) + 'خلّصت الزيارة</button></section>';
    if (!H.open) return '';
    return '<button class="btn bigbtn" id="v-start">' + ic('pin', 18) + 'وصلت عند عميل — ابدأ زيارة</button>';
  }
  async function visitStart() {
    const d = await get('/s/api/clients').catch(err); if (!d) return;
    const m = modal('<div class="modal-hd"><h3>زيارة جديدة</h3><button class="btn ghost icon" data-close>' + ic('x') + '</button></div><form id="vf" style="display:grid;gap:12px"><label class="field"><span>العميل</span><input class="input" list="vcl" id="vc" placeholder="اكتب اسم العميل" required><datalist id="vcl">' + d.clients.map(c => '<option value="' + esc(c.name) + '">').join('') + '</datalist></label>' +
      '<div class="field"><span>ليه؟</span><div class="row wrap" id="vp">' + H.settings.purposes.map((p, i) => '<button type="button" class="chip" style="height:36px;border:0;cursor:pointer;font-size:14px" data-p="' + esc(p) + '">' + esc(p) + '</button>').join('') + '</div></div><div class="modal-ft"><button class="btn primary bigbtn">' + ic('pin', 18) + 'ابدأ الزيارة</button></div></form>');
    let purpose = '';
    $$('#vp [data-p]', m.el).forEach(b => b.onclick = () => { purpose = b.dataset.p; $$('#vp [data-p]', m.el).forEach(x => { x.classList.toggle('hivis', x === b); }); });
    $('#vf', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => {
      const name = $('#vc', m.el).value.trim(), c = d.clients.find(x => x.name === name); if (!c) throw new Error('اختار العميل من القايمة');
      const p = await K.locate(12000);
      const r = await post('/s/api/visit', Object.assign({ client_id: c.id, purpose }, p || {}));
      H = Object.assign(H, r.home); m.close(); toast('الزيارة بدأت'); render();
    }); };
  }
  function doneForm(title, withHand, cb) {
    const m = modal('<div class="modal-hd"><h3>' + esc(title) + '</h3><button class="btn ghost icon" data-close>' + ic('x') + '</button></div><form id="df" style="display:grid;gap:12px">' +
      '<label class="field"><span>عملت إيه؟</span><textarea class="input" name="note" placeholder="مثلاً: سلّمت 5 كرتونة ورق A4"></textarea></label>' +
      (withHand ? '<label class="field"><span>سلّمت لمين في المكان؟</span><input class="input" name="handed_to" placeholder="الاسم"></label>' : '') +
      '<div class="field"><span>صورة إثبات (واحدة)</span><div class="row"><button type="button" class="btn" id="df-ph">' + ic('camera', 16) + 'صوّر</button><img id="df-img" class="thumb" hidden alt=""></div></div>' +
      '<details><summary class="small" style="cursor:pointer;font-weight:600">صلّحت عطل؟ سجّل الحل في بنك الأعطال</summary><div style="display:grid;gap:10px;margin-top:10px"><div class="grid2"><input class="input" name="fault_code" placeholder="كود العطل (لو فيه)" dir="ltr"><input class="input" name="fault_title" placeholder="العطل"></div><textarea class="input" name="fault_solution" placeholder="الحل خطوة بخطوة"></textarea></div></details>' +
      '<div class="modal-ft"><button class="btn primary bigbtn">' + ic('check', 18) + 'تمام</button></div></form>');
    let photo = null;
    $('#df-ph', m.el).onclick = async () => { const p = await K.pickImage(800, .35); if (p) { photo = p; const i = $('#df-img', m.el); i.src = p; i.hidden = false; } };
    $('#df', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => { const f = form($('#df', m.el)); if (photo) f.photo = photo; const p = await K.locate(8000); await cb(Object.assign(f, p || {})); m.close(); }); };
  }
  function visitEnd() { doneForm('خلّصت عند ' + H.visit.client_name, true, async f => { const r = await post('/s/api/visit/end', f); H = Object.assign(H, r.home); toast('الزيارة اتقفلت ✓'); render(); }); }

  /* ── المهام ── */
  function tasksBlock() {
    if (!H.tasks.length) return '';
    return '<section class="sect"><div class="sect-hd"><h3>مهامك</h3><span class="chip">' + H.tasks.length + '</span></div>' + H.tasks.map(t => {
      const maps = t.c_lat != null ? 'https://www.google.com/maps/dir/?api=1&destination=' + t.c_lat + ',' + t.c_lng : t.c_address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(t.c_address) : '';
      const pct = t.status === 'on_way' && t.d0 ? Math.max(0, Math.min(1, 1 - (t.dist || 0) / t.d0)) : 0;
      return '<div class="tcard ' + (t.status === 'on_way' ? 'live' : '') + '"><div class="row"><div class="grow"><h4>' + esc(t.title) + '</h4>' + (t.client_name ? '<div class="small muted">' + ic('pin', 13) + ' ' + esc(t.client_name) + (t.c_address ? ' — ' + esc(t.c_address) : '') + '</div>' : '') + '</div>' + (t.status === 'arrived' ? '<span class="chip go">وصلت</span>' : t.status === 'on_way' ? '<span class="chip hivis"><span class="dot live"></span>في الطريق</span>' : '<span class="chip sky">جديدة</span>') + '</div>' +
        (t.note ? '<div style="white-space:pre-wrap;font-size:14.5px">' + esc(t.note) + '</div>' : '') +
        (t.status === 'on_way' ? '<div class="road" style="--p:' + pct.toFixed(3) + '"><div class="ln"></div><div class="fill"></div><div class="car">' + ic('route', 16) + '</div><div class="end">' + ic('pin', 15) + '</div></div><div class="small muted" style="text-align:center">فاضل ' + K.dist(t.dist) + ' — الإدارة شايفة إنك في الطريق</div>' : '') +
        '<div class="row wrap" style="gap:6px">' + (maps ? '<a class="btn sm" target="_blank" rel="noopener" href="' + maps + '">' + ic('map', 15) + 'الطريق</a>' : '') + (t.c_phone ? '<a class="btn sm" href="tel:' + esc(t.c_phone) + '">' + ic('phone', 15) + 'اتصل</a>' : '') + '</div>' +
        (t.status === 'new' ? '<button class="btn primary bigbtn" data-task="start" data-id="' + t.id + '">' + ic('route', 18) + 'أنا في الطريق</button>'
          : t.status === 'on_way' ? '<button class="btn go bigbtn" data-task="arrive" data-id="' + t.id + '">' + ic('pin', 18) + 'وصلت</button>'
            : '<button class="btn primary bigbtn" data-task="done" data-id="' + t.id + '">' + ic('check', 18) + 'خلّصت المهمة</button>') + '</div>';
    }).join('') + '</section>';
  }
  async function taskAct(kind, id, b) {
    const t = H.tasks.find(x => x.id === id);
    if (kind === 'done') return doneForm('خلّصت: ' + t.title, true, async f => { const r = await post('/s/api/task/done', Object.assign(f, { id })); H = Object.assign(H, r.home); toast('عاش! المهمة خلصت ✓', 'hivis'); syncTaskWatch(); render(); });
    busy(b, async () => {
      if (kind === 'start' && !H.open) throw new Error('سجّل حضور الأول');
      const p = await K.locate(15000);
      const r = await post('/s/api/task/' + kind, Object.assign({ id }, p || {}));
      if (r.home) H = Object.assign(H, r.home);
      toast(kind === 'start' ? 'ربنا معاك — هنبعت مكانك كل 30 ثانية لحد ما توصل' : 'وصلت ✓');
      syncTaskWatch(); render();
    });
  }
  /* while on the way: watch the position and report every 30 s; arriving is detected on the server */
  function syncTaskWatch() {
    const t = H && H.tasks.find(x => x.status === 'on_way');
    if (t && watchId == null && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(async pos => {
        if (Date.now() - lastTaskPing < 30000) return; lastTaskPing = Date.now();
        const cur = H.tasks.find(x => x.status === 'on_way'); if (!cur) return;
        try {
          const r = await post('/s/api/task/ping', { id: cur.id, lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
          if (r.arrived) { H = Object.assign(H, r.home); toast('وصلت ✓ الإدارة اتبلّغت', 'hivis'); if (navigator.vibrate) navigator.vibrate([80, 60, 80]); syncTaskWatch(); }
          else if (r.dist != null) cur.dist = r.dist;
          if (tab === 'home') render();
        } catch (_) {}
      }, () => {}, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
      if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(w => { wake = w; }).catch(() => {});
    } else if (!t && watchId != null) {
      navigator.geolocation.clearWatch(watchId); watchId = null;
      if (wake) { wake.release().catch(() => {}); wake = null; }
    }
  }

  /* ════ بنك الأعطال ════ */
  let fq = '';
  async function faults() {
    $('#view').innerHTML = '<div class="sect-hd"><h2 class="grow">بنك الأعطال</h2><button class="btn sm primary" id="f-add">' + ic('plus', 15) + 'حل جديد</button></div><div class="search" style="position:relative"><input class="input" id="fq" placeholder="دوّر بكود العطل أو المشكلة" value="' + esc(fq) + '" style="padding-inline-start:38px"><span style="position:absolute;inset-inline-start:12px;top:13px;color:var(--ink-3)">' + ic('search', 17) + '</span></div><div id="fl" class="sect"><div class="faint small">بيحمّل…</div></div>';
    let tt; $('#fq').oninput = e => { clearTimeout(tt); tt = setTimeout(() => { fq = e.target.value; loadF(); }, 300); };
    $('#f-add').onclick = () => {
      const m = modal('<div class="modal-hd"><h3>عطل وحله</h3><button class="btn ghost icon" data-close>' + ic('x') + '</button></div><form id="nf" style="display:grid;gap:12px"><input class="input" name="code" placeholder="كود العطل (لو فيه)" dir="ltr"><input class="input" name="title" placeholder="العطل" required><textarea class="input" name="solution" placeholder="الحل" required style="min-height:120px"></textarea><div class="modal-ft"><button class="btn primary bigbtn">حفظ — الكل هيستفيد</button></div></form>');
      $('#nf', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => { await post('/s/api/fault', form($('#nf', m.el))); m.close(); toast('اتحفظ ✓ شكرًا'); loadF(); }); };
    };
    loadF();
  }
  async function loadF() {
    const d = await get('/s/api/faults?q=' + encodeURIComponent(fq)).catch(err); if (!d) return;
    $('#fl').innerHTML = d.faults.map(f => '<div class="fault"><div class="row">' + (f.code ? '<span class="chip sky" dir="ltr">' + esc(f.code) + '</span>' : '') + '<b class="grow">' + esc(f.title) + '</b></div><div class="sol">' + esc(f.solution) + '</div><div class="row xs muted"><span class="grow">' + esc(f.emp_name || '') + (f.client_name ? ' · عند ' + esc(f.client_name) : '') + '</span><button class="vote ' + (f.voted ? 'on' : '') + '" data-v="' + f.id + '">' + ic('up', 14) + f.votes + '</button></div></div>').join('') || '<div class="empty"><b>' + (fq ? 'مفيش نتايج' : 'لسه فاضي') + '</b>' + (fq ? 'جرّب كلمة تانية.' : 'أول ما حد يصلّح عطل ويكتب الحل هيظهر هنا.') + '</div>';
    $$('[data-v]').forEach(b => b.onclick = async () => { const r = await post('/s/api/fault/vote', { id: +b.dataset.v }).catch(err); if (r) loadF(); });
  }

  /* ════ شهري ════ */
  let mo = null;
  async function month() {
    $('#view').innerHTML = '<div class="faint small">بيحمّل…</div>';
    const d = await get('/s/api/month' + (mo ? '?month=' + mo : '')).catch(err); if (!d) return; mo = d.month;
    const by = new Map(); d.att.forEach(a => { if (!by.has(a.date)) by.set(a.date, a); });
    const first = new Date(d.month + '-01T12:00:00Z').getUTCDay();
    let cells = '';
    for (let i = 0; i < first; i++) cells += '<div></div>';
    for (let i = 1; i <= d.days; i++) {
      const ds = d.month + '-' + String(i).padStart(2, '0'), a = by.get(ds), rest = d.rest.includes(new Date(ds + 'T12:00:00Z').getUTCDay());
      const cls = a ? (a.late_min ? 'l' : 'p') : rest ? 'r' : ds < d.today ? 'a' : '';
      cells += '<div class="d ' + cls + (ds === d.today ? ' t' : '') + '" title="' + (a ? hm(a.in_at) + (a.out_at ? ' ← ' + hm(a.out_at) : '') : '') + '">' + i + '</div>';
    }
    const p = d.pay, cur = H.settings.currency;
    const L = (t, v, c) => '<div class="payline"><span>' + t + '</span><b class="tnum" style="color:' + (c || 'inherit') + '"><bdi dir="ltr">' + v + '</bdi></b></div>';
    const prev = () => { const [y, m] = mo.split('-').map(Number); return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7); };
    const next = () => { const [y, m] = mo.split('-').map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); };
    $('#view').innerHTML = '<div class="sect-hd"><button class="btn sm ghost icon" id="m-prev" aria-label="الشهر اللي فات">' + ic('back', 17) + '</button><h2 class="grow" style="text-align:center">' + K.monthName(d.month) + '</h2><button class="btn sm ghost icon" id="m-next" aria-label="الشهر الجاي" style="transform:scaleX(-1)">' + ic('back', 17) + '</button></div>' +
      (p ? '<div class="card pad" style="display:grid;grid-template-columns:repeat(3,1fr);text-align:center;gap:6px"><div><b style="font:800 28px var(--f-display)">' + p.present + '</b><div class="xs muted">يوم حضور</div></div><div><b style="font:800 28px var(--f-display);color:' + (p.lateMin ? 'var(--late)' : 'inherit') + '">' + K.mins(p.lateMin) + '</b><div class="xs muted">تأخير</div></div><div><b style="font:800 28px var(--f-display)">' + p.score + '</b><div class="xs muted">تقييمك من 100</div></div></div>' : '') +
      '<div class="card pad"><div class="mgrid">' + K.D3.map(x => '<div class="h">' + x + '</div>').join('') + cells + '</div><div class="row wrap xs muted" style="margin-top:10px;gap:12px"><span style="color:var(--go)">■ حضور</span><span style="color:var(--late)">■ تأخير</span><span style="color:var(--stop)">■ غياب</span></div></div>' +
      (p && p.salary ? '<div class="card pad"><h3 style="margin-bottom:6px">مرتب الشهر (لحد النهارده)</h3>' + L('الأساسي', money(p.salary, cur)) + (p.otPay ? L('إضافي', '+' + money(p.otPay), 'var(--go)') : '') + (p.bonus ? L('مكافآت', '+' + money(p.bonus), 'var(--go)') : '') + (p.lateDed ? L('خصم تأخير', '−' + money(p.lateDed), 'var(--stop)') : '') + (p.absentDed ? L('خصم غياب', '−' + money(p.absentDed), 'var(--stop)') : '') + (p.deduct ? L('خصومات', '−' + money(p.deduct), 'var(--stop)') : '') + (p.loanDed ? L('قسط سلفة', '−' + money(p.loanDed), 'var(--stop)') : '') + '<div class="payline tot"><span>الصافي</span><span class="tnum">' + money(p.net, cur) + '</span></div></div>' : '');
    $('#m-prev').onclick = () => { mo = prev(); month(); };
    $('#m-next').onclick = () => { mo = next(); month(); };
  }

  /* ════ المحادثة ════ */
  let chatT = null;
  async function chat() {
    clearInterval(chatT);
    $('#view').innerHTML = '<div class="sect-hd"><h2 class="grow">الإدارة</h2></div><div class="chatbox"><div class="msgs" id="msgs"><div class="faint small">بيحمّل…</div></div><form class="composer" id="cmp"><input class="input" name="body" placeholder="اكتب رسالة…" autocomplete="off"><button class="btn primary icon" aria-label="ابعت">' + ic('send', 18) + '</button></form></div>';
    const load = async () => {
      const d = await get('/s/api/chat').catch(() => null); if (!d || tab !== 'chat') return clearInterval(chatT);
      const ms = $('#msgs'); if (!ms) return;
      if (!d.on) { ms.innerHTML = '<div class="empty">المحادثة مقفولة من الإدارة دلوقتي.</div>'; $('#cmp').hidden = true; return; }
      const atEnd = ms.scrollHeight - ms.scrollTop - ms.clientHeight < 40;
      ms.innerHTML = d.messages.map(m => '<div class="msg ' + (m.side === 'emp' ? 'me' : 'them') + '">' + esc(m.body) + '<small>' + (m.side === 'mgr' && m.by_name ? esc(m.by_name) + ' · ' : '') + hm(m.at) + ' ' + dm(m.at) + '</small></div>').join('') || '<div class="empty small">ابعت للإدارة أي حاجة محتاجها.</div>';
      if (atEnd || !ms.dataset.ok) { ms.scrollTop = ms.scrollHeight; ms.dataset.ok = 1; }
      H.unread = 0; const u = $('#unr'); if (u) u.hidden = true;
    };
    $('#cmp').onsubmit = e => { e.preventDefault(); const i = $('#cmp input'), v = i.value.trim(); if (!v) return; i.value = ''; post('/s/api/chat', { body: v }).then(load).catch(err); };
    await load(); chatT = setInterval(load, 8000);
  }

  function changePw() {
    const m = modal('<div class="modal-hd"><h3>غيّر الباسورد</h3></div><form id="pf" style="display:grid;gap:12px"><label class="field"><span>الباسورد الحالي</span><input class="input" type="password" name="old" required></label><label class="field"><span>الجديد</span><input class="input" type="password" name="pw" minlength="4" required></label><div class="modal-ft"><button type="button" class="btn" data-close>رجوع</button><button class="btn primary">حفظ</button></div></form>');
    $('#pf', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => { await post('/s/api/password', form($('#pf', m.el))); m.close(); toast('اتغيّر ✓'); }); };
  }

  /* ── احتفال المكافأة ── */
  function celebrate(list) {
    const total = list.reduce((s, r) => s + r.amount, 0);
    const d = document.createElement('div'); d.className = 'party';
    d.innerHTML = '<canvas></canvas><div class="box"><div style="font-size:44px">🎉</div><h2>مكافأة ليك!</h2><div class="amt">' + money(total) + ' ' + esc(H.settings.currency) + '</div><p class="muted">' + list.map(r => esc(r.reason || 'شغلك متقدّر')).join(' · ') + '</p><button class="btn primary bigbtn">شكرًا 🙏</button></div>';
    document.body.appendChild(d);
    d.querySelector('button').onclick = () => { d.remove(); post('/s/api/reward/seen').catch(() => {}); H.rewards = []; };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = d.querySelector('canvas'), x = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
    const cols = ['#FF3B47', '#C8161F', '#FFC24D', '#ffffff', '#FF8A92'];
    const P = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * .5, v: 2 + Math.random() * 4, r: Math.random() * 6, w: 6 + Math.random() * 6, c: cols[(Math.random() * cols.length) | 0], s: Math.random() * .2 - .1 }));
    let f = 0; (function loop() { if (!d.isConnected || f++ > 360) return; x.clearRect(0, 0, c.width, c.height); P.forEach(p => { p.y += p.v; p.x += Math.sin((p.y + p.r * 40) / 40); p.r += p.s; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -3, p.w, 6); x.restore(); }); requestAnimationFrame(loop); })();
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
  }

  start();
})();
