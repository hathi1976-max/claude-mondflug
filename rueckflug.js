'use strict';
/* Mondflug – Phase 5 (Landung) und Phase 6 (Rückflug mit Sternnavigation, Navigationsfix, Wiedereintritt).
   Nutzt die globalen Hilfen aus app.js (S, C, LM, SHIP, propagate, startAnim, funk, setTask …). */

const GMOON = C.muM / C.RM ** 2;          // Fallbeschleunigung Mond ≈ 1,626 m/s²
const H_PERI_LAND = 15e3;                 // Ziel-Perilun für den Abstieg
const BRAKE_LOSS = 70;                    // Schwerkraftverluste der automatischen Bremsphase [m/s]
const H0_LAND = 1500;                     // Beginn des Endanflugs [m]

// Rückflug: Erdbahn mit Apogäum am Mond und Perigäum in 40 km Höhe
const RET = {};
(function () {
  const rp = C.RE + 40e3, a = (C.D + rp) / 2;
  RET.vApo = Math.sqrt(C.muE * (2 / C.D - 1 / a));
  RET.vInf = C.nM * C.D - RET.vApo;       // Geschwindigkeit relativ zum Mond beim Verlassen des Einflussbereichs
  RET.re = C.RE + 120e3;                  // Eintrittshöhe
  RET.ve = 10990;                         // Eintrittsgeschwindigkeit (gerundet, wird vorgegeben)
})();
function entryGamma(hpKm) { // Bahnneigungswinkel beim Eintritt (120 km) für eine Vakuum-Perigäumshöhe
  const rp = C.RE + hpKm * 1000, vp = Math.sqrt(RET.ve ** 2 + 2 * C.muE * (1 / rp - 1 / RET.re));
  return deg(Math.acos(Math.min(1, rp * vp / (RET.re * RET.ve))));
}
const vstep = h => -Math.min(12, Math.max(1.5, h / 8)); // geregelte Sinkrate im Schwebeabstieg

// ================= Phase 5a: Abstiegszündung =================
function setupP5() {
  S.phase = 5; phaseTag('Phase 5 · Landung');
  S.veh = 'lm'; S.mLM = LM.m0; S.ideal.lm = 0; S.land = null; S.p = {};
  snapshot();
  const r = S.orbitR || C.RM + 110e3;
  view.mode = 'mond'; view.auto = () => Math.max(3.4 * C.RM, 1.2 * r);
  if (!orbitTok) { const v = Math.sqrt(C.muM / r); ship = { frame: 'M', x: -r, y: 0, vx: 0, vy: -v }; startOrbitLoop(r); }
  tracks = [{ pts: circlePts(r, 0).slice(0, 361), frame: 'M', color: 'rgba(74,222,128,.6)' }];
  markers = [];
  funk('Flugleitung: Landefähre abgekoppelt. Sie haben Freigabe für die Abstiegszündung.');
  const L = S.level, h = (r - C.RM) / 1000;
  let body = `<h2>Phase 5 · Abstiegszündung</h2>
    <p>Die Landefähre hat sich vom Mutterschiff gelöst. Eine kurze Bremszündung senkt den gegenüberliegenden Punkt der Bahn auf <b>15 km</b>.
    Von dort bremst der Bordcomputer die Fähre ab, den Endanflug übernehmen Sie.</p>
    <div class="given"><div><span>Bahnhöhe h<sub>1</sub>${L === 'kommandant' ? ' (Cockpit)' : ''}</span><span>${fmt(h, 1)} km</span></div>
    <div><span>Ziel-Perilun h<sub>2</sub></span><span>15 km</span></div>
    ${L !== 'kommandant' ? `<div><span>Mondradius R<sub>M</sub></span><span>1.737 km</span></div>
    <div><span>μ<sub>M</sub></span><span>4,905·10¹² m³/s²</span></div>` : ''}</div>
    <p><b>Aufgabe:</b> Wie groß ist das Brems-Δv der Abstiegszündung?</p>`;
  if (L === 'kadett') body += `<ol class="steps">
      <li><span class="f">r<sub>1</sub> = R<sub>M</sub> + h<sub>1</sub></span>, <span class="f">r<sub>2</sub> = R<sub>M</sub> + h<sub>2</sub></span> (in Metern)</li>
      <li>Große Halbachse der neuen Bahn: <span class="f">a = (r<sub>1</sub> + r<sub>2</sub>) / 2</span></li>
      <li><span class="f">v<sub>kreis</sub> = √(μ<sub>M</sub> / r<sub>1</sub>)</span> und nach Vis-viva <span class="f">v<sub>neu</sub> = √(μ<sub>M</sub>·(2/r<sub>1</sub> − 1/a))</span></li>
      <li><span class="f">Δv = v<sub>kreis</sub> − v<sub>neu</sub></span></li></ol>`;
  if (L === 'pilot') body += `<p>Hilfe: ${hbLink('k8', 'Kapitel 8 · Landung')} und ${hbLink('k3', 'Kapitel 3 · Vis-viva')}</p>`;
  body += `<div class="warnbox">⚠ 1 m/s Fehler verschiebt das Perilun um gut 4 km. Unter 5 km liegen Kraterränder und Berge, über 30 km reicht der Tank der Fähre nicht.</div>
    <div class="inrow"><label>Brems-Δv</label><input id="in1" inputmode="decimal" autocomplete="off"><span>m/s</span></div>
    <div class="msg-err" id="err"></div>
    <div class="btnrow"><button class="go" id="bFire">ABSTIEGSZÜNDUNG</button></div>`;
  setTask(body);
  $('#bFire').onclick = fireP5;
  $('#in1').onkeydown = e => { if (e.key === 'Enter') fireP5(); };
}
function fireP5() {
  const dv = getInput('#in1');
  if (!Number.isFinite(dv) || dv <= 0) return errMsg('Bitte ein positives Δv in m/s eingeben.');
  if (dv > 300) return errMsg('So stark bremst die Fähre nicht. Prüfen Sie Einheiten und Vorzeichen.');
  if (!burn(dv)) return errMsg(`So viel Treibstoff hat die Fähre nicht. Reserve: ${fmt(dvReserve())} m/s.`);
  const r = S.orbitR, vc = Math.sqrt(C.muM / r), a0 = ship && ship.frame === 'M' ? Math.atan2(ship.y, ship.x) : Math.PI;
  stopOrbitLoop();
  const v = vc - dv, s0 = [r * Math.cos(a0), r * Math.sin(a0), -v * Math.sin(a0), v * Math.cos(a0)];
  const r2 = C.RM + H_PERI_LAND, aT = (r + r2) / 2, ideal = vc - Math.sqrt(C.muM * (2 / r - 1 / aT)), err = dv - ideal;
  const el = elements(...s0, C.muM), hp = el.rp - C.RM;
  let kind = hp < 5e3 ? 'low' : hp > 30e3 ? 'high' : 'ok';
  const t0 = S.met, T = 2 * Math.PI * Math.sqrt(el.a ** 3 / C.muM);
  const res = propagate(s0, t0, {
    acc: accM, tMax: 0.75 * T, dtFn: () => 5,
    stop: (s, t) => Math.hypot(s[0], s[1]) < C.RM ? 'hit' : (t - t0 > 120 && s[0] * s[2] + s[1] * s[3] > 0) ? 'peri' : null,
  });
  tracks.push({ pts: res.pts, frame: 'M', color: '#ffb84d', progressive: true });
  funk(`Abstiegszündung. Delta v ${fmt(dv, 1).replace(',', ' Komma ')} Meter pro Sekunde.`);
  setTask(`<h2>Phase 5 · Abstieg</h2><p>Die Fähre sinkt auf einer halben Ellipse zum Perilun … rund eine Stunde Flug.</p>`);
  const entry = { phase: '5 · Abstiegszündung', gesucht: 'Brems-Δv', eingabe: dv, richtig: ideal, einheit: 'm/s', kap: 'k8' };
  startAnim({
    pts: res.pts, frame: 'M', warp: (res.t - t0) / 6,
    onDone: () => {
      const p = res.pts.at(-1);
      if (kind === 'low' || res.stop === 'hit') {
        markers.push({ frame: 'M', x: p.x, y: p.y, label: 'Aufschlag' });
        entry.folge = `Perilun ${fmt(hp / 1000, 1)} km – Aufschlag`; addLog(entry);
        funk('Flugleitung: Kontakt zur Fähre verloren.');
        return failCard('Aufschlag im Gebirge', `Sie haben ${fmt(err, 1)} m/s zu stark gebremst. Das Perilun lag nur ${fmt(hp / 1000, 1)} km hoch, die Fähre streift einen Kraterrand.`, 'k8', setupP5);
      }
      if (kind === 'high') {
        entry.folge = `Perilun ${fmt(hp / 1000, 1)} km – zu hoch`; addLog(entry);
        funk('Flugleitung: Abbruch. Perilun zu hoch für die Landung.');
        return failCard('Perilun zu hoch', `Sie haben ${fmt(-err, 1)} m/s zu schwach gebremst. Das Perilun liegt ${fmt(hp / 1000, 1)} km hoch. Von dort reicht der Tank der Fähre nicht bis zur Oberfläche.`, 'k8', setupP5);
      }
      const cost = Math.abs(err) < 0.3 ? 0 : Math.abs(err) + Math.max(0, -err);
      const vPeri = Math.sqrt(C.muM * (2 / el.rp - 1 / el.a));
      const vPeriIdeal = Math.sqrt(C.muM * (2 / r2 - 1 / aT));
      if (!burn(cost) || !burn(vPeri + BRAKE_LOSS)) {
        entry.folge = 'Treibstoff der Fähre reicht nicht'; addLog(entry);
        return failCard('Tank der Fähre leer', 'Bremsphase und Korrektur übersteigen den Tank der Landefähre.', 'k7', setupP5);
      }
      S.met = res.t + 600;
      entry.folge = cost ? `Perilun ${fmt(hp / 1000, 1)} km, Korrektur ${fmt(cost, 1)} m/s` : 'Perilun getroffen'; entry.kosten = cost; addLog(entry);
      S.ideal.lm += ideal + vPeriIdeal + BRAKE_LOSS;
      funk('Flugleitung: Bremsphase beendet. Höhe 1500 Meter. Übernehmen Sie den Endanflug.');
      setTask(`<h2 class="ok">✔ Abstieg läuft</h2>
        ${resultTable([['Ihr Brems-Δv', fmt(dv, 2) + ' m/s'], ['Richtiges Δv', fmt(ideal, 2) + ' m/s'], ['Perilun', fmt(hp / 1000, 1) + ' km'],
        ['Korrektur', cost ? fmt(cost, 1) + ' m/s' : 'keine'], ['Automatische Bremsphase', fmt(vPeri + BRAKE_LOSS) + ' m/s'], ['Δv-Reserve Fähre', fmt(dvReserve()) + ' m/s']])}
        <p>Lösungsweg: a = (${fmt(r / 1000, 1)} + ${fmt(r2 / 1000, 1)}) / 2 = ${fmt(aT / 1000, 2)} km; v<sub>kreis</sub> = ${fmt(vc, 2)} m/s;
        v<sub>neu</sub> = √(μ<sub>M</sub>·(2/r<sub>1</sub> − 1/a)) = ${fmt(vc - ideal, 2)} m/s; Δv = ${fmt(ideal, 2)} m/s.</p>
        <div class="btnrow"><button class="primary" id="bNext">Weiter zum Endanflug</button></div>`);
      $('#bNext').onclick = setupP5b;
    },
  });
}

