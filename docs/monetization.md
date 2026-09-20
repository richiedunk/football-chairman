# Monetization

A review of what this game can sell, what it should not sell, and what each
option costs to build. Nothing here is implemented — the repo ships with no
monetization at all. This is the decision document that should come before it.

## What is being sold

The product, as it stands:

- A deep single-player simulation. ~490 clubs, ~18,000 players, a 35-season
  career bounded by the director retiring at sixty-five.
- No server. `docs/deploy.md` is explicit: static files, no database, no API
  keys, nothing to scale. There is no account, no analytics, no telemetry.
- Saves are local — gzipped JSON in IndexedDB, ~3.5MB a world.
- Three shipping surfaces from one bundle: the web build on bunny.net, iOS and
  Android through Capacitor.
- The audience is the FM Mobile / Football Chairman Pro audience: people who
  will pay once for depth and who review-bomb anything that meters their time.

Two monetization seams already exist in the code and were built on purpose:

| Seam | Where | State |
| --- | --- | --- |
| `purchases` service — `products` / `buy` / `restore`, `ProductId` | `src/platform/services.ts` | No-op stub, `capabilities().purchases` hard-false |
| `director.xpMultiplier` — applied in `awardXp` and read nowhere else | `src/engine/systems/career.ts:112`, `src/engine/types.ts:1489` | Always 1 |

The seam is good work. The product the seam anticipates — a purchasable XP
boost — is the weakest option on the list, for reasons below.

## The constraints that decide this

These are not preferences. They are properties of what is built.

**No backend means no live-ops.** No battle pass, no seasonal events, no
server-side A/B testing, no remote config, no receipt validation, no funnel
data. Every model that depends on operating a game rather than shipping one is
off the table until someone runs a server, and running a server turns a
zero-marginal-cost static site into a business with an on-call rota.

**No receipt validation means client-side entitlement.** On mobile that is
tolerable — StoreKit and Play Billing are the source of truth and `restore()`
re-establishes it. On the web it is meaningless: IndexedDB and localStorage are
editable from devtools in ten seconds. Do not build a web economy that assumes
the client is honest.

**The simulation is deterministic and local.** A consumable that grants an
in-fiction advantage (budget, a revealed attribute, an XP multiplier) is worth
exactly as much as a save edit, and the people most likely to pay for it are
the people least likely to need to.

**The core loop is deliberately anti-friction-except-where-designed.** Urgent
inbox items block the week from advancing — that is the mechanic that stops the
game being mashed through. Any paywall placed on or near that block converts a
design feature into an extortion point, and the genre's audience will read it
that way correctly.

**The game's premise is uncertainty.** "Undisclosed" is the name and the
mechanic: you never see true attributes, only a range that narrows with scouting
work. Selling certainty — an IAP that reveals a player's real numbers — sells
the thing the game is about. It would probably convert well. It should still
not be built.

**Store rules, already partly noted in `services.ts`:**
- Anything consumed in-app goes through StoreKit / Play Billing. Apple Pay and
  Google Pay cannot carry it.
- Restore-purchases must be *offered*, not merely possible. `SettingsView.vue`
  is the place.
- Offer a third-party sign-in on iOS and Sign in with Apple must sit beside it
  (`auth.availableProviders()` already computes rather than hard-codes this).
- Ads bring ATT on iOS, a TCF consent flow in the EU, and an age-rating change.
- A price tier per region, and a localised price string from the store — never a
  hard-coded "£2.99" in the UI. `Product.price` is already typed for this.

---

## The options, ranked

### 1. Premium up front on mobile, free on the web — *recommended primary*

One price, everything included, no IAP in the build. £6.99–£8.99 puts it beside
FM Mobile rather than beside the free-to-play tier, which is the correct shelf:
the game's depth is the sales argument and a free-to-play price signals the
opposite of depth.

The web build becomes the demo and the marketing. Two shapes work:

- **Full and free on the web.** Strongest word-of-mouth, weakest conversion —
  people who would have paid play free forever in a browser. Defensible if the
  phone experience is genuinely better (it is: portrait-first, haptics, offline).
