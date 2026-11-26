# Contenu des roues de Nation Wheel (saison 3)

Relevé le 26 novembre 2026 sur 15 vidéos de la chaîne YouTube officielle `@nationwheel` : les tirages n° 103, 102, 101, 100, 99, 98, 97, 96, 95, 94, 92, 90, 87, 82 et 63 de la série en cours, dont les écrans de fin portent « NATION WHEEL · SEASON 3 ». Chaque vidéo a été mise en pause sur chaque roue et les segments lus à l'écran (720p pour le n° 103, 1080p pour les autres).

Ce format diffère du tableau de la saison 1 du wiki (`src/data/season1.ts`), qui note par exemple l'armée sur 11.

## Comment lire ce document

Chaque roue porte son origine :

- **Relevée** : lue à l'écran. « (?) » signale une lecture incertaine.
- **Écrite** : introuvable ou illisible dans les vidéos, écrite pour le simulateur dans le style des segments relevés. Ce n'est pas du contenu de Nation Wheel.

Les libellés sont laissés en anglais, comme à l'écran. Les parts en pourcentage sont estimées à l'œil d'après la largeur des segments ; les roues « boosted by » sont repondérées à chaque tirage, ces parts ne valent donc que pour la vidéo lue.

## Déroulement d'un tirage

L'ordre varie un peu d'une vidéo à l'autre (le n° 101 tire l'armée avant le PIB, les n° 96 et 92 tirent l'idéologie avant la taille).

| # | Roue | Sous-titre à l'écran | Dépend de |
|---|---|---|---|
| 1 | Country Size | Determines your map size | — |
| 2 | Population | boosted by: Size | taille |
| 3 | Ideology | Determines your ruling power | — |
| 4 | Political Doctrine | nom de l'idéologie | une roue par idéologie |
| 5 | Region | boosted by: Ideology | idéologie |
| 6 | Regional Impact (région) | Obtain a bonus or penalty based on your continent | une roue par région |
| 7 | Are you landlocked? | Cut off from the coast | — |
| 8 | GDP | boosted by: Population · Size | population, taille |
| 9 | Resources | région · Determined by land size | une roue par région, plusieurs tirages |
| 10 | HDI | boosted by: GDP · Population | PIB, population |
| 11 | Army | boosted by: Population · GDP · Size · Ideology | — |
| 12 | Specialization | — | seulement pour les grandes armées |
| 13 | Active-duty personnel | classe d'armée | une échelle par classe |
| 14 | Secret Services | boosted by: GDP · Population · Army | — |
| 15 | Background | Determines your civilization's history | — |
| 16 | Great People | Determines if your nation has a brilliant mind | — |
| 17 | The Great Equalizer | Providing a boost for nations joining late | nations tardives |

Roues déclenchées par un résultat :

| Roue | Déclencheur |
|---|---|
| Lucky Streak Wheel | 3 tirages réussis de suite |
| Cursed Streak Wheel | 3 tirages ratés de suite |
| Which Empire ? puis Colonial Authority & Stability | idéologie « Colony » (remplacent la doctrine) |
| From who? | histoire « Gained its independence » |
| Who? | impact régional « Post Colonial Grudge » |
| Random Stat | résultat « Double a random stat » |

Autres règles vues :

- **No Army** : aucune roue d'effectifs n'est tirée.
- **Two Continents** : la nation est placée entre deux régions (n° 98 : Alys et Morfond). Pas de roue d'impact régional ; les ressources sont tirées sur les roues des deux régions.
- **Superpower Military** : « Max level army + All specialization ».
- **Variantes « Small » / « Big »** : certaines roues (Population, Army, GDP, HDI) portent ce sous-titre selon la taille du pays. Leur contenu n'a pas été comparé.
- **Monnaie** : « ₵ (Credits) is the game currency », « 1₵ = $1 Billion ».

## Roues communes

### Country Size — relevée

1 000, 5 000, 10 000, 15 000, 20 000, 25 000, 30 000, 35 000, 40 000, 45 000, 50 000, 60 000, 70 000, 80 000, 100 000, 150 000, 200 000, 250 000, 300 000, 400 000, 450 000, 500 000, 600 000, 700 000, 750 000, 800 000, 900 000, 1 000 000, 1 500 000, 2 000 000, 2 500 000, 3 000 000, 4 000 000, 5 000 000, 6 000 000, 7 000 000, 8 000 000, 9 000 000, 10 000 000 km², plus un segment spécial fin « Umaristan ».

