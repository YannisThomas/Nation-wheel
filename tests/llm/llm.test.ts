import { afterEach, describe, expect, it } from 'vitest';
import { Director } from '../../src/agents/director';
import { execTool, TOOL_DEFS } from '../../src/agents/tools';
import { exactHash } from '../../src/engine/hash';
import { createWorld, step } from '../../src/engine/sim';
import type { World } from '../../src/engine/types';
import { LlmChooser, selfTest, validateDecision } from '../../src/llm/chooser';
import { recommendModels, resolveModels, type Hardware } from '../../src/llm/hardware';
import { detectRuntime, extractJson, LlamaCppProvider, OllamaProvider, OpenAICompatibleProvider, type LLMProvider } from '../../src/llm/provider';
import { startMockLlm, type MockLlm, type Mode } from '../helpers/mock-llm';

let mock: MockLlm | null = null;
afterEach(async () => { await mock?.close(); mock = null; });

const make = (seed = 6) => createWorld({ width: 80, height: 45, nations: 20, seed });
const models = { fast: 'qwen3.5:4b', national: 'qwen3.5:4b', strategic: 'qwen3.5:9b' };
const chooserFor = (p: LLMProvider, useTools = true, timeoutMs = 2000) => new LlmChooser(p, { models, useTools, maxToolRounds: 2, timeoutMs });

async function play(w: World, mode: Mode, kind: 'ollama' | 'openai', ticks: number, opts: { useTools?: boolean; timeoutMs?: number } = {}) {
  mock = await startMockLlm(mode);
  const provider = kind === 'ollama' ? new OllamaProvider(mock.url) : new OpenAICompatibleProvider(mock.url);
  const d = new Director(undefined, chooserFor(provider, opts.useTools ?? true, opts.timeoutMs));
  const records = [];
  for (let i = 0; i < ticks; i++) { const out = await d.decide(w); d.attachResults(step(w, out.actions)); records.push(...out.records); }
  return { d, records, mock };
}

/** Replis dus à une réponse inutilisable (ceux dus au budget d'appels par tick sont normaux). */
const invalid = (records: { source: string; note?: string }[]) => records.filter((r) => r.source === 'fallback' && !/budget/.test(r.note ?? '')).map((r) => r.note);

describe('sortie JSON', () => {
  it('extrait le JSON d\'une réponse bavarde', () => {
    expect(extractJson('<think>hmm</think>\n```json\n{"a": {"b": "x}y"}}\n``` voilà')).toEqual({ a: { b: 'x}y' } });
    expect(() => extractJson('aucune accolade')).toThrow();
    expect(() => extractJson('{"a": 1')).toThrow();
  });

  it('valide la décision contre le schéma', () => {
    const schema = { properties: { action: { enum: ['wait', 'mobilize'] } } };
    expect(validateDecision({ action: 'wait', target: 'null', priority: 7, key_factors: ['x'] }, schema)).toEqual({ action: 'wait', target: null, priority: 1, key_factors: ['x'] });
    for (const bad of [null, [], 'wait', { action: 'win' }, { action: 'wait', key_factors: [] }, { action: 'wait', target: 3, key_factors: ['x'] }]) {
      expect(() => validateDecision(bad, schema)).toThrow();
    }
  });
});

describe('fournisseurs', () => {
  for (const kind of ['ollama', 'openai'] as const) {
    it(`${kind} : les nations décident via le LLM, le schéma est transmis au runtime`, async () => {
      const w = make();
      const { d, records, mock: m } = await play(w, 'good', kind, 90, { useTools: false });
      expect(d.stats.llm).toBeGreaterThan(0);
      const chat = m.requests.filter((r) => r.path.includes('chat'));
      expect(chat.length).toBe(d.stats.llm);
      const schema = kind === 'ollama' ? chat[0].body.format : chat[0].body.response_format.json_schema.schema;
      expect(schema.properties.action.enum.length).toBeGreaterThan(0);
      const viaLlm = records.filter((r) => r.source === 'llm');
      expect(viaLlm[0].model).toMatch(/qwen/);
      expect(viaLlm[0].context).toContain('OPTIONS :');
      expect(viaLlm[0].keyFactors).toEqual(['Facteur simulé', 'Second facteur']);
      expect(viaLlm.every((r) => r.validation)).toBe(true);
      // Les décisions stratégiques utilisent le modèle stratégique.
      const strategic = viaLlm.filter((r) => r.tier === 'strategic');
      if (strategic.length) expect(strategic.every((r) => r.model === 'qwen3.5:9b')).toBe(true);
    });
  }

  it('tolère une réponse enveloppée de texte et de balises de réflexion', async () => {
    const { d, records } = await play(make(), 'wrapped', 'openai', 60, { useTools: false });
    expect(d.stats.llm).toBeGreaterThan(0);
    expect(invalid(records)).toEqual([]);
  });

  it('détecte le runtime disponible', async () => {
    mock = await startMockLlm();
    const found = await detectRuntime([new OllamaProvider('http://127.0.0.1:9'), new LlamaCppProvider(mock.url)]);
    expect(found?.name).toBe('llama.cpp');
    expect(await found!.listModels()).toEqual(['local-model']);
    expect(await detectRuntime([new OllamaProvider('http://127.0.0.1:9')])).toBeNull();
  });

  it('auto-test : valide un modèle qui répond bien, rejette les autres', async () => {
    mock = await startMockLlm('good');
    expect((await selfTest(new OllamaProvider(mock.url), 'qwen3.5:4b')).ok).toBe(true);
    mock.mode = 'garbage';
    const bad = await selfTest(new OllamaProvider(mock.url), 'qwen3.5:4b');
    expect(bad.ok).toBe(false);
    expect(bad.error).toBeTruthy();
  });
});

