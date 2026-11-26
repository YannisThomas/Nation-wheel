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

export const MAP_STYLES = ['continents', 'pangaea', 'archipelago', 'two_continents', 'inland_sea'] as const;
export type MapStyle = (typeof MAP_STYLES)[number];

export interface SimConfig {
  seed: number;
  /** random : nations tirées à la roue ; season1 : les nations de la saison 1 du wiki Nation Wheel. */
  roster: 'random' | 'season1';
  mapStyle: MapStyle;
  climate: 'cold' | 'temperate' | 'hot';
  /** Relief et richesse du sous-sol : 0 = peu, 1 = normal, 2 = beaucoup. */
  mountains: number;
  resources: number;
  /** Hiver, printemps, été, automne : effets mensuels selon la latitude. */
  climateSeasons: boolean;
  /** Durée maximale d'une saison du monde, en années. */
  seasonYears: number;
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
  roster: 'random',
  mapStyle: 'continents',
  climate: 'temperate',
  mountains: 1,
  resources: 1,
  climateSeasons: true,
  seasonYears: 30,
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
  /** Terres libres au contact du territoire (compte approximatif). */
  freeAdjacent: number;
  /** Latitude moyenne, de -1 (pôle sud) à 1 (pôle nord). */
  latitude: number;
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

  // Diplomatie et commerce (valeurs dérivées, recalculées par le moteur)
  /** Réputation d'agresseur, 0..100 ; décroît avec le temps. */
  infamy: number;
  /** Bonus de PIB potentiel dû au commerce, net des sanctions subies. */
  tradeBonus: number;
  exports: number;
  imports: number;
  /** Usure de guerre, 0..150. */
  warExhaustion: number;
  /** Part du territoire conquise récemment, 0..1 ; coûte de la stabilité. */
  overextension: number;
  /** Chef du bloc d'alliances auquel la nation appartient, -1 sinon. */
  bloc: number;
  /** Puissance protectrice, -1 sinon. */
  sphereOf: number;
  blockaded: boolean;
  /** Puissance tutélaire (colonie ou protectorat), -1 si la nation est souveraine. */
  overlord: number;
  colony: boolean;
  /** Multiplie la capacité de charge : nations qui vivent d'importations alimentaires. */
  capacityFactor: number;
  wheel: Wheel;

  mind: Mind;
}

/** Résultat du tirage à la roue, façon Nation Wheel. */
export interface Wheel {
  government: string;
  economy: string;
  militaryClass: string;
  /** Note sur 11, recalculée chaque année d'après la puissance relative. */
  militaryRating: number;
  tags: string[];
  bloc: string;
  /** Statut de départ tiré à la roue ; absent pour les nations nées en cours de partie. */
  start?: WheelStart;
}

export type StartKind = 'none' | 'colony' | 'protectorate' | 'overlord' | 'rival' | 'tension' | 'allied' | 'trade' | 'pariah' | 'war';
export interface WheelStart {
  kind: StartKind;
  /** Nation visée par le tirage, ou -1. */
  target: number;
  /** Faux quand le tirage n'a pas pu s'appliquer (suzerain trop faible, nation déjà vassale…). */
  applied: boolean;
}

export const PREF_KEYS = ['science', 'defense', 'diplomacy', 'navy', 'trade', 'expansion', 'offensive', 'risk', 'welfare', 'industry'] as const;
export type PrefKey = (typeof PREF_KEYS)[number];
export type Preferences = Record<PrefKey, number>;

export interface MemoryItem {
  tick: number;
  type: string;
  /** Autres nations concernées. */
  actors: number[];
  text: string;
  /** Importance 0..1. */
  weight: number;
}

/** État mental d'une nation-agent. Le moteur le transporte et le sauvegarde, sans le lire. */
export interface Mind {
  /** Tempérament propre tiré à la création : deux nations identiques sur le papier divergent. */
  quirks: Preferences;
  /** Dérive due au vécu (invasions, trahisons, victoires). */
  drift: Preferences;
  /** Sentiment durable envers les autres nations, -100..100. */
  attitudes: Record<number, number>;
  recent: MemoryItem[];
  important: MemoryItem[];
  historical: string[];
  /** Compteurs du vécu : invaded, aggressions, betrayed, won, lost, conquests. */
  counters: Record<string, number>;
  lastJournalId: number;
  nextReview: number;
  urgency: number;
  /** Cache de décisions : empreinte de situation -> option choisie. */
  cache: Record<string, { option: string; tick: number }>;
  /** « action@cible » -> tick avant lequel la nation ne retente pas cette démarche. */
  cooldowns: Record<string, number>;
}

