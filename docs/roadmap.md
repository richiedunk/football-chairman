# Roadmap

Agreed direction and the reasoning behind it. Written down so none of it lives
only in a chat log.

## Order of work

Each lands as one commit, with tests and a multi-season measurement before
moving on. Every calibration bug in this project so far has surfaced by
simulating seasons and reading the numbers, never by inspecting code — so
"measure after each" is a rule, not a nicety.

### Done

1. **Squad registration** — self-contained, and it changes how everything
   after it feels. Done first so later systems were built against the
   constraint rather than retrofitted to it.
2. **Financial regulation** — builds on the same compliance mindset and shares
   its UI.
3. **Agents as characters** — independent of the other two; the data model
   already existed and was unused.
4. **Ownership takeovers** and **deadline day** — narrative layers over
   systems that were stable by then.

### Now

5. **The visual language** — first, because everything after it adds screens.
   Doing it later means retrofitting six new views instead of building them
   right. See "The visual language" below.

### Next, in this order

6. **Director age and career length.** You start at 30 and are gone at 65, no
   exceptions. There is no age field on the director at all today.
7. **The long save.** Never yet run. The 65 cap bounds a full career at about
   thirty-five seasons, which makes it a finite, measurable thing rather than
   an open-ended soak test.
8. **Recruitment model.** Consolidates dials that already exist rather than
   sitting beside them.
9. **Buy-back clauses.** Small, self-contained, and it makes selling young
   players a decision rather than a loss.
10. **The data department.** Needs the recruitment model to sit on.
11. **The dressing room.** Deliberately last of the new systems, because it is
    the one that could pull the game out of its lane.
12. **International football.** Largest of the new work, and it wants a stable
    calendar underneath it.

**Still deferred: continental competitions.** Qualification places are already
modelled and clubs already qualify; the competition itself is not built. It is
the largest remaining hole and the largest job. Either it gets built or the
dangling `continentalPlaces` hooks get hidden — leaving leagues awarding
qualification to a competition that does not exist is the worst of the three
options. Decide after the long save, which will show how much it is missed.

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

### 4. Ownership takeovers — built

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

### 5. Deadline day — built

A compressed sequence at the close of each window: offers arriving with hours
rather than weeks to answer, rival clubs hijacking deals in progress, and
selling clubs suddenly reasonable about a price they would not discuss in July.

## The visual language

The old UI had no source. It accreted panel by panel, and the result was
card-in-card: every section a bordered box on the same dark ground, so nothing
on a screen was louder than anything else. That is what read as busy. It was
never the amount of information.

Three directions were drawn, each on Home and on the squad list — the squad
list being the real test, since it is twenty-five rows of nine attributes.
`design/` holds the artboards.

**The direction, settled:**

- **Body: dense and typographic.** Near-black neutral `#08090B`, JetBrains
  Mono for every number, Inter for names and prose, fixed columns, hairline
  rules instead of borders. Thirteen squad rows fit without scrolling where the
  card layouts fit eight, and nothing is boxed.
- **Controls: one saturated accent.** Lime `#C8FF4D` for the single primary
  action on a screen, and an icon-and-label bottom bar. A mono text nav reads
  as a toolbar and gives no tap affordance.
- **Club colour lives in the header only.** The band is the club primary
  converted to HSL with lightness clamped into 10–17% and chroma capped, so
  white text always clears 4.5:1; a 3px strip of the untouched colour sits
  beneath it. White primaries fall through to the secondary; near-blacks lift
  rather than clamp. Nothing below the strip is ever club-coloured, so no club
  in the pack can break the palette. One function, `headerBand()`.
- **Home is a dashboard with hierarchy, not a grid of tiles.** A uniform grid
  of equal boxes is the exact fault being fixed; Football Chairman's version of
  it is good at showing state and bad at saying what matters. So nothing on
  Home is the same size or shape as anything else: the standing is 66px and
  unchallenged, board confidence sits under it with a marker at the target
  because position-against-target is what drives it, the next match gets a
  raised band and the opponent's colour, decisions read as an inbox, and the
  six departments are one small bar chart rather than six tiles — same numbers,
  a quarter of the height, and a weak department legible without knowing the
  scale. Everything stays tappable; it stops looking like a menu.

