# Phase 2 — Architecture

## Décision centrale : un moteur TypeScript unique, sans dépendance

Le projet doit tourner dans trois modes : sur un PC (accès depuis le téléphone par le réseau local), en autonome sur le téléphone, et sur un serveur personnel. Un moteur écrit en TypeScript pur tourne tel quel dans Node (modes PC et serveur) et dans un Web Worker du navigateur (mode mobile autonome). Il n'y a donc qu'un seul moteur à écrire et à tester, et l'interface ne sait pas où il s'exécute.

```
                 ┌──────────────── Interface PWA (mobile-first) ────────────────┐
                 │  Carte Canvas · fiche nation (bottom sheet) · journal ·      │
                 │  graphiques · panneau développeur · mode administrateur      │
                 └───────────────────────────┬──────────────────────────────────┘
                                             │ même protocole de messages
                        ┌────────────────────┴────────────────────┐
                        ▼                                         ▼
              WebSocket vers un serveur Node            Web Worker dans le navigateur
              (PC local ou serveur personnel)           (mode mobile autonome)
                        └────────────────────┬────────────────────┘
                                             ▼
┌─────────────────────────────── Hôte de simulation ───────────────────────────────┐
│                                                                                  │
│   MOTEUR (src/engine) — déterministe, seul à modifier l'état                     │
│   carte · économie · population · armée · société · événements · journal         │
│        ▲ actions validées                         │ état + événements            │
│        │                                          ▼                              │
│   SYSTÈME DE DÉCISION (src/agents)                                               │
│   1. Déclencheurs : qui doit décider ce tick ? (événement, menace, échéance)     │
│   2. Cache : empreinte de situation inchangée → décision précédente réutilisée   │
│   3. Routage : mineur → moteur comportemental ; important → LLM (3 niveaux)      │
│   4. Contexte : profil + objectifs + situation + mémoire pertinente + options    │
│   5. Sortie JSON validée par schéma, puis validée par le moteur                  │
│        │                                                                         │
│        ▼                                                                         │
│   LLMProvider (src/llm) : Ollama · llama.cpp · LM Studio · vLLM · OpenAI-compat  │
│   Indisponible ou réponse invalide → moteur comportemental, sans interruption    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## Règles d'architecture

1. **Le LLM propose, le moteur dispose.** Le seul point d'entrée vers l'état est `executeAction()` (`src/engine/actions.ts`). Il valide, applique, et renvoie les conséquences chiffrées. Aucune action « j'ai gagné » n'existe dans le schéma.
2. **Déterminisme.** L'état du générateur aléatoire vit dans le monde. Même graine + mêmes actions = même histoire, y compris après sauvegarde et reprise. Les décisions LLM sont journalisées, donc une partie peut être rejouée sans LLM.
3. **Tout l'état est du JSON simple.** Une sauvegarde est `JSON.stringify(world)`. L'état passe sans conversion entre worker, serveur et interface.
4. **Aucun réseau externe.** Le serveur n'écoute que sur la machine ou le réseau local ; le seul appel sortant est vers le runtime LLM local.

## Budget d'appels LLM

Interdit : nations × ticks appels. Le système de décision filtre en cascade :

| Filtre | Effet |
|---|---|
| Déclencheurs | Une nation ne « réfléchit » que sur événement (proposition reçue, voisin qui mobilise, crise, guerre) ou à son échéance périodique (tous les 6 à 24 ticks selon son statut) |
| `NationStateHash` | Situation quantifiée inchangée → pas d'appel, la stratégie en cours continue |
| `DecisionHash` | Même contexte + mêmes options déjà vus → réponse en cache |
| Routage par importance | Score < seuil → moteur comportemental ; sinon modèle rapide, national ou stratégique (`strategic_threshold`) |
| Budget par tick | File de priorité ; ce qui dépasse le budget est différé au tick suivant |

Objectif : quelques appels par tick pour 100 nations, et zéro la plupart des ticks calmes.

## Décision : contexte, outils, sortie

- **Contexte** construit par nation : identité et background (profil permanent), objectifs pondérés, situation actuelle, souvenirs pertinents, options valides calculées par le moteur. Le LLM ne voit que les options réellement possibles.
- **Outils de consultation** (lecture seule) : `get_nation`, `get_neighbor`, `get_relations`, `get_world_state`, `get_history`, `get_war`, `get_economy`, `get_military`, `get_trade`, `get_alliances`. Limités à quelques appels par décision.
- **Sortie** : `{ action, target, params, priority, key_factors }`, contrainte par schéma JSON côté runtime, revalidée côté programme, puis validée par le moteur. Le panneau développeur montre contexte, modèle, action proposée, validation, conséquence et `key_factors`, jamais de raisonnement interne.

## Personnalité, objectifs, mémoire

- **Personnalité** : vecteur de préférences 0–100 (science, défense, diplomatie, marine, commerce, expansion, guerre offensive, tolérance au risque…) calculé à partir du gouvernement, de l'idéologie, de la géographie, de l'économie, de l'histoire et du dirigeant. Il est recalculé quand ces éléments changent et dérive avec les événements vécus (une invasion subie augmente la défense et la méfiance).
- **Objectifs** pondérés, dérivés de la personnalité et de la situation.
- **Mémoire hiérarchique** : immédiate (derniers ticks) → importante (guerres, alliances, trahisons, aides, avec poids émotionnel) → historique (résumés par décennie) → profil permanent. La sélection se fait par score (importance × récence × nations concernées). Pas de base vectorielle : les souvenirs sont structurés (type, acteurs, date), une recherche par clés est exacte et gratuite, alors qu'un modèle d'embeddings ajouterait une dépendance et de la mémoire sans gain mesurable ici.

## Carte

Grille hexagonale de cellules (160×90 par défaut, configurable). Chaque cellule a un terrain, une fertilité, un fleuve, un gisement éventuel et un propriétaire. Une frontière est l'endroit où deux cellules voisines ont des propriétaires différents : conquérir une cellule modifie réellement la carte, la superficie, les voisins, les côtes et les ressources de la nation. Le rendu se fait sur Canvas, avec zoom et déplacement tactiles.

## Pile technique

| Élément | Choix | Raison |
|---|---|---|
| Langage | TypeScript partout | Un moteur pour Node et navigateur |
| Moteur | Zéro dépendance | Portable, testable, rapide (10 000 ticks × 100 nations ≈ 1,3 s) |
| Serveur | Node + WebSocket | Sert la PWA et héberge la simulation |
| Interface | Vite + Preact + Canvas 2D | Léger sur mobile, PWA installable |
| LLM mobile autonome | WebLLM (WebGPU) avec petit modèle, optionnel | Seule voie locale dans un navigateur |
| Tests | Vitest | Rapide, même code pour tous les modules |
| Configuration | Fichier YAML + réglages dans l'interface | Demandé |

## Arborescence

```
src/engine/    moteur déterministe (phase 3, fait)
src/agents/    personnalité, objectifs, mémoire, contexte, cache, décision, repli comportemental
src/llm/       LLMProvider et implémentations, détection matériel et runtime
src/server/    serveur Node, WebSocket, sauvegardes sur disque
web/           interface PWA
tests/         tests par module + simulations longues
docs/          recherche, choix du LLM, architecture, feuille de route
```
