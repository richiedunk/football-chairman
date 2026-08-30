/**
 * Human names for the game's screens.
 *
 * Every inbox item can carry a link, and the button that follows it used to
 * say "Open" — which tells the reader nothing about where they are about to
 * be taken, and makes two different messages look identical at a glance.
 */
export const SCREEN_LABELS: Record<string, string> = {
  home: 'Home',
  inbox: 'Inbox',
  squad: 'Squad',
  registration: 'Squad list',
  player: 'Player profile',
  transfers: 'Transfers',
  scouting: 'Scouting',
  search: 'Player search',
  club: 'Club',
  finance: 'Finances',
  facilities: 'Facilities',
  stadium: 'Stadium',
  staff: 'Staff',
  academy: 'Academy',
  board: 'Boardroom',
  media: 'Media',
  league: 'League table',
  career: 'Career',
  achievements: 'Milestones',
}

export function screenLabel(view: string): string {
  return SCREEN_LABELS[view] ?? view.charAt(0).toUpperCase() + view.slice(1)
}

/**
 * What the button under an inbox message should say.
 *
 * Naming the destination — and the player, where the link is to a player — is
 * the difference between a message you can act on from the list and one you
 * have to open to understand.
 */
export function linkLabel(view: string, subjectName?: string | null): string {
  if (view === 'player' && subjectName) return `Open ${subjectName}'s profile`
  return `Open ${screenLabel(view)}`
}
