// Contexte fourni au LLM : un résumé ciblé, jamais la base entière.

import { peekRel } from '../engine/diplomacy';
import { formatDate } from '../engine/journal';
import { gdpPerCapita } from '../engine/systems';
import { sideOf, warsOf, other } from '../engine/war';
import type { Nation, World } from '../engine/types';
import type { Situation } from './behavior';
import { recall } from './memory';
import { relevantNations, type Option } from './options';
import { background, goals, GOAL_FR, GOV_FR, IDEO_FR, PREF_FR, TRAIT_FR } from './profile';

export const SYSTEM_PROMPT = `Tu es le gouvernement d'une nation dans une simulation géopolitique. Tu décides ce que ta nation VEUT faire ; un moteur de simulation calcule ensuite ce qui se passe réellement.
Reste fidèle à l'identité, au passé et aux objectifs de ta nation : deux nations aux mêmes chiffres peuvent choisir différemment.
Choisis exactement UNE option de la liste OPTIONS. Réponds uniquement par un objet JSON :
{"action": "<identifiant de l'option>", "target": "<nom de la nation visée ou null>", "priority": <0 à 1>, "key_factors": ["<2 à 4 raisons courtes>"]}`;

const money = (x: number) => (x >= 100 ? `${x.toFixed(0)} Md$` : `${x.toFixed(1)} Md$`);
const people = (x: number) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)} M` : `${Math.round(x / 1e3)} k`);
const STATUS_FR: Record<string, string> = { superpower: 'superpuissance', great_power: 'grande puissance', regional_power: 'puissance régionale', middle_power: 'puissance moyenne', minor_power: 'puissance mineure', microstate: 'micro-État' };

export function describeRelation(world: World, n: Nation, id: number): string {
  const o = world.nations[id];
  const rel = peekRel(world, n.id, id);
  const bits: string[] = [`${STATUS_FR[o.status]}, ${GOV_FR[o.government]} ${IDEO_FR[o.ideology]}`];
  bits.push(`puissance militaire ${(o.mil.power / Math.max(1, n.mil.power)).toFixed(1)}× la nôtre`);
  if (n.geo.neighbors[id] !== undefined) bits.push('voisin');
  if (rel) {
    bits.push(`opinion ${Math.round(rel.opinion)}`);
    if (rel.atWar) bits.push('EN GUERRE avec nous');
    if (rel.defense_pact >= 0) bits.push('pacte de défense');
    if (rel.non_aggression >= 0) bits.push('pacte de non-agression');
    if (rel.trade >= 0) bits.push('accord commercial');
    const d = n.id < id ? 0 : 1;
    if (rel.sanctions[d]) bits.push('nous le sanctionnons');
    if (rel.sanctions[1 - d]) bits.push('il nous sanctionne');
    if (rel.claims[d]) bits.push('nous revendiquons son territoire');
    if (rel.claims[1 - d]) bits.push('il revendique notre territoire');
    if (rel.truceUntil > world.tick) bits.push('trêve en cours');
  }
  if (o.mil.mobilization > 0.2) bits.push('mobilise');
  if (warsOf(world, id).length && !rel?.atWar) bits.push('en guerre ailleurs');
  const f = n.mind.attitudes[id];
  if (f && Math.abs(f) >= 15) bits.push(f > 0 ? 'nous lui sommes reconnaissants' : 'nous lui gardons rancune');
  return `- ${o.name} : ${bits.join(', ')}`;
}

export function buildContext(world: World, n: Nation, sit: Situation, options: Option[]): string {
  const g = goals(n, sit.prefs, sit.around);
  const relevant = relevantNations(world, n, 6);
  for (const o of options) if (o.target !== null && !relevant.includes(o.target)) relevant.push(o.target);
  const top = <T extends string>(rec: Record<T, number>, fr: Record<string, string>, k: number) =>
    (Object.entries(rec) as [T, number][]).sort((a, b) => b[1] - a[1]).slice(0, k).map(([key, v]) => `${fr[key]} ${v}`).join(', ');
  const low = (Object.entries(sit.prefs) as [string, number][]).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([k, v]) => `${PREF_FR[k]} ${v}`).join(', ');

  const lines: string[] = [];
  lines.push(`DATE : ${formatDate(world)}`, '', `NATION : ${n.name} (capitale ${n.capitalName}), ${STATUS_FR[n.status]}`);
  lines.push(`Dirigeant : ${n.leader.name}, ${TRAIT_FR[n.leader.trait]}`, '', 'BACKGROUND :', `${background(world, n, sit.around).join('. ')}.`);
  if (n.mind.historical.length) lines.push(...n.mind.historical.slice(-4));
  lines.push('', `OBJECTIFS : ${top(g, GOAL_FR, 5)}`, `PENCHANTS FORTS : ${top(sit.prefs, PREF_FR, 4)}`, `PENCHANTS FAIBLES : ${low}`);

  lines.push('', 'SITUATION :');
  lines.push(`Population ${people(n.pop)}, PIB ${money(n.gdp)} (${Math.round(gdpPerCapita(n))} $/hab, croissance ${(n.gdpGrowth * 100).toFixed(1)} %/an), technologie ${n.tech.toFixed(0)}/120, IDH ${n.hdi.toFixed(2)}.`);
  lines.push(`Trésor ${money(n.treasury)}, dette ${(100 * n.debt / Math.max(1e-6, n.gdp)).toFixed(0)} % du PIB, impôts ${(n.taxRate * 100).toFixed(0)} %, stabilité ${n.stability.toFixed(0)}/100.`);
  lines.push(`Armée ${people(n.mil.personnel)} soldats, mobilisation ${(n.mil.mobilization * 100).toFixed(0)} %, doctrine ${n.mil.doctrine}, budget militaire ${(n.budget.military * 100).toFixed(0)} % des dépenses.`);
  if (n.blockaded) lines.push('Nos ports sont sous blocus.');
  if (n.overextension > 0.1) lines.push('Nos conquêtes récentes sont difficiles à tenir.');
  for (const w of warsOf(world, n.id)) {
    const s = sideOf(w, n.id)!;
    const edge = w.score * (s === 'attackers' ? 1 : -1);
    lines.push(`GUERRE contre ${w[other(s)].map((id) => world.nations[id].name).join(', ')} depuis ${Math.round((world.tick - w.start) / 12 * 10) / 10} an(s) : ${edge > 15 ? 'nous avons l\'avantage' : edge < -15 ? 'nous perdons du terrain' : 'front indécis'}, posture ${w.stance[n.id] === 'offensive' ? 'offensive' : 'défensive'}, usure de guerre ${n.warExhaustion.toFixed(0)}/150.`);
  }
  if (sit.around.mainThreat >= 0 && sit.around.threat > 0.3) lines.push(`Menace principale : ${world.nations[sit.around.mainThreat].name} (niveau ${(sit.around.threat * 100).toFixed(0)} %).`);

  lines.push('', 'NATIONS QUI COMPTENT :', ...relevant.map((id) => describeRelation(world, n, id)));
  const memories = recall(world, n, relevant);
  if (memories.length) lines.push('', 'HISTORIQUE :', ...memories.map((m) => `- ${m}`));
  lines.push('', 'OPTIONS :');
  options.forEach((o, i) => lines.push(`${i + 1}. action="${o.id}"${o.target !== null ? ` target="${world.nations[o.target].name}"` : ' target=null'} — ${o.label}`));
  return lines.join('\n');
}

/** Schéma JSON de la réponse, limité aux options réellement proposées. */
export function decisionSchema(world: World, options: Option[]): Record<string, unknown> {
  const names = [...new Set(options.filter((o) => o.target !== null).map((o) => world.nations[o.target!].name))];
  return {
    type: 'object', additionalProperties: false, required: ['action', 'target', 'priority', 'key_factors'],
    properties: {
      action: { type: 'string', enum: [...new Set(options.map((o) => o.id))] },
      target: names.length ? { anyOf: [{ type: 'string', enum: names }, { type: 'null' }] } : { type: 'null' },
      priority: { type: 'number', minimum: 0, maximum: 1 },
      key_factors: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', maxLength: 160 } },
    },
  };
}
