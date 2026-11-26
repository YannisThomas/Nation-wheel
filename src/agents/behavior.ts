// Moteur comportemental classique : note chaque option selon la personnalité
// et la situation. Il sert de repli quand le LLM est indisponible, traite les
// décisions mineures et présélectionne les options montrées au LLM.

import { partnersOf, peekRel } from '../engine/diplomacy';
import { rand } from '../engine/rng';
import { sideOf, warBetween, warsOf, other } from '../engine/war';
import type { Nation, Preferences, World } from '../engine/types';
import type { Option } from './options';
import type { Surroundings } from './profile';

export interface Situation {
  prefs: Preferences;
  around: Surroundings;
}

const terrainDefense = (n: Nation) => 1 + 0.5 * n.geo.terrain.mountain + 0.25 * n.geo.terrain.hills + 0.15 * n.geo.terrain.forest;

function allies(world: World, id: number): number {
  let sum = 0;
  for (const o of partnersOf(world, id)) if (world.nations[o].alive && (peekRel(world, id, o)?.defense_pact ?? -1) >= 0) sum += world.nations[o].mil.power;
  return sum;
}

const pacts = (world: World, id: number) => {
  let c = 0;
  for (const o of partnersOf(world, id)) if (world.nations[o].alive && (peekRel(world, id, o)?.defense_pact ?? -1) >= 0) c++;
  return c;
};

/** Rapport de forces estimé si n attaquait t (alliés défensifs de t compris). */
export const powerRatio = (world: World, n: Nation, t: Nation) =>
  n.mil.power / Math.max(1, t.mil.power * terrainDefense(t) * 1.25 + 0.6 * allies(world, t.id));

