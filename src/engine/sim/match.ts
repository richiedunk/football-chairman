import { clamp, Rng } from '../rng'
import type {
  Club, GameState, ID, MatchEvent, MatchResult, Player, Position,
} from '../types'
import { selectTeam, type AvailabilityContext, type SelectedTeam } from './selection'

/**
 * Match simulation.
 *
 * Produces a scoreline, per-player ratings and a highlights timeline. The
 * engine is chance-based rather than possession-tick-based: the match is cut
 * into segments, each segment is contested, and a won segment becomes a
 * chance which may become a goal. That is enough fidelity to make squad
 * quality, depth and fitness visibly matter without pretending to model a
 * game of football the player never watches.
 *
 * Two modes exist. Full simulation generates events and is used for matches
 * the player can see — their own club, and any match involving a player they
 * are tracking. Quick simulation skips event generation for the other ~250
 * matches played every week across the world, which is the difference between
 * a weekly tick that takes 80ms and one that takes two seconds.
 */

const SEGMENTS = 18 // 5 minutes each

/**
 * Home advantage, applied to territorial control. Calibrated against the
 * real-world split of roughly 45% home wins, 25% draws, 30% away wins.
 */
const HOME_ADVANTAGE = 1.16
/** Extra conversion edge at home, over and above the territorial advantage. */
const HOME_CONVERSION_BONUS = 0.025

/**
 * Chance volume per segment. Deliberately *not* scaled by the absolute quality
 * of the two sides: a non-league match is not a slower game than a top-flight
 * one, it is a worse-executed one. Scaling volume by quality made lower
 * divisions average 0.7 goals a game and 57% draws, which is nothing like
 * football at any level. Quality shows up in conversion and in how lopsided
 * the share of chances is, not in whether chances happen at all.
 */
const FIRST_CHANCE_PROBABILITY = 0.85
const SECOND_CHANCE_PROBABILITY = 0.6

/** Share of shots that hit the target, before quality adjustment. */
const BASE_ON_TARGET = 0.35
/** Share of on-target shots that go in, before quality adjustment. */
const BASE_CONVERSION = 0.265

export interface MatchContext {
  suspendedIds: Set<ID>
  /** Neutral venue: cup finals. Disables home advantage and splits the crowd. */
  neutralVenue?: boolean
  /** Extra time and penalties if the tie must produce a winner. */
  mustHaveWinner?: boolean
}

export function simulateMatch(
  state: GameState,
  homeClub: Club,
  awayClub: Club,
  rng: Rng,
  ctx: MatchContext,
  detailed: boolean,
): MatchResult {
  const availability: AvailabilityContext = { suspendedIds: ctx.suspendedIds }
  const home = selectTeam(state, homeClub, rng, availability)
  const away = selectTeam(state, awayClub, rng, availability)

  return runMatch(state, homeClub, awayClub, home, away, rng, ctx, detailed)
}

