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

### 3. Agents as recurring characters — built

The `Agent` type already exists with reputation, aggression, a client list and
a relationship value — and nothing surfaces any of it. Make agents visible and
consequential:

- A super-agent controlling a bloc of players you want. Cultivating him opens
  doors across his whole client list; crossing him shuts them for years.
- Relationship should move on how you deal with his clients, not only on fees:
  renewing early, honouring promises, selling a player he wanted moved.
- Fees already exist in the transfer flow; they should become negotiable and
  relationship-dependent rather than a fixed percentage.

### 4. Ownership takeovers — designed

Built on modelling ownership from day one rather than as a special-case event.
Every club gets an owner with wealth, patience, ambition, appetite for
interference, tolerance for debt and belief in youth. That pays for itself
before any takeover happens: it explains behaviour the board already has —
*why* is this board so tight? because the owner is a local builder who will not
put money in — and it makes clubs feel different rather than reskinned. A
takeover then becomes a change to one object that propagates everywhere,
instead of a pile of special cases.

**The owner reaches deep into the board.** Wage-budget share, transfer budget
drawn from reserves, tolerance for debt, season expectations and mandates,
willingness to fund stadium and facility work, how fast confidence falls when
results go badly, and how a board hears a request — all of it keys off the
owner. This is the largest part of the work and the part that makes the rest
worth having.

**Four-and-a-bit kinds of owner:**

- **Foreign investment fund** — enormous money, almost no patience,
  expectations jump the moment they arrive, debt often cleared on completion.
- **Celebrity or angel owner** — modest money, real patience, but the fanbase
  and commercial revenue jump far more than the transfer budget does.
- **Local business owner** — little money, long patience, no tolerance for
  debt, a real preference for the academy.
- **Consortium** — middling everything, and slower, because decisions go
  through a committee.
- **Legacy family and fan ownership** as the two incumbent flavours, which is
  what most clubs start as.

**A takeover is a process, not a flash.** Interest, due diligence, a bid, then
completion, over weeks — leaking to the media as it goes, which is what makes
the media system matter here. Triggered by financial distress, relegation, a
club underperforming the size of its city and support, or an owner's patience
simply running out.

**It happens everywhere, not just to you.** Rivals get taken over, suddenly
outspend you, and the shape of the division changes underneath a plan you made
in good faith. That is the point of it.

**You are never sacked by the takeover itself.** A new owner always lets you
see out the season. What changes, and changes hard, is your standing with the
board: who has bought the club and how they did it moves the relationship
enormously, and a director who does not fit the new regime spends that season
knowing it.

**You get one meeting.** On completion you pitch a plan — a youth project, an
immediate push, financial consolidation. Reading the new owner correctly keeps
you in the job and can win a budget with it; misjudging them costs you the
season's goodwill. One decision, high stakes, and squarely the job of a
director of football rather than of a chairman.



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

- **Non-league clubs still fall into crisis more than they should** — around 5
  of 22, against 0-2 of 24 in every other division. They run on margins of a
  few percent and a bad season tips them into debt. Much better than it was,
  and they can trade their way out now, but the rate is still high.
- **Permanent fee-paying transfers run at about two per club per season**
  against a real six to eight. Total squad turnover is close to right at five
  or six moves a club — the mix is still tilted towards free transfers and
  loans. The ceiling is the wage budget: a club cannot carry six new salaries
  a year without shedding six, and raising the budget further would break the
  squad-cost calibration. The remaining gap is that AI clubs sell less than
  real ones do.

## Standing rules for this project

- The engine stays pure TypeScript with no framework imports.
- Measure before tuning. Add a script under `scripts/` for anything worth
  measuring twice.
- Every fix explains itself in the commit message, including what the wrong
  behaviour was — the commit log is the design record.
- Assert that a code edit matched before trusting it. A silently no-op edit has
  bitten this project once already.
