// Roues de la saison 3 de Nation Wheel.
// Source et limites : docs/05-roues-nation-wheel.md. Les segments « relevés »
// ont été lus à l'écran sur les vidéos de la chaîne ; les blocs marqués
// « écrit » complètent ce qui est illisible ou jamais tiré. Les poids sont des
// estimations à l'œil : les vraies roues sont repondérées à chaque tirage.

export type Weighted = [label: string, weight: number];

const bell = (x: number, mu: number, sd: number) => Math.exp(-((x - mu) ** 2) / (2 * sd * sd));

/** Superficies en km². Les tailles moyennes ont les segments les plus larges. */
export const SIZES = [1e3, 5e3, 1e4, 1.5e4, 2e4, 2.5e4, 3e4, 3.5e4, 4e4, 4.5e4, 5e4, 6e4, 7e4, 8e4, 1e5, 1.5e5, 2e5, 2.5e5, 3e5, 4e5, 4.5e5, 5e5, 6e5, 7e5, 7.5e5, 8e5, 9e5,
  1e6, 1.5e6, 2e6, 2.5e6, 3e6, 4e6, 5e6, 6e6, 7e6, 8e6, 9e6, 1e7];
export const sizeWeight = (km2: number) => 0.25 + 3 * bell(Math.log10(km2), 5.5, 0.55);

/** Populations. La roue réelle va plus haut que 200 M, mais ces segments sont illisibles. */
export const POPULATIONS = [1e5, 2.5e5, 5e5, 7.5e5, 1e6, 1.25e6, 1.5e6, 1.75e6, 2e6, 2.5e6, 3e6, 3.5e6, 4e6, 4.5e6, 5e6, 6e6, 7e6, 8e6, 9e6, 1e7, 1.25e7, 1.5e7, 1.75e7, 2e7, 2.25e7, 2.5e7,
  3e7, 3.5e7, 4e7, 4.5e7, 5e7, 5.5e7, 6e7, 6.5e7, 7e7, 7.5e7, 8e7, 8.5e7, 9e7, 9.5e7, 1e8, 1.2e8, 1.4e8, 1.6e8, 1.8e8, 2e8];

/** PIB en ₵ (1 ₵ = 1 Md$). */
export const GDPS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 275, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750];

/** IDH de 0,20 à 0,95, par pas de 0,01. */
export const HDIS = Array.from({ length: 76 }, (_, i) => Math.round((0.2 + i * 0.01) * 100) / 100);

export const IDEOLOGIES: Weighted[] = [['Democracy', 22], ['Monarchy', 19], ['Communism', 13], ['Authoritarianism', 12], ['Imperialism', 9], ['Military Rule', 8], ['Theocracy', 6], ['Tribalism', 6], ['Colony', 4], ['Anarchism', 1]];

