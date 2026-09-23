import { Rng, randomSeed } from './rng'
import { IdFactory } from './ids'
import { NameGenerator } from './names/generator'
import { generateWorld, type WorldSize } from './world/worldGen'
import { recalculateBudgets } from './systems/finance'
import { openCareerEntry } from './systems/career'
import { assignScout } from './systems/scouting'
import { addInboxItem } from './systems/inbox'
import { chairmanRegister, pickBy } from './systems/voice'
import { refreshSquadStatuses } from './systems/morale'
import { stageOpeningSigning } from './systems/openingSigning'
import { MANDATE_BRIEFS, setSeasonExpectation, setSeasonMandates } from './systems/board'
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
export interface StartOptions {
  /**
   * Stage the board's signing that the coach did not want. On for every
   * career a person starts; off only for tests and tools that need a squad
   * exactly as the world generated it.
   */
  openingSigning?: boolean
}

export function startCareerAt(
  setup: NewGameSetup,
  clubId: ID,
  contract?: ContractOffer,
  options: StartOptions = {},
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

  // Staged before the welcome is written, so the welcome is the first thing
  // in the inbox and the deal sits just beneath it.
  if (options.openingSigning !== false) stageOpeningSigning(state, ids, club)

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
  const register = chairmanRegister(club.board.owner.kind)
  const signature = ownerSignature(club)

  // Only the opening line changes with who owns the club. The rest is the same
  // man carrying on, so it stays out of the first person — a paragraph that
  // says "it keeps me awake" reads wrong under a fund that talks in the
  // passive voice, and the facts are the facts whoever is delivering them.
  const welcome = [
    pickBy(`welcome:${club.id}`, register, {
      paternal: [
        `Welcome. My family has held this club a long time and we have never had one of these jobs before — which should tell you how far things have slipped.`,
        `Welcome aboard. We have never employed a director of football. My father would have hated the idea, and he would have been wrong.`,
      ],
      plain: [
        `Right. You're the first director of football we've had, and there's a reason we finally needed one.`,
        `Welcome. I'll be straight with you: we've not had one of these before and I'd rather we hadn't needed to start.`,
      ],
      corporate: [
        `Welcome to the club. The board has created this position following a review of football operations. The remit is set out below.`,
        `Welcome. This role is new, arising from the operational review concluded last quarter. Your objectives follow.`,
      ],
      breezy: [
        `Welcome! Brilliant to have you. First one of these we've had — everyone tells me it's what the modern club does, so here we are.`,
        `Welcome aboard, delighted you said yes. You're our first director of football, which I'm told is very overdue.`,
      ],
      committee: [
        `Welcome. The partners have agreed that the club requires a director of football, and you are that appointment.`,
        `Welcome aboard. It was the view of the ownership group that this role was needed. You come with our collective backing.`,
      ],
      earnest: [
        `Welcome. The members voted for this post, which is not something we do lightly, and a lot of people are hoping you are the answer.`,
        `Welcome aboard. This club belongs to its supporters and they have put their money behind creating your job. Please do not waste it.`,
      ],
    }),
    // League first, because the targets read "stay in this division" and
    // "win the division" — tacking the name on the end of those produced "stay
    // in this division in Division One".
    `In ${league?.name ?? 'this division'} this season, the expectation is straightforward: ${club.board.expectation.description.toLowerCase()}. Manage that and nobody upstairs will trouble you.`,
    `The squad is ${seniors.length} senior players, average age ${avgAge}. Wages run to £${club.finances.wageBudget.toLocaleString()} a week, and ${
      club.finances.transferBudget > 0
        ? `there is £${club.finances.transferBudget.toLocaleString()} to spend. It gets spent once`
        : 'there is nothing to spend, so whatever you want, you find the money for it first'
    }.`,
    club.finances.debt > 0
      ? `The club is also carrying £${club.finances.debt.toLocaleString()} of debt. It is the first thing the board look at on a Monday, and sooner or later it will be the first thing they ask you about.`
      : '',
    coach
      ? `One last thing. ${coach.knownAs} is the head coach and he picks the team. That part is not yours, and accepting it early will save everybody a good deal of trouble.`
      : `One last thing. There is no head coach. That is the first job, and it will not wait.`,
    signature,
  ]

  addInboxItem(state, ids, {
    category: 'board',
    subject: `Welcome to ${club.name}`,
    from: 'Chairman',
    body: welcome.filter(Boolean).join('\n\n'),
    urgent: false,
    link: { view: 'board' },
  })

  if (club.board.mandates.length > 0) {
    const remit = [
      pickBy(`remit:${club.id}`, register, {
        paternal: [`There are a few things besides the table that matter to us here. You will be judged on them too, and I will not pretend otherwise.`],
        plain: [`There's more to it than the league table. These are the other things you'll be marked on. No surprises later.`],
        corporate: [`The following priorities sit alongside league position within your objectives. Performance will be assessed against all of them.`],
        breezy: [`Oh — couple of other things we care about besides the league! All listed. Don't want you caught out.`],
        committee: [`The partners have agreed a number of priorities alongside league position. You will be assessed against these as well.`],
        earnest: [`The members asked for these alongside the league position. They matter to people here, so they will matter to how you are judged.`],
      }),
      // The bug this list fixes: the letter announced the priorities and then
      // set out none of them, because the only place they were ever written
      // down was the board screen.
      club.board.mandates.map((m) => `• ${MANDATE_BRIEFS[m]}`).join('\n'),
      `They are all on the board screen as well, if you would sooner see them as a list.`,
      signature,
    ]

    addInboxItem(state, ids, {
      category: 'board',
      subject: 'Your remit',
      from: 'Chairman',
      body: remit.filter(Boolean).join('\n\n'),
      urgent: false,
      link: { view: 'board' },
    })
  }
}

/**
 * How the chairman signs off. A person puts his name to a letter; a fund, a
 * consortium or a supporters' trust does not, and signing one
 * "— Meridian Capital" read like a press release rather than a note from the
 * man who just hired you.
 */
function ownerSignature(club: Club): string {
  const owner = club.board.owner
  switch (owner.kind) {
    case 'foreignFund':
    case 'consortium':
    case 'fanOwned':
      return ''
    default:
      return `— ${owner.name}`
  }
}
