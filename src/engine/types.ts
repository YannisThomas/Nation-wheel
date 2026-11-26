// Types de l'état du monde. Tout est du JSON simple : sérialisable tel quel
// (sauvegardes) et transférable entre thread UI, Web Worker et serveur.

export const TERRAINS = ['ocean', 'plains', 'forest', 'hills', 'mountain', 'desert', 'tundra'] as const;
export type Terrain = (typeof TERRAINS)[number];

export const RESOURCES = ['oil', 'gas', 'coal', 'iron', 'copper', 'gold', 'rare_earths', 'uranium'] as const;
export type Resource = (typeof RESOURCES)[number];

export const GOVERNMENTS = [
  'republic', 'federation', 'constitutional_monarchy', 'absolute_monarchy', 'one_party_state',
  'military_junta', 'theocracy', 'oligarchy', 'tribal_confederation', 'empire',
] as const;
export type Government = (typeof GOVERNMENTS)[number];

export const IDEOLOGIES = [
  'liberal', 'conservative', 'socialist', 'communist', 'nationalist', 'militarist',
  'theocratic', 'technocratic', 'isolationist', 'mercantile',
] as const;
export type Ideology = (typeof IDEOLOGIES)[number];

export const LEADER_TRAITS = [
  'reformer', 'warlord', 'diplomat', 'scholar', 'merchant', 'populist', 'zealot', 'builder', 'schemer', 'cautious',
] as const;
export type LeaderTrait = (typeof LEADER_TRAITS)[number];

export type Status = 'superpower' | 'great_power' | 'regional_power' | 'middle_power' | 'minor_power' | 'microstate';

export interface SimConfig {
  seed: number;
  width: number;
  height: number;
  landFraction: number;
  nations: number;
  startYear: number;
  /** Probabilité mensuelle d'événement aléatoire par nation. */
  eventRate: number;
  maxJournal: number;
}

export const DEFAULT_CONFIG: SimConfig = {
  seed: 1,
  width: 160,
  height: 90,
  landFraction: 0.36,
  nations: 50,
  startYear: 1800,
  eventRate: 0.012,
  maxJournal: 20000,
};

/** Carte en « structure de tableaux » : compacte et rapide à parcourir. */
export interface WorldMap {
  width: number;
  height: number;
  cellAreaKm2: number;
  elevation: number[];
  /** Index dans TERRAINS. */
  terrain: number[];
  /** 0..1 */
  fertility: number[];
  river: number[];
  /** Index dans RESOURCES, -1 si aucune. */
  resource: number[];
  /** Id de nation, -1 si non revendiqué. */
  owner: number[];
}

export interface Flag {
  pattern: 'horizontal' | 'vertical' | 'cross' | 'canton' | 'disc' | 'diagonal';
  colors: [string, string, string];
}

export interface Geo {
  cells: number;
  areaKm2: number;
  coastCells: number;
  coastlineKm: number;
  landlocked: boolean;
  /** Parts 0..1 par terrain. */
  terrain: Record<Terrain, number>;
  riverCells: number;
  /** Nombre de composantes connexes du territoire (îles/exclaves). */
  parts: number;
  fertility: number;
  resources: Record<Resource, number>;
  /** Voisins terrestres : id -> longueur de frontière en cellules. */
  neighbors: Record<number, number>;
  /** 0..100 */
  strategic: number;
}

export interface Budget {
  military: number;
  research: number;
  education: number;
  infrastructure: number;
  welfare: number;
  industry: number;
}
export type BudgetSector = keyof Budget;
export const BUDGET_SECTORS: BudgetSector[] = ['military', 'research', 'education', 'infrastructure', 'welfare', 'industry'];

export interface Military {
  personnel: number;
  reserves: number;
  /** 0..1 */
  mobilization: number;
  /** Points d'équipement. */
  army: number;
  airforce: number;
  navy: number;
  tech: number;
  experience: number;
  logistics: number;
  doctrine: 'defensive' | 'balanced' | 'offensive' | 'naval' | 'guerrilla';
  /** Dernier budget militaire annualisé, Md$. */
  budget: number;
  power: number;
}

export interface Nation {
  id: number;
  alive: boolean;
  name: string;
  capitalName: string;
  capitalCell: number;
  flag: Flag;
  culture: string;
  language: string;
  government: Government;
  ideology: Ideology;
  leader: { name: string; trait: LeaderTrait; since: number };
  status: Status;
  foundedTick: number;

  // Population
  pop: number;
  /** Croissance annualisée du dernier tick. */
  popGrowth: number;
  urbanization: number;
  education: number;
  health: number;
  hdi: number;
  qualityOfLife: number;
  stability: number;

  // Économie (montants en Md$)
  gdp: number;
  gdpGrowth: number;
  treasury: number;
  debt: number;
  taxRate: number;
  revenue: number;
  expenses: number;
  tech: number;
  industry: number;
  infrastructure: number;
  budget: Budget;
  /** Part de la recherche orientée militaire, 0..1. */
  militaryResearchShare: number;

  mil: Military;
  geo: Geo;
}

export interface JournalEntry {
  id: number;
  tick: number;
  type: string;
  nations: number[];
  text: string;
  /** Intervention du mode administrateur. */
  admin?: boolean;
}

export interface World {
  version: 1;
  config: SimConfig;
  tick: number;
  rngState: number;
  map: WorldMap;
  nations: Nation[];
  journal: JournalEntry[];
  nextJournalId: number;
  geoDirty: boolean;
  /** Plus haut niveau technologique atteint (diffusion). */
  techFrontier: number;
}

// ---- Actions : seul moyen pour un agent (LLM ou non) d'influencer le monde ----

export type Action =
  | { type: 'set_budget'; nation: number; budget: Budget }
  | { type: 'set_tax'; nation: number; rate: number }
  | { type: 'invest'; nation: number; sector: BudgetSector; amount: number }
  | { type: 'mobilize'; nation: number; level: number }
  | { type: 'research'; nation: number; militaryShare: number };

export interface ActionResult {
  action: Action;
  ok: boolean;
  reason?: string;
  /** Conséquences calculées par le moteur, lisibles par l'UI et les agents. */
  effects?: Record<string, number>;
}
