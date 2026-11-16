/* Tarjeta de sellos: una compra, un sello; al completar la tarjeta, un regalo de la casa.
   Sin azar, así que no es un sorteo: no hay comunicación a la Generalitat ni tributo sobre el juego.
   Demo: la tarjeta vive sólo en este navegador y sólo guarda el correo enmascarado.
   En real: la tarjeta está en un servidor y el sello lo pone la tienda desde su panel al leer el código. */
(() => {
  'use strict';

  const app = document.getElementById('tarjeta-app');
  if (!app) return;

  /* Por acordar con la tienda: cuántos sellos y qué regalo */
  const GOAL = 10;
  const REWARD = null;
  const KEY = 'jose-tomas:tarjeta';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* navegación privada */ } },
    del() { try { localStorage.removeItem(KEY); } catch { /* idem */ } }
  };
  const mask = (mail) => {
    const [u, d] = mail.split('@');
    return `${u.slice(0, 2)}${'•'.repeat(Math.max(1, u.length - 2))}@${d}`;
  };
  const newCode = () => {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const n = crypto.getRandomValues(new Uint32Array(4));
    return `JT-${[...n].map((x) => abc[x % abc.length]).join('')}`;
  };
  /* Cada sello cae con su propio ángulo, como uno de goma; se guarda para que no baile al recargar */
  const tilt = () => Math.round((Math.random() - 0.5) * 28);

  document.querySelector('[data-reward]').textContent = REWARD
    ? `Con ${GOAL} sellos: ${REWARD}.`
    : `Ejemplo: ${GOAL} sellos. El número de sellos y el regalo están por acordar con José Tomás.`;

  let card = store.get();

  function viewJoin() {
    app.innerHTML = `
      <form class="sellos-form" id="tarjeta-form" novalidate>
        <h3>Crea tu tarjeta</h3>
        <label class="field">Tu correo
          <input type="email" id="tarjeta-email" autocomplete="email" inputmode="email" placeholder="nombre@gmail.com" aria-describedby="tarjeta-email-err">
          <small class="field-err" id="tarjeta-email-err" hidden>Escribe un correo válido.</small>
        </label>
        <label class="check"><input type="checkbox" id="tarjeta-ok" aria-describedby="tarjeta-ok-err"><span>Acepto las condiciones de la tarjeta y que la tienda guarde mi correo para gestionarla (textos pendientes).</span></label>
        <small class="field-err" id="tarjeta-ok-err" hidden>Para crear la tarjeta tienes que aceptarlo.</small>
        <label class="check"><input type="checkbox" id="tarjeta-news"><span>Quiero recibir novedades de la tienda (opcional).</span></label>
        <button type="submit" class="btn">Crear mi tarjeta</button>
        <p class="sellos-demo"><b>Demostración:</b> tu correo no se envía a ningún sitio. La tarjeta solo existe en este navegador.</p>
      </form>`;
  }

  function viewCard({ stamped = -1 } = {}) {
    const full = card.stamps.length >= GOAL;
    app.innerHTML = `
      <div class="carnet${full ? ' is-full' : ''}">
        <div class="carnet-head">
          <span class="carnet-brand">José Tomás</span>
          <span class="carnet-kind">Tarjeta de la casa</span>
        </div>
        <ol class="carnet-grid" aria-label="${card.stamps.length} de ${GOAL} sellos">
          ${Array.from({ length: GOAL }, (_, i) => {
            const s = card.stamps[i];
            return `<li class="slot${s !== undefined ? ' has-stamp' : ''}">
              <span class="slot-n" aria-hidden="true">${i + 1}</span>
              ${s !== undefined ? `<span class="stamp${i === stamped ? ' is-new' : ''}" style="--r:${s}deg" aria-hidden="true">JT</span>` : ''}
            </li>`;
          }).join('')}
        </ol>
        <div class="carnet-foot">
          <span class="carnet-code" aria-label="Tu código">${esc(card.code)}</span>
          <span class="carnet-mail">${esc(card.mail)}</span>
        </div>
      </div>
      <p class="carnet-status">${full
        ? `<b>¡Tarjeta completa!</b> Enséñala en la tienda para recoger tu regalo.`
        : `<b>${card.stamps.length} de ${GOAL} sellos.</b> ${GOAL - card.stamps.length === 1 ? 'Te falta uno.' : `Te faltan ${GOAL - card.stamps.length}.`}`}
        ${card.done ? ` Tarjetas completadas: ${card.done}.` : ''}</p>
      <div class="carnet-actions">
        ${full
          ? `<button type="button" class="btn" data-act="redeem">Simular que recojo el regalo</button>`
          : `<button type="button" class="btn" data-act="stamp">Simular un sello de la tienda</button>`}
        <button type="button" class="link" data-act="forget">Borrar mi tarjeta de este navegador</button>
      </div>
      <p class="sellos-demo"><b>Demostración:</b> en la versión real el sello lo pone la tienda al leer tu código, no tú.</p>`;
  }

  app.addEventListener('submit', (e) => {
    e.preventDefault();
    const mail = app.querySelector('#tarjeta-email');
    const ok = app.querySelector('#tarjeta-ok');
    const okMail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail.value.trim());
    mail.setAttribute('aria-invalid', String(!okMail));
    app.querySelector('#tarjeta-email-err').hidden = okMail;
    app.querySelector('#tarjeta-ok-err').hidden = ok.checked;
    if (!okMail) { mail.focus(); return; }
    if (!ok.checked) { ok.focus(); return; }
    card = { code: newCode(), mail: mask(mail.value.trim()), stamps: [], done: 0 };
    store.set(card);
    viewCard();
    app.querySelector('.carnet').classList.add('is-new');
  });

  app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'stamp' && card.stamps.length < GOAL) {
      card.stamps.push(tilt());
      store.set(card);
      viewCard({ stamped: card.stamps.length - 1 });
      if (!reduced()) app.querySelector('.carnet').animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(0)' }],
        { duration: 180, delay: 120, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
      );
    }
    if (b.dataset.act === 'redeem') {
      card.stamps = [];
      card.done += 1;
      store.set(card);
      viewCard();
    }
    if (b.dataset.act === 'forget') {
      store.del();
      card = null;
      viewJoin();
      app.querySelector('#tarjeta-email').focus();
    }
  });

  if (card && Array.isArray(card.stamps)) viewCard(); else viewJoin();
})();
