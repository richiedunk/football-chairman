# Monetization

What this game can sell in keeping with its own fiction, where the fiction has
to stop, and where in the code each piece would go. Nothing here is implemented
— the repo ships with no monetization at all. This is the decision document
that comes before it.

## What is being sold

- A deep single-player simulation. ~490 clubs, ~18,000 players, a career
  bounded at thirty-five seasons by a director who retires at sixty-five.
- No server. `docs/deploy.md` is explicit: static files, no database, no API
  keys, nothing to scale. No account, no analytics, no telemetry.
- Saves are local — gzipped JSON in IndexedDB, ~3.5MB a world.
- Three surfaces from one bundle: web on bunny.net, iOS and Android via
  Capacitor (`com.undisclosedfootball.game`).
- The audience is the FM Mobile / Football Chairman Pro audience: people who
  pay once for depth and who review-bomb anything that meters their time.

Seams that already exist and were built on purpose:

| Seam | Where | State |
| --- | --- | --- |
| `purchases` — `products` / `buy` / `restore`, `ProductId` | `src/platform/services.ts` | No-op stub, `capabilities().purchases` hard-false |
| `director.xpMultiplier` — applied in `awardXp`, read nowhere else | `src/engine/systems/career.ts:112` | Always 1 |
| `world/dataPack.ts` — the name-pack seam | Referenced from `nations.ts:13` and `clubNames.ts:16` | **The file does not exist.** Planned, never written. |
| `NewGameOptions.startingSeason` | `src/engine/newGame.ts:28` | Wired, defaults to the current year |
| Achievements and leaderboards services | `src/platform/services.ts` | Stubs behind `capabilities()` |

---

## In-world, and the line it must not cross

The ambition is that a purchase should belong to the fiction rather than sit on
top of it. That is achievable here, more than in most games, because of one
thing already built:

**The game is a director's phone, and the storefront's clerk is already
employed.** `docs/the-phone.md` made the fiction literal — messages arrive from
a chairman, a head coach, an agent, a club secretary, a journalist. One of those
senders is **`Your representative`**, and today it delivers the two messages
that matter most to a career: the clubs that have approached you and the season
review (`src/engine/season/phases.ts:386-410`), plus the message that ends it
(`:423-449`). A director's opportunities arrive from their rep. That is not a
metaphor for a storefront, it is the thing itself.

And the **jobs board is already a shelf.** 114 clubs by division, the ones your
record does not justify greyed out and labelled with the level gap
(`ClubSelectView.vue:59-63`, reading `canTakeJobAt` in `career.ts:246`). It is a
catalogue with locked items in it, built for reasons that have nothing to do
with money.

The frame works. It brings a failure mode that bolted-on monetization does not
have, and it has to be stated before anything is designed:

> **The fiction can be in-world. The transaction cannot.**

If a purchase is disguised as a game action the player cannot reason about it —
and that is not only a design problem. Both stores require purchases to be
clearly presented; the UK CMA's principles on in-game purchases and EU consumer
guidance both bite on exactly this: obscured prices, purchases that do not read
as purchases, and virtual currencies used to blur what something costs.

The rule every design below obeys: **the thing you buy belongs to the world;
the moment you buy is honest.** Your rep can tell you an opportunity exists.
The tap that spends money raises a plain sheet with the store's own localised
price on it, says it is a purchase, and never pretends to be a transfer fee, a
course fee, or anything else denominated in the game's money.

### Four things the fiction must never be used to smuggle

1. **Real money never enters the club's books.** Club finance is a designed
   constraint: money arrives lumpily, wages leave weekly, and a club can be
   profitable across a season and still run out of cash in February. The most
   lore-perfect consumable available is *a rich owner takes over* — and
   `src/engine/systems/takeovers.ts` already models it, so it would be a
   morning's work. It is also the most corrosive thing on this list. The
   best-fitting idea and the worst idea are the same idea. Refuse it.
