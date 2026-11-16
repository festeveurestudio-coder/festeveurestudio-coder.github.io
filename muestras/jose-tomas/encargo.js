/* Motor de solicitudes de encargo. Mismo archivo en José Tomás y Can Pau.
   Todo lo propio de cada comercio (catálogo, textos, horarios) vive en <script id="site-config">.
   mode "demo": nada sale del navegador; las solicitudes sólo se guardan en localStorage.
   mode "live" + endpoint https://: POST al endpoint; queda "pendiente" hasta que el comercio confirme. */
(() => {
  'use strict';

  const cfg = JSON.parse(document.getElementById('site-config').textContent);
  const t = cfg.t;
  const LIVE = cfg.mode === 'live' && typeof cfg.endpoint === 'string' && cfg.endpoint.startsWith('https://');
  const KEY = { draft: `${cfg.id}:draft`, requests: `${cfg.id}:requests` };
  const LOCALE = cfg.lang === 'ca' ? 'ca-ES' : 'es-ES';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

  const store = {
    get(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* navegación privada: seguimos en memoria */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* idem */ } }
  };

  /* Fechas en hora local: toISOString() usa UTC y desplaza el día cerca de medianoche. */
  const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };
  const fmtDate = (iso) => new Date(`${iso}T12:00`).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

  const statusLabel = (r) => (r.demo ? `${t.simulated} · ` : '') + (t.status[r.status] || r.status);
  const fmtQty = (qty, unit) => {
    if (unit !== 'g') return `${qty} ${qty === 1 ? (t.singular[unit] || unit) : unit}`;
    return qty >= 1000 ? `${String(qty / 1000).replace('.', ',')} kg` : `${qty} g`;
  };
  const delivery = () => cfg.delivery && cfg.delivery.enabled;
  const isHome = (pickup) => pickup.mode === 'home';
  const fmtPickup = (pickup) => {
    const when = `${fmtDate(pickup.date)} · ${pickup.slot}`;
    return isHome(pickup) ? `${t.modeHome} · ${when}` : when;
  };
  const itemLine = (it) => {
    const bits = [...it.choices];
    if (it.text) bits.push(it.text);
    const qty = it.qtyLabel ? fmtQty(it.qty, it.qtyLabel) : '';
    return `${it.famName}${bits.length ? ` — ${bits.join(', ')}` : ''}${qty ? ` (${qty})` : ''}`;
  };

  function summaryText(r) {
    const line = '-'.repeat(36);
    return [
      `${t.summaryTitle} — ${cfg.shop}`,
      `Ref. ${r.ref}${r.demo ? ` · ${t.summaryDemo}` : ''}`,
      line,
      r.items.map((it, i) => `${i + 1}. ${itemLine(it)}`).join('\n'),
      line,
      `${t.summaryPickup}: ${fmtPickup(r.pickup)}`,
      isHome(r.pickup) ? `${t.fAddress}: ${r.pickup.address}, ${r.pickup.postal}` : null,
      `${t.fName}: ${r.contact.name}`,
      `${t.fPhone}: ${r.contact.phone}`,
      r.notes ? `${t.summaryNotes}: ${r.notes}` : null,
      line,
      isHome(r.pickup) ? t.summaryHome : t.summaryFoot
    ].filter(Boolean).join('\n');
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
  }

  /* ---------- Diálogos: salida más rápida que entrada, y sólo entonces se cierra de verdad ---------- */
  function closeDialog(dlg) {
    if (!dlg.open || dlg.classList.contains('is-closing')) return;
    dlg.classList.add('is-closing');
    dlg.style.transform = '';
    setTimeout(() => { dlg.classList.remove('is-closing'); dlg.close(); }, reduced() ? 0 : 200);
  }
  function wireDialog(dlg) {
    /* Esc es una acción de teclado: cierre nativo, sin animar */
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) closeDialog(dlg);
    });
    /* Arrastrar el asa para cerrar: basta un gesto rápido, no hace falta llegar a un umbral. */
    const grip = $('.grip', dlg);
    if (!grip) return;
    let startY = 0; let startT = 0; let dy = 0; let dragging = false;
    grip.addEventListener('pointerdown', (e) => {
      if (dragging) return;
      dragging = true; dy = 0; startY = e.clientY; startT = performance.now();
      grip.setPointerCapture(e.pointerId);
      dlg.style.transition = 'none';
    });
    grip.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const raw = e.clientY - startY;
      dy = raw > 0 ? raw : raw / 6; /* hacia arriba, fricción en vez de tope */
      dlg.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      dlg.style.transition = '';
      const v = Math.abs(dy) / (performance.now() - startT);
      if (dy > 110 || (dy > 12 && v > 0.45)) closeDialog(dlg);
      else dlg.style.transform = '';
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  /* =====================================================================
     Página del cliente
     ===================================================================== */
  function initShop() {
    let draft = store.get(KEY.draft, { items: [] });
    if (!Array.isArray(draft.items)) draft = { items: [] };
    draft.items = draft.items.filter((it) => Array.isArray(it.choices));
    const saveDraft = () => store.set(KEY.draft, draft);
    const allFams = [...cfg.families, cfg.other];
    const famById = (id) => allFams.find((f) => f.id === id);
    const availabilityNote = (id) => famById(id)?.unavailable;
    const hasUnavailableItems = () => draft.items.some((item) => availabilityNote(item.famId));

    $$('[data-mode-label]').forEach((el) => { el.textContent = LIVE ? t.modeLive : t.modeDemo; });
    document.documentElement.dataset.mode = LIVE ? 'live' : 'demo';

    /* ---------- Catálogo ---------- */
    const media = (f) => (f.photo
      ? `<img src="${esc(f.photo)}" alt="${esc(f.photoAlt || '')}" loading="lazy" decoding="async">`
      : `<span class="card-word" aria-hidden="true">${esc(f.word || f.name)}</span>`);

    $('#familias').innerHTML = cfg.families.map((f, i) => `
      <li class="card" data-fam="${esc(f.id)}">
        <button type="button" class="card-btn" data-open="${esc(f.id)}" aria-haspopup="dialog">
          <span class="card-media${f.photo ? ' has-photo' : ''}${f.unavailable ? ' is-coming-soon' : ''}">
            ${media(f)}
            ${f.unavailable ? '<span class="card-status"><b>Próximamente</b></span>' : ''}
          </span>
          <span class="card-no" aria-hidden="true">${pad(i + 1)}</span>
          <span class="card-name">${esc(f.name)}</span>
          <span class="card-blurb">${esc(f.blurb)}</span>
          ${f.prices && f.prices.from ? `<span class="card-known card-price">${esc(f.prices.from)}</span>` : ''}
          ${f.known && f.known.length ? `<span class="card-known">${f.known.slice(0, 4).map(esc).join(' · ')}${f.known.length > 4 ? ' …' : ''}</span>` : ''}
          <span class="card-cta">${esc(f.unavailable ? 'Ver disponibilidad' : t.cardCta)} <span aria-hidden="true">→</span></span>
        </button>
      </li>`).join('');

    const photoSections = cfg.photoGallery || [];
    const photoById = new Map(photoSections.flatMap((section) => section.photos.map((photo) => [photo.id, photo])));
    const gallery = $('#photo-gallery');
    if (gallery) {
      gallery.innerHTML = photoSections.map((section, i) => `
        <details class="photo-section"${i === 0 ? ' open' : ''}>
          <summary>${esc(section.title)} <span>${section.photos.length} ${section.photos.length === 1 ? 'foto' : 'fotos'}</span></summary>
          <ul class="strip" tabindex="0" aria-label="${esc(section.title)}">
            ${section.photos.map((photo) => `
              <li><a href="${esc(photo.src)}" target="_blank" rel="noopener">
                <img src="${esc(photo.src)}" alt="" loading="lazy" decoding="async">
                <span>${esc(photo.caption)}</span>
              </a></li>`).join('')}
          </ul>
        </details>`).join('');
    }

    /* Ideas: atajos que rellenan la lista; siempre editable después */
    const ideas = $('#ideas');
    if (ideas && cfg.ideas) {
      const availableIdeas = cfg.ideas.filter((idea) => idea.lines.every((line) => !availabilityNote(line.fam)));
      ideas.innerHTML = availableIdeas.map((o) => `
        <li><button type="button" class="idea" data-idea="${esc(o.id)}">
          <span class="idea-name">${esc(o.label)}</span>
          <span class="idea-note">${esc(o.note)}</span>
        </button></li>`).join('');
      ideas.addEventListener('click', (e) => {
        const b = e.target.closest('[data-idea]');
        if (!b) return;
        const idea = availableIdeas.find((o) => o.id === b.dataset.idea);
        if (!idea) return;
        idea.lines.forEach((l) => addItem(famById(l.fam), l.choices || [], l.text || '', l.qty || 1, l.unit));
        openPanel();
      });
    }

    /* ---------- Hoja de familia ---------- */
    const sheet = $('#sheet');
    const sheetForm = $('#sheet-form');
    let current = null;
    let qty = 1;
    let unit = null;

    /* Una familia por peso ofrece gramos además de su unidad propia */
    const unitsOf = (f) => (f.qtyLabel ? [
      ...(f.weight ? [{ label: 'g', step: 50, min: 50, max: 20000, start: 250 }] : []),
      ...(f.piece ? [{ label: f.piece, step: 1, min: 1, max: 20, start: 1 }] : []),
      { label: f.qtyLabel, step: 1, min: 1, max: 99, start: 1 }
    ] : []);
    const euros = (n) => n.toLocaleString(LOCALE, { style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
    const unitFor = (f, label) => unitsOf(f).find((u) => u.label === label);

    function setQty(n) {
      qty = Math.min(unit.max, Math.max(unit.min, n));
      $('#sheet-qty').textContent = unit.label === 'g' ? fmtQty(qty, 'g') : qty;
    }
    function setUnit(u) {
      unit = u;
      $$('[data-unit]', sheet).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.unit === u.label)));
      setQty(u.start);
    }

    function openFam(id) {
      current = famById(id);
      const f = current;
      const groups = [];
      if (f.known && f.known.length) groups.push({ label: f.knownLabel || t.knownLabel, name: 'known', multi: true, choices: f.known });
      const photoFields = cfg.photoChoiceFields?.[id] || [];
      (f.options || []).forEach((o, i) => groups.push({ label: o.label, name: `opt${i}`, multi: !!o.multi, choices: o.choices }));
      $('#sheet-body').innerHTML = `
        <div class="sheet-head" data-fam="${esc(f.id)}">
          ${f.photo ? `<div data-family-photo><img class="sheet-photo" src="${esc(f.photo)}" alt="${esc(f.photoAlt || '')}" decoding="async"></div>` : ''}
          <h2 id="sheet-title" tabindex="-1">${esc(f.name)}</h2>
          <p class="sheet-long">${esc(f.unavailable || f.long)}</p>
          ${!f.unavailable && f.knownNote ? `<p class="sheet-source">${esc(f.knownNote)}</p>` : ''}
        </div>
        ${f.unavailable ? '' : `
        ${f.prices ? `
          ${f.prices.tables.map((tb) => `
          <table class="prices">
            <caption>${esc(tb.title)}</caption>
            <tbody>${tb.rows.map((r) => `
              <tr><th scope="row">${esc(r.name)}${r.weight ? `<small>${esc(r.weight)}</small>` : ''}</th><td>${r.from ? `<small>${esc(t.priceFrom)} </small>` : ''}${esc(euros(r.price))}${r.per || tb.per ? `<small>/${esc(r.per || tb.per)}</small>` : ''}</td></tr>`).join('')}
            </tbody>
          </table>`).join('')}
          ${f.prices.note ? `<p class="sheet-source">${esc(f.prices.note)}</p>` : ''}` : ''}
        ${f.offer ? `<div class="offer"><b>${esc(f.offer.title)}</b><p>${esc(f.offer.text)}</p></div>` : ''}
        ${groups.map((g) => `
          <fieldset class="group"${photoFields.includes(g.label) ? ' data-photo-field' : ''}>
            <legend>${esc(g.label)}</legend>
            <div class="chips">${g.choices.map((c) => `
              <label class="chip"><input type="${g.multi ? 'checkbox' : 'radio'}" name="${esc(g.name)}" value="${esc(c)}"><span>${esc(c)}</span></label>`).join('')}
            </div>
          </fieldset>`).join('')}
        ${photoFields.length ? '<div class="product-photos" data-product-photos aria-live="polite"></div>' : ''}
        ${f.qtyLabel ? `
          <div class="stepper-row">
            ${unitsOf(f).length > 1
              ? `<div class="units" role="group" aria-label="${esc(t.unitLabel)}">${unitsOf(f).map((u) => `<button type="button" data-unit="${esc(u.label)}" aria-pressed="false">${esc(u.label === 'g' ? t.grams : u.label)}</button>`).join('')}</div>`
              : `<span class="stepper-label">${esc(f.qtyLabel)}</span>`}
            <div class="stepper" role="group" aria-label="${esc(t.qtyLabel)}">
              <button type="button" data-step="-1" aria-label="${esc(t.less)}">−</button>
              <output id="sheet-qty" aria-live="polite">1</output>
              <button type="button" data-step="1" aria-label="${esc(t.more)}">+</button>
            </div>
          </div>` : ''}
        <label class="field">${esc(f.groupsRequired === false ? t.detailRequired : t.detailOptional)}
          <textarea id="sheet-text" rows="2" placeholder="${esc(f.hint)}"></textarea>
          <small class="field-err" id="sheet-err" hidden>${esc(t.detailErr)}</small>
        </label>`}`;
      qty = 1;
      unit = null;
      $('.sheet-foot', sheet).hidden = Boolean(f.unavailable);
      if (!f.unavailable && f.qtyLabel) setUnit(unitsOf(f)[0]);
      sheet.showModal();
      $('#sheet-body').scrollTop = 0;
      $('#sheet-title').focus({ preventScroll: true });
    }

    sheetForm.addEventListener('change', (e) => {
      const field = e.target.closest('[data-photo-field]');
      if (!field) return;

      const preview = $('[data-product-photos]', sheetForm);
      const familyPhoto = $('[data-family-photo]', sheetForm);
      const selected = $$('[data-photo-field] input:checked', sheetForm);
      if (!selected.length) {
        preview.replaceChildren();
        if (familyPhoto) familyPhoto.hidden = false;
        return;
      }

      const active = e.target.checked ? e.target : selected.at(-1);
      const rule = cfg.photoChoices?.[current.id]?.[active.value];
      const blocked = rule?.unless && selected.some((input) => input.value === rule.unless);
      const photos = blocked ? [] : (rule?.photos || rule || []).map((id) => photoById.get(id));

      active.closest('[data-photo-field]').after(preview);
      if (familyPhoto) familyPhoto.hidden = true;
      preview.innerHTML = photos.length ? photos.map((photo) => `
        <figure>
          <a href="${esc(photo.src)}" target="_blank" rel="noopener" aria-label="${esc(photo.caption)}">
            <img src="${esc(photo.src)}" alt="" decoding="async">
          </a>
          <figcaption>${esc(photo.caption)}</figcaption>
        </figure>`).join('') : `
        <figure>
          ${current.photo ? `<img src="${esc(current.photo)}" alt="${esc(current.photoAlt || '')}" decoding="async">` : ''}
          <figcaption>${active.value === 'Que me aconsejen' || active.value === 'Otro'
            ? 'Vista general de la sección.'
            : 'Foto específica pendiente de confirmar.'}</figcaption>
        </figure>`;
    });

    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-open]');
      if (b) openFam(b.dataset.open);
      if (e.target.closest('[data-open-panel]')) { e.preventDefault(); openPanel(); }
    });
    sheet.addEventListener('click', (e) => {
      const s = e.target.closest('[data-step]');
      if (s) setQty(qty + Number(s.dataset.step) * unit.step);
      const u = e.target.closest('[data-unit]');
      if (u) setUnit(unitFor(current, u.dataset.unit));
    });

    function addItem(f, choices, text, n, label) {
      draft.items.push({
        uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        famId: f.id, famName: f.name, choices, text, qty: n, qtyLabel: label ?? (f.qtyLabel || '')
      });
      saveDraft();
      renderCount();
    }

    sheetForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!current || current.unavailable) return;
      const choices = $$('input:checked', sheetForm).map((i) => i.value);
      const text = $('#sheet-text').value.trim();
      if (!choices.length && !text) {
        const err = $('#sheet-err');
        err.hidden = false;
        $('#sheet-text').setAttribute('aria-invalid', 'true');
        $('#sheet-text').setAttribute('aria-describedby', 'sheet-err');
        $('#sheet-text').focus();
        return;
      }
      addItem(current, choices, text, unit ? qty : 1, unit ? unit.label : '');
      closeDialog(sheet);
      added(current);
    });

    function added(f) {
      toast(fill(t.added, { name: f.name }));
      $$('.list-count').forEach((c) => {
        if (!reduced()) c.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 240, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
      });
    }

    /* Otras piezas de la página (p. ej. el despiece de José Tomás) añaden a la lista por aquí */
    window.Encargo = {
      availabilityNote,
      add(famId, choices, text, n, label) {
        const f = famById(famId);
        if (!f) return;
        if (f.unavailable) { toast(f.unavailable); return; }
        addItem(f, choices, text, n, label);
        added(f);
      }
    };

    function renderCount() {
      const n = draft.items.length;
      $$('[data-count]').forEach((el) => { el.textContent = n; });
      document.documentElement.dataset.hasList = String(n > 0);
      $$('.list-btn').forEach((b) => b.setAttribute('aria-label', fill(n === 1 ? t.listAriaOne : t.listAria, { n })));
    }

    /* ---------- Panel de solicitud en pasos ---------- */
    const panel = $('#panel');
    const STEPS = ['list', 'pickup', 'contact', 'done'];
    let step = 'list';
    let pick = { mode: 'store', date: '', slot: '', address: '', postal: '' };
    let contact = { name: '', phone: '', notes: '', consent: false };
    let lastReq = null;

    const days = () => {
      const start = new Date();
      return Array.from({ length: cfg.pickup.days }, (_, i) => addDays(start, i + cfg.pickup.minDaysAhead));
    };
    /* Si el horario publicado no tiene tarde ese día, no ofrecemos tarde */
    const noAfternoon = (iso) => (cfg.pickup.noAfternoonDays || []).includes(new Date(`${iso}T12:00`).getDay());

    function renderProgress() {
      const idx = STEPS.indexOf(step);
      $('#panel-progress').innerHTML = t.steps.map((s, i) => `
        <li class="${i < idx ? 'is-done' : ''}${i === idx ? ' is-now' : ''}"${i === idx ? ' aria-current="step"' : ''}>${esc(s)}</li>`).join('');
    }

    function viewList() {
      if (!draft.items.length) {
        return `<div class="empty"><p>${esc(t.empty)}</p><button type="button" class="btn" data-close>${esc(t.emptyCta)}</button></div>`;
      }
      const unavailable = hasUnavailableItems();
      return `
        <h2 id="panel-title" tabindex="-1">${esc(t.stepListTitle)}</h2>
        <ul class="lines">${draft.items.map((it) => `
          <li class="line">
            <div class="line-body">
              <b>${esc(it.famName)}</b>
              ${it.choices.length || it.text ? `<p>${esc([...it.choices, it.text].filter(Boolean).join(', '))}</p>` : ''}
              ${availabilityNote(it.famId) ? `<p>${esc(availabilityNote(it.famId))}</p>` : ''}
            </div>
            ${it.qtyLabel ? `
              <div class="stepper stepper--sm" role="group" aria-label="${esc(`${it.famName}: ${it.qtyLabel}`)}">
                <button type="button" data-line-step="-1" data-uid="${esc(it.uid)}" aria-label="${esc(t.less)}">−</button>
                <output>${esc(it.qtyLabel === 'g' ? fmtQty(it.qty, 'g') : it.qty)}</output>
                <button type="button" data-line-step="1" data-uid="${esc(it.uid)}" aria-label="${esc(t.more)}">+</button>
              </div>` : ''}
            <button type="button" class="line-x" data-remove="${esc(it.uid)}" aria-label="${esc(fill(t.remove, { name: it.famName }))}">×</button>
          </li>`).join('')}
        </ul>
        <p class="panel-note">${esc(t.priceNote)}</p>
        ${unavailable ? '<p class="panel-note">Quita de la lista los productos que aún no están disponibles para continuar.</p>' : ''}
        <div class="panel-actions">
          <button type="button" class="btn btn--ghost" data-close>${esc(t.addMore)}</button>
          <button type="button" class="btn" data-go="pickup"${unavailable ? ' disabled' : ''}>${esc(t.next)}</button>
        </div>`;
    }

    function viewPickup() {
      const late = pick.date && noAfternoon(pick.date);
      return `
        <h2 id="panel-title" tabindex="-1">${esc(t.stepPickupTitle)}</h2>
        <form id="f-pickup" novalidate>
          ${delivery() ? `
          <fieldset class="group">
            <legend>${esc(t.modeLegend)}</legend>
            <div class="chips">
              <label class="chip"><input type="radio" name="mode" value="store"${isHome(pick) ? '' : ' checked'}><span>${esc(t.modeStore)}</span></label>
              <label class="chip"><input type="radio" name="mode" value="home"${isHome(pick) ? ' checked' : ''}><span>${esc(t.modeHome)}</span></label>
            </div>
            ${isHome(pick) ? `
            <p class="demo-note">${esc(fill(t.homeNote, { min: cfg.delivery.minEuros }))}</p>
            <label class="field">${esc(t.fAddress)}
              <input id="f-address" autocomplete="street-address" value="${esc(pick.address)}">
              <small class="field-err" id="err-address" hidden>${esc(t.errAddress)}</small>
            </label>
            <label class="field">${esc(t.fPostal)}
              <input id="f-postal" inputmode="numeric" autocomplete="postal-code" maxlength="5" value="${esc(pick.postal)}">
              <small class="field-err" id="err-postal" hidden>${esc(t.errPostal)}</small>
            </label>` : ''}
          </fieldset>` : ''}
          <fieldset class="group">
            <legend>${esc(t.dayLegend)}</legend>
            <div class="days" tabindex="0" aria-label="${esc(t.dayLegend)}">${days().map((d) => {
              const iso = isoLocal(d);
              return `<label class="day"><input type="radio" name="date" value="${iso}"${pick.date === iso ? ' checked' : ''}><span>
                <small>${esc(d.toLocaleDateString(LOCALE, { weekday: 'short' }))}</small>
                <b>${d.getDate()}</b>
                <small>${esc(d.toLocaleDateString(LOCALE, { month: 'short' }))}</small>
              </span></label>`;
            }).join('')}</div>
            <p class="hint">${esc(t.dayHint)}</p>
            <p class="field-err" id="err-date" hidden>${esc(t.errDate)}</p>
          </fieldset>
          <fieldset class="group">
            <legend>${esc(t.slotLegend)}</legend>
            <div class="chips">${t.slots.map((s, i) => {
              const off = i === 1 && late;
              return `<label class="chip"><input type="radio" name="slot" value="${esc(s)}"${pick.slot === s && !off ? ' checked' : ''}${off ? ' disabled' : ''}><span>${esc(s)}</span></label>`;
            }).join('')}</div>
            ${late ? `<p class="hint">${esc(t.noAfternoon)}</p>` : ''}
            <p class="field-err" id="err-slot" hidden>${esc(t.errSlot)}</p>
          </fieldset>
          <div class="panel-actions">
            <button type="button" class="btn btn--ghost" data-go="list">${esc(t.back)}</button>
            <button type="submit" class="btn">${esc(t.next)}</button>
          </div>
        </form>`;
    }

    function viewContact() {
      return `
        <h2 id="panel-title" tabindex="-1">${esc(t.stepContactTitle)}</h2>
        <form id="f-contact" novalidate>
          <label class="field">${esc(t.fName)}
            <input id="f-name" autocomplete="name" enterkeyhint="next" value="${esc(contact.name)}">
            <small class="field-err" id="err-name" hidden>${esc(t.errName)}</small>
          </label>
          <label class="field">${esc(t.fPhone)}
            <input id="f-phone" type="tel" inputmode="tel" autocomplete="tel" enterkeyhint="next" value="${esc(contact.phone)}">
            <small class="hint">${esc(t.phoneHint)}</small>
            <small class="field-err" id="err-phone" hidden>${esc(t.errPhone)}</small>
          </label>
          <label class="field">${esc(t.fNotes)}
            <textarea id="f-notes" rows="2" placeholder="${esc(t.notesHint)}">${esc(contact.notes)}</textarea>
          </label>
          <label class="check">
            <input type="checkbox" id="f-consent"${contact.consent ? ' checked' : ''}>
            <span>${esc(t.consent)}</span>
          </label>
          <p class="field-err" id="err-consent" hidden>${esc(t.errConsent)}</p>
          ${LIVE ? '' : `<p class="demo-note">${esc(t.demoSubmit)}</p>`}
          <p class="field-err" id="err-send" hidden>${esc(fill(t.errSend, { phone: cfg.phoneLabel }))}</p>
          <div class="panel-actions">
            <button type="button" class="btn btn--ghost" data-go="pickup">${esc(t.back)}</button>
            <button type="submit" class="btn" id="submit-btn">${esc(LIVE ? t.submitLive : t.submitDemo)}</button>
          </div>
        </form>`;
    }

    function viewDone() {
      const r = lastReq;
      return `
        <h2 id="panel-title" tabindex="-1">${esc(r.demo ? t.doneDemoTitle : t.doneLiveTitle)}</h2>
        <p class="done-lead">${esc(fill(r.demo ? t.doneDemoLead : t.doneLiveLead, { shop: cfg.shop }))}</p>
        <pre class="receipt" id="receipt">${esc(summaryText(r))}</pre>
        <div class="panel-actions panel-actions--stack">
          <a class="btn" href="tel:${esc(cfg.phoneHref)}">${esc(fill(t.call, { phone: cfg.phoneLabel }))}</a>
          <button type="button" class="btn btn--ghost" id="copy">${esc(t.copy)}</button>
          <button type="button" class="link" data-close>${esc(t.close)}</button>
        </div>`;
    }

    const VIEWS = { list: viewList, pickup: viewPickup, contact: viewContact, done: viewDone };

    function go(next, { focus = true } = {}) {
      step = next;
      renderProgress();
      const body = $('#panel-body');
      body.innerHTML = VIEWS[step]();
      body.scrollTop = 0;
      if (focus) $('#panel-title')?.focus({ preventScroll: true });
    }

    function openPanel() {
      if (step === 'done') step = 'list';
      go(step, { focus: false });
      panel.showModal();
      $('#panel-title')?.focus({ preventScroll: true });
    }

    const showErr = (id, input) => {
      $(`#${id}`).hidden = false;
      if (input) input.setAttribute('aria-invalid', 'true');
    };

    panel.addEventListener('click', (e) => {
      const g = e.target.closest('[data-go]');
      if (g) { readForms(); go(g.dataset.go); return; }
      const rm = e.target.closest('[data-remove]');
      if (rm) {
        draft.items = draft.items.filter((it) => it.uid !== rm.dataset.remove);
        saveDraft(); renderCount(); go('list');
        return;
      }
      const ls = e.target.closest('[data-line-step]');
      if (ls) {
        const it = draft.items.find((x) => x.uid === ls.dataset.uid);
        const u = unitFor(famById(it.famId), it.qtyLabel);
        it.qty = Math.min(u.max, Math.max(u.min, it.qty + Number(ls.dataset.lineStep) * u.step));
        saveDraft();
        ls.parentElement.querySelector('output').textContent = it.qtyLabel === 'g' ? fmtQty(it.qty, 'g') : it.qty;
        return;
      }
      if (e.target.closest('#copy')) copySummary();
    });

    /* Al cambiar de día, sólo se reconstruye la franja si cambia la disponibilidad de tarde */
    panel.addEventListener('change', (e) => {
      const { name, value } = e.target;
      if (name === 'date' || name === 'mode') {
        const left = $('.days', panel).scrollLeft;
        const top = $('#panel-body').scrollTop;
        readForms();
        if (noAfternoon(pick.date) && pick.slot === t.slots[1]) pick.slot = '';
        go('pickup', { focus: false });
        $('.days', panel).scrollLeft = left;
        $('#panel-body').scrollTop = top;
        $(`input[name="${name}"][value="${value}"]`, panel).focus({ preventScroll: true });
      }
    });

    function readForms() {
      if (step === 'pickup') {
        const d = $('input[name="date"]:checked', panel);
        const s = $('input[name="slot"]:checked', panel);
        const m = $('input[name="mode"]:checked', panel);
        if (d) pick.date = d.value;
        if (s) pick.slot = s.value;
        if (m) pick.mode = m.value;
        if ($('#f-address')) {
          pick.address = $('#f-address').value.trim();
          pick.postal = $('#f-postal').value.trim();
        }
      }
      if (step === 'contact') {
        contact = {
          name: $('#f-name').value.trim(),
          phone: $('#f-phone').value.trim(),
          notes: $('#f-notes').value.trim(),
          consent: $('#f-consent').checked
        };
      }
    }

    panel.addEventListener('submit', async (e) => {
      e.preventDefault();
      readForms();
      if (e.target.id === 'f-pickup') {
        $$('.field-err', e.target).forEach((x) => { x.hidden = true; });
        const off = pick.date && noAfternoon(pick.date) && pick.slot === t.slots[1];
        $$('[aria-invalid]', e.target).forEach((x) => x.removeAttribute('aria-invalid'));
        const home = isHome(pick);
        const badAddress = home && !pick.address;
        const badPostal = home && !/^\d{5}$/.test(pick.postal);
        if (badAddress) showErr('err-address', $('#f-address'));
        if (badPostal) showErr('err-postal', $('#f-postal'));
        if (!pick.date) showErr('err-date');
        if (!pick.slot || off) showErr('err-slot');
        if (badAddress) { $('#f-address').focus(); return; }
        if (badPostal) { $('#f-postal').focus(); return; }
        if (!pick.date) { $('.days', panel).focus(); return; }
        if (!pick.slot || off) { $('input[name="slot"]:not(:disabled)', panel).focus(); return; }
        go('contact');
        return;
      }
      if (e.target.id === 'f-contact') {
        $$('.field-err', e.target).forEach((x) => { x.hidden = true; });
        $$('[aria-invalid]', e.target).forEach((x) => x.removeAttribute('aria-invalid'));
        const bad = [];
        if (!contact.name) { showErr('err-name', $('#f-name')); bad.push($('#f-name')); }
        if (!/^(\+34)?[6789]\d{8}$/.test(contact.phone.replace(/[\s.-]/g, ''))) { showErr('err-phone', $('#f-phone')); bad.push($('#f-phone')); }
        if (!contact.consent) { showErr('err-consent', $('#f-consent')); bad.push($('#f-consent')); }
        if (bad.length) { bad[0].focus(); return; }
        submit();
      }
    });

    async function submit() {
      if (hasUnavailableItems()) { go('list'); return; }
      const d = new Date();
      const req = {
        ref: `${cfg.refPrefix}-${pad(d.getMonth() + 1)}${pad(d.getDate())}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
        createdAt: d.toISOString(),
        demo: !LIVE,
        status: 'pendiente',
        items: draft.items.map(({ famId, famName, choices, text, qty: q, qtyLabel }) => ({ famId, famName, choices, text, qty: q, qtyLabel })),
        pickup: { ...pick },
        contact: { name: contact.name, phone: contact.phone },
        notes: contact.notes
      };
      if (LIVE) {
        const btn = $('#submit-btn');
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        try {
          const res = await fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json().catch(() => ({}));
          if (data.ref) req.ref = data.ref;
        } catch {
          showErr('err-send');
          btn.disabled = false;
          btn.removeAttribute('aria-busy');
          return;
        }
      }
      const all = store.get(KEY.requests, []);
      all.unshift(req);
      store.set(KEY.requests, all);
      draft = { items: [] };
      saveDraft();
      renderCount();
      lastReq = req;
      pick = { mode: 'store', date: '', slot: '', address: '', postal: '' };
      contact = { name: '', phone: '', notes: '', consent: false };
      go('done');
      renderMine();
    }

    function copySummary() {
      const text = $('#receipt').textContent;
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => toast(t.copied), () => toast(t.copyFail));
      } else {
        const range = document.createRange();
        range.selectNodeContents($('#receipt'));
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        toast(t.copyFail);
      }
    }

    /* ---------- Mis solicitudes (en este navegador) ---------- */
    function renderMine() {
      const all = store.get(KEY.requests, []);
      const sec = $('#mis-solicitudes');
      sec.hidden = !all.length;
      $('#mine-list').innerHTML = all.map((r) => `
        <li class="mine">
          <b>${esc(r.ref)}</b>
          <span>${esc(fmtPickup(r.pickup))}</span>
          <span class="pill">${esc(statusLabel(r))}</span>
          ${r.reply ? `<p>${esc(r.reply)}</p>` : ''}
        </li>`).join('');
    }
    $('#mine-clear').addEventListener('click', () => {
      store.del(KEY.requests);
      renderMine();
      toast(t.cleared);
    });
    /* Si en otra pestaña la "tienda" cambia el estado, lo reflejamos aquí */
    window.addEventListener('storage', (e) => {
      if (e.key === KEY.requests) renderMine();
      if (e.key === KEY.draft) { draft = store.get(KEY.draft, { items: [] }); renderCount(); }
    });

    wireDialog(sheet);
    wireDialog(panel);
    renderCount();
    renderMine();
  }

  /* =====================================================================
     Página de gestión (simulación de lo que vería el comercio)
     ===================================================================== */
  function initAdmin() {
    const list = $('#admin-list');
    function render() {
      const all = store.get(KEY.requests, []);
      $('#admin-empty').hidden = all.length > 0;
      list.innerHTML = all.map((r, i) => `
        <li class="adm">
          <header><h2>${esc(r.ref)}</h2><span class="pill">${esc(statusLabel(r))}</span></header>
          <p><b>${esc(fmtPickup(r.pickup))}</b></p>
          ${isHome(r.pickup) ? `<p>${esc(`${r.pickup.address}, ${r.pickup.postal}`)}</p>` : ''}
          <p>${esc(r.contact.name)} · <a href="tel:${esc(r.contact.phone.replace(/[^\d+]/g, ''))}">${esc(r.contact.phone)}</a></p>
          <ol>${r.items.map((it) => `<li>${esc(itemLine(it))}</li>`).join('')}</ol>
          ${r.notes ? `<p><i>${esc(r.notes)}</i></p>` : ''}
          <label class="field">${esc(t.admReply)}
            <textarea rows="2" data-reply="${i}">${esc(r.reply || '')}</textarea>
          </label>
          <div class="panel-actions" role="group" aria-label="${esc(r.ref)}">
            <button type="button" class="btn" data-set="confirmado" data-i="${i}">${esc(t.admConfirm)}</button>
            <button type="button" class="btn btn--ghost" data-set="propuesta" data-i="${i}">${esc(t.admPropose)}</button>
            <button type="button" class="btn btn--ghost" data-set="no-disponible" data-i="${i}">${esc(t.admNo)}</button>
          </div>
        </li>`).join('');
    }
    list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-set]');
      if (!b) return;
      const all = store.get(KEY.requests, []);
      const r = all[Number(b.dataset.i)];
      if (!r) return;
      r.status = b.dataset.set;
      r.reply = $(`[data-reply="${b.dataset.i}"]`, list).value.trim();
      store.set(KEY.requests, all);
      render();
      toast(`${r.ref}: ${t.status[r.status]} (${t.simulated})`);
    });
    $('#admin-clear').addEventListener('click', () => { store.del(KEY.requests); render(); toast(t.cleared); });
    window.addEventListener('storage', (e) => { if (e.key === KEY.requests) render(); });
    render();
  }

  if (document.body.dataset.page === 'gestion') initAdmin(); else initShop();
})();
