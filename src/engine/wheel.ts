// Ce que la roue de Nation Wheel tire réellement, d'après le wiki : régime,
// type d'économie, classe militaire notée sur 11, traits, statut de départ
// (colonie, protectorat, rivalité, guerre, alliance, paria). Le tirage fixe
// le point de départ ; le moteur fait ensuite évoluer le monde.

import type { RosterEntry } from '../data/season1';
import {
  ACTIVE_DUTY, ARMIES, BACKGROUNDS, COLONIAL, DOCTRINES, GDPS, GREAT_PEOPLE, HDIS, IDEOLOGIES as S3_IDEOLOGIES, IMPACTS, POPULATIONS, REGIONS, REGION_WHEEL, RESOURCE_DEPOSIT, SECRET_SERVICES, SIZES, SPECIALIZATIONS,
  activeDutyWeight, doctrineTitle, gdpLabel, greatKind, resourceValue, hdiLabel, pctLabel, popLabel, resourceWheel, sizeLabel, sizeWeight, type Weighted,
} from '../data/wheels3';
import { getRel } from './diplomacy';
import { clamp, pick, rand, spin, type HasRng } from './rng';
import { computeHdi, militaryPower, potentialGdp } from './systems';
import { declareWar, warBetween } from './war';
import { RESOURCES, type Government, type Ideology, type Nation, type StartKind, type WheelSpin, type World } from './types';

export const TAG_FR: Record<string, string> = {
  maritime: 'Maritime', cyber: 'Cybernétique', democratic: 'Démocratique', wealthy: 'Fortuné', green: 'Écologique',
  pacifist: 'Pacifiste', expansionist: 'Expansionniste', nuclear: 'Nucléaire', religious: 'Mystique',
};

const GOV_LABELS: Record<Government, string[]> = {
  republic: ['République', 'République présidentielle', 'Démocratie parlementaire', 'République académique'],
  federation: ['République fédérale', 'Confédération', 'Union décentralisée', 'Républiques unies'],
  constitutional_monarchy: ['Monarchie constitutionnelle', 'Monarchie médiatique'],
  absolute_monarchy: ['Monarchie absolue', 'Royaume traditionnel', 'Monarchie agraire'],
  one_party_state: ['République socialiste', 'République autoritaire', 'État communiste', 'Cyber-dictature'],
  military_junta: ['Junte', 'Stratocratie', 'Dictature militaire', 'Junte navale'],
  theocracy: ['Théocratie', 'Royaume théocratique', 'Conseil chamanique'],
  oligarchy: ['Oligarchie financière', 'État-entreprise', 'République des guildes', 'Confédération marchande'],
  tribal_confederation: ['Confédération tribale', 'Conseil des clans', 'Royaume tribal'],
  empire: ['Empire', 'Empire fédéral', 'Empire marchand', 'Empire des clans'],
};
const ECONOMIES = ['Finance', 'Pétrole et gaz', 'Technologie', 'Agriculture', 'Tourisme', 'Industrie lourde', 'Mines', 'Textile', 'Énergie', 'Pharmacie', 'Robotique', 'Spatial', 'Pêche', 'Commerce maritime', 'Éducation', 'Divertissement', 'Jeux d\'argent', 'Paradis fiscal', 'Hydroélectricité', 'Économie verte', 'Défense', 'Biotechnologies', 'Manufacture', 'Santé'];
// Répartition des notes militaires observée sur les nations de la saison 1.
const RATING_WHEEL: [number, number][] = [[0, 6], [2, 11], [3, 14], [4, 12], [5, 10], [6, 8], [7, 16], [8, 6], [9, 8], [10, 8], [11, 4]];
const TAG_WHEEL = ['maritime', 'cyber', 'democratic', 'wealthy', 'green', 'pacifist', 'expansionist', 'nuclear', 'religious'];
// Statut de départ : la plupart des nations naissent libres et sans histoire.
const START_WHEEL: [StartKind, number][] = [['none', 54], ['colony', 6], ['protectorate', 4], ['rival', 10], ['tension', 6], ['allied', 10], ['trade', 8], ['pariah', 2]];
export const START_FR: Record<StartKind, string> = {
  none: 'Libre', colony: 'Colonie', protectorate: 'Protectorat', overlord: 'Protectrice', rival: 'Rivalité', tension: 'Tensions',
  allied: 'Alliance', trade: 'Commerce', pariah: 'Paria', war: 'Guerre',
};

/** Classe militaire lisible, façon Nation Wheel. */
export function militaryClass(n: Nation, rating: number): string {
  const m = n.mil;
  const total = m.army + m.airforce + m.navy;
  const branch = total > 0 && m.navy / total > 0.38 ? 'navale' : total > 0 && m.airforce / total > 0.33 ? 'aérienne' : 'terrestre';
  return ['Aucune armée', 'Petite armée défensive', 'Petite armée défensive', 'Armée standard', 'Armée moyenne', 'Grande armée', 'Armée avancée',
    `Superpuissance ${branch}`, 'Puissance régionale', 'Puissance continentale', 'Puissance expansionniste', 'Hégémonie militaire'][clamp(Math.round(rating), 0, 11)];
}

