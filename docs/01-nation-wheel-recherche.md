# Phase 1 — Nation Wheel : ce qui est vérifiable

## Limite de cette recherche

TikTok, le wiki Fandom, le Linktree et le site du projet sont bloqués par le réseau de l'environnement de développement. Tout ce qui suit vient de ce que les moteurs de recherche indexent (titres, descriptions, extraits). Aucune vidéo n'a été vue, aucune page de règles n'a été lue en entier. Les règles détaillées (« Canon Rules » du wiki) restent à intégrer quand elles seront accessibles.

## Mécaniques confirmées

| Mécanique | Source | Reprise dans le simulateur |
|---|---|---|
| Carte du monde fictive et fixe | wiki | Carte procédurale à graine fixe (`src/engine/map.ts`) |
| Un tirage = une nation + sa capitale, placée sur un emplacement libre | wiki | Génération par « roue » pondérée (`spin()` dans `rng.ts`, `nationgen.ts`) |
| Un tirage est définitif et « canon » | wiki | Monde déterministe : même graine = même monde |
| Statistiques : population, densité, PIB/habitant, IDH, armée, superficie | extraits TikTok, site | Champs de `Nation` (`types.ts`) |
| Trait du dirigeant avec effet chiffré (« +2 IDH ») | finale saison 2 | `leader.trait`, effets à brancher en phase 5 |
| Puissance régionale, bonus militaires et globaux | extraits « Priority Spin » | `status` calculé, `mil.power` |
| Types de nation (« Magical Empire », « Clan Empire ») | site | `government` × `ideology` (version réaliste, sans magie) |
| Classements PIB, population, superficie, IDH, armée | site | Prévu dans l'interface (phase 13) |
| Saisons ; en finale un empire réclame les terres restantes | extraits TikTok | Terres non revendiquées à la création, colonisables (phase 11) |
| La communauté enrichit le lore de chaque nation | wiki | Background et mémoire des nations (phases 4 et 8) |

## Ce que le simulateur ajoute

Nation Wheel est un générateur : les nations sont tirées puis racontées par la communauté. Il n'a pas de moteur de simulation. Tout ce qui fait vivre le monde dans le temps (économie, démographie, guerre, diplomatie, décisions autonomes) est une création de ce projet, pas une reproduction.

## Non vérifié

- Formules de calcul des statistiques et de l'IDH dans Nation Wheel.
- Liste exacte des catégories de la roue et de leurs poids.
- Contenu des « Canon Rules ».
