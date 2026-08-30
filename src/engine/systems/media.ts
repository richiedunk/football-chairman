import { clamp, Rng } from '../rng'
import { IdFactory, ID_PREFIX } from '../ids'
import { squadImportance } from './valuation'
import { playerClub } from '../playerClub'
import type {
  Club, GameState, ID, MediaBriefing, MediaEffect, MediaOutlet, MediaResponse, MediaStory,
  MediaStoryKind, Player,
} from '../types'

/**
 * Media management.
 *
 * The offensive system. A director of football does not just react to the
 * press — he uses it. Leaking genuine interest in a rival's unsettled striker
 * depresses his price and his focus. Planting a fabricated link does the same
 * thing more cheaply and might blow up in your face. Publicly backing a coach
 * under pressure buys him three more weeks; declining to buys you a cheaper
 * replacement.
 *
 * Two resources are spent: **credibility**, which is what makes journalists
 * run your briefings at all, and **goodwill**, which is how kindly they cover
 * you when things go wrong. Fabrications are cheap in money and expensive in
 * credibility, and an exposed fabrication costs both plus board confidence.
 */

/** How many briefings a club can issue before the press stops listening. */
const BRIEFING_COOLDOWN_WEEKS = 2

export interface MediaContext {
  rng: Rng
  ids: IdFactory
}

export const STORY_KIND_LABELS: Record<MediaStoryKind, string> = {
  transferLink: 'Transfer link',
  contractStandoff: 'Contract standoff',
  playerUnrest: 'Player unrest',
  coachUnderPressure: 'Coach under pressure',
  boardBacking: 'Board backing',
  injuryNews: 'Injury news',
  formPraise: 'Praise',
  formCriticism: 'Criticism',
  financialConcern: 'Financial concern',
  academyHype: 'Academy hype',
  rivalTaunt: 'Rival taunt',
  signingReaction: 'Signing reaction',
  sackSpeculation: 'Sack speculation',
}

export const RESPONSE_LABELS: Record<MediaResponse, string> = {
  noComment: 'No comment',
  deny: 'Deny it',
  confirm: 'Confirm it',
  backPlayer: 'Back the player publicly',
  backCoach: 'Back the coach publicly',
  criticise: 'Criticise publicly',
  deflect: 'Deflect onto something else',
}

// ---------------------------------------------------------------------------
// Briefings: the player acting on the press
// ---------------------------------------------------------------------------

export interface BriefingOption {
  kind: MediaStoryKind
  label: string
  description: string
  /** What it does, in plain terms, for the UI. */
  effect: string
  /** Whether it needs a target player. */
  needsPlayer: boolean
  /** Whether the truth setting is meaningful for this kind. */
  allowsFabrication: boolean
}

export const BRIEFING_OPTIONS: BriefingOption[] = [
  {
    kind: 'transferLink',
    label: 'Leak transfer interest',
    description: 'Brief a journalist that you are watching a player at another club.',
    effect: 'Unsettles him, weakens his club\'s position, and lowers his price — but alerts rivals to your target.',
    needsPlayer: true,
    allowsFabrication: true,
  },
  {
    kind: 'playerUnrest',
    label: 'Brief against a rival\'s player',
    description: 'Suggest a player elsewhere is unhappy and agitating for a move.',
    effect: 'Damages his morale and his relationship with his club. Pure poison if it is untrue and you are caught.',
    needsPlayer: true,
    allowsFabrication: true,
  },
  {
    kind: 'boardBacking',
    label: 'Brief that the board backs you',
    description: 'Place a story that you have the board\'s full support.',
    effect: 'Steadies the fans and buys time. If the board did not authorise it, they will not be pleased.',
    needsPlayer: false,
    allowsFabrication: true,
  },
  {
    kind: 'formPraise',
    label: 'Talk up one of your own',
    description: 'Push a story about how well one of your players is doing.',
    effect: 'Lifts his morale and his market value. Also puts him on other clubs\' radar.',
    needsPlayer: true,
    allowsFabrication: false,
  },
  {
    kind: 'academyHype',
    label: 'Talk up the academy',
    description: 'Brief on a prospect coming through.',
    effect: 'Pleases the board and the fans, and raises the boy\'s value before you sell him.',
    needsPlayer: true,
    allowsFabrication: true,
  },
  {
    kind: 'financialConcern',
    label: 'Brief on a rival\'s finances',
    description: 'Suggest another club is in worse financial shape than it admits.',
    effect: 'Makes their players nervous and their asking prices softer. Extremely risky.',
    needsPlayer: false,
    allowsFabrication: true,
  },
]

