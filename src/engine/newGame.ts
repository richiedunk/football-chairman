import { Rng, randomSeed } from './rng'
import { IdFactory } from './ids'
import { NameGenerator } from './names/generator'
import { generateWorld, type WorldSize } from './world/worldGen'
import { recalculateBudgets } from './systems/finance'
import { openCareerEntry } from './systems/career'
import { assignScout } from './systems/scouting'
import { addInboxItem } from './systems/inbox'
import { refreshSquadStatuses } from './systems/morale'
import { setSeasonExpectation, setSeasonMandates } from './systems/board'
import { contractTermsFor, signContract, type ContractOffer } from './systems/directorContract'
import type { Club, DirectorBackground, GameState, ID, Staff } from './types'

/**
 * New game setup.
 *
 * Generates a world, then presents a shortlist of clubs that would actually
 * hire an unproven director — which at level 1 means clubs with visible
 * problems. You are not choosing a project, you are choosing which mess to
 * inherit.
 */

export interface NewGameOptions {
  seed?: string
  directorName: string
  background: DirectorBackground
  worldSize: WorldSize
  homeNationId: string
  startingSeason?: number
}

export interface NewGameSetup {
  state: GameState
  /** Clubs the director may choose between. */
  candidates: Club[]
  ids: IdFactory
  names: NameGenerator
}

/** Director backgrounds, and what each is actually good at. */
export const BACKGROUNDS: {
  id: DirectorBackground
  label: string
  description: string
  perk: string
}[] = [
  {
    id: 'formerPlayer',
    label: 'Former Player',
    description: 'You had a decent career and you know what a dressing room feels like.',
    perk: 'Players trust you: better morale outcomes and easier personal terms.',
  },
  {
    id: 'agent',
    label: 'Ex-Agent',
    description: 'You know exactly how the other side of a transfer works.',
    perk: 'Agents deal with you willingly: lower agent fees and better negotiating position.',
  },
  {
    id: 'analyst',
    label: 'Data Analyst',
    description: 'You came up through a recruitment department, not a changing room.',
    perk: 'Sharper scouting: reports narrow faster and the data department works harder.',
  },
  {
    id: 'financier',
    label: 'Financier',
    description: 'You were brought in because somebody needed the books fixed.',
    perk: 'Boards trust your judgement on money: larger budgets and more patience.',
  },
  {
    id: 'scout',
    label: 'Career Scout',
    description: 'Twenty years of cold Tuesday nights watching reserve fixtures.',
    perk: 'You judge players well yourself, and your scouts respect you.',
  },
  {
    id: 'academyCoach',
    label: 'Academy Coach',
    description: 'You built a youth setup that produced players, and got noticed.',
    perk: 'Youth development is faster and your academy produces more prospects.',
  },
]

/** Generate the world and the list of clubs that would hire you. */
export function prepareNewGame(options: NewGameOptions): NewGameSetup {
  const seed = options.seed?.trim() || randomSeed()
  const season = options.startingSeason ?? new Date().getFullYear()

  const state = generateWorld({
    seed,
    season,
    size: options.worldSize,
    homeNationId: options.homeNationId,
    directorName: options.directorName,
    background: options.background,
  })

  const ids = new IdFactory(state.nextId)
  const names = new NameGenerator(new Rng(`${seed}:names`))
  // Rebuild the duplicate register so newly generated people do not collide
  // with the ones already in the world.
  names.registerExisting(
    Object.values(state.players).map((p) => `${p.firstName} ${p.lastName}`),
  )

  // The jobs board lists every club in the home nation, open and closed alike,
  // so a new director can see the whole ladder rather than five options with
  // no context for where they sit.
  const candidates = Object.values(state.clubs)
    .filter((club) => club.nationId === options.homeNationId)
    .sort((a, b) => b.reputation - a.reputation)

  return { state, candidates, ids, names }
}

/**
 * Commit to a club and finish setting up the save.
 *
 * `contract` is the deal negotiated on the jobs board. It is optional so that
 * headless tests and tooling can start a career without going through the
 * negotiation; in that case the club's opening terms are signed as-is.
 */
