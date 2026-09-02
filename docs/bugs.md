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

### Every club in the world was permanently out of wage room
The rest of the hoard, and not where I said it was. I put it down to the wage
budget being a share of *revenue* and therefore blind to the bank — true, but
`recalculateBudgets` already released 15-75% of reserves into the **transfer**
budget, so on paper these clubs were handed a fortune every year. So
`scripts/spendcheck.ts` counts rather than reasons. At equilibrium:

| tier | budget granted | actually spent | wage bill vs allowance | clubs with no wage room |
|---|---|---|---|---|
| 1 | £72.0m | £25.1m (35%) | 99% | **91%** |
| 2 | £29.4m | £5.1m (17%) | 98% | 89% |
| 3 | £12.3m | £2.0m (16%) | 104% | 94% |
| 4 | £5.1m | £0.7m (13%) | 105% | 99% |
| 5 | £1.7m | £0.1m (9%) | **114%** | **100%** |

A transfer budget is worthless to a club that cannot fit another wage in, and
91-100% of clubs in every tier could not. Tiers 3 to 5 were over their
allowance outright. And tiers 2 to 5 recouped more than they spent — forced
net sellers, banking the difference where nothing in the game could reach it.

The fix is that reserves fund wages. A club with money behind it can carry a
bill this year's income would not support, because the reserves cover the gap;
that is what having money *is*. Half a season of turnover is kept back as a
buffer and a fifth of the surplus above it becomes wage capacity each year,
added to **both** the allowance and the revenue ceiling — adding it to the
allowance alone would have the ceiling clip it straight back off, which is the
change that would have looked like it worked while doing nothing.

It is self-limiting: spending the reserves down shrinks the release, which
returns the club to what it earns.

| tier | balance before | after | transfer spend before | after | wage bill |
|---|---|---|---|---|---|
| 1 | £187.7m | £105.0m | £25.1m | £31.2m | +25% |
| 2 | £76.3m | £61.5m | £5.1m | £12.3m | +22% |
| 3 | £30.1m | £15.7m | £2.0m | £1.7m | +5% |
| 4 | £14.0m | £6.7m | £0.7m | £1.1m | +39% |
| 5 | £4.8m | £3.1m | £0.15m | £0.31m | +19% |

Financial crisis at 0-1% of clubs and debt still negligible, so the money is
being spent rather than gambled. Tier 1 now buys more than it sells for the
first time.

**Still open.** Balances are down 19-52% but a top-flight club still holds
about 58 weeks of revenue against a real club's ten to thirty. The release
rate is deliberately slow — a board emptying the account into contracts it
must honour for years is how clubs actually die, and the wage floor means a
bill once raised cannot be cut — so this is a dial that can be turned further
once there is evidence the world survives it. Lower-league clubs also remain
net sellers, which is realistic but keeps their balances drifting up.

### Clubs sit on years of turnover and nothing ever asks them to spend it
`scripts/hoardcheck.ts`, twelve seasons, sampled at week 50 before the roll
resets the ledger. Every tier runs a persistent surplus of 3–14% of income and
the balance climbs without limit — measured in weeks of revenue, so the figure
means something:

| tier | balance, season 1 | balance, season 12 | season 12 income | of which, on the ground |
|---|---|---|---|---|
| 1 | 4 weeks | 94 weeks | £105.9m | £44,204 |
| 2 | 6 weeks | 115 weeks | £59.4m | £96,774 |
| 3 | 9 weeks | 141 weeks | £17.9m | £9,611 |
| 4 | — | 140 weeks | £6.1m | £4,601 |
| 5 | — | 134 weeks | £2.5m | £3,591 |

A tier 1 club earns £105.9m a season and spends £44,204 of it on the ground —
four hundredths of one per cent. That is not a club deciding not to build; it
is a club nothing has ever asked to. Wage budgets are capped as a share of
*revenue*, so a bank account holding two and a half years of turnover is
invisible to every other spending decision in the game, and capital work is
the only thing that can touch it.

**And the demand signal I said did not exist, does.** The obvious trigger is
"build when the ground is full", so I wrote `expandStadium` on the demand
implied by `computeAttendance`, which clamps fill at capacity and throws the
excess away. I then measured the clamp with a hand-rolled copy of the formula,
got a maximum fill of 0.925 anywhere in the world, concluded no club ever sells
out, and reverted the change as unfireable code. That measurement was wrong: it
left out `opponentDraw`, which is worth up to +0.12 and is near its ceiling for
most top-flight fixtures. `computeAttendance` is now exported so the diagnostic
calls the real function, and the second half of `hoardcheck.ts` samples it
across every fixture-shaped pairing in every league:

