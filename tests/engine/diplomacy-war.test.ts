import { describe, expect, it } from 'vitest';
import { executeAction } from '../../src/engine/actions';
import { getRel, peekRel } from '../../src/engine/diplomacy';
import { createWorld, step } from '../../src/engine/sim';
import { warBetween, warsOf } from '../../src/engine/war';
import type { Action, World } from '../../src/engine/types';

const make = (seed = 4) => createWorld({ width: 80, height: 45, nations: 20, seed, eventRate: 0 });
const ok = (w: World, a: Action) => { const r = executeAction(w, a); expect(r.ok, `${JSON.stringify(a)} → ${r.reason}`).toBe(true); return r; };
const ko = (w: World, a: Action) => { const r = executeAction(w, a); expect(r.ok, JSON.stringify(a)).toBe(false); return r.reason!; };

/** Deux voisins, le premier nettement plus fort. */
function neighbors(w: World): [number, number] {
  for (const a of w.nations) for (const b of Object.keys(a.geo.neighbors).map(Number)) {
    if (a.mil.power > w.nations[b].mil.power) return [a.id, b];
  }
  throw new Error('pas de voisins');
}
const proposalTo = (w: World, to: number, kind: string) => w.proposals.find((p) => p.to === to && p.kind === kind)!;

describe('diplomatie', () => {
  it('proposition → acceptation → traité, avec effets sur l\'opinion et le commerce', () => {
    const w = make();
    const [a, b] = neighbors(w);
    const before = getRel(w, a, b).opinion;
    ok(w, { type: 'propose', nation: a, target: b, kind: 'trade' });
    expect(ko(w, { type: 'propose', nation: a, target: b, kind: 'trade' })).toMatch(/déjà en attente/);
    expect(ko(w, { type: 'respond', nation: a, proposal: proposalTo(w, b, 'trade').id, answer: 'accept' })).toMatch(/introuvable/);
    ok(w, { type: 'respond', nation: b, proposal: proposalTo(w, b, 'trade').id, answer: 'accept' });
    expect(getRel(w, a, b).trade).toBe(0);
    expect(getRel(w, a, b).opinion).toBeGreaterThan(before);
    step(w);
    expect(w.nations[a].tradeBonus).toBeGreaterThan(0);
    expect(w.journal.some((e) => e.type === 'treaty')).toBe(true);
  });

  it('contre-proposition : un pacte de défense devient un pacte de non-agression', () => {
    const w = make();
    const [a, b] = neighbors(w);
    ok(w, { type: 'propose', nation: a, target: b, kind: 'defense_pact' });
    ok(w, { type: 'respond', nation: b, proposal: proposalTo(w, b, 'defense_pact').id, answer: 'counter', kind: 'non_aggression' });
    const counter = proposalTo(w, a, 'non_aggression');
    expect(counter.from).toBe(b);
    ok(w, { type: 'respond', nation: a, proposal: counter.id, answer: 'accept' });
    expect(getRel(w, a, b).non_aggression).toBeGreaterThanOrEqual(0);
    expect(getRel(w, a, b).defense_pact).toBe(-1);
    expect(ko(w, { type: 'declare_war', nation: a, target: b })).toMatch(/non-agression/);
  });

  it('sanctions : coupent le commerce et pèsent sur l\'économie visée', () => {
    const w = make();
    const [a, b] = neighbors(w);
    ok(w, { type: 'sanction', nation: a, target: b, on: true });
    expect(ko(w, { type: 'propose', nation: a, target: b, kind: 'trade' })).toMatch(/sanctions/);
    step(w);
    expect(w.nations[b].tradeBonus).toBeLessThan(0);
    ok(w, { type: 'sanction', nation: a, target: b, on: false });
    ko(w, { type: 'sanction', nation: a, target: b, on: false });
  });

  it('une proposition sans réponse expire', () => {
    const w = make();
    const [a, b] = neighbors(w);
    ok(w, { type: 'propose', nation: a, target: b, kind: 'trade' });
    for (let i = 0; i < 8; i++) step(w);
    expect(w.proposals.length).toBe(0);
    expect(getRel(w, a, b).trade).toBe(-1);
  });

  it('aide économique : transfert réel et gratitude', () => {
    const w = make();
    const [a, b] = neighbors(w);
    const amount = w.nations[a].treasury * 0.4;
    const tb = w.nations[b].treasury;
    const op = getRel(w, a, b).opinion;
    ok(w, { type: 'send_aid', nation: a, target: b, amount });
    expect(w.nations[b].treasury).toBeCloseTo(tb + amount, 9);
    expect(getRel(w, a, b).opinion).toBeGreaterThan(op);
    ko(w, { type: 'send_aid', nation: a, target: b, amount: w.nations[a].gdp });
  });
});

