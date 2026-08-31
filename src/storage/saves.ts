import { SAVE_VERSION, type GameState } from '../engine/types'
import { autoRegister } from '../engine/systems/registration'
import { createOwner, ownerName, startingOwnerKind } from '../engine/systems/ownership'
import { Rng } from '../engine/rng'
import { clearRatingCache } from '../engine/world/attributes'
import { levelFor } from '../engine/systems/career'
import { createStorageAdapter, type SaveSlotMeta, type StorageAdapter } from './adapter'
import { compressAsync, decompressAsync } from './compression'
import { RETIREMENT_AGE, STARTING_AGE } from '../engine/systems/directorCareer'
import { playerClub } from '../engine/playerClub'
import { IdFactory } from '../engine/ids'
import {
  createContinentalCups, refreshContinentalEntrants, stripUnplayablePlaces,
} from '../engine/systems/continental'
import { inferPhilosophy } from '../engine/systems/recruitment'

/**
 * Save and load.
 *
 * The GameState is a plain serialisable graph by construction, so saving is
 * `JSON.stringify` plus gzip. What this module adds is slot management, the
 * denormalised metadata the load screen needs without decompressing every
 * save, and the migration hook for when the format inevitably changes.
 */

export const AUTOSAVE_SLOT = 'autosave'

let adapter: StorageAdapter = createStorageAdapter()

/** Override the adapter — used by tests. */
export function setStorageAdapter(next: StorageAdapter): void {
  adapter = next
}

export function storageName(): string {
  return adapter.name
}

/**
 * Slot id for the untouched copy taken before a save is migrated.
 *
 * Prefixed rather than suffixed so a backup sorts away from the save it came
 * from and can never be mistaken for one — `listSaves` filters them out, and
 * `listBackups` is how the UI would offer one back.
 */
export const BACKUP_PREFIX = 'premigration:'

export function backupSlotId(slotId: string, fromVersion: number): string {
  return `${BACKUP_PREFIX}${slotId}:v${fromVersion}`
}

export function isBackupSlot(id: string): boolean {
  return id.startsWith(BACKUP_PREFIX)
}

export async function listSaves(): Promise<SaveSlotMeta[]> {
  return (await adapter.list()).filter((slot) => !isBackupSlot(slot.id))
}

/** Pre-migration copies, newest first. */
export async function listBackups(): Promise<SaveSlotMeta[]> {
  return (await adapter.list())
    .filter((slot) => isBackupSlot(slot.id))
    .sort((a, b) => b.savedAt - a.savedAt)
}

export async function saveGame(
  state: GameState,
  slotId: string,
  name?: string,
): Promise<SaveSlotMeta> {
  state.savedAt = Date.now()
  const json = JSON.stringify(state)
  const data = await compressAsync(json)

  const club = playerClub(state)
  const league = club ? state.leagues[club.leagueId] : null

  const meta: SaveSlotMeta = {
    id: slotId,
    name: name ?? defaultSaveName(state),
    savedAt: state.savedAt,
    size: json.length,
    summary: {
      directorName: state.director.name,
      clubName: club?.name ?? 'Unemployed',
      leagueName: league?.name ?? '',
      season: state.date.season,
      week: state.date.week,
      level: levelFor(state.director.xp).level,
      xp: state.director.xp,
    },
  }

  await adapter.write(slotId, data, meta)
  return meta
}