export const DOCTRINES: Record<string, string[]> = {
  Democracy: ['Direct Democracy', 'Constitutional Republic', 'Civic Commonwealth', 'Coalition Government', 'Decentralized Republic', 'Senate Republic', 'Popular Assembly', 'The Jury State', 'Provincial Commonwealth', 'Parliamentary Republic', 'Presidential Republic', 'Federal Republic'],
  Monarchy: ['Royal Commonwealth', 'Twin Crown', 'High Kingdom', 'Absolute Monarchy', 'Constitutional Monarchy', 'Feudal Kingdom', 'Imperial Dynasty', 'Sacred Monarchy', 'Elective Kingdom', 'Noble Confederation'],
  Communism: ['Workers\' Councils', 'People\'s Republic', 'Collective Union', 'Revolutionary Commune', 'Central Directorate', 'Industrial Commonwealth', 'Agrarian Collective', 'International Union', 'Permanent Revolution', 'Vanguard State'],
  Authoritarianism: ['Central Directorate', 'Security State', 'Executive State', 'Police State', 'Corporate State', 'Technocracy', 'Stratocracy', 'Cult of Personality', 'Secret Directorate', 'National Restoration'],
  Imperialism: ['Universal Empire', 'Conquest Empire', 'Colonial Empire', 'Maritime Empire', 'Continental Empire', 'Tributary Empire', 'Merchant Empire', 'Imperial Federation', 'Expansionist Dominion', 'Frontier Empire'],
  'Military Rule': ['Defense Directorate', 'Iron Legion State', 'High Command', 'Military Junta', 'Supreme Command', 'War Council', 'Officer Republic', 'Fortress State', 'Garrison Nation', 'Strategic Command'],
  Theocracy: ['Citadel of Enlightenment', 'Divine Kingdom', 'Holy Synod', 'Temple State', 'Oracle Dominion', 'Sacred Council', 'Priesthood Rule', 'Holy Commonwealth', 'Celestial Mandate', 'Ecclesiastical State', 'Sacred Protectorate', 'Consecrated Monarchy'],
  Tribalism: ['Clan Confederation', 'High Chieftaincy', 'Tribal Council', 'Elder Circle', 'Nomadic Horde', 'Sacred Clan', 'Great Migration', 'Blood Alliance', 'Warrior Clans', 'Ancestral Dominion'],
  Anarchism: ['Partisan Collectivism', 'Anarcho-Communism', 'Anarcho-Syndicalism', 'Anarcho-Capitalism', 'Mutualism', 'Green Anarchism', 'Individualist Anarchism', 'Agorism', 'Anarcho-Pacifism', 'Free Territory Movement'],
};
/** Titre de la roue de doctrine ; seule Tribalism en change. */
export const doctrineTitle = (ideology: string) => (ideology === 'Tribalism' ? 'Tribal Tradition' : 'Political Doctrine');

/** Autorité coloniale : effet sur la stabilité de départ. Le premier bloc de « contested » est relevé, le reste est écrit. */
export const COLONIAL: { kind: 'solid' | 'shared' | 'contested' | 'rupture'; stability: number; labels: string[] }[] = [
  { kind: 'solid', stability: 14, labels: ['Loyal colonial governor', 'Model colony status', 'Efficient colonial bureaucracy', 'Garrison keeps the peace', 'Prosperous trading company', 'Cooperative local elites', 'Settler majority in the capital', 'Reliable tax revenue', 'Missionary schools everywhere', 'Railway built by the empire', 'Colonial exhibition showcase', 'Viceroy beloved by settlers', 'Imperial language adopted', 'Chartered company monopoly', 'Loyalist native regiments'] },
  { kind: 'shared', stability: 4, labels: ['Puppet government rule', 'Indirect rule through chiefs', 'Dual legal system', 'Local council with no power', 'Autonomy promised but delayed', 'Home rule debate in the capital', 'Tribute paid on time', 'Protectorate treaty renegotiated', 'Governor ignored outside the ports', 'Customary law tolerated', 'Native press under censorship'] },
  { kind: 'contested', stability: -12, labels: ['Discontented colonial militia', 'Bribed border guards', 'Divided loyalty among troops', 'Factional street riots', 'Riots at the granaries', 'Rising bread riots', 'Clashes with colonial police', 'Open clashes with guards', 'Widespread civil disobedience', 'Secret independence council', 'Secret council meetings', 'Subversive pamphlets circulating', 'Defiant regional assemblies', 'Militia weapon theft', 'Secret weapon stashes', 'Sabotage of supply lines', 'Militia training in dark', 'Tax collector ambushes', 'Religious tensions',
    'Absentee governor', 'Smuggling runs the economy', 'Plantation strikes', 'Mutiny rumours in the barracks', 'Boycott of imperial goods', 'Exiled prince plotting abroad', 'Students return with new ideas', 'Underground newspaper', 'Burned customs houses', 'Border tribes refuse the census', 'Nationalist party founded', 'Petition to the imperial throne', 'Governor recalled in disgrace', 'Hill forts never subdued', 'General strike in the ports'] },
  { kind: 'rupture', stability: -24, labels: ['Provisional government in hiding', 'Colonial garrison besieged', 'Declaration of independence drafted', 'Empire considers withdrawal', 'Open insurrection in the hinterland'] },
];

