/**
 * Does investment in the data department actually buy anything?
 *
 * The claim the feature makes is specific and falsifiable: a badly funded
 * department is not a quiet one, it is a **wrong** one, and money buys
 * accuracy rather than volume alone. So the test is to run the same model over
 * the same world at every level and count how often it is right — where
 * "right" means the player it called underpriced genuinely is, measured
 * against the valuation the model cannot see.
 *
 * If a level-1 department is as accurate as a level-20 one, the investment is
 * decoration and the feature is a lie.
 *
 * Run: `npx tsx scripts/datacheck.ts` (SEED, RUNS)
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import { modelNoise, modelValuation, runModel, shortlistSize } from '../src/engine/systems/dataDepartment'
import { philosophyOf, setPhilosophy } from '../src/engine/systems/recruitment'
import { Rng } from '../src/engine/rng'

const RUNS = Number(process.env.RUNS ?? 40)
const setup = prepareNewGame({
  seed: process.env.SEED ?? 'DATA1', directorName: 'R', background: 'scout',
  worldSize: 'standard', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
const club = state.clubs[state.playerClubId!]
club.finances.transferBudget = 40_000_000
setPhilosophy(state, club, 'valueHunting')

console.log(`club: ${club.name} (rep ${Math.round(club.reputation)}), `
  + `policy ${philosophyOf(club).name}`)
console.log(`${RUNS} runs of the model at each level\n`)
console.log('level   error band   names   right   wrong   accuracy   mean confidence')

for (const level of [1, 3, 5, 8, 12, 16, 20]) {
  club.facilities.dataDepartment = level
  let right = 0
  let wrong = 0
  let names = 0
  let confidence = 0

  for (let run = 0; run < RUNS; run++) {
    for (const finding of runModel(state, club, new Rng(`check:${level}:${run}`))) {
      const player = state.players[finding.playerId]
      if (!player) continue
      names++
      confidence += finding.confidence
      // The truth the model cannot see: what he is genuinely worth to us
      // against what the market wants for him.
      const trueEdge = modelValuation(state, player, club) - player.value
      if (trueEdge > 0) right++
      else wrong++
    }
  }

  const total = right + wrong
  console.log(
    String(level).padStart(5)
    + `${Math.round(modelNoise(level) * 100)}%`.padStart(13)
    + String(shortlistSize(level)).padStart(8)
    + String(right).padStart(8) + String(wrong).padStart(8)
    + `${total ? Math.round((right / total) * 100) : 0}%`.padStart(11)
    + `${names ? Math.round((confidence / names) * 100) : 0}%`.padStart(18),
  )
}
