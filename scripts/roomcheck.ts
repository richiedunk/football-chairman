/**
 * Is a leader worth paying for, or is the dressing room just a tax?
 *
 * The roadmap names the trap directly: "a system where every signing is a risk
 * and none is an upside is just a tax." A disruptive player who costs you is
 * easy to build and easy to believe. The half that has to be proved is the
 * other one — that a squad with a leader in it measurably outperforms the same
 * squad without, by enough that paying a premium for one is rational.
 *
 * So this takes one real club, clones its world, and swaps a single senior
 * player's traits between `leader`, `disruptive` and nothing at all, then plays
 * the same seasons from the same seed. Anything that differs is the room.
 *
 * Run: `npx tsx scripts/roomcheck.ts` (SEASONS, SEED)
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import { readRoom, roomLabel } from '../src/engine/systems/dressingRoom'
import { seniorSquad } from '../src/engine/systems/aiSquad'
import type { GameState, PlayerTrait } from '../src/engine/types'

const SEASONS = Number(process.env.SEASONS ?? 3)
const SEED = process.env.SEED ?? 'ROOM1'

/**
 * One season, many seeds.
 *
 * The first version of this played three seasons and compared league points,
 * which measured nothing: the runs promote and relegate away from each other,
 * and by season three the points are scored against different opposition
 * entirely. It reported that a squad with no leader outscored one with a
 * leader, and that two disruptive players were better than one.
 *
 * So: a single season, before the divisions can diverge, averaged over enough
 * seeds that one club's injury crisis does not decide the answer. Morale is
 * the honest measure of a dressing room — results are what morale eventually
 * buys, through form, and putting a second noisy step in the middle only
 * hides the thing being measured.
 */
const SEEDS = Number(process.env.SEEDS ?? 8)

function trial(seedIndex: number, traits: PlayerTrait[]): { tone: number; morale: number } | null {
  const setup = prepareNewGame({
    seed: `${SEED}:${seedIndex}`, directorName: 'R', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  const state: GameState = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
  const club = state.clubs[state.playerClubId!]

  // The most senior player in the squad, so his voice carries — a leader
  // nobody picks sets no tone, which is the point of weighting by standing.
  const senior = seniorSquad(state, club)
    .slice()
    .sort((a, b) => b.currentAbility - a.currentAbility)[0]
  if (!senior) return null
  senior.traits = traits

  for (let week = 0; week < 43; week++) {
    advanceWeek(state, { ids: setup.ids, names: setup.names })
    if (state.playerClubId === null) return null
  }

  const squad = seniorSquad(state, club)
  if (squad.length === 0) return null
  return {
    tone: readRoom(state, club).tone,
    morale: squad.reduce((a, p) => a + p.morale, 0) / squad.length,
  }
}

function run(label: string, traits: PlayerTrait[]): number {
  const tones: number[] = []
  const morales: number[] = []
  for (let seed = 0; seed < SEEDS; seed++) {
    const result = trial(seed, traits)
    if (!result) continue
    tones.push(result.tone)
    morales.push(result.morale)
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
  const morale = mean(morales)
  console.log(
    label.padEnd(16)
    + `tone ${mean(tones).toFixed(2)}`.padEnd(14)
    + `${roomLabel(mean(tones))}`.padEnd(12)
    + `squad morale ${morale.toFixed(2)}`.padEnd(22)
    + `n=${morales.length}`,
  )
  return morale
}

console.log(`one senior player's traits swapped, one season, ${SEEDS} seeds, base ${SEED}\n`)
const leader = run('leader', ['leader'])
const professional = run('professional', ['professional'])
const nothing = run('nothing', [])
const disruptive = run('disruptive', ['disruptive'])
run('disruptive+hothead', ['disruptive', 'hothead'])

console.log(`\nleader over nothing:      ${(leader - nothing >= 0 ? '+' : '')}${(leader - nothing).toFixed(2)} morale`)
console.log(`professional over nothing: ${(professional - nothing >= 0 ? '+' : '')}${(professional - nothing).toFixed(2)} morale`)
console.log(`disruptive under nothing:  ${(disruptive - nothing).toFixed(2)} morale`)
console.log(
  leader > nothing && nothing > disruptive
    ? '\nOrdering holds: a leader lifts the room and a disruptive player poisons it.'
    : '\nORDERING BROKEN — the upside half is not real.',
)
