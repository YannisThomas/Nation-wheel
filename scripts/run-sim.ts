// Démonstration en ligne de commande : npm run sim -- [ticks] [nations] [graine]
// Les nations décident avec le moteur comportemental (aucun LLM requis).
import { Director } from '../src/agents/director';
import { formatDate } from '../src/engine/journal';
import { createWorld, step } from '../src/engine/sim';
import type { World } from '../src/engine/types';

const [ticks = 1200, nations = 50, seed = 1] = process.argv.slice(2).map(Number);
const world = createWorld({ nations, seed });
const director = new Director();

const fmt = (x: number) => (x >= 1e9 ? (x / 1e9).toFixed(2) + ' Md' : x >= 1e6 ? (x / 1e6).toFixed(1) + ' M' : Math.round(x).toString());

function summary(w: World): void {
  const alive = w.nations.filter((n) => n.alive);
  const pop = alive.reduce((s, n) => s + n.pop, 0);
  const gdp = alive.reduce((s, n) => s + n.gdp, 0);
  const cells = alive.reduce((s, n) => s + n.geo.cells, 0);
  const pacts = Object.values(w.relations).filter((r) => r.defense_pact >= 0).length;
  const trades = Object.values(w.relations).filter((r) => r.trade >= 0).length;
  console.log(`\n=== ${formatDate(w)} — ${alive.length} nations, pop ${fmt(pop)}, PIB ${gdp.toFixed(0)} Md$, guerres en cours ${w.wars.length} (terminées ${w.warsEnded}), pactes ${pacts}, accords commerciaux ${trades} ===`);
  const top = [...alive].sort((a, b) => b.geo.cells - a.geo.cells).slice(0, 6);
  for (const n of top) {
    console.log(
      `${n.name.padEnd(14)} ${n.status.padEnd(15)} ${(n.government + '/' + n.ideology).padEnd(34)} terr ${(100 * n.geo.cells / cells).toFixed(1).padStart(5)}%  pop ${fmt(n.pop).padStart(9)}` +
      `  PIB ${n.gdp.toFixed(0).padStart(7)}  tech ${n.tech.toFixed(0).padStart(3)}  stab ${n.stability.toFixed(0).padStart(3)}  dette ${(100 * n.debt / n.gdp).toFixed(0).padStart(3)}%  infamie ${n.infamy.toFixed(0).padStart(2)}`);
  }
}

summary(world);
const t0 = Date.now();
for (let i = 1; i <= ticks; i++) {
  const { actions } = director.decideSync(world);
  director.attachResults(step(world, actions));
  if (i % Math.max(1, Math.floor(ticks / 4)) === 0) summary(world);
}
console.log(`\n${ticks} ticks en ${Date.now() - t0} ms. Décisions : ${director.stats.decisions}. Derniers événements marquants :`);
const major = world.journal.filter((e) => !['event', 'succession', 'colonized', 'refusal'].includes(e.type));
for (const e of major.slice(-14)) console.log(`  ${formatDate(world, e.tick)} — ${e.text}`);
const counts: Record<string, number> = {};
for (const e of world.journal) counts[e.type] = (counts[e.type] ?? 0) + 1;
console.log('Journal :', counts);
