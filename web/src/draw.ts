// Tirage des roues, rejoué à l'écran avant le début de la partie.
// Le tirage a déjà eu lieu à la création du monde (le moteur reste seul maître
// du hasard) : chaque roue tourne puis s'arrête sur le résultat réellement tiré.

import { NO_TRAIT, ratingLabel, type WheelDraw, type WheelDraws } from '../../src/engine/wheel';

export interface DrawNation { name: string; flag: string }
export interface DrawOptions {
  data: WheelDraws;
  /** Nom et drapeau (HTML déjà échappé) de chaque nation, par identifiant. */
  nation(id: number): DrawNation;
  /** Appelé à la fermeture ; play = lancer la partie. */
  onClose(play: boolean): void;
}

interface Segment { label: string; weight: number }
interface Spin { key: string; title: string; segments: Segment[]; result: string; shown: string }

const h = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const MAX_SEGMENTS = 12;
const SLOTS: [string, string][] = [['government', 'Régime'], ['economy', 'Économie'], ['rating', 'Classe militaire'], ['trait', 'Traits'], ['start', 'Statut de départ']];
const SPEEDS = [1, 2, 4, 8];
const TONES = ['#2a323c', '#3a4553', '#323b47'];

/** Générateur déterministe : la même nation montre toujours les mêmes segments. */
function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** Une roue lisible : le résultat et quelques autres possibilités de la même roue. */
function sample(pool: string[], result: string, rnd: () => number): Segment[] {
  const others = pool.filter((x) => x !== result);
  for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
  const labels = others.slice(0, MAX_SEGMENTS - 1);
  labels.splice(Math.floor(rnd() * (labels.length + 1)), 0, result);
  return labels.map((label) => ({ label, weight: 1 }));
}

function weighted(pool: [string, number][], result: string): Segment[] {
  const segments = pool.map(([label, weight]) => ({ label, weight }));
  // Un résultat absent de la roue (note recalculée après le tirage) y reçoit une petite part.
  if (!segments.some((s) => s.label === result)) segments.push({ label: result, weight: Math.max(1, segments.reduce((a, s) => a + s.weight, 0) * 0.04) });
  return segments;
}

function spinsFor(d: WheelDraw, pools: WheelDraws['pools']): Spin[] {
  const rnd = seeded(d.id + 1);
  const spins: Spin[] = [];
  if (d.government) spins.push({ key: 'government', title: 'Régime', segments: sample(pools.government, d.government, rnd), result: d.government, shown: d.government });
  if (d.economy) spins.push({ key: 'economy', title: 'Économie', segments: sample(pools.economy, d.economy, rnd), result: d.economy, shown: d.economy });
  spins.push({ key: 'rating', title: 'Classe militaire', segments: weighted(pools.rating, ratingLabel(d.rating)), result: ratingLabel(d.rating), shown: `${d.militaryClass} · ${ratingLabel(d.rating)}` });
  for (const t of d.tags.length ? d.tags : [NO_TRAIT]) spins.push({ key: 'trait', title: 'Trait', segments: sample(pools.trait, t, rnd), result: t, shown: t });
  if (d.start) spins.push({ key: 'start', title: 'Statut de départ', segments: weighted(pools.start, d.start.segment), result: d.start.segment, shown: d.start.text });
  return spins;
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
    const tone = n % 2 && i === n - 1 ? TONES[2] : TONES[i % 2];
    parts += n === 1 ? `<circle r="${R}" fill="${tone}" ${win ? 'data-win' : ''}/>` : `<path d="M0 0 L${at(a0)} A${R} ${R} 0 ${span > 180 ? 1 : 0} 1 ${at(a1)} Z" fill="${tone}" ${win ? 'data-win' : ''}/>`;
    // Le texte suit le rayon ; les segments trop étroits pour un libellé lisible restent muets.
    if (span >= 5.5) labels += `<text transform="rotate(${(a0 + span / 2 - 90).toFixed(2)})" x="${R - 9}" y="3.6" ${win ? 'data-win' : ''}>${h(short(s.label, span < 14 ? 9 : 18))}</text>`;
    a0 = a1;
  });
  const svg = `<svg viewBox="-150 -158 300 308" role="img" aria-label="Roue : ${h(spin.title)}">
    <g class="rot"><g class="segs">${parts}</g><g class="labels">${labels}</g></g>
    <circle r="24" class="hub"/><path class="pointer" d="M-11 -157 H11 L0 -134 Z"/></svg>`;
  return { svg, center, width };
}

