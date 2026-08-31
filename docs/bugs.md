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


### A pre-v4 save could not be loaded at all
Found the moment the migration tests existed. `migrate()` walks the version
steps in ascending order, but the v2 step rebuilds squad lists through
`autoRegister`, which asks whether the club is under a registration embargo —
and the regulation record that question reads is created by the **v4** step.
So a genuinely old save threw a TypeError on load. `embargoedSince` now treats
a missing record as no sanctions, which is the right answer as well as the safe
one. Fixed, and covered by a test per historical version.

### A club short of players starts the match with ten
`selection.ts` fills one slot per available player and stops when it runs out
(`if (best)` at the end of the slot loop). A club whose fit, unsuspended senior
pool is below eleven simply starts with fewer, with no bench call-up, no
academy promotion for the day and no forfeit. Found when a walkthrough on a
random seed reopened a match report and counted ten rated players.

Real football does not allow this: a club that cannot name eleven names
academy players, recalls a loanee, or forfeits the fixture. Which of those it
should be is a design question — forfeiting is the most realistic and the most
punishing, an emergency academy call-up is the most forgiving.

Related to, but not the same as, the thin-squad measurements above: those
counted registered squad size at the season roll, this is *availability on the
day* after injuries and suspensions. A club can be at eighteen registered and
still be a man short in February.

The walkthrough previously asserted eleven rated players and so failed
intermittently on whichever random world happened to contain such a club. That
assertion was testing an engine property the engine does not hold, from the UI,
so it now checks what it can actually guarantee — that the report renders every
player it was given — and reports the count.

### The season roll digs a hole the world takes longer and longer to climb out of
Measured with `scripts/churn.ts`, standard world, 492 clubs, twelve seasons,
sampling squad size twice a year — deep mid-season at week 26, and at the roll.

| season | mid-season | at the roll | gap | expiries |
|---|---|---|---|---|
| 1 | 26.2 | 25.9 | 0.3 | 175 |
| 3 | 26.7 | 26.3 | 0.4 | 670 |
| 4 | 26.9 | 24.1 | **2.8** | **2,019** |
| 8 | 25.0 | 22.7 | 2.3 | 1,424 |
| 12 | **24.4** | **21.3** | **3.1** | 1,647 |

**Correction, because this was reported wrong twice.** The "seventeen per cent
decline in contracted players" was measured entirely at week 1, immediately
after `processPlayerYearEnd` empties every expiring contract on one afternoon.
That is the worst moment of the year to count a squad, before renewals or a
single free-agent signing have had a week to work. The roadmap already said as
much and the measurement re-derived it without noticing.

What is actually true is smaller and different:

- **Mid-season squads decline from 26.2 to 24.4 over twelve seasons** — about
  seven per cent, not seventeen — and are still drifting down at season twelve
  rather than settling.
- **The rollover trough deepens, and that is the more interesting number.** The
  gap between mid-season and the roll goes from 0.3 players to 3.1. The world
  is taking longer to recover from each roll than it did from the last one.
- **A synchronised expiry wave in season four** — 670 expiries to 2,019, with
  academy releases going 998 to 2,197 in the same season — is where it starts.
  That is the founding cohort's contracts running out together, because
  generation hands out contract lengths without spreading the years.

Everything below the table in a week-1 sample is a trough figure and should be
read as such: the 30 clubs "below the emergency floor" are 30 clubs below it in
the week after the roll, which matches the roadmap's note that the smallest
club can be as low as seven for a few weeks before signings catch up.

**Two hypotheses tested and disproved, so nobody retests them:**

1. *`FREE_AGENT_TARGET` (21) is capping squads below `TARGET_SENIOR_SQUAD`
   (24).* No. Clubs exceed 21 routinely — at season twelve, 135 are at or above
   24 and 105 sit in the gap between the two constants. Academy promotion and
   fee transfers fill it, which is what the gap was for. Transfers run at 8.7 a
   club a season against a 6-8 target, so the volume that cap protects is
   healthy; raising it would have cost that for nothing.
2. *Starving clubs cannot sign because `recruitOne` keeps the ability ceiling
   in an emergency, and the free-agent pool is fed by better clubs.* No.
   `scripts/stuckclubs.ts`: of 30 clubs below the floor, **zero** have nobody
   under their ceiling, and the median has 1,119 signable free agents. Cardiff
   City sit on eleven players with 2,720 available.

**What is worth measuring next**, before anything is changed: why recovery from
the roll is getting slower. The candidates are the bunching of contract lengths
at generation, the renewal pass (weeks 26-46) letting ~1,600 players a season
reach expiry at all, and the per-week limits on free-agent recruitment. Nothing
should be tuned until one of those is shown to be the cause — two confident
diagnoses have already been wrong here.

### Save export and import are written but unreachable
`exportSave` and `importSave` exist in `src/storage/saves.ts` and nothing in
the UI calls either, so there is no way for a player to back a career up or
move it to another device. `exportSave` also serialises uncompressed, which
would hand the player a ~50 MB file where the stored save is ~5 MB.

## Fixed

### CAF had no nations and AFC had one
The world held 18 nations — 13 UEFA, 2 CONMEBOL, 2 CONCACAF, 1 AFC and no
African nation at all — so two African competitions were defined that could
never be created, and Japan raised three qualified clubs, below the minimum
field, meaning its league had its continental places stripped and a Japanese
champion had nowhere to go. Twelve nations added across four confederations
(Egypt, Morocco, Nigeria, South Africa; South Korea, Saudi Arabia, Australia;
Colombia, Uruguay, Chile; Costa Rica, Canada). All five confederations now
field competitions and no league awards a place to nothing.

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
