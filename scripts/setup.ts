// Installation guidée du LLM local : npm run setup
// Détecte le matériel, recommande un modèle, propose de le télécharger via
// Ollama (source officielle), puis vérifie qu'il rend une décision valide.

import { createInterface } from 'node:readline';
import { loadConfig } from '../src/server/index';
import { selfTest } from '../src/llm/chooser';
import { detectHardware, recommendModels, resolveModels } from '../src/llm/hardware';
import { detectRuntime } from '../src/llm/provider';

const { config } = loadConfig();
const hw = await detectHardware({ ramGb: config.hardware.ram_gb || undefined, vramGb: config.hardware.vram_gb || undefined });
console.log(`Matériel détecté : ${hw.ramGb} Go de RAM, ${hw.cores} cœurs, ${hw.vramGb ? `${hw.gpu} (${hw.vramGb} Go)` : hw.gpu}`);
const plan = recommendModels(hw, config.llm.family === 'gemma4' ? 'gemma4' : 'qwen3.5');
console.log(`Palier : ${plan.tier}. ${plan.note}`);
console.log(`Modèles conseillés : rapide ${plan.fast}, national ${plan.national}, stratégique ${plan.strategic}`);

const provider = await detectRuntime();
if (!provider) {
  console.log('\nAucun runtime LLM local ne répond.');
  console.log('Le plus simple : installez Ollama depuis https://ollama.com, lancez-le, puis relancez « npm run setup ».');
  console.log('Le simulateur fonctionne aussi sans LLM (moteur comportemental) : « npm start ».');
  process.exit(0);
}
console.log(`\nRuntime détecté : ${provider.name} (${provider.baseUrl})`);
const installed = await provider.listModels();
let resolved = resolveModels(plan, installed);

if (resolved.missing.length && provider.pull) {
  // Les réponses sont lues par un itérateur de lignes : il met en tampon ce qui
  // arrive pendant un téléchargement et survit à une entrée fermée (pipe, CI),
  // là où rl.question() levait ERR_USE_AFTER_CLOSE. « --yes » accepte tout.
  const yes = process.argv.includes('--yes') || process.argv.includes('-y');
  const rl = createInterface({ input: process.stdin });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (q: string): Promise<string> => {
    process.stdout.write(q);
    if (yes) { console.log('o'); return 'o'; }
    const next = await lines.next();
    if (next.done) { console.log('(entrée fermée : non)'); return ''; }
    return next.value.trim().toLowerCase();
  };
  for (const model of resolved.missing) {
    const answer = await ask(`Télécharger ${model} depuis la bibliothèque Ollama ? [o/N] `);
    if (answer !== 'o' && answer !== 'oui' && answer !== 'y' && answer !== 'yes') continue;
    console.log(`Téléchargement de ${model}… (plusieurs minutes selon la connexion)`);
    try { await provider.pull(model); console.log('Terminé.'); } catch (e) { console.log(`Échec : ${e instanceof Error ? e.message : e}`); }
  }
  rl.close();
  resolved = resolveModels(plan, await provider.listModels());
} else if (resolved.missing.length) {
  console.log(`Modèles absents : ${resolved.missing.join(', ')}. Chargez-les dans ${provider.name}, ou indiquez un modèle dans config.yaml.`);
}

const available = await provider.listModels();
if (!available.length) { console.log('Aucun modèle disponible : le simulateur utilisera le moteur comportemental.'); process.exit(0); }
for (const model of [...new Set([resolved.fast, resolved.national, resolved.strategic])]) {
  process.stdout.write(`Vérification de ${model}… `);
  let t = await selfTest(provider, model);
  // Le tout premier chargement d'un modèle fraîchement téléchargé peut dépasser le délai : second essai, modèle chaud.
  if (!t.ok && t.error === 'délai dépassé') { process.stdout.write('premier chargement lent, nouvel essai… '); t = await selfTest(provider, model); }
  console.log(t.ok ? `décision JSON valide en ${t.ms} ms` : `échec (${t.error})`);
}
console.log('\nLancez le simulateur avec « npm start ».');
