// Deux horloges pèsent sur le monde.
// 1. Les saisons climatiques : hiver, printemps, été, automne, selon
//    l'hémisphère et la latitude. Elles rythment récoltes, épidémies et campagnes.
// 2. Les saisons du monde, comme dans Nation Wheel : une saison se clôt quand la
//    carte est pleine ou qu'elle a assez duré ; la suivante tire une « ère »
//    dont les effets s'appliquent à toutes les nations tant qu'elle dure.

import { addJournal, yearOf } from './journal';
import { clamp, pick } from './rng';
import type { Nation, World } from './types';

export type ClimateSeason = 'winter' | 'spring' | 'summer' | 'autumn';
export const CLIMATE_FR: Record<ClimateSeason, string> = { winter: 'hiver', spring: 'printemps', summer: 'été', autumn: 'automne' };
const NORTH: ClimateSeason[] = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];

/** Saison en cours à une latitude donnée (positive au nord). */
export function climateSeason(world: World, latitude: number): ClimateSeason {
  return NORTH[(world.tick + (latitude >= 0 ? 0 : 6)) % 12];
}

/** 0 sous les tropiques, 1 près des pôles : à quel point les saisons s'y font sentir. */
export const seasonality = (latitude: number) => clamp((Math.abs(latitude) - 0.15) / 0.6, 0, 1);

export interface EraMods {
  /** Multiplie le PIB potentiel. */
  growth: number;
  /** Multiplie le bonus du commerce. */
  trade: number;
  /** Multiplie le rythme de la recherche. */
  tech: number;
  /** S'ajoute à la stabilité d'équilibre. */
  stability: number;
  /** Multiplie l'usure de guerre. */
  exhaustion: number;
  /** S'ajoute à l'envie de guerre des nations. */
  aggression: number;
  /** Multiplie la capacité de charge des terres. */
  fertility: number;
  /** Multiplie le risque de sécession et l'envie d'indépendance. */
  unrest: number;
  /** Multiplie la rudesse des hivers. */
  winter: number;
  /** S'ajoute à la croissance démographique annuelle. */
  population: number;
}
const BASE: EraMods = { growth: 1, trade: 1, tech: 1, stability: 0, exhaustion: 1, aggression: 0, fertility: 1, unrest: 1, winter: 1, population: 0 };

export const ERAS: Record<string, { name: string; text: string; mods: Partial<EraMods> }> = {
  foundation: { name: 'Fondation', text: 'Les nations prennent place ; rien n\'est encore joué.', mods: {} },
  golden_trade: { name: 'Âge d\'or du commerce', text: 'Les échanges enrichissent ceux qui s\'ouvrent.', mods: { trade: 1.6, growth: 1.03, aggression: -6 } },
  conquest: { name: 'Ère des conquêtes', text: 'Les armées marchent plus loin et plus longtemps.', mods: { aggression: 15, exhaustion: 0.7 } },
  depression: { name: 'Grande dépression', text: 'L\'économie mondiale se contracte, la colère monte.', mods: { growth: 0.92, stability: -5, trade: 0.8 } },
  little_ice_age: { name: 'Petit âge glaciaire', text: 'Hivers longs, récoltes maigres.', mods: { fertility: 0.85, winter: 1.5, stability: -2 } },
  science: { name: 'Révolution scientifique', text: 'Les découvertes s\'enchaînent.', mods: { tech: 1.6, growth: 1.02 } },
  peoples_spring: { name: 'Printemps des peuples', text: 'Provinces et colonies réclament leur liberté.', mods: { unrest: 2.5, stability: -6 } },
  great_peace: { name: 'Grande paix', text: 'Les chancelleries l\'emportent sur les états-majors.', mods: { aggression: -20, trade: 1.2, stability: 3 } },
  pandemic: { name: 'Grande pandémie', text: 'La maladie circule avec les marchands.', mods: { population: -0.006, trade: 0.8, stability: -3 } },
};

export const eraOf = (world: World) => ERAS[world.season.era] ?? ERAS.foundation;
export const eraMods = (world: World): EraMods => ({ ...BASE, ...eraOf(world).mods });

/** Rudesse de l'hiver subie par une nation ce mois-ci : 0 hors hiver ou sous les tropiques. */
export function winterSeverity(world: World, n: Nation): number {
  if (!world.config.climateSeasons || climateSeason(world, n.geo.latitude) !== 'winter') return 0;
  return clamp(seasonality(n.geo.latitude) * eraMods(world).winter, 0, 1.5);
}

/** Effet de la saison sur les recettes d'un pays agricole : moisson d'automne, creux d'hiver. */
export function harvestFactor(world: World, n: Nation): number {
  if (!world.config.climateSeasons) return 1;
  const tide = { winter: -1, spring: -0.2, summer: 0.5, autumn: 1 }[climateSeason(world, n.geo.latitude)];
  return 1 + 0.06 * seasonality(n.geo.latitude) * (1 - n.urbanization / 100) * tide;
}

/** Clôt la saison du monde quand il le faut et tire l'ère suivante. Appelé une fois par an. */
export function tickSeason(world: World): void {
  const s = world.season;
  const alive = world.nations.filter((n) => n.alive);
  // Règle de Nation Wheel : la saison s'achève quand la carte est pleine.
  const mapFull = !s.mapFull && alive.length > 0 && alive.every((n) => n.geo.freeAdjacent <= 0);
  const tooLong = world.tick - s.start >= world.config.seasonYears * 12;
  if (!mapFull && !tooLong) return;
  if (mapFull) s.mapFull = true;
  const top = [...alive].sort((a, b) => b.gdp - a.gdp)[0];
  const wars = world.warsEnded - s.warsAtStart;
  const old = eraOf(world).name;
  const next = pick(world, Object.keys(ERAS).filter((k) => k !== 'foundation' && k !== s.era));
  addJournal(world, 'season', top ? [top.id] : [],
    `Fin de la saison ${s.number} (${old}) en ${yearOf(world)}${mapFull ? ' : la carte est pleine' : ''}. ${alive.length} nations, ${wars} guerre${wars > 1 ? 's' : ''}${top ? `, première économie : ${top.name}` : ''}. La saison ${s.number + 1} s'ouvre : ${ERAS[next].name}. ${ERAS[next].text}`,
    false, { season: s.number + 1, era: next });
  world.season = { number: s.number + 1, start: world.tick, era: next, mapFull: s.mapFull, warsAtStart: world.warsEnded };
  for (const n of alive) n.mind.urgency = Math.max(n.mind.urgency, 0.6);
}
