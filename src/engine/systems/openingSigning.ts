/**
 * The signing the board made before you arrived, and the coach did not want.
 *
 * The game is one sentence — you buy players you cannot fully see, for a
 * coach you do not control — and its defining beat is the second half of it:
 * your signing, on the bench. Everything that produces that beat already
 * exists. The selector ranks players by what the coach values, the snub
 * system makes a man mind being left out, and the home screen counts how many
 * of your signings he picked. What did not exist was any guarantee a new
 * director would see it. A fresh career could go ten weeks with the coach
 * starting everyone, and a reviewer said so: the moment the game is about
 * is not guaranteed in the first hours.
 *
 * So every new career opens with it staged. Before you took the job, the
 * board agreed a deal for a player who is good on paper and wrong for this
 * coach, chosen by the same selection score the coach uses on a Saturday so
 * that what is staged and what happens agree. He counts as yours, because a
 * signing made in the season you arrive is yours by the rule `yourSignings`
 * already applies. The chairman tells you about the deal, the coach tells you
 * what he thinks of it, and the first team sheet proves him right.
 *
 * Nothing is forced after that. There is no scripted benching: if the coach
 * changes his mind, or his first choice gets injured, the signing plays, and
 * that is the game working too. The staging only chooses who arrives.
 */

import { Rng } from '../rng'
import type { IdFactory } from '../ids'
import { FORMATION_SHAPES, selectTeam } from '../sim/selection'
import { ratingForPositionCached } from '../world/attributes'
import { addInboxItem } from './inbox'
import { SQUAD_LIMIT } from './registration'
import { executeTransfer } from './transfers'
import { computeAskingPrice, computeWageDemand, formatMoney } from './valuation'
import { coachRegister, contact, pickBy, withArticle } from './voice'
import { positionWord } from './scoutVoice'
import type { Club, GameState, Player, Position, Staff } from '../types'

/** Share of the transfer budget the board will have spent before you arrived. */
const MAX_BUDGET_SHARE = 0.5

/**
 * How many players to weigh up. Most are rejected after the third sheet that
 * picks them, so a wide net is cheap; a narrow one, cut by ability, kept only
 * the players good enough to walk into the side and staged nothing.
 */
const SHORTLIST = 500

/**
 * How many team sheets to draw for each candidate. The coach has a weekly
 * whim, so one sheet proves little.
 */
const SHEETS = 24

/**
 * Most sheets a candidate may appear on and still be staged. Zero sounds
 * right and is not: the whim is wide enough that only players too weak for
 * anyone to mind about are never picked, and "the coach left out a player
 * nobody rated" is not the story. One in twelve keeps the signing a real
 * footballer while leaving him out of the first three matches most of the
 * time — scripts/openingcheck.ts measures how often.
 */
const MAX_STARTS = 2

export interface OpeningSigning {
  player: Player
  /** The player the coach prefers in the signing's position. */
  preferred: Player | null
  fee: number
}

interface Assessment {
  player: Player
  preferred: Player | null
  /** Better on paper than the man the coach prefers. */
  betterOnPaper: boolean
  /** How many sheets counted him as unluckily left out, which is what makes him mind. */
  claims: number
  /** How many sheets he started. Fewer is safer. */
  started: number
  fee: number
}

/**
 * Who the board would have bought: good on paper, wrong for this coach.
 *
 * Each candidate is put into the squad for a moment, the way he will be once
 * he arrives, and the real selector picks from it two dozen times. An earlier
 * version ranked him within his best position by the selection score and
 * trusted that; the greedy selector then found him a place in another slot he
 * could cover, and he started in half the careers meant to show him benched.
 * Asking the selector itself is the only check that agrees with Saturday.
 *
 * Returns null when the club cannot stage the beat — no coach, no room on the
 * squad list, or nobody who fits — and then a career simply starts without
 * it. A career is not worth breaking for a set piece.
 */
