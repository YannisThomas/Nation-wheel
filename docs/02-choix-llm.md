# Phase 1 — Choix du LLM local

Recherche faite en novembre 2026. Les chiffres de benchmark ci-dessous viennent des éditeurs ou de blogs, pas de mesures faites pour ce projet : aucun modèle n'a pu être téléchargé ni exécuté dans l'environnement de développement. La phase 6 inclut un banc d'essai local (validité JSON, appel d'outils, vitesse) qui confirmera ou corrigera ce choix sur la machine de l'utilisateur.

## Ce que le simulateur demande au modèle

Le modèle ne calcule rien : il choisit une action parmi des options, à partir d'un contexte court (500 à 1 500 jetons), et la rend en JSON conforme à un schéma. Les critères qui comptent sont donc, dans l'ordre : fiabilité du JSON et de l'appel d'outils, vitesse (beaucoup de petits appels), mémoire, licence. La culture générale et la longueur de contexte comptent peu.

## Candidats

| Famille | Tailles utiles | Licence | Outils / JSON | Mémoire (Q4) | Remarques |
|---|---|---|---|---|---|
| **Qwen3.5** | 0.8B, 2B, 4B, 9B, 27B | Apache 2.0 | Outils et « thinking » natifs ; 9B : 66,1 BFCL-V4 (chiffre éditeur) | 2B ≈ 3 Go, 4B ≈ 3,5 Go, 9B ≈ 7 Go, 27B ≈ 17–20 Go | Gamme complète du téléphone à la station de travail |
| Gemma 4 | E2B, E4B, 26B (MoE), 31B | Apache 2.0 | Appel de fonctions et JSON natifs | E2B ≈ 4–7 Go, E4B ≈ 6–10 Go, 26B ≈ 16–19 Go | Le 26B n'active que ~4B de paramètres par jeton : rapide pour sa taille. Rien entre E4B et 26B |
| Mistral Small 3.2 / Ministral 3 | 14B, 24B | Apache 2.0 | Réglé pour les outils et le JSON | 14B ≈ 8 Go, 24B ≈ 15 Go | Bon en agentique, pas de petit modèle |
| gpt-oss | 20B | Apache 2.0 | Outils + raisonnement | ≈ 13–14 Go | Une seule taille locale réaliste |
| Llama 3.x / 4 | 3B, 8B… | Licence communautaire Meta | Correct | 8B ≈ 5–6 Go | Écarté : licence plus restrictive, sans avantage ici |
| Phi-4 / Phi-4-mini | 3.8B, 14B | — | Plus faible en appel d'outils dans les comparatifs trouvés | — | Écarté |

## Recommandation : Qwen3.5, palier choisi selon la machine

Raisons :

1. **Une seule famille couvre tous les paliers** (2B → 27B). Les prompts, le format d'outils et les réglages restent les mêmes d'une machine à l'autre.
2. **Apache 2.0** : aucune restriction d'usage.
3. **Meilleurs résultats rapportés en appel d'outils** dans la tranche 4–9B, celle qui tourne sur une machine courante.
4. **Disponible partout** : Ollama, llama.cpp (GGUF), LM Studio, vLLM, MLX.

**Repli : Gemma 4** (E4B sur petite machine, 26B sur grosse). Il sert si Qwen3.5 pose problème avec le runtime détecté.

Point à vérifier à l'installation : la documentation Unsloth (août 2026) disait que les GGUF de Qwen3.5 ne fonctionnaient pas dans Ollama, alors que la bibliothèque Ollama publie des tags `qwen3.5` plus récents. L'installateur fera un appel de test réel et basculera sur Gemma 4 en cas d'échec.

## Paliers matériels

| Machine | Détection | Rapide | National | Stratégique |
|---|---|---|---|---|
| Faible | ≤ 8 Go RAM, pas de GPU | `qwen3.5:2b` | `qwen3.5:2b` | `qwen3.5:2b` |
| Moyenne | 16 Go RAM, ou 6–8 Go VRAM | `qwen3.5:4b` | `qwen3.5:4b` | `qwen3.5:9b` si VRAM ≥ 10 Go, sinon 4b (les deux ne tiennent pas ensemble dans 8 Go) |
| Puissante | 12–16 Go VRAM, ou Mac 32 Go | `qwen3.5:4b` | `qwen3.5:9b` | `qwen3.5:9b` (thinking activé) |
| Très puissante | ≥ 24 Go VRAM, ou Mac ≥ 48 Go | `qwen3.5:4b` | `qwen3.5:9b` | `qwen3.5:27b` |

Sur les machines faibles et moyennes, un seul modèle sert les trois niveaux : charger deux modèles à la fois coûte plus de mémoire que ce que la machine a, et les échanger à chaque appel coûte des secondes. La différence entre niveaux passe alors par le prompt et le mode « thinking ». Sans GPU, le moteur comportemental prend la plupart des décisions mineures et le LLM est réservé aux décisions importantes.

Tous les noms de modèles sont dans la configuration ; rien n'est codé en dur.

## Runtime

| Runtime | Installation | JSON contraint | Requêtes parallèles | Usage conseillé |
|---|---|---|---|---|
| **Ollama** | La plus simple, télécharge les modèles | Oui (`format` = schéma JSON) | Limité (`OLLAMA_NUM_PARALLEL`, pas de vrai batching) | Par défaut, PC personnel |
| llama.cpp (`llama-server`) | Binaire + fichier GGUF | Oui (grammaire / schéma) | Slots parallèles + batching continu ; un test rapporte ×3 sur Ollama à 8 clients | Mondes de 100+ nations |
| LM Studio | Application graphique | Oui | Limité | Utilisateurs qui l'ont déjà |
| vLLM | Python + GPU, plus lourd | Oui (décodage guidé) | Le meilleur débit à forte concurrence | Mode serveur personnel avec GPU |

Décision : `runtime: auto`. Le programme sonde les ports locaux habituels (Ollama 11434, LM Studio 1234, llama-server 8080, vLLM 8000) et prend le premier qui répond. Si rien n'est installé, il propose Ollama, le plus simple. Tous exposent une API compatible OpenAI, donc un seul client générique suffit, avec une variante Ollama pour le téléchargement des modèles.

## Sources

- https://huggingface.co/blog/daya-shankar/open-source-llm-models-to-run-locally
- https://artificialanalysis.ai/articles/qwen3-5-small-models
- https://ollama.com/library/qwen3.5
- https://unsloth.ai/docs/models/qwen3.5
- https://insiderllm.com/guides/function-calling-local-llms/
- https://gorilla.cs.berkeley.edu/leaderboard.html
- https://github.com/MikeVeerman/tool-calling-benchmark
- https://www.promptquorum.com/power-local-llm/best-local-models-tool-calling-2026
- https://leetllm.com/blog/run-gemma4-local-ollama
- https://docs.ollama.com/capabilities/structured-outputs
- https://www.morphllm.com/comparisons/vllm-vs-ollama
- https://www.glukhov.org/llm-performance/ollama/how-ollama-handles-parallel-requests/