Les tailles moyennes (100 000 à 800 000 km²) ont les segments les plus larges.

### Population — relevée

100 000 (?) … 500 000, 750 000 (?), 1 000 000, 1 250 000, 1 500 000, 1 750 000, 2 000 000, 2 500 000, 3 000 000, 3 500 000, 4 000 000, 4 500 000, 5 000 000, 6 000 000, 7 000 000, 8 000 000, 9 000 000, 10 000 000, 12 500 000, 15 000 000, 17 500 000, 20 000 000, 22 500 000, 25 000 000, 30 000 000, puis de 5 en 5 millions jusqu'à 100 000 000, 120 000 000, 140 000 000, 160 000 000, 180 000 000, 200 000 000, des valeurs plus hautes illisibles, et le segment « Umaristan ».

### Ideology — relevée

| Segment | Part estimée (n° 103) |
|---|---|
| Democracy | ~22 % |
| Monarchy | ~19 % |
| Communism | ~13 % |
| Authoritarianism | ~12 % |
| Imperialism | ~9 % |
| Military Rule | ~8 % |
| Theocracy | ~6 % |
| Tribalism | ~6 % |
| Colony | ~4 % |
| Anarchism | ~1 % |

Une légende du n° 92 dit : « I'm not sure I'll keep anarchism on the wheel after this spin ».

### Region — relevée

Morfond, D'Essery, Elder Essery, Azhar, Rüzelias, Tessetia, Örnavin, Alys, Southern Lands (segment noir barré, jamais tiré), et deux segments blancs fins : Two Continents, Three Continents.

Largeurs inégales et sous-titre « boosted by: Ideology » dans les tirages récents ; largeurs égales dans le n° 87.

### Are you landlocked? — relevée

No ~80 %, Yes ~20 %.

### GDP — relevée

10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 275, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750 ₵, puis des valeurs plus hautes illisibles. Quelques segments sous 10 sont illisibles.

### HDI — relevée

De 0,01 en 0,01, d'environ 0,20 à environ 0,95. Les segments de 0,39 à 0,75 sont larges, les extrêmes fins.

### Army — relevée

| Segment | Part estimée (n° 103) |
|---|---|
| Organized National Army | ~22 % |
| Basic Army | ~20 % |
| Elite Army | ~19 % |
| Regional Military Power | ~14 % |
| Small Defense Force | ~8 % |
| Local Militia | ~6 % |
| Global Military Power | ~5 % |
| Superpower Military | ~2 % |
| Civil Guard | ~2 % |
| No Army | ~1 % |

### Specialization — relevée

Land, Aerial, Naval, trois segments à peu près égaux. Vue après « Regional Military Power ».

### Secret Services — relevée

No Secret Service (1), Backyard Informants (2), Local Infiltrators (3), Wire Tappers (4), Black-Bag Squads (5), Counter-Spy Nets (6), Elite Sleeper Agents (7), Shadow Cabinet (8), The Panopticon (9), The Eyes (10).

## Political Doctrine, par idéologie — relevées

Segments égaux, deux couleurs alternées.

| Idéologie | Segments |
|---|---|
| Democracy (12) | Direct Democracy, Constitutional Republic, Civic Commonwealth, Coalition Government, Decentralized Republic, Senate Republic, Popular Assembly, The Jury State, Provincial Commonwealth, Parliamentary Republic, Presidential Republic, Federal Republic |
| Monarchy (10) | Royal Commonwealth, Twin Crown, High Kingdom, Absolute Monarchy, Constitutional Monarchy, Feudal Kingdom, Imperial Dynasty, Sacred Monarchy, Elective Kingdom, Noble Confederation |
| Communism (10) | Workers' Councils, People's Republic, Collective Union, Revolutionary Commune, Central Directorate, Industrial Commonwealth, Agrarian Collective, International Union, Permanent Revolution, Vanguard State |
| Authoritarianism (10) | Central Directorate, Security State, Executive State, Police State, Corporate State, Technocracy, Stratocracy, Cult of Personality, Secret Directorate, National Restoration |
| Imperialism (10) | Universal Empire, Conquest Empire, Colonial Empire, Maritime Empire, Continental Empire, Tributary Empire, Merchant Empire, Imperial Federation, Expansionist Dominion, Frontier Empire |
| Military Rule (10) | Defense Directorate, Iron Legion State, High Command, Military Junta, Supreme Command, War Council, Officer Republic, Fortress State, Garrison Nation, Strategic Command |
| Theocracy (12) | Citadel of Enlightenment, Divine Kingdom, Holy Synod, Temple State, Oracle Dominion, Sacred Council, Priesthood Rule, Holy Commonwealth, Celestial Mandate, Ecclesiastical State, Sacred Protectorate, Consecrated Monarchy |
| Tribalism (10), roue titrée « Tribal Tradition » | Clan Confederation, High Chieftaincy, Tribal Council, Elder Circle, Nomadic Horde, Sacred Clan, Great Migration, Blood Alliance, Warrior Clans, Ancestral Dominion |
| Anarchism (10) | Partisan Collectivism, Anarcho-Communism, Anarcho-Syndicalism, Anarcho-Capitalism, Mutualism, Green Anarchism, Individualist Anarchism, Agorism, Anarcho-Pacifism, Free Territory Movement |