| tier | mean fill | p90 | max | mean fanbase | pairings over 0.95 |
|---|---|---|---|---|---|
| 1 | 0.868 | 0.992 | 1.000 | 67.6 | **518** |
| 2 | 0.802 | 0.914 | 1.000 | 56.6 | 23 |
| 3 | 0.692 | 0.777 | 0.906 | 44.0 | 0 |
| 4 | 0.595 | 0.679 | 0.785 | 33.0 | 0 |
| 5 | 0.535 | 0.628 | 0.686 | 22.5 | 0 |

Top-flight grounds sell out routinely — a p90 of 0.992 and 518 fixtures at or
over 0.95 — and the clamp at 1.000 is silently turning supporters away. Tiers
3–5 at 0.69 / 0.60 / 0.54 never fill and are roughly right for real lower-league
football, which is the correct answer for them: those clubs should not be
building.

So the demand signal is real, it is where it should be, and `expandStadium`
was reverted for a reason that did not survive being measured properly. The
lesson is the one this project keeps relearning: measure through the real
function, not a copy of it.

**What the wired version does, measured.** `Stadium.selloutsThisSeason` counts
home matches the ground filled — recorded on matchday, because the clamp
destroys the excess demand and it cannot be recovered afterwards — and
`expandStadium` rebuilds the smallest stand 18% larger when a club has six full
houses, the money in the bank and no other work under way. Twelve seasons,
`scripts/buildcheck.ts`:

| tier | clubs | full houses per club per season | expansions started | capacity vs start |
|---|---|---|---|---|
| 1 | 144 | 1.3 | 35 | +2.1% |
| 2 | 24 | 0.2 | 1 | −0.7% |
| 3 | 24 | 0.0 | 0 | −0.4% |
| 4 | 24 | 0.0 | 0 | 0.0% |
| 5 | 22 | 0.0 | 0 | −0.5% |

It works, it only fires where it should, and it is far too weak to matter: 35
projects across 144 clubs in twelve seasons, and the balances are untouched.

**And that is the same defect one layer down — but not where I said it was.**
I put the shortfall at "0.868 mean fill against a real 95-98%". That figure is
tier 1 *worldwide*: 144 clubs, the top flight of every nation in the game, with
fanbases from 35 to 99. Comparing its mean to the Premier League is
meaningless, and it is the second time in this investigation that an
aggregation over the wrong population produced a confident wrong answer.

