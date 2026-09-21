# Distribution

What a platform curator, a publisher scout or a portal buyer sees in the first
ten minutes with this build, and what to change so that they say yes.

`docs/monetization.md` settled the question of *who pays*: the model is not
the problem, distribution is, and the money that matters comes from Apple
Arcade, Netflix Games, a publisher, or Steam. This document is the next
question. Those four buyers each run a checklist, most of it mechanical, and
this build fails several rows on every one of them before anybody has judged
the game. The list below is ordered by how much money each item unlocks
divided by how much work it is, and it is honest about which items are weeks.

Two rules for reading it. **Nothing here is a new system.** The engine is
finished and measured; every item is a shell, a layout, a data file or a
build. And **nothing here touches the identity** in `docs/identity.md`. The
sentence still stands: you buy players you cannot fully see, for a coach you
do not control. Distribution work that softens it for a wider audience would
sell the one thing a curator can put in a paragraph.

---

## The finding

**The two most valuable buyers want the same missing thing, and it is a
layout, not a feature.**

Apple Arcade titles must run on iPhone, iPad, Mac and Apple TV. Steam is a
monitor. Both are landscape, wide, and often driven by a pointer or a pad.
This build is portrait-locked in both native manifests
(`ios/App/App/Info.plist:33`, `AndroidManifest.xml:18`) and its layout caps
at a phone column (`main.css` sizes everything off a 390px phone in rem). On
an iPad it is a strip down the middle of the screen; on a Mac or a television
it is not a product.

`docs/monetization.md` presented this as a fork: stay mobile-native and pitch
Arcade, or build a desktop layout and go to Steam. It is not a fork. The
Arcade pitch is *also* blocked on the wide layout, because the curators will
open it on an iPad first. So the wide layout is the one investment that
unlocks both of the six-figure paths at once, and everything else on this
page is cheaper and smaller.

That is the headline. The rest is the checklist.

---

## A. Things that are on every buyer's list

### 1. A wide layout — iPad, Mac, Steam, TV

**Unlocks:** Apple Arcade eligibility, Steam, Mac App Store, the "tablet"
row on Play Pass.
**Cost:** the largest item here. Weeks, not days.

The architecture makes it far cheaper than it looks. The screens are
typographic lists and cards with no fixed-pixel art. The five-tab nav and
the hub already describe a sidebar. The phone document's own anti-goal ("not
a reskin of thirty views") is the right instinction here too: this is not a
second UI. It is one breakpoint at roughly 900px that does three things:

- The five tabs become a left rail, the way the same five tabs do on an iPad
  in any Apple app. Nothing under them changes.
- List screens (squad, market, scouting, league) get a **detail pane** on the
  right, so tapping a player row opens `PlayerView` beside the list instead
  of over it. That is the one pattern that makes a management sim feel native
  on a wide screen, and it is a router `<RouterView name="detail">` plus a
  grid, not a redesign.
- The home screen goes to two columns: standing and match on the left, what
  is waiting on you on the right. `HomeView.vue` already computes both as
  separate blocks.

Pointer and keyboard follow for nearly nothing: the lists are buttons and
links already, and `:hover` states are a token change. Controller support
for Apple TV is the one part that is real new work, and it can be the last
thing done, after the deal is in conversation, because Apple TV is the
platform Arcade cares least about.

Unlock the orientation in both manifests at the same time. Portrait on a
phone stays the default and the design; the lock is what stops an iPad
rotating.

### 2. A guaranteed first hour

**Unlocks:** every pitch. This is what a curator actually plays.
**Cost:** days. It is a scenario, and the seam for scenarios already exists
(`newGame.ts:120`, `jobSearch.ts:91`, both named as inventory in the
monetization document).

The game's distinguishing beat is *your signing does not play*. Right now
whether a curator meets it inside their first session is left to the RNG. A
fresh save can go ten weeks with the coach starting everyone you bought, and
the person judging it puts it down having seen a competent, quiet, dense
management sim with a phone gimmick they did not reach.