function runMatch(
  state: GameState,
  homeClub: Club,
  awayClub: Club,
  home: SelectedTeam,
  away: SelectedTeam,
  rng: Rng,
  ctx: MatchContext,
  detailed: boolean,
): MatchResult {
  const advantage = ctx.neutralVenue ? 1 : HOME_ADVANTAGE

  // Territory: who controls the game. Midfield dominates, with attack and
  // defence contributing at the edges.
  const homeControl = home.strength.midfield * 0.62 + home.strength.attack * 0.22 + home.strength.defence * 0.16
  const awayControl = away.strength.midfield * 0.62 + away.strength.attack * 0.22 + away.strength.defence * 0.16
  const homeControlAdj = homeControl * advantage

  const totalControl = homeControlAdj + awayControl
  const homeShare = totalControl > 0 ? homeControlAdj / totalControl : 0.5
  const possession = Math.round(clamp(50 + (homeShare - 0.5) * 78, 22, 78))

  const events: MatchEvent[] = []
  const ratings: Record<ID, number> = {}
  const involvement: Record<ID, number> = {}

  // Weighted pick tables, built once per match.
  //
  // Choosing a goalscorer, an assister, a bookable offender or an injury
  // victim are all weighted draws over the same eleven players. Rebuilding
  // those tables inside the chance loop meant allocating four arrays per
  // chance, ~26 chances a match, ~120 matches a week — comfortably the largest
  // source of garbage in the whole simulation. The eleven do not change during
  // the match, so neither do the weights.
  const homeTables = buildPickTables(state, home)
  const awayTables = buildPickTables(state, away)

  let homeGoals = 0
  let awayGoals = 0
  const shots = { home: 0, away: 0 }
  const shotsOnTarget = { home: 0, away: 0 }

  // Track who is on the pitch so events can name substitutes correctly.
  const onPitch = {
    home: new Set(home.starters.map((s) => s.playerId)),
    away: new Set(away.starters.map((s) => s.playerId)),
  }
  const subsUsed = { home: 0, away: 0 }
  const sentOff = new Set<ID>()
  const booked = new Set<ID>()

  for (let segment = 0; segment < SEGMENTS; segment++) {
    const minuteBase = segment * 5

    // Red cards shift the balance for the rest of the match, which is what
    // makes a hothead centre-back an actual liability rather than flavour.
    const homePenalty = countSentOff(home, sentOff) * 0.13
    const awayPenalty = countSentOff(away, sentOff) * 0.13

    const homeSegmentControl = homeControlAdj * (1 - homePenalty)
    const awaySegmentControl = awayControl * (1 - awayPenalty)
    const segTotal = homeSegmentControl + awaySegmentControl
    const homeSegShare = segTotal > 0 ? homeSegmentControl / segTotal : 0.5

    // Chance volume is broadly constant across the pyramid; which side gets
    // them is not.
    let chanceCount = 0
    if (rng.chance(FIRST_CHANCE_PROBABILITY)) chanceCount++
    if (rng.chance(SECOND_CHANCE_PROBABILITY)) chanceCount++

    for (let ch = 0; ch < chanceCount; ch++) {
      const isHome = rng.chance(homeSegShare)
      const attackTeam = isHome ? home : away
      const defendTeam = isHome ? away : home
      const attackClub = isHome ? homeClub : awayClub
      const minute = clamp(minuteBase + rng.int(1, 5), 1, 90)

      if (isHome) shots.home++
      else shots.away++

      // Chance quality: attack against defence, decided on the balance of the
      // two, with a floor so even a poor side occasionally creates something.
      const attackQuality = attackTeam.strength.attack * 0.62 + attackTeam.strength.midfield * 0.38
      const defenceQuality = defendTeam.strength.defence * 0.78 + defendTeam.strength.midfield * 0.22
      const openingChance = clamp(
        BASE_ON_TARGET + (attackQuality - defenceQuality) / 620,
        0.15,
        0.6,
      )

      const attackTables = isHome ? homeTables : awayTables
      const defendTables = isHome ? awayTables : homeTables

      if (!rng.chance(openingChance)) {
        // Chance broken up before a shot on target.
        if (detailed && rng.chance(0.28)) {
          const player = pickWeighted(attackTables.players, attackTables.scorerWeights, rng)
          if (player) {
            events.push(makeEvent(minute, 'chanceMissed', attackClub.id, player.id, undefined,
              `${player.knownAs} drags a shot wide from the edge of the area.`))
            involvement[player.id] = (involvement[player.id] ?? 0) + 0.4
          }
        }
        continue
      }

      if (isHome) shotsOnTarget.home++
      else shotsOnTarget.away++

      // Conversion: finisher against goalkeeper.
      const keeperQuality = defendTeam.strength.goalkeeper
      const conversion = clamp(
        BASE_CONVERSION
          + (attackQuality - keeperQuality) / 780
          + (isHome && !ctx.neutralVenue ? HOME_CONVERSION_BONUS : 0),
        0.12,
        0.55,
      )

      if (rng.chance(conversion)) {
        const scorer = pickWeighted(attackTables.players, attackTables.scorerWeights, rng)
        if (!scorer) continue
        if (isHome) homeGoals++
        else awayGoals++
        involvement[scorer.id] = (involvement[scorer.id] ?? 0) + 3

        const assister = rng.chance(0.72)
          ? pickWeightedExcluding(attackTables.players, attackTables.assistWeights, scorer.id, rng)
          : null
        if (assister) involvement[assister.id] = (involvement[assister.id] ?? 0) + 1.4

        if (detailed) {
          const isPenalty = rng.chance(0.09)
          events.push(makeEvent(
            minute,
            isPenalty ? 'penaltyScored' : 'goal',
            attackClub.id,
            scorer.id,
            assister?.id,
            isPenalty
              ? `${scorer.knownAs} sends the keeper the wrong way from the spot.`
              : assister
                ? `${scorer.knownAs} finishes from ${assister.knownAs}'s pass.`
                : `${scorer.knownAs} scores.`,
          ))
        }
      } else {
        const shooter = pickWeighted(attackTables.players, attackTables.scorerWeights, rng)
        const keeperId = defendTables.keeperId
        if (shooter) involvement[shooter.id] = (involvement[shooter.id] ?? 0) + 0.6
        if (keeperId) involvement[keeperId] = (involvement[keeperId] ?? 0) + 1
        if (detailed && keeperId) {
          const keeper = state.players[keeperId]
          if (keeper && shooter) {
            events.push(makeEvent(minute, 'save', attackClub.id, shooter.id, keeper.id,
              `${keeper.knownAs} saves well from ${shooter.knownAs}.`))
          }
        }
      }
    }

    // Discipline. Temperament drives it, so a squad full of hotheads costs you
    // points over a season rather than in one memorable incident.
    if (rng.chance(0.09)) {
      const isHome = rng.chance(0.5)
      const club = isHome ? homeClub : awayClub
      const tables = isHome ? homeTables : awayTables
      const offender = pickWeighted(
        tables.players,
        tables.disciplineWeights.map((w, i) =>
          sentOff.has(tables.players[i].id) ? 0 : booked.has(tables.players[i].id) ? w * 0.25 : w,
        ),
        rng,
      )
      if (offender) {
        const minute = clamp(minuteBase + rng.int(1, 5), 1, 90)
        // A player already booked goes for a second yellow. Without this the
        // same name appears in the book twice and stays on the pitch, which is
        // the sort of detail that quietly destroys trust in the whole engine.
        const secondYellow = booked.has(offender.id)
        const straightRed = secondYellow || rng.chance(0.05)
        if (straightRed) {
          sentOff.add(offender.id)
          onPitch[isHome ? 'home' : 'away'].delete(offender.id)
          involvement[offender.id] = (involvement[offender.id] ?? 0) - 4
          if (detailed) {
            events.push(makeEvent(minute, 'redCard', club.id, offender.id, undefined,
              secondYellow
                ? `${offender.knownAs} picks up a second yellow and is off.`
                : `${offender.knownAs} is sent off.`))
          }
        } else {
          booked.add(offender.id)
          involvement[offender.id] = (involvement[offender.id] ?? 0) - 0.5
          if (detailed) {
            events.push(makeEvent(minute, 'yellowCard', club.id, offender.id, undefined,
              `${offender.knownAs} goes into the book.`))
          }
        }
      }
    }

    // Injuries. Weighted by injury proneness and by how tired the player is,
    // which is what connects squad depth and medical facilities to results.
    if (rng.chance(0.055)) {
      const isHome = rng.chance(0.5)
      const team = isHome ? home : away
      const club = isHome ? homeClub : awayClub
      const tables = isHome ? homeTables : awayTables
      const victim = pickWeighted(
        tables.players,
        tables.injuryWeights.map((w, i) => (sentOff.has(tables.players[i].id) ? 0 : w)),
        rng,
      )
      if (victim) {
        const minute = clamp(minuteBase + rng.int(1, 5), 1, 90)
        const side = isHome ? 'home' : 'away'
        onPitch[side].delete(victim.id)
        // Recorded whether or not the match is being narrated. Every other
        // event here is commentary, and dropping it for an AI match costs
        // nothing — but an injury is a lasting change to a squad, and the tick
        // applies those by replaying this list. Guarding it behind `detailed`
        // meant only the player's own club could be hurt in a match: measured
        // over forty weeks, the player carried exactly twice the injuries of
        // every AI club in the world, which is a handicap nobody chose.
        events.push(makeEvent(minute, 'injury', club.id, victim.id, undefined,
          `${victim.knownAs} goes down and cannot continue.`))
        // Forced substitution.
        const replacement = team.bench.find((id) => !onPitch[side].has(id))
        if (replacement && subsUsed[side] < 5) {
          subsUsed[side]++
          onPitch[side].add(replacement)
          const sub = state.players[replacement]
          if (detailed && sub) {
            events.push(makeEvent(minute, 'substitution', club.id, replacement, victim.id,
              `${sub.knownAs} replaces the injured ${victim.knownAs}.`))
          }
        }
      }
    }

    // Tactical substitutions in the second half.
    if (segment >= 11 && rng.chance(0.3)) {
      for (const side of ['home', 'away'] as const) {
        if (subsUsed[side] >= 3 || !rng.chance(0.5)) continue
        const team = side === 'home' ? home : away
        const club = side === 'home' ? homeClub : awayClub
        const replacement = team.bench.find((id) => !onPitch[side].has(id))
        const outgoing = Array.from(onPitch[side]).filter((id) => {
          const starter = team.starters.find((s) => s.playerId === id)
          return starter && starter.position !== 'GK'
        })
        if (!replacement || outgoing.length === 0) continue
        const off = rng.pick(outgoing)
        subsUsed[side]++
        onPitch[side].delete(off)
        onPitch[side].add(replacement)
        if (detailed) {
          const onPlayer = state.players[replacement]
          const offPlayer = state.players[off]
          if (onPlayer && offPlayer) {
            events.push(makeEvent(
              clamp(minuteBase + rng.int(1, 5), 1, 90),
              'substitution', club.id, replacement, off,
              `${onPlayer.knownAs} on for ${offPlayer.knownAs}.`,
            ))
          }
        }
      }
    }
  }

  // Extra time and penalties for knockout ties that must produce a winner.
  let penalties: { home: number; away: number } | undefined
  if (ctx.mustHaveWinner && homeGoals === awayGoals) {
    const extra = simulateExtraTime(home, away, rng)
    homeGoals += extra.home
    awayGoals += extra.away
    if (homeGoals === awayGoals) {
      penalties = simulateShootout(home, away, rng)
    }
  }

  computeRatings(state, home, away, homeGoals, awayGoals, involvement, ratings, sentOff, rng)

  const attendance = computeAttendance(homeClub, awayClub, rng, ctx.neutralVenue ?? false)

  events.sort((a, b) => a.minute - b.minute)

  return {
    homeGoals,
    awayGoals,
    penalties,
    events,
    ratings,
    homeLineup: home.starters.map((s) => s.playerId),
    awayLineup: away.starters.map((s) => s.playerId),
    possession,
    shots,
    shotsOnTarget,
    attendance,
    summary: buildSummary(homeClub, awayClub, homeGoals, awayGoals, penalties),
  }
}

