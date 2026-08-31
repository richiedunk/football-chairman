# Mutation testing

Configured, never run. There is no baseline score in this document and no
claim about the quality of the suite, because nothing here has been measured.
What follows is the reasoning behind the configuration and an estimate of what
the first run will cost, so that whoever starts it knows what they are starting.

## What it tells you that coverage does not

Line coverage says a line ran while the tests were running. It says nothing
about whether any test would have complained if that line were wrong. A test
that calls `advanceWeek` and asserts the week went up covers several thousand
lines and defends almost none of them.

Mutation testing asks the second question directly. Stryker takes the source,
makes one small change to it — `>` becomes `>=`, a condition becomes `true`, a
block is emptied, a returned string becomes `""` — and runs the tests against
that changed code. If a test fails, the mutant is killed and something in the
suite is genuinely holding that line in place. If every test still passes, the
mutant survived, and there is a change you could make to the rules of the game
that nobody would notice.

In a simulation this is the interesting failure mode. The calibration bugs in
this project have all been found by running a script and reading the numbers,
never by a test going red; a surviving mutant in `finance.ts` or `registration.ts`
is the same class of blind spot found from the other end.

## What is in scope

- `src/engine/systems/*.ts` — the rule layer. Contracts, registration, finance,
  the board, transfers, regulation. Thirty-four files, about 8,600 lines of
  actual code.
- `src/engine/sim/cups.ts` — the draw and the round structure.
- `src/ui/colour.ts`, `playerName.ts`, `link.ts`, `advance.ts` — the four pure
  presentation helpers, each with its own fast test file.

## What is out, and why

The suite runs the tests once per mutant, so scope is the whole budget.

- **`src/engine/world/`.** Generation is large, and every mutant in it is
  covered only by tests that build a world first. It is also the part of the
  code least suited to this technique: what makes generation right is the shape
  of a distribution, which is what the scripts in `scripts/` measure, and a
  mutant that shifts a mean by two percent will survive a test that asserts a
  club has players.
- **`rng.ts`, `sim/match.ts`, `sim/selection.ts`, `sim/schedule.ts`,
  `season.ts`, `tick.ts`.** Nearly every test in the suite runs through these,
  so a single mutant pulls in the slowest tests there are. They are not less
  important; they are disproportionately expensive, and the run has to finish.
- **`.vue` files, `src/stores/`, `src/platform/`, `src/router.ts`,
  `src/main.ts`.** Nothing in the suite mounts a component. Every mutant would
  survive, and the score would be measuring the absence of component tests,
  which is already known and does not need a number to prove it.
- **`scripts/` and `tests/`.** Diagnostics, and the tests themselves.

## Running it

```
npm run mutation:quick   # the four src/ui helpers — minutes
npm run mutation         # everything in scope — see the estimate below
```

Anything narrower is a command-line argument away, and this is the useful
habit rather than the exception:

```
npx stryker run --mutate src/engine/systems/registration.ts
```

The HTML report lands in `reports/mutation/`. Both `reports/` and the
`.stryker-tmp/` sandbox are gitignored.

`incremental` is on, so a second run only re-tests mutants in files that
changed. The incremental state lives in `reports/`, which is not committed, so
a fresh clone always starts cold.

## How long a full run takes

Unknown, because it has not been run. The estimate is somewhere between four
and twelve hours on a four-core machine — an overnight job, not an afternoon
one. The reasoning, from measurements taken while writing this:

- A full `npm test` is 309 seconds of wall clock across four workers, and 754
  seconds of test time added up.
- The in-scope files hold about 8,600 lines of code, which for TypeScript
  usually produces somewhere between six and ten thousand mutants. Static
  mutants are ignored and uncovered ones cost nothing, so perhaps five or six
  thousand actually run tests.
- Most of those are cheap. A single test out of `tests/systems.test.ts` costs
  about two seconds start to finish, and most of the systems live there.
