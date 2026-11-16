/* Despiece «Por partes»: vaca y cerdo de cartel de carnicería con zonas que se pueden tocar.
   Cada zona propone sus piezas y añade la petición a la lista con Encargo.add (encargo.js).
   Los nombres son los habituales del despiece en España; qué hay y a qué precio lo dice la tienda. */
(() => {
  'use strict';

  const root = document.getElementById('despiece');
  if (!root || !window.Encargo) return;
  const availabilityNote = window.Encargo.availabilityNote?.('carnes');

  const NS = 'http://www.w3.org/2000/svg';
  const ADVICE = 'Que me aconsejen';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtG = (g) => (g >= 1000 ? `${String(g / 1000).replace('.', ',')} kg` : `${g} g`);
  const pad = (n) => String(n).padStart(2, '0');

  /* Polígonos en el sistema de la ilustración (viewBox 20 60 780 390). Se recortan con la silueta,
     así que basta con que sus lados compartidos coincidan; lo que sobresale no se ve. */
  const ANIMALS = {
    vaca: {
      label: 'Vaca',
      parts: 'Partes de la vaca',
      meat: 'Ternera',
      empty: 'Del lomo salen el entrecot y el chuletón; de la pierna, los filetes; del morcillo, el guiso. Toca la vaca y te lo enseñamos.',
      caption: 'Dibujo de una vaca dividida en zonas de despiece. Las mismas zonas están en la lista de debajo.',
      body: 'M232 112C300 100 420 108 520 106C580 104 630 100 660 112C690 124 700 160 694 205C690 250 676 290 664 330L668 398L636 398C632 360 618 336 604 318C560 312 470 318 400 316C350 318 320 318 306 322L306 398L268 398C266 360 256 330 238 312C210 300 190 284 178 262C166 240 150 224 130 214C110 206 86 208 66 200C48 194 38 180 42 166C46 150 62 132 82 118C92 110 104 104 116 102C150 98 196 104 232 112Z',
      far: ['M296 312L330 314L332 436L300 436Z', 'M590 312L628 318L622 436L592 436Z'],
      hooves: ['M268 398L306 398L308 436L266 436Z', 'M636 398L668 398L672 436L634 436Z'],
      tail: { d: 'M676 120C712 150 720 230 716 300', origin: '676px 120px', tuft: 'M716 290C730 300 732 326 716 342C700 326 702 300 716 290Z' },
      face: `
        <path class="cow-horn" d="M104 104C102 88 110 76 124 70C118 82 116 92 116 104Z"/>
        <path class="cow-ear" d="M118 108C130 90 150 84 164 90C154 104 136 112 120 114Z"/>
        <ellipse class="cow-eye" cx="88" cy="140" rx="4.5" ry="4.5"/>
        <ellipse class="cow-nostril" cx="52" cy="176" rx="4" ry="3"/>`,
      zones: [
        { id: 'cabeza', name: 'Cabeza', use: 'Guiso a fuego lento', pieces: ['Carrillera', 'Lengua'],
          poly: [[0, 0], [154, 0], [152, 96], [136, 240], [0, 240]], at: [104, 158] },
        { id: 'pescuezo', name: 'Pescuezo', use: 'Guiso, caldo, carne picada', pieces: ['Pescuezo', 'Para picar'],
          poly: [[154, 0], [228, 0], [226, 104], [214, 182], [168, 252], [100, 300], [136, 240], [152, 96]], at: [184, 150] },
        { id: 'aguja', name: 'Aguja', use: 'Guiso, plancha en filete fino', pieces: ['Aguja', 'Chuletas de aguja'],
          poly: [[228, 0], [332, 0], [332, 178], [214, 182], [226, 104]], at: [280, 142] },
        { id: 'espaldilla', name: 'Espaldilla', use: 'Filetes, guiso, carne picada', pieces: ['Llana', 'Espaldilla', 'Pez', 'Brazuelo'],
          poly: [[214, 182], [332, 178], [332, 262], [262, 300], [181, 232]], at: [272, 232] },
        { id: 'pecho', name: 'Pecho', use: 'Caldo, horno lento, guiso', pieces: ['Pecho', 'Punta de pecho'],
          poly: [[168, 252], [181, 232], [262, 300], [332, 262], [332, 340], [240, 342], [100, 300]], at: [226, 296] },
        { id: 'lomo-alto', name: 'Lomo alto', use: 'Brasa, plancha', pieces: ['Entrecot', 'Chuletón', 'Chuleta'],
          poly: [[332, 0], [436, 0], [436, 178], [332, 178]], at: [384, 142] },
        { id: 'lomo-bajo', name: 'Lomo bajo', use: 'Brasa, plancha', pieces: ['Lomo bajo', 'Entrecot', 'Chuleta de lomo bajo'],
          poly: [[436, 0], [540, 0], [540, 176], [436, 178]], at: [488, 140] },
        { id: 'solomillo', name: 'Solomillo', use: 'Plancha, horno, steak tartar', pieces: ['Solomillo entero', 'Medallones'],
          poly: [[436, 178], [540, 176], [570, 186], [560, 214], [436, 212]], at: [498, 196] },
        { id: 'cadera', name: 'Cadera', use: 'Plancha, brasa, filetes', pieces: ['Cadera', 'Tapilla', 'Rabillo de cadera'],
          poly: [[540, 0], [604, 0], [600, 90], [590, 196], [570, 186], [540, 176]], at: [570, 140] },
        { id: 'pierna', name: 'Pierna', use: 'Filetes, escalopes, horno, carne picada', pieces: ['Tapa', 'Contra', 'Babilla', 'Redondo'],
          poly: [[604, 0], [780, 0], [780, 360], [600, 360], [606, 330], [560, 214], [570, 186], [590, 196], [600, 90]], at: [646, 236] },
        { id: 'falda', name: 'Falda y costillar', use: 'Guiso, horno, costilla a la brasa', pieces: ['Falda', 'Aleta', 'Costilla'],
          poly: [[332, 178], [436, 178], [436, 212], [560, 214], [606, 330], [600, 360], [332, 360]], at: [462, 268] },
        { id: 'morcillo', name: 'Morcillo', use: 'Guiso, caldo, ossobuco', pieces: ['Morcillo', 'Ossobuco'],
          poly: [[240, 342], [332, 340], [332, 398], [240, 398]], at: [287, 368],
          also: { poly: [[600, 360], [780, 360], [780, 398], [600, 398]], at: [652, 378] } },
        { id: 'rabo', name: 'Rabo', use: 'Guiso', pieces: ['Rabo'], tail: true, at: [742, 214] }
      ]
    },
    cerdo: {
      label: 'Cerdo',
      parts: 'Partes del cerdo',
      meat: 'Cerdo',
      breed: { label: '¿Blanco o ibérico?', choices: ['Blanco', 'Ibérico', ADVICE] },
      empty: 'Del cabecero sale la presa; del lomo, la pluma y la cinta; de la panceta, el secreto. Toca el cerdo y te lo enseñamos.',
      caption: 'Dibujo de un cerdo dividido en zonas de despiece. Las mismas zonas están en la lista de debajo.',
      body: 'M210 150C280 112 420 104 540 112C620 118 680 140 700 200C716 250 700 300 668 326L664 398L632 398L628 344C560 356 420 360 330 352L326 398L294 398L290 340C250 330 210 310 186 280C160 262 130 250 100 240L64 232C54 230 50 200 58 186L96 176C120 160 160 150 210 150Z',
      far: ['M318 330L350 334L352 430L320 430Z', 'M600 330L634 334L630 430L600 430Z'],
      hooves: ['M294 398L326 398L328 430L292 430Z', 'M632 398L664 398L666 430L630 430Z'],
      tail: { d: 'M698 192C724 176 744 196 734 214C726 228 706 220 712 206C716 196 730 198 732 210', origin: '698px 192px' },
      face: `
        <ellipse class="pig-snout" cx="58" cy="209" rx="9" ry="24"/>
        <ellipse class="cow-nostril" cx="57" cy="200" rx="2.5" ry="4"/>
        <ellipse class="cow-nostril" cx="57" cy="218" rx="2.5" ry="4"/>
        <ellipse class="cow-eye" cx="130" cy="186" rx="4.5" ry="4.5"/>
        <path class="cow-ear" d="M152 160C170 128 202 124 218 138C208 168 182 188 156 194Z"/>`,
      zones: [
        { id: 'cabeza', name: 'Cabeza', use: 'Guiso, horno; la carrillera, a fuego lento', pieces: ['Carrillera', 'Careta', 'Oreja'],
          poly: [[0, 0], [200, 0], [194, 150], [160, 250], [0, 250]], at: [104, 216] },
        { id: 'papada', name: 'Papada', use: 'Plancha muy hecha, guisos, para curar', pieces: ['Papada'],
          poly: [[0, 250], [160, 250], [240, 262], [244, 344], [240, 440], [0, 440]], at: [206, 288] },
        { id: 'cabecero', name: 'Cabecero', use: 'Plancha, brasa, horno', pieces: ['Presa', 'Cabecero de lomo', 'Chuletas de aguja'],
          poly: [[200, 0], [330, 0], [330, 190], [214, 196], [194, 150]], at: [268, 164] },
        { id: 'paleta', name: 'Paleta', use: 'Horno, guiso, carne picada', pieces: ['Paleta fresca', 'Paletilla'],
          poly: [[194, 150], [214, 196], [330, 190], [336, 344], [244, 344], [240, 262], [160, 250]], at: [284, 262],
          cured: { label: '¿Paleta curada? Elige la calidad', fam: 'jamones' } },
        { id: 'lomo', name: 'Lomo', use: 'Plancha, brasa, horno', pieces: ['Cinta de lomo', 'Chuletas de lomo', 'Pluma', 'Lagarto'],
          poly: [[330, 0], [560, 0], [560, 184], [330, 190]], at: [440, 150] },
        { id: 'solomillo', name: 'Solomillo', use: 'Plancha, horno', pieces: ['Solomillo'],
          poly: [[440, 186], [560, 184], [580, 200], [560, 222], [440, 220]], at: [510, 203] },
        { id: 'costillar', name: 'Costillar', use: 'Horno, brasa, guiso', pieces: ['Costilla', 'Churrasco'],
          poly: [[330, 190], [440, 186], [440, 220], [560, 222], [580, 200], [590, 240], [586, 262], [336, 268]], at: [400, 232] },
        { id: 'panceta', name: 'Panceta', use: 'Brasa, plancha, horno', pieces: ['Panceta', 'Secreto', 'Abanico'],
          poly: [[336, 268], [586, 262], [610, 346], [600, 440], [336, 440]], at: [470, 310] },
        { id: 'jamon', name: 'Jamón', use: 'Filetes, horno, guiso', pieces: ['Jamón fresco', 'Maza', 'Tapa', 'Contra'],
          poly: [[560, 0], [800, 0], [800, 346], [610, 346], [590, 240], [580, 200], [560, 184]], at: [648, 236],
          cured: { label: '¿Jamón curado? Elige la calidad', fam: 'jamones' } },
        { id: 'codillo', name: 'Codillo y manitas', use: 'Horno, guiso, caldo', pieces: ['Codillo', 'Manitas'],
          poly: [[244, 344], [336, 344], [336, 440], [244, 440]], at: [310, 372],
          also: { poly: [[610, 346], [800, 346], [800, 440], [600, 440]], at: [648, 372] } },
        { id: 'rabo', name: 'Rabo', use: 'Guiso, caldo', pieces: ['Rabito'], tail: true, at: [764, 176] }
      ]
    }
  };

  const pts = (p) => p.map((xy) => xy.join(',')).join(' ');
  const el = (name, attrs = {}) => {
    const n = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    return n;
  };

  const fig = root.querySelector('.cow');
  const caption = fig.querySelector('figcaption');
  const legend = root.querySelector('.cow-legend');
  const switcher = root.querySelector('.cow-animal');
  const cut = root.querySelector('#cut');

  let animal = null;
  let svg = null;
  let current = null;
  const units = { g: { step: 50, min: 50, max: 20000, start: 500 }, raciones: { step: 1, min: 1, max: 99, start: 2 } };
  let unit = 'g';
  let qty = units.g.start;

  /* ---------- Ilustración ---------- */
  function draw(a) {
    const s = el('svg', { viewBox: '20 60 780 390', class: 'cow-svg', 'aria-hidden': 'true', focusable: 'false' });
    s.innerHTML = `
      <defs><clipPath id="cow-body" clipPathUnits="userSpaceOnUse"><path d="${a.body}"/></clipPath></defs>
      <g class="cow-far">${a.far.map((d) => `<path d="${d}"/>`).join('')}</g>
      <g class="cow-tail-swing" style="transform-origin: ${a.tail.origin}"><g class="cow-tail" data-zone="rabo">
        <path class="cow-tail-hit" d="${a.tail.d}"/>
        <path class="cow-tail-line" d="${a.tail.d}"/>
        ${a.tail.tuft ? `<path class="cow-tail-tuft" d="${a.tail.tuft}"/>` : ''}
      </g></g>
      <path class="cow-base" d="${a.body}"/>
      <path class="cow-cavity" clip-path="url(#cow-body)" d=""/>
      <g class="cow-zones"></g>
      ${a.hooves.map((d) => `<path class="cow-hoof" d="${d}"/>`).join('')}
      <path class="cow-line" d="${a.body}"/>
      <g class="cow-face">${a.face}</g>
      <g class="cow-nums"></g>
      <g class="cow-lifted"></g>`;
    const zonesG = s.querySelector('.cow-zones');
    const numsG = s.querySelector('.cow-nums');
    a.zones.forEach((z, i) => {
      const parts = z.tail ? [] : [z, ...(z.also ? [z.also] : [])];
      parts.forEach((p) => {
        zonesG.append(el('polygon', { points: pts(p.poly), class: 'cow-zone', 'data-zone': z.id, 'clip-path': 'url(#cow-body)' }));
      });
      [z.at, ...(z.also ? [z.also.at] : [])].forEach(([x, y]) => {
        const g = el('g', { class: 'cow-num', transform: `translate(${x} ${y})`, 'data-num': z.id });
        g.append(el('circle', { r: 15 }));
        const tx = el('text', { 'text-anchor': 'middle', dy: '0.35em' });
        tx.textContent = pad(i + 1);
        g.append(tx);
        numsG.append(g);
      });
    });
    return s;
  }

  function lift(id) {
    /* La pieza elegida sube a la capa superior y deja su hueco oscuro debajo */
    const zonesG = svg.querySelector('.cow-zones');
    const numsG = svg.querySelector('.cow-nums');
    const liftedG = svg.querySelector('.cow-lifted');
    const all = [...svg.querySelectorAll('.cow-zone')];
    all.forEach((p) => { p.classList.remove('is-on'); zonesG.append(p); });
    svg.querySelector('.cow-tail').classList.toggle('is-on', id === 'rabo');
    const picked = all.filter((p) => p.dataset.zone === id);
    svg.querySelector('.cow-cavity').setAttribute('d', picked.map((p) => `M${p.getAttribute('points')}Z`).join(''));
    picked.forEach((p) => liftedG.append(p));
    requestAnimationFrame(() => picked.forEach((p) => p.classList.add('is-on')));
    numsG.append(...liftedG.querySelectorAll('.cow-num'));
    numsG.querySelectorAll('.cow-num').forEach((n) => n.classList.toggle('is-on', n.dataset.num === id));
    liftedG.append(...numsG.querySelectorAll(`[data-num="${id}"]`));
  }

  function emptyCut(a) {
    cut.innerHTML = `
      <div class="cut-in cut-empty">
        <p class="cut-no">${esc(a.meat)}</p>
        <h3>Elige una parte</h3>
        <p>${esc(a.empty)}</p>
      </div>`;
  }

  function setAnimal(key, { animate = true } = {}) {
    if (key === animal) return;
    animal = key;
    const a = ANIMALS[key];
    current = null;
    const next = draw(a);
    if (animate && !reduced()) next.classList.add('is-entering');
    if (svg) svg.replaceWith(next); else fig.append(next);
    svg = next;
    caption.textContent = a.caption;
    switcher.querySelectorAll('[data-animal]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.animal === key)));
    legend.setAttribute('aria-label', a.parts);
    legend.innerHTML = a.zones.map((z, i) => `
      <li><button type="button" data-zone="${esc(z.id)}" aria-pressed="false" aria-controls="cut">
        <span aria-hidden="true">${pad(i + 1)}</span>${esc(z.name)}</button></li>`).join('');
    emptyCut(a);
  }

  function renderQty() {
    const out = cut.querySelector('#cut-qty');
    if (out) out.textContent = unit === 'g' ? fmtG(qty) : qty;
    cut.querySelectorAll('[data-cut-unit]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cutUnit === unit)));
  }

  function select(id, { reveal = false } = {}) {
    const a = ANIMALS[animal];
    const z = a.zones.find((x) => x.id === id);
    if (!z) return;
    current = z;
    lift(id);
    legend.querySelectorAll('[data-zone]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.zone === id)));
    const chips = (name, list, checked) => list.map((p) => `
      <label class="chip"><input type="radio" name="${name}" value="${esc(p)}"${p === checked ? ' checked' : ''}><span>${esc(p)}</span></label>`).join('');
    cut.innerHTML = `
      <div class="cut-in">
        <p class="cut-no">${pad(a.zones.indexOf(z) + 1)} · ${esc(a.meat)}</p>
        <h3 id="cut-title" tabindex="-1">${esc(z.name)}</h3>
        <p class="cut-use"><b>Va bien para</b> ${esc(z.use)}</p>
        ${availabilityNote ? `
          <p class="cut-use"><b>Piezas</b> ${z.pieces.map(esc).join(', ')}</p>
          <p class="hint">${esc(availabilityNote)}</p>
        ` : `
        ${a.breed ? `
        <fieldset class="group">
          <legend>${esc(a.breed.label)}</legend>
          <div class="chips">${chips('cut-breed', a.breed.choices, ADVICE)}</div>
        </fieldset>` : ''}
        <fieldset class="group">
          <legend>¿Qué pieza?</legend>
          <div class="chips">${chips('cut-piece', [...z.pieces, ADVICE], z.pieces[0])}</div>
        </fieldset>
        <div class="stepper-row">
          <div class="units" role="group" aria-label="Cantidad en">
            <button type="button" data-cut-unit="g" aria-pressed="true">Gramos</button>
            <button type="button" data-cut-unit="raciones" aria-pressed="false">Raciones</button>
          </div>
          <div class="stepper" role="group" aria-label="Cantidad">
            <button type="button" data-cut-step="-1" aria-label="Menos">−</button>
            <output id="cut-qty" aria-live="polite"></output>
            <button type="button" data-cut-step="1" aria-label="Más">+</button>
          </div>
        </div>
        <label class="field">Detalle (opcional)
          <input type="text" id="cut-text" placeholder="Ej.: dos dedos de grosor, sin nervio" autocomplete="off">
        </label>
        <button type="button" class="btn" data-cut-add>Añadir a mi lista</button>`}
        ${z.cured ? `<p class="cut-cured"><button type="button" class="link" data-open="${esc(z.cured.fam)}" aria-haspopup="dialog">${esc(z.cured.label)} <span aria-hidden="true">→</span></button></p>` : ''}
      </div>`;
    if (!availabilityNote) renderQty();
    if (reveal) {
      const r = cut.getBoundingClientRect();
      if (r.top < 70 || r.top > innerHeight - 160) cut.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    }
  }

  /* ---------- Eventos ---------- */
  switcher.addEventListener('click', (e) => {
    const b = e.target.closest('[data-animal]');
    if (b) setAnimal(b.dataset.animal);
  });
  fig.addEventListener('click', (e) => {
    const z = e.target.closest('[data-zone]');
    if (z) select(z.dataset.zone, { reveal: true });
  });
  legend.addEventListener('click', (e) => {
    const b = e.target.closest('[data-zone]');
    if (!b) return;
    select(b.dataset.zone, { reveal: true });
    cut.querySelector('#cut-title').focus({ preventScroll: true });
  });

  cut.addEventListener('click', (e) => {
    const u = e.target.closest('[data-cut-unit]');
    if (u && u.dataset.cutUnit !== unit) { unit = u.dataset.cutUnit; qty = units[unit].start; renderQty(); }
    const s = e.target.closest('[data-cut-step]');
    if (s) {
      const k = units[unit];
      qty = Math.min(k.max, Math.max(k.min, qty + Number(s.dataset.cutStep) * k.step));
      renderQty();
    }
    if (e.target.closest('[data-cut-add]') && current) {
      const a = ANIMALS[animal];
      const piece = cut.querySelector('input[name="cut-piece"]:checked').value;
      const breed = cut.querySelector('input[name="cut-breed"]:checked');
      const meat = breed && breed.value !== ADVICE ? `${a.meat} ${breed.value.toLowerCase()}` : a.meat;
      const what = piece === ADVICE ? `${current.name}: que me aconsejen` : (piece === current.name ? piece : `${piece} (${current.name.toLowerCase()})`);
      window.Encargo.add('carnes', [meat, what], cut.querySelector('#cut-text').value.trim(), qty, unit);
      cut.querySelector('#cut-text').value = '';
    }
  });

  setAnimal('vaca', { animate: false });
})();
