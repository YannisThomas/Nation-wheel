// Démonstration en ligne de commande : npm run sim -- [ticks] [nations] [graine]
import { formatDate } from '../src/engine/journal';
import { createWorld, step } from '../src/engine/sim';
import type { World } from '../src/engine/types';

const [ticks = 1200, nations = 50, seed = 1] = process.argv.slice(2).map(Number);
const world = createWorld({ nations, seed });

const fmt = (x: number) => (x >= 1e9 ? (x / 1e9).toFixed(2) + ' Md' : x >= 1e6 ? (x / 1e6).toFixed(1) + ' M' : Math.round(x).toString());

function summary(w: World): void {
  const alive = w.nations.filter((n) => n.alive);
  const pop = alive.reduce((s, n) => s + n.pop, 0);
  const gdp = alive.reduce((s, n) => s + n.gdp, 0);
  console.log(`\n=== ${formatDate(w)} — ${alive.length} nations, population ${fmt(pop)}, PIB mondial ${gdp.toFixed(0)} Md$ ===`);
  const top = [...alive].sort((a, b) => b.gdp - a.gdp).slice(0, 8);
  for (const n of top) {
    console.log(
      `${n.name.padEnd(14)} ${n.status.padEnd(15)} ${n.government.padEnd(24)} pop ${fmt(n.pop).padStart(9)}  PIB ${n.gdp.toFixed(1).padStart(9)}` +
      `  PIB/hab ${Math.round(n.gdp * 1e9 / n.pop).toString().padStart(6)}  tech ${n.tech.toFixed(0).padStart(3)}  IDH ${n.hdi.toFixed(2)}` +
      `  stab ${n.stability.toFixed(0).padStart(3)}  dette ${(100 * n.debt / n.gdp).toFixed(0).padStart(3)}%  armée ${fmt(n.mil.personnel).padStart(8)}`);
  }
}

summary(world);
const t0 = Date.now();
for (let i = 1; i <= ticks; i++) {
  step(world);
  if (i % Math.max(1, Math.floor(ticks / 4)) === 0) summary(world);
}
console.log(`\n${ticks} ticks en ${Date.now() - t0} ms. Derniers événements :`);
for (const e of world.journal.slice(-8)) console.log(`  ${formatDate(world, e.tick)} — ${e.text}`);
const counts: Record<string, number> = {};
for (const e of world.journal) counts[e.type] = (counts[e.type] ?? 0) + 1;
console.log('Journal :', counts);
