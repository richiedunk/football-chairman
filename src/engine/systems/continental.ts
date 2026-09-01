import { clamp } from '../rng'
import { IdFactory, ID_PREFIX } from '../ids'
import { sortTable } from './board'
import { roundsRequired } from '../sim/cups'
import type { Confederation, ContinentalTier, CupCompetition, GameState, ID } from '../types'

/**
 * Continental competition.
 *
 * The last large hole in the world. Leagues have always awarded qualification
 * places — `continentalPlaces` has been in the nation data from the start —
 * and there was nothing on the other end of them. A league that hands out a
 * European place to a competition that does not exist is worse than a league
 * that does not hand one out, because it promises the player something the
 * game cannot pay.
 *
 * What it has to be, from the director's chair, is four things and not a fifth:
 * a reason the final league position matters beyond the title, a fixture
 * burden that tests squad depth, a revenue line big enough to change what the
 * club can afford, and a standing that makes players answer the phone. It is
 * emphatically not a tactical layer — the head coach picks the side for a
 * European night the same as any other.
 */

/**
 * The smallest field worth calling a competition.
 *
 * A confederation that cannot raise this many qualified clubs does not get one,
 * and — the part that matters — its leagues stop awarding places rather than
 * awarding them into nothing. In this world that is decided by the data: UEFA
 * raises 29 and 26, CONMEBOL 8 and 4, CONCACAF 4 and 4, and Japan on its own
 * raises three. So Europe gets two competitions, South America and North
 * America get one each by merging their two sets of places, and Asia — one
 * nation, no continent to play — gets none.
 */
export const MIN_CONTINENTAL_FIELD = 8

export interface ContinentalDef {
  confederation: Confederation
  tier: ContinentalTier
  name: string
  /** Prize for reaching each round, from first round to winning it. */
  prizeTop: number
}

/**
 * Names are invented rather than borrowed. Real club names are used in this
 * game; real competition names are somebody's trade mark and are not.
 */
export const CONTINENTAL_DEFS: ContinentalDef[] = [
  { confederation: 'UEFA', tier: 'elite', name: 'European Cup', prizeTop: 22_000_000 },
  { confederation: 'UEFA', tier: 'secondary', name: 'European Trophy', prizeTop: 5_500_000 },
  { confederation: 'CONMEBOL', tier: 'elite', name: 'South American Cup', prizeTop: 9_000_000 },
  { confederation: 'CONMEBOL', tier: 'secondary', name: 'South American Shield', prizeTop: 2_200_000 },
  { confederation: 'CONCACAF', tier: 'elite', name: 'North American Cup', prizeTop: 4_000_000 },
  { confederation: 'CONCACAF', tier: 'secondary', name: 'North American Shield', prizeTop: 1_200_000 },
  { confederation: 'CAF', tier: 'elite', name: 'African Cup of Champions', prizeTop: 3_000_000 },
  { confederation: 'CAF', tier: 'secondary', name: 'African Shield', prizeTop: 900_000 },
  { confederation: 'AFC', tier: 'elite', name: 'Asian Champions Cup', prizeTop: 4_500_000 },
  { confederation: 'AFC', tier: 'secondary', name: 'Asian Shield', prizeTop: 1_300_000 },
]

/**
 * Who qualified, by tier, for one confederation.
 *
 * Read off the final league tables rather than stored, so it is always the
 * table that decides and there is no second copy of the truth to drift. A
 * league that finished is a league whose places are settled.
 */
export function qualifiersFor(
  state: GameState,
  confederation: Confederation,
): Record<ContinentalTier, ID[]> {
  const out: Record<ContinentalTier, ID[]> = { elite: [], secondary: [], none: [] }

  for (const nation of Object.values(state.nations)) {
    if (nation.confederation !== confederation) continue
    for (const leagueId of nation.leagueIds) {
      const league = state.leagues[leagueId]
      if (!league || league.continentalPlaces.length === 0) continue
      const table = standingsFor(state, leagueId)
      if (table.length === 0) continue

      for (const place of league.continentalPlaces) {
        for (const position of place.positions) {
          const row = table[position - 1]
          if (!row) continue
          // A club cannot hold two places. Finishing fourth and winning the
          // cup should mean somebody else goes, and until cup winners qualify
          // this at least stops the same club being drawn twice.
          if (out.elite.includes(row.clubId) || out.secondary.includes(row.clubId)) continue
          out[place.competition].push(row.clubId)
        }
      }
    }
  }
  return out
}