- The cost is concentrated in a few places. `tests/continental.test.ts` plays
  most of a season in `beforeAll`, so **any** mutant in `continental.ts` or
  `cups.ts` costs 112 seconds — those two files alone could be half the run.
  `tests/simulation.test.ts` costs 16 seconds to reach its first assertion, and
  `AI squad management > keeps squads playable across six seasons` takes 180
  seconds by itself.

If that is too much for a first sitting, the honest move is to cut
`continental.ts` and `cups.ts` out of `mutate` and run the rest; they are the
two files whose cost is out of proportion to everything else.

## The timeout, and why it is set so high

`timeoutMS` is 180 seconds, which looks reckless and is not.

Stryker allows `timeoutMS + timeoutFactor × (measured time of the tests being
run)` and treats anything slower as an infinite loop — and a timeout is scored
as a killed mutant. The measured time counts tests, not `beforeAll` hooks.
`tests/continental.test.ts` plays 46 weeks of a season in a top-level
`beforeAll` and then makes eighteen assertions that each report under a
millisecond: measured time near zero, real time 112 seconds. At the 5 second
default, every mutant in `continental.ts` and `cups.ts` would time out, every
one of those would be counted as killed, and the report would come back
flattering and wrong. That is the failure this number exists to prevent.

Being generous costs less than it appears to. Stryker counts how many times a
mutant is hit during the initial run and aborts at a hundred times that count,
so a genuine infinite loop is caught by the hit counter well before the clock
runs out.

## Before the first run

- The estimate above is an estimate. Start it when you can leave it, and watch
  the first few hundred mutants to see whether the real per-mutant cost matches.
- If the report shows a large number of timeouts, the timeout is still too low
  for some hook this was not measured against — raise `timeoutMS` rather than
  believing the score.
- The TypeScript checker rejects mutants that do not compile, and those are
  dropped from the total rather than counted. If the run reports an implausible
  number of compile errors, that is a configuration problem and not a result.

## The first run: `mutation:quick`, four UI files

The quick scope — `colour.ts`, `playerName.ts`, `link.ts`, `advance.ts` — came
back at **76.7%** (231 killed, 64 survived, 6 uncovered of 301 scored mutants).
Adding tests against the survivors took it to **92.4%**, and everything left is
the tail described at the bottom of this section.

| | before | after |
|---|---|---|
| colour.ts | 69.7% | 89.7% |
| playerName.ts | 87.0% | 100% |
| link.ts | 83.3% | 100% |
| advance.ts | 91.5% | 95.8% |
| **all four** | **76.7%** | **92.4%** |

### What the survivors were actually saying

**`bandIsReadable` was never asked to say no.** Replacing its body with
`return true` passed the entire suite, including the sweep that checks a
readable band for all 540 clubs in the pack. That sweep is the load-bearing
test in the file and it was resting on a function nothing had pinned in the
negative. It is the single most valuable thing the run found: line coverage on
`bandIsReadable` was total, and the assertion it supports was worth nothing.

**The `headerBand` decision tree was covered but not checked.** Almost every
test asserted a one-directional property — readable, dark enough, still
saturated — and a mutant that darkens, desaturates or recolours the band
differently satisfies all of them. So each of these passed the whole suite:

- always take the secondary rather than the primary (nothing tied the band's
  hue to the colour it came from);
- `Math.min` → `Math.max` on the saturation cap (nothing enforced the ceiling,
  and nothing checked that a muted club stays muted);
- never lift a near-black, and lift it *downwards* (see below);
- `&&` → `||` on the black-kit cast, so every low-saturation club got a tint;
- `||` → `&&` on the split-strip gate.

**A test was named for a branch it did not reach.** "lifts a near-black primary
instead of clamping it into the ground" used `#241F20`, which is `l=0.131` —
above `TOO_DARK` (0.09), so it took the clamp path, not the lift. The lift
branch and its `BAND_MIN_L + 0.04` were untested. It now uses `#101010`
(`l=0.063`) against `#181818` (`l=0.094`) so the two paths are told apart.