// ---------------------------------------------------------------------------

function countSentOff(team: SelectedTeam, sentOff: Set<ID>): number {
  return team.starters.filter((s) => sentOff.has(s.playerId)).length
}

function makeEvent(
  minute: number,
  type: MatchEvent['type'],
  clubId: ID,
  playerId: ID,
  secondaryPlayerId: ID | undefined,
  text: string,
): MatchEvent {
  return { minute, type, clubId, playerId, secondaryPlayerId, text }
}

/** Goalscorer weighting: strikers score most, centre-backs score least. */
const SCORER_WEIGHT: Record<Position, number> = {
  ST: 40, AM: 18, ML: 10, MR: 10, MC: 9, DM: 3, DC: 4, DL: 2, DR: 2, GK: 0.05,
}

const ASSIST_WEIGHT: Record<Position, number> = {
  AM: 24, ML: 18, MR: 18, MC: 16, ST: 12, DL: 8, DR: 8, DM: 6, DC: 3, GK: 0.5,
}

interface PickTables {
  players: Player[]
  scorerWeights: number[]
  assistWeights: number[]
  disciplineWeights: number[]
  injuryWeights: number[]
  keeperId: ID | null
}

function buildPickTables(state: GameState, team: SelectedTeam): PickTables {
  const players: Player[] = []
  const slots: Position[] = []
  let keeperId: ID | null = null

  for (const { playerId, position } of team.starters) {
    const player = state.players[playerId]
    if (!player) continue
    players.push(player)
    slots.push(position)
    if (position === 'GK') keeperId = player.id
  }

  const scorerWeights: number[] = []
  const assistWeights: number[] = []
  const disciplineWeights: number[] = []
  const injuryWeights: number[] = []

  for (let i = 0; i < players.length; i++) {
    const player = players[i]
    const slot = slots[i]
    scorerWeights.push((SCORER_WEIGHT[slot] ?? 1) * (0.4 + player.attributes.shooting / 14))
    assistWeights.push(
      (ASSIST_WEIGHT[slot] ?? 1)
      * (0.4 + (player.attributes.passing + player.attributes.vision) / 26),
    )
    // Low temperament means more cards, and 'hothead' compounds it.
    disciplineWeights.push(
      (21 - player.attributes.temperament) * (player.traits.includes('hothead') ? 2.2 : 1),
    )
    injuryWeights.push(
      10 + player.injuryProneness * 0.8 + Math.max(0, 100 - player.fitness) * 0.5,
    )
  }

  return { players, scorerWeights, assistWeights, disciplineWeights, injuryWeights, keeperId }
}