export function chooseOpeningSigning(state: GameState, club: Club): Assessment | null {
  const coachStaff: Staff | null = club.headCoachId ? state.staff[club.headCoachId] ?? null : null
  const coach = coachStaff?.coachProfile ?? null
  if (!coach) return null
  if (club.registeredIds.length >= SQUAD_LIMIT) return null

  const budget = Math.max(0, club.finances.transferBudget) * MAX_BUDGET_SHARE

  // Look among players at the level of the current eleven. Anyone much
  // better walks into the side, which is not the story; anyone much worse
  // is not a signing anybody would mind being left out.
  const sheet = selectTeam(state, club, new Rng(`${state.seed}:opening:xi`))
  const xi = sheet.starters
    .map((s) => state.players[s.playerId]?.currentAbility ?? 0)
    .filter((ca) => ca > 0)
  if (xi.length < 11) return null
  const floor = Math.min(...xi)
  const ceiling = Math.max(...xi) + 4

  const shortlist = Object.values(state.players)
    .filter((p) =>
      p.clubId !== club.id
      && !p.loanClubId
      && !p.isAcademy
      && p.age >= 21 && p.age <= 30
      && !p.injury
      && p.currentAbility >= floor && p.currentAbility <= ceiling
      && p.nationalityId === club.nationId
      && (p.clubId === null || (state.clubs[p.clubId]?.nationId === club.nationId
        && state.clubs[p.clubId]!.reputation <= club.reputation + 12)))
    // Priced before the cut, not after: the best players at this level are
    // also the dearest, and a shortlist of the top hundred by ability was a
    // shortlist of nobody the club could afford.
    .map((p) => {
      const seller = p.clubId ? state.clubs[p.clubId] ?? null : null
      return { p, fee: seller ? computeAskingPrice(state, p, seller, club) : 0 }
    })
    .filter(({ fee }) => fee <= budget)
    .sort((a, b) => b.p.currentAbility - a.p.currentAbility || a.p.id.localeCompare(b.p.id))
    .slice(0, SHORTLIST)

  const assessed: Assessment[] = []
  for (const { p: candidate, fee } of shortlist) {
    const trial = trialSheets(state, club, candidate)
    if (trial.started > MAX_STARTS) continue

    const slot = trial.slotFor
    const preferred = slot ? trial.holder : null
    const paper = (p: Player) => ratingForPositionCached(p.attributes, slot ?? p.position)
    assessed.push({
      player: candidate,
      preferred,
      betterOnPaper: preferred ? paper(candidate) >= paper(preferred) : false,
      claims: trial.claims,
      started: trial.started,
      fee,
    })
  }
  if (assessed.length === 0) return null

  // The sharpest version of the beat first: a player who is better on paper
  // than the man the coach prefers, and good enough that being left out
  // stings. Then any player good enough to mind. Then anyone at all.
  //
  // Outfield before goalkeepers. A second keeper on the bench is the one
  // position where being left out says nothing about the coach — there is
  // only one shirt — and the first measurement staged a keeper in six
  // careers of fifteen.
  const rank = (a: Assessment) => (a.betterOnPaper ? 2 : 0) + (a.claims >= SHEETS / 2 ? 1 : 0)
  const keeper = (a: Assessment) => (a.player.position === 'GK' ? 1 : 0)
  assessed.sort((a, b) =>
    keeper(a) - keeper(b) || rank(b) - rank(a) || a.started - b.started || b.player.currentAbility - a.player.currentAbility || a.player.id.localeCompare(b.player.id))
  return assessed[0]
}

/**
 * Put a candidate in the squad as he will arrive — registered, happy to be
 * here, and given the starring status a board that just bought him would
 * give him — draw the coach's team sheets, and put everything back.
 */
function trialSheets(state: GameState, club: Club, candidate: Player): {
  started: number
  claims: number
  slotFor: Position | null
  holder: Player | null
} {
  const saved = {
    clubId: candidate.clubId,
    squadStatus: candidate.squadStatus,
    morale: candidate.morale,
    squad: club.squad,
    registeredIds: club.registeredIds,
  }
  candidate.clubId = club.id
  candidate.squadStatus = 'star'
  candidate.morale = Math.min(100, candidate.morale + 12)
  club.squad = [...club.squad, candidate.id]
  club.registeredIds = [...club.registeredIds, candidate.id]

  let started = 0
  let claims = 0
  let slotFor: Position | null = null
  let holder: Player | null = null
  try {
    for (let i = 0; i < SHEETS; i++) {
      const sheet = selectTeam(state, club, new Rng(`${state.seed}:opening:${candidate.id}:${i}`))
      if (sheet.starters.some((s) => s.playerId === candidate.id)) started++
      if (sheet.unluckyOmissions.includes(candidate.id)) claims++
      if (i === 0) {
        // The man in his own position, which is who the coach will name.
        const own = sheet.starters.find((s) => s.position === candidate.position)
          ?? sheet.starters.find((s) => state.players[s.playerId]?.position === candidate.position)
        slotFor = own?.position ?? null
        holder = own ? state.players[own.playerId] ?? null : null
      }
      if (started > MAX_STARTS) break
    }
  } finally {
    candidate.clubId = saved.clubId
    candidate.squadStatus = saved.squadStatus
    candidate.morale = saved.morale
    club.squad = saved.squad
    club.registeredIds = saved.registeredIds
  }
  return { started, claims, slotFor, holder }
}

/**
 * Make the deal, and have the chairman and the coach tell you about it.
 *
 * Called once, at the start of a new career, after the club is set up and
 * before the opening letters are written.
 */
