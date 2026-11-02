/* طاقم · أدوات الواجهة المشتركة (لوحة المدير + تطبيق الموظف + لينك العميل) */
(function (W) {
  'use strict';
  const K = {};
  K.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  K.$ = (s, r) => (r || document).querySelector(s);
  K.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  K.api = async function (method, url, body) {
    const r = await fetch(url, { method, credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) { const e = new Error(j.message || 'محصلش — جرّب تاني'); e.status = r.status; throw e; }
    return j;
  };
  K.get = u => K.api('GET', u);
  K.post = (u, b) => K.api('POST', u, b || {});

  /* ── numbers + dates (أرقام إنجليزي واضحة، شهور عربي) ── */
  K.n = (v, d = 0) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  K.money = (v, cur) => K.n(v, 2) + (cur ? ' ' + cur : '');
  K.MON = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  K.DAYS = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
  K.D3 = ['حد', 'تنين', 'تلات', 'أربع', 'خميس', 'جمعة', 'سبت'];
  K.hm = ts => { const m = /(\d{2}):(\d{2})/.exec(String(ts || '').slice(11) || String(ts || '')); if (!m) return ''; const h = +m[1]; return ((h % 12) || 12) + ':' + m[2] + (h < 12 ? ' ص' : ' م'); };
  K.hm24 = ts => String(ts || '').slice(11, 16);
  K.dm = ds => { const p = String(ds || '').slice(0, 10).split('-'); return p.length < 3 ? '' : (+p[2]) + ' ' + K.MON[+p[1] - 1]; };
  K.dmy = ds => { const p = String(ds || '').slice(0, 10).split('-'); return p.length < 3 ? '' : (+p[2]) + '/' + (+p[1]) + '/' + p[0]; };
  K.monthName = m => { const p = String(m).split('-'); return K.MON[+p[1] - 1] + ' ' + p[0]; };
  K.dayName = ds => K.DAYS[new Date(ds + 'T12:00:00Z').getUTCDay()];
  K.mins = m => { m = Math.round(m || 0); if (m < 60) return m + ' د'; const h = Math.floor(m / 60), r = m % 60; return h + ' س' + (r ? ' ' + r + ' د' : ''); };
  K.dist = m => m == null ? '—' : m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + ' كم' : Math.round(m) + ' م';
  K.ago = (ts, now) => {
    if (!ts) return '';
    const a = Date.parse(String(ts).replace(' ', 'T') + 'Z'), b = now ? Date.parse(String(now).replace(' ', 'T') + 'Z') : null;
    const m = Math.round(((b || a) - a) / 60000);
    if (b == null) return K.hm(ts);
    if (m < 1) return 'دلوقتي'; if (m < 60) return 'من ' + m + ' د'; const h = Math.round(m / 60); if (h < 24) return 'من ' + h + ' س';
    const d = Math.round(h / 24); return d === 1 ? 'امبارح' : 'من ' + d + ' يوم';
  };
  K.initials = name => String(name || '؟').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('');
  K.av = (emp, cls) => '<span class="av ' + (cls || '') + '" style="--h:' + (emp && emp.hue != null ? emp.hue : 0) + '">' + (emp && emp.photo ? '<img src="' + K.esc(emp.photo) + '" alt="">' : K.esc(K.initials(emp && emp.name))) + '</span>';
  K.phone = p => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '2' + d; else if (d.startsWith('1') && d.length === 10) d = '20' + d; return d; };
  K.wa = (p, text) => 'https://wa.me/' + K.phone(p) + (text ? '?text=' + encodeURIComponent(text) : '');

  /* ── toast ── */
  K.toast = function (msg, kind) {
    let box = K.$('.toasts'); if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg; box.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, kind === 'err' ? 4200 : 2600);
  };
  K.err = e => K.toast(e && e.message ? e.message : String(e), 'err');

  /* ── modal ── */
  K.modal = function (html, opts) {
    opts = opts || {};
    const s = document.createElement('div'); s.className = 'scrim';
    s.innerHTML = '<div class="modal ' + (opts.wide ? 'wide' : '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    const close = () => { s.remove(); document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    s.addEventListener('click', e => { if (e.target === s || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(s);
    const f = s.querySelector('[autofocus]') || s.querySelector('input:not([type=hidden]),select,textarea'); if (f && !opts.noFocus) setTimeout(() => f.focus(), 60);
    return { el: s.firstElementChild, close };
  };
  K.confirm = function (title, text, okLabel, danger) {
    return new Promise(res => {
      const m = K.modal('<div class="modal-hd"><h3>' + K.esc(title) + '</h3></div>' + (text ? '<p class="muted">' + K.esc(text) + '</p>' : '') +
        '<div class="modal-ft"><button class="btn" data-close>رجوع</button><button class="btn ' + (danger ? 'danger fill' : 'primary') + '" data-ok>' + K.esc(okLabel || 'تمام') + '</button></div>', { onClose: () => res(false), noFocus: true });
      m.el.querySelector('[data-ok]').onclick = () => { res(true); m.close(); };
    });
  };
  K.form = el => { const o = {}; K.$$('[name]', el).forEach(i => { o[i.name] = i.type === 'checkbox' ? i.checked : i.value; }); return o; };
  K.busy = async function (btn, fn) { if (btn) btn.disabled = true; try { return await fn(); } catch (e) { K.err(e); } finally { if (btn) btn.disabled = false; } };

  /* ── image → small JPEG (أقل جودة توفيرًا للمساحة) ── */
  K.shrink = function (file, max, q) {
    return new Promise((ok, no) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, (max || 640) / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', q || 0.5));
      };
      img.onerror = () => no(new Error('الصورة مش مقروءة'));
      img.src = url;
    });
  };
  K.pickImage = (max, q) => new Promise(ok => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
    i.onchange = async () => { if (!i.files[0]) return ok(null); try { ok(await K.shrink(i.files[0], max, q)); } catch (e) { K.err(e); ok(null); } };
    i.click();
  });

  /* ── geolocation ── */
  K.locate = (timeout) => new Promise(ok => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), () => ok(null), { enableHighAccuracy: true, timeout: timeout || 15000, maximumAge: 10000 });
  });
  K.battery = async () => { try { const b = await navigator.getBattery(); return Math.round(b.level * 100); } catch (_) { return null; } };

  /* ── theme: غامق افتراضيًا زي Ozarex ── */
  K.theme = {
    get: () => { try { return localStorage.getItem('tq-theme') || 'dark'; } catch (_) { return 'dark'; } },
    set(v) { try { localStorage.setItem('tq-theme', v); } catch (_) {} K.theme.apply(); },
    apply() { document.documentElement.setAttribute('data-theme', K.theme.get() === 'light' ? 'light' : 'dark'); const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = K.theme.dark() ? '#070304' : '#FFF6F6'; },
    dark: () => K.theme.get() !== 'light'
  };
  K.theme.apply();

  /* ── ripple on press ── */
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('.btn,.nav-item,.bn-item,.rp'); if (!b || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height), sp = document.createElement('span');
    sp.className = 'ripple'; sp.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (e.clientX - r.left - d / 2) + 'px;top:' + (e.clientY - r.top - d / 2) + 'px';
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
    b.style.overflow = 'hidden'; b.appendChild(sp); setTimeout(() => sp.remove(), 600);
  }, { passive: true });


  /* ── الشريط السفلي الزجاجي (نفس Ozarex): عدسة تحت التاب المفتوح، تلمس وتسحب = العدسة تكبر وتمشي مع صباعك وتكبّر اللي تحتها ── */
  K.glass = function (bar) {
    if (!bar || bar.__glass) { if (bar) bar.__sync(); return; }
    const RM = matchMedia('(prefers-reduced-motion: reduce)');
    const items = () => Array.from(bar.querySelectorAll(':scope > .bn-item'));
    const c = document.createElement('span'); c.className = 'bn-glass'; c.setAttribute('aria-hidden', 'true'); c.innerHTML = '<span class="bn-lens-in"></span>';
    bar.insertBefore(c, bar.firstChild);
    let first = true, drag = null, block = 0;
    const place = (x, w) => { c.__x = x; c.__w = w; c.style.width = w + 'px'; c.style.setProperty('--x', x + 'px'); };
    const sync = () => {
      if (drag) return;
      if (c.parentNode !== bar) bar.insertBefore(c, bar.firstChild);
      const a = items().find(b => b.classList.contains('on'));
      if (!a || !a.offsetWidth) { c.classList.remove('on'); return; }
      if (first) c.classList.add('no-anim');
      place(a.offsetLeft, a.offsetWidth); c.classList.add('on');
      if (first) { first = false; void c.offsetWidth; c.classList.remove('no-anim'); }
    };
    bar.__sync = () => requestAnimationFrame(sync);
    const nearest = cx => { let best = null, d = 1e9; items().forEach(b => { const m = b.offsetLeft + b.offsetWidth / 2, k = Math.abs(m - cx); if (k < d) { d = k; best = b; } }); return best; };
    const fill = () => {
      const inn = c.querySelector('.bn-lens-in'); inn.textContent = '';
      items().forEach(b => { const g = document.createElement('span'); g.className = 'bn-ghost'; b.childNodes.forEach(n => { if (n.nodeType === 1 && n.tagName.toLowerCase() === 'svg') g.appendChild(n.cloneNode(true)); else if (n.nodeType === 3 && n.textContent.trim()) { const t = document.createElement('span'); t.className = 'bn-gl'; t.setAttribute('data-t', n.textContent.trim()); g.appendChild(t); } }); inn.appendChild(g); });
      const cs = getComputedStyle(bar); inn.style.width = bar.clientWidth + 'px'; inn.style.height = bar.clientHeight + 'px'; inn.style.padding = cs.padding;
    };
    const moveTo = cx => {
      const w = c.__w || 70, x = Math.max(0, Math.min(bar.clientWidth - w, cx - w / 2));
      place(x, w);
      c.querySelector('.bn-lens-in').style.transform = 'translate3d(' + (-x - c.clientLeft) + 'px,' + (-c.offsetTop - c.clientTop) + 'px,0)';
      const hot = nearest(x + w / 2), list = items(), i = list.indexOf(hot);
      list.forEach((b, k) => b.classList.toggle('hot', k === i));
      Array.from(c.querySelector('.bn-lens-in').children).forEach((b, k) => b.classList.toggle('hot', k === i));
      return hot;
    };
    bar.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const f = e.target.closest('.bn-item'); if (!f) return;
      const r = bar.getBoundingClientRect();
      drag = { id: e.pointerId, x0: e.clientX, hot: f };
      try { bar.setPointerCapture(e.pointerId); } catch (_) {}
      if (!c.__w) place(f.offsetLeft, f.offsetWidth);
      place(c.__x, f.offsetWidth); fill();
      c.classList.add('on', 'drag'); bar.classList.add('dragging');
      drag.hot = moveTo(e.clientX - r.left - bar.clientLeft);
    });
    bar.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const r = bar.getBoundingClientRect(); c.classList.add('follow');
      drag.hot = moveTo(e.clientX - r.left - bar.clientLeft); e.preventDefault();
    });
    const up = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      try { bar.releasePointerCapture(e.pointerId); } catch (_) {}
      c.classList.remove('follow', 'drag'); bar.classList.remove('dragging');
      items().forEach(b => b.classList.remove('hot'));
      block = Date.now() + 450;
      setTimeout(() => { if (!drag) c.querySelector('.bn-lens-in').innerHTML = ''; }, 350);
      const t = e.type === 'pointercancel' ? null : d.hot;
      if (t) { place(t.offsetLeft, t.offsetWidth); setTimeout(() => { t.__ours = true; t.click(); t.__ours = false; bar.__sync(); }, RM.matches ? 0 : 140); }
      else bar.__sync();
    };
    bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    bar.addEventListener('click', e => { const b = e.target.closest('.bn-item'); if (b && b.__ours) return; if (Date.now() < block) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    addEventListener('resize', bar.__sync);
    bar.__glass = true; bar.__sync();
  };

  /* ── منع الزوم (قرصة ودبل تاب) ── */
  ['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', e => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  let lastTouch = 0;
  document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastTouch < 320 && !e.target.closest('input,textarea,select,.leaflet-container')) e.preventDefault(); lastTouch = n; }, { passive: false });
  document.addEventListener('wheel', e => { if (e.ctrlKey && !e.target.closest('.leaflet-container')) e.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault(); });

  /* ── count-up numbers ── */
  K.countUp = function (root) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    (root || document).querySelectorAll('[data-count]').forEach(el => {
      const to = Number(el.dataset.count) || 0, dec = to % 1 ? 2 : 0, t0 = performance.now(), dur = 700;
      const step = t => { const k = Math.min(1, (t - t0) / dur), v = to * (1 - Math.pow(1 - k, 3)); el.textContent = Number(v).toLocaleString('en-US', { maximumFractionDigits: dec }); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  };

  /* ── map tiles (فاتحة) ── */
  K.tiles = function (map) {
    /* صور الخريطة من سيرفرنا (OpenStreetMap) — من غير أي مفتاح */
    return L.tileLayer('/tiles/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  };
  /* علامة الموظف على الخريطة: صورته (أو أول حروف اسمه) في دايرة + اسمه تحتها + سهم صغير بيشاور على مكانه بالظبط */
  K.empPin = (emp, live, sub) => L.divIcon({ className: 'epin-wrap', iconSize: [120, 78], iconAnchor: [60, 78], tooltipAnchor: [0, -70],
    html: '<div class="epin ' + (live ? 'live' : '') + '" style="--h:' + (emp.hue == null ? 0 : emp.hue) + '"><span class="epin-av">' + (emp.photo ? '<img src="' + K.esc(emp.photo) + '" alt="" onerror="this.remove()">' : '') + '<b>' + K.esc(K.initials(emp.name)) + '</b></span><span class="epin-nm">' + K.esc(String(emp.name || '').split(' ')[0]) + (sub ? ' · ' + K.esc(sub) : '') + '</span><i class="epin-tip"></i></div>' });
  K.clientPin = () => L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7], html: '<div class="cpin"></div>' });

  /* ── push ── */
  K.push = async function (base) {
    if (!('serviceWorker' in navigator) || !('PushManager' in W)) throw new Error('الجهاز ده مش بيدعم الإشعارات — على الآيفون لازم تضيف البرنامج للشاشة الرئيسية الأول');
    const perm = await Notification.requestPermission(); if (perm !== 'granted') throw new Error('لازم تسمح بالإشعارات من إعدادات المتصفح');
    const reg = await navigator.serviceWorker.ready;
    const { key } = await K.get(base + '/push/key');
    const raw = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((key.length + 3) % 4)), c => c.charCodeAt(0));
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
    await K.post(base + '/push/subscribe', { sub: sub.toJSON() });
    return true;
  };

  /* إشعارات تلقائية: لو الإذن متاخد قبل كده → نجدد الاشتراك بهدوء؛ ونصفّر رقم الأيقونة لما البرنامج يتفتح */
  K.pushState = () => !('Notification' in W) || !('serviceWorker' in navigator) || !('PushManager' in W) ? 'unsupported' : Notification.permission;
  K.pushAuto = async function (base) { if (K.pushState() === 'granted') { try { await K.push(base); return true; } catch (_) {} } return false; };
  K.seen = function (base) { try { if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {}); } catch (_) {} K.post(base + '/push/seen').catch(() => {}); try { navigator.serviceWorker && navigator.serviceWorker.getRegistration().then(r => r && r.getNotifications().then(ns => ns.forEach(n => n.close()))); } catch (_) {} };
  K.isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) && !W.navigator.standalone;
  K.pushPrompt = function (base, text) {
    const st = K.pushState(); if (st === 'granted' || st === 'denied' && !text) return;
    if (document.getElementById('push-ask')) return;
    try { if (sessionStorage.getItem('tq-push-later')) return; } catch (_) {}
    const d = document.createElement('div'); d.id = 'push-ask'; d.className = 'push-ask';
    d.innerHTML = '<span class="pa-ic ring-bell">' + K.ic('bell', 22) + '</span><div class="grow"><b>شغّل الإشعارات</b><small>' + (st === 'unsupported' ? (K.isIOS() ? 'على الآيفون: دوس «مشاركة» ← «إضافة إلى الشاشة الرئيسية» وافتح البرنامج من الأيقونة، وبعدين شغّلها.' : 'المتصفح ده مش بيدعم الإشعارات — جرّب كروم.') : st === 'denied' ? 'الإشعارات مقفولة من إعدادات المتصفح — افتحها للموقع ده.' : K.esc(text)) + '</small></div>' +
      (st === 'default' ? '<button class="btn primary sm" data-pa="on">شغّل</button>' : '') + '<button class="btn ghost sm icon" data-pa="x" aria-label="بعدين">' + K.ic('x', 16) + '</button>';
    document.body.appendChild(d);
    d.querySelector('[data-pa=x]').onclick = () => { d.remove(); try { sessionStorage.setItem('tq-push-later', '1'); } catch (_) {} };
    const on = d.querySelector('[data-pa=on]'); if (on) on.onclick = () => K.busy(on, async () => { await K.push(base); d.remove(); K.toast('الإشعارات اشتغلت ✓ هيوصلك كل جديد حتى والبرنامج مقفول'); });
  };

  /* ── icons (خط رفيع 1.8) ── */
  const P = {
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h3v3h-3z"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 13h6M9 17h4"/>',
    send2: '',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M17.9 17.9A10 10 0 0 1 12 19c-6.5 0-10-7-10-7a18 18 0 0 1 5.1-5.9M9.9 5.2A9 9 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', check: '<path d="m5 12 5 5L20 7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>', link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>', ext: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    wa: '<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3L3 21z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.5-1.5-2-1-1 1c-1 0-2.5-1.5-2.5-2.5l1-1-1-2Z"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
    store: '<path d="M4 10v10h16V10"/><path d="M3 4h18l-1.5 6a3 3 0 0 1-5.5.5A3 3 0 0 1 9 10.5 3 3 0 0 1 3.5 10Z"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6H3v-6Z"/>', cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4Z"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1 1 21 12z"/>', map: '<path d="m9 4-6 2.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5Z"/><path d="M9 4v13.5M15 6.5V20"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    task: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>', today: '<path d="M3 12h3l3-8 4 16 3-8h5"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>', out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/>', star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1Z"/>',
    up: '<path d="M7 10v11M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7a2 2 0 0 1-2 1.7H7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L15 2a2.3 2.3 0 0 1 2 2.6Z"/>',
    camera: '<path d="M3 8a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><circle cx="12" cy="13" r="4"/>',
    back: '<path d="M9 18l6-6-6-6"/>', print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>', refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>', home: '<path d="M3 11 12 3l9 8v10H3Z"/><path d="M9 21v-7h6v7"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="M3 8l9 5 9-5M12 13v8"/>', more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    gift: '<rect x="3" y="8" width="18" height="4"/><path d="M12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 1 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 1 1 0 5"/>',
    play: '<path d="M6 4l14 8-14 8Z"/>', key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14 9l2 2"/>'
  };
  K.ic = (n, s) => '<svg width="' + (s || 18) + '" height="' + (s || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[n] || '') + '</svg>';

  W.K = K;
})(window);
