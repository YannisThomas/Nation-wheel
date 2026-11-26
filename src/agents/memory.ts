// Mémoire hiérarchique : récente → importante → historique (résumés par
// décennie). Le journal du moteur est la seule source : une nation ne se
// souvient que de ce qui s'est réellement produit.

import { peekRel } from '../engine/diplomacy';
import { yearOf } from '../engine/journal';
import { clamp } from '../engine/rng';
import { PREF_KEYS, type JournalEntry, type MemoryItem, type Nation, type Preferences, type World } from '../engine/types';

const RECENT_MAX = 12;
const IMPORTANT_MAX = 30;
const HISTORICAL_MAX = 15;

function remember(world: World, n: Nation, e: JournalEntry, text: string, weight: number, actors: number[],
  feel: Record<number, number> = {}, drift: Partial<Preferences> = {}, counter?: string): void {
  if (!n.alive) return;
  const m = n.mind;
  const item: MemoryItem = { tick: e.tick, type: e.type, actors, text, weight };
  m.recent.push(item);
  if (m.recent.length > RECENT_MAX) m.recent.shift();
  if (weight >= 0.5) {
    m.important.push(item);
    if (m.important.length > IMPORTANT_MAX) consolidate(world, n);
  }
  for (const [id, v] of Object.entries(feel)) m.attitudes[+id] = clamp((m.attitudes[+id] ?? 0) + v, -100, 100);
  for (const k of PREF_KEYS) if (drift[k]) m.drift[k] = clamp(m.drift[k] + drift[k]!, -30, 30);
  if (counter) m.counters[counter] = (m.counters[counter] ?? 0) + 1;
}

/** Le souvenir important le moins marquant est fondu dans le résumé de sa décennie. */
function consolidate(world: World, n: Nation): void {
  const m = n.mind;
  let worst = 0;
  const value = (it: MemoryItem) => it.weight * (0.4 + 0.6 * Math.exp(-(world.tick - it.tick) / 240));
  m.important.forEach((it, i) => { if (value(it) < value(m.important[worst])) worst = i; });
  const [old] = m.important.splice(worst, 1);
  const decade = `Années ${Math.floor(yearOf(world, old.tick) / 10) * 10}`;
  const i = m.historical.findIndex((h) => h.startsWith(decade));
  if (i >= 0) { if (m.historical[i].length < 220) m.historical[i] += ` ; ${old.text}`; }
  else m.historical.push(`${decade} : ${old.text}`);
  if (m.historical.length > HISTORICAL_MAX) m.historical.shift();
}

