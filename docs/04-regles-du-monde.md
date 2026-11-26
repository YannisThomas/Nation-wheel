# Règles du monde

Un tick vaut un mois. Tous les nombres ci-dessous sont dans le code (`src/engine/`) ; ce document en donne la logique.

## Ordre d'un tick

1. Les actions proposées par les nations sont validées et appliquées une à une (`actions.ts`).
2. Guerres : combats, pertes, cellules conquises, blocus (`war.ts`).
3. Diplomatie : dérive des opinions, commerce, expiration des propositions (`diplomacy.ts`).
4. Chaque nation : budget, recherche, armée, production, population, stabilité, politique intérieure (`systems.ts`).
5. Événements aléatoires.

## Économie

- Le PIB converge vers un **potentiel** : population × productivité. La productivité dépend de la technologie (exponentiellement), des infrastructures, de l'éducation, de la stabilité, de l'industrie, des gisements, du commerce, et baisse avec la mobilisation, les impôts élevés et le blocus. Comme chaque facteur est borné, l'économie l'est aussi.
- Budget : recettes = PIB × impôts × efficacité (stabilité). Les intérêts de la dette passent en premier. Le reste est réparti entre armée, recherche, éducation, infrastructures, social, industrie.
- Dette : le taux d'intérêt monte au-delà de 60 % du PIB. Au-delà de 250 %, défaut souverain.
- Commerce : chaque accord commercial ajoute un bonus au potentiel (plafonné à 20 %) ; les sanctions en retirent.

## Population et société

- Croissance selon l'IDH (transition démographique), freinée par la capacité de charge du territoire (fertilité des cellules × technologie, relevée par la richesse).
- IDH = moyenne géométrique de la santé, de l'éducation et du revenu.
- Stabilité : tend vers une cible qui dépend de l'IDH, de la croissance, de la dette, des impôts, de la mobilisation, de l'usure de guerre, des conquêtes récentes et de la taille de l'empire.
- Stabilité sous 15 : le régime peut s'effondrer, et une région peut faire sécession. Un empire couvrant plus de 12 % des terres avec une stabilité sous 35 perd aussi des provinces.

## Diplomatie

- Une **opinion** par couple de nations, de −100 à +100. Elle dérive vers un équilibre fait d'affinités (idéologie, culture, régime), de voisinage, de traités, de sanctions, de revendications et de la réputation d'agresseur.
- Traités : accord commercial, pacte de non-agression, pacte de défense. Proposition → acceptation, refus ou contre-proposition. Une proposition sans réponse expire après 6 mois.
- Pacte de défense : la victime d'une attaque appelle ses alliés. Refuser ou ignorer l'appel rompt le pacte et est enregistré comme une trahison.
- Blocs = groupes de nations reliées par des pactes de défense. Sphère d'influence = petit pays lié à un partenaire au PIB cinq fois supérieur.

## Saisons climatiques

Chaque mois appartient à une saison, opposée d'un hémisphère à l'autre. Leur poids dépend de la latitude : nul sous les tropiques, maximal près des pôles.

- **Hiver** : une offensive contre un pays aux hivers rudes perd jusqu'à 35 % de son efficacité, les débarquements deviennent rares, l'usure de guerre monte plus vite. La mortalité augmente là où la santé est faible, la stabilité baisse, les épidémies sont deux fois plus fréquentes.
- **Automne** : moissons. Les recettes des pays agricoles montent, la stabilité aussi ; les tempêtes sont plus fréquentes.
- **Été** : recettes en hausse, sécheresses plus probables.
- Les nations en tiennent compte : elles évitent d'ouvrir une campagne à l'approche de l'hiver contre un pays nordique.

L'option `climateSeasons: false` les désactive.

## Saisons du monde

Comme dans Nation Wheel, l'histoire avance par saisons. Une saison se termine quand la carte est pleine (plus aucune terre libre à portée d'une nation), ou après `seasonYears` années (30 par défaut). La suivante tire une **ère**, qui s'applique à toutes les nations tant qu'elle dure :