2. **No purchase in, near, or downstream of a blocking decision.** Urgent inbox
   items block the week; that is the mechanic that stops the game being mashed
   through. A purchase anywhere near it converts a design feature into an
   extortion point, and the audience will read it that way correctly.
3. **No bought currency.** No director points, no credits, no tokens. One-off
   named things at real prices. Indirection is precisely what regulators are
   looking at and precisely what makes a price unreadable.
4. **The rep does not nag.** `docs/the-phone.md` bans engagement theatre — no
   fabricated typing indicators, no badge inflation, no chairman using emoji.
   Monetization gets no exemption. The storefront speaks when the fiction would
   have spoken anyway — a season roll, a career end — and never otherwise. A
   rep who messages you to sell something is a rep the player stops reading,
   and that thread carries the job offers.

A fifth, mechanical rather than ethical, and the one that decides where every
line of this goes: **nothing in `src/engine/` may know whether anything was
bought.** The engine has no framework imports and no DOM, which is why it can
be tested headlessly and why the tests simulate whole seasons in Node. An
engine that asks about entitlements is no longer that engine. The engine is
*handed content* — the way `WorldSize` is handed to `generateWorld` today — and
the UI decides what content the player owns.

---

## The first set, reviewed against the code

Each of these was proposed before the code under it had been read. Reading it
changed four of them.

### 1. Scenario packs, delivered as jobs — *still the best fit*

A pack is a job offer in your rep's thread: a club in administration under a
transfer embargo, the season after a takeover, a relegation rescue in February
with eleven fit players. You buy a *situation*, not a power.

**What the code says.** "Already simulable" was mostly right — embargoes
(`registration.ts`, `regulation.ts`), takeovers, crises and board mandates all
exist as systems. What does not exist is an *authored starting state*:
`prepareNewGame` (`newGame.ts:86`) generates a world and lists the home
nation's clubs, and `startCareerAt` (`:120`) applies background perks and
signs the contract. There is no step that says "and this club is in
administration". A scenario is that step.

**Where.**
- `src/engine/newGame.ts` — a `scenario?: ScenarioId` on `NewGameOptions`, and
  an `applyScenario(state, clubId, scenario)` called inside `startCareerAt`
  after `applyBackgroundPerks` and before `setSeasonExpectation`, so the board
  sets its expectation against the mess rather than the club it used to be.
- `src/engine/scenarios/*.ts` — one file per scenario, each a pure function on
  `GameState`. Same shape as a migration block, same testability.
- `src/engine/systems/jobSearch.ts:91` and `season/phases.ts:386` — a scenario
  can also *arrive mid-career* as a vacancy, which is the better delivery: a
  club in trouble has asked for someone who has done this before. It is a
  `JobOffer` with a `scenario` field, and the rep's existing message carries it.
- `src/ui/views/ClubSelectView.vue` — a scenario row on the jobs board, locked
  with a different reason from the level gap.

### 2. Nation packs — *right, and the seam was half-built*

`nations.ts:13` and `clubNames.ts:16` both say "see `world/dataPack.ts`". That
file was never written. Whoever wrote those comments already knew this was
the shape.

**Where.**
- `src/engine/world/dataPack.ts` — the file the comments promise. A `DataPack`
  is `{ id, nations?: NationDef[], namePools?: Record<string, NamePool>,
  clubNames?: ... }`, merged into `NATION_DEFS` and `NAME_POOLS` at generation.
- `src/engine/world/worldGen.ts:33` — `WorldGenOptions.packs?: DataPack[]`,
  beside `size`. `SIZE_NATIONS` (`:44`) gains the pack's nation ids when the
  pack is present.
- `src/engine/world/nations.ts` — `NationDef` is already the complete schema:
  cities, tiers with prize money and TV revenue, continental places, a naming
  style, a cup name. A pack is a list of these.