/** Régions actives sur la roue. « Southern Lands » y est désactivée et n'est pas tirée ici non plus. */
export const REGIONS = ['Morfond', 'D\'Essery', 'Elder Essery', 'Azhar', 'Rüzelias', 'Tessetia', 'Örnavin', 'Alys'];
/** Segments affichés sur la roue des régions (les deux derniers ne sortent jamais dans le simulateur). */
export const REGION_WHEEL: Weighted[] = [...REGIONS.map((r): Weighted => [r, 10]), ['Two Continents', 2], ['Three Continents', 1]];

/** Impact régional : bonus, malus et segments de transition (sans effet). Le classement de Morfond est le mien, celui des autres suit les couleurs relevées. */
export const IMPACTS: Record<string, { bonus: string[]; malus: string[]; mixed: string[] }> = {
  Morfond: {
    bonus: ['Conquering Momentum', 'Tribal Warriors', 'Martial Regime', 'War Booty', 'Iron Discipline', 'Aggressive Mobility', 'Masters of the South', 'Rapid Assimilation', 'Shock Tactics', 'Fierce Resistance'],
    malus: ['Pillage Economy', 'Impetuous Generals', 'Underdeveloped Hinterland', 'Public Target', 'Industrial Backwardness', 'Savage Diplomacy', 'Unstable Administration', 'Naval Weakness'],
    mixed: ['Forced Unity', 'Stolen Technology'],
  },
  Azhar: {
    bonus: ['Black Gold', 'Desert Warriors', 'The Barren Immensity', 'Fortified Oases', 'Pivot Position', 'Warm Sea Ports', 'Caravan Network', 'Colonial Guard', 'Buried Wealth', 'Vital Importance'],
    malus: ['Skeletal Logistics', 'Industrial Dependence', 'Strategic Target', 'Plains of Sand', 'Mechanical Wear and Tear', 'Isolation of the Population', 'Asphyxiation by Convoy Blockade', 'Fragile Legitimacy'],
    mixed: ['Arid Desert', 'Rebel Colony'],
  },
  'Örnavin': {
    bonus: ['Industrial Giant', 'Strategic Depth', 'Siberian Fortress', 'Inexhaustible Manpower', 'Planned Economy', 'Metallurgical Mass', 'Standardized Production', 'Spirit of Sacrifice', 'Railway Logistics', 'Ural Factories'],
    malus: ['Heavy Bureaucracy', 'Archaic Infrastructures', 'Social Instability', 'Embryonic Navy', 'Regime Paranoia', 'Rigid Regimentation', 'Winter Famine', 'Voracious Consumption'],
    mixed: ['White Deserts', 'Technological Backwardness'],
  },
  'Elder Essery': {
    bonus: ['Nationalist Fervor', 'Total Militarization', 'Doctrinal Elite', 'Intellectual Center', 'Mass Propaganda', 'Revanchism', 'Planned Autarky', 'Fanatical Youth', 'Total War'],
    malus: ['Raw Material Shortage', 'Blind Fanaticism', 'Suffocating Economy', 'Obsession with the Past', 'Global Threat', 'Ideological Purges', 'Compact Territory', 'Logistical Bottleneck', 'No Turning Back'],
    mixed: ['Asymmetric Warfare', 'Diplomatic Isolation'],
  },
  'D\'Essery': {
    bonus: ['Imperial Heritage', 'Ancient Banking Network', 'Historic Citadels', 'Elite Officers', 'Old Trading Posts', 'Centralized Administration', 'Reserve Arsenal', 'Espionage Network', 'Defense of the Crown', 'Subtle Diplomacy'],
    malus: ['National Demoralization', 'Obsolete Equipment', 'Colonial Dependence', 'Static Mentality', 'Bureaucratic Corruption', 'War Debt', 'Demographic Crisis', 'Eastern Rivalry'],
    mixed: ['Declining Empire', 'Broken Routes'],
  },
  Tessetia: {
    bonus: ['Treasures of Silk', 'Strategic Materials', 'Demographic Basin', 'Food Autonomy', 'Giant Internal Market', 'Millenary Routes', 'Defensive Terrain', 'Tradition of Resistance', 'Artisanal Conversion', 'International Support'],
    malus: ['Rival Factions', 'Lack of Modern Infrastructures', 'Commercial Asphyxiation', 'Corrupt Warlords', 'Heavy Industrial Weakness', 'Technical Illiteracy', 'Appalling Human Losses', 'Porous Borders'],
    mixed: ['Imperial Prey', 'Mass Army Poorly Equipped'],
  },
  'Rüzelias': {
    bonus: ['The Arsenal of Freedom', 'Naval Supremacy', 'Land of Opportunities', 'Geographical Sanctuary', 'The Genius of Rüzerston', 'Financial Boom', 'Pioneer Spirit', 'Untouched Reserves', 'Giant Merchant Fleet'],
    malus: ['Post Colonial Grudge', 'Initial Protectionism', 'Stretched Lines', 'Frontline Rookies', 'Fragmented Archipelago', 'Strong Trade Unionism', 'River Dependence', 'Isolationist Public Opinion'],
    mixed: ['Rüzelian Patent', 'Democratic Lethargy', 'Far from the Front'],
  },
  Alys: {
    bonus: ['The Lock of the World', 'Maritime Toll', 'Logistical Hub', 'Citadel of Alys', 'Commercial Intelligence', 'Cultural Crossroads', 'Coastal Arsenal', 'Symbol of Power', 'Naval Infrastructures', 'Cosmopolitan Wealth'],
    malus: ['Asphyxiation by Blockade', 'War Ruins', 'Instability of Regime', 'No Strategic Depth', 'Dependent Economy', 'Cultural Tensions', 'Aerial Target', 'Multiple Fronts'],
    mixed: ['Epicenter of the Conflict', 'Divided Population'],
  },
};

