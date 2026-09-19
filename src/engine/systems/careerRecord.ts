import type { PlayerCareerRecord, PlayerCareerSeason, PlayerSeasonStats, ID } from '../types'

/**
 * Reading and writing a career record.
 *
 * `PlayerCareerRecord` is a tuple because it is 35% of the save and two thirds
 * of that was repeated field names — see the note on the type. A tuple is a
 * bad thing to index by hand, so nothing does: everything goes through these
 * two functions, and the positions are written down exactly once, here.
 *
 * Keep them exact inverses. A test asserts it, because a record written by one
 * and read by the other with a field transposed would be silently wrong — it
 * would typecheck, it would round-trip the right *number* of fields, and a
 * player's goals would quietly become his assists.
 */

/** Positions, in the order the tuple declares them. */
const SEASON = 0
const CLUB_ID = 1
const CLUB_NAME = 2
const LEAGUE_NAME = 3
const APPEARANCES = 4
const STARTS = 5
const MINUTES = 6
const GOALS = 7
const ASSISTS = 8
const CLEAN_SHEETS = 9
const YELLOW_CARDS = 10
const RED_CARDS = 11
const RATING_SUM = 12
const MOTM = 13

export function makeCareerRecord(
  stats: PlayerSeasonStats,
  season: number,
  clubId: ID,
  clubName: string,
  leagueName: string,
): PlayerCareerRecord {
  return [
    season,
    clubId,
    clubName,
    leagueName,
    stats.appearances,
    stats.starts,
    stats.minutes,
    stats.goals,
    stats.assists,
    stats.cleanSheets,
    stats.yellowCards,
    stats.redCards,
    stats.ratingSum,
    stats.motmAwards,
  ]
}

export function readCareerRecord(record: PlayerCareerRecord): PlayerCareerSeason {
  return {
    season: record[SEASON],
    clubId: record[CLUB_ID],
    clubName: record[CLUB_NAME],
    leagueName: record[LEAGUE_NAME],
    appearances: record[APPEARANCES],
    starts: record[STARTS],
    minutes: record[MINUTES],
    goals: record[GOALS],
    assists: record[ASSISTS],
    cleanSheets: record[CLEAN_SHEETS],
    yellowCards: record[YELLOW_CARDS],
    redCards: record[RED_CARDS],
    ratingSum: record[RATING_SUM],
    motmAwards: record[MOTM],
  }
}

/**
 * Appearances without expanding the whole record.
 *
 * The one field read in bulk — a career total is a sum over every record of
 * every player — and building an object per record to reach one number is the
 * kind of waste this change exists to remove.
 */
export function careerAppearances(record: PlayerCareerRecord): number {
  return record[APPEARANCES]
}
