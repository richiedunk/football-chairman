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

### ~~Seven features are written, documented, and never called~~ — wired in
Found by `knip`. All seven are connected now, and the register is empty.

| what | where it went |
|---|---|
| `awardContinentalStanding` | Called from the `cupRounds` phase when a continental tie settles — everyone knocked out credited with the rounds they survived, the winner with all of them. Measured over four seasons: before, the clubs whose continental reputation sat above their domestic one were Peterborough, Fleetwood and Harrogate, which is rounding drift in clubs that never leave England. After, they are Köln, Augsburg, Brentford, Nice and Chelsea. |
| `retrainPosition` | A sheet on the player screen. Permanent, costs him about six per cent, keeps the old position as one he can still cover, and is refused into or out of goal because that is a different job. |
| `unassignScout` | "Call him back — no brief" on the scout's assignment sheet. Until now the only way to take a scout off a league was to give him another one. |
| `demoteToAcademy` | A button on the player screen, for an under-21 senior. It now frees his registration place, which is the only reason a director would ever do it, and says why it refused instead of silently doing nothing. |
| `wageBreakdown` | The finance screen's highest-earners table, which had its own copy that divided by `wageBudget` unguarded — a club whose budget had been cut to nothing showed every earner at `Infinity%` of it. |
| `wageHeadroom` | Both callers that did the subtraction themselves. |
| `auth` | The settings screen, behind `auth.availableProviders()`. Renders nothing today by design: `capabilities().signIn` is hard-false until a real provider exists, so the section is invisible and lights up when one lands. |

`PositionGroup` has a consumer again too — one `positionGroup()` in `attributes.ts`
replacing two mappings spelled out by hand, in the position badge and the
clean-sheet rule.

**Left open by this, and worth its own look:** the board's `reduceWageBill`
mandate scores you on a wage bill it computes itself — raw squad contract
wages, no staff, and a player loaned out still counted at his full wage. Every
other system in the game reads `totalWageBill`, which counts staff and splits a
loan by the agreed share. So loaning out an expensive player, the obvious way
to answer that mandate, moves the number the board is *not* looking at.


### An unused Capacitor plugin is wired into both native projects
`@capacitor/preferences` is in `package.json` and no code imports it, but
`ios/App/Podfile` and `android/capacitor.settings.gradle` both point at it in
`node_modules`. Removing it is `npm uninstall` **and** `npx cap sync`, and the
iOS half of that wants CocoaPods on a Mac.

Left installed rather than half-removed — dropping it from `package.json` alone
leaves two native projects referencing a directory that is not there. Worth
deciding: durable key-value storage on a phone is a real need (a WKWebView can
evict localStorage), so this may be a plugin installed for an adapter that was
never written rather than one to throw away.


### ~~Seventeen fields of the world model are read by nothing~~ — fifteen deleted
`scripts/dialcheck.ts` found seventeen. Fifteen are gone: fourteen dead fields
plus `MediaBriefing.targetStaffId`, which was never written either and was left
feeding nothing once `MediaStory.subjectStaffIds` went.

Measured before deciding, and the number was smaller than claimed: all of the
dead fields together were **477 kB of a 23.28 MB save — 2.05%**, of which
`secondNationalityId` was 262 kB and `birthWeek` 143 kB. The case for removing
them was clarity, not size.

**Proved inert, except in one respect.** Two of them consumed random draws:
`secondNationalityId` rolled a 14% chance and `birthWeek` an `int(1, 52)`, once
per player. Holding those two draws and deleting everything else produced a
state **byte-identical** to the old engine's with the same field names stripped
out — 27,892,791 bytes, no diff. So the deletion changes the save shape and
nothing else.

Dropping the two draws is a real change: a seed no longer generates the world
it used to, because every player's attributes come out of a stream that is now
two numbers shorter per player. Old saves load unaffected — generation does not
re-run — but `worldhash` moved from `adeee149e9968199a50b261e` to
`d866b23168d61376f63e07b2`.

**The calibration is unchanged**, on ten matched seeds:

| | n | mean goals/game | sd | range |
|---|---|---|---|---|
| before | 10 | 2.696 | 0.064 | 2.593–2.854 |
| after | 10 | 2.704 | 0.098 | 2.563–2.864 |