/** Les 18 ressources communes à toutes les régions (« Dirt » devient « Sand » en Azhar). */
export const COMMON_RESOURCES = ['Dirt', 'Salt water', 'Rotten timber', 'Wheat', 'Coal', 'Iron ore', 'Copper', 'Lead', 'Bauxite', 'Tungsten', 'Manganese', 'Chromium', 'Crude oil', 'Natural rubber latex', 'Natural sulfur', 'High-grade quartz', 'Antimony', 'Uranium'];
/** Ressource rare de chaque région, puis segments larges et étroits relevés. */
export const REGION_RESOURCES: Record<string, { rare: string; large: string[]; narrow: string[] }> = {
  Morfond: { rare: 'Rare Earth', large: [], narrow: [] },
  Azhar: { rare: 'Gold', large: ['Crude oil', 'Dirt'], narrow: ['Tungsten', 'Coal', 'Natural rubber latex', 'Natural sulfur', 'Wheat', 'Lead'] },
  'Örnavin': { rare: 'Titanium Ore', large: ['Dirt', 'Wheat', 'Coal', 'Iron ore', 'Lead'], narrow: ['Salt water', 'Tungsten', 'Bauxite', 'Natural rubber latex', 'Natural sulfur'] },
  'Elder Essery': { rare: 'Precious Stones', large: ['Dirt', 'Salt water', 'Rotten timber', 'Iron ore', 'Lead', 'High-grade quartz'], narrow: ['Wheat', 'Manganese', 'Crude oil', 'Natural rubber latex', 'Uranium', 'Bauxite', 'Tungsten'] },
  'D\'Essery': { rare: 'Amber', large: ['Dirt', 'Salt water', 'Iron ore', 'High-grade quartz'], narrow: ['Chromium', 'Crude oil', 'Natural rubber latex', 'Rotten timber', 'Bauxite', 'Tungsten', 'Manganese'] },
  Tessetia: { rare: 'Tea', large: ['Dirt', 'Rotten timber'], narrow: ['Lead', 'Chromium', 'Crude oil'] },
  'Rüzelias': { rare: 'Silver', large: ['Dirt', 'Natural rubber latex'], narrow: ['Chromium', 'Tungsten', 'Manganese'] },
  Alys: { rare: 'Natural Gas', large: ['Dirt', 'Salt water', 'Copper', 'Chromium', 'Crude oil', 'Natural sulfur'], narrow: ['Rotten timber', 'Wheat', 'Coal', 'Bauxite', 'Tungsten', 'Manganese'] },
};
export function resourceWheel(region: string): Weighted[] {
  const r = REGION_RESOURCES[region] ?? REGION_RESOURCES.Morfond;
  const name = (x: string) => (x === 'Dirt' && region === 'Azhar' ? 'Sand' : x);
  return [...COMMON_RESOURCES.map((x): Weighted => [name(x), r.large.includes(x) ? 9 : r.narrow.includes(x) ? 3 : 5.5]), [r.rare, 1]];
}
/** Ressources de la roue qui correspondent à un gisement du moteur. */
export const RESOURCE_DEPOSIT: Record<string, string> = { 'Crude oil': 'oil', 'Natural Gas': 'gas', Coal: 'coal', 'Iron ore': 'iron', Copper: 'copper', Gold: 'gold', 'Rare Earth': 'rare_earths', Uranium: 'uranium' };

