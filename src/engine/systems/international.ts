import { clamp, Rng } from '../rng'
import type { Club, GameState, ID, Injury, Player } from '../types'

/**
 * International football.
 *
 * **Consequences, not management.** You do not pick a national side and you
 * never will — this is a game about running a club, and a director of football
 * has exactly as much say over an international call-up as he has over the
 * weather. What he has is the fallout, and the fallout is real: his players
 * disappear for a week, some of them come back hurt, and the good ones come
 * back more expensive to keep and worth more to sell.
 *
 * **The league does not pause, and that is not a simplification.** A twenty-
 * four club division is forty-six rounds inside a thirty-nine week window, so
 * the calendar has no room to stop even if it wanted to. It is also the truer
 * version: South American qualifiers have clashed with European club football
 * for decades and the resulting argument — my player, your fixture, his flight
 * — is the oldest complaint in the job. Your Brazilian is away on Saturday and
 * you play anyway.
 *
 * **Who leaves is a consequence of how you recruited.** Every country picks
 * its best twenty-three, so the question is not whether a player is good
 * enough for international football in the abstract but whether he is in the
 * twenty-three his country has. A squad built on Northern Irishmen empties
 * every break; one built on better Brazilians who will never be picked does
 * not. Nothing here enforces that — it falls out of the nationalities you
 * signed, which is the only way a consequence is worth having.
 */

/**
 * Weeks the international calendar takes players away.
 *
 * Spread through the season the way real windows are, and deliberately not
 * near the season's end — a run-in disrupted by call-ups would be a cruelty
 * with no decision attached to it.
 */
export const INTERNATIONAL_WEEKS = [9, 16, 24, 33, 38]

/** Weeks a called-up player is away from his club. */
export const CALL_UP_WEEKS = 1

/**
 * Tournament summers, every other year.
 *
 * A tournament is where a squad player becomes a target: he plays six games in
 * front of everybody instead of thirty in front of nobody, and the market
 * reprices him on the strength of it.
 */
export function isTournamentSeason(season: number): boolean {
  return season % 2 === 0
}

/** The week a tournament resolves, deep in the summer window. */
export const TOURNAMENT_WEEK = 50

/**
 * How many players a country takes.
 *
 * A national squad is a squad: a fixed number of names, whatever the country.
 * This is the correction that turned the system honest — the first version set
 * an ability bar scaled to the nation's league standing, which produced the
 * absurdity of one per cent of the Scottish top flight being of international
 * standard against thirty-five per cent of Spain's. It had the relationship
 * backwards. A weak nation does not stop picking a side; it picks the best it
 * has, and the best it has is worse. So the real question for a director is
 * not "is he good enough for a country" but "is he in the twenty-three his
 * country has" — which is why signing a Northern Irish squad player costs you
 * more Saturdays than signing a better Brazilian who will never be picked.
 */
export const NATIONAL_SQUAD = 23

/** Whether a player can be picked at all this week. */
function eligible(player: Player): boolean {
  if (player.isAcademy || player.age < 17) return false
  if (!player.clubId) return false
  if (player.injury && player.injury.weeksRemaining > 0) return false
  if (player.suspendedWeeks > 0) return false
  return true
}

/**
 * Every nation's current squad, by nationality.
 *
 * Built in one pass over the world rather than per nation, because the world
 * is up to twenty thousand players and this runs five times a season. A player
 * who is hurt or suspended is simply not in it and the man behind him is,
 * which is how a call-up is really earned: somebody else's injury is a
 * player's way into his national side.
 */
export function nationalSquads(state: GameState): Map<ID, Player[]> {
  const byNation = new Map<ID, Player[]>()
  for (const player of Object.values(state.players)) {
    if (!eligible(player)) continue
    const list = byNation.get(player.nationalityId)
    if (list) list.push(player)
    else byNation.set(player.nationalityId, [player])
  }
  for (const [nationId, list] of byNation) {
    list.sort((a, b) => b.currentAbility - a.currentAbility)
    byNation.set(nationId, list.slice(0, NATIONAL_SQUAD))
  }
  return byNation
}

/**
 * Whether this player is in his country's squad as things stand.
 *
 * A one-off question — a profile screen, a scout note — and it rebuilds every
 * squad in the world to answer it. Anything asking it of many players at once
 * should call `nationalSquads` itself and read the answer off the map, or it
 * is doing that work once per player.
 */