describe('tool calling', () => {
  it('le LLM consulte des outils puis décide par propose_action', async () => {
    const { d, records, mock: m } = await play(make(), 'tools', 'ollama', 90);
    const withTools = records.filter((r) => r.source === 'llm' && r.tools?.length);
    expect(withTools.length).toBeGreaterThan(0);
    expect(withTools[0].tools).toEqual(['get_economy', 'get_war']);
    expect(d.stats.llm).toBeGreaterThan(0);
    expect(invalid(records)).toEqual([]);
    const followUp = m.requests.find((r) => r.body.messages?.some((x: any) => x.role === 'tool'));
    expect(JSON.parse(followUp!.body.messages.find((x: any) => x.role === 'tool').content)).toHaveProperty('pib_MdUSD');
  });

  it('chaque outil répond sans modifier le monde', () => {
    const w = make();
    for (let i = 0; i < 40; i++) step(w);
    const before = exactHash(w);
    const self = w.nations[0];
    for (const t of TOOL_DEFS) {
      for (const args of [{}, { name: w.nations[1].name }, { name: 'Inconnue' }]) {
        const out = execTool(w, self, t.name, args);
        expect(typeof out).toBe('string');
        expect(out.length).toBeLessThan(4000);
      }
    }
    expect(execTool(w, self, 'delete_world', {})).toContain('outil inconnu');
    expect(execTool(w, self, 'get_economy', { name: w.nations[1].name })).not.toContain('tresor'); // pas d'accès aux finances d'autrui
    expect(exactHash(w)).toBe(before);
  });
});

describe('robustesse', () => {
  it.each(['garbage', 'cheat', 'flaky'] as Mode[])('LLM en mode %s : repli comportemental, la partie continue', async (mode) => {
    const w = make();
    const { d, records } = await play(w, mode, 'ollama', 90, { useTools: false });
    expect(w.tick).toBe(90);
    expect(d.stats.fallback).toBeGreaterThan(0);
    if (mode !== 'flaky') expect(d.stats.llm).toBe(0);
    expect(records.filter((r) => r.source === 'fallback').every((r) => r.note && r.validation)).toBe(true);
    expect(w.journal.some((e) => /victoire|gagné/i.test(e.text))).toBe(false);
  });

  it('LLM trop lent : délai dépassé puis repli', async () => {
    const { d, records } = await play(make(), 'slow', 'openai', 40, { useTools: false, timeoutMs: 50 });
    expect(d.stats.llm).toBe(0);
    expect(records.some((r) => /délai dépassé/.test(r.note ?? ''))).toBe(true);
  });

  it('LLM arrêté en cours de partie : bascule transparente', async () => {
    const w = make();
    mock = await startMockLlm('good');
    const d = new Director(undefined, chooserFor(new OllamaProvider(mock.url), false));
    for (let i = 0; i < 60; i++) { const out = await d.decide(w); d.attachResults(step(w, out.actions)); }
    const llmBefore = d.stats.llm;
    expect(llmBefore).toBeGreaterThan(0);
    await mock.close();
    mock = null;
    for (let i = 0; i < 60; i++) { const out = await d.decide(w); d.attachResults(step(w, out.actions)); }
    expect(d.stats.llm).toBe(llmBefore);
    expect(w.tick).toBe(120);
  });
});

describe('matériel', () => {
  const hw = (ramGb: number, vramGb: number): Hardware => ({ ramGb, vramGb, cores: 8, gpu: '', appleSilicon: false });
  it('recommande un modèle adapté à chaque palier', () => {
    expect(recommendModels(hw(8, 0))).toMatchObject({ tier: 'weak', fast: 'qwen3.5:2b', strategic: 'qwen3.5:2b' });
    expect(recommendModels(hw(16, 0))).toMatchObject({ tier: 'medium', national: 'qwen3.5:4b', strategic: 'qwen3.5:4b' });
    expect(recommendModels(hw(16, 8))).toMatchObject({ tier: 'medium', strategic: 'qwen3.5:4b' });
    expect(recommendModels(hw(16, 10))).toMatchObject({ tier: 'medium', fast: 'qwen3.5:4b', strategic: 'qwen3.5:9b' });
    expect(recommendModels(hw(32, 16))).toMatchObject({ tier: 'strong', national: 'qwen3.5:9b' });
    expect(recommendModels(hw(64, 24))).toMatchObject({ tier: 'very_strong', strategic: 'qwen3.5:27b' });
    expect(recommendModels(hw(8, 0), 'gemma4').fast).toBe('gemma4:e2b');
  });
  it('se rabat sur les modèles installés', () => {
    const plan = resolveModels(recommendModels(hw(64, 24)), ['qwen3.5:9b', 'gemma4:e4b']);
    expect(plan.national).toBe('qwen3.5:9b');
    expect(plan.strategic).toBe('qwen3.5:9b');
    expect(plan.missing).toContain('qwen3.5:27b');
    expect(resolveModels(recommendModels(hw(8, 0)), []).missing).toEqual(['qwen3.5:2b']);
  });
});