/** Valeur économique d'une ressource tirée qui n'est pas un gisement de la carte : matières industrielles 0,5, ressources rares 1, rebuts 0. */
export function resourceValue(res: string): number {
  if (RESOURCE_DEPOSIT[res] || ['Dirt', 'Sand', 'Salt water', 'Rotten timber'].includes(res)) return 0;
  return Object.values(REGION_RESOURCES).some((r) => r.rare === res) ? 1 : 0.5;
}

/** Catégorie d'une grande figure, déduite de son titre : elle donne un petit avantage de départ. */
export function greatKind(great: string): 'military' | 'science' | 'industry' | 'explorer' | 'arts' | 'state' {
  if (/Artillery|Blitz|Flight Ace|Ballistics|Siege|Logistics|Fox|Warfare|Fortress|Cavalry|Blockade|Guerrilla|Codebreaker|Surgeon|Marshal|Admiral|Paratrooper|Daredevil/.test(great)) return 'military';
  if (/Physicist|Chemi|Quantum|Epidemiolog|Rocket|Radio|Genetic|Vaccine|Seismolog|Meteorolog|Biologist|Computing|Optics|Theorist/.test(great)) return 'science';
  if (/Explorer|Cartographer|Surveyor|Diver|Pass Finder|Aviator|Discoverer|Rally/.test(great)) return 'explorer';
  if (/Poet|Painter|Novelist|Composer|Sculptor|Playwright|Folk|Cinema|Poster|Cathedral|Propaganda/.test(great)) return 'arts';
  if (/Jurist|Minister|Bank|Negotiator|Reformer|Statistician|Press|Diplomat/.test(great)) return 'state';
  return 'industry';
}

/** Classes d'armée : poids de base et note équivalente sur 11 dans le moteur. */
export const ARMIES: { label: string; weight: number; rating: number }[] = [
  { label: 'No Army', weight: 1, rating: 0 }, { label: 'Civil Guard', weight: 2, rating: 1 }, { label: 'Local Militia', weight: 6, rating: 2 },
  { label: 'Small Defense Force', weight: 8, rating: 3 }, { label: 'Basic Army', weight: 20, rating: 4 }, { label: 'Organized National Army', weight: 22, rating: 5 },
  { label: 'Elite Army', weight: 19, rating: 7 }, { label: 'Regional Military Power', weight: 14, rating: 8 }, { label: 'Global Military Power', weight: 5, rating: 10 },
  { label: 'Superpower Military', weight: 2, rating: 11 },
];
export const SPECIALIZATIONS = ['Land', 'Aerial', 'Naval'];

