
import { clamp, Rng } from '../../rng'
import { quickSimulate, simulateMatch } from '../../sim/match'
import { applyMatchFatigue } from '../../systems/injuries'
import { cupWeeksFor, drawNextRoundIfDue, settleRound } from '../../sim/cups'
import { awardContinentalStanding } from '../../systems/continental'
import { ELEVEN, canFieldEleven, fieldable, fixAiSquad } from '../../systems/matchday'
import { boardRemark, scoredAgainstUs } from '../../systems/oneThatGotAway'
import { positionGroup } from '../../world/attributes'
import { addInboxItem, addNews } from '../../systems/inbox'
import { paySeverance } from '../../systems/directorContract'
import { dismissDirector } from '../../systems/jobSearch'
import { phase } from '../context'
import type { Club, Fixture, GameState, ID, MatchResult, Player } from '../../types'

/**
 * The football.
 *
 * Five phases in a fixed order, and the order is the whole point. Cup ties are
 * drawn before the fixture list is taken, or this week's ties would not be
 * played until next week and a cup run would cost a club nothing in squad
 * depth. Every club is checked for a legal eleven before a ball is kicked,
 * because a league that cannot fulfil its own calendar is a broken world
 * rather than a hard lesson. And gate receipts are captured off the result
 * while the result still has them — most are trimmed to nothing immediately
 * afterwards, and finance does not run until later in the week.
 *
 * That last one shipped once: attendance was read after the trim and every
 * club in the world took nothing at the gate. It is a declared fact now, so
 * the phase that needs it says so and gets it from the phase that produced it.
 */

export const cupDraws = phase({
  name: 'cupDraws',
  run({ state, ids, rng }) {
    // Drawn before matches are simulated so this week's cup ties are played in
    // the same pass as the league programme — which is what makes a cup run cost
    // squad depth rather than simply adding money.
    for (const cup of Object.values(state.cups)) {
      const drawn = drawNextRoundIfDue(state, cup, ids, rng.fork(`cupdraw:${cup.id}`))
      if (drawn.length === 0) continue
      state.fixtures.push(...drawn)

      const involvesPlayer = drawn.some(
        (f) => f.homeClubId === state.playerClubId || f.awayClubId === state.playerClubId,
      )
      if (involvesPlayer) {
        const tie = drawn.find(
          (f) => f.homeClubId === state.playerClubId || f.awayClubId === state.playerClubId,
        )!
        const home = tie.homeClubId === state.playerClubId
        const opponent = state.clubs[home ? tie.awayClubId : tie.homeClubId]
        const round = cup.rounds[cup.rounds.length - 1]
        addInboxItem(state, ids, {
          category: 'match',
          subject: `${cup.name}: ${round?.name ?? 'draw'}`,
          from: 'Competition Secretary',
          body: `You have been drawn ${home ? 'at home to' : 'away to'} ${opponent?.name ?? 'an opponent'} in the ${round?.name.toLowerCase() ?? 'next round'}.`,
          link: { view: 'league' },
        })
      }
    }
  },
})

/**
 * This week's programme, and who is banned from it.
 *
 * Also opens the three collections the match phase fills. They are created here
 * rather than there so that a week with no fixtures still leaves them empty
 * rather than missing, and every later phase can read them unconditionally.
 */
export const fixtureList = phase({
  name: 'fixtureList',
  writes: ['weekFixtures', 'suspendedIds', 'playedClubs', 'gateReceipts', 'playerFixtures'],
  run({ state, week, facts }) {
    facts.playedClubs = new Set<ID>()
    facts.gateReceipts = new Map<ID, number>()
    facts.playerFixtures = []
    facts.weekFixtures = state.fixtures.filter(
      (f) => f.week === week && f.season === state.date.season && !f.result,
    )

    // Suspensions are computed once for the week from accumulated cards.
    facts.suspendedIds = collectSuspensions(state)
  },
})

