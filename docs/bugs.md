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


### ~~The dressing room is a tax again~~ — fixed, and the reason was the origin
A leader was worth −0.21 morale and a disruptive player −2.62: no upside at
all, which is exactly the failure the roadmap warns about.

**The cause was that both halves measured from zero.** An ordinary squad reads
a tone of **0.78** — measured across 238 clubs: median 0.78, mean 0.78, tenth
percentile 0.07, ninetieth 1.47, and only fourteen clubs below zero anywhere in
the world. So the bad-room penalty, which only fired below zero, reached six
per cent of clubs; and the good-room reward was measured from an origin every
squad had already passed, leaving a few per cent of one term between a median
room and a top-decile one.

**The fix is where it is applied, not how hard.** Both previous attempts pushed
on the weekly morale drift, and morale reverts to its baseline at six per cent
a week — so the mechanism whose whole job is to erase transients was erasing
them. `roomBaseline` shifts the baseline instead, centred on the measured
neutral and symmetric in both directions. A well-run squad is not a squad
having a good week; it is a squad that is a better place to be.

Twenty seeds, one senior player's traits swapped:

| | before | after |
|---|---|---|
| leader | −0.21 | **+1.24** |
| professional | +0.06 | **+0.47** |
| disruptive | −2.62 | **−0.97** |
| disruptive + hothead | — | −1.06 |

Monotonic across all five conditions, and the upside is now larger than the
downside. The downside shrank, which is the honest cost of making it symmetric.

An eight-seed run of the same thing put `professional` at −0.49, below doing
nothing, and read as an inversion. It was noise; twenty seeds ordered cleanly.
This file already carries two entries about small samples in this project, and
that is now three.


### The world drifts young and the roll never heals — the grounds were falling down
**Found, and largely fixed.** Six attempts failed before this because all six
were aimed at recruitment. The chain runs the other way entirely, and it starts
somewhere nobody had looked.

**`stadiumProject` was only ever set by the human.** No AI code path anywhere
started building work — `grep` for it outside `stadium.ts` returned nothing. So
every stand at all 237 other clubs decayed at 3.5% a week for ever, the safety
officer closed places 12% at a time up to 60% of a stand, and not one of them
was ever repaired. Over fourteen seasons average capacity fell **27% in the top
flight and 45% in the fourth tier**.

Matchday income is capacity times a rate, so it went with it: −34.6% in tier 1,
−54.4% in tier 4. That is the largest revenue line in the game, halved. Which
shrank the wage budgets, which priced adult professionals out of the lower
divisions, which left fourteen hundred of them unsigned while squads ran four
to five men short and filled the gaps from the academy.

The young drift, the roll that never healed and the shrinking economy were one
defect: **nobody was looking after the stadiums.**

`maintainStadium` gives an AI club the same behaviour a director has, and no
better — it repairs its worst stand on the same panel of architects, at the
going rate, in cash, never while in crisis, and never more than 35% of its
balance at once.

| tier | matchday, before → after | adults per club lost over 14 seasons |
|---|---|---|
| 1 | −34.6% → **−4.5%** | −1.8 → **−0.7** |
| 2 | −27.3% → **+41.6%** | −4.8 → **−1.0** |
| 3 | −12.7% → **+19.1%** | −7.4 → −6.3 |
| 4 | −54.4% → **+0.6%** | −9.1 → −7.3 |
| 5 | −46.2% → −17.1% | −10.8 → −8.7 |

And it makes clubs *richer*, which is the honest test of whether a ground is
worth maintaining: after fourteen seasons, mean capacity 17,040 → **24,182**,
mean balance £155.3m → **£165.9m**, and clubs in crisis **5 of 238 → 2**. The
seats pay for the repairs several times over, which is why real clubs do it
without being asked.

**Then measured again, and the remainder is a different question.**

Affordability is not what stops the poorest clubs. After twelve seasons a tier
5 club holds £3.98m against a cheapest repair of £29,955, and 22 of 22 can
cover one outright. Worst-stand condition sits at 58–62 in every tier, above
the threshold that calls the builders — the maintenance is working.

