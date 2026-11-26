// Mise en route du LLM local : matériel → modèles → runtime → auto-test.

import type { AppConfig } from '../config';
import { LlmChooser, selfTest } from '../llm/chooser';
import { detectHardware, recommendModels, resolveModels, type Hardware, type ModelPlan } from '../llm/hardware';
import { detectRuntime, makeProvider, type LLMProvider, type RuntimeName } from '../llm/provider';

export interface LlmSetup {
  hardware: Hardware;
  plan: ModelPlan & { missing: string[] };
  provider: LLMProvider | null;
  chooser: LlmChooser | null;
  /** Explication lisible de ce qui a été trouvé ou non. */
  report: string[];
}

export async function setupLlm(cfg: AppConfig, opts: { test?: boolean } = {}): Promise<LlmSetup> {
  const report: string[] = [];
  const hardware = await detectHardware({ ramGb: cfg.hardware.ram_gb || undefined, vramGb: cfg.hardware.vram_gb || undefined });
  report.push(`Matériel : ${hardware.ramGb} Go de RAM, ${hardware.cores} cœurs, ${hardware.vramGb ? `${hardware.gpu} (${hardware.vramGb} Go)` : hardware.gpu}.`);
  let base = recommendModels(hardware, cfg.llm.family === 'gemma4' ? 'gemma4' : 'qwen3.5');
  if (cfg.llm.model !== 'auto' && cfg.llm.model) base = { ...base, fast: cfg.llm.model, national: cfg.llm.model, strategic: cfg.llm.model };
  if (cfg.llm.fast_model) base.fast = cfg.llm.fast_model;
  if (cfg.llm.national_model) base.national = cfg.llm.national_model;
  if (cfg.llm.strategic_model) base.strategic = cfg.llm.strategic_model;
  report.push(`Modèles recommandés (palier ${base.tier}) : rapide ${base.fast}, national ${base.national}, stratégique ${base.strategic}. ${base.note}`);
  const none = { hardware, plan: { ...base, missing: [] }, provider: null, chooser: null, report };

  if (!cfg.llm.enabled) { report.push('LLM désactivé dans la configuration : moteur comportemental seul.'); return none; }
  const provider = cfg.llm.runtime === 'auto' && !cfg.llm.base_url
    ? await detectRuntime()
    : makeProvider((cfg.llm.runtime === 'auto' ? 'openai-compatible' : cfg.llm.runtime) as RuntimeName, cfg.llm.base_url || undefined);
  if (!provider || !(await provider.available())) {
    report.push('Aucun runtime LLM local ne répond (Ollama, LM Studio, llama.cpp, vLLM). La simulation tourne avec le moteur comportemental.');
    report.push('Pour activer le LLM : installez Ollama (https://ollama.com), puis lancez « npm run setup ».');
    return none;
  }
  const installed = await provider.listModels().catch(() => []);
  const plan = resolveModels(base, installed);
  report.push(`Runtime détecté : ${provider.name} (${provider.baseUrl}), ${installed.length} modèle(s) installé(s).`);
  if (!installed.length) { report.push('Aucun modèle installé : lancez « npm run setup » pour en télécharger un.'); return { ...none, provider, plan }; }
  if (plan.missing.length) report.push(`Modèles absents : ${plan.missing.join(', ')}. Utilisation de : ${[...new Set([plan.fast, plan.national, plan.strategic])].join(', ')}.`);

  if (opts.test !== false) {
    const t = await selfTest(provider, plan.fast, cfg.llm.timeout_ms);
    if (!t.ok) { report.push(`Auto-test du modèle ${plan.fast} échoué (${t.error}). Moteur comportemental seul.`); return { ...none, provider, plan }; }
    report.push(`Auto-test réussi : ${plan.fast} rend une décision JSON valide en ${t.ms} ms.`);
  }
  const chooser = new LlmChooser(provider, { models: plan, useTools: cfg.llm.tools, maxToolRounds: 2, timeoutMs: cfg.llm.timeout_ms });
  return { hardware, plan, provider, chooser, report };
}

/** Nombre d'appels LLM par tick selon le réglage et le matériel. */
export function callsPerTick(cfg: AppConfig, plan: ModelPlan): number {
  if (cfg.decision.max_calls_per_tick > 0) return cfg.decision.max_calls_per_tick;
  return cfg.decision.llm_frequency === 'low' ? 1 : cfg.decision.llm_frequency === 'high' ? plan.callsPerTick * 2 : plan.callsPerTick;
}