export async function loadGame(slotId: string): Promise<GameState | null> {
  const data = await adapter.read(slotId)
  if (!data) return null

  const json = await decompressAsync(data)
  const state = JSON.parse(json) as GameState

  // Keep the original before touching it.
  //
  // A migration that throws leaves the slot alone, so that case was never the
  // danger. The danger is a migration that *succeeds* and is wrong: the game
  // carries on, autosaves over the slot within the week, and the last good
  // copy of a forty-season career is gone with nothing to go back to. So the
  // untouched bytes are put aside the moment we know the format has moved,
  // before anything is changed and before anything can overwrite them.
  const fromVersion = state.version
  if (typeof fromVersion === 'number' && fromVersion < SAVE_VERSION) {
    await writeBackup(slotId, fromVersion, data, state)
  }

  const migrated = migrate(state)

  // A migration is code that runs against data no test ever saw, on somebody
  // else's career, once. If it produced something the game cannot run, say so
  // here rather than handing a broken world to the UI and failing somewhere
  // less legible three screens later — the backup above is the way back.
  const problem = firstIntegrityProblem(migrated)
  if (problem) {
    throw new Error(
      `This save could not be brought up to date (${problem}). `
      + 'The version before the attempt has been kept.',
    )
  }

  // The rating cache is derived data keyed by player id, and player ids are
  // only unique within a save. Loading without clearing it would let one
  // save's ratings leak into another.
  clearRatingCache()
  return migrated
}

export async function deleteSave(slotId: string): Promise<void> {
  await adapter.remove(slotId)
}

/**
 * Put the untouched bytes aside under a backup id.
 *
 * Failing to take a backup must never stop a save loading — a full disk is a
 * reason to play on without a safety net, not a reason to be locked out of
 * your own career — so this swallows its own errors deliberately.
 */
async function writeBackup(
  slotId: string,
  fromVersion: number,
  data: Uint8Array,
  state: GameState,
): Promise<void> {
  const id = backupSlotId(slotId, fromVersion)
  try {
    if (await adapter.read(id)) return // already kept from an earlier attempt
    const club = playerClub(state)
    await adapter.write(id, data, {
      id,
      name: `Before update to format ${SAVE_VERSION}`,
      savedAt: Date.now(),
      size: data.length,
      summary: {
        directorName: state.director?.name ?? 'Unknown',
        clubName: club?.name ?? 'Unemployed',
        leagueName: club ? state.leagues[club.leagueId]?.name ?? '' : '',
        season: state.date?.season ?? 0,
        week: state.date?.week ?? 0,
        level: state.director?.level ?? 1,
        xp: state.director?.xp ?? 0,
      },
    })
  } catch {
    // Deliberately silent: see above.
  }
}

/**
 * The first thing wrong with a migrated save, or null if it is sound.
 *
 * Deliberately a short list of things whose absence makes the game
 * unplayable rather than a schema check. A migration that drops a field the
 * UI reads is a bug to find in a test; a migration that leaves no clubs is a
 * bug to catch before the player sees it.
 */
export function firstIntegrityProblem(state: GameState): string | null {
  if (!state || typeof state !== 'object') return 'the save is not a game'
  if (typeof state.version !== 'number') return 'no format version'
  if (state.version !== SAVE_VERSION) return `still at format ${state.version}`
  for (const key of ['clubs', 'players', 'leagues', 'nations', 'cups'] as const) {
    if (!state[key] || typeof state[key] !== 'object') return `no ${key}`
  }
  if (Object.keys(state.clubs).length === 0) return 'no clubs'
  if (Object.keys(state.leagues).length === 0) return 'no leagues'
  if (!Array.isArray(state.fixtures)) return 'no fixture list'
  if (!state.date || typeof state.date.season !== 'number') return 'no date'
  if (!state.director || typeof state.director.name !== 'string') return 'no director'

  // The one cross-reference worth checking: being in charge of a club that is
  // not in the world is the shape of bug that took 169 sackings to notice.
  if (state.playerClubId !== null && state.playerClubId !== undefined
    && !state.clubs[state.playerClubId]) {
    return 'in charge of a club that is not in the world'
  }
  return null
}

export async function storageQuota(): Promise<{ used: number; available: number } | null> {
  return adapter.quota()
}

function defaultSaveName(state: GameState): string {
  const club = playerClub(state)
  return club
    ? `${club.shortName} — ${state.date.season}/${String((state.date.season + 1) % 100).padStart(2, '0')}`
    : `${state.director.name} — unemployed`
}

