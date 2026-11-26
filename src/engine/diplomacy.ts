// Relations, traités, propositions, sanctions et commerce.

import { addJournal } from './journal';
import { clamp } from './rng';
import { eraMods } from './seasons';
import type { Ideology, Nation, Proposal, Relation, TreatyKind, World } from './types';
import { TREATY_KINDS } from './types';

export const relKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
/** Index de la direction from→to dans les couples [a→b, b→a]. */
export const dir = (from: number, to: number) => (from < to ? 0 : 1);
export const peekRel = (world: World, a: number, b: number): Relation | undefined => world.relations[relKey(a, b)];

export function getRel(world: World, a: number, b: number): Relation {
  const key = relKey(a, b);
  let rel = world.relations[key];
  if (!rel) {
    rel = { opinion: 0, trade: -1, non_aggression: -1, defense_pact: -1, sanctions: [false, false], claims: [false, false], truceUntil: -1, atWar: false };
    rel.opinion = baseline(world, world.nations[a], world.nations[b], rel);
    world.relations[key] = rel;
  }
  return rel;
}

// Index « qui a une relation avec qui », reconstruit au plus une fois par tick :
// évite de parcourir toutes les nations pour chaque décision.
let indexFor: World | null = null;
let indexTick = -1;
let index = new Map<number, number[]>();

/** Nations avec lesquelles `id` entretient une relation enregistrée. */
export function partnersOf(world: World, id: number): number[] {
  if (indexFor !== world || indexTick !== world.tick) {
    index = new Map();
    for (const key in world.relations) {
      const sep = key.indexOf(':');
      const a = +key.slice(0, sep);
      const b = +key.slice(sep + 1);
      (index.get(a) ?? index.set(a, []).get(a)!).push(b);
      (index.get(b) ?? index.set(b, []).get(b)!).push(a);
    }
    indexFor = world; indexTick = world.tick;
  }
  return index.get(id) ?? [];
}

export const TREATY_LABEL: Record<TreatyKind, string> = {
  trade: 'accord commercial', non_aggression: 'pacte de non-agression', defense_pact: 'pacte de défense',
};

const GROUP: Record<Ideology, string> = {
  socialist: 'left', communist: 'left', conservative: 'right', nationalist: 'right', militarist: 'right',
  theocratic: 'right', liberal: 'open', mercantile: 'open', technocratic: 'open', isolationist: 'alone',
};
const COMMUNIST_FOES: Ideology[] = ['theocratic', 'conservative', 'mercantile', 'liberal'];

function affinity(a: Nation, b: Nation): number {
  if (a.ideology === 'communist' && COMMUNIST_FOES.includes(b.ideology)) return -15;
  if (b.ideology === 'communist' && COMMUNIST_FOES.includes(a.ideology)) return -15;
  if (a.ideology === b.ideology) return a.ideology === 'nationalist' || a.ideology === 'militarist' ? -4 : 15;
  return GROUP[a.ideology] === GROUP[b.ideology] ? 6 : -3;
}

/** Opinion d'équilibre vers laquelle la relation dérive. */
export function baseline(world: World, a: Nation, b: Nation, rel: Relation): number {
  if (rel.atWar) return -80;
  const neighbors = a.geo.neighbors[b.id] !== undefined;
  let v = affinity(a, b) + (a.culture === b.culture ? 10 : 0) + (a.government === b.government ? 5 : 0)
    - (neighbors ? 6 : 0) - 0.4 * (a.infamy + b.infamy)
    + (rel.trade >= 0 ? 10 : 0) + (rel.non_aggression >= 0 ? 10 : 0) + (rel.defense_pact >= 0 ? 25 : 0)
    - 30 * (+rel.sanctions[0] + +rel.sanctions[1]) - 20 * (+rel.claims[0] + +rel.claims[1])
    + (a.leader.trait === 'diplomat' ? 5 : 0) + (b.leader.trait === 'diplomat' ? 5 : 0)
    + (a.overlord === b.id || b.overlord === a.id ? 10 : 0);
  if (neighbors) {
    const ratio = Math.max(a.mil.power, b.mil.power) / Math.max(1, Math.min(a.mil.power, b.mil.power));
    if (ratio > 3) v -= 8; // un voisin écrasant inquiète
  }
  return clamp(v, -100, 100);
}

export const shiftOpinion = (world: World, a: number, b: number, delta: number) => {
  const rel = getRel(world, a, b);
  rel.opinion = clamp(rel.opinion + delta, -100, 100);
};

export const pendingFor = (world: World, id: number): Proposal[] => world.proposals.filter((p) => p.to === id);

export function addProposal(world: World, p: Omit<Proposal, 'id' | 'tick' | 'expires'>, ttl = 6): Proposal {
  const full: Proposal = { ...p, id: world.nextProposalId++, tick: world.tick, expires: world.tick + ttl };
  world.proposals.push(full);
  world.nations[p.to].mind.urgency = Math.max(world.nations[p.to].mind.urgency, p.kind === 'call_to_arms' || p.kind === 'peace' ? 0.9 : 0.5);
  return full;
}

export function signTreaty(world: World, a: number, b: number, kind: TreatyKind): void {
  const rel = getRel(world, a, b);
  rel[kind] = world.tick;
  rel.opinion = clamp(rel.opinion + (kind === 'defense_pact' ? 15 : 8), -100, 100);
  addJournal(world, 'treaty', [a, b], `${world.nations[a].name} et ${world.nations[b].name} signent un ${TREATY_LABEL[kind]}.`, false, { kind });
}

