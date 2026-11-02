/* طاقم · لينك العميل */
(function () {
  'use strict';
  const { esc, $, $$, get, post, n, money, hm, dm, dmy, ic, toast, err, modal, form, busy } = K;
  const code = location.pathname.split('/')[2];
  const API = '/c/api/' + encodeURIComponent(code);
  let D = null, timer = null;

  async function load() {
    try { D = await get(API); } catch (e) { $('#root').innerHTML = '<div class="pw"><div class="empty"><b>اللينك مش شغال</b>' + esc(e.message) + '</div></div>'; return; }
    document.title = D.client.name + ' — ' + D.company;
    render();
  }
  function render() {
    const cur = D.currency, m = D.money;
    const maxV = Math.max(1, ...D.months.map(x => Math.max(x.invoiced, x.paid)));
    const open = D.requests.filter(r => r.status === 'new' || r.status === 'ok');
    $('#root').innerHTML = '<div class="pw">' +
      '<div class="p-top"><span class="mark">' + '<img src="' + esc(D.logo || '/icons/icon.svg') + '" alt="">' + '</span><b style="font:800 19px var(--f-display)">' + esc(D.company) + '</b></div>' +
      '<section class="hero"><h1>' + esc(D.client.name) + '</h1><div class="bal"><span>' + (m.balance > 0 ? 'المستحق عليكم' : m.balance < 0 ? 'رصيد ليكم' : 'الحساب') + '</span><b>' + (m.balance ? money(Math.abs(m.balance)) : 'خالص ✓') + (m.balance ? ' <span style="font-size:20px;opacity:.75">' + esc(cur) + '</span>' : '') + '</b></div><div class="mini"><span>فواتير <b>' + money(m.invoiced) + '</b></span><span>اتدفع <b>' + money(m.paid) + '</b></span></div></section>' +
      '<div class="two"><button class="big" id="b-order"><span class="i" style="background:var(--sky-soft);color:var(--sky)">' + ic('box', 24) + '</span><b>اطلب ورق</b><small>اختار الأصناف والكميات</small></button><button class="big" id="b-maint"><span class="i" style="background:var(--late-soft);color:var(--late)">' + ic('tool', 24) + '</span><b>اطلب صيانة</b><small>فني يجيلك</small></button></div>' +
      (D.requests.length ? '<section style="display:grid;gap:10px"><h3>طلباتك</h3>' + D.requests.slice(0, 12).map(rq).join('') + '</section>' : '') +
      '<section class="card pad"><div class="row"><h3 class="grow">آخر 12 شهر</h3><span class="xs muted"><span style="color:var(--brand-2)">■</span> فواتير · <span style="color:var(--hivis)">■</span> دفع</span></div><div class="bars" style="margin-top:10px">' + D.months.map(x => '<div class="b" title="' + K.monthName(x.month) + '"><div class="st"><i style="background:linear-gradient(180deg,#FF5A65,#C8161F);height:' + (x.invoiced / maxV * 100) + '%"></i><i style="background:var(--hivis);height:' + (x.paid / maxV * 100) + '%"></i></div><small>' + K.MON[+x.month.slice(5) - 1].slice(0, 3) + '</small></div>').join('') + '</div></section>' +
      (D.ledger.length ? '<section class="card pad"><h3 style="margin-bottom:4px">كشف الحساب</h3>' + D.ledger.map(l => '<div class="led"><span class="tnum muted" style="min-width:76px">' + dmy(l.date) + '</span><span class="grow">' + (l.kind === 'invoice' ? 'فاتورة' : 'دفعة') + (l.note || l.ref ? ' <span class="muted small">' + esc([l.ref, l.note].filter(Boolean).join(' — ')) + '</span>' : '') + '</span><b class="tnum" style="color:' + (l.kind === 'payment' ? 'var(--go)' : 'inherit') + '">' + '<bdi dir="ltr">' + (l.kind === 'payment' ? '−' : '') + money(l.amount) + '</bdi>' + '</b></div>').join('') + '</section>' : '') +
      '<p class="xs faint" style="text-align:center">الصفحة دي خاصة بـ ' + esc(D.client.name) + ' — متبعتهاش لحد تاني.</p></div>';
    $('#b-order').onclick = order;
    $('#b-maint').onclick = maint;
    $$('[data-rate]').forEach(b => b.onclick = () => rate(+b.dataset.rate, +b.dataset.v));
    clearTimeout(timer); if (open.length) timer = setTimeout(load, 30000);
  }
  function rq(r) {
    const steps = r.status === 'no' ? ['no', 'no', 'no'] : r.status === 'sent' ? ['go', 'go', 'go'] : r.status === 'ok' ? ['on', 'on', ''] : ['on', '', ''];
    return '<div class="rq"><div class="row"><span style="width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:' + (r.kind === 'maint' ? 'var(--late-soft);color:var(--late)' : 'var(--sky-soft);color:var(--sky)') + '">' + ic(r.kind === 'maint' ? 'tool' : 'box', 18) + '</span><div class="grow"><b>' + (r.kind === 'maint' ? 'صيانة: ' + esc(r.device || '') : esc(r.items.map(i => i.name + ' × ' + n(i.qty)).join('، '))) + '</b><div class="xs muted">' + K.dayName(r.created_at.slice(0, 10)) + ' ' + dm(r.created_at) + ' · ' + hm(r.created_at) + '</div></div></div>' +
      '<div class="steps">' + steps.map(s => '<i class="' + s + '"></i>').join('') + '</div><div class="small" style="font-weight:600">' + esc(r.status_text) + '</div>' +
      (r.progress != null ? '<div class="small muted">' + ic('route', 13) + ' قرّب يوصل — ' + Math.round(r.progress * 100) + '% من الطريق</div>' : '') +
      (r.reply ? '<div class="small muted">' + esc(r.reply) + '</div>' : '') +
      (r.status === 'sent' ? (r.rating ? '<div class="small"><span style="color:var(--hivis)">' + '★'.repeat(r.rating) + '</span><span class="faint">' + '★'.repeat(5 - r.rating) + '</span> شكرًا على تقييمك</div>' : '<div class="row"><span class="small muted">قيّم الخدمة:</span><span class="rate">' + [1, 2, 3, 4, 5].map(v => '<button data-rate="' + r.id + '" data-v="' + v + '" aria-label="' + v + ' من 5">★</button>').join('') + '</span></div>') : '') + '</div>';
  }
  function order() {
    const m = modal('<div class="modal-hd"><h3>اطلب ورق</h3><button class="btn ghost icon" data-close aria-label="قفل">' + ic('x') + '</button></div><form id="of"><div>' + D.items.map((it, i) => '<div class="qty"><b>' + esc(it) + '</b><div class="step"><button type="button" data-d="-1" data-i="' + i + '">−</button><input inputmode="numeric" data-q="' + i + '" value="0" aria-label="الكمية"><button type="button" data-d="1" data-i="' + i + '">+</button></div></div>').join('') + '</div>' +
      '<div style="display:grid;gap:10px;margin-top:12px"><input class="input" name="note" placeholder="ملحوظة (اختياري)"><input class="input" name="contact" placeholder="اسم ورقم اللي هيستلم (اختياري)"></div><div class="modal-ft"><button class="btn primary" style="width:100%;min-height:52px;font-size:17px">' + ic('send', 18) + 'ابعت الطلب</button></div></form>');
    $$('[data-d]', m.el).forEach(b => b.onclick = () => { const i = $('[data-q="' + b.dataset.i + '"]', m.el); i.value = Math.max(0, (parseInt(i.value, 10) || 0) + (+b.dataset.d)); });
    $('#of', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => {
      const items = D.items.map((it, i) => ({ name: it, qty: parseInt($('[data-q="' + i + '"]', m.el).value, 10) || 0 })).filter(x => x.qty > 0);
      if (!items.length) throw new Error('اختار كمية صنف واحد على الأقل');
      await post(API + '/request', Object.assign(form($('#of', m.el)), { kind: 'order', items })); m.close(); toast('الطلب وصل ✓ هتشوف حالته هنا', 'hivis'); load();
    }); };
  }
  function maint() {
    const m = modal('<div class="modal-hd"><h3>اطلب صيانة</h3><button class="btn ghost icon" data-close aria-label="قفل">' + ic('x') + '</button></div><form id="mf" style="display:grid;gap:12px"><div class="field"><span>الجهاز</span><div class="row wrap" id="dv">' + D.devices.map(d => '<button type="button" class="chip" style="height:38px;border:0;cursor:pointer;font-size:14px" data-v="' + esc(d) + '">' + esc(d) + '</button>').join('') + '</div></div>' +
      '<label class="field"><span>المشكلة</span><textarea class="input" name="note" placeholder="مثلاً: الطابعة بتطلع خطوط في الفيلم"></textarea></label><div class="row"><button type="button" class="btn" id="mph">' + ic('camera', 16) + 'صورة (اختياري)</button><img id="mimg" class="thumb" hidden alt="" style="width:64px;height:64px;border-radius:12px;object-fit:cover"></div>' +
      '<input class="input" name="contact" placeholder="اسم ورقم اللي نكلّمه"><div class="modal-ft"><button class="btn primary" style="width:100%;min-height:52px;font-size:17px">' + ic('send', 18) + 'ابعت الطلب</button></div></form>');
    let device = '', photo = null;
    $$('#dv [data-v]', m.el).forEach(b => b.onclick = () => { device = b.dataset.v; $$('#dv [data-v]', m.el).forEach(x => x.classList.toggle('hivis', x === b)); });
    $('#mph', m.el).onclick = async () => { const p = await K.pickImage(900, .45); if (p) { photo = p; const i = $('#mimg', m.el); i.src = p; i.hidden = false; } };
    $('#mf', m.el).onsubmit = ev => { ev.preventDefault(); busy(ev.submitter, async () => { await post(API + '/request', Object.assign(form($('#mf', m.el)), { kind: 'maint', device, photo })); m.close(); toast('طلب الصيانة وصل ✓', 'hivis'); load(); }); };
  }
  async function rate(id, v) { await post(API + '/rate', { id, rating: v }).catch(err); toast('شكرًا ✓'); load(); }

  load();
})();