export interface BriefingResult {
  story: MediaStory | null
  message: string
  ok: boolean
}

/**
 * Issue a briefing to the press.
 *
 * Whether it runs at all depends on your credibility with that outlet and how
 * sensational the outlet is. A tabloid will print almost anything; a
 * broadsheet needs you to be worth believing, which is precisely why its
 * stories land harder.
 */
export function issueBriefing(
  state: GameState,
  ctx: MediaContext,
  briefing: MediaBriefing,
): BriefingResult {
  const club = playerClub(state)
  const outlet = state.outlets[briefing.outletId]
  if (!club || !outlet) return { story: null, message: 'Unknown outlet.', ok: false }

  if (state.date.week - state.mediaStanding.lastBriefingWeek < BRIEFING_COOLDOWN_WEEKS) {
    return {
      story: null,
      ok: false,
      message: 'You have briefed the press too recently. Journalists are starting to notice a pattern.',
    }
  }

  // Will they run it? Credibility opens the door; sensationalism widens it.
  const willingness =
    (state.mediaStanding.credibility / 100) * 0.55
    + (outlet.sensationalism / 100) * 0.3
    + (outlet.relationship / 100) * 0.25
    - (briefing.truth === 'fabricated' ? 0.2 : briefing.truth === 'exaggerated' ? 0.08 : 0)

  if (!ctx.rng.chance(clamp(willingness, 0.05, 0.95))) {
    state.mediaStanding.lastBriefingWeek = state.date.week
    state.mediaStanding.goodwill = clamp(state.mediaStanding.goodwill - 3, 0, 100)
    return {
      story: null,
      ok: false,
      message: `${outlet.name} declined to run it. They are not convinced it stands up.`,
    }
  }

  const target = briefing.targetPlayerId ? state.players[briefing.targetPlayerId] : null
  const targetClub = briefing.targetClubId
    ? state.clubs[briefing.targetClubId]
    : target?.clubId
      ? state.clubs[target.clubId]
      : null

  const prominence = clamp(
    Math.round(
      briefing.intensity * 0.5
      + (outlet.credibility / 100) * 35
      + (target ? (target.currentAbility / 200) * 30 : 15),
    ),
    5,
    100,
  )

  const story: MediaStory = {
    id: ctx.ids.next(ID_PREFIX.story),
    kind: briefing.kind,
    season: state.date.season,
    week: state.date.week,
    headline: writeHeadline(briefing.kind, club, target, targetClub, outlet),
    body: writeBody(briefing.kind, club, target, targetClub, briefing.truth),
    outletId: outlet.id,
    truth: briefing.truth,
    subjectPlayerIds: target ? [target.id] : [],
    subjectClubIds: [club.id, ...(targetClub ? [targetClub.id] : [])],
    subjectStaffIds: briefing.targetStaffId ? [briefing.targetStaffId] : [],
    plantedBy: club.id,
    effects: [],
    response: null,
    prominence,
  }

  story.effects = applyStoryEffects(state, story, ctx)
  state.mediaStories.unshift(story)
  if (state.mediaStories.length > 200) state.mediaStories.length = 200

  state.mediaStanding.lastBriefingWeek = state.date.week
  if (briefing.truth === 'fabricated') {
    state.mediaStanding.fabricationsPlanted += 1
    // Fabricating costs credibility even undetected: journalists compare notes.
    state.mediaStanding.credibility = clamp(state.mediaStanding.credibility - 2, 0, 100)
  }
  outlet.relationship = clamp(outlet.relationship + 3, 0, 100)

  return { story, ok: true, message: `${outlet.name} have run the story.` }
}

