import { beforeEach, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import { makeCareerRecord, readCareerRecord } from '../src/engine/systems/careerRecord'
import { deleteSave, loadGame, saveGame, setStorageAdapter } from '../src/storage/saves'
import { careerOf, readHistory } from '../src/storage/careerHistory'
import { MemoryAdapter } from '../src/storage/adapter'
import type { GameState, PlayerSeasonStats } from '../src/engine/types'

/**
 * Career history lives beside the game rather than inside it, and is read only
 * when something asks.
 *
 * The bargain is that it stops being carried in memory and written on every
 * save. The risk is that it stops being carried at all — an append-only log
 * that the writer never reads back is a log that quietly truncates, and it
 * would truncate a forty-season career, once, on somebody else's phone.
 */
const STATS: PlayerSeasonStats = {
  appearances: 31, starts: 27, minutes: 2431, goals: 12, assists: 7,
  cleanSheets: 3, yellowCards: 5, redCards: 1, ratingSum: 219.4, motmAwards: 4,
}
const season = (n: number) =>
  makeCareerRecord({ ...STATS, goals: n }, 2020 + n, `club-${n}`, `Club ${n}`, `League ${n}`)

let adapter: MemoryAdapter
let base: GameState

beforeEach(() => {
  adapter = new MemoryAdapter()
  setStorageAdapter(adapter)
  const setup = prepareNewGame({
    seed: 'HIST', directorName: 'T', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  base = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
}, 180_000)

const clone = (s: GameState) => JSON.parse(JSON.stringify(s)) as GameState

describe('a career history kept beside the save', () => {
  it('survives a save and is not on the loaded player', async () => {
    const state = clone(base)
    const id = Object.keys(state.players)[0]
    state.players[id].careerStats = [season(1)]

    await saveGame(state, 'slot')
    const loaded = await loadGame('slot')

    // Off the player — that is the point, and the whole memory saving.
    expect(loaded!.players[id].careerStats).toEqual([])
    // But still there when asked for.
    expect((await careerOf(adapter, 'slot', id)).map(readCareerRecord))
      .toEqual([readCareerRecord(season(1))])
  }, 60_000)

  it('appends across seasons instead of replacing', async () => {
    // The failure this is really guarding: each save writes only what is
    // pending, so a writer that did not merge would leave one season behind
    // and lose everything before it.
    const state = clone(base)
    const id = Object.keys(state.players)[0]

    for (const n of [1, 2, 3]) {
      state.players[id].careerStats = [season(n)]
      await saveGame(state, 'slot')
    }

    const history = await careerOf(adapter, 'slot', id)
    expect(history.map((r) => readCareerRecord(r).goals)).toEqual([1, 2, 3])
  }, 60_000)

  it('keeps a save with nothing pending from touching the stored history', async () => {
    const state = clone(base)
    const id = Object.keys(state.players)[0]
    state.players[id].careerStats = [season(1)]
    await saveGame(state, 'slot')

    // Nothing pending now. Most saves look like this, and they must leave the
    // part alone rather than writing an empty one over it.
    await saveGame(state, 'slot')
    await saveGame(state, 'slot')

    expect((await careerOf(adapter, 'slot', id)).map(readCareerRecord))
      .toEqual([readCareerRecord(season(1))])
  }, 60_000)

  it('clears the pending records only once they are written', async () => {
    const state = clone(base)
    const id = Object.keys(state.players)[0]
    state.players[id].careerStats = [season(1)]
    await saveGame(state, 'slot')
    expect(state.players[id].careerStats).toEqual([])
  }, 60_000)

  it('caps a long career rather than growing without limit', async () => {
    const state = clone(base)
    const id = Object.keys(state.players)[0]
    for (let n = 1; n <= 30; n++) {
      state.players[id].careerStats = [season(n)]
      await saveGame(state, 'slot')
    }
    const history = await careerOf(adapter, 'slot', id)
    expect(history.length).toBe(25)
    // The oldest fall off the front, so the most recent season is kept.
    expect(readCareerRecord(history[history.length - 1]).goals).toBe(30)
  }, 120_000)

  it('takes the history away with the save', async () => {
    const state = clone(base)
    const id = Object.keys(state.players)[0]
    state.players[id].careerStats = [season(1)]
    await saveGame(state, 'slot')
    await deleteSave('slot')

    // A part left behind would be read back by whatever took the slot next.
    expect(await readHistory(adapter, 'slot')).toEqual({})
  }, 60_000)
})
