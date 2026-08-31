/**
 * Mutation testing, scoped to the parts of the engine where it pays for itself.
 *
 * Line coverage tells you a line ran. It does not tell you whether a test would
 * have noticed if that line were wrong. Mutation testing answers the second
 * question by breaking the code on purpose — flipping `>` to `>=`, negating a
 * condition, emptying a block, replacing a returned string with an empty one —
 * and running the tests against each break. A mutant that survives is a change
 * to the rules of the game that nothing in the suite objects to, which is the
 * honest measure of whether these tests are holding the simulation in place or
 * merely visiting it.
 *
 * The scoping and the timeouts below are not tidiness. The tests run once per
 * mutant, and this suite is slow: several files build a whole world and play
 * seasons before the first assertion, and one test takes three minutes on its
 * own. Pointing Stryker at all of `src/` would produce a run measured in days.
 *
 * This has never been run. There is no baseline score, and nothing here is
 * verified beyond installing and typechecking. See docs/mutation-testing.md.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  $schema: './node_modules/@stryker-mutator/core/schema/stryker-schema.json',
  packageManager: 'npm',
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts' },
  reporters: ['html', 'clear-text', 'progress'],

  /**
   * The rule layer: the systems that decide what happens, the cup draw, and the
   * four pure UI helpers that have fast tests of their own. These are the places
   * where an off-by-one survives review and changes the game quietly.
   *
   * Deliberately absent:
   * - `src/engine/world/` — world generation. Large, and every mutant in it is
   *   covered only by tests that regenerate a world. Its correctness is checked
   *   by the scripts in `scripts/`, which measure distributions rather than
   *   assert on single values, and mutation testing has little to say about
   *   that kind of check.
   * - `src/engine/rng.ts`, `sim/match.ts`, `sim/selection.ts`, `sim/schedule.ts`,
   *   `season.ts`, `tick.ts` — reached by nearly every test in the suite, so one
   *   mutant in them drags most of the slow tests along with it.
   * - `*.vue`, `src/stores/`, `src/platform/`, `src/router.ts`, `src/main.ts` —
   *   nothing mounts a component in the test suite, so every mutant would
   *   survive and the score would be measuring the absence of component tests,
   *   which is already known and does not need a number.
   * - `scripts/` and `tests/` — diagnostics, and the tests themselves.
   */
  mutate: [
    'src/engine/systems/*.ts',
    'src/engine/sim/cups.ts',
    'src/ui/colour.ts',
    'src/ui/playerName.ts',
    'src/ui/link.ts',
    'src/ui/advance.ts',
  ],

  // Only affects what gets copied into the sandbox. Stryker does not read
  // .gitignore, so the built app, the native projects and the design canvas
  // would be copied on every run for nothing.
  ignorePatterns: ['dist', 'design', 'ios', 'android', 'public', 'scripts', 'coverage'],

  // Run only the tests that actually touch the mutated line. Without this every
  // mutant runs all 344 tests, which is five minutes each.
  coverageAnalysis: 'perTest',

  // Mutants that do not compile are not interesting, and learning that from tsc
  // costs a moment where learning it from a test run costs a minute. The plugin
  // relaxes `noUnusedLocals` and `noUnusedParameters` itself, which it has to:
  // emptying a block legitimately leaves a parameter unused, and a mutant
  // rejected as a compile error is dropped rather than counted as survived.
  checkers: ['typescript'],

  /**
   * Stryker kills a mutant that runs out of time, on the theory that it caused
   * an infinite loop. The allowance is `timeoutMS + timeoutFactor * (measured
   * time of the tests being run)`, and the measured time counts tests only —
   * not `beforeAll`. That distinction is the whole reason this number is so
   * large. `tests/continental.test.ts` plays 46 weeks of a season in a
   * top-level `beforeAll` and then makes eighteen sub-millisecond assertions
   * against it: measured time near zero, real time 112 seconds. At the default
   * 5s every mutant in `continental.ts` and `cups.ts` would be reported as a
   * timeout, timeouts count as killed, and the score would come back
   * flattering and wrong.
   *
   * So the base covers the worst measured setup with headroom, and the factor
   * covers the genuinely slow tests in proportion — the longest, six seasons of
   * AI squad management, is measured at 180s and gets 540s on top.
   *
   * Being this generous costs less than it looks. Stryker counts how often a
   * mutant is hit during the dry run and aborts at a hundred times that, so a
   * real infinite loop is caught by the hit counter long before the clock.
   */
  timeoutMS: 180_000,
  timeoutFactor: 2,

  // The initial full run goes through a single worker and carries coverage
  // instrumentation, where `npm test` uses four in parallel and takes five
  // minutes. The 5 minute default would abort it before it started.
  dryRunTimeoutMinutes: 60,

  /**
   * A static mutant is one only executed while the module loads — a top-level
   * constant or lookup table. Stryker cannot attribute those to a single test,
   * so it reloads the environment and runs the entire suite for each one, which
   * here is over ten minutes single-threaded. They are reported as ignored
   * rather than survived, so read the score knowing the constant tables are
   * outside it.
   */
  ignoreStatic: true,

  // Re-tests only what changed since the last report, which matters when a cold
  // run is an overnight job. The state lives under reports/, which is
  // gitignored, so a fresh clone starts cold.
  incremental: true,
}