export const matchdayIntegrity = phase({
  name: 'matchdayIntegrity',
  reads: ['weekFixtures', 'playerClub'],
  writes: ['playerClub'],
  run({ state, ids, names, rng, week, facts, sack }) {
    const { weekFixtures, playerClub } = facts
    //
    // Before a ball is kicked, every club with a fixture has to have eleven
    // players. Nothing forfeits: a league that cannot fulfil its own calendar is
    // a broken world, not a hard lesson. The two sides answer for it differently.
    //
    // An AI club fixes itself — academy, free agent, and an invented sixteen-
    // year-old as the admission of last resort. The human is not rescued: he has
    // been warned every week it was true (section 5b), and if it is still true
    // on the morning of a match he is dismissed for it. Failing to put eleven
    // players on a pitch is the one thing a director of football is
    // unambiguously employed to prevent. The club then becomes an AI club and
    // fixes the side in time to kick off, which is why the fixture still stands.
    const matchdayDeps = { ids, names, rng: rng.fork('matchday') }
    const playingThisWeek = new Set<ID>()
    for (const fixture of weekFixtures) {
      playingThisWeek.add(fixture.homeClubId)
      playingThisWeek.add(fixture.awayClubId)
    }

    const clubOnMatchday = playerClub
    if (clubOnMatchday && playingThisWeek.has(clubOnMatchday.id)
      && !canFieldEleven(state, clubOnMatchday, week)) {
      const short = ELEVEN - fieldable(state, clubOnMatchday, week).length
      addInboxItem(state, ids, {
        category: 'board',
        subject: 'You are dismissed',
        from: 'Chairman',
        body: `We have a match this week and you have left us ${short} player`
          + `${short === 1 ? '' : 's'} short of a legal side. Whatever else this job is, `
          + 'it is putting eleven players on a pitch. Your contract is terminated with '
          + 'immediate effect and we will assemble a team ourselves.',
        urgent: true,
        link: { view: 'career' },
      })
      sack('Dismissed for failing to field a side.')
      paySeverance(state, clubOnMatchday)
      dismissDirector(state, ids, rng.fork('dismissal:squad'))
      // The club stops being his here, mid-week, and every phase after this one
      // has to see that. When this was a procedure it was a second call to
      // `playerClub(state)` two hundred lines below, with nothing saying why the
      // two might disagree.
      facts.playerClub = null
    }

    for (const clubId of playingThisWeek) {
      const club = state.clubs[clubId]
      if (!club || club.id === state.playerClubId) continue
      if (canFieldEleven(state, club, week)) continue
      fixAiSquad(state, club, matchdayDeps, week)
    }
  },
})

export const matches = phase({
  name: 'matches',
  reads: ['weekFixtures', 'suspendedIds', 'playedClubs', 'gateReceipts', 'playerFixtures'],
  writes: ['playedClubs', 'gateReceipts', 'playerFixtures'],
  run({ state, ids, rng, facts }) {
    const { weekFixtures, suspendedIds, playedClubs, gateReceipts, playerFixtures } = facts
    for (const fixture of weekFixtures) {
      const home = state.clubs[fixture.homeClubId]
      const away = state.clubs[fixture.awayClubId]
      if (!home || !away) continue

      // Full simulation only where the player might actually look. Everything
      // else uses the same strength model with event generation switched off.
      const detailed =
        home.id === state.playerClubId
        || away.id === state.playerClubId
        || involvesTrackedPlayer(state, home, away)

      const matchRng = rng.fork(fixture.id)
      // A single-leg knockout tie has to produce a winner on the night, or
      // nobody is eliminated and the competition never reaches a final. A leg of
      // a two-legged tie must NOT: it is allowed to be drawn, because the tie is
      // settled on aggregate afterwards.
      const matchCtx = {
        suspendedIds,
        mustHaveWinner: fixture.competitionType !== 'league' && !fixture.legOf,
      }
      const matchResult = detailed
        ? simulateMatch(state, home, away, matchRng, matchCtx, true)
        : quickSimulate(state, home, away, matchRng, matchCtx)

      fixture.result = matchResult
      applyMatchOutcome(state, fixture, matchResult, matchRng)

      // Full results are only worth keeping for matches the player can look at.
      // A season is ~9,000 fixtures worldwide, and storing 22 lineup ids and 22
      // ratings for each of them was several megabytes of save file describing
      // matches nobody will ever open. Everything the simulation needs from a
      // result has already been applied to tables, stats and form by this point.
      playedClubs.add(home.id)
      playedClubs.add(away.id)
      gateReceipts.set(home.id, matchResult.attendance ?? 0)

      // Did they have to turn people away? `computeAttendance` clamps fill at
      // capacity, so the excess demand is gone by the time anyone could read
      // it — but a full ground is a fact worth keeping, and it is the only
      // reason a club ever has to build a bigger one.
      const capacity = home.facilities.stadium.capacity
      if (capacity > 0 && (matchResult.attendance ?? 0) >= capacity) {
        home.facilities.stadium.selloutsThisSeason++
      }

      // Trimmed after the week has taken what it needs, not before: the gate
      // receipts above are the last reader of a match nobody will open.
      if (!detailed) slimResult(matchResult)

      if (home.id === state.playerClubId || away.id === state.playerClubId) {
        playerFixtures.push({ fixture, result: matchResult })

        // Did one of ours score against us?
        //
        // The worst version of the whole thing, and the one the board mentions.
        // Everything else about a released boy can be read about at a distance;
        // this happened in front of everybody, and the chairman was there.
        const ours = state.clubs[state.playerClubId!]
        for (const event of matchResult.events) {
          if (event.type !== 'goal' && event.type !== 'penaltyScored') continue
          if (event.clubId === ours.id) continue
          const ghost = scoredAgainstUs(state, ours, event.playerId)
          if (!ghost) continue
          ours.fanMood = clamp(ours.fanMood - 4, 1, 100)
          addInboxItem(state, ids, {
            category: 'board',
            subject: `${ghost.knownAs} scored against us`,
            from: 'Chairman',
            body: boardRemark(ghost, state),
            urgent: false,
            link: { view: 'player', id: ghost.id },
          })
        }
      }
    }
  },
})

