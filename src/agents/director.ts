// Système de décision : qui doit décider ce tick, avec quoi (moteur
// comportemental, cache ou LLM de quel niveau), et sous quel budget d'appels.

import { fnv1a, nationStateHash } from '../engine/hash';
import { pendingFor, peekRel } from '../engine/diplomacy';
import { clamp } from '../engine/rng';
import { warsOf } from '../engine/war';
import type { Action, ActionResult, Nation, Proposal, World } from '../engine/types';
import { rank, type Ranked, type Situation } from './behavior';
import { buildContext, decisionSchema, SYSTEM_PROMPT } from './context';
import { ingestJournal } from './memory';
import { optionKey, proactiveOptions, proposalOptions, type Option } from './options';
import { preferences, surroundings, PREF_FR } from './profile';

export type Tier = 'behavior' | 'fast' | 'national' | 'strategic';

export interface DecisionConfig {
  /** Seuils d'importance (0..1) à partir desquels on monte de niveau. */
  fastThreshold: number;
  nationalThreshold: number;
  strategicThreshold: number;
  maxLlmCallsPerTick: number;
  /** Nombre d'options montrées au LLM. */
  maxOptions: number;
  /** Durée de validité d'une décision en cache, en ticks. */
  cacheTtl: number;
}

export const DEFAULT_DECISION_CONFIG: DecisionConfig = {
  fastThreshold: 0.35, nationalThreshold: 0.6, strategicThreshold: 0.8, maxLlmCallsPerTick: 4, maxOptions: 10, cacheTtl: 120,
};

export interface Task {
  nation: Nation;
  kind: 'proactive' | 'response';
  proposal?: Proposal;
  sit: Situation;
  /** Options présélectionnées, de la mieux à la moins bien notée. */
  ranked: Ranked[];
  importance: number;
  tier: Tier;
  hash: string;
}

export interface LlmChoice {
  action: string;
  target: string | null;
  priority: number;
  key_factors: string[];
  model: string;
  /** Outils de consultation appelés avant de décider. */
  tools?: string[];
}

/** Ce que le directeur attend d'un LLM, quel que soit le fournisseur. */
export interface Chooser {
  choose(world: World, task: Task, request: { system: string; context: string; schema: Record<string, unknown> }): Promise<LlmChoice>;
}

/** Trace complète d'une décision, pour le panneau développeur. Pas de raisonnement interne. */
export interface DecisionRecord {
  tick: number;
  nation: number;
  kind: Task['kind'];
  importance: number;
  tier: Tier;
  source: 'behavior' | 'llm' | 'cache' | 'fallback';
  model?: string;
  context?: string;
  options: string[];
  chosen: string;
  label: string;
  keyFactors: string[];
  tools?: string[];
  /** Pourquoi le LLM n'a pas été utilisé ou a été écarté. */
  note?: string;
  validation?: string;
  effects?: Record<string, number>;
}

const WEIGHTY = /^(declare_war|propose_peace|accept_peace|reject_peace|counter_peace|accept_call_to_arms|reject_call_to_arms|break_|propose_defense_pact|accept_defense_pact|press_claim)/;

export class Director {
  stats = { decisions: 0, llm: 0, cache: 0, fallback: 0, behavior: 0 };
  constructor(public config: DecisionConfig = DEFAULT_DECISION_CONFIG, public chooser: Chooser | null = null) {}

  /** Liste les décisions à prendre ce tick. Met à jour les échéances des nations. */
  plan(world: World): Task[] {
    ingestJournal(world);
    const tasks: Task[] = [];
    for (const n of world.nations) {
      if (!n.alive) continue;
      const m = n.mind;
      const pending = pendingFor(world, n.id);
      const due = world.tick >= m.nextReview || m.urgency >= 0.6;
      if (!pending.length && !due) continue;
      const around = surroundings(world, n);
      const sit: Situation = { prefs: preferences(world, n, around), around };
      const atWar = warsOf(world, n.id).length > 0;

      for (const p of pending) {
        const ranked = rank(world, n, proposalOptions(world, n, p), sit);
        if (!ranked.length) continue;
        const importance = p.kind === 'peace' || p.kind === 'call_to_arms' ? 0.9 : p.kind === 'defense_pact' ? 0.7 : p.kind === 'non_aggression' ? 0.5 : 0.4;
        tasks.push(this.task(world, n, 'response', sit, ranked, importance, p));
      }
      if (due) {
        const urgency = m.urgency;
        m.urgency = 0;
        m.nextReview = world.tick + (atWar ? 2 : around.threat > 0.5 ? 4 : 6 + (n.id % 7));
        const ranked = rank(world, n, proactiveOptions(world, n), sit).slice(0, this.config.maxOptions);
        const weighty = WEIGHTY.test(ranked[0].option.id) || (ranked[1] && WEIGHTY.test(ranked[1].option.id) && ranked[0].score - ranked[1].score < 6);
        const importance = clamp(0.15 + (atWar ? 0.35 : 0) + 0.3 * around.threat + 0.4 * urgency + (weighty ? 0.35 : 0), 0, 1);
        tasks.push(this.task(world, n, 'proactive', sit, ranked, importance));
      }
    }
    return tasks;
  }

