import { Rng } from '../rng'

/**
 * Club naming.
 *
 * Clubs are built as {real city} + {generic football suffix}. City names are
 * geography and nobody owns them; the suffixes ("United", "Calcio", "spor")
 * are generic football vocabulary. What we deliberately avoid is the specific
 * *combination* that identifies a real club — see REAL_CLUB_COMBINATIONS.
 *
 * To ship licensed or community-supplied real names instead, replace the
 * output of `generateClubName` via a data pack; nothing downstream depends on
 * how a club got its name.
 */

export type ClubNameStyle =
  | 'british'
  | 'iberian'
  | 'italian'
  | 'german'
  | 'french'
  | 'dutch'
  | 'turkish'
  | 'greek'
  | 'polish'
  | 'nordic'
  | 'brazilian'
  | 'spanish-american'
  | 'american'
  | 'japanese'

interface NamePattern {
  /** `{city}` is substituted; `{n}` becomes a plausible founding year. */
  template: string
  weight: number
  /** Short name template for tables and fixtures. */
  short: string
}

const PATTERNS: Record<ClubNameStyle, NamePattern[]> = {
  british: [
    { template: '{city} United', weight: 14, short: '{city}' },
    { template: '{city} City', weight: 12, short: '{city}' },
    { template: '{city} Town', weight: 10, short: '{city}' },
    { template: '{city} Rovers', weight: 9, short: '{city} Rov' },
    { template: '{city} Athletic', weight: 8, short: '{city} Ath' },
    { template: '{city} Wanderers', weight: 6, short: '{city} Wdrs' },
    { template: '{city} County', weight: 6, short: '{city} Co' },
    { template: '{city} Albion', weight: 6, short: '{city} Alb' },
    { template: '{city} FC', weight: 8, short: '{city}' },
    { template: '{city} Rangers', weight: 5, short: '{city} R' },
    { template: '{city} Vale', weight: 3, short: '{city} V' },
    { template: '{city} Borough', weight: 4, short: '{city} Bor' },
    { template: '{city} Park Rangers', weight: 2, short: '{city} PR' },
    { template: 'Sporting {city}', weight: 3, short: 'Spt {city}' },
  ],
  iberian: [
    { template: 'Real {city}', weight: 10, short: 'R. {city}' },
    { template: 'Sporting {city}', weight: 9, short: 'Spt {city}' },
    { template: 'Deportivo {city}', weight: 9, short: 'Dep {city}' },
    { template: 'Atletico {city}', weight: 10, short: 'Atl {city}' },
    { template: 'CD {city}', weight: 8, short: '{city}' },
    { template: 'UD {city}', weight: 7, short: '{city}' },
    { template: '{city} CF', weight: 10, short: '{city}' },
    { template: 'Racing {city}', weight: 6, short: 'Rac {city}' },
    { template: 'Union {city}', weight: 5, short: 'Un {city}' },
    { template: '{city} FC', weight: 8, short: '{city}' },
  ],
  italian: [
    { template: '{city} Calcio', weight: 14, short: '{city}' },
    { template: 'AC {city}', weight: 10, short: '{city}' },
    { template: 'US {city}', weight: 8, short: '{city}' },
    { template: 'Unione {city}', weight: 6, short: 'Un {city}' },
    { template: '{city} {n}', weight: 8, short: '{city}' },
    { template: 'Virtus {city}', weight: 6, short: 'Vir {city}' },
    { template: 'Pro {city}', weight: 5, short: 'Pro {city}' },
    { template: 'Nuova {city}', weight: 4, short: 'N. {city}' },
    { template: '{city} FC', weight: 8, short: '{city}' },
  ],
  german: [
    { template: 'FC {city}', weight: 12, short: '{city}' },
    { template: 'SV {city}', weight: 10, short: 'SV {city}' },
    { template: 'VfB {city}', weight: 8, short: 'VfB {city}' },
    { template: 'SC {city}', weight: 8, short: 'SC {city}' },
    { template: 'TSV {city}', weight: 7, short: 'TSV {city}' },
    { template: '{city} {n}', weight: 9, short: '{city}' },
    { template: 'Eintracht {city}', weight: 6, short: 'Ein {city}' },
    { template: 'Fortuna {city}', weight: 5, short: 'For {city}' },
    { template: 'Union {city}', weight: 5, short: 'Un {city}' },
    { template: 'Viktoria {city}', weight: 4, short: 'Vik {city}' },
  ],
  french: [
    { template: '{city} OSC', weight: 8, short: '{city}' },
    { template: 'Olympique {city}', weight: 10, short: 'O. {city}' },
    { template: 'AS {city}', weight: 10, short: 'AS {city}' },
    { template: 'FC {city}', weight: 12, short: '{city}' },
    { template: 'Racing {city}', weight: 7, short: 'RC {city}' },
    { template: 'Stade {city}', weight: 8, short: 'St. {city}' },
    { template: '{city} Sporting', weight: 5, short: '{city} Spt' },
    { template: 'US {city}', weight: 5, short: 'US {city}' },
  ],
  dutch: [
    { template: 'FC {city}', weight: 14, short: '{city}' },
    { template: '{city} FC', weight: 8, short: '{city}' },
    { template: 'SC {city}', weight: 8, short: 'SC {city}' },
    { template: 'VV {city}', weight: 6, short: 'VV {city}' },
    { template: 'Sparta {city}', weight: 6, short: 'Spa {city}' },
    { template: 'Excelsior {city}', weight: 5, short: 'Exc {city}' },
    { template: '{city} {n}', weight: 6, short: '{city}' },
    { template: 'Willem {city}', weight: 3, short: 'Wil {city}' },
  ],
  turkish: [
    { template: '{city}spor', weight: 16, short: '{city}spor' },
    { template: '{city} SK', weight: 10, short: '{city}' },
    { template: '{city} Genclik', weight: 7, short: '{city} Gnc' },
    { template: 'Buyuksehir {city}', weight: 5, short: 'B. {city}' },
    { template: '{city} Belediye', weight: 5, short: '{city} Bld' },
    { template: 'Yeni {city}spor', weight: 5, short: 'Y. {city}' },
  ],
  greek: [
    { template: '{city} FC', weight: 10, short: '{city}' },
    { template: 'AE {city}', weight: 10, short: 'AE {city}' },
    { template: 'PAS {city}', weight: 8, short: 'PAS {city}' },
    { template: 'Aris {city}', weight: 6, short: 'Ari {city}' },
    { template: 'Atromitos {city}', weight: 5, short: 'Atr {city}' },
    { template: 'Ethnikos {city}', weight: 6, short: 'Eth {city}' },
    { template: 'Doxa {city}', weight: 5, short: 'Dox {city}' },
  ],
  polish: [
    { template: 'KS {city}', weight: 10, short: 'KS {city}' },
    { template: '{city} SK', weight: 8, short: '{city}' },
    { template: 'Orzel {city}', weight: 8, short: 'Orz {city}' },
    { template: 'Sokol {city}', weight: 7, short: 'Sok {city}' },
    { template: 'Grom {city}', weight: 6, short: 'Grm {city}' },
    { template: 'Polonia {city}', weight: 7, short: 'Pol {city}' },
    { template: 'Start {city}', weight: 5, short: 'Sta {city}' },
  ],
  nordic: [
    { template: '{city} IF', weight: 12, short: '{city}' },
    { template: '{city} BK', weight: 10, short: '{city}' },
    { template: 'IF {city}', weight: 8, short: 'IF {city}' },
    { template: '{city} FF', weight: 8, short: '{city}' },
    { template: '{city} IK', weight: 8, short: '{city}' },
    { template: '{city} United', weight: 4, short: '{city} Utd' },
  ],
  brazilian: [
    { template: '{city} FC', weight: 12, short: '{city}' },
    { template: 'Atletico {city}', weight: 10, short: 'Atl {city}' },
    { template: '{city} EC', weight: 10, short: '{city}' },
    { template: 'Sport {city}', weight: 7, short: 'Spt {city}' },
    { template: 'Nacional {city}', weight: 6, short: 'Nac {city}' },
    { template: 'Clube {city}', weight: 6, short: '{city}' },
    { template: 'Uniao {city}', weight: 5, short: 'Un {city}' },
  ],
  'spanish-american': [
    { template: 'Club {city}', weight: 10, short: '{city}' },
    { template: 'Atletico {city}', weight: 11, short: 'Atl {city}' },
    { template: 'Deportivo {city}', weight: 10, short: 'Dep {city}' },
    { template: 'Independiente {city}', weight: 7, short: 'Ind {city}' },
    { template: 'Racing {city}', weight: 7, short: 'Rac {city}' },
    { template: 'Union {city}', weight: 6, short: 'Un {city}' },
    { template: '{city} FC', weight: 8, short: '{city}' },
  ],
  american: [
    { template: '{city} FC', weight: 14, short: '{city}' },
    { template: '{city} SC', weight: 10, short: '{city}' },
    { template: '{city} United', weight: 9, short: '{city} Utd' },
    { template: 'Real {city}', weight: 6, short: 'R. {city}' },
    { template: 'Inter {city}', weight: 6, short: 'Int {city}' },
    { template: '{city} Athletic', weight: 5, short: '{city} Ath' },
    { template: '{city} City SC', weight: 5, short: '{city}' },
  ],
  japanese: [
    { template: '{city} Ventus', weight: 8, short: '{city}' },
    { template: '{city} Aurora', weight: 8, short: '{city}' },
    { template: '{city} Blaze', weight: 8, short: '{city}' },
    { template: '{city} Dragons', weight: 7, short: '{city}' },
    { template: '{city} Verde', weight: 7, short: '{city}' },
    { template: '{city} Sol', weight: 6, short: '{city}' },
    { template: '{city} FC', weight: 10, short: '{city}' },
    { template: '{city} Kaiyo', weight: 5, short: '{city}' },
  ],
}