function pickWeighted(players: Player[], weights: number[], rng: Rng): Player | null {
  if (players.length === 0) return null
  let total = 0
  for (const w of weights) total += w > 0 ? w : 0
  if (total <= 0) return players[rng.int(0, players.length - 1)]
  let roll = rng.next() * total
  for (let i = 0; i < players.length; i++) {
    roll -= weights[i] > 0 ? weights[i] : 0
    if (roll <= 0) return players[i]
  }
  return players[players.length - 1]
}

function pickWeightedExcluding(
  players: Player[],
  weights: number[],
  excludeId: ID,
  rng: Rng,
): Player | null {
  let total = 0
  for (let i = 0; i < players.length; i++) {
    if (players[i].id === excludeId) continue
    total += weights[i] > 0 ? weights[i] : 0
  }
  if (total <= 0) return null
  let roll = rng.next() * total
  for (let i = 0; i < players.length; i++) {
    if (players[i].id === excludeId) continue
    roll -= weights[i] > 0 ? weights[i] : 0
    if (roll <= 0) return players[i]
  }
  return null
}

function simulateExtraTime(
  home: SelectedTeam,
  away: SelectedTeam,
  rng: Rng,
): { home: number; away: number } {
  let h = 0
  let a = 0
  for (let i = 0; i < 6; i++) {
    if (!rng.chance(0.2)) continue
    const homeQuality = home.strength.attack - away.strength.defence
    const awayQuality = away.strength.attack - home.strength.defence
    if (rng.chance(clamp(0.5 + (homeQuality - awayQuality) / 300, 0.25, 0.75))) h++
    else a++
  }
  return { home: h, away: a }
}