**Five nav slots**: Club, Squad, Market, Inbox, League. Finance, Facilities,
Board, Staff, Scouting, Agents, Registration, Achievements and the rest are
reached from the dashboard. Fewer top-level places and deeper drill-down is the
actual de-busying.

### Outcomes get a screen, not a toast

Toasts are a poor deal on a phone. They appear where the reader is not looking,
sit on top of what they are reading, and take themselves away on a timer nobody
set. That is survivable for "saved" and not survivable for "the board will not
sanction building work while the club is in crisis" — a sentence with no other
home in the game.

So an outcome takes the whole screen and waits for a tap. The tap is the point:
the message has been read, and the game knows it.

Two things came out of building it. The toast **overwrote** rather than queued,
resetting its own timer on every call — two messages in quick succession meant
the first was destroyed without trace, which is silent data loss in the one
channel whose entire job is telling you things. And a full-screen panel needs
the app behind it to be `inert`, or every control it covers is still reachable
by keyboard and screen reader, the week button included.

**Not everything earns a screen.** Of the forty-five messages, eight were
dropped entirely: registering a player, taking him off the list, withdrawing
interest, setting a squad status, reassigning a scout, saving, loading. In each
case the list in front of you already changed, and it says it better than a
sentence can. What is left is refusals — which have no other home — and
outcomes you cannot otherwise see.

### The advance button

Weeks are an engine detail. "Advance to Week 23" leaks it, and nobody wants
week 23. A bare "Advance" hides what it is about to set off, which matters in a
game with weeks that are dangerous to step through.

So: one button, one place, two lines — a verb phrase naming the next real
event, and a mono line carrying what the week actually holds.

    Advance to Chelsea        SAT · AWAY · 2 OUT
    Advance a week            INTERNATIONAL BREAK · 6 CALLED UP
    Deadline day              4 OFFERS OPEN · CLOSES 11PM
    Continue                  CHELSEA 1 – 2 UNITED
    Start the season          SQUAD REGISTERED · 24/25
    2 things need you first   NEWCASTLE BID · BRUNO RENEWAL

The last is the blocking state: same button, same place, amber, but it opens
the first blocker instead of advancing. **It blocks only on things that expire
if ignored** — an offer about to lapse, a contract inside its last six weeks.
You can still refuse them. You cannot sleepwalk past them. It never blocks to
make you read something, because that trains you to tap through without
looking.

One tap then runs the whole routine: clear blockers, run the week, play the
match, show the result, return to the dashboard.

## Director age and career length — built

You start at **30** and you are finished at **65**, no exceptions. That changes
the shape of a save from open-ended to a career with a horizon.

Why it earns its place:

- **It makes time cost something.** A three-year rebuild at 58 is a different
  decision from the same rebuild at 34. Nothing else in the game currently
  makes the player feel the clock.
- **It bounds the long save.** Thirty-five seasons is a finite thing to
  simulate and measure, and it is roughly a real career: a director appointed
  at 30 who lasts is Txiki Begiristain, not a dynasty.
- **It gives the ending a shape.** Retirement at 65 is a summary, not a
  failure — trophies, clubs, players sold on, the youth graduates who made it.

Starting at 30 is the other half. The jobs board already gates by experience;
age gives that gate a reason. You are not starting at a non-league club because
the game says so, you are starting there because you are thirty and nobody
sensible hands a thirty-year-old a Premier League recruitment department.

**As built.** The birthday lands at the season roll, after the review, so the
season just finished is counted at the age it was worked. The last season
anyone works is the one during which they turn 65: they see it out, then they
go, and the job offers on the table are cleared with them rather than dangling
a career the rules have already ended. The week button refuses to advance
afterwards — a hard stop that a still-working button would quietly repeal.

