/**
 * Something to read while the week runs.
 *
 * A week costs about a quarter of a second and occasionally over one, which is
 * long enough to feel like a hang and short enough that a progress bar would
 * be a lie. So: one line, picked fresh each time, in the register of a cold
 * terrace rather than a loading spinner.
 *
 * Deliberately one line per advance rather than a rotating carousel. The tick
 * is a single synchronous call — while it runs, no timer fires and no text
 * repaints, so a carousel would sit frozen on its first entry and look broken.
 * What can keep moving is a compositor-driven CSS animation, which is why the
 * screen has one of those instead.
 */

const LOADING_LINES: string[] = [
  'Turning the floodlights on',
  'Heckling the away end',
  'Asking the chairman for a moment of his time',
  'Explaining amortisation to a man who owns a scaffolding firm',
  'Scouting a non-league a left-back on a wet Tuesday',
  'Reheating the pies',
  'Finding socks for the kit man',
  'Ringing an agent who has not read the email',
  'Meeting an agent for what could have been an email',
  'Persuading a nineteen-year-old that this is a step up',
  'Telling the press nothing, at length',
  'Blaming the international break',
  'Filing in the form the league says it never received',
  'Assuring the physio it is only a knock',
  'Looking busy in the directors box',
  'Sweeping the terraces',
  'Checking whether the pitch is still under all that snow',
  'Getting a second opinion on a first touch',
  'Criticising VAR',
  'Criticising UEFA',
  'Adding a nought and seeing if anyone notices',
  'Waiting on a fax that was \'sent\' 3 days ago',
  'Being told the budget is under review',
  'Scouting a lad whose dad has opinions',
  'Working out who ordered nine hundred scarves',
  'Listening to a supporters trust really, really hard',
  'Getting confused by the ticket ballot process',
  'Pretending to understand the data department',
  'Moving a cone four yards to the left',
  'Tutting at a stand that needed replacing 10 years ago',
  'Agreeing in principle, in no particular hurry',
  'Reading a clause somebody should have read in June',
]

/** A line, avoiding the one just shown so it never repeats back to back. */
export function nextLine(previous?: string): string {
  if (LOADING_LINES.length < 2) return LOADING_LINES[0] ?? ''
  let line = previous
  while (line === previous) {
    line = LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)]
  }
  return line as string
}