export function stageOpeningSigning(state: GameState, ids: IdFactory, club: Club): OpeningSigning | null {
  const choice = chooseOpeningSigning(state, club)
  if (!choice) return null

  const { player, fee, preferred } = choice
  const seller = player.clubId ? state.clubs[player.clubId] ?? null : null
  const league = state.leagues[club.leagueId]
  const nation = state.nations[club.nationId]
  const wage = Math.round(computeWageDemand(player, league ?? null, nation ?? null))
  const fromName = seller?.name ?? null

  executeTransfer(state, { rng: new Rng(`${state.seed}:opening`), ids }, {
    player,
    buyer: club,
    seller,
    fee,
    kind: seller ? 'permanent' : 'free',
    contract: {
      wage,
      expiresSeason: state.date.season + 3,
      signingBonus: 0,
      releaseClause: null,
      appearanceFee: 0,
      goalBonus: 0,
      loyaltyBonus: 0,
      inNegotiation: false,
      weeksSinceRenewalRequest: 0,
    },
    agentFee: 0,
    sellOnPercentage: 0,
    wageContribution: 0,
    loanUntilSeason: null,
  })
  // He was sold the move as a starter. That is what makes the bench hurt, and
  // what makes him say so.
  player.desiredStatus = 'firstTeam'

  const pos = positionWord(player.position)
  const paid = fromName
    ? (fee > 0 ? `We paid ${fromName} ${formatMoney(fee)}.` : `${fromName} let him go for next to nothing.`)
    : 'He came on a free.'
  addInboxItem(state, ids, {
    category: 'transfer',
    subject: `${player.knownAs} has signed`,
    from: 'Chairman',
    body: `Before you arrived, the board agreed a deal for ${player.knownAs}, `
      + `${withArticle(`${player.age}-year-old`)} ${pos}${fromName ? ` from ${fromName}` : ''}. ${paid} `
      + `He has been told he is coming here to play, and I would like that to be true.`
      + `\n\nHe is yours now. I thought you should hear it from me.`,
    link: { view: 'player', id: player.id },
  })

  const coachStaff = club.headCoachId ? state.staff[club.headCoachId] : null
  const coach = coachStaff?.coachProfile
  if (coachStaff && coach) {
    const register = coachRegister(coachStaff.attributes?.mediaHandling ?? 50, coach.dofRelationship ?? 50)
    const key = `opening:${club.id}:${player.id}`
    const name = player.knownAs
    // Either there is no place for him in the way this coach plays, or there
    // is and somebody the coach trusts is in it. Both are true reasons, and
    // the first is the one a director can do nothing about but sell.
    const noShirt = !FORMATION_SHAPES[coach.formation].includes(player.position)
    const them = preferred?.knownAs ?? null
    const body = noShirt || !them
      ? pickBy(key, register, {
        warm: [
          `I hear we have signed ${name}. Nice lad, I am sure. But I play ${coach.formation}, and there is no ${pos} in it. I will not change the side for one player.`,
          `${name} — I will be straight with you, because I would rather you heard it now. We do not play with ${withArticle(pos)}. I am not sure where he fits.`,
        ],
        brisk: [
          `${name}. We play ${coach.formation}. There is no ${pos} in a ${coach.formation}. You can see the problem.`,
          `Not one I asked for. I do not use ${withArticle(pos)}, and I am not starting now.`,
        ],
        terse: [
          `${name}. We play ${coach.formation}. Work it out.`,
          `There is no ${pos} in my side.`,
        ],
        pointed: [
          `Nobody asked me about ${name}. If they had, I would have told them I do not play with ${withArticle(pos)}. I am telling you instead.`,
          `Somebody upstairs has bought ${withArticle(pos)} for a ${coach.formation} team. I will leave you to explain that to him.`,
        ],
      })
      : pickBy(key, register, {
        warm: [
          `I hear we have signed ${name}. He is a decent player, and I will give him every chance. But I will be honest with you: I have ${them}, and I trust him.`,
          `${name} will get a fair look. But ${them} has done nothing wrong, and I do not drop players for doing nothing wrong.`,
        ],
        brisk: [
          `${name}. Not a player I asked for. I have ${them} and I rate him. We will see how he trains.`,
          `He can fight ${them} for the shirt. ${them} has it now.`,
        ],
        terse: [
          `I did not ask for ${name}. I have ${them}.`,
          `${them} plays. ${name} waits.`,
        ],
        pointed: [
          `Nobody asked me about ${name}. I would have told them I have ${them}. For the record, I am telling you now.`,
          `I have ${them}. I did not need ${name}, and whoever signed him did not ask what I needed.`,
        ],
      })
    addInboxItem(state, ids, {
      category: 'coach',
      subject: `About ${player.knownAs}`,
      from: contact(coachStaff.knownAs, 'Head Coach'),
      body,
      link: { view: 'player', id: player.id },
    })
  }

  return { player, preferred, fee }
}