export function startCareerAt(
  setup: NewGameSetup,
  clubId: ID,
  contract?: ContractOffer,
): GameState {
  const { state, ids } = setup
  const club = state.clubs[clubId]
  if (!club) throw new Error(`Unknown club ${clubId}`)

  state.playerClubId = club.id

  applyBackgroundPerks(state, club)

  const league = state.leagues[club.leagueId]
  if (league) {
    setSeasonExpectation(state, club, league)
    setSeasonMandates(state, club)
  }
  recalculateBudgets(state, club)
  refreshSquadStatuses(state, club)

  openCareerEntry(state.director, club, state.date.season)
  signContract(state, club, contract ?? contractTermsFor(state, club, state.director).opening)

  // Give the scouts something to do rather than starting them idle, since a
  // new director inheriting an idle scouting department is a fair description
  // of the job but a poor first five minutes of a game.
  const scouts = club.staff
    .map((id) => state.staff[id])
    .filter((s): s is Staff => Boolean(s) && s.role === 'scout')
  for (const scout of scouts) {
    assignScout(scout, {
      type: 'league',
      targetId: club.leagueId,
      minAbility: Math.round(club.reputation * 1.1),
      maxAge: 30,
    })
  }

  writeOpeningInbox(state, ids, club)
  state.nextId = ids.value
  return state
}

/**
 * Background perks, applied once at the start. Kept small and concrete — a
 * perk you cannot see the effect of is not a choice, it is decoration.
 */
function applyBackgroundPerks(state: GameState, club: Club): void {
  switch (state.director.background) {
    case 'analyst':
      club.facilities.dataDepartment = Math.min(20, club.facilities.dataDepartment + 4)
      break
    case 'scout':
      club.facilities.scoutingNetwork = Math.min(20, club.facilities.scoutingNetwork + 3)
      for (const id of club.staff) {
        const staff = state.staff[id]
        if (staff?.role === 'scout') staff.relationship = Math.min(100, staff.relationship + 15)
      }
      break
    case 'academyCoach':
      club.facilities.youthFacilities = Math.min(20, club.facilities.youthFacilities + 4)
      break
    case 'financier':
      club.board.confidence = Math.min(100, club.board.confidence + 12)
      club.finances.transferBudget = Math.round(club.finances.transferBudget * 1.25)
      break
    case 'agent':
      for (const agent of Object.values(state.agents)) {
        agent.relationship = Math.min(100, agent.relationship + 18)
      }
      break
    case 'formerPlayer':
      for (const id of club.squad) {
        const player = state.players[id]
        if (player) player.morale = Math.min(100, player.morale + 8)
      }
      state.director.reputation += 8
      break
  }
}

function writeOpeningInbox(state: GameState, ids: IdFactory, club: Club): void {
  const league = state.leagues[club.leagueId]
  const coach = club.headCoachId ? state.staff[club.headCoachId] : null
  const squad = club.squad.map((id) => state.players[id]).filter(Boolean)
  const seniors = squad.filter((p) => p && !p.isAcademy)
  const avgAge = seniors.length
    ? (seniors.reduce((sum, p) => sum + p!.age, 0) / seniors.length).toFixed(1)
    : '—'

  addInboxItem(state, ids, {
    category: 'board',
    subject: `Welcome to ${club.name}`,
    from: 'Chairman',
    body: [
      `Welcome aboard. You are the first director of football this club has employed, and there is a reason we needed one.`,
      ``,
      `The expectation this season is straightforward: ${club.board.expectation.description.toLowerCase()} in ${league?.name ?? 'the division'}.`,
      ``,
      `You have ${seniors.length} senior players with an average age of ${avgAge}, a wage budget of £${club.finances.wageBudget.toLocaleString()} a week, and ${club.finances.transferBudget > 0 ? `£${club.finances.transferBudget.toLocaleString()} to spend` : 'nothing to spend'}.`,
      club.finances.debt > 0
        ? `\nYou should also know we are carrying £${club.finances.debt.toLocaleString()} of debt. Deal with it.`
        : '',
      coach ? `\n${coach.knownAs} is the head coach. He picks the team. You do not.` : '\nWe have no head coach. That is your first problem.',
    ].join('\n'),
    urgent: false,
    link: { view: 'board' },
  })

  if (club.board.mandates.length > 0) {
    addInboxItem(state, ids, {
      category: 'board',
      subject: 'Your remit',
      from: 'Chairman',
      body: `The board have set the following priorities alongside league position. You will be judged on these.`,
      link: { view: 'board' },
    })
  }
}
