// Tirage des roues, rejoué à l'écran avant le début de la partie.
// Le tirage a déjà eu lieu à la création du monde (le moteur reste seul maître
// du hasard) : chaque roue tourne puis s'arrête sur le résultat réellement tiré.

import type { WheelDraws, WheelPool } from '../../src/engine/wheel';
import type { WheelSpin } from '../../src/engine/types';

export interface DrawNation { name: string; flag: string }
export interface DrawOptions {
  data: WheelDraws;
  /** Nom et drapeau (HTML déjà échappé) de chaque nation, par identifiant. */
  nation(id: number): DrawNation;
  /** Appelé à la fermeture ; play = lancer la partie. */
  onClose(play: boolean): void;
}

interface Segment { label: string; weight: number }
interface Spin { title: string; sub: string; segments: Segment[]; result: string; shown: string; scale: boolean }

const h = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const MAX_SAMPLE = 12;
const SPEEDS = [1, 2, 4, 8];
const TONES = ['#2a323c', '#3a4553', '#323b47'];

/** Générateur déterministe : la même nation montre toujours les mêmes segments. */
function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** Roue trop fournie pour être lisible : le résultat et quelques autres possibilités de la même roue. */
function sample(pool: Segment[], result: string, rnd: () => number): Segment[] {
  const others = pool.filter((x) => x.label !== result);
  for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
  const out = others.slice(0, MAX_SAMPLE - 1).map((s) => ({ label: s.label, weight: 1 }));
  out.splice(Math.floor(rnd() * (out.length + 1)), 0, { label: result, weight: 1 });
  return out;
}

function toSpin(sp: WheelSpin, pools: Record<string, WheelPool>, rnd: () => number): Spin {
  const pool: WheelPool = sp.options ? { segments: sp.options.map((l) => [l, 1]) } : pools[sp.pool] ?? { segments: [[sp.result, 1]] };
  let segments = pool.segments.map(([label, weight]) => ({ label, weight }));
  if (pool.sample && segments.length > MAX_SAMPLE) segments = sample(segments, sp.result, rnd);
  // Un résultat absent de la roue (valeur recalculée après le tirage) y reçoit une petite part.
  if (!segments.some((s) => s.label === sp.result)) segments.push({ label: sp.result, weight: Math.max(0.05, segments.reduce((a, s) => a + s.weight, 0) * 0.04) });
  return { title: sp.title, sub: sp.sub ?? '', segments, result: sp.result, shown: sp.shown ?? sp.result, scale: !!pool.scale };
}

const R = 140;
const at = (deg: number, r = R) => { const a = (deg * Math.PI) / 180; return `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`; };
const short = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Dessine la roue et renvoie l'angle central du segment gagnant, en degrés depuis le haut. */
function wheelSvg(spin: Spin): { svg: string; center: number; width: number } {
  const total = spin.segments.reduce((a, s) => a + s.weight, 0);
  const n = spin.segments.length;
  let a0 = 0; let center = 0; let width = 0; let parts = ''; let labels = '';
  spin.segments.forEach((s, i) => {
    const span = (s.weight / total) * 360;
    const a1 = a0 + span;
    const win = s.label === spin.result;
    if (win) { center = a0 + span / 2; width = span; }
    // Échelles de valeurs : dégradé continu, comme sur les roues de Nation Wheel. Sinon deux tons alternés.
    const tone = spin.scale ? `hsl(${Math.round(150 - (300 * i) / Math.max(1, n - 1))} 38% ${i % 2 ? 27 : 31}%)` : n % 2 && i === n - 1 ? TONES[2] : TONES[i % 2];
    parts += n === 1 ? `<circle r="${R}" fill="${tone}" ${win ? 'data-win' : ''}/>` : `<path d="M0 0 L${at(a0)} A${R} ${R} 0 ${span > 180 ? 1 : 0} 1 ${at(a1)} Z" fill="${tone}" ${win ? 'data-win' : ''}/>`;
    // Le texte suit le rayon. Les segments trop fins restent muets, sauf le gagnant, révélé à l'arrêt.
    const size = span >= 9 ? 10.5 : span >= 5 ? 8.5 : 7;
    if (span >= 3.2 || win) labels += `<text transform="rotate(${(a0 + span / 2 - 90).toFixed(2)})" x="${R - 7}" y="${(size * 0.34).toFixed(1)}" font-size="${size}" ${win ? 'data-win' : ''} ${span < 3.2 ? 'data-thin' : ''}>${h(short(s.label, span < 14 ? 15 : 20))}</text>`;
    a0 = a1;
  });
  const svg = `<svg viewBox="-150 -158 300 308" role="img" aria-label="Roue : ${h(spin.title)}" class="${n > 40 ? 'dense' : ''}">
    <g class="rot"><g class="segs">${parts}</g><g class="labels">${labels}</g></g>
    <circle r="24" class="hub"/><path class="pointer" d="M-11 -157 H11 L0 -134 Z"/></svg>`;
  return { svg, center, width };
}