/** Puissance de référence : la médiane, pour qu'une poignée de géants ne ramène pas tout le monde à 1/11. */
const meanPower = (world: World) => {
  const p = world.nations.filter((n) => n.alive && n.mil.power > 0).map((n) => n.mil.power).sort((a, b) => a - b);
  return Math.max(1, p[p.length >> 1] ?? 1);
};

/** Note sur 11 d'après la puissance relative : 4 = puissance médiane, +2,2 par doublement. */
export function updateRatings(world: World): void {
  const mean = meanPower(world);
  for (const n of world.nations) {
    if (!n.alive) continue;
    const rating = n.mil.personnel < 500 ? 0 : clamp(Math.round(4 + 2.2 * Math.log2(Math.max(1e-6, n.mil.power / mean))), 1, 11);
    n.wheel.militaryRating = rating;
    n.wheel.militaryClass = world.config.roster === 'season3' ? s3Class(rating) : militaryClass(n, rating);
  }
}

/** Donne à chaque nation l'armée correspondant à sa note tirée. */
function armToRating(world: World, ratings: number[]): void {
  const mean = meanPower(world);
  for (const n of world.nations) {
    const rating = ratings[n.id];
    if (rating < 0) continue;
    const m = n.mil;
    if (rating === 0) { m.personnel = Math.min(m.personnel, 300); m.army = m.airforce = m.navy = 0; m.power = militaryPower(n); continue; }
    const target = mean * 2 ** ((rating - 4) / 2.2);
    const quality = (0.5 + m.tech / 100) * (0.6 + m.experience / 125) * (0.6 + m.logistics / 125);
    const equipment = Math.max(0, (target / quality - Math.sqrt(m.personnel) / 10) / 5);
    const old = m.army + m.airforce + m.navy;
    const navy = n.geo.landlocked ? 0 : old > 0 ? m.navy / old : 0.15;
    const air = old > 0 ? m.airforce / old : 0.1;
    m.navy = equipment * navy; m.airforce = equipment * air; m.army = equipment * (1 - navy - air);
    m.power = militaryPower(n);
  }
}

function setVassal(world: World, vassal: Nation, overlord: Nation, colony: boolean): void {
  if (vassal.id === overlord.id || overlord.overlord === vassal.id) return;
  vassal.overlord = overlord.id;
  vassal.colony = colony;
  const rel = getRel(world, vassal.id, overlord.id);
  rel.opinion = Math.max(rel.opinion, 15);
}

/** Tirage complet pour un monde aléatoire. */
export function spinWheel(world: World): void {
  const ratings: number[] = [];
  for (const n of world.nations) {
    const tags: string[] = [];
    for (let i = 0; i < 2; i++) if (rand(world) < 0.35) { const t = pick(world, TAG_WHEEL); if (!tags.includes(t) && !(t === 'maritime' && n.geo.landlocked)) tags.push(t); }
    n.wheel = { government: pick(world, GOV_LABELS[n.government]), economy: pick(world, ECONOMIES), militaryClass: '', militaryRating: 0, tags, bloc: '' };
    ratings[n.id] = spin(world, RATING_WHEEL);
  }
  armToRating(world, ratings);
  for (const n of world.nations) {
    const neighbors = Object.keys(n.geo.neighbors).map(Number);
    if (!neighbors.length) { n.wheel.start = { kind: 'none', target: -1, applied: true }; continue; }
    const o = world.nations[pick(world, neighbors)];
    const rel = getRel(world, n.id, o.id);
    const kind = spin(world, START_WHEEL);
    let applied = true;
    if (kind === 'colony' || kind === 'protectorate') {
      applied = o.mil.power > 1.5 * n.mil.power && o.overlord < 0 && n.overlord < 0;
      if (applied) { setVassal(world, n, o, kind === 'colony'); applied = n.overlord === o.id; }
    }
    else if (kind === 'rival') { rel.opinion = -55; rel.claims[n.id < o.id ? 0 : 1] = true; }
    else if (kind === 'tension') rel.opinion = -35;
    else if (kind === 'allied') { applied = n.overlord < 0 && o.overlord < 0; if (applied) { rel.defense_pact = 0; rel.opinion = Math.max(rel.opinion, 55); } }
    else if (kind === 'trade') { rel.trade = 0; rel.opinion = Math.max(rel.opinion, 25); }
    else if (kind === 'pariah') n.infamy = 60;
    n.wheel.start = { kind, target: kind === 'none' || kind === 'pariah' ? -1 : o.id, applied };
  }
  updateRatings(world);
}

const GOV_RULES: [RegExp, Government][] = [
  [/constitutional/i, 'constitutional_monarchy'], [/empire|superstate|dominion/i, 'empire'], [/monarch|kingdom/i, 'absolute_monarchy'],
  [/junta|stratocr|military|warrior|warlord/i, 'military_junta'], [/theocra|ritual|shaman/i, 'theocracy'],
  [/oligarch|corporat|guild|financial|gambling|merchant|trade|corporate/i, 'oligarchy'], [/trib|clan|nomad/i, 'tribal_confederation'],
  [/communis|socialist|people|fascis|dictat|auth|labor/i, 'one_party_state'], [/federa|confeder|union|united|commonwealth|commune/i, 'federation'],
];
const IDEO_RULES: [RegExp, Ideology][] = [
  [/communis|labor/i, 'communist'], [/socialist|social|progressive|commune|people/i, 'socialist'], [/fascis|expansionist|superstate/i, 'nationalist'],
  [/military|stratocr|junta|warrior|warlord/i, 'militarist'], [/theocra|ritual|shaman/i, 'theocratic'], [/techno|ai |robot|cyber|drone|academic/i, 'technocratic'],
  [/trade|mercantile|guild|corporat|financial|merchant|gambling|pharma|industrial/i, 'mercantile'], [/anarch|independent|crypto|fallen/i, 'isolationist'],
  [/democra|republic|parliament|federal/i, 'liberal'],
];
const match = <T>(rules: [RegExp, T][], s: string, fallback: T): T => rules.find(([re]) => re.test(s))?.[1] ?? fallback;

