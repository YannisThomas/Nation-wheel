import { neighborTable, OCEAN, recomputeGeo, carryingCapacity } from './map';
import { clamp, pick, rand, randInt, randNorm, randRange, spin, type HasRng } from './rng';
import { potentialGdp, militaryPower } from './systems';
import { newMind } from './mind';
import { SEASON1 } from '../data/season1';
import { SIZES, sizeWeight } from '../data/wheels3';
import { applyRoster, spinSeason3, spinWheel } from './wheel';
import { getRel } from './diplomacy';
import {
  GOVERNMENTS, IDEOLOGIES, LEADER_TRAITS, TERRAINS,
  type Budget, type Flag, type Government, type Ideology, type Nation, type World,
} from './types';

// ---- Noms : chaque culture a sa propre palette de sons ----

const ONSETS = ['b', 'd', 'g', 'k', 'l', 'm', 'n', 'r', 's', 't', 'v', 'z', 'th', 'sh', 'kh', 'br', 'dr', 'st', 'tr', 'h', 'f', 'p', 'y', 'w', 'ch'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ia', 'ei', 'ou', 'ae', 'y'];
const CODAS = ['', '', '', 'n', 'r', 's', 'l', 'th', 'm', 'nd', 'k', 'sh'];
const NATION_SUFFIX = ['ia', 'land', 'stan', 'ar', 'os', 'eth', 'ora', 'um', 'en', 'a', 'ica', 'heim', 'mark', 'ovia'];

interface Culture {
  name: string;
  language: string;
  cell: number;
  onsets: string[];
  vowels: string[];
  codas: string[];
  suffixes: string[];
}

const subset = <T>(rng: HasRng, arr: T[], k: number): T[] => {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < k && pool.length) out.push(pool.splice(randInt(rng, pool.length), 1)[0]);
  return out;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function word(rng: HasRng, c: Culture, syllables: number): string {
  let s = '';
  for (let i = 0; i < syllables; i++) s += pick(rng, c.onsets) + pick(rng, c.vowels);
  return s + pick(rng, c.codas);
}

function makeCulture(rng: HasRng, cell: number): Culture {
  const c: Culture = {
    name: '', language: '', cell,
    onsets: subset(rng, ONSETS, 7), vowels: subset(rng, VOWELS, 4),
    codas: subset(rng, CODAS, 4), suffixes: subset(rng, NATION_SUFFIX, 3),
  };
  const root = cap(word(rng, c, 2));
  c.name = root;
  c.language = root + pick(rng, ['i', 'an', 'ic', 'ese', 'ish']);
  return c;
}

const FLAG_COLORS = ['#c0392b', '#2471a3', '#1e8449', '#f1c40f', '#ecf0f1', '#17202a', '#d35400', '#7d3c98', '#148f77', '#f5b041', '#85c1e9', '#922b21'];
const FLAG_PATTERNS: Flag['pattern'][] = ['horizontal', 'vertical', 'cross', 'canton', 'disc', 'diagonal'];

// ---- Tables de la roue ----

const SIZE_WHEEL = [[0.35, 2], [0.7, 4], [1, 4], [1.45, 2], [2, 0.8]] as const;
/** [tech min, tech max], poids */
const DEV_WHEEL: [[number, number], number][] = [[[8, 20], 3], [[20, 40], 4], [[40, 60], 3], [[60, 78], 1.5], [[78, 90], 0.5]];
const TERRAIN_COST = [Infinity, 1, 1.3, 1.6, 3, 1.8, 2];

const IDEOLOGY_BY_GOV: Partial<Record<Government, Ideology[]>> = {
  theocracy: ['theocratic', 'conservative'],
  military_junta: ['militarist', 'nationalist'],
  one_party_state: ['communist', 'socialist', 'nationalist', 'technocratic'],
  empire: ['nationalist', 'militarist', 'conservative', 'mercantile'],
  tribal_confederation: ['conservative', 'isolationist', 'nationalist'],
};

function baseBudget(gov: Government, ideo: Ideology): Budget {
  const b: Budget = { military: 0.12, research: 0.06, education: 0.16, infrastructure: 0.14, welfare: 0.4, industry: 0.12 };
  if (ideo === 'militarist' || gov === 'military_junta') b.military += 0.14;
  if (ideo === 'nationalist' || gov === 'empire') b.military += 0.06;
  if (ideo === 'technocratic') { b.research += 0.08; b.education += 0.05; }
  if (ideo === 'socialist' || ideo === 'communist') { b.welfare += 0.08; b.industry += 0.05; }
  if (ideo === 'mercantile') { b.infrastructure += 0.07; b.industry += 0.05; }
  if (ideo === 'liberal') b.education += 0.04;
  if (ideo === 'isolationist') b.military += 0.03;
  const sum = b.military + b.research + b.education + b.infrastructure + b.welfare + b.industry;
  for (const k of Object.keys(b) as (keyof Budget)[]) b[k] /= sum;
  return b;
}

class Heap {
  private items: [number, number, number][] = [];
  get size() { return this.items.length; }
  push(item: [number, number, number]) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number, number] {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Place les capitales, fait croître les territoires puis tire les caractéristiques. */
export function generateNations(world: World): void {
  const { map, config } = world;
  const nb = neighborTable(map.width, map.height);
  const land: number[] = [];
  for (let i = 0; i < map.terrain.length; i++) if (map.terrain[i] !== OCEAN) land.push(i);
  const roster = config.roster === 'season1' ? SEASON1 : null;
  const count = Math.min(roster ? roster.length : config.nations, Math.floor(land.length / 3));
  const dist2 = (a: number, b: number) => {
    const dx = (a % map.width) - (b % map.width);
    const dy = Math.floor(a / map.width) - Math.floor(b / map.width);
    return dx * dx + dy * dy;
  };

  // Capitales : « meilleur de k candidats », le plus loin des capitales existantes,
  // en favorisant les terres fertiles.
  const capitals: number[] = [];
  const taken = new Set<number>();
  for (let n = 0; n < count; n++) {
    let best = -1;
    let bestScore = -1;
    for (let k = 0; k < 24; k++) {
      const c = land[randInt(world, land.length)];
      if (taken.has(c)) continue;
      let d = Infinity;
      for (const o of capitals) d = Math.min(d, dist2(c, o));
      const score = Math.min(d, 1e6) * (0.3 + map.fertility[c]);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (best < 0) break;
    capitals.push(best);
    taken.add(best);
  }

  // Croissance simultanée (Dijkstra multi-sources) bornée par un rayon tiré à la roue.
  const baseRadius = Math.sqrt(land.length / capitals.length / Math.PI) * 1.25;
  // Saison 3 : la roue « Country Size » fixe la part de carte de chaque nation.
  const sizes = config.roster === 'season3' ? capitals.map(() => spin(world, SIZES.map((k): [number, number] => [k, sizeWeight(k)]))) : null;
  const radius = capitals.map(() => (roster || sizes ? Infinity : baseRadius * spin(world, SIZE_WHEEL)));
  // Avec les nations de la saison 1, la superficie tirée fixe le nombre de cellules (ramené à l'échelle de la carte).
  const rosterArea = roster ? roster.slice(0, capitals.length).reduce((s, e) => s + (e.area ?? 3e5), 0) : 0;
  // Les superficies tirées vont de 1 000 à 10 millions de km² : la racine carrée atténue l'écart pour que
  // les petites nations existent sur la carte, et un quart des terres reste libre pour la colonisation.
  const sizeTotal = sizes ? sizes.reduce((s, k) => s + Math.sqrt(k), 0) : 0;
  const limit = capitals.map((_, i) => (roster ? Math.max(1, Math.round(((roster[i].area ?? 3e5) / rosterArea) * land.length * 0.9))
    : sizes ? Math.max(1, Math.round((Math.sqrt(sizes[i]) / sizeTotal) * land.length * 0.75)) : Infinity));
  const owned = capitals.map(() => 0);
  const cost = new Float64Array(map.terrain.length).fill(Infinity);
  const heap = new Heap();
  capitals.forEach((c, id) => { cost[c] = 0; heap.push([0, c, id]); });
  while (heap.size) {
    const [d, c, id] = heap.pop();
    if (d > cost[c] || map.owner[c] >= 0 || owned[id] >= limit[id]) continue;
    map.owner[c] = id;
    owned[id]++;
    for (let k = 0; k < 6; k++) {
      const j = nb[c * 6 + k];
      if (j < 0 || map.owner[j] >= 0) continue;
      const nd = d + TERRAIN_COST[map.terrain[j]];
      if (nd < cost[j] && nd <= radius[id]) { cost[j] = nd; heap.push([nd, j, id]); }
    }
  }

  const cultures = Array.from({ length: Math.max(3, Math.round(capitals.length / 5)) }, () =>
    makeCulture(world, land[randInt(world, land.length)]));
  const usedNames = new Set<string>();

  world.nations = capitals.map((capitalCell, id): Nation => {
    let culture = cultures[0];
    for (const c of cultures) if (dist2(c.cell, capitalCell) < dist2(culture.cell, capitalCell)) culture = c;
    let name = '';
    do name = cap(word(world, culture, 1 + randInt(world, 2))) + pick(world, culture.suffixes);
    while (usedNames.has(name));
    usedNames.add(name);

    const government = pick(world, GOVERNMENTS);
    const ideology = pick(world, IDEOLOGY_BY_GOV[government] ?? IDEOLOGIES);
    const [techMin, techMax] = spin(world, DEV_WHEEL);
    const tech = randRange(world, techMin, techMax);
    const around = (base: number, sd: number) => clamp(base + randNorm(world) * sd, 3, 95);
    const colors = subset(world, FLAG_COLORS, 3) as [string, string, string];

    return {
      id, alive: true, name,
      capitalName: cap(word(world, culture, 2)), capitalCell,
      flag: { pattern: pick(world, FLAG_PATTERNS), colors },
      culture: culture.name, language: culture.language,
      government, ideology,
      leader: { name: `${cap(word(world, culture, 2))} ${cap(word(world, culture, 2))}`, trait: pick(world, LEADER_TRAITS), since: 0 },
      status: 'minor_power', foundedTick: 0,
      pop: 0, popGrowth: 0, urbanization: around(15 + tech * 0.6, 6),
      education: around(tech * 0.9, 8), health: around(30 + tech * 0.6, 6),
      hdi: 0, qualityOfLife: 0, stability: randRange(world, 45, 80),
      gdp: 0, gdpGrowth: 0, treasury: 0, debt: 0,
      taxRate: clamp(0.14 + tech * 0.002 + (ideology === 'socialist' || ideology === 'communist' ? 0.06 : 0) + randNorm(world) * 0.02, 0.08, 0.45),
      revenue: 0, expenses: 0, tech,
      industry: around(tech * 0.8, 10), infrastructure: around(tech * 0.85, 8),
      budget: baseBudget(government, ideology),
      militaryResearchShare: ideology === 'militarist' ? 0.4 : 0.2,
      mil: {
        personnel: 0, reserves: 0, mobilization: 0, army: 0, airforce: 0, navy: 0,
        tech: clamp(tech * randRange(world, 0.8, 1.1), 3, 95), experience: randRange(world, 15, 50),
        logistics: 0, doctrine: 'balanced', budget: 0, power: 0,
      },
      geo: undefined as never, // rempli par recomputeGeo juste en dessous
      infamy: 0, tradeBonus: 0, exports: 0, imports: 0, warExhaustion: 0, overextension: 0,
      bloc: -1, sphereOf: -1, blockaded: false, overlord: -1, colony: false, capacityFactor: 1,
      wheel: { government: '', economy: '', militaryClass: '', militaryRating: 0, tags: [], bloc: '' },
      mind: newMind(world),
    };
  });

  recomputeGeo(world);

  for (const n of world.nations) {
    const g = n.geo;
    n.pop = Math.max(5000, carryingCapacity(n, map) * randRange(world, 0.35, 0.85));
    n.gdp = potentialGdp(n) * 0.95;
    n.debt = n.gdp * randRange(world, 0, 0.6);
    n.treasury = n.gdp * 0.02;
    const m = n.mil;
    const martial = n.ideology === 'militarist' || n.government === 'military_junta' ? 1.6 : 1;
    m.personnel = n.pop * 0.004 * martial;
    m.reserves = n.pop * 0.02;
    m.logistics = clamp(n.infrastructure * 0.7 + m.tech * 0.3, 3, 95);
    m.doctrine = g.landlocked ? pick(world, ['defensive', 'balanced', 'offensive', 'guerrilla'] as const)
      : g.coastCells / g.cells > 0.5 ? 'naval'
      : g.terrain.mountain + g.terrain.hills + g.terrain.forest > 0.6 && rand(world) < 0.5 ? 'guerrilla'
      : pick(world, ['defensive', 'balanced', 'offensive'] as const);
    const points = n.gdp * n.budget.military * n.taxRate * 6; // ~3 ans de budget militaire accumulé
    const navyShare = g.landlocked ? 0 : m.doctrine === 'naval' ? 0.4 : 0.15;
    m.navy = points * navyShare;
    m.airforce = points * (1 - navyShare) * clamp(n.tech / 200, 0, 0.4);
    m.army = points - m.navy - m.airforce;
    m.power = militaryPower(n);
  }
  // Les voisins se connaissent dès le départ.
  for (const n of world.nations) for (const o of Object.keys(n.geo.neighbors)) getRel(world, n.id, +o);
  if (roster) applyRoster(world, roster);
  else if (sizes) {
    spinSeason3(world, sizes);
    // Le régime vient d'être tiré : le budget suit.
    for (const n of world.nations) { n.budget = baseBudget(n.government, n.ideology); n.militaryResearchShare = n.ideology === 'militarist' ? 0.4 : 0.2; }
  }
  else spinWheel(world);
  // Une population tirée au-delà de ce que la terre nourrit vit d'importations.
  for (const n of world.nations) {
    const cap = carryingCapacity(n, map) * (1 + Math.min(2, (n.gdp * 1e9) / Math.max(1, n.pop) / 15000));
    if (n.pop > cap * 0.8) n.capacityFactor = (n.pop / Math.max(1, cap)) * 1.25;
  }
}

export { TERRAINS };