  private task(world: World, n: Nation, kind: Task['kind'], sit: Situation, ranked: Ranked[], importance: number, proposal?: Proposal): Task {
    const c = this.config;
    const tier: Tier = importance >= c.strategicThreshold ? 'strategic' : importance >= c.nationalThreshold ? 'national' : importance >= c.fastThreshold ? 'fast' : 'behavior';
    // DecisionHash : situation quantifiée de la nation + options offertes + état des relations visées.
    const targets = ranked.map((r) => r.option.target).filter((t): t is number => t !== null);
    const relations = [...new Set(targets)].map((t) => `${t}:${Math.round((peekRel(world, n.id, t)?.opinion ?? 0) / 20)}:${nationStateHash(world.nations[t])}`).join(',');
    const hash = fnv1a([nationStateHash(n), kind, proposal ? `${proposal.kind}:${proposal.from}:${JSON.stringify(proposal.terms ?? '')}` : '', ranked.map((r) => optionKey(r.option)).sort().join(','), relations].join('|'));
    return { nation: n, kind, proposal, sit, ranked, importance, tier, hash };
  }

  private record(world: World, t: Task, option: Option, source: DecisionRecord['source'], extra: Partial<DecisionRecord> = {}): DecisionRecord {
    this.stats.decisions++;
    this.stats[source]++;
    // Lien décision → action, gardé jusqu'à l'application du tick.
    if (option.action) this.lookup.set(`${t.nation.id}|${t.kind}|${optionKey(option)}|${world.tick}`, option.action);
    return {
      tick: world.tick, nation: t.nation.id, kind: t.kind, importance: Math.round(t.importance * 100) / 100, tier: t.tier, source,
      options: t.ranked.map((r) => r.option.label), chosen: optionKey(option), label: option.label,
      keyFactors: extra.keyFactors ?? this.explain(world, t, option), ...extra,
    };
  }

  /** Facteurs principaux d'un choix du moteur comportemental. */
  private explain(world: World, t: Task, o: Option): string[] {
    const out: string[] = [];
    const [k, v] = (Object.entries(t.sit.prefs) as [string, number][]).sort((a, b) => b[1] - a[1])[0];
    out.push(`Penchant dominant : ${PREF_FR[k]} (${v})`);
    if (t.sit.around.threat > 0.3 && t.sit.around.mainThreat >= 0) out.push(`Menace de ${world.nations[t.sit.around.mainThreat].name} : ${Math.round(t.sit.around.threat * 100)} %`);
    if (o.target !== null) {
      const rel = peekRel(world, t.nation.id, o.target);
      out.push(`Opinion envers ${world.nations[o.target].name} : ${Math.round(rel?.opinion ?? 0)}`);
      const f = t.nation.mind.attitudes[o.target];
      if (f && Math.abs(f) >= 15) out.push(f > 0 ? 'Reconnaissance pour des actes passés' : 'Rancune pour des actes passés');
    }
    if (t.nation.warExhaustion > 40) out.push(`Usure de guerre : ${Math.round(t.nation.warExhaustion)}`);
    return out.slice(0, 4);
  }

  private fromCache(world: World, t: Task): Option | null {
    const hit = t.nation.mind.cache[t.hash];
    if (!hit || world.tick - hit.tick > this.config.cacheTtl) return null;
    return t.ranked.find((r) => optionKey(r.option) === hit.option)?.option ?? null;
  }

  private store(world: World, t: Task, o: Option): void {
    const cache = t.nation.mind.cache;
    cache[t.hash] = { option: optionKey(o), tick: world.tick };
    const keys = Object.keys(cache);
    if (keys.length > 24) for (const k of keys) if (world.tick - cache[k].tick > this.config.cacheTtl) delete cache[k];
  }

  /** Décisions sans LLM : synchrone et déterministe. */
  decideSync(world: World): { actions: Action[]; records: DecisionRecord[] } {
    const records = this.plan(world).map((t) => this.record(world, t, t.ranked[0].option, 'behavior'));
    return this.finish(world, records);
  }