### Colony : deux roues à la place de la doctrine

**Which Empire ?** (« Which imperial power reigns over your nation? ») — relevée : Symara, Bellanostra, Karsovie, Jalken, Aestria, cinq segments à peu près égaux.

**Colonial Authority & Stability** — relevée en partie. Roue de 150 à 250 segments fins en deux zones (or et noir), lisible à environ 10 % :

- Puppet government rule
- Discontented colonial militia, Bribed border guards, Divided loyalty among troops
- Factional street riots, Riots at the granaries, Rising bread riots
- Clashes with colonial police, Open clashes with guards, Widespread civil disobedience
- Secret independence council, Secret council meetings, Subversive pamphlets circulating
- Defiant regional assemblies, Militia weapon theft, Secret weapon stashes, Sabotage of supply lines
- Militia training in dark (?), Tax collector ambushes (?), Religious tensions (?)

**Complément écrit** pour cette roue (les segments lisibles sont tous du côté instable ; ceux-ci couvrent aussi le côté stable) :

- Autorité solide : Loyal colonial governor, Model colony status, Efficient colonial bureaucracy, Garrison keeps the peace, Prosperous trading company, Cooperative local elites, Settler majority in the capital, Reliable tax revenue, Missionary schools everywhere, Railway built by the empire, Colonial exhibition showcase, Viceroy beloved by settlers, Imperial language adopted, Chartered company monopoly, Loyalist native regiments
- Autorité partagée : Indirect rule through chiefs, Dual legal system, Local council with no power, Autonomy promised but delayed, Home rule debate in the capital, Tribute paid on time, Protectorate treaty renegotiated, Governor ignored outside the ports, Customary law tolerated, Native press under censorship
- Autorité contestée : Absentee governor, Smuggling runs the economy, Plantation strikes, Mutiny rumours in the barracks, Boycott of imperial goods, Exiled prince plotting abroad, Students return with new ideas, Underground newspaper, Burned customs houses, Border tribes refuse the census, Nationalist party founded, Petition to the imperial throne, Governor recalled in disgrace, Hill forts never subdued, General strike in the ports
- Rupture : Provisional government in hiding, Colonial garrison besieged, Declaration of independence drafted, Empire considers withdrawal, Open insurrection in the hinterland

## Regional Impact, par région

Vingt segments égaux sur un dégradé du rouge (malus) au bleu (bonus), avec deux ou trois segments violets de transition. Le classement bonus / malus ci-dessous suit les couleurs relevées, approximatives.

### Morfond — relevée

Pillage Economy, Impetuous Generals, Underdeveloped Hinterland, Public Target, Conquering Momentum, Tribal Warriors, Martial Regime, War Booty, Iron Discipline, Aggressive Mobility, Masters of the South, Rapid Assimilation, Shock Tactics, Forced Unity, Industrial Backwardness, Stolen Technology, Fierce Resistance, Savage Diplomacy, Unstable Administration, Naval Weakness.

### Azhar — relevée

- Malus : Skeletal Logistics, Industrial Dependence, Strategic Target, Plains of Sand, Mechanical Wear and Tear, Isolation of the Population, Asphyxiation by Convoy Blockade, Fragile Legitimacy
- Bonus : Black Gold, Desert Warriors, The Barren Immensity, Fortified Oases, Pivot Position, Warm Sea Ports, Caravan Network, Colonial Guard, Buried Wealth, Vital Importance
- Transition : Arid Desert, Rebel Colony