export const cupRounds = phase({
  name: 'cupRounds',
  reads: ['playerClub'],
  run({ state, ids, week, facts }) {
    const { playerClub } = facts
    for (const cup of Object.values(state.cups)) {
      const round = cup.rounds[cup.rounds.length - 1]
      if (!round || round.week !== week) continue
      const settled = settleRound(state, cup, round)

      // What a European run is worth beyond the money.
      //
      // Wired here rather than inside `settleRound` because `continental.ts`
      // already imports from `cups.ts`, and the orchestration layer is where
      // one system is allowed to know about another. Everyone knocked out is
      // credited with the rounds they actually survived; the winner is
      // credited with all of them.
      if (cup.type === 'continental') {
        const totalRounds = Math.max(1, cupWeeksFor(cup.entrantIds.length || 2, cup.type).length)
        for (const clubId of settled.eliminated) {
          awardContinentalStanding(state, cup, clubId, round.round - 1, totalRounds)
        }
        if (settled.winnerId) {
          awardContinentalStanding(state, cup, settled.winnerId, totalRounds, totalRounds)
        }
      }

      if (settled.winnerId === state.playerClubId) {
        addInboxItem(state, ids, {
          category: 'match',
          subject: `You have won the ${cup.name}`,
          from: 'Chairman',
          body: `${playerClub?.name} are ${cup.name} winners. Nobody will forget this season.`,
          link: { view: 'club' },
        })
      } else if (state.playerClubId && settled.eliminated.includes(state.playerClubId)) {
        addNews(state, ids, 'match', `Knocked out of the ${cup.name} in the ${round.name.toLowerCase()}.`)
      }
    }
  },
})