**And you may go early.** "Sixty-five at the latest" fixes the last day; it does
not oblige anyone to use all of it. Standing down is a confirmed, irreversible
action at the foot of the career screen, and the record tells the two apart:
*steps down at 58* is not *retires at 65*.

The clock is on the career screen — age, a bar for the share of a career
already spent, and the seasons left, which turns amber at eight and red at
three. An age held in state that nothing surfaces would cost nothing, and so
would change nothing.

## Recruitment model

Not a new set of dials. `ClubStrategy` already carries `youthEmphasis`,
`systemFit`, `wageAggression`, `sellingClubStance`, `domesticBias`,
`mediaStance` and `targetSquadSize`, and they are all market policy. The
recruitment model **consolidates** them into a stated philosophy the club is
known for, rather than adding a thirteenth slider next to twelve others.

What a philosophy should do that loose dials do not:

- **Be legible to everyone else.** Agents, players, the board and the media
  should all know what kind of club you are, and price accordingly. A selling
  club gets different offers from a hoarding one.
- **Cost something to change.** Turning a youth project into a win-now push
  mid-cycle should be a visible break with what the board signed off, not a
  slider drag.
- **Constrain the AI too**, so divisions contain clubs that recruit
  differently and predictably, which is what makes a market feel real.

The care needed: a philosophy must stay *market* policy. The moment it starts
saying how the team plays, we are in the head coach's job.

## Buy-back clauses

Insert a buy-back price and a window when selling. It is a real and now very
common mechanism, and it is squarely the director's instrument.

What it buys the game: selling a 19-year-old stops being a pure loss. You can
take the money, let someone else pay his wages and give him the football you
could not, and keep the right to bring him back at a known price. When he
becomes very good, the clause is worth more than the fee ever was — and when it
lapses unexercised because you had no room in the 25, that is a real and
self-inflicted regret.

Needs: a price, a window, a decision point when the window opens, and AI clubs
that both request and honour them. Selling clubs should resist a low buy-back
the way they resist a low fee.

## The data department

An investable department, like the academy or scouting, whose output is an
**edge rather than an answer**: a shortlist of players the model thinks are
underpriced, each with a confidence figure, and both the list and the
confidence get better the more you have put in.

Why this and not a better scout: it is the single most real thing about the
modern job. It is also the honest way to make an information advantage a
purchase rather than a gift — a badly funded department produces a short list
of low-confidence names, some of them wrong, which is exactly what a badly
funded department produces.

It sits on top of the recruitment model, which is why it comes after it: the
edge should be expressed in the club's own terms.

## The dressing room

Agreed, and **it cuts both ways**. A strong positive character lifts a room —
a senior professional who sets standards raises the players around him — as
surely as a disruptive one poisons it. Both need to be visible, and both need
tuning carefully, because a system where every signing is a risk and none is an
upside is just a tax.

**The line this system must not cross.** The dressing room is where this game
would slip out of its lane. It gives **information and consequences, never
man-management actions**. There are no team talks, no praising or fining
players, no individual training focus, no promises about playing time made in a
meeting. You learn that the room is turning, you see it in results and in
renewal talks, and you act on it the way a director actually does: by selling
someone, by not renewing someone, by signing a certain kind of professional, or
by backing or dismissing the head coach.

Every existing `ClubStrategy` dial is market policy and none is a tactic, and
there is no team selection, formation, training or team talk anywhere in the
game. That is the line, and the dressing room is built to respect it.

## International football

Consequences, not management. You do not pick a national side; you live with
what it does to your players.

- **Call-ups** take players out of your weeks, and the number of them is a
  consequence of how you recruited — a squad built on South Americans empties
  differently from one built at home.
- **Caps and tournaments raise value and wages.** A player who has a good
  summer costs more to keep and is worth more to sell, which is the single
  most reliably real thing about the transfer market.
- **Injuries on international duty** are the oldest grievance in the job.
- **Tournament years reshape the calendar and the market**, and a good
  tournament turns a squad player into a target.

It wants a stable calendar underneath it, which is why it is last.

## The match report

