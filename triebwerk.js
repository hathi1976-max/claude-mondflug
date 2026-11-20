// ================= Triebwerk: Animation (Handbuch Kap. 13) und Cockpitbild =================
// Vorbild: Haupttriebwerk des Apollo-Servicemoduls (druckgefördert, hypergol, ≈ 91 kN).
const TW = { F: 91000, ve: 3100, m0: 30000, mDry: 15000, zr: 10 }; // zr = Zeitraffer der Animation
TW.mdot = TW.F / TW.ve; // ≈ 29 kg/s
const TW_CX = 110;

// Halbe Innenweite von Brennkammer und Düse in Höhe y (SVG-Koordinaten)
function twHW(y) {
  if (y <= 210) return 26;
  if (y <= 228) { const t = (y - 210) / 18; return 26 - 17 * t * t * (3 - 2 * t); }
  if (y <= 292) { const t = (y - 228) / 64; return 9 + 37 * (1 - (1 - t) ** 2.2); }
  return 46 + (y - 292) * 0.3;
}
// Strömungstempo: langsam in der Kammer, Schall im Hals, schnell am Ende der Glocke
function twSpeed(y) {
  if (y <= 210) return 32;
  if (y <= 228) return 32 + 78 * (y - 210) / 18;
  if (y <= 292) return 110 + 230 * (y - 228) / 64;
  return 340;
}
function twHeat(y) {
  if (y <= 212) return 1;
  if (y <= 292) return 1 - 0.6 * (y - 212) / 80;
  return Math.max(0, 0.4 - (y - 292) / 110);
}
function twCol(h, a) {
  const S_ = [[0, [190, 40, 20]], [0.4, [255, 110, 40]], [0.7, [255, 200, 80]], [1, [255, 250, 225]]];
  let i = 1; while (i < S_.length - 1 && h > S_[i][0]) i++;
  const [h0, c0] = S_[i - 1], [h1, c1] = S_[i], t = Math.max(0, Math.min(1, (h - h0) / (h1 - h0)));
  return `rgba(${c0.map((c, k) => Math.round(c + (c1[k] - c) * t)).join(',')},${a.toFixed(2)})`;
}
function twWall(side, off, y0 = 172, y1 = 292) {
  const p = []; for (let y = y0; y <= y1; y += 2) p.push(`${(TW_CX + side * (twHW(y) + off)).toFixed(1)},${y}`);
  return p;
}

const TW_STEPS = [
  ['bereit', 'Bereit', 'Alles ist still. Links wartet der <b>Brennstoff</b>, rechts der <b>Oxidator</b> – das ist der „Sauerstoff zum Mitnehmen“, denn im All gibt es keine Luft, die ein Feuer füttern könnte. Oben sitzt eine Flasche mit <b>Helium</b> unter riesigem Druck (≈ 280 bar).'],
  ['druck', 'Druck', 'Ein Ventil öffnet die Heliumflasche. Das Helium strömt in beide Tanks und drückt von oben auf die Flüssigkeiten, bis sie unter rund 12 bar stehen. Pumpen braucht dieses Triebwerk nicht: Der Gasdruck schiebt alles nach unten – so wie Luft, die du in eine Wasserflasche pustest.'],
  ['ventile', 'Ventile auf', 'Die beiden Hauptventile öffnen (grün). Brennstoff und Oxidator schießen in den <b>Einspritzkopf</b>, eine Platte voller winziger Löcher wie bei einem Duschkopf. Die feinen Strahlen prallen in der Brennkammer aufeinander und vermischen sich.'],
  ['zuendung', 'Zündung', 'Zündung – ganz ohne Funken! Sobald sich die beiden Flüssigkeiten berühren, entflammen sie von selbst. Solche Stoffpaare heißen <b>hypergol</b>. Es gibt keine Zündkerze, die versagen könnte. Genau das will man bei einem Triebwerk, das die Mannschaft vom Mond zurückbringen muss.'],
  ['brennen', 'Volle Leistung', 'In der Brennkammer herrschen fast <b>3.000 °C</b>. Das heiße Gas kann nur nach unten entweichen: durch den engen <b>Düsenhals</b>, wo es Schallgeschwindigkeit erreicht, und dann durch die <b>Glocke</b>. Dort dehnt es sich aus, kühlt ab und wird dabei immer schneller, bis es mit rund <b>3 km/s</b> davonschießt. Jedes Teilchen, das nach hinten fliegt, schubst das Schiff nach vorn. Schau auf die Beschleunigung: Sie wächst, weil das Schiff leichter wird.'],
  ['schluss', 'Brennschluss', '<b>Brennschluss.</b> Die Hauptventile schließen. Ohne Nachschub erlischt die Flamme in Sekundenbruchteilen, die letzten Gasreste strömen hinaus. Aber das Schiff wird nicht langsamer! Im All bremst nichts, es behält seine neue Geschwindigkeit und gleitet einfach weiter. Mit „Zünden“ springt das Triebwerk wieder an – so oft du willst, solange Treibstoff da ist.'],
];