/** Part de la population sous les drapeaux, en %. Même étendue pour toutes les classes ; seule la pondération change. */
export const ACTIVE_DUTY = [0.01, ...Array.from({ length: 20 }, (_, i) => (i + 1) * 0.05), ...Array.from({ length: 70 }, (_, i) => 1.1 + i * 0.1), 8.2, 8.4, 8.6, 8.8, 9, 9.3, 9.6, 10].map((x) => Math.round(x * 100) / 100);
/** Les petites classes penchent vers les valeurs basses, les grandes écrasent le bas de l'échelle. */
export function activeDutyWeight(army: string, pct: number): number {
  const rating = ARMIES.find((a) => a.label === army)?.rating ?? 4;
  if (rating <= 2) return 0.15 + 4 * bell(pct, 0.2, 0.5);
  if (rating === 3) return 0.4 + 2 * bell(pct, 1, 1.2);
  if (rating >= 10) return pct < 1.5 ? 0.08 : 1;
  if (rating >= 8) return pct < 1 ? 0.2 : 1;
  return 1;
}

export const SECRET_SERVICES = ['No Secret Service (1)', 'Backyard Informants (2)', 'Local Infiltrators (3)', 'Wire Tappers (4)', 'Black-Bag Squads (5)', 'Counter-Spy Nets (6)', 'Elite Sleeper Agents (7)', 'Shadow Cabinet (8)', 'The Panopticon (9)', 'The Eyes (10)'];

/** Histoire de la nation. Les premiers sont relevés (résultats lisibles en entier), les autres écrits sur le même moule. */
export const BACKGROUNDS = [
  'Built monumental aqueducts', 'Lost its coal reserves', 'Erected a great wall', 'Dominated the spice trade', 'Built a network of fortresses', 'Acclaimed a child king', 'Gained its independence', 'Adopted the metric system', 'Modernized its royal army', 'Resisted global colonization', 'Founded a merchant league',
  'Developed astronomical navigation', 'Revolutionized local printing', 'Invented the optical telegraph', 'Established a military dictatorship', 'Celebrated national unification', 'Celebrated the end of a tyranny',
  'Founded its capital on seven hills', 'Drained the great marshes', 'Dug a canal between two seas', 'Raised a cathedral over three centuries', 'Paved the royal roads', 'Built the first lighthouse of the coast', 'Terraced the mountain slopes', 'Founded a city of a hundred gates', 'Built a library of the known world', 'Carved a capital into the cliffs', 'Bridged the great river', 'Raised a wonder for a dead queen', 'Rebuilt its capital after the great fire', 'Founded a university before a parliament',
  'Repelled three invasions in one century', 'Lost a war it should have won', 'Won independence in a single battle', 'Survived a hundred-year siege', 'Burned its own fleet to deny the enemy', 'Defeated an empire at a mountain pass', 'Was partitioned by its neighbours', 'Reconquered its lost provinces', 'Signed a humiliating peace', 'Fought a civil war between two brothers', 'Disbanded its army after the great war', 'Held the border for a thousand years', 'Sacked a rival capital', 'Was occupied for two generations', 'Trained the first professional army of the region',
  'Crowned a foreign prince', 'Abolished its monarchy overnight', 'Wrote the first constitution of the continent', 'Was ruled by a council of merchants', 'Survived a century of regencies', 'Elected its kings for five hundred years', 'Overthrew a tyrant in a bloodless coup', 'United seven feuding clans', 'Restored an exiled dynasty', 'Granted a charter of liberties', 'Abolished serfdom by decree', 'Moved its capital three times', 'Was governed by a holy order', 'Split into two rival courts', 'Signed a union with its oldest enemy',
  'Controlled the amber road', 'Grew rich on a salt monopoly', 'Minted the coin every merchant trusted', 'Went bankrupt building a palace', 'Discovered silver in the mountains', 'Founded trading posts on three seas', 'Lost its fortune in a tulip craze', 'Invented the letter of credit', 'Taxed every ship in the strait', 'Cornered the tea trade', 'Opened its ports to the world', 'Closed its borders for two centuries', 'Built the first stock exchange', 'Exported mercenaries to every court', 'Exhausted its gold mines',
  'Mapped the stars before its own coast', 'Invented a new alphabet', 'Perfected the blast furnace', 'Printed the first newspaper', 'Founded an academy of sciences', 'Built the first railway of the region', 'Standardized its weights and measures', 'Vaccinated its whole population', 'Laid the first undersea cable', 'Invented the mechanical clock', 'Lost its great library to fire', 'Translated the ancient texts', 'Pioneered crop rotation', 'Launched the first weather service', 'Harnessed its rivers for power',
  'Survived the great plague', 'Welcomed refugees from three wars', 'Lost a third of its people to famine', 'Emigrated by the millions', 'Converted in a single generation', 'Kept its language under foreign rule', 'Settled the empty steppe', 'Abolished slavery before its neighbours', 'Rose in a peasant revolt', 'Celebrated a festival for a thousand years', 'Banned its own nobility', 'Urbanized in a single lifetime', 'Was founded by exiles', 'Mixed four peoples into one', 'Was founded by a mutinous fleet',
  'Circumnavigated the known world', 'Discovered an island chain by accident', 'Lost an expedition to the ice', 'Charted the southern seas', 'Built a navy from nothing', 'Was founded by shipwrecked sailors', 'Ruled the waves for a century', 'Lost its fleet in a single storm', 'Opened a new route to the east', 'Hunted whales to the edge of the map',
  'Rebuilt after a great earthquake', 'Was buried by a volcano', 'Lost its harvest to a year without summer', 'Flooded its own fields to stop an army', 'Survived a comet panic', 'Lost its capital to the sea', 'Was saved by an early winter', 'Drank from a poisoned river', 'Outlived the empire that founded it', 'Was forgotten by its mother country',
];

