/**
 * Being out of work.
 *
 * Sacking used to be an announcement rather than an event: severance was paid,
 * the board's message landed, and nothing else changed. `playerClubId` still
 * pointed at the club that had just dismissed you, so the following week they
 * dismissed you again. Over one thirty-five-season career the counter read 169.
 *
 * Now it removes you, and what follows is a jobs board — deliberately a much
 * thinner one than the board at the start of a career. A new director is shown
 * the whole bottom of the pyramid because nobody has an opinion about him yet.
 * A sacked one is shown whatever happens to be vacant, which is not much.
 *
 * Time moves in months rather than weeks while you look. A week at a time with
 * no club and nothing to do would be dead time; a month is the real unit of a
 * job search, and it keeps the sixty-five-year-old clock running, so a long
 * spell out genuinely costs you career.
 */

import type { Club, GameState, JobOffer } from '../types'
import { Rng } from '../rng'
import type { IdFactory } from '../ids'
import { ID_PREFIX } from '../ids'
import { closeCareerEntry, eligibleClubs, sackedBy } from './career'

/** Weeks a "check back next month" skips. */
export const SEARCH_STRIDE_WEEKS = 4

/** What a dismissal takes off your standing in the game. */
export const SACKING_REPUTATION_COST = 4

/** How many posts are open at once. Sparse on purpose. */
const MIN_VACANCIES = 2
const MAX_VACANCIES = 5

/** Chance a given vacancy is filled by somebody else while you deliberate. */
const FILLED_WHILE_YOU_WAIT = 0.45

/**
 * Remove the director from his job.
 *
 * Everything a sacking should do and previously did not: close the career
 * entry so the spell is a matter of record, take the reputation hit, let go of
 * the club, and put the first set of vacancies in front of him.
 */
export function dismissDirector(
  state: GameState,
  ids: IdFactory,
  rng: Rng,
  outcome = 'Sacked',
): void {
  const club = state.playerClubId ? state.clubs[state.playerClubId] : null
  if (club) {
    closeCareerEntry(state.director, club.id, state.date.season, outcome)
  }

  state.director.reputation = Math.max(1, state.director.reputation - SACKING_REPUTATION_COST)
  state.director.contract = null
  state.playerClubId = null

  // Your own post, top of the board, with your name against it. The club you
  // ran on Friday is advertising for a director of football on Monday — it is
  // the first listing anybody in that position would look for, and it is the
  // one job on the board you cannot have. Leaving it off would be tidier and
  // would say nothing; putting it on says the whole thing in one row.
  const offers = openVacancies(state, ids, rng)
  if (club) {
    offers.unshift({
      ...vacancy(state, ids, club),
      pitch: `The job you had until ${weekWord(state.date.week)}. They are advertising already.`,
      barred: true,
      barredReason: `${club.name} dismissed you. They will not be taking your application.`,
    })
  }
  state.director.jobOffers = offers
}

function weekWord(week: number): string {
  return week <= 1 ? 'the end of the season' : 'last week'
}

/**
 * The posts open right now.
 *
 * Drawn from clubs the director's experience actually qualifies him for — that
 * gate widens on its own as he climbs — and kept deliberately thin. A board of
 * everything would make a sacking costless.
 */
export function openVacancies(state: GameState, ids: IdFactory, rng: Rng): JobOffer[] {
  const shut = sackedBy(state.director)
  const eligible = eligibleClubs(state, state.director).filter((c) => !shut.has(c.id))
  if (eligible.length === 0) return []

  const count = Math.min(eligible.length, rng.int(MIN_VACANCIES, MAX_VACANCIES))

  // Clubs in trouble are likelier to be looking: a board that has just sacked
  // somebody is a board with a vacancy.
  const weighted = [...eligible].sort(
    (a, b) => troubleScore(state, b) - troubleScore(state, a),
  )
  return rng.sample(weighted.slice(0, Math.max(count * 3, 8)), count)
    .map((club) => vacancy(state, ids, club))
}

/**
 * A month passes. Some posts are filled by other people, one or two open up.
 *
 * This is the part that makes the board feel like a real one: what is on it
 * changes whether or not you do anything, and the job you were thinking about
 * may not be there when you come back.
 */
export function advanceSearch(
  state: GameState,
  ids: IdFactory,
  rng: Rng,
): { filled: string[]; opened: string[] } {
  const filled: string[] = []
  const kept = state.director.jobOffers.filter((offer) => {
    if (rng.chance(FILLED_WHILE_YOU_WAIT)) {
      filled.push(offer.clubName)
      return false
    }
    return true
  })

  const takenIds = new Set(kept.map((o) => o.clubId))
  const fresh = openVacancies(state, ids, rng)
    .filter((o) => !takenIds.has(o.clubId))
    .slice(0, rng.int(1, 3))

  state.director.jobOffers = [...kept, ...fresh]
  return { filled, opened: fresh.map((o) => o.clubName) }
}

function troubleScore(state: GameState, club: Club): number {
  let score = 0
  if (club.board.confidence < 40) score += 3
  if (club.finances.inCrisis) score += 2
  if (club.finances.balance < 0) score += 1
  if (!club.headCoachId) score += 2
  const table = state.tables[club.leagueId] ?? []
  const position = table.findIndex((row) => row.clubId === club.id) + 1
  if (position > 0 && position > table.length - 4) score += 2
  return score
}

function vacancy(state: GameState, ids: IdFactory, club: Club): JobOffer {
  const league = state.leagues[club.leagueId]
  return {
    id: ids.next(ID_PREFIX.inbox),
    clubId: club.id,
    clubName: club.name,
    leagueName: league?.name ?? 'Unknown',
    clubReputation: club.reputation,
    expectation: { ...club.board.expectation },
    wageOffer: Math.round(Math.pow(club.reputation / 50, 2.4) * 3_200),
    transferBudgetOffer: club.finances.transferBudget,
    // Vacancies are not offers with a clock; they sit there until somebody
    // else takes them, which advanceSearch decides.
    expiresWeek: 52,
    expiresSeason: state.date.season + 1,
    pitch: pitchFor(state, club),
  }
}

function pitchFor(state: GameState, club: Club): string {
  if (club.finances.inCrisis) {
    return 'In trouble, and they know it. Nobody sensible wants this one.'
  }
  if (!club.headCoachId) return 'No head coach either. You would be starting from the floor.'
  if (club.board.confidence < 40) return 'They have just sacked one director. They may sack another.'
  const table = state.tables[club.leagueId] ?? []
  const position = table.findIndex((row) => row.clubId === club.id) + 1
  if (position > 0 && position > table.length - 4) return 'Bottom of the table and out of ideas.'
  return 'A quiet club looking for somebody to take it on.'
}

