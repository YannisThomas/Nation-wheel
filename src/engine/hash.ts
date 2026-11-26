// Empreintes d'état. Les versions « quantifiées » servent au cache de décision :
// tant que la situation pertinente d'une nation n'a pas assez changé, son
// empreinte reste identique et on ne rappelle pas le LLM.

import type { Nation, World } from './types';

export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const bucket = (x: number, size: number) => Math.round(x / size);

export function nationStateHash(n: Nation): string {
  return fnv1a([
    n.id, n.alive, n.government, n.ideology, n.status, n.leader.trait,
    bucket(Math.log2(Math.max(1e-6, n.gdp)), 0.25), bucket(Math.log2(Math.max(1, n.pop)), 0.25),
    bucket(n.stability, 10), bucket(n.tech, 5), bucket(n.mil.mobilization, 0.25),
    bucket(n.debt / Math.max(1e-6, n.gdp), 0.25), bucket(n.treasury / Math.max(1e-6, n.gdp), 0.05),
    bucket(Math.log2(Math.max(1, n.mil.power)), 0.5), n.geo.cells,
    Object.keys(n.geo.neighbors).join(','),
  ].join('|'));
}

export function worldStateHash(world: World): string {
  return fnv1a(world.nations.map(nationStateHash).join(''));
}

/** Empreinte exacte, pour vérifier le déterminisme et les sauvegardes. */
export function exactHash(world: World): string {
  return fnv1a(JSON.stringify([world.tick, world.rngState, world.nations, world.map.owner, world.map.resource, world.relations, world.wars, world.proposals, world.season]));
}
