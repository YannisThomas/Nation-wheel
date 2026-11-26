// Ce que la roue de Nation Wheel tire réellement, d'après le wiki : régime,
// type d'économie, classe militaire notée sur 11, traits, statut de départ
// (colonie, protectorat, rivalité, guerre, alliance, paria). Le tirage fixe
// le point de départ ; le moteur fait ensuite évoluer le monde.

import type { RosterEntry } from '../data/season1';
import { getRel } from './diplomacy';
import { clamp, pick, rand, spin, type HasRng } from './rng';
import { militaryPower, potentialGdp } from './systems';
import { declareWar, warBetween } from './war';
import type { Government, Ideology, Nation, World } from './types';

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
    n.wheel.militaryClass = militaryClass(n, rating);
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
  // Statut de départ : la plupart des nations naissent libres et sans histoire.
  for (const n of world.nations) {
    const neighbors = Object.keys(n.geo.neighbors).map(Number);
    if (!neighbors.length) continue;
    const o = world.nations[pick(world, neighbors)];
    const rel = getRel(world, n.id, o.id);
    const kind = spin(world, [['none', 54], ['colony', 6], ['protectorate', 4], ['rival', 10], ['tension', 6], ['allied', 10], ['trade', 8], ['pariah', 2]] as const);
    if ((kind === 'colony' || kind === 'protectorate') && o.mil.power > 1.5 * n.mil.power && o.overlord < 0 && n.overlord < 0) setVassal(world, n, o, kind === 'colony');
    else if (kind === 'rival') { rel.opinion = -55; rel.claims[n.id < o.id ? 0 : 1] = true; }
    else if (kind === 'tension') rel.opinion = -35;
    else if (kind === 'allied' && n.overlord < 0 && o.overlord < 0) { rel.defense_pact = 0; rel.opinion = Math.max(rel.opinion, 55); }
    else if (kind === 'trade') { rel.trade = 0; rel.opinion = Math.max(rel.opinion, 25); }
    else if (kind === 'pariah') n.infamy = 60;
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
