# UI directions

## The direction: Stadium

The terminal build (below) was correct and joyless: near-black, hairlines,
mono caps everywhere, and nothing on screen that said football. The Stadium
pass keeps its information design — one number per screen that matters most,
one contextual advance button, dense scannable lists — and puts it in a
football ground. Reference points were Football Chairman Pro, calmer, and
generic football-manager UI kits: dark glass panels over a floodlit pitch.

- **The ground is a pitch at night.** `--stadium` in `main.css`: mown stripes,
  the centre circle and halfway line, two floodlight pools and a heavy smoke,
  all CSS gradients. The floodlights pick up a wash of the club's colour.
- **Panels, not hairlines.** Every `.card` is smoked glass with a header strip.
  The pitch showing between panels is what makes a screen read as football.
- **Montserrat is the voice.** Headings, labels, buttons and every figure,
  with tabular numerals so columns still line up. Inter carries prose.
  JetBrains Mono is kept for nothing on screen by default; `--font-mono`
  remains for the documents register if it wants it back.
- **Colour has one meaning each.** Lime `#C8FF4D`: the thing you do next.
  Green / amber / red: good / caution / bad. Blue `--sel`: selected, and star
  ratings. Club colour: identity. Position families follow the genre:
  keeper orange, defence green, midfield blue, attack red.
- **Club colour leaves the header.** The band is still `headerBand()` so text
  is always legible, but the club now dresses the floodlights, edges the
  standing panel and the phone plate, and is worn — as a crest, a kit, a tie.
- **Everything is generated.** `src/ui/art/`: a crest and a kit for every
  club from its id and two colours, a face for every player and member of
  staff from their id and age. Deterministic, no assets, no storage. Crests
  are generic heraldry and never imitate a real badge.
- **The title is drawn in.** Scoreboards with crests and a score plate, match
  facts as split bars, the side on a pitch in its shirts, a plan of the ground
  from above, the undisclosed part of a scout's range as a hatched band.
- **Buttons are plates.** Bordered rectangles with a top light; the primary is
  the lime plate. The advance button is the same, capped at 520px on desktop.

Superseded from the direction below: "nothing below the strip is ever
club-coloured", "Numbers in mono", and the two-button home bar (it is five
tabs now: Home, Club, Squad, Market, Inbox).

## The previous direction: Terminal (top row of the canvas)

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
republish it — the seeded `undisclosed-football-ui.html` is generated and
is not committed.
