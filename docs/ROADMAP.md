# Feuille de route

| Phase | Contenu | État |
|---|---|---|
| 1 | Recherche Nation Wheel et modèles LLM | Fait, avec les limites notées dans `01` et `02` |
| 2 | Architecture | Fait |
| 3 | Moteur de simulation | Fait |
| 4 | Nations et background | Fait |
| 5 | Personnalité et objectifs | Fait |
| 6 | LLM local : fournisseurs, détection matériel et runtime, auto-test, repli | Fait, testé contre un faux runtime seulement |
| 7 | Tool calling | Fait, même réserve |
| 8 | Mémoire hiérarchique | Fait |
| 9 | Diplomatie | Fait |
| 10 | Économie et commerce | Fait ; les secteurs économiques détaillés ne sont pas modélisés |
| 11 | Militaire | Fait ; armée, aviation et marine comptent dans la puissance, sans batailles séparées |
| 12 | Carte interactive | Fait |
| 13 | Interface mobile-first, observateur, administrateur, panneau des décisions | Fait |
| 14 | Sauvegardes | Fait (disque en mode serveur, navigateur en mode autonome, export de fichier) |
| 15 | Tests de simulation longue | Fait jusqu'à 12 000 ticks avec agents |
| 16 | Optimisation | Partiel : voir ci-dessous |

## Reste à faire

- Essai avec un vrai modèle local et ajustement des prompts selon le résultat.
- LLM dans le navigateur du téléphone (WebLLM) pour un mode autonome complet.
- Vitesse avec 300 à 500 nations : le calcul des options par nation est le point lent.
- Règles détaillées du wiki Nation Wheel, quand elles seront accessibles.
- Secteurs économiques, routes commerciales, batailles navales et aériennes distinctes.