export function breakTreaty(world: World, breaker: number, other: number, kind: TreatyKind, betrayal = false): void {
  const rel = getRel(world, breaker, other);
  rel[kind] = -1;
  const B = world.nations[breaker];
  const O = world.nations[other];
  if (betrayal) {
    rel.opinion = clamp(rel.opinion - 40, -100, 100);
    B.infamy = clamp(B.infamy + 5, 0, 100);
    addJournal(world, 'betrayal', [breaker, other], `${B.name} trahit ${O.name} et abandonne leur ${TREATY_LABEL[kind]}.`, false, { kind });
  } else {
    rel.opinion = clamp(rel.opinion - (kind === 'trade' ? 10 : kind === 'non_aggression' ? 25 : 20), -100, 100);
    if (kind === 'non_aggression') B.infamy = clamp(B.infamy + 3, 0, 100);
    addJournal(world, 'treaty_broken', [breaker, other], `${B.name} rompt son ${TREATY_LABEL[kind]} avec ${O.name}.`, false, { kind });
  }
  O.mind.urgency = Math.max(O.mind.urgency, 0.6);
}

/** Rompt tout ce qui lie une nation disparue ou deux nations entrant en guerre. */
export function severTies(world: World, a: number, b: number): void {
  const rel = getRel(world, a, b);
  for (const k of TREATY_KINDS) rel[k] = -1;
}

export function tickDiplomacy(world: World): void {
  const { nations } = world;
  let worldGdp = 0;
  for (const n of nations) if (n.alive) worldGdp += n.gdp;
  worldGdp = Math.max(1e-6, worldGdp);
  const tradeEra = eraMods(world).trade;
  const bonus = new Float64Array(nations.length);
  const penalty = new Float64Array(nations.length);

  for (const key in world.relations) {
    const rel = world.relations[key];
    const sep = key.indexOf(':');
    const a = nations[+key.slice(0, sep)];
    const b = nations[+key.slice(sep + 1)];
    if (!a.alive || !b.alive) { delete world.relations[key]; continue; }
    rel.opinion += (baseline(world, a, b, rel) - rel.opinion) * 0.02;
    if (rel.trade >= 0 && !rel.atWar) {
      bonus[a.id] += 0.01 + Math.min(0.03, b.gdp / worldGdp);
      bonus[b.id] += 0.01 + Math.min(0.03, a.gdp / worldGdp);
    }
    if (rel.sanctions[0]) { penalty[b.id] += 0.003 + Math.min(0.03, 0.15 * a.gdp / worldGdp); penalty[a.id] += 0.002; }
    if (rel.sanctions[1]) { penalty[a.id] += 0.003 + Math.min(0.03, 0.15 * b.gdp / worldGdp); penalty[b.id] += 0.002; }
  }

  for (const n of nations) {
    if (!n.alive) continue;
    n.tradeBonus = Math.min(0.25, bonus[n.id] * tradeEra) * (n.blockaded ? 0.3 : 1) - Math.min(0.15, penalty[n.id]);
    const deposits = Object.values(n.geo.resources).reduce((x, y) => x + y, 0);
    n.exports = n.gdp * (0.06 + Math.max(0, n.tradeBonus) * 1.5) * (n.geo.landlocked ? 0.7 : 1.1) * (n.blockaded ? 0.4 : 1);
    n.imports = n.exports * (1.1 - Math.min(0.2, deposits / Math.max(1, n.geo.cells)));
    n.infamy = Math.max(0, n.infamy - 0.15);
    n.overextension *= 0.985;
  }

  // Propositions expirées. Ignorer un appel aux armes vaut refus : c'est une trahison.
  if (world.proposals.length) {
    const keep: Proposal[] = [];
    for (const p of world.proposals) {
      const alive = nations[p.from].alive && nations[p.to].alive;
      if (alive && p.expires > world.tick) { keep.push(p); continue; }
      if (alive && p.kind === 'call_to_arms' && peekRel(world, p.from, p.to)?.defense_pact !== -1) breakTreaty(world, p.to, p.from, 'defense_pact', true);
    }
    world.proposals = keep;
  }

  if (world.tick % 12 === 0) updateBlocs(world);
}

/** Blocs = composantes connexes du graphe des pactes de défense ; sphères d'influence. */
export function updateBlocs(world: World): void {
  const { nations } = world;
  const parent = nations.map((n) => n.id);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const patrons: [number, number][] = [];
  for (const key in world.relations) {
    const rel = world.relations[key];
    const [a, b] = key.split(':').map(Number);
    if (rel.defense_pact >= 0) parent[find(a)] = find(b);
    if ((rel.defense_pact >= 0 || rel.trade >= 0) && rel.opinion > 40) patrons.push([a, b], [b, a]);
  }
  const leader = new Map<number, Nation>();
  const size = new Map<number, number>();
  for (const n of nations) {
    if (!n.alive) continue;
    const root = find(n.id);
    size.set(root, (size.get(root) ?? 0) + 1);
    const cur = leader.get(root);
    if (!cur || n.mil.power > cur.mil.power) leader.set(root, n);
  }
  for (const n of nations) {
    const root = find(n.id);
    n.bloc = n.alive && (size.get(root) ?? 0) > 1 ? leader.get(root)!.id : -1;
    n.sphereOf = -1;
  }
  for (const [client, patron] of patrons) {
    const c = nations[client];
    const p = nations[patron];
    if (p.gdp > 5 * c.gdp && (c.sphereOf < 0 || p.gdp > nations[c.sphereOf].gdp)) c.sphereOf = patron;
  }
  for (const n of nations) if (n.alive && n.overlord >= 0) n.sphereOf = n.overlord;
}
