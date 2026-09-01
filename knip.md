# What knip is for here, and how it is configured

`npm run knip` looks for code nothing uses: dead exports, unreferenced files,
dependencies in `package.json` that no import reaches.

It matters more in this project than in most. The recurring failure here is not
a crash — it is **work that exists and does nothing**. A dial set at world
generation and consulted by nothing. A function written, documented, and never
called. `tests/dials.test.ts` catches the first at the level of the world
model; knip catches the second at the level of the module. The first run found
ninety-seven, and seven of them were features rather than leftovers.

## The configuration, and why each line is there

**`entry`** — `index.html` for the app, plus every test and every script.
Scripts are entry points, not dead weight: they are how every calibration
decision in this project gets made, and something used only by
`scripts/economy.ts` is being used.

**`ignoreExportsUsedInFile: { interface, type }`** — `src/engine/types.ts` is
one file describing the whole world model, and its interfaces are mostly
referenced as the types of properties in other interfaces beside them rather
than imported by name. "Unused export" is the wrong question for a vocabulary
module. It stays switched on for functions and constants, where an export
nothing imports really is extra surface.

**`tags: ["-unwired"]`** — the register. An export marked `@unwired` in its doc
comment is excluded, and the tag is not a way of silencing knip: it is a claim,
written at the line, that this is a feature waiting to be connected rather than
a leftover to delete. Every one of them is listed in `docs/bugs.md`. The rule
is the same as the dial register: the list can only shrink. Wire it up and
remove the tag, or delete it.

**`ignoreDependencies: ["@capacitor/preferences"]`** — a real finding that
cannot be fixed from here. No code imports it, but it is a Capacitor plugin and
the committed native projects reference it: `ios/App/Podfile` and
`android/capacitor.settings.gradle` both point at `node_modules`. Removing it
means `npm uninstall` **and** `npx cap sync`, and the iOS half of that needs
CocoaPods on a Mac. Left installed and recorded rather than half-removed, which
would leave both native projects pointing at a directory that is not there.
