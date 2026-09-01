import { clamp, Rng } from '../rng'
import { IdFactory, ID_PREFIX } from '../ids'
import { addInboxItem, addNews } from './inbox'
import { abilityCeilingFor } from '../world/playerGen'
import type { Club, GameState, MediaStory, Player } from '../types'

/**
 * The one that got away.
 *
 * The sharpest verdict there is on an academy, and the only one that arrives
 * four years late from somebody else's ground. A boy is released at eighteen
 * by a director who had a hundred of them to look at and eleven places to
 * give; four summers later he is the best player on the pitch and everybody
 * in the ground knows where he came from.
 *
 * **It is meant to sting, and the sting is the point.** The academy director
 * is otherwise a number that nudges intake quality — a hire with no moment
 * where being wrong costs you anything you can feel. This is that moment. The
 * press run it, the fans do not forget it, and if he scores against you the
 * board will find a way to bring it up.
 *
 * Nothing here is a decision the player gets to make. It is a consequence of
 * one he made years ago, arriving when he can do nothing about it, which is
 * exactly the shape of the real thing.
 */

/**
 * Has he become somebody?
 *
 * Judged against the club that let him go rather than against football in
 * general: a boy released by a non-league side who now plays in the second
 * tier is a bigger indictment of that club than a Premier League release who
 * ended up merely good. The bar is the ceiling of what the old club could
 * ever have signed — clear it and he is a player they could not have bought,
 * which means letting him go for nothing was the whole mistake.
 */
export function hasBecomeSomebody(state: GameState, player: Player): boolean {
  const release = player.academyRelease
  if (!release) return false
  if (player.gotAwayReported) return false
  if (!player.clubId) return false
  const old = state.clubs[release.clubId]
  if (!old) return false
  // Give it time. A boy is not the one that got away six months later; he is
  // one when he has made a career somewhere.
  if (state.date.season - release.season < 2) return false
  return player.currentAbility >= abilityCeilingFor(old.reputation)
}

/** How badly it lands, 0-1, from how far past them he has gone. */
export function stingOf(state: GameState, player: Player): number {
  const release = player.academyRelease
  const old = release ? state.clubs[release.clubId] : null
  if (!old) return 0
  const ceiling = abilityCeilingFor(old.reputation)
  const now = state.clubs[player.clubId ?? '']
  // Two things make it worse: how much better he is than anything they could
  // sign, and how much bigger the club he is at.
  const abilityGap = clamp((player.currentAbility - ceiling) / 60, 0, 1)
  const clubGap = now ? clamp((now.reputation - old.reputation) / 50, 0, 1) : 0
  return clamp(0.35 + abilityGap * 0.4 + clubGap * 0.25, 0, 1)
}

export interface GotAwayDeps {
  ids: IdFactory
  rng: Rng
}

/**
 * Find the ones who have made it, and make the world notice.
 *
 * Runs on a cadence rather than weekly: this is a story the press finds when
 * he does something, not a database the club audits every Monday.
 */
export function reportOnesThatGotAway(
  state: GameState,
  club: Club,
  deps: GotAwayDeps,
): { player: Player; sting: number }[] {
  const found: { player: Player; sting: number }[] = []

  for (const player of Object.values(state.players)) {
    if (player.academyRelease?.clubId !== club.id) continue
    if (!hasBecomeSomebody(state, player)) continue

    player.gotAwayReported = true
    const sting = stingOf(state, player)
    found.push({ player, sting })

    const now = state.clubs[player.clubId ?? '']
    const years = state.date.season - player.academyRelease.season

    // The fans remember. This is the only part with a lasting number on it,
    // because a grievance is exactly the kind of thing a support carries.
    club.fanMood = clamp(club.fanMood - sting * 8, 1, 100)

    if (club.id === state.playerClubId) {
      addInboxItem(state, deps.ids, {
        category: 'academy',
        subject: `${player.knownAs} — we let him go`,
        from: 'Academy Director',
        body: `${player.knownAs} is at ${now?.name ?? 'another club'} now, and he is playing very `
          + `well. We released him ${years} year${years === 1 ? '' : 's'} ago. I signed that off, `
          + 'and I will not pretend it looks like anything other than what it is. You will hear '
          + 'about it before the week is out.',
        urgent: false,
        link: { view: 'player', id: player.id },
      })
    }

    addNews(state, deps.ids, 'academy',
      `${player.knownAs}, released by ${club.name} as a teenager, is now at ${now?.name ?? 'another club'}.`,
      { view: 'player', id: player.id }, club.id)
  }

  return found
}

/**
 * The press version, which is unkinder than the inbox one.
 *
 * Written as a story rather than a news line because this is the sort of thing
 * a paper enjoys: it costs them nothing, it is entirely true, and there is a
 * photograph of him in your shirt aged sixteen.
 */
export function gotAwayStory(
  state: GameState,
  club: Club,
  player: Player,
  sting: number,
  ids: IdFactory,
  rng: Rng,
): MediaStory | null {
  const outlets = Object.values(state.outlets).filter((o) => o.nationId === club.nationId)
  if (outlets.length === 0) return null
  const outlet = rng.weighted(outlets, outlets.map((o) => o.sensationalism + 20))
  const now = state.clubs[player.clubId ?? '']
  const years = state.date.season - (player.academyRelease?.season ?? state.date.season)

  return {
    id: ids.next(ID_PREFIX.story),
    kind: 'oneThatGotAway',
    season: state.date.season,
    week: state.date.week,
    headline: `THE ONE ${club.name.toUpperCase()} LET GO`,
    body: `${player.knownAs} was released by ${club.name} ${years} year`
      + `${years === 1 ? '' : 's'} ago. He is at ${now?.name ?? 'another club'} now and he is `
      + 'better than anything they have. Somebody at that club looked at him and decided he was '
      + 'not going to make it.',
    outletId: outlet.id,
    truth: 'true',
    subjectPlayerIds: [player.id],
    subjectClubIds: [club.id],
    plantedBy: null,
    effects: [],
    response: null,
    prominence: Math.round(40 + sting * 50),
  }
}

/**
 * He scored against them.
 *
 * The worst version of it, and the one the board mentions. Nothing else in
 * this file needs a match to happen; this does, because the whole reason it
 * hurts is that everybody watched it.
 */
export function scoredAgainstUs(
  state: GameState,
  club: Club,
  scorerId: string,
): Player | null {
  const player = state.players[scorerId]
  if (!player) return null
  if (player.academyRelease?.clubId !== club.id) return null
  return player
}

/** What the board says about it, which is never nothing. */
export function boardRemark(player: Player, state: GameState): string {
  const years = state.date.season - (player.academyRelease?.season ?? state.date.season)
  return `${player.knownAs} scored against us. We had him for years and let him go `
    + `${years === 1 ? 'a year' : `${years} years`} ago. I am not going to make a speech about `
    + 'it, but I would like to know it is not going to keep happening.'
}
