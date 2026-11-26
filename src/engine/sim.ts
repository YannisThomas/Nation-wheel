import { executeAction } from './actions';
import { tickDiplomacy, updateBlocs } from './diplomacy';
import { generateMap, recomputeGeo } from './map';
import { tickWars } from './war';
import { generateNations } from './nationgen';
import { computeHdi, randomEvents, tickNation, updateStatuses } from './systems';
import { DEFAULT_CONFIG, type Action, type ActionResult, type SimConfig, type World } from './types';

export function createWorld(config: Partial<SimConfig> = {}): World {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const world: World = {
    version: 1, config: cfg, tick: 0, rngState: cfg.seed | 0,
    map: undefined as never, nations: [], journal: [], nextJournalId: 1, geoDirty: false, techFrontier: 0,
    relations: {}, proposals: [], nextProposalId: 1, wars: [], nextWarId: 1, warsEnded: 0, memoryCursor: 0, landCells: 1,
  };
  world.map = generateMap(cfg, world);
  world.landCells = Math.max(1, world.map.terrain.filter((t) => t !== 0).length);
  generateNations(world);
  for (const n of world.nations) {
    n.hdi = computeHdi(n);
    n.qualityOfLife = 100 * (0.6 * n.hdi + 0.25 * n.stability / 100 + 0.15);
  }
  world.techFrontier = Math.max(0, ...world.nations.map((n) => n.tech));
  updateStatuses(world);
  return world;
}

/** Avance le monde d'un tick (un mois). Les actions sont validées une à une. */
export function step(world: World, actions: Action[] = []): ActionResult[] {
  const results = actions.map((a) => executeAction(world, a));
  if (world.geoDirty) recomputeGeo(world);
  tickWars(world);
  if (world.geoDirty) recomputeGeo(world);
  tickDiplomacy(world);
  for (const n of world.nations) if (n.alive) tickNation(world, n);
  randomEvents(world);
  if (world.geoDirty) recomputeGeo(world);
  let frontier = 0;
  for (const n of world.nations) if (n.alive && n.tech > frontier) frontier = n.tech;
  world.techFrontier = frontier;
  world.tick++;
  if (world.tick % 12 === 0) updateStatuses(world);
  return results;
}

export const saveWorld = (world: World): string => JSON.stringify(world);

export function loadWorld(json: string): World {
  const world = JSON.parse(json) as World;
  if (world.version !== 1) throw new Error(`Version de sauvegarde non prise en charge : ${world.version}`);
  return world;
}
