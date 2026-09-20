# Monetization

How money reaches this project. Options are revenue *models* — a mechanism, a
payer, a price, a plausible number — not features with a price stapled on.

An earlier draft of this document mostly listed content ideas. Content is not a
monetization option. Content is inventory that a model sells; the model is what
decides whether anyone ever pays. Those ideas have been moved to the last
section and demoted to what they are.

---

## The finding that outranks the rest

**The model is not this product's problem. Distribution is.**

A premium mobile game with no audience, no publisher and no marketing budget
sells in the low hundreds of units lifetime. That is not a pessimistic reading,
it is the median outcome on both mobile stores, and at £6.99 net of a 30% cut it
is under £1,000. Every model below multiplies by an audience number, and for
this product that number is currently zero.

So the options that matter most are not "which IAP" but **who fronts the money
or supplies the audience**: a platform licence, a publisher, or a storefront
whose own discovery engine does the work. Those are options 7–10, and they are
worth more than 1–6 combined.

Second finding, which constrains all of it: **there is no analytics in this
build** (`docs/deploy.md` — no server, no telemetry). Whatever is chosen cannot
be measured, tuned or A/B tested after launch. That argues for models that are
correct on day one and do not need optimisation — which is an argument for
premium, and against anything free-to-play.

---

## A. Charge the player directly

### 1. Paid up front, mobile

Pay once on the App Store and Play. £6.99–£8.99.

- **Net:** 70% (85% under the small-business programmes, which this qualifies for).
- **Setup cost:** $99/yr Apple, $25 once Google. Store listings. No code beyond
  shipping.
- **Plausible revenue:** £0–£3k in year one unaided; £15k–£60k with a genuine
  press moment or a subreddit that adopts it. Wildly variance-driven.
- **Fit:** high. Matches the audience, the product and the absence of analytics.
- **Weakness:** one payment per player, ever. No tail.

### 2. Free with a single unlock

Free download, one non-consumable IAP to continue past the first season.

- **Net:** identical per sale. Different funnel: perhaps 20–50× the installs at
  a 1–3% conversion, which is roughly a wash on revenue and much better on reach.
- **Setup cost:** the entitlement plumbing (`src/platform/entitlements.ts`, flip
  `capabilities().purchases`, a restore row in `SettingsView.vue`) plus the gate.
- **Fit:** high, and it is the better of the two if the goal is players rather
  than revenue — a free install is a review, a screenshot, a word of mouth.
- **Recommended over 1** for exactly that reason.

### 3. Paid content packs

Repeat purchases from people who already bought. £1.99–£3.99.

- **Net:** same cut. **Realistic attach rate:** 10–25% of an existing base.
- **Revenue:** a function of base size, so it is worth nothing until 1 or 2 has
  worked. On a 5,000-buyer base, a £2.99 pack at 15% is ~£1,500 net.
- **Fit:** good, and it is the only model here with a tail.
- **Cost:** the pack seam (`src/engine/world/dataPack.ts`, which two comments
  already point at and which does not exist) plus save-compatibility work. Real
  engineering, and it is worth doing *after* the base sells, not before.

### 4. Ads

Rejected on mobile: kills the premium signal, drags in ATT and TCF consent,
breaks the offline property, and the rewards that would convert are the ones
that damage the systems.

**But on the web it is the only model available.** A free web build with no
payment processor earns exactly zero. If the web build is to earn anything
itself, it is ads or nothing — which is an argument for option 9 (let a portal
run them) rather than for integrating an SDK.

### 5. Direct web sale

Sell the web build yourself through Paddle or Lemon Squeezy (merchant of record,
so they handle VAT — do not do this with raw Stripe unless you want to file EU
VAT returns).

- **Net:** ~92%, the best on this page by a wide margin.
- **Problem:** entitlement. Offline-capable static files with no server means a
  signed licence key at best, and a crackable one. Acceptable — piracy of a £7
  niche sim is not the constraint — but it is real work for a channel with no
  discovery whatsoever.
- **Fit:** low as a primary, sensible as a "buy it direct" link next to the
  store badges, mostly for people who ask.

### 6. Subscription

No. Requires a content cadence, a server and a reason to return. The career is
finite by design. Revisit only if option 3 ships three packs on schedule.

---

## B. Get paid by someone other than the player

**This is the section that matters.**

### 7. Platform licensing — Apple Arcade, Netflix Games, Play Pass

A platform pays you to carry the game. Arcade and Netflix forbid ads and IAP
entirely, which is not a compromise here — it is what the game already is.

- **Mechanism:** Arcade and Netflix pay a development/licensing fee, often with
  milestones, plus for Arcade an engagement-weighted pool. Play Pass is pure
  engagement revenue share.