/**
 * Apply a story's consequences and record them, so the UI can show the player
 * exactly what their briefing did rather than leaving it to inference.
 */
function applyStoryEffects(state: GameState, story: MediaStory, ctx: MediaContext): MediaEffect[] {
  const effects: MediaEffect[] = []
  const magnitude = story.prominence / 100
  // A fabrication lands with less force than the truth, because the details
  // never quite hold up.
  const truthFactor = story.truth === 'true' ? 1 : story.truth === 'exaggerated' ? 0.8 : 0.6

  const record = (
    target: MediaEffect['target'],
    targetId: ID,
    metric: string,
    delta: number,
    description: string,
  ) => {
    if (Math.abs(delta) < 0.5) return
    effects.push({ target, targetId, metric, delta: Math.round(delta), description })
  }

  const subject = story.subjectPlayerIds[0] ? state.players[story.subjectPlayerIds[0]] : null
  const subjectClub = subject?.clubId ? state.clubs[subject.clubId] : null

  switch (story.kind) {
    case 'transferLink': {
      if (!subject) break
      // Being linked away is unsettling, and more so if he was already restless
      // or if the interested club is a step up.
      const club = playerClub(state)
      const stepUp = club && subjectClub ? clamp((club.reputation - subjectClub.reputation) / 40, -0.5, 1) : 0
      const moraleHit = -8 * magnitude * truthFactor * (1 + stepUp)
      subject.morale = clamp(subject.morale + moraleHit, 1, 100)
      record('player', subject.id, 'morale', moraleHit, `${subject.knownAs} is unsettled by the speculation.`)

      // A publicly unsettled player is cheaper.
      const valueHit = -subject.value * 0.05 * magnitude * truthFactor
      subject.value = Math.max(0, Math.round(subject.value + valueHit))
      record('player', subject.id, 'value', valueHit, 'His club\'s position has weakened.')

      if (subjectClub) {
        subjectClub.fanMood = clamp(subjectClub.fanMood - 3 * magnitude, 1, 100)
        record('fans', subjectClub.id, 'mood', -3 * magnitude, `${subjectClub.name} supporters are unhappy.`)
      }
      break
    }

    case 'playerUnrest': {
      if (!subject) break
      const moraleHit = -12 * magnitude * truthFactor
      subject.morale = clamp(subject.morale + moraleHit, 1, 100)
      record('player', subject.id, 'morale', moraleHit, `${subject.knownAs}'s relationship with his club has soured.`)
      subject.loyalty = clamp(subject.loyalty - 6 * magnitude * truthFactor, 1, 100)
      record('player', subject.id, 'loyalty', -6 * magnitude * truthFactor, 'He feels less attached to the club.')
      // If he was already close to the edge, this can tip him over.
      if (subject.morale < 25 && ctx.rng.chance(0.3 * magnitude)) {
        subject.transferRequested = true
        record('player', subject.id, 'transferRequest', 1, `${subject.knownAs} has asked to leave.`)
      }
      break
    }

    case 'boardBacking': {
      const club = playerClub(state)
      if (!club) break
      club.fanMood = clamp(club.fanMood + 6 * magnitude, 1, 100)
      record('fans', club.id, 'mood', 6 * magnitude, 'The supporters are reassured.')
      if (story.truth === 'fabricated') {
        // Claiming support you do not have is a gamble against the board.
        club.board.confidence = clamp(club.board.confidence - 4 * magnitude, 0, 100)
        record('board', club.id, 'confidence', -4 * magnitude, 'The board did not authorise that briefing.')
      }
      break
    }

    case 'formPraise': {
      if (!subject) break
      subject.morale = clamp(subject.morale + 7 * magnitude, 1, 100)
      record('player', subject.id, 'morale', 7 * magnitude, `${subject.knownAs} is enjoying the attention.`)
      const valueGain = subject.value * 0.04 * magnitude
      subject.value = Math.round(subject.value + valueGain)
      record('player', subject.id, 'value', valueGain, 'His market value has risen.')
      // The cost: other clubs are now watching him.
      const suitors = Object.values(state.clubs)
        .filter((c) => c.id !== subject.clubId && c.reputation > (subjectClub?.reputation ?? 0))
        .slice(0, 3)
      for (const suitor of suitors) {
        if (!subject.interestedClubIds.includes(suitor.id)) subject.interestedClubIds.push(suitor.id)
      }
      break
    }

    case 'academyHype': {
      const club = playerClub(state)
      if (!club) break
      club.board.confidence = clamp(club.board.confidence + 3 * magnitude, 0, 100)
      record('board', club.id, 'confidence', 3 * magnitude, 'The board like to hear about the academy.')
      if (subject) {
        const gain = Math.max(50_000, subject.value * 0.12) * magnitude
        subject.value = Math.round(subject.value + gain)
        record('player', subject.id, 'value', gain, 'The hype has inflated his valuation.')
      }
      break
    }

    case 'financialConcern': {
      const targetClubId = story.subjectClubIds.find((id) => id !== state.playerClubId)
      const target = targetClubId ? state.clubs[targetClubId] : null
      if (!target) break
      target.fanMood = clamp(target.fanMood - 8 * magnitude * truthFactor, 1, 100)
      record('fans', target.id, 'mood', -8 * magnitude * truthFactor, `${target.name}'s supporters are worried.`)
      // Their players get twitchy, which softens their asking prices.
      for (const id of target.squad) {
        const player = state.players[id]
        if (!player) continue
        player.morale = clamp(player.morale - 4 * magnitude * truthFactor, 1, 100)
      }
      record('club', target.id, 'squadMorale', -4 * magnitude * truthFactor, 'Their squad is unsettled.')
      target.strategy.sellingClubStance = clamp(
        target.strategy.sellingClubStance + 6 * magnitude * truthFactor, 0, 100,
      )
      record('club', target.id, 'sellingStance', 6 * magnitude, 'They are more willing to listen to offers.')
      break
    }

    default:
      break
  }

  return effects
}

