/**
 * An icon for whoever a message is from, read off the sender's name.
 *
 * Not an avatar and not a colour: the phone doc turned both down, because
 * twenty senders in twenty colours compete with the one accent. A monochrome
 * glyph per role is neither — it says "the chairman" or "an agent" before
 * the name is read, which is the thing an inbox scanned at speed needs.
 *
 * Senders are free text ("Priya Shah (Head Scout)"), so the match is on the
 * words in them, most specific first.
 */
export interface SenderIcon {
  role: string
  /** Stroked SVG path on a 24 × 24 grid. */
  d: string
}

const ICONS: { match: RegExp; icon: SenderIcon }[] = [
  { match: /chairman|board|owner/, icon: { role: 'Board', d: 'M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6' } },
  { match: /coach|manager|assistant/, icon: { role: 'Coaching', d: 'M9 8a6 6 0 1 0 6 6H9zM9 8V4h11v4M14 4l-2 4' } },
  { match: /agent|representative/, icon: { role: 'Agent', d: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16' } },
  { match: /press|communications|journalist|media/, icon: { role: 'Press', d: 'M4 5h13v14H4zM17 9h3v8a2 2 0 01-3 0zM7 8h7M7 12h7M7 16h4' } },
  { match: /scout|recruitment/, icon: { role: 'Scouting', d: 'M6 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM9 17h6M5 14l2-9h3l1 9M19 14l-2-9h-3l-1 9' } },
  { match: /academy|youth/, icon: { role: 'Academy', d: 'M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 1 2.7 2 6 2s6-1 6-2v-5' } },
  { match: /physio|medical|doctor/, icon: { role: 'Medical', d: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z' } },
  { match: /analyst|data/, icon: { role: 'Data', d: 'M3 3v18h18M7 15l4-4 3 3 5-6' } },
  { match: /secretary|competition|registration/, icon: { role: 'Admin', d: 'M8 4h8v3H8zM6 6H4v15h16V6h-2M8 12h8M8 16h5' } },
  { match: /safety|project|architect|builder|construction|stadium/, icon: { role: 'Ground', d: 'M2 18h20M4 18v-4a8 8 0 0 1 16 0v4M12 6V4M9 14h6' } },
  { match: /liaison|player|captain/, icon: { role: 'Players', d: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 3a4 4 0 100 8 4 4 0 000-8zM22 21v-2a4 4 0 00-3-3.87' } },
]

const FALLBACK: SenderIcon = { role: 'Message', d: 'M4 4h16v16H4zM4 8l8 5 8-5' }

export function senderIcon(sender: string): SenderIcon {
  const text = sender.toLowerCase()
  return ICONS.find((entry) => entry.match.test(text))?.icon ?? FALLBACK
}
