// Du background aux préférences : la personnalité d'une nation n'est pas une
// étiquette fixe, elle est recalculée à partir de ce que la nation est, de ce
// qui l'entoure et de ce qu'elle a vécu.

import { peekRel } from '../engine/diplomacy';
import { clamp } from '../engine/rng';
import { enemiesOf } from '../engine/war';
import { TAG_FR } from '../engine/wheel';
import { greatKind } from '../data/wheels3';
import { PREF_KEYS, type Government, type Ideology, type Nation, type Preferences, type World } from '../engine/types';

export const GOV_FR: Record<Government, string> = {
  republic: 'république', federation: 'fédération', constitutional_monarchy: 'monarchie constitutionnelle',
  absolute_monarchy: 'monarchie absolue', one_party_state: 'État à parti unique', military_junta: 'junte militaire',
  theocracy: 'théocratie', oligarchy: 'oligarchie', tribal_confederation: 'confédération tribale', empire: 'empire',
};
export const IDEO_FR: Record<Ideology, string> = {
  liberal: 'libérale', conservative: 'conservatrice', socialist: 'socialiste', communist: 'communiste',
  nationalist: 'nationaliste', militarist: 'militariste', theocratic: 'théocratique', technocratic: 'technocratique',
  isolationist: 'isolationniste', mercantile: 'mercantile',
};
export const TRAIT_FR: Record<string, string> = {
  reformer: 'réformateur', warlord: 'chef de guerre', diplomat: 'diplomate', scholar: 'érudit', merchant: 'marchand',
  populist: 'populiste', zealot: 'fanatique', builder: 'bâtisseur', schemer: 'intrigant', cautious: 'prudent',
};

export interface Surroundings {
  /** 0..1 */
  threat: number;
  /** Voisin le plus menaçant, -1 sinon. */
  mainThreat: number;
  /** Puissance propre / puissance du voisin le plus fort. */
  relativePower: number;
  enemies: number[];
}

export function surroundings(world: World, n: Nation): Surroundings {
  const enemies = enemiesOf(world, n.id);
  let threat = 0;
  let mainThreat = -1;
  let strongest = 0;
  const consider = new Set<number>([...Object.keys(n.geo.neighbors).map(Number), ...enemies]);
  for (const id of consider) {
    const o = world.nations[id];
    if (!o.alive) continue;
    strongest = Math.max(strongest, o.mil.power);
    const rel = peekRel(world, n.id, id);
    const opinion = rel?.opinion ?? 0;
    let hostility = clamp((20 - opinion) / 100, 0, 1);
    if (rel?.claims[id < n.id ? 0 : 1]) hostility += 0.3;
    if (o.mil.mobilization > 0.2 && opinion < 0) hostility += 0.2;
    if (rel?.atWar) hostility = 1.5;
    if (rel && rel.defense_pact >= 0) hostility = 0;
    const t = clamp((hostility * Math.min(2, o.mil.power / Math.max(1, n.mil.power))) / 2, 0, 1);
    if (t > threat) { threat = t; mainThreat = id; }
  }
  return { threat, mainThreat, relativePower: strongest ? n.mil.power / strongest : 3, enemies };
}

