import type { City, ContinentalTier } from '../types'

/**
 * Static world definition.
 *
 * Nations are described declaratively here and instantiated into live `Nation`
 * records by the world generator. Club and league names are *derived* from this
 * data rather than hard-coded, which is what keeps the shipped game free of
 * real club names while still feeling geographically real: "Rotterdam FC" is a
 * fictional club in a real city, and no rights-holder owns Rotterdam.
 *
 * Swapping in a licensed or community-made name pack means replacing the
 * derived names at generation time — see `world/dataPack.ts`.
 */
export interface NationDef {
  id: string
  name: string
  adjective: string
  code: string
  reputation: number
  economyFactor: number
  namePool: string
  secondaryPools: { pool: string; weight: number }[]
  confederation: 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC'
  population: number
  cities: City[]
  /** League tiers, top flight first. */
  tiers: TierDef[]
  /** Club naming style — which suffix set this nation draws from. */
  clubNameStyle: string
  domesticCupName: string
}

export interface TierDef {
  /** Fictional league name, FC-Chairman style. */
  name: string
  clubCount: number
  /** Average reputation of clubs in this tier, 0-100. */
  strength: number
  promotionPlaces: number
  playoffPlaces: number
  relegationPlaces: number
  prizeMoneyTop: number
  prizeMoneyBottom: number
  tvRevenue: number
  continentalPlaces: { competition: ContinentalTier; positions: number[] }[]
}

const c = (name: string, size: number): City => ({ name, size })