function simulateShootout(
  home: SelectedTeam,
  away: SelectedTeam,
  rng: Rng,
): { home: number; away: number } {
  // Sudden death after five each, with conversion nudged by the difference
  // between the takers' composure and the opposing keeper.
  const homeRate = clamp(0.74 + (home.strength.attack - away.strength.goalkeeper) / 900, 0.6, 0.88)
  const awayRate = clamp(0.74 + (away.strength.attack - home.strength.goalkeeper) / 900, 0.6, 0.88)

  let h = 0
  let a = 0
  for (let i = 0; i < 5; i++) {
    if (rng.chance(homeRate)) h++
    if (rng.chance(awayRate)) a++
  }
  while (h === a) {
    const homeScored = rng.chance(homeRate)
    const awayScored = rng.chance(awayRate)
    if (homeScored) h++
    if (awayScored) a++
    if (homeScored !== awayScored) break
  }
  return { home: h, away: a }
}

/**
 * Player ratings, 0-10.
 *
 * Built from a 6.5 baseline, moved by the team's result, the player's own
 * involvement in the events, and a small amount of noise. These ratings feed
 * form, morale, media narratives and — critically — scout reports on your own
 * players, so they need to be defensible rather than random.
 */
function computeRatings(
  state: GameState,
  home: SelectedTeam,
  away: SelectedTeam,
  homeGoals: number,
  awayGoals: number,
  involvement: Record<ID, number>,
  ratings: Record<ID, number>,
  sentOff: Set<ID>,
  rng: Rng,
): void {
  const rate = (team: SelectedTeam, goalsFor: number, goalsAgainst: number) => {
    const margin = goalsFor - goalsAgainst
    const teamBonus = clamp(margin * 0.22, -0.9, 0.9)

    for (const { playerId, position } of team.starters) {
      const player = state.players[playerId]
      if (!player) continue

      let rating = 6.5 + teamBonus
      rating += (involvement[playerId] ?? 0) * 0.28

      // Defenders and keepers are rated on what they conceded; attackers on
      // what they produced. A clean sheet is worth as much to a centre-back as
      // a goal is to a striker, and the ratings should say so.
      if (position === 'GK' || position === 'DC' || position === 'DL' || position === 'DR') {
        if (goalsAgainst === 0) rating += 0.7
        else rating -= goalsAgainst * 0.22
      }

      // Quality shows through over time even in a bad result.
      rating += (player.currentAbility - 100) / 260
      rating += rng.normal(0, 0.42)

      if (sentOff.has(playerId)) rating -= 2

      ratings[playerId] = clamp(Math.round(rating * 10) / 10, 2, 10)
    }
  }

  rate(home, homeGoals, awayGoals)
  rate(away, awayGoals, homeGoals)
}

