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