### 3. Qualifications, not boosts — *right in principle, wrong in one detail*

Sell breadth, not speed. A qualification is another `DirectorBackground` to run
a career with, not a multiplier on the ladder.

**What the code says.** Read `applyBackgroundPerks` (`newGame.ts:170`) before
selling any of the six that exist. `financier` gives **+25% transfer budget and
+12 board confidence**. `agent` gives +18 relationship with every agent in the
world. Sold, the first puts real money into the club's books (anti-goal 1) and
the second is a straightforward advantage. The six that exist stay free, all of
them. Sold backgrounds are *new* ones whose perks are visible and
non-financial: a background that changes what your scouts are good at, what
the press expects of you, how the dressing room reads you — the shape of
`analyst`, `scout` and `formerPlayer`, never `financier`.

Also: a background is applied **once, at the start**, by `startCareerAt`. There
is no mechanism for a mid-career course, and building one is a new system.
The honest product is "another way to start a career", chosen on
`NewGameView.vue` beside the existing six.

**Where.**
- `src/engine/newGame.ts:38` — `BACKGROUNDS` and the `DirectorBackground`
  union in `types.ts:1605`; `applyBackgroundPerks` for the perk.
- `src/ui/views/NewGameView.vue` — the picker; locked entries render the same
  way locked jobs do.
- `career.ts:112` — leave `xpMultiplier` alone. Rename `xp-boost-small` /
  `xp-boost-large` in `services.ts` before anyone assumes they are the plan.

### 4. Director → chairman — *two products wearing one name, price them apart*

**What the code says.** There are two very different things here.

- *The cheap one*: the level gate skipped, framed as owning the club.
  `eligibleClubs` (`career.ts:231`) and `canTakeJobAt` (`:246`) are the entire
  gate; a mode flag on `DirectorProfile` that bypasses them is a day's work.
  Everything else about the game is unchanged — you are still a director, the
  board still judges you, the owner is still an NPC in `ownership.ts`.
- *The real one*: you **are** the owner. `ownership.ts` models what owners
  want and `board.ts` reads it to set budgets and expectation; nothing gives
  the player those verbs. Owner mode with real verbs — set the budget, set the
  target, hire and sack the director of football, sell the club — is a new
  system on the scale of the dressing room or international football, and the
  repo's own rule is measure-after-each.

Ship the cheap one honestly labelled as what it is ("start anywhere"), or
build the real one. Do not sell the cheap one under the real one's name.

**Where.** `career.ts:231-250` for the gate; `types.ts:1459` for the flag;
`ownership.ts` / `board.ts` for the real thing.

### 5. The memoir — *right, and the archive already exists*

At sixty-five the rep writes "*Your record is on the career screen. It is the
only part of the job that outlasts it.*" (`season/phases.ts:444`). That is the
moment of maximum attachment, once per career, and there is a purchasable
object sitting in it.

**What the code says.** `careerHistory.ts` opens with: every player's career is
persisted "*yet nothing in `src/ui` has ever displayed a career*". The storage
layer already pays for the memoir's raw material on every save. The memoir is
the first reader of that part.

**Where.**
- `src/engine/systems/directorCareer.ts:52` — `careerSummary`, the spine.
- `src/storage/careerHistory.ts` — every player you ever signed, sold or
  released, read once at the end. `store.careerHistory(playerId)` at
  `stores/game.ts:699` already exposes it.
- `src/ui/views/CareerView.vue:150` — "The record" card is where it is offered.
- `src/ui/components/Dossier.vue` — the document shape the phone already
  renders; a memoir is a document in the register.
- `src/storage/saves.ts:631` — `exportSave` is the pattern for producing a file
  the player keeps.

### 6. The demo wall is your own contract — *right, and it must not touch the button*

