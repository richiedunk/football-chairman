# Monetization

What this game can sell, in keeping with its own fiction, and where the fiction
has to stop. Nothing here is implemented — the repo ships with no monetization
at all. This is the decision document that comes before it.

## What is being sold

- A deep single-player simulation. ~490 clubs, ~18,000 players, a career
  bounded at thirty-five seasons by a director who retires at sixty-five.
- No server. `docs/deploy.md` is explicit: static files, no database, no API
  keys, nothing to scale. No account, no analytics, no telemetry.
- Saves are local — gzipped JSON in IndexedDB, ~3.5MB a world.
- Three surfaces from one bundle: web on bunny.net, iOS and Android via Capacitor.
- The audience is the FM Mobile / Football Chairman Pro audience: people who
  pay once for depth and who review-bomb anything that meters their time.

Two seams already exist and were built on purpose:

| Seam | Where | State |
| --- | --- | --- |
| `purchases` — `products` / `buy` / `restore`, `ProductId` | `src/platform/services.ts` | No-op stub, `capabilities().purchases` hard-false |
| `director.xpMultiplier` — applied in `awardXp`, read nowhere else | `src/engine/systems/career.ts:112` | Always 1 |

The seam is the right shape. The product it anticipates — a purchasable XP
boost — is the weakest option available, and the in-world version of this
document replaces it with something better. See **Qualifications** below.

---

## In-world, and the line it must not cross

The ambition is that a purchase should belong to the fiction rather than sit on
top of it. That is achievable here, more than in most games, because of one
thing already built:

**The game is a director's phone, and the storefront's clerk is already
employed.** `docs/the-phone.md` made the fiction literal — messages arrive from
a chairman, a head coach, an agent, a club secretary, a journalist. One of those
senders is **`Your representative`**, and today it already delivers the two
messages that matter most to a career: the clubs that have approached you, and
the season review (`src/engine/season/phases.ts:390-410`). A director's
opportunities arrive from their rep. That is not a metaphor for a storefront,
it is the thing itself.

And the **jobs board is already a shelf.** 114 clubs by division, the ones your
record does not justify greyed out and labelled with the level gap. It is a
catalogue with locked items in it, built for reasons that have nothing to do
with money.

So the frame works. But it brings a failure mode that bolted-on monetization
does not have, and it has to be stated before anything is designed:

> **The fiction can be in-world. The transaction cannot.**

If a purchase is disguised as a game action, the player cannot reason about it —
and that is not only a design problem. Both stores require purchases to be
clearly presented; the UK CMA's principles on in-game purchases and EU consumer
guidance both bite on exactly this: obscured prices, purchases that do not read
as purchases, and virtual currencies used to blur what something costs in real
money.

The rule that follows, and every design below obeys it:

**The thing you buy belongs to the world. The moment you buy is honest.** Your
rep can tell you an opportunity exists. The tap that spends money raises a plain
sheet with the store's own localised price on it, says it is a purchase, and
never pretends to be a transfer fee, a course fee, or anything else denominated
in the game's money.

### Four things the fiction must never be used to smuggle

Stated first, in the style of `docs/the-phone.md`, because each is a way this
idea could undo work done deliberately.

1. **Real money never enters the club's books.** Club finance is a designed
   constraint: money arrives lumpily, wages leave weekly, and a club can be
   profitable across a season and still run out of cash in February. The most
   lore-perfect consumable available is *a rich owner takes over* — and
   `src/engine/systems/takeovers.ts` already models it, so it would be a
   morning's work. It is also the single most corrosive thing on this list. The
   best-fitting idea and the worst idea are the same idea. Refuse it.
2. **No purchase in, near, or downstream of a blocking decision.** Urgent inbox
   items block the week; that is the mechanic that stops the game being mashed
   through. A purchase anywhere near it converts a design feature into an
   extortion point, and the genre's audience will read it that way correctly.
3. **No bought currency.** No director points, no credits, no "transfer
   tokens". One-off named things at real prices. Indirection is precisely what
   regulators are looking at and precisely what makes a price unreadable.
4. **The rep does not nag.** `docs/the-phone.md` already bans engagement
   theatre — no fabricated typing indicators, no badge inflation, no chairman
   using emoji. Monetization obeys the same rule: the storefront speaks when the
   fiction would have spoken anyway, at a season roll or a career end, and never
   otherwise. A rep who messages you to sell something he would not have
   mentioned is a rep the player stops reading, and that thread carries the job
   offers.

