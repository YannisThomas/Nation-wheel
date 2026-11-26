// Pipeline proposer → valider → appliquer. Un agent (LLM ou comportemental)
// ne fait que proposer ; seul ce module modifie l'état, et seulement après
// validation. Toute entrée malformée est refusée avec un motif.

import { clamp } from './rng';
import { TECH_MAX, UNIT_COST } from './systems';
import { BUDGET_SECTORS, type Action, type ActionResult, type Nation, type World } from './types';

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Capacité d'emprunt restante : la dette ne peut pas dépasser 150 % du PIB par action volontaire. */
export const borrowingCapacity = (n: Nation) => Math.max(0, 1.5 * n.gdp - n.debt);

export function validateAction(world: World, a: Action): string | null {
  if (!a || typeof a !== 'object') return 'action malformée';
  const n = world.nations[a.nation];
  if (!n) return 'nation inconnue';
  if (!n.alive) return 'nation disparue';
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
    default:
      return "type d'action inconnu";
  }
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