Per-seed deltas run from −0.236 to +0.201 and cancel. Worth recording how this
nearly went wrong: the first check used four seeds, showed every one of them
higher after the change, and was written up as "not noise, a 4% shift". It was
noise. Four worlds is not a sample, and a tight cluster in a small one is the
easiest thing in this project to mistake for a finding.

Two more went as a chain: `MediaBriefing.targetStaffId`, whose only reference
was the `subjectStaffIds` line, and `continentalResultFor`, which built the
history string. Deleting a dead field orphans whatever fed it, and knip and the
dial check found both on the next run rather than leaving them to rot.

**Save format 15** takes them out of existing saves too. It is the first
migration here that deletes rather than fills in — an old save's loaded object
is the parsed JSON, extra keys and all, so without this a v14 career would
write those fifteen names back out on every save for ever. It walks the state
generically rather than by a list of locations, because a hand-written list of
where each field lives is exactly what went wrong the first time this deletion
was verified. `migration.test.ts` builds a v14 save by putting them *back* and
asserts they are gone; verified by disabling the strip and watching it fail.

**Two fields survive, as features to connect rather than weight to drop:**
`TransferNegotiation.deadlineWeek` (nothing expires a negotiation, so one
opened in July is still open in May) and `GameSettings.fastAdvance` (a setting
no screen offers). Both are on the register in `tests/dials.test.ts`.

A third is not, and it is the more interesting one:

### ~~A takeover computes the new owner's opinion of you, and only the tests read it~~ — deleted
`Owner.faithInDirector` was set to `clamp(Math.round(50 + fit * 42), 5, 95)`
when a takeover completed, and two assertions in `systems.test.ts` checked that
arithmetic. No code in the game ever consulted the result. Gone in format 16.

The pitch it was computed from still matters: `fit` drives `board.confidence`
and the transfer budget, which the board does act on. The two tests now assert
on confidence — the thing with consequences — rather than on a number nothing
read.

**It could not have been caught by the register**, and that limit is worth
keeping in mind. `tests/dials.test.ts` asks whether anything reads a field, and
tests are among the things it scans (they had to be added — without them
`Club.isPlayerClub` read as unread while two tests asserted on it). So a field
the game ignores but a test checks passes the check by construction. This one
was found by reading the code, not by the tool.

Its own save version rather than an addition to format 15's list: 15 had
already shipped, and folding the strip backwards would leave anyone already at
15 carrying the field for ever. Verified by disabling the strip and watching
`migration.test.ts` fail — which it did not do at first, because the test
loaded from format 1 and the v5 step deletes `board.owner` wholesale, so a
fresh owner was built without the field either way and the assertion was
vacuous. It loads from 15 now.

Byte-proof that nothing else moved: the state with `faithInDirector` stripped
from the old engine and the state from the new one are identical at 27,885,503
bytes apart from `"version": 15` becoming `16`.


### The dressing room is a tax again, and the measurement that said otherwise was corrupt
`roomcheck.ts` builds a world per seed in one process. The rating memo was
keyed on player id and ids restart at one per world, so every trial after the
first read the previous trial's ratings — see "The rating memo was handing
worlds each other's players" under Fixed. The dressing-room figures were taken
through that.

Re-measured on the fixed engine, one season, eight seeds:

| | reported | actual |
|---|---|---|
| leader over nothing | +1.27 morale | **−0.21** |
| professional over nothing | — | +0.06 |
| disruptive under nothing | −1.69 morale | **−2.62** |

So a leader is worth nothing measurable and a disruptive player costs two and a
half morale. The roadmap's claim that the "just a tax" failure was designed out
is false and has been corrected there.

The mechanism to look at is `grievanceDamping` in `dressingRoom.ts` and the
room term in `morale.ts`: a good room currently damps grievances rather than
adding cheer, which was the fix for the tax problem, and on this evidence the
damping is too weak to show up against the noise of a season. Worth measuring
before tuning — the upside has now been wrong twice, once by design and once
by instrument.



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

