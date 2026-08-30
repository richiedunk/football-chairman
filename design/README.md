# UI directions

## The direction (top row of the canvas)

`Main.dc.html` · `SquadC.dc.html` · `Advance.dc.html` · `Header.dc.html`

- **Terminal skeleton** — near-black `#08090B`, JetBrains Mono for every
  number, Inter for names and prose, fixed columns, a status strip that
  never leaves the screen.
- **Floodlight controls** — the lime `#C8FF4D` pill for the one primary
  action per screen, and the icon+label bottom nav.
- **Club colour, header only** — the band is the club primary in HSL with
  lightness clamped to 10–17% and chroma capped, so white text always
  clears 4.5:1; a 3px strip of the untouched colour sits beneath it. White
  primaries fall through to the secondary; near-blacks lift rather than
  clamp. Nothing below the strip is ever club-coloured.
  `Header.dc.html` shows the six worst cases.
- **A dashboard with hierarchy** — nothing on Home is the same size or
  shape as anything else. The standing is 66px and unchallenged, with board
  confidence and its target marker directly beneath it. The next match gets
  its own raised band and the opponent's colour. Decisions read as an
  inbox. The six departments are one small bar chart rather than six tiles:
  same information, a quarter of the space, and a weak department is
  visible without knowing the scale. Every element is still a tap target;
  it just doesn't look like a menu.
- **One contextual advance button** — a verb phrase naming the next real
  event plus a mono line carrying what the week actually holds. Never a
  week number. It blocks only on things that expire if ignored, never to
  make you read something. `Advance.dc.html` shows the six states.

## Earlier directions (bottom row, reference only)

- **Floodlight** (`FloodlightHome.dc.html`, `FloodlightSquad.dc.html`)
- **Terminal** (`DirectionB.dc.html`, `SquadB.dc.html`)
- **Broadsheet** (`DirectionA.dc.html`, `SquadA.dc.html`)

`canvas.json` lays all nine out. To rebuild the canvas after editing an
artboard, re-seed a fresh copy of the design payload from these files and
republish it — the seeded `director-of-football-ui.html` is generated and
is not committed.
