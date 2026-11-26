// Mode administrateur : interventions directes du joueur. Chacune est bornée,
// appliquée par le moteur et inscrite au journal avec la marque « admin ».

import { getRel, signTreaty } from './diplomacy';
import { redrawDoctrine } from './doctrine';
import { addJournal } from './journal';
import { OCEAN } from './map';
import { clamp } from './rng';
import { TECH_MAX } from './systems';
import { declareWar, endWar, transferCell, warBetween } from './war';
import { GOVERNMENTS, IDEOLOGIES, LEADER_TRAITS, RESOURCES, TREATY_KINDS, type Nation, type TreatyKind, type World } from './types';

export type AdminCommand =
  | { op: 'edit_nation'; nation: number; patch: Partial<Record<'name' | 'government' | 'ideology' | 'leaderTrait', string>> & Partial<Record<'stability' | 'treasury' | 'debt' | 'tech' | 'taxRate' | 'pop' | 'gdp' | 'education' | 'infrastructure' | 'industry' | 'army', number>> }
  | { op: 'set_cells'; cells: number[]; owner: number }
  | { op: 'set_resource'; cell: number; resource: number }
  | { op: 'force_war'; a: number; b: number }
  | { op: 'force_peace'; war: number }
  | { op: 'force_treaty'; a: number; b: number; kind: TreatyKind }
  | { op: 'set_opinion'; a: number; b: number; opinion: number }
  | { op: 'event'; nation: number; kind: 'epidemic' | 'boom' | 'unrest' | 'disaster' | 'discovery' | 'coup' };

const LIMITS: Record<string, [number, number]> = {
  stability: [0, 100], treasury: [0, 1e7], debt: [0, 1e7], tech: [0, TECH_MAX], taxRate: [0.05, 0.6], pop: [1000, 2e10],
  gdp: [0.001, 1e7], education: [1, 100], infrastructure: [1, 100], industry: [1, 100],
};