**A third diagnosis, also wrong, recorded so it counts as a third.** The
absorption theory: that `FREE_AGENT_TARGET` parks clubs at 21 and the ability
ceiling blocks the ones below the floor. Both are hypothesis 1 and hypothesis 2
above, already disproved here, and they were changed in code anyway before this
file was re-read — the ceiling lift has since been reverted, with the reason
written at the line so nobody lifts it a third time. The window-gating of the
reserve gap was kept, because outside a window a short club genuinely cannot
buy anybody, but it should be understood as a realism change and not as a fix:
measured over ten seasons it moved mid-season squads from 24.1 to 24.3.

**What the season-four cliff actually is.** `scripts/churn.ts`, compact world,
six seasons: senior releases run 84, 210, 501, then **1,312** in season four.
The keep-or-release threshold was a staircase in age — rank 24 up to age 24,
20 to 28, 15 to 31, 8 above — applied to a world whose players age in lockstep
from a mean of 24.4. The whole distribution crosses 28 in the same summer and
31 in the same summer. It is a slope now, and contract lengths carry a
per-player jitter so the world stops re-synchronising its expiries.

**And the headline number was the wrong one all along.** Mid-season squads
settle at 24.3, which is `TARGET_SENIOR_SQUAD`. The rollover figure this entry
is built on is sampled at week 1 — five weeks before the first fixture, before
recruiting has run once — and by week 15 the smallest club in the world is at
the emergency floor. `scripts/namedcheck.ts` closed the other half: `named`
tracks the count of players aged 21 and over almost exactly, 19.9/19.9 at
kick-off to 17.2/17.2 at season ten, and at worst 37 of 238 clubs hit any
registration limit. What is really happening is that the world **drifts
young** — 21+ players 19.9 to 17.2, homegrown 13.4 to 8.1 — which is a
different defect and is recorded in the roadmap under Known defects.

### The world drifts young, and five fixes have failed

`driftcheck.ts` counts the flows across the line that matters. Per club per
season, into and out of the 21-and-over pool: **1.4 age in, 1.0 signed in, 2.7
leave.** Net minus 0.3 a season, which over twenty seasons takes a club from
20.8 professionals to 14.2 while under-21s rise from 6.0 to 9.4 and every adult
band collapses — 25-28 worst, 7.9 down to 4.1. Retirement accounts for only 1.2
of the 2.7 leaving.

**Five attempts, all reverted or shown not to bite:**

1. *Contract-length jitter and renewing a year early.* Kept — correct on its
   own terms — but moved the number by a third of a player.
2. *A readiness bar on academy promotion.* Regression: promotions fell up to
   38% but blocking one did not produce a signing, so clubs ended up shorter.
   Clubs below the emergency floor went 34 to 54. Also the wrong idea —
   there is nothing wrong with a recruit being the worst player in the squad,
   and `development.ts` improves him from there.
3. *Under-21s not counting against the squad target.* The arithmetic was exact
   — 24.3 squad minus 7.1 under-21s is 17.2 — and the fix was still worth only
   +0.4 at season ten, with homegrown slightly worse. Kept for the rule, not
   the result. Its first form was a plain error that made things worse by
   removing the only brake on promotion.
4. *Reading the softened wage demand.* Clear regression, 14.2 to 9.5, because a
   released academy boy's stored demand is a sixteen-year-old's, so the budget
   filter waved teenagers through and kept rejecting professionals.
5. *A wage discount multiplier with a quality-scaled floor.* Signings did rise
   — 1.02 to 1.37 a club a season, and 1.5-1.9 in the middle years — and
   releases rose with them, 2.66 to 2.87. Net worse: 12.9 against 14.2.

**What attempt five actually revealed, and the hypothesis to test next.** Every
attempt to raise the inflow has been met by a matching rise in the outflow.
That is the signature of a *budget* constraint rather than a supply or
willingness one: a club can afford about twenty-four players' wages, so cheap
free agents coming in force existing professionals out at renewal, and the age
composition drifts young because young players are cheap. The 21-and-over
decline may simply be the wage bill finding its level.

If that is right the fix is not in recruiting at all, and nothing in
`aiSquad.ts` will ever move it. The things to measure are whether wage budgets
keep pace with revenue across a long save, and whether the squad-cost ratio
pushes clubs toward youth by construction. **Nothing should be changed in
recruitment until one of those is measured** — five confident diagnoses have
already been wrong here, which is more than any other entry in this file.