function twSVG() {
  const cx = TW_CX, L = twWall(-1, 0), R = twWall(1, 0).reverse();
  const lab = (y, x2, a, b) => `<line x1="${x2 + 3}" y1="${y}" x2="198" y2="${y}" stroke="#3a4766" stroke-width=".8"/>
    <text x="201" y="${y + (b ? -1 : 3)}" class="tw-l">${a}</text>${b ? `<text x="201" y="${y + 9}" class="tw-l2">${b}</text>` : ''}`;
  return `<defs>
    <linearGradient id="twGlowG" x1="0" y1="172" x2="0" y2="292" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff8dc"/><stop offset=".35" stop-color="#ffd070"/><stop offset=".55" stop-color="#ff9a3c"/><stop offset="1" stop-color="#c8401c"/></linearGradient>
    <linearGradient id="twPlumeG" x1="0" y1="292" x2="0" y2="340" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ff7a30" stop-opacity=".7"/><stop offset="1" stop-color="#ff4020" stop-opacity="0"/></linearGradient>
    <clipPath id="twClipF"><rect x="31" y="67" width="58" height="78" rx="11"/></clipPath>
    <clipPath id="twClipO"><rect x="131" y="67" width="58" height="78" rx="11"/></clipPath>
    <marker id="twArrH" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#7ee08a"/></marker>
  </defs>
  <text x="8" y="14" class="tw-l2">↑ zum Raumschiff</text>
  <!-- Leitungen -->
  <path d="M${cx},47 V58 H60 V66 M${cx},58 H160 V66" class="tw-pipe"/>
  <path id="twHeF" d="M${cx},47 V58 H60 V66 M${cx},58 H160 V66" class="tw-flow" stroke="#cfe8ff"/>
  <path d="M60,146 V158 H92 V166 M160,146 V158 H128 V166" class="tw-pipe"/>
  <path id="twFuF" d="M60,146 V158 H92 V166" class="tw-flow" stroke="#8fd3ff"/>
  <path id="twOxF" d="M160,146 V158 H128 V166" class="tw-flow" stroke="#e0784a"/>
  <!-- Heliumflasche -->
  <circle cx="${cx}" cy="30" r="15" fill="#1a2440" stroke="#cfe8ff" stroke-width="1.5"/>
  <text x="${cx}" y="34" text-anchor="middle" class="tw-l" fill="#cfe8ff">He</text>
  <text x="130" y="27" class="tw-l">Helium</text><text x="130" y="37" class="tw-l2">≈ 280 bar</text>
  <polygon id="twV0" class="tw-valve" points="${cx - 4},50 ${cx + 4},56 ${cx + 4},50 ${cx - 4},56"/>
  <!-- Tanks -->
  <rect x="30" y="66" width="60" height="80" rx="12" class="tw-tank"/>
  <rect id="twLvF" x="30" y="74" width="60" height="72" fill="#8fd3ff" opacity=".45" clip-path="url(#twClipF)"/>
  <rect x="130" y="66" width="60" height="80" rx="12" class="tw-tank"/>
  <rect id="twLvO" x="130" y="74" width="60" height="72" fill="#e0784a" opacity=".55" clip-path="url(#twClipO)"/>
  <text x="60" y="88" text-anchor="middle" class="tw-l">Brennstoff</text>
  <text x="160" y="88" text-anchor="middle" class="tw-l">Oxidator</text>
  <text id="twPF" x="60" y="138" text-anchor="middle" class="tw-l2">0 bar</text>
  <text id="twPO" x="160" y="138" text-anchor="middle" class="tw-l2">0 bar</text>
  <polygon id="twV1" class="tw-valve" points="71,154 81,162 81,154 71,162"/>
  <polygon id="twV2" class="tw-valve" points="139,154 149,162 149,154 139,162"/>
  <!-- Brennkammer, Düse, Strahl -->
  <polygon id="twPlume" points="" fill="url(#twPlumeG)" opacity="0"/>
  <polygon id="twInner" points="${L.join(' ')} ${R.join(' ')}" fill="url(#twGlowG)" opacity="0"/>
  <g id="twP"></g>
  <circle id="twFlash" cx="${cx}" cy="192" r="34" fill="#fffbe8" opacity="0"/>
  <polyline points="${cx - 29},166 ${twWall(-1, 2.5).join(' ')}" class="tw-wall"/>
  <polyline points="${cx + 29},166 ${twWall(1, 2.5).join(' ')}" class="tw-wall"/>
  <rect x="${cx - 29}" y="165" width="58" height="7" rx="1.5" fill="#5b6b8c"/>
  ${[-20, -12, -4, 4, 12, 20].map(d => `<circle cx="${cx + d}" cy="171.5" r="1.1" fill="#0a1222"/>`).join('')}
  <!-- Beschriftung -->
  ${lab(168, cx + 29, 'Einspritzkopf')}
  ${lab(192, cx + 28.5, 'Brennkammer', 'fast 3.000 °C')}
  ${lab(228, cx + 11.5, 'Düsenhals', 'Schallgeschw.')}
  ${lab(262, cx + twHW(262) + 2.5, 'Glocke', 'Gas wird schneller')}
  ${lab(316, cx + 52, 'Abgasstrahl', '≈ 3 km/s')}
  <!-- Schubpfeil -->
  <line id="twArr" x1="16" y1="300" x2="16" y2="300" stroke="#7ee08a" stroke-width="4" marker-end="url(#twArrH)" opacity="0"/>
  <text id="twArrT" x="12" y="250" class="tw-l" fill="#7ee08a" transform="rotate(-90 12 250)" text-anchor="middle" opacity="0">SCHUB</text>`;
}

