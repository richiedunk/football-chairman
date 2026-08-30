# UI directions

## The direction (top row of the canvas)

`Main.dc.html` · `SquadC.dc.html` · `Header.dc.html`

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
- **Overview grid** — from Football Chairman Pro's top-level screen: eight
  tap targets, each a live value with a bar under it, so the whole
  department state reads at a glance. The bar is the part that matters —
  it shows state rather than reporting it.

## Earlier directions (bottom row, reference only)

- **Floodlight** (`FloodlightHome.dc.html`, `FloodlightSquad.dc.html`)
- **Terminal** (`DirectionB.dc.html`, `SquadB.dc.html`)
- **Broadsheet** (`DirectionA.dc.html`, `SquadA.dc.html`)

`canvas.json` lays all nine out. To rebuild the canvas after editing an
artboard, re-seed a fresh copy of the design payload from these files and
republish it — the seeded `director-of-football-ui.html` is generated and
is not committed.
