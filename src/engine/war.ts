// Guerre : le moteur seul décide de l'issue des combats, des pertes et des
// changements de frontières. Les agents ne choisissent que la posture.

import { addProposal, getRel, peekRel, severTies, shiftOpinion } from './diplomacy';
import { addJournal } from './journal';
import { neighborTable, OCEAN } from './map';
import { clamp, rand, randNorm } from './rng';
import type { Nation, PeaceTerms, War, World } from './types';

export const TRUCE_TICKS = 60;
const MAX_WAR_TICKS = 240;

export type Side = 'attackers' | 'defenders';
export const sideOf = (war: War, id: number): Side | null =>
  war.attackers.includes(id) ? 'attackers' : war.defenders.includes(id) ? 'defenders' : null;
export const other = (s: Side): Side => (s === 'attackers' ? 'defenders' : 'attackers');
export const warsOf = (world: World, id: number): War[] => world.wars.filter((w) => sideOf(w, id));
export const warBetween = (world: World, a: number, b: number): War | undefined =>
  world.wars.find((w) => { const s = sideOf(w, a); return s !== null && w[other(s)].includes(b); });

export function enemiesOf(world: World, id: number): number[] {
  const out: number[] = [];
  for (const w of world.wars) {
    const s = sideOf(w, id);
    if (s) for (const e of w[other(s)]) if (!out.includes(e)) out.push(e);
  }
  return out;
}

/** Une nation peut-elle atteindre l'autre ? Par la terre, ou par la mer avec une flotte. */
export const canReach = (a: Nation, b: Nation) =>
  a.geo.neighbors[b.id] !== undefined || (!a.geo.landlocked && !b.geo.landlocked && a.mil.navy > 0.5);

function setAtWar(world: World, war: War): void {
  for (const a of war.attackers) for (const d of war.defenders) {
    const rel = getRel(world, a, d);
    rel.atWar = true;
    severTies(world, a, d);
    rel.opinion = Math.min(rel.opinion, -50);
  }
}

export function declareWar(world: World, a: number, d: number): War {
  const A = world.nations[a];
  const D = world.nations[d];
  const rel = getRel(world, a, d);
  const justified = rel.claims[a < d ? 0 : 1];
  A.infamy = clamp(A.infamy + (justified ? 4 : 10), 0, 100);
  A.stability = clamp(A.stability - 3, 0, 100);
  const war: War = {
    id: world.nextWarId++, name: `Guerre ${A.name}–${D.name}`, attackers: [a], defenders: [d], start: world.tick,
    score: 0, stance: { [a]: 'offensive', [d]: 'defensive' }, casualties: { [a]: 0, [d]: 0 }, captured: {}, idle: 0,
  };
  world.wars.push(war);
  setAtWar(world, war);
  addJournal(world, 'war_declared', [a, d], `${A.name} déclare la guerre à ${D.name}.`);
  D.mind.urgency = 1;
  // Les amis de la victime se souviennent de l'agresseur ; ses alliés sont appelés.
  for (const n of world.nations) {
    if (!n.alive || n.id === a || n.id === d) continue;
    const r = peekRel(world, n.id, d);
    if (!r) continue;
    if (r.opinion > 20) shiftOpinion(world, n.id, a, -15);
    if (r.defense_pact >= 0 && !warBetween(world, n.id, a)) {
      addProposal(world, { from: d, to: n.id, kind: 'call_to_arms', war: war.id });
    }
  }
  return war;
}

export function joinWar(world: World, war: War, id: number, side: Side): void {
  if (sideOf(war, id)) return;
  war[side].push(id);
  war.stance[id] = side === 'attackers' ? 'offensive' : 'defensive';
  war.casualties[id] = 0;
  setAtWar(world, war);
  const leader = war[side][0];
  addJournal(world, 'war_joined', [id, leader, war[other(side)][0]],
    `${world.nations[id].name} entre en guerre aux côtés de ${world.nations[leader].name}.`);
}

