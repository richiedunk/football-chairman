# Bugs

Drop anything you find in here rather than in chat — a bug written down
survives being interrupted by the next one, and this file is the queue I work
from. One entry per fault, newest at the top of **Open**. No format to follow:
a sentence and, if you have it, the screen you were on is plenty.

Move an entry to **Fixed** with the commit that fixed it when it goes; delete
nothing, because the list of what has already broken is the best guide to what
will break next.

---

## Open

### The player table inflates, and senior squads thin as it does
Measured with `scripts/population.ts` on a standard world (492 clubs), twelve
seasons, staying employed throughout:

| | start | s1 | s3 | s5 | s6 |
|---|---|---|---|---|---|
| total players | 15,307 | 17,048 | 19,597 | 19,513 | 18,970 |
| senior, contracted | 12,792 | 12,780 | 12,983 | 11,371 | **11,059** |
| academy | 2,121 | 4,047 | 5,844 | 4,824 | 4,534 |
| free agents | 394 | 221 | 770 | **3,318** | 3,377 |

Correction to an earlier note here: players are **not** never removed —
`season.ts` deletes them on retirement. What happens is that generation
outpaces absorption. Academy intakes nearly triple the academy population in
three seasons, then those players wash out into a free-agent pool that grows
eightfold and never drains, while the number of players actually under senior
contract *falls* by 1,700. That last row is the "squads thin at the season
roll" defect seen from the other side: it is not that squads are being emptied,
it is that the world is producing players clubs do not sign.

Two costs. The tick walks the whole table every week, so 19,000 players instead
of 15,300 is part of why a week is slow. And 3,377 free agents, median age 22,
are mostly players no club will ever take.

Separately and less urgently, the *per-player record* grows too — about 1.5 KB
at creation, 2.2 KB by season fifteen — which is `careerStats`, one row per
player per season. That is deliberate history, linear and modest, and the same
shape as `club.history`. Not a bug; noted so it is not mistaken for one later.

### Save export and import are written but unreachable
`exportSave` and `importSave` exist in `src/storage/saves.ts` and nothing in
the UI calls either, so there is no way for a player to back a career up or
move it to another device. `exportSave` also serialises uncompressed, which
would hand the player a ~50 MB file where the stored save is ~5 MB.

## Fixed

### A bad address looked like being logged out of your game
An unresolvable address was answered with a redirect — to the dashboard
mid-career, and to the title screen from cold. The second one is the problem:
landing on "Start a new career" after tapping a link is indistinguishable from
having lost the save. There is now a not-found screen that says what happened,
shows the address, and offers the way back as a button.

Underneath it was a race. The cold-load guard in `App.vue` read `route.name`
before the router had finished resolving the initial navigation, so the
not-found exemption did not match and the redirect fired anyway. It passed
under a light load and failed under a heavy one. It now waits on
`router.isReady()`.

### Ordinary names were being abbreviated on squad lists
"Gonzalo Montero Robledo" was shown as "G. Montero Robledo" — 23 characters
and 178px wide, in a 288px box. The abbreviation budget had been set at 22
characters by eye. `scripts/namefit.mjs` measured the real box against the
real font on every screen that lists names: the narrowest anywhere is the
staff list at 194px, which holds 26 characters. The budget is 26.

### Inbox links went to the wrong place, or nowhere
Several inbox and news items carried a `link` the router could not resolve —
`media` had no matching route and a stale `id` on it sent the catch-all to the
title screen, which read as "Start new career" appearing out of nowhere. Links
are now checked against the router's own table by a test, so a story cannot
ship a destination that does not exist.

### The loading screen flashed, and took over the whole browser window
The week tick runs 275ms at the median, so the screen it was meant to cover
appeared and vanished before it could be read. It is now floored at 900ms once
it is up. It was also `position: fixed`, so on a desktop-width window it
escaped the phone column and filled the browser; every overlay is now
positioned against the column.

### Sacked 169 times in one career
`paySeverance` cleared the contract but nothing cleared `playerClubId`, so the
board that had just dismissed you dismissed you again the following week, and
kept doing it. Sacking now removes you from the club and puts you on the jobs
board.

### The advance button could not get past deadline day
It routed to `/deadline` on a deadline week rather than advancing, so the clock
stopped there.

### "10 DOUBT" out of a squad of 22
Match sharpness was being read as a fitness doubt. The count is injuries and
suspensions.

### Fifteen-year-olds registered as senior professionals
45 of 6,188 generated players. Senior generation now has an age floor.

### The player's club carried exactly twice everyone else's injuries
Injury events were only recorded for matches simulated in detail, which is only
ever yours. 1.98 injuries per club per 40 weeks against 0.99 for every AI club.
