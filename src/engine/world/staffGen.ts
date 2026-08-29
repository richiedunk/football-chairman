import { clamp, Rng } from '../rng'
import { IdFactory, ID_PREFIX } from '../ids'
import type {
  AttributeKey, CoachProfile, CoachStyle, Formation, ID, Nation, Staff, StaffAttributes, StaffRole,
} from '../types'
import type { NameGenerator } from '../names/generator'

/**
 * Staff generation.
 *
 * The head coach is the most important non-player character in the game. As
 * director of football you do not pick the team — he does — so his preferences
 * are a constraint you recruit around, and his relationship with you is a
 * resource you spend. Everything in CoachProfile exists to give the AI opinions
 * you can be in conflict with.
 */

export interface StaffGenContext {
  rng: Rng
  ids: IdFactory
  names: NameGenerator
  nations: Nation[]
  season: number
}

const FORMATIONS: Formation[] = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '5-3-2', '4-1-4-1', '3-4-3']

const STYLE_BY_FORMATION: Record<Formation, CoachStyle[]> = {
  '4-4-2': ['direct', 'balanced', 'counterAttack'],
  '4-3-3': ['possession', 'highPress', 'balanced'],
  '4-2-3-1': ['possession', 'balanced', 'counterAttack'],
  '3-5-2': ['possession', 'balanced', 'direct'],
  '5-3-2': ['defensive', 'counterAttack'],
  '4-1-4-1': ['defensive', 'balanced', 'highPress'],
  '3-4-3': ['highPress', 'direct', 'possession'],
}

/** Attributes each coaching style over-values when picking a side. */
const STYLE_VALUED_ATTRIBUTES: Record<CoachStyle, AttributeKey[]> = {
  possession: ['passing', 'firstTouch', 'vision', 'composure'],
  counterAttack: ['pace', 'positioning', 'firstTouch', 'composure'],
  highPress: ['workRate', 'stamina', 'determination', 'tackling'],
  direct: ['heading', 'strength', 'pace', 'crossing'],
  defensive: ['positioning', 'tackling', 'heading', 'determination'],
  balanced: ['composure', 'workRate', 'passing', 'positioning'],
}

export const STYLE_LABELS: Record<CoachStyle, string> = {
  possession: 'Possession',
  counterAttack: 'Counter-attacking',
  highPress: 'High press',
  direct: 'Direct',
  defensive: 'Defensive',
  balanced: 'Balanced',
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  headCoach: 'Head Coach',
  assistantCoach: 'Assistant Coach',
  scout: 'Scout',
  physio: 'Physiotherapist',
  analyst: 'Data Analyst',
  academyDirector: 'Academy Director',
  fitnessCoach: 'Fitness Coach',
  goalkeepingCoach: 'Goalkeeping Coach',
}

/** Which attributes actually matter for each role, for hiring and effects. */
export const ROLE_KEY_ATTRIBUTES: Record<StaffRole, (keyof StaffAttributes)[]> = {
  headCoach: ['coaching', 'manManagement', 'tactical', 'mediaHandling'],
  assistantCoach: ['coaching', 'manManagement', 'judgingAbility'],
  scout: ['judgingAbility', 'judgingPotential', 'negotiating'],
  physio: ['physiotherapy'],
  analyst: ['dataAnalysis', 'tactical'],
  academyDirector: ['youthDevelopment', 'judgingPotential', 'coaching'],
  fitnessCoach: ['coaching', 'physiotherapy'],
  goalkeepingCoach: ['coaching', 'tactical'],
}

export function generateStaff(
  ctx: StaffGenContext,
  role: StaffRole,
  clubId: ID | null,
  quality: number, // 0-100, roughly the club's reputation
  nation: Nation,
): Staff {
  const { rng, ids, names, season } = ctx

  const foreign = rng.chance(role === 'headCoach' ? 0.3 : 0.15)
  const staffNation = foreign
    ? rng.weighted(ctx.nations, ctx.nations.map((n) => Math.pow(n.reputation / 10, 2)))
    : nation
  const name = names.forNation(staffNation)

  const reputation = clamp(rng.normal(quality, 11), 5, 99)
  const attributes = generateStaffAttributes(rng, role, reputation)

  const staff: Staff = {
    id: ids.next(ID_PREFIX.staff),
    firstName: name.firstName,
    lastName: name.lastName,
    // Staff are never known by a mononym — coaches get a surname and an initial.
    knownAs: `${name.firstName} ${name.lastName}`,
    nationalityId: staffNation.id,
    age: rng.normalInt(role === 'headCoach' ? 48 : 42, 8, 28, 68),
    role,
    clubId,
    attributes,
    reputation,
    contract: clubId ? { wage: staffWage(reputation, role), expiresSeason: season + rng.int(1, 4) } : null,
    relationship: rng.normalInt(62, 12, 25, 92),
    coachProfile: role === 'headCoach' ? generateCoachProfile(rng, reputation) : null,
    assignment: null,
    joinedSeason: season - rng.int(0, 4),
  }

  return staff
}

function generateStaffAttributes(rng: Rng, role: StaffRole, reputation: number): StaffAttributes {
  const key = ROLE_KEY_ATTRIBUTES[role]
  const base = clamp(reputation * 0.85 + 10, 10, 95)

  const make = (attribute: keyof StaffAttributes): number => {
    const relevant = key.includes(attribute)
    // Relevant attributes cluster near the staff member's reputation; the rest
    // are largely independent, so a brilliant coach can be hopeless with the
    // press and that becomes a media-management problem for you.
    return relevant
      ? rng.normalInt(base, 8, 1, 99)
      : rng.normalInt(50, 18, 1, 99)
  }

  return {
    coaching: make('coaching'),
    manManagement: make('manManagement'),
    tactical: make('tactical'),
    youthDevelopment: make('youthDevelopment'),
    judgingAbility: make('judgingAbility'),
    judgingPotential: make('judgingPotential'),
    physiotherapy: make('physiotherapy'),
    dataAnalysis: make('dataAnalysis'),
    negotiating: make('negotiating'),
    mediaHandling: make('mediaHandling'),
  }
}