/** Change le propriétaire d'une cellule : population et production suivent. */
export function transferCell(world: World, cell: number, to: number, conquest = true): void {
  const { map, nations } = world;
  const from = map.owner[cell];
  if (from === to) return;
  const T = nations[to];
  map.owner[cell] = to;
  world.geoDirty = true;
  T.geo.cells++;
  if (conquest) T.overextension = Math.min(1, T.overextension + 1 / Math.max(1, T.geo.cells));
  if (from < 0) return;
  const F = nations[from];
  const share = 1 / Math.max(1, F.geo.cells);
  F.geo.cells--;
  const pop = F.pop * share * 0.8;
  F.pop = Math.max(1000, F.pop - F.pop * share);
  T.pop += pop;
  T.gdp += F.gdp * share * 0.6;
  F.gdp -= F.gdp * share;
  if (F.geo.cells <= 0) return annex(world, F, T);
  if (cell === F.capitalCell) {
    // Le gouvernement se replie sur le point du territoire le plus éloigné du front.
    const x0 = cell % map.width;
    const y0 = Math.floor(cell / map.width);
    let best = -1;
    let far = -1;
    for (let i = 0; i < map.owner.length; i++) {
      if (map.owner[i] !== from) continue;
      const d = (i % map.width - x0) ** 2 + (Math.floor(i / map.width) - y0) ** 2;
      if (d > far) { far = d; best = i; }
    }
    if (best >= 0) F.capitalCell = best;
    F.stability = clamp(F.stability - 15, 0, 100);
    // Une seule entrée de journal par campagne, même si le gouvernement fuit plusieurs fois.
    const seen = F.mind.cooldowns.capital_fall ?? 0;
    F.mind.cooldowns.capital_fall = world.tick + 36;
    if (seen <= world.tick) addJournal(world, 'capital_fall', [to, from], `La capitale de ${F.name}, ${F.capitalName}, tombe aux mains de ${T.name}.`);
  }
}

function annex(world: World, F: Nation, T: Nation): void {
  F.alive = false;
  T.treasury += Math.max(0, F.treasury);
  T.pop += F.pop * 0.5;
  T.infamy = clamp(T.infamy + 8, 0, 100);
  addJournal(world, 'annexed', [T.id, F.id], `${F.name} cesse d'exister : son territoire est annexé par ${T.name}.`);
  world.proposals = world.proposals.filter((p) => p.from !== F.id && p.to !== F.id);
  for (const w of [...world.wars]) {
    const s = sideOf(w, F.id);
    if (!s) continue;
    w[s] = w[s].filter((x) => x !== F.id);
    if (w[s].length === 0) endWar(world, w, 'status_quo', `${w.name} s'achève par la disparition d'un camp.`);
  }
}

function clearWarFlags(world: World, war: War, pairs: [number, number][]): void {
  for (const [a, d] of pairs) {
    if (!world.nations[a].alive || !world.nations[d].alive) continue;
    if (world.wars.some((w) => w !== war && sideOf(w, a) && w[other(sideOf(w, a)!)].includes(d))) continue;
    const rel = getRel(world, a, d);
    rel.atWar = false;
    rel.truceUntil = world.tick + TRUCE_TICKS;
  }
}

function settle(world: World, war: War, members: number[], deal: PeaceTerms['deal']): void {
  for (const [cellStr, original] of Object.entries(war.captured)) {
    const cell = +cellStr;
    const holder = world.map.owner[cell];
    if (!members.includes(holder) && !members.includes(original)) continue;
    if (deal === 'white' && holder !== original && world.nations[original].alive) transferCell(world, cell, original, false);
    else if (holder !== original && holder >= 0) world.nations[holder].infamy = clamp(world.nations[holder].infamy + 0.15, 0, 100);
    delete war.captured[cell];
  }
}

export function endWar(world: World, war: War, deal: PeaceTerms['deal'], text?: string): void {
  const i = world.wars.indexOf(war);
  if (i < 0) return;
  settle(world, war, [...war.attackers, ...war.defenders], deal);
  const pairs: [number, number][] = [];
  for (const a of war.attackers) for (const d of war.defenders) pairs.push([a, d]);
  world.wars.splice(i, 1);
  world.warsEnded++;
  clearWarFlags(world, war, pairs);
  world.proposals = world.proposals.filter((p) => p.war !== war.id);
  const years = ((world.tick - war.start) / 12).toFixed(1);
  addJournal(world, 'peace', [...war.attackers, ...war.defenders],
    text ?? `${war.name} prend fin après ${years} ans (${deal === 'white' ? 'retour aux frontières' : 'chacun garde ses positions'}).`,
    false, { deal, score: Math.round(war.score), attackers: war.attackers.join(','), defenders: war.defenders.join(',') });
}