// ---------------------------------------------------------------------------
// Exposure: the cost of lying
// ---------------------------------------------------------------------------

/**
 * Weekly check on whether any recent fabrication has been found out.
 *
 * Exposure risk rises with the outlet's credibility (a serious paper checks,
 * and prints a correction), with how prominent the story was, and with how
 * often you have done this before. That last term is what stops fabrication
 * being a free action you spam every window.
 */
export function checkForExposure(state: GameState, ctx: MediaContext): string[] {
  const notices: string[] = []
  const recent = state.mediaStories.filter(
    (s) =>
      s.plantedBy === state.playerClubId
      && s.truth === 'fabricated'
      && weeksSince(state, s) <= 8,
  )

  for (const story of recent) {
    const outlet = state.outlets[story.outletId]
    if (!outlet) continue

    const habitFactor = clamp(state.mediaStanding.fabricationsPlanted / 12, 0, 1)
    const risk = clamp(
      0.02
      + (outlet.credibility / 100) * 0.05
      + (story.prominence / 100) * 0.04
      + habitFactor * 0.06,
      0.01,
      0.28,
    )

    if (!ctx.rng.chance(risk)) continue

    // Mark it so it cannot be exposed twice.
    story.truth = 'exaggerated'
    state.mediaStanding.fabricationsExposed += 1
    state.mediaStanding.credibility = clamp(state.mediaStanding.credibility - 18, 0, 100)
    state.mediaStanding.goodwill = clamp(state.mediaStanding.goodwill - 12, 0, 100)
    outlet.relationship = clamp(outlet.relationship - 25, 0, 100)

    const club = playerClub(state)
    if (club) {
      club.board.confidence = clamp(club.board.confidence - 8, 0, 100)
      club.fanMood = clamp(club.fanMood - 5, 1, 100)
    }

    // Agents remember. This is what makes repeated fabrication cost you deals
    // rather than just a number on a screen.
    for (const agent of Object.values(state.agents)) {
      agent.relationship = clamp(agent.relationship - 6, 0, 100)
    }

    notices.push(
      `${outlet.name} has run a follow-up establishing that your briefing about ${story.subjectPlayerIds[0]
        ? state.players[story.subjectPlayerIds[0]]?.knownAs ?? 'a player'
        : 'a rival club'} was without foundation. Your credibility has taken a serious hit.`,
    )
  }

  return notices
}

