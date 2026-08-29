# Roadmap

Agreed direction and the reasoning behind it. Written down so none of it lives
only in a chat log.

## Order of work

Each lands as one commit, with tests and a multi-season measurement before
moving on. Every calibration bug in this project so far has surfaced by
simulating seasons and reading the numbers, never by inspecting code — so
"measure after each" is a rule, not a nicety.

1. **Squad registration** — self-contained, and it changes how everything
   after it feels. Do it first so later systems are built against the
   constraint rather than retrofitted to it.
2. **Financial regulation** — builds on the same compliance mindset and can
   share its UI.
3. **Agents as characters** — independent of the other two; the data model
   already exists and is unused.
4. **Ownership takeovers** and **deadline day** — narrative layers over
   systems that are stable by then.

**Deferred: continental competitions.** Qualification places are already
modelled and clubs already qualify; the competition itself is not built. It is
the largest remaining hole and the largest job. Not now.

## What each mirrors

These are game designs *modelled on* real competition rules, not reproductions
of them. Where a real rule is fiddly, the game takes the shape and drops the
paperwork.

### 1. Squad registration — built

Modelled on the Premier League's squad rules:

- A **25-man senior squad**, named between windows and locked in between.
- At most **17 players who are not homegrown**. That is the operative rule —
  the "8 homegrown" figure people quote is a consequence of it. A club with
  only 3 homegrown players has a squad of 20, not 25, and the slots it is
  missing simply go unused.
- **Homegrown** means three years registered at a club in the same nation
  before turning 21. It is about where a player was *trained*, not his
  passport — which is why it quietly punishes a recruitment policy of buying
  only finished 24-year-olds from abroad.
- **Under-21s are exempt** and unlimited, outside the 25.
- An unregistered senior player **cannot play at all**. Not benched — barred.

UEFA's version adds a stricter "club-trained" tier. Worth considering only if
continental football is ever built.

### Decided: no insolvency events

Financial collapse stops at the sporting sanction. No administration, no forced
sale, no winding-up order.

The reason is the role. You are the director of football, not the owner. What
happens to a club that runs out of money is the owner's problem and the
board's, and dramatising it would put the player in a chair they are not
sitting in. What *should* happen is that the board runs out of patience and
sacks you, and whoever replaces you rebuilds the club however they see fit —
which the existing confidence-and-warnings machinery already does, since
financial crisis drives board confidence down every week it persists.

Points deductions stay in scope. They are a football-authority sanction on the
club for breaking a squad-cost rule, and a squad-cost rule is exactly the thing
a director of football breaks. Losing nine points because you could not stop
signing people is the sanction landing where the decision was made.

### 2. Financial regulation — built

Two real models, and the game should use the second:

- **PSR (Premier League)**: losses capped at £105m over three rolling years,
  enforced by points deduction. Everton and Nottingham Forest were both docked
  points under it in 2023-24.
- **Squad-cost ratio (UEFA, and EFL SCMP in a simpler form)**: wages plus
  transfer amortisation plus agent fees capped at a percentage of revenue —
  70% under UEFA's rules.

**Use the ratio.** It scales naturally across a pyramid where revenue spans two
orders of magnitude, it pressures exactly the thing the player spends the game
managing, and it does not need three years of history before it bites. A
first-season director should feel it.

**Prerequisite, and a real cost:** transfer fees are currently booked as a lump
sum in the season they are paid. Real accounting amortises a fee across the
length of the contract, and *every* financial rule above depends on that. This
has to be built before regulation can be, and it changes the finance ledger,
the season roll and the board's view of the books.

### 3. Agents as characters

The `Agent` type already exists with reputation, aggression, a client list and
a relationship value — and nothing surfaces any of it. Make agents visible and
consequential:

- A super-agent controlling a bloc of players you want. Cultivating him opens
  doors across his whole client list; crossing him shuts them for years.
- Relationship should move on how you deal with his clients, not only on fees:
  renewing early, honouring promises, selling a player he wanted moved.
- Fees already exist in the transfer flow; they should become negotiable and
  relationship-dependent rather than a fixed percentage.

### 4. Ownership takeovers

Mirroring how clubs actually change hands:

- **Foreign investment funds** — big money, impatient, expectations jump
  immediately.
- **Partial stakes** — a minority investor changes the budget without changing
  the board's temperament. Full control is not the only outcome.
- **Celebrity or "angel" owners** — modest money, enormous profile; fanbase and
  commercial revenue jump more than the transfer budget does.
- **Local business owners** — little money, long patience, strong preference
  for youth and prudence.

A takeover should be able to invalidate a three-year plan. That is the point of
it, and it is what makes a long save worth playing.

### 5. Deadline day

A compressed sequence at the close of each window: offers arriving with hours
rather than weeks to answer, rival clubs hijacking deals in progress, and
selling clubs suddenly reasonable about a price they would not discuss in July.

## Platform integrations (store-side, not engine)

None of this touches the simulation. It is shell work, it needs real developer
accounts and signing certificates, and it cannot be tested in this environment
— but the abstraction it hangs off should exist before it is needed, alongside
the haptics wrapper already in `src/platform/`.

### The one that changes a design decision

**Apple Pay and Google Pay are the wrong mechanism for XP boosts.** They are
for physical goods and services. Digital content consumed inside the app must
go through **StoreKit** on iOS and **Google Play Billing** on Android, which
take a platform cut. Shipping an XP boost behind Apple Pay would fail review.
So the purchasable-boost idea is an in-app purchase, with everything that
implies: products defined in App Store Connect and the Play Console, receipt
validation, and restore-purchases handling.

### The rest

- **Sign in with Apple** — needed the moment any other third-party sign-in is
  offered; Apple requires it as an option. Apple Developer Program membership
  and a configured capability.
- **Google Play Games Services** — achievements, leaderboards, cloud saves.
  Career milestones map onto achievements almost directly. Cloud saves need
  checking against the snapshot size limit: our save is around 3.5 MB gzipped,
  which is not obviously inside it.
- **Game Center** — the iOS counterpart, same shape.

The useful work available now is the seam: a `platform/` module the game calls
(`achievements.unlock('first-promotion')`, `purchases.buy('xp-boost')`) that
no-ops on the web and gets a real implementation per platform later. That is
testable today; the store integrations are not.

The split that keeps this honest: **which achievements are earned is an engine
question**, decided from GameState by pure code with no platform imports, and
**reporting them is a platform question**. The engine never knows whether
anyone is listening.

## Known defects

- **Non-league clubs still fall into financial crisis too often** — around 7 of
  22, against 1-2 of 24 in every other division. They run on margins of a few
  percent and any bad season tips them into debt they service slowly. They can
  now trade their way out, which they could not before, but the rate is higher
  than it should be.
- **Cash still drifts upward at the top.** A top-flight club averages £189m
  after eight seasons, against £306m before this work but still climbing.
  Transfer fees cannot fix it — one club's fee is another's income, so they net
  to zero worldwide — and the remaining gap is that permanent fee-paying deals
  run at about one per club per season against a real six to eight. Total squad
  turnover is close to right (roughly five moves a club a season across
  permanent, free and loan); it is the mix that is wrong.

## Standing rules for this project

- The engine stays pure TypeScript with no framework imports.
- Measure before tuning. Add a script under `scripts/` for anything worth
  measuring twice.
- Every fix explains itself in the commit message, including what the wrong
  behaviour was — the commit log is the design record.
- Assert that a code edit matched before trusting it. A silently no-op edit has
  bitten this project once already.