/** Grandes figures. Les deux premières lignes sont relevées, les autres écrites. */
export const GREAT_PEOPLE = [
  'Mass Production Architect', 'Broadcast Propaganda Pioneer', 'Automation Engineer', 'Desert Fox', 'National Poet', 'Aviation Daredevil',
  'Artillery Expert', 'Blitz Engineer', 'Flight Ace', 'Infrastructure Pioneer', 'Ballistics Technician', 'Railway Engineer', 'Aeronautical Pioneer', 'Naval Architect', 'Industrial Mechanist', 'Siege Specialist', 'Theoretical Physicist', 'Master of Logistics', 'Chemical Expert', 'Maritime Designer', 'Communications Theorist', 'Metallurgical Mastermind', 'Quantum Researcher', 'Epidemiologist Pioneer', 'War Painter',
  'Mountain Warfare Strategist', 'Fortress Builder', 'Armored Cavalry Pioneer', 'Naval Blockade Tactician', 'Guerrilla Commander', 'Codebreaker', 'Field Surgeon General', 'Winter War Marshal', 'Convoy Admiral', 'Paratrooper Innovator',
  'Rocket Theorist', 'Radio Wave Discoverer', 'Crop Geneticist', 'Vaccine Developer', 'Seismology Founder', 'Polar Meteorologist', 'Atomic Chemist', 'Deep Sea Biologist', 'Computing Machine Designer', 'Optics Master',
  'Canal Builder', 'Steel Magnate', 'Dam Engineer', 'Assembly Line Reformer', 'Bridge Visionary', 'Synthetic Fuel Chemist', 'Shipyard Tycoon', 'Telegraph Network Founder', 'Mining Safety Reformer', 'Power Grid Planner',
  'Polar Explorer', 'Desert Cartographer', 'Jungle Surveyor', 'Deep Ocean Diver', 'Mountain Pass Finder', 'Long-Distance Aviator', 'River Source Discoverer', 'Trans-Continental Rally Driver',
  'Epic Novelist', 'Court Composer', 'Monument Sculptor', 'Revolutionary Playwright', 'Folk Song Collector', 'Cinema Pioneer', 'Poster Art Master', 'Cathedral Architect',
  'Constitutional Jurist', 'Land Reform Minister', 'Founder of the Central Bank', 'Peace Treaty Negotiator', 'Public School Reformer', 'Census Statistician', 'Free Press Champion', 'Diplomat of the Century',
];

const fr = (x: number) => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
export const sizeLabel = (km2: number) => `${fr(km2)} km2`;
export const popLabel = (pop: number) => fr(pop);
export const gdpLabel = (gdp: number) => `${gdp} ₵`;
export const hdiLabel = (hdi: number) => hdi.toFixed(2);
export const pctLabel = (pct: number) => `${pct.toFixed(2)}%`;
