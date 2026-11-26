// Mode autonome : l'hôte de simulation tourne dans un Web Worker, hors du
// fil d'interface. Un LLM du réseau local peut être branché à la demande.

import { DEFAULT_DECISION_CONFIG } from '../../src/agents/director';
import { SimHost, type Command } from '../../src/host/simhost';
import { LlmChooser, selfTest } from '../../src/llm/chooser';
import { makeProvider, type RuntimeName } from '../../src/llm/provider';

// Carte plus petite par défaut : un téléphone n'a pas la puissance d'un PC.
const host = new SimHost({ roster: 'season3', width: 120, height: 68, nations: 30, seed: Math.floor(Math.random() * 1e6) }, { ...DEFAULT_DECISION_CONFIG, maxLlmCallsPerTick: 1 });
host.onMessage((push) => postMessage({ push }));

onmessage = async (e: MessageEvent<{ id: number; cmd: Command | { type: 'llm_connect'; runtime: RuntimeName; url: string; model: string } }>) => {
  const { id, cmd } = e.data;
  try {
    let result: unknown;
    if (cmd.type === 'llm_connect') {
      const provider = makeProvider(cmd.runtime, cmd.url);
      const test = await selfTest(provider, cmd.model, 60000);
      if (!test.ok) throw new Error(`Le modèle ne répond pas correctement : ${test.error}`);
      host.setChooser(new LlmChooser(provider, { models: { fast: cmd.model, national: cmd.model, strategic: cmd.model }, useTools: false, maxToolRounds: 0, timeoutMs: 60000 }), { runtime: provider.name, models: cmd.model });
      host.emit(true);
      result = test.ms;
    } else result = await host.handle(cmd);
    postMessage({ id, ok: true, result });
  } catch (err) {
    postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