/**
 * City + suffix pairs that would reproduce a real club's identity. The
 * generator re-rolls when it lands on one. This is not an exhaustive list of
 * world football — it covers the combinations our city lists can actually
 * produce, which is what matters.
 */
const REAL_CLUB_COMBINATIONS = new Set<string>([
  // England
  'manchester united', 'manchester city', 'newcastle united', 'leeds united',
  'sheffield united', 'west ham united', 'leicester city', 'norwich city',
  'hull city', 'stoke city', 'birmingham city', 'coventry city', 'bristol city',
  'cardiff city', 'swansea city', 'york city', 'lincoln city', 'exeter city',
  'oxford united', 'cambridge united', 'colchester united', 'carlisle united',
  'peterborough united', 'southend united', 'rotherham united', 'scunthorpe united',
  'ipswich town', 'luton town', 'northampton town', 'swindon town', 'huddersfield town',
  'grimsby town', 'shrewsbury town', 'mansfield town', 'cheltenham town',
  'blackburn rovers', 'bristol rovers', 'doncaster rovers', 'tranmere rovers',
  'wigan athletic', 'charlton athletic', 'oldham athletic',
  'bolton wanderers', 'wolverhampton wanderers', 'wycombe wanderers',
  'derby county', 'notts county', 'stockport county',
  'brighton albion', 'burton albion', 'west bromwich albion',
  'queens park rangers', 'plymouth argyle', 'crewe alexandra', 'port vale',
  'nottingham forest', 'sheffield wednesday', 'preston north end',
  // Scotland
  'glasgow rangers', 'aberdeen fc', 'dundee united', 'hamilton academical',
  // Spain / Portugal
  'real madrid', 'atletico madrid', 'real sociedad', 'real betis', 'real zaragoza',
  'athletic bilbao', 'deportivo coruna', 'sporting gijon', 'racing santander',
  'valencia cf', 'sevilla fc', 'celta vigo', 'granada cf', 'cadiz cf',
  'sporting lisbon', 'porto fc', 'braga sc',
  // Italy
  'ac milan', 'inter milan', 'as roma', 'juventus turin', 'napoli calcio',
  'fiorentina calcio', 'atalanta bergamo', 'lazio rome', 'torino calcio',
  'genoa cfc', 'bologna fc', 'udinese calcio', 'cagliari calcio',
  // Germany
  'eintracht frankfurt', 'fortuna dusseldorf', 'union berlin', 'sv hamburg',
  'vfb stuttgart', 'fc cologne', 'sc freiburg', 'fc nuremberg', 'sv bremen',
  'borussia dortmund', 'fc augsburg', 'fc bochum', 'fc kaiserslautern',
  // France
  'olympique marseille', 'olympique lyon', 'as monaco', 'as saint-etienne',
  'stade rennes', 'stade reims', 'stade brest', 'fc nantes', 'fc metz',
  'lille osc', 'montpellier hsc', 'racing strasbourg', 'fc toulouse',
  // Netherlands / Belgium
  'fc utrecht', 'fc groningen', 'fc twente', 'sparta rotterdam',
  'feyenoord rotterdam', 'psv eindhoven', 'ajax amsterdam', 'excelsior rotterdam',
  'club bruges', 'standard liege', 'union brussels',
  // Americas / Asia
  'santos fc', 'sport recife', 'atletico madrid', 'racing avellaneda',
  'independiente avellaneda', 'atlanta united', 'minnesota united',
  'inter miami', 'real salt lake city', 'urawa reds', 'kashima antlers',
])

