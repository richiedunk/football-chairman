/**
 * Does a new director meet the game's central beat in the first hour?
 *
 * Every new career stages a signing the board made before you arrived, and
 * the coach did not want (systems/openingSigning.ts). The staging only
 * chooses who arrives; nothing forces the coach's hand afterwards. So this
 * starts careers across seeds and every club a new director can take, plays
 * the first three competitive matches, and reports how often the signing was
 * actually left out — which is the only number that says the beat lands.
 *
 * Run: `npx tsx scripts/openingcheck.ts` (SEEDS, MATCHES)
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { canTakeJobAt } from '../src/engine/systems/career'
import { yourSignings } from '../src/engine/systems/coachView'
import type { GameState } from '../src/engine/types'

const SEEDS = Number(process.env.SEEDS ?? 6)
const MATCHES = Number(process.env.MATCHES ?? 3)

function answerEverything(state: GameState): void {
  for (const item of state.inbox) {
    const d = item.decision
    if (!d || d.chosenId) continue
    const option = d.options.find((o) => o.id === d.defaultOptionId && o.available)
      ?? d.options.find((o) => o.available)
    if (option) d.chosenId = option.id
  }
}

let careers = 0
let staged = 0
let benchedFirst = 0
let benchedAll = 0
let benchedAny = 0
let spoke = 0
let firstMatchWeek = 0

for (let s = 0; s < SEEDS; s++) {
  const probe = prepareNewGame({
    seed: `OPEN${s}`, directorName: 'T', background: 'scout', worldSize: 'compact',
    homeNationId: 'eng', startingSeason: 2025,
  })
  const open = probe.candidates.filter((c) => canTakeJobAt(probe.state.director, c)).map((c) => c.id)
  for (const clubId of open.slice(0, 4)) {
    const setup = prepareNewGame({
      seed: `OPEN${s}`, directorName: 'T', background: 'scout', worldSize: 'compact',
      homeNationId: 'eng', startingSeason: 2025,
    })
    const state = startCareerAt(setup, clubId)
    const deps = { ids: setup.ids, names: setup.names }
    const club = state.clubs[clubId]
    careers++
    const signing = yourSignings(state, club)[0]
    if (!signing) { console.log(`${club.name}: nothing staged`); continue }
    staged++

    const picked: boolean[] = []
    for (let w = 0; w < 20 && picked.length < MATCHES; w++) {
      answerEverything(state)
      advanceWeek(state, deps)
      const played = state.fixtures.filter((f) =>
        f.result && f.week === state.date.week - 1 + (state.date.week === 1 ? 52 : 0) - (state.date.week === 1 ? 0 : 0)
        && (f.homeClubId === clubId || f.awayClubId === clubId))
      for (const f of state.fixtures) {
        if (!f.result || (f.homeClubId !== clubId && f.awayClubId !== clubId)) continue
        if ((f as { _seen?: boolean })._seen) continue
        ;(f as { _seen?: boolean })._seen = true
        const lineup = f.homeClubId === clubId ? f.result.homeLineup : f.result.awayLineup
        picked.push(lineup.includes(signing.id))
        if (picked.length === 1) firstMatchWeek += f.week
      }
      void played
    }
    const said = state.inbox.some((i) => i.subject === `${signing.knownAs} is not being picked`)
    if (said) spoke++
    if (picked[0] === false) benchedFirst++
    if (picked.length && picked.every((p) => !p)) benchedAll++
    if (picked.some((p) => !p)) benchedAny++
    console.log(`${club.name.padEnd(26)} ${signing.knownAs.padEnd(22)} ${signing.position.padEnd(3)} `
      + `CA ${String(Math.round(signing.currentAbility)).padStart(3)}  started: ${picked.map((p) => (p ? 'Y' : '-')).join('')}`
      + `${said ? '  (liaison spoke)' : ''}`)
  }
}

console.log(`\n${careers} careers, ${staged} with a staged signing`)
console.log(`left out of the first match:        ${benchedFirst}/${staged}`)
console.log(`left out of at least one of ${MATCHES}:     ${benchedAny}/${staged}`)
console.log(`left out of all ${MATCHES}:                 ${benchedAll}/${staged}`)
console.log(`liaison said so inside ${MATCHES} matches: ${spoke}/${staged}`)
console.log(`first competitive match, mean week: ${(firstMatchWeek / Math.max(1, staged)).toFixed(1)}`)