function generateCoachProfile(rng: Rng, reputation: number): CoachProfile {
  const formation = rng.pick(FORMATIONS)
  const style = rng.pick(STYLE_BY_FORMATION[formation])

  return {
    formation,
    style,
    // Trust in youth is deliberately independent of quality. A brilliant coach
    // who will not play teenagers is a genuine strategic problem for a director
    // of football running a sell-on model, and that tension is the point.
    trustInYouth: rng.normalInt(48, 20, 5, 95),
    rotationTendency: rng.normalInt(45, 18, 5, 92),
    valuedAttributes: STYLE_VALUED_ATTRIBUTES[style],
    requests: [],
    dofRelationship: rng.normalInt(62, 12, 30, 90),
    // A well-regarded coach starts safer in his job — and is correspondingly
    // harder for a director of football to overrule.
    jobSecurity: clamp(Math.round(rng.normal(42 + reputation * 0.32, 12)), 15, 95),
  }
}

function staffWage(reputation: number, role: StaffRole): number {
  const roleMultiplier: Record<StaffRole, number> = {
    headCoach: 4.5,
    assistantCoach: 1.6,
    scout: 0.9,
    physio: 1.0,
    analyst: 1.0,
    academyDirector: 1.4,
    fitnessCoach: 1.0,
    goalkeepingCoach: 1.0,
  }
  const base = Math.pow(reputation / 50, 3) * 2_400
  return Math.max(400, Math.round((base * roleMultiplier[role]) / 100) * 100)
}

/** The default backroom a generated club is created with. */
export function generateBackroom(
  ctx: StaffGenContext,
  clubId: ID,
  quality: number,
  nation: Nation,
): Staff[] {
  const staff: Staff[] = [
    generateStaff(ctx, 'headCoach', clubId, quality, nation),
    generateStaff(ctx, 'assistantCoach', clubId, quality * 0.85, nation),
    generateStaff(ctx, 'physio', clubId, quality * 0.8, nation),
    generateStaff(ctx, 'academyDirector', clubId, quality * 0.8, nation),
  ]

  // Bigger clubs run bigger departments. This is what facilities investment and
  // the scouting-network level ultimately buy you.
  const scoutCount = quality > 75 ? 4 : quality > 50 ? 3 : quality > 30 ? 2 : 1
  for (let i = 0; i < scoutCount; i++) {
    staff.push(generateStaff(ctx, 'scout', clubId, quality * 0.8, nation))
  }
  if (quality > 45) staff.push(generateStaff(ctx, 'analyst', clubId, quality * 0.8, nation))
  if (quality > 35) staff.push(generateStaff(ctx, 'fitnessCoach', clubId, quality * 0.8, nation))
  if (quality > 55) staff.push(generateStaff(ctx, 'goalkeepingCoach', clubId, quality * 0.8, nation))

  return staff
}

/**
 * A pool of unattached staff looking for work.
 *
 * Without this the world contains no hireable staff at all — every generated
 * coach, scout and physio already has a club — and the hiring screens are
 * empty. The pool spans the full range of quality so that a lower-league club
 * has genuine options and a big club still has to pay for the good ones.
 */
export function generateFreeAgentStaff(
  ctx: StaffGenContext,
  clubCount: number,
  nations: Nation[],
): Staff[] {
  const out: Staff[] = []

  // Sized relative to the world so a compact world is not swamped and a large
  // one is not starved.
  const counts: [StaffRole, number][] = [
    ['headCoach', Math.max(12, Math.round(clubCount * 0.12))],
    ['assistantCoach', Math.max(8, Math.round(clubCount * 0.06))],
    ['scout', Math.max(16, Math.round(clubCount * 0.14))],
    ['physio', Math.max(8, Math.round(clubCount * 0.07))],
    ['analyst', Math.max(8, Math.round(clubCount * 0.07))],
    ['academyDirector', Math.max(8, Math.round(clubCount * 0.06))],
    ['fitnessCoach', Math.max(6, Math.round(clubCount * 0.05))],
    ['goalkeepingCoach', Math.max(6, Math.round(clubCount * 0.05))],
  ]

  for (const [role, count] of counts) {
    for (let i = 0; i < count; i++) {
      // Quality is drawn across the whole range rather than clustered, so the
      // pool always contains both bargains and people you cannot afford.
      const quality = ctx.rng.float(8, 88)
      const nation = ctx.rng.weighted(nations, nations.map((n) => n.population))
      const staff = generateStaff(ctx, role, null, quality, nation)
      out.push(staff)
    }
  }

  return out
}

/**
 * What a staff member expects to be paid. Exposed so the hiring screen can
 * show a realistic starting figure rather than leaving the player to guess.
 */
export function expectedWage(staff: Staff): number {
  return staffWage(staff.reputation, staff.role)
}

/** Overall usefulness of a staff member in their role, 0-100. */
export function staffEffectiveness(staff: Staff): number {
  const keys = ROLE_KEY_ATTRIBUTES[staff.role]
  if (keys.length === 0) return 50
  let total = 0
  for (const key of keys) total += staff.attributes[key]
  return Math.round(total / keys.length)
}
