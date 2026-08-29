import { SAVE_VERSION, type GameState } from '../engine/types'
import { autoRegister } from '../engine/systems/registration'
import { clearRatingCache } from '../engine/world/attributes'
import { levelFor } from '../engine/systems/career'
import { createStorageAdapter, type SaveSlotMeta, type StorageAdapter } from './adapter'
import { compressAsync, decompressAsync } from './compression'

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

export async function listSaves(): Promise<SaveSlotMeta[]> {
  return adapter.list()
}

export async function saveGame(
  state: GameState,
  slotId: string,
  name?: string,
): Promise<SaveSlotMeta> {
  state.savedAt = Date.now()
  const json = JSON.stringify(state)
  const data = await compressAsync(json)

  const club = state.clubs[state.playerClubId]
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
  const migrated = migrate(state)

  // The rating cache is derived data keyed by player id, and player ids are
  // only unique within a save. Loading without clearing it would let one
  // save's ratings leak into another.
  clearRatingCache()
  return migrated
}

export async function deleteSave(slotId: string): Promise<void> {
  await adapter.remove(slotId)
}

export async function storageQuota(): Promise<{ used: number; available: number } | null> {
  return adapter.quota()
}

function defaultSaveName(state: GameState): string {
  const club = state.clubs[state.playerClubId]
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

  state.version = SAVE_VERSION
  return state
}

/** Export a save as a downloadable JSON blob, for backup or sharing a seed. */
export async function exportSave(state: GameState): Promise<Blob> {
  return new Blob([JSON.stringify(state)], { type: 'application/json' })
}

export async function importSave(file: File): Promise<GameState> {
  const text = await file.text()
  const state = JSON.parse(text) as GameState
  if (typeof state.version !== 'number' || !state.players) {
    throw new Error('That file is not a Director of Football save.')
  }
  clearRatingCache()
  return migrate(state)
}