And the residual decline is **front-loaded, not ongoing**. Adults per club by
season, after the fix:

| tier | s1 | s3 | s7 | s10 | s12 | s14 |
|---|---|---|---|---|---|---|
| 3 | 20.3 | 21.3 | 16.3 | 15.3 | 14.8 | 14.0 |
| 4 | 19.5 | 19.7 | 16.5 | 12.5 | 11.3 | 12.2 |
| 5 | 19.8 | 14.0 | 10.9 | 11.5 | 12.4 | 11.1 |

Tier 5 stops falling at season seven and holds around eleven. Tier 4 settles
near twelve. Tier 5's matchday income does the same thing: 21,856 down to
17,715 by season four, then back up to 18,111 by season fourteen — the −17%
headline is an initial settling with ten stable seasons behind it.

**So the world is generated richer than its own economy can sustain, and
spends six to twelve seasons finding its level.** The first reading of that was
that generation is wrong and the equilibrium honest. **That reading was wrong,
and both halves of it were wrong.**

*What the squads actually settle into.* Mean per club at tier 5 after twelve
seasons — 20.0 players, of whom:

| 16–17 | 18–20 | 21–23 | 24–27 | 28–31 | 32+ |
|---|---|---|---|---|---|
| 2.5 | **7.9** | 3.8 | **1.6** | **2.0** | 2.3 |

Eight eighteen-to-twenty-year-olds, and a prime-age core of **3.6 players
between 24 and 31**. That is not a non-league football club, it is a youth team
with a few veterans in it. No level of the pyramid looks like that.

*What a real one looks like.* The average squad across the National League
System is **23 players**, against 26 at professional clubs, and the majority of
National League (tier 5) sides are **fully professional** — several are former
EFL clubs. So a fifth-tier club is around twenty-three players and most of them
are full-time, not eleven adults propped up by an academy.

That figure is on the record because the earlier version of this entry asserted
the opposite — "eleven full-time adults plus an academy may be the more honest
world", and "most of them are part-time" — with nothing behind it. No source
was found for the *age profile* of National League squads, so nothing here
claims one; the composition above is condemned on its own terms rather than
against a measured target.

**So the equilibrium is the defect, not the opening position.** Generating
smaller lower-league squads would have made the game agree with a number that
is wrong. The work is at the bottom of the economy: a tier 4 or 5 club has to
be able to keep about twenty players, most of them grown men.

**A separate finding from the same run: the loan system does nothing.** Players
loaned out and loaned in are **0.0 per club in every tier** at equilibrium.
Loans are the obvious way a young player gets games and a thin club gets
cover, and at twelve seasons in there are none anywhere in the world.

**A related oddity the same run turned up:** clubs are hoarding enormous sums.
Mean balance after twelve seasons is £207m in the top flight and £30m in tier
3. Nothing in the game makes a club spend down a balance that size, so the
squad-cost rule and the wage budget are the only brakes and the cash just
accumulates.

**Still open, and stated plainly: this does not finish the job.** The top two
tiers are close to flat now, but the bottom three still shed six to nine adults
over fourteen seasons and tier 5's matchday income still falls 17%. The roll
improves rather than heals — the hole at week one goes 4.8 to 4.5 players and
recovery 12 weeks to 10 — and around seventeen hundred players are still
unattached at week 16. The poorest clubs cannot afford repairs even at a third
of their balance, so the decay outruns them.

The next thing to look at is the bottom of the pyramid specifically: whether
tier 4 and 5 clubs can ever fund a repair, and why revenue there still falls
when it now rises everywhere else.

**A hypothesis that was wrong, recorded because it was tested.** Before finding
the stadiums, the suspicion was ability inflation: wage demand is
`(ability/100)^4.5`, so a 15% rise in mean ability would be an 86% rise in
wages on its own, which matched the observed +79–92%. Measured, mean adult
ability moved −5.1% to +3.3%. It was not the players getting better. It was the
grounds falling down.

**One smaller fault still open from the same runs:** season one's budget is a
fantasy — tiers 3, 4 and 5 open at 128%, 143% and 158% of revenue, then
collapse by about 60% in season two once a real ledger exists.

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
