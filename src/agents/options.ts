// Options offertes à une nation : uniquement des actions que le moteur
// accepterait. Le LLM comme le moteur comportemental choisissent dans cette liste.

import { borrowingCapacity, validateAction } from '../engine/actions';
import { partnersOf, peekRel, TREATY_LABEL } from '../engine/diplomacy';
import { sideOf, warsOf, other } from '../engine/war';
import type { Action, Budget, Nation, Proposal, World } from '../engine/types';

export interface Option {
  /** Nom d'action stable, ex. « propose_defense_pact ». */
  id: string;
  target: number | null;
  label: string;
  action: Action | null;
}

export const optionKey = (o: Option) => (o.target === null ? o.id : `${o.id}@${o.target}`);

const PRESETS: Record<string, [string, Budget]> = {
  budget_science: ['Réorienter le budget vers la recherche et l\'éducation', { military: 0.1, research: 0.2, education: 0.22, infrastructure: 0.12, welfare: 0.28, industry: 0.08 }],
  budget_military: ['Réorienter le budget vers l\'armée', { military: 0.38, research: 0.06, education: 0.1, infrastructure: 0.1, welfare: 0.26, industry: 0.1 }],
  budget_welfare: ['Réorienter le budget vers le bien-être social', { military: 0.08, research: 0.05, education: 0.16, infrastructure: 0.11, welfare: 0.52, industry: 0.08 }],
  budget_growth: ['Réorienter le budget vers l\'industrie et les infrastructures', { military: 0.1, research: 0.08, education: 0.14, infrastructure: 0.22, welfare: 0.26, industry: 0.2 }],
  budget_balanced: ['Revenir à un budget équilibré', { military: 0.14, research: 0.08, education: 0.16, infrastructure: 0.14, welfare: 0.36, industry: 0.12 }],
};
const SECTORS = { infrastructure: 'les infrastructures', industry: 'l\'industrie', education: 'l\'éducation', welfare: 'la santé', research: 'la recherche', military: 'l\'équipement militaire' } as const;

const budgetDistance = (a: Budget, b: Budget) => (Object.keys(a) as (keyof Budget)[]).reduce((s, k) => s + Math.abs(a[k] - b[k]), 0);

let powersFor: World | null = null;
let powersTick = -1;
let powers: number[] = [];
function greatPowers(world: World): number[] {
  if (powersFor !== world || powersTick !== world.tick) {
    powers = world.nations.filter((o) => o.alive && (o.status === 'superpower' || o.status === 'great_power')).map((o) => o.id);
    powersFor = world; powersTick = world.tick;
  }
  return powers;
}

/** Nations qui comptent pour celle-ci : voisins, ennemis, partenaires, grandes puissances. */
export function relevantNations(world: World, n: Nation, max = 8): number[] {
  const score = new Map<number, number>();
  const bump = (id: number, v: number) => { if (id !== n.id && world.nations[id]?.alive) score.set(id, (score.get(id) ?? 0) + v); };
  for (const [id, len] of Object.entries(n.geo.neighbors)) bump(+id, 5 + Math.min(5, len / 3));
  for (const w of warsOf(world, n.id)) { const s = sideOf(w, n.id)!; for (const e of w[other(s)]) bump(e, 20); for (const a of w[s]) bump(a, 6); }
  for (const id of partnersOf(world, n.id)) {
    const rel = peekRel(world, n.id, id);
    if (rel && (rel.defense_pact >= 0 || rel.trade >= 0 || rel.non_aggression >= 0 || rel.sanctions[0] || rel.sanctions[1])) bump(id, 4);
  }
  for (const id of greatPowers(world)) bump(id, 2);
  for (const id in n.mind.attitudes) bump(+id, Math.abs(n.mind.attitudes[id]) / 25);
  return [...score.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, max).map(([id]) => id);
}

export function proposalOptions(world: World, n: Nation, p: Proposal): Option[] {
  const from = world.nations[p.from];
  const what = p.kind === 'peace' ? `paix (${p.terms!.deal === 'white' ? 'retour aux frontières d\'avant-guerre' : 'chacun garde ses positions'}${p.terms!.reparations ? `, réparations ${p.terms!.reparations > 0 ? 'à notre charge' : 'en notre faveur'} de ${Math.abs(p.terms!.reparations).toFixed(1)} Md$` : ''})`
    : p.kind === 'call_to_arms' ? 'appel aux armes au nom de notre pacte de défense' : TREATY_LABEL[p.kind];
  const out: Option[] = [
    { id: `accept_${p.kind}`, target: p.from, label: `Accepter la proposition de ${from.name} : ${what}`, action: { type: 'respond', nation: n.id, proposal: p.id, answer: 'accept' } },
    { id: `reject_${p.kind}`, target: p.from, label: `Refuser la proposition de ${from.name} : ${what}${p.kind === 'call_to_arms' ? ' (rompt le pacte, sera vu comme une trahison)' : ''}`, action: { type: 'respond', nation: n.id, proposal: p.id, answer: 'reject' } },
  ];
  if (p.kind === 'peace') {
    const deal = p.terms!.deal === 'white' ? 'status_quo' : 'white';
    out.push({ id: 'counter_peace', target: p.from, label: `Contre-proposer à ${from.name} une paix ${deal === 'white' ? 'avec retour aux frontières d\'avant-guerre' : 'où chacun garde ses positions'}, sans réparations`, action: { type: 'respond', nation: n.id, proposal: p.id, answer: 'counter', terms: { deal } } });
  } else if (p.kind === 'defense_pact') {
    out.push({ id: 'counter_with_non_aggression', target: p.from, label: `Contre-proposer à ${from.name} un simple pacte de non-agression`, action: { type: 'respond', nation: n.id, proposal: p.id, answer: 'counter', kind: 'non_aggression' } });
  }
  return out.filter((o) => validateAction(world, o.action!) === null);
}