const CLUB_COLOR_PALETTE: [string, string][] = [
  ['#c8102e', '#ffffff'], ['#003c71', '#ffffff'], ['#0057b8', '#f5d000'],
  ['#1a7a3c', '#ffffff'], ['#6c1d45', '#87ceeb'], ['#000000', '#ffffff'],
  ['#f5a300', '#1a1a1a'], ['#7b2d8b', '#ffffff'], ['#e4572e', '#0b1b2b'],
  ['#00a3a3', '#1a1a1a'], ['#8b1a1a', '#f0e6d2'], ['#12355b', '#d1495b'],
  ['#2b2d42', '#8d99ae'], ['#005f73', '#ee9b00'], ['#9b2226', '#e9d8a6'],
  ['#3d348b', '#f7b801'], ['#1b4332', '#d8f3dc'], ['#7f5539', '#e6ccb2'],
  ['#264653', '#e76f51'], ['#4a4e69', '#f2e9e4'],
]

const NICKNAME_BY_COLOR: Record<string, string[]> = {
  '#c8102e': ['The Reds', 'The Crimson', 'The Red Army'],
  '#003c71': ['The Blues', 'The Navy', 'The Deep Blues'],
  '#0057b8': ['The Blues', 'The Royals', 'The Sky'],
  '#1a7a3c': ['The Greens', 'The Emeralds', 'The Hoops'],
  '#6c1d45': ['The Claret', 'The Wine', 'The Maroons'],
  '#000000': ['The Blacks', 'The Shadows', 'The Magpies'],
  '#f5a300': ['The Amber', 'The Gold', 'The Canaries'],
  '#7b2d8b': ['The Purples', 'The Violets', 'The Royals'],
}