/** Applique les tirages réels de la saison 1 aux nations placées sur la carte. */
export function applyRoster(world: World, roster: RosterEntry[]): void {
  const ratings: number[] = [];
  const byName = (raw: string): Nation | undefined => {
    const q = raw.replace(/^vs\s+/i, '').replace(/\./g, '').trim().toLowerCase();
    if (q.length < 3) return undefined;
    return world.nations.find((n) => n.name.toLowerCase() === q) ?? world.nations.find((n) => n.name.toLowerCase().replace(/\./g, '').includes(q) || q.includes(n.name.toLowerCase().replace(/\./g, '')));
  };
  world.nations.forEach((n, i) => {
    const e = roster[i];
    if (!e) return;
    n.name = e.name;
    n.government = match(GOV_RULES, e.gov, 'republic');
    n.ideology = match(IDEO_RULES, e.gov, 'conservative');
    n.wheel = { government: e.gov, economy: e.economy, militaryClass: e.military, militaryRating: Math.max(0, e.rating), tags: e.tags, bloc: e.bloc };
    n.pop = Math.max(1000, e.pop);
    // Le tirage donne parfois plus d'habitants que la terre n'en nourrit : la nation vit alors d'importations.
    n.capacityFactor = 1;
    if (e.gdp !== null) {
      // On cherche le niveau technologique qui donne le PIB tiré.
      let lo = 3; let hi = 112;
      for (let k = 0; k < 20; k++) { n.tech = (lo + hi) / 2; if (potentialGdp(n) < e.gdp) lo = n.tech; else hi = n.tech; }
      n.education = clamp(n.tech * 0.85, 5, 95); n.infrastructure = clamp(n.tech * 0.85, 5, 95); n.industry = clamp(n.tech * 0.8, 5, 95); n.health = clamp(30 + n.tech * 0.55, 5, 95);
      // Second passage : éducation et infrastructures ont changé, on repart de l'intervalle complet.
      lo = 3; hi = 112;
      for (let k = 0; k < 20; k++) { n.tech = (lo + hi) / 2; if (potentialGdp(n) < e.gdp) lo = n.tech; else hi = n.tech; }
    }
    else {
      // Pas de PIB tiré : le niveau de développement suit la classe militaire, avec une part de hasard.
      n.tech = clamp(30 + 5 * Math.max(0, e.rating) + rand(world) * 15, 8, 95);
      n.education = clamp(n.tech * 0.85, 5, 95); n.infrastructure = clamp(n.tech * 0.85, 5, 95); n.industry = clamp(n.tech * 0.8, 5, 95); n.health = clamp(30 + n.tech * 0.55, 5, 95);
    }
    n.urbanization = clamp(15 + n.tech * 0.6, 5, 95);
    n.gdp = potentialGdp(n) * 0.97;
    n.debt = n.gdp * 0.3 * rand(world);
    n.treasury = n.gdp * 0.02;
    n.mil.personnel = n.pop * 0.004;
    n.mil.reserves = n.pop * 0.02;
    n.mil.tech = clamp(n.tech, 3, 110);
    n.mil.power = militaryPower(n);
    ratings[n.id] = e.rating;
  });
  armToRating(world, ratings);

  const blocHub = new Map<string, Nation>();
  world.nations.forEach((n, i) => {
    const e = roster[i];
    if (!e) return;
    const s = e.status;
    const other = byName(/\(([^)]+)\)/.exec(s)?.[1] ?? /(?:of|-)\s+(.+)$/.exec(s)?.[1] ?? '');
    if (/pariah/i.test(s) || /hated/i.test(e.bloc)) n.infamy = 70;
    const kind: StartKind = /^colony/i.test(s) ? 'colony' : /^prot\. of/i.test(s) ? 'protectorate' : /^prot\. \(/i.test(s) ? 'overlord' : /^(allied|defense pact)/i.test(s) ? 'allied'
      : /^trade|^influence/i.test(s) ? 'trade' : /^(hostile|rival)/i.test(s) ? 'rival' : /^(tension|freeze|former war)/i.test(s) ? 'tension' : /^war/i.test(s) ? 'war' : /pariah/i.test(s) ? 'pariah' : 'none';
    const found = !!other && other.id !== n.id;
    n.wheel.start = { kind, target: found && kind !== 'none' && kind !== 'pariah' ? other!.id : -1, applied: kind === 'none' || kind === 'pariah' || found };
    if (other && other.id !== n.id) {
      const rel = getRel(world, n.id, other.id);
      if (/^colony/i.test(s)) setVassal(world, n, other, true);
      else if (/^prot\. of/i.test(s)) setVassal(world, n, other, false);
      else if (/^prot\. \(/i.test(s)) setVassal(world, other, n, false);
      else if (/^(allied|defense pact)/i.test(s)) { rel.defense_pact = 0; rel.opinion = Math.max(rel.opinion, 55); }
      else if (/^trade|^influence/i.test(s)) { rel.trade = 0; rel.opinion = Math.max(rel.opinion, 25); }
      else if (/^(hostile|rival)/i.test(s)) { rel.opinion = -55; rel.claims[n.id < other.id ? 0 : 1] = true; }
      else if (/^tension/i.test(s)) rel.opinion = -35;
      else if (/^freeze/i.test(s)) rel.opinion = -25;
      else if (/^former war/i.test(s)) { rel.opinion = -40; rel.truceUntil = 60; }
      else if (/^war/i.test(s) && !warBetween(world, n.id, other.id) && n.overlord < 0) declareWar(world, n.id, other.id);
    }
    // Les membres d'un même bloc sont reliés à son premier membre par un pacte de défense.
    if (e.bloc && !/hated/i.test(e.bloc)) {
      const key = e.bloc.replace(/\s*\(HQ\)/i, '').toLowerCase();
      const hub = blocHub.get(key);
      if (!hub) blocHub.set(key, n);
      else if (!warBetween(world, n.id, hub.id)) { const rel = getRel(world, n.id, hub.id); rel.defense_pact = 0; rel.opinion = Math.max(rel.opinion, 50); }
    }
  });
  for (const n of world.nations) n.infamy = Math.min(n.infamy, 70);
  // Les notes tirées restent affichées telles quelles au départ ; elles seront recalculées chaque année.
}

// ---- Saison 3 : les roues de Nation Wheel ----

const bell = (x: number, mu: number, sd: number) => Math.exp(-((x - mu) ** 2) / (2 * sd * sd));
/** Classe d'armée de la saison 3 correspondant à une note sur 11. */
const s3Class = (rating: number) => [...ARMIES].reverse().find((a) => a.rating <= rating)?.label ?? ARMIES[0].label;

/** Régime et idéologie du moteur pour une idéologie et une doctrine tirées. */
function s3Government(ideology: string, doctrine: string): [Government, Ideology] {
  const base: Record<string, [Government, Ideology]> = {
    Democracy: ['republic', 'liberal'], Monarchy: ['absolute_monarchy', 'conservative'], Communism: ['one_party_state', 'communist'],
    Authoritarianism: ['one_party_state', 'nationalist'], Imperialism: ['empire', 'nationalist'], 'Military Rule': ['military_junta', 'militarist'],
    Theocracy: ['theocracy', 'theocratic'], Tribalism: ['tribal_confederation', 'conservative'], Anarchism: ['federation', 'isolationist'],
  };
  let [gov, ideo] = base[ideology] ?? ['republic', 'liberal'];
  if (ideology === 'Democracy' && /Federal|Decentralized|Provincial|Coalition/.test(doctrine)) gov = 'federation';
  if (ideology === 'Monarchy' && /Constitutional|Commonwealth|Elective|Noble/.test(doctrine)) gov = 'constitutional_monarchy';
  if (doctrine === 'Technocracy') ideo = 'technocratic';
  if (doctrine === 'Corporate State') { gov = 'oligarchy'; ideo = 'mercantile'; }
  if (doctrine === 'Stratocracy') { gov = 'military_junta'; ideo = 'militarist'; }
  if (/Merchant Empire|Maritime Empire|Tributary Empire/.test(doctrine)) ideo = 'mercantile';
  if (/Agrarian Collective|Workers' Councils|Collective Union/.test(doctrine)) ideo = 'socialist';
  if (/Conquest Empire|Expansionist Dominion/.test(doctrine)) ideo = 'militarist';
  return [gov, ideo];
}

/**
 * Effet d'un impact régional. Les roues ne disent pas ce que fait chaque segment :
 * l'effet est déduit des mots du libellé, dans le sens (bonus ou malus) donné par sa couleur.
 */
function applyImpact(n: Nation, label: string, sign: number): void {
  const m = n.mil;
  const add = (v: number, d: number, lo = 3, hi = 97) => clamp(v + sign * d, lo, hi);
  if (/nav|fleet|sea |port|maritime|archipelago|blockade|coastal/i.test(label)) { m.navy *= 1 + 0.4 * sign; n.infrastructure = add(n.infrastructure, 4); }
  else if (/industr|factor|production|metallurg|arsenal|mechanical|artisanal|materials|reserves/i.test(label)) n.industry = add(n.industry, 12);
  else if (/technolog|patent|genius|intellectual|illitera|backward|obsolete|doctrinal/i.test(label)) { n.tech = add(n.tech, 5, 3, 112); n.education = add(n.education, 8); }
  else if (/econom|wealth|gold|financ|bank|trad|market|commercial|toll|boom|treasur|debt|booty|consumption|silk|opportunit/i.test(label)) { n.infrastructure = add(n.infrastructure, 8); n.industry = add(n.industry, 5); }
  else if (/logistic|route|railway|lines|depth|infrastructure|hinterland|convoy|caravan|hub|position|bottleneck|territory|sanctuary/i.test(label)) { m.logistics = add(m.logistics, 12); n.infrastructure = add(n.infrastructure, 6); }
  else if (/population|manpower|demograph|famine|losses|youth|basin|food/i.test(label)) n.pop = Math.max(1000, n.pop * (1 + 0.1 * sign));
  else if (/warrior|army|militar|discipline|tactic|general|officer|war|resistance|fortress|citadel|defens|guard|rookie|mobility|momentum|fortified|front/i.test(label)) m.experience = add(m.experience, 15);
  else n.stability = add(n.stability, 10);
}

/** Cherche le niveau technologique qui donne le PIB tiré (borné par ce que le moteur sait produire). */
function fitGdp(n: Nation, gdp: number): void {
  let lo = 3; let hi = 112;
  for (let k = 0; k < 22; k++) { n.tech = (lo + hi) / 2; if (potentialGdp(n) < gdp) lo = n.tech; else hi = n.tech; }
}

/** Règle santé et éducation pour approcher l'IDH tiré. */
function fitHdi(n: Nation, hdi: number): void {
  const h0 = n.health; const e0 = n.education;
  let lo = 0.1; let hi = 4;
  for (let k = 0; k < 22; k++) {
    const f = (lo + hi) / 2;
    n.health = clamp(h0 * f, 5, 98); n.education = clamp(e0 * f, 5, 98);
    if (computeHdi(n) < hdi) lo = f; else hi = f;
  }
}

/** Découpe la carte en régions autour de huit capitales éloignées les unes des autres, et les nomme au hasard. */
function regionZones(world: World): string[] {
  const { width } = world.map;
  const pos = world.nations.map((n) => [n.capitalCell % width, Math.floor(n.capitalCell / width)]);
  const d2 = (a: number, b: number) => (pos[a][0] - pos[b][0]) ** 2 + (pos[a][1] - pos[b][1]) ** 2;
  const centers = [Math.floor(rand(world) * pos.length)];
  while (centers.length < Math.min(REGIONS.length, pos.length)) {
    let best = -1; let bestD = -1;
    for (let i = 0; i < pos.length; i++) { const d = Math.min(...centers.map((c) => d2(i, c))); if (d > bestD) { bestD = d; best = i; } }
    centers.push(best);
  }
  const names = [...REGIONS];
  for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rand(world) * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  return pos.map((_, i) => names[centers.reduce((b, c, k) => (d2(i, c) < d2(i, centers[b]) ? k : b), 0)]);
}

/**
 * Tirage complet d'un monde avec les roues de la saison 3 (src/data/wheels3.ts).
 * sizes : superficie déjà tirée pour chaque nation (elle a fixé sa part de la carte).
 * Les roues « boosted by » sont repondérées par les résultats précédents ; la formule
 * exacte de Nation Wheel n'est pas connue, celle-ci est une approximation.
 */
export function spinSeason3(world: World, sizes: number[]): void {
  const zones = regionZones(world);
  const cells: number[][] = world.nations.map(() => []);
  world.map.owner.forEach((o, c) => { if (o >= 0 && world.map.resource[c] < 0) cells[o].push(c); });
  const drawn: { gdp: number; hdi: number; rating: number; army: string; spec: string; ideology: string; pct: number }[] = [];
  const draw = <T,>(entries: [T, number][]) => spin(world, entries);

  for (const n of world.nations) {
    const spins: WheelSpin[] = [];
    const km2 = sizes[n.id] ?? 3e5;
    spins.push({ pool: 'size', title: 'Country Size', sub: 'Determines your map size', result: sizeLabel(km2), recap: 2 });

    // Le centre de chaque roue repondérée reste dans l'étendue de la roue, sinon le tirage deviendrait uniforme.
    const popMu = clamp(Math.log10(km2 * 45), 5.3, 8.1);
    n.pop = draw(POPULATIONS.map((p): [number, number] => [p, 0.01 + bell(Math.log10(p), popMu, 0.55)]));
    spins.push({ pool: 'population', title: 'Population', sub: 'boosted by: Size', result: popLabel(n.pop), recap: 2 });

    const ideology = draw(S3_IDEOLOGIES);
    spins.push({ pool: 'ideology', title: 'Ideology', sub: 'Determines your ruling power', result: ideology, recap: 1 });
    let doctrine = '';
    if (ideology !== 'Colony') {
      doctrine = pick(world, DOCTRINES[ideology]);
      [n.government, n.ideology] = s3Government(ideology, doctrine);
      n.wheel.government = doctrine;
      spins.push({ pool: `doctrine:${ideology}`, title: doctrineTitle(ideology), sub: ideology, result: doctrine, recap: 1 });
    }

    const region = zones[n.id];
    spins.push({ pool: 'region', title: 'Region', sub: 'boosted by: Ideology', result: region, recap: 2 });
    const imp = IMPACTS[region];
    const impact = pick(world, [...imp.bonus, ...imp.mixed, ...imp.malus]);
    const sign = imp.bonus.includes(impact) ? 1 : imp.malus.includes(impact) ? -1 : 0;
    spins.push({ pool: `impact:${region}`, title: `Regional Impact (${region})`, sub: 'Obtain a bonus or penalty based on your continent', result: impact, shown: `${impact} (${sign > 0 ? 'bonus' : sign < 0 ? 'malus' : 'neutre'})` });
    if (sign) applyImpact(n, impact, sign);

    // La carte existe déjà : la roue s'arrête sur ce qu'elle montre.
    spins.push({ pool: 'landlocked', title: 'Are you landlocked?', sub: 'Cut off from the coast', result: n.geo.landlocked ? 'Yes' : 'No' });

    const gdpMu = clamp(Math.log10(Math.max(1, (n.pop * 2500) / 1e9)) + 0.1 * (Math.log10(km2) - 5.5), 1.1, 2.8);
    const gdp = draw(GDPS.map((g): [number, number] => [g, 0.01 + bell(Math.log10(g), gdpMu, 0.45)]));
    spins.push({ pool: 'gdp', title: 'GDP', sub: 'boosted by: Population · Size', result: gdpLabel(gdp), shown: `${gdpLabel(gdp)} (${gdp} Md$)`, recap: 2 });

    // Ressources : d'autant plus de tirages que le pays est grand, sans doublon.
    let wheel = resourceWheel(region);
    const count = km2 < 5e4 ? 1 : km2 < 3e5 ? 2 : km2 < 1e6 ? 3 : km2 < 3e6 ? 4 : 5;
    const resources: string[] = [];
    for (let k = 0; k < count; k++) {
      const res = draw(wheel);
      resources.push(res);
      wheel = wheel.filter(([l]) => l !== res);
      spins.push({ pool: `resources:${region}`, title: 'Resources', sub: `${region} - Determined by land size`, result: res });
      const deposit = RESOURCE_DEPOSIT[res];
      const cell = cells[n.id].pop();
      if (deposit && cell !== undefined) {
        world.map.resource[cell] = RESOURCES.indexOf(deposit as (typeof RESOURCES)[number]);
        n.geo.resources[deposit as (typeof RESOURCES)[number]]++;
      }
    }

    const hdiMu = clamp(0.3 + 0.17 * Math.log10(Math.max(1, (gdp * 1e9) / n.pop) / 300), 0.22, 0.93);
    const hdi = draw(HDIS.map((x): [number, number] => [x, 0.02 + bell(x, hdiMu, 0.1)]));
    spins.push({ pool: 'hdi', title: 'HDI', sub: 'boosted by: GDP · Population', result: hdiLabel(hdi) });

    const martial = ideology === 'Military Rule' || ideology === 'Imperialism' ? 1.2 : 0;
    const armyMu = 2.5 + 1.6 * Math.log10(Math.max(1, gdp) / 20) + 0.5 * Math.log10(n.pop / 5e6) + martial;
    const army = draw(ARMIES.map((a): [typeof a, number] => [a, a.weight * (0.15 + bell(a.rating, armyMu, 2.5))]));
    spins.push({ pool: 'army', title: 'Army', sub: 'boosted by: Population · GDP · Size · Ideology', result: army.label, recap: 2 });
    let spec = army.rating >= 11 ? 'All' : '';
    if (army.rating >= 8 && army.rating < 11) {
      spec = pick(world, n.geo.landlocked ? SPECIALIZATIONS.filter((x) => x !== 'Naval') : SPECIALIZATIONS);
      spins.push({ pool: 'specialization', title: 'Specialization', result: spec });
    }
    let pct = 0;
    if (army.rating > 0) {
      pct = draw(ACTIVE_DUTY.map((p): [number, number] => [p, activeDutyWeight(army.label, p)]));
      spins.push({ pool: `active:${army.label}`, title: 'Active-duty personnel', sub: army.label, result: pctLabel(pct), shown: `${pctLabel(pct)} de la population` });
    }

    const secretMu = 2 + army.rating * 0.55 + Math.log10(Math.max(1, gdp) / 50);
    const secret = draw(SECRET_SERVICES.map((l, i): [string, number] => [l, 0.03 + bell(i + 1, secretMu, 1.8)]));
    spins.push({ pool: 'secret', title: 'Secret Services', sub: 'boosted by: GDP · Population · Army', result: secret });

    const background = pick(world, BACKGROUNDS);
    spins.push({ pool: 'background', title: 'Background', sub: 'Determines your civilization\'s history', result: background });
    const great = pick(world, GREAT_PEOPLE);
    spins.push({ pool: 'great', title: 'Great People', sub: 'Determines if your nation has a brilliant mind', result: great });
    // Une grande figure laisse un avantage de départ dans son domaine.
    const kind = greatKind(great);
    if (kind === 'science') n.education = clamp(n.education + 6, 3, 97);
    else if (kind === 'industry') n.industry = clamp(n.industry + 8, 3, 97);
    else if (kind === 'military') n.mil.experience = clamp(n.mil.experience + 12, 3, 97);
    else if (kind === 'explorer') n.mil.logistics = clamp(n.mil.logistics + 8, 3, 97);
    else n.stability = clamp(n.stability + 6, 3, 97);

    const s3 = {
      ideology, doctrine, region, impact, impactSign: sign, resources, materials: resources.reduce((a, r) => a + resourceValue(r), 0),
      army: army.label, specialization: spec, secret: SECRET_SERVICES.indexOf(secret) + 1, secretName: secret, background, great,
    };
    n.wheel = { ...n.wheel, economy: '', militaryClass: army.label, militaryRating: army.rating, tags: [], bloc: '', region, spins, s3, start: { kind: 'none', target: -1, applied: true } };
    drawn[n.id] = { gdp, hdi, rating: army.rating, army: army.label, spec, ideology, pct };
  }

  // Application : PIB puis IDH (qui dépend du PIB par habitant), puis l'armée.
  for (const n of world.nations) {
    const d = drawn[n.id];
    n.capacityFactor = 1;
    fitGdp(n, d.gdp);
    n.infrastructure = clamp(n.tech * 0.85, 5, 95); n.industry = clamp(Math.max(n.industry, n.tech * 0.7), 5, 95);
    fitGdp(n, d.gdp);
    n.gdp = potentialGdp(n) * 0.97;
    fitHdi(n, d.hdi);
    fitGdp(n, d.gdp);
    n.urbanization = clamp(15 + n.tech * 0.6, 5, 95);
    n.gdp = potentialGdp(n) * 0.97;
    n.debt = n.gdp * 0.3 * rand(world);
    n.treasury = n.gdp * 0.02;
    // Les effectifs tirés vont jusqu'à 10 % de la population ; au-delà de 3 % le moteur ne suit pas.
    n.mil.personnel = d.rating ? n.pop * Math.min(d.pct, 3) / 100 : Math.min(n.mil.personnel, 300);
    n.mil.reserves = n.pop * 0.02;
    n.mil.tech = clamp(n.tech, 3, 110);
    n.mil.power = militaryPower(n);
  }
  armToRating(world, world.nations.map((n) => drawn[n.id].rating));
  for (const n of world.nations) {
    const m = n.mil;
    const total = m.army + m.airforce + m.navy;
    const sea = n.geo.landlocked ? 0 : 1;
    const share = { Land: [0.75, 0.15, 0.1], Aerial: [0.4, 0.45, 0.15], Naval: [0.35, 0.15, 0.5], All: [0.4, 0.3, 0.3] }[drawn[n.id].spec];
    if (share && total > 0) { m.navy = total * share[2] * sea; m.airforce = total * share[1]; m.army = total - m.navy - m.airforce; m.power = militaryPower(n); }
  }

  // Colonies : l'empire est tiré parmi les nations souveraines les plus fortes du monde créé.
  const empires = world.nations.filter((n) => drawn[n.id].ideology !== 'Colony').sort((a, b) => b.mil.power - a.mil.power).slice(0, 5);
  for (const n of world.nations) {
    if (drawn[n.id].ideology !== 'Colony') continue;
    const at = n.wheel.spins!.findIndex((sp) => sp.pool === 'ideology') + 1;
    const extra: WheelSpin[] = [];
    if (empires.length) {
      const empire = pick(world, empires);
      setVassal(world, n, empire, true);
      n.wheel.start = { kind: 'colony', target: empire.id, applied: n.overlord === empire.id };
      extra.push({ pool: 'empire', title: 'Which Empire ?', sub: 'Which imperial power reigns over your nation?', result: empire.name, shown: `Colonie de ${empire.name}`, options: empires.map((e) => e.name), recap: 1 });
    }
    const group = spin(world, COLONIAL.map((g): [typeof g, number] => [g, g.labels.length]));
    const authority = pick(world, group.labels);
    n.stability = clamp(n.stability + group.stability, 5, 95);
    n.wheel.government = 'Colony';
    extra.push({ pool: 'colonial', title: 'Colonial Authority & Stability', result: authority });
    n.wheel.spins!.splice(at, 0, ...extra);
  }
  updateRatings(world);
}

// ---- Tirages à montrer avant la partie ----

export interface WheelPool {
  /** [segment, poids]. */
  segments: Weighted[];
  /** Roue trop fournie pour être lisible en entier : l'écran en montre un échantillon autour du résultat. */
  sample?: boolean;
  /** Échelle de valeurs : l'écran la colore en dégradé, comme les roues de Nation Wheel. */
  scale?: boolean;
}
export interface WheelDraws {
  pools: Record<string, WheelPool>;
  draws: { id: number; spins: WheelSpin[] }[];
}

const START_TEXT: Record<StartKind, (other: string) => string> = {
  none: () => 'Libre, sans histoire', pariah: () => 'Paria : réputation d\'agresseur',
  colony: (o) => `Colonie de ${o}`, protectorate: (o) => `Protectorat de ${o}`, overlord: (o) => `Protectrice de ${o}`,
  rival: (o) => `Rivale de ${o}`, tension: (o) => `Tensions avec ${o}`, allied: (o) => `Alliée à ${o}`, trade: (o) => `Accord commercial avec ${o}`, war: (o) => `En guerre contre ${o}`,
};
export const NO_TRAIT = 'Aucun trait';
export const ratingLabel = (r: number) => `${r} / 11`;
const even = (labels: string[]): Weighted[] => labels.map((l) => [l, 1]);

/** Les roues de la saison 3 référencées par les tirages d'un monde. */
function season3Pools(world: World): Record<string, WheelPool> {
  const pools: Record<string, WheelPool> = {
    size: { segments: [...SIZES.map((k): Weighted => [sizeLabel(k), sizeWeight(k)]), ['Umaristan', 0.2]], scale: true },
    population: { segments: POPULATIONS.map((p): Weighted => [popLabel(p), 0.3 + bell(Math.log10(p), 7.2, 0.7)]), scale: true },
    ideology: { segments: S3_IDEOLOGIES },
    region: { segments: REGION_WHEEL },
    landlocked: { segments: [['No', 80], ['Yes', 20]] },
    gdp: { segments: GDPS.map((g): Weighted => [gdpLabel(g), 0.3 + bell(Math.log10(g), 1.9, 0.5)]), scale: true },
    hdi: { segments: HDIS.map((x): Weighted => [hdiLabel(x), 0.25 + bell(x, 0.57, 0.14)]), scale: true },
    army: { segments: ARMIES.map((a): Weighted => [a.label, a.weight]) },
    specialization: { segments: even(SPECIALIZATIONS) },
    secret: { segments: SECRET_SERVICES.map((l, i): Weighted => [l, 0.15 + bell(i + 1, 6.5, 1.8)]) },
    background: { segments: even(BACKGROUNDS), sample: true },
    great: { segments: even(GREAT_PEOPLE), sample: true },
    colonial: { segments: even(COLONIAL.flatMap((g) => g.labels)), sample: true },
  };
  for (const [ideology, list] of Object.entries(DOCTRINES)) pools[`doctrine:${ideology}`] = { segments: even(list) };
  for (const region of REGIONS) {
    const imp = IMPACTS[region];
    pools[`impact:${region}`] = { segments: even([...imp.bonus, ...imp.mixed, ...imp.malus]) };
    pools[`resources:${region}`] = { segments: resourceWheel(region) };
  }
  for (const a of ARMIES) if (a.rating) pools[`active:${a.label}`] = { segments: ACTIVE_DUTY.map((p): Weighted => [pctLabel(p), activeDutyWeight(a.label, p)]), scale: true };
  // Seules les roues réellement tirées dans ce monde sont envoyées à l'écran.
  const used = new Set(world.nations.flatMap((n) => (n.wheel.spins ?? []).map((sp) => sp.pool)));
  return Object.fromEntries(Object.entries(pools).filter(([k]) => used.has(k)));
}

/**
 * Tirages de chaque nation et contenu des roues, pour les rejouer à l'écran.
 * Lecture seule : le tirage a déjà eu lieu à la création du monde, rien n'est retiré ici.
 */
export function wheelDraws(world: World): WheelDraws {
  if (world.nations.some((n) => n.wheel.spins)) {
    return { pools: season3Pools(world), draws: world.nations.filter((n) => n.wheel.spins).map((n) => ({ id: n.id, spins: n.wheel.spins! })) };
  }
  const random = world.config.roster !== 'season1';
  const distinct = (xs: string[]) => [...new Set(xs.filter(Boolean))];
  const counts = (xs: string[], ref: string[]): Weighted[] => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => ref.indexOf(a[0]) - ref.indexOf(b[0]));
  };
  const draws = world.nations.map((n) => {
    const st = n.wheel.start;
    const spins: WheelSpin[] = [];
    if (n.wheel.government) spins.push({ pool: 'government', title: 'Régime', result: n.wheel.government, recap: 1 });
    if (n.wheel.economy) spins.push({ pool: 'economy', title: 'Économie', result: n.wheel.economy, recap: 1 });
    spins.push({ pool: 'rating', title: 'Classe militaire', result: ratingLabel(n.wheel.militaryRating), shown: `${n.wheel.militaryClass} · ${ratingLabel(n.wheel.militaryRating)}`, recap: 2 });
    const tags = n.wheel.tags.map((t) => TAG_FR[t] ?? t);
    for (const t of tags.length ? tags : [NO_TRAIT]) spins.push({ pool: 'trait', title: 'Trait', result: t, ...(tags.length ? { recap: 2 as const } : {}) });
    if (st) {
      const other = st.target >= 0 ? world.nations[st.target]?.name ?? '?' : '';
      const targeted = st.kind === 'none' || st.kind === 'pariah' || st.target >= 0;
      spins.push({ pool: 'start', title: 'Statut de départ', result: START_FR[st.kind], shown: (targeted ? START_TEXT[st.kind](other) : START_FR[st.kind]) + (st.applied ? '' : ' (sans effet)'), recap: 2 });
    }
    return { id: n.id, spins };
  });
  const results = (pool: string) => draws.flatMap((d) => d.spins.filter((sp) => sp.pool === pool).map((sp) => sp.result));
  return {
    draws,
    pools: {
      government: { segments: even(distinct([...(random ? Object.values(GOV_LABELS).flat() : []), ...results('government')])), sample: true },
      economy: { segments: even(distinct([...(random ? ECONOMIES : []), ...results('economy')])), sample: true },
      trait: { segments: even([...distinct([...TAG_WHEEL.map((t) => TAG_FR[t]), ...results('trait').filter((t) => t !== NO_TRAIT)]), NO_TRAIT]) },
      // Monde aléatoire : les vraies roues pondérées. Saison 1 : la répartition observée sur le wiki.
      rating: { segments: random ? RATING_WHEEL.map(([r, wt]): Weighted => [ratingLabel(r), wt]) : counts(results('rating'), Array.from({ length: 12 }, (_, r) => ratingLabel(r))) },
      start: { segments: random ? START_WHEEL.map(([k, wt]): Weighted => [START_FR[k], wt]) : counts(results('start'), Object.values(START_FR)) },
    },
  };
}