| Ère | Effets |
|---|---|
| Fondation | Aucun : c'est la première saison |
| Âge d'or du commerce | Commerce ×1,6, économie +3 %, moins de guerres |
| Ère des conquêtes | Nations plus agressives, usure de guerre réduite |
| Grande dépression | Économie −8 %, commerce réduit, stabilité en baisse |
| Petit âge glaciaire | Terres moins fertiles, hivers une fois et demie plus rudes |
| Révolution scientifique | Recherche ×1,6 |
| Printemps des peuples | Sécessions et indépendances bien plus fréquentes, stabilité en baisse |
| Grande paix | Nations beaucoup moins agressives, commerce et stabilité en hausse |
| Grande pandémie | Population en recul, épidémies triplées, commerce réduit |

Le changement de saison est inscrit au journal avec un bilan, entre dans la mémoire des nations et figure dans le contexte donné au LLM.

## Générateur de carte

Réglages : type de monde (continents, pangée, archipels, deux continents, mer intérieure), part de terres, climat (froid, tempéré, chaud), relief, richesse en ressources, taille et graine. L'interface affiche un aperçu avant de créer le monde.

## Tirage de la roue

À la création, chaque nation tire un régime, une spécialité économique, une note militaire sur 11, des traits et un statut de départ (libre, colonie, protectorat, rivale, alliée, partenaire commerciale, paria). La note militaire est ensuite recalculée chaque année : 4 correspond à la puissance médiane du monde, et chaque doublement de puissance ajoute environ 2 points.

## Colonies et protectorats

- Une colonie verse 12 % de ses dépenses à sa métropole, un protectorat 3 %.
- Aucun des deux ne peut déclarer la guerre. Une colonie ne peut pas non plus signer de pacte de défense, sanctionner, menacer ou revendiquer.
- Qui attaque un État sous tutelle se retrouve en guerre avec sa métropole.
- Un État sous tutelle peut proclamer son indépendance. Si la métropole est en guerre ailleurs, instable ou à peine plus forte, elle laisse faire ; sinon elle déclare la guerre.

## Guerre

- Conditions : pas de trêve, pas de pacte entre les deux, cible atteignable (frontière commune, ou deux côtes et une flotte), nation pas trop épuisée.
- Chaque mois, sur chaque front : rapport des forces × terrain du défenseur × posture × aléa. Au-delà d'un seuil, l'attaquant prend de 1 à 4 cellules (au plus 4 % du territoire adverse), en avançant vers la capitale. Une nation réduite à moins de 8 cellules se défend une fois et demie mieux. Les deux camps perdent des hommes et du matériel.
- Une cellule conquise emporte sa part de population et de production. Une nation sans cellule est annexée.
- Sans frontière commune : guerre navale, blocus, débarquement possible avec une flotte dominante.
- Fin : paix négociée (retour aux frontières, ou chacun garde ses positions, avec ou sans réparations), capitulation par épuisement, armistice après 20 ans, extinction après 2 ans sans combat. Une trêve de 5 ans suit.
- Garde-fous : usure de guerre, surextension après conquête, réputation d'agresseur, sécessions.

## Décision des nations

1. **Déclencheurs** : une nation décide à son échéance (tous les 2 à 12 mois selon sa situation) ou quand quelque chose la presse (proposition, menace, attaque).
2. **Options** : le programme liste les actions que le moteur accepterait, puis les classe selon la personnalité de la nation.
3. **Importance** : de 0 à 1. Sous 0,35 le moteur comportemental décide ; au-dessus, le LLM (modèle rapide, national ou stratégique selon le seuil).
4. **Cache** : si la situation quantifiée est inchangée, la décision précédente est reprise sans appel.
5. **Budget** : nombre d'appels LLM par tick plafonné ; au-delà, repli sur le moteur comportemental.
6. **Validation** : la réponse du LLM doit désigner une option de la liste, sinon repli. L'action passe ensuite par la validation du moteur.

## Actions

`set_budget`, `set_tax`, `invest`, `research`, `mobilize`, `set_doctrine`, `claim_land`, `propose` (traité ou paix), `respond` (accepter, refuser, contre-proposer), `break_treaty`, `sanction`, `threaten`, `send_aid`, `press_claim`, `declare_war`, `set_stance`, `declare_independence`.

Aucune action ne permet de déclarer une victoire, de créer de l'argent ou de modifier une statistique directement.

## Outils de consultation du LLM

`get_nation`, `get_neighbor`, `get_relations`, `get_world_state`, `get_history`, `get_war`, `get_economy`, `get_military`, `get_trade`, `get_alliances`, en lecture seule. La décision finale passe par `propose_action`.
