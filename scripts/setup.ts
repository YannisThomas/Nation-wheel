// Installation guidée du LLM local : npm run setup
// Détecte le matériel, recommande un modèle, propose de le télécharger via
// Ollama (source officielle), puis vérifie qu'il rend une décision valide.

import { createInterface } from 'node:readline/promises';
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
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (const model of resolved.missing) {
    const answer = (await rl.question(`Télécharger ${model} depuis la bibliothèque Ollama ? [o/N] `)).trim().toLowerCase();
    if (answer !== 'o' && answer !== 'oui' && answer !== 'y') continue;
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
  const t = await selfTest(provider, model);
  console.log(t.ok ? `décision JSON valide en ${t.ms} ms` : `échec (${t.error})`);
}
console.log('\nLancez le simulateur avec « npm start ».');