export function proactiveOptions(world: World, n: Nation): Option[] {
  const out: Option[] = [];
  const add = (id: string, target: number | null, label: string, action: Action) => {
    if (target !== null && (n.mind.cooldowns[`${id}@${target}`] ?? 0) > world.tick) return;
    if (validateAction(world, action) === null) out.push({ id, target, label, action });
  };
  const me = n.id;

  // On n'emprunte pour investir que si la dette est encore légère.
  const amount = Math.min(0.02 * n.gdp, n.treasury + (n.debt < 0.4 * n.gdp ? 0.3 * borrowingCapacity(n) : 0));
  if (amount > 0.004 * n.gdp) {
    for (const [sector, name] of Object.entries(SECTORS)) add(`invest_${sector}`, null, `Investir ${amount.toFixed(1)} Md$ dans ${name}`, { type: 'invest', nation: me, sector: sector as keyof Budget, amount });
  }
  for (const [id, [label, budget]] of Object.entries(PRESETS)) if (budgetDistance(n.budget, budget) > 0.12) add(id, null, label, { type: 'set_budget', nation: me, budget });
  add('raise_taxes', null, `Augmenter les impôts (${(n.taxRate * 100).toFixed(0)} % → ${(n.taxRate * 100 + 3).toFixed(0)} %)`, { type: 'set_tax', nation: me, rate: n.taxRate + 0.03 });
  add('lower_taxes', null, `Baisser les impôts (${(n.taxRate * 100).toFixed(0)} % → ${(n.taxRate * 100 - 3).toFixed(0)} %)`, { type: 'set_tax', nation: me, rate: n.taxRate - 0.03 });
  if (n.militaryResearchShare < 0.45) add('research_military', null, 'Orienter la recherche vers le militaire', { type: 'research', nation: me, militaryShare: 0.5 });
  if (n.militaryResearchShare > 0.25) add('research_civil', null, 'Orienter la recherche vers le civil', { type: 'research', nation: me, militaryShare: 0.15 });
  if (n.mil.mobilization < 0.8) add('mobilize', null, 'Mobiliser davantage de troupes', { type: 'mobilize', nation: me, level: Math.min(1, n.mil.mobilization + 0.2) });
  if (n.mil.mobilization > 0) add('demobilize', null, 'Démobiliser une partie des troupes', { type: 'mobilize', nation: me, level: Math.max(0, n.mil.mobilization - 0.2) });
  if (n.overlord >= 0) add('declare_independence', null, `Proclamer l'indépendance vis-à-vis de ${world.nations[n.overlord].name} (risque de guerre si la métropole est forte et disponible)`, { type: 'declare_independence', nation: me });
  add('expand_territory', null, 'Coloniser les terres libres voisines', { type: 'claim_land', nation: me });

  const wars = warsOf(world, me);
  if (wars.length) {
    const stance = wars[0].stance[me];
    if (stance === 'defensive') add('go_offensive', null, 'Passer à l\'offensive', { type: 'set_stance', nation: me, stance: 'offensive' });
    else add('go_defensive', null, 'Se replier en posture défensive', { type: 'set_stance', nation: me, stance: 'defensive' });
    for (const w of wars) {
      const enemy = w[other(sideOf(w, me)!)][0];
      const name = world.nations[enemy].name;
      add('propose_peace_white', enemy, `Proposer à ${name} la paix avec retour aux frontières d'avant-guerre`, { type: 'propose', nation: me, target: enemy, kind: 'peace', terms: { deal: 'white' } });
      add('propose_peace_status_quo', enemy, `Proposer à ${name} la paix, chacun gardant ses positions`, { type: 'propose', nation: me, target: enemy, kind: 'peace', terms: { deal: 'status_quo' } });
    }
  }

  for (const t of relevantNations(world, n)) {
    const o = world.nations[t];
    const rel = peekRel(world, me, t);
    add('propose_trade', t, `Proposer un accord commercial à ${o.name}`, { type: 'propose', nation: me, target: t, kind: 'trade' });
    add('propose_non_aggression', t, `Proposer un pacte de non-agression à ${o.name}`, { type: 'propose', nation: me, target: t, kind: 'non_aggression' });
    add('propose_defense_pact', t, `Proposer un pacte de défense à ${o.name}`, { type: 'propose', nation: me, target: t, kind: 'defense_pact' });
    add('impose_sanctions', t, `Imposer des sanctions à ${o.name}`, { type: 'sanction', nation: me, target: t, on: true });
    add('lift_sanctions', t, `Lever les sanctions contre ${o.name}`, { type: 'sanction', nation: me, target: t, on: false });
    add('threaten', t, `Menacer ${o.name}`, { type: 'threaten', nation: me, target: t });
    add('send_aid', t, `Envoyer une aide économique à ${o.name}`, { type: 'send_aid', nation: me, target: t, amount: Math.min(n.treasury * 0.5, 0.01 * n.gdp) });
    add('press_claim', t, `Revendiquer des territoires de ${o.name}`, { type: 'press_claim', nation: me, target: t });
    add('declare_war', t, `Déclarer la guerre à ${o.name}`, { type: 'declare_war', nation: me, target: t });
    if (rel && rel.opinion < -20) {
      add('break_defense_pact', t, `Rompre le pacte de défense avec ${o.name}`, { type: 'break_treaty', nation: me, target: t, kind: 'defense_pact' });
      add('break_non_aggression', t, `Rompre le pacte de non-agression avec ${o.name}`, { type: 'break_treaty', nation: me, target: t, kind: 'non_aggression' });
    }
  }
  out.push({ id: 'wait', target: null, label: 'Ne rien changer et observer', action: null });
  return out;
}
