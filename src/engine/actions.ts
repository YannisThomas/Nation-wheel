// Pipeline proposer → valider → appliquer. Un agent (LLM ou comportemental)
// ne fait que proposer ; seul ce module modifie l'état, et seulement après
// validation. Toute entrée malformée est refusée avec un motif.

import { addProposal, breakTreaty, dir, getRel, peekRel, shiftOpinion, signTreaty, TREATY_LABEL } from './diplomacy';
import { redrawDoctrine } from './doctrine';
import { addJournal } from './journal';
import { neighborTable, OCEAN } from './map';
import { clamp } from './rng';
import { TECH_MAX, UNIT_COST } from './systems';
import { canReach, declareWar, endWar, joinWar, leaveWar, other, sideOf, transferCell, warBetween, warsOf } from './war';
import { BUDGET_SECTORS, TREATY_KINDS, type Action, type ActionResult, type Nation, type PeaceTerms, type World } from './types';

const DOCTRINES = ['defensive', 'balanced', 'offensive', 'naval', 'guerrilla'];
const MAX_OUTGOING = 4;

function checkTarget(world: World, n: Nation, target: unknown): string | null {
  const t = world.nations[target as number];
  if (!t || typeof target !== 'number') return 'cible inconnue';
  if (!t.alive) return 'cible disparue';
  if (t.id === n.id) return 'cible invalide';
  return null;
}

function checkTerms(world: World, terms: PeaceTerms | undefined, from: Nation, to: Nation): string | null {
  if (!terms || (terms.deal !== 'white' && terms.deal !== 'status_quo')) return 'termes de paix invalides';
  const r = terms.reparations ?? 0;
  if (!num(r)) return 'réparations invalides';
  const payer = r > 0 ? to : from;
  if (Math.abs(r) > 0.2 * payer.gdp) return 'réparations supérieures à 20 % du PIB du payeur';
  return null;
}

/** Cellules libres adjacentes au territoire (jusqu'à `max`). */
export function freeAdjacentCells(world: World, id: number, max = 3): number[] {
  const { map } = world;
  const nb = neighborTable(map.width, map.height);
  const out: number[] = [];
  for (let i = 0; i < map.owner.length && out.length < max; i++) {
    if (map.owner[i] !== -1 || map.terrain[i] === OCEAN) continue;
    for (let k = 0; k < 6; k++) {
      const j = nb[i * 6 + k];
      if (j >= 0 && map.owner[j] === id) { out.push(i); break; }
    }
  }
  return out;
}

export const colonizationCost = (n: Nation) => 0.004 * n.gdp;

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Capacité d'emprunt restante : la dette ne peut pas dépasser 150 % du PIB par action volontaire. */
export const borrowingCapacity = (n: Nation) => Math.max(0, 1.5 * n.gdp - n.debt);