export function isInternational(state: GameState, player: Player): boolean {
  if (!eligible(player)) return false
  const squad = nationalSquads(state).get(player.nationalityId)
  return Boolean(squad?.some((p) => p.id === player.id))
}

export interface CallUp {
  player: Player
  /** True while a tournament is on, when squads are larger and longer. */
  tournament: boolean
}

/**
 * Who goes away this week.
 *
 * The first eleven of a national side go every time; the rest of the squad is
 * in and out, which is what makes a fringe international a different kind of
 * asset from a certain one — some weeks you get him back.
 *
 * A loanee is called up like anybody else, and it is the club he is playing
 * for that loses him. That is both the real rule and the more interesting one:
 * a young international on loan is precisely the player who disappears every
 * break, and the club borrowing him is the club that has to plan around it
 * without ever having chosen him.
 */
export function callUpsFor(state: GameState, rng: Rng, tournament = false): CallUp[] {
  const out: CallUp[] = []
  for (const squad of nationalSquads(state).values()) {
    squad.forEach((player, rank) => {
      // A tournament squad travels together; a qualifier squad is whoever is
      // fit and whoever the manager fancies that fortnight.
      const chance = tournament
        ? 0.98
        : rank < 11 ? 0.94 : clamp(0.85 - (rank - 11) * 0.045, 0.4, 0.85)
      if (!rng.chance(chance)) return
      out.push({ player, tournament })
    })
  }
  return out
}

/** Send a player away, and give him the cap for it. */
export function sendOnDuty(player: Player, week: number, tournament: boolean): void {
  player.internationalUntilWeek = week + (tournament ? 3 : CALL_UP_WEEKS)
  player.caps = (player.caps ?? 0) + (tournament ? 4 : 1)
}

/** Whether he is away right now. */
export function isAwayOnDuty(player: Player, week: number): boolean {
  return player.internationalUntilWeek !== null
    && player.internationalUntilWeek !== undefined
    && week < player.internationalUntilWeek
}

/**
 * What a cap is worth on the price and on the wage.
 *
 * The single most reliably real thing about the transfer market: a player who
 * has a good summer costs more to keep and is worth more to sell, and neither
 * number ever comes back down. Deliberately a curve that flattens — the
 * difference between uncapped and ten caps is enormous, between eighty and
 * ninety is nothing, because by then he is priced on being an international
 * rather than on the count.
 */
export function capsPremium(caps: number): number {
  if (!caps) return 1
  return 1 + Math.min(0.45, Math.log10(1 + caps) * 0.22)
}

/**
 * Injury on international duty.
 *
 * The oldest grievance in the job: somebody else's doctor, somebody else's
 * pitch, somebody else's meaningless friendly, and your player is out until
 * March. Rarer per trip than a match injury because a trip is fewer minutes,
 * but it lands with far more force because you had no say in it at all.
 */
export const DUTY_INJURY_CHANCE = 0.035

/**
 * How far he had to go to play.
 *
 * The complaint is never really about the football; it is about the flight.
 * A player called up by the country he already plays in trains at a ground an
 * hour away and is back on Thursday. One who crosses a confederation loses two
 * days to aeroplanes at each end, plays at altitude or in heat his season has
 * not prepared him for, and arrives back on the Friday of a Saturday game.
 * Both the risk and the grievance scale with it, and the data to say which is
 * which is already on the nations — this is what the confederations are for.
 */
export type DutyTravel = 'home' | 'continental' | 'intercontinental'

export function dutyTravel(state: GameState, player: Player): DutyTravel {
  const club = player.loanClubId ?? player.clubId
  const clubNation = club ? state.nations[state.clubs[club]?.nationId] : null
  const own = state.nations[player.nationalityId]
  if (!clubNation || !own) return 'continental'
  if (clubNation.id === own.id) return 'home'
  return clubNation.confederation === own.confederation ? 'continental' : 'intercontinental'
}

/** What the trip does to the odds of him coming back hurt. */
export function dutyInjuryChance(state: GameState, player: Player): number {
  const travel = dutyTravel(state, player)
  const factor = travel === 'home' ? 0.85 : travel === 'continental' ? 1 : 1.5
  return DUTY_INJURY_CHANCE * factor
}

export function dutyInjuryWeeks(rng: Rng, tournament: boolean): number {
  return tournament ? rng.int(3, 14) : rng.int(2, 9)
}