export function openDraw(root: HTMLElement, opts: DrawOptions): void {
  const { data } = opts;
  const draws = data.draws;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { nation: 0, step: 0, auto: true, speed: 0, token: 0, spinning: false, done: [] as string[][], recap: false };
  let spins = draws.length ? spinsFor(draws[0], data.pools) : [];
  let timer = 0;

  root.hidden = false;
  root.innerHTML = `
    <header><div><h2>Tirage des roues</h2><small data-el="count"></small></div><button data-draw="recap">Tout révéler</button></header>
    <div class="draw-main">
      <div class="draw-stage">
        <div class="draw-nation" data-el="nation"></div>
        <b class="draw-title" data-el="title"></b>
        <div class="draw-wheel" data-el="wheel" data-draw="skip" aria-live="off"></div>
        <p class="draw-result" data-el="result" aria-live="polite"></p>
      </div>
      <div class="draw-side">
        <div class="draw-slots" data-el="slots"></div>
        <div class="buttons draw-controls">
          <button data-draw="auto" data-el="auto"></button>
          <button data-draw="speed" data-el="speed"></button>
          <button data-draw="next" class="on" data-el="next"></button>
        </div>
      </div>
    </div>
    <div class="draw-recap scroll" data-el="recap" hidden></div>`;
  const el = (name: string) => root.querySelector<HTMLElement>(`[data-el="${name}"]`)!;

  const slots = () => {
    const done = state.done;
    el('slots').innerHTML = SLOTS.filter(([k]) => spins.some((s) => s.key === k)).map(([k, label]) => {
      const values = spins.map((s, i) => (s.key === k && done[state.nation]?.[i] ? s.shown : null)).filter((v): v is string => v !== null);
      return `<div class="stat ${values.length ? '' : 'pending'}"><span>${label}</span><b>${values.length ? h(values.join(', ')) : '…'}</b></div>`;
    }).join('');
  };
  const controls = () => {
    el('auto').textContent = state.auto ? '⏸ Pause' : '▶ Tirage automatique';
    el('speed').textContent = `Vitesse ${SPEEDS[state.speed]}×`;
    const last = state.nation >= draws.length - 1;
    el('next').textContent = state.step < spins.length ? (state.auto ? 'Nation suivante ⏭' : 'Tourner la roue') : last ? 'Voir le récapitulatif' : 'Nation suivante ⏭';
    el('count').textContent = `Nation ${state.nation + 1} sur ${draws.length}`;
  };

  /** Marque la roue courante comme tirée et affiche son résultat. */
  const land = () => {
    const s = spins[state.step];
    if (!s) return;
    state.spinning = false;
    (state.done[state.nation] ??= [])[state.step] = s.shown;
    el('wheel').classList.add('landed');
    el('result').textContent = s.shown;
    state.step++;
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
    state.nation = i; state.step = 0; state.spinning = false;
    spins = spinsFor(draws[i], data.pools);
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
      const chips = [`${d.militaryClass} · ${ratingLabel(d.rating)}`, ...d.tags, ...(d.start ? [d.start.text] : [])];
      return `<li>${n.flag}<div><b>${n.name}</b><small>${h([d.government, d.economy].filter(Boolean).join(' · ') || '—')}</small><div class="chips">${chips.map((c) => `<span class="chip">${h(c)}</span>`).join('')}</div></div></li>`;
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
