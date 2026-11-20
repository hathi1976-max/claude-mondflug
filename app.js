'use strict';
/* Mondflug – Physik-Lernspiel.
   Missionsbriefing, Phase 2 (Umlaufbahn), Phase 3 (Mondtransfer), Phase 4 (Mondeinfang),
   Cockpit, Bordhandbuch, Rechenblock, Funk mit Sprachausgabe.
   Phase 5 (Landung) und Phase 6 (Rückflug) stehen in rueckflug.js. */

// ================= Konstanten (SI-Einheiten) =================
const C = {
  G: 6.674e-11,
  muE: 3.986e14,        // G·M Erde  [m³/s²]
  muM: 4.905e12,        // G·M Mond  [m³/s²]
  RE: 6371e3,           // Erdradius [m]
  RM: 1737e3,           // Mondradius [m]
  D: 384400e3,          // Abstand Erde–Mond [m]
  TM: 27.32 * 86400,    // siderische Umlaufzeit des Mondes [s]
  SOI: 66100e3,         // Einflussbereich des Mondes [m]
  ATMO: 120e3,          // Höhe, unter der die Atmosphäre das Schiff einfängt [m]
};
C.nM = 2 * Math.PI / C.TM;
const SHIP = { mDry: 15000, ve: 3100, dvStart: 5450 };
SHIP.m0 = SHIP.mDry * Math.exp(SHIP.dvStart / SHIP.ve);
const LM = { mDry: 6500, ve: 3050, dvStart: 2100, F: 26000 }; // Landefähre (Abstiegsstufe)
LM.m0 = LM.mDry * Math.exp(LM.dvStart / LM.ve);
const H_LEO = 200e3, R1 = C.RE + H_LEO;

// ================= Hilfsfunktionen =================
const $ = s => document.querySelector(s);
const fmt = (x, d = 0) => Number.isFinite(x)
  ? x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const deg = r => r * 180 / Math.PI, rad = d => d * Math.PI / 180;