describe('guerre', () => {
  it('le moteur décide de l\'issue : le plus fort gagne du terrain, les pertes sont réelles', () => {
    const w = make();
    const [a, b] = neighbors(w);
    const A = w.nations[a];
    const B = w.nations[b];
    A.mil.army += 400; // supériorité écrasante
    A.mil.power *= 10;
    const cells = [A.geo.cells, B.geo.cells];
    const pop = B.pop;
    ok(w, { type: 'declare_war', nation: a, target: b });
    expect(ko(w, { type: 'declare_war', nation: a, target: b })).toMatch(/déjà en guerre/);
    expect(ko(w, { type: 'propose', nation: a, target: b, kind: 'trade' })).toMatch(/guerre/);
    for (let i = 0; i < 12 && warBetween(w, a, b); i++) step(w);
    expect(A.geo.cells).toBeGreaterThan(cells[0]);
    expect(B.geo.cells).toBeLessThan(cells[1]);
    expect(B.pop).toBeLessThan(pop);
    expect(w.map.owner.filter((o) => o === a).length).toBe(A.geo.cells);
    expect(A.infamy).toBeGreaterThan(0);
  });

  it('paix blanche : les territoires pris sont rendus et une trêve s\'installe', () => {
    const w = make();
    const [a, b] = neighbors(w);
    w.nations[a].mil.army += 400;
    const before = w.map.owner.filter((o) => o === b).length;
    ok(w, { type: 'declare_war', nation: a, target: b });
    for (let i = 0; i < 4; i++) step(w);
    if (!w.nations[b].alive) return; // annexion éclair : rien à rendre
    expect(w.map.owner.filter((o) => o === b).length).toBeLessThan(before);
    ok(w, { type: 'propose', nation: b, target: a, kind: 'peace', terms: { deal: 'white' } });
    ok(w, { type: 'respond', nation: a, proposal: proposalTo(w, a, 'peace').id, answer: 'accept' });
    expect(warBetween(w, a, b)).toBeUndefined();
    expect(w.map.owner.filter((o) => o === b).length).toBe(before);
    expect(ko(w, { type: 'declare_war', nation: a, target: b })).toMatch(/trêve/);
    expect(w.journal.some((e) => e.type === 'peace')).toBe(true);
  });

  it('pacte de défense : l\'allié est appelé ; accepter le fait entrer en guerre, refuser est une trahison', () => {
    for (const answer of ['accept', 'reject'] as const) {
      const w = make();
      const [a, b] = neighbors(w);
      const c = w.nations.find((n) => n.id !== a && n.id !== b)!.id;
      getRel(w, b, c).defense_pact = 0;
      ok(w, { type: 'declare_war', nation: a, target: b });
      const call = proposalTo(w, c, 'call_to_arms');
      expect(call.from).toBe(b);
      ok(w, { type: 'respond', nation: c, proposal: call.id, answer });
      if (answer === 'accept') {
        expect(warBetween(w, a, c)).toBeDefined();
        expect(peekRel(w, a, c)!.atWar).toBe(true);
      } else {
        expect(warsOf(w, c).length).toBe(0);
        expect(getRel(w, b, c).defense_pact).toBe(-1);
        expect(w.journal.some((e) => e.type === 'betrayal' && e.nations[0] === c)).toBe(true);
      }
    }
  });

  it('aucune guerre n\'est éternelle', () => {
    const w = make();
    const [a, b] = neighbors(w);
    // Forces égales et postures défensives des deux côtés : la guerre doit quand même finir.
    ok(w, { type: 'declare_war', nation: a, target: b });
    ok(w, { type: 'set_stance', nation: a, stance: 'defensive' });
    for (let i = 0; i < 300 && w.wars.length; i++) step(w);
    expect(w.wars.length).toBe(0);
    expect(w.warsEnded).toBe(1);
  });

  it('une nation entièrement conquise disparaît proprement', () => {
    const w = make();
    const [a, b] = neighbors(w);
    w.nations[a].mil.army += 5000;
    ok(w, { type: 'declare_war', nation: a, target: b });
    for (let i = 0; i < 240 && w.nations[b].alive && w.wars.length; i++) step(w);
    if (w.nations[b].alive) return;
    expect(w.map.owner.includes(b)).toBe(false);
    expect(warsOf(w, b).length).toBe(0);
    expect(w.proposals.some((p) => p.from === b || p.to === b)).toBe(false);
    for (let i = 0; i < 24; i++) step(w);
    expect(Object.keys(w.relations).some((k) => k.split(':').map(Number).includes(b))).toBe(false);
    expect(executeAction(w, { type: 'set_tax', nation: b, rate: 0.2 }).ok).toBe(false);
  });
});