**What the code says.** `docs/the-phone.md` rejects any change to the advance
button, and `ui/advance.ts` already has the mechanism a wall needs without
changing it: `AdvanceIntent.route` — "where the tap goes when it should not
advance. The button never becomes inert." A wall is one more `AdvanceKind`
whose route is the storefront, computed in the UI from a season count the
engine already keeps. The engine does not know the wall exists.

Also already built: **the career comes with you.** `exportSave` / `importSave`
(`SettingsView.vue:94-140`, `StartView.vue`) move a save between the web build
and the app. Say so on the wall. A demo that discards the season it just made
you play is a demo people resent.

**Where.** `src/ui/advance.ts` (a new kind), `src/stores/game.ts:586`
(`nextWeek` refuses at the roll on web without entitlement),
`src/ui/components/AdvanceBar.vue`.

### 7. The three refused ideas — *one of them is already a free checkbox*

| Idea | Why it fits | Why not |
| --- | --- | --- |
| **A data-provider subscription** | Real directors buy Wyscout annually; `dataDepartment.ts` models the department; the App Store bills annually. | It sells certainty, and certainty is the title mechanic. **It is also already free**: `GameSettings.revealTrueAttributes` (`types.ts:1661`) is a debug toggle that shows true attributes. Selling a checkbox that exists is worse than selling certainty. If the toggle is not meant to ship, remove it before a paid build. |
| **A better agent for yourself** | You are an employee; the rep already exists as a character. | It sells better job offers and better terms — `contractTermsFor` in `directorContract.ts` is exactly where it would go, and that is what makes it dangerous. |
| **A takeover by a rich owner** | One morning's work in `takeovers.ts`. | Anti-goal 1. |

### 8. Names and trademarks — *the doc was wrong about the current position*

The README says clubs are generated as city + suffix and real identities are
avoided by blocklist. **The code has moved on.** `src/engine/world/realClubs.ts`
ships real clubs in their real divisions (`REAL_CLUBS`, consumed at
`worldGen.ts:222`); the generator now only fills gaps; and `AboutView.vue`
carries the descriptive-use disclaimer the genre relies on. The README's "Club
and player names" section describes a game that no longer exists and should be
rewritten by whoever decided the change — it is a legal-posture paragraph, not
a code comment.

For monetization the consequence is sharp: **a paid product using real club
names descriptively is a different risk from a free one**, and *a pack that
sells them* — "the real names pack" — is the one product that must not exist,
because it makes the names the thing being sold. A fictional-world toggle is
free (the generator is still there) and worth offering as a setting whatever
else happens.

---

## More ideas

Each is in-world, obeys the five rules, and names the seam it sits on.

### 9. The same summer, every director in the country — *weekly seeds*

Everything is derived from the seed; the README calls it out and
`tests/determinism.test.ts` guards it. So a shared seed is a shared world: the
same clubs, the same players, the same summer, and a different career in it for
everyone who takes it.

A **weekly seed** — `week-2026-38`, derived from the date, no server — gives
every player the same world at once, and Game Center / Play Games leaderboards
(native, free, already stubbed as `capabilities().leaderboards`) compare
careers in it. Diegetically it is the truest thing in the design: every
director in the country is working the same transfer window.

It is not a product on its own. It is what makes **scenario seeds** sellable:
a scenario is a seed, a club and a `applyScenario`, and "this exact
Wednesday-in-February at this exact club" is content that only a deterministic
world can offer.

**Where.** `src/engine/rng.ts` (`randomSeed`), `NewGameView.vue` (the seed
field already exists), `platform/services.ts` for leaderboards,
`scripts/worldhash.ts` for verifying a seed still means what it meant.

### 10. Eras — *start in 1995*

`NewGameOptions.startingSeason` is already wired and nothing uses it but the
calendar. An era is that number plus an economy: `NationDef.economyFactor` and
each `TierDef`'s `tvRevenue` and prize money are the whole of what makes a
2026 top flight unlike a 1995 one, and they are data. Add a period name pool
and it is a different world with no new mechanics.

