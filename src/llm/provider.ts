// Fournisseurs de LLM locaux. Le reste du programme ne connaît que l'interface
// LLMProvider : changer de runtime ou de modèle ne touche ni le moteur ni les agents.

export interface ToolCall { id: string; name: string; arguments: Record<string, unknown> }
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  /** Pour role = tool : l'appel auquel ce message répond. */
  toolCallId?: string;
  toolName?: string;
}
export interface ToolDef { name: string; description: string; parameters: Record<string, unknown> }
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  /** Schéma JSON imposé à la réponse (décodage contraint côté runtime). */
  schema?: Record<string, unknown>;
  tools?: ToolDef[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}
export interface ChatResponse { content: string; toolCalls: ToolCall[] }

export interface LLMProvider {
  readonly name: string;
  readonly baseUrl: string;
  available(): Promise<boolean>;
  listModels(): Promise<string[]>;
  chat(req: ChatRequest): Promise<ChatResponse>;
  /** Téléchargement d'un modèle, quand le runtime sait le faire. */
  pull?(model: string): Promise<void>;
}

async function http(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), init.timeoutMs ?? 60000);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
    return await res.json();
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('délai dépassé');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const parseArgs = (a: unknown): Record<string, unknown> => {
  if (a && typeof a === 'object') return a as Record<string, unknown>;
  try { const v = JSON.parse(String(a ?? '{}')); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
};

/** API native d'Ollama : schéma JSON via `format`, téléchargement de modèles. */
export class OllamaProvider implements LLMProvider {
  readonly name: string = 'ollama';
  constructor(readonly baseUrl = 'http://127.0.0.1:11434') {}

  async available(): Promise<boolean> {
    try { await http(`${this.baseUrl}/api/tags`, { timeoutMs: 800 }); return true; } catch { return false; }
  }
  async listModels(): Promise<string[]> {
    const r = (await http(`${this.baseUrl}/api/tags`, { timeoutMs: 3000 })) as { models?: { name: string }[] };
    return (r.models ?? []).map((m) => m.name);
  }
  async chat(req: ChatRequest): Promise<ChatResponse> {
    const body = {
      model: req.model, stream: false, think: false,
      messages: req.messages.map((m) => ({
        role: m.role, content: m.content,
        ...(m.toolCalls ? { tool_calls: m.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.arguments } })) } : {}),
        ...(m.role === 'tool' ? { tool_name: m.toolName } : {}),
      })),
      ...(req.schema ? { format: req.schema } : {}),
      ...(req.tools?.length ? { tools: req.tools.map((t) => ({ type: 'function', function: t })) } : {}),
      // num_ctx explicite : une décision avec outils pèse 2 000 à 2 500 jetons en entrée (mesuré),
      // trop près du défaut d'Ollama (4 096) qui tronque le début du prompt sans prévenir.
      options: { temperature: req.temperature ?? 0.6, num_predict: req.maxTokens ?? 400, num_ctx: 8192 },
    };
    const r = (await http(`${this.baseUrl}/api/chat`, { method: 'POST', body: JSON.stringify(body), timeoutMs: req.timeoutMs })) as
      { message?: { content?: string; tool_calls?: { function: { name: string; arguments: unknown } }[] } };
    return {
      content: r.message?.content ?? '',
      toolCalls: (r.message?.tool_calls ?? []).map((c, i) => ({ id: `call_${i}`, name: c.function.name, arguments: parseArgs(c.function.arguments) })),
    };
  }
  async pull(model: string): Promise<void> {
    await http(`${this.baseUrl}/api/pull`, { method: 'POST', body: JSON.stringify({ model, stream: false }), timeoutMs: 3600_000 });
  }
}

/** API compatible OpenAI : llama.cpp (llama-server), LM Studio, vLLM et autres. */
export class OpenAICompatibleProvider implements LLMProvider {
  constructor(readonly baseUrl: string, readonly name = 'openai-compatible', private apiKey = '') {}