// ================= Phase 5b: Endanflug =================
function setupP5b() {
  S.phase = 5; phaseTag('Phase 5 · Endanflug'); S.p = {};
  stopOrbitLoop(); ship = null; tracks = []; markers = [];
  snapshot();
  const v0 = 30 + Math.floor(Math.random() * 21), m0 = S.mLM;
  const hStar = (v0 ** 2 + 2 * GMOON * H0_LAND) * m0 / (2 * LM.F);
  const aNet = LM.F / m0 - GMOON, vI = Math.sqrt(v0 ** 2 + 2 * GMOON * (H0_LAND - hStar));
  const radar = !!(S.stoer && S.stoer.radar), hA = H0_LAND + 2 * v0 - 0.5 * GMOON * 4;
  S.land = { h: H0_LAND, v: -v0, v0, m0, hStar, idealDv: LM.F / m0 * vI / aNet, hi: null, f: 0, state: 'wait', run: false, dvFinal: 0, radar };
  view.mode = 'lande'; view.auto = null;
  const L = S.level;
  if (radar) { S.p.hb = 'k11'; funk('Master Alarm! Landeradar: Geschwindigkeitskanal ausgefallen. Nur die Höhe wird noch gemessen.'); }
  let body = `<h2>Phase 5 · Endanflug</h2>
    <p>Die Fähre fällt senkrecht auf das Landegebiet zu. Das Triebwerk läuft mit vollem Schub, sobald es zündet.
    Zünden Sie zu früh, verschwenden Sie Treibstoff im Schwebeflug. Zünden Sie zu spät, schlagen Sie auf.</p>
    <div class="given"><div><span>Höhe h<sub>0</sub></span><span>${fmt(H0_LAND)} m</span></div>
    ${radar ? `<div><span>Höhe 2,0 s vorher h<sub>a</sub></span><span>${fmt(hA, 2)} m</span></div>
    <div><span>Sinkrate v<sub>0</sub></span><span class="bad">Radar gestört</span></div>`
    : `<div><span>Sinkrate v<sub>0</sub></span><span>${fmt(v0)} m/s</span></div>`}
    <div><span>Masse der Fähre m</span><span>${fmt(m0)} kg</span></div>
    ${L !== 'kommandant' ? `<div><span>Schub F</span><span>26.000 N</span></div>
    <div><span>Fallbeschleunigung g<sub>M</sub></span><span>1,626 m/s²</span></div>` : ''}</div>
    <p><b>Aufgabe:</b> In welcher Höhe muss das Triebwerk zünden, damit die Fähre genau am Boden zum Stehen kommt?</p>`;
  if (radar) body += `<div class="warnbox">⚠ <b>Störfall:</b> Das Radar misst keine Geschwindigkeit mehr. Bestimmen Sie v<sub>0</sub> zuerst aus den zwei Höhenmessungen im Abstand Δt = 2,0 s (freier Fall).</div>`;
  if (radar && L === 'kadett') body += `<ol class="steps"><li>Freier Fall rückwärts: <span class="f">h<sub>a</sub> = h<sub>0</sub> + v<sub>0</sub>·Δt − ½·g<sub>M</sub>·Δt²</span></li>
      <li>Umgestellt: <span class="f">v<sub>0</sub> = (h<sub>a</sub> − h<sub>0</sub>)/Δt + g<sub>M</sub>·Δt/2</span></li></ol>`;
  if (radar && L === 'pilot') body += `<p>Hilfe: ${hbLink('k11', 'Kapitel 11 · Störfälle')}</p>`;
  if (L === 'kadett') body += `<ol class="steps">
      <li>Energiebilanz: Die Arbeit des Triebwerks vernichtet Bewegungs- und Lageenergie: <span class="f">F·h = ½·m·v<sub>0</sub>² + m·g<sub>M</sub>·h<sub>0</sub></span></li>
      <li>Umgestellt: <span class="f">h = m·(v<sub>0</sub>² + 2·g<sub>M</sub>·h<sub>0</sub>) / (2·F)</span></li></ol>`;
  if (L === 'pilot') body += `<p>Hilfe: ${hbLink('k8', 'Kapitel 8 · Landung')}</p>`;
  body += `<div class="warnbox">⚠ Weich ist eine Landung bis 3 m/s. Das Triebwerk regelt nur zwischen 90 % und 110 % Nennschub.</div>
    ${radar ? `<div class="inrow"><label>Sinkrate v<sub>0</sub></label><input id="in0" inputmode="decimal" autocomplete="off"><span>m/s</span></div>` : ''}
    <div class="inrow"><label>Zündhöhe</label><input id="in1" inputmode="decimal" autocomplete="off"><span>m</span></div>
    <div class="msg-err" id="err"></div>
    <div class="btnrow"><button class="go" id="bFire">ENDANFLUG STARTEN</button></div>`;
  setTask(body);
  $('#bFire').onclick = fireP5b;
  $('#in1').onkeydown = e => { if (e.key === 'Enter') fireP5b(); };
}
function fireP5b() {
  const L = S.land, hi = getInput('#in1');
  if (L.radar) {
    const v0e = getInput('#in0');
    if (!Number.isFinite(v0e) || v0e <= 0) return errMsg('Bitte zuerst die berechnete Sinkrate v₀ in m/s eingeben.');
    L.v0In = v0e;
  }
  if (!Number.isFinite(hi) || hi <= 0) return errMsg('Bitte eine positive Höhe in Metern eingeben.');
  const hIgn = Math.min(hi, H0_LAND);
  const vI2 = L.v0 ** 2 + 2 * GMOON * (H0_LAND - hIgn);
  const fReq = (vI2 / (2 * hIgn) + GMOON) * L.m0 / LM.F;
  Object.assign(L, { hi, hIgn, f: Math.min(1.1, Math.max(0.9, fReq)), fReq, state: 'fall', run: true });
  funk(`Endanflug. Zündung bei ${Math.round(hi)} Metern programmiert.`);
  setTask(`<h2>Phase 5 · Endanflug</h2><p>Zündhöhe ${fmt(hi)} m programmiert. Die Fähre fällt …</p>
    <p class="muted">Höhe und Sinkrate zeigt das Cockpit.</p>`);
}
function stepLanding(dt) {
  const L = S.land; let T = dt * 3 * S.speed;
  S.met += T;
  while (T > 1e-9 && L.run) {
    const st = Math.min(0.01, T); T -= st;
    if (L.state === 'fall' && L.h <= L.hIgn) {
      L.state = 'burn';
      funk(L.fReq > 1.1 ? 'Zündung! Schub am Anschlag, das reicht nicht!' : 'Zündung Abstiegstriebwerk.');
    }
    if (L.state === 'hover') {
      if (!burn(GMOON * st)) { L.state = 'empty'; funk('Treibstoff leer!'); }
      else { L.dvFinal += GMOON * st; L.v = vstep(L.h); L.h += L.v * st; }
    } else {
      let a = -GMOON;
      if (L.state === 'burn') {
        const d = L.f * LM.F / L.m0 * st;
        if (!burn(d)) { L.state = 'empty'; funk('Treibstoff leer!'); }
        else { a += L.f * LM.F / L.m0; L.dvFinal += d; }
      }
      L.v += a * st; L.h += L.v * st;
      if (L.state === 'burn' && L.v > vstep(L.h)) L.state = 'hover';
    }
    if (L.h <= 0) { L.h = 0; L.run = false; L.vTouch = -L.v; touchdown(); }
  }
}
function touchdown() {
  const L = S.land, vt = L.vTouch;
  const entry = { phase: '5 · Endanflug', gesucht: 'Zündhöhe', eingabe: L.hi, richtig: L.hStar, einheit: 'm', kap: 'k8' };
  if (vt > 5) {
    const wasEmpty = L.state === 'empty';
    L.state = 'crash';
    entry.folge = `Aufschlag mit ${fmt(vt, 1)} m/s`; addLog(entry);
    funk('Flugleitung: Kein Signal von der Fähre.');
    const why = wasEmpty ? 'Der Tank war leer.' : L.hi < L.hStar
      ? `Sie haben ${fmt(L.hStar - L.hi)} m zu spät gezündet. Selbst mit ${fmt(L.f * 100)} % Schub reichte die Bremsstrecke nicht.`
      : 'Der Treibstoff reichte nicht bis zum Boden.';
    return failCard('Harter Aufschlag', `Die Fähre traf mit ${fmt(vt, 1)} m/s auf. ${why}`, 'k8', setupP5b);
  }
  L.state = 'landed';
  S.ideal.lm += L.idealDv;
  S.lmExtra = (LM.dvStart - dvReserve()) - S.ideal.lm;
  const hard = vt > 3;
  entry.folge = `${hard ? 'harte' : 'weiche'} Landung mit ${fmt(vt, 1)} m/s, Endanflug ${fmt(L.dvFinal)} m/s`; entry.kosten = L.dvFinal - L.idealDv; addLog(entry);
  S.vTouch = vt;
  const radarOk = L.radar && Math.abs(L.v0In - L.v0) < 0.3;
  if (L.radar) {
    addLog({ phase: '5 · Störfall Radar', gesucht: 'Sinkrate v₀', eingabe: L.v0In, richtig: L.v0, einheit: 'm/s', kap: 'k11',
      folge: radarOk ? 'Sinkrate richtig bestimmt' : `um ${fmt(L.v0In - L.v0, 2)} m/s daneben` });
    if (radarOk) stoerGeschafft('Landeradar ausgefallen');
  }
  funk(hard ? 'Aufgesetzt. Etwas hart, aber die Fähre steht.' : 'Flugleitung an Kommandant: Aufsetzen bestätigt. Der Adler ist gelandet.',
    hard ? undefined : 'Flugleitung an Kommandant: Aufsetzen bestätigt.');
  setTask(`<h2 class="ok">✔ ${hard ? 'Gelandet (hart)' : 'Weich gelandet'}</h2>
    ${resultTable([['Ihre Zündhöhe', fmt(L.hi) + ' m'], ['Richtige Zündhöhe', fmt(L.hStar) + ' m'], ['Aufsetzgeschwindigkeit', fmt(vt, 1) + ' m/s'],
    ['Δv Endanflug', fmt(L.dvFinal) + ' m/s'], ['Bestwert', fmt(L.idealDv) + ' m/s'], ['Mehrverbrauch Fähre gesamt', fmt(Math.max(0, S.lmExtra)) + ' m/s'], ['Δv-Reserve Fähre', fmt(dvReserve()) + ' m/s']])}
    ${L.radar ? `<p>Sinkrate aus den Höhenmessungen: v<sub>0</sub> = (h<sub>a</sub> − h<sub>0</sub>)/2 + g<sub>M</sub> = ${fmt(L.v0, 2)} m/s.
      Ihr Wert: ${fmt(L.v0In, 2)} m/s – ${radarOk ? '<span class="ok">Störfall gemeistert.</span>' : '<span class="bad">nicht genau genug, das Triebwerk hat den Fehler mit seiner Schubreserve aufgefangen.</span>'}</p>` : ''}
    <p>Lösungsweg: h = m·(v<sub>0</sub>² + 2·g·h<sub>0</sub>)/(2F) = ${fmt(L.m0)}·(${fmt(L.v0 ** 2)} + ${fmt(2 * GMOON * H0_LAND, 1)})/52.000 = ${fmt(L.hStar)} m.</p>
    ${hard ? '<p>Über 3 m/s staucht sich das Fahrwerk. Die Besatzung ist unverletzt.</p>' : ''}
    <p>Nach 21 Stunden auf dem Mond startet die Aufstiegsstufe automatisch und koppelt am Mutterschiff an.</p>
    <div class="btnrow"><button class="primary" id="bNext">Weiter zu Phase 6 · Rückflug</button></div>`);
  $('#bNext').onclick = () => { S.met += 21 * 3600; setupP6(); };
}

