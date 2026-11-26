// Saison 3 : quand le régime d'une nation change en cours de partie (effondrement,
// sécession, indépendance, intervention de l'administrateur), son idéologie et sa
// doctrine de Nation Wheel suivent, pour que le tirage affiché reste vrai.

import { DOCTRINES } from '../data/wheels3';
import { pick } from './rng';
import type { Government, Nation, World } from './types';

/** Idéologie de la roue la plus proche d'un régime du moteur. */
function ideologyFor(n: Nation): string {
  const byGov: Record<Government, string> = {
    republic: 'Democracy', federation: 'Democracy', constitutional_monarchy: 'Monarchy', absolute_monarchy: 'Monarchy',
    one_party_state: n.ideology === 'communist' || n.ideology === 'socialist' ? 'Communism' : 'Authoritarianism',
    military_junta: 'Military Rule', theocracy: 'Theocracy', oligarchy: 'Authoritarianism', tribal_confederation: 'Tribalism', empire: 'Imperialism',
  };
  return byGov[n.government];
}

/** Doctrines d'une idéologie compatibles avec un régime précis, quand la roue en propose. */
function doctrinesFor(n: Nation, ideology: string): string[] {
  const all = DOCTRINES[ideology];
  const keep = (re: RegExp) => { const hit = all.filter((d) => re.test(d)); return hit.length ? hit : all; };
  if (n.government === 'federation') return keep(/Federal|Decentralized|Provincial|Coalition/);
  if (n.government === 'republic') return all.filter((d) => !/Federal|Decentralized|Provincial|Coalition/.test(d));
  if (n.government === 'constitutional_monarchy') return keep(/Constitutional|Commonwealth|Elective|Noble/);
  if (n.government === 'absolute_monarchy') return all.filter((d) => !/Constitutional|Commonwealth|Elective|Noble/.test(d));
  if (n.government === 'oligarchy') return keep(/Corporate State/);
  return all;
}

/**
 * Retire une doctrine pour une nation de la saison 3 dont le régime vient de changer.
 * Sans effet sur les mondes des autres modes (aucun tirage de saison 3 à tenir à jour).
 */
export function redrawDoctrine(world: World, n: Nation): void {
  const s3 = n.wheel.s3;
  if (!s3) return;
  if (n.overlord >= 0 && n.colony) { s3.ideology = 'Colony'; s3.doctrine = ''; n.wheel.government = 'Colony'; return; }
  s3.ideology = ideologyFor(n);
  s3.doctrine = pick(world, doctrinesFor(n, s3.ideology));
  n.wheel.government = s3.doctrine;
}