// ---------------------------------------------------------------------------
// Organic stories: the press acting on its own
// ---------------------------------------------------------------------------

/**
 * Generate the stories the press writes without being briefed. These are what
 * make the media system a two-way relationship rather than a vending machine:
 * some weeks you are the one being written about.
 */
export function generateOrganicStories(state: GameState, ctx: MediaContext): MediaStory[] {
  const club = playerClub(state)
  if (!club) return []
  const outlets = Object.values(state.outlets).filter((o) => o.nationId === club.nationId)
  if (outlets.length === 0) return []

  const stories: MediaStory[] = []
  const { rng } = ctx

  const push = (
    kind: MediaStoryKind,
    subject: Player | null,
    prominence: number,
    headline: string,
    body: string,
  ) => {
    const outlet = rng.weighted(outlets, outlets.map((o) => o.sensationalism + 20))
    stories.push({
      id: ctx.ids.next(ID_PREFIX.story),
      kind,
      season: state.date.season,
      week: state.date.week,
      headline,
      body,
      outletId: outlet.id,
      truth: 'true',
      subjectPlayerIds: subject ? [subject.id] : [],
      subjectClubIds: [club.id],
      subjectStaffIds: [],
      plantedBy: null,
      effects: [],
      response: null,
      prominence,
    })
  }

  // Coach under pressure.
  const coach = club.headCoachId ? state.staff[club.headCoachId] : null
  if (coach?.coachProfile && coach.coachProfile.jobSecurity < 35 && rng.chance(0.25)) {
    push(
      'coachUnderPressure', null, 65,
      `Pressure mounting on ${coach.knownAs}`,
      `A run of poor results has left ${coach.knownAs} under real pressure at ${club.name}. The question being asked is whether the director of football still backs him.`,
    )
  }

  // Unhappy player.
  const unhappy = club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && !p.isAcademy && p.morale < 30)
  if (unhappy.length > 0 && rng.chance(0.2)) {
    const player = rng.pick(unhappy)
    push(
      'playerUnrest', player, 55,
      `${player.knownAs} unhappy at ${club.shortName}`,
      `Sources close to ${player.knownAs} indicate he is frustrated with his situation and would consider a move.`,
    )
  }

  // Contract standoff.
  const expiring = club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && Boolean(p.contract))
    .filter((p) => p.contract!.expiresSeason <= state.date.season && squadImportance(state, p, club) > 0.6)
  if (expiring.length > 0 && rng.chance(0.22)) {
    const player = rng.pick(expiring)
    push(
      'contractStandoff', player, 70,
      `${player.knownAs} yet to sign new deal`,
      `With his contract running down, ${player.knownAs} is now able to speak to clubs abroad. ${club.name} risk losing him for nothing.`,
    )
  }

  // Financial concern.
  if (club.finances.inCrisis && rng.chance(0.3)) {
    push(
      'financialConcern', null, 80,
      `${club.name} finances under scrutiny`,
      `Accounts filed this week show ${club.name} carrying debt well beyond what its revenue can service. The board have declined to comment.`,
    )
  }

  // Praise for a player in form.
  const inForm = club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && !p.isAcademy && p.form > 82 && p.stats.appearances > 4)
  if (inForm.length > 0 && rng.chance(0.18)) {
    const player = rng.pick(inForm)
    push(
      'formPraise', player, 45,
      `${player.knownAs} the standout again`,
      `${player.knownAs} has been ${club.shortName}'s best player by some distance this season. Scouts from higher up the pyramid have been watching.`,
    )
    // Being written about draws attention, whether you wanted it or not.
    player.value = Math.round(player.value * 1.02)
  }

  for (const story of stories) {
    story.effects = applyStoryEffects(state, story, ctx)
  }
  state.mediaStories.unshift(...stories)
  if (state.mediaStories.length > 200) state.mediaStories.length = 200
  return stories
}