- **Money:** Arcade deals have been reported anywhere from low six figures to
  several million. Netflix similar in shape. Treat any specific number as
  unreliable — terms are NDA'd and my knowledge here has a cutoff — but the
  order of magnitude is *transformative compared with everything in section A*.
- **Fit:** unusually high. They want premium, complete, no-IAP, offline,
  portrait-friendly single-player games with depth. That is a literal
  description of this build, down to the offline service worker.
- **Cost:** a pitch, a playable build, and patience. Both are curated and most
  submissions are declined. Play Pass is far easier to get into and worth
  correspondingly less.
- **Action:** this is the single highest-expected-value thing on the page. Pitch
  before launching paid, because launching first weakens the pitch.

### 8. A publisher

A mobile/indie publisher (the Playdigious, Noodlecake, Raw Fury tier) fronts
marketing, store relations, QA, localisation and often porting, against royalties
and sometimes an advance.

- **Money:** typical splits run 50/50 to 70/30 in the developer's favour after
  recoup; advances of £10k–£100k are plausible for a finished, distinctive game.
- **Fit:** high, because what this project lacks is precisely what a publisher
  supplies. It is finished, tested, and demonstrably well-engineered, which is
  the pitch.
- **Cost:** a pitch deck, a build, and giving up a share plus some control.
- **Action:** the second-highest EV item, and it stacks with 7 — publishers
  often broker the Arcade/Netflix conversation.

### 9. Web portal licensing — CrazyGames, Poki, Armor Games

Portals pay for HTML5 games, either a flat licence or a revenue share on ads
they run. **This build is already a static web bundle with an offline service
worker**, which is the exact thing they take, and almost no premium sim is
positioned to do this.

- **Money:** mid-tier HTML5 titles on the big portals can earn hundreds to a few
  thousand a month on rev-share; flat licences are usually four figures. Not
  life-changing; genuinely non-zero, and it is money from an audience that was
  never going to pay for a mobile app.
- **Fit:** moderate. Portal audiences skew casual and session-short, which is the
  opposite of a management sim. A cut-down "one season" build is the sellable
  unit — which is the same artefact as the demo in option 2.
- **Cost:** low. Mostly packaging and a conversation.
- **Caveat:** most portals want non-exclusive or exclusive web rights. Read the
  term sheet against any Arcade/Netflix deal, which may forbid it.

### 10. Sponsorship

The obvious inbound will be betting. **Refuse it.** A football game about money,
carrying gambling brands, changes the age rating, invites regulatory attention in
the UK and EU, and would be the single most damaging thing available to the
product's reputation. Nothing else in the category pays enough to matter.

---

## C. Sell something other than the game

### 11. License the engine

A deterministic, headless, 39,000-line football simulation with no framework
dependency is an asset separable from the game. Plausible buyers: a media outlet
wanting a predictor, a club wanting a recruitment toy, another studio wanting a
sim layer.

- **Money:** deal-shaped, £5k–£50k, unpredictable.
- **Fit:** low probability, high value, and costs nothing to leave open.
- **Cost:** it would need a licence that permits it — check before any
  open-sourcing decision forecloses it.

### 12. Community funding

Patreon/Ko-fi against continued development. Works only where a community already
exists and pays for a *relationship*, not a product.

- **Money:** typically £100–£1,000/month for a solo dev with a modest following.
- **Fit:** low now, moderate after any audience exists. It is a consequence of
  distribution, not a substitute for it.

---

## Channels, and one hard constraint

Models are orthogonal to where it is sold. The channel list:

| Channel | Viable now | Note |
| --- | --- | --- |
| App Store / Play | Yes | Capacitor projects are committed and configured |
| Web (own domain) | Yes | Already deployed to bunny.net |
| Web portals | Yes | Static bundle is exactly the deliverable |
| Apple Arcade / Netflix | By pitch | Best fit for what this is |
| **Steam** | **No, not without work** | See below |
| itch.io | Yes | Near-zero money, near-zero effort |

**Steam is where management-sim money actually is** — the audience is larger,
pays £10–£25, and the wishlist system is the only free discovery engine in games.
It is also, for this build, blocked: the game is portrait-locked in the Android
manifest and the web layout caps at a 520px column (`main.css:1442`). On a
monitor it would be a phone-shaped strip. Making it a credible desktop product is
a landscape layout for thirty-odd views — a real project, not a port.

That is a genuine strategic fork and it is yours to call: **mobile-native and
pitch for a platform deal, or invest in a desktop layout and go where the buyers
are.** Both are defensible. Doing neither and shipping a portrait premium app
cold is the option with the worst expected value.

---

## What this plausibly earns

Order-of-magnitude, and explicitly guesses rather than forecasts — no analytics
exist to calibrate against, and outcomes in this category vary by 100×.

