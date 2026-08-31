# Director of Football

A football management game where you are the **director of football**, not the manager.
You run recruitment, contracts, the academy, facilities, the wage bill and the press.
Someone else picks the team — and if he doesn't rate your signing, your signing doesn't play.

Browser-based, portrait-first, saves locally. Ships to iOS and Android through Capacitor
from the same codebase.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run build        # typecheck + production build to dist/
npm run preview      # serve the built bundle
npm test             # engine test suite
npm run typecheck    # vue-tsc, no emit
```

### iOS and Android

The native projects are committed and already configured (portrait lock, dark status bar).

```bash
npm run cap:sync     # build the web bundle and copy it into both platforms
npm run cap:ios      # opens Xcode      (requires macOS + Xcode + CocoaPods)
npm run cap:android  # opens Android Studio
```

Nothing in the game code branches on platform. `src/platform/native.ts` is the only file
that knows Capacitor exists, and every call in it is guarded so the same bundle runs
unchanged in a browser.

---

## How it plays

You start **unproven**. Only clubs nobody else wants will interview you, so the opening
choice is not which project to take but which mess to inherit — a club with debt, or an
ageing squad, or eleven fit players and no academy.

Each week you work two surfaces at once:

- **The squad board** — the always-there management surface. Contracts running down,
  players unhappy about minutes they were promised, a position with no cover, a prospect
  who needs a loan to develop.
- **The inbox** — the interrupt channel. An offer for your best player, the coach
  demanding a centre-back, a journalist asking whether you still back the manager.
  Urgent items *block the week from advancing*, which is what stops the game being
  played by mashing one button.

Then results resolve, and the board forms a view.

### The systems

| System | What it actually does |
| --- | --- |
| **Scouting** | You never see true attributes — only a *range* that narrows as scouts spend time on a player. Range width is a function of the scout's judgement, accumulated knowledge, and your data department. Every signing is made on incomplete information. |
| **Transfers** | Three parties who want different things: the selling club wants money, the player wants status and minutes, the agent wants his cut and will blow up a deal over it. Deals resolve over weeks, so a window is a planning problem. |
| **Contracts** | The quiet system that ruins careless directors. Players run deals down and leave for nothing; the value collapse starts six months out. |
| **The head coach** | An AI actor with a formation, a style, opinions about youth, and a relationship with you. He picks the team. Sign a player who doesn't fit what he wants and you've bought an expensive bench-warmer whose value is falling. |
| **Media** | The offensive system. Leak genuine interest in a rival's unsettled striker to depress his price — or fabricate it more cheaply and risk exposure. Two resources: **credibility**, which determines whether journalists run your briefings at all, and **goodwill**, which is how kindly they cover you when things go wrong. |
| **Loans** | The lever that makes a youth policy work. A prospect who doesn't play doesn't develop, and the coach decides who plays — so the only way to grow a player he won't pick is to send him where he'll start. Covering more of the wage is what persuades a smaller club to take him: you're paying for his development. |
| **Morale** | Traceable to decisions you made: minutes against promised status, being signed over, contract neglect, ambition outgrowing the club. |
| **Finance** | Money arrives lumpily (matchday on the day, TV in instalments, prize money once a year) and wages leave every single week. A club can be profitable across a season and still run out of cash in February. Operating costs are itemised and driven by real things — stadium maintenance and rent per seat, training and medical per player, support staff whose headcount follows the size of the operation, all scaled by local cost of living. |
| **The stadium** | Modelled stand by stand: each has its own capacity, condition, type and executive boxes, and decays with age. Let one rot and the safety officer starts closing places, which costs real matchday income. Work is **tendered to architects** — repairs, upgrades, expansion, a full rebuild, or relocating entirely — and the cheap firm and the good firm quote different numbers, the good firm is busy until March, and the difference only shows up eighteen months later as an overrun. Fund it from reserves or borrow against future revenue. |
| **Facilities & academy** | The long game. None of it helps this season. |
| **Board** | Judges you on results against *their* expectation, on the books, and on whether you did what they asked. Three formal warnings and you're gone. You can also **ask them for things** — funds, a higher wage ceiling, a stadium, a lower target, more time, the coach's head — and every request spends some of their confidence in you whether or not it lands. |
| **Supporters** | Mood is computed from its causes every week — position against expectation, form, ticket prices against the division average, whether you sold more than you replaced, a cup run — and the board screen shows you the breakdown. It doesn't drift. |

### Career progression

The opening screen is a **jobs board** listing every club in the country by division, with
the ones your record doesn't yet justify greyed out and labelled with the level and XP gap
they need. At level 1 that's about 22 open jobs out of 114 — you can see the whole ladder
before you start climbing it.

You have a level, and it gates which clubs will consider you. XP comes from
**over-performing the board's expectation** (more than from finishing high), from trading
profitably, from graduating academy players, and from keeping the club solvent. Taking a
club expected to finish 18th to 11th is worth more than a rich club finishing 4th as
expected.

All XP routes through one function with a multiplier hook, so a purchasable boost would be
a single field rather than a change to any game system.

### Your own contract

You're an employee. On taking a job you negotiate salary, length, signing-on fee,
promotion, trophy and target bonuses, and severance — and the club has *one* overall limit,
not six independent ones, so a big signing-on fee has to be paid for somewhere else. Your
salary comes out of the same wage bill you spend the season trying to control, so asking
for more is a genuine trade-off.

Career earnings accumulate across every club, itemised by source. The reachable arc runs
from about £26k a year in non-league to £2-3m at the very top.

---

## Architecture

```
src/
  engine/            Pure TypeScript. Zero Vue imports, zero DOM.
    rng.ts             Seeded xoshiro128** with forkable streams
    types.ts           Domain model — flat, id-keyed, JSON-serialisable
    names/             Nationality-aware name generation
    world/             World, club, player, staff generation
    sim/               Scheduling, team selection, match engine, cups
    systems/           Scouting, transfers, contracts, media, finance, board…
    tick.ts            One week, orchestrated in an explicit order
    season.ts          Promotion, prize money, ageing, XP, job offers
  stores/            Pinia — thin wrappers over the engine
  storage/           Save/load, gzip, IndexedDB, compression worker
  platform/          The only file that knows Capacitor exists
  ui/                Vue components, views, design system