/**
 * Migrate an older save to the current format.
 *
 * Kept explicit and additive: each version bump gets its own block, and a save
 * from any earlier version walks forward through all of them. Throwing away a
 * player's forty-season career because a field was renamed is not acceptable.
 */
function migrate(state: GameState): GameState {
  if (state.version === SAVE_VERSION) return state

  if (state.version > SAVE_VERSION) {
    throw new Error(
      `This save was created by a newer version of the game (format ${state.version}, this build reads ${SAVE_VERSION}).`,
    )
  }

  // Migrations go here, in ascending order.

  // v2: squad registration. Older saves have neither training histories nor
  // squad lists, so both are reconstructed: nationality is the best available
  // proxy for where a player was trained, and every club is then given a
  // legal list built from its actual squad.
  if (state.version < 2) {
    for (const player of Object.values(state.players)) {
      if (!player.trainingYears) player.trainingYears = { [player.nationalityId]: 3 }
    }
    for (const club of Object.values(state.clubs)) {
      if (!club.registeredIds) club.registeredIds = []
      autoRegister(state, club)
    }
    state.version = 2
  }

  // v3: free agents keep track of how long nobody has called, which is what
  // lets an ageing player climb down the pyramid instead of vanishing.
  if (state.version < 3) {
    for (const player of Object.values(state.players)) {
      if (typeof player.weeksUnattached !== 'number') player.weeksUnattached = 0
    }
    state.version = 3
  }

  // v4: transfer-fee amortisation and financial regulation. An older save has
  // fees booked as lump sums with no book value left to write down, so every
  // player is treated as fully amortised — which is both the safe reading and
  // very nearly the true one for anyone signed more than a season ago.
  if (state.version < 4) {
    for (const player of Object.values(state.players)) {
      if (typeof player.bookValue !== 'number') player.bookValue = 0
      if (typeof player.amortisationCharge !== 'number') player.amortisationCharge = 0
    }
    for (const club of Object.values(state.clubs)) {
      if (!club.finances.regulation) {
        club.finances.regulation = {
          lastRatio: null, breachSeasons: 0, sanctions: [], pointsDeducted: 0,
        }
      }
      for (const ledger of [club.finances.season, club.finances.lastSeason]) {
        if (!ledger) continue
        if (typeof ledger.amortisation !== 'number') ledger.amortisation = 0
        if (typeof ledger.playerTradingProfit !== 'number') ledger.playerTradingProfit = 0
      }
    }
    state.version = 4
  }

  // v5: clubs have owners. An older save has boards with no explanation
  // behind them, so each club is given an owner sampled from what a club of
  // its standing would plausibly have, dated far enough back that nobody
  // appears to have just arrived.
  if (state.version < 5) {
    for (const club of Object.values(state.clubs)) {
      if (club.board.owner) continue
      const rng = new Rng(`${state.seed}:owner:${club.id}`)
      const kind = startingOwnerKind(rng, club.reputation)
      club.board.owner = createOwner(
        rng, kind, ownerName(rng, kind, 'The Board', { name: club.city, size: 50 }),
        state.date.season - rng.int(2, 12),
      )
      club.board.graceUntilSeason = null
    }
    state.version = 5
  }

  // v6: takeovers in progress are carried on the state rather than derived.
  if (state.version < 6) {
    if (!Array.isArray(state.takeovers)) state.takeovers = []
    state.version = 6
  }

  // v7: the director has an age. An existing career is dated from how long it
  // has already run — the earliest career entry is the first season worked, so
  // a save five seasons old belongs to a thirty-five-year-old. Anyone already
  // past sixty-five is held at sixty-five rather than retired on load: ending
  // somebody's save as they open it is a rotten way to meet a new rule.
  if (state.version < 7) {
    const d = state.director
    if (typeof d.age !== 'number') {
      const firstSeason = d.careerHistory.reduce(
        (earliest, entry) => Math.min(earliest, entry.fromSeason),
        state.date.season,
      )
      const seasonsWorked = Math.max(0, state.date.season - firstSeason)
      d.age = Math.min(RETIREMENT_AGE, STARTING_AGE + seasonsWorked)
    }
    state.version = 7
  }

  // v8: continental competition. Older saves have leagues awarding
  // qualification places and no competition to award them to, so the
  // competitions are created and the field drawn from the tables as they
  // stand. A save reloaded mid-season joins the current campaign at whatever
  // round it has reached rather than being given a season that has already
  // been half played, which is why the cups are created but not reset.
  if (state.version < 8) {
    const hasContinental = Object.values(state.cups)
      .some((cup) => cup.type === 'continental')
    if (!hasContinental) {
      stripUnplayablePlaces(state)
      createContinentalCups(state, new IdFactory(state.nextId))
      refreshContinentalEntrants(state)
      // `createContinentalCups` consumed ids, so the save's counter has to
      // move with them or the next new object collides with a cup.
      state.nextId = Math.max(state.nextId, highestId(state) + 1)
    }
    state.version = 8
  }

  // v9: recruitment policy. Every club states one, inferred from the dials it
  // already carries rather than assigned at random — a club generated to sign
  // young and sell has been a develop-and-sell club all along, and telling it
  // otherwise on load would rewrite a squad the player knows.
  if (state.version < 9) {
    for (const club of Object.values(state.clubs)) {
      if (club.strategy.philosophy) continue
      club.strategy.philosophy = inferPhilosophy(club)
      club.strategy.philosophySince = 0
    }
    state.version = 9
  }

  // v10: buy-back clauses. Nobody has one in a save made before they existed,
  // and inventing them retrospectively would hand the player rights over
  // players he sold under different rules.
  if (state.version < 10) {
    for (const player of Object.values(state.players)) {
      if (player.buyBack === undefined) player.buyBack = null
    }
    state.version = 10
  }

  state.version = SAVE_VERSION
  return state
}