### Örnavin — relevée

- Bonus : Industrial Giant, Strategic Depth, Siberian Fortress, Inexhaustible Manpower, Planned Economy, Metallurgical Mass, Standardized Production, Spirit of Sacrifice, Railway Logistics, Ural Factories
- Transition : White Deserts, Technological Backwardness
- Malus : Heavy Bureaucracy, Archaic Infrastructures, Social Instability, Embryonic Navy, Regime Paranoia, Rigid Regimentation, Winter Famine, Voracious Consumption

### Elder Essery — relevée

- Bonus : Nationalist Fervor, Total Militarization, Doctrinal Elite, Intellectual Center, Mass Propaganda, Revanchism, Planned Autarky, Fanatical Youth, Total War
- Transition : Asymmetric Warfare, Diplomatic Isolation
- Malus : Raw Material Shortage, Blind Fanaticism, Suffocating Economy, Obsession with the Past, Global Threat, Ideological Purges, Compact Territory, Logistical Bottleneck, No Turning Back

### D'Essery — relevée

- Bonus : Imperial Heritage, Ancient Banking Network, Historic Citadels, Elite Officers, Old Trading Posts, Centralized Administration, Reserve Arsenal, Espionage Network, Defense of the Crown, Subtle Diplomacy
- Transition : Declining Empire, Broken Routes
- Malus : National Demoralization, Obsolete Equipment, Colonial Dependence, Static Mentality, Bureaucratic Corruption, War Debt, Demographic Crisis, Eastern Rivalry

### Tessetia — relevée

- Malus : Rival Factions, Lack of Modern Infrastructures, Commercial Asphyxiation, Corrupt Warlords, Heavy Industrial Weakness, Technical Illiteracy, Appalling Human Losses, Porous Borders
- Bonus : Treasures of Silk, Strategic Materials, Demographic Basin, Food Autonomy, Giant Internal Market, Millenary Routes, Defensive Terrain, Tradition of Resistance, Artisanal Conversion, International Support
- Transition : Imperial Prey, Mass Army Poorly Equipped

### Rüzelias — relevée (couleurs incertaines, image sombre)

- Bonus : The Arsenal of Freedom, Naval Supremacy, Land of Opportunities, Geographical Sanctuary, The Genius of Rüzerston (?), Financial Boom, Pioneer Spirit, Untouched Reserves, Giant Merchant Fleet
- Transition : Rüzelian Patent, Democratic Lethargy, Far from the Front
- Malus : Post Colonial Grudge, Initial Protectionism, Stretched Lines, Frontline Rookies, Fragmented Archipelago, Strong Trade Unionism, River Dependence, Isolationist Public Opinion

### Alys — relevée

- Malus : Asphyxiation by Blockade, War Ruins, Instability of Regime, No Strategic Depth, Dependent Economy, Cultural Tensions, Aerial Target, Multiple Fronts
- Bonus : The Lock of the World, Maritime Toll, Logistical Hub, Citadel of Alys, Commercial Intelligence, Cultural Crossroads, Coastal Arsenal, Symbol of Power, Naval Infrastructures, Cosmopolitan Wealth
- Transition : Epicenter of the Conflict, Divided Population

### Southern Lands — écrite

La région est désactivée sur la roue et n'a jamais été tirée ; rien n'indique à quoi elle ressemble. Proposition sur le modèle des autres (terres australes lointaines, froides et peu peuplées) :

- Bonus : Untouched Frontier, Whaling Fleets, Southern Fisheries, Natural Fortress, Hardy Settlers, Polar Expeditions, Far from Every War, Virgin Mineral Fields, Lighthouse Network, Self-Reliant Communities
- Transition : Endless Winter Night, Last Land on the Map
- Malus : Frozen Harbors, Supply Ships Once a Year, Sparse Population, No Industrial Base, Forgotten by the World, Brutal Storm Seasons, Scurvy and Hardship, Unmapped Interior

## Resources, par région — relevées

Toutes les régions partagent 18 ressources communes : Dirt (Sand en Azhar), Salt water, Rotten timber, Wheat, Coal, Iron ore, Copper, Lead, Bauxite, Tungsten, Manganese, Chromium, Crude oil, Natural rubber latex, Natural sulfur, High-grade quartz, Antimony, Uranium.

Chaque région ajoute un segment noir très fin, sa ressource rare, et pondère différemment les ressources communes. Les largeurs changent aussi d'un tirage à l'autre dans une même vidéo.

