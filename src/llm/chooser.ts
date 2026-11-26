// Pont entre le directeur et un LLM local : choix du modèle selon le niveau
// de la décision, consultation d'outils, sortie JSON validée.

import type { Chooser, LlmChoice, Task } from '../agents/director';
import { execTool, TOOL_DEFS } from '../agents/tools';
import type { World } from '../engine/types';
import { extractJson, type ChatMessage, type LLMProvider, type ToolDef } from './provider';

export interface ChooserOptions {
  models: { fast: string; national: string; strategic: string };
  /** Les décisions nationales et stratégiques peuvent consulter des outils. */
  useTools: boolean;
  maxToolRounds: number;
  timeoutMs: number;
}

/** Vérifie la réponse contre le schéma de décision ; lève une erreur lisible sinon. */
export function validateDecision(raw: unknown, schema: Record<string, unknown>): Omit<LlmChoice, 'model'> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('la réponse n\'est pas un objet JSON');
  const r = raw as Record<string, unknown>;
  const props = schema.properties as { action: { enum: string[] } };
  if (typeof r.action !== 'string' || !props.action.enum.includes(r.action)) throw new Error(`action hors liste : ${String(r.action).slice(0, 40)}`);
  const target = r.target === undefined || r.target === null || r.target === 'null' || r.target === '' ? null : r.target;
  if (target !== null && typeof target !== 'string') throw new Error('cible invalide');
  const priority = typeof r.priority === 'number' && Number.isFinite(r.priority) ? Math.min(1, Math.max(0, r.priority)) : 0.5;
  const factors = Array.isArray(r.key_factors) ? r.key_factors.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];
  if (!factors.length) throw new Error('key_factors manquant');
  return { action: r.action, target, priority, key_factors: factors.slice(0, 4) };
}

export class LlmChooser implements Chooser {
  constructor(private provider: LLMProvider, private opts: ChooserOptions) {}

  async choose(world: World, task: Task, req: { system: string; context: string; schema: Record<string, unknown> }): Promise<LlmChoice> {
    const model = this.opts.models[task.tier === 'behavior' ? 'fast' : task.tier];
    const base = { model, timeoutMs: this.opts.timeoutMs, temperature: task.tier === 'strategic' ? 0.4 : 0.6 };
    const messages: ChatMessage[] = [{ role: 'system', content: req.system }, { role: 'user', content: req.context }];
    const used: string[] = [];

    if (this.opts.useTools && task.tier !== 'fast') {
      const propose: ToolDef = { name: 'propose_action', description: 'Annonce ta décision finale. Le moteur de simulation la validera et en calculera les conséquences.', parameters: req.schema };
      const hint: ChatMessage = { role: 'system', content: 'Si une information te manque, consulte d\'abord un outil (2 consultations au plus). Termine toujours par propose_action.' };
      for (let round = 0; round <= this.opts.maxToolRounds; round++) {
        const res = await this.provider.chat({ ...base, messages: [messages[0], hint, ...messages.slice(1)], tools: [...TOOL_DEFS, propose] });
        const decision = res.toolCalls.find((c) => c.name === 'propose_action');
        if (decision) return { ...validateDecision(decision.arguments, req.schema), model, tools: used };
        if (!res.toolCalls.length) {
          // Certains modèles répondent directement en JSON plutôt que d'appeler propose_action.
          try { return { ...validateDecision(extractJson(res.content), req.schema), model, tools: used }; } catch { break; }
        }
        messages.push({ role: 'assistant', content: res.content, toolCalls: res.toolCalls });
        for (const call of res.toolCalls.slice(0, 3)) {
          used.push(call.name);
          messages.push({ role: 'tool', toolCallId: call.id, toolName: call.name, content: execTool(world, task.nation, call.name, call.arguments) });
        }
      }
    }
    // Réponse finale contrainte par le schéma. Une seconde tentative si le JSON est invalide.
    let last: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.provider.chat({ ...base, messages, schema: req.schema });
      try { return { ...validateDecision(extractJson(res.content), req.schema), model, tools: used }; } catch (e) { last = e; }
    }
    throw last instanceof Error ? last : new Error('réponse invalide');
  }
}

/** Vérifie qu'un modèle produit bien une décision valide ; renvoie la latence. */
export async function selfTest(provider: LLMProvider, model: string, timeoutMs = 120000): Promise<{ ok: boolean; ms: number; error?: string }> {
  const schema = {
    type: 'object', additionalProperties: false, required: ['action', 'target', 'priority', 'key_factors'],
    properties: { action: { type: 'string', enum: ['propose_defense_pact', 'mobilize', 'wait'] }, target: { anyOf: [{ type: 'string', enum: ['Zeta'] }, { type: 'null' }] }, priority: { type: 'number' }, key_factors: { type: 'array', items: { type: 'string' } } },
  };
  const t0 = Date.now();
  try {
    const res = await provider.chat({
      model, schema, timeoutMs, temperature: 0.2,
      messages: [
        { role: 'system', content: 'Tu gouvernes une nation. Choisis UNE option et réponds uniquement en JSON : {"action", "target", "priority", "key_factors"}.' },
        { role: 'user', content: 'NATION : Xi, petit État côtier menacé.\nSITUATION : Ypsilon mobilise à notre frontière. Zeta nous a aidés par le passé.\nOPTIONS :\n1. action="propose_defense_pact" target="Zeta"\n2. action="mobilize" target=null\n3. action="wait" target=null' },
      ],
    });
    validateDecision(extractJson(res.content), schema);
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}