Split out properly by `scripts/attendancefit.ts`, England's top flight was
already at **0.95** mean fill. The real gap was never the mean — it was the
*shape*. The real Premier League runs at
[97.6-98.8% utilisation](https://www.insideworldfootball.com/2025/12/10/match-week-15-premier-league-stadium-capacities-average-97-55-full/)
and sells out nearly every week; the game sold out 31% of fixtures. And the
divisions below were already about right against real attendance over real
capacity, so a correction had to reach the top flight without touching them:

| curve | eng t1 | other t1 | t2 | t3 | t4 | t5 |
|---|---|---|---|---|---|---|
| real world | 0.98 | ~0.80 | 0.79 | 0.67 | 0.61 | ~0.47 |
| before | 0.95 (31% full) | 0.87 | 0.80 | 0.72 | 0.63 | 0.57 |
| steepen the whole curve | 0.98 (73%) | 0.87 | 0.74 | **0.58** | **0.45** | **0.38** |
| add a `fanbase^4` term | 0.99 (72%) | 0.91 | 0.83 | 0.73 | 0.63 | 0.57 |

Steepening the existing term fixes one division by wrecking four. A separate
term at the fourth power is worth 0.001 at a fanbase of 20 and 0.06 at 50, so
it lands almost entirely on the clubs that were wrong. That is what shipped,
and it deliberately pushes top-flight demand to about 1.10 of the ground:
the surplus is the point, because the clamp turning supporters away is the
only signal `expandStadium` has.

Top-flight full houses went from 1.3 a season to 6.7, expansions over twelve
seasons from 35 to 258, and tier 1 facilities spend from £44,204 to
**£6,823,480** against a season income of £128.1m.

### AI stadium expansion ran away, because demand is a share of capacity
Caught by extending `scripts/buildcheck.ts` from twelve seasons to thirty
before shipping the curve above. Top-flight grounds reached an *average* of
**103,849 places** — larger than any stadium on earth — having grown 199%:

| | expansions | capacity after 30 seasons | vs start |
|---|---|---|---|
| uncapped | 610 | 103,849 | +199.2% |
| capped at the catchment | 227 | 39,564 | +17.0% |

The cause is structural, not a mis-set number. `computeAttendance` returns a
*share* of capacity, so a ground that doubles fills to the same fraction, sells
out again, and is expanded again. Nothing in that loop can ever be satisfied.

The stopgap is the limit the world model already states — "a big club in a
small city is capped by its catchment" — which was previously inlined in
`worldGen` and is now `naturalCapacity` in `stadium.ts`, used both to size a
ground at generation and to stop `expandStadium` building more than 15% past
it. Reputation is an input, so a club that climbs the pyramid earns a bigger
ceiling rather than being held to the one it started with.

**Fixed properly rather than bounded.** Attendance is now a headcount. Demand
is computed against the crowd the club could draw — its catchment and its
standing, via `naturalCapacity` — and the ground only ever limits it:

```
support = naturalCapacity(reputation, citySize)
wanted  = support * (0.42 + f*0.4 + f^4*0.3 + mood*0.16 + opponentDraw + noise)
crowd   = min(capacity, wanted)
```

A club whose ground is the size its catchment implies draws exactly the crowd
it always did, so the calibration above is untouched — but a club with a small
stadium now sells out and turns people away, a club that has over-built plays
in front of empty seats, and closing a stand costs real income instead of
quietly reducing demand to match.

The catchment ceiling came back out. It is not needed: the loop closes on its
own, which is visible in the one number that could never move before —

| | expansions | capacity at 30 seasons | full houses per season |
|---|---|---|---|
| share of capacity, uncapped | 610 | 103,849 (+199.2%) | 7.0 |
| share of capacity, ceiling bolted on | 227 | 39,564 (+17.0%) | 6.9 |
| **headcount** | 294 | 45,258 (+33.7%) | **3.2** |

Under the old model clubs sold out seven times a season for thirty seasons no
matter how much they built, because building could not satisfy demand. Now
full houses *fall as grounds grow*, which is what a working feedback loop looks
like. The only remaining bound is `MAX_STADIUM`, the physical size of the
largest grounds in the world, which generation was already using.

It also reaches down the pyramid for the first time: tier 3 clubs started
expansions of their own, which is a club whose support outgrew its ground
rather than one that happens to be in the top flight.

**And a club can now build for its demand, which it never could before.** The
expansion step was 18% of the existing ground — a fixed fraction, because
under the old model there was no demand figure to aim at. It could only
overshoot: a club 10% oversubscribed added 18%, and the top flight settled at
0.81 fill, *below* where it started. `typicalCrowd` is now the single
definition of how many people a club draws — `computeAttendance` builds the
matchday figure on it and `expandStadium` sizes the stand against it, at 1.05
times the ordinary crowd, so the big fixtures still sell out and a normal
Saturday is nearly full:

| expansion sized as | capacity at 30 seasons | tier 1 fill after 12 |
|---|---|---|
| 18% of the existing ground | +33.7% | 0.809 |
| 1.05 x the crowd it draws | **+11.5%** | **0.915** |

`tests/attendance.test.ts` pins the property. Four of its five assertions were
checked against the old model and fail there — the fifth is marked in the file
as true under both, because a test that passes either way is worth nothing.

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


### The bottom of the pyramid could not afford anybody, and now it can — but it still signs boys
**Half fixed, and the half that is not is written down.**

**What was blocking it, measured rather than guessed.** `scripts/recruitgates.ts`
counts every gate in `recruitOne`. Across seasons nine to twelve, world-wide,
per season:

| | |
|---|---|
| chances to sign | 12,391 |
| no registration place free | 4,279 (34.5%) |
| did not bother that week | 1,619 (13.1%) |
| **looked at the whole pool and found nobody it could take** | **6,092 (49.2%)** |
| signed somebody | 402 (3.2%) |

And the reason, counted per candidate examined: **the wage gate rejected 5.37
million a season**, more than the ability ceiling's 3.28 million, against 13,658
refused on willingness and *zero* on being beneath the club's standard.

Half of all attempts to sign anyone ended with a club reading the entire
free-agent list and being able to take none of it. That is why squads filled
from the academy: a boy is free.

**Why it could not afford them.** The league wage factor was a straight line,
`0.04 + (reputation / 100) * 4.96`, spanning 1.13 at the bottom of the pyramid
to 3.51 at the top — a range of **3.1** against a weekly revenue range of
**47**. Measured at twelve seasons a fifth-tier club took £36,510 a week, earned
£1,995 of that per player and paid £1,517 for him: **76% of the revenue he
represents**, against 47% in the top flight. Its board was allocating **87% of
revenue** to wages, well past the 55–75% this project calls real, and still
afforded eighteen players.

The curve bends now — `LEAGUE_WAGE_CURVE = 1.35`, scaled so the top flight is
exactly where it was, so this is a redistribution and not a devaluation.

| tier 5, at twelve seasons | before | after |
|---|---|---|
| budget as a share of revenue | 87% | **67.5%** |
| headroom, budget minus bill | £234 | **£1,570** |
| players | 18.3 | 19.8 |
| wage per player | £1,517 | £1,049 |

Tier 1 is unchanged by design. Tier 4 gains too: 21.9 players to 24.7, and its
24–31 band 4.0 to 5.6.

**What it did not fix: tier 5's age profile.** The 24–31 band is still **3.6**.
The extra places went to eighteen- to twenty-three-year-olds. So the money was
one binding constraint and there is a second one behind it, which the same
measurement points at: the free-agent pool is shaped young. `releaseUnpromotedYouth`
tips every unpromoted academy player onto the market each summer, and
`recruitOne` scores candidates on `currentAbility`, so a club takes the best
available and the best available is a nineteen-year-old.

That is the next step, and it is a supply problem rather than a money one:
**who becomes a free agent**, not what they cost. Recorded here rather than
guessed at, because six diagnoses of this defect have already been wrong and
this is the seventh measurement that has changed the answer.

**Not true, though it was claimed here twice:** loans are not dead. See the
correction below.


### A player with no club never got any worse, and it froze the lower leagues
**The supply half of the drift, and a correction to the entry below it.**

**What the last entry got wrong.** It said the wage gate was the binding
constraint, on a world-wide count of 5.37 million budget rejections against the
ability ceiling's 3.28 million. That is true and it is misleading: 144 of the
238 clubs are in the top flight, so a world-wide count is mostly a report on
the one tier that was already working. Split by division, the binding gate
**flips**:

| tier | attempts finding nobody | rejected "too good" | rejected on budget |
|---|---|---|---|
| 1 | 38% | 517,845 | **3,308,245** |
| 3 | 67% | 447,978 | 714,095 |
| 4 | 78% | **907,842** | 443,484 |
| 5 | **88%** | **1,227,359** | 175,306 |

At the bottom of the pyramid the ability ceiling rejects seven candidates for
every one the budget rejects, and only **four attempts a season** are blocked
for want of a squad place. This is the measurement `aiSquad.ts` demands in its
own comment before anybody touches that ceiling again — and the answer is not
to lift it. It is that the pool is full of players too good for the clubs that
need them.

**Why the pool stayed too good.** `developPlayer` returns immediately for a
player with no club, so an unattached player's ability was **frozen for ever**.
A twenty-six-year-old released by a second-tier side sat at his old rating
indefinitely: too good for the fourth tier to sign, not wanted by the second.
Fourteen hundred of them accumulated.

The wage demand already softened 7% every four weeks — the mechanism that is
supposed to let a released player end up in non-league. Softening the price
without softening the player was half a mechanism. A man out of the game does
not stay the player he was.

He now loses 1% of his ability on the same four-week cadence, floored at 30 —
about twelve per cent over a season unattached, which brings a man released by
the second tier within reach of the fourth inside a year. That is the rate
careers really do come down the pyramid at.

| tier 5 | before | after |
|---|---|---|
| attempts finding nobody | 88% | 84% |
| rejected "too good" | 1,227,359 | **808,142** |
| signings a season | 39 | **50** |
| players aged 24–27 | 1.6 | **2.9** |
| players aged 24–31 | 3.6 | **4.9** |

Tier 4's 24–31 band goes 5.6 to 6.2 and its signings 47 to 55. Tier 1 is
unmoved.

**It does not reach the acceptance test and is not claimed to.** The roadmap
asks for eight or more players aged 24–31 at tiers 4 and 5; this gets tier 5 to
4.9 and tier 4 to 6.2. Tier 3 is fractionally worse (7.3 to 6.5). It is real
movement on the right axis rather than a finished job.

**Two more hypotheses tested and discarded. Both are recorded so nobody
retries them.**

*Stretching the ability ceiling for a long-unattached player.* The obvious next
move, and well motivated: the "will not sign above its station" rule was
written for the transfer market, where the seller has options, and a man nobody
has called in eight months has none. An ex-league professional turning out in
non-league is one of the most familiar things in English football. Tried at up
to +35%, scaled on `weeksUnattached`.

It made things **worse**, and the reason is worth keeping:

| tier 5 | before | with the stretch |
|---|---|---|
| aged 24–31 | 4.9 | **4.1** |
| signings a season | 50 | 39 |
| rejected "too good" | 808,142 | 482,651 |
| rejected on budget | 423,666 | **964,955** |

The gate simply moved. Clubs considered better players they still could not
pay for, so the rejection went from the ceiling to the budget — and the tier
that *could* pay took the benefit. Tier 3's 24–31 band rose 6.5 to 7.6 while
tiers 4 and 5 both fell. Relaxing a quality limit helps whoever has money,
which is always the division above.

*Reordering promotion and recruitment.* `promoteFromAcademy` runs
before `recruitFreeAgents` every week, so the free seventeen-year-old takes the
place before the market is consulted — an obvious ratchet. Swapping the order
did essentially nothing and made tier 5 slightly worse: its 24–31 band went 3.6
to 3.4 and promotions actually *rose*, 2.99 to 3.15, because recruitment
declines most weeks by design and promotion fires anyway. Reverted.

**Where that leaves it.** The acceptance test — eight or more players aged
24–31 at tiers 4 and 5 — is not met: tier 4 is at 6.2 and tier 5 at 4.9. Three
things have now been tried against the remaining gap and only one worked. What
the failures have in common is that both tried to change *who a club would
accept*, and the constraint is what a club can *pay*. The next idea should
address that or it will meet the same wall.


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

**A claim from the same run that was wrong, and is corrected here.** This
entry said "the loan system does nothing — players loaned out and loaned in are
0.0 per club in every tier at equilibrium".

That was a sampling artefact, and the same one this file already records for
squad size. The measurement ran whole seasons and read the world at the end of
the last one — which is immediately after the season roll, and the roll returns
every loan. Loans are created with `loanUntilSeason: state.date.season`, so
they all expire at the next roll by design. The one moment of the year when
the number is guaranteed to be zero is the moment it was read.

Watched across a season instead, world-wide, 238 clubs:

| week | 2 | 5 | 9 | 29 | 45 | 49 | roll |
|---|---|---|---|---|---|---|---|
| out on loan | 29 | 137 | 170 | 253 | 306 | 325 | **0** |

And they do their job. `processAiTransfers` picks a player aged 22 or under
with **fewer than three appearances** and sends him somewhere he will play. At
week 45 of season eleven, 307 such players were out on loan on a mean of
**13.7 appearances**, with 135 of them past ten. They were chosen for not
playing and they ended the season playing.

The one honest observation left is a calibration one rather than a defect: 325
loans across 238 clubs is about 1.4 per club at the peak, which is on the low
side against real football. Not acted on — there is no evidence it is wrong,
only that it is small.

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

## Fixed

### Season one's wage budget was a fantasy, and nothing else ever used the formula
Tiers 3, 4 and 5 opened at 128%, 142% and 157% of revenue over fourteen
seasons, then fell by around 60% in season two. Tier 1 opened at a defensible
80%, so the lower a club sat the more imaginary money it started with.

There were two budget formulas. `recalculateBudgets` — revenue, minus running
costs, times the owner's share — sets the budget at every season roll and on
every division change. World generation used a different one: 58% of
`revenueScale`, the reputation-only proxy `createFinances` invents to size
sponsorship and balances, floored at 108% of the wage bill. Nothing used that
number again.

`scripts/budgetorigin.ts` measured both on the same untouched world, ten seeds,
before a week is played. `revenueScale/52` against `weeklyRevenue`: £106k
against £38k in tier 5, £220k against £89k in tier 4, £492k against £222k in
tier 3 — but £1.16m against £1.68m in tier 1. Reputation grows faster than gate
receipts, so a fixed share of the proxy is not a fixed share of income, and it
is wrong in opposite directions at the two ends of the pyramid. On the same
worlds the board routine gave 82%, 86%, 66%, 51% and 51% of revenue by tier
against generation's 84%, 101%, 128%, 144% and 163%.

Generation now calls `recalculateBudgets` like everything else. `wagedrift.ts`,
fourteen seasons, season one then season two: tier 3 128%→67% became 61%→66%,
tier 4 142%→57% became 54%→55%, tier 5 157%→58% became 50%→55%, tier 1 80%→80%
became 79%→77%. The cliff is gone and season one now sits inside each tier's
own long-run band. `bill/bud` opens at 103–108% instead of 37–52%, matching
every later season.

**A limit, stated:** half to three quarters of clubs now open with their budget
resting on the floor under it — the wages they have already committed — rather
than on an allowance their income could support. That is the same condition
that holds from season two onwards (`bill/bud` sits at 100%+ for every tier in
every later season), so this makes season one honest rather than comfortable.
Whether that equilibrium is itself right is the open question above, not this
one.


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