/**
 * The injury itself.
 *
 * Built here rather than drawn from the club injury table because none of the
 * mitigations apply: your medical department did not treat him, your physio
 * did not see him for a fortnight, and the severity follows the weeks he is
 * out rather than the other way round — which is all a club ever learns about
 * an injury it did not witness.
 */
export function dutyInjury(rng: Rng, tournament: boolean): Injury {
  const weeks = dutyInjuryWeeks(rng, tournament)
  const severity: Injury['severity'] = weeks <= 2 ? 'knock'
    : weeks <= 4 ? 'minor'
      : weeks <= 12 ? 'moderate'
        : 'serious'
  return {
    type: 'Injured on international duty',
    weeksRemaining: weeks,
    severity,
    lingeringEffect: severity === 'serious' && rng.chance(0.18) ? rng.float(0.01, 0.05) : 0,
  }
}

/**
 * What a good tournament does to a player's standing.
 *
 * Not everybody who goes has one. The ones who do come back with the market
 * looking at them differently, which is what turns a squad player into
 * somebody else's target — and it is the moment a selling club either cashes
 * in or finds out what it costs to say no.
 */
export function tournamentBoost(rng: Rng, player: Player): number {
  const showing = rng.float(0, 1)
  // Better players are likelier to have the tournament that gets noticed, but
  // the whole appeal of a summer is that somebody nobody expected does.
  //
  // The bar was 0.82 against a bias reaching 0.35, which repriced more than
  // half of everybody who went — a tournament that promotes the majority of
  // its participants is not a tournament, it is an inflation. Around one in
  // five is the honest figure: most players come back from a summer exactly
  // as valuable as they left.
  const bias = clamp((player.currentAbility - 110) / 220, -0.1, 0.2)
  return showing + bias > 0.9 ? rng.float(0.06, 0.2) : 0
}

export interface TournamentResult {
  player: Player
  /** The fraction added to his price by the summer. */
  boost: number
}

/**
 * Run a tournament summer.
 *
 * Held in the summer window, when nothing else is happening, so it does not
 * cost anybody a league fixture — the one part of the international calendar
 * that really does get its own space in the year. What comes out of it is a
 * list of players other clubs now want, which is the only form in which a
 * director of football experiences a tournament at all: as a phone that starts
 * ringing about somebody he was not planning to sell.
 */
export function runTournament(state: GameState, rng: Rng): TournamentResult[] {
  const results: TournamentResult[] = []
  for (const { player, tournament } of callUpsFor(state, rng, true)) {
    sendOnDuty(player, TOURNAMENT_WEEK, tournament)
    const boost = tournamentBoost(rng, player)
    if (boost <= 0) continue
    player.tournamentStock = (player.tournamentStock ?? 0) + boost
    results.push({ player, boost })
  }
  return results
}

/**
 * How fast the summer wears off.
 *
 * A year, roughly, and never quite all of it: some of what a good tournament
 * buys a player is permanent, because people saw it. Applied once a season
 * rather than weekly because it is a fact about the market's memory, not a
 * weekly process, and because the alternative is a decay term running over
 * every player in the world every week for a number most of them hold at zero.
 */
export const TOURNAMENT_STOCK_DECAY = 0.55

/**
 * Clubs whose players are away, for the week's report.
 *
 * Keyed by the club that has to pick a side without him, which for a loanee is
 * the club borrowing him rather than the one that owns him.
 */
export function clubsAffected(callUps: CallUp[]): Map<string, Player[]> {
  const byClub = new Map<string, Player[]>()
  for (const { player } of callUps) {
    const clubId = player.loanClubId ?? player.clubId
    if (!clubId) continue
    const list = byClub.get(clubId) ?? []
    list.push(player)
    byClub.set(clubId, list)
  }
  return byClub
}

/**
 * How many of this club's players are away — the number a director feels.
 *
 * Counts the players it could otherwise pick: its own squad minus the ones it
 * has loaned out, plus the ones it has borrowed. A player loaned elsewhere is
 * not a loss to the club that owns him, because he was never available to it.
 */
export function awayCount(state: GameState, club: Club, week: number): number {
  const ids = [...club.squad.filter((id) => !state.players[id]?.loanClubId), ...club.loanedIn]
  return ids
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && isAwayOnDuty(p, week)).length
}