function twMount(host) {
  host.innerHTML = `<svg class="tw-svg" viewBox="0 0 284 340" role="img" aria-label="Schnittbild eines Raketentriebwerks">${twSVG()}</svg>
    <ol class="tw-steps">${TW_STEPS.map((s, i) => `<li>${i + 1} · ${s[1]}</li>`).join('')}</ol>
    <div class="tw-btns"><button class="go" data-a="go">▶ Zünden</button><button data-a="step">Schritt für Schritt ›</button>
      <button data-a="off">■ Brennschluss</button><button data-a="reset">⟲ Neu tanken</button></div>
    <div class="tw-num">
      <div><label>Brenndauer</label><b data-n="t">0</b> s</div>
      <div><label>Treibstoff verbraucht</label><b data-n="dm">0</b> kg</div>
      <div><label>Masse Schiff</label><b data-n="m">0</b> kg</div>
      <div><label>Beschleunigung</label><b data-n="a">0</b> m/s²</div>
      <div><label>Δv gewonnen</label><b data-n="dv">0</b> m/s</div>
    </div>
    <p class="tw-note">Zeitraffer ×${TW.zr}. Schiff ${(TW.m0 / 1000)} t beim Start, davon ${(TW.mDry / 1000)} t ohne Treibstoff.</p>
    <p class="tw-text"></p>`;
  const q = s => host.querySelector(s), svg = q('svg'), g = id => svg.querySelector('#' + id);
  const E = { st: 'bereit', tSt: 0, auto: false, p: 0, I: 0, m: TW.m0, tb: 0, parts: [], acc: 0, dash: 0, flash: 0, leer: false };
  const pool = []; const pg = g('twP');
  const set = (st, auto) => {
    E.st = st; E.tSt = 0; if (auto !== undefined) E.auto = auto;
    if (st === 'zuendung') E.flash = 1;
    const i = TW_STEPS.findIndex(s => s[0] === st);
    host.querySelectorAll('.tw-steps li').forEach((li, k) => { li.className = k === i ? 'act' : k < i ? 'done' : ''; });
    q('.tw-text').innerHTML = (E.leer && st === 'schluss' ? '<b>Tanks leer!</b> ' : '') + TW_STEPS[i][2];
    btns();
  };
  const btns = () => {
    const leer = E.m <= TW.mDry + 1, an = ['ventile', 'zuendung', 'brennen'].includes(E.st);
    host.querySelector('[data-a=go]').disabled = an || leer;
    host.querySelector('[data-a=step]').disabled = leer && !an;
    host.querySelector('[data-a=off]').disabled = !an;
  };
  host.querySelector('.tw-btns').onclick = e => {
    const a = e.target.dataset && e.target.dataset.a; if (!a) return;
    if (a === 'go') set(E.p > 11 ? 'ventile' : 'druck', true);
    if (a === 'off') set('schluss', false);
    if (a === 'reset') { Object.assign(E, { p: 0, I: 0, m: TW.m0, tb: 0, leer: false }); set('bereit', false); }
    if (a === 'step') {
      const i = TW_STEPS.findIndex(s => s[0] === E.st);
      set(E.st === 'schluss' ? (E.p > 11 ? 'ventile' : 'druck') : TW_STEPS[i + 1][0], false);
    }
  };
  set('bereit');

  let last = performance.now();
  const ov = document.getElementById('overlay');
  function frame(now) {
    if (!host.isConnected || (ov && ov.classList.contains('hidden'))) return; // Fenster zu: Schleife endet
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    E.tSt += dt;
    if (E.auto) {
      if (E.st === 'druck' && E.tSt > 1.8) set('ventile');
      else if (E.st === 'ventile' && E.tSt > 1.3) set('zuendung');
      else if (E.st === 'zuendung' && E.tSt > 0.9) set('brennen', false);
    }
    const pT = E.st === 'bereit' ? 0 : 12;
    E.p += (pT - E.p) * Math.min(1, dt * (E.st === 'druck' ? 1.8 : 4));
    const voll = E.m > TW.mDry + 1;
    const valves = ['ventile', 'zuendung', 'brennen'].includes(E.st) && voll;
    const IT = valves && (E.st === 'brennen' || (E.st === 'zuendung' && E.tSt > 0.12)) ? 1 : 0;
    E.I += (IT - E.I) * Math.min(1, dt * (IT ? 4 : 9)); if (E.I < 0.003) E.I = 0;
    if (E.I > 0) {
      E.m = Math.max(TW.mDry, E.m - TW.mdot * E.I * dt * TW.zr);
      E.tb += dt * TW.zr * Math.min(1, E.I * 1.2);
      if (E.m <= TW.mDry) { E.leer = true; set('schluss', false); }
    }
    E.flash = Math.max(0, E.flash - dt * 2.5);
    // Teilchen: kalte Tröpfchen vor der Zündung, danach Flammgas
    const flame = E.I > 0.05;
    E.acc += dt * (flame ? 90 * E.I : valves ? 45 : 0);
    while (E.acc >= 1) {
      E.acc -= 1;
      E.parts.push({ u: (Math.random() * 2 - 1) * 0.95, y: 173 + Math.random() * 3, k: flame ? 'g' : Math.random() < 0.5 ? 'f' : 'o', j: Math.random() });
    }
    for (const p of E.parts) p.y += (p.k === 'g' ? twSpeed(p.y) : 26) * dt;
    E.parts = E.parts.filter(p => p.k === 'g' ? p.y < 340 : p.y < 200 && !flame);
    while (pool.length < E.parts.length) { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); pg.appendChild(c); pool.push(c); }
    pool.forEach((c, i) => {
      const p = E.parts[i];
      if (!p) { c.setAttribute('r', 0); return; }
      const x = TW_CX + p.u * twHW(p.y) * 0.92;
      c.setAttribute('cx', x.toFixed(1)); c.setAttribute('cy', p.y.toFixed(1));
      if (p.k === 'g') {
        const h = twHeat(p.y), a = p.y > 292 ? Math.max(0, 1 - (p.y - 292) / 48) : 1;
        c.setAttribute('r', p.y < 228 ? 2.2 : 1.7); c.setAttribute('fill', twCol(h, 0.9 * a));
      } else { c.setAttribute('r', 1.4); c.setAttribute('fill', p.k === 'f' ? '#8fd3ff' : '#e0784a'); }
    });
    // Anzeigen
    const frac = (E.m - TW.mDry) / (TW.m0 - TW.mDry), hL = 72 * frac;
    for (const id of ['twLvF', 'twLvO']) { const r = g(id); r.setAttribute('y', (146 - hL).toFixed(1)); r.setAttribute('height', hL.toFixed(1)); }
    g('twPF').textContent = g('twPO').textContent = `${E.p.toFixed(E.p < 9.95 ? 1 : 0).replace('.', ',')} bar`;
    E.dash += dt * 28;
    g('twHeF').style.opacity = (E.st === 'druck' || (E.I > 0.1)) ? 1 : 0;
    g('twFuF').style.opacity = g('twOxF').style.opacity = valves ? 1 : 0;
    for (const id of ['twHeF', 'twFuF', 'twOxF']) g(id).style.strokeDashoffset = -E.dash;
    g('twV0').setAttribute('class', 'tw-valve' + (E.st !== 'bereit' ? ' on' : ''));
    g('twV1').setAttribute('class', 'tw-valve' + (valves ? ' on' : ''));
    g('twV2').setAttribute('class', 'tw-valve' + (valves ? ' on' : ''));
    const fl = 0.88 + 0.12 * Math.random();
    g('twInner').setAttribute('opacity', (E.I * fl * 0.85).toFixed(2));
    const len = 40 * E.I * (0.85 + 0.3 * Math.random());
    g('twPlume').setAttribute('points', `${TW_CX - 46},292 ${TW_CX + 46},292 ${TW_CX + 46 + len * 0.35},${292 + len} ${TW_CX - 46 - len * 0.35},${292 + len}`);
    g('twPlume').setAttribute('opacity', E.I.toFixed(2));
    g('twFlash').setAttribute('opacity', (E.flash * 0.8).toFixed(2));
    g('twArr').setAttribute('y2', (300 - 110 * E.I).toFixed(1));
    g('twArr').setAttribute('opacity', E.I > 0.03 ? 1 : 0);
    g('twArrT').setAttribute('opacity', E.I > 0.03 ? 1 : 0);
    const nf = (v, d = 0) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
    const n = k => host.querySelector(`[data-n=${k}]`);
    n('t').textContent = nf(E.tb); n('dm').textContent = nf(TW.m0 - E.m); n('m').textContent = nf(E.m);
    n('a').textContent = nf(TW.F * E.I / E.m, 2); n('dv').textContent = nf(TW.ve * Math.log(TW.m0 / E.m));
    btns();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Handbuch: Animation starten, sobald Kapitel 13 gezeigt wird
const _twOpenHB = openHandbook;
openHandbook = function (id) { _twOpenHB(id); const h = document.getElementById('tw13'); if (h) twMount(h); };

// ---------- Kleines Triebwerksbild im Cockpit ----------
const CK = { until: 0 };
(function twCockpit() {
  const lamps = document.querySelector('#cockpit .lamps'); if (!lamps) return;
  const el = document.createElement('div');
  el.className = 'ck-eng'; el.id = 'ckEng'; el.title = 'Wie funktioniert das Triebwerk? (Handbuch Kap. 13)';
  const L = [], R = [];
  for (let y = 8; y <= 40; y += 2) {
    const hw = y <= 18 ? 7 : y <= 24 ? 7 - 4 * (y - 18) / 6 : 3 + 9 * (1 - (1 - (y - 24) / 16) ** 2);
    L.push(`${(20 - hw).toFixed(1)},${y}`); R.unshift(`${(20 + hw).toFixed(1)},${y}`);
  }
  el.innerHTML = `<svg viewBox="0 0 40 60">
      <defs><linearGradient id="ckGl" x1="0" y1="8" x2="0" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fff8dc"/><stop offset=".45" stop-color="#ffb040"/><stop offset="1" stop-color="#ff4020" stop-opacity="0"/></linearGradient></defs>
      <line x1="11" y1="0" x2="11" y2="7" stroke="#3a4766" stroke-width="2"/><line x1="29" y1="0" x2="29" y2="7" stroke="#3a4766" stroke-width="2"/>
      <circle id="ckV1" cx="11" cy="3" r="2.4" fill="#7a2a2a"/><circle id="ckV2" cx="29" cy="3" r="2.4" fill="#7a2a2a"/>
      <polygon id="ckFl" points="" fill="url(#ckGl)" opacity="0"/>
      <polygon points="${L.join(' ')} ${R.join(' ')}" id="ckIn" fill="url(#ckGl)" opacity="0"/>
      <polyline points="${L.join(' ')}" fill="none" stroke="#9fb0d0" stroke-width="1.6"/>
      <polyline points="${R.slice().reverse().join(' ')}" fill="none" stroke="#9fb0d0" stroke-width="1.6"/>
      <line x1="12" y1="8" x2="28" y2="8" stroke="#5b6b8c" stroke-width="2"/>
    </svg>
    <div><label>TRIEBWERK</label><b id="ckEngTxt">AUS</b><i id="ckEngSub"></i></div>`;
  lamps.after(el);
  el.onclick = () => openHandbook('k13');
  let I = 0, last = performance.now();
  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const on = now < CK.until;
    const land = S.land && S.land.run && (S.land.state === 'burn' || S.land.state === 'hover');
    const thr = land ? (S.land.state === 'hover' ? 0.6 : Math.min(1, S.land.f)) : 1;
    const T = on ? thr : 0;
    I += (T - I) * Math.min(1, dt * (T ? 6 : 9)); if (I < 0.01) I = 0;
    el.classList.toggle('on', I > 0.05);
    el.querySelector('#ckV1').setAttribute('fill', on ? '#3fb950' : '#7a2a2a');
    el.querySelector('#ckV2').setAttribute('fill', on ? '#3fb950' : '#7a2a2a');
    el.querySelector('#ckIn').setAttribute('opacity', (I * (0.8 + 0.2 * Math.random())).toFixed(2));
    const len = 18 * I * (0.8 + 0.4 * Math.random());
    el.querySelector('#ckFl').setAttribute('points', `8,40 32,40 ${32 + len * 0.15},${40 + len} ${8 - len * 0.15},${40 + len}`);
    el.querySelector('#ckFl').setAttribute('opacity', I.toFixed(2));
    const lm = isLM(), F = (lm ? LM.F : TW.F) * (on ? thr : 0);
    el.querySelector('#ckEngTxt').textContent = I > 0.05 ? `BRENNT · ${Math.round(F / 1000)} kN` : 'AUS';
    el.querySelector('#ckEngSub').textContent = lm ? 'Abstiegstriebwerk' : 'Haupttriebwerk';
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
// Jede echte Zündung (burn) lässt das Cockpitbild aufleuchten
const _twBurn = burn;
burn = function (dv) {
  const ok = _twBurn(dv);
  if (ok && dv > 0) CK.until = Math.max(CK.until, performance.now() + 1000 * (dv < 3 ? 0.25 : Math.min(3, 0.8 + dv / 400)));
  return ok;
};

// ---------- Handbuch Kapitel 13 ----------
HB.push({ id: 'k13', t: '13 · Wissen: Wie funktioniert ein Raketentriebwerk?', h: `
<p class="hb-lead">Ein Raketentriebwerk ist im Kern ganz einfach: ein Kessel, in dem etwas extrem heiß verbrennt, mit einem einzigen Loch auf einer Seite. Das Gas schießt hinten hinaus – und das Schiff fliegt nach vorn. Hier siehst du das Haupttriebwerk eines Apollo-Raumschiffs im Schnitt. Drück auf <b>Zünden</b> oder geh <b>Schritt für Schritt</b> durch.</p>
<div id="tw13" class="tw"></div>

<h3>Warum fliegt das Schiff überhaupt nach vorn?</h3>
<p>Stell dich mit einem Stapel schwerer Bälle auf ein Skateboard und wirf sie kräftig nach hinten. Bei jedem Wurf rollst du ein Stück nach vorn. Genau das macht die Rakete – nur wirft sie keine Bälle, sondern rund <b>29 Kilogramm Gas pro Sekunde</b>, und zwar mit 3 km/s. Isaac Newton hat das als drittes Gesetz formuliert: <i>Jede Kraft hat eine gleich große Gegenkraft.</i> Das Triebwerk drückt das Gas nach hinten, das Gas drückt das Triebwerk nach vorn.</p>
<div class="hb-box">❓ <b>Aber woran stößt sich die Rakete im All ab? Da ist doch nichts!</b><br>
Sie braucht nichts zum Abstoßen. Auch du auf dem Skateboard stößt dich nicht an der Luft ab, sondern an den Bällen, die du wirfst. Im Vakuum funktioniert ein Triebwerk sogar <i>besser</i> als auf der Erde, weil keine Luft den Abgasstrahl zurückdrückt.</div>

<h3>Die Düse: der Trick mit der Engstelle</h3>
<p>Das Gas in der Brennkammer ist zwar höllisch heiß, aber noch recht langsam. Erst die Düse macht daraus Tempo. Zuerst wird es eng: Im <b>Düsenhals</b> quetscht sich das Gas hindurch und erreicht dort genau Schallgeschwindigkeit. Danach kommt das Verblüffende: In der sich weitenden <b>Glocke</b> wird das Gas nicht langsamer, sondern noch schneller. Es dehnt sich aus, kühlt ab und verwandelt dabei seine Hitze in Bewegung. Diese Düsenform hat der Schwede Gustaf de Laval 1888 für Dampfturbinen erfunden – heute steckt sie in jeder Rakete.</p>
<p>In der Animation siehst du das an den Teilchen: Oben sind sie weiß-gelb und gemütlich, im Hals werden sie schneller, und in der Glocke flitzen sie orange-rot davon.</p>

<h3>Warum Zündung ohne Funken?</h3>
<p>Apollo verbrannte <b>Aerozin 50</b> (eine Art Hydrazin, farblos) mit <b>Distickstofftetroxid</b> (rotbraun). Diese beiden Stoffe sind <b>hypergol</b>: Sie entzünden sich von selbst, sobald sie sich berühren. Keine Zündkerze, kein Funke, nichts, was kaputtgehen kann. Das war lebenswichtig, denn nur dieses eine Triebwerk konnte die Mannschaft aus der Mondumlaufbahn wieder nach Hause bringen. Es gab kein Ersatztriebwerk. Der Haken: Beide Stoffe sind sehr giftig und ätzend. Mit ihnen hantieren nur Fachleute in Schutzanzügen.</p>

<h3>Helium statt Pumpen</h3>
<p>Dieses Triebwerk ist <b>druckgefördert</b>: Helium aus einer Hochdruckflasche schiebt die Flüssigkeiten in die Brennkammer. Helium reagiert mit nichts und ist sehr leicht – perfekt als „Schieber“. Pumpen haben bewegliche Teile, die versagen können, und das wollte man hier vermeiden. Riesenraketen kommen ohne Pumpen nicht aus: Jedes der fünf F-1-Triebwerke der Saturn-V-Mondrakete schluckte rund <b>2,6 Tonnen Treibstoff pro Sekunde</b>. Dafür braucht man Turbopumpen mit der Leistung eines Kraftwerks.</p>

<h3>Was die Zähler unter der Animation zeigen</h3>
<p>Der Schub ist einfach „Masse pro Sekunde mal Ausströmgeschwindigkeit“:</p>
<div class="formel">F = ṁ · v<sub>e</sub> = 29,4 kg/s · 3.100 m/s ≈ 91.000 N</div>
<p>Probier es im Rechenblock: <span class="f">91000/ve</span> ergibt die ≈ 29,4 kg Treibstoff, die jede Sekunde durch die Düse rauschen. Der Schub bleibt die ganze Zeit gleich. Trotzdem steigt die <b>Beschleunigung</b>, weil das Schiff mit jedem Kilogramm leichter wird: a = F / m. Am Ende, mit halb so viel Masse, ist sie doppelt so groß wie am Anfang. Genau deshalb gilt die <span class="link" data-hb="k7">Raketengleichung</span> mit ihrem Logarithmus und nicht einfach „Treibstoff mal irgendwas“.</p>

<div class="hb-box">🛑 <b>Brennschluss heißt nicht Stillstand.</b> Auf der Erde rollt ein Auto aus, wenn du vom Gas gehst, weil Reibung und Luft bremsen. Im All gibt es nichts, was bremst. Nach dem Brennschluss behält das Schiff seine Geschwindigkeit und fliegt weiter. Deshalb dauern die Zündungen in diesem Spiel nur Sekunden bis Minuten – den Rest der Reise gleitet das Schiff.</div>

<h3>🎯 Challenge</h3>
<p>Das 30-Tonnen-Schiff aus der Animation soll 1.000 m/s gewinnen. Wie lange muss das Triebwerk brennen? Tipp: Erst mit der Raketengleichung den verbrauchten Treibstoff ausrechnen, dann durch 29,4 kg/s teilen.</p>
<details><summary>Lösung</summary><p><span class="f">30000*(1-exp(-1000/ve))/(91000/ve)</span> ≈ <b>282 Sekunden</b>, also knapp fünf Minuten. Dabei verbrennen rund 8,3 Tonnen Treibstoff.</p></details>
` });