export function validateAction(world: World, a: Action): string | null {
  if (!a || typeof a !== 'object') return 'action malformée';
  const n = world.nations[a.nation];
  if (!n) return 'nation inconnue';
  if (!n.alive) return 'nation disparue';
  if (n.overlord >= 0) {
    if (a.type === 'declare_war') return 'un État sous tutelle ne peut pas déclarer la guerre';
    if (n.colony && (a.type === 'press_claim' || a.type === 'threaten' || a.type === 'sanction' || (a.type === 'propose' && a.kind === 'defense_pact'))) return 'une colonie ne mène pas sa propre politique étrangère';
  }
  switch (a.type) {
    case 'set_budget': {
      if (!a.budget || typeof a.budget !== 'object') return 'budget manquant';
      let sum = 0;
      for (const k of BUDGET_SECTORS) {
        const v = a.budget[k];
        if (!num(v) || v < 0) return `part invalide : ${k}`;
        sum += v;
      }
      if (sum <= 0) return 'budget nul';
      for (const k of BUDGET_SECTORS) if (a.budget[k] / sum > 0.7) return `part excessive : ${k}`;
      return null;
    }
    case 'set_tax':
      if (!num(a.rate) || a.rate < 0.05 || a.rate > 0.6) return 'taux hors bornes (0,05–0,60)';
      if (Math.abs(a.rate - n.taxRate) > 0.05 + 1e-9) return 'variation maximale de 5 points par décision';
      return null;
    case 'invest':
      if (!BUDGET_SECTORS.includes(a.sector)) return 'secteur inconnu';
      if (!num(a.amount) || a.amount <= 0) return 'montant invalide';
      if (a.amount > 0.1 * n.gdp) return 'montant supérieur à 10 % du PIB';
      if (a.amount > n.treasury + borrowingCapacity(n)) return 'financement insuffisant';
      return null;
    case 'mobilize':
      if (!num(a.level) || a.level < 0 || a.level > 1) return 'niveau hors bornes (0–1)';
      if (Math.abs(a.level - n.mil.mobilization) > 0.25 + 1e-9) return 'variation maximale de 0,25 par décision';
      return null;
    case 'research':
      if (!num(a.militaryShare) || a.militaryShare < 0 || a.militaryShare > 0.8) return 'part militaire hors bornes (0–0,8)';
      return null;
    case 'set_doctrine':
      if (!DOCTRINES.includes(a.doctrine)) return 'doctrine inconnue';
      if (a.doctrine === 'naval' && n.geo.landlocked) return 'doctrine navale impossible sans accès à la mer';
      return null;
    case 'claim_land': {
      if (n.geo.freeAdjacent <= 0) return 'aucune terre libre adjacente';
      if (Math.min(3, n.geo.freeAdjacent) * colonizationCost(n) > n.treasury + borrowingCapacity(n)) return 'financement insuffisant';
      return null;
    }
    case 'propose': {
      const err = checkTarget(world, n, a.target);
      if (err) return err;
      const t = world.nations[a.target];
      if (world.proposals.filter((p) => p.from === n.id).length >= MAX_OUTGOING) return 'trop de propositions en attente';
      if (world.proposals.some((p) => p.from === n.id && p.to === t.id && p.kind === a.kind)) return 'proposition identique déjà en attente';
      const war = warBetween(world, n.id, t.id);
      if (a.kind === 'peace') return war ? checkTerms(world, a.terms, n, t) : 'pas de guerre entre ces nations';
      if (!TREATY_KINDS.includes(a.kind)) return 'type de proposition inconnu';
      if (war) return 'impossible en temps de guerre';
      const rel = getRel(world, n.id, t.id);
      if (rel[a.kind] >= 0) return 'traité déjà en vigueur';
      if (rel.sanctions[0] || rel.sanctions[1]) return 'sanctions en cours entre ces nations';
      return null;
    }
    case 'respond': {
      const p = world.proposals.find((x) => x.id === a.proposal);
      if (!p || p.to !== n.id) return 'proposition introuvable';
      if (a.answer === 'accept' || a.answer === 'reject') return null;
      if (a.answer !== 'counter') return 'réponse inconnue';
      if (p.kind === 'call_to_arms') return "un appel aux armes ne se négocie pas";
      if (p.kind === 'peace') return checkTerms(world, a.terms, n, world.nations[p.from]);
      if (!a.kind || !TREATY_KINDS.includes(a.kind) || a.kind === p.kind) return 'contre-proposition invalide';
      if (getRel(world, n.id, p.from)[a.kind] >= 0) return 'traité déjà en vigueur';
      return null;
    }
    case 'break_treaty': {
      const err = checkTarget(world, n, a.target);
      if (err) return err;
      if (!TREATY_KINDS.includes(a.kind)) return 'traité inconnu';
      return (peekRel(world, n.id, a.target)?.[a.kind] ?? -1) >= 0 ? null : 'aucun traité de ce type';
    }
    case 'sanction': {
      const err = checkTarget(world, n, a.target);
      if (err) return err;
      if (typeof a.on !== 'boolean') return 'paramètre invalide';
      const rel = getRel(world, n.id, a.target);
      if (rel.sanctions[dir(n.id, a.target)] === a.on) return a.on ? 'sanctions déjà en place' : 'aucune sanction à lever';
      if (a.on && rel.defense_pact >= 0) return 'impossible contre un allié';
      return null;
    }
    case 'threaten': {
      const err = checkTarget(world, n, a.target);
      if (err) return err;
      if (warBetween(world, n.id, a.target)) return 'déjà en guerre';
      return canReach(n, world.nations[a.target]) ? null : 'cible hors de portée';
    }
    case 'send_aid': {
      const err = checkTarget(world, n, a.target);
      if (err) return err;
      if (!num(a.amount) || a.amount <= 0) return 'montant invalide';
      if (a.amount > n.treasury) return 'trésor insuffisant';
      if (a.amount > 0.02 * n.gdp) return 'montant supérieur à 2 % du PIB';
      return warBetween(world, n.id, a.target) ? 'impossible envers un ennemi' : null;
    }
    case 'press_claim': {
      const err = checkTarget(world, n, a.target);
      if (err) return err;
      if (n.geo.neighbors[a.target] === undefined) return 'pas de frontière commune';
      const rel = getRel(world, n.id, a.target);
      if (rel.claims[dir(n.id, a.target)]) return 'revendication déjà posée';
      return rel.defense_pact >= 0 ? 'impossible contre un allié' : null;
    }
    case 'declare_war': {
      const err = checkTarget(world, n, a.target);
      if (err) return err;
      const t = world.nations[a.target];
      if (warBetween(world, n.id, t.id)) return 'déjà en guerre';
      if (t.overlord === n.id) return 'cible déjà sous notre tutelle';
      const rel = getRel(world, n.id, t.id);
      if (rel.truceUntil > world.tick) return 'trêve en cours';
      if (rel.non_aggression >= 0) return 'pacte de non-agression en vigueur';
      if (rel.defense_pact >= 0) return 'pacte de défense en vigueur';
      if (!canReach(n, t)) return 'cible hors de portée';
      if (n.warExhaustion > 60) return 'nation trop épuisée par la guerre';
      return null;
    }
    case 'declare_independence':
      if (n.overlord < 0) return 'nation déjà souveraine';
      return warsOf(world, n.id).length ? 'impossible en pleine guerre' : null;
    case 'set_stance':
      if (a.stance !== 'offensive' && a.stance !== 'defensive') return 'posture inconnue';
      return warsOf(world, n.id).length ? null : "la nation n'est pas en guerre";
    default:
      return "type d'action inconnu";
  }
}