export function scoreOption(world: World, n: Nation, o: Option, sit: Situation): number {
  const P = Object.fromEntries(Object.entries(sit.prefs).map(([k, v]) => [k, v / 100])) as Preferences;
  const { threat } = sit.around;
  const debt = n.debt / Math.max(1e-6, n.gdp);
  const wars = warsOf(world, n.id);
  const atWar = wars.length > 0;
  const t = o.target !== null ? world.nations[o.target] : null;
  const rel = t ? peekRel(world, n.id, t.id) : undefined;
  const opinion = rel?.opinion ?? 0;
  const feeling = t ? n.mind.attitudes[t.id] ?? 0 : 0;
  const ratio = t ? n.mil.power / Math.max(1, t.mil.power) : 1;
  const war = t ? warBetween(world, n.id, t.id) : undefined;
  // Avantage dans la guerre contre t, du point de vue de n (-100..100).
  const edge = war ? war.score * (sideOf(war, n.id) === 'attackers' ? 1 : -1) : 0;
  const ex = n.warExhaustion;

  switch (o.id) {
    case 'wait': return 30;
    case 'invest_infrastructure': case 'invest_industry': return 22 + 40 * P.industry - 45 * debt - (atWar ? 15 : 0);
    case 'invest_education': case 'invest_research': return 22 + 40 * P.science - 45 * debt - (atWar ? 15 : 0);
    case 'invest_welfare': return 18 + 35 * P.welfare + Math.max(0, 50 - n.stability) * 0.8 - 30 * debt;
    case 'invest_military': return 10 + 30 * P.defense * threat + (atWar ? 35 : 0) + 15 * P.offensive - 20 * debt;
    case 'budget_science': return 18 + 45 * P.science - 30 * threat - (atWar ? 30 : 0);
    case 'budget_military': return 5 + 55 * Math.max(threat, P.offensive * 0.5) + (atWar ? 35 : 0);
    case 'budget_welfare': return 12 + 40 * P.welfare + (n.stability < 40 ? 25 : 0) - (atWar ? 20 : 0);
    case 'budget_growth': return 18 + 40 * P.industry - 25 * threat - (atWar ? 25 : 0);
    case 'budget_balanced': return !atWar && threat < 0.3 && n.budget.military > 0.28 ? 55 : 20;
    case 'raise_taxes': return (debt > 0.8 ? 45 : atWar ? 30 : 8) - Math.max(0, n.taxRate - 0.3) * 200 - Math.max(0, 45 - n.stability);
    case 'lower_taxes': return n.taxRate > 0.3 && n.stability < 45 && debt < 0.5 ? 42 : 8;
    case 'research_military': return 10 + 30 * P.offensive + 30 * threat + (atWar ? 15 : 0);
    case 'research_civil': return !atWar && threat < 0.3 ? 25 + 25 * P.science : 5;
    case 'mobilize': return atWar ? (n.mil.mobilization < 0.6 ? 62 - ex * 0.2 : 20) : threat > 0.6 && n.mil.mobilization < 0.2 && n.stability > 40 ? 20 + 40 * threat : 0;
    case 'demobilize': return atWar ? (ex > 90 ? 40 : 0) : 75 - 45 * threat + (n.stability < 40 ? 25 : 0) + 30 * n.mil.mobilization;
    case 'expand_territory': return 28 + 45 * P.expansion - 40 * debt - (atWar ? 25 : 0);
    case 'go_offensive': { const e = wars[0][other(sideOf(wars[0], n.id)!)][0]; return powerRatio(world, n, world.nations[e]) > 0.9 ? 55 + 20 * P.offensive : 10; }
    case 'go_defensive': { const e = wars[0][other(sideOf(wars[0], n.id)!)][0]; return powerRatio(world, n, world.nations[e]) < 0.6 || ex > 70 ? 60 : 8; }
    case 'propose_peace_white': return 12 + ex * 0.6 + (edge < -10 ? 25 : edge > 10 ? -25 : 0) - 10 * P.risk;
    case 'propose_peace_status_quo': return edge > 10 ? 20 + ex * 0.6 + edge * 0.3 : ex > 80 ? 45 : 0;
    case 'accept_peace': {
      const p = world.proposals.find((x) => x.to === n.id && x.from === t!.id && x.kind === 'peace');
      const terms = p?.terms ?? { deal: 'white' };
      // Du point de vue du destinataire : des réparations positives sont à sa charge.
      const money = (-(terms.reparations ?? 0) / Math.max(1e-6, n.gdp)) * 300;
      const base = terms.deal === 'white' ? (edge < 5 || ex > 40 ? 68 : 30 + ex * 0.4) : edge < -10 ? (ex > 55 ? 62 : 25 + ex * 0.4) : 72;
      return base + money;
    }
    case 'reject_peace': return 40;
    case 'counter_peace': return edge < -10 && ex < 60 ? 46 : edge > 15 ? 44 : 25;
    case 'propose_trade': return 22 + 35 * P.trade + opinion * 0.3 + feeling * 0.1;
    case 'accept_trade': return 35 + 30 * P.trade + opinion * 0.4 + feeling * 0.15;
    case 'reject_trade': return 35 - opinion * 0.2;
    case 'propose_non_aggression': return 12 + 25 * P.diplomacy + (ratio < 0.7 ? 25 : 0) + opinion * 0.1 - 20 * P.offensive * (ratio > 1.5 ? 1 : 0);
    case 'accept_non_aggression': return 42 + opinion * 0.3 + (ratio < 0.8 ? 20 : 0) - (rel?.claims[n.id < t!.id ? 0 : 1] ? 30 * P.offensive + 10 : 0);
    case 'reject_non_aggression': return 36;
    case 'propose_defense_pact': return opinion < 30 ? 0 : -8 + 25 * P.diplomacy + 45 * threat + opinion * 0.35 + feeling * 0.15 - 9 * pacts(world, n.id) - (warsOf(world, t!.id).length ? 20 * (1 - P.risk) : 0);
    case 'accept_defense_pact': return 8 + opinion * 0.5 + 35 * threat + 20 * P.diplomacy + feeling * 0.2 - 9 * pacts(world, n.id) - (warsOf(world, t!.id).length ? 25 : 0);
    case 'reject_defense_pact': return 36;
    case 'counter_with_non_aggression': return opinion > -10 && opinion < 35 ? 40 : 20;
    case 'accept_call_to_arms': {
      const p = world.proposals.find((x) => x.to === n.id && x.from === t!.id && x.kind === 'call_to_arms');
      const w = world.wars.find((x) => x.id === p?.war);
      const enemy = w ? world.nations[w.attackers[0]] : null;
      const danger = enemy && enemy.mil.power > 2 * n.mil.power ? 30 : 0;
      return 48 + opinion * 0.4 + feeling * 0.2 + 20 * P.risk - danger - ex * 0.5 - (n.leader.trait === 'schemer' ? 15 : 0);
    }
    case 'reject_call_to_arms': return 35;
    case 'impose_sanctions': return opinion < -40 ? 15 + (-opinion - 40) * 0.6 - feeling * 0.2 - 15 * P.trade : 0;
    case 'lift_sanctions': return opinion > -10 ? 45 : 5;
    case 'threaten': return opinion < -10 && ratio > 1.3 ? -10 + 40 * P.offensive + 20 * P.risk + (ratio > 2 ? 15 : 0) - opinion * 0.3 : 0;
    case 'send_aid': return opinion > 40 && n.treasury > 0.03 * n.gdp ? 12 + 30 * P.diplomacy + feeling * 0.15 + (warsOf(world, t!.id).length ? 15 : 0) : 0;
    case 'press_claim': return 2 + 45 * P.expansion + 20 * P.offensive - opinion * 0.3 + (ratio > 1.5 ? 10 : -25) - (atWar ? 30 : 0) - n.infamy * 0.5;
    case 'declare_war': {
      const r = powerRatio(world, n, t!);
      const claim = rel?.claims[n.id < t!.id ? 0 : 1] ? 15 : 0;
      return -55 + 60 * P.offensive + 25 * P.expansion + 20 * P.risk + 35 * Math.max(-1, Math.min(1.5, r - 1)) - opinion * 0.3 - feeling * 0.2 + claim
        - (n.stability < 40 ? 30 : 0) - 15 * debt - 0.5 * n.infamy - (atWar ? 45 : 0) - 80 * n.overextension;
    }
    case 'break_defense_pact': case 'break_non_aggression': return opinion < -35 ? 38 : 5;
    default: return 0;
  }
}

export interface Ranked { option: Option; score: number }

/** Classe les options ; un léger bruit déterministe évite les comportements mécaniques. */
export function rank(world: World, n: Nation, options: Option[], sit: Situation): Ranked[] {
  return options
    .map((option) => ({ option, score: scoreOption(world, n, option, sit) + (rand(world) - 0.5) * 8 }))
    .sort((a, b) => b.score - a.score);
}