/**
 * Finishing order, or the best stand-in for it.
 *
 * At world creation every table is a set of zeroes, and `sortTable` falls
 * through its tie-breaks to sorting by club id — which would have handed the
 * first season's European places out alphabetically. Before a ball is kicked
 * the honest ordering is reputation: these are the clubs that finished top
 * last season, in the fiction that precedes the save.
 */
function standingsFor(state: GameState, leagueId: ID): { clubId: ID }[] {
  const table = state.tables[leagueId] ?? []
  const played = table.reduce((total, row) => total + row.played, 0)
  if (played > 0) return sortTable(table)
  return table
    .slice()
    .sort((a, b) => (state.clubs[b.clubId]?.reputation ?? 0) - (state.clubs[a.clubId]?.reputation ?? 0))
}

/**
 * The competitions a confederation can actually field, and who is in them.
 *
 * Where a confederation is too small for two, its elite and secondary places
 * are merged into the one competition rather than one of them going nowhere.
 * Where it is too small for even that, it gets nothing — and `stripPlaces`
 * takes the places off its leagues so nothing is promised that is not paid.
 */
export function allocateFields(
  state: GameState,
  confederation: Confederation,
): { tier: ContinentalTier; entrants: ID[] }[] {
  const q = qualifiersFor(state, confederation)
  const both = [...q.elite, ...q.secondary]

  if (q.elite.length >= MIN_CONTINENTAL_FIELD && q.secondary.length >= MIN_CONTINENTAL_FIELD) {
    return [
      { tier: 'elite', entrants: q.elite },
      { tier: 'secondary', entrants: q.secondary },
    ]
  }
  if (both.length >= MIN_CONTINENTAL_FIELD) {
    return [{ tier: 'elite', entrants: both }]
  }
  return []
}

/** Every confederation with clubs in this world. */
export function confederationsPresent(state: GameState): Confederation[] {
  const seen = new Set<Confederation>()
  for (const nation of Object.values(state.nations)) {
    if (nation.leagueIds.length > 0) seen.add(nation.confederation)
  }
  return [...seen]
}

/**
 * Take qualification places off leagues whose confederation cannot field a
 * competition.
 *
 * This is the honest half of the feature. A league in a one-nation
 * confederation was awarding a European place to nothing at all; rather than
 * leave the hook dangling, the place is removed, and a club finishing second
 * in Japan is told the truth, which is that there is nowhere to go.
 */
export function stripUnplayablePlaces(state: GameState): Confederation[] {
  const stripped: Confederation[] = []
  for (const confederation of confederationsPresent(state)) {
    if (allocateFields(state, confederation).length > 0) continue
    stripped.push(confederation)
    for (const nation of Object.values(state.nations)) {
      if (nation.confederation !== confederation) continue
      for (const leagueId of nation.leagueIds) {
        const league = state.leagues[leagueId]
        if (league) league.continentalPlaces = []
      }
    }
  }
  return stripped
}

/**
 * Prize money by round, steepening toward the final the way it really does.
 *
 * Sized to the number of rounds this competition actually has, which is set by
 * the size of its field and changes as nations gain and lose places. Built to
 * a fixed six it paid the winner of a five-round competition the semi-final
 * figure, because `settleRound` indexes the array by round number and clamps
 * to its end — the last entry has to be the prize for winning it.
 */
export function buildContinentalPrizeMoney(top: number, rounds: number): number[] {
  const out: number[] = []
  for (let round = 0; round < Math.max(1, rounds); round++) {
    // Each round is worth roughly 1.9x the one before it, so a run is worth
    // far more than the sum of its early rounds — which is what makes a
    // quarter-final worth risking a tired squad for.
    out.push(Math.round(top / Math.pow(1.9, Math.max(1, rounds) - 1 - round)))
  }
  return out
}

/** The prize scale a competition was defined with. */
export function defFor(cup: CupCompetition): ContinentalDef | null {
  if (!cup.confederation) return null
  return CONTINENTAL_DEFS.find(
    (d) => d.confederation === cup.confederation && d.tier === cup.tier,
  ) ?? null
}