The match engine was always producing far more than the game showed. Every
result carries per-player ratings, the events, both lineups, possession and
shot counts; the UI surfaced one field of it — the one-line summary — as a
toast and a row in a list. Everything else was computed weekly and discarded.
That was also the only part of the original brief never built: *result, player
ratings, key highlights, manager feedback*.

So a result now gets a screen, landed on the moment the match is played, and
the advance button becomes **Continue** — which is the state the design drew
and could not implement, because there was no post-match moment for it to
belong to. A week with two matches queues both.

**The judgement is the part the engine did not have.** A scoreline is not a
verdict: losing at the champions and losing at home to the bottom club are the
same three characters and mean opposite things, and a director shown only
"lost 2-1" has to work that out himself every week. `matchReport.ts` compares
the result to what the fixture was worth before kick-off, and hands the verdict
to the head coach to say out loud — the one football opinion in the game that
is his to give rather than yours, and it reads differently depending on how he
gets on with you.

A report reopened later from the results list is a detail screen, not a moment,
and deliberately does **not** carry the advance button. A control that advances
the week, sitting under a match from three weeks ago, is a way to lose a week
by tapping the wrong thing.

## Real club names

The game ships with the actual clubs, in the divisions they actually play in,
and nothing else real. This follows the model the genre has long used: club
names are used descriptively, to identify which club a thing happened to, and
for no other purpose. Every player, coach, scout, agent, owner, architect and
journalist is generated, no crest or kit design is reproduced, and no likeness
of any real person appears anywhere.

The notice lives on the title screen and in full on the About screen, and it is
written for this game rather than copied from anyone else's.

`src/engine/world/realClubs.ts` is a data pack keyed by nation and tier. Where
it runs short, world generation makes up the rest, so the pack can be as
complete or as partial as it is accurate — and a division nobody has filled in
still works. Keeping it current is a data edit, not a code change.

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

## The first long save

Thirty-five seasons, 1,820 weeks, one run. It did what it was built to do: the
director started at thirty, aged a year at each roll, and retired at sixty-five
having worked exactly thirty-five seasons. The clock is sound.

It says almost nothing about career progression, and the reason is worth
writing down. `scripts/careerlength.ts` never accepts a job offer — there is no
AI player — so the run is one club for thirty-five years by construction, not
by simulation. Reading "one club, no trophies, best finish 4th" as a verdict on
the game would be reading the harness.

What it did find is the sacking defect below, which nothing shorter would have
surfaced: a counter reading 169.

The next version of this run needs to accept offers when they come, which is
the difference between measuring a career and measuring a chair.

## Getting around

The recurring complaint, said three separate ways: everything below the five
tabs is hard to reach and easy to forget exists. The nav stays at five — that
part was right — and the dashboard grows a hub of the places a director
actually goes: the boardroom, the staff room, facilities, finances, the
academy, and a way through to everything else. Each carries a line of live
state, so the row is worth reading even when you are not going anywhere.

Two specific holes it closes. "Start the upgrade from the facilities screen"
was an instruction with no route attached. And there was no quick way to the
staff room at all, which is where hiring and dismissing happens.

## Asking for a specific thing

"Ask the board to fund a facility upgrade" was a request with no object: the
board handed over a round sum — eighteen weeks of revenue, regardless of what
you wanted it for — and told you to go and spend it somewhere else.

Now you name the facility. The sheet lists all five with their level, their
grade and what the next level costs, worst first, because that is the one a
director would raise. The board weighs the actual price against turnover, so
taking the training ground from eighteen to nineteen is a harder conversation
than fixing an academy at four. And a yes starts the work, rather than ending
in homework.

## The season starts in week six

Every league in the world reads "played 0" until week six, because week six is
matchday one and weeks one to five are pre-season. That is correct and it
looked broken — a table of zeroes with a week number beside it and nothing
saying why. Measured across eight divisions, home and overseas, they all move
in step from week six onward.

Fixed by saying so: the status strip marks the phase (`W3 PRE`), and a table
with nothing in it explains that nobody has kicked a ball yet.

