// Détection du matériel et recommandation de modèles. Aucune carte graphique
// haut de gamme n'est supposée : le palier « faible » tourne sur CPU.

export interface Hardware { ramGb: number; vramGb: number; cores: number; gpu: string; appleSilicon: boolean }
export type HardwareTier = 'weak' | 'medium' | 'strong' | 'very_strong';
export interface ModelPlan {
  tier: HardwareTier;
  family: string;
  fast: string;
  national: string;
  strategic: string;
  /** Appels LLM simultanés conseillés par tick. */
  callsPerTick: number;
  note: string;
}

export async function detectHardware(override: Partial<Hardware> = {}): Promise<Hardware> {
  const os = await import('node:os');
  const hw: Hardware = {
    ramGb: Math.round(os.totalmem() / 2 ** 30), vramGb: 0, cores: os.cpus().length, gpu: 'aucun GPU détecté',
    appleSilicon: process.platform === 'darwin' && process.arch === 'arm64',
  };
  try {
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const [name, mem] = out.trim().split('\n')[0].split(',').map((s) => s.trim());
    if (Number(mem) > 0) { hw.gpu = name; hw.vramGb = Math.round(Number(mem) / 1024); }
  } catch { /* pas de GPU NVIDIA : on reste sur CPU ou mémoire unifiée */ }
  if (hw.appleSilicon && !hw.vramGb) { hw.gpu = 'Apple Silicon (mémoire unifiée)'; hw.vramGb = Math.round(hw.ramGb * 0.65); }
  return { ...hw, ...Object.fromEntries(Object.entries(override).filter(([, v]) => v !== undefined)) } as Hardware;
}

/** Table de décision documentée dans docs/02-choix-llm.md. */
export function recommendModels(hw: Hardware, family: 'qwen3.5' | 'gemma4' = 'qwen3.5'): ModelPlan {
  const tier: HardwareTier = hw.vramGb >= 24 ? 'very_strong' : hw.vramGb >= 12 ? 'strong' : hw.vramGb >= 6 || hw.ramGb >= 16 ? 'medium' : 'weak';
  if (family === 'gemma4') {
    const small = tier === 'weak' ? 'gemma4:e2b' : 'gemma4:e4b';
    const big = tier === 'very_strong' ? 'gemma4:26b' : small;
    return { tier, family, fast: small, national: small, strategic: big, callsPerTick: tier === 'weak' ? 1 : 4, note: 'Famille de repli (Apache 2.0).' };
  }
  switch (tier) {
    case 'weak': return { tier, family, fast: 'qwen3.5:2b', national: 'qwen3.5:2b', strategic: 'qwen3.5:2b', callsPerTick: 1, note: 'Machine modeste : un seul petit modèle, le moteur comportemental prend les décisions mineures.' };
    case 'medium': {
      // 4B (≈ 3,1 Go) + 9B (≈ 5,6 Go) ne tiennent pas ensemble dans 8 Go de VRAM : le runtime
      // rechargerait un modèle à chaque alternance (5 à 6 s mesurées). Un seul modèle sous 10 Go.
      const strategic = hw.vramGb >= 10 ? 'qwen3.5:9b' : 'qwen3.5:4b';
      return { tier, family, fast: 'qwen3.5:4b', national: 'qwen3.5:4b', strategic, callsPerTick: 2, note: 'Machine courante : un modèle 4B pour presque tout.' };
    }
    case 'strong': return { tier, family, fast: 'qwen3.5:4b', national: 'qwen3.5:9b', strategic: 'qwen3.5:9b', callsPerTick: 4, note: 'Bonne carte graphique : 9B pour la diplomatie et la stratégie.' };
    default: return { tier, family, fast: 'qwen3.5:4b', national: 'qwen3.5:9b', strategic: 'qwen3.5:27b', callsPerTick: 6, note: 'Machine très puissante : 27B réservé aux décisions historiques.' };
  }
}

/**
 * Ajuste le plan à ce qui est réellement installé : un modèle absent est remplacé
 * par le modèle installé le plus proche plutôt que de faire échouer la partie.
 */
export function resolveModels(plan: ModelPlan, installed: string[]): ModelPlan & { missing: string[] } {
  const missing: string[] = [];
  const has = (m: string) => installed.some((i) => i === m || i.startsWith(`${m}-`) || i === `${m}:latest`);
  const pickFor = (wanted: string): string => {
    if (has(wanted) || !installed.length) { if (!has(wanted)) missing.push(wanted); return wanted; }
    missing.push(wanted);
    const sameFamily = installed.filter((i) => i.startsWith(wanted.split(':')[0]));
    return sameFamily[0] ?? installed[0];
  };
  return { ...plan, fast: pickFor(plan.fast), national: pickFor(plan.national), strategic: pickFor(plan.strategic), missing: [...new Set(missing)] };
}
