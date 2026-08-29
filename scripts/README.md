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
| `node scripts/e2e.mjs` | Drives the built app in a real mobile-sized browser and screenshots every screen. Needs `npm run build && npx vite preview` first, and `SHOT=<dir>` for the screenshots. |
