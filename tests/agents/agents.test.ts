import { describe, expect, it } from 'vitest';
import { rank } from '../../src/agents/behavior';
import { buildContext, decisionSchema } from '../../src/agents/context';
import { Director, matchChoice, type Chooser } from '../../src/agents/director';
import { ingestJournal, recall } from '../../src/agents/memory';
import { proactiveOptions } from '../../src/agents/options';
import { background, goals, preferences, surroundings } from '../../src/agents/profile';
import { executeAction, validateAction } from '../../src/engine/actions';
import { exactHash } from '../../src/engine/hash';
import { createWorld, loadWorld, saveWorld, step } from '../../src/engine/sim';
import type { World } from '../../src/engine/types';

const make = (seed = 6, nations = 20) => createWorld({ width: 80, height: 45, nations, seed });
const run = (w: World, d: Director, ticks: number) => { for (let i = 0; i < ticks; i++) { const { actions } = d.decideSync(w); d.attachResults(step(w, actions)); } };

describe('personnalité', () => {
  it('deux nations aux mêmes statistiques n\'ont pas le même tempérament', () => {
    const w = make();
    const a = w.nations[0];
    const clone = JSON.parse(JSON.stringify(a));
    clone.mind.quirks = w.nations[1].mind.quirks;
    expect(preferences(w, clone)).not.toEqual(preferences(w, a));
  });

  it('le vécu modifie les préférences : une invasion renforce la défense', () => {
    const w = make();
    const [a, b] = (() => { for (const n of w.nations) for (const o of Object.keys(n.geo.neighbors)) return [n.id, +o]; throw 0; })();
    const before = preferences(w, w.nations[b]);
    expect(executeAction(w, { type: 'declare_war', nation: a, target: b }).ok).toBe(true);
    ingestJournal(w);
    const after = preferences(w, w.nations[b]);
    expect(after.defense).toBeGreaterThan(before.defense);
    expect(w.nations[b].mind.attitudes[a]).toBeLessThan(-30);
    expect(w.nations[b].mind.counters.invaded).toBe(1);
    expect(recall(w, w.nations[b], [a]).join(' ')).toContain('déclaré la guerre');
    expect(background(w, w.nations[b])).toContain('histoire défensive');
    expect(surroundings(w, w.nations[b]).threat).toBeGreaterThan(0.3);
  });

  it('le background et les objectifs reflètent la nation', () => {
    const w = make();
    for (const n of w.nations) {
      const tags = background(w, n);
      expect(tags.length).toBeGreaterThan(4);
      expect(tags.includes('enclavé')).toBe(n.geo.landlocked);
      const s = surroundings(w, n);
      const g = goals(n, preferences(w, n, s), s);
      for (const v of Object.values(g)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
    }
  });
});

describe('options et moteur comportemental', () => {
  it('toutes les options proposées sont acceptées par le moteur', () => {
    const w = make();
    run(w, new Director(), 60);
    for (const n of w.nations.filter((x) => x.alive)) {
      const options = proactiveOptions(w, n);
      expect(options.some((o) => o.id === 'wait')).toBe(true);
      for (const o of options) if (o.action) expect(validateAction(w, o.action), o.label).toBeNull();
    }
  });

  it('une nation en guerre réagit autrement qu\'en paix', () => {
    const w = make();
    const n = w.nations[0];
    const sit = () => { const around = surroundings(w, n); return { prefs: preferences(w, n, around), around }; };
    const peace = rank(w, n, proactiveOptions(w, n), sit())[0].option.id;
    const foe = +Object.keys(n.geo.neighbors)[0];
    executeAction(w, { type: 'declare_war', nation: foe, target: n.id });
    const top = rank(w, n, proactiveOptions(w, n), sit()).slice(0, 3).map((r) => r.option.id);
    expect(top.some((id) => /mobilize|budget_military|invest_military|propose_peace|go_offensive/.test(id)), `${peace} → ${top}`).toBe(true);
  });
});

describe('mémoire', () => {
  it('reste bornée et se résume en histoire sur une longue partie', () => {
    const w = make(9);
    run(w, new Director(), 1500);
    let summarized = 0;
    for (const n of w.nations) {
      expect(n.mind.recent.length).toBeLessThanOrEqual(12);
      expect(n.mind.important.length).toBeLessThanOrEqual(30);
      expect(n.mind.historical.length).toBeLessThanOrEqual(15);
      expect(Object.keys(n.mind.cache).length).toBeLessThan(200);
      for (const v of Object.values(n.mind.attitudes)) expect(Math.abs(v)).toBeLessThanOrEqual(100);
      if (n.mind.historical.length) summarized++;
    }
    expect(summarized).toBeGreaterThan(0);
  });
});

describe('contexte LLM', () => {
  it('contient les sections attendues et reste court', () => {
    const w = make();
    run(w, new Director(), 120);
    const d = new Director();
    const task = d.plan(w).find((t) => t.kind === 'proactive') ?? (() => { w.nations.forEach((n) => (n.mind.urgency = 1)); return d.plan(w).find((t) => t.kind === 'proactive')!; })();
    const options = task.ranked.map((r) => r.option);
    const ctx = buildContext(w, task.nation, task.sit, options);
    for (const section of ['DATE :', 'NATION :', 'BACKGROUND :', 'OBJECTIFS :', 'SITUATION :', 'OPTIONS :']) expect(ctx).toContain(section);
    expect(ctx.length).toBeLessThan(6000);
    const schema = decisionSchema(w, options) as { properties: { action: { enum: string[] } } };
    expect(schema.properties.action.enum).toContain(options[0].id);
  });

  it('retrouve l\'option désignée par le LLM, et rejette ce qui n\'est pas dans la liste', () => {
    const w = make();
    const n = w.nations[0];
    const options = proactiveOptions(w, n);
    const targeted = options.find((o) => o.target !== null)!;
    expect(matchChoice(w, options, { action: targeted.id, target: w.nations[targeted.target!].name.toUpperCase() })).toBe(targeted);
    expect(matchChoice(w, options, { action: 'wait', target: null })!.id).toBe('wait');
    expect(matchChoice(w, options, { action: 'win_the_war', target: null })).toBeNull();
    expect(matchChoice(w, options, { action: targeted.id, target: 'Nation Inexistante' })).toBeNull();
  });
});

describe('directeur', () => {
  it('sans LLM : déterministe et sauvegardable en cours de route', () => {
    const a = make(12);
    const b = make(12);
    run(a, new Director(), 150);
    run(b, new Director(), 75);
    const c = loadWorld(saveWorld(b));
    run(c, new Director(), 75);
    expect(exactHash(c)).toBe(exactHash(a));
  });

  it('n\'appelle le LLM que pour les décisions importantes, dans la limite du budget, et met en cache', async () => {
    const w = make(13);
    let calls = 0;
    const perTick = new Map<number, number>();
    const chooser: Chooser = {
      async choose(world, task) {
        calls++;
        perTick.set(world.tick, (perTick.get(world.tick) ?? 0) + 1);
        const o = task.ranked[0].option;
        return { action: o.id, target: o.target === null ? null : world.nations[o.target].name, priority: 0.8, key_factors: ['test'], model: 'mock' };
      },
    };
    const d = new Director({ ...new Director().config, maxLlmCallsPerTick: 2 }, chooser);
    for (let i = 0; i < 240; i++) { const { actions } = await d.decide(w); d.attachResults(step(w, actions)); }
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBe(d.stats.llm);
    expect(Math.max(...perTick.values())).toBeLessThanOrEqual(2);
    expect(d.stats.llm).toBeLessThan(d.stats.decisions * 0.5); // la majorité des décisions se passe du LLM
    expect(d.stats.behavior).toBeGreaterThan(0);
  });

  it('LLM en panne ou incohérent : la simulation continue avec le moteur comportemental', async () => {
    const w = make(14);
    let n = 0;
    const chooser: Chooser = {
      async choose() {
        n++;
        if (n % 2) throw new Error('connexion refusée');
        return { action: 'declare_victory', target: null, priority: 1, key_factors: ['j\'ai gagné'], model: 'mock' };
      },
    };
    const d = new Director(undefined, chooser);
    const records = [];
    for (let i = 0; i < 120; i++) { const out = await d.decide(w); d.attachResults(step(w, out.actions)); records.push(...out.records); }
    expect(d.stats.llm).toBe(0);
    expect(d.stats.fallback).toBeGreaterThan(0);
    expect(records.some((r) => r.source === 'fallback' && /hors options/.test(r.note ?? ''))).toBe(true);
    expect(records.some((r) => r.source === 'fallback' && /connexion refusée/.test(r.note ?? ''))).toBe(true);
    expect(w.tick).toBe(120);
  });

  it('chaque décision appliquée porte le verdict du moteur', () => {
    const w = make(15);
    const d = new Director();
    let seen = 0;
    for (let i = 0; i < 60; i++) {
      const { actions, records } = d.decideSync(w);
      d.attachResults(step(w, actions));
      for (const r of records) { expect(r.validation, r.chosen).toBeTruthy(); seen++; }
    }
    expect(seen).toBeGreaterThan(20);
  });
});

describe('simulations longues avec agents', () => {
  it('3000 ticks : pas de guerre éternelle, pas de domination mondiale, pas de valeurs absurdes', () => {
    const w = make(31, 30);
    const d = new Director();
    let maxShare = 0;
    for (let i = 0; i < 3000; i++) {
      const { actions } = d.decideSync(w);
      d.attachResults(step(w, actions));
      if (i % 100 === 0) {
        for (const n of w.nations.filter((x) => x.alive)) {
          for (const v of [n.pop, n.gdp, n.treasury, n.debt, n.stability, n.mil.personnel, n.mil.power, n.warExhaustion, n.infamy]) {
            expect(Number.isFinite(v) && v >= 0, `${n.name} tick ${w.tick}`).toBe(true);
          }
          maxShare = Math.max(maxShare, n.geo.cells / w.landCells);
        }
        for (const war of w.wars) expect(w.tick - war.start).toBeLessThanOrEqual(245);
      }
    }
    expect(w.warsEnded).toBeGreaterThan(3);
    expect(maxShare).toBeLessThan(0.6);
    expect(w.nations.filter((n) => n.alive).length).toBeGreaterThan(5);
    expect(w.proposals.length).toBeLessThan(200);
  }, 60000);
});