---

## The in-world design

### 1. Scenario packs arrive as jobs — *the best fit available*

A pack is not an item in a menu. It is **a job offer in your rep's thread**:
a club in administration under a transfer embargo, a season after a takeover, a
relegation rescue in February with eleven fit players.

Diegetically this is exactly and only how a director's next move arrives. The
jobs board already carries locked entries, already explains why each is closed
to you, and already sits behind the same rep who wrote to you about it. The
purchase adds a *situation* to the world, not a power to your director — and
every one of these is already simulable: registration embargoes, ownership
changes, board mandates and crisis states all exist as systems.

Sold as: named jobs, £1.99–£3.99, or a bundle. The tail that turns a launch
spike into a line.

**Cost:** moderate, and one engineering risk that must be handled before the
first pack ships, not after. See **Determinism** below.

### 2. Nation packs are where your career goes abroad

Same shelf, same clerk. A pack is a pyramid — Japan below the top flight, the
Nordics, Eastern Europe — and it reaches the player as clubs appearing on the
jobs board and a rep who says a club abroad has asked about you. Nations, cities
and name pools are already data (`src/engine/world/nations.ts`,
`src/engine/names/pools.ts`); the README already notes a name pack is a data
change, not a code change.

### 3. Qualifications, not boosts — *what should replace `xpMultiplier`*

The lore-true version of buying progress is a director taking a course:
a sporting-director diploma, a data short course, a language.

The distinction that makes it acceptable is not the label, it is the direction:

- **A boost sells speed.** The jobs-board ladder *is* the meta-progression —
  the README calls it "the reason to accept a job at a club you have outgrown
  rather than restarting". Selling a shortcut past it sells past the game.
- **A qualification sells breadth.** `DirectorBackground` already exists with
  six backgrounds, each with a real perk, chosen once at the start
  (`src/engine/newGame.ts`). A course is **another background to run a career
  with** — a sidegrade that changes what you are good at, not how fast you
  climb. It is content, it is replayability, and it cannot be used to skip
  anything.

Sell backgrounds. Keep `xpMultiplier` as a hook — it costs nothing and a future
difficulty setting may legitimately want it — but rename the `xp-boost-small` /
`xp-boost-large` products before anyone assumes they are the plan.

### 4. Director → chairman is the next rung, not a skipped gate

The repo is called `football-chairman`. The sandbox unlock everyone in this
genre sells has an in-world name here already: you stop being an employee and
you buy a club. `src/engine/systems/ownership.ts` models six owner kinds and
what each wants; `takeovers.ts` models the change of hands.

Sold as a separate mode at the top of the career — pick a club, run it as its
owner — it is honest, it is diegetic, and it does not damage career mode because
it is not career mode. Sold as "skip the level gate", it is pay-to-win in a
cardigan. Same code, different framing, and the framing is the product.

**Cost:** small-to-moderate. Keep it out of the XP and career-record systems so
the two modes cannot contaminate each other's records.

### 5. The memoir — the end-of-career artefact

When a director turns sixty-five the game writes: *"Your record is on the career
screen. It is the only part of the job that outlasts it."*
(`src/engine/season/phases.ts:440`.)

That is the moment of maximum attachment in the entire product, it arrives once
per career, and there is a purchasable object sitting in it: the record made
into a thing — the memoir, the archive, the career typeset and exportable.

It affects no simulation value whatsoever, so it can be priced without a single
design argument. Cosmetic monetization does not get more in-world than selling a
man his own career at the end of it.

### 6. The demo wall is your own contract

The web build is free and is the marketing. Its wall, if there is one, is
diegetic without any invention at all: you take your first job, you work the
season, and at the season roll your rep writes to you with the clubs that have
approached — which is a message the game already sends.

The full game is where that thread continues. Say so plainly in the sheet that
comes up. Do not dress the price as a contract negotiation.

---

## The lore-perfect traps

Three ideas fit the fiction beautifully and should still be refused. Writing
them down so they are refused once rather than re-proposed every quarter.

