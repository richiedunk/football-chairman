/**
 * Does anybody in this game repeat themselves?
 *
 * Twenty pools of the head coach's voice were written across four registers,
 * and a set of the player liaison's on top of them, and nobody had ever read
 * either in sequence over a whole season. A line that is funny once is grating
 * by March, and the failure mode is invisible in a unit test: every one of
 * them passes on a single call.
 *
 * So this plays a season, collects every line the coach and the liaison say in
 * the order the player would meet them, and reports the numbers that actually
 * decide whether the writing holds: how many distinct lines a season draws
 * from each pool, how often the most-used one repeats, and the longest run of
 * the same line back to back. Then it prints the season as a transcript so a
 * human can read what a human would read.
 *
 * Run: `npx tsx scripts/voicecheck.ts` (SEED, SEASONS)
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import { matchVerdict } from '../src/engine/systems/matchReport'
import { signingsVerdict } from '../src/engine/systems/coachView'
import type { GameState, InboxItem } from '../src/engine/types'

const SEED = process.env.SEED ?? 'VOICE1'
const SEASONS = Number(process.env.SEASONS ?? 1)

interface Said {
  week: number
  season: number
  who: string
  line: string
}

function setUp() {
  const setup = prepareNewGame({
    seed: SEED,
    directorName: 'Voice Check',
    background: 'scout',
    worldSize: 'compact',
    homeNationId: 'eng',
    startingSeason: 2025,
  })
  const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
  return { state, deps: { ids: setup.ids, names: setup.names } }
}

/**
 * Answer everything, so the week advances.
 *
 * The blocking decisions are not what is being measured, and a run that stops
 * in week four because somebody wanted an answer measures nothing at all. The
 * default option is taken where there is one, which is what happens anyway if
 * an item is left to expire.
 */
function answerEverything(state: GameState): void {
  for (const item of state.inbox) {
    const d = item.decision
    if (!d || d.chosenId) continue
    const option = d.options.find((o) => o.id === d.defaultOptionId && o.available)
      ?? d.options.find((o) => o.available)
    if (option) d.chosenId = option.id
  }
}

function run(): void {
  const { state, deps } = setUp()
  const said: Said[] = []
  const seenInbox = new Set<string>()
  const weeks = SEASONS * 52

  for (let i = 0; i < weeks; i++) {
    answerEverything(state)
    advanceWeek(state, deps)

    const club = state.playerClubId ? state.clubs[state.playerClubId] : null
    if (!club) break

    // The coach after a match, and the coach on the dashboard. Both are read
    // the way the screens read them, so a line that never reaches a screen is
    // not counted as one the player heard.
    const played = state.fixtures.filter(
      (f) => f.season === state.date.season
        && f.week === state.date.week - 1
        && f.result
        && (f.homeClubId === club.id || f.awayClubId === club.id),
    )
    for (const fixture of played) {
      const opponent = state.clubs[
        fixture.homeClubId === club.id ? fixture.awayClubId : fixture.homeClubId
      ]
      const coach = club.headCoachId ? state.staff[club.headCoachId] ?? null : null
      if (!opponent || !fixture.result) continue
      const verdict = matchVerdict(club, opponent, fixture, fixture.result, coach)
      if (verdict.coachLine) {
        said.push({
          week: state.date.week, season: state.date.season,
          who: 'coach:verdict', line: verdict.coachLine,
        })
      }
      const signings = signingsVerdict(state, club, { fixture, result: fixture.result })
      if (signings?.line) {
        said.push({
          week: state.date.week, season: state.date.season,
          who: `coach:signings/${signings.register}`, line: signings.line,
        })
      }
    }

    // Everything new in the inbox, by sender. The liaison's snub messages are
    // the point, but a sender who turns up forty times a season with three
    // sentences is worth seeing whoever they are.
    for (const item of state.inbox as InboxItem[]) {
      if (seenInbox.has(item.id)) continue
      seenInbox.add(item.id)
      said.push({
        week: item.week, season: item.season,
        who: `inbox:${item.from}`, line: item.body,
      })
    }
  }

  report(said)
}

/** The numbers that decide whether the writing holds up over a season. */
function report(said: Said[]): void {
  const byWho = new Map<string, Said[]>()
  for (const s of said) {
    const list = byWho.get(s.who) ?? []
    list.push(s)
    byWho.set(s.who, list)
  }

  console.log(`\n${said.length} lines over ${SEASONS} season${SEASONS === 1 ? '' : 's'}, seed ${SEED}\n`)
  console.log('who'.padEnd(34), 'said'.padStart(5), 'distinct'.padStart(9), 'top'.padStart(5), 'run'.padStart(4))
  console.log('-'.repeat(60))

  const rows = [...byWho.entries()].sort((a, b) => b[1].length - a[1].length)
  for (const [who, lines] of rows) {
    const counts = new Map<string, number>()
    for (const l of lines) counts.set(l.line, (counts.get(l.line) ?? 0) + 1)

    // The longest stretch of the same line back to back, which is the one a
    // reader actually notices.
    let longest = 1
    let current = 1
    for (let i = 1; i < lines.length; i++) {
      current = lines[i].line === lines[i - 1].line ? current + 1 : 1
      if (current > longest) longest = current
    }

    const top = Math.max(...counts.values())
    console.log(
      who.padEnd(34),
      String(lines.length).padStart(5),
      String(counts.size).padStart(9),
      String(top).padStart(5),
      String(longest).padStart(4),
    )
  }

  console.log('\ndistinct = how many different lines a season drew from that pool')
  console.log('top      = how often the most-used single line came up')
  console.log('run      = longest stretch of the identical line back to back\n')

  console.log('--- the season as the player reads it ---\n')
  for (const s of said) {
    const tag = `${s.season} W${String(s.week).padStart(2, '0')} ${s.who}`
    console.log(`${tag.padEnd(46)} ${s.line}`)
  }
}

run()