| Région | Ressource rare | Segments larges | Segments étroits |
|---|---|---|---|
| Morfond | Rare Earth | non relevé | non relevé |
| Azhar | Gold | Crude oil (le plus large), Sand | Tungsten, Coal, Natural rubber latex, Natural sulfur, Wheat, Lead |
| Örnavin | Titanium Ore | Dirt, Wheat, Coal, Iron ore, Lead | Salt water, Tungsten, Bauxite, Natural rubber latex, Natural sulfur |
| Elder Essery | Precious Stones | Dirt, Salt water, Rotten timber, Iron ore, Lead, High-grade quartz | Wheat, Manganese, Crude oil, Natural rubber latex, Uranium, Bauxite, Tungsten |
| D'Essery | Amber | Dirt, Salt water, Iron ore, High-grade quartz | Chromium, Crude oil, Natural rubber latex, Rotten timber, Bauxite, Tungsten, Manganese |
| Tessetia | Tea | Dirt, Rotten timber | Lead, Chromium, Crude oil |
| Rüzelias | Silver | Dirt, Natural rubber latex | Chromium, Tungsten, Manganese |
| Alys | Natural Gas | Dirt, Salt water, Copper, Chromium, Crude oil, Natural sulfur | Rotten timber, Wheat, Coal, Bauxite, Tungsten, Manganese |
| Southern Lands (écrite) | Whale Oil | Salt water, Dirt, Coal | Wheat, Natural rubber latex, Crude oil |

## Active-duty personnel, par classe d'armée

Part de la population sous les drapeaux. Toutes les échelles vont de 0,01 % à 10,00 % ; ce qui change est le découpage et la largeur des segments.

| Classe | Origine | Échelle |
|---|---|---|
| No Army | relevée | pas de roue |
| Civil Guard | relevée | chaque valeur en double en bas d'échelle : 0,01 à 0,10 par 0,01, puis 0,12 à 0,20 par 0,02, puis par 0,05 jusqu'à 1,00, puis par 0,10. Très pondérée vers les valeurs basses ; illisible au-delà de 1,5 % |
| Local Militia | écrite | même découpage que Civil Guard, sans doublons, valeurs basses larges |
| Small Defense Force | relevée | 0,01 (?) à 0,08 par 0,01, puis 0,10 à 0,35 par pas irréguliers, par 0,05 de 0,40 à 3,00, par 0,10 de 3,10 à 4,80, puis 5,00, 5,25, 5,50, 6,00, 6,50, 7,00, 8,00, 10,00. Largeurs à peu près égales |
| Basic Army | relevée | 0,01 à 1,00 par 0,05, 1,00 à 8,00 par 0,10, puis 8,20, 8,40, 8,60, 9,00, 9,50, 10,00 |
| Organized National Army, Elite Army | relevées | 0,01, puis 0,05 à 1,00 par 0,05, 1,10 à 8,00 par 0,10, puis 8,20, 8,40, 8,60, 8,80, 9,00, 9,30, 9,60, 10,00. Valeurs basses un peu plus étroites pour Elite |
| Regional Military Power | relevée | même échelle, valeurs sous 1,00 % comprimées |
| Global Military Power | écrite | même échelle, valeurs sous 1,50 % comprimées |
| Superpower Military | relevée | même échelle, valeurs sous 1,90 % réduites à des segments très fins |

## Roues de bonus et de malus — relevées

### Lucky Streak Wheel

+5, +7, +10, +15, +17, +20 HDI ; +10, +15, +20, +25, +50, +75, +100 ₵ GDP ; +10, +20, +30 Stability ; +2, +5, +7, +10, +15, +20 Million Population ; +1, +2, +3 Army Level(s) ; +1, +2, +3 Secret Service Level(s) ; Gain 1 Extra Resource ; Rare Resource Discovery ; deux segments larges « +1₵ GDP » ; un groupe de segments fins d'unités : 100 000 Troops, Tank Unit, Artillery Unit, Bomber Wing, Fighter Wing, Fleet, Submarine Fleet.

### Cursed Streak Wheel

−1, −2, −3, −5, −7, −10 HDI ; −5, −10, −15, −20, −30, −40, −50 ₵ GDP ; −1, −5, −10 Stability ; −1, −2, −3, −5, −7, −10 Million Population ; Respin Best Stat ; −1, −2, −3 Army Level(s) ; −1, −2, −3 Secret Service Level(s) ; Lose 1 Resource ; Rare Resource Depleted.