| Path | Year one, realistic | Upside |
| --- | --- | --- |
| Cold premium launch, no marketing | £0–£2k | £20k+ on a press break |
| Free + unlock, cold | £0–£3k | Better reach, similar money |
| Portal licensing | £1k–£10k | Steady, unglamorous |
| Publisher deal | £10k–£100k advance | Plus royalties |
| Apple Arcade / Netflix | Six figures | Transformative, low probability |
| Steam, after a desktop layout | £5k–£150k | The widest distribution, months of work |

---

## Recommendation

1. **Pitch Apple Arcade, Netflix Games and two or three publishers first.**
   Costs a deck and some weeks. Launching paid first weakens every one of those
   conversations, and none of them are available retroactively on the same terms.
2. **While that runs, build the entitlement plumbing** — it is needed under every
   outcome, it is small, and the seam already exists in `src/platform/services.ts`.
3. **If those come back no:** ship free-with-unlock on both stores (option 2),
   licence the one-season build to a web portal (option 9), and decide the Steam
   question with a year of evidence rather than none.
4. **Packs (option 3) only once a base exists.** They are a tail on an audience,
   and there is no audience yet.
5. **Never:** betting sponsorship, bought currency, consumables, anything sitting
   on the blocking-decision mechanic.

---

## The design rules, if money is ever taken in-game

Only relevant under options 2 and 3, and short because they are constraints
rather than ideas.

- **The fiction can be in-world; the transaction cannot.** The phone shell means a
  purchase can be *offered* in a conversation — `Your representative` already
  delivers job offers and the season review (`season/phases.ts:386-410`). The tap
  that spends money still raises a plain sheet with the store's own localised
  price.
- **Real money never reaches the club's books.** Finance is a designed constraint.
  A bought takeover (`takeovers.ts`) is the best-fitting and worst idea available.
- **Nothing on or near a blocking decision.** That mechanic is what stops the game
  being mashed through.
- **Nothing in `src/engine/` may know what was bought.** The engine has no DOM and
  no framework imports, which is why it tests headlessly. Content is handed in,
  the way `WorldSize` is.
- **No bought currency.** One-off named things at real prices. Indirection is what
  the UK CMA's in-game-purchase principles and EU consumer guidance target.

---

## Inventory, not models

These were listed as "monetization options" in an earlier draft. They are things
that could be *sold* under option 3, or that would improve the game regardless.
Neither makes them a way to get paid, and none should be built before a model
exists.

| Idea | Seam | Honest status |
| --- | --- | --- |
| Scenario packs as job offers | `newGame.ts:120`, `jobSearch.ts:91` | Sellable inventory. The best of these. |
| Nation packs | `world/dataPack.ts` (missing), `worldGen.ts:33` | Sellable inventory. |
| New director backgrounds | `newGame.ts:38`, `types.ts:1605` | Sellable, if non-financial — the existing `financier` perk is +25% transfer budget, which would break the rule above. |
| "Start anywhere" unlock | `career.ts:231-250` | Sellable. A day's work. |
| The memoir at career end | `directorCareer.ts:52`, `CareerView.vue:150` | Sellable, and the material already persists in `careerHistory.ts`. |
| Succession — a new director, same world | `season/phases.ts:423` | Feature. Free. Would need 70 seasons measured. |
| Weekly shared seeds + leaderboards | `rng.ts`, `services.ts` | Feature. Free. Good retention, no revenue. |
| Eras (`startingSeason` is already wired) | `newGame.ts:28`, `nations.ts` | Inventory or feature. |
| Authored agents, outlets, architects | `worldGen.ts`, `staffGen.ts` | Inventory. |
| Fictional-world toggle | `types.ts:1658`, `worldGen.ts:222` | Feature. Free. Protects a paid build. |
| Owner/chairman mode with real verbs | `ownership.ts`, `board.ts` | A new system on the scale of international football. Not a monetization option. |

## Housekeeping before charging anyone

- **`navigator.storage.persist()` is never called** (`src/storage/`). A browser
  under storage pressure can evict a paying player's thirty-five-season career.
- **No cloud save.** A reinstall loses everything. `exportSave`/`importSave` exist
  — surface them and prompt at season end until iCloud/Play Saved Games land.
- **`GameSettings.revealTrueAttributes`** (`types.ts:1661`) is a debug toggle that
  shows true attributes. Ship a paid build with that in the settings screen and
  the title mechanic is a free checkbox.
- **`GameState.packs` + `SAVE_VERSION` bump** before any pack ships — a world
  generated with a pack cannot be rebuilt without it.
- **The README's "Club and player names" section is stale.** `realClubs.ts` now
  ships real clubs in real divisions; the README describes the pre-pack generator.
  A paid product makes that paragraph's accuracy matter.