/** Étiquettes de background, recalculées : elles changent quand la nation change. */
export function background(world: World, n: Nation, s = surroundings(world, n)): string[] {
  const g = n.geo;
  const alive = world.nations.filter((x) => x.alive);
  const rank = alive.filter((x) => x.geo.cells < g.cells).length / Math.max(1, alive.length);
  const popRank = alive.filter((x) => x.pop < n.pop).length / Math.max(1, alive.length);
  const tags: string[] = [];
  tags.push(rank < 0.15 ? 'Micro-État' : rank < 0.4 ? 'Petit État' : rank < 0.75 ? 'État de taille moyenne' : rank < 0.93 ? 'Grand État' : 'État-continent');
  const neighbors = Object.keys(g.neighbors).length;
  if (g.landlocked) tags.push('enclavé');
  else if (neighbors === 0) tags.push('insulaire');
  else if (g.coastCells / Math.max(1, g.cells) > 0.3) tags.push('côtier');
  if (g.terrain.mountain + g.terrain.hills > 0.45) tags.push('montagneux');
  else if (g.terrain.desert > 0.4) tags.push('désertique');
  else if (g.terrain.forest > 0.5) tags.push('forestier');
  else if (g.terrain.tundra > 0.4) tags.push('polaire');
  else if (g.terrain.plains > 0.55) tags.push('de plaines fertiles');
  tags.push(n.wheel.government ? `${n.wheel.government} (${IDEO_FR[n.ideology]})` : `${GOV_FR[n.government]} ${IDEO_FR[n.ideology]}`);
  if (n.overlord >= 0) tags.push(`${n.colony ? 'colonie' : 'protectorat'} de ${world.nations[n.overlord].name}`);
  if (n.wheel.economy) tags.push(`économie : ${n.wheel.economy}`);
  if (n.wheel.s3) tags.push(`idéologie ${n.wheel.s3.ideology}`, `région ${n.wheel.s3.region}`);
  for (const t of n.wheel.tags) tags.push(TAG_FR[t] ?? t);
  tags.push(n.tech < 25 ? 'économie agraire' : n.tech < 45 ? 'en développement' : n.tech < 65 ? 'industrialisé' : n.tech < 80 ? 'technologie avancée' : 'technologie de pointe');
  if (n.education > 75) tags.push('très haut niveau d\'éducation');
  else if (n.education < 30) tags.push('population peu instruite');
  tags.push(popRank < 0.25 ? 'population faible' : popRank > 0.8 ? 'très peuplé' : 'population moyenne');
  const deposits = Object.values(g.resources).reduce((a, b) => a + b, 0) / Math.max(1, g.cells);
  tags.push(deposits > 0.09 ? 'riche en ressources' : deposits < 0.03 ? 'ressources limitées' : 'ressources correctes');
  if (neighbors && s.relativePower < 0.4) tags.push('entouré de puissances plus fortes');
  else if (neighbors && s.relativePower > 2) tags.push('puissance dominante de sa région');
  const c = n.mind.counters;
  if ((c.invaded ?? 0) > 0 && !(c.aggressions ?? 0)) tags.push('histoire défensive');
  if ((c.aggressions ?? 0) >= 2) tags.push('tradition de conquête');
  if ((c.betrayed ?? 0) > 0) tags.push('déjà trahi par un allié');
  if ((c.lost ?? 0) > (c.won ?? 0)) tags.push('marqué par la défaite');
  else if ((c.won ?? 0) >= 2) tags.push('habitué à la victoire');
  if (n.stability < 30) tags.push('instable');
  if (n.debt > n.gdp) tags.push('surendetté');
  return tags;
}

const IDEO: Partial<Record<Ideology, Partial<Preferences>>> = {
  technocratic: { science: 20, industry: 8 },
  militarist: { offensive: 25, expansion: 15, defense: 10, diplomacy: -15, welfare: -8 },
  nationalist: { offensive: 10, expansion: 12, defense: 8 },
  liberal: { trade: 10, diplomacy: 10, offensive: -15, science: 6 },
  mercantile: { trade: 25, industry: 15, navy: 10, diplomacy: 8 },
  isolationist: { trade: -30, diplomacy: -10, expansion: -15, defense: 12, offensive: -10 },
  socialist: { welfare: 20, industry: 6 },
  communist: { welfare: 18, industry: 12, trade: -10 },
  theocratic: { risk: 6, science: -8, welfare: 5 },
  conservative: { risk: -8, defense: 5 },
};
const GOV: Partial<Record<Government, Partial<Preferences>>> = {
  empire: { expansion: 20, offensive: 8 },
  military_junta: { offensive: 10, risk: 5, defense: 10, welfare: -8 },
  federation: { diplomacy: 8, trade: 5 },
  republic: { diplomacy: 5, welfare: 5 },
  tribal_confederation: { defense: 8, science: -8, trade: -5 },
  oligarchy: { trade: 10, welfare: -8 },
  theocracy: { risk: 5 },
};
const TRAIT: Record<string, Partial<Preferences>> = {
  warlord: { offensive: 15, expansion: 10, risk: 10 }, diplomat: { diplomacy: 15, offensive: -8 },
  scholar: { science: 12 }, merchant: { trade: 12 }, populist: { welfare: 15 }, zealot: { risk: 15, offensive: 6 },
  builder: { industry: 15 }, schemer: { diplomacy: 5, risk: 5 }, cautious: { risk: -20, defense: 10, offensive: -10 },
  reformer: { welfare: 6, science: 6 },
};