- **First career, then the wall.** The web build plays one club, one full season
  — which is a *complete* experience of every system — then the season roll asks
  for the app. Needs a gate point, not a gate system.

**Revenue shape:** lumpy, front-loaded on launch and on each press mention, no
tail without new content. This is the model's real weakness and why option 2
exists.

**Cost:** small. An entitlement check, one gate point, a restore button,
store-listing work. No engine changes.

**Risk:** a single price means a single shot at each player. Everything after
launch is discovery work, not product work.

### 2. Content packs — *recommended as the recurring layer*

This is the option the architecture was accidentally built for. The README
already says it out loud: *"Swapping in a different name pack is a data change,
not a code change."* Nations, leagues, cities and name pools are all data
(`src/engine/world/nations.ts`, `src/engine/names/pools.ts`).

Sellable packs, roughly in order of how well they fit:

- **Nation packs.** New pyramids with real depth — Japan below the top flight,
  the Nordics, Eastern Europe, South America beyond the five that exist. Adds
  jobs to the jobs board, which is the career's whole ladder.
- **Scenario packs.** Authored starting situations rather than generated ones:
  a club in administration under a transfer embargo, a season after a takeover,
  a relegation rescue in February. This touches `newGame.ts` candidate selection
  and board mandates, and it is the highest-value-per-byte content the game can
  ship — the systems already model all of it, nothing new has to be simulated.
- **Name packs.** Historical naming, regional variants. Cheap, and a nice
  goodwill freebie rather than a product.

**Revenue shape:** a tail. £1.99–£3.99 a pack, or a "all future packs" bundle.
This is what turns a launch spike into a line.

**Cost:** moderate, and there is one real engineering risk that has to be
handled before the first pack ships, not after.

> **Determinism and saves.** Everything is derived from a seed. A world
> generated with a pack installed *cannot be rebuilt without that pack*. The
> save must record which packs generated it (`GameState.packs: string[]`, a
> `SAVE_VERSION` bump and a migration), and loading a save whose packs are
> missing must fail with an explanation rather than silently generating a
> different world. Get this wrong once and paying customers lose careers.

> **Keep entitlement out of the engine.** The engine has zero Vue imports and no
> knowledge of the platform, and that is why it can be tested headlessly. Packs
> must arrive as *data passed into `generateWorld`*, the same way `WorldSize`
> does today. `src/engine/` must never ask whether something was bought.

### 3. A paid Sandbox / Owner mode unlock

The career is gated: your level decides which of the 114 clubs will interview
you, and at level 1 that is about 22 of them. A one-time unlock that removes the
gate — start anywhere, any club, any division — is the classic adjacent-mode
IAP, and it does not damage the career mode because it is *not* the career mode.
People who want to run Real-Madrid-but-not-really on day one are not the people
grinding a level-2 non-league job, and selling them a separate box is honest.

**Cost:** small-to-moderate. `jobSearch.ts` already computes the gate; the mode
is mostly "skip this filter", plus keeping it out of the XP and career-record
systems so the two modes don't contaminate each other's records.

**Note:** do *not* sell this as an XP shortcut. Sell it as a different mode.
The difference matters to the player and to the review score.

### 4. Cosmetics and quality-of-life

Extra save slots (the slot system in `src/storage/saves.ts` already supports
arbitrary slots — a cap would have to be *added* to then be sold, which is worth
being honest with yourself about), colour themes, a career-archive export. Low
revenue, near-zero harm, and they give the store page something to list.

**Cost:** small. **Revenue:** small. Include them; don't plan around them.

### 5. Rewarded video ads — *only under conditions, and probably not*

If ads happen at all: rewarded only, never interstitial, never on the advance
button. The honest placements are the natural dead time — world generation, the
season-review screen — and the honest rewards are cosmetic or trivial.

Arguments against, specific to this game:
- An ad SDK ends the "static files, no keys, nothing to scale" property in
  `docs/deploy.md` and drags in ATT, TCF consent and an age-rating change.
- The game is offline-capable by design. Ads are not.
- The audience pays for depth. Ads on a management sim read as a downgrade
  signal, and the review text will say so.