### The Great Equalizer

+10, +20, +30 Stability ; +2, +5, +7, +10, +15, +20 Million Population ; +1, +2, +3 Army Level(s) ; +1, +2, +3 Secret Service Level(s) ; Gain 1 Extra Resource ; Rare Resource Discovery ; +5, +7, +10, +15, +17, +20 HDI ; +100, +150, +200, +250 ₵ GDP, puis trois segments fins +500 (?), +750 (?), +1000 (?) ₵ GDP ; deux segments noirs larges « +10 ₵ GDP ».

Groupe de segments jaunes fins : Double a random stat (?), Respin Worst Stat (?), Annex nearest region (?), Max out a stat (?), +100 000 Troops, +10 Tank Unit, +10 Artillery Unit, +10 Bomber Wing, +10 Fighter Wing, +10 Fleet, +10 Submarine Fleet, Maximum HDI, Maximum GDP.

### Random Stat

GDP, HDI, Army, Size, Population, et un sixième segment masqué à l'écran.

## Roues des anciens empires — relevées

- **From who?** (« Which empire did you gain independence from? ») : Aestria (large), Symara, Asgardia, Bellanostra, Karsovie, Zharemdar, Jalken, Philosi Empire (noir, large), Auchkinord (fin), Enim Atthiv (fin), Ryusa (?) (très fin).
- **Who?** (« Who was your former Empire? ») : Auchkinord, Philosi Empire, Ryusa, Jalken, Aestria, Symara, Asgardia, Bellanostra, Karsovie, Zharemdar, Enim Atthiv, onze segments à peu près égaux.

Ces empires sont des nations déjà tirées dans la saison.

## Background

Plusieurs centaines de segments, illisibles même en 1080p. Seuls les résultats se lisent.

### Résultats relevés

Built monumental aqueducts, Lost its coal reserves, …developed astronomical navigation, …evolutionized local printin…, Erected a great wall, Dominated the spice trade, Built a network of fortresses, …vented the optical telegrap…, Acclaimed a child king, Gained its independence, …blished a military dictators…, Adopted the metric system, Modernized its royal army, Resisted global colonization, …elebrated national unification, …elebrated the end of a tyrann…, Founded a merchant league (?).

Tous suivent le même moule : un verbe au passé et un fait d'histoire.

### Complément écrit

- **Fondations et bâtisseurs** : Founded its capital on seven hills, Drained the great marshes, Dug a canal between two seas, Raised a cathedral over three centuries, Paved the royal roads, Built the first lighthouse of the coast, Terraced the mountain slopes, Founded a city of a hundred gates, Built a library of the known world, Carved a capital into the cliffs, Bridged the great river, Raised a wonder for a dead queen, Rebuilt its capital after the great fire, Founded a university before a parliament
- **Guerres et défenses** : Repelled three invasions in one century, Lost a war it should have won, Won independence in a single battle, Survived a hundred-year siege, Burned its own fleet to deny the enemy, Defeated an empire at a mountain pass, Was partitioned by its neighbours, Reconquered its lost provinces, Signed a humiliating peace, Fought a civil war between two brothers, Disbanded its army after the great war, Held the border for a thousand years, Sacked a rival capital, Was occupied for two generations, Trained the first professional army of the region
- **Pouvoir et institutions** : Crowned a foreign prince, Abolished its monarchy overnight, Wrote the first constitution of the continent, Was ruled by a council of merchants, Survived a century of regencies, Elected its kings for five hundred years, Overthrew a tyrant in a bloodless coup, United seven feuding clans, Restored an exiled dynasty, Granted a charter of liberties, Abolished serfdom by decree, Moved its capital three times, Was governed by a holy order, Split into two rival courts, Signed a union with its oldest enemy
- **Commerce et richesse** : Controlled the amber road, Grew rich on a salt monopoly, Minted the coin every merchant trusted, Went bankrupt building a palace, Discovered silver in the mountains, Founded trading posts on three seas, Lost its fortune in a tulip craze, Invented the letter of credit, Taxed every ship in the strait, Cornered the tea trade, Opened its ports to the world, Closed its borders for two centuries, Built the first stock exchange, Exported mercenaries to every court, Exhausted its gold mines
- **Savoirs et inventions** : Mapped the stars before its own coast, Invented a new alphabet, Perfected the blast furnace, Printed the first newspaper, Founded an academy of sciences, Built the first railway of the region, Standardized its weights and measures, Vaccinated its whole population, Laid the first undersea cable, Invented the mechanical clock, Lost its great library to fire, Translated the ancient texts, Pioneered crop rotation, Launched the first weather service, Harnessed its rivers for power
- **Peuple et société** : Survived the great plague, Welcomed refugees from three wars, Lost a third of its people to famine, Emigrated by the millions, Converted in a single generation, Kept its language under foreign rule, Settled the empty steppe, Abolished slavery before its neighbours, Rose in a peasant revolt, Celebrated a festival for a thousand years, Banned its own nobility, Urbanized in a single lifetime, Was founded by exiles, Mixed four peoples into one, Was founded by a mutinous fleet
- **Mer et découvertes** : Circumnavigated the known world, Discovered an island chain by accident, Lost an expedition to the ice, Charted the southern seas, Built a navy from nothing, Was founded by shipwrecked sailors, Ruled the waves for a century, Lost its fleet in a single storm, Opened a new route to the east, Hunted whales to the edge of the map
- **Catastrophes et hasards** : Rebuilt after a great earthquake, Was buried by a volcano, Lost its harvest to a year without summer, Flooded its own fields to stop an army, Survived a comet panic, Lost its capital to the sea, Was saved by an early winter, Drank from a poisoned river, Outlived the empire that founded it, Was forgotten by its mother country