  private headers(): Record<string, string> { return this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}; }
  async available(): Promise<boolean> {
    try { await http(`${this.baseUrl}/v1/models`, { timeoutMs: 800, headers: this.headers() }); return true; } catch { return false; }
  }
  async listModels(): Promise<string[]> {
    const r = (await http(`${this.baseUrl}/v1/models`, { timeoutMs: 3000, headers: this.headers() })) as { data?: { id: string }[] };
    return (r.data ?? []).map((m) => m.id);
  }
  async chat(req: ChatRequest): Promise<ChatResponse> {
    const body = {
      model: req.model, temperature: req.temperature ?? 0.6, max_tokens: req.maxTokens ?? 400,
      messages: req.messages.map((m) => ({
        role: m.role, content: m.content,
        ...(m.toolCalls ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.arguments) } })) } : {}),
        ...(m.role === 'tool' ? { tool_call_id: m.toolCallId } : {}),
      })),
      ...(req.schema ? { response_format: { type: 'json_schema', json_schema: { name: 'decision', strict: true, schema: req.schema } } } : {}),
      ...(req.tools?.length ? { tools: req.tools.map((t) => ({ type: 'function', function: t })) } : {}),
    };
    const r = (await http(`${this.baseUrl}/v1/chat/completions`, { method: 'POST', body: JSON.stringify(body), timeoutMs: req.timeoutMs, headers: this.headers() })) as
      { choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function: { name: string; arguments: unknown } }[] } }[] };
    const msg = r.choices?.[0]?.message;
    return {
      content: msg?.content ?? '',
      toolCalls: (msg?.tool_calls ?? []).map((c, i) => ({ id: c.id ?? `call_${i}`, name: c.function.name, arguments: parseArgs(c.function.arguments) })),
    };
  }
}

export class LlamaCppProvider extends OpenAICompatibleProvider { constructor(url = 'http://127.0.0.1:8080') { super(url, 'llama.cpp'); } }
export class LMStudioProvider extends OpenAICompatibleProvider { constructor(url = 'http://127.0.0.1:1234') { super(url, 'lmstudio'); } }
export class VLLMProvider extends OpenAICompatibleProvider { constructor(url = 'http://127.0.0.1:8000') { super(url, 'vllm'); } }

export type RuntimeName = 'ollama' | 'llama.cpp' | 'lmstudio' | 'vllm' | 'openai-compatible';

export function makeProvider(runtime: RuntimeName, baseUrl?: string): LLMProvider {
  switch (runtime) {
    case 'ollama': return new OllamaProvider(baseUrl);
    case 'llama.cpp': return new LlamaCppProvider(baseUrl);
    case 'lmstudio': return new LMStudioProvider(baseUrl);
    case 'vllm': return new VLLMProvider(baseUrl);
    default: return new OpenAICompatibleProvider(baseUrl ?? 'http://127.0.0.1:8080');
  }
}

/** Sonde les runtimes locaux habituels et renvoie le premier qui répond. */
export async function detectRuntime(candidates: LLMProvider[] = [new OllamaProvider(), new LMStudioProvider(), new LlamaCppProvider(), new VLLMProvider()]): Promise<LLMProvider | null> {
  const up = await Promise.all(candidates.map((p) => p.available()));
  return candidates[up.indexOf(true)] ?? null;
}

/** Extrait l'objet JSON d'une réponse, même entourée de texte, de balises de réflexion ou de blocs de code. */
export function extractJson(text: string): unknown {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  try { return JSON.parse(clean); } catch { /* on cherche plus loin */ }
  const start = clean.indexOf('{');
  if (start < 0) throw new Error('aucun JSON dans la réponse');
  let depth = 0;
  let inString = false;
  for (let i = start; i < clean.length; i++) {
    const ch = clean[i];
    if (inString) { if (ch === '\\') i++; else if (ch === '"') inString = false; continue; }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return JSON.parse(clean.slice(start, i + 1));
  }
  throw new Error('JSON incomplet dans la réponse');
}
