import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { compress, decompress } from '../src/storage/adapter'

const setup = prepareNewGame({
  seed: 'SAVE01', directorName: 'R. Dunk', background: 'scout',
  worldSize: 'standard', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)
for (let i=0;i<20;i++) advanceWeek(state, { ids: setup.ids, names: setup.names })

const json = JSON.stringify(state)
const t0 = Date.now()
const packed = await compress(json)
const t1 = Date.now()
const back = await decompress(packed)
const t2 = Date.now()

console.log(`world size: standard — ${Object.keys(state.clubs).length} clubs, ${Object.keys(state.players).length} players`)
console.log(`raw JSON       ${(json.length/1024/1024).toFixed(2)} MB`)
console.log(`gzipped        ${(packed.length/1024/1024).toFixed(2)} MB  (${(100-packed.length/json.length*100).toFixed(1)}% smaller)`)
console.log(`base64 in LS   ${(packed.length*1.34/1024/1024).toFixed(2)} MB`)
console.log(`compress ${t1-t0}ms, decompress ${t2-t1}ms`)
console.log(`round-trip identical: ${back === json}`)
const restored = JSON.parse(back)
console.log(`restored: ${restored.clubs[restored.playerClubId].name}, week ${restored.date.week}, players ${Object.keys(restored.players).length}`)