/** The largest numeric id in use, so a migration that mints ids cannot collide. */
function highestId(state: GameState): number {
  let highest = 0
  for (const cup of Object.values(state.cups)) {
    const n = Number(cup.id.replace(/^\D+/, ''))
    if (Number.isFinite(n)) highest = Math.max(highest, n)
  }
  return highest
}

/**
 * Export a career as a file the player can keep.
 *
 * Compressed, the same as the copy on the device. Uncompressed this is a 50 MB
 * download where the save itself is 5 MB, which is a rotten thing to hand
 * somebody over a phone connection to save a career that fits in a photo.
 */
export async function exportSave(state: GameState): Promise<Blob> {
  const packed = await compressAsync(JSON.stringify(state))
  return new Blob([packed as BlobPart], { type: 'application/octet-stream' })
}

export async function importSave(file: File): Promise<GameState> {
  const bytes = new Uint8Array(await file.arrayBuffer())

  // Accept either shape. Exports are compressed, but a file someone has
  // unzipped, or produced by hand, should still load — and telling a player
  // their own career file is "not a save" because of the wrapper would be a
  // poor way to find out.
  let text: string
  try {
    text = await decompressAsync(bytes)
  } catch {
    text = new TextDecoder().decode(bytes)
  }

  let state: GameState
  try {
    state = JSON.parse(text) as GameState
  } catch {
    throw new Error('That file is not a Director of Football career.')
  }
  if (typeof state.version !== 'number' || !state.players) {
    throw new Error('That file is not a Director of Football career.')
  }
  clearRatingCache()
  const migrated = migrate(state)
  const problem = firstIntegrityProblem(migrated)
  if (problem) throw new Error(`That career file could not be read (${problem}).`)
  return migrated
}
