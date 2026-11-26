// Nations de la saison 1 de Nation Wheel, telles que tirées à la roue.
// Source : tableau « Current Nations » du wiki communautaire
// https://nation-wheel.fandom.com/wiki/Current_Nations (contenu sous licence CC BY-SA),
// relevé le 26 novembre 2026. Les valeurs sont celles du tirage ; le simulateur les
// fait ensuite évoluer.

export interface RosterEntry {
  spin: number;
  name: string;
  pop: number;
  /** Régime tel que tiré à la roue. */
  gov: string;
  /** km² ; null si inconnu. */
  area: number | null;
  /** Md$ ; null si le tirage ne donnait pas de valeur. */
  gdp: number | null;
  economy: string;
  military: string;
  /** Note militaire sur 11 ; -1 si inconnue. */
  rating: number;
  status: string;
  bloc: string;
  tags: string[];
}

export const SEASON1: RosterEntry[] = [
  {"spin": 1,"name": "Hansan","pop": 957000000.0,"gov": "Empire","area": 500000.0,"gdp": null,"economy": "Tech & Oil","military": "Large","rating": 5,"status": "Colony of Moravia","bloc": "Defence Accords","tags": []},
  {"spin": 2,"name": "Melandia","pop": 750000000.0,"gov": "Monarchy","area": 6000000.0,"gdp": null,"economy": "Geothermal / Gems","military": "Air Superpower","rating": 7,"status": "War (vs Lithuania)","bloc": "","tags": []},
  {"spin": 3,"name": "Isma","pop": 1000000.0,"gov": "Fallen Empire","area": 500000.0,"gdp": null,"economy": "Finance / Gems","military": "None","rating": 0,"status": "War (vs Vladaria)","bloc": "","tags": ["pacifist"]},
  {"spin": 4,"name": "Yoggy","pop": 60000000.0,"gov": "Junta","area": 900000.0,"gdp": null,"economy": "Textiles / Minerals","military": "Naval Superpower","rating": 7,"status": "Hostile (vs Zandoro)","bloc": "","tags": ["maritime"]},
  {"spin": 5,"name": "Liberterra (Ourterra)","pop": 150000000.0,"gov": "Democracy now Communist","area": 100000.0,"gdp": null,"economy": "Freshwater","military": "Small Defensive","rating": 2,"status": "Freeze (vs Imeria)","bloc": "Novus Ordo Mundi","tags": ["democratic"]},
  {"spin": 6,"name": "Belvion","pop": 80000000.0,"gov": "Republic","area": 600000.0,"gdp": null,"economy": "Energy / Textiles","military": "Continental Power","rating": 9,"status": "War (vs Freelandia)","bloc": "","tags": []},
  {"spin": 7,"name": "Fredya","pop": 400000000.0,"gov": "Technocracy","area": 400000.0,"gdp": 2500.0,"economy": "Manuf. / Fire god","military": "Medium","rating": 4,"status": "Techno-Magic","bloc": "","tags": ["religious"]},
  {"spin": 8,"name": "Nordmere","pop": 30000000.0,"gov": "Constitutional Monarchy","area": 400000.0,"gdp": 150.0,"economy": "Green Economy","military": "Small","rating": 2,"status": "Rival (Shadow Conf.)","bloc": "Novus Ordo Mundi","tags": ["green"]},
  {"spin": 9,"name": "Catomane","pop": 50000000.0,"gov": "Stratocracy","area": 400000.0,"gdp": 5000.0,"economy": "Innovation / Fire god","military": "Special Forces","rating": 7,"status": "Tension (vs Omaleko)","bloc": "Novus Ordo Mundi","tags": ["religious"]},
  {"spin": 10,"name": "Dalgaristan","pop": 175000000.0,"gov": "Socialist Republic","area": 900000.0,"gdp": 2000.0,"economy": "Surveillance","military": "Advanced","rating": 6,"status": "Former War (vs URHNB)","bloc": "POF Alliance","tags": []},
  {"spin": 11,"name": "N. Lights","pop": 40000000.0,"gov": "Ritualistic Kingdom","area": 800000.0,"gdp": 100.0,"economy": "Pharma","military": "Continental Power","rating": 9,"status": "Dual Rituals","bloc": "","tags": []},
  {"spin": 12,"name": "Moradior","pop": 175000000.0,"gov": "Robotic Dominion","area": 750000.0,"gdp": 2500.0,"economy": "Robotics","military": "Regional Power","rating": 8,"status": "War (vs Rei-Kai)","bloc": "Defence Accords","tags": ["cyber"]},
  {"spin": 13,"name": "Great Lithuania","pop": 60000000.0,"gov": "Expansionist Republic","area": 1000000.0,"gdp": 50.0,"economy": "Healthcare","military": "Expansionist","rating": 10,"status": "War (vs Melandia)","bloc": "","tags": ["expansionist"]},
  {"spin": 14,"name": "Maronia","pop": 100000000.0,"gov": "Traditional Kingdom","area": 9000000.0,"gdp": 700.0,"economy": "Agriculture / Mythology","military": "Air Superpower","rating": 7,"status": "Freeze (vs Belvion)","bloc": "","tags": ["religious"]},
  {"spin": 15,"name": "Daroille","pop": 15000000.0,"gov": "Corporate Confederation","area": 100000.0,"gdp": 3000.0,"economy": "Casinos","military": "Medium","rating": 4,"status": "Allied (Qashira)","bloc": "Novus Ordo Mundi","tags": ["wealthy"]},
  {"spin": 16,"name": "Torenza","pop": 50000000.0,"gov": "Authoritarian Republic","area": 600000.0,"gdp": 6000.0,"economy": "Space / Human","military": "Expansionist","rating": 10,"status": "Allied (Primis)","bloc": "Defence Accords","tags": []},
  {"spin": 17,"name": "Imeria","pop": 5000000.0,"gov": "Colony - Feudal Warlords","area": 10000.0,"gdp": 400.0,"economy": "Warlords","military": "Standard","rating": 3,"status": "Colony of Vienzerna","bloc": "","tags": []},
  {"spin": 18,"name": "Wonderia","pop": 80000000.0,"gov": "Colony - Cybernetic Regency","area": 750000.0,"gdp": 400.0,"economy": "Cybernetics","military": "Cyber Hegemony / Cyberwarfare","rating": 11,"status": "Prot. of Yoggy","bloc": "","tags": ["cyber"]},
  {"spin": 19,"name": "B. Obrero","pop": 750000.0,"gov": "Progressive Union","area": 50000.0,"gdp": 0.5,"economy": "Church Tax","military": "Standard","rating": 3,"status": "PARIAH","bloc": "HATED BY ALL","tags": ["religious"]},
  {"spin": 20,"name": "Vienzerna","pop": 125000000.0,"gov": "Trade Empire","area": 750000.0,"gdp": 3500.0,"economy": "Guilds","military": "Expansionist","rating": 10,"status": "Colonizer","bloc": "","tags": []},
  {"spin": 21,"name": "Vladaria","pop": 5000000.0,"gov": "Theocratic Kingdom","area": 200000.0,"gdp": 1.0,"economy": "AI - / Ditopism","military": "Standard","rating": 3,"status": "War (vs Isma)","bloc": "Royal Wedding alliance","tags": ["cyber"]},
  {"spin": 22,"name": "Bernaland","pop": 5000000.0,"gov": "Federal Republic","area": 200000.0,"gdp": 1.0,"economy": "Robotics","military": "Standard","rating": 3,"status": "Allied (Scopeople)","bloc": "Novus Ordo Mundi","tags": ["cyber","democratic"]},
  {"spin": 23,"name": "Plesshurye","pop": 500000000.0,"gov": "Democratic Republic","area": 800000.0,"gdp": 6000.0,"economy": "Finance / Space","military": "Spatial Superpower","rating": 7,"status": "Exploration Culture","bloc": "","tags": []},
  {"spin": 24,"name": "Rei-Kai","pop": 70000000.0,"gov": "Fascist Empire","area": 500000.0,"gdp": 7000.0,"economy": "Biotech","military": "Advanced","rating": 6,"status": "War (vs Moradior)","bloc": "POF Alliance","tags": []},
  {"spin": 25,"name": "Zharak-Ten","pop": 200000000.0,"gov": "Maritime Democracy","area": 900000.0,"gdp": 500.0,"economy": "Fish / Ent. / / Shamanic","military": "Advanced","rating": 6,"status": "Allied (Navatonia)","bloc": "Novus Ordo Mundi","tags": ["maritime","religious"]},
  {"spin": 26,"name": "Zottegem","pop": 30000000.0,"gov": "Financial Oligarchy","area": 400000.0,"gdp": 40.0,"economy": "Shadow Bank","military": "Small Defensive","rating": 2,"status": "Allied (Moradior)","bloc": "Defence Accords","tags": ["wealthy"]},
  {"spin": 27,"name": "Fish State","pop": 25000000.0,"gov": "Naval Junta","area": 300000.0,"gdp": 400.0,"economy": "Maritime","military": "Large","rating": 5,"status": "War (vs Imeria)","bloc": "","tags": ["maritime"]},
  {"spin": 28,"name": "Anuruthor","pop": 40000000.0,"gov": "Protectorate","area": 500000.0,"gdp": 1000.0,"economy": "Heavy Industry","military": "Small Defensive","rating": 2,"status": "Rival (vs Rei-Kai)","bloc": "","tags": []},
  {"spin": 29,"name": "Shadow Conf.","pop": 175000000.0,"gov": "Pirate Confederation","area": 500000.0,"gdp": 1500.0,"economy": "Piracy","military": "Large","rating": 5,"status": "Rival (vs Nordmere)","bloc": "","tags": ["maritime"]},
  {"spin": 30,"name": "Tunguska","pop": 750000.0,"gov": "Colony - Clan Council","area": 175000.0,"gdp": 200.0,"economy": "Ritual Tour.","military": "Small Defensive","rating": 2,"status": "Colony of U. Tribes","bloc": "Novus Ordo Mundi","tags": []},
  {"spin": 31,"name": "C. Ranchers","pop": 10000000.0,"gov": "Anarchist Commune","area": 100000.0,"gdp": 5.0,"economy": "Ranching","military": "Regional Influence Army","rating": 8,"status": "Anarchist","bloc": "Royal Wedding alliance","tags": ["nuclear"]},
  {"spin": 32,"name": "Solaria","pop": 100000000.0,"gov": "Federal Empire","area": 60000.0,"gdp": 9000.0,"economy": "Shadow Banking","military": "Large","rating": 5,"status": "Defense Pact (Dalgaristan)","bloc": "POF Alliance","tags": []},
  {"spin": 33,"name": "Skressia","pop": 15000000.0,"gov": "Drone Republic","area": 1000.0,"gdp": 50.0,"economy": "Drones","military": "Standard","rating": 3,"status": "War (vs Azur Axis)","bloc": "","tags": []},
  {"spin": 34,"name": "Moravia","pop": 900000000.0,"gov": "Cyber-Dictatorship","area": 3000000.0,"gdp": 8000.0,"economy": "Cyber / Loans","military": "WORLD MENACE","rating": 11,"status": "War (vs Golden Land)","bloc": "Defence Accords","tags": ["cyber"]},
  {"spin": 35,"name": "ABOC","pop": 700000000.0,"gov": "Decentralized Union","area": 90000.0,"gdp": 1000.0,"economy": "Waste Mgt","military": "None","rating": 0,"status": "Trade (Rei-Kai)","bloc": "","tags": ["nuclear"]},
  {"spin": 36,"name": "Voidia","pop": 40000000.0,"gov": "Agrarian Monarchy","area": 200000.0,"gdp": 500.0,"economy": "Agriculture - Alien Cult","military": "Continental Power","rating": 9,"status": "Freeze (vs Maronia)","bloc": "","tags": []},
  {"spin": 37,"name": "Runonno","pop": 25000000.0,"gov": "Military Superstate","area": 800000.0,"gdp": 1000.0,"economy": "Security","military": "Land Superpower","rating": 7,"status": "VS EVERYONE","bloc": "","tags": ["nuclear"]},
  {"spin": 38,"name": "Azur Axis","pop": 40000000.0,"gov": "AI Corporatocracy","area": 500000.0,"gdp": 900.0,"economy": "Shell / AI","military": "Small Defensive","rating": 2,"status": "War (vs Skressia)","bloc": "","tags": ["cyber"]},
  {"spin": 39,"name": "Freelandia","pop": 15000000.0,"gov": "Industrial Republic","area": 350000.0,"gdp": 900.0,"economy": "Heavy Ind.","military": "Regional Power","rating": 8,"status": "War (vs Belvion)","bloc": "","tags": []},
  {"spin": 40,"name": "Aragon","pop": 80000000.0,"gov": "Media Monarchy","area": 350000.0,"gdp": 3000.0,"economy": "Entertainment","military": "Continental Power","rating": 9,"status": "Allied (Whiterun)","bloc": "Novus Ordo Mundi","tags": ["wealthy"]},
  {"spin": 41,"name": "Scopeople","pop": 30000000.0,"gov": "Tribal Kingdom","area": 175000.0,"gdp": 1.0,"economy": "Local Trade","military": "None","rating": 0,"status": "Allied (Bernaland)","bloc": "Novus Ordo Mundi","tags": []},
  {"spin": 42,"name": "Aura Sancta","pop": 500000000.0,"gov": "Empire","area": 12000000.0,"gdp": 10000.0,"economy": "Tourism","military": "WORLD POLICE","rating": 11,"status": "World Peace Doctrine","bloc": "Novus Ordo Mundi","tags": []},
  {"spin": 43,"name": "Navatonia","pop": 300000000.0,"gov": "Shamanic Republic","area": 750000.0,"gdp": 3000.0,"economy": "Mining / Shaman","military": "Regional Power","rating": 8,"status": "Allied (Zharak-Ten)","bloc": "Novus Ordo Mundi","tags": ["religious"]},
  {"spin": 44,"name": "Abolitionist G.","pop": 200000000.0,"gov": "Guild Republic","area": 75000.0,"gdp": 9000.0,"economy": "Black Market","military": "Continental Power","rating": 9,"status": "PARIAH","bloc": "HATED BY ALL","tags": []},
  {"spin": 45,"name": "Golden Land","pop": 25000000.0,"gov": "Mercantile Democracy","area": 125000.0,"gdp": 3000.0,"economy": "Grey Market","military": "Continental Power","rating": 9,"status": "War (vs Moravia)","bloc": "","tags": []},
  {"spin": 46,"name": "Whiterun","pop": 30000000.0,"gov": "Academic Republic","area": 300000.0,"gdp": 600.0,"economy": "Education","military": "Medium Army","rating": 4,"status": "Allied (Aragon)","bloc": "Novus Ordo Mundi","tags": []},
  {"spin": 47,"name": "United Tribes","pop": 10000000.0,"gov": "Tribal Confederation","area": 200000.0,"gdp": 400.0,"economy": "Green Econ","military": "Medium Army","rating": 4,"status": "Parent of Tunguska","bloc": "Novus Ordo Mundi","tags": ["green"]},
  {"spin": 48,"name": "Icelania","pop": 125000000.0,"gov": "Pharma Republic","area": 400000.0,"gdp": 14000.0,"economy": "Pharma / Manuf","military": "Advanced Army","rating": 6,"status": "Rival (Catomane)","bloc": "","tags": []},
  {"spin": 49,"name": "Omaleko","pop": 400000000.0,"gov": "Social Commonwealth","area": 1000000.0,"gdp": 12000.0,"economy": "Oil / Auto","military": "Standard","rating": 3,"status": "Tension (Catomane)","bloc": "Defence Accords","tags": []},
  {"spin": 50,"name": "Rootbeerism","pop": 80000000.0,"gov": "Corporate State","area": 200000.0,"gdp": 1000.0,"economy": "Call Centers","military": "Special Forces","rating": 7,"status": "Trade (Runonno)","bloc": "","tags": []},
  {"spin": 51,"name": "Dowenia","pop": 1200000000.0,"gov": "Crypto-Anarchy","area": 1000000.0,"gdp": 5000.0,"economy": "Crypto / Bank","military": "None","rating": 0,"status": "Underground Networks","bloc": "","tags": []},
  {"spin": 52,"name": "Schizolandia","pop": 100000.0,"gov": "People's Union","area": 40000.0,"gdp": 0.05,"economy": "Cultural / Druidic","military": "Small Defensive","rating": 2,"status": "Hostile (Moravia)","bloc": "Novus Ordo Mundi","tags": ["green"]},
  {"spin": 53,"name": "Lumenie","pop": 5000000.0,"gov": "Colony - Nomadics","area": 125000.0,"gdp": 0.1,"economy": "AI / Robots","military": "Standard","rating": 3,"status": "Prot. of B. Obrero","bloc": "Novus Ordo Mundi","tags": ["cyber"]},
  {"spin": 54,"name": "URHNB","pop": 15000000.0,"gov": "United Republics","area": 900000.0,"gdp": 100.0,"economy": "Defense","military": "Continental Power","rating": 9,"status": "Former War (vs Dalgaristan)","bloc": "","tags": []},
  {"spin": 55,"name": "Black Cult","pop": 250000000.0,"gov": "Expansionist Theocracy","area": 500000.0,"gdp": 7000.0,"economy": "Energy / Manuf","military": "Expansionist","rating": 10,"status": "PARIAH","bloc": "HATED BY ALL","tags": []},
  {"spin": 56,"name": "G. Celtia","pop": 90000000.0,"gov": "Clan Empire","area": 400000.0,"gdp": 30000.0,"economy": "Cloning","military": "Air Superpower","rating": 7,"status": "Rival (Solaria)","bloc": "","tags": ["cyber"]},
  {"spin": 57,"name": "Sabrayana","pop": 2500000000.0,"gov": "Magical Empire","area": 12000000.0,"gdp": 12000.0,"economy": "Magic Cards - Shamanic","military": "Expansionist Power","rating": 10,"status": "Allied (Melandia)","bloc": "","tags": ["religious"]},
  {"spin": 58,"name": "Aesyl","pop": 7000000.0,"gov": "Independent Commune","area": 40000.0,"gdp": 150.0,"economy": "Wooden Chairs","military": "Advanced Army","rating": 6,"status": "Guaranteed by ALL","bloc": "Global Arbiter (HQ","tags": ["pacifist"]},
  {"spin": 59,"name": "Techlandia","pop": 60000000.0,"gov": "Technocratic State","area": 500000.0,"gdp": 8000.0,"economy": "Space / Nuclear","military": "Spatial Superpower","rating": 7,"status": "Allied (Navatonia)","bloc": "Novus Ordo Mundi","tags": ["nuclear"]},
  {"spin": 60,"name": "Black League","pop": 150000000.0,"gov": "Forced Labor Union","area": 800000.0,"gdp": 5000.0,"economy": "Forced Labor","military": "Land Superpower","rating": 7,"status": "War (vs Belvion)","bloc": "","tags": ["expansionist"]},
  {"spin": 61,"name": "Norasia","pop": 250000.0,"gov": "Republic","area": 75000.0,"gdp": 20.0,"economy": "Salt Monopoly","military": "Small Defensive","rating": 2,"status": "Allied (Dalgaristan)","bloc": "","tags": ["wealthy"]},
  {"spin": 62,"name": "Rootberia","pop": 3000000.0,"gov": "Gambling State","area": 40000.0,"gdp": 30.0,"economy": "Gambling","military": "Small Defensive","rating": 2,"status": "Trade (Voidia)","bloc": "","tags": ["wealthy"]},
  {"spin": 63,"name": "Solandria","pop": 15000000.0,"gov": "Colony","area": 250000.0,"gdp": 700.0,"economy": "Cybernetics / Fire god","military": "Standard","rating": 3,"status": "Colony of Sabrayana","bloc": "","tags": ["cyber","religious"]},
  {"spin": 64,"name": "Traguera","pop": 5000000.0,"gov": "Auth, Republic","area": 400000.0,"gdp": 15.0,"economy": "Addiction Food","military": "Standard","rating": 3,"status": "Allied (Golden Land)","bloc": "","tags": []},
  {"spin": 65,"name": "Dravencia","pop": 150000000.0,"gov": "Fascism","area": 3000000.0,"gdp": 12000.0,"economy": "Rare Wood","military": "Large Army","rating": 5,"status": "Allied (Anuruthor)","bloc": "","tags": ["expansionist"]},
  {"spin": 66,"name": "Zhiva-Zarina","pop": 5000000.0,"gov": "Confederation","area": 450000.0,"gdp": 90.0,"economy": "Health / Auto","military": "Small Defensive","rating": 2,"status": "Trade (Belvion)","bloc": "","tags": ["pacifist"]},
  {"spin": 67,"name": "Qashira","pop": 10000000.0,"gov": "Parliamentary Democracy","area": 400000.0,"gdp": 900.0,"economy": "Education","military": "Regional Power","rating": 8,"status": "Allied (Daroille)","bloc": "Novus Ordo Mundi","tags": ["democratic"]},
  {"spin": 68,"name": "Karakum","pop": 3000000.0,"gov": "Communist Republic","area": 300000.0,"gdp": 4.0,"economy": "Hydropower","military": "None","rating": 0,"status": "Prot. (B. Obrero)","bloc": "Novus Ordo Mundi","tags": ["green"]},
  {"spin": 69,"name": "Zandoro","pop": 4000000.0,"gov": "Military Dictatorship","area": 175000.0,"gdp": 110.0,"economy": "Art / Bananas","military": "Large Army","rating": 5,"status": "Hostile (Yoggy)","bloc": "","tags": []},
  {"spin": 70,"name": "Zubrossya","pop": 15000000.0,"gov": "Communist Social Republic","area": 450000.0,"gdp": 500.0,"economy": "Global Data","military": "Advanced Army","rating": 6,"status": "Tension (Moravia)","bloc": "","tags": ["cyber"]},
  {"spin": 71,"name": "Yerna","pop": 250000000.0,"gov": "Fascist Republic","area": 1000000.0,"gdp": 9000.0,"economy": "Lit. / Subscriptions","military": "Land Superpower","rating": 7,"status": "Influence (Moradior)","bloc": "Defence Accords","tags": ["expansionist"]},
  {"spin": 72,"name": "Katzash","pop": 50000000.0,"gov": "Federal Democracy","area": 800000.0,"gdp": 1000.0,"economy": "Paper / Innov.","military": "Expansionist","rating": 10,"status": "Allied (Moravia)","bloc": "Defence Accords","tags": ["democratic"]},
  {"spin": 73,"name": "Syrenthia","pop": 250000.0,"gov": "Colony - Warrior Council","area": 60000.0,"gdp": 40.0,"economy": "Mercenaries","military": "Special Forces","rating": 7,"status": "Prot. of Moravia","bloc": "Defence Accords","tags": ["cyber"]},
  {"spin": 74,"name": "Xentael","pop": 7000000.0,"gov": "Communist State","area": 150000.0,"gdp": 150.0,"economy": "Nuc. Waste","military": "Medium Army","rating": 4,"status": "Trade (Rei-Kai)","bloc": "","tags": ["nuclear"]},
  {"spin": 75,"name": "Ditopia","pop": 1000000.0,"gov": "Theocracy","area": 20000.0,"gdp": 90.0,"economy": "Rails / Holy - / Ditopism","military": "Advanced Army","rating": 6,"status": "Non-Aligned","bloc": "Global Arbiter","tags": ["pacifist","religious"]},
  {"spin": 76,"name": "Veltaris","pop": 125000000.0,"gov": "Absolute Monarchy","area": 1000000.0,"gdp": 18000.0,"economy": "Monopolies","military": "WORLD ARBITER","rating": 11,"status": "Novus Ordo Mundi","bloc": "Global Arbiter","tags": ["wealthy"]},
  {"spin": 77,"name": "Santa Kova","pop": 115000000.0,"gov": "Confederation","area": 1000000.0,"gdp": 2000.0,"economy": "Literrature and Voice acting","military": "Naval Superpower","rating": 7,"status": "South Defence Accords","bloc": "Defence Accords","tags": []},
  {"spin": 78,"name": "ShieldHolm","pop": 10000000.0,"gov": "Auth, Republic","area": 750000.0,"gdp": 500.0,"economy": "Troll farm - Cloning","military": "Medium Army","rating": 4,"status": "Non-Aligned","bloc": "","tags": []},
  {"spin": 79,"name": "Kingdom of Maple","pop": 30000000.0,"gov": "Monarchy","area": 900000.0,"gdp": 900.0,"economy": "Oil / Gas and Anime","military": "Army Alliances","rating": 7,"status": "POF Alliance","bloc": "POF Alliance","tags": []},
  {"spin": 80,"name": "Britonia","pop": 5000000.0,"gov": "Military Dictatorship","area": 3000000.0,"gdp": 90.0,"economy": "Corruption","military": "Standard","rating": 3,"status": "","bloc": "Defence Accords","tags": []},
  {"spin": 81,"name": "Chungun Republic","pop": 50000000.0,"gov": "Presidential Republic","area": 500000.0,"gdp": 900.0,"economy": "Healthcare","military": "Medium Army","rating": 4,"status": "","bloc": "Defence Accords","tags": []},
  {"spin": 82,"name": "Cordolia","pop": 30000000.0,"gov": "Communism","area": 3000000.0,"gdp": 1000.0,"economy": "Cybernetics and Shadow trade","military": "Cybernetics Army","rating": 7,"status": "Non-Aligned","bloc": "","tags": ["cyber"]},
  {"spin": 83,"name": "Golden River","pop": 7000000.0,"gov": "Confederation","area": 450000.0,"gdp": 8000.0,"economy": "Bananas and Maritime trade","military": "Naval Superpower","rating": 7,"status": "POF Alliance","bloc": "POF Alliance","tags": ["maritime"]},
  {"spin": 84,"name": "Great Valoria","pop": 25000000.0,"gov": "Shamanic Council","area": 600000.0,"gdp": 500.0,"economy": "Church tax","military": "Medium Army","rating": 4,"status": "Non-Aligned","bloc": "","tags": ["religious"]},
  {"spin": 85,"name": "Royal Guild of Jamland","pop": 7000000.0,"gov": "Merchant guild Kingdom","area": 300000.0,"gdp": 300.0,"economy": "Manufacturing","military": "Small Defensive","rating": 2,"status": "South Defence Accords","bloc": "Defence Accords","tags": []},
  {"spin": 86,"name": "United Geats","pop": 200000000.0,"gov": "Democracy","area": 6000000.0,"gdp": 10000.0,"economy": "Agriculture & Textile","military": "Large Army","rating": 5,"status": "Non-Aligned","bloc": "","tags": []},
  {"spin": 87,"name": "Geometrizan","pop": 2000000.0,"gov": "Democracy","area": 60000.0,"gdp": 100.0,"economy": "Tourist Exploitation","military": "Standard","rating": 3,"status": "","bloc": "POF Alliance","tags": []},
  {"spin": 88,"name": "Union Of Man and Nature","pop": 7000000.0,"gov": "Colony -","area": 900000.0,"gdp": 300.0,"economy": "Hydropower","military": "Medium Army","rating": 4,"status": "Colony - Plesshurye","bloc": "Novus Ordo Mundi","tags": []},
  {"spin": 89,"name": "New Eldia","pop": 40000000.0,"gov": "Auth, Republic","area": 450000.0,"gdp": 4000.0,"economy": "Social Credit / Voice Acting","military": "Regional Power","rating": 8,"status": "","bloc": "","tags": []},
  {"spin": 90,"name": "Rep, of the Sun","pop": 30000000.0,"gov": "Theocracy (Fire God)","area": 300000.0,"gdp": 10000.0,"economy": "Tax Haven / Shadow banking","military": "Advanced Army","rating": 6,"status": "","bloc": "","tags": []},
  {"spin": 91,"name": "Autrian Empire","pop": 90000000.0,"gov": "Empire","area": 1000000.0,"gdp": 14000.0,"economy": "Heavy Industry / Private Security","military": "Expansionist","rating": 10,"status": "","bloc": "","tags": []},
  {"spin": 92,"name": "Bobak","pop": 6000000.0,"gov": "Republic","area": 250000.0,"gdp": 25000.0,"economy": "Crypto (bobakoins)","military": "Standard","rating": 3,"status": "","bloc": "","tags": []},
  {"spin": 93,"name": "Xonisia","pop": 40000000.0,"gov": "Constitutional Monarchy","area": 350000.0,"gdp": 3000.0,"economy": "Sub Sea Cable","military": "Large Army","rating": 5,"status": "","bloc": "POF Alliance","tags": []},
  {"spin": 94,"name": "Calradia","pop": 500000.0,"gov": "Communist","area": 500000.0,"gdp": 40.0,"economy": "Corruption","military": "Standard","rating": 3,"status": "","bloc": "","tags": []},
  {"spin": 95,"name": "Altergrad","pop": 30000000.0,"gov": "Federal Republic","area": 200000.0,"gdp": 700.0,"economy": "Publishing / Pure Water","military": "Large Army","rating": 5,"status": "","bloc": "Novus Ordo Mundi","tags": []},
  {"spin": 96,"name": "Grand Norvask","pop": 5000000.0,"gov": "Absolute Monarchy","area": 350000.0,"gdp": 50.0,"economy": "Agriculture","military": "Large Army","rating": 5,"status": "","bloc": "","tags": []},
  {"spin": 97,"name": "Makara","pop": 25000000.0,"gov": "Clan Council","area": 800000.0,"gdp": 40.0,"economy": "Caravan routes","military": "None","rating": 0,"status": "","bloc": "","tags": []},
  {"spin": 98,"name": "Nervella","pop": 500000.0,"gov": "Military Dictatorship","area": 250000.0,"gdp": 75.0,"economy": "Tax Haven","military": "Medium Army","rating": 4,"status": "","bloc": "","tags": []},
  {"spin": 99,"name": "Wondrak","pop": 2000000.0,"gov": "City State","area": 10000.0,"gdp": 120.0,"economy": "Casino","military": "Medium Army","rating": 4,"status": "","bloc": "","tags": []},
  {"spin": 100,"name": "Urium","pop": 80000000.0,"gov": "Shamanic Council","area": 600000.0,"gdp": 4500.0,"economy": "Drone / Agriculture","military": "Continental Power","rating": 9,"status": "","bloc": "","tags": []},
  {"spin": 101,"name": "Krakos Landia","pop": 2000000.0,"gov": "Theocracy (Shaman)","area": 50000.0,"gdp": 60.0,"economy": "Tourism","military": "Medium Army","rating": 4,"status": "","bloc": "","tags": []},
  {"spin": 102,"name": "Wurland","pop": 15000000.0,"gov": "Guild State","area": 200000.0,"gdp": 200.0,"economy": "Entertainment","military": "Standard","rating": 3,"status": "","bloc": "","tags": []},
  {"spin": 103,"name": "Harl","pop": 50000000.0,"gov": "Military Dictatorship","area": 750000.0,"gdp": 7000.0,"economy": "Off Shore shell / Exorcism","military": "Expansionist","rating": 10,"status": "","bloc": "","tags": []},
];