**Both halves of the HSL conversion were tested with one half of the input
range.** All six hexes in the round-trip are at or below `l=0.5`, so the
`l > 0.5` branch of `rgbToHsl`'s saturation and the matching branch of
`hslToRgb`'s `q` never ran against a known answer. (`#FFF200` is exactly 0.5,
where the two formulas agree, and `#FFFFFF` returns early as a grey.)

**`contrast` was only ever called darker-first**, so the ordering inside it was
never exercised — and getting it wrong returns the reciprocal, which looks like
a plausible number.

**`parseHex` had untested anchors.** Without the `$`, `#DA291CFF` — a hex with
an alpha pair, which is a thing people paste — parses as a valid colour and is
silently truncated. The code is right; nothing was checking it.

**`followLink` had no test at all.** `resolveLink` was tested thoroughly and the
function the UI actually calls was not.

**Three `.trim()` calls in `playerName.ts` were decorative as far as the tests
knew** — nothing passed a padded name — and the ones in `fullName` and
`listName` are what stop a mononymous player rendering as `" Ronaldinho"`.

**`advance.ts` never played at home.** Every fixture in its test file is away,
so the `'HOME'` wording on both the season opener and the ordinary week was
written and never read. The `detail` line of a finished career was unasserted
too.

### The two findings that are about the code, not the tests

Neither is fixed here, because both are judgement calls for whoever owns the
file rather than the consequence of a survived mutant.

1. **The split strip is gated on lightness, not hue.** `bothStrong` requires
   `|Δl| > 0.3`, so a club in red and blue of similar darkness — Man Utd's
   `#DA291C` with a `#034694` — gets no `stripAlt`, even though red-and-blue is
   exactly the pairing the feature exists to show. Current behaviour is now
   pinned by a test either way, so changing the gate is a deliberate act rather
   than an accident.
2. **Two pieces of unreachable code in `advance.ts`.** `PHASE_DETAIL` is a total
   `Record<SeasonPhase, string>` with no empty values, so the `|| 'NO FIXTURE'`
   fallback on line 189 can never fire — that is the one remaining `# no cov`.
   And on line 183, `inWeeks > 1` is reached only after the `inWeeks <= 1`
   branch above has returned, so the comparison is redundant and both of its
   mutants are unkillable. A test now asserts the property the fallback was
   there for (no phase produces a blank second line), which is what makes
   removing it safe.

### The tail that is left, and why it is left

All 22 remaining survivors are `EqualityOperator` boundary flips — `<` against
`<=` at a threshold — plus two structural ones. Chasing them is not worth doing,
and several of them cannot be done at all:

- **`hslToRgb`'s `s === 0` fast path (line 84) is mathematically redundant.**
  With `s = 0`, `q` and `p` both reduce to `l` and every branch of `channel`
  returns `l`, so the general path produces the identical grey. Verified across
  400,000 random inputs: maximum channel difference 0. Emptying the block is a
  true equivalent mutant.
- **The three `<` boundaries inside `channel` (1/6, 1/2, 2/3) are equivalent
  under `<=`.** At each boundary exactly, the two branches evaluate to the same
  value. Same verification, same result: 0.
- **`luminance`'s `c <= 0.03928` cannot be hit exactly.** `c = n / 255` for
  integer `n`, and `0.03928 × 255 = 10.0164`. No channel value lands on it.
- **`rgbToHsl`'s `l > 0.5` is equivalent at `l === 0.5`**, where `max + min = 1`
  and both formulas reduce to `d`.
- **The rest** — `TOO_LIGHT`, `TOO_DARK`, `0.06`, `0.3`, `4.5` — would need an
  input whose float lands precisely on the constant. A test written to do that
  documents the float, not the rule.

This is what a healthy floor looks like on a file of thresholds. A score of 100%
here would mean tests pinned to exact boundary values, which is worse than 89.7%.

### On reading the numbers

`ignoreStatic: true` keeps 8 mutants in `advance.ts` out of the score entirely —
`PHASE_DETAIL`'s contents among them. And 90 of the 391 generated mutants are
compile errors dropped by the TypeScript checker, so the denominator is 301, not
391. Both are working as configured; neither is visible in the headline
percentage.
