// Produit les exemples du dossier examples/ : npm run examples
// Tout est déterministe : mêmes graines, mêmes fichiers.
import { writeFileSync } from 'node:fs';
import { background, GOV_FR, IDEO_FR, preferences, PREF_FR, TRAIT_FR } from '../src/agents/profile';
import { formatDate, yearOf } from '../src/engine/journal';
import { SimHost } from '../src/host/simhost';

const config = { width: 100, height: 56, nations: 24, seed: 2026 };
const host = new SimHost(config);
const w = host.world;
const big = (x: number) => (x >= 1e9 ? `${(x / 1e9).toFixed(2)} Md` : x >= 1e6 ? `${(x / 1e6).toFixed(1)} M` : `${Math.round(x / 1e3)} k`);

// 1. Monde d'exemple, importable dans l'interface (Paramètres → Importer un fichier).
writeFileSync('examples/monde-exemple.json', JSON.stringify(host.exportSave()));

// 2. Fiches des nations au départ.
const fiche = (id: number) => {
  const n = w.nations[id];
  const p = preferences(w, n);
  const top = (Object.entries(p) as [string, number][]).sort((a, b) => b[1] - a[1]);
  return `### ${n.name}\n\n- Capitale : ${n.capitalName} · ${GOV_FR[n.government]} ${IDEO_FR[n.ideology]} · dirigeant ${TRAIT_FR[n.leader.trait]}\n- Population ${big(n.pop)} · PIB ${n.gdp.toFixed(1)} Md$ · technologie ${Math.round(n.tech)}/120 · stabilité ${Math.round(n.stability)}/100\n- Background : ${background(w, n).join(', ')}\n- Penchants forts : ${top.slice(0, 3).map(([k, v]) => `${PREF_FR[k]} ${v}`).join(', ')}\n- Penchants faibles : ${top.slice(-3).map(([k, v]) => `${PREF_FR[k]} ${v}`).join(', ')}\n`;
};
writeFileSync('examples/nations-exemple.md', `# Nations du monde d'exemple\n\nMonde généré avec la graine ${config.seed} (${config.nations} nations, carte ${config.width}×${config.height}), en ${formatDate(w)}. La personnalité est calculée, elle évoluera avec l'histoire de chaque nation.\n\n${w.nations.map((n) => fiche(n.id)).join('\n')}`);

// 3. Simulation longue de démonstration : 500 ans, moteur comportemental seul.
const YEARS = 500;
const lines: string[] = [];
const snapshots: string[] = [];
const MAJOR = new Set(['war_declared', 'peace', 'annexed', 'secession', 'betrayal', 'regime_change', 'default']);
let cursor = 0;
let maxShare = 0;
for (let t = 0; t < YEARS * 12; t++) {
  await host.tick();
  for (const e of w.journal) {
    if (e.id <= cursor) continue;
    cursor = e.id;
    if (e.type === 'annexed' || e.type === 'secession' || e.type === 'betrayal') lines.push(`- ${formatDate(w, e.tick)} — ${e.text}`);
  }
  if (w.tick % 600 === 0) {
    const alive = w.nations.filter((n) => n.alive).sort((a, b) => b.gdp - a.gdp);
    const land = alive.reduce((s, n) => s + n.geo.cells, 0);
    for (const n of alive) maxShare = Math.max(maxShare, n.geo.cells / land);
    snapshots.push(`| ${yearOf(w)} | ${alive.length} | ${big(alive.reduce((s, n) => s + n.pop, 0))} | ${Math.round(alive.reduce((s, n) => s + n.gdp, 0))} | ${w.warsEnded} | ${alive.slice(0, 3).map((n) => `${n.name} (${(100 * n.geo.cells / land).toFixed(0)} % des terres)`).join(', ')} |`);
  }
}
const counts: Record<string, number> = {};
for (const e of w.journal) if (MAJOR.has(e.type)) counts[e.type] = (counts[e.type] ?? 0) + 1;
const s = host.director.stats;
writeFileSync('examples/simulation-longue.md', `# Simulation longue de démonstration

${YEARS} ans (${YEARS * 12} ticks) du monde d'exemple (graine ${config.seed}), sans LLM : toutes les décisions viennent du moteur comportemental. Produit par \`npm run examples\`.

## Le monde tous les 50 ans

| Année | Nations | Population | PIB (Md$) | Guerres terminées | Trois premières économies |
|---|---|---|---|---|---|
${snapshots.join('\n')}

## Bilan

- ${s.decisions} décisions prises par les nations.
- ${w.warsEnded} guerres terminées, ${w.wars.length} en cours à la fin.
- Dans le journal encore en mémoire : ${Object.entries(counts).map(([k, v]) => `${v} × ${k}`).join(', ')}.
- Plus grande part des terres tenue par une seule nation à un relevé : ${(maxShare * 100).toFixed(0)} %.
- ${w.nations.length - config.nations} nations nées d'une sécession, ${w.nations.filter((n) => !n.alive).length} disparues.

## Annexions, sécessions et trahisons

${lines.join('\n')}
`);
console.log(`Exemples écrits : ${w.nations.length} nations au total, ${w.warsEnded} guerres, part maximale ${(maxShare * 100).toFixed(0)} %.`);
host.stop();
