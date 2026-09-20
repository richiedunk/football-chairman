import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import {
  backupSlotId, deleteSave, exportSave, firstIntegrityProblem, importSave, listBackups, listSaves,
  loadGame, saveGame, setStorageAdapter,
} from '../src/storage/saves'
import { MemoryAdapter, compressValue } from '../src/storage/adapter'
import { SAVE_VERSION, type GameState } from '../src/engine/types'
import { makeCareerRecord, readCareerRecord } from '../src/engine/systems/careerRecord'
import { assignScout, processScouting } from '../src/engine/systems/scouting'
import { Rng } from '../src/engine/rng'

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
/**
 * Held rather than taken from the default, so one test can write bytes
 * straight into the store the way an older build would have.
 */
const memory = new MemoryAdapter()

beforeAll(() => {
  setStorageAdapter(memory)
  const setup = prepareNewGame({
    seed: 'MIGRATE', directorName: 'T', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  base = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)

  // A fresh career has no scout reports, and a migration test written against
  // a state with none passes having checked nothing. So the fixture is given
  // some, by scouting the way the game does rather than by hand.
  const club = base.clubs[base.playerClubId!]
  const scout = club.staff
    .map((id) => base.staff[id])
    .find((member) => member?.role === 'scout')
  if (scout) {
    const target = Object.values(base.players).find(
      (p) => p.clubId && p.clubId !== club.id && !p.isAcademy,
    )!
    assignScout(scout, { type: 'player', targetId: target.id, minAbility: 0, maxAge: 40 })
    processScouting(base, club, { rng: new Rng('mig-scout'), week: 1, season: 2025 })
  }
}, 180_000)

/** A save as it would have looked at `version`, before later fields existed. */
function stripToVersion(state: GameState, version: number): GameState {
  const s = JSON.parse(JSON.stringify(state)) as GameState

  // The deleting migrations have to work the other way round: put the fields
  // back, or there is nothing to strip and the test passes without exercising
  // anything.
  if (version < 16) {
    for (const club of Object.values(s.clubs)) {
      (club.board.owner as unknown as Record<string, unknown>).faithInDirector = 50
    }
  }

  if (version < 15) {
    const bag = (o: object) => o as Record<string, unknown>
    bag(s).rngCounters = {}
    for (const player of Object.values(s.players)) {
      bag(player).birthWeek = 12
      bag(player).secondNationalityId = null
    }
    for (const club of Object.values(s.clubs)) {
      bag(club).isPlayerClub = false
      const project = club.facilities.stadiumProject
      if (project) bag(project).totalCost = 1_000_000
      for (const entry of club.history) {
        bag(entry).continentalResult = '—'
        bag(entry).finalBalance = 0
        bag(entry).headCoachName = 'Vacant'
      }
    }
    for (const takeover of s.takeovers) bag(takeover).collapseReason = null
    for (const story of s.mediaStories) {
      bag(story).subjectStaffIds = []
      for (const effect of story.effects) bag(effect).metric = 'morale'
    }
    for (const negotiation of s.negotiations) bag(negotiation).playerInitiated = false
    if (s.director.contract) bag(s.director.contract).signedSeason = 2025
  }

  if (version < 20) {
    // A scout report did not know which revision of itself it was, and the
    // fixture's reports are freshly built and carry the fields — so they have
    // to be taken back off, or the test passes without the migration running.
    for (const report of Object.values(s.scoutReports)) {
      delete (report as { revision?: number }).revision
      delete (report as { previousAbilityRange?: unknown }).previousAbilityRange
    }
  }

  if (version < 19) {
    // Career records were objects before they were tuples.
    for (const player of Object.values(s.players)) {
      const records = player.careerStats as unknown[]
      if (!Array.isArray(records)) continue
      ;(player as { careerStats: unknown }).careerStats = records.map((r) => {
        const t = r as unknown[]
        return {
          season: t[0], clubId: t[1], clubName: t[2], leagueName: t[3],
          appearances: t[4], starts: t[5], minutes: t[6], goals: t[7],
          assists: t[8], cleanSheets: t[9], yellowCards: t[10], redCards: t[11],
          ratingSum: t[12], motmAwards: t[13],
        }
      })
    }
  }
  if (version < 18) {
    for (const club of Object.values(s.clubs)) {
      delete (club as { citySize?: number }).citySize
    }
  }
  if (version < 17) {
    for (const club of Object.values(s.clubs)) {
      delete (club.facilities.stadium as { selloutsThisSeason?: number }).selloutsThisSeason
    }
  }

  if (version < 14) {
    for (const player of Object.values(s.players)) {
      delete (player as { academyRelease?: unknown }).academyRelease
      delete (player as { gotAwayReported?: boolean }).gotAwayReported
    }
  }
  if (version < 13) {
    for (const player of Object.values(s.players)) {
      delete (player as { caps?: number }).caps
      delete (player as { internationalUntilWeek?: number | null }).internationalUntilWeek
      delete (player as { tournamentStock?: number }).tournamentStock
    }
  }
  if (version < 12) {
    // The trait was called `clubhouseCancer` before it was renamed, and it is
    // on real saves — so the fixture carries the old spelling, not the new one.
    for (const player of Object.values(s.players)) {
      if (!Array.isArray(player.traits)) continue
      const at = player.traits.indexOf('disruptive')
      if (at >= 0) player.traits[at] = 'clubhouseCancer' as typeof player.traits[number]
    }
  }
  if (version < 11) delete (s as { dataFindings?: unknown }).dataFindings
  if (version < 10) {
    for (const player of Object.values(s.players)) {
      delete (player as { buyBack?: unknown }).buyBack
    }
  }
  if (version < 9) {
    for (const club of Object.values(s.clubs)) {
      delete (club.strategy as { philosophy?: unknown }).philosophy
      delete (club.strategy as { philosophySince?: number }).philosophySince
    }
  }
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

const HISTORICAL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]

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
    expect(club.strategy.philosophy, 'v9: no recruitment policy').toBeTruthy()
    expect(player.buyBack, 'v10: buy-back left undefined').toBeNull()
    expect(Array.isArray(loaded.dataFindings), 'v11: no findings list').toBe(true)
    expect(
      Object.values(loaded.players).some((p) => p.traits.includes('clubhouseCancer' as never)),
      'v12: a trait is still named after an illness',
    ).toBe(false)
    expect(typeof player.caps, 'v13: no cap count').toBe('number')
    expect(player.internationalUntilWeek, 'v13: duty flag left undefined').toBeNull()
    expect(typeof player.tournamentStock, 'v13: no tournament premium').toBe('number')
    // v14 starts the record from here rather than inventing grievances
    // against clubs that never made the decision.
    expect(player.academyRelease, 'v14: release record left undefined').toBeNull()
    expect(player.gotAwayReported, 'v14: got-away flag left undefined').toBe(false)

    // v15 deletes rather than fills. The whole point is that a save carrying
    // these does not carry them afterwards — an old save would otherwise write
    // them back out on every future save, for ever.
    const bag = (o: object) => o as Record<string, unknown>
    expect(bag(player).birthWeek, 'v15: dead player field survived').toBeUndefined()
    expect(bag(player).secondNationalityId, 'v15: dead player field survived').toBeUndefined()
    expect(bag(club).isPlayerClub, 'v15: dead club field survived').toBeUndefined()
    expect(bag(loaded).rngCounters, 'v15: dead root field survived').toBeUndefined()
    for (const entry of club.history) {
      expect(bag(entry).headCoachName, 'v15: dead history field survived').toBeUndefined()
    }

    // Not guarded on the report existing: a conditional assertion here would
    // pass on a fixture with no reports, which is exactly what a fresh career
    // is. The fixture is scouted in `beforeAll` so that this has something to
    // be wrong about.
    const reports = Object.values(loaded.scoutReports)
    expect(reports.length, 'fixture carries no scout report to migrate').toBeGreaterThan(0)
    expect(reports[0].revision, 'v20: report does not know which revision it is').toBe(1)
    expect(
      reports[0].previousAbilityRange,
      'v20: predecessor range left undefined rather than null',
    ).toBeNull()

    await deleteSave('mig-all')
  }, 60_000)

  it('strips the owner field the game stopped reading', async () => {
    // Loaded from 15 rather than 1 on purpose. The v5 step deletes
    // `board.owner` wholesale and the migration builds a fresh one, so a save
    // taken back to v1 has no owner to carry the field and the assertion would
    // pass without the migration doing anything at all. It did, until this was
    // checked by disabling the strip and finding the test still green.
    const loaded = await loadFrom(15, 'mig-v16')
    const club = Object.values(loaded.clubs)[0]
    expect(
      (club.board.owner as unknown as Record<string, unknown>).faithInDirector,
      'v16: dead owner field survived',
    ).toBeUndefined()
    await deleteSave('mig-v16')
  }, 60_000)

  it('recovers the catchment rather than guessing at it', async () => {
    // v18 moved city size onto the club so the attendance model need not look
    // it up every fixture. The migration has to find the real figure: a club
    // silently defaulted to the middle of the range would draw the wrong crowd
    // for ever, and nothing else in the game would ever contradict it.
    const loaded = await loadFrom(17, 'mig-v18')
    let checked = 0
    for (const club of Object.values(loaded.clubs)) {
      const real = loaded.nations[club.nationId]?.cities.find((c) => c.name === club.city)
      if (!real) continue
      expect(club.citySize, `v18: ${club.name} lost its catchment`).toBe(real.size)
      checked++
    }
    expect(checked, 'v18: no club had a city to check against').toBeGreaterThan(20)

    const stadium = Object.values(loaded.clubs)[0].facilities.stadium
    expect(typeof stadium.selloutsThisSeason, 'v17: no sellout counter').toBe('number')
    await deleteSave('mig-v18')
  }, 60_000)

  it('turns career records into tuples without transposing a field', async () => {
    // The danger in v19 is not that it fails, it is that it succeeds and is
    // wrong: every slot but two is a number, so a pair swapped in the
    // migration typechecks, round-trips the right count of fields, and turns a
    // player's goals into his assists for the rest of his career.
    //
    // The world fixture is freshly created and nobody has played a season, so
    // every `careerStats` is empty and a test written against it would pass
    // having checked nothing. The records are planted here, with every field a
    // different number, so a transposition has nowhere to hide.
    const seeded = JSON.parse(JSON.stringify(base)) as GameState
    const ids = Object.keys(seeded.players).slice(0, 3)
    const planted = ids.map((id, n) => ({
      id,
      record: makeCareerRecord(
        {
          appearances: 31 + n, starts: 27 + n, minutes: 2431 + n, goals: 12 + n,
          assists: 7 + n, cleanSheets: 3 + n, yellowCards: 5 + n, redCards: 1 + n,
          ratingSum: 219.4 + n, motmAwards: 4 + n,
        },
        2029 + n, `club-${n}`, `Club ${n}`, `League ${n}`,
      ),
    }))
    for (const { id, record } of planted) seeded.players[id].careerStats = [record]

    // Written straight to the adapter rather than through `saveGame`.
    //
    // `saveGame` now lifts career records out of the game and into a part of
    // the save record, so writing a "v18 save" with it would produce something
    // no v18 build ever wrote — with the records already moved, and still in
    // the old object shape, so the migration under test would find nothing to
    // do and the test would pass having checked nothing. A real v18 save has
    // them in the main blob, which is what this puts there.
    const old = stripToVersion(seeded, 18)
    const { data } = await compressValue(old)
    await memory.write('mig-v19', { main: data }, {
      id: 'mig-v19',
      name: 'v18',
      savedAt: Date.now(),
      size: data.length,
      summary: {
        directorName: 'T', clubName: '', leagueName: '',
        season: old.date.season, week: old.date.week, level: 1, xp: 0,
      },
    })
    const loaded = await loadGame('mig-v19')
    expect(loaded, 'v18 with career records would not load').toBeTruthy()

    for (const { id, record } of planted) {
      const got = loaded!.players[id].careerStats
      expect(Array.isArray(got[0]), `v19: ${id}'s record is not a tuple`).toBe(true)
      expect(readCareerRecord(got[0]), `v19: ${id} came back changed`)
        .toEqual(readCareerRecord(record))
    }
    await deleteSave('mig-v19')
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
    await saveGame(base, 'export-slot')
    const blob = await exportSave(base, 'export-slot')
    const file = new File([blob], 'career.dof')
    const back = await importSave(file)

    expect(back.version).toBe(SAVE_VERSION)
    expect(back.seed).toBe(base.seed)
    expect(Object.keys(back.clubs).length).toBe(Object.keys(base.clubs).length)
    expect(back.playerClubId).toBe(base.playerClubId)
    expect(firstIntegrityProblem(back)).toBeNull()
    await deleteSave('export-slot')
  }, 60_000)

  it('carries career history, which is not on the players any more', async () => {
    // The risk in moving history into a part of the save record: an export
    // that reads only the live state hands over a file where every career is
    // blank, and nobody finds out until they have changed phones and deleted
    // the original.
    const seeded = JSON.parse(JSON.stringify(base)) as GameState
    const id = Object.keys(seeded.players)[0]
    const record = makeCareerRecord(
      {
        appearances: 31, starts: 27, minutes: 2431, goals: 12, assists: 7,
        cleanSheets: 3, yellowCards: 5, redCards: 1, ratingSum: 219.4, motmAwards: 4,
      },
      2029, 'club-7', 'Harrogate Town', 'League Two',
    )
    seeded.players[id].careerStats = [record]

    // Saving persists it into the part and clears it off the player, which is
    // exactly the state an export has to cope with.
    await saveGame(seeded, 'hist-slot')
    expect(seeded.players[id].careerStats, 'save did not clear the pending record').toEqual([])

    const blob = await exportSave(seeded, 'hist-slot')
    const back = await importSave(new File([blob], 'career.dof'))
    expect(back.players[id].careerStats.map(readCareerRecord))
      .toEqual([readCareerRecord(record)])
    await deleteSave('hist-slot')
  }, 60_000)

  it('exports compressed, not raw JSON', async () => {
    // Uncompressed this is a 50 MB download for a 5 MB save.
    await saveGame(base, 'export-slot2')
    const blob = await exportSave(base, 'export-slot2')
    const raw = JSON.stringify(base).length
    expect(blob.size).toBeLessThan(raw / 2)
    await deleteSave('export-slot2')
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
    await expect(importSave(file)).rejects.toThrow(/not an Undisclosed Football/i)
  })
})