export function openDraw(root: HTMLElement, opts: DrawOptions): void {
  const { data } = opts;
  const draws = data.draws;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { nation: 0, step: 0, auto: true, speed: 0, token: 0, spinning: false, done: 0, recap: false };
  const spinsOf = (i: number) => { const rnd = seeded(draws[i].id + 1); return draws[i].spins.map((sp) => toSpin(sp, data.pools, rnd)); };
  let spins = draws.length ? spinsOf(0) : [];
  let timer = 0;

  root.hidden = false;
  root.innerHTML = `
    <header><div><h2>Tirage des roues</h2><small data-el="count"></small></div><button data-draw="recap">Tout révéler</button></header>
    <div class="draw-main">
      <div class="draw-stage">
        <div class="draw-nation" data-el="nation"></div>
        <div class="draw-heading"><b class="draw-title" data-el="title"></b><small data-el="sub"></small></div>
        <div class="draw-wheel" data-el="wheel" data-draw="skip" aria-live="off"></div>
        <p class="draw-result" data-el="result" aria-live="polite"></p>
      </div>
      <div class="draw-side">
        <dl class="draw-slots" data-el="slots"></dl>
        <div class="buttons draw-controls">
          <button data-draw="auto" data-el="auto"></button>
          <button data-draw="speed" data-el="speed"></button>
          <button data-draw="next" class="on" data-el="next"></button>
        </div>
      </div>
    </div>
    <div class="draw-recap scroll" data-el="recap" hidden></div>`;
  const el = (name: string) => root.querySelector<HTMLElement>(`[data-el="${name}"]`)!;

  /** Résultats de la nation en cours, une ligne par roue (les roues tirées plusieurs fois sont regroupées). */
  const slots = () => {
    // Seules les roues déjà tirées sont listées : les titres à venir trahiraient la région ou l'idéologie.
    const rows = new Map<string, string[]>();
    spins.slice(0, state.done).forEach((s) => rows.set(s.title, [...(rows.get(s.title) ?? []), s.shown]));
    const box = el('slots');
    box.innerHTML = rows.size ? [...rows.entries()].map(([title, values]) => `<div><dt>${h(title)}</dt><dd>${h(values.join(', '))}</dd></div>`).join('')
      : '<div class="pending"><dt>Résultats</dt><dd>…</dd></div>';
    box.scrollTop = box.scrollHeight;
  };
  const controls = () => {
    el('auto').textContent = state.auto ? '⏸ Pause' : '▶ Tirage automatique';
    el('speed').textContent = `Vitesse ${SPEEDS[state.speed]}×`;
    const last = state.nation >= draws.length - 1;
    el('next').textContent = state.step < spins.length ? (state.auto ? 'Nation suivante ⏭' : 'Tourner la roue') : last ? 'Voir le récapitulatif' : 'Nation suivante ⏭';
    el('count').textContent = `Nation ${state.nation + 1} sur ${draws.length} · roue ${Math.min(state.step + 1, spins.length)} sur ${spins.length}`;
  };

  /** Marque la roue courante comme tirée et affiche son résultat. */
  const land = () => {
    const s = spins[state.step];
    if (!s) return;
    state.spinning = false;
    el('wheel').classList.add('landed');
    el('result').textContent = s.shown;
    state.step++;
    state.done = state.step;
    slots(); controls();
  };

  const showWheel = () => {
    const s = spins[state.step];
    if (!s) return;
    const w = wheelSvg(s);
    const box = el('wheel');
    box.classList.remove('landed');
    box.innerHTML = w.svg;
    el('title').textContent = s.title;
    el('sub').textContent = s.sub;
    el('result').textContent = ' ';
    return w;
  };

  const spinNow = () => {
    clearTimeout(timer);
    const w = showWheel();
    if (!w) return;
    const token = ++state.token;
    state.spinning = true;
    controls();
    const rot = el('wheel').querySelector<SVGGElement>('.rot')!;
    const speed = SPEEDS[state.speed];
    // L'arrêt se fait quelque part dans le segment gagnant, pas toujours en son centre.
    const jitter = (seeded(state.nation * 31 + state.step + 7)() - 0.5) * w.width * 0.6;
    const angle = 360 * 4 - (w.center + jitter);
    const duration = reduced ? 0 : 2600 / speed;
    const finish = () => {
      if (token !== state.token) return;
      land();
      if (state.auto) timer = window.setTimeout(advance, (reduced ? 900 : 800) / speed);
    };
    if (!duration) { rot.style.transform = `rotate(${angle}deg)`; finish(); return; }
    rot.style.transition = `transform ${duration}ms cubic-bezier(.16,.72,.18,1)`;
    requestAnimationFrame(() => requestAnimationFrame(() => { rot.style.transform = `rotate(${angle}deg)`; }));
    timer = window.setTimeout(finish, duration + 60);
  };

  /** Arrête net la roue en cours sur son résultat. */
  const settle = () => {
    if (!state.spinning) return;
    clearTimeout(timer);
    state.token++;
    const s = spins[state.step];
    const rot = el('wheel').querySelector<SVGGElement>('.rot');
    if (rot && s) { rot.style.transition = 'none'; rot.style.transform = `rotate(${-wheelSvg(s).center}deg)`; }
    land();
  };

  const showNation = (i: number) => {
    clearTimeout(timer);
    state.token++;
    state.nation = i; state.step = 0; state.done = 0; state.spinning = false;
    spins = spinsOf(i);
    const n = opts.nation(draws[i].id);
    el('nation').innerHTML = `${n.flag}<b>${n.name}</b>`;
    slots();
    if (state.auto) spinNow(); else { showWheel(); controls(); }
  };

  const recap = () => {
    clearTimeout(timer);
    state.token++; state.recap = true; state.spinning = false;
    root.querySelector<HTMLElement>('.draw-main')!.hidden = true;
    root.querySelector<HTMLElement>('[data-draw="recap"]')!.hidden = true;
    el('count').textContent = `${draws.length} nations tirées`;
    const box = el('recap');
    box.hidden = false;
    box.innerHTML = `<ol class="draw-list">${draws.map((d) => {
      const n = opts.nation(d.id);
      const text = (sp: WheelSpin) => sp.shown ?? sp.result;
      const line = d.spins.filter((sp) => sp.recap === 1).map(text);
      const chips = d.spins.filter((sp) => sp.recap === 2).map(text);
      return `<li>${n.flag}<div><b>${n.name}</b><small>${h(line.join(' · ') || '—')}</small><div class="chips">${chips.map((c) => `<span class="chip">${h(c)}</span>`).join('')}</div></div></li>`;
    }).join('')}</ol>
    <div class="draw-end"><button data-draw="close">Voir la carte</button><button data-draw="play" class="on">▶ Commencer la partie</button></div>`;
    box.scrollTop = 0;
  };

  function advance(): void {
    if (state.recap) return;
    if (state.step < spins.length) spinNow();
    else if (state.nation < draws.length - 1) showNation(state.nation + 1);
    else recap();
  }

  const close = (play: boolean) => {
    clearTimeout(timer);
    state.token++;
    root.onclick = null;
    root.hidden = true;
    root.innerHTML = '';
    opts.onClose(play);
  };

  root.onclick = (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-draw]');
    if (!b) return;
    switch (b.dataset.draw) {
      case 'skip': settle(); if (state.auto) timer = window.setTimeout(advance, 500 / SPEEDS[state.speed]); break;
      case 'auto':
        state.auto = !state.auto;
        if (state.auto && !state.spinning) advance(); else controls();
        break;
      case 'speed': state.speed = (state.speed + 1) % SPEEDS.length; controls(); break;
      case 'next':
        // En automatique, le bouton passe à la nation suivante ; à la main, il fait tourner la roue courante.
        if (state.spinning) { settle(); if (!state.auto) break; }
        if (!state.auto && state.step < spins.length) { spinNow(); break; }
        if (state.nation < draws.length - 1) showNation(state.nation + 1); else recap();
        break;
      case 'recap': recap(); break;
      case 'close': close(false); break;
      case 'play': close(true); break;
    }
  };

  if (!draws.length) { recap(); return; }
  showNation(0);
}
