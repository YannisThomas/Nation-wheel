# Nation Wheel Sim

Simulateur de monde géopolitique inspiré de Nation Wheel. Des nations tirées « à la roue » vivent sur une carte : elles commercent, s'allient, se trahissent, se font la guerre, s'effondrent et renaissent. Chaque nation est un agent autonome avec sa personnalité, ses objectifs et sa mémoire. Un LLM local et gratuit peut prendre leurs décisions importantes ; un moteur de simulation déterministe décide seul de ce qui se passe réellement.

Aucune clé d'API, aucun abonnement, aucune donnée envoyée hors de votre réseau.

## Démarrer

Il faut Node 20 ou plus récent.

```bash
npm install
npm start
```

Ouvrez ensuite http://localhost:8765. Le simulateur fonctionne tout de suite, sans LLM : les nations décident alors avec le moteur comportemental.

### Depuis un téléphone

```bash
npm start -- --lan
```

La commande affiche une adresse du type `http://192.168.x.x:8765` : ouvrez-la sur le téléphone, connecté au même Wi-Fi. La simulation tourne sur l'ordinateur, le téléphone affiche et commande. L'interface peut être ajoutée à l'écran d'accueil.

### Activer le LLM local

1. Installez Ollama depuis https://ollama.com et lancez-le.
2. `npm run setup` : le programme détecte votre matériel, recommande un modèle, propose de le télécharger, puis vérifie qu'il rend une décision valide.
3. `npm start`.

LM Studio, llama.cpp (`llama-server`) et vLLM sont détectés de la même façon s'ils tournent déjà. Le choix des modèles est expliqué dans `docs/02-choix-llm.md`.

## Les trois modes

| Mode | Où tourne la simulation | Comment |
|---|---|---|
| PC local | Sur votre ordinateur | `npm start`, puis navigateur du PC ou du téléphone (`--lan`) |
| Serveur personnel | Sur un serveur à vous | Même commande sur le serveur, `lan: true` dans `config.yaml` |
| Mobile autonome | Dans le navigateur du téléphone | Hébergez le dossier `web/dist` sur n'importe quel serveur de fichiers, ou ajoutez `?local` à l'adresse |

En mode autonome, les nations décident avec le moteur comportemental. Un LLM tournant sur un ordinateur du réseau peut être branché dans Paramètres. Aucun modèle ne tourne dans le téléphone lui-même pour l'instant.

## Configuration

Copiez `config.example.yaml` en `config.yaml`. On y règle le monde (nombre de nations, graine, taille de carte, `roster: season1` pour les nations du wiki), le LLM (`model: auto`, `runtime: auto` par défaut), les seuils de décision et le serveur.

## Commandes

```bash
npm test                    # tous les tests
npm run sim -- 2400 50 1    # partie de 200 ans en ligne de commande (ticks, nations, graine)
npm run setup               # installation guidée du LLM (ajoutez -- --yes pour tout accepter)
npm run probe               # essai du vrai modèle sur quelques décisions, avec mesures
npm run build               # reconstruit l'interface dans web/dist
npm run examples            # régénère le dossier examples/
```

## Ce que fait le simulateur

- **Monde** : carte procédurale en cellules hexagonales (terrains, fleuves, gisements). Nations tirées à la roue comme dans Nation Wheel (régime, économie, classe militaire sur 11, traits, colonies, rivalités), ou les 103 nations de la saison 1 du wiki.
- **Générateur de carte** : cinq types de monde, part de terres, climat, relief, ressources, avec aperçu.
- **Saisons** : saisons climatiques qui rythment récoltes, épidémies et campagnes militaires ; saisons du monde qui tirent une ère (âge d'or du commerce, ère des conquêtes, grande dépression…).
- **Moteur** : économie, dette, démographie, IDH, stabilité, recherche, armée, commerce, sanctions, guerres avec conquête de cellules, paix, annexions, sécessions, changements de régime, événements.
- **Agents** : background et personnalité dérivés des caractéristiques et du vécu, objectifs pondérés, mémoire hiérarchique, rancunes et gratitudes.
- **Décision** : le LLM (ou le moteur comportemental) choisit parmi des options valides ; le moteur valide, applique et chiffre les conséquences.
- **Tirage des roues** : avant le premier mois, chaque nation voit ses roues tourner à l'écran (régime, économie, classe militaire, traits, statut de départ) et s'arrêter sur ce que le moteur a tiré. On peut accélérer, passer une nation ou tout révéler ; le menu Plus permet de le revoir.
- **Interface** : carte tactile, fiche de nation, classements, diplomatie, journal, chronologie de la carte, graphiques, sauvegardes, mode administrateur, panneau des décisions.

## Limites connues

- Le LLM réel a été essayé sur une seule machine (Ollama, Qwen3.5 4B et 9B), ce qui a conduit à trois corrections : contexte porté à 8 192 jetons, un seul modèle sous 10 Go de VRAM, rejeu des seuls appels d'outils exécutés. Il n'y a pas encore de mesure de fiabilité sur une partie entière ; les tests automatiques, eux, utilisent un faux runtime. `npm run probe` fait décider quelques nations par le vrai modèle et affiche les temps.
- En mode saison 1, les nations et leurs tirages viennent du wiki, mais la carte est générée : les voisinages ne sont pas ceux de la carte officielle. Voir `docs/01-nation-wheel-recherche.md`.
- 500 nations fonctionnent côté moteur, mais l'interface et la vitesse n'ont été éprouvées qu'à 30–100 nations.

## Documentation

- `docs/01-nation-wheel-recherche.md` : ce qui est vérifiable sur Nation Wheel
- `docs/02-choix-llm.md` : comparaison et choix du modèle local
- `docs/03-architecture.md` : architecture
- `docs/04-regles-du-monde.md` : règles du moteur
- `docs/ROADMAP.md` : état des phases
- `examples/` : monde importable, fiches de nations, chronique d'une partie de 500 ans (`npm run examples` les régénère)