## Great People

Plusieurs centaines de segments fins, par catégories. Lisible en partie seulement.

### Relevés

- Résultats sortis : Mass Production Architect, Broadcast Propaganda Pioneer, Automation Engineer, Desert Fox, National Poet, Aviation Daredevil.
- Catégories vues : Pioneers and Explorers, Legendary Scientists (?), Artists.
- Segments lus : Artillery Expert, Blitz Engineer (?), Flight Ace (?), Infrastructure Pioneer (?), Ballistics Technician (?), Railway Engineer (?), Aeronautical Pioneer (?), Naval Architect, Industrial Mechanist (?), Siege Specialist (?), Theoretical Physicist, Master of Logistics (?), Chemical Expert (?), Maritime Designer (?), Communications Theorist, Metallurgical Mastermind, Quantum Researcher, Epidemiologist Pioneer, War Painter, National Poet.

### Complément écrit

- **Military minds** : Mountain Warfare Strategist, Fortress Builder, Armored Cavalry Pioneer, Naval Blockade Tactician, Guerrilla Commander, Codebreaker, Field Surgeon General, Winter War Marshal, Convoy Admiral, Paratrooper Innovator
- **Scientists** : Rocket Theorist, Radio Wave Discoverer, Crop Geneticist, Vaccine Developer, Seismology Founder, Polar Meteorologist, Atomic Chemist, Deep Sea Biologist, Computing Machine Designer, Optics Master
- **Engineers and industrialists** : Canal Builder, Steel Magnate, Dam Engineer, Assembly Line Reformer, Bridge Visionary, Synthetic Fuel Chemist, Shipyard Tycoon, Telegraph Network Founder, Mining Safety Reformer, Power Grid Planner
- **Pioneers and explorers** : Polar Explorer, Desert Cartographer, Jungle Surveyor, Deep Ocean Diver, Mountain Pass Finder, Long-Distance Aviator, River Source Discoverer, Trans-Continental Rally Driver
- **Artists** : Epic Novelist, Court Composer, Monument Sculptor, Revolutionary Playwright, Folk Song Collector, Cinema Pioneer, Poster Art Master, Cathedral Architect
- **Statesmen and thinkers** : Constitutional Jurist, Land Reform Minister, Founder of the Central Bank, Peace Treaty Negotiator, Public School Reformer, Census Statistician, Free Press Champion, Diplomat of the Century

## Ce qui reste inconnu

- Le contenu des roues Background et Great People au-delà des segments listés.
- Environ 90 % de la roue Colonial Authority & Stability.
- La région Southern Lands (désactivée) et le cas Three Continents.
- Les échelles d'effectifs de Local Militia et Global Military Power.
- Les variantes « Small » / « Big » de Population, Army, GDP et HDI.
- Les largeurs exactes des segments et les règles de repondération des roues « boosted by ».
- Les tirages antérieurs au n° 63, qui peuvent utiliser d'anciennes versions des roues.
