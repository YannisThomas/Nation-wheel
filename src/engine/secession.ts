// Fragmentation : un État vaste et instable peut perdre une région, qui
// devient une nouvelle nation. C'est le frein naturel aux empires.

import { getRel } from './diplomacy';
import { addJournal } from './journal';
import { neighborTable } from './map';
import { newMind } from './mind';
import { pick, rand, randInt } from './rng';
import { GOVERNMENTS, IDEOLOGIES, LEADER_TRAITS, type Nation, type World } from './types';

const ON = ['b', 'd', 'g', 'k', 'l', 'm', 'n', 'r', 's', 't', 'v', 'z', 'th', 'sh', 'br', 'dr', 'st', 'tr', 'h', 'f'];
const VO = ['a', 'e', 'i', 'o', 'u', 'ia', 'ei', 'ou'];
const SUF = ['ia', 'land', 'stan', 'ar', 'os', 'ora', 'um', 'en', 'mark', 'ovia'];
const COLORS = ['#c0392b', '#2471a3', '#1e8449', '#f1c40f', '#ecf0f1', '#17202a', '#d35400', '#7d3c98', '#148f77', '#f5b041'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const syll = (w: World, k: number) => Array.from({ length: k }, () => pick(w, ON) + pick(w, VO)).join('');

export function trySecession(world: World, parent: Nation): Nation | null {
  const { map, nations } = world;
  const alive = nations.filter((n) => n.alive).length;
  if (parent.geo.cells < 12 || alive >= world.config.nations || nations.length >= world.config.nations * 4) return null;

  // La région la plus éloignée de la capitale fait sécession.
  const cx = parent.capitalCell % map.width;
  const cy = Math.floor(parent.capitalCell / map.width);
  let seed = -1;
  let far = -1;
  for (let i = 0; i < map.owner.length; i++) {
    if (map.owner[i] !== parent.id) continue;
    const d = (i % map.width - cx) ** 2 + (Math.floor(i / map.width) - cy) ** 2;
    if (d > far) { far = d; seed = i; }
  }
  if (seed < 0 || seed === parent.capitalCell) return null;
  const want = Math.floor(parent.geo.cells * (0.25 + 0.2 * rand(world)));
  const nb = neighborTable(map.width, map.height);
  const taken = [seed];
  const seen = new Set([seed]);
  for (let h = 0; h < taken.length && taken.length < want; h++) {
    for (let k = 0; k < 6; k++) {
      const j = nb[taken[h] * 6 + k];
      if (j >= 0 && !seen.has(j) && map.owner[j] === parent.id && j !== parent.capitalCell && taken.length < want) { seen.add(j); taken.push(j); }
    }
  }
  if (taken.length < 4) return null;

  const share = taken.length / parent.geo.cells;
  const names = new Set(nations.map((n) => n.name));
  let name = '';
  do name = cap(syll(world, 1 + randInt(world, 2))) + pick(world, SUF); while (names.has(name));
  const id = nations.length;
  const child: Nation = JSON.parse(JSON.stringify(parent));
  Object.assign(child, {
    id, name, capitalName: cap(syll(world, 2)), capitalCell: seed, foundedTick: world.tick,
    government: pick(world, GOVERNMENTS), ideology: pick(world, IDEOLOGIES),
    flag: { pattern: parent.flag.pattern, colors: [pick(world, COLORS), pick(world, COLORS), pick(world, COLORS)] },
    leader: { name: `${cap(syll(world, 2))} ${cap(syll(world, 2))}`, trait: pick(world, LEADER_TRAITS), since: world.tick },
    pop: parent.pop * share, gdp: parent.gdp * share * 0.9, debt: parent.debt * share, treasury: 0,
    stability: 55, infamy: 0, warExhaustion: 0, overextension: 0, bloc: -1, sphereOf: -1, blockaded: false,
    mind: newMind(world),
  });
  for (const k of ['personnel', 'reserves', 'army', 'airforce', 'navy'] as const) {
    child.mil[k] = parent.mil[k] * share * 0.8;
    parent.mil[k] *= 1 - share;
  }
  child.mil.mobilization = 0;
  child.geo.cells = taken.length;
  parent.pop *= 1 - share;
  parent.gdp *= 1 - share;
  parent.debt *= 1 - share;
  parent.geo.cells -= taken.length;
  parent.overextension = 0;
  for (const c of taken) map.owner[c] = id;
  nations.push(child);
  world.geoDirty = true;
  getRel(world, id, parent.id).opinion = -30;
  child.mind.attitudes[parent.id] = -30;
  addJournal(world, 'secession', [id, parent.id], `${name} fait sécession de ${parent.name} et proclame son indépendance.`);
  return child;
}
