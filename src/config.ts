// Configuration : fichier config.yaml optionnel, valeurs par défaut sinon.
// Le lecteur ne gère que le sous-ensemble utile de YAML (clés imbriquées,
// scalaires, commentaires), pour ne dépendre d'aucune bibliothèque.

export interface AppConfig {
  simulation: { tick_duration: 'month'; max_nations: number; nations: number; seed: number; map_width: number; map_height: number; start_year: number };
  llm: { enabled: boolean; provider: 'local'; model: string; runtime: string; base_url: string; family: string; tools: boolean; timeout_ms: number; fast_model: string; national_model: string; strategic_model: string };
  decision: { llm_frequency: 'low' | 'adaptive' | 'high'; strategic_threshold: number; national_threshold: number; fast_threshold: number; max_calls_per_tick: number };
  hardware: { ram_gb: number; vram_gb: number };
  server: { port: number; lan: boolean };
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  simulation: { tick_duration: 'month', max_nations: 500, nations: 50, seed: 1, map_width: 160, map_height: 90, start_year: 1800 },
  // model/runtime « auto » : détection du matériel et du runtime au lancement. 0 = automatique.
  llm: { enabled: true, provider: 'local', model: 'auto', runtime: 'auto', base_url: '', family: 'qwen3.5', tools: true, timeout_ms: 60000, fast_model: '', national_model: '', strategic_model: '' },
  decision: { llm_frequency: 'adaptive', strategic_threshold: 0.8, national_threshold: 0.6, fast_threshold: 0.35, max_calls_per_tick: 0 },
  hardware: { ram_gb: 0, vram_gb: 0 },
  // Par défaut le serveur n'écoute que sur cette machine. lan: true l'ouvre au réseau local (téléphone).
  server: { port: 8765, lan: false },
};

function scalar(raw: string): string | number | boolean {
  const v = raw.trim().replace(/^["'](.*)["']$/, '$1');
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !Number.isNaN(Number(v)) && !/^["']/.test(raw.trim())) return Number(v);
  return v;
}

export function parseYaml(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const stack: { indent: number; obj: Record<string, unknown> }[] = [{ indent: -1, obj: root }];
  for (const line of text.split(/\r?\n/)) {
    const noComment = line.replace(/(^|\s)#.*$/, '');
    if (!noComment.trim()) continue;
    const m = /^(\s*)([A-Za-z0-9_]+)\s*:\s*(.*)$/.exec(noComment);
    if (!m) throw new Error(`Ligne de configuration illisible : ${line.trim()}`);
    const indent = m[1].length;
    while (stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (m[3].trim() === '') { const obj = {}; parent[m[2]] = obj; stack.push({ indent, obj }); }
    else parent[m[2]] = scalar(m[3]);
  }
  return root;
}

/** Fusionne une configuration lue avec les valeurs par défaut ; les clés inconnues ou mal typées sont signalées. */
export function mergeConfig(input: Record<string, unknown>): { config: AppConfig; warnings: string[] } {
  const config = JSON.parse(JSON.stringify(DEFAULT_APP_CONFIG)) as AppConfig;
  const warnings: string[] = [];
  for (const [section, values] of Object.entries(input)) {
    const target = (config as unknown as Record<string, Record<string, unknown>>)[section];
    if (!target || typeof values !== 'object' || values === null) { warnings.push(`section inconnue : ${section}`); continue; }
    for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
      if (!(key in target)) warnings.push(`clé inconnue : ${section}.${key}`);
      else if (typeof value !== typeof target[key]) warnings.push(`type invalide pour ${section}.${key} (attendu : ${typeof target[key]})`);
      else target[key] = value;
    }
  }
  const s = config.simulation;
  s.nations = Math.max(2, Math.min(s.max_nations, Math.round(s.nations)));
  s.map_width = Math.max(40, Math.min(400, Math.round(s.map_width)));
  s.map_height = Math.max(24, Math.min(240, Math.round(s.map_height)));
  return { config, warnings };
}