function ingest(world: World, e: JournalEntry): void {
  const N = world.nations;
  const name = (id: number) => N[id].name;
  const [a, b, c] = e.nations;
  switch (e.type) {
    case 'war_declared':
      remember(world, N[b], e, `${name(a)} nous a déclaré la guerre`, 0.95, [a], { [a]: -50 }, { defense: 8, offensive: -2 }, 'invaded');
      remember(world, N[a], e, `Nous avons déclaré la guerre à ${name(b)}`, 0.8, [b], { [b]: -10 }, {}, 'aggressions');
      for (const o of N) {
        if (!o.alive || o.id === a || o.id === b) continue;
        const rel = peekRel(world, o.id, b);
        if (rel && rel.opinion > 20) remember(world, o, e, `${name(a)} a attaqué ${name(b)}, que nous estimons`, 0.5, [a, b], { [a]: -10 }, { defense: 2 });
        else if (o.geo.neighbors[a] !== undefined) remember(world, o, e, `Notre voisin ${name(a)} a attaqué ${name(b)}`, 0.4, [a, b], { [a]: -4 }, { defense: 2 });
      }
      break;
    case 'war_joined':
      remember(world, N[b], e, `${name(a)} est entré en guerre à nos côtés contre ${name(c)}`, 0.8, [a, c], { [a]: 35 });
      remember(world, N[c], e, `${name(a)} a rejoint ${name(b)} dans la guerre contre nous`, 0.6, [a, b], { [a]: -25 });
      remember(world, N[a], e, `Nous avons honoré notre pacte avec ${name(b)} contre ${name(c)}`, 0.6, [b, c], { [b]: 10 });
      break;
    case 'betrayal':
      remember(world, N[b], e, `${name(a)} nous a trahis en abandonnant notre pacte`, 1, [a], { [a]: -60 }, { diplomacy: -6, defense: 5 }, 'betrayed');
      remember(world, N[a], e, `Nous avons abandonné notre allié ${name(b)}`, 0.5, [b]);
      break;
    case 'treaty': {
      const w = e.data?.kind === 'defense_pact' ? 0.7 : 0.5;
      const f = e.data?.kind === 'defense_pact' ? 20 : 10;
      const what = e.data?.kind === 'defense_pact' ? 'Pacte de défense' : e.data?.kind === 'trade' ? 'Accord commercial' : 'Pacte de non-agression';
      remember(world, N[a], e, `${what} signé avec ${name(b)}`, w, [b], { [b]: f });
      remember(world, N[b], e, `${what} signé avec ${name(a)}`, w, [a], { [a]: f });
      break;
    }
    case 'treaty_broken':
      remember(world, N[b], e, `${name(a)} a rompu un traité avec nous`, 0.7, [a], { [a]: -25 });
      break;
    case 'sanction':
      remember(world, N[b], e, `${name(a)} nous a imposé des sanctions`, 0.6, [a], { [a]: -20 });
      break;
    case 'sanction_lifted':
      remember(world, N[b], e, `${name(a)} a levé ses sanctions`, 0.3, [a], { [a]: 5 });
      break;
    case 'threat':
      remember(world, N[b], e, `${name(a)} nous a menacés`, 0.6, [a], { [a]: -15 }, { defense: 3 });
      break;
    case 'aid':
      remember(world, N[b], e, `${name(a)} nous a accordé une aide économique`, 0.6, [a], { [a]: 25 });
      break;
    case 'claim':
      remember(world, N[b], e, `${name(a)} revendique une partie de notre territoire`, 0.7, [a], { [a]: -20 }, { defense: 4 });
      break;
    case 'refusal':
      // Inutile de reproposer tout de suite la même chose à qui vient de refuser.
      if (N[b].alive && typeof e.data?.kind === 'string') N[b].mind.cooldowns[`propose_${e.data.kind}@${a}`] = e.tick + 72;
      remember(world, N[b], e, `${name(a)} a rejeté notre proposition`, 0.3, [a], { [a]: -5 });
      break;
    case 'capital_fall':
      remember(world, N[b], e, `Notre capitale est tombée aux mains de ${name(a)}`, 0.9, [a], { [a]: -20 }, { defense: 6 });
      break;
    case 'annexed':
      remember(world, N[a], e, `Nous avons annexé ${name(b)}`, 0.8, [b], {}, { expansion: 3 }, 'conquests');
      for (const o of N) if (o.alive && o.id !== a && o.geo.neighbors[a] !== undefined) remember(world, o, e, `${name(a)} a annexé ${name(b)}`, 0.6, [a, b], { [a]: -15 }, { defense: 5 });
      break;
    case 'peace': {
      const att = String(e.data?.attackers ?? '').split(',').filter(Boolean).map(Number);
      const def = String(e.data?.defenders ?? '').split(',').filter(Boolean).map(Number);
      const score = Number(e.data?.score ?? 0);
      for (const [side, foes, sign] of [[att, def, 1], [def, att, -1]] as [number[], number[], number][]) {
        for (const id of side) {
          const edge = score * sign;
          const foe = foes[0] ?? side[0];
          if (!att.length) { remember(world, N[id], e, `Paix signée avec ${name(e.nations.find((x) => x !== id) ?? id)}`, 0.6, e.nations.filter((x) => x !== id)); continue; }
          if (edge > 15) remember(world, N[id], e, `Guerre gagnée contre ${name(foe)}`, 0.8, foes, {}, { offensive: 4, expansion: 3 }, 'won');
          else if (edge < -15) remember(world, N[id], e, `Guerre perdue contre ${name(foe)}`, 0.9, foes, { [foe]: -10 }, { offensive: -6, defense: 5, risk: -4 }, 'lost');
          else remember(world, N[id], e, `Guerre sans vainqueur contre ${name(foe)}`, 0.7, foes, {}, { offensive: -2 });
        }
      }
      break;
    }
    case 'regime_change': case 'default':
      remember(world, N[a], e, e.text, 0.7, []);
      break;
    case 'secession':
      remember(world, N[b], e, `${name(a)} a fait sécession de notre pays`, 0.9, [a], { [a]: -30 }, { expansion: -4 }, 'lost');
      break;
    case 'independence':
      remember(world, N[a], e, `Nous avons pris notre indépendance de ${name(b)}`, 0.9, [b], {}, { risk: 3 });
      if (N[b].alive) remember(world, N[b], e, `${name(a)} s'est affranchi de notre tutelle`, 0.7, [a], { [a]: -20 });
      break;
    case 'landing':
      remember(world, N[b], e, `${name(a)} a débarqué sur nos côtes`, 0.6, [a], { [a]: -10 }, { navy: 5 });
      break;
    default:
      // Événements intérieurs ou interventions : mémoire immédiate seulement.
      for (const id of e.nations) if (N[id]) remember(world, N[id], e, e.text, e.admin ? 0.5 : 0.2, e.nations.filter((x) => x !== id));
  }
}

export function ingestJournal(world: World): void {
  for (const e of world.journal) {
    if (e.id <= world.memoryCursor) continue;
    ingest(world, e);
    world.memoryCursor = e.id;
  }
  // Le temps apaise : sentiments et dérives s'estompent lentement.
  if (world.tick % 12 === 0) {
    for (const n of world.nations) {
      if (!n.alive) continue;
      for (const id in n.mind.attitudes) {
        n.mind.attitudes[id] *= 0.965;
        if (Math.abs(n.mind.attitudes[id]) < 1) delete n.mind.attitudes[id];
      }
      for (const k of PREF_KEYS) n.mind.drift[k] *= 0.97;
    }
  }
}

const ago = (world: World, tick: number) => {
  const months = world.tick - tick;
  return months < 12 ? `il y a ${Math.max(1, months)} mois` : `il y a ${Math.round(months / 12)} an${months >= 24 ? 's' : ''}`;
};

/** Souvenirs les plus pertinents : importance × récence, bonus si les acteurs sont concernés. */
export function recall(world: World, n: Nation, relevant: number[], k = 7): string[] {
  const seen = new Set<MemoryItem>();
  const scored: [number, MemoryItem][] = [];
  for (const it of [...n.mind.important, ...n.mind.recent]) {
    if (seen.has(it)) continue;
    seen.add(it);
    const boost = it.actors.some((x) => relevant.includes(x)) ? 1.6 : 1;
    scored.push([it.weight * (0.4 + 0.6 * Math.exp(-(world.tick - it.tick) / 240)) * boost, it]);
  }
  return scored.sort((x, y) => y[0] - x[0]).slice(0, k).sort((x, y) => x[1].tick - y[1].tick)
    .map(([, it]) => `${it.text} (${ago(world, it.tick)})`);
}