export type TreatyKind = 'trade' | 'non_aggression' | 'defense_pact';
export const TREATY_KINDS: TreatyKind[] = ['trade', 'non_aggression', 'defense_pact'];

/** Relation entre deux nations a < b. Les couples [x, y] sont rangés [a→b, b→a]. */
export interface Relation {
  opinion: number;
  /** Tick de signature, -1 si absent. */
  trade: number;
  non_aggression: number;
  defense_pact: number;
  sanctions: [boolean, boolean];
  claims: [boolean, boolean];
  truceUntil: number;
  atWar: boolean;
}

export interface PeaceTerms {
  /** white : retour aux frontières d'avant-guerre ; status_quo : chacun garde ce qu'il tient. */
  deal: 'white' | 'status_quo';
  /** Md$. Positif : le destinataire paie l'auteur de la proposition ; négatif : l'inverse. */
  reparations?: number;
}

export type ProposalKind = TreatyKind | 'peace' | 'call_to_arms';

export interface Proposal {
  id: number;
  from: number;
  to: number;
  kind: ProposalKind;
  terms?: PeaceTerms;
  war?: number;
  tick: number;
  expires: number;
  counterOf?: number;
}

export type Stance = 'offensive' | 'defensive';

export interface War {
  id: number;
  name: string;
  /** Le premier de chaque camp en est le chef. */
  attackers: number[];
  defenders: number[];
  start: number;
  /** -100..100, positif = avantage aux attaquants. */
  score: number;
  stance: Record<number, Stance>;
  casualties: Record<number, number>;
  /** Cellule -> propriétaire d'avant-guerre. */
  captured: Record<number, number>;
  /** Ticks consécutifs sans combat. */
  idle: number;
}

export interface JournalEntry {
  id: number;
  tick: number;
  type: string;
  nations: number[];
  text: string;
  /** Intervention du mode administrateur. */
  admin?: boolean;
  data?: Record<string, number | string>;
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
  relations: Record<string, Relation>;
  proposals: Proposal[];
  nextProposalId: number;
  wars: War[];
  nextWarId: number;
  /** Nombre de guerres terminées. */
  warsEnded: number;
  /** Dernière entrée de journal déjà transformée en souvenirs. */
  memoryCursor: number;
  /** Nombre de cellules terrestres de la carte. */
  landCells: number;
  /** Saison du monde en cours et son ère. */
  season: { number: number; start: number; era: string; mapFull: boolean; warsAtStart: number };
  /** Plus haut niveau technologique atteint (diffusion). */
  techFrontier: number;
}

// ---- Actions : seul moyen pour un agent (LLM ou non) d'influencer le monde ----

export type Action =
  | { type: 'set_budget'; nation: number; budget: Budget }
  | { type: 'set_tax'; nation: number; rate: number }
  | { type: 'invest'; nation: number; sector: BudgetSector; amount: number }
  | { type: 'mobilize'; nation: number; level: number }
  | { type: 'research'; nation: number; militaryShare: number }
  | { type: 'set_doctrine'; nation: number; doctrine: Military['doctrine'] }
  | { type: 'claim_land'; nation: number }
  | { type: 'propose'; nation: number; target: number; kind: TreatyKind | 'peace'; terms?: PeaceTerms }
  | { type: 'respond'; nation: number; proposal: number; answer: 'accept' | 'reject' | 'counter'; kind?: TreatyKind; terms?: PeaceTerms }
  | { type: 'break_treaty'; nation: number; target: number; kind: TreatyKind }
  | { type: 'sanction'; nation: number; target: number; on: boolean }
  | { type: 'threaten'; nation: number; target: number }
  | { type: 'send_aid'; nation: number; target: number; amount: number }
  | { type: 'press_claim'; nation: number; target: number }
  | { type: 'declare_war'; nation: number; target: number }
  | { type: 'set_stance'; nation: number; stance: Stance }
  | { type: 'declare_independence'; nation: number };

export interface ActionResult {
  action: Action;
  ok: boolean;
  reason?: string;
  /** Conséquences calculées par le moteur, lisibles par l'UI et les agents. */
  effects?: Record<string, number>;
  /** Phrase lisible décrivant ce qui s'est réellement passé. */
  summary?: string;
}
