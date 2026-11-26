# Nation Wheel Sim

Simulateur de monde géopolitique inspiré de Nation Wheel : des nations générées « à la roue » vivent sur une carte, pilotées par un LLM local et gratuit, sous le contrôle d'un moteur de simulation déterministe.

Le projet avance par phases. Le moteur de simulation (phase 3) est fait ; les agents, le LLM, la diplomatie, la guerre et l'interface ne le sont pas encore. Voir `docs/ROADMAP.md`.

## Lancer

Il faut Node 20 ou plus récent.

```bash
npm install
npm test                      # tests du moteur
npm run sim -- 2400 50 1      # 2400 ticks (200 ans), 50 nations, graine 1
```

## Documentation

- `docs/01-nation-wheel-recherche.md` : ce qui est vérifiable sur Nation Wheel
- `docs/02-choix-llm.md` : comparaison et choix du modèle local
- `docs/03-architecture.md` : architecture complète
- `docs/ROADMAP.md` : état des phases