const norm360 = a => ((a % 360) + 360) % 360;
function parseNum(s) {
  if (s == null) return NaN;
  s = String(s).trim().replace(/\s/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return Number(s);
}
function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function load(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function metStr(t) {
  t = Math.max(0, Math.floor(t));
  const d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
  return `${d} T ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ================= Spielzustand =================
const S = {
  level: load('mf_level', 'kadett'), phase: 0, met: 0, m: SHIP.m0, log: [], funk: load('mf_funk', false),
  speed: 1, rand: null, snap: null, moonA0: 2.2, moonT0: 0, p: {},
  veh: 'csm', mLM: 0, ideal: { csm: 0, lm: 0 }, lmExtra: 0, land: null, orbitR: null,
};
const isLM = () => S.veh === 'lm';
const veh = () => isLM() ? LM : SHIP;
const mNow = () => isLM() ? S.mLM : S.m;
const dvReserve = () => veh().ve * Math.log(mNow() / veh().mDry);
function burn(dv) {
  if (dv > dvReserve() + 1e-6) return false;
  const f = Math.exp(-Math.abs(dv) / veh().ve);
  if (isLM()) S.mLM *= f; else S.m *= f;
  return true;
}

// ================= Physik =================
function moonAngle(t) { return S.moonA0 + C.nM * (t - S.moonT0); }
function moonPos(t) { const a = moonAngle(t); return [C.D * Math.cos(a), C.D * Math.sin(a)]; }

const accE = s => { const r3 = Math.pow(s[0] * s[0] + s[1] * s[1], 1.5); return [-C.muE * s[0] / r3, -C.muE * s[1] / r3]; };
const accM = s => { const r3 = Math.pow(s[0] * s[0] + s[1] * s[1], 1.5); return [-C.muM * s[0] / r3, -C.muM * s[1] / r3]; };
function acc3(s, t) {
  const m = moonPos(t), dx = s[0] - m[0], dy = s[1] - m[1];
  const rE3 = Math.pow(s[0] * s[0] + s[1] * s[1], 1.5), rM3 = Math.pow(dx * dx + dy * dy, 1.5);
  return [-C.muE * s[0] / rE3 - C.muM * dx / rM3, -C.muE * s[1] / rE3 - C.muM * dy / rM3];
}
function rk4(s, t, dt, acc) {
  const d = (st, tt) => { const a = acc(st, tt); return [st[2], st[3], a[0], a[1]]; };
  const k1 = d(s, t);
  const k2 = d(s.map((v, i) => v + dt / 2 * k1[i]), t + dt / 2);
  const k3 = d(s.map((v, i) => v + dt / 2 * k2[i]), t + dt / 2);
  const k4 = d(s.map((v, i) => v + dt * k3[i]), t + dt);
  return s.map((v, i) => v + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}
/* Bahn numerisch fortschreiben. dir = -1 rechnet rückwärts in der Zeit. */
function propagate(s0, t0, { acc, dtFn, stop, tMax, dir = 1, each }) {
  let s = s0.slice(), t = t0;
  const pts = [{ t, x: s[0], y: s[1], vx: s[2], vy: s[3] }];
  let n = 0;
  while (Math.abs(t - t0) < tMax && n++ < 200000) {
    const dt = Math.min(dtFn(s, t), tMax - Math.abs(t - t0) + 1e-9) * dir;
    s = rk4(s, t, dt, acc); t += dt;
    pts.push({ t, x: s[0], y: s[1], vx: s[2], vy: s[3] });
    if (each) each(s, t);
    const r = stop && stop(s, t);
    if (r) return { pts, stop: r, s, t };
  }
  return { pts, stop: null, s, t };
}
function elements(x, y, vx, vy, mu) {
  const r = Math.hypot(x, y), v2 = vx * vx + vy * vy;
  const eps = v2 / 2 - mu / r, h = x * vy - y * vx;
  const e = Math.sqrt(Math.max(0, 1 + 2 * eps * h * h / (mu * mu)));
  const rp = h * h / mu / (1 + e);
  const a = eps < 0 ? -mu / (2 * eps) : Infinity;
  const ra = eps < 0 ? a * (1 + e) : Infinity;
  return { r, v: Math.sqrt(v2), eps, e, rp, ra, a };
}
function shipWorld() { // Schiff in Erdkoordinaten
  if (!ship) return null;
  if (ship.frame === 'E') return ship;
  const m = moonPos(S.met);
  return { x: ship.x + m[0], y: ship.y + m[1] };
}

// ================= Idealwerte (für Bewertung und Handbuch) =================
const IDEAL = {};
(function () {
  IDEAL.v1 = Math.sqrt(C.muE / R1);
  IDEAL.aT = (R1 + C.D) / 2;
  IDEAL.dvTLI = IDEAL.v1 * (Math.sqrt(2 * C.D / (R1 + C.D)) - 1);
  IDEAL.tT = Math.PI * Math.sqrt(IDEAL.aT ** 3 / C.muE);
  IDEAL.theta = 180 - 360 * IDEAL.tT / C.TM;
  const vApo = Math.sqrt(C.muE * (2 / C.D - 1 / IDEAL.aT));
  IDEAL.vInf = C.nM * C.D - vApo;
})();

// ================= Funk & Sprachausgabe =================
let audioCtx = null;
function tone(freq, ms) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = freq; g.gain.value = 0.06;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + ms / 1000);
  } catch (e) {}
}
let deVoice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  deVoice = vs.find(v => /^de/i.test(v.lang) && /katja|hedda|anna|petra/i.test(v.name))
    || vs.find(v => /^de/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
const funkLog = [];
function funk(text, spoken) {
  $('#funktext').textContent = text;
  funkLog.push({ t: S.met, text });
  if (!S.funk || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  tone(2525, 220);
  const u = new SpeechSynthesisUtterance(spoken || text);
  u.lang = 'de-DE'; if (deVoice) u.voice = deVoice; u.rate = 1.02;
  u.onend = () => tone(2475, 220);
  setTimeout(() => speechSynthesis.speak(u), 260);
}
function setFunkBtn() {
  $('#btnFunk').innerHTML = S.funk ? '🔊 <span>Funk an</span>' : '🔇 <span>Funk aus</span>';
}
$('#btnFunk').onclick = () => {
  S.funk = !S.funk; store('mf_funk', S.funk); setFunkBtn();
  if (S.funk) funk('Funkverbindung steht. Flugleitung hört mit.');
  else if ('speechSynthesis' in window) speechSynthesis.cancel();
};

// ================= Zeichnen =================
const cv = $('#cv'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
const view = { mode: 'erde', fit: 2 * C.RE, fitTarget: 2 * C.RE, auto: null };
let tracks = [], ship = null, anim = null, markers = [], overlays = [];
const stars = Array.from({ length: 260 }, () => ({ x: Math.random(), y: Math.random(), b: Math.random() ** 3 }));

function resize() {
  DPR = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  W = r.width; H = r.height;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
new ResizeObserver(resize).observe(cv);

const scale = () => Math.min(W, H * 0.92) / 2 / view.fit;
const toScr = (x, y) => { const sc = scale(); return [W / 2 + x * sc, H / 2 + 14 - y * sc]; };
const viewFrame = () => view.mode === 'mond' ? 'M' : 'E';

function drawBody(x, y, r, kind) {
  const [sx, sy] = toScr(x, y), R = Math.max(kind === 'E' ? 4 : 3, r * scale());
  const g = ctx.createRadialGradient(sx - R * .35, sy - R * .35, R * .1, sx, sy, R);
  if (kind === 'E') { g.addColorStop(0, '#7cc4ff'); g.addColorStop(.6, '#1d5fbf'); g.addColorStop(1, '#0b2a5c'); }
  else { g.addColorStop(0, '#e5e5e5'); g.addColorStop(.7, '#9a9a9a'); g.addColorStop(1, '#4a4a4a'); }
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, R, 0, 2 * Math.PI); ctx.fill();
  if (kind === 'E' && view.mode === 'erde') { // Atmosphärengrenze
    ctx.strokeStyle = 'rgba(103,232,249,.25)'; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.arc(sx, sy, (C.RE + C.ATMO) * scale(), 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
  }
}
function drawTrack(tr) {
  if (tr.frame !== viewFrame()) return;
  ctx.strokeStyle = tr.color; ctx.lineWidth = tr.width || 1.6; ctx.setLineDash(tr.dash ? [6, 6] : []);
  ctx.beginPath();
  let first = true;
  for (const p of tr.pts) {
    if (tr.progressive && p.t > S.met) break;
    const [sx, sy] = toScr(p.x, p.y);
    if (first) { ctx.moveTo(sx, sy); first = false; } else ctx.lineTo(sx, sy);
  }
  if (tr.progressive && ship && ship.frame === tr.frame) { const [sx, sy] = toScr(ship.x, ship.y); ctx.lineTo(sx, sy); }
  ctx.stroke(); ctx.setLineDash([]);
}
function drawShip() {
  if (!ship || ship.frame !== viewFrame()) return;
  const [sx, sy] = toScr(ship.x, ship.y);
  const a = Math.atan2(-(ship.vy || 0), ship.vx || 1);
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(a);
  ctx.fillStyle = '#ffb84d'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, 5); ctx.lineTo(-3, 0); ctx.lineTo(-6, -5); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,184,77,.35)'; ctx.beginPath(); ctx.arc(sx, sy, 13, 0, 2 * Math.PI); ctx.stroke();
}
function drawMarker(mk) {
  if (mk.frame !== viewFrame()) return;
  const [sx, sy] = toScr(mk.x, mk.y), k = (performance.now() / 120) % 6;
  ctx.strokeStyle = mk.color || '#ff5f5f'; ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5;
    ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * 5, sy + Math.sin(a) * 5);
    ctx.lineTo(sx + Math.cos(a) * (12 + k * 2), sy + Math.sin(a) * (12 + k * 2)); ctx.stroke();
  }
  if (mk.label) { ctx.fillStyle = '#ffd0d0'; ctx.font = '12px system-ui'; ctx.fillText(mk.label, sx + 14, sy - 12); }
}
function drawPhaseAngle() {
  // Phasenwinkel zwischen Schiff und Mond (nur Phase 3 vor der Zündung)
  const sw = shipWorld(); if (!sw) return;
  const m = moonPos(S.met), aS = Math.atan2(sw.y, sw.x), aM = Math.atan2(m[1], m[0]);
  const [cx, cy] = toScr(0, 0), R = C.D * scale();
  ctx.strokeStyle = 'rgba(255,184,77,.5)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(aS) * R, cy - Math.sin(aS) * R); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy); const [mx, my] = toScr(m[0], m[1]); ctx.lineTo(mx, my); ctx.stroke();
  ctx.setLineDash([]);
  const lead = norm360(deg(aM - aS));
  ctx.strokeStyle = '#ffb84d'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.32, -aS, -aS - rad(lead), true); ctx.stroke();
  const am = aS + rad(lead / 2);
  ctx.fillStyle = '#ffb84d'; ctx.font = 'bold 13px system-ui';
  ctx.fillText(`θ = ${fmt(lead, 1)}°`, cx + Math.cos(am) * R * 0.38 - 20, cy - Math.sin(am) * R * 0.38);
}
function draw(dt) {
  if (view.auto) view.fitTarget = view.auto();
  view.fit *= Math.pow(view.fitTarget / view.fit, Math.min(1, dt * 2.5));
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#02040a'; ctx.fillRect(0, 0, W, H);
  for (const s of stars) { ctx.fillStyle = `rgba(220,230,255,${0.25 + s.b * 0.75})`; ctx.fillRect(s.x * W, s.y * H, s.b > .6 ? 2 : 1, s.b > .6 ? 2 : 1); }
  if (view.mode === 'lande') return drawLanding();
  if (view.mode === 'stern') return drawSextant();
  if (view.mode === 'mond') {
    drawBody(0, 0, C.RM, 'M');
    ctx.fillStyle = 'rgba(132,148,180,.8)'; ctx.font = '12px system-ui'; ctx.fillText('Mond', ...toScr(C.RM * 1.05, C.RM * 1.05));
  } else {
    if (view.mode === 'system') {
      const [cx, cy] = toScr(0, 0);
      ctx.strokeStyle = 'rgba(132,148,180,.25)'; ctx.setLineDash([2, 6]);
      ctx.beginPath(); ctx.arc(cx, cy, C.D * scale(), 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
      const m = moonPos(S.met); drawBody(m[0], m[1], C.RM, 'M');
      ctx.fillStyle = 'rgba(132,148,180,.9)'; ctx.font = '12px system-ui';
      const [mx, my] = toScr(m[0], m[1]); ctx.fillText('Mond', mx + 8, my - 8);
      if (S.phase === 3 && S.p.preBurn) drawPhaseAngle();
    }
    drawBody(0, 0, C.RE, 'E');
  }
  tracks.forEach(drawTrack);
  markers.forEach(drawMarker);
  drawShip();
  // Maßstab
  const sc = scale(), target = 100;
  let km = view.fit / 1000 * target / (Math.min(W, H) / 2);
  const p10 = Math.pow(10, Math.floor(Math.log10(km))); km = [1, 2, 5, 10].map(k => k * p10).find(k => k >= km) || km;
  const len = km * 1000 * sc;
  ctx.strokeStyle = '#8494b4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(14, H - 16); ctx.lineTo(14 + len, H - 16); ctx.stroke();
  ctx.fillStyle = '#8494b4'; ctx.font = '11px system-ui'; ctx.fillText(`${fmt(km)} km`, 14, H - 22);
}

// ================= Animation =================
function startAnim(o) {
  anim = Object.assign({ i: 0, events: [] }, o);
  anim.t = o.tStart ?? o.pts[0].t;
  anim.tEnd = o.tEnd ?? o.pts[o.pts.length - 1].t;
  anim.events = anim.events.slice().sort((a, b) => a.t - b.t);
}
function stepAnim(dtReal) {
  if (!anim) { $('#warpinfo').textContent = S.land && S.land.run ? `Echtzeit ×${fmt(3 * S.speed)}` : ''; return; }
  if (anim.paused) { $('#warpinfo').textContent = 'Zeitraffer angehalten'; return; }
  const w = anim.warpFn ? anim.warpFn(anim.t) : anim.warp;
  $('#warpinfo').textContent = `Zeitraffer ×${fmt(w * S.speed)}`;
  anim.t = Math.min(anim.tEnd, anim.t + dtReal * w * S.speed);
  const P = anim.pts;
  while (anim.i < P.length - 2 && P[anim.i + 1].t <= anim.t) anim.i++;
  const a = P[anim.i], b = P[Math.min(anim.i + 1, P.length - 1)];
  const f = b.t > a.t ? Math.min(1, Math.max(0, (anim.t - a.t) / (b.t - a.t))) : 0;
  ship = { frame: anim.frame, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, vx: a.vx + (b.vx - a.vx) * f, vy: a.vy + (b.vy - a.vy) * f };
  S.met = anim.t;
  while (anim.events.length && anim.events[0].t <= anim.t) anim.events.shift().fn();
  if (anim && anim.t >= anim.tEnd) { const d = anim.onDone; anim = null; if (d) d(); }
}
$('#btnSpeed').onclick = () => {
  const seq = [0.5, 1, 2, 4]; S.speed = seq[(seq.indexOf(S.speed) + 1) % seq.length];
  $('#btnSpeed').textContent = `⏩ ×${String(S.speed).replace('.', ',')}`;
};

// ================= Cockpit =================
// Bahn des Schiffs relativ zum maßgeblichen Körper (Cockpit und Rechenblock)
function flightState() {
  let rel, mu, R, refName;
  const sw = shipWorld(), m = moonPos(S.met);
  const dE = Math.hypot(sw.x, sw.y), dM = Math.hypot(sw.x - m[0], sw.y - m[1]);
  if (ship.frame === 'M') { rel = ship; mu = C.muM; R = C.RM; refName = 'Mond'; }
  else if (S.phase === 3 && dM < C.SOI) {
    const a = moonAngle(S.met), w = C.nM * C.D;
    rel = { x: sw.x - m[0], y: sw.y - m[1], vx: ship.vx + w * Math.sin(a), vy: ship.vy - w * Math.cos(a) };
    mu = C.muM; R = C.RM; refName = 'Mond';
  } else { rel = ship; mu = C.muE; R = C.RE; refName = 'Erde'; }
  return { sw, mu, R, refName, dE, dM, el: elements(rel.x, rel.y, rel.vx, rel.vy, mu) };
}
let ckTimer = 0;
function updateCockpit() {
  $('#met').textContent = metStr(S.met);
  const dvr = dvReserve(), V = veh();
  $('.ck-title').textContent = isLM() ? 'COCKPIT · LANDEFÄHRE' : 'COCKPIT · RAUMSCHIFF';
  $('#iFuel').textContent = fmt(mNow() - V.mDry);
  $('#iMass').textContent = fmt(mNow());
  $('#iDv').textContent = fmt(dvr);
  $('#iDvBar').style.width = Math.max(0, Math.min(100, dvr / V.dvStart * 100)) + '%';
  $('#iDvBar').style.background = dvr < 150 ? 'var(--red)' : dvr < 600 ? 'var(--amber)' : 'var(--green)';
  $('#wFuel').classList.toggle('on', S.phase >= 2 && dvr < (isLM() ? 60 : 150));
  if (S.land) { landCockpit(); return; }
  $('#iAlt').nextElementSibling.textContent = 'km';
  if (!ship) return;
  const { sw, mu, R, refName, dE, dM, el } = flightState();
  $('#iRef').textContent = refName;
  $('#iAlt').textContent = fmt((el.r - R) / 1000, el.r - R < 1e7 ? 1 : 0);
  $('#iVel').textContent = fmt(el.v, 1);
  $('#iDE').textContent = fmt(dE / 1000);
  $('#iDM').textContent = fmt(dM / 1000);
  const moon = refName === 'Mond';
  $('#lPeri').textContent = moon ? 'Perilun (Höhe)' : 'Perigäum (Höhe)';
  $('#lApo').textContent = moon ? 'Apolun (Höhe)' : 'Apogäum (Höhe)';
  $('#iPeri').textContent = fmt((el.rp - R) / 1000, 0);
  $('#iApo').textContent = Number.isFinite(el.ra) ? fmt((el.ra - R) / 1000, 0) : '∞';
  const lead = norm360(deg(moonAngle(S.met) - Math.atan2(sw.y, sw.x)));
  $('#iPhase').textContent = ship.frame === 'E' && S.phase >= 3 ? fmt(lead, 1) : '—';
  $('#wAtmo').classList.toggle('on', refName === 'Erde' && el.rp - C.RE < C.ATMO && S.phase !== 6);
  $('#wHit').classList.toggle('on', ship.frame === 'M' && el.rp < C.RM);
  $('#wEsc').classList.toggle('on', el.eps >= 0 && S.phase !== 3 && S.phase !== 6);
  if (S.p.blind) ['#iAlt', '#iVel', '#iDE', '#iDM', '#iPeri', '#iApo'].forEach(id => { $(id).textContent = '—'; });
}
document.querySelectorAll('.inst').forEach(el => el.onclick = () => openHandbook(el.dataset.k));

// ================= Hauptschleife =================
let lastT = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  stepAnim(dt);
  if (S.land && S.land.run) stepLanding(dt);
  draw(dt);
  ckTimer += dt; if (ckTimer > 0.1) { ckTimer = 0; updateCockpit(); }
  requestAnimationFrame(loop);
}

// ================= Aufgabenfeld =================
const task = $('#task');
function setTask(html) { task.innerHTML = html; task.scrollTop = 0; }
function phaseTag(t) { $('#hdrPhase').textContent = t; }
function hbLink(k, txt) { return `<span class="link" data-hb="${k}">${txt}</span>`; }
task.addEventListener('click', e => { const k = e.target.dataset && e.target.dataset.hb; if (k) openHandbook(k); });
function snapshot() { S.snap = { m: S.m, mLM: S.mLM, veh: S.veh, met: S.met, logLen: S.log.length, ideal: { ...S.ideal }, lmExtra: S.lmExtra }; }
function restore() {
  Object.assign(S, { m: S.snap.m, mLM: S.snap.mLM, veh: S.snap.veh, met: S.snap.met, ideal: { ...S.snap.ideal }, lmExtra: S.snap.lmExtra, land: null });
  S.log.length = S.snap.logLen; anim = null; orbitTok = null;
}

function addLog(e) { S.log.push(Object.assign({ met: S.met }, e)); }

function resultTable(rows) {
  return `<table class="res">${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>`;
}
function failCard(title, why, kap, retry) {
  setTask(`<h2 class="bad">✖ ${title}</h2><p>${why}</p>
    <p>Nachlesen: ${hbLink(kap, 'Bordhandbuch')}</p>
    <div class="btnrow"><button class="primary" id="bRetry">Phase wiederholen</button>
    <button id="bLogF">Tagebuch</button></div>`);
  $('#bRetry').onclick = () => { restore(); markers = []; retry(); };
  $('#bLogF').onclick = openLog;
}
function getInput(id) { return parseNum($(id).value); }
function errMsg(t) { $('#err').textContent = t; }

// ---------- Phase 1 (verkürzt): Aufstieg ----------
function launch() {
  S.met = 0; S.m = SHIP.m0; S.log = []; markers = []; tracks = [];
  Object.assign(S, { veh: 'csm', mLM: 0, ideal: { csm: 0, lm: 0 }, lmExtra: 0, land: null, orbitR: null, p: {}, vTouch: null,
    stoer: load('mf_stoer', false) ? rollStoer() : null, stoerDone: [] });
  S.rand = {
    v0: 7350 + 10 * Math.floor(Math.random() * 11),
    hp: 95 + Math.floor(Math.random() * 36),
    lead0: IDEAL.theta + 140 + Math.random() * 120,
  };
  view.mode = 'erde'; view.auto = null; view.fitTarget = view.fit = 1.9 * C.RE;
  S.phase = 1; phaseTag('Phase 1 · Aufstieg');
  setTask(`<h2>Phase 1 · Aufstieg</h2><p>Die Trägerrakete bringt Sie auf 200 km Höhe.
    Diese Phase fliegt der Bordcomputer.</p><p>Ab Brennschluss übernehmen Sie.</p>`);
  const pts = [], T = 720, N = 80;
  for (let i = 0; i <= N; i++) {
    const f = i / N, a = -0.55 * (1 - f) ** 1.3, r = C.RE + H_LEO * (1 - (1 - f) ** 2);
    pts.push({ t: f * T, x: r * Math.cos(a), y: r * Math.sin(a), vx: 1, vy: 2 - f * 2 + 0.01 });
  }
  tracks = [{ pts, frame: 'E', color: '#ffb84d', progressive: true }];
  startAnim({ pts, frame: 'E', warp: T / 5, onDone: setupP2 });
  setTimeout(() => funk('Flugleitung an Kommandant: Sie haben Startfreigabe.'), 300);
}

// ---------- Phase 2: Umlaufbahn ----------
function setupP2() {
  S.phase = 2; phaseTag('Phase 2 · Umlaufbahn'); S.met = 720; snapshot();
  view.mode = 'erde'; view.auto = null; view.fitTarget = 1.9 * C.RE;
  const v0 = S.rand.v0;
  ship = { frame: 'E', x: R1, y: 0, vx: 0, vy: v0 };
  const pre = propagate([R1, 0, 0, v0], S.met, {
    acc: accE, dtFn: () => 10, tMax: 6000, stop: s => Math.hypot(s[0], s[1]) < C.RE + 60e3 ? 'atmo' : null,
  });
  tracks = [{ pts: pre.pts, frame: 'E', color: 'rgba(255,95,95,.6)', dash: true }];
  funk(`Brennschluss Oberstufe. Höhe 200 Kilometer, Geschwindigkeit ${v0} Meter pro Sekunde. Das reicht nicht für eine Umlaufbahn.`);
  const L = S.level;
  let body = `<h2>Phase 2 · In die Umlaufbahn</h2>
    <p>Die Oberstufe ist ausgebrannt. Ohne weitere Zündung fällt das Schiff zurück in die Atmosphäre (rote gestrichelte Bahn).</p>
    <div class="given"><div><span>Höhe h</span><span>200 km</span></div>
    <div><span>Geschwindigkeit v<sub>ist</sub> (waagerecht)</span><span>${fmt(v0)} m/s</span></div>
    ${L !== 'kommandant' ? `<div><span>Erdradius R<sub>E</sub></span><span>6.371 km</span></div>
    <div><span>μ<sub>E</sub> = G·M<sub>Erde</sub></span><span>3,986·10¹⁴ m³/s²</span></div>` : ''}</div>
    <p><b>Aufgabe:</b> Um wie viel müssen Sie beschleunigen (Δv), damit Sie auf einer Kreisbahn in 200 km Höhe fliegen?</p>`;
  if (L === 'kadett') body += `<ol class="steps">
      <li>Bahnradius vom Erd<b>mittelpunkt</b>: <span class="f">r = R<sub>E</sub> + h</span> (in Metern!)</li>
      <li>Kreisbahngeschwindigkeit: <span class="f">v<sub>kreis</sub> = √(μ<sub>E</sub> / r)</span></li>
      <li>Zuwachs: <span class="f">Δv = v<sub>kreis</sub> − v<sub>ist</sub></span></li></ol>`;
  if (L === 'pilot') body += `<p>Hilfe: ${hbLink('k2', 'Handbuch, Kapitel 2 · Kreisbahn')}</p>`;
  body += `<div class="inrow"><label>Δv</label><input id="in1" inputmode="decimal" autocomplete="off"><span>m/s</span></div>
    <div class="msg-err" id="err"></div>
    <div class="btnrow"><button class="go" id="bFire">ZÜNDEN</button></div>`;
  setTask(body);
  $('#bFire').onclick = fireP2;
  $('#in1').onkeydown = e => { if (e.key === 'Enter') fireP2(); };
}
function fireP2() {
  const dv = getInput('#in1');
  if (!Number.isFinite(dv) || dv <= 0) return errMsg('Bitte einen positiven Wert in m/s eingeben.');
  if (!burn(dv)) return errMsg(`So viel Treibstoff haben Sie nicht. Reserve: ${fmt(dvReserve())} m/s.`);
  const v0 = S.rand.v0, v = v0 + dv, ideal = Math.sqrt(C.muE / R1) - v0, err = dv - ideal;
  const el = elements(R1, 0, 0, v, C.muE);
  const crash = el.rp - C.RE < C.ATMO, esc = el.eps >= 0;
  funk(`Zündung. Delta v ${Math.round(dv)} Meter pro Sekunde.`);
  setTask(`<h2>Phase 2 · Zündung</h2><p>Triebwerk brennt … Beobachten Sie die Bahn.</p>`);
  const T = esc ? 20000 : 2 * Math.PI * Math.sqrt(el.a ** 3 / C.muE);
  const res = propagate([R1, 0, 0, v], S.met, {
    acc: accE, dtFn: () => 10, tMax: Math.min(T, 20000),
    stop: s => { const r = Math.hypot(s[0], s[1]); return r < C.RE + 70e3 ? 'atmo' : r > 8 * C.RE ? 'esc' : null; },
  });
  tracks.push({ pts: res.pts, frame: 'E', color: '#ffb84d', progressive: true });
  if (esc || el.ra > 4 * C.RE) view.fitTarget = 8 * C.RE;
  startAnim({
    pts: res.pts, frame: 'E', warp: (res.pts.at(-1).t - res.pts[0].t) / 6,
    onDone: () => {
      const entry = { phase: '2 · Umlaufbahn', gesucht: 'Δv für Kreisbahn', eingabe: dv, richtig: ideal, einheit: 'm/s', kap: 'k2' };
      if (crash) {
        const p = res.pts.at(-1); markers.push({ frame: 'E', x: p.x, y: p.y, label: 'Wiedereintritt' });
        entry.folge = `Perigäum ${fmt((el.rp - C.RE) / 1000)} km – Absturz`; addLog(entry);
        funk('Flugleitung: Wir verlieren Sie. Bahn zu niedrig, Schiff tritt in die Atmosphäre ein.');
        return failCard('Absturz in die Atmosphäre',
          `Mit ${fmt(v)} m/s liegt der erdnächste Punkt Ihrer Bahn nur ${fmt((el.rp - C.RE) / 1000)} km hoch. Unter ${C.ATMO / 1000} km bremst die Luft das Schiff ab. Sie haben zu wenig beschleunigt.`,
          'k2', setupP2);
      }
      if (esc) {
        entry.folge = 'Fluchtbahn – Schiff verlässt die Erde'; addLog(entry);
        return failCard('Fluchtbahn', `Mit ${fmt(v)} m/s sind Sie schneller als die Fluchtgeschwindigkeit. Das Schiff verlässt die Erde.`, 'k3', setupP2);
      }
      const cost = Math.abs(err) < 0.5 ? 0 : Math.abs(err) + Math.max(0, -err); // Fehlbetrag nachschieben plus Verlust
      let costTxt = 'keine';
      if (cost > 0) {
        if (!burn(cost)) { entry.folge = 'Treibstoff reicht nicht für Bahnangleich'; addLog(entry); return failCard('Treibstoff erschöpft', 'Die Bahnkorrektur übersteigt Ihre Reserve.', 'k7', setupP2); }
        costTxt = `${fmt(cost, 1)} m/s`;
      }
      entry.folge = cost ? `Ellipse ${fmt((el.rp - C.RE) / 1000)}–${fmt((el.ra - C.RE) / 1000)} km, Angleich ${fmt(cost, 1)} m/s` : 'Kreisbahn getroffen';
      entry.kosten = cost; addLog(entry); S.ideal.csm += ideal;
      funk(cost ? `Umlaufbahn erreicht. Bordcomputer gleicht die Bahn an, Kosten ${Math.round(cost)} Meter pro Sekunde.` : 'Perfekte Kreisbahn. Gut gemacht, Kommandant.');
      setTask(`<h2 class="ok">✔ Umlaufbahn erreicht</h2>
        ${resultTable([['Ihr Δv', fmt(dv, 1) + ' m/s'], ['Richtiges Δv', fmt(ideal, 1) + ' m/s'], ['Abweichung', fmt(err, 1) + ' m/s'],
        ['Bahn', `${fmt((el.rp - C.RE) / 1000)} × ${fmt((el.ra - C.RE) / 1000)} km`], ['Angleich auf 200-km-Kreis', costTxt], ['Δv-Reserve', fmt(dvReserve()) + ' m/s']])}
        <p>Lösungsweg: r = 6.571.000 m, v<sub>kreis</sub> = √(3,986·10¹⁴ / 6,571·10⁶) = ${fmt(Math.sqrt(C.muE / R1), 1)} m/s, Δv = ${fmt(ideal, 1)} m/s.</p>
        <div class="btnrow"><button class="primary" id="bNext">Weiter zu Phase 3 · Mondtransfer</button></div>`);
      $('#bNext').onclick = setupP3;
    },
  });
}

// ---------- Phase 3: Mondtransfer ----------
const wS = Math.sqrt(C.muE / R1 ** 3);
function setupP3() {
  S.phase = 3; phaseTag('Phase 3 · Mondtransfer');
  if (S.met < 3600) S.met = 3600;
  snapshot();
  S.moonT0 = S.met; S.moonA0 = rad(S.rand.lead0); S.p = { preBurn: true, t0: S.met };
  view.mode = 'system'; view.auto = null; view.fitTarget = 1.12 * C.D; view.fit = 0.2 * C.D;
  ship = { frame: 'E', x: R1, y: 0, vx: 0, vy: IDEAL.v1 };
  const circ = [];
  for (let i = 0; i <= 120; i++) { const a = i / 120 * 2 * Math.PI; circ.push({ t: 0, x: R1 * Math.cos(a), y: R1 * Math.sin(a) }); }
  tracks = [{ pts: circ, frame: 'E', color: 'rgba(255,184,77,.6)' }];
  markers = [];
  funk('Flugleitung: Umlaufbahn stabil. Bereiten Sie die Zündung zum Mond vor.');
  const L = S.level;
  let body = `<h2>Phase 3 · Zündung zum Mond</h2>
    <p>Sie kreisen in 200 km Höhe. Eine Zündung in Flugrichtung streckt die Bahn zu einer Ellipse (Hohmann-Transfer).
    Ihr erdfernster Punkt soll auf der Mondbahn liegen.</p>
    <div class="given"><div><span>r<sub>1</sub> (Kreisbahn)</span><span>6.571 km</span></div>
    <div><span>r<sub>2</sub> (Mondbahn)</span><span>384.400 km</span></div>
    ${L !== 'kommandant' ? `<div><span>μ<sub>E</sub></span><span>3,986·10¹⁴ m³/s²</span></div>` : ''}
    ${L !== 'kadett' ? `<div><span>Umlaufzeit Mond T</span><span>27,32 Tage</span></div>` : ''}</div>`;
  if (L === 'kadett') {
    body += `<p><b>Aufgabe:</b> Berechnen Sie das Δv der Transferzündung. Den Zündzeitpunkt wählt der Bordcomputer.</p>
      <ol class="steps"><li><span class="f">v<sub>1</sub> = √(μ<sub>E</sub> / r<sub>1</sub>)</span></li>
      <li><span class="f">Δv = v<sub>1</sub> · ( √(2·r<sub>2</sub> / (r<sub>1</sub>+r<sub>2</sub>)) − 1 )</span></li></ol>`;
  } else {
    body += `<p><b>Aufgabe:</b> Berechnen Sie (1) das Δv der Transferzündung und (2) den Phasenwinkel θ, um den der Mond beim Zünden vorauslaufen muss.
      So ist er bei Ihrer Ankunft am erdfernsten Punkt genau dort.</p>`;
    if (L === 'pilot') body += `<p>Hilfe: ${hbLink('k4', 'Kapitel 4 · Hohmann-Transfer')} und ${hbLink('k5', 'Kapitel 5 · Phasenwinkel')}</p>`;
  }
  body += `<div class="warnbox">⚠ Hier zählt Genauigkeit: 1 m/s Fehler verschiebt den erdfernsten Punkt um rund 4.000 km. Rechnen Sie mit mindestens 5 gültigen Stellen.</div>
    <div class="inrow"><label>Δv</label><input id="in1" inputmode="decimal" autocomplete="off"><span>m/s</span></div>
    ${L !== 'kadett' ? `<div class="inrow"><label>Phasenwinkel θ</label><input id="in2" inputmode="decimal" autocomplete="off"><span>°</span></div>` : ''}
    <div class="msg-err" id="err"></div>
    <div class="btnrow"><button class="go" id="bFire">ZÜNDUNG PROGRAMMIEREN</button></div>`;
  setTask(body);
  $('#bFire').onclick = fireP3;
}
function fireP3() {
  const L = S.level, dv = getInput('#in1');
  let th = L === 'kadett' ? IDEAL.theta : getInput('#in2');
  if (!Number.isFinite(dv) || dv <= 0) return errMsg('Bitte ein positives Δv in m/s eingeben.');
  if (!Number.isFinite(th)) return errMsg('Bitte den Phasenwinkel in Grad eingeben.');
  th = norm360(th);
  if (dv > dvReserve()) return errMsg(`So viel Treibstoff haben Sie nicht. Reserve: ${fmt(dvReserve())} m/s.`);
  const t0 = S.p.t0, lead0 = S.rand.lead0;
  const wait = rad(norm360(lead0 - th)) / (wS - C.nM), tb = t0 + wait;
  // Kreisbahn bis zur Zündung
  const coast = [];
  for (let t = t0; t < tb; t += 20) { const a = wS * (t - t0); coast.push({ t, x: R1 * Math.cos(a), y: R1 * Math.sin(a), vx: -IDEAL.v1 * Math.sin(a), vy: IDEAL.v1 * Math.cos(a) }); }
  const ab = wS * wait, v = IDEAL.v1 + dv;
  const s0 = [R1 * Math.cos(ab), R1 * Math.sin(ab), -v * Math.sin(ab), v * Math.cos(ab)];
  let minD = Infinity, minT = 0, soiT = null;
  const res = propagate(s0, tb, {
    acc: acc3, tMax: 8 * 86400,
    dtFn: (s, t) => {
      const m = moonPos(t), rE = Math.hypot(s[0], s[1]), rM = Math.hypot(s[0] - m[0], s[1] - m[1]);
      return Math.min(600, 0.02 * Math.min(rE * Math.sqrt(rE / C.muE), rM * Math.sqrt(rM / C.muM)));
    },
    each: (s, t) => { const m = moonPos(t), d = Math.hypot(s[0] - m[0], s[1] - m[1]); if (d < minD) { minD = d; minT = t; } if (soiT === null && d < C.SOI) soiT = t; },
    stop: (s, t) => {
      if (Math.hypot(s[0], s[1]) < C.RE) return 'erde';
      const m = moonPos(t); if (Math.hypot(s[0] - m[0], s[1] - m[1]) < C.RM) return 'mond';
      if (soiT !== null && t > soiT + 3600) return 'soi';
      return null;
    },
  });
  burn(dv);
  S.p.preBurn = false;
  const errDv = dv - IDEAL.dvTLI, errTh = L === 'kadett' ? 0 : ((th - IDEAL.theta + 540) % 360) - 180;
  const ok = minD < C.SOI;
  const cost = Math.abs(errDv) + Math.max(0, -errDv) + 20 * Math.abs(errTh);
  let pts = coast.concat(res.pts);
  let tEnd = ok ? soiT : res.pts.at(-1).t;
  if (ok) pts = pts.filter(p => p.t <= soiT + 1);
  tracks.push({ pts, frame: 'E', color: '#ffb84d', progressive: true });
  funk(`Zündung programmiert. Delta v ${Math.round(dv)}, Phasenwinkel ${Math.round(th)} Grad. Warte auf Zündzeitpunkt.`);
  setTask(`<h2>Phase 3 · Transfer</h2><p>Warten auf den Zündzeitpunkt (Mond ${fmt(th, 1)}° voraus) … danach rund fünf Tage Flug.</p>`);
  const wCoast = Math.max(1, wait / 3), wFly = (tEnd - tb) / 11;
  const events = [{ t: tb, fn: () => { funk('Zündung! Transferbahn zum Mond.'); setTask(`<h2>Phase 3 · Transfer</h2><p>Unterwegs zum Mond. Beobachten Sie Ihre Bahn und das Cockpit.</p>`); } }];
  const entry = { phase: '3 · Mondtransfer', gesucht: L === 'kadett' ? 'Δv Transfer' : 'Δv Transfer / θ',
    eingabe: L === 'kadett' ? dv : `${fmt(dv, 1)} / ${fmt(th, 1)}°`, richtig: L === 'kadett' ? IDEAL.dvTLI : `${fmt(IDEAL.dvTLI, 1)} / ${fmt(IDEAL.theta, 1)}°`,
    einheit: 'm/s', kap: 'k4' };
  if (ok && S.stoer && S.stoer.kurs) events.push({ t: tb + 1.6 * 86400, fn: stoerKurs });
  if (ok && cost >= 0.5) events.push({ t: tb + 86400, fn: () => {
    if (!burn(cost)) { S.p.fuelOut = true; return; }
    funk(`Flugleitung: Kurskorrektur ausgeführt, ${Math.round(cost)} Meter pro Sekunde.`);
  } });
  startAnim({
    pts, frame: 'E', tStart: t0, tEnd, warpFn: t => t < tb ? wCoast : wFly, events,
    onDone: () => {
      if (!ok) {
        const why = res.stop === 'erde' ? 'Das Schiff fällt zur Erde zurück.' : res.stop === 'mond' ? '' : '';
        entry.folge = `Mond verfehlt, geringster Abstand ${fmt(minD / 1000)} km`; addLog(entry);
        const p = pts.at(-1); markers.push({ frame: 'E', x: p.x, y: p.y, label: 'verfehlt', color: '#ff9f43' });
        funk('Flugleitung: Negativ. Sie verfehlen den Mond.');
        let hint = errDv < -5 ? 'Ihr Δv war zu klein: Der erdfernste Punkt liegt unterhalb der Mondbahn.'
          : errDv > 5 ? 'Ihr Δv war zu groß: Sie kreuzen die Mondbahn zu früh und zu schnell.' : '';
        if (Math.abs(errTh) > 3) hint += ` Ihr Phasenwinkel weicht um ${fmt(errTh, 1)}° ab, der Mond steht bei Ankunft woanders.`;
        return failCard('Mond verfehlt',
          `Der Mond kam Ihnen nur auf ${fmt(minD / 1000)} km nahe. Für einen Einfang müssen Sie in seinen Einflussbereich (${fmt(C.SOI / 1000)} km) gelangen. ${why} ${hint}`,
          errDv !== 0 && Math.abs(errTh) <= 3 ? 'k4' : 'k5', setupP3);
      }
      if (S.p.fuelOut) { entry.folge = 'Treibstoff reicht nicht für Kurskorrektur'; addLog(entry); return failCard('Treibstoff erschöpft', 'Die nötige Kurskorrektur übersteigt Ihre Reserve.', 'k7', setupP3); }
      entry.folge = cost >= 0.5 ? `Kurskorrektur ${fmt(cost, 1)} m/s` : 'Volltreffer, keine Korrektur'; entry.kosten = cost; addLog(entry); S.ideal.csm += IDEAL.dvTLI;
      funk('Flugleitung: Sie sind im Einflussbereich des Mondes. Bereiten Sie den Einfang vor.');
      const rows = [['Ihr Δv', fmt(dv, 1) + ' m/s'], ['Richtiges Δv', fmt(IDEAL.dvTLI, 1) + ' m/s']];
      if (L !== 'kadett') rows.push(['Ihr Phasenwinkel', fmt(th, 1) + '°'], ['Richtiger Phasenwinkel', fmt(IDEAL.theta, 1) + '°']);
      rows.push(['Kurskorrektur', cost >= 0.5 ? fmt(cost, 1) + ' m/s' : 'keine'], ['Flugzeit', fmt((tEnd - tb) / 86400, 2) + ' Tage'], ['Δv-Reserve', fmt(dvReserve()) + ' m/s']);
      setTask(`<h2 class="ok">✔ Mond erreicht</h2>${resultTable(rows)}
        <p>Lösungsweg: a = (r<sub>1</sub>+r<sub>2</sub>)/2 = ${fmt(IDEAL.aT / 1000)} km; Transferzeit t = π·√(a³/μ<sub>E</sub>) = ${fmt(IDEAL.tT / 86400, 3)} Tage;
        θ = 180° − 360°·t/T = ${fmt(IDEAL.theta, 1)}°.</p>
        <div class="btnrow"><button class="primary" id="bNext">Weiter zu Phase 4 · Mondeinfang</button></div>`);
      $('#bNext').onclick = setupP4;
    },
  });
}

// ---------- Phase 4: Mondeinfang ----------
function setupP4() {
  S.phase = 4; phaseTag('Phase 4 · Mondeinfang'); snapshot();
  const hp = S.rand.hp * 1000, rp = C.RM + hp;
  const vp = Math.sqrt(IDEAL.vInf ** 2 + 2 * C.muM / rp);
  S.p = { rp, vp, hp };
  const back = propagate([-rp, 0, 0, -vp], 0, {
    acc: accM, dir: -1, tMax: 2 * 86400,
    dtFn: s => { const r = Math.hypot(s[0], s[1]); return Math.min(300, 0.01 * r * Math.sqrt(r / C.muM)); },
    stop: s => Math.hypot(s[0], s[1]) > 30000e3 ? 'out' : null,
  });
  const tApp = -back.t, tP = S.met + tApp;
  const pts = back.pts.reverse().map(p => ({ t: p.t + tP, x: p.x, y: p.y, vx: p.vx, vy: p.vy }));
  S.p.tP = tP;
  tracks = [{ pts, frame: 'M', color: '#ffb84d', progressive: true }];
  markers = [];
  view.mode = 'mond'; view.fit = 36000e3;
  view.auto = () => ship ? Math.max(3.4 * C.RM, 1.25 * Math.hypot(ship.x, ship.y)) : 36000e3;
  setTask(`<h2>Phase 4 · Anflug auf den Mond</h2><p>Das Schiff fällt auf einer Hyperbel auf den Mond zu und wird dabei immer schneller.
    Am mondnächsten Punkt (Perilun) müssen Sie bremsen.</p>`);
  startAnim({
    pts, frame: 'M', warpFn: () => (ship ? Math.hypot(ship.x, ship.y) : 3e7) / 450,
    onDone: () => {
      ship = { frame: 'M', x: -rp, y: 0, vx: 0, vy: -vp }; S.met = tP;
      funk(`Perilun erreicht. Höhe ${S.rand.hp} Kilometer. Bremszündung vorbereiten.`);
      taskP4();
    },
  });
}
function taskP4() {
  const L = S.level, { vp, hp } = S.p;
  let body = `<h2>Phase 4 · Bremsen in die Mondumlaufbahn</h2>
    <p>Sie sind am Perilun. Ohne Zündung fliegt das Schiff am Mond vorbei, es ist schneller als die Fluchtgeschwindigkeit.</p>`;
  if (L !== 'kommandant') body += `<div class="given"><div><span>Höhe h (Cockpit)</span><span>${fmt(hp / 1000, 1)} km</span></div>
      <div><span>Geschwindigkeit v (Cockpit)</span><span>${fmt(vp, 1)} m/s</span></div>
      <div><span>Mondradius R<sub>M</sub></span><span>1.737 km</span></div>
      <div><span>μ<sub>M</sub> = G·M<sub>Mond</sub></span><span>4,905·10¹² m³/s²</span></div></div>`;
  else body += `<p>Die Werte lesen Sie im Cockpit ab.</p>`;
  body += `<p><b>Aufgabe:</b> Bremsen Sie auf eine Kreisbahn in dieser Höhe. Wie groß ist das Brems-Δv?</p>`;
  if (L === 'kadett') body += `<ol class="steps"><li><span class="f">r = R<sub>M</sub> + h</span></li>
      <li><span class="f">v<sub>kreis</sub> = √(μ<sub>M</sub> / r)</span></li><li><span class="f">Δv = v − v<sub>kreis</sub></span></li></ol>`;
  if (L === 'pilot') body += `<p>Hilfe: ${hbLink('k6', 'Kapitel 6 · Mondeinfang')}</p>`;
  body += `<div class="warnbox">⚠ Zu stark gebremst: Die Bahn sinkt unter die Mondoberfläche. Zu schwach gebremst: Sie fliegen vorbei.</div>
    <div class="inrow"><label>Brems-Δv</label><input id="in1" inputmode="decimal" autocomplete="off"><span>m/s</span></div>
    <div class="msg-err" id="err"></div>
    <div class="btnrow"><button class="go" id="bFire">BREMSZÜNDUNG</button></div>`;
  setTask(body);
  $('#bFire').onclick = fireP4;
  $('#in1').onkeydown = e => { if (e.key === 'Enter') fireP4(); };
}
function fireP4() {
  const dv = getInput('#in1');
  if (!Number.isFinite(dv) || dv <= 0) return errMsg('Bitte ein positives Δv in m/s eingeben.');
  if (!burn(dv)) return errMsg(`So viel Treibstoff haben Sie nicht. Reserve: ${fmt(dvReserve())} m/s.`);
  const { rp, vp, tP } = S.p, v = vp - dv, vc = Math.sqrt(C.muM / rp), ideal = vp - vc, err = dv - ideal;
  const el = elements(-rp, 0, 0, -v, C.muM);
  let kind = el.eps >= 0 ? 'flyby' : el.rp < C.RM + 10e3 ? 'crash' : el.ra - C.RM > 30000e3 ? 'loose' : 'ok';
  funk(`Bremszündung. Delta v ${Math.round(dv)}.`);
  setTask(`<h2>Phase 4 · Bremszündung</h2><p>Triebwerk brennt … Beobachten Sie die neue Bahn.</p>`);
  const T = el.eps < 0 ? 2 * Math.PI * Math.sqrt(el.a ** 3 / C.muM) : 86400;
  const res = propagate([-rp, 0, 0, -v], tP, {
    acc: accM, tMax: Math.min(kind === 'ok' ? 1.05 * T : T, 86400),
    dtFn: s => { const r = Math.hypot(s[0], s[1]); return Math.min(300, 0.01 * r * Math.sqrt(r / C.muM)); },
    stop: s => { const r = Math.hypot(s[0], s[1]); return r < C.RM ? 'hit' : r > 36000e3 ? 'out' : null; },
  });
  if (res.stop === 'hit') kind = 'crash';
  tracks.push({ pts: res.pts, frame: 'M', color: '#4ade80', progressive: true });
  if (kind === 'ok') view.auto = () => Math.max(3.4 * C.RM, 1.15 * el.ra);
  const entry = { phase: '4 · Mondeinfang', gesucht: 'Brems-Δv', eingabe: dv, richtig: ideal, einheit: 'm/s', kap: 'k6' };
  startAnim({
    pts: res.pts, frame: 'M', warpFn: () => (ship ? Math.hypot(ship.x, ship.y) : 3e6) / 1300,
    onDone: () => {
      if (kind === 'crash') {
        const p = res.pts.at(-1); markers.push({ frame: 'M', x: p.x, y: p.y, label: 'Aufschlag' });
        entry.folge = 'zu stark gebremst – Aufschlag'; addLog(entry);
        funk('Flugleitung: Kontakt verloren.');
        return failCard('Aufschlag auf dem Mond', `Sie haben ${fmt(err, 1)} m/s zu stark gebremst. Der mondnächste Punkt der neuen Bahn liegt ${fmt((el.rp - C.RM) / 1000)} km hoch, also unter der Oberfläche oder knapp darüber.`, 'k6', setupP4);
      }
      if (kind === 'flyby') {
        entry.folge = 'zu schwach gebremst – Vorbeiflug'; addLog(entry);
        funk('Flugleitung: Negativ, kein Einfang. Sie fliegen am Mond vorbei.');
        return failCard('Vorbeiflug', `Nach der Zündung waren Sie mit ${fmt(v, 1)} m/s noch schneller als die Fluchtgeschwindigkeit (${fmt(Math.sqrt(2 * C.muM / rp), 1)} m/s). Der Mond kann Sie nicht halten.`, 'k6', setupP4);
      }
      if (kind === 'loose') {
        entry.folge = 'Bahn reicht zu weit hinaus – Erde stört'; addLog(entry);
        return failCard('Bahn zu weit', `Eingefangen, aber das Apolun liegt ${fmt((el.ra - C.RM) / 1000)} km hoch. So weit draußen zieht die Erde das Schiff wieder heraus. Bremsen Sie stärker.`, 'k6', setupP4);
      }
      const cost = Math.abs(err) < 0.5 ? 0 : Math.abs(err) + Math.max(0, -err);
      if (cost && !burn(cost)) { entry.folge = 'Treibstoff reicht nicht für Bahnangleich'; addLog(entry); return failCard('Treibstoff erschöpft', 'Der Bahnangleich übersteigt Ihre Reserve.', 'k7', setupP4); }
      entry.folge = cost ? `Ellipse ${fmt((el.rp - C.RM) / 1000)}–${fmt((el.ra - C.RM) / 1000)} km, Angleich ${fmt(cost, 1)} m/s` : 'Kreisbahn getroffen'; entry.kosten = cost; addLog(entry); S.ideal.csm += ideal;
      funk('Flugleitung an Kommandant: Einfang bestätigt. Willkommen in der Mondumlaufbahn.');
      setTask(`<h2 class="ok">✔ Mondumlaufbahn erreicht</h2>
        ${resultTable([['Ihr Brems-Δv', fmt(dv, 1) + ' m/s'], ['Richtiges Δv', fmt(ideal, 1) + ' m/s'], ['Abweichung', fmt(err, 1) + ' m/s'],
        ['Bahn', `${fmt((el.rp - C.RM) / 1000)} × ${fmt((el.ra - C.RM) / 1000)} km`], ['Angleich auf Kreisbahn', cost ? fmt(cost, 1) + ' m/s' : 'keine'], ['Δv-Reserve', fmt(dvReserve()) + ' m/s']])}
        <p>Lösungsweg: r = ${fmt(rp / 1000, 1)} km, v<sub>kreis</sub> = √(4,905·10¹² / ${fmt(rp, 0)}) = ${fmt(vc, 1)} m/s, Δv = ${fmt(vp, 1)} − ${fmt(vc, 1)} = ${fmt(ideal, 1)} m/s.</p>
        <div class="btnrow"><button class="primary" id="bNext">Weiter zu Phase 5 · Landung</button></div>`);
      $('#bNext').onclick = setupP5;
      startOrbitLoop(rp);
      tracks.push({ pts: circlePts(rp, 0).slice(0, 361), frame: 'M', color: 'rgba(74,222,128,.7)' });
    },
  });
}
function circlePts(r, t0, a0 = Math.PI) { // Kreisbahn gegen den Uhrzeigersinn, wie die Ankunft
  const v = Math.sqrt(C.muM / r), T = 2 * Math.PI * r / v, pts = [];
  for (let k = 0; k <= 7200; k++) { const t = k * T / 360, a = a0 + 2 * Math.PI * k / 360;
    pts.push({ t: t0 + t, x: r * Math.cos(a), y: r * Math.sin(a), vx: -v * Math.sin(a), vy: v * Math.cos(a) }); }
  return pts;
}
let orbitTok = null;
function startOrbitLoop(r) { // Schiff kreist, bis eine neue Animation übernimmt
  S.orbitR = r; const tok = {}; orbitTok = tok;
  const go = () => {
    if (orbitTok !== tok) return;
    const a0 = ship && ship.frame === 'M' ? Math.atan2(ship.y, ship.x) : Math.PI;
    startAnim({ pts: circlePts(r, S.met, a0), frame: 'M', warp: 1400, onDone: go });
  };
  go();
}
function stopOrbitLoop() { orbitTok = null; anim = null; }

// ================= Modals: Handbuch, Rechenblock, Tagebuch =================
function openModal(html) { $('#modalBody').innerHTML = html; $('#overlay').classList.remove('hidden'); $('#modal').scrollTop = 0; }
function closeModal() { $('#overlay').classList.add('hidden'); }
$('#modalClose').onclick = closeModal;
$('#overlay').onclick = e => { if (e.target.id === 'overlay') closeModal(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

const HB = [
  { id: 'k1', t: '1 · Konstanten & Einheiten', h: `
    <p>Alle Formeln in diesem Handbuch rechnen in <b>SI-Einheiten</b>: Meter, Sekunden, Kilogramm. Die meisten Fehler entstehen beim Umrechnen.</p>
    <table class="ktab"><tr><th>Größe</th><th>Zeichen</th><th>Wert</th><th>im Rechenblock</th></tr>
    <tr><td>Gravitationskonstante</td><td>G</td><td>6,674·10⁻¹¹ m³/(kg·s²)</td><td>G</td></tr>
    <tr><td>G · Masse Erde</td><td>μ<sub>E</sub></td><td>3,986·10¹⁴ m³/s²</td><td>muE</td></tr>
    <tr><td>G · Masse Mond</td><td>μ<sub>M</sub></td><td>4,905·10¹² m³/s²</td><td>muM</td></tr>
    <tr><td>Erdradius</td><td>R<sub>E</sub></td><td>6.371 km</td><td>RE</td></tr>
    <tr><td>Mondradius</td><td>R<sub>M</sub></td><td>1.737 km</td><td>RM</td></tr>
    <tr><td>Abstand Erde–Mond</td><td>D</td><td>384.400 km</td><td>D</td></tr>
    <tr><td>Umlaufzeit Mond</td><td>T</td><td>27,32 Tage</td><td>TM (in s)</td></tr>
    <tr><td>Austrittsgeschwindigkeit Triebwerk</td><td>v<sub>e</sub></td><td>3.100 m/s</td><td>ve</td></tr>
    <tr><td>Trockenmasse Schiff</td><td>m<sub>leer</sub></td><td>15.000 kg</td><td>mleer</td></tr>
    <tr><td>Fallbeschleunigung Mond</td><td>g<sub>M</sub> = μ<sub>M</sub>/R<sub>M</sub>²</td><td>1,626 m/s²</td><td>gM</td></tr>
    <tr><td>Schub Landetriebwerk</td><td>F</td><td>26.000 N</td><td>F</td></tr>
    <tr><td>Landefähre: Trockenmasse / v<sub>e</sub></td><td></td><td>6.500 kg / 3.050 m/s</td><td></td></tr></table>
    <h3>Warum μ statt G·M?</h3><p>Die Bahn hängt nur vom Produkt G·M ab. Dieses Produkt lässt sich aus Satellitenbahnen sehr genau messen, G und M einzeln dagegen nicht. Mehr dazu, mit Experimenten zum Nachrechnen: <span class="link" data-hb="k12">Kapitel 12 · Wissen: Was steckt in μ?</span></p>
    <h3>Umrechnungen</h3><ul class="fehler"><li>1 km = 1.000 m → 200 km = 200.000 m = 2·10⁵ m</li><li>1 Tag = 86.400 s</li><li>Vollkreis = 360° = 2π rad</li></ul>
    <h3>Cockpitanzeigen</h3><p><b>Bezugskörper</b>: Höhe, Geschwindigkeit und Bahndaten beziehen sich auf den Körper, dessen Schwerkraft gerade überwiegt.
    Im Einflussbereich des Mondes (Kap. 6) ist das der Mond.</p>` },
  { id: 'k2', t: '2 · Kreisbahngeschwindigkeit', h: `
    <p><b>Aussage:</b> Auf einer Kreisbahn ist die Schwerkraft genau so groß wie die Kraft, die man braucht, um im Kreis zu fliegen.
    Daraus ergibt sich eine feste Geschwindigkeit je Bahnradius. Je weiter außen, desto langsamer.</p>
    <div class="formel">v<sub>kreis</sub> = √( μ / r )</div>
    <table><tr><th>Größe</th><th>Bedeutung</th><th>Einheit</th></tr>
    <tr><td>μ</td><td>G · Masse des Zentralkörpers</td><td>m³/s²</td></tr>
    <tr><td>r</td><td>Abstand vom <b>Mittelpunkt</b> des Körpers = Radius + Höhe</td><td>m</td></tr></table>
    <h3>Beispiel (300 km Höhe)</h3>
    <p>r = 6.371.000 m + 300.000 m = 6.671.000 m<br>v = √(3,986·10¹⁴ / 6,671·10⁶) = √(5,9751·10⁷) = <b>7.730 m/s</b></p>
    <h3>Typische Fehler</h3><ul class="fehler">
    <li>Höhe statt Radius: √(3,986·10¹⁴ / 300.000) ergibt 36.450 m/s, das ist unmöglich schnell.</li>
    <li>km statt m: √(3,986·10¹⁴ / 6.671) ergibt 244.000 m/s.</li>
    <li>Vorzeichen: Ist das Schiff zu langsam, ist Δv = v<sub>kreis</sub> − v<sub>ist</sub> positiv, also Zündung in Flugrichtung.</li></ul>
    <details><summary>Herleitung</summary><p>Schwerkraft = Zentripetalkraft:<br>
    <span class="f">G·M·m / r² = m·v² / r</span> → <span class="f">v² = G·M / r</span> → <span class="f">v = √(μ/r)</span>.<br>
    Die Masse des Schiffs kürzt sich heraus. Eine Feder und ein Raumschiff fliegen auf derselben Bahn gleich schnell.</p></details>` },
  { id: 'k3', t: '3 · Vis-viva-Gleichung', h: `
    <p><b>Aussage:</b> Die Geschwindigkeit an jedem Punkt einer Ellipsenbahn hängt nur vom momentanen Abstand r und von der Bahngröße a ab.</p>
    <div class="formel">v² = μ · ( 2/r − 1/a )</div>
    <table><tr><th>Größe</th><th>Bedeutung</th></tr><tr><td>r</td><td>momentaner Abstand zum Mittelpunkt [m]</td></tr>
    <tr><td>a</td><td>große Halbachse = (erdnächster + erdfernster Abstand) / 2 [m]</td></tr></table>
    <h3>Sonderfälle</h3><ul class="fehler"><li>Kreis (a = r): v = √(μ/r), das ist Kapitel 2.</li>
    <li>Flucht (a → ∞): v = √(2μ/r), die <b>Fluchtgeschwindigkeit</b>. Wer schneller ist, kommt nie zurück (Warnleuchte FLUCHTBAHN).</li></ul>
    <h3>Perigäum und Apogäum</h3><p>Perigäum ist der erdnächste Punkt der Bahn, Apogäum der erdfernste. Am Mond heißen sie Perilun und Apolun.
    Das Cockpit zeigt beide als Höhe über der Oberfläche.</p>
    <h3>Beispiel</h3><p>Bahn 200 × 1.000 km um die Erde: r<sub>p</sub> = 6.571 km, r<sub>a</sub> = 7.371 km, a = 6.971 km.<br>
    Im Perigäum: v² = 3,986·10¹⁴·(2/6,571·10⁶ − 1/6,971·10⁶) = 6,4141·10⁷ → v = <b>8.009 m/s</b></p>
    <details><summary>Herleitung</summary><p>Die Bahnenergie pro kg ist konstant: <span class="f">ε = v²/2 − μ/r</span>.
    Für Ellipsen gilt <span class="f">ε = −μ/(2a)</span>. Gleichsetzen und nach v² auflösen ergibt die Vis-viva-Gleichung.</p></details>` },
  { id: 'k4', t: '4 · Hohmann-Transfer', h: `
    <p><b>Aussage:</b> Der sparsamste Weg von einer Kreisbahn auf eine höhere führt über eine Ellipse, die beide Bahnen berührt.
    Eine Zündung in Flugrichtung am Start hebt den gegenüberliegenden Punkt der Bahn an.</p>
    <div class="formel">Δv = v<sub>1</sub> · ( √( 2·r<sub>2</sub> / (r<sub>1</sub> + r<sub>2</sub>) ) − 1 )</div>
    <p>mit <span class="f">v<sub>1</sub> = √(μ/r<sub>1</sub>)</span>, r<sub>1</sub> = Startbahn, r<sub>2</sub> = Zielabstand (jeweils vom Mittelpunkt).</p>
    <h3>Beispiel (300 km → geostationär, r<sub>2</sub> = 42.164 km)</h3>
    <p>v<sub>1</sub> = 7.726 m/s; √(2·42.164 / (6.671 + 42.164)) = √1,72679 = 1,31407<br>Δv = 7.726 · 0,31407 = <b>2.426 m/s</b></p>
    <h3>Empfindlichkeit</h3><p>Beim Mondtransfer verschiebt 1 m/s mehr oder weniger den erdfernsten Punkt um rund 4.000 km.
    Wer Zwischenergebnisse auf drei Stellen rundet, verfehlt den Mond. Rechnen Sie mit 5–6 gültigen Stellen oder benutzen Sie den Rechenblock in einem Zug.</p>
    <h3>Typische Fehler</h3><ul class="fehler"><li>r<sub>2</sub> und r<sub>1</sub> in verschiedenen Einheiten. Im Bruch kürzen sich die Einheiten, aber nur, wenn beide gleich sind.</li>
    <li>Das „− 1" vergessen: Dann erhält man die Geschwindigkeit nach der Zündung, nicht den Zuwachs.</li></ul>
    <details><summary>Herleitung</summary><p>Die Transferellipse hat a = (r<sub>1</sub>+r<sub>2</sub>)/2. Vis-viva bei r<sub>1</sub>:
    <span class="f">v<sub>p</sub>² = μ(2/r<sub>1</sub> − 2/(r<sub>1</sub>+r<sub>2</sub>)) = (μ/r<sub>1</sub>)·2r<sub>2</sub>/(r<sub>1</sub>+r<sub>2</sub>)</span>.
    Also ist v<sub>p</sub> = v<sub>1</sub>·√(2r<sub>2</sub>/(r<sub>1</sub>+r<sub>2</sub>)) und Δv = v<sub>p</sub> − v<sub>1</sub>.</p></details>` },
  { id: 'k5', t: '5 · Phasenwinkel', h: `
    <p><b>Aussage:</b> Der Mond bewegt sich weiter, während Sie fliegen. Zünden Sie also, wenn er um den Winkel θ vorausläuft.
    Er legt während Ihrer Flugzeit genau die fehlenden Grad bis zum Treffpunkt zurück.</p>
    <div class="formel">t = π · √( a³ / μ )   ·   θ = 180° − 360° · t / T</div>
    <table><tr><th>Größe</th><th>Bedeutung</th></tr><tr><td>t</td><td>Flugzeit = halbe Umlaufzeit der Transferellipse [s]</td></tr>
    <tr><td>a</td><td>große Halbachse der Transferellipse = (r<sub>1</sub>+r<sub>2</sub>)/2 [m]</td></tr>
    <tr><td>T</td><td>Umlaufzeit des Ziels (Mond: 27,32 Tage) [s]</td></tr></table>
    <p>Sie fliegen 180° um die Erde. Der Mond schafft in derselben Zeit 360°·t/T. Damit beide gleichzeitig ankommen, muss er um die Differenz vorn liegen.
    Das Cockpit zeigt den aktuellen Phasenwinkel.</p>
    <h3>Beispiel</h3><p>Ziel mit Umlaufzeit T = 20 Tage, Flugzeit t = 4 Tage: θ = 180° − 360°·4/20 = <b>108°</b></p>
    <h3>Typische Fehler</h3><ul class="fehler"><li>t in Sekunden, T in Tagen: Beide müssen dieselbe Einheit haben.</li>
    <li>Ganze Umlaufzeit statt halber: t = π·√(a³/μ), nicht 2π·√(…).</li><li>a³ erst in Meter umrechnen, dann hoch drei.</li></ul>
    <details><summary>Herleitung</summary><p>Drittes Keplersches Gesetz: Umlaufzeit <span class="f">P = 2π·√(a³/μ)</span>.
    Der Transfer ist eine halbe Ellipse, also t = P/2.</p></details>` },
  { id: 'k6', t: '6 · Mondeinfang', h: `
    <p><b>Einflussbereich:</b> Ab etwa <b>66.000 km</b> Abstand zum Mond bestimmt seine Schwerkraft die Bahn stärker als die Erde.
    Dort wechselt das Cockpit den Bezugskörper.</p>
    <div class="formel">r<sub>SOI</sub> ≈ D · ( M<sub>Mond</sub> / M<sub>Erde</sub> )<sup>2/5</sup></div>
    <p>Relativ zum Mond kommen Sie auf einer <b>Hyperbel</b> an, also schneller als seine Fluchtgeschwindigkeit. Ohne Bremsen fliegen Sie vorbei.</p>
    <div class="formel">Δv = v − √( μ<sub>M</sub> / r )</div>
    <p>v = Geschwindigkeit am Perilun (Cockpit), r = R<sub>M</sub> + h.</p>
    <h3>Die drei Ausgänge</h3><ul class="fehler">
    <li>Δv kleiner als v − √(2μ<sub>M</sub>/r): Sie bleiben über der Fluchtgeschwindigkeit, es folgt ein <b>Vorbeiflug</b>.</li>
    <li>Δv etwas zu groß: Der Startpunkt wird zum Apolun, das Perilun sinkt. Schon ~25 m/s zu viel führen zum <b>Aufschlag</b>.</li>
    <li>Δv dazwischen: <b>Einfang</b>. Je näher am Idealwert, desto runder die Bahn.</li></ul>
    <h3>Beispiel (Perilun 50 km, v = 2.500 m/s)</h3><p>r = 1.787.000 m; v<sub>kreis</sub> = √(4,905·10¹²/1,787·10⁶) = 1.656,7 m/s; Δv = <b>843,3 m/s</b></p>
    <details><summary>Woher kommt die Ankunftsgeschwindigkeit?</summary><p>Weit weg vom Mond hat das Schiff relativ zum Mond die Geschwindigkeit v<sub>∞</sub> (Mondbahn­geschwindigkeit minus eigene).
    Energieerhaltung: <span class="f">v² = v<sub>∞</sub>² + 2μ<sub>M</sub>/r</span>. Beim Fall auf den Mond wird das Schiff also deutlich schneller.</p></details>` },
  { id: 'k7', t: '7 · Raketengleichung', h: `
    <p><b>Aussage:</b> Ein Triebwerk wirft Masse nach hinten und wird dadurch schneller. Der Geschwindigkeitsgewinn wächst nur mit dem <b>Logarithmus</b> des Massenverhältnisses.
    Deshalb besteht eine Rakete fast nur aus Treibstoff.</p>
    <div class="formel">Δv = v<sub>e</sub> · ln( m<sub>0</sub> / m<sub>1</sub> )</div>
    <p>Umgestellt nach dem Verbrauch: <span class="f">Treibstoff = m<sub>0</sub> · (1 − e<sup>−Δv/v<sub>e</sub></sup>)</span></p>
    <table><tr><th>Größe</th><th>Bedeutung</th></tr><tr><td>v<sub>e</sub></td><td>Austrittsgeschwindigkeit der Gase (hier 3.100 m/s)</td></tr>
    <tr><td>m<sub>0</sub>, m<sub>1</sub></td><td>Masse vor bzw. nach der Zündung</td></tr></table>
    <h3>Ihr Schiff</h3><p>Trockenmasse 15.000 kg, Startmasse ${fmt(SHIP.m0)} kg → Δv-Reserve = 3.100 · ln(${fmt(SHIP.m0)}/15.000) = ${fmt(SHIP.dvStart)} m/s.
    Das Cockpit zeigt die Reserve live an.</p>
    <h3>Beispiel</h3><p>1.000 m/s bei 40.000 kg: 40.000 · (1 − e<sup>−0,3226</sup>) = <b>11.030 kg</b> Treibstoff.</p>
    <h3>Warum Fehler teuer sind</h3><p>Jede Abweichung muss später korrigiert werden. Zu viel Schub muss wieder abgebremst werden, das kostet die Abweichung zusätzlich. Bei zu wenig Schub fehlt der Rest, und der spätere Ausgleich bringt dazu Verluste in gleicher Höhe. Beim Phasenwinkel kostet jedes Grad rund 20 m/s.</p>
    <details><summary>Herleitung</summary><p>Impulserhaltung: Stößt die Rakete die Masse dm mit v<sub>e</sub> aus, gewinnt sie <span class="f">m·dv = −v<sub>e</sub>·dm</span>.
    Integriert von m<sub>0</sub> bis m<sub>1</sub> ergibt das Δv = v<sub>e</sub>·ln(m<sub>0</sub>/m<sub>1</sub>).</p></details>` },
];
function openHandbook(id) {
  const cur = HB.find(c => c.id === id) || HB[0];
  openModal(`<h2>📖 Bordhandbuch</h2><div class="hb"><div class="hb-toc">${HB.map(c => `<button data-c="${c.id}" class="${c.id === cur.id ? 'act' : ''}">${c.t}</button>`).join('')}</div>
    <div class="hb-body"><h2 style="margin-top:0">${cur.t}</h2>${cur.h}</div></div>`);
  document.querySelectorAll('.hb-toc button').forEach(b => b.onclick = () => openHandbook(b.dataset.c));
  document.querySelectorAll('.hb-body [data-hb]').forEach(el => el.onclick = e => { e.stopPropagation(); openHandbook(el.dataset.hb); });
}
$('#btnHandbuch').onclick = () => openHandbook(S.p.hb === 'k11' ? 'k11' : { 2: 'k2', 3: 'k4', 4: 'k6', 5: 'k8', 6: S.p.hb || 'k9' }[S.phase] || 'k1');

// Rechenblock: sicherer Formelrechner mit Konstanten
const RB_VARS = { G: C.G, muE: C.muE, muM: C.muM, RE: C.RE, RM: C.RM, D: C.D, TM: C.TM, ve: SHIP.ve, mleer: SHIP.mDry, veLM: LM.ve, mleerLM: LM.mDry, gE: C.muE / C.RE ** 2, gM: C.muM / C.RM ** 2, F: LM.F, pi: Math.PI, PI: Math.PI, e: Math.E };
const RB_FUN = { sqrt: Math.sqrt, ln: Math.log, log: Math.log10, exp: Math.exp, abs: Math.abs,
  sin: x => Math.sin(rad(x)), cos: x => Math.cos(rad(x)), tan: x => Math.tan(rad(x)), asin: x => deg(Math.asin(x)), acos: x => deg(Math.acos(x)), atan: x => deg(Math.atan(x)) };
let rbHist = [], rbAns = 0;
function rbEval(src) {
  let s = src.replace(/,/g, '.').replace(/·|×/g, '*').replace(/÷/g, '/').replace(/√/g, 'sqrt').replace(/−/g, '-');
  if (!/^[0-9A-Za-z_+\-*/().\s^]*$/.test(s)) throw new Error('Unerlaubtes Zeichen');
  const ids = s.replace(/(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/g, ' 0 ').match(/[A-Za-z_]\w*/g) || [];
  const vars = Object.assign({ ans: rbAns }, RB_VARS, RB_FUN);
  for (const id of ids) if (!(id in vars)) throw new Error(`Unbekannt: ${id}`);
  s = s.replace(/\^/g, '**');
  const names = Object.keys(vars);
  const r = Function(...names, `"use strict"; return (${s});`)(...names.map(n => vars[n]));
  if (typeof r !== 'number' || !Number.isFinite(r)) throw new Error('Kein gültiges Ergebnis');
  return r;
}
// Formelsammlung: {name} = Platzhalter, der beim Rechnen durch den Feldinhalt ersetzt wird
const RB_FORMELN = [
  { g: 'Bahnen', n: 'Kreisbahngeschwindigkeit', z: 'v = √( μ / r )', x: 'sqrt({mu}/{r})', u: 'm/s', s: { mu: 'μ des Zentralkörpers', r: 'Bahnradius r (ab Mittelpunkt)' } },
  { g: 'Bahnen', n: 'Vis-viva (Tempo auf der Ellipse)', z: 'v = √( μ · (2/r − 1/a) )', x: 'sqrt({mu}*(2/{r}-1/{a}))', u: 'm/s', s: { mu: 'μ des Zentralkörpers', r: 'Abstand r', a: 'große Halbachse a' } },
  { g: 'Bahnen', n: 'Große Halbachse', z: 'a = ( r₁ + r₂ ) / 2', x: '({r1}+{r2})/2', u: 'm', s: { r1: 'Perizentrum-Radius r₁', r2: 'Apozentrum-Radius r₂' } },
  { g: 'Bahnen', n: 'Fluchtgeschwindigkeit', z: 'v = √( 2μ / r )', x: 'sqrt(2*{mu}/{r})', u: 'm/s', s: { mu: 'μ des Zentralkörpers', r: 'Abstand r' } },
  { g: 'Bahnen', n: 'Umlaufzeit', z: 'T = 2π · √( a³ / μ )', x: '2*pi*sqrt({a}^3/{mu})', u: 's', s: { a: 'große Halbachse a', mu: 'μ des Zentralkörpers' } },
  { g: 'Bahnen', n: 'Fallbeschleunigung', z: 'g = μ / r²', x: '{mu}/{r}^2', u: 'm/s²', s: { mu: 'μ des Körpers', r: 'Abstand r' } },
  { g: 'Bahnen', n: 'μ aus einer Umlaufbahn', z: 'μ = 4π² · r³ / T²', x: '4*pi^2*{r}^3/{T}^2', u: 'm³/s²', s: { r: 'Bahnradius r', T: 'Umlaufzeit T' } },
  { g: 'Transfer', n: 'Hohmann: Δv beim Abflug', z: 'Δv = √(μ/r₁) · ( √( 2r₂/(r₁+r₂) ) − 1 )', x: 'sqrt({mu}/{r1})*(sqrt(2*{r2}/({r1}+{r2}))-1)', u: 'm/s', s: { mu: 'μ des Zentralkörpers', r1: 'Startradius r₁', r2: 'Zielradius r₂' } },
  { g: 'Transfer', n: 'Hohmann: Δv bei Ankunft', z: 'Δv = √(μ/r₂) · ( 1 − √( 2r₁/(r₁+r₂) ) )', x: 'sqrt({mu}/{r2})*(1-sqrt(2*{r1}/({r1}+{r2})))', u: 'm/s', s: { mu: 'μ des Zentralkörpers', r1: 'Startradius r₁', r2: 'Zielradius r₂' } },
  { g: 'Transfer', n: 'Transferzeit (halbe Ellipse)', z: 't = π · √( a³ / μ )', x: 'pi*sqrt({a}^3/{mu})', u: 's', s: { a: 'große Halbachse a', mu: 'μ des Zentralkörpers' } },
  { g: 'Transfer', n: 'Phasenwinkel beim Start', z: 'θ = 180° − 360° · t / T', x: '180-360*{t}/{T}', u: '°', s: { t: 'Transferzeit t', T: 'Umlaufzeit des Ziels T' } },
  { g: 'Transfer', n: 'Bahnänderung im Punkt r₁', z: 'Δv = √(μ/r₁) − √( μ·(2/r₁ − 1/a) )', x: 'sqrt({mu}/{r1})-sqrt({mu}*(2/{r1}-1/{a}))', u: 'm/s', s: { mu: 'μ des Zentralkörpers', r1: 'Radius der Zündung r₁', a: 'große Halbachse der neuen Bahn' } },
  { g: 'Mond', n: 'Einfang in Kreisbahn', z: 'Δv = v − √( μ / r )', x: '{v}-sqrt({mu}/{r})', u: 'm/s', s: { v: 'Tempo im Perilun v', mu: 'μ Mond', r: 'Perilun-Radius r' } },
  { g: 'Mond', n: 'Hyperbel → Kreisbahn', z: 'Δv = √( v∞² + 2μ/r ) − √( μ/r )', x: 'sqrt({vinf}^2+2*{mu}/{r})-sqrt({mu}/{r})', u: 'm/s', s: { vinf: 'Überschuss-Tempo v∞', mu: 'μ Mond', r: 'Radius r' } },
  { g: 'Mond', n: 'Hyperbel → Ellipse', z: 'Δv = √( v∞² + 2μ/rₚ ) − √( μ·(2/rₚ − 1/a) )', x: 'sqrt({vinf}^2+2*{mu}/{rp})-sqrt({mu}*(2/{rp}-1/{a}))', u: 'm/s', s: { vinf: 'Überschuss-Tempo v∞', mu: 'μ Mond', rp: 'Perilun-Radius rₚ', a: 'große Halbachse a' } },
  { g: 'Rakete', n: 'Raketengleichung', z: 'Δv = vₑ · ln( m₀ / m₁ )', x: '{ve}*ln({m0}/{m1})', u: 'm/s', s: { ve: 'Ausströmgeschw. vₑ', m0: 'Masse vorher m₀', m1: 'Masse nachher m₁' } },
  { g: 'Rakete', n: 'Masse nach der Zündung', z: 'm₁ = m₀ · e^(−Δv/vₑ)', x: '{m0}*exp(-{dv}/{ve})', u: 'kg', s: { m0: 'Masse vorher m₀', dv: 'Δv', ve: 'Ausströmgeschw. vₑ' } },
  { g: 'Rakete', n: 'Treibstoffbedarf', z: 'Δm = m₀ · ( 1 − e^(−Δv/vₑ) )', x: '{m0}*(1-exp(-{dv}/{ve}))', u: 'kg', s: { m0: 'Masse vorher m₀', dv: 'Δv', ve: 'Ausströmgeschw. vₑ' } },
  { g: 'Rakete', n: 'Brenndauer', z: 't = m · Δv / F', x: '{m}*{dv}/{F}', u: 's', s: { m: 'Masse m', dv: 'Δv', F: 'Schub F' } },
  { g: 'Rakete', n: 'Massenstrom', z: 'ṁ = F / vₑ', x: '{F}/{ve}', u: 'kg/s', s: { F: 'Schub F', ve: 'Ausströmgeschw. vₑ' } },
  { g: 'Landung', n: 'Bremsweg', z: 's = v² / (2·a)', x: '{v}^2/(2*{a})', u: 'm', s: { v: 'Tempo v', a: 'Bremsverzögerung a' } },
  { g: 'Landung', n: 'Zündhöhe (Energiesatz)', z: 'h = m·( v₀² + 2·g·h₀ ) / (2F)', x: '{m}*({v0}^2+2*{g}*{h0})/(2*{F})', u: 'm', s: { m: 'Masse m', v0: 'Sinkrate v₀', g: 'Fallbeschl. Mond g', h0: 'Höhe h₀', F: 'Schub F' } },
  { g: 'Landung', n: 'Sinkrate aus zwei Höhen', z: 'v₀ = (hₐ − h₀)/Δt + g·Δt/2', x: '({ha}-{h0})/{dt}+{g}*{dt}/2', u: 'm/s', s: { ha: 'spätere Höhe hₐ', h0: 'erste Höhe h₀', dt: 'Zeitabstand Δt', g: 'Fallbeschl. Mond g' } },
  { g: 'Rückflug', n: 'Tempo im Perigäum', z: 'vₚ = √( v² + 2μ·(1/rₚ − 1/r) )', x: 'sqrt({v}^2+2*{mu}*(1/{rp}-1/{r}))', u: 'm/s', s: { v: 'Tempo jetzt v', mu: 'μ Erde', rp: 'Perigäum-Radius rₚ', r: 'Abstand jetzt r' } },
  { g: 'Rückflug', n: 'Eintrittswinkel', z: 'cos γ = rₚ·vₚ / (r·v)', x: 'acos({rp}*{vp}/({r}*{v}))', u: '°', s: { rp: 'Perigäum-Radius rₚ', vp: 'Tempo im Perigäum vₚ', r: 'Radius r', v: 'Tempo v bei r' } },
  { g: 'Navigation', n: 'Winkel zwischen zwei Sternen', z: 'cos d = sin δ₁·sin δ₂ + cos δ₁·cos δ₂·cos(α₁−α₂)', x: 'acos(sin({d1})*sin({d2})+cos({d1})*cos({d2})*cos({a1}-{a2}))', u: '°', s: { d1: 'Deklination δ₁ (°)', d2: 'Deklination δ₂ (°)', a1: 'Rektaszension α₁ (°)', a2: 'Rektaszension α₂ (°)' } },
  { g: 'Navigation', n: 'Entfernung aus Scheibengröße', z: 'd = R / sin(α/2)', x: '{R}/sin({w}/2)', u: 'm', s: { R: 'Radius des Körpers R', w: 'Scheibe erscheint unter α (°)' } },
];
const RB_BASIS = [
  ['muE', 'μ Erde'], ['muM', 'μ Mond'], ['RE', 'Erdradius'], ['RM', 'Mondradius'], ['D', 'Abstand Erde–Mond'], ['TM', 'Umlaufzeit Mond'],
  ['gE', 'Fallbeschl. Erde'], ['gM', 'Fallbeschl. Mond'], ['G', 'Gravitationskonstante'],
  ['ve', 'vₑ Raumschiff'], ['mleer', 'Leermasse Raumschiff'], ['veLM', 'vₑ Landefähre'], ['mleerLM', 'Leermasse Landefähre'], ['F', 'Schub Landefähre'], ['pi', 'π'],
];
const RB_UNIT = { muE: 'm³/s²', muM: 'm³/s²', RE: 'm', RM: 'm', D: 'm', TM: 's', gE: 'm/s²', gM: 'm/s²', G: 'm³/(kg·s²)', ve: 'm/s', mleer: 'kg', veLM: 'm/s', mleerLM: 'kg', F: 'N', pi: '' };
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function rbNum(v) { // gut lesbare Zahl, große und kleine mit Zehnerpotenz
  if (!Number.isFinite(v)) return '∞';
  const a = Math.abs(v);
  if (a && (a >= 1e8 || a < 1e-3)) { const e = Math.floor(Math.log10(a)); return `${fmt(v / 10 ** e, 3)}·10${String(e).replace(/./g, c => SUP[c])}`; }
  return fmt(v, a < 10 ? 4 : a < 1000 ? 2 : 0);
}
// Aktuelle Flugwerte zum Zeitpunkt des Aufrufs
function rbLive() {
  const out = [], V = veh(), m = mNow();
  out.push(['Masse jetzt', m, 'kg'], ['Treibstoff an Bord', m - V.mDry, 'kg'], ['Δv-Reserve', dvReserve(), 'm/s']);
  if (S.land) {
    const L = S.land; out.push(['Höhe über Grund', Math.max(0, L.h), 'm']);
    if (!radarBlind()) out.push(['Sinkrate', Math.max(0, -L.v), 'm/s']);
  } else if (ship && !S.p.blind) {
    const f = flightState(), el = f.el, mo = f.refName === 'Mond';
    out.push([`μ Bezugskörper (${f.refName})`, f.mu, 'm³/s²'], ['Abstand zum Mittelpunkt r', el.r, 'm'], ['Höhe', el.r - f.R, 'm'],
      ['Geschwindigkeit v', el.v, 'm/s'], [mo ? 'Perilun-Radius' : 'Perigäum-Radius', el.rp, 'm']);
    if (Number.isFinite(el.a)) out.push([mo ? 'Apolun-Radius' : 'Apogäum-Radius', el.ra, 'm'], ['Große Halbachse a', el.a, 'm'], ['Umlaufzeit', 2 * Math.PI * Math.sqrt(el.a ** 3 / f.mu), 's']);
    else out.push(['Überschuss-Tempo v∞', Math.sqrt(2 * el.eps), 'm/s']);
    out.push(['Abstand Erde (Mitte)', f.dE, 'm'], ['Abstand Mond (Mitte)', f.dM, 'm']);
    if (ship.frame === 'E' && S.phase >= 3) out.push(['Phasenwinkel Mond', norm360(deg(moonAngle(S.met) - Math.atan2(f.sw.y, f.sw.x))), '°']);
  }
  out.push(['Missionszeit', S.met, 's']);
  if (rbHist.length) out.push(['Letztes Ergebnis', rbAns, '']);
  return out;
}
let rbSel = -1; // -1 = freie Eingabe
function openRechen() {
  const groups = [...new Set(RB_FORMELN.map(f => f.g))];
  openModal(`<h2>🧮 Rechenblock</h2>
    <p class="muted">Formel links wählen, Feld anklicken, dann rechts einen Wert antippen – er wird ins Feld eingesetzt. Felder lassen sich auch von Hand füllen (z. B. <span class="f">RE+300e3</span>).</p>
    <div class="rb-grid">
      <div class="rb-col"><h3>Formeln</h3><div class="rb-list" id="rbForm">
        <button data-f="-1">✎ Freie Eingabe</button>
        ${groups.map(g => `<div class="rb-g">${g}</div>` + RB_FORMELN.map((f, i) => f.g === g ? `<button data-f="${i}">${f.n}</button>` : '').join('')).join('')}
      </div></div>
      <div class="rb-col rb-work"><div id="rbWork"></div>
        <div class="msg-err" id="rbErr"></div>
        <div class="rb-hist" id="rbHist"></div></div>
      <div class="rb-col"><h3>Werte</h3><div class="rb-list" id="rbVals"></div></div>
    </div>
    <details><summary>Rechenregeln</summary><p>Konstanten in SI-Einheiten (m, kg, s). Winkelfunktionen rechnen in Grad. Potenz mit <span class="f">^</span>, Zehnerpotenz mit <span class="f">3.986e14</span>.
    Funktionen: <span class="f">sqrt ln log exp abs sin cos tan asin acos atan</span>, <span class="f">ans</span> = letztes Ergebnis.</p></details>`);
  let act = null; // zuletzt angeklicktes Eingabefeld
  const pick = inp => { act = inp; document.querySelectorAll('#rbWork input').forEach(o => o.classList.toggle('act', o === inp)); inp.focus(); };
  const show = () => { $('#rbHist').innerHTML = rbHist.map(h => `<div>${h.n ? `<span class="rb-hn">${h.n}</span>` : ''}${h.q} = <b>${rbNum(h.r)}</b>${h.u ? ' ' + h.u : ''}</div>`).join(''); };
  const vals = () => {
    $('#rbVals').innerHTML = `<div class="rb-g">Aktuelle Flugwerte</div>` +
      rbLive().map(([n, v, u]) => `<button data-v="${+v.toPrecision(7)}" title="${n}"><span>${n}</span><b>${rbNum(v)} ${u}</b></button>`).join('') +
      `<div class="rb-g">Basiswerte</div>` +
      RB_BASIS.map(([k, n]) => `<button data-v="${k}" title="${k}"><span>${n} <i class="f">${k}</i></span><b>${rbNum(RB_VARS[k])} ${RB_UNIT[k]}</b></button>`).join('');
  };
  const work = () => {
    document.querySelectorAll('#rbForm button').forEach(b => b.classList.toggle('act', +b.dataset.f === rbSel));
    const f = RB_FORMELN[rbSel];
    $('#rbWork').innerHTML = f
      ? `<h3 style="margin-top:0">${f.n}</h3><div class="formel">${f.z}</div>
         ${Object.entries(f.s).map(([k, l]) => `<label class="rb-slot"><span>${l}</span><input data-s="${k}" autocomplete="off"></label>`).join('')}
         <div class="btnrow"><button class="primary" id="rbGo">= Berechnen</button><button id="rbClr">Felder leeren</button></div>`
      : `<h3 style="margin-top:0">Freie Eingabe</h3><div class="rb-in"><input id="rbIn" placeholder="z. B. sqrt(muE/(RE+300e3))" autocomplete="off"><button class="primary" id="rbGo">=</button></div>`;
    const ins = [...document.querySelectorAll('#rbWork input')];
    ins.forEach(inp => {
      inp.onfocus = () => { if (act !== inp) pick(inp); };
      inp.onkeydown = e => { if (e.key === 'Enter') go(); };
    });
    $('#rbGo').onclick = go;
    if (f) $('#rbClr').onclick = () => { ins.forEach(i => i.value = ''); ins[0].focus(); };
    pick(ins[0]);
  };
  const go = () => {
    const f = RB_FORMELN[rbSel]; let q, n = '', u = '';
    if (f) {
      for (const inp of document.querySelectorAll('#rbWork input'))
        if (!inp.value.trim()) { $('#rbErr').textContent = `Bitte ausfüllen: ${f.s[inp.dataset.s]}`; inp.focus(); return; }
      q = f.x.replace(/\{(\w+)\}/g, (_, k) => { const v = document.querySelector(`#rbWork input[data-s="${k}"]`).value.trim(); return /^[\w.]+$/.test(v) ? v : `(${v})`; });
      n = f.n; u = f.u;
    } else { q = $('#rbIn').value.trim(); if (!q) return; }
    try { const r = rbEval(q); rbAns = r; rbHist.unshift({ q, r, n, u }); rbHist = rbHist.slice(0, 30); $('#rbErr').textContent = ''; show(); vals(); }
    catch (e) { $('#rbErr').textContent = e.message; }
  };
  // Wert antippen: ins aktive Feld einsetzen (Formel) bzw. an der Schreibmarke einfügen (frei)
  $('#rbVals').onmousedown = e => e.preventDefault(); // Fokus bleibt im Eingabefeld
  $('#rbVals').onclick = e => {
    const b = e.target.closest('button'); if (!b || !act) return;
    const v = b.dataset.v;
    if (RB_FORMELN[rbSel]) {
      act.value = v;
      const all = [...document.querySelectorAll('#rbWork input')];
      const nx = all.slice(all.indexOf(act) + 1).concat(all).find(i => !i.value.trim());
      pick(nx || act);
    } else {
      const p0 = act.selectionStart ?? act.value.length, p1 = act.selectionEnd ?? p0;
      act.value = act.value.slice(0, p0) + v + act.value.slice(p1); act.focus(); act.setSelectionRange(p0 + v.length, p0 + v.length);
    }
  };
  $('#rbForm').onclick = e => { const b = e.target.closest('button'); if (!b) return; rbSel = +b.dataset.f; $('#rbErr').textContent = ''; work(); };
  vals(); work(); show();
  const tm = setInterval(() => {
    if (!$('#rbVals') || $('#overlay').classList.contains('hidden')) return clearInterval(tm);
    if (anim || S.land) vals(); // Flugwerte laufen mit, solange sich das Schiff bewegt
  }, 1000);
}
$('#btnRechen').onclick = openRechen;

function openLog() {
  const rows = S.log.map(e => `<tr><td>${metStr(e.met)}</td><td>${e.phase}</td><td>${e.gesucht}</td>
    <td>${typeof e.eingabe === 'number' ? fmt(e.eingabe, 1) + ' ' + e.einheit : e.eingabe}</td>
    <td>${typeof e.richtig === 'number' ? fmt(e.richtig, 1) + ' ' + e.einheit : e.richtig}</td>
    <td>${e.folge || ''}</td><td><span class="link" data-hb2="${e.kap}">Handbuch</span></td></tr>`).join('');
  const fl = funkLog.slice(-12).reverse().map(f => `<div><span class="f">${metStr(f.t)}</span> ${f.text}</div>`).join('');
  openModal(`<h2>📓 Missionstagebuch</h2>${S.log.length ? `<table class="logtab"><tr><th>MET</th><th>Phase</th><th>Gesucht</th><th>Ihr Wert</th><th>Richtig</th><th>Folge</th><th></th></tr>${rows}</table>` : '<p>Noch keine Einträge.</p>'}
    <h3>Funkprotokoll</h3><div class="rb-hist">${fl || '—'}</div>`);
  document.querySelectorAll('[data-hb2]').forEach(el => el.onclick = () => openHandbook(el.dataset.hb2));
}
$('#btnLog').onclick = openLog;

// ================= Briefing =================
function showBriefing() {
  anim = null; orbitTok = null; ship = null; tracks = []; markers = []; S.phase = 0; S.met = 0; S.m = SHIP.m0;
  Object.assign(S, { veh: 'csm', land: null, p: {} });
  view.mode = 'system'; view.auto = null; view.fitTarget = 1.12 * C.D; S.moonT0 = 0; S.moonA0 = 0.9;
  phaseTag('Briefing'); setTask('');
  const lv = [['kadett', 'Kadett', 'Formeln und Rechenweg werden vorgegeben. Den Zündzeitpunkt zum Mond wählt der Bordcomputer.'],
    ['pilot', 'Pilot', 'Nur gegebene Werte und ein Verweis ins Handbuch. Den Phasenwinkel berechnen Sie selbst.'],
    ['kommandant', 'Kommandant', 'Keine Hinweise, Konstanten stehen nur im Handbuch. Werte lesen Sie im Cockpit ab.']];
  const plan = ['Aufstieg', 'Umlaufbahn', 'Mondtransfer', 'Mondeinfang', 'Landung', 'Rückkehr'];
  const svg = `<svg class="plan" viewBox="0 0 640 130" xmlns="http://www.w3.org/2000/svg">
    <circle cx="70" cy="70" r="34" fill="#1d5fbf"/><circle cx="70" cy="70" r="46" fill="none" stroke="#ffb84d" stroke-dasharray="3 4"/>
    <path d="M116 70 C 250 -10, 470 -10, 560 52" fill="none" stroke="#ffb84d" stroke-width="2"/>
    <circle cx="570" cy="70" r="16" fill="#9a9a9a"/><circle cx="570" cy="70" r="24" fill="none" stroke="#4ade80" stroke-dasharray="3 4"/>
    <path d="M560 92 C 470 140, 230 140, 112 92" fill="none" stroke="#67e8f9" stroke-width="2" stroke-dasharray="6 6"/>
    ${plan.map((p, i) => { const x = [70, 135, 330, 545, 600, 330][i], y = [126, 40, 20, 34, 108, 126][i], on = i >= 1;
      return `<text x="${x}" y="${y}" fill="${on ? '#ffb84d' : '#64708c'}" font-size="12" text-anchor="middle" font-family="system-ui">${i + 1} ${p}${on ? '' : ' (automatisch)'}</text>`; }).join('')}
  </svg>`;
  const b = $('#briefing');
  b.innerHTML = `<div class="br-wrap">
    <div class="br-head">FLUGLEITUNG · MISSIONSBRIEFING · VERTRAULICH</div>
    <h1>Mission „Selene 1“</h1>
    <div class="br-card"><h3>AUFTRAG</h3><p>Fliegen Sie zum Mond, setzen Sie die Landefähre weich auf und bringen Sie die Besatzung sicher zur Erde zurück.
      Die Mission dauert rund zwölf Tage. Der Bordcomputer fliegt nur, was Sie ihm eingeben. Jeder Rechenfehler hat Folgen.</p></div>
    <div class="br-card"><h3>FLUGPLAN</h3>${svg}
      <p>Erst bringt die Trägerrakete Sie auf 200 km Höhe, dann heben Sie in die Kreisbahn. Von dort zünden Sie zum Mond und bremsen in die Umlaufbahn.
      Mit der Landefähre steigen Sie ab und setzen auf. Für den Rückflug richten Sie die Bordplattform an zwei Leitsternen aus,
      zünden zur Erde, bestimmen unterwegs Ihren Abstand und treffen den schmalen Eintrittskorridor der Atmosphäre.</p></div>
    <div class="br-card"><h3>BUDGET</h3><p>Ihr Schiff hat eine Δv-Reserve von <b>${fmt(SHIP.dvStart)} m/s</b> (${fmt(SHIP.m0 - SHIP.mDry)} kg Treibstoff).
      Hin- und Rückflug brauchen rund 5.180 m/s, die Reserve beträgt also nur gut 250 m/s. Die Landefähre hat einen eigenen Tank mit ${fmt(LM.dvStart)} m/s.
      Jede Kurskorrektur geht von der Reserve ab. Ist ein Tank leer, ist die Mission vorbei.</p></div>
    <div class="br-card"><h3>IHRE ROLLE · SCHWIERIGKEIT</h3><div class="levels">
      ${lv.map(l => `<div class="lvl ${S.level === l[0] ? 'sel' : ''}" data-l="${l[0]}"><b>${l[1]}</b><small>${l[2]}</small></div>`).join('')}</div></div>
    <div class="br-card"><h3>EINWEISUNG</h3><ul>
      <li><b>Cockpit</b> (rechts): Höhe, Geschwindigkeit, Bahndaten, Treibstoff und Warnleuchten. Ein Tipp auf eine Anzeige öffnet das passende Handbuchkapitel.</li>
      <li><b>📖 Handbuch</b>: Jede Formel mit Erklärung, Beispiel und typischen Fehlern.</li>
      <li><b>🧮 Rechenblock</b>: Formelsammlung mit Eingabefeldern; Basiswerte und aktuelle Flugwerte lassen sich per Klick einsetzen.</li>
      <li><b>📓 Tagebuch</b>: Ihre Werte neben den richtigen.</li>
      <li><b>🔊 Funk</b>: Die Flugleitung spricht mit Ihnen (optional).</li></ul></div>
    <div class="br-card"><h3>ERFOLGSKRITERIEN</h3><p>Weiche Landung (höchstens 3 m/s Aufsetzgeschwindigkeit) und Wiedereintritt im Korridor von 5,5° bis 7,5°. Wertung nach dem Treibstoff, den Ihre Fehler gekostet haben.</p></div>
    <div class="br-go"><label style="display:block;margin-bottom:10px"><input type="checkbox" id="brFunk" ${S.funk ? 'checked' : ''}> Funk mit Sprachausgabe</label>
      <label style="display:block;margin-bottom:10px"><input type="checkbox" id="brStoer" ${load('mf_stoer', false) ? 'checked' : ''}> Störfälle: unterwegs können Pannen auftreten, die Sie rechnerisch lösen müssen</label>
      <button class="go" id="brStart">🚀 START</button></div>
  </div>`;
  b.classList.remove('hidden');
  b.querySelectorAll('.lvl').forEach(el => el.onclick = () => {
    S.level = el.dataset.l; store('mf_level', S.level);
    b.querySelectorAll('.lvl').forEach(x => x.classList.toggle('sel', x === el));
  });
  $('#brFunk').onchange = e => { S.funk = e.target.checked; store('mf_funk', S.funk); setFunkBtn(); };
  $('#brStoer').onchange = e => store('mf_stoer', e.target.checked);
  $('#brStart').onclick = () => { b.classList.add('hidden'); tone(0, 1); launch(); };
}

// ================= Start =================
setFunkBtn();
resize();
showBriefing();
requestAnimationFrame(loop);
