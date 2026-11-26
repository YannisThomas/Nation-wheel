# Phase 1 — Nation Wheel : ce qui a été lu et repris

## Sources

- **Wiki communautaire** `nation-wheel.fandom.com`, lu en entier le 26 novembre 2026 (29 pages) : règles (« Canon Rules », « How Nation Wheel Works », « The World Map », « Regions of the World », « Season 1 »), modèle de fiche de nation, tableau des nations de la saison 1, fiches détaillées d'une quinzaine de nations.
- **Chaîne TikTok** `@nationwheel` : seulement les titres et descriptions indexés par les moteurs de recherche. Aucune vidéo n'a été visionnée.

Le site `nation-wheel.vercel.app` (classements) n'a pas été exploité.

## Les règles du wiki

| Règle | Dans le simulateur |
|---|---|
| Un tirage crée une nation et sa capitale, et remplit un emplacement libre de la carte | Génération à la roue (`wheel.ts`, `nationgen.ts`) |
| Le résultat d'un tirage est définitif : ni ignoré, ni modifié, ni retiré pour une question d'équilibre | Monde déterministe : même graine, même tirage. Les nations faibles ou démesurées sont gardées telles quelles |
| Les nations inégales font partie du récit | Aucun équilibrage des tirages |
| La carte est finie et prédéfinie ; un emplacement rempli ne se déplace pas, mais les frontières évoluent | Carte fixe par partie ; les capitales restent, les frontières bougent par la guerre, la colonisation et les sécessions |
| Un emplacement peut devenir une colonie | Colonies et protectorats (tribut, pas de guerre de leur propre chef, défense par la métropole, indépendance) |
| Guerres, grands changements de frontières, effondrements et alliances se décident collectivement | Ici ce sont les nations elles-mêmes qui décident (LLM ou moteur comportemental), et le moteur tranche |
| Certains tirages sont des événements qui remodèlent l'existant | Événements aléatoires du moteur ; événements provoqués en mode administrateur |
| Chaque nation appartient à une région | Cultures régionales à la création ; pas de régions nommées |
| L'histoire ne se réécrit pas (retcons limités aux erreurs) | Journal en ajout seul ; les interventions administrateur y sont marquées |
| Une saison se termine quand la carte est pleine ; la suivante ne remet pas le monde à zéro | Pas de saisons : la partie continue sans limite |

## Ce que la roue tire, d'après le tableau des nations

| Tirage | Exemples du wiki | Dans le simulateur |
|---|---|---|
| Population | de 100 000 à 2,5 milliards | Reprise telle quelle en mode saison 1 |
| Superficie | de 1 000 à 12 millions de km² | Convertie en nombre de cellules, à l'échelle de la carte |
| Régime | « Robotic Dominion », « Maritime Democracy », « Clan Empire »… | Libellé gardé, rattaché à l'un des dix régimes du moteur |
| Économie : spécialité et valeur | « $2.5T Robotics », « $40B Shadow Bank » | Spécialité affichée ; le PIB tiré fixe le niveau technologique de départ |
| Classe militaire notée sur 11 | « None 0/11 », « Naval Superpower 7/11 », « Expansionist 10/11 » | Note tirée → armée de départ ; note recalculée chaque année d'après la puissance relative |
| Traits (pictogrammes) | maritime, cybernétique, démocratique, fortuné, écologique, pacifiste, expansionniste, nucléaire, mystique | Pèsent sur la personnalité de la nation |
| Statut | colonie de X, protectorat de X, guerre contre X, hostile, rival, tension, gel, allié, commerce, paria | Appliqué au départ : tutelle, guerre en cours, opinion, pacte, accord, réputation |
| Bloc | « Novus Ordo Mundi », « Defence Accords », « POF Alliance » | Les membres sont reliés par des pactes de défense |

Répartition des notes militaires sur les 103 nations lisibles : la plus fréquente est 7/11 (les « superpuissances » spécialisées), puis 3/11 et 2/11. Le tirage aléatoire du simulateur reprend cette répartition.

## Mode « Saison 1 »

`roster: season1` (ou Paramètres → Monde) charge les 103 nations du tableau avec leurs tirages. Deux écarts assumés :

- **La géographie n'est pas celle du wiki.** La carte officielle est une image ; les nations sont placées sur une carte générée. Les voisinages diffèrent donc, et une guerre du tableau entre deux nations éloignées ici peut s'éteindre faute de contact.
- **Le PIB manquant** de certaines lignes est déduit de la classe militaire, avec une part de hasard.

Les données viennent du wiki (licence CC BY-SA) ; la source est citée dans `src/data/season1.ts`.

## Ce que le simulateur ajoute

Nation Wheel tire des nations, puis la communauté écrit leur histoire. Tout ce qui fait vivre le monde dans le temps (économie, démographie, guerre, diplomatie, décisions autonomes) est une création de ce projet.

## Non repris

- La magie et le surnaturel (« Fire god », « Techno-Magic ») : réduits à un trait « mystique » sans effet surnaturel.
- Le score « NIS » vu sur une fiche : sa définition n'est pas donnée sur le wiki.
- Les noms de continents, incohérents d'une fiche à l'autre.
