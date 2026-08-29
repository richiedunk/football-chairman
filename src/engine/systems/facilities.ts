import { IdFactory, ID_PREFIX } from '../ids'
import type { Club, FacilityKind, FacilityProject } from '../types'

/**
 * Facilities and infrastructure.
 *
 * The long game. Facilities pay back over seasons, not weeks, which makes them
 * the clearest expression of a director of football's actual job: spending
 * money now on something that will not help this season's results and might
 * well help your successor's.
 */

export const FACILITY_LABELS: Record<FacilityKind, string> = {
  trainingGround: 'Training Ground',
  youthFacilities: 'Youth Facilities',
  medicalCentre: 'Medical Centre',
  dataDepartment: 'Data Department',
  scoutingNetwork: 'Scouting Network',
}

export const FACILITY_DESCRIPTIONS: Record<FacilityKind, string> = {
  trainingGround: 'Speeds development for every player at the club, most of all the young ones.',
  youthFacilities: 'Raises the floor of your academy intake and the number of prospects produced.',
  medicalCentre: 'Shortens recovery times and reduces the rate of soft-tissue injuries.',
  dataDepartment: 'Improves the accuracy of scout reports and widens the range of players you see.',
  scoutingNetwork: 'Lets scouts cover more ground and file reports faster.',
}

/** Cost of taking a facility from `level` to `level + 1`. */
export function upgradeCost(_kind: FacilityKind, level: number, clubReputation: number): number {
  // Costs rise steeply so that maxing everything is never the obvious play,
  // and so that a lower-league club upgrading one facility is a real decision.
  const base = Math.pow(level + 1, 2.15) * 46_000
  // Bigger clubs pay more for the same nominal level, because their level 15 is
  // a different building to a League Two club's level 15.
  const scale = 0.65 + (clubReputation / 100) * 0.8
  return Math.round((base * scale) / 10_000) * 10_000
}

/** Weeks required to complete an upgrade. */
export function upgradeDuration(_kind: FacilityKind, level: number): number {
  return Math.max(6, Math.round(6 + level * 1.4))
}

/** Start a facility upgrade. Returns null if it cannot be afforded. */
export function startUpgrade(
  club: Club,
  ids: IdFactory,
  kind: FacilityKind,
): { project: FacilityProject } | { error: string } {
  if (club.facilities.projects.some((p) => p.kind === kind)) {
    return { error: `Work on the ${FACILITY_LABELS[kind].toLowerCase()} is already under way.` }
  }
  const currentLevel = club.facilities[kind] as number
  if (currentLevel >= 20) return { error: 'This facility is already at the highest level.' }

  const cost = upgradeCost(kind, currentLevel, club.reputation)
  if (cost > club.finances.balance) {
    return { error: 'The club cannot cover the cost of the work.' }
  }
  if (club.finances.inCrisis) {
    return { error: 'The board will not sanction spending while the club is in crisis.' }
  }

  const weeks = upgradeDuration(kind, currentLevel)
  const project: FacilityProject = {
    id: ids.next(ID_PREFIX.project),
    kind,
    targetLevel: currentLevel + 1,
    totalCost: cost,
    weeklyCost: Math.round(cost / weeks),
    weeksRemaining: weeks,
    description: `Upgrading ${FACILITY_LABELS[kind].toLowerCase()} to level ${currentLevel + 1}`,
  }
  club.facilities.projects.push(project)
  return { project }
}

/** Weekly construction pass. Returns completion notices for the inbox. */
export function progressProjects(club: Club): string[] {
  const notices: string[] = []
  const remaining: FacilityProject[] = []

  for (const project of club.facilities.projects) {
    project.weeksRemaining -= 1
    if (project.weeksRemaining > 0) {
      remaining.push(project)
      continue
    }

    if (project.targetLevel !== undefined) {
      ;(club.facilities as unknown as Record<string, number>)[project.kind] = project.targetLevel
      notices.push(
        `The ${FACILITY_LABELS[project.kind].toLowerCase()} upgrade is complete — now at level ${project.targetLevel}.`,
      )
    }
  }

  club.facilities.projects = remaining
  return notices
}

/** Descriptive band for a facility level, for the UI. */
export function facilityGrade(level: number): string {
  if (level >= 19) return 'World class'
  if (level >= 16) return 'Excellent'
  if (level >= 13) return 'Very good'
  if (level >= 10) return 'Good'
  if (level >= 7) return 'Adequate'
  if (level >= 4) return 'Basic'
  return 'Poor'
}