Diegetically: your career began earlier. The rules for the trademark point
apply doubly — an era pack is *fictional* clubs in a period pyramid, never a
historical real one.

**Where.** `newGame.ts:28`, `nations.ts` (`economyFactor`, `TierDef`),
`names/pools.ts:34`, all through the `dataPack.ts` seam in idea 2.

### 11. Named characters — *the super-agent, the tabloid, the cowboy firm*

Every agent, outlet and architect in the world is generated with personality
dials: `Agent.aggression`, `MediaOutlet.sensationalism`, `Architect.reliability`
and `costFactor` (`types.ts:1214`, `:1285`, `:411`). A pack of *authored*
characters — a notorious agent who represents half the division and blows up
deals for sport, a paper that runs anything, an architect who is cheap until
March — is content with no power in it, and it reaches the player the way
everything does: they message you.

**Where.** `worldGen.ts` where `state.agents`, `state.outlets` and
`state.architects` are populated; `staffGen.ts` for the generators; delivered
through the `dataPack.ts` seam. The thread registry in `ui/threads.ts` needs
nothing — an unrecognised sender gets a thread of its own by design.

### 12. Succession — *the world does not retire when you do*

"Nobody works past sixty-five in this game." The world, though, carries on:
the club you built, the players you signed, the academy graduate who is now
thirty-one. A **succession** mode starts a new director at thirty *in the same
world*, with your old club run by whoever the board hired after you, and your
record on the wall.

This is the game's own fiction extended by one sentence, it reuses everything,
and it turns a 35-season save into a 70-season one. That last part is the risk:
the long save in `docs/roadmap.md` proved 35 seasons and nothing has measured
70. Measure before selling.

**Where.** `season/phases.ts:423` (`aYearOlder` sets `retiredAtSeason`);
`directorCareer.ts` gains `succeed(state, newDirector)` that resets
`DirectorProfile` (`types.ts:1459`) and leaves the world alone;
`stores/game.ts:342` (`retire`) and `CareerView.vue:123` for the offer, which
belongs on the record screen after the rep's final message, never before it.

### 13. Chairman mode, the real one — *see 4*

Listed here because if it is built it is the largest thing on this page and
the only one that adds a system rather than content. `ownership.ts` already
knows what six kinds of owner want; the work is giving the player the verbs
`board.ts` currently exercises on their behalf.

### 14. The fictional-world setting — *free, and it protects the paid build*

Not a product. A `GameSettings` toggle that generates the whole world from
`clubNames.ts` instead of `realClubs.ts`. It is what a paid build can fall
back to in a jurisdiction that objects, it is what an era pack needs anyway,
and it costs one boolean threaded into `WorldGenOptions`.

**Where.** `types.ts:1658` (`GameSettings`), `worldGen.ts:222`.

---

## What was considered and left out

- **Rewarded ads.** An SDK ends the "no keys, nothing to scale" property, drags
  in ATT and TCF consent and an age-rating change, does not work offline, and
  the rewards that would convert are the ones that damage the systems. A lower
  price beats it.
- **Subscription.** Has to be earned by a content cadence. No server, no live
  pipeline, a finite career. Viable only as "every pack, as they land", and only
  once two or three packs have landed on time.
- **Consumables** of any kind. See anti-goals 1 and 2, and idea 7.
- **Localisation as a paid pack.** Hostile. If it ships, it ships free.
- **Extra save slots.** `saves.ts` supports arbitrary slots today; a cap would
  have to be *added* in order to be sold. Be honest with yourself about that.
- **Selling the archive alone.** `careerHistory.ts` already stores it. It is the
  memoir's material, not a product.

---

## Recommended package

1. **Premium on iOS and Android**, £6.99–£8.99, no IAP in the base build.
2. **Free web build**, one full season, the contract wall, the save comes with
   you.
