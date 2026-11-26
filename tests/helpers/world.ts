import { peekRel } from '../../src/engine/diplomacy';
import type { World } from '../../src/engine/types';

/** Deux voisins souverains sans traité ni contentieux, le premier étant le plus fort. */
export function cleanPair(w: World): [number, number] {
  for (const a of w.nations) for (const b of Object.keys(a.geo.neighbors).map(Number)) {
    const B = w.nations[b];
    const rel = peekRel(w, a.id, b);
    if (a.overlord >= 0 || B.overlord >= 0 || w.nations.some((n) => n.overlord === a.id || n.overlord === b)) continue;
    if (rel && (rel.trade >= 0 || rel.non_aggression >= 0 || rel.defense_pact >= 0 || rel.atWar)) continue;
    if (a.mil.power > B.mil.power && B.mil.power > 0) return [a.id, b];
  }
  throw new Error('aucun couple de voisins disponible');
}