- The rewards that would actually convert (budget, scouting certainty, XP) are
  exactly the ones that damage the systems.

**Verdict:** skip. If revenue is short, a lower price point beats ads.

### 6. Subscription — not yet

A subscription has to be earned by a content cadence, and there is no server, no
live content pipeline, and a finite 35-season career. A subscription over this
product today is a rental of something that does not change. It becomes viable
*only* as a wrapper over option 2 — "every pack, as they land" — and only once
two or three packs have actually shipped on time.

### 7. Consumables and boosts — argue against

This includes the `xp-boost-small` / `xp-boost-large` products the code already
anticipates. Taking them one at a time:

| Product | What it actually sells | What it breaks |
| --- | --- | --- |
| XP boost | A shortcut up the jobs-board ladder | The ladder *is* the meta-progression — the README calls it "the reason to accept a job at a club you have outgrown rather than restarting". Selling past it sells past the game. |
| Transfer budget | Money | Finance is a designed constraint; money arrives lumpily and wages leave weekly. Adding money removes the February cash crisis the system exists to create. |
| Revealed attributes | Certainty | The title mechanic. |
| Skip the blocking decision | Removing friction the design added | The one thing stopping the game being mashed through. |
| Extra scouts / instant reports | Time | Defensible, but it is still time-metering in a game that does not otherwise meter time. |

The `xpMultiplier` hook should stay — it costs nothing and a future *difficulty*
or *pack* setting may legitimately want it. The products named against it in
`ProductId` should be renamed before anyone assumes they are the plan.

---

## Recommended package

1. **Premium on iOS and Android**, £6.99–£8.99, no IAP in the base build.
2. **Free web build** as demo and marketing — full first season, then the app.
3. **Sandbox mode** as a single optional unlock (£2.99), a separate mode.
4. **Content packs** quarterly (£1.99–£3.99), nation and scenario first.
5. **Cosmetics** as filler.
6. **No ads, no consumables, no subscription** until packs have a track record.

Everything above is buildable without a server. That property is worth more than
any single revenue line and should not be spent casually.

---

## What to build first

In order, before any store listing exists:

1. **`src/platform/entitlements.ts`** — one module, above the engine, that
   answers "does this build own X". Backed by `purchases.restore()` on native,
   hard-true on a paid build, hard-false on web. Nothing in `src/engine/` imports
   it, ever.
2. **Flip `capabilities().purchases`** and wire a real StoreKit / Play Billing
   provider behind the existing `PurchaseService`. The seam is already the right
   shape; the stub returns `{ status: 'unavailable' }` and every caller must keep
   handling that, because the web build will always get it.
3. **A restore-purchases row in `SettingsView.vue`.** Both stores require it to
   be offered.
4. **`GameState.packs`, a `SAVE_VERSION` bump and the missing-pack load path** —
   before the first pack, not after.
5. **The gate point** for the web demo, at the season roll, in the UI layer only.

## Things to fix before charging money

A paid product makes existing gaps into support tickets.

- **IndexedDB is not pinned.** `navigator.storage.persist()` is never called
  anywhere in `src/storage/`. A browser under storage pressure may evict a
  paying player's 35-season career. Call it, and handle the refusal.
- **There is no cloud save.** `capabilities().cloudSave` is false and there is no
  server to make it true. A reinstall loses everything. At minimum, make the
  existing export-to-file path obvious and prompt it at season end; iCloud /
  Play Games Saved Games are the real fix and both are native-only.
- **There is no analytics.** With a premium model that is survivable. With any
  model that needs a funnel it is not — decide which before choosing, because
  adding telemetry later is a privacy-policy and consent change, not a code one.
- **`docs/bugs.md` has open items needing design decisions**, and mutation
  testing has never been run. Neither blocks a launch; both change what a refund
  request costs.
- **Names and trademarks.** The generator avoids real club identities on purpose
  and the README is careful to say it is not a legal opinion. Charging money
  raises the stakes on that paragraph. Get an actual opinion before the first
  paid build, particularly if a pack ever leans toward recognisable teams.