3. **Start anywhere** as one optional unlock (~£2.99), labelled as that.
4. **Scenario and nation packs** quarterly (£1.99–£3.99), delivered as jobs,
   built on weekly seeds.
5. **New backgrounds** as qualifications, non-financial perks only.
6. **The memoir** at career end; **succession** once seventy seasons have been
   measured.
7. **No ads, no consumables, no bought currency, no subscription** until the
   packs have a record of landing on time.

Everything above ships without a backend.

---

## Where it all goes

| Piece | File | Note |
| --- | --- | --- |
| Entitlements | `src/platform/entitlements.ts` (new) | Above the engine. Backed by `purchases.restore()` on native, hard-false on web. Nothing in `src/engine/` imports it. `knip` will flag unwired exports — wire them or tag `@unwired`, which `knip.json` already excludes. |
| Store provider | `src/platform/services.ts:88-120` | Flip `capabilities().purchases`; real StoreKit / Play Billing behind `PurchaseService`. Every caller keeps handling `{ status: 'unavailable' }` — the web build always gets it. |
| Restore purchases | `src/ui/views/SettingsView.vue:94` | Beside export. Both stores require it be *offered*. |
| The storefront | `src/ui/views/ThreadView.vue`, keyed on `threadKey('Your representative')` | A UI-owned shelf under that one thread. **Not an `InboxItem`** — threads are built from engine messages and the engine may not write one. The purchase sheet reuses `AppSheet.vue`, and shows `Product.price`, the store's own localised string. |
| The jobs board | `src/ui/views/ClubSelectView.vue:59`, `JobSearchView.vue` | Scenario and nation rows, locked for a different reason than the level gap. |
| Packs into the engine | `src/engine/world/dataPack.ts` (new), `worldGen.ts:33` | The file two comments already point at. Content is *handed in*, like `WorldSize`. |
| Scenarios | `src/engine/scenarios/` (new), `newGame.ts:120`, `jobSearch.ts:91` | Pure functions on `GameState`; also deliverable as mid-career vacancies. |
| Packs recorded in the save | `types.ts:1400` (`GameState.packs: string[]`), `types.ts:1668` (`SAVE_VERSION` → 21), `saves.ts:287` (migration: `packs = []`) | **Before the first pack ships.** A world generated with a pack cannot be rebuilt without it; loading a save whose packs are missing must refuse with an explanation, never regenerate silently. `tests/dials.test.ts` registers unread fields — the load path reads this one, so it will not trip. |
| Demo wall | `src/ui/advance.ts`, `stores/game.ts:586` | A new `AdvanceKind` with a route; the button is unchanged. |
| Backgrounds | `newGame.ts:38`, `types.ts:1605`, `NewGameView.vue` | New entries only; non-financial perks; the six stay free. |
| Start anywhere | `career.ts:231-250`, `types.ts:1459` | A flag on `DirectorProfile`, bypassing `eligibleClubs` / `canTakeJobAt`. |
| Memoir | `directorCareer.ts:52`, `storage/careerHistory.ts`, `CareerView.vue:150`, `Dossier.vue` | First reader of the career part. |
| Succession | `season/phases.ts:423`, `directorCareer.ts`, `stores/game.ts:342` | Measure seventy seasons first. |
| Weekly seeds / leaderboards | `rng.ts`, `NewGameView.vue`, `services.ts` (leaderboards) | Free feature; the substrate for scenario seeds. |
| Fictional-world toggle | `types.ts:1658`, `worldGen.ts:222` | Free; protects the paid build. |
| `IndexedDB` persistence | `src/storage/adapter.ts` | `navigator.storage.persist()` is never called. A browser under pressure can evict a paying player's career. Call it, handle the refusal. |
| Cloud save | `services.ts` (`cloudSave`) | Native-only (iCloud, Play Games Saved Games). Until then, prompt export at season end. |
| README | "Club and player names" | Stale — describes the pre-`realClubs.ts` game. Author's paragraph to rewrite. |
