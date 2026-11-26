// Outils de consultation offerts au LLM. Lecture seule : aucun outil ne
// modifie le monde. La décision elle-même passe par propose_action, puis par
// la validation du moteur.

import { peekRel } from '../engine/diplomacy';
import { formatDate } from '../engine/journal';
import { gdpPerCapita } from '../engine/systems';
import { sideOf, warsOf, other } from '../engine/war';
import type { Nation, World } from '../engine/types';
import type { ToolDef } from '../llm/provider';
import { describeRelation } from './context';
import { recall } from './memory';
import { background } from './profile';

const nameArg = { type: 'object', properties: { name: { type: 'string', description: 'Nom de la nation ; vide pour la nôtre' } } };
const none = { type: 'object', properties: {} };

export const TOOL_DEFS: ToolDef[] = [
  { name: 'get_nation', description: 'Fiche générale d\'une nation (identité, taille, régime).', parameters: nameArg },
  { name: 'get_neighbor', description: 'Liste de nos voisins avec leur puissance relative.', parameters: none },
  { name: 'get_relations', description: 'Nos relations avec une nation, ou avec toutes celles qui comptent.', parameters: nameArg },
  { name: 'get_world_state', description: 'État du monde : grandes puissances, guerres en cours.', parameters: none },
  { name: 'get_history', description: 'Nos souvenirs concernant une nation, ou notre histoire générale.', parameters: nameArg },
  { name: 'get_war', description: 'État des guerres auxquelles nous participons.', parameters: none },
  { name: 'get_economy', description: 'Chiffres économiques d\'une nation.', parameters: nameArg },
  { name: 'get_military', description: 'Forces armées d\'une nation (estimation pour les autres).', parameters: nameArg },
  { name: 'get_trade', description: 'Nos accords commerciaux, sanctions et commerce extérieur.', parameters: none },
  { name: 'get_alliances', description: 'Pactes de défense d\'une nation et bloc auquel elle appartient.', parameters: nameArg },
];

const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

export function execTool(world: World, self: Nation, name: string, args: Record<string, unknown>): string {
  const wanted = typeof args.name === 'string' ? args.name.trim().toLowerCase() : '';
  const target = wanted ? world.nations.find((n) => n.alive && n.name.toLowerCase() === wanted) : self;
  if (!target) return JSON.stringify({ error: `nation inconnue : ${args.name}` });
  const own = target.id === self.id;
  const partners = (n: Nation, key: 'trade' | 'defense_pact' | 'non_aggression') =>
    world.nations.filter((o) => o.alive && o.id !== n.id && (peekRel(world, n.id, o.id)?.[key] ?? -1) >= 0).map((o) => o.name);
  switch (name) {
    case 'get_nation':
      return JSON.stringify({ nom: target.name, capitale: target.capitalName, statut: target.status, profil: background(world, target), population_M: round(target.pop / 1e6), superficie_km2: Math.round(target.geo.areaKm2), stabilite: Math.round(target.stability), dirigeant: target.leader.trait });
    case 'get_neighbor':
      return JSON.stringify(Object.keys(self.geo.neighbors).map((id) => { const o = world.nations[+id]; return { nom: o.name, statut: o.status, puissance_relative: round(o.mil.power / Math.max(1, self.mil.power)), opinion: Math.round(peekRel(world, self.id, o.id)?.opinion ?? 0) }; }));
    case 'get_relations':
      if (!own) return describeRelation(world, self, target.id);
      return world.nations.filter((o) => o.alive && o.id !== self.id && peekRel(world, self.id, o.id)).sort((a, b) => Math.abs(peekRel(world, self.id, b.id)!.opinion) - Math.abs(peekRel(world, self.id, a.id)!.opinion)).slice(0, 8).map((o) => describeRelation(world, self, o.id)).join('\n');
    case 'get_world_state': {
      const alive = world.nations.filter((n) => n.alive);
      return JSON.stringify({ date: formatDate(world), nations: alive.length, grandes_puissances: alive.filter((n) => n.status === 'superpower' || n.status === 'great_power').map((n) => n.name), guerres: world.wars.map((w) => ({ nom: w.name, attaquants: w.attackers.map((i) => world.nations[i].name), defenseurs: w.defenders.map((i) => world.nations[i].name), duree_ans: round((world.tick - w.start) / 12) })) });
    }
    case 'get_history':
      return JSON.stringify({ souvenirs: recall(world, self, own ? [] : [target.id], 8).filter((m) => own || m.includes(target.name)), histoire: own ? self.mind.historical.slice(-6) : [] });
    case 'get_war':
      return JSON.stringify(warsOf(world, self.id).map((w) => { const s = sideOf(w, self.id)!; return { nom: w.name, ennemis: w[other(s)].map((i) => world.nations[i].name), allies: w[s].filter((i) => i !== self.id).map((i) => world.nations[i].name), avantage: Math.round(w.score * (s === 'attackers' ? 1 : -1)), posture: w.stance[self.id], pertes: Math.round(w.casualties[self.id] ?? 0), usure: Math.round(self.warExhaustion) }; }));
    case 'get_economy':
      return JSON.stringify({ nom: target.name, pib_MdUSD: round(target.gdp), pib_par_habitant: Math.round(gdpPerCapita(target)), croissance_pct: round(target.gdpGrowth * 100), technologie: Math.round(target.tech), ...(own ? { tresor: round(target.treasury), dette_pct_pib: Math.round(100 * target.debt / Math.max(1e-6, target.gdp)), impots_pct: Math.round(target.taxRate * 100), budget: Object.fromEntries(Object.entries(target.budget).map(([k, v]) => [k, Math.round(v * 100)])) } : {}) });
    case 'get_military': {
      // Le renseignement sur autrui est approximatif : arrondi grossier.
      const fuzz = (x: number) => (own ? Math.round(x) : Math.round(x / 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, x))) - 1)) * 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, x))) - 1));
      return JSON.stringify({ nom: target.name, soldats: fuzz(target.mil.personnel), puissance_relative_a_la_notre: round(target.mil.power / Math.max(1, self.mil.power)), mobilisation_pct: Math.round(target.mil.mobilization * 100), doctrine: target.mil.doctrine, flotte: target.geo.landlocked ? 'aucune' : fuzz(target.mil.navy), en_guerre: warsOf(world, target.id).length > 0 });
    }
    case 'get_trade':
      return JSON.stringify({ partenaires: partners(self, 'trade'), bonus_commerce_pct: round(self.tradeBonus * 100), exportations: round(self.exports), importations: round(self.imports), blocus: self.blockaded, sanctions_subies: world.nations.filter((o) => o.alive && peekRel(world, self.id, o.id)?.sanctions[o.id < self.id ? 0 : 1]).map((o) => o.name) });
    case 'get_alliances':
      return JSON.stringify({ nom: target.name, pactes_de_defense: partners(target, 'defense_pact'), non_agression: partners(target, 'non_aggression'), chef_de_bloc: target.bloc >= 0 ? world.nations[target.bloc].name : null, protecteur: target.sphereOf >= 0 ? world.nations[target.sphereOf].name : null });
    default:
      return JSON.stringify({ error: `outil inconnu : ${name}` });
  }
}