// ---------------------------------------------------------------------------
// Responding to stories
// ---------------------------------------------------------------------------

/** Consequences of how the director answers a story about their own club. */
export function respondToStory(
  state: GameState,
  story: MediaStory,
  response: MediaResponse,
  ctx: MediaContext,
): string {
  const club = playerClub(state)
  if (!club) return ''
  story.response = response

  const outlet = state.outlets[story.outletId]
  const subject = story.subjectPlayerIds[0] ? state.players[story.subjectPlayerIds[0]] : null
  const magnitude = story.prominence / 100

  switch (response) {
    case 'noComment':
      // Safe, but the story runs on without you.
      if (outlet) outlet.relationship = clamp(outlet.relationship - 2, 0, 100)
      club.fanMood = clamp(club.fanMood - 2 * magnitude, 1, 100)
      return 'You decline to comment. The story runs anyway.'

    case 'deny': {
      // Denying something true is found out, and costs you badly.
      if (story.truth === 'true') {
        state.mediaStanding.credibility = clamp(state.mediaStanding.credibility - 10, 0, 100)
        if (subject) subject.morale = clamp(subject.morale - 6, 1, 100)
        return 'You deny it flatly. Those who know better have noticed.'
      }
      state.mediaStanding.credibility = clamp(state.mediaStanding.credibility + 3, 0, 100)
      club.fanMood = clamp(club.fanMood + 3 * magnitude, 1, 100)
      return 'You deny the story and it loses momentum.'
    }

    case 'confirm':
      state.mediaStanding.credibility = clamp(state.mediaStanding.credibility + 5, 0, 100)
      if (outlet) outlet.relationship = clamp(outlet.relationship + 6, 0, 100)
      if (subject) subject.morale = clamp(subject.morale - 4 * magnitude, 1, 100)
      return 'You confirm it. Straight dealing earns you some credit with the press.'

    case 'backPlayer':
      if (subject) {
        subject.morale = clamp(subject.morale + 10 * magnitude, 1, 100)
        subject.loyalty = clamp(subject.loyalty + 4, 1, 100)
        return `You back ${subject.knownAs} publicly. He has taken note.`
      }
      return 'You back the player publicly.'

    case 'backCoach': {
      const coach = club.headCoachId ? state.staff[club.headCoachId] : null
      if (coach?.coachProfile) {
        coach.coachProfile.jobSecurity = clamp(coach.coachProfile.jobSecurity + 14 * magnitude, 0, 100)
        coach.coachProfile.dofRelationship = clamp(coach.coachProfile.dofRelationship + 10, 0, 100)
        // Publicly tying yourself to a struggling coach is a real bet.
        club.board.confidence = clamp(club.board.confidence - 3 * magnitude, 0, 100)
        return `You back ${coach.knownAs} publicly. If results do not turn, this will be remembered.`
      }
      return 'You back the coach publicly.'
    }

    case 'criticise':
      if (subject) {
        subject.morale = clamp(subject.morale - 16 * magnitude, 1, 100)
        subject.loyalty = clamp(subject.loyalty - 10, 1, 100)
        // The rest of the squad notices how you treat people.
        for (const id of club.squad) {
          const other = state.players[id]
          if (other && other.id !== subject.id) other.morale = clamp(other.morale - 2, 1, 100)
        }
        return `You criticise ${subject.knownAs} publicly. The dressing room has heard.`
      }
      return 'You criticise publicly.'

    case 'deflect': {
      const worked = ctx.rng.chance(clamp(state.mediaStanding.goodwill / 130, 0.15, 0.7))
      if (worked) {
        club.fanMood = clamp(club.fanMood + 4 * magnitude, 1, 100)
        return 'You steer the conversation elsewhere and it works.'
      }
      if (outlet) outlet.relationship = clamp(outlet.relationship - 6, 0, 100)
      return 'You try to change the subject. Nobody is fooled.'
    }
  }
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

function writeHeadline(
  kind: MediaStoryKind,
  club: Club,
  target: Player | null,
  targetClub: Club | null,
  outlet: MediaOutlet,
): string {
  const punchy = outlet.sensationalism > 65
  switch (kind) {
    case 'transferLink':
      return punchy
        ? `${club.shortName} WANT ${target?.knownAs.toUpperCase() ?? 'STAR'}`
        : `${club.name} monitoring ${target?.knownAs ?? 'a target'}`
    case 'playerUnrest':
      return punchy
        ? `${target?.knownAs ?? 'Star'} 'WANTS OUT' of ${targetClub?.shortName ?? 'club'}`
        : `${target?.knownAs ?? 'Player'} said to be unsettled at ${targetClub?.name ?? 'his club'}`
    case 'boardBacking':
      return `${club.name} board give director full backing`
    case 'formPraise':
      return punchy
        ? `${target?.knownAs ?? 'Star'} is the real deal`
        : `${target?.knownAs ?? 'Player'} continues to impress at ${club.shortName}`
    case 'academyHype':
      return `${club.shortName} academy produces another: ${target?.knownAs ?? 'a prospect'}`
    case 'financialConcern':
      return punchy
        ? `${targetClub?.shortName ?? 'Club'} IN TROUBLE`
        : `Questions over ${targetClub?.name ?? 'club'} finances`
    default:
      return `${club.name} in the news`
  }
}

function writeBody(
  kind: MediaStoryKind,
  club: Club,
  target: Player | null,
  targetClub: Club | null,
  truth: MediaStory['truth'],
): string {
  const hedge = truth === 'fabricated'
    ? 'A source who declined to be named claims'
    : truth === 'exaggerated'
      ? 'It is understood'
      : 'This paper can confirm'

  switch (kind) {
    case 'transferLink':
      return `${hedge} that ${club.name} have identified ${target?.knownAs ?? 'a target'} of ${targetClub?.name ?? 'their current club'} as a priority signing, and have already made informal contact.`
    case 'playerUnrest':
      return `${hedge} that ${target?.knownAs ?? 'the player'} has grown frustrated at ${targetClub?.name ?? 'his club'} and has told those close to him he intends to move on.`
    case 'boardBacking':
      return `${hedge} the board at ${club.name} remain fully behind the director of football and his long-term plan.`
    case 'formPraise':
      return `${hedge} ${target?.knownAs ?? 'the player'} has been the outstanding performer at ${club.name} this season, and interest from higher up is inevitable.`
    case 'academyHype':
      return `${hedge} ${club.name}'s academy has turned out another genuine prospect in ${target?.knownAs ?? 'a young player'}, with the coaching staff privately excited.`
    case 'financialConcern':
      return `${hedge} ${targetClub?.name ?? 'the club'} are carrying obligations well beyond what has been publicly acknowledged, and may be forced into sales.`
    default:
      return `${hedge} there is more to this story than has been reported.`
  }
}

function weeksSince(state: GameState, story: MediaStory): number {
  return (state.date.season - story.season) * 52 + (state.date.week - story.week)
}

/** Credibility band, for the media screen. */
export function credibilityLabel(credibility: number): string {
  if (credibility >= 85) return 'Trusted completely'
  if (credibility >= 65) return 'Well regarded'
  if (credibility >= 45) return 'Taken seriously'
  if (credibility >= 25) return 'Treated with caution'
  return 'Not believed'
}