  /** Décisions avec LLM quand il est utile et disponible ; repli transparent sinon. */
  async decide(world: World): Promise<{ actions: Action[]; records: DecisionRecord[] }> {
    const tasks = this.plan(world);
    let budget = this.chooser ? this.config.maxLlmCallsPerTick : 0;
    // Les décisions les plus importantes passent en premier dans le budget.
    const order = tasks.map((t, i) => i).sort((a, b) => tasks[b].importance - tasks[a].importance);
    const jobs = new Array<Promise<DecisionRecord> | DecisionRecord>(tasks.length);
    for (const i of order) {
      const t = tasks[i];
      const best = t.ranked[0].option;
      // Une seule option réelle, ou un choix évident de peu d'importance : pas de LLM.
      const obvious = t.ranked.length < 2 || (t.tier === 'fast' && t.ranked[0].score - t.ranked[1].score > 25);
      if (t.tier === 'behavior' || !this.chooser || obvious) { jobs[i] = this.record(world, t, best, 'behavior'); continue; }
      const cached = this.fromCache(world, t);
      if (cached) { jobs[i] = this.record(world, t, cached, 'cache', { note: 'situation inchangée' }); continue; }
      if (budget <= 0) { jobs[i] = this.record(world, t, best, 'fallback', { note: 'budget d\'appels LLM du tick épuisé' }); continue; }
      budget--;
      jobs[i] = this.askLlm(world, t);
    }
    return this.finish(world, await Promise.all(jobs));
  }

  private async askLlm(world: World, t: Task): Promise<DecisionRecord> {
    const options = t.ranked.map((r) => r.option);
    const context = buildContext(world, t.nation, t.sit, options);
    try {
      const choice = await this.chooser!.choose(world, t, { system: SYSTEM_PROMPT, context, schema: decisionSchema(world, options) });
      const option = matchChoice(world, options, choice);
      if (!option) return this.record(world, t, options[0], 'fallback', { context, model: choice.model, note: `réponse du LLM hors options : ${choice.action}${choice.target ? ` → ${choice.target}` : ''}` });
      this.store(world, t, option);
      return this.record(world, t, option, 'llm', { context, model: choice.model, tools: choice.tools, keyFactors: choice.key_factors.slice(0, 4).map((s) => String(s).slice(0, 160)) });
    } catch (err) {
      return this.record(world, t, options[0], 'fallback', { context, note: `LLM indisponible ou réponse invalide : ${err instanceof Error ? err.message : String(err)}`.slice(0, 200) });
    }
  }

  private finish(world: World, records: DecisionRecord[]): { actions: Action[]; records: DecisionRecord[] } {
    const actions: Action[] = [];
    this.pending = [];
    for (const r of records) {
      const key = r.chosen;
      if (key === 'wait') { r.validation = 'ok'; continue; }
      const action = this.lookup.get(`${r.nation}|${r.kind}|${key}|${r.tick}`);
      if (!action) continue;
      actions.push(action);
      this.pending.push(r);
      // Une démarche envers une nation n'est pas retentée avant un moment.
      if (r.kind === 'proactive' && key.includes('@')) {
        const cd = world.nations[r.nation].mind.cooldowns;
        cd[key] = world.tick + (key.startsWith('threaten') ? 48 : 18);
        for (const k in cd) if (cd[k] <= world.tick) delete cd[k];
      }
    }
    this.lookup.clear();
    return { actions, records };
  }

  private lookup = new Map<string, Action>();
  private pending: DecisionRecord[] = [];

  /** Rattache à chaque décision le verdict et les conséquences calculés par le moteur. */
  attachResults(results: ActionResult[]): void {
    results.forEach((res, i) => {
      const r = this.pending[i];
      if (!r) return;
      r.validation = res.ok ? 'ok' : `refusée : ${res.reason}`;
      if (res.effects) r.effects = res.effects;
    });
  }
}

/** Retrouve l'option désignée par le LLM (identifiant + nom de cible). */
export function matchChoice(world: World, options: Option[], choice: { action: string; target: string | null }): Option | null {
  const same = options.filter((o) => o.id === choice.action);
  if (!same.length) return null;
  const target = choice.target && choice.target !== 'null' ? choice.target.trim().toLowerCase() : null;
  const hit = same.find((o) => (o.target === null ? target === null : world.nations[o.target].name.toLowerCase() === target));
  return hit ?? (same.length === 1 ? same[0] : null);
}
