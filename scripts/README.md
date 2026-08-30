# Development scripts

Not part of the build. These exist because a simulation is only as good as what
you can measure about it, and every calibration bug in this project was found by
running one of these rather than by reading code.

| Script | What it tells you |
| --- | --- |
| `npx tsx scripts/smoke.ts` | Generates a world and prints sample clubs, the best players, top academy prospects, generation time and save size. First thing to run after touching generation. |
| `npx tsx scripts/matchtest.ts` | Simulates 1,200 matches in the top and bottom divisions and reports home/draw/away split, goals, shots and attendance. Guards against the match engine drifting away from real football. |
| `npx tsx scripts/seasontest.ts` | Runs three full seasons and prints finances, board confidence, fan mood, XP and squad size each year. Catches slow drift that a single-week test cannot. |
| `npx tsx scripts/phasetime.ts` | Times each simulation phase separately over a whole world. Use before optimising anything. |
| `npx tsx scripts/cuptest.ts` | Runs a cup to completion and prints the round-by-round field size. |
| `npx tsx scripts/financecheck.ts` | Revenue, wages, upkeep and net position by division at world creation. Found facility upkeep taking 58% of a non-league club's revenue. |
| `npx tsx scripts/crisischeck.ts` | Runs three careers for a season and reports how much of the world ends up under a transfer embargo. |
| `npx tsx scripts/attrcheck.ts` | Attribute means by division, and how far generated attributes drift from the ability they encode. |
| `npx tsx scripts/staffcheck.ts` | How many unattached staff exist and how many each club can actually hire. |
| `npx tsx scripts/linkcheck.ts` | Plays three seasons, collects every link an inbox message or news story carried, and checks each one against the real route table — both as written and again against the world as it stands, since an inbox item outlives the player it names. Found nothing after the media fix; the point is that it stays at nothing. |
| `node scripts/namefit.mjs` | Walks every screen that lists names in the built app at 390x844 and measures the real name box against the real font. Set `LIST_NAME_BUDGET` from this, not by eye — the guessed 22 was abbreviating 23-character names in a 288px box. Needs the preview server. |
| `node scripts/e2e.mjs` | Drives the built app in a real mobile-sized browser and screenshots every screen. Needs `npm run build && npx vite preview` first, and `SHOT=<dir>` for the screenshots. |