**What is worth measuring next**, before anything is changed: why recovery from
the roll is getting slower. The candidates are the bunching of contract lengths
at generation, the renewal pass (weeks 26-46) letting ~1,600 players a season
reach expiry at all, and the per-week limits on free-agent recruitment. Nothing
should be tuned until one of those is shown to be the cause — two confident
diagnoses have already been wrong here.

## Fixed

### A club short of players starts the match with ten
Worse than reported. `selectTeam` walked a fallback ladder whose last rung was
every owned or borrowed player with **no filter at all**, so before it ever
fielded ten it would field an injured man, a suspended man, one away with his
country, or one on loan at another club that same week — putting a player in
two teams on the same Saturday. And if even that came up short, the slot loop
filled what it could and returned a nine-man side with nothing anywhere told.

The bottom rung is now everyone actually available. Below eleven is somebody
else's problem to have solved before kick-off, and `matchday.ts` is where it
gets solved. **Nothing forfeits** — a league that cannot fulfil its own
calendar is a broken world, not a hard lesson — but the two sides of the game
answer for it very differently:

- **An AI club fixes itself**, in the order a real club reaches: the academy
  first, because those players are already there and already registered; then
  a free agent, capped at a quarter above the best player already at the club,
  so the fix stays in proportion; then, as an admission, an invented local
  sixteen-year-old with nothing to recommend him but a pulse and a
  registration.
- **The human is answerable.** The club secretary no longer signs free agents
  for him below the emergency floor — that quietly removed the only
  unarguable failure condition the game had. He is warned the moment his squad
  cannot field eleven, checked against the week his next fixture is played
  rather than this one, and dismissed if it is still true on the morning of the
  match. The club then becomes an AI club and assembles a side in time to kick
  off, which is why the fixture still stands.

Failing to put eleven players on a pitch is the one thing a director of
football is unambiguously employed to prevent, so it is the one thing he is
sacked for outright rather than warned about twice.


### Every squad becomes half-foreign within four seasons
`domesticBias` had reached free-agent recruiting and the human's scouting
shortlist, and three channels ignored it entirely: world generation set squad
nationality from league reputation alone, AI transfer targeting picked purely
by ability, and academy intake was a flat one-in-eight everywhere. Transfers
are the channel that rebuilds a squad, so every club in the world bought
nationality-blind and every stated policy converged.

Measured after four seasons, before and after:

| policy | before | after |
|---|---|---|
| Homegrown | 45% | **34%** |
| Develop and sell | 36% | 39% |
| Value hunting | 45% | 47% |
| Win now | 49% | 53% |
| Star names | 47% | **57%** |

The spread goes from thirteen points with homegrown mid-pack to twenty-three
with homegrown lowest and star names highest — the policies now order the way
they read. Homegrown also holds 33% to 34% across the four seasons rather than
drifting, which is the part that matters: a stated policy keeps its shape.

The transfer term is a weight rather than a filter, so a homegrown club will
still sign the foreigner who is plainly better. He just has to be plainly
better. If 34% still reads as too cosmopolitan for a club whose policy says
"from this country", the tilt is one constant.


### A pre-v4 save could not be loaded at all
Found the moment the migration tests existed. `migrate()` walks the version
steps in ascending order, but the v2 step rebuilds squad lists through
`autoRegister`, which asks whether the club is under a registration embargo —
and the regulation record that question reads is created by the **v4** step.
So a genuinely old save threw a TypeError on load. `embargoedSince` now treats
a missing record as no sanctions, which is the right answer as well as the safe
one. Fixed, and covered by a test per historical version.

### Save export and import were written but unreachable
`exportSave` and `importSave` had existed in `src/storage/saves.ts` since it was
written and nothing in the UI called either, so a player had no way to back a
career up or move it to another device. The exporter also serialised
uncompressed, which would have handed over a ~50 MB file where the stored save
is ~5 MB. Both are now in Settings under Backup, the exporter writes the same
compressed bytes the device holds, and the importer accepts either shape,
migrates on the way in and lands in a slot of its own.


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