/** Apply a match result to tables, stats, form and fatigue. */
function applyMatchOutcome(
  state: GameState,
  fixture: Fixture,
  result: MatchResult,
  rng: Rng,
): void {
  const home = state.clubs[fixture.homeClubId]
  const away = state.clubs[fixture.awayClubId]
  if (!home || !away) return

  // League table.
  if (fixture.competitionType === 'league') {
    const table = state.tables[fixture.competitionId]
    if (table) {
      const homeRow = table.find((r) => r.clubId === home.id)
      const awayRow = table.find((r) => r.clubId === away.id)
      if (homeRow && awayRow) {
        homeRow.played++
        awayRow.played++
        homeRow.goalsFor += result.homeGoals
        homeRow.goalsAgainst += result.awayGoals
        awayRow.goalsFor += result.awayGoals
        awayRow.goalsAgainst += result.homeGoals

        if (result.homeGoals > result.awayGoals) {
          homeRow.won++; homeRow.points += 3; awayRow.lost++
          pushForm(homeRow.form, 'W'); pushForm(awayRow.form, 'L')
        } else if (result.homeGoals < result.awayGoals) {
          awayRow.won++; awayRow.points += 3; homeRow.lost++
          pushForm(homeRow.form, 'L'); pushForm(awayRow.form, 'W')
        } else {
          homeRow.drawn++; awayRow.drawn++
          homeRow.points++; awayRow.points++
          pushForm(homeRow.form, 'D'); pushForm(awayRow.form, 'D')
        }
      }
    }
  }

  // Fan mood is deliberately NOT adjusted here. Nudging it per result, with a
  // defeat costing more than a win paid, is what made it decay on its own; the
  // weekly assessment reads recent form directly from the table instead.

  // Player stats, ratings, fatigue.
  const allLineups = [
    { ids: result.homeLineup, club: home, conceded: result.awayGoals },
    { ids: result.awayLineup, club: away, conceded: result.homeGoals },
  ]

  for (const { ids: lineup, conceded } of allLineups) {
    for (const playerId of lineup) {
      const player = state.players[playerId]
      if (!player) continue
      player.stats.appearances++
      player.stats.starts++
      player.stats.minutes += 90
      const rating = result.ratings[playerId] ?? 6.5
      player.stats.ratingSum += rating
      if (conceded === 0 && isDefensivePosition(player)) player.stats.cleanSheets++
      applyMatchFatigue(player, 90, rng)
      // Form tracks recent ratings directly, so a run of good performances is
      // visible before it shows up in results.
      player.form = clamp(player.form + (rating - 6.5) * 4, 1, 100)
      player.morale = clamp(player.morale + (rating - 6.4) * 1.2, 1, 100)
    }
  }

  // Event-derived stats.
  for (const event of result.events) {
    const player = state.players[event.playerId]
    if (!player) continue
    switch (event.type) {
      case 'goal':
      case 'penaltyScored':
        player.stats.goals++
        if (event.secondaryPlayerId) {
          const assister = state.players[event.secondaryPlayerId]
          if (assister) assister.stats.assists++
        }
        break
      case 'yellowCard':
        player.stats.yellowCards++
        // Every fifth booking in a season earns a one-match ban.
        if (player.stats.yellowCards % 5 === 0) player.suspendedWeeks = 1
        break
      case 'redCard':
        player.stats.redCards++
        // A straight red is a longer ban than a second yellow, but the event
        // does not distinguish them, so this takes the middle ground.
        player.suspendedWeeks = Math.max(player.suspendedWeeks, rng.int(1, 3))
        break
      case 'injury': {
        const club = state.clubs[event.clubId]
        if (club && !player.injury) {
          const medical = club.facilities.medicalCentre
          player.injury = {
            type: 'Match injury',
            weeksRemaining: Math.max(1, Math.round(rng.int(1, 8) * (1.2 - medical / 40))),
            severity: 'minor',
            lingeringEffect: 0,
          }
        }
        break
      }
      case 'substitution': {
        const off = event.secondaryPlayerId ? state.players[event.secondaryPlayerId] : null
        if (off) off.stats.minutes -= Math.max(0, 90 - event.minute)
        const on = state.players[event.playerId]
        if (on && !result.homeLineup.includes(on.id) && !result.awayLineup.includes(on.id)) {
          on.stats.appearances++
          on.stats.minutes += Math.max(0, 90 - event.minute)
        }
        break
      }
      default:
        break
    }
  }

  // Man of the match.
  const best = Object.entries(result.ratings).sort((a, b) => b[1] - a[1])[0]
  if (best) {
    const player = state.players[best[0]]
    if (player) player.stats.motmAwards++
  }
}
/** Strip the per-player detail from a result once it has been applied. */
function slimResult(result: MatchResult): void {
  result.events = []
  result.ratings = {}
  result.homeLineup = []
  result.awayLineup = []
  // Deleted rather than emptied: a key set to zero still costs its name in the
  // save, and nine thousand fixtures a season pay it. The score and any
  // shootout stay, because tables and cup progression read them.
  delete result.possession
  delete result.shots
  delete result.shotsOnTarget
  delete result.attendance
  delete result.summary
}
function pushForm(form: ('W' | 'D' | 'L')[], outcome: 'W' | 'D' | 'L'): void {
  form.push(outcome)
  if (form.length > 6) form.shift()
}
/** Who a clean sheet belongs to: the goalkeeper and the back four. */
function isDefensivePosition(player: Player): boolean {
  const group = positionGroup(player.position)
  return group === 'goalkeeper' || group === 'defender'
}
/**
 * Players serving a suspension this week, and tick down everyone else's.
 *
 * Suspensions are stored as a countdown on the player rather than inferred
 * from card totals: inferring it means a player with five yellows is suspended
 * forever, and no amount of arithmetic on totals can distinguish "banned this
 * week" from "banned three weeks ago".
 */
function collectSuspensions(state: GameState): Set<ID> {
  const suspended = new Set<ID>()
  for (const player of Object.values(state.players)) {
    if (player.suspendedWeeks > 0) {
      suspended.add(player.id)
      player.suspendedWeeks -= 1
    }
  }
  return suspended
}
/** Whether either club fields a player the human is tracking. */
function involvesTrackedPlayer(state: GameState, home: Club, away: Club): boolean {
  if (state.shortlist.length === 0) return false
  const tracked = new Set(state.shortlist)
  return (
    home.squad.some((id) => tracked.has(id)) || away.squad.some((id) => tracked.has(id))
  )
}
