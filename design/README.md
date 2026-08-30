# UI directions

Three candidate visual languages for the mobile UI, each drawn twice: Home
(the easy screen) and the Squad list (the density test — the screen the
current build feels busiest on). Same fixture in all six: Manchester United,
4th in The Prem, week 22, three pending decisions, eight squad rows.

- **Floodlight** (`Main.dc.html`, `SquadC.dc.html`) — near-black neutral,
  Space Grotesk, one saturated accent, the club colour as the only identity
  mark. No cards; hairline rules and whitespace do the grouping.
- **Broadsheet** (`DirectionA.dc.html`, `SquadA.dc.html`) — warm paper,
  Instrument Serif for numbers and names, editorial rules and a masthead.
- **Terminal** (`DirectionB.dc.html`, `SquadB.dc.html`) — near-black,
  JetBrains Mono, fixed columns, persistent status strip.

`canvas.json` lays them out for side-by-side comparison.

To rebuild the canvas after editing an artboard, re-seed a fresh copy of the
design payload from these files and republish it — the seeded
`director-of-football-ui.html` is generated and is not committed.