An authored opening — one club, one seed, one situation — fixes it: you
arrive in the window with a striker the board has already agreed to sign, the
coach did not want him, and by week three he is on the bench and the coach
has said so on the home screen. The engine needs nothing new; `snub.ts`,
`coachView.ts` and the seeded RNG already produce the beat. The scenario just
guarantees the order. Make it the default "New game" and keep the open world
behind "Choose your own club".

The same build is the demo for a publisher, the one-season build for a web
portal, and the free half of free-with-unlock. One artefact, four uses.

### 3. Cloud save through the platform, not a server

**Unlocks:** Arcade (iCloud sync across devices is a requirement, not a nicety
when the game runs on four device classes), Play Pass, and it retires the
"reinstall loses a forty-season career" defect that would sink a review.
**Cost:** a few days, because the seam already exists
(`src/platform/services.ts`, `cloudSave` is a no-op that reports
unavailable).

The blocker in the roadmap is real: the save is about 3.5 MB gzipped and Play
Saved Games caps a snapshot at 3 MB. iCloud key-value is 1 MB; iCloud
Documents has no meaningful limit and is the right target on Apple. On
Android, either trim the snapshot (the career history in
`storage/careerHistory.ts` is the obvious separable piece and is, per its own
header, never displayed) or ship without Play Saved Games and say so. Do not
build a server for this; the monetization document already ruled that out and
the platforms provide it free.

Alongside, call `navigator.storage.persist()` on the web. One line, listed
under housekeeping already, still not done.

### 4. Achievements on Game Center and Play Games

**Unlocks:** a row on the Arcade and Play Pass checklists, and the store
listing surface that platforms promote.
**Cost:** a day or two per platform, once developer accounts exist. The
engine side is done (`engine/systems/achievements.ts` decides what was
earned, `services.ts` reports it), so this is the Capacitor plugin and a
mapping table.

### 5. A fictional world by default

**Unlocks:** a platform's legal review. This is the one row that can end the
conversation rather than delay it.
**Cost:** a day. `types.ts:1658` and `worldGen.ts:222` are the two touch
points, and the monetization document already lists the toggle as free.

The descriptive-use position on real club names is the genre's convention,
and indies on the App Store get away with it. A platform that puts its own
brand on the game and pays for it has a legal team that does not sign off on
"the genre has long used this." Netflix in particular licenses everything it
carries. Ship the pitch build with the generated world as the default and the
real-clubs pack as an opt-in the platform can decline, and the question
disappears from the term sheet. Do not remove `realClubs.ts`; keep it for the
direct-to-consumer build where the convention holds.

### 6. Localisation, or an honest statement about it

**Unlocks:** Netflix (they localise into their tiers as standard and prefer
titles that can be), Arcade's international storefronts, and most publisher
deals, which price localisation into the advance.
**Cost:** large and mostly not yours to do. The strings are not the problem;
the generated prose is. `voice.ts`, `press.ts`, the match report and the
snub all compose English sentences from parts, and that does not translate
by a string table.

Do not build an i18n layer speculatively. Instead: put the UI strings behind
a single table so the shell can be localised on request, and state in the
pitch that the *voice* systems are English and that the game is pitched as an
English-language title first. Publishers hear that every week and price it;
pretending otherwise costs credibility.

---

## B. What sells it in thirty seconds

A curator opens the store page or the deck before the build. These are the
assets, and one of them is a feature.

### 7. Build the phone

The phone is specified in `docs/the-phone.md`, not started, and the identity
document correctly demoted it from "what the game is" to "how the coach
reaches you." Both are right. The phone is also, separately, the only thing
in the build that a screenshot can carry.