// Saison 3 : ce que les roues de Nation Wheel ajoutent à la personnalité.
const S3_IDEOLOGY: Record<string, Partial<Preferences>> = {
  Democracy: { diplomacy: 8, trade: 5, offensive: -6 }, Monarchy: { defense: 5, risk: -4 }, Communism: { industry: 8, welfare: 6 },
  Authoritarianism: { defense: 6, diplomacy: -6 }, Imperialism: { expansion: 12, offensive: 8, navy: 4 }, 'Military Rule': { offensive: 8, defense: 8, welfare: -5 },
  Theocracy: { risk: 6, science: -5 }, Tribalism: { defense: 6, trade: -5, expansion: 4 }, Colony: { offensive: -10, expansion: -10 }, Anarchism: { diplomacy: -8, welfare: 8, offensive: -8 },
};
/** Mots d'un libellé tiré (doctrine, impact régional, histoire) et penchant qu'ils nourrissent. */
const S3_WORDS: [RegExp, Partial<Preferences>][] = [
  [/Merchant|Trade|Guild|Agorism|Capitalism|Corporate|spice|amber|salt|coin|credit|stock exchange|tea trade|ports|Toll|Market|Banking|Commercial|Silk/i, { trade: 10 }],
  [/Maritime|Naval|navy|fleet|Circumnavigated|seas|waves|whales|shipwrecked|lighthouse|Archipelago/i, { navy: 12 }],
  [/Fortress|Garrison|Defense|Security|Police|great wall|fortresses|siege|Held the border|Repelled|Resisted|Citadel|Fortified|Resistance|Sanctuary|Defensive/i, { defense: 10, offensive: -3 }],
  [/Conquest|Expansionist|Frontier|Horde|Migration|Warrior|Iron Legion|Permanent Revolution|Universal|Sacked|Reconquered|Conquering|Shock|Aggressive|Booty|Total War|Revanchism/i, { expansion: 8, offensive: 8 }],
  [/Technocracy|Enlightenment|astronomical|printing|telegraph|metric|alphabet|academy|newspaper|library|university|clock|vaccinat|Intellectual|Patent|Genius/i, { science: 10 }],
  [/Workers|Collective|Agrarian|Commune|Syndicalism|Mutualism|Commonwealth|refugees|serfdom|slavery|charter of liberties|peasant/i, { welfare: 8 }],
  [/Pacifism|Jury|Direct Democracy|Popular Assembly|Green|Disbanded its army|humiliating peace|Lethargy|Isolationist/i, { offensive: -10, diplomacy: 5 }],
  [/Federa|Coalition|Council|International|league|union with|Crossroads|Diplomacy|Support|Cosmopolitan/i, { diplomacy: 8 }],
  [/Secret|Cult|Paranoia|Purges|dictatorship|tyran|Espionage/i, { risk: 5, diplomacy: -5 }],
  [/Industrial|furnace|railway|canal|aqueduct|Factories|Metallurg|Production|Arsenal/i, { industry: 8 }],
];
const GREAT_PREFS: Record<string, Partial<Preferences>> = {
  military: { offensive: 5, defense: 5 }, science: { science: 8 }, industry: { industry: 8 }, explorer: { navy: 5, expansion: 5 }, arts: { welfare: 5, diplomacy: 3 }, state: { diplomacy: 8 },
};
function s3Preferences(s3: NonNullable<Nation['wheel']['s3']>): Partial<Preferences> {
  const out: Partial<Preferences> = {};
  const add = (m: Partial<Preferences> | undefined, k = 1) => { if (m) for (const key of PREF_KEYS) if (m[key]) out[key] = (out[key] ?? 0) + m[key]! * k; };
  const words = (label: string, k: number) => { for (const [re, m] of S3_WORDS) if (re.test(label)) add(m, k); };
  add(S3_IDEOLOGY[s3.ideology]);
  words(s3.doctrine, 1);
  // Un malus régional pèse à l'envers : une « faiblesse navale » détourne de la mer.
  words(s3.impact, 0.7 * s3.impactSign);
  words(s3.background, 0.6);
  if (s3.great) add(GREAT_PREFS[greatKind(s3.great)]);
  // Des services secrets puissants rendent plus hardi, des services absents plus prudent.
  add({ risk: (s3.secret - 5) * 1.5 });
  return out;
}

const TAG_PREFS: Record<string, Partial<Preferences>> = {
  maritime: { navy: 20, trade: 8 }, cyber: { science: 12, industry: 5 }, democratic: { diplomacy: 8, welfare: 5 }, wealthy: { trade: 12 },
  green: { welfare: 8, industry: -5 }, pacifist: { offensive: -25, diplomacy: 10 }, expansionist: { expansion: 15, offensive: 8 },
  nuclear: { defense: 10, risk: 5 }, religious: { risk: 5 },
};