function computeAttendance(
  homeClub: Club,
  awayClub: Club,
  rng: Rng,
  neutral: boolean,
): number {
  const capacity = homeClub.facilities.stadium.capacity
  // Base turnout from the fanbase, lifted by good form and by the visitors
  // being worth watching.
  const base = 0.42 + (homeClub.fanbase / 100) * 0.4 + (homeClub.fanMood / 100) * 0.16
  const opponentDraw = clamp((awayClub.reputation - 40) / 260, -0.04, 0.12)
  const fill = clamp(base + opponentDraw + rng.normal(0, 0.05), 0.18, 1)
  return Math.round(capacity * fill * (neutral ? 0.85 : 1))
}

function buildSummary(
  homeClub: Club,
  awayClub: Club,
  homeGoals: number,
  awayGoals: number,
  penalties?: { home: number; away: number },
): string {
  const score = `${homeGoals}-${awayGoals}`
  const shootout = penalties ? ` (${penalties.home}-${penalties.away} on pens)` : ''
  if (homeGoals === awayGoals && !penalties) {
    return `${homeClub.shortName} ${score} ${awayClub.shortName} — honours even.`
  }
  const homeWon = penalties ? penalties.home > penalties.away : homeGoals > awayGoals
  const winner = homeWon ? homeClub.shortName : awayClub.shortName
  const margin = Math.abs(homeGoals - awayGoals)
  const verb = margin >= 3 ? 'thrash' : margin === 2 ? 'see off' : 'edge past'
  const loser = homeWon ? awayClub.shortName : homeClub.shortName
  return `${winner} ${verb} ${loser}, ${score}${shootout}.`
}

/**
 * Cheap result for matches nobody will look at. Skips selection detail, event
 * generation and per-player ratings beyond a rough figure, but uses the same
 * strength model so league tables across the world stay coherent with the
 * matches the player actually watches.
 */
export function quickSimulate(
  state: GameState,
  homeClub: Club,
  awayClub: Club,
  rng: Rng,
  ctx: MatchContext,
): MatchResult {
  const availability: AvailabilityContext = { suspendedIds: ctx.suspendedIds }
  const home = selectTeam(state, homeClub, rng, availability)
  const away = selectTeam(state, awayClub, rng, availability)
  return runMatch(state, homeClub, awayClub, home, away, rng, ctx, false)
}