const GENERIC_NICKNAMES = [
  'The Millers', 'The Cobblers', 'The Potters', 'The Ironsides', 'The Quarrymen',
  'The Dockers', 'The Weavers', 'The Foundry', 'The Colliers', 'The Bluebirds',
  'The Seagulls', 'The Owls', 'The Eagles', 'The Wolves', 'The Lions',
  'The Stags', 'The Terriers', 'The Shakers', 'The Saddlers', 'The Chairboys',
]

export interface GeneratedClubName {
  name: string
  shortName: string
  nickname: string
  colors: { primary: string; secondary: string }
  founded: number
}

/**
 * Generate a club name for `city` in the given style, avoiding both real club
 * identities and names already used in this world.
 */
export function generateClubName(
  rng: Rng,
  city: string,
  style: ClubNameStyle,
  taken: Set<string>,
  currentSeason: number,
): GeneratedClubName {
  const patterns = PATTERNS[style] ?? PATTERNS.british
  let chosen = patterns[0]
  let name = ''

  for (let attempt = 0; attempt < 24; attempt++) {
    const pattern = rng.weighted(patterns, patterns.map((p) => p.weight))
    const founded = rng.int(1878, 1932)
    const candidate = pattern.template
      .replace('{city}', city)
      .replace('{n}', String(founded))
    const key = candidate.toLowerCase()
    if (REAL_CLUB_COMBINATIONS.has(key) || taken.has(key)) continue
    chosen = pattern
    name = candidate
    break
  }

  if (!name) {
    // Every pattern collided — fall back to a plainly unique construction.
    name = `${city} ${rng.int(1890, 1925)} FC`
    chosen = { template: name, weight: 1, short: city }
  }

  taken.add(name.toLowerCase())

  const [primary, secondary] = rng.pick(CLUB_COLOR_PALETTE)
  const nicknames = NICKNAME_BY_COLOR[primary] ?? GENERIC_NICKNAMES
  const nickname = rng.chance(0.6) ? rng.pick(nicknames) : rng.pick(GENERIC_NICKNAMES)

  const shortName = chosen.short.replace('{city}', shortenCity(city))

  return {
    name,
    shortName: shortName.length > 14 ? shortName.slice(0, 14) : shortName,
    nickname,
    colors: { primary, secondary },
    founded: rng.int(1878, 1932),
  }
}

/** Trim long city names so league tables stay readable on a phone. */
function shortenCity(city: string): string {
  if (city.length <= 11) return city
  const parts = city.split(/[\s-]/)
  if (parts.length > 1) return parts.map((p) => p.slice(0, 4)).join(' ')
  return city.slice(0, 10)
}

/** Stadium naming: mostly local geography, occasionally a sponsor. */
export function generateStadiumName(rng: Rng, city: string, clubName: string): string {
  const suffixes = ['Park', 'Stadium', 'Ground', 'Arena', 'Road', 'Lane', 'Field', 'Terrace']
  const descriptors = [
    'Victoria', 'Riverside', 'Meadow', 'Hillside', 'Central', 'Northern', 'Western',
    'Kingsway', 'Station', 'Priory', 'Abbey', 'Mill', 'Bridge', 'Forest', 'Harbour',
    'Cathedral', 'Market', 'Castle', 'Grange', 'Oak', 'Elm', 'Bell', 'Crown',
  ]
  const style = rng.int(0, 9)
  if (style <= 4) return `${rng.pick(descriptors)} ${rng.pick(suffixes)}`
  if (style <= 6) return `${city} ${rng.pick(suffixes)}`
  if (style <= 8) return `The ${rng.pick(descriptors)}`
  const first = clubName.split(' ')[0]
  return `${first} ${rng.pick(suffixes)}`
}