Store screenshots of a dense typographic squad list say "spreadsheet."
Screenshots of a coach texting you that your record signing is on the bench,
with your three possible replies underneath, say the whole identity in one
frame with no caption. That is the frame for the App Store page, the deck's
cover, the trailer's first shot, and the press image. It is a UI layer with
no engine change, its anti-goals are written down, and it is the single
highest-return piece of *visible* work left. Build it as specified and do
not let it grow.

### 8. A ninety-second trailer and six store screenshots

Not code. Listed because no pitch is read without them and because the
material has to come from items 2 and 7: the scenario guarantees the beat is
on screen, the phone makes it legible at thumbnail size. Sequence the work
so the trailer is cut after both land.

### 9. The screenshot-safe theme

`main.css` already runs on tokens and the monetization document lists themes
as sellable cosmetics. For distribution the useful variant is not a new look
but a **light theme**, because both stores composite screenshots against
white marketing pages and Apple's editorial features prefer artwork that
works on both. The redacted-man badge and the redaction bar survive
inversion. This is the cheapest item on the page and should not be mistaken
for the important one.

---

## C. What a publisher asks that this build cannot answer

### 10. Retention numbers

Every publisher's second question is "what is your D7." There is no analytics
in this build, by design, and the monetization document treats that as an
argument for premium. It remains one. But a pitch with zero numbers is
weaker than a pitch with small numbers.

The honest middle: a closed beta on TestFlight and Play internal testing of a
few dozen people, a **local** session log the game already has the
ingredients for (the save knows the week count and the wall-clock time of
every load), and an opt-in "share your play summary" export at the end of
the beta. No SDK, no server, no consent banner, and a slide that says
"median tester reached week N, X% completed a season." That is enough to
answer the question, and it is the only version that keeps the offline,
no-telemetry property intact.

### 11. A build that runs in a browser tab

Publishers and curators do not install APKs from GitHub releases, and Arcade
and Netflix scouts play on their own devices only after the deck has landed.
The web build exists, is offline-capable, and is not deployed anywhere
(`docs/deploy.md`). Put the scenario build (item 2) on a password-protected
path on the existing bunny.net host so the pitch email carries a link. Zero
engineering; it is a deploy step.

---

## Order of work

1. **Fictional world by default** (5). One day. Removes the legal blocker
   before anybody sees the game.
2. **The opening scenario** (2). Days. Guarantees the beat.
3. **The phone** (7). As specified. Gives the beat a frame.
4. **The wide layout** (1). Weeks. Makes the game exist on iPad, Mac and
   Steam, and makes the Arcade pitch possible.
5. **Cloud save and achievements** (3, 4) once developer accounts exist.
   These are gated on paperwork, not on design, so start the paperwork now.
6. **Trailer, screenshots, the hosted build, the beta** (8, 11, 10). After 2
   and 3, before any pitch is sent.
7. **Localisation** (6) only against a term sheet that requires it.

Do the first three before pitching anyone. They are small, and they are the
difference between a scout meeting the game's idea in ten minutes and a scout
never meeting it at all. Do the fourth before pitching Arcade or listing on
Steam, because neither will look at a portrait strip. Do not start the
fourth first: it is the longest item, and the pitch deck can be built and the
publisher conversations opened while it is in progress.

---

## What not to build for distribution

Stated because each has been suggested and each would test well.

- **A free-to-play economy.** Rejected in `docs/monetization.md`; still
  rejected. Arcade and Netflix forbid it and the game's identity cannot
  survive it.
- **A "casual mode" that shows true attributes or lets you pick the team.**
  Widening the audience by removing the two constraints that define the game
  produces a worse version of a genre that already has a leader.
- **Multiplayer.** Publishers ask. The engine is deterministic and seeded, so
  a *weekly shared seed with a leaderboard* is honest and cheap and is
  already on the inventory list. Real multiplayer is not this game.
- **A generic reskin to look "more premium."** The visual language was built
  deliberately and is distinctive. The gap is not styling; it is that the
  most distinctive frames (the coach's snub, the phone) are not yet on
  screen at thumbnail size. Item 7 fixes that. A restyle would not.