| Idea | Why it fits | Why not |
| --- | --- | --- |
| **A data-provider subscription** | Real directors buy Wyscout and StatsBomb on annual contracts; `dataDepartment.ts` already models a data department; the App Store also bills annually. The mapping is uncanny. | It sells narrowed scout ranges, i.e. certainty. "Undisclosed" is the title *and* the mechanic. The safe version is a data pack that adds presentation — charts, an archive — and never narrows a range. |
| **A better agent for yourself** | You are an employee; real directors have representation; the rep already exists as a character. | It sells better job offers and better contract terms. That is power, and it would convert, which is what makes it dangerous rather than what makes it good. |
| **A takeover by a rich owner** | Already modelled, one morning's work. | Puts real money into the club's books. See anti-goal 1. |

---

## Recommended package

1. **Premium on iOS and Android**, £6.99–£8.99, no IAP in the base build. The
   FM Mobile shelf, not the free-to-play one.
2. **Free web build** as demo and marketing, with the contract-renewal wall if a
   wall is wanted at all.
3. **Chairman mode** as one optional unlock (~£2.99), a separate mode.
4. **Scenario and nation packs** quarterly (£1.99–£3.99), delivered as jobs.
5. **Backgrounds** sold as qualifications, individually or bundled with packs.
6. **The memoir** at career end.
7. **No ads, no consumables, no bought currency, no subscription** until the
   packs have a track record of landing on time. A subscription has to be earned
   by a content cadence, and there is no server and no live pipeline yet.

Everything above ships without a backend. That property is worth more than any
single revenue line and should not be spent casually.

---

## What to build first

1. **`src/platform/entitlements.ts`** — one module, above the engine, answering
   "does this build own X". Backed by `purchases.restore()` on native, hard-false
   on web. **Nothing in `src/engine/` imports it, ever** — the engine has no
   framework imports and no DOM, which is why it can be tested headlessly, and
   an engine that asks whether something was bought is no longer that engine.
2. **Packs as data passed into `generateWorld`**, the way `WorldSize` already is
   (`src/engine/world/worldGen.ts:33`). The UI decides what is owned; the engine
   is handed a content set and has no opinion about money.
3. **Determinism and saves — before the first pack, not after.** Everything is
   derived from a seed, so a world generated with a pack *cannot be rebuilt
   without that pack*. The save must record which packs made it
   (`GameState.packs: string[]`, a `SAVE_VERSION` bump, a migration), and loading
   a save whose packs are missing must fail with an explanation rather than
   silently generating a different world. Get this wrong once and paying
   customers lose careers.
4. **Flip `capabilities().purchases`** and put a real StoreKit / Play Billing
   provider behind `PurchaseService`. Every caller must keep handling
   `{ status: 'unavailable' }`, because the web build will always get it.
5. **A restore-purchases row in `SettingsView.vue`.** Both stores require it to
   be offered, not merely possible.
6. **One storefront sheet**, raised from the rep's thread, showing
   `Product.price` — the store's own localised string, never a hard-coded
   "£2.99" — and reading unambiguously as a purchase.

## Things to fix before charging money

A paid product turns existing gaps into support tickets.

- **IndexedDB is not pinned.** `navigator.storage.persist()` is never called
  anywhere in `src/storage/`. A browser under storage pressure may evict a
  paying player's thirty-five-season career. Call it, and handle the refusal.
- **There is no cloud save.** `capabilities().cloudSave` is false and there is no
  server to make it true. A reinstall loses everything. At minimum surface the
  existing export-to-file path and prompt it at season end; iCloud and Play
  Games Saved Games are the real fix, and both are native-only.
- **There is no analytics.** Survivable with a premium model, fatal to any model
  needing a funnel. Decide before choosing, because adding telemetry later is a
  privacy-policy and consent change, not a code change.
- **Store compliance.** Anything consumed in-app goes through StoreKit / Play
  Billing — Apple Pay and Google Pay cannot carry it, as `services.ts` already
  notes. Offer a third-party sign-in on iOS and Sign in with Apple must sit
  beside it; `auth.availableProviders()` already computes rather than hard-codes
  this.
- **`docs/bugs.md` has open items needing design decisions**, and mutation
  testing has never been run. Neither blocks a launch; both change what a refund
  request costs.
- **Names and trademarks.** The generator avoids real club identities on purpose
  and the README is careful to say that is not a legal opinion. Charging money
  raises the stakes on that paragraph — get a real one before the first paid
  build, and especially before a pack leans toward recognisable teams.