/** Paix séparée d'un membre qui n'est pas chef de camp. */
export function leaveWar(world: World, war: War, id: number, deal: PeaceTerms['deal']): void {
  const s = sideOf(war, id);
  if (!s) return;
  if (war[s][0] === id || war[s].length === 1) return endWar(world, war, deal);
  settle(world, war, [id], deal);
  war[s] = war[s].filter((x) => x !== id);
  clearWarFlags(world, war, war[other(s)].map((e): [number, number] => [id, e]));
  addJournal(world, 'peace', [id, war[other(s)][0]], `${world.nations[id].name} signe une paix séparée et quitte la ${war.name}.`, false, { deal });
}

const strength = (n: Nation) => n.mil.power * (1 - Math.min(0.6, n.warExhaustion / 200));
const terrainDefense = (n: Nation) => 1 + 0.5 * n.geo.terrain.mountain + 0.25 * n.geo.terrain.hills + 0.15 * n.geo.terrain.forest;

export function tickWars(world: World): void {
  const { nations, map } = world;
  for (const n of nations) n.blockaded = false;
  if (!world.wars.length) return;
  const nb = neighborTable(map.width, map.height);

  // Un seul balayage de la carte : cellules de y au contact de x, pour chaque couple en guerre.
  const hostile = new Set<number>();
  const N = nations.length;
  for (const w of world.wars) for (const a of w.attackers) for (const d of w.defenders) { hostile.add(a * N + d); hostile.add(d * N + a); }
  const border = new Map<number, number[]>();
  for (let i = 0; i < map.owner.length; i++) {
    const o = map.owner[i];
    if (o < 0) continue;
    for (let k = 0; k < 6; k++) {
      const j = nb[i * 6 + k];
      const p = j >= 0 ? map.owner[j] : -1;
      if (p < 0 || p === o || !hostile.has(p * N + o)) continue;
      const key = p * N + o;
      let list = border.get(key);
      if (!list) border.set(key, (list = []));
      if (list[list.length - 1] !== i) list.push(i);
    }
  }

  for (const war of [...world.wars]) {
    if (!world.wars.includes(war)) continue;
    const pairs: [Nation, Nation][] = [];
    const fronts = new Map<number, number>();
    for (const a of war.attackers) for (const d of war.defenders) {
      if (border.has(a * N + d) || border.has(d * N + a)) {
        pairs.push([nations[a], nations[d]]);
        fronts.set(a, (fronts.get(a) ?? 0) + 1);
        fronts.set(d, (fronts.get(d) ?? 0) + 1);
      }
    }
    const support = (side: number[]) => side.reduce((s, id) => s + (fronts.has(id) ? 0 : 0.25 * strength(nations[id])), 0) / Math.max(1, pairs.length);
    const supA = support(war.attackers);
    const supD = support(war.defenders);
    let fought = false;

    const lose = (n: Nation, loss: number, cells: number) => {
      n.warExhaustion = clamp(n.warExhaustion + (3000 * loss) / Math.max(1, n.pop) + 0.6 * cells, 0, 150);
    };

    for (const [A, D] of pairs) {
      if (!A.alive || !D.alive) continue;
      const offA = war.stance[A.id] === 'offensive';
      const offD = war.stance[D.id] === 'offensive';
      if (!offA && !offD) continue;
      fought = true;
      const sA = strength(A) / fronts.get(A.id)! + supA;
      const sD = strength(D) / fronts.get(D.id)! + supD;
      const base = 0.006 * Math.min(A.mil.personnel, D.mil.personnel);
      for (const [x, sy] of [[A, sD], [D, sA]] as [Nation, number][]) {
        const loss = Math.min(x.mil.personnel * 0.5, (base * 2 * sy) / (sA + sD + 1e-9));
        x.mil.personnel -= loss;
        x.pop = Math.max(1000, x.pop - loss);
        war.casualties[x.id] = (war.casualties[x.id] ?? 0) + loss;
        const wear = 1 - (0.008 * sy) / (sA + sD + 1e-9);
        x.mil.army *= wear; x.mil.airforce *= wear; x.mil.navy *= wear;
        x.mil.experience = Math.min(100, x.mil.experience + 0.5);
        lose(x, loss, 0);
      }
      const attack = (X: Nation, Y: Nation, sx: number, sy: number, sign: number) => {
        const cells = border.get(X.id * N + Y.id);
        if (!cells || !cells.length || !Y.alive) return;
        const ratio = (sx / Math.max(1e-9, sy * terrainDefense(Y) * (war.stance[Y.id] === 'defensive' ? 1.25 : 1))) * Math.exp(randNorm(world) * 0.25);
        if (ratio <= 1.15) return;
        const k = Math.min(cells.length, Math.max(1, Math.round(Math.min(4, (ratio - 1) * 2))));
        const cx = Y.capitalCell % map.width;
        const cy = Math.floor(Y.capitalCell / map.width);
        const d2 = (c: number) => (c % map.width - cx) ** 2 + (Math.floor(c / map.width) - cy) ** 2;
        cells.sort((p, q) => d2(p) - d2(q));
        const total = Y.geo.cells;
        let taken = 0;
        for (const c of cells.splice(0, k)) {
          if (map.owner[c] !== Y.id) continue;
          if (!(c in war.captured)) war.captured[c] = Y.id;
          transferCell(world, c, X.id);
          taken++;
          if (!Y.alive) break;
        }
        war.score = clamp(war.score + (sign * taken * 60) / Math.max(10, total), -100, 100);
        lose(Y, 0, taken);
      };
      if (offA) attack(A, D, sA, sD, 1);
      if (offD && A.alive && D.alive) attack(D, A, sD, sA, -1);
      // Blocus : une flotte nettement supérieure étouffe le commerce adverse.
      if (A.alive && D.alive) {
        if (!D.geo.landlocked && A.mil.navy > 1.5 * D.mil.navy + 1) D.blockaded = true;
        if (!A.geo.landlocked && D.mil.navy > 1.5 * A.mil.navy + 1) A.blockaded = true;
      }
    }
    if (!world.wars.includes(war)) continue;

    // Sans frontière commune : guerre navale, débarquement possible avec une flotte dominante.
    if (!pairs.length && war.attackers.length && war.defenders.length) {
      for (const [x, y, sign] of [[war.attackers[0], war.defenders[0], 1], [war.defenders[0], war.attackers[0], -1]] as const) {
        const X = nations[x];
        const Y = nations[y];
        if (X.geo.landlocked || Y.geo.landlocked || X.mil.navy <= 1.5 * Y.mil.navy + 1) continue;
        Y.blockaded = true;
        fought = true;
        if (war.stance[x] !== 'offensive' || rand(world) > 0.15) continue;
        for (let tries = 0; tries < 200; tries++) {
          const c = Math.floor(rand(world) * map.owner.length);
          if (map.owner[c] !== y) continue;
          let coastal = false;
          for (let k = 0; k < 6; k++) { const j = nb[c * 6 + k]; if (j >= 0 && map.terrain[j] === OCEAN) coastal = true; }
          if (!coastal) continue;
          if (!(c in war.captured)) war.captured[c] = y;
          transferCell(world, c, x);
          war.score = clamp(war.score + sign * 3, -100, 100);
          addJournal(world, 'landing', [x, y], `${X.name} débarque sur les côtes de ${Y.name}.`);
          break;
        }
      }
    }
    if (!world.wars.includes(war)) continue;

    war.idle = fought ? 0 : war.idle + 1;
    for (const id of [...war.attackers, ...war.defenders]) nations[id].warExhaustion = clamp(nations[id].warExhaustion + 1, 0, 150);
    const LA = nations[war.attackers[0]];
    const LD = nations[war.defenders[0]];
    const age = world.tick - war.start;
    if (war.idle >= 24) endWar(world, war, 'white', `${war.name} s'éteint faute de combats.`);
    else if (age > MAX_WAR_TICKS || (LA.warExhaustion >= 100 && LD.warExhaustion >= 100)) endWar(world, war, 'status_quo', `${war.name} s'achève par un armistice d'épuisement.`);
    else if (LA.warExhaustion >= 130 || LD.warExhaustion >= 130) {
      const loser = LA.warExhaustion >= 130 ? LA : LD;
      endWar(world, war, 'status_quo', `${loser.name}, à bout de forces, capitule : fin de la ${war.name}.`);
    }
  }
}