/**
 * Create the competitions for a world. Called once, at world creation.
 *
 * Entrants are left empty: `refreshContinentalEntrants` fills them from the
 * tables, and it runs at creation as well as at every season roll, so there is
 * one code path rather than a special first year.
 */
export function createContinentalCups(state: GameState, ids: IdFactory): CupCompetition[] {
  const created: CupCompetition[] = []
  for (const confederation of confederationsPresent(state)) {
    for (const field of allocateFields(state, confederation)) {
      const def = CONTINENTAL_DEFS.find(
        (d) => d.confederation === confederation && d.tier === field.tier,
      )
      if (!def) continue
      const cup: CupCompetition = {
        id: ids.next(ID_PREFIX.cup),
        name: def.name,
        nationId: null,
        type: 'continental',
        tier: field.tier,
        confederation,
        entrantIds: [],
        rounds: [],
        currentRound: 0,
        winnerId: null,
        // Filled properly by refreshContinentalEntrants once the field is
        // known; a competition with no entrants yet has no ladder to build.
        prizeMoneyPerRound: [],
      }
      state.cups[cup.id] = cup
      created.push(cup)
    }
  }
  return created
}

/**
 * Re-draw the field from last season's tables.
 *
 * Run before `resetCup`, which reads `entrantIds` for a competition with no
 * nation of its own.
 */
export function refreshContinentalEntrants(state: GameState): void {
  const byConfederation = new Map<Confederation, { tier: ContinentalTier; entrants: ID[] }[]>()
  for (const cup of Object.values(state.cups)) {
    if (cup.type !== 'continental' || !cup.confederation) continue
    if (!byConfederation.has(cup.confederation)) {
      byConfederation.set(cup.confederation, allocateFields(state, cup.confederation))
    }
    const fields = byConfederation.get(cup.confederation) ?? []
    // When a confederation has shrunk to one competition, the surviving cup is
    // the elite one and it takes everybody.
    const field = fields.find((f) => f.tier === cup.tier) ?? (fields.length === 1 ? fields[0] : null)
    cup.entrantIds = field && fields.some((f) => f.tier === cup.tier) ? field.entrants : []

    // The ladder is rebuilt with the field, because the number of rounds falls
    // out of how many clubs are in it and the last rung has to be the prize
    // for winning the thing.
    const def = defFor(cup)
    if (def) {
      cup.prizeMoneyPerRound = buildContinentalPrizeMoney(
        def.prizeTop,
        roundsRequired(cup.entrantIds.length),
      )
    }
  }
}

/**
 * What a continental run is worth, beyond the money.
 *
 * `continentalReputation` has existed on every club since the world was first
 * generated and has only ever drifted toward domestic reputation. Now it moves
 * on results, which is what makes a European run change who will sign for you
 * rather than only what you can pay them.
 */
export function awardContinentalStanding(
  state: GameState,
  cup: CupCompetition,
  clubId: ID,
  roundsSurvived: number,
  totalRounds: number,
): void {
  const club = state.clubs[clubId]
  if (!club) return
  const depth = totalRounds > 0 ? roundsSurvived / totalRounds : 0
  const weight = cup.tier === 'elite' ? 9 : 4
  club.continentalReputation = Math.round(
    clamp(club.continentalReputation + depth * weight, 3, 99),
  )
}

/** Human-readable summary of a club's campaign, for the season history. */
export function continentalResultFor(
  state: GameState,
  clubId: ID,
): string {
  for (const cup of Object.values(state.cups)) {
    if (cup.type !== 'continental') continue
    if (!cup.entrantIds.includes(clubId)) continue
    if (cup.winnerId === clubId) return `Won the ${cup.name}`
    const rounds = cup.rounds.filter((r) => r.fixtureIds.some((fid) => {
      const fixture = state.fixtures.find((f) => f.id === fid)
      return fixture && (fixture.homeClubId === clubId || fixture.awayClubId === clubId)
    }))
    const last = rounds[rounds.length - 1]
    return last ? `${cup.name}: ${last.name}` : `${cup.name}: entered`
  }
  return '—'
}

