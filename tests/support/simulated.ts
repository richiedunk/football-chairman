import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import type { GameState } from '../../src/engine/types'

/**
 * A world that has already been through several seasons, cached between runs.
 *
 * A multi-season simulation is the only thing that catches a slow drain — a
 * squad falling from twenty-six players to twelve over four seasons shows up
 * in nothing shorter — so those tests have to exist. They are also, by a
 * distance, the most expensive thing in the suite: one of them was 138 seconds
 * of a 224-second run, which is most of the wait between making a change and
 * finding out whether it worked.
 *
 * The result of a simulation is a pure function of the engine and the seed. So
 * it is cached on disk against a hash of every file under `src/engine`, and
 * thrown away the moment any of them changes. Edit the engine and the test
 * runs for real; edit a component, a stylesheet or another test and it loads
 * a world it has already paid for.
 *
 * **This is a cache, not a fixture.** Nothing is committed and nothing is
 * asserted against a stored value — the assertions still run in full against a
 * real simulated world every time the engine moves. The only thing being
 * skipped is repeating work whose inputs are unchanged.
 */

const CACHE_DIR = path.join(process.cwd(), 'node_modules', '.cache', 'dof-sim')

let engineHash: string | null = null

/** A fingerprint of everything that could change what a simulation produces. */
function hashEngine(): string {
  if (engineHash) return engineHash
  const root = path.join(process.cwd(), 'src', 'engine')
  const hash = crypto.createHash('sha1')

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.ts')) {
        hash.update(entry.name)
        hash.update(fs.readFileSync(full))
      }
    }
  }

  walk(root)
  engineHash = hash.digest('hex').slice(0, 16)
  return engineHash
}

/**
 * Run `build` and keep the world it produced, or hand back the one from last
 * time if the engine has not changed since.
 *
 * `key` names the scenario, not the file — two tests wanting the same six
 * seasons from the same seed should share a key and pay for it once.
 */
export function simulatedWorld(key: string, build: () => GameState): GameState {
  return simulated(key, build)
}

/**
 * The same, for anything a test needs rather than only a world.
 *
 * Some tests care about what happened during the run — how many times a
 * director was sacked, what his age was at two points — rather than about the
 * world at the end of it. Whatever `build` returns is cached, as long as it
 * survives a round trip through JSON, which is the same rule the save format
 * already lives by.
 */
export function simulated<T>(key: string, build: () => T): T {
  // Gzipped: a simulated world is 28MB of JSON and a dozen of these would eat
  // a container's disk allowance. It compresses about fourteen to one, and
  // unzipping costs less than a tenth of what parsing does.
  const file = path.join(CACHE_DIR, `${key}-${hashEngine()}.json.gz`)

  if (fs.existsSync(file)) {
    try {
      return JSON.parse(gunzipSync(fs.readFileSync(file)).toString('utf8')) as T
    } catch {
      // A truncated or half-written cache is not worth diagnosing: throw it
      // away and simulate, which is what would have happened anyway.
      fs.rmSync(file, { force: true })
    }
  }

  const value = build()

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    // Written beside and moved into place, so a run interrupted mid-write
    // cannot leave a half a world behind for the next one to read.
    const temp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(temp, gzipSync(JSON.stringify(value)))
    fs.renameSync(temp, file)
    // Anything from an older engine is dead weight now.
    for (const name of fs.readdirSync(CACHE_DIR)) {
      if (name.startsWith(`${key}-`) && !name.startsWith(`${key}-${hashEngine()}`)) {
        fs.rmSync(path.join(CACHE_DIR, name), { force: true })
      }
    }
  } catch {
    // A cache that cannot be written is a slow test, not a failing one.
  }

  return value
}