// ================= Zeichnen: Landung =================
function drawLanding() {
  const L = S.land; if (!L) return;
  const gY = H * 0.84, top = H * 0.1, Hmax = 1700;
  const yOf = h => gY - (gY - top) * Math.max(0, Math.min(h, Hmax)) / Hmax;
  // Erde am Himmel
  const ex = W * 0.82, ey = H * 0.17, er = Math.max(10, Math.min(W, H) * 0.035);
  const g = ctx.createRadialGradient(ex - er * .4, ey - er * .4, er * .1, ex, ey, er);
  g.addColorStop(0, '#7cc4ff'); g.addColorStop(.6, '#1d5fbf'); g.addColorStop(1, '#0b2a5c');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, ey, er, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = 'rgba(2,4,10,.75)'; ctx.beginPath(); ctx.arc(ex + er * .45, ey, er, -Math.PI / 2, Math.PI / 2); ctx.fill();
  // Boden mit Kratern
  const gg = ctx.createLinearGradient(0, gY, 0, H); gg.addColorStop(0, '#6b6b70'); gg.addColorStop(1, '#2c2c30');
  ctx.fillStyle = gg; ctx.fillRect(0, gY, W, H - gY);
  for (let i = 0; i < 16; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * W, d = 0.15 + ((Math.sin(i * 78.233) * 12345.678 % 1 + 1) % 1) * 0.8;
    const y = gY + 6 + d * (H - gY - 10), rw = 8 + d * 26;
    if (Math.abs(x - W * 0.55) < rw + 30 && d < 0.4) continue;
    ctx.fillStyle = 'rgba(30,30,34,.55)'; ctx.beginPath(); ctx.ellipse(x, y, rw, rw * 0.28, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = 'rgba(160,160,165,.35)'; ctx.beginPath(); ctx.ellipse(x, y - 1, rw, rw * 0.28, 0, Math.PI, 2 * Math.PI); ctx.stroke();
  }
  // Höhenlineal
  const rx = Math.max(46, W * 0.1);
  ctx.strokeStyle = '#8494b4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(rx, top); ctx.lineTo(rx, gY); ctx.stroke();
  ctx.fillStyle = '#8494b4'; ctx.font = '11px system-ui'; ctx.textAlign = 'right';
  for (let h = 0; h <= Hmax; h += 250) { const y = yOf(h); ctx.beginPath(); ctx.moveTo(rx - 5, y); ctx.lineTo(rx, y); ctx.stroke(); ctx.fillText(`${fmt(h)} m`, rx - 8, y + 4); }
  ctx.textAlign = 'left';
  if (L.hi) {
    const y = yOf(L.hIgn);
    ctx.strokeStyle = 'rgba(255,184,77,.7)'; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(rx, y); ctx.lineTo(W - 20, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ffb84d'; ctx.fillText(`Zündung ${fmt(L.hi)} m`, rx + 8, y - 6);
  }
  // Fähre
  const lx = W * 0.55, ly = yOf(L.h), s = Math.max(0.8, Math.min(1.4, H / 520));
  ctx.save(); ctx.translate(lx, ly); ctx.scale(s, s);
  if (L.state === 'crash') {
    ctx.strokeStyle = '#ff5f5f'; ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 6, -8 + Math.sin(a) * 6); ctx.lineTo(Math.cos(a) * 24, -8 + Math.sin(a) * 24); ctx.stroke(); }
  } else {
    const thr = L.state === 'burn' ? L.f : L.state === 'hover' ? 0.45 : 0;
    if (thr > 0 && L.run) {
      const fl = 10 + 34 * thr * (0.85 + 0.3 * Math.random());
      const fg = ctx.createLinearGradient(0, -6, 0, -6 + fl); fg.addColorStop(0, '#fff3c4'); fg.addColorStop(.4, '#ffb84d'); fg.addColorStop(1, 'rgba(255,95,95,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, -6); ctx.lineTo(0, -6 + fl); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#c9c9c9'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-10, -14); ctx.lineTo(-20, 0); ctx.moveTo(10, -14); ctx.lineTo(20, 0); ctx.moveTo(-24, 0); ctx.lineTo(-16, 0); ctx.moveTo(16, 0); ctx.lineTo(24, 0); ctx.stroke();
    ctx.fillStyle = '#d4a017'; ctx.fillRect(-14, -22, 28, 12);
    ctx.fillStyle = '#b8b8b8'; ctx.beginPath(); ctx.moveTo(-11, -22); ctx.lineTo(-8, -38); ctx.lineTo(8, -38); ctx.lineTo(11, -22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1b2333'; ctx.fillRect(-4, -34, 8, 5);
    ctx.fillStyle = '#555'; ctx.fillRect(-5, -10, 10, 4);
  }
  ctx.restore();
  // Anzeigen
  ctx.fillStyle = '#e6edf7'; ctx.font = 'bold 14px system-ui';
  const tx = W - Math.min(230, W * 0.42);
  ctx.fillText(`Höhe      ${fmt(Math.max(0, L.h))} m`, tx, H * 0.34);
  ctx.fillText(`Sinkrate  ${radarBlind() ? '— (Radar)' : fmt(Math.max(0, -L.v), 1) + ' m/s'}`, tx, H * 0.34 + 20);
  const thrTxt = L.state === 'burn' ? `${fmt(L.f * 100)} %` : L.state === 'hover' ? 'Schwebeflug' : L.state === 'empty' ? 'Tank leer' : 'aus';
  ctx.fillText(`Schub      ${thrTxt}`, tx, H * 0.34 + 40);
  if (L.state === 'landed') { ctx.fillStyle = '#4ade80'; ctx.fillText(`Aufgesetzt mit ${fmt(L.vTouch, 1)} m/s`, tx, H * 0.34 + 64); }
  if (L.state === 'crash') { ctx.fillStyle = '#ff5f5f'; ctx.fillText(`Aufschlag mit ${fmt(L.vTouch, 1)} m/s`, tx, H * 0.34 + 64); }
}
function radarBlind() { const L = S.land; return !!(L && L.radar && (L.state === 'wait' || L.state === 'fall')); }
function landCockpit() {
  const L = S.land;
  $('#iRef').textContent = 'Mond';
  $('#iAlt').textContent = fmt(Math.max(0, L.h)); $('#iAlt').nextElementSibling.textContent = 'm';
  $('#iVel').textContent = radarBlind() ? '—' : fmt(Math.max(0, -L.v), 1);
  $('#iDE').textContent = '—'; $('#iDM').textContent = fmt((C.RM + L.h) / 1000, 1);
  $('#lPeri').textContent = 'Perilun (Höhe)'; $('#lApo').textContent = 'Apolun (Höhe)';
  $('#iPeri').textContent = '—'; $('#iApo').textContent = '—'; $('#iPhase').textContent = '—';
  ['#wAtmo', '#wHit', '#wEsc'].forEach(id => $(id).classList.remove('on'));
}

// ================= Phase 6a: Sternnavigation =================
const NAVSTARS = [
  ['Sirius', 101.287, -16.716], ['Canopus', 95.988, -52.696], ['Arktur', 213.915, 19.182], ['Wega', 279.234, 38.784],
  ['Kapella', 79.172, 45.998], ['Rigel', 78.634, -8.202], ['Prokyon', 114.825, 5.225], ['Beteigeuze', 88.793, 7.407],
  ['Altair', 297.696, 8.868], ['Aldebaran', 68.980, 16.509], ['Antares', 247.352, -26.432], ['Spica', 201.298, -11.161],
  ['Pollux', 116.329, 28.026], ['Deneb', 310.358, 45.280], ['Regulus', 152.093, 11.967], ['Fomalhaut', 344.413, -29.622],
  ['Achernar', 24.429, -57.237], ['Polaris', 37.955, 89.264], ['Acrux', 186.650, -63.099], ['Kastor', 113.650, 31.888],
  ['Bellatrix', 81.283, 6.350], ['Denebola', 177.265, 14.572], ['Navi', 14.177, 60.717],
];
const starVec = i => { const a = rad(NAVSTARS[i][1]), d = rad(NAVSTARS[i][2]); return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]; };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const starSep = (i, j) => deg(Math.acos(Math.max(-1, Math.min(1, dot3(starVec(i), starVec(j))))));
const raStr = i => `${fmt(NAVSTARS[i][1] / 15, 3)} h`, decStr = i => `${NAVSTARS[i][2] >= 0 ? '+' : '−'}${fmt(Math.abs(NAVSTARS[i][2]), 3)}°`;

function setupP6() {
  S.phase = 6; phaseTag('Phase 6 · Sternnavigation');
  S.veh = 'csm'; S.land = null; S.p = { hb: 'k9', navErr: 0, blind: true };
  stopOrbitLoop(); ship = null; tracks = []; markers = [];
  snapshot();
  const n = NAVSTARS.length, rnd = () => Math.floor(Math.random() * n);
  let A, B, s0;
  do { A = rnd(); B = rnd(); s0 = A === B ? 0 : starSep(A, B); } while (A === B || s0 < 20 || s0 > 80);
  const pairs = [[A, B, s0]], key = (i, j) => [i, j].sort((x, y) => x - y).join('-'), used = new Set([key(A, B)]);
  for (let k = 0; k < 20000 && pairs.length < 3; k++) {
    const i = rnd(), j = rnd(); if (i === j || used.has(key(i, j))) continue;
    const s = starSep(i, j), d = Math.abs(s - s0);
    if (s < 15 || s > 90 || d < 1.5 || d > 8 || pairs.some(p => Math.abs(p[2] - s) < 1.5)) continue;
    pairs.push([i, j, s]); used.add(key(i, j));
  }
  pairs.sort(() => Math.random() - 0.5);
  const c = starVec(A).map((x, k) => x + starVec(B)[k]), cn = Math.hypot(...c);
  S.p.sext = { A, B, s0, pairs, c: c.map(x => x / cn) };
  view.mode = 'stern'; view.auto = null;
  funk('Flugleitung: Vor der Rückkehrzündung muss die Bordplattform neu ausgerichtet werden. Messen Sie zwei Leitsterne an.');
  const L = S.level;
  let body = `<h2>Phase 6 · Plattform ausrichten</h2>
    <p>Die Kreiselplattform ist nach Tagen im All verdriftet. Der Sextant hat zwei helle Sterne A und B erfasst und misst ihren Winkelabstand.
    Welches Sternpaar ist es? Die Sternkarte liefert die Positionen (Rektaszension α, Deklination δ).</p>
    <div class="given"><div><span>Gemessener Winkel A–B</span><span>${fmt(s0, 2)}°</span></div></div>
    <div class="pairs">${pairs.map((p, k) => `<label class="pair"><input type="radio" name="pair" value="${k}">
      <span><b>Paar ${k + 1}:</b> ${NAVSTARS[p[0]][0]} (α ${raStr(p[0])}, δ ${decStr(p[0])}) – ${NAVSTARS[p[1]][0]} (α ${raStr(p[1])}, δ ${decStr(p[1])})</span></label>`).join('')}</div>
    <p><b>Aufgabe:</b> Berechnen Sie die Winkelabstände der Paare, wählen Sie das passende und geben Sie seinen berechneten Winkel ein.</p>`;
  if (L === 'kadett') body += `<ol class="steps"><li>Stunden in Grad: <span class="f">α[°] = α[h] · 15</span></li>
      <li><span class="f">cos d = sin δ<sub>1</sub>·sin δ<sub>2</sub> + cos δ<sub>1</sub>·cos δ<sub>2</sub>·cos(α<sub>1</sub> − α<sub>2</sub>)</span></li>
      <li><span class="f">d = acos(…)</span>. Der Rechenblock rechnet sin, cos und acos in Grad.</li></ol>`;
  if (L === 'pilot') body += `<p>Hilfe: ${hbLink('k9', 'Kapitel 9 · Sternnavigation')}</p>`;
  body += `<div class="inrow"><label>Winkelabstand</label><input id="in1" inputmode="decimal" autocomplete="off"><span>°</span></div>
    <div class="msg-err" id="err"></div>
    <div class="btnrow"><button class="go" id="bFire">PLATTFORM AUSRICHTEN</button></div>`;
  setTask(body);
  $('#bFire').onclick = fireP6;
  $('#in1').onkeydown = e => { if (e.key === 'Enter') fireP6(); };
}
function fireP6() {
  const X = S.p.sext, sel = document.querySelector('input[name="pair"]:checked'), d = getInput('#in1');
  if (!sel) return errMsg('Bitte ein Sternpaar wählen.');
  if (!Number.isFinite(d)) return errMsg('Bitte den berechneten Winkel in Grad eingeben.');
  const p = X.pairs[+sel.value];
  if (Math.abs(d - p[2]) > 0.3) return errMsg('Ihr Winkel passt nicht zu diesem Paar. Rechnung prüfen (Stunden in Grad? Rechner in Grad?).');
  const ok = p[0] === X.A && p[1] === X.B;
  const entry = { phase: '6 · Sternnavigation', gesucht: 'Leitsternpaar', eingabe: `${NAVSTARS[p[0]][0]}–${NAVSTARS[p[1]][0]} (${fmt(d, 2)}°)`,
    richtig: `${NAVSTARS[X.A][0]}–${NAVSTARS[X.B][0]} (${fmt(X.s0, 2)}°)`, einheit: '°', kap: 'k9' };
  if (!ok) {
    entry.folge = 'falsches Paar – Plattform falsch ausgerichtet'; addLog(entry);
    funk('Flugleitung: Negativ. Ihre Plattform zeigt in die falsche Richtung.');
    return failCard('Plattform falsch ausgerichtet', `Das Paar ${NAVSTARS[p[0]][0]}–${NAVSTARS[p[1]][0]} hat ${fmt(p[2], 2)}° Abstand, gemessen wurden aber ${fmt(X.s0, 2)}°.
      Mit dieser Ausrichtung würde die Rückkehrzündung in die falsche Richtung gehen.`, 'k9', setupP6);
  }
  entry.folge = 'Plattform ausgerichtet'; addLog(entry);
  funk(`Plattform ausgerichtet auf ${NAVSTARS[X.A][0]} und ${NAVSTARS[X.B][0]}. Gute Arbeit.`);
  setTask(`<h2 class="ok">✔ Plattform ausgerichtet</h2>
    ${resultTable([['Leitsterne', `${NAVSTARS[X.A][0]} und ${NAVSTARS[X.B][0]}`], ['Gemessen', fmt(X.s0, 2) + '°'], ['Ihre Rechnung', fmt(d, 2) + '°']])}
    <p>Zum Vergleich: ${X.pairs.map(q => `${NAVSTARS[q[0]][0]}–${NAVSTARS[q[1]][0]} ${fmt(q[2], 2)}°`).join(' · ')}</p>
    <div class="btnrow"><button class="primary" id="bNext">Weiter: Zündung zur Erde</button></div>`);
  $('#bNext').onclick = setupP6b;
}
function drawSextant() {
  const X = S.p.sext; if (!X) return;
  const c = X.c, z = Math.abs(c[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  let e1 = [z[1] * c[2] - z[2] * c[1], z[2] * c[0] - z[0] * c[2], z[0] * c[1] - z[1] * c[0]];
  const n1 = Math.hypot(...e1); e1 = e1.map(x => x / n1);
  const e2 = [c[1] * e1[2] - c[2] * e1[1], c[2] * e1[0] - c[0] * e1[2], c[0] * e1[1] - c[1] * e1[0]];
  const thMax = Math.max(50, X.s0 / 2 + 15), R = Math.min(W, H) * 0.42, cx = W / 2, cy = H / 2 + 8;
  const proj = v => {
    const th = deg(Math.acos(Math.max(-1, Math.min(1, dot3(v, c)))));
    if (th > thMax) return null;
    const px = dot3(v, e1), py = dot3(v, e2), q = Math.hypot(px, py) || 1;
    return [cx - th / thMax * R * px / q, cy - th / thMax * R * py / q];
  };
  ctx.fillStyle = '#01030a'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = 'rgba(103,232,249,.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
  for (const f of [1 / 3, 2 / 3]) { ctx.setLineDash([2, 6]); ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, 2 * Math.PI); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
  // Hintergrundsterne (deterministisch)
  for (let i = 0; i < 400; i++) {
    const u = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1, w = (Math.sin(i * 78.233) * 24634.6345 % 1 + 1) % 1;
    const zz = 2 * u - 1, ph = 2 * Math.PI * w, rr = Math.sqrt(1 - zz * zz), p = proj([rr * Math.cos(ph), rr * Math.sin(ph), zz]);
    if (p) { ctx.fillStyle = `rgba(200,210,235,${0.2 + 0.4 * ((i * 7) % 10) / 10})`; ctx.fillRect(p[0], p[1], 1, 1); }
  }
  NAVSTARS.forEach((s, i) => {
    const p = proj(starVec(i)); if (!p) return;
    ctx.fillStyle = '#e6edf7'; ctx.beginPath(); ctx.arc(p[0], p[1], i === X.A || i === X.B ? 3.2 : 2.2, 0, 2 * Math.PI); ctx.fill();
  });
  const pa = proj(starVec(X.A)), pb = proj(starVec(X.B));
  if (pa && pb) {
    ctx.strokeStyle = '#ffb84d'; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = 2;
    for (const [p, l] of [[pa, 'A'], [pb, 'B']]) {
      ctx.beginPath(); ctx.arc(p[0], p[1], 11, 0, 2 * Math.PI); ctx.stroke();
      ctx.fillStyle = '#ffb84d'; ctx.font = 'bold 14px system-ui'; ctx.fillText(l, p[0] + 14, p[1] - 10);
    }
    ctx.font = 'bold 13px system-ui'; ctx.fillText(`${fmt(X.s0, 2)}°`, (pa[0] + pb[0]) / 2 + 8, (pa[1] + pb[1]) / 2 + 18);
  }
  ctx.fillStyle = '#67e8f9'; ctx.font = '12px system-ui'; ctx.fillText('SEXTANT · Bildfeld ' + fmt(2 * thMax) + '°', 14, 22);
}

// ================= Phase 6b: Rückkehrzündung =================
function setupP6b() {
  S.phase = 6; phaseTag('Phase 6 · Rückkehrzündung');
  S.p.hb = 'k10'; S.p.blind = false;
  snapshot();
  const r = S.orbitR || C.RM + 110e3, v = Math.sqrt(C.muM / r);
  view.mode = 'mond'; view.auto = () => ship ? Math.max(3.4 * C.RM, 1.25 * Math.hypot(ship.x, ship.y)) : 3.4 * C.RM;
  markers = [];
  const L = S.level, h = (r - C.RM) / 1000;
  if (S.stoer && S.stoer.mascon) return setupP6bMascon(r);
  S.p.tei = { rp: r, vOrb: v, a0: null };
  ship = { frame: 'M', x: -r, y: 0, vx: 0, vy: -v }; startOrbitLoop(r);
  tracks = [{ pts: circlePts(r, 0).slice(0, 361), frame: 'M', color: 'rgba(74,222,128,.6)' }];
  funk('Flugleitung: Plattform bestätigt. Sie haben Freigabe für die Zündung zur Erde.');
  let body = `<h2>Phase 6 · Zündung zur Erde</h2>
    <p>Sie kreisen wieder im Mutterschiff um den Mond. Eine Zündung in Flugrichtung bringt Sie auf eine Hyperbel aus dem Einflussbereich des Mondes.
    Die Flugleitung hat berechnet, welche Restgeschwindigkeit v<sub>∞</sub> Sie dort brauchen, damit Ihre Bahn die Erde trifft.</p>
    <div class="given"><div><span>Bahnhöhe h${L === 'kommandant' ? ' (Cockpit)' : ''}</span><span>${fmt(h, 1)} km</span></div>
    <div><span>Benötigtes v<sub>∞</sub></span><span>${fmt(RET.vInf, 1)} m/s</span></div>
    ${L !== 'kommandant' ? `<div><span>Mondradius R<sub>M</sub></span><span>1.737 km</span></div>
    <div><span>μ<sub>M</sub></span><span>4,905·10¹² m³/s²</span></div>` : ''}</div>
    <p><b>Aufgabe:</b> Wie groß ist das Δv der Rückkehrzündung?</p>`;
  if (L === 'kadett') body += `<ol class="steps"><li><span class="f">r = R<sub>M</sub> + h</span></li>
      <li>Nötige Geschwindigkeit nach der Zündung (Energiesatz): <span class="f">v<sub>p</sub> = √(v<sub>∞</sub>² + 2·μ<sub>M</sub>/r)</span></li>
      <li><span class="f">v<sub>kreis</sub> = √(μ<sub>M</sub>/r)</span>, <span class="f">Δv = v<sub>p</sub> − v<sub>kreis</sub></span></li></ol>`;
  if (L === 'pilot') body += `<p>Hilfe: ${hbLink('k10', 'Kapitel 10 · Rückflug')} und ${hbLink('k6', 'Kapitel 6 · Mondeinfang')}</p>`;
  body += `<div class="warnbox">⚠ Jeder Meter pro Sekunde Abweichung muss unterwegs korrigiert werden und kostet doppelt, wenn zu wenig geschoben wurde.</div>
    <div class="inrow"><label>Δv</label><input id="in1" inputmode="decimal" autocomplete="off"><span>m/s</span></div>
    <div class="msg-err" id="err"></div>
    <div class="btnrow"><button class="go" id="bFire">ZÜNDUNG ZUR ERDE</button></div>`;
  setTask(body);
  $('#bFire').onclick = fireP6b;
  $('#in1').onkeydown = e => { if (e.key === 'Enter') fireP6b(); };
}
function fireP6b() {
  const dv = getInput('#in1');
  if (!Number.isFinite(dv) || dv <= 0) return errMsg('Bitte ein positives Δv in m/s eingeben.');
  if (!burn(dv)) return errMsg(`So viel Treibstoff haben Sie nicht. Reserve: ${fmt(dvReserve())} m/s.`);
  const T = S.p.tei, r = T.rp, vc = T.vOrb, vp = vc + dv, kap = T.mascon ? 'k11' : 'k10';
  const ideal = Math.sqrt(RET.vInf ** 2 + 2 * C.muM / r) - vc, err = dv - ideal;
  const entry = { phase: '6 · Rückkehrzündung', gesucht: T.mascon ? 'Δv zur Erde (Ellipse)' : 'Δv zur Erde', eingabe: dv, richtig: ideal, einheit: 'm/s', kap };
  const a0 = T.a0 != null ? T.a0 : ship && ship.frame === 'M' ? Math.atan2(ship.y, ship.x) : Math.PI;
  stopOrbitLoop();
  funk(`Zündung zur Erde. Delta v ${Math.round(dv)} Meter pro Sekunde.`);
  if (vp < Math.sqrt(2 * C.muM / r)) {
    entry.folge = 'unter Fluchtgeschwindigkeit – kein Ausbruch'; addLog(entry);
    return failCard('Kein Ausbruch', `Nach der Zündung hatten Sie ${fmt(vp, 1)} m/s, die Fluchtgeschwindigkeit vom Mond beträgt hier ${fmt(Math.sqrt(2 * C.muM / r), 1)} m/s.
      Sie bleiben auf einer Ellipse um den Mond gefangen.`, kap, setupP6b);
  }
  const vInfAct = Math.sqrt(vp ** 2 - 2 * C.muM / r);
  if (Math.abs(vInfAct - RET.vInf) > 250) {
    entry.folge = `v∞ ${fmt(vInfAct)} m/s – Erde verfehlt`; addLog(entry);
    return failCard('Erde verfehlt', `Mit v<sub>∞</sub> = ${fmt(vInfAct)} m/s statt ${fmt(RET.vInf)} m/s verfehlt die Bahn die Erde um Zehntausende Kilometer. Das lässt sich unterwegs nicht mehr korrigieren.`, kap, setupP6b);
  }
  const cost = Math.abs(err) < 0.5 ? 0 : Math.abs(err) + Math.max(0, -err);
  if (cost && !burn(cost)) {
    entry.folge = 'Treibstoff reicht nicht für Kurskorrektur'; addLog(entry);
    return failCard('Treibstoff erschöpft', 'Die nötige Kurskorrektur übersteigt Ihre Reserve.', 'k7', setupP6b);
  }
  entry.folge = cost ? `Kurskorrektur ${fmt(cost, 1)} m/s` : 'Rückkehrbahn getroffen'; entry.kosten = cost; addLog(entry);
  S.ideal.csm += ideal; S.p.teiCost = cost;
  if (T.mascon) { if (!cost) stoerGeschafft('Mascon-Bahnstörung'); S.p.hb = 'k10'; }
  // Teil 1: Hyperbel im Mondsystem bis zum Rand des Einflussbereichs
  const s0 = [r * Math.cos(a0), r * Math.sin(a0), -vp * Math.sin(a0), vp * Math.cos(a0)];
  const res = propagate(s0, S.met, {
    acc: accM, tMax: 4 * 86400,
    dtFn: s => { const q = Math.hypot(s[0], s[1]); return Math.min(300, 0.01 * q * Math.sqrt(q / C.muM)); },
    stop: s => Math.hypot(s[0], s[1]) > C.SOI ? 'soi' : null,
  });
  tracks.push({ pts: res.pts, frame: 'M', color: '#67e8f9', progressive: true });
  setTask(`<h2>Phase 6 · Rückflug</h2><p>Das Schiff verlässt den Mond. ${cost ? `Kurskorrektur ${fmt(cost, 1)} m/s eingeplant.` : 'Die Bahn sitzt.'}</p>`);
  startAnim({ pts: res.pts, frame: 'M', warpFn: () => (ship ? Math.hypot(ship.x, ship.y) : 3e6) / 300, onDone: () => earthLeg(res.t) });
}
function earthLeg(tS) {
  const m = moonPos(tS), a = moonAngle(tS);
  const s0 = [m[0], m[1], -RET.vApo * Math.sin(a), RET.vApo * Math.cos(a)];
  const res = propagate(s0, tS, {
    acc: accE, tMax: 8 * 86400,
    dtFn: s => { const q = Math.hypot(s[0], s[1]); return Math.min(600, 0.005 * q * Math.sqrt(q / C.muE)); },
    stop: s => Math.hypot(s[0], s[1]) < RET.re ? 'entry' : null,
  });
  const pts = res.pts, tE = res.t;
  S.p.leg = { pts, tS, tE };
  tracks.push({ pts, frame: 'E', color: '#67e8f9', progressive: true });
  view.mode = 'system'; view.fit = 1.12 * C.D;
  view.auto = () => ship && ship.frame === 'E' ? Math.max(3 * C.RE, 1.15 * Math.hypot(ship.x, ship.y)) : 1.12 * C.D;
  S.p.blind = true;
  funk('Flugleitung: Sie haben den Einflussbereich des Mondes verlassen. Bodenradar hat Sie verloren, bestimmen Sie Ihre Position selbst.');
  setTask(`<h2>Phase 6 · Rückflug</h2><p>Rund vier Tage freier Fall zur Erde. Das Bodenradar hat keinen Kontakt, die Bahnanzeigen im Cockpit sind dunkel.</p>`);
  const tFix = tS + 0.5 * (tE - tS), tRe = tS + 0.9 * (tE - tS);
  S.p.tRe = tRe;
  startAnim({
    pts, frame: 'E', tStart: tS, tEnd: tE, warpFn: legWarp,
    events: [{ t: tFix, fn: navFixTask }, { t: tRe, fn: () => { snapshot(); reentryTask(); } }],
    onDone: finishReentry,
  });
}
const legWarp = () => { const q = ship ? Math.hypot(ship.x, ship.y) : C.D; return 6e4 * Math.pow(q / C.D, 1.5) + 200; };

// ================= Phase 6c: Navigationsfix =================
function navFixTask() {
  anim.paused = true; S.p.hb = 'k9'; phaseTag('Phase 6 · Navigationsfix');
  const d = Math.hypot(ship.x, ship.y), alpha = 2 * deg(Math.asin(C.RE / d));
  S.p.fix = { d, alpha };
  funk('Flugleitung: Bitte Navigationsfix. Messen Sie den scheinbaren Durchmesser der Erde.');
  const L = S.level;
  let body = `<h2>Phase 6 · Navigationsfix</h2>
    <p>Durch das Sextantenfernrohr messen Sie den Winkel, unter dem die Erdscheibe erscheint. Daraus folgt Ihr Abstand zum Erdmittelpunkt.</p>
    <div class="given"><div><span>Scheinbarer Durchmesser α</span><span>${fmt(alpha, 4)}°</span></div>
    ${L !== 'kommandant' ? '<div><span>Erdradius R<sub>E</sub></span><span>6.371 km</span></div>' : ''}</div>
    <p><b>Aufgabe:</b> Wie weit sind Sie vom Erdmittelpunkt entfernt?</p>`;
  if (L === 'kadett') body += `<ol class="steps"><li>Vom Schiff aus sieht man den Erdradius unter dem halben Winkel: <span class="f">sin(α/2) = R<sub>E</sub> / d</span></li>
      <li><span class="f">d = R<sub>E</sub> / sin(α/2)</span> (Rechenblock in Grad)</li></ol>`;
  if (L === 'pilot') body += `<p>Hilfe: ${hbLink('k9', 'Kapitel 9 · Sternnavigation')}</p>`;
  body += `<div class="warnbox">⚠ Der Bordcomputer korrigiert die Bahn nach Ihrem Wert. 1 % Fehler verschiebt den Eintrittswinkel um ¼ Grad.</div>
    <div class="inrow"><label>Abstand d</label><input id="in1" inputmode="decimal" autocomplete="off"><span>km</span></div>
    <div class="msg-err" id="err"></div>
    <div class="btnrow"><button class="go" id="bFire">POSITION ÜBERNEHMEN</button></div>`;
  setTask(body);
  $('#bFire').onclick = fireFix;
  $('#in1').onkeydown = e => { if (e.key === 'Enter') fireFix(); };
}
function fireFix() {
  const din = getInput('#in1');
  if (!Number.isFinite(din) || din <= 0) return errMsg('Bitte den Abstand in km eingeben.');
  const { d, alpha } = S.p.fix, dk = d / 1000, e = (din - dk) / dk * 100;
  if (Math.abs(e) > 30) return errMsg('Dieser Wert ist völlig unplausibel. Rechnung prüfen (km? Halber Winkel? Rechner in Grad?).');
  S.p.navErr = Math.max(-20, Math.min(20, e));
  addLog({ phase: '6 · Navigationsfix', gesucht: 'Abstand zur Erde', eingabe: din, richtig: dk, einheit: 'km', kap: 'k9',
    folge: Math.abs(e) < 0.1 ? 'Position exakt' : `Fehler ${fmt(e, 2)} %` });
  S.p.blind = false; S.p.hb = 'k10';
  funk(Math.abs(e) < 0.5 ? 'Flugleitung: Position bestätigt. Sauberer Fix.' : `Position übernommen. Abweichung ${fmt(Math.abs(e), 1)} Prozent.`);
  setTask(`<h2 class="${Math.abs(e) < 0.5 ? 'ok' : ''}">${Math.abs(e) < 0.5 ? '✔ ' : ''}Navigationsfix</h2>
    ${resultTable([['Ihr Abstand', fmt(din) + ' km'], ['Tatsächlich', fmt(dk) + ' km'], ['Fehler', fmt(e, 2) + ' %']])}
    <p>Lösungsweg: d = 6.371 km / sin(${fmt(alpha / 2, 4)}°) = ${fmt(dk)} km.</p><p>Der Flug geht weiter …</p>`);
  anim.paused = false;
}

// ================= Phase 6d: Wiedereintritt =================
function reentryTask() {
  const P = S.p.leg;
  if (!anim) { // Neuversuch nach Fehlschlag
    view.mode = 'system';
    view.auto = () => ship && ship.frame === 'E' ? Math.max(3 * C.RE, 1.15 * Math.hypot(ship.x, ship.y)) : 1.12 * C.D;
    startAnim({ pts: P.pts, frame: 'E', tStart: S.p.tRe, tEnd: P.tE, warpFn: legWarp, onDone: finishReentry });
    stepAnim(0);
  }
  anim.paused = true; S.p.hb = 'k10'; phaseTag('Phase 6 · Wiedereintritt');
  const ranges = [[32, 50], [72, 85], [-4, 2]].sort(() => Math.random() - 0.5);
  S.p.opts = ranges.map(([lo, hi]) => { const hp = Math.round((lo + Math.random() * (hi - lo)) * 10) / 10; return { hp, g: entryGamma(hp) }; });
  funk('Flugleitung: Noch rund einen Tag bis zum Eintritt. Wählen Sie die letzte Kurskorrektur.');
  const L = S.level;
  let body = `<h2>Phase 6 · Eintrittskorridor</h2>
    <p>Die Kapsel muss die Atmosphäre in einem schmalen Winkelkorridor treffen: <b>5,5° bis 7,5°</b> unter der Waagerechten.
    Zu flach prallt sie ab, zu steil wird die Bremsverzögerung tödlich. Die Flugleitung bietet drei Korrekturen an, jede führt zu einem anderen Perigäum.</p>
    <div class="given"><div><span>Eintrittshöhe (r<sub>e</sub> = R<sub>E</sub> + 120 km)</span><span>120 km</span></div>
    <div><span>Geschwindigkeit dort v<sub>e</sub></span><span>${fmt(RET.ve)} m/s</span></div>
    ${L !== 'kommandant' ? `<div><span>μ<sub>E</sub></span><span>3,986·10¹⁴ m³/s²</span></div><div><span>R<sub>E</sub></span><span>6.371 km</span></div>` : ''}</div>
    <div class="pairs">${S.p.opts.map((o, k) => `<label class="pair"><input type="radio" name="opt" value="${k}">
      <span><b>Korrektur ${'ABC'[k]}:</b> Perigäumshöhe ${fmt(o.hp, 1)} km</span></label>`).join('')}</div>
    <p><b>Aufgabe:</b> Berechnen Sie den Eintrittswinkel γ, wählen Sie die Korrektur im Korridor und geben Sie ihr γ ein.</p>`;
  if (L === 'kadett') body += `<ol class="steps"><li><span class="f">r<sub>p</sub> = R<sub>E</sub> + h<sub>p</sub></span> (Höhe kann negativ sein: Perigäum unter dem Meeresspiegel)</li>
      <li>Energiesatz: <span class="f">v<sub>p</sub> = √(v<sub>e</sub>² + 2·μ<sub>E</sub>·(1/r<sub>p</sub> − 1/r<sub>e</sub>))</span></li>
      <li>Drehimpuls: <span class="f">cos γ = r<sub>p</sub>·v<sub>p</sub> / (r<sub>e</sub>·v<sub>e</sub>)</span>, also <span class="f">γ = acos(…)</span></li></ol>`;
  if (L === 'pilot') body += `<p>Hilfe: ${hbLink('k10', 'Kapitel 10 · Wiedereintritt')}</p>`;
  body += `<div class="inrow"><label>Eintrittswinkel γ</label><input id="in1" inputmode="decimal" autocomplete="off"><span>°</span></div>
    <div class="msg-err" id="err"></div>
    <div class="btnrow"><button class="go" id="bFire">KORREKTUR AUSFÜHREN</button></div>`;
  setTask(body);
  $('#bFire').onclick = fireReentry;
  $('#in1').onkeydown = e => { if (e.key === 'Enter') fireReentry(); };
}
function fireReentry() {
  const sel = document.querySelector('input[name="opt"]:checked'), g = getInput('#in1');
  if (!sel) return errMsg('Bitte eine Korrektur wählen.');
  if (!Number.isFinite(g)) return errMsg('Bitte den Eintrittswinkel in Grad eingeben.');
  const o = S.p.opts[+sel.value];
  if (Math.abs(g - o.g) > 0.2) return errMsg('Ihr Winkel passt nicht zu dieser Korrektur. Rechnung prüfen (Meter? Vorzeichen in der Klammer?).');
  S.p.choice = o; S.p.gamma = o.g + 0.25 * S.p.navErr;
  addLog({ phase: '6 · Wiedereintritt', gesucht: 'Korrektur / γ', eingabe: `${fmt(o.hp, 1)} km / ${fmt(g, 2)}°`,
    richtig: S.p.opts.filter(q => q.g >= 5.5 && q.g <= 7.5).map(q => `${fmt(q.hp, 1)} km / ${fmt(q.g, 2)}°`).join('') || '—', einheit: '°', kap: 'k10',
    folge: `tatsächlicher Winkel ${fmt(S.p.gamma, 2)}°` });
  funk('Korrektur ausgeführt. Kapsel abgetrennt, Hitzeschild voraus.');
  setTask(`<h2>Phase 6 · Anflug</h2><p>Korrektur auf ${fmt(o.hp, 1)} km Perigäum ausgeführt. Die Kapsel fällt der Erde entgegen …</p>`);
  anim.paused = false;
}
function finishReentry() {
  const g = S.p.gamma, o = S.p.choice;
  const p = S.p.leg.pts.at(-1);
  if (!(g >= 5.5)) {
    markers.push({ frame: 'E', x: p.x, y: p.y, label: 'abgeprallt', color: '#ff9f43' });
    funk('Flugleitung: Die Kapsel springt aus der Atmosphäre. Kein Kontakt.');
    return failCard('Abgeprallt', `Der Eintrittswinkel betrug nur ${fmt(g, 2)}°. So flach prallt die Kapsel wie ein flacher Stein auf dem Wasser von der Atmosphäre ab und fliegt zurück ins All.
      ${S.p.navErr && Math.abs(o.g - g) > 0.05 ? `Ihr Navigationsfehler von ${fmt(S.p.navErr, 2)} % hat den Winkel um ${fmt(g - o.g, 2)}° verschoben.` : ''}`, 'k10', reentryTask);
  }
  if (g > 7.5) {
    markers.push({ frame: 'E', x: p.x, y: p.y, label: 'zu steil' });
    funk('Flugleitung: Kein Signal. Verzögerung über zwölf g.');
    return failCard('Zu steil', `Der Eintrittswinkel betrug ${fmt(g, 2)}°. Die Kapsel taucht zu tief ein, die Bremsverzögerung übersteigt 12 g und die Hitze den Schild.
      ${S.p.navErr && Math.abs(o.g - g) > 0.05 ? `Ihr Navigationsfehler von ${fmt(S.p.navErr, 2)} % hat den Winkel um ${fmt(g - o.g, 2)}° verschoben.` : ''}`, 'k10', reentryTask);
  }
  S.met += 15 * 60;
  markers.push({ frame: 'E', x: p.x * C.RE / Math.hypot(p.x, p.y), y: p.y * C.RE / Math.hypot(p.x, p.y), label: 'Wasserung', color: '#4ade80' });
  funk('Flugleitung an Selene 1: Fallschirme offen, Wasserung bestätigt. Willkommen zu Hause!');
  missionReport();
}

// ================= Missionsbericht =================
function missionReport() {
  phaseTag('Missionsbericht');
  S.veh = 'csm';
  const csmUsed = SHIP.dvStart - dvReserve(), csmExtra = csmUsed - S.ideal.csm, total = Math.max(0, csmExtra) + Math.max(0, S.lmExtra);
  const grade = total < 30 ? ['Hervorragend', 'Präzise wie ein Bordcomputer.'] : total < 120 ? ['Gut', 'Kleine Fehler, sicher korrigiert.']
    : total < 300 ? ['Bestanden', 'Die Reserven haben gereicht, aber knapp.'] : ['Knapp', 'Glück gehabt. Rechnen Sie nach, wo der Treibstoff blieb.'];
  setTask(`<h2 class="ok">🏁 Mission erfüllt</h2>
    <p>Besatzung wohlbehalten zurück. Missionsdauer ${metStr(S.met)}.</p>
    ${resultTable([
      ['Aufsetzgeschwindigkeit Mond', S.vTouch != null ? fmt(S.vTouch, 1) + ' m/s' : '—'],
      ['Eintrittswinkel', fmt(S.p.gamma, 2) + '°'],
      ...(S.stoer ? [['Gemeisterte Störfälle', S.stoerDone.length ? S.stoerDone.join(', ') : 'keine']] : []),
      ['Mutterschiff: Plan-Δv', fmt(S.ideal.csm) + ' m/s'],
      ['Mutterschiff: verbraucht', fmt(csmUsed) + ' m/s'],
      ['Mutterschiff: Mehrverbrauch', fmt(Math.max(0, csmExtra), 1) + ' m/s'],
      ['Landefähre: Mehrverbrauch', fmt(Math.max(0, S.lmExtra), 1) + ' m/s'],
      ['Restreserve Mutterschiff', fmt(dvReserve()) + ' m/s'],
      ['<b>Fehlerkosten gesamt</b>', `<b>${fmt(total, 1)} m/s</b>`],
      ['<b>Wertung</b>', `<b>${grade[0]}</b>`]])}
    <p>${grade[1]}</p>
    <div class="btnrow"><button id="bLogE">Tagebuch</button><button class="primary" id="bNew">Neue Mission</button></div>`);
  $('#bLogE').onclick = openLog;
  $('#bNew').onclick = showBriefing;
}

// ================= Bordhandbuch: Kapitel 8–10 =================
HB.push(
  { id: 'k8', t: '8 · Landung', h: `
    <p>Die Landung hat zwei Teile: eine kleine Zündung, die die Bahn absenkt, und den senkrechten Endanflug, bei dem das Triebwerk den Fall abbremst.</p>
    <h3>Abstiegszündung</h3>
    <p>Wird auf einer Kreisbahn gebremst, bleibt der Zündpunkt der höchste Punkt. Der gegenüberliegende Punkt sinkt. Die neue Ellipse hat
    <span class="f">a = (r<sub>1</sub> + r<sub>2</sub>)/2</span>, die nötige Geschwindigkeit liefert die Vis-viva-Gleichung (Kap. 3):</p>
    <div class="formel">Δv = √(μ<sub>M</sub>/r<sub>1</sub>) − √( μ<sub>M</sub>·(2/r<sub>1</sub> − 1/a) )</div>
    <p><b>Beispiel</b> (100 km → 15 km): r<sub>1</sub> = 1.837 km, r<sub>2</sub> = 1.752 km, a = 1.794,5 km;
    v<sub>kreis</sub> = 1.634,05 m/s, v<sub>neu</sub> = 1.614,58 m/s → Δv = <b>19,47 m/s</b>.
    Jeder m/s mehr senkt das Perilun um gut 4 km.</p>
    <h3>Endanflug: Bremsweg</h3>
    <p>Auf dem Mond fällt alles mit <span class="f">g<sub>M</sub> = μ<sub>M</sub>/R<sub>M</sub>² = 1,626 m/s²</span>, einem Sechstel der Erde.
    Das Triebwerk bremst mit der Netto-Verzögerung <span class="f">a = F/m − g<sub>M</sub></span>. Der Bremsweg aus der Geschwindigkeit v ist</p>
    <div class="formel">s = v² / (2·a)</div>
    <h3>Zündhöhe aus der Energiebilanz</h3>
    <p>Bis zum Boden muss das Triebwerk die Bewegungsenergie und die Lageenergie vernichten. Es arbeitet nur auf den letzten h Metern:</p>
    <div class="formel">F·h = ½·m·v<sub>0</sub>² + m·g<sub>M</sub>·h<sub>0</sub>  →  h = m·(v<sub>0</sub>² + 2·g<sub>M</sub>·h<sub>0</sub>) / (2F)</div>
    <p><b>Beispiel:</b> m = 7.000 kg, v<sub>0</sub> = 40 m/s, h<sub>0</sub> = 1.500 m, F = 26.000 N:
    v<sub>0</sub>² + 2·1,626·1.500 = 6.477,1 → h = 7.000·6.477,1 / 52.000 = <b>871,9 m</b>.</p>
    <h3>Typische Fehler</h3><ul class="fehler">
    <li>g der Erde (9,81) statt des Mondes. Dann zünden Sie viel zu hoch und verbrennen den Tank im Schwebeflug.</li>
    <li>Die Lageenergie vergessen: Mit nur ½mv<sub>0</sub>² zünden Sie zu tief und schlagen auf.</li>
    <li>F/m mit der Startmasse der Fähre rechnen. Maßgeblich ist die Masse beim Endanflug.</li></ul>
    <details><summary>Herleitung mit Bremsweg</summary><p>Bis zur Zündhöhe h fällt die Fähre frei: <span class="f">v<sub>z</sub>² = v<sub>0</sub>² + 2g(h<sub>0</sub> − h)</span>.
    Danach bremst sie mit a = F/m − g auf null: <span class="f">v<sub>z</sub>² = 2(F/m − g)·h</span>. Gleichsetzen ergibt
    <span class="f">v<sub>0</sub>² + 2g·h<sub>0</sub> = 2(F/m)·h</span>, also dieselbe Formel wie die Energiebilanz.</p></details>` },
  { id: 'k9', t: '9 · Sternnavigation', h: `
    <p>Fern der Erde gibt es kein GPS. Die Raumfahrer richten ihre Kreiselplattform an Sternen aus und bestimmen ihren Ort mit dem Sextanten.</p>
    <h3>Sternkoordinaten</h3><p>Jeder Stern hat eine feste Position am Himmel: <b>Rektaszension α</b> (wie eine Längenangabe, in Stunden: 24 h = 360°, also
    <span class="f">1 h = 15°</span>) und <b>Deklination δ</b> (wie eine Breite, von −90° bis +90°).</p>
    <h3>Winkelabstand zweier Sterne</h3>
    <div class="formel">cos d = sin δ<sub>1</sub>·sin δ<sub>2</sub> + cos δ<sub>1</sub>·cos δ<sub>2</sub>·cos(α<sub>1</sub> − α<sub>2</sub>)</div>
    <p><b>Beispiel Sirius–Prokyon:</b> α<sub>1</sub> = 6,7525 h = 101,29°, δ<sub>1</sub> = −16,72°; α<sub>2</sub> = 7,655 h = 114,83°, δ<sub>2</sub> = +5,23°.<br>
    sin δ<sub>1</sub>·sin δ<sub>2</sub> = −0,28763·0,09107 = −0,02619<br>
    cos δ<sub>1</sub>·cos δ<sub>2</sub>·cos(13,54°) = 0,95774·0,99584·0,97221 = 0,92725<br>
    cos d = 0,90106 → d = <b>25,70°</b></p>
    <p>Der Sextant misst den Abstand zweier Sterne. Passt er zu genau einem Paar der Sternkarte, weiß der Bordcomputer, wohin das Schiff zeigt.</p>
    <h3>Entfernung aus dem Winkeldurchmesser</h3>
    <p>Eine Kugel mit Radius R erscheint aus dem Abstand d unter dem Winkel α. Der halbe Winkel gehört zu einem rechtwinkligen Dreieck:</p>
    <div class="formel">sin(α/2) = R / d  →  d = R / sin(α/2)</div>
    <p><b>Beispiel:</b> Die Erde erscheint 2,000° groß: d = 6.371 km / sin(1,000°) = <b>365.050 km</b>.</p>
    <h3>Typische Fehler</h3><ul class="fehler">
    <li>Rektaszension in Stunden in die Formel setzen. Erst mal 15!</li>
    <li>Den Rechner im Bogenmaß rechnen lassen. Der Rechenblock arbeitet in Grad.</li>
    <li>Den ganzen statt den halben Winkel nehmen: Das halbiert die Entfernung.</li></ul>
    <details><summary>Herleitung der Abstandsformel</summary><p>Jeder Stern ist ein Einheitsvektor
    <span class="f">(cos δ·cos α, cos δ·sin α, sin δ)</span>. Das Skalarprodukt zweier Einheitsvektoren ist der Kosinus des Winkels zwischen ihnen.
    Ausmultipliziert und mit cos α<sub>1</sub>cos α<sub>2</sub> + sin α<sub>1</sub>sin α<sub>2</sub> = cos(α<sub>1</sub> − α<sub>2</sub>) zusammengefasst, ergibt sich die Formel oben.</p></details>` },
  { id: 'k10', t: '10 · Rückflug & Wiedereintritt', h: `
    <h3>Rückkehrzündung</h3>
    <p>Wie beim Einfang (Kap. 6), nur umgekehrt: Aus der Kreisbahn beschleunigen Sie auf eine Hyperbel. Am Rand des Einflussbereichs bleibt v<sub>∞</sub> übrig.</p>
    <div class="formel">Δv = √( v<sub>∞</sub>² + 2μ<sub>M</sub>/r ) − √( μ<sub>M</sub>/r )</div>
    <p><b>Beispiel</b> (100 km, v<sub>∞</sub> = 840 m/s): r = 1.837.000 m; √(840² + 2·4,905·10¹²/1,837·10⁶) = 2.458,83 m/s; v<sub>kreis</sub> = 1.634,05 m/s → Δv = <b>824,78 m/s</b>.</p>
    <p>Warum gerade v<sub>∞</sub>? Der Mond fliegt mit 1.023 m/s um die Erde. Wer ihn mit 840 m/s nach hinten verlässt, hat gegenüber der Erde nur noch rund 184 m/s
    und fällt auf einer langgestreckten Ellipse zur Erde.</p>
    <h3>Der Eintrittskorridor</h3>
    <p>In 120 km Höhe beginnt die Atmosphäre zu bremsen. Entscheidend ist der Winkel γ, unter dem die Kapsel die Waagerechte schneidet:</p>
    <ul class="fehler"><li>unter 5,5°: Die Kapsel prallt ab wie ein flacher Stein auf dem Wasser.</li>
    <li>5,5° bis 7,5°: sicherer Eintritt, rund 6 bis 8 g Verzögerung.</li>
    <li>über 7,5°: zu steil, über 12 g und zu viel Hitze.</li></ul>
    <p>γ folgt aus dem Perigäum, das die Bahn ohne Atmosphäre hätte. Energiesatz und Drehimpulserhaltung zwischen r<sub>e</sub> (120 km) und Perigäum r<sub>p</sub>:</p>
    <div class="formel">v<sub>p</sub>² = v<sub>e</sub>² + 2μ<sub>E</sub>·(1/r<sub>p</sub> − 1/r<sub>e</sub>)    cos γ = r<sub>p</sub>·v<sub>p</sub> / (r<sub>e</sub>·v<sub>e</sub>)</div>
    <p><b>Beispiel</b> (Perigäum 50 km, v<sub>e</sub> = 10.990 m/s): r<sub>p</sub> = 6.421.000 m, r<sub>e</sub> = 6.491.000 m;
    v<sub>p</sub> = 11.050,7 m/s; cos γ = 6,421·11.050,7 / (6,491·10.990) = 0,99468 → γ = <b>5,91°</b>.</p>
    <p>Je tiefer das Perigäum, desto steiler der Eintritt. Ein Perigäum knapp unter dem Meeresspiegel ist kein Fehler der Rechnung, die Atmosphäre fängt die Kapsel vorher ab.</p>
    <h3>Typische Fehler</h3><ul class="fehler">
    <li>Höhen statt Radien einsetzen: r<sub>p</sub> und r<sub>e</sub> zählen vom Erdmittelpunkt.</li>
    <li>Klammer vertauscht: 1/r<sub>p</sub> − 1/r<sub>e</sub> ist positiv, die Kapsel wird zum Perigäum hin schneller.</li>
    <li>γ = acos(…) im Bogenmaß abgelesen. Der Rechenblock liefert Grad.</li></ul>
    <details><summary>Herleitung</summary><p>Der Drehimpuls pro kg <span class="f">h = r·v·cos γ</span> ist entlang der Bahn konstant. Im Perigäum ist γ = 0, also
    <span class="f">r<sub>e</sub>·v<sub>e</sub>·cos γ = r<sub>p</sub>·v<sub>p</sub></span>. v<sub>p</sub> folgt aus der Bahnenergie
    <span class="f">v²/2 − μ/r = konstant</span>.</p></details>` },
);

// ================= Störfälle =================
function rollStoer() { // jede Panne mit 2/3 Wahrscheinlichkeit, mindestens eine
  let o;
  do o = { kurs: Math.random() < 0.67, radar: Math.random() < 0.67, mascon: Math.random() < 0.67 }; while (!o.kurs && !o.radar && !o.mascon);
  o.kursDv = 4 + Math.round(Math.random() * 50) / 10;
  o.masconD = (15 + Math.floor(Math.random() * 16)) * 1e3;
  return o;
}
function stoerGeschafft(name) { if (S.stoerDone && !S.stoerDone.includes(name)) S.stoerDone.push(name); }
const RCS_F = 1780; // 4 Lagetriebwerke × 445 N

// S1: Haupttriebwerk gestört, Korrektur mit den Lagetriebwerken (Phase 3)
function stoerKurs() {
  if (!anim) return;
  anim.paused = true;
  const need = S.stoer.kursDv, m = S.m, L = S.level;
  S.p.hb = 'k11'; S.p.kurs = { need, m };
  funk('Master Alarm! Haupttriebwerk: Ventil klemmt. Kurskorrektur nur mit den Lagetriebwerken möglich.',
    'Master Alarm! Haupttriebwerk gestört. Kurskorrektur mit den Lagetriebwerken.');
  let body = `<h2 class="bad">⚠ Störfall · Haupttriebwerk</h2>
    <p>Die Bahnvermessung zeigt eine Abweichung. Das Haupttriebwerk lässt sich nicht zünden. Die vier Lagetriebwerke schieben zusammen,
    aber nur schwach. Sie müssen sie genau so lange brennen lassen, bis die nötige Geschwindigkeitsänderung erreicht ist.</p>
    <div class="given"><div><span>Nötige Korrektur Δv</span><span>${fmt(need, 1)} m/s</span></div>
    <div><span>Masse des Schiffs m</span><span>${fmt(m)} kg</span></div>
    <div><span>Schub der Lagetriebwerke F</span><span>4 × 445 N = 1.780 N</span></div></div>
    <p><b>Aufgabe:</b> Wie viele Sekunden müssen die Lagetriebwerke brennen?</p>`;
  if (L === 'kadett') body += `<ol class="steps"><li>Kraftstoß gleich Impulsänderung: <span class="f">F·t = m·Δv</span></li>
      <li>Umgestellt: <span class="f">t = m·Δv / F</span></li></ol>`;
  if (L === 'pilot') body += `<p>Hilfe: ${hbLink('k11', 'Kapitel 11 · Störfälle')}</p>`;
  body += `<p class="muted">Der Treibstoffverbrauch der Lagetriebwerke ist so klein, dass die Masse als konstant gilt.</p>
    <div class="inrow"><label>Brenndauer</label><input id="in1" inputmode="decimal" autocomplete="off"><span>s</span></div>
    <div class="msg-err" id="err"></div>
    <div class="btnrow"><button class="go" id="bFire">LAGETRIEBWERKE ZÜNDEN</button></div>`;
  setTask(body);
  $('#bFire').onclick = fireKurs;
  $('#in1').onkeydown = e => { if (e.key === 'Enter') fireKurs(); };
}
function fireKurs() {
  const t = getInput('#in1'), K = S.p.kurs;
  if (!Number.isFinite(t) || t <= 0) return errMsg('Bitte eine positive Brenndauer in Sekunden eingeben.');
  if (t > 3600) return errMsg('Länger als eine Stunde halten die Lagetriebwerke nicht durch.');
  const tStar = K.m * K.need / RCS_F, got = RCS_F * t / K.m, err = got - K.need;
  const cost = Math.abs(err) < 0.1 ? 0 : Math.abs(err) + Math.max(0, -err);
  S.ideal.csm += K.need;
  const ok = burn(K.need + cost);
  if (!ok) S.p.fuelOut = true;
  addLog({ phase: '3 · Störfall Triebwerk', gesucht: 'Brenndauer Lagetriebwerke', eingabe: t, richtig: tStar, einheit: 's', kap: 'k11',
    folge: cost ? `Δv ${fmt(got, 2)} statt ${fmt(K.need, 1)} m/s, Nachkorrektur ${fmt(cost, 1)} m/s` : 'Abweichung beseitigt', kosten: cost });
  if (cost < 1) stoerGeschafft('Haupttriebwerk gestört');
  funk(cost ? `Lagetriebwerke aus. Restabweichung ${fmt(Math.abs(err), 1)} Meter pro Sekunde, wird nachkorrigiert.` : 'Lagetriebwerke aus. Kurs liegt genau an.');
  setTask(`<h2 class="${cost < 1 ? 'ok' : ''}">${cost < 1 ? '✔' : '≈'} Störfall behoben</h2>
    ${resultTable([['Ihre Brenndauer', fmt(t, 1) + ' s'], ['Richtige Brenndauer', fmt(tStar, 1) + ' s'], ['Erreichtes Δv', fmt(got, 2) + ' m/s'],
      ['Nötiges Δv', fmt(K.need, 1) + ' m/s'], ['Nachkorrektur', fmt(cost, 1) + ' m/s']])}
    <p>Lösungsweg: t = m·Δv/F = ${fmt(K.m)}·${fmt(K.need, 1)}/1.780 = ${fmt(tStar, 1)} s.</p>
    <p class="muted">Das Haupttriebwerk ist inzwischen wieder freigegeben.</p>
    <div class="btnrow"><button class="primary" id="bGo">Weiterfliegen</button></div>`);
  $('#bGo').onclick = () => {
    S.p.hb = null;
    setTask(`<h2>Phase 3 · Transfer</h2><p>Unterwegs zum Mond. Beobachten Sie Ihre Bahn und das Cockpit.</p>`);
    if (anim) anim.paused = false;
  };
}

// S3: Mascon-Bahnstörung vor der Rückkehrzündung (Phase 6b)
function setupP6bMascon(r) {
  const d = S.stoer.masconD, rp = r - d, ra = r + d, a = r, vOrb = Math.sqrt(C.muM * (2 / rp - 1 / a));
  S.p.tei = { rp, vOrb, a0: Math.PI, mascon: true };
  S.p.hb = 'k11';
  stopOrbitLoop();
  ship = { frame: 'M', x: -rp, y: 0, vx: 0, vy: -vOrb };
  const e = (ra - rp) / (ra + rp), pts = [];
  for (let k = 0; k <= 360; k++) { const th = 2 * Math.PI * k / 360, q = a * (1 - e * e) / (1 + e * Math.cos(th)); pts.push({ t: 0, x: -q * Math.cos(th), y: -q * Math.sin(th) }); }
  tracks = [{ pts: circlePts(r, 0).slice(0, 361), frame: 'M', color: 'rgba(74,222,128,.25)' }, { pts, frame: 'M', color: 'rgba(255,184,77,.85)' }];
  markers = [{ frame: 'M', x: -rp, y: 0, label: 'Perilun', color: '#ffb84d' }];
  funk('Flugleitung: Achtung, Massenkonzentrationen unter der Oberfläche haben Ihre Bahn verbogen. Zündung im Perilun.',
    'Flugleitung: Achtung, Ihre Bahn ist durch Mascons gestört. Zündung im Perilun.');
  const L = S.level, hp = (rp - C.RM) / 1000, ha = (ra - C.RM) / 1000;
  let body = `<h2 class="bad">⚠ Störfall · Mascons</h2>
    <p>Unter den großen Mondmeeren liegen dichte Gesteinsmassen, die Mascons. Ihre Zusatzanziehung hat die Kreisbahn zu einer Ellipse verformt.
    Für eine Korrektur bleibt keine Zeit: Sie zünden im tiefsten Punkt, dem Perilun. Dort sind Sie schneller als auf der Kreisbahn.</p>
    <div class="given"><div><span>Perilun-Höhe</span><span>${fmt(hp, 1)} km</span></div>
    <div><span>Apolun-Höhe</span><span>${fmt(ha, 1)} km</span></div>
    <div><span>Benötigtes v<sub>∞</sub></span><span>${fmt(RET.vInf, 1)} m/s</span></div>
    ${L !== 'kommandant' ? `<div><span>Mondradius R<sub>M</sub></span><span>1.737 km</span></div>
    <div><span>μ<sub>M</sub></span><span>4,905·10¹² m³/s²</span></div>` : ''}</div>
    <p><b>Aufgabe:</b> Wie groß ist das Δv der Rückkehrzündung im Perilun?</p>`;
  if (L === 'kadett') body += `<ol class="steps"><li><span class="f">r<sub>p</sub> = R<sub>M</sub> + h<sub>p</sub></span>, <span class="f">r<sub>a</sub> = R<sub>M</sub> + h<sub>a</sub></span>, <span class="f">a = (r<sub>p</sub> + r<sub>a</sub>)/2</span></li>
      <li>Bisherige Geschwindigkeit im Perilun (Vis-viva): <span class="f">v<sub>bahn</sub> = √( μ<sub>M</sub>·(2/r<sub>p</sub> − 1/a) )</span></li>
      <li>Nötig: <span class="f">v<sub>p</sub> = √(v<sub>∞</sub>² + 2·μ<sub>M</sub>/r<sub>p</sub>)</span>, <span class="f">Δv = v<sub>p</sub> − v<sub>bahn</sub></span></li></ol>`;
  if (L === 'pilot') body += `<p>Hilfe: ${hbLink('k11', 'Kapitel 11 · Störfälle')} und ${hbLink('k10', 'Kapitel 10 · Rückflug')}</p>`;
  body += `<div class="warnbox">⚠ Im Perilun ist das Schiff schneller als auf der alten Kreisbahn. Rechnen Sie mit der Bahngeschwindigkeit der Ellipse, nicht mit √(μ/r).</div>
    <div class="inrow"><label>Δv</label><input id="in1" inputmode="decimal" autocomplete="off"><span>m/s</span></div>
    <div class="msg-err" id="err"></div>
    <div class="btnrow"><button class="go" id="bFire">ZÜNDUNG ZUR ERDE</button></div>`;
  setTask(body);
  $('#bFire').onclick = fireP6b;
  $('#in1').onkeydown = e => { if (e.key === 'Enter') fireP6b(); };
}

HB.push({ id: 'k11', t: '11 · Störfälle', h: `
    <p>Kein Flug läuft nach Plan. Mit drei Grundgesetzen lassen sich die typischen Pannen von Hand lösen.</p>
    <h3>Haupttriebwerk gestört: Kraftstoß</h3>
    <p>Eine Kraft F, die t Sekunden wirkt, ändert den Impuls um F·t. Solange die Masse fast gleich bleibt, gilt</p>
    <div class="formel">F·t = m·Δv  →  t = m·Δv / F</div>
    <p><b>Beispiel:</b> m = 42.000 kg, Δv = 6 m/s, vier Lagetriebwerke zu je 445 N (F = 1.780 N):
    t = 42.000·6 / 1.780 = <b>141,57 s</b>. Das große Triebwerk (91.000 N) bräuchte keine 3 Sekunden.</p>
    <h3>Radar ohne Geschwindigkeit: freier Fall</h3>
    <p>Ohne Triebwerk fällt die Fähre frei. Zwischen zwei Höhenmessungen im Abstand Δt gilt rückwärts gerechnet</p>
    <div class="formel">h<sub>a</sub> = h<sub>0</sub> + v<sub>0</sub>·Δt − ½·g<sub>M</sub>·Δt²  →  v<sub>0</sub> = (h<sub>a</sub> − h<sub>0</sub>)/Δt + g<sub>M</sub>·Δt/2</div>
    <p><b>Beispiel:</b> h<sub>0</sub> = 1.500 m, vor 2,0 s h<sub>a</sub> = 1.576,75 m:
    v<sub>0</sub> = 76,75/2 + 1,626 = <b>40,0 m/s</b>. Mit diesem v<sub>0</sub> geht es weiter wie in Kapitel 8.</p>
    <h3>Mascons: Zündung aus der Ellipse</h3>
    <p>Liegt das Schiff auf einer Ellipse, zündet man im Perilun. Dort ist es schneller als auf dem Kreis, die Vis-viva-Gleichung (Kap. 3) liefert</p>
    <div class="formel">Δv = √( v<sub>∞</sub>² + 2μ<sub>M</sub>/r<sub>p</sub> ) − √( μ<sub>M</sub>·(2/r<sub>p</sub> − 1/a) )</div>
    <p><b>Beispiel</b> (Perilun 85 km, Apolun 135 km, v<sub>∞</sub> = 840 m/s): r<sub>p</sub> = 1.822.000 m, a = 1.847.000 m;
    v<sub>bahn</sub> = 1.651,83 m/s, nötig 2.467,75 m/s → Δv = <b>815,92 m/s</b>, rund 9 m/s weniger als aus dem Kreis.</p>
    <h3>Typische Fehler</h3><ul class="fehler">
    <li>Kraftstoß mit der Masse in Tonnen gerechnet: Die Brenndauer wird tausendmal zu kurz.</li>
    <li>Beim freien Fall das Vorzeichen von ½gΔt² vertauscht: v<sub>0</sub> ist dann um g·Δt falsch.</li>
    <li>In der Ellipse mit √(μ/r) gerechnet: Das ist nur auf dem Kreis die Bahngeschwindigkeit.</li></ul>` });