/** Applique une intervention. Renvoie un message d'erreur, ou null si elle est appliquée. */
export function adminCommand(world: World, c: AdminCommand): string | null {
  const nation = (id: unknown): Nation | null => (typeof id === 'number' && world.nations[id]?.alive ? world.nations[id] : null);
  const log = (nations: number[], text: string) => { addJournal(world, 'admin', nations, `[Admin] ${text}`, true); for (const id of nations) world.nations[id].mind.urgency = 1; };
  switch (c?.op) {
    case 'edit_nation': {
      const n = nation(c.nation);
      if (!n || !c.patch || typeof c.patch !== 'object') return 'nation ou modification invalide';
      const done: string[] = [];
      for (const [k, v] of Object.entries(c.patch)) {
        if (k === 'name' && typeof v === 'string' && v.trim() && v.length <= 40) { n.name = v.trim(); done.push('nom'); }
        else if (k === 'government' && (GOVERNMENTS as readonly string[]).includes(v as string)) { n.government = v as Nation['government']; n.wheel.government = ''; redrawDoctrine(world, n); done.push('gouvernement'); }
        else if (k === 'ideology' && (IDEOLOGIES as readonly string[]).includes(v as string)) { n.ideology = v as Nation['ideology']; done.push('idéologie'); }
        else if (k === 'leaderTrait' && (LEADER_TRAITS as readonly string[]).includes(v as string)) { n.leader = { ...n.leader, trait: v as Nation['leader']['trait'], since: world.tick }; done.push('dirigeant'); }
        else if (k === 'army' && typeof v === 'number' && Number.isFinite(v)) { n.mil.army = clamp(v, 0, 1e6); done.push('armée'); }
        else if (k in LIMITS && typeof v === 'number' && Number.isFinite(v)) { (n as unknown as Record<string, number>)[k] = clamp(v, ...LIMITS[k]); done.push(k); }
        else return `champ refusé : ${k}`;
      }
      if (!done.length) return 'aucune modification';
      log([n.id], `${n.name} modifié (${done.join(', ')}).`);
      return null;
    }
    case 'set_cells': {
      if (!Array.isArray(c.cells) || !c.cells.length || c.cells.length > 5000) return 'cellules invalides';
      if (c.owner !== -1 && !nation(c.owner)) return 'propriétaire invalide';
      const touched = new Set<number>();
      for (const cell of c.cells) {
        if (!Number.isInteger(cell) || cell < 0 || cell >= world.map.owner.length || world.map.terrain[cell] === OCEAN) continue;
        const prev = world.map.owner[cell];
        if (prev === c.owner) continue;
        if (prev >= 0) touched.add(prev);
        if (c.owner >= 0) transferCell(world, cell, c.owner, false);
        else {
          const P = world.nations[prev];
          if (P.geo.cells <= 1) continue; // on ne supprime pas une nation en effaçant sa dernière cellule
          world.map.owner[cell] = -1;
          P.geo.cells--;
          if (cell === P.capitalCell) P.capitalCell = world.map.owner.indexOf(prev);
          world.geoDirty = true;
        }
      }
      if (c.owner >= 0) touched.add(c.owner);
      const alive = [...touched].filter((id) => world.nations[id].alive);
      if (!alive.length) return 'aucun changement';
      log(alive, `Frontières redessinées (${alive.map((id) => world.nations[id].name).join(', ')}).`);
      return null;
    }
    case 'set_resource': {
      if (!Number.isInteger(c.cell) || world.map.terrain[c.cell] === undefined || world.map.terrain[c.cell] === OCEAN) return 'cellule invalide';
      if (!Number.isInteger(c.resource) || c.resource < -1 || c.resource >= RESOURCES.length) return 'ressource invalide';
      world.map.resource[c.cell] = c.resource;
      world.geoDirty = true;
      const o = world.map.owner[c.cell];
      log(o >= 0 ? [o] : [], c.resource < 0 ? 'Gisement retiré.' : `Gisement ajouté (${RESOURCES[c.resource]})${o >= 0 ? ` en ${world.nations[o].name}` : ''}.`);
      return null;
    }
    case 'force_war': {
      const a = nation(c.a);
      const b = nation(c.b);
      if (!a || !b || a === b) return 'nations invalides';
      if (warBetween(world, a.id, b.id)) return 'déjà en guerre';
      const rel = getRel(world, a.id, b.id);
      rel.truceUntil = -1;
      log([a.id, b.id], `Guerre provoquée entre ${a.name} et ${b.name}.`);
      declareWar(world, a.id, b.id);
      return null;
    }
    case 'force_peace': {
      const war = world.wars.find((w) => w.id === c.war);
      if (!war) return 'guerre introuvable';
      log([war.attackers[0], war.defenders[0]], `Paix imposée : ${war.name}.`);
      endWar(world, war, 'status_quo');
      return null;
    }
    case 'force_treaty': {
      const a = nation(c.a);
      const b = nation(c.b);
      if (!a || !b || a === b || !TREATY_KINDS.includes(c.kind)) return 'paramètres invalides';
      if (warBetween(world, a.id, b.id)) return 'nations en guerre';
      log([a.id, b.id], `Traité imposé entre ${a.name} et ${b.name}.`);
      signTreaty(world, a.id, b.id, c.kind);
      return null;
    }
    case 'set_opinion': {
      const a = nation(c.a);
      const b = nation(c.b);
      if (!a || !b || a === b || typeof c.opinion !== 'number' || !Number.isFinite(c.opinion)) return 'paramètres invalides';
      getRel(world, a.id, b.id).opinion = clamp(c.opinion, -100, 100);
      log([a.id, b.id], `Relations entre ${a.name} et ${b.name} fixées à ${Math.round(clamp(c.opinion, -100, 100))}.`);
      return null;
    }
    case 'event': {
      const n = nation(c.nation);
      if (!n) return 'nation invalide';
      switch (c.kind) {
        case 'epidemic': n.pop = Math.max(1000, n.pop * 0.97); n.health = clamp(n.health - 6, 1, 100); break;
        case 'boom': n.gdp *= 1.05; break;
        case 'unrest': n.stability = clamp(n.stability - 20, 0, 100); break;
        case 'disaster': n.infrastructure = clamp(n.infrastructure - 8, 1, 100); n.gdp *= 0.97; break;
        case 'discovery': n.tech = clamp(n.tech + 2, 0, TECH_MAX); break;
        case 'coup': n.stability = 5; break;
        default: return 'événement inconnu';
      }
      log([n.id], `Événement provoqué en ${n.name} : ${c.kind}.`);
      return null;
    }
    default:
      return 'commande inconnue';
  }
}