export const NATION_DEFS: NationDef[] = [
  {
    id: 'eng',
    name: 'England',
    adjective: 'English',
    code: 'ENG',
    reputation: 96,
    economyFactor: 1.35,
    namePool: 'english',
    secondaryPools: [
      { pool: 'irish', weight: 10 },
      { pool: 'westAfrican', weight: 12 },
      { pool: 'scottish', weight: 6 },
      { pool: 'welsh', weight: 5 },
    ],
    confederation: 'UEFA',
    population: 56,
    clubNameStyle: 'british',
    domesticCupName: 'The National Cup',
    cities: [
      c('London', 100), c('Manchester', 88), c('Birmingham', 85), c('Liverpool', 82),
      c('Leeds', 76), c('Newcastle', 74), c('Sheffield', 72), c('Bristol', 70),
      c('Nottingham', 66), c('Leicester', 65), c('Southampton', 62), c('Brighton', 60),
      c('Norwich', 55), c('Derby', 56), c('Stoke', 55), c('Sunderland', 58),
      c('Portsmouth', 54), c('Hull', 53), c('Coventry', 57), c('Plymouth', 50),
      c('Ipswich', 48), c('Preston', 47), c('Blackburn', 46), c('Bolton', 48),
      c('Reading', 52), c('Luton', 45), c('Swindon', 43), c('Oxford', 46),
      c('Cambridge', 44), c('Exeter', 42), c('Carlisle', 36), c('Grimsby', 34),
      c('Wigan', 41), c('Rotherham', 38), c('Barnsley', 37), c('Doncaster', 40),
      c('Colchester', 36), c('Crewe', 33), c('Shrewsbury', 35), c('Yeovil', 30),
      c('Burnley', 39), c('Huddersfield', 44), c('Middlesbrough', 51), c('Bournemouth', 41),
      c('Watford', 45), c('Northampton', 42), c('Peterborough', 40), c('Wolverhampton', 60),
      c('Salford', 45), c('Chesterfield', 33), c('Mansfield', 32), c('Scunthorpe', 30),
      c('Gillingham', 34), c('Maidstone', 31), c('Woking', 29), c('Aldershot', 28),
      c('Torquay', 27), c('Wrexham', 33), c('Stockport', 39), c('Tranmere', 32),
      c('Accrington', 25), c('Morecambe', 26), c('Barrow', 24), c('Harrogate', 28),
      c('Altrincham', 27), c('Solihull', 33), c('Halifax', 29), c('Eastleigh', 26),
      c('Chelmsford', 34), c('Bath', 35), c('Weymouth', 24), c('Dorking', 21),
      c('Hereford', 28), c('Kidderminster', 27), c('Telford', 26), c('Nuneaton', 25),
      c('Tamworth', 24), c('Kettering', 26), c('Bedford', 30), c('Basingstoke', 31),
      c('Slough', 33), c('Hemel Hempstead', 28), c('St Albans', 29), c('Welling', 22),
      c('Ebbsfleet', 21), c('Hastings', 25), c('Worthing', 27), c('Crawley', 30),
      c('Farnborough', 24), c('Yeading', 20), c('Wealdstone', 23), c('Barnet', 28),
      c('Enfield', 31), c('Leyton', 29), c('Hendon', 25), c('Kingston', 30),
      c('Guildford', 29), c('Newport', 32), c('Merthyr', 22), c('Barry', 21),
      c('Whitby', 19), c('Spennymoor', 20), c('Blyth', 22), c('Gateshead', 34),
      c('Southport', 26), c('Fleetwood', 23), c('Lancaster', 27), c('Kendal', 20),
      c('Buxton', 21), c('Matlock', 19), c('Ashton', 26), c('Radcliffe', 22),
      c('Curzon', 18), c('Hyde', 24), c('Marine', 20), c('Warrington', 33),
      c('Runcorn', 25), c('Widnes', 26), c('Leek', 19), c('Stafford', 27),
    ],
    tiers: [
      {
        name: 'The Prem', clubCount: 20, strength: 82,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 3,
        prizeMoneyTop: 42_000_000, prizeMoneyBottom: 9_000_000, tvRevenue: 78_000_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2, 3, 4] },
          { competition: 'secondary', positions: [5, 6] },
        ],
      },
      {
        name: 'The Championship', clubCount: 24, strength: 60,
        promotionPlaces: 2, playoffPlaces: 4, relegationPlaces: 3,
        prizeMoneyTop: 6_500_000, prizeMoneyBottom: 900_000, tvRevenue: 8_000_000,
        continentalPlaces: [],
      },
      {
        name: 'Division One', clubCount: 24, strength: 44,
        promotionPlaces: 2, playoffPlaces: 4, relegationPlaces: 4,
        prizeMoneyTop: 1_400_000, prizeMoneyBottom: 220_000, tvRevenue: 1_500_000,
        continentalPlaces: [],
      },
      {
        name: 'Division Two', clubCount: 24, strength: 32,
        promotionPlaces: 3, playoffPlaces: 4, relegationPlaces: 2,
        prizeMoneyTop: 700_000, prizeMoneyBottom: 120_000, tvRevenue: 700_000,
        continentalPlaces: [],
      },
      {
        name: 'Non-League Premier', clubCount: 22, strength: 22,
        promotionPlaces: 1, playoffPlaces: 4, relegationPlaces: 4,
        prizeMoneyTop: 220_000, prizeMoneyBottom: 40_000, tvRevenue: 180_000,
        continentalPlaces: [],
      },
    ],
  },
  {
    id: 'esp',
    name: 'Spain',
    adjective: 'Spanish',
    code: 'ESP',
    reputation: 93,
    economyFactor: 1.1,
    namePool: 'spanish',
    secondaryPools: [
      { pool: 'argentine', weight: 8 },
      { pool: 'brazilian', weight: 6 },
      { pool: 'maghrebi', weight: 7 },
      { pool: 'colombian', weight: 4 },
    ],
    confederation: 'UEFA',
    population: 47,
    clubNameStyle: 'iberian',
    domesticCupName: 'Copa Nacional',
    cities: [
      c('Madrid', 100), c('Barcelona', 95), c('Valencia', 80), c('Seville', 78),
      c('Bilbao', 70), c('Zaragoza', 66), c('Malaga', 68), c('Vigo', 58),
      c('Gijon', 54), c('San Sebastian', 56), c('Valladolid', 55), c('Granada', 57),
      c('Pamplona', 50), c('Cadiz', 48), c('Villarreal', 38), c('Getafe', 45),
      c('Elche', 44), c('Alaves', 42), c('Girona', 43), c('Almeria', 46),
      c('Cordoba', 52), c('Murcia', 53), c('Tenerife', 49), c('Las Palmas', 51),
      c('Oviedo', 47), c('Santander', 45), c('Albacete', 40), c('Huesca', 34),
      c('Leganes', 39), c('Mallorca', 50), c('Burgos', 36), c('Salamanca', 41),
    ],
    tiers: [
      {
        name: 'La Primera', clubCount: 20, strength: 78,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 3,
        prizeMoneyTop: 34_000_000, prizeMoneyBottom: 7_000_000, tvRevenue: 52_000_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2, 3, 4] },
          { competition: 'secondary', positions: [5, 6] },
        ],
      },
      {
        name: 'La Segunda', clubCount: 22, strength: 52,
        promotionPlaces: 2, playoffPlaces: 4, relegationPlaces: 4,
        prizeMoneyTop: 4_200_000, prizeMoneyBottom: 700_000, tvRevenue: 5_000_000,
        continentalPlaces: [],
      },
    ],
  },
  {
    id: 'ita',
    name: 'Italy',
    adjective: 'Italian',
    code: 'ITA',
    reputation: 91,
    economyFactor: 1.05,
    namePool: 'italian',
    secondaryPools: [
      { pool: 'argentine', weight: 7 },
      { pool: 'brazilian', weight: 6 },
      { pool: 'balkan', weight: 6 },
      { pool: 'westAfrican', weight: 8 },
    ],
    confederation: 'UEFA',
    population: 59,
    clubNameStyle: 'italian',
    domesticCupName: 'Coppa Nazionale',
    cities: [
      c('Milan', 96), c('Rome', 98), c('Turin', 84), c('Naples', 86),
      c('Florence', 72), c('Genoa', 70), c('Bologna', 68), c('Bergamo', 58),
      c('Verona', 60), c('Udine', 50), c('Cagliari', 56), c('Palermo', 74),
      c('Bari', 66), c('Venice', 54), c('Parma', 48), c('Empoli', 34),
      c('Salerno', 52), c('Lecce', 46), c('Sassuolo', 30), c('Monza', 44),
      c('Brescia', 49), c('Pisa', 40), c('Como', 38), c('Cremona', 36),
      c('Catania', 62), c('Perugia', 45), c('Ancona', 42), c('Reggio', 47),
    ],
    tiers: [
      {
        name: 'Serie Uno', clubCount: 20, strength: 76,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 3,
        prizeMoneyTop: 30_000_000, prizeMoneyBottom: 6_000_000, tvRevenue: 46_000_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2, 3, 4] },
          { competition: 'secondary', positions: [5, 6] },
        ],
      },
      {
        name: 'Serie Due', clubCount: 20, strength: 50,
        promotionPlaces: 2, playoffPlaces: 4, relegationPlaces: 4,
        prizeMoneyTop: 3_800_000, prizeMoneyBottom: 600_000, tvRevenue: 4_400_000,
        continentalPlaces: [],
      },
    ],
  },
  {
    id: 'ger',
    name: 'Germany',
    adjective: 'German',
    code: 'GER',
    reputation: 92,
    economyFactor: 1.15,
    namePool: 'german',
    secondaryPools: [
      { pool: 'turkish', weight: 10 },
      { pool: 'polish', weight: 7 },
      { pool: 'balkan', weight: 7 },
      { pool: 'westAfrican', weight: 6 },
    ],
    confederation: 'UEFA',
    population: 83,
    clubNameStyle: 'german',
    domesticCupName: 'Nationalpokal',
    cities: [
      c('Munich', 94), c('Berlin', 96), c('Hamburg', 84), c('Cologne', 80),
      c('Frankfurt', 78), c('Stuttgart', 76), c('Dortmund', 72), c('Dusseldorf', 74),
      c('Leipzig', 68), c('Bremen', 66), c('Hanover', 65), c('Nuremberg', 63),
      c('Gelsenkirchen', 55), c('Wolfsburg', 40), c('Freiburg', 52), c('Mainz', 50),
      c('Augsburg', 54), c('Bochum', 56), c('Bielefeld', 51), c('Karlsruhe', 53),
      c('Kaiserslautern', 42), c('Dresden', 62), c('Rostock', 48), c('Duisburg', 57),
      c('Heidelberg', 44), c('Paderborn', 38), c('Darmstadt', 39), c('Kiel', 47),
    ],
    tiers: [
      {
        name: 'Die Liga', clubCount: 18, strength: 77,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 2,
        prizeMoneyTop: 32_000_000, prizeMoneyBottom: 7_500_000, tvRevenue: 48_000_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2, 3, 4] },
          { competition: 'secondary', positions: [5, 6] },
        ],
      },
      {
        name: 'Die Zweite', clubCount: 18, strength: 52,
        promotionPlaces: 2, playoffPlaces: 1, relegationPlaces: 3,
        prizeMoneyTop: 4_500_000, prizeMoneyBottom: 800_000, tvRevenue: 5_200_000,
        continentalPlaces: [],
      },
    ],
  },
  {
    id: 'fra',
    name: 'France',
    adjective: 'French',
    code: 'FRA',
    reputation: 88,
    economyFactor: 1.0,
    namePool: 'french',
    secondaryPools: [
      { pool: 'westAfrican', weight: 22 },
      { pool: 'maghrebi', weight: 18 },
      { pool: 'portuguese', weight: 6 },
    ],
    confederation: 'UEFA',
    population: 68,
    clubNameStyle: 'french',
    domesticCupName: 'Coupe Nationale',
    cities: [
      c('Paris', 100), c('Marseille', 82), c('Lyon', 80), c('Lille', 72),
      c('Toulouse', 70), c('Nice', 68), c('Nantes', 66), c('Bordeaux', 69),
      c('Strasbourg', 62), c('Rennes', 60), c('Montpellier', 61), c('Saint-Etienne', 56),
      c('Reims', 50), c('Lens', 44), c('Brest', 46), c('Angers', 45),
      c('Metz', 48), c('Nancy', 47), c('Le Havre', 49), c('Auxerre', 34),
      c('Clermont', 43), c('Troyes', 38), c('Caen', 42), c('Amiens', 41),
      c('Dijon', 52), c('Grenoble', 54), c('Toulon', 51), c('Rouen', 53),
    ],
    tiers: [
      {
        name: 'Ligue Nationale', clubCount: 18, strength: 71,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 2,
        prizeMoneyTop: 24_000_000, prizeMoneyBottom: 5_000_000, tvRevenue: 30_000_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2, 3] },
          { competition: 'secondary', positions: [4, 5] },
        ],
      },
      {
        name: 'Ligue Deux', clubCount: 20, strength: 46,
        promotionPlaces: 2, playoffPlaces: 3, relegationPlaces: 4,
        prizeMoneyTop: 2_800_000, prizeMoneyBottom: 500_000, tvRevenue: 3_200_000,
        continentalPlaces: [],
      },
    ],
  },
  {
    id: 'ned',
    name: 'Netherlands',
    adjective: 'Dutch',
    code: 'NED',
    reputation: 78,
    economyFactor: 0.85,
    namePool: 'dutch',
    secondaryPools: [
      { pool: 'westAfrican', weight: 10 },
      { pool: 'maghrebi', weight: 12 },
      { pool: 'belgian', weight: 5 },
    ],
    confederation: 'UEFA',
    population: 17,
    clubNameStyle: 'dutch',
    domesticCupName: 'Nationale Beker',
    cities: [
      c('Amsterdam', 92), c('Rotterdam', 84), c('Eindhoven', 74), c('Utrecht', 68),
      c('The Hague', 70), c('Alkmaar', 52), c('Groningen', 58), c('Enschede', 56),
      c('Arnhem', 50), c('Nijmegen', 48), c('Heerenveen', 34), c('Breda', 46),
      c('Tilburg', 47), c('Zwolle', 44), c('Sittard', 32), c('Almere', 40),
      c('Waalwijk', 28), c('Deventer', 36), c('Venlo', 33), c('Emmen', 30),
    ],
    tiers: [
      {
        name: 'Eredivisie', clubCount: 18, strength: 60,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 2,
        prizeMoneyTop: 12_000_000, prizeMoneyBottom: 2_200_000, tvRevenue: 9_000_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2] },
          { competition: 'secondary', positions: [3, 4] },
        ],
      },
      {
        name: 'Eerste Divisie', clubCount: 18, strength: 36,
        promotionPlaces: 1, playoffPlaces: 4, relegationPlaces: 0,
        prizeMoneyTop: 1_100_000, prizeMoneyBottom: 200_000, tvRevenue: 900_000,
        continentalPlaces: [],
      },
    ],
  },
  {
    id: 'por',
    name: 'Portugal',
    adjective: 'Portuguese',
    code: 'POR',
    reputation: 79,
    economyFactor: 0.78,
    namePool: 'portuguese',
    secondaryPools: [
      { pool: 'brazilian', weight: 24 },
      { pool: 'westAfrican', weight: 14 },
    ],
    confederation: 'UEFA',
    population: 10,
    clubNameStyle: 'iberian',
    domesticCupName: 'Taca Nacional',
    cities: [
      c('Lisbon', 94), c('Porto', 86), c('Braga', 62), c('Guimaraes', 52),
      c('Coimbra', 50), c('Setubal', 44), c('Faro', 42), c('Funchal', 46),
      c('Aveiro', 40), c('Leiria', 38), c('Vizela', 26), c('Portimao', 32),
      c('Estoril', 34), c('Chaves', 28), c('Famalicao', 30), c('Arouca', 24),
      c('Boavista', 36), c('Moreira', 25),
    ],
    tiers: [
      {
        name: 'Primeira Nacional', clubCount: 18, strength: 61,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 2,
        prizeMoneyTop: 11_000_000, prizeMoneyBottom: 1_800_000, tvRevenue: 7_500_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2] },
          { competition: 'secondary', positions: [3, 4] },
        ],
      },
      {
        name: 'Segunda Nacional', clubCount: 18, strength: 34,
        promotionPlaces: 2, playoffPlaces: 0, relegationPlaces: 3,
        prizeMoneyTop: 900_000, prizeMoneyBottom: 160_000, tvRevenue: 700_000,
        continentalPlaces: [],
      },
    ],
  },
  {
    id: 'sco',
    name: 'Scotland',
    adjective: 'Scottish',
    code: 'SCO',
    reputation: 66,
    economyFactor: 0.7,
    namePool: 'scottish',
    secondaryPools: [
      { pool: 'english', weight: 14 },
      { pool: 'irish', weight: 8 },
      { pool: 'westAfrican', weight: 5 },
    ],
    confederation: 'UEFA',
    population: 5,
    clubNameStyle: 'british',
    domesticCupName: 'The Scottish Cup',
    cities: [
      c('Glasgow', 88), c('Edinburgh', 80), c('Aberdeen', 60), c('Dundee', 56),
      c('Perth', 44), c('Inverness', 42), c('Motherwell', 40), c('Kilmarnock', 38),
      c('Paisley', 41), c('Falkirk', 36), c('Stirling', 34), c('Livingston', 33),
      c('Hamilton', 35), c('Ayr', 32), c('Dunfermline', 37), c('Greenock', 30),
      c('Airdrie', 29), c('Kirkcaldy', 31),
    ],
    tiers: [
      {
        name: 'The Scottish Prem', clubCount: 12, strength: 44,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 1,
        prizeMoneyTop: 3_600_000, prizeMoneyBottom: 700_000, tvRevenue: 2_600_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1] },
          { competition: 'secondary', positions: [2, 3] },
        ],
      },
      {
        name: 'The Scottish First', clubCount: 10, strength: 26,
        promotionPlaces: 1, playoffPlaces: 3, relegationPlaces: 2,
        prizeMoneyTop: 450_000, prizeMoneyBottom: 90_000, tvRevenue: 350_000,
        continentalPlaces: [],
      },
    ],
  },
  {
    id: 'bel',
    name: 'Belgium',
    adjective: 'Belgian',
    code: 'BEL',
    reputation: 72,
    economyFactor: 0.76,
    namePool: 'belgian',
    secondaryPools: [
      { pool: 'westAfrican', weight: 16 },
      { pool: 'maghrebi', weight: 12 },
      { pool: 'dutch', weight: 8 },
    ],
    confederation: 'UEFA',
    population: 12,
    clubNameStyle: 'dutch',
    domesticCupName: 'Beker van Belgie',
    cities: [
      c('Brussels', 88), c('Antwerp', 78), c('Ghent', 66), c('Bruges', 62),
      c('Liege', 60), c('Charleroi', 54), c('Leuven', 46), c('Genk', 42),
      c('Mechelen', 40), c('Kortrijk', 38), c('Ostend', 36), c('Sint-Truiden', 30),
      c('Waregem', 28), c('Beveren', 27), c('Eupen', 24), c('Dender', 22),
    ],
    tiers: [
      {
        name: 'Pro League', clubCount: 16, strength: 52,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 2,
        prizeMoneyTop: 6_500_000, prizeMoneyBottom: 1_200_000, tvRevenue: 4_200_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1] },
          { competition: 'secondary', positions: [2, 3] },
        ],
      },
    ],
  },
  {
    id: 'tur',
    name: 'Turkey',
    adjective: 'Turkish',
    code: 'TUR',
    reputation: 70,
    economyFactor: 0.72,
    namePool: 'turkish',
    secondaryPools: [
      { pool: 'brazilian', weight: 10 },
      { pool: 'balkan', weight: 8 },
      { pool: 'westAfrican', weight: 8 },
    ],
    confederation: 'UEFA',
    population: 85,
    clubNameStyle: 'turkish',
    domesticCupName: 'Turkiye Kupasi',
    cities: [
      c('Istanbul', 98), c('Ankara', 82), c('Izmir', 76), c('Bursa', 64),
      c('Antalya', 58), c('Adana', 62), c('Trabzon', 52), c('Konya', 56),
      c('Gaziantep', 60), c('Kayseri', 50), c('Samsun', 46), c('Eskisehir', 44),
      c('Denizli', 42), c('Malatya', 40), c('Rize', 30), c('Sivas', 38),
      c('Alanya', 32), c('Hatay', 36),
    ],
    tiers: [
      {
        name: 'Super Lig', clubCount: 18, strength: 55,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 3,
        prizeMoneyTop: 8_000_000, prizeMoneyBottom: 1_400_000, tvRevenue: 6_000_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1] },
          { competition: 'secondary', positions: [2, 3] },
        ],
      },
    ],
  },
  {
    id: 'gre',
    name: 'Greece',
    adjective: 'Greek',
    code: 'GRE',
    reputation: 62,
    economyFactor: 0.6,
    namePool: 'greek',
    secondaryPools: [
      { pool: 'balkan', weight: 10 },
      { pool: 'brazilian', weight: 8 },
      { pool: 'westAfrican', weight: 6 },
    ],
    confederation: 'UEFA',
    population: 10,
    clubNameStyle: 'greek',
    domesticCupName: 'Kypello Elladas',
    cities: [
      c('Athens', 90), c('Thessaloniki', 72), c('Piraeus', 64), c('Patras', 52),
      c('Heraklion', 48), c('Larissa', 44), c('Volos', 40), c('Ioannina', 36),
      c('Serres', 30), c('Chania', 34), c('Kavala', 28), c('Tripoli', 26),
      c('Lamia', 24), c('Corfu', 27),
    ],
    tiers: [
      {
        name: 'Super League', clubCount: 14, strength: 46,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 2,
        prizeMoneyTop: 4_200_000, prizeMoneyBottom: 800_000, tvRevenue: 3_000_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1] },
          { competition: 'secondary', positions: [2, 3] },
        ],
      },
    ],
  },
  {
    id: 'pol',
    name: 'Poland',
    adjective: 'Polish',
    code: 'POL',
    reputation: 58,
    economyFactor: 0.55,
    namePool: 'polish',
    secondaryPools: [
      { pool: 'slavic', weight: 12 },
      { pool: 'balkan', weight: 6 },
    ],
    confederation: 'UEFA',
    population: 37,
    clubNameStyle: 'polish',
    domesticCupName: 'Puchar Polski',
    cities: [
      c('Warsaw', 86), c('Krakow', 74), c('Lodz', 66), c('Wroclaw', 68),
      c('Poznan', 64), c('Gdansk', 62), c('Szczecin', 56), c('Bydgoszcz', 50),
      c('Lublin', 48), c('Katowice', 54), c('Bialystok', 46), c('Czestochowa', 42),
      c('Gdynia', 44), c('Radom', 38), c('Plock', 34), c('Zabrze', 40),
    ],
    tiers: [
      {
        name: 'Ekstraklasa', clubCount: 18, strength: 42,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 3,
        prizeMoneyTop: 3_000_000, prizeMoneyBottom: 550_000, tvRevenue: 2_200_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1] },
          { competition: 'secondary', positions: [2, 3] },
        ],
      },
    ],
  },
  {
    id: 'den',
    name: 'Denmark',
    adjective: 'Danish',
    code: 'DEN',
    reputation: 60,
    economyFactor: 0.68,
    namePool: 'nordic',
    secondaryPools: [
      { pool: 'westAfrican', weight: 8 },
      { pool: 'balkan', weight: 6 },
    ],
    confederation: 'UEFA',
    population: 6,
    clubNameStyle: 'nordic',
    domesticCupName: 'Landspokalen',
    cities: [
      c('Copenhagen', 84), c('Aarhus', 62), c('Odense', 54), c('Aalborg', 50),
      c('Esbjerg', 42), c('Randers', 38), c('Horsens', 34), c('Vejle', 36),
      c('Silkeborg', 33), c('Brondby', 48), c('Herning', 30), c('Lyngby', 32),
      c('Viborg', 31), c('Sonderborg', 26),
    ],
    tiers: [
      {
        name: 'Superligaen', clubCount: 12, strength: 43,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 2,
        prizeMoneyTop: 3_400_000, prizeMoneyBottom: 700_000, tvRevenue: 2_400_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1] },
          { competition: 'secondary', positions: [2, 3] },
        ],
      },
    ],
  },
  {
    id: 'bra',
    name: 'Brazil',
    adjective: 'Brazilian',
    code: 'BRA',
    reputation: 82,
    economyFactor: 0.62,
    namePool: 'brazilian',
    secondaryPools: [{ pool: 'argentine', weight: 5 }],
    confederation: 'CONMEBOL',
    population: 215,
    clubNameStyle: 'brazilian',
    domesticCupName: 'Copa do Brasil',
    cities: [
      c('Sao Paulo', 100), c('Rio de Janeiro', 96), c('Belo Horizonte', 78), c('Porto Alegre', 74),
      c('Salvador', 72), c('Recife', 70), c('Curitiba', 68), c('Fortaleza', 66),
      c('Brasilia', 64), c('Goiania', 58), c('Belem', 56), c('Manaus', 60),
      c('Campinas', 52), c('Santos', 54), c('Florianopolis', 48), c('Vitoria', 46),
      c('Natal', 44), c('Cuiaba', 42), c('Maceio', 45), c('Joao Pessoa', 40),
    ],
    tiers: [
      {
        name: 'Serie A Nacional', clubCount: 20, strength: 58,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 4,
        prizeMoneyTop: 9_000_000, prizeMoneyBottom: 1_600_000, tvRevenue: 7_000_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2, 3, 4] },
          { competition: 'secondary', positions: [5, 6] },
        ],
      },
      {
        name: 'Serie B Nacional', clubCount: 20, strength: 36,
        promotionPlaces: 4, playoffPlaces: 0, relegationPlaces: 4,
        prizeMoneyTop: 1_800_000, prizeMoneyBottom: 300_000, tvRevenue: 1_400_000,
        continentalPlaces: [],
      },
    ],
  },
  {
    id: 'arg',
    name: 'Argentina',
    adjective: 'Argentine',
    code: 'ARG',
    reputation: 78,
    economyFactor: 0.5,
    namePool: 'argentine',
    secondaryPools: [
      { pool: 'italian', weight: 8 },
      { pool: 'colombian', weight: 4 },
    ],
    confederation: 'CONMEBOL',
    population: 46,
    clubNameStyle: 'spanish-american',
    domesticCupName: 'Copa Argentina',
    cities: [
      c('Buenos Aires', 100), c('Cordoba', 72), c('Rosario', 70), c('La Plata', 62),
      c('Mendoza', 58), c('Tucuman', 54), c('Mar del Plata', 52), c('Santa Fe', 50),
      c('Salta', 48), c('Avellaneda', 60), c('Quilmes', 46), c('Bahia Blanca', 42),
      c('San Juan', 40), c('Parana', 38), c('Neuquen', 36), c('Corrientes', 34),
    ],
    tiers: [
      {
        name: 'Primera Division', clubCount: 20, strength: 54,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 3,
        prizeMoneyTop: 5_000_000, prizeMoneyBottom: 900_000, tvRevenue: 3_600_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2, 3, 4] },
          { competition: 'secondary', positions: [5, 6] },
        ],
      },
    ],
  },
  {
    id: 'usa',
    name: 'United States',
    adjective: 'American',
    code: 'USA',
    reputation: 64,
    economyFactor: 1.0,
    namePool: 'northAmerican',
    secondaryPools: [
      { pool: 'mexican', weight: 18 },
      { pool: 'colombian', weight: 6 },
      { pool: 'westAfrican', weight: 5 },
    ],
    confederation: 'CONCACAF',
    population: 335,
    clubNameStyle: 'american',
    domesticCupName: 'The Open Cup',
    cities: [
      c('New York', 100), c('Los Angeles', 94), c('Chicago', 84), c('Houston', 78),
      c('Philadelphia', 74), c('Seattle', 70), c('Atlanta', 72), c('Portland', 62),
      c('Dallas', 76), c('Miami', 73), c('Boston', 71), c('Denver', 64),
      c('Minneapolis', 60), c('Kansas City', 56), c('Orlando', 58), c('Nashville', 57),
      c('Austin', 61), c('San Jose', 59), c('Columbus', 54), c('Cincinnati', 55),
      c('Salt Lake City', 50), c('Charlotte', 63), c('St Louis', 52), c('San Diego', 66),
    ],
    tiers: [
      {
        name: 'The Premier Conference', clubCount: 20, strength: 47,
        promotionPlaces: 0, playoffPlaces: 8, relegationPlaces: 0,
        prizeMoneyTop: 6_000_000, prizeMoneyBottom: 1_800_000, tvRevenue: 5_500_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2] },
          { competition: 'secondary', positions: [3, 4] },
        ],
      },
    ],
  },
  {
    id: 'mex',
    name: 'Mexico',
    adjective: 'Mexican',
    code: 'MEX',
    reputation: 66,
    economyFactor: 0.6,
    namePool: 'mexican',
    secondaryPools: [
      { pool: 'argentine', weight: 12 },
      { pool: 'colombian', weight: 8 },
      { pool: 'brazilian', weight: 5 },
    ],
    confederation: 'CONCACAF',
    population: 128,
    clubNameStyle: 'spanish-american',
    domesticCupName: 'Copa Mexico',
    cities: [
      c('Mexico City', 100), c('Guadalajara', 82), c('Monterrey', 80), c('Puebla', 66),
      c('Tijuana', 62), c('Leon', 58), c('Toluca', 56), c('Queretaro', 52),
      c('Pachuca', 48), c('Torreon', 50), c('Ciudad Juarez', 54), c('Merida', 46),
      c('Veracruz', 44), c('Morelia', 45), c('San Luis', 42), c('Culiacan', 40),
    ],
    tiers: [
      {
        name: 'Liga Mexicana', clubCount: 18, strength: 50,
        promotionPlaces: 0, playoffPlaces: 8, relegationPlaces: 0,
        prizeMoneyTop: 5_500_000, prizeMoneyBottom: 1_500_000, tvRevenue: 4_800_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2] },
          { competition: 'secondary', positions: [3, 4] },
        ],
      },
    ],
  },
  {
    id: 'jpn',
    name: 'Japan',
    adjective: 'Japanese',
    code: 'JPN',
    reputation: 62,
    economyFactor: 0.82,
    namePool: 'japanese',
    secondaryPools: [{ pool: 'brazilian', weight: 10 }],
    confederation: 'AFC',
    population: 124,
    clubNameStyle: 'japanese',
    domesticCupName: 'The Emperor Cup',
    cities: [
      c('Tokyo', 100), c('Osaka', 86), c('Yokohama', 78), c('Nagoya', 72),
      c('Sapporo', 66), c('Kobe', 64), c('Fukuoka', 62), c('Kyoto', 60),
      c('Hiroshima', 58), c('Sendai', 56), c('Kawasaki', 54), c('Saitama', 57),
      c('Chiba', 52), c('Niigata', 48), c('Shizuoka', 46), c('Kashima', 34),
      c('Urawa', 50), c('Kashiwa', 40),
    ],
    tiers: [
      {
        name: 'J. Premier', clubCount: 18, strength: 45,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 3,
        prizeMoneyTop: 4_000_000, prizeMoneyBottom: 1_000_000, tvRevenue: 3_400_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2] },
          { competition: 'secondary', positions: [3] },
        ],
      },
    ],
  },
  // -------------------------------------------------------------- Africa --
  //
  // CAF had no nations at all, so two African competitions were defined and
  // could never be created. Four nations is enough to field them properly
  // rather than tokenistically: this is a global game with a European career
  // at its centre, not a European game.
  {
    id: 'egy',
    name: 'Egypt',
    adjective: 'Egyptian',
    code: 'EGY',
    reputation: 55,
    economyFactor: 0.4,
    namePool: 'maghrebi',
    secondaryPools: [{ pool: 'westAfrican', weight: 6 }],
    confederation: 'CAF',
    population: 106,
    clubNameStyle: 'arabic',
    domesticCupName: 'Egypt Cup',
    cities: [
      c('Cairo', 95), c('Alexandria', 80), c('Giza', 74), c('Port Said', 58),
      c('Suez', 52), c('Mansoura', 48), c('Tanta', 44), c('Asyut', 42),
      c('Ismailia', 40), c('Luxor', 36), c('Aswan', 34), c('Zagazig', 38),
      c('Damanhur', 32), c('Faiyum', 30),
    ],
    tiers: [
      {
        name: 'Egyptian Premier', clubCount: 18, strength: 40,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 3,
        prizeMoneyTop: 2_200_000, prizeMoneyBottom: 400_000, tvRevenue: 1_600_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2] },
          { competition: 'secondary', positions: [3, 4] },
        ],
      },
    ],
  },
  {
    id: 'mar',
    name: 'Morocco',
    adjective: 'Moroccan',
    code: 'MAR',
    reputation: 53,
    economyFactor: 0.38,
    namePool: 'maghrebi',
    secondaryPools: [{ pool: 'french', weight: 8 }, { pool: 'westAfrican', weight: 5 }],
    confederation: 'CAF',
    population: 37,
    clubNameStyle: 'arabic',
    domesticCupName: 'Coupe du Trone',
    cities: [
      c('Casablanca', 90), c('Rabat', 76), c('Marrakesh', 68), c('Fes', 66),
      c('Tangier', 62), c('Agadir', 56), c('Meknes', 52), c('Oujda', 46),
      c('Kenitra', 44), c('Tetouan', 40), c('Safi', 36), c('Sale', 48),
      c('Nador', 32), c('Berkane', 28),
    ],
    tiers: [
      {
        name: 'Botola Premier', clubCount: 16, strength: 39,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 2,
        prizeMoneyTop: 1_900_000, prizeMoneyBottom: 350_000, tvRevenue: 1_300_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2] },
          { competition: 'secondary', positions: [3, 4] },
        ],
      },
    ],
  },
  {
    id: 'nga',
    name: 'Nigeria',
    adjective: 'Nigerian',
    code: 'NGA',
    reputation: 48,
    economyFactor: 0.3,
    namePool: 'westAfrican',
    secondaryPools: [{ pool: 'english', weight: 8 }],
    confederation: 'CAF',
    population: 223,
    clubNameStyle: 'african',
    domesticCupName: 'Federation Cup',
    cities: [
      c('Lagos', 95), c('Kano', 72), c('Ibadan', 70), c('Abuja', 68),
      c('Port Harcourt', 62), c('Benin City', 56), c('Kaduna', 54),
      c('Enugu', 50), c('Jos', 46), c('Warri', 42), c('Aba', 44),
      c('Uyo', 38), c('Calabar', 36), c('Ilorin', 40),
    ],
    tiers: [
      {
        name: 'Nigerian Premier', clubCount: 18, strength: 34,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 3,
        prizeMoneyTop: 900_000, prizeMoneyBottom: 180_000, tvRevenue: 600_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2] },
          { competition: 'secondary', positions: [3, 4] },
        ],
      },
    ],
  },
  {
    id: 'rsa',
    name: 'South Africa',
    adjective: 'South African',
    code: 'RSA',
    reputation: 50,
    economyFactor: 0.42,
    namePool: 'english',
    secondaryPools: [{ pool: 'westAfrican', weight: 22 }, { pool: 'dutch', weight: 8 }],
    confederation: 'CAF',
    population: 60,
    clubNameStyle: 'african',
    domesticCupName: 'Nedbank Trophy',
    cities: [
      c('Johannesburg', 90), c('Cape Town', 82), c('Durban', 74), c('Pretoria', 68),
      c('Soweto', 66), c('Gqeberha', 54), c('Bloemfontein', 48), c('Polokwane', 44),
      c('Nelspruit', 40), c('Kimberley', 34), c('Rustenburg', 38), c('East London', 42),
      c('Pietermaritzburg', 36), c('Welkom', 30),
    ],
    tiers: [
      {
        name: 'Premier Division', clubCount: 16, strength: 36,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 2,
        prizeMoneyTop: 1_400_000, prizeMoneyBottom: 280_000, tvRevenue: 1_100_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2] },
          { competition: 'secondary', positions: [3, 4] },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- Asia --
  //
  // Japan was alone here, which raised three qualified clubs — below the
  // minimum field, so its league's continental places were being stripped and
  // a Japanese champion had nowhere to go.
  {
    id: 'kor',
    name: 'South Korea',
    adjective: 'South Korean',
    code: 'KOR',
    reputation: 57,
    economyFactor: 0.66,
    namePool: 'korean',
    secondaryPools: [{ pool: 'brazilian', weight: 6 }],
    confederation: 'AFC',
    population: 52,
    clubNameStyle: 'korean',
    domesticCupName: 'Korea Cup',
    cities: [
      c('Seoul', 95), c('Busan', 76), c('Incheon', 72), c('Daegu', 68),
      c('Daejeon', 62), c('Gwangju', 60), c('Ulsan', 58), c('Suwon', 64),
      c('Seongnam', 54), c('Jeonju', 48), c('Pohang', 44), c('Changwon', 46),
      c('Gangwon', 38), c('Jeju', 36),
    ],
    tiers: [
      {
        name: 'K Premier', clubCount: 14, strength: 42,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 2,
        prizeMoneyTop: 3_000_000, prizeMoneyBottom: 700_000, tvRevenue: 2_400_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2] },
          { competition: 'secondary', positions: [3, 4] },
        ],
      },
    ],
  },
  {
    id: 'ksa',
    name: 'Saudi Arabia',
    adjective: 'Saudi',
    code: 'KSA',
    reputation: 60,
    economyFactor: 1.15,
    namePool: 'maghrebi',
    secondaryPools: [
      { pool: 'brazilian', weight: 14 },
      { pool: 'portuguese', weight: 8 },
      { pool: 'westAfrican', weight: 6 },
    ],
    confederation: 'AFC',
    population: 37,
    clubNameStyle: 'arabic',
    domesticCupName: "King's Cup",
    cities: [
      c('Riyadh', 92), c('Jeddah', 84), c('Mecca', 70), c('Medina', 64),
      c('Dammam', 62), c('Taif', 52), c('Buraidah', 46), c('Tabuk', 44),
      c('Khobar', 50), c('Abha', 40), c('Hail', 38), c('Najran', 34),
      c('Jubail', 42), c('Yanbu', 32),
    ],
    tiers: [
      {
        // The wage market here is deliberately out of proportion to the
        // league's standing, because that is exactly what it is.
        name: 'Saudi Premier', clubCount: 16, strength: 44,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 3,
        prizeMoneyTop: 7_000_000, prizeMoneyBottom: 1_800_000, tvRevenue: 5_000_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2] },
          { competition: 'secondary', positions: [3, 4] },
        ],
      },
    ],
  },
  {
    id: 'aus',
    name: 'Australia',
    adjective: 'Australian',
    code: 'AUS',
    reputation: 48,
    economyFactor: 0.62,
    namePool: 'english',
    secondaryPools: [
      { pool: 'italian', weight: 8 },
      { pool: 'balkan', weight: 8 },
      { pool: 'greek', weight: 5 },
    ],
    confederation: 'AFC',
    population: 26,
    clubNameStyle: 'australian',
    domesticCupName: 'Australia Cup',
    cities: [
      c('Sydney', 90), c('Melbourne', 88), c('Brisbane', 72), c('Perth', 68),
      c('Adelaide', 62), c('Gold Coast', 54), c('Newcastle', 50), c('Canberra', 48),
      c('Wollongong', 42), c('Geelong', 40), c('Hobart', 34), c('Townsville', 32),
      c('Cairns', 30), c('Darwin', 28),
    ],
    tiers: [
      {
        name: 'A Premier', clubCount: 14, strength: 36,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 0,
        prizeMoneyTop: 1_600_000, prizeMoneyBottom: 450_000, tvRevenue: 1_200_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2] },
          { competition: 'secondary', positions: [3] },
        ],
      },
    ],
  },

  // ------------------------------------------------------- South America --
  {
    id: 'col',
    name: 'Colombia',
    adjective: 'Colombian',
    code: 'COL',
    reputation: 55,
    economyFactor: 0.34,
    namePool: 'colombian',
    secondaryPools: [{ pool: 'spanish', weight: 8 }],
    confederation: 'CONMEBOL',
    population: 52,
    clubNameStyle: 'iberian',
    domesticCupName: 'Copa Colombia',
    cities: [
      c('Bogota', 92), c('Medellin', 80), c('Cali', 76), c('Barranquilla', 66),
      c('Cartagena', 58), c('Bucaramanga', 54), c('Pereira', 48), c('Manizales', 44),
      c('Cucuta', 46), c('Ibague', 42), c('Santa Marta', 40), c('Pasto', 38),
      c('Villavicencio', 36), c('Neiva', 34),
    ],
    tiers: [
      {
        name: 'Categoria Primera', clubCount: 18, strength: 42,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 2,
        prizeMoneyTop: 1_700_000, prizeMoneyBottom: 350_000, tvRevenue: 1_300_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2] },
          { competition: 'secondary', positions: [3, 4] },
        ],
      },
    ],
  },
  {
    id: 'uru',
    name: 'Uruguay',
    adjective: 'Uruguayan',
    code: 'URU',
    reputation: 53,
    economyFactor: 0.3,
    namePool: 'argentine',
    secondaryPools: [{ pool: 'spanish', weight: 8 }, { pool: 'italian', weight: 6 }],
    confederation: 'CONMEBOL',
    population: 3,
    clubNameStyle: 'iberian',
    domesticCupName: 'Copa Uruguay',
    cities: [
      c('Montevideo', 90), c('Salto', 52), c('Paysandu', 48), c('Las Piedras', 44),
      c('Rivera', 42), c('Maldonado', 46), c('Tacuarembo', 38), c('Melo', 36),
      c('Mercedes', 34), c('Artigas', 32), c('Minas', 30), c('San Jose', 33),
      c('Durazno', 28), c('Florida', 26),
    ],
    tiers: [
      {
        name: 'Primera Uruguaya', clubCount: 16, strength: 40,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 2,
        prizeMoneyTop: 900_000, prizeMoneyBottom: 200_000, tvRevenue: 700_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2] },
          { competition: 'secondary', positions: [3, 4] },
        ],
      },
    ],
  },
  {
    id: 'chi',
    name: 'Chile',
    adjective: 'Chilean',
    code: 'CHI',
    reputation: 52,
    economyFactor: 0.36,
    namePool: 'spanish',
    secondaryPools: [{ pool: 'argentine', weight: 10 }],
    confederation: 'CONMEBOL',
    population: 20,
    clubNameStyle: 'iberian',
    domesticCupName: 'Copa Chile',
    cities: [
      c('Santiago', 90), c('Valparaiso', 68), c('Concepcion', 62), c('Vina del Mar', 58),
      c('Antofagasta', 52), c('Temuco', 48), c('Rancagua', 44), c('Iquique', 42),
      c('La Serena', 46), c('Talca', 38), c('Puerto Montt', 36), c('Arica', 34),
      c('Chillan', 32), c('Osorno', 30),
    ],
    tiers: [
      {
        name: 'Primera Chilena', clubCount: 16, strength: 39,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 2,
        prizeMoneyTop: 1_100_000, prizeMoneyBottom: 240_000, tvRevenue: 850_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2] },
          { competition: 'secondary', positions: [3, 4] },
        ],
      },
    ],
  },

  // ------------------------------------------------------- North America --
  {
    id: 'crc',
    name: 'Costa Rica',
    adjective: 'Costa Rican',
    code: 'CRC',
    reputation: 45,
    economyFactor: 0.3,
    namePool: 'spanish',
    secondaryPools: [{ pool: 'colombian', weight: 8 }],
    confederation: 'CONCACAF',
    population: 5,
    clubNameStyle: 'iberian',
    domesticCupName: 'Copa Costa Rica',
    cities: [
      c('San Jose', 88), c('Alajuela', 66), c('Cartago', 58), c('Heredia', 56),
      c('Liberia', 44), c('Puntarenas', 46), c('Limon', 42), c('Perez Zeledon', 38),
      c('San Carlos', 36), c('Guapiles', 32), c('Turrialba', 30), c('Santa Cruz', 28),
      c('Grecia', 34), c('Palmares', 26),
    ],
    tiers: [
      {
        name: 'Primera Division', clubCount: 12, strength: 32,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 1,
        prizeMoneyTop: 600_000, prizeMoneyBottom: 140_000, tvRevenue: 420_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2] },
          { competition: 'secondary', positions: [3, 4] },
        ],
      },
    ],
  },
  {
    id: 'can',
    name: 'Canada',
    adjective: 'Canadian',
    code: 'CAN',
    reputation: 44,
    economyFactor: 0.7,
    namePool: 'english',
    secondaryPools: [
      { pool: 'french', weight: 16 },
      { pool: 'italian', weight: 6 },
      { pool: 'balkan', weight: 5 },
    ],
    confederation: 'CONCACAF',
    population: 40,
    clubNameStyle: 'american',
    domesticCupName: 'Canadian Championship',
    cities: [
      c('Toronto', 88), c('Montreal', 80), c('Vancouver', 74), c('Calgary', 62),
      c('Edmonton', 60), c('Ottawa', 58), c('Winnipeg', 52), c('Quebec City', 50),
      c('Hamilton', 48), c('Halifax', 44), c('Victoria', 40), c('Saskatoon', 38),
      c('Regina', 34), c('London', 42),
    ],
    tiers: [
      {
        name: 'Canadian Premier', clubCount: 12, strength: 30,
        promotionPlaces: 0, playoffPlaces: 0, relegationPlaces: 0,
        prizeMoneyTop: 700_000, prizeMoneyBottom: 180_000, tvRevenue: 500_000,
        continentalPlaces: [
          { competition: 'elite', positions: [1, 2] },
          { competition: 'secondary', positions: [3] },
        ],
      },
    ],
  },
]