function acceptPeace(world: World, from: number, to: number, terms: PeaceTerms): void {
  const war = warBetween(world, from, to);
  if (!war) return;
  const r = terms.reparations ?? 0;
  if (r !== 0) {
    const payer = world.nations[r > 0 ? to : from];
    const payee = world.nations[r > 0 ? from : to];
    const amount = Math.abs(r);
    const cash = Math.min(payer.treasury, amount);
    payer.treasury -= cash;
    payer.debt += amount - cash;
    payee.treasury += amount;
  }
  const leaders = (id: number) => war[sideOf(war, id)!][0] === id;
  if (leaders(from) && leaders(to)) endWar(world, war, terms.deal);
  else leaveWar(world, war, leaders(from) ? to : from, terms.deal);
}

function apply(world: World, a: Action): Record<string, number> {
  const n = world.nations[a.nation];
  switch (a.type) {
    case 'set_budget': {
      const sum = BUDGET_SECTORS.reduce((s, k) => s + a.budget[k], 0);
      const welfareBefore = n.budget.welfare;
      for (const k of BUDGET_SECTORS) n.budget[k] = a.budget[k] / sum;
      // Couper dans les dépenses sociales a un coût politique immédiat.
      const cut = Math.max(0, welfareBefore - n.budget.welfare);
      const stability = -Math.round(cut * 40 * 10) / 10;
      n.stability = clamp(n.stability + stability, 0, 100);
      return { stability };
    }
    case 'set_tax': {
      const delta = a.rate - n.taxRate;
      n.taxRate = a.rate;
      const stability = delta > 0 ? -delta * 100 * 0.6 : -delta * 100 * 0.3;
      n.stability = clamp(n.stability + stability, 0, 100);
      return { taxRate: a.rate, stability };
    }
    case 'invest': {
      const fromTreasury = Math.min(n.treasury, a.amount);
      n.treasury -= fromTreasury;
      n.debt += a.amount - fromTreasury;
      const intensity = (100 * a.amount) / n.gdp;
      const effects: Record<string, number> = { treasury: -fromTreasury, debt: a.amount - fromTreasury };
      const raise = (key: 'infrastructure' | 'industry' | 'education' | 'health', k: number) => {
        const gain = intensity * k * (1 - n[key] / 100);
        n[key] = clamp(n[key] + gain, 1, 100);
        effects[key] = gain;
      };
      if (a.sector === 'infrastructure') raise('infrastructure', 0.6);
      else if (a.sector === 'industry') raise('industry', 0.6);
      else if (a.sector === 'education') raise('education', 0.3);
      else if (a.sector === 'welfare') raise('health', 0.3);
      else if (a.sector === 'research') {
        const gain = intensity * 0.12 * (1 - n.tech / TECH_MAX);
        n.tech = clamp(n.tech + gain, 0, TECH_MAX);
        effects.tech = gain;
      } else {
        const points = a.amount / (UNIT_COST * (1 + n.mil.tech / 100));
        n.mil.army += points;
        effects.equipment = points;
      }
      return effects;
    }
    case 'mobilize': {
      const delta = a.level - n.mil.mobilization;
      n.mil.mobilization = a.level;
      const stability = delta > 0 ? -delta * 12 : 0;
      n.stability = clamp(n.stability + stability, 0, 100);
      return { mobilization: a.level, stability };
    }
    case 'research':
      n.militaryResearchShare = a.militaryShare;
      return { militaryResearchShare: a.militaryShare };
    case 'set_doctrine':
      n.mil.doctrine = a.doctrine;
      return {};
    case 'claim_land': {
      const cells = freeAdjacentCells(world, n.id);
      const cost = cells.length * colonizationCost(n);
      const cash = Math.min(n.treasury, cost);
      n.treasury -= cash;
      n.debt += cost - cash;
      for (const c of cells) transferCell(world, c, n.id, false);
      n.geo.freeAdjacent = Math.max(0, n.geo.freeAdjacent - cells.length);
      if (cells.length) addJournal(world, 'colonized', [n.id], `${n.name} étend son territoire sur des terres libres.`);
      return { cells: cells.length, cost };
    }
    case 'propose': {
      const p = addProposal(world, { from: n.id, to: a.target, kind: a.kind, ...(a.kind === 'peace' ? { terms: a.terms, war: warBetween(world, n.id, a.target)!.id } : {}) });
      return { proposal: p.id };
    }
    case 'respond': {
      const p = world.proposals.find((x) => x.id === a.proposal)!;
      world.proposals = world.proposals.filter((x) => x !== p);
      const from = world.nations[p.from];
      from.mind.urgency = Math.max(from.mind.urgency, 0.4);
      if (a.answer === 'counter') {
        const c = addProposal(world, { from: n.id, to: p.from, kind: p.kind === 'peace' ? 'peace' : a.kind!, counterOf: p.id, ...(p.kind === 'peace' ? { terms: a.terms, war: p.war } : {}) });
        return { counter: c.id };
      }
      if (a.answer === 'reject') {
        if (p.kind === 'call_to_arms') breakTreaty(world, n.id, p.from, 'defense_pact', true);
        else if (p.kind !== 'peace') shiftOpinion(world, n.id, p.from, -3);
        addJournal(world, 'refusal', [n.id, p.from], `${n.name} rejette la proposition de ${from.name} (${p.kind === 'peace' ? 'paix' : p.kind === 'call_to_arms' ? 'appel aux armes' : TREATY_LABEL[p.kind]}).`, false, { kind: p.kind });
        return { accepted: 0 };
      }
      if (p.kind === 'peace') acceptPeace(world, p.from, n.id, p.terms!);
      else if (p.kind === 'call_to_arms') {
        const war = world.wars.find((w) => w.id === p.war);
        const side = war && sideOf(war, p.from);
        if (war && side) joinWar(world, war, n.id, side);
      } else if (!warBetween(world, n.id, p.from)) signTreaty(world, p.from, n.id, p.kind);
      return { accepted: 1 };
    }
    case 'break_treaty': {
      const ally = world.nations[a.target];
      const abandoned = a.kind === 'defense_pact' && warsOf(world, ally.id).some((w) => sideOf(w, ally.id) === 'defenders');
      breakTreaty(world, n.id, a.target, a.kind, abandoned);
      return {};
    }
    case 'sanction': {
      const rel = getRel(world, n.id, a.target);
      rel.sanctions[dir(n.id, a.target)] = a.on;
      const t = world.nations[a.target];
      if (a.on) { rel.trade = -1; rel.opinion = clamp(rel.opinion - 15, -100, 100); }
      addJournal(world, a.on ? 'sanction' : 'sanction_lifted', [n.id, t.id], a.on ? `${n.name} impose des sanctions à ${t.name}.` : `${n.name} lève ses sanctions contre ${t.name}.`);
      t.mind.urgency = Math.max(t.mind.urgency, 0.5);
      return {};
    }
    case 'threaten': {
      const t = world.nations[a.target];
      shiftOpinion(world, n.id, t.id, -10);
      const ratio = n.mil.power / Math.max(1, t.mil.power);
      const stability = ratio > 3 ? -2 : 0;
      t.stability = clamp(t.stability + stability, 0, 100);
      n.infamy = clamp(n.infamy + 1, 0, 100);
      t.mind.urgency = Math.max(t.mind.urgency, 0.8);
      addJournal(world, 'threat', [n.id, t.id], `${n.name} menace ${t.name}.`);
      return { targetStability: stability };
    }
    case 'send_aid': {
      const t = world.nations[a.target];
      n.treasury -= a.amount;
      t.treasury += a.amount;
      const opinion = Math.min(25, (300 * a.amount) / Math.max(1e-6, t.gdp));
      shiftOpinion(world, n.id, t.id, opinion);
      addJournal(world, 'aid', [n.id, t.id], `${n.name} accorde une aide économique à ${t.name}.`, false, { amount: Math.round(a.amount * 100) / 100 });
      return { treasury: -a.amount, opinion };
    }
    case 'press_claim': {
      const rel = getRel(world, n.id, a.target);
      rel.claims[dir(n.id, a.target)] = true;
      rel.opinion = clamp(rel.opinion - 15, -100, 100);
      const t = world.nations[a.target];
      t.mind.urgency = Math.max(t.mind.urgency, 0.7);
      addJournal(world, 'claim', [n.id, t.id], `${n.name} revendique des territoires de ${t.name}.`);
      return {};
    }
    case 'declare_war': {
      const war = declareWar(world, n.id, a.target);
      return { war: war.id };
    }
    case 'set_stance':
      for (const w of warsOf(world, n.id)) w.stance[n.id] = a.stance;
      return {};
    case 'declare_independence': {
      const lord = world.nations[n.overlord];
      // Une métropole occupée ailleurs, instable ou à peine plus forte laisse partir ; sinon elle réprime.
      const lets = warsOf(world, lord.id).length > 0 || lord.stability < 35 || lord.mil.power < 1.5 * n.mil.power;
      n.overlord = -1;
      n.colony = false;
      redrawDoctrine(world, n);
      n.stability = clamp(n.stability + 10, 0, 100);
      shiftOpinion(world, n.id, lord.id, -20);
      lord.mind.urgency = 1;
      addJournal(world, 'independence', [n.id, lord.id], `${n.name} proclame son indépendance de ${lord.name}.`);
      if (!lets && validateAction(world, { type: 'declare_war', nation: lord.id, target: n.id }) === null) declareWar(world, lord.id, n.id);
      return { war: lets ? 0 : 1 };
    }
  }
}

export function executeAction(world: World, a: Action): ActionResult {
  let reason: string | null;
  try {
    reason = validateAction(world, a);
  } catch {
    reason = 'action malformée';
  }
  if (reason) return { action: a, ok: false, reason };
  return { action: a, ok: true, effects: apply(world, a) };
}
