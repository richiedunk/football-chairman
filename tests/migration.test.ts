import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import {
  backupSlotId, deleteSave, exportSave, firstIntegrityProblem, importSave, listBackups, listSaves,
  loadGame, saveGame,
} from '../src/storage/saves'
import { SAVE_VERSION, type GameState } from '../src/engine/types'

/**
 * The migration safety net.
 *
 * `migrate()` had six version steps and not one test exercised any of them.
 * Every one is code that runs against data no test ever saw, on somebody
 * else's career, exactly once, and a mistake in it costs a forty-season save.
 *
 * **What these fixtures are, honestly.** They are not real historical saves —
 * there is no build of this game old enough to have written one. Each is a
 * current save with exactly the fields a given version's migration adds
 * stripped back out, which is the shape that version's code is written to
 * repair. That proves every branch runs and produces a world the game can
 * load. It cannot prove the stripped shape matches what a real v3 save looked
 * like in every other respect. When a genuinely old save turns up, keep it.
 */

let base: GameState

beforeAll(() => {
  const setup = prepareNewGame({
    seed: 'MIGRATE', directorName: 'T', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  base = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
}, 180_000)

/** A save as it would have looked at `version`, before later fields existed. */
function stripToVersion(state: GameState, version: number): GameState {
  const s = JSON.parse(JSON.stringify(state)) as GameState

  if (version < 8) {
    for (const id of Object.keys(s.cups)) {
      if (s.cups[id].type === 'continental') delete s.cups[id]
    }
  }
  if (version < 7) delete (s.director as { age?: number }).age
  if (version < 6) delete (s as { takeovers?: unknown }).takeovers
  if (version < 5) {
    for (const club of Object.values(s.clubs)) {
      delete (club.board as { owner?: unknown }).owner
      delete (club.board as { graceUntilSeason?: unknown }).graceUntilSeason
    }
  }
  if (version < 4) {
    for (const player of Object.values(s.players)) {
      delete (player as { bookValue?: number }).bookValue
      delete (player as { amortisationCharge?: number }).amortisationCharge
    }
    for (const club of Object.values(s.clubs)) {
      delete (club.finances as { regulation?: unknown }).regulation
      for (const ledger of [club.finances.season, club.finances.lastSeason]) {
        if (!ledger) continue
        delete (ledger as { amortisation?: number }).amortisation
        delete (ledger as { playerTradingProfit?: number }).playerTradingProfit
      }
    }
  }
  if (version < 3) {
    for (const player of Object.values(s.players)) {
      delete (player as { weeksUnattached?: number }).weeksUnattached
    }
  }
  if (version < 2) {
    for (const player of Object.values(s.players)) {
      delete (player as { trainingYears?: unknown }).trainingYears
    }
    for (const club of Object.values(s.clubs)) {
      delete (club as { registeredIds?: unknown }).registeredIds
    }
  }

  s.version = version
  return s
}

async function loadFrom(version: number, slotId: string): Promise<GameState> {
  const old = stripToVersion(base, version)
  await saveGame(old, slotId)
  const loaded = await loadGame(slotId)
  expect(loaded, `v${version} would not load at all`).toBeTruthy()
  return loaded!
}

const HISTORICAL = [1, 2, 3, 4, 5, 6, 7]

describe('every historical format still loads', () => {
  for (const version of HISTORICAL) {
    it(`brings a v${version} save up to date`, async () => {
      const slot = `mig-${version}`
      const loaded = await loadFrom(version, slot)
      expect(loaded.version).toBe(SAVE_VERSION)
      expect(firstIntegrityProblem(loaded), `v${version} migrated to something broken`).toBeNull()
      await deleteSave(slot)
    }, 60_000)
  }

  it('repairs what each step is actually for', async () => {
    const loaded = await loadFrom(1, 'mig-all')

    const player = Object.values(loaded.players)[0]
    expect(player.trainingYears, 'v2: no training history').toBeTruthy()
    expect(typeof player.weeksUnattached, 'v3: no unattached counter').toBe('number')
    expect(typeof player.bookValue, 'v4: no book value').toBe('number')

    const club = Object.values(loaded.clubs)[0]
    expect(Array.isArray(club.registeredIds), 'v2: no squad list').toBe(true)
    expect(club.finances.regulation, 'v4: no regulation record').toBeTruthy()
    expect(club.board.owner, 'v5: no owner').toBeTruthy()

    expect(Array.isArray(loaded.takeovers), 'v6: no takeover list').toBe(true)
    expect(typeof loaded.director.age, 'v7: director has no age').toBe('number')
    expect(
      Object.values(loaded.cups).some((c) => c.type === 'continental'),
      'v8: no continental competition',
    ).toBe(true)
    await deleteSave('mig-all')
  }, 60_000)

  it('refuses a save from a newer build rather than mangling it', async () => {
    const future = JSON.parse(JSON.stringify(base)) as GameState
    future.version = SAVE_VERSION + 1
    await saveGame(future, 'mig-future')
    await expect(loadGame('mig-future')).rejects.toThrow(/newer version/i)
    await deleteSave('mig-future')
  }, 60_000)
})

describe('the copy taken before migrating', () => {
  it('is kept, and still holds the format it came from', async () => {
    await loadFrom(5, 'mig-backup')

    const backups = await listBackups()
    const mine = backups.find((b) => b.id === backupSlotId('mig-backup', 5))
    expect(mine, 'no backup was taken').toBeTruthy()

    // The point of it: what comes back is the *old* save, not the new one.
    const restored = await loadGame(mine!.id)
    expect(restored).toBeTruthy()
    await deleteSave('mig-backup')
    await deleteSave(mine!.id)
  }, 60_000)

  it('is not offered as a save to continue', async () => {
    await loadFrom(6, 'mig-hidden')
    const visible = await listSaves()
    expect(visible.some((s) => s.id.startsWith('premigration:'))).toBe(false)
    expect(visible.some((s) => s.id === 'mig-hidden')).toBe(true)
    await deleteSave('mig-hidden')
    await deleteSave(backupSlotId('mig-hidden', 6))
  }, 60_000)

  it('is not taken when nothing needed migrating', async () => {
    await saveGame(base, 'mig-current')
    await loadGame('mig-current')
    const backups = await listBackups()
    expect(backups.some((b) => b.id.includes('mig-current'))).toBe(false)
    await deleteSave('mig-current')
  }, 60_000)
})

describe('the integrity check', () => {
  it('passes a sound save', () => {
    expect(firstIntegrityProblem(base)).toBeNull()
  })

  it('catches a world a migration has emptied', () => {
    const broken = { ...base, clubs: {} } as GameState
    expect(firstIntegrityProblem(broken)).toBe('no clubs')
  })

  it('catches being in charge of a club that is not there', () => {
    // The shape of bug that took 169 sackings to notice.
    const broken = { ...base, playerClubId: 'club_does_not_exist' } as GameState
    expect(firstIntegrityProblem(broken)).toMatch(/not in the world/)
  })

  it('catches a save left behind by its own migration', () => {
    const broken = { ...base, version: 3 } as GameState
    expect(firstIntegrityProblem(broken)).toBe('still at format 3')
  })

  it('accepts a director between jobs', () => {
    const jobless = { ...base, playerClubId: null } as GameState
    expect(firstIntegrityProblem(jobless)).toBeNull()
  })
})

describe('taking a career off the device', () => {
  it('exports and imports the same career', async () => {
    const blob = await exportSave(base)
    const file = new File([blob], 'career.dof')
    const back = await importSave(file)

    expect(back.version).toBe(SAVE_VERSION)
    expect(back.seed).toBe(base.seed)
    expect(Object.keys(back.clubs).length).toBe(Object.keys(base.clubs).length)
    expect(back.playerClubId).toBe(base.playerClubId)
    expect(firstIntegrityProblem(back)).toBeNull()
  }, 60_000)

  it('exports compressed, not raw JSON', async () => {
    // Uncompressed this is a 50 MB download for a 5 MB save.
    const blob = await exportSave(base)
    const raw = JSON.stringify(base).length
    expect(blob.size).toBeLessThan(raw / 2)
  }, 60_000)

  it('still reads an uncompressed career file', async () => {
    const file = new File([JSON.stringify(base)], 'career.json')
    const back = await importSave(file)
    expect(back.seed).toBe(base.seed)
  }, 60_000)

  it('migrates an old career file on the way in', async () => {
    const old = stripToVersion(base, 3)
    const file = new File([JSON.stringify(old)], 'old.json')
    const back = await importSave(file)
    expect(back.version).toBe(SAVE_VERSION)
    expect(firstIntegrityProblem(back)).toBeNull()
  }, 60_000)

  it('refuses something that is not a career at all', async () => {
    const file = new File(['this is not a save'], 'notes.txt')
    await expect(importSave(file)).rejects.toThrow(/not a Director of Football/i)
  })
})