## Waiting for the week

A week costs about 275ms at the median and can pass a second at the season
roll. That is long enough to feel like a hang, so it gets a proper screen
rather than a small spinner — and a line of terrace humour to read while it
runs.

One constraint shaped it: the tick is a single synchronous call, so nothing
repaints while it runs. A rotating carousel of messages would freeze on its
first entry and look worse than nothing. So there is one line per advance,
chosen fresh each time, and the only moving part is a CSS transform, which is
composited off the main thread and therefore keeps going while everything else
is blocked.

Making the tick itself faster is a separate job and not this one.

## Out of work

Being sacked drops you onto a jobs board, not out of the game — and the board
is the point.

**It is far sparser than the one at the start.** A new career is offered the
whole bottom of the pyramid because nobody has an opinion about you yet. A
sacked director is offered what happens to be vacant, which is not much.

**Time moves in months, not weeks.** There is a "check back next month" that
skips four weeks, and the listings shift when it does: some clubs are still
looking, some have filled the post, one or two new ones come up. That is what
being out of work actually feels like — not a menu you pick from, a wait you
sit through while the thing you want may or may not appear.

It also solves the calendar question honestly. Weeks passing one at a time with
no club and nothing to do would be dead time; a month at a stride is a real
unit for a job search, and it keeps the sixty-five-year-old clock ticking, so a
long spell out genuinely costs you career.

Your experience widens what is *eligible* — that already falls out of the level
gate — and the sacking itself takes something off your reputation, so being
dismissed twice in three years shows.

## The news feed

It lives on the league screen, sorted by league.

That is a better home than the inbox, which is for things addressed to you, and
better than a screen of its own, which nobody would open for half an item a
week. On the league screen it is what it actually is: what has been happening
in this division. A rival being taken over belongs next to that rival's league
position.

## Known defects

**Being sacked does not remove you from the job.** Found by the first long
save. `paySeverance` clears the contract and the board's message lands, but
nothing changes `state.playerClubId` and nothing closes the career entry — so
the director is still sitting at the club the following week, with no contract,
and the board sacks him again. Over a thirty-five-season run the counter read
**169 sackings at one club**, and career earnings came to £30,600 because there
was no contract to be paid under for most of it. The UI hides this by routing
to the career screen on a sacking, but nothing stops a player navigating back
and pressing Advance. `closeCareerEntry` exists and is only ever called when
leaving *for another club*.

**Squads thin at the season roll from season four onwards.** Mid-season sizes
hold at the recorded 24-26 with no club below sixteen, but at rollover the
average drops to 21-22 and the smallest club can be as low as seven for a few
weeks before renewals and free-agent signings catch up. Registered squads drift
down with it, from 21 named in season two to 17 by season seven, and free
agents accumulate — 190 at the start, around 2,000 by season five. `squadsize.ts`
shows it, and it is stable rather than worsening. Not urgent, since the
fieldable mid-season world is right, but it is the next thing to measure
properly: either renewals are firing too late in the roll, or the AI is letting
too many contracts run down at once.

Nothing else outstanding. The two that stood here — transfer volume and clubs stuck in
financial crisis — are fixed and measured. Numbers worth holding the world to,
all from `scripts/`:

- Permanent transfers **6-8 a club a season**, plus roughly two frees and two
  loans on top.
- Mid-season squads **24-26**, no club below sixteen.
- Financial crisis: **12% of clubs pass through it over fifteen seasons**,
  median spell 2.3 seasons, **none permanent**.
- Squad-cost ratio median **52-58%**, with seven to twelve clubs sanctioned a
  season out of 238.
- Wages **54-78% of revenue**, per-player pay realistic at every tier.

## Standing rules for this project

- The engine stays pure TypeScript with no framework imports.
- Measure before tuning. Add a script under `scripts/` for anything worth
  measuring twice.
- Every fix explains itself in the commit message, including what the wrong
  behaviour was — the commit log is the design record.
- Assert that a code edit matched before trusting it. A silently no-op edit has
  bitten this project once already.