```

Three decisions shape everything else.

**The engine is plain TypeScript with no framework dependency.** It can be run headlessly,
tested without a DOM, and would survive a UI rewrite. The tests simulate whole seasons in
Node.

**GameState is held in a `shallowRef`, never a `reactive`.** Vue's deep reactivity would
install proxies over ~18,000 players and every nested object inside them — seconds to
convert, and proxy overhead on every write in the weekly tick's hot loop. The store mutates
raw state and bumps a revision counter: one notification per user action instead of tens of
thousands.

**Everything is derived from a seed.** The same seed always rebuilds the same world, so a
save file never ships a database, and a bug can be reproduced from eight characters.

### Performance

A standard world is ~490 clubs and ~18,000 players. A weekly tick simulates every match in
the world. Getting that under 100ms took measurement rather than guesswork:

- Positional ratings are cached and invalidated on attribute change. Team selection was
  recomputing a 16-attribute weighted sum for every player against every slot, every week.
- The match loop built four weighted-pick arrays *per chance*, ~26 chances a match — now
  built once per match. 43% faster with byte-identical output distributions.
- World-wide passes the player cannot see (morale at clubs they never look at, valuations
  of players they will never buy) are staggered across a rotation.

### Saves

A world is ~31MB of JSON, far beyond localStorage. Saves are gzipped via the platform's own
`CompressionStream` — about 3.5MB — and stored in IndexedDB, with a base64-in-localStorage
fallback and an in-memory adapter for tests. Compression runs in a worker, because a second
of frozen UI on every autosave is not acceptable on a phone. Only the bytes cross the thread
boundary; structured-cloning the state would cost more than the compression it was moving.

---

## Club and player names

Every club, player, coach, agent and journalist is **generated**, not shipped.

Clubs are built as *real city* + *generic football suffix* — city names are geography and
nobody owns them, and "United", "Calcio" or "spor" are generic football vocabulary. What the
generator deliberately avoids is the specific *combination* that identifies a real club;
there's a blocklist it re-rolls against. League names are fictional in the Football Chairman
idiom ("The Prem", "Division Two", "Non-League Premier").

Player names come from 24 nationality-weighted pools with real naming conventions: Brazilian
mononyms and diminutives, Spanish double surnames, Dutch *tussenvoegsels*, East Asian
surname-first ordering, and diaspora weighting so a French academy produces the name mix a
French academy actually produces. Surnames strongly identified with individual living
players have been removed from the pools.

None of this is a legal opinion, and it isn't advice. It's a default that keeps the shipped
build free of anyone else's trademarks. Swapping in a different name pack is a data change,
not a code change.

---

## Testing

```bash
npm test                    # 344 engine tests
node scripts/e2e.mjs        # drives the built app in a real browser
```

The engine tests assert invariants rather than snapshots: attributes always agree with the
ability they encode, a season leaves no orphaned players or resized divisions, every goal
scored is a goal conceded, transfers balance both clubs' books, scout ranges narrow with
knowledge and never collapse to certainty, a loan's wage is split between two clubs and
paid by neither twice, a two-legged tie resolves on aggregate and resolves the same way
every time it's asked, and the board's counter-offer is always one it would accept.

The end-to-end test drives the real built bundle in an iPhone-sized viewport: create a
career, generate a world, take a job, advance ten weeks answering blocking decisions, visit
every screen, plant a media story, then reload the page and confirm it resumes at the same
club.

Both found real bugs. Measuring three simulated seasons found four more.

Mutation testing is configured but has never been run, so there is no score to quote. It
breaks the engine on purpose and checks whether any test notices, which is a different and
harder question than whether a line was covered. It is scoped to the rule layer and it is
an overnight job — `docs/mutation-testing.md` explains the scope, the cost and how to run
something smaller.