export function preferences(world: World, n: Nation, s = surroundings(world, n)): Preferences {
  const p = Object.fromEntries(PREF_KEYS.map((k) => [k, 50])) as Preferences;
  const add = (m?: Partial<Preferences>) => { if (m) for (const k of PREF_KEYS) p[k] += m[k] ?? 0; };
  add(IDEO[n.ideology]);
  add(GOV[n.government]);
  add(TRAIT[n.leader.trait]);
  const g = n.geo;
  const c = n.mind.counters;
  const weak = s.relativePower < 0.5;
  const coast = g.coastCells / Math.max(1, g.cells);
  const deposits = Object.values(g.resources).reduce((a, b) => a + b, 0) / Math.max(1, g.cells);
  add({
    science: 0.3 * (n.education - 50) + (n.tech > 60 && n.status !== 'superpower' ? 6 : 0),
    defense: 35 * s.threat + Math.min(25, 10 * (c.invaded ?? 0)) + (weak ? 8 : 0),
    diplomacy: (weak ? 18 : 0) + (s.threat > 0.5 ? 8 : 0) - 6 * (c.betrayed ?? 0),
    navy: g.landlocked ? -50 : 60 * coast - 10 + (Object.keys(g.neighbors).length === 0 ? 15 : 0),
    trade: (coast > 0.3 ? 10 : 0) + (deposits < 0.03 ? 10 : 0) + (g.landlocked ? -5 : 0),
    expansion: (s.relativePower > 1.5 ? 10 : 0) - (weak ? 15 : 0) + Math.min(15, 5 * (c.won ?? 0)) - 60 * n.overextension + (n.stability > 65 ? 5 : -5),
    offensive: -(weak ? 20 : 0) - Math.min(24, 8 * (c.lost ?? 0)) - 0.3 * n.warExhaustion + (s.relativePower > 2 ? 8 : 0),
    risk: -(n.debt > n.gdp ? 10 : 0) - (n.stability < 35 ? 10 : 0) - (weak && s.threat > 0.4 ? 12 : 0),
    welfare: (n.stability < 40 ? 12 : 0) + (n.hdi < 0.5 ? 8 : 0),
    industry: n.tech > 30 && n.tech < 65 ? 10 : 0,
  });
  for (const t of n.wheel.tags) add(TAG_PREFS[t]);
  if (n.wheel.s3) add(s3Preferences(n.wheel.s3));
  if (n.overlord >= 0) add({ offensive: -20, expansion: -15, defense: -5 });
  for (const k of PREF_KEYS) p[k] = Math.round(clamp(p[k] + n.mind.quirks[k] + n.mind.drift[k], 0, 100));
  return p;
}

export const GOAL_KEYS = ['survival', 'independence', 'science', 'economy', 'defense', 'influence', 'expansion', 'stability'] as const;
export type Goals = Record<(typeof GOAL_KEYS)[number], number>;
export const GOAL_FR: Record<keyof Goals, string> = {
  survival: 'Survie', independence: 'Indépendance', science: 'Science', economy: 'Économie',
  defense: 'Défense', influence: 'Influence', expansion: 'Expansion', stability: 'Stabilité intérieure',
};
export const PREF_FR: Record<string, string> = {
  science: 'Science', defense: 'Défense', diplomacy: 'Diplomatie', navy: 'Marine', trade: 'Commerce', expansion: 'Expansion',
  offensive: 'Guerre offensive', risk: 'Tolérance au risque', welfare: 'Bien-être social', industry: 'Industrie',
};

export function goals(n: Nation, p: Preferences, s: Surroundings): Goals {
  const big = n.status === 'superpower' || n.status === 'great_power';
  const r = (x: number) => Math.round(clamp(x, 0, 100));
  return {
    survival: r(60 + 40 * s.threat),
    independence: r(72 - (n.sphereOf >= 0 ? 10 : 0) + (n.ideology === 'nationalist' || n.ideology === 'isolationist' ? 15 : 0)),
    science: p.science,
    economy: r(50 + 20 * Math.min(1.5, n.debt / Math.max(1e-6, n.gdp)) + 0.3 * (p.trade - 50) + 0.3 * (p.industry - 50)),
    defense: p.defense,
    influence: r(0.5 * p.diplomacy + 0.3 * p.expansion + (big ? 20 : 0)),
    expansion: p.expansion,
    stability: r(40 + (60 - n.stability)),
  };
}
