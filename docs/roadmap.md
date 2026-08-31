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

5. ~~**The visual language.**~~ Built — see below. Done before the new screens
   rather than after, so six views were built right instead of retrofitted.
6. ~~**Director age and career length.**~~ Built — see below.
7. ~~**The long save.**~~ Run — thirty-five seasons, 1,820 weeks. See "The
   first long save" for what it proved and what it could not.
8. ~~**Recruitment model.**~~ Built — see below.
9. ~~**Buy-back clauses.**~~ Built — see below.
10. ~~**The data department.**~~ Built — see below.
11. ~~**The dressing room.**~~ Built — see below.
12. ~~**International football.**~~ Built — see below. Largest of the new work,
    and it wanted a stable calendar underneath it, which is why it was last.

**Every numbered item is done.** What remains is not a queue: the two deferrals
under "Known defects" (a set-piece coach that would be a job title with no
engine behind it, and squads thinning at the season roll), the bugs in
`docs/bugs.md` that need a design decision rather than a fix, and the head
coach who talks — which is a new piece of work rather than a leftover, and
needs a backend before it needs a design.

**Continental competitions are built.** They were deferred pending the long
save, the long save has been run, and they are done — see "Continental
competition" below. The dangling `continentalPlaces` hooks are gone: every
league that awards a place now awards it to a competition that exists, and the
leagues whose confederation is too small to field one have had their places
removed rather than left pointing at nothing.

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

## Recruitment model — built

Not a new set of dials. `ClubStrategy` already carried `youthEmphasis`,
`systemFit`, `wageAggression`, `sellingClubStance`, `domesticBias`,
`mediaStance` and `targetSquadSize`. The recruitment model **consolidates**
them into a stated policy the club is known for, rather than adding a
thirteenth slider next to twelve others.

**Reading the code first changed the job.** Of the seven dials,
`wageAggression`, `domesticBias`, `targetSquadSize` and `mediaStance` were
generated for every club in the world and read by **nothing**. `systemFit` was
read in exactly one place, and that place is team selection, which is the head
coach's job. Only `youthEmphasis` and `sellingClubStance` did any market work
at all. So this was never a presentation layer over working dials — it is the
thing that makes four dead numbers do something.

Six policies, each with a stated trade-off, because a choice that gives nothing
up is not a choice: develop and sell, win now, value hunting, homegrown, star
names, and no stated policy. Changing one costs nine points of board confidence
and is locked for sixty weeks after it is stated — a policy you can change for
nothing is not a policy, and the board's complaint is precisely that the last
one has not been given time to work. Stating a first policy is free; the board
have been waiting to be told.

**What the dials now drive.** `targetSquadSize` sets the squad each club works
to, where the AI previously worked to one constant so every club in the world
wanted the same number of players. `wageAggression` decides how far above the
asking price a club bids and how close to its wage ceiling it will run.
`domesticBias` steers both the human's scouting shortlist and — the higher
volume channel by far — which free agents an AI club prefers.

**Measured over four seasons across 678 clubs**, squads that started identical
(26.0 players, mean age 24.1-24.4, 26-34% foreign) diverged:

| policy | squad | mean age | foreign |
|---|---|---|---|
| Develop and sell | 25.4 | **25.8** | 53% |
| Value hunting | 24.4 | 26.4 | 53% |
| Homegrown | 24.1 | 26.4 | **47%** |
| Win now | **23.7** | **26.8** | 49% |
| Star names | 24.7 | 26.8 | **58%** |

The divergence is real and in the right direction, and it is **modest**: a one
-year spread in age, eleven points in foreign share, 1.7 players in squad size.
Two honest caveats. Squad size ends up ordered by *youth emphasis* rather than
by the nominal target — clubs that promote heavily sit above their free-agent
ceiling and clubs that do not sit on it — which is a fair outcome but not the
one the dial nominally sets. And every squad drifts from ~28% to ~50% foreign
within four seasons whatever its policy, which swamps the effect and is a
separate world behaviour worth its own look.

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

## Buy-back clauses — built

Selling a nineteen-year-old stops being a pure loss. Take the money, let
somebody else pay his wages and give him the football you could not, and keep
the right to bring him back at a price agreed before anybody knew what he would
become. Squarely the director's instrument — a clause in a contract, not a
decision about who plays on Saturday.

**Where you ask for it.** A third option on an incoming offer: *accept, with a
buy-back*. You take less money now — up to a third less — for the right to buy
him back at two and a half times the original fee. That is the real trade, and
putting it on the offer rather than on a screen of its own means it arrives as
a decision about a specific player rather than a setting.

**Why the buying club resists.** A cheap buy-back hands over the upside on a
player they are about to develop, so `buyBackConcession` scales what they want
off the fee by how cheap the clause is: a third off at the floor of 1.4x the
fee, nothing at all by 4x, where he would have to become a different player
entirely. Below 1.4x they refuse outright, the same way they refuse a low fee.

**The window.** Opens a season after the sale — a club that sells a player and
buys him back the same summer has not sold him, and a clause that allowed it
would be a loan with extra steps — and runs three seasons. It is a contractual
right rather than a negotiation, so the holding club has no say; what it does
not override is the money or the squad place, which is what makes it something
to plan for rather than a free player.

**Measured over six seasons across 678 clubs:**

| season | clauses | worth using | under water | median upside | mean age | oldest |
|---|---|---|---|---|---|---|
| 1 | 22 | 0 | 22 | — | 20.5 | 25 |
| 3 | 297 | 46 | 251 | £26k | 22.7 | 27 |
| 6 | 477 | **187** | **290** | **£292k** | 24.0 | 27 |

Clauses land on the players they should — mean age 24, oldest 27, **none at all
on a player over 32**. About four in ten come good, and a good one is worth
real money by season six. The other six in ten stay under water, which is the
mechanism working rather than failing: a right you should not exercise is still
information, and the profile says so plainly rather than hiding it.

Not covered by the walkthrough. Exercising a clause needs an incoming offer for
a young player, a sale, and a season roll, which a ten-week run does not reach
— and a step that silently skips is the vacuous test this project has already
been caught by once. The logic is unit-tested and the world behaviour measured
above.

## The data department — built

An edge rather than an answer: a shortlist of players the model believes are
underpriced, each with a confidence figure, and both the list and the
confidence get better the more you have put in.

**The mispricing it exploits was already in the game.** `computeValue` scales a
player's price by his league's reputation, from 0.55 in the lowest to 1.4 in
the highest — the same footballer costs two and a half times as much in one
country as another, because the market is paying for the shop window. A
department that values the player rather than the window finds what real ones
find: good players in unfashionable leagues are cheap.

**The risk it cannot remove.** Not everyone settles. Climbing asks whether he
can cope; dropping asks whether he will bother, and both are real. No amount of
investment removes that — it only makes the department better at saying how
uncertain it is, which is why the output carries a confidence figure and not a
recommendation.

**A badly funded department is a quiet one, not a wrong one.** The first
version had this backwards, and it was a real mistake rather than a tuning
choice. It added symmetric noise to the estimate and then filtered on the noisy
value, which selects for whoever happened to draw the largest upward error —
the winner's curse. A level-1 department came out right one time in ten: worse
than chance, and so worse than not having one at all. A tool that is reliably
wrong is not a cheap tool, it is a trap.

The model **shrinks its estimate toward the market price** by how unreliable it
knows itself to be — one that is out by 40% does not report a 40% edge as
though it were real.

**And the bar it must clear is derived from a target confidence rather than
chosen**, which took two goes to get right. A finding is a false positive when
a player's real edge is nothing and noise alone carried him over the bar, so
the false-positive rate is set by how many standard deviations of the shrunk
estimate the bar sits at — `bar / (trust x noise)`. Picking the bar as a curve
over the noise left that quantity sagging in the middle:

    level  1    2.32 sigma      level 12   1.96 sigma
    level  8    1.90 sigma      level 20   5.30 sigma

so a **level-8 department was less accurate than a level-1 one**, 79% against
85%. More names and worse ones. A progression where spending money makes the
tool worse is broken however good the story around it sounds, and "better than
chance at every level" was the wrong property to have tested — it passed
throughout.

Holding the sigma constant and solving for the bar fixes it. Measured over two
worlds, 40 runs at each level, every finding checked against the valuation the
model cannot see:

| level | error band | bar it clears | names per run | accuracy |
|---|---|---|---|---|
| 1 | 42% | 42% | 2.6 | 88% |
| 8 | 28% | 42% | 6.7 | 95% |
| 12 | 20% | 36% | 9.0 | 94% |
| 20 | 4% | 18% | 14 | **100%** |

Accuracy now rises with spend and never falls, and the names per run rise with
it — **upgrading buys more of them and better ones**. A test asserts that
directly: no level may be materially worse than any cheaper one, and the range
must actually go somewhere. It runs 150 samples a level, because a small
department produces two or three names a run and twenty-five runs put level one
on a sample of thirty-six — wide enough both to fail on noise and to hide a
real regression.

The confidence figure shown against each name is deliberately lower than that
accuracy, and the gap is honest. Accuracy asks whether the *price* was right;
confidence also carries whether he will settle after the move, which nothing
here can measure. So the department is under-confident about valuations it gets
right, which is the correct way round for it to be wrong.

It sits on the recruitment model: the model only spends its time on players the
club's stated policy would actually sign, so a develop-and-sell club is not
shown twenty-nine-year-olds who are ready now.

## The dressing room — built

**It cuts both ways**, and proving that was most of the work. A strong positive character lifts a room —
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

**As built.** The traits had been in the game since the world was first
generated and only ever affected the man carrying them — `professional` gave
its owner +0.6 of weekly drift, `disruptive` −0.8, and a leader lifted nobody.
Now each player contributes to a room reading weighted by how far his voice
carries: standing in the squad and seniority, so a disruptive star does far
more damage than a disruptive back-up and a leader nobody picks sets no tone.
The room feeds every squad member's morale, and a player's own contribution is
taken back out of what he feels — nobody is paid for his own leadership.

**Two things the measurement changed.** The first design added positive drift
for a good room, and measured out at +1.34 morale against −5.42 for a bad one.
Morale reverts to a baseline near 55 and sits below it most of the time, so
there is no headroom above, while the downside compounds through form and
results. A risk five times the size of the reward is exactly the tax the
warning above is about. So a good room now **absorbs grievances instead of
inventing cheer** — which is also a better model of what a senior professional
does. He does not make contented players more contented; he stops an unhappy
one becoming a problem.

| one senior player's traits | tone | squad morale |
|---|---|---|
| leader | 0.85 | **+1.27** |
| professional | 0.71 | +1.21 |
| nothing | 0.52 | — |
| disruptive | 0.10 | **−1.69** |

Measured over ten seeds, one season each. The first attempt at this measured
three seasons and compared league points, which measured nothing: the runs
promote and relegate away from each other, so by season three the points are
scored against different opposition. It reported that a squad with no leader
outscored one with a leader.

The effect is **modest and roughly symmetrical**, which is the right shape.
Swapping one man in twenty-five moves a group property a little; it should not
transform it. `leader` and `professional` come out within noise of each other
for the same reason.

**Consequences, not actions.** A bad room makes players harder to re-sign — a
squad nobody wants to be in is a squad nobody re-signs for, and the wage
demanded moves up to 6% either way with the tone. The screen names who is
setting the standard and who is dragging it down, and says plainly at the
bottom that nothing on it is something you say to a player: what you can do
about a room is sell someone, decline to renew someone, sign a different kind
of professional, or deal with the head coach.

**A display bug the tests caught.** The tone bands were written for a ±10 scale
the mechanism never reaches — every real squad read "Ordinary" and the label
was decoration. They are now set from the range it actually reaches. The
summary also named nobody when one disruptive senior sat in an otherwise level
squad, because the tone is a mean and a mean hides the person; it now names the
strongest voice whether or not the average looks unremarkable.

## International football — built

Consequences, not management. You do not pick a national side; you live with
what it does to your players. Built last because it wanted a stable calendar
underneath it.

- **Call-ups** take players out of your weeks, and who goes is a consequence
  of how you recruited rather than a rule anywhere in the code.
- **Caps raise value and wages**, and never come back down — the single most
  reliably real thing about the transfer market.
- **Injuries on international duty** are the oldest grievance in the job.
- **Tournament summers** turn a squad player into somebody else's target.

**The league does not pause, and that is not a simplification.** A twenty-four
club division is forty-six rounds inside a thirty-nine week window, so the
calendar has no room to stop even if it wanted to. It is also the truer
version: South American qualifiers have clashed with European club football for
decades, and the argument that follows — my player, your fixture, his flight —
is the oldest complaint in the job. Your Brazilian is away on Saturday and you
play anyway.

### The bar was the wrong model, and the measurement said so

The first version asked whether a player was *good enough to be an
international*: an ability threshold scaled to his nation's league standing.
It reads sensibly and it is backwards. `intlcheck.ts` reported one per cent of
the Scottish top flight at international standard against thirty-five per cent
of Spain's, and the leading club losing **thirteen players of a twenty-three
man squad** to a single break while a Championship club never lost anybody at
all, in two full seasons.

A weak nation does not stop picking a side. It picks the best it has, and the
best it has is worse. So the model is now a **squad, not a bar**: every country
takes its best twenty-three, wherever they play, whoever they are. The first
eleven go every time and the rest are in and out, which is what separates a
fringe international from a certain one.

What that costs, measured on the default world over two seasons: **0.78
players away per club per break**, 76% of clubs losing nobody at all, and the
leading club losing 9.6 of a 24-man squad — which is about what an elite club
really loses in a November window, and a fifth of what the bar was taking. A
mid-table club in a mid-ranked league loses 0.7; a non-league club loses
nobody, ever, which is one of the quieter compensations for being small. The
other cost, in the same run: 202 injuries picked up on duty and 1,120
player-weeks lost, none of them anybody's fault at the club.

That turns the director's question into the real one — not *is he good enough
for a country* but *is he in the twenty-three his country has*. It is why
signing a Northern Irish squad player costs you more Saturdays than signing a
better Brazilian who will never be picked, and it is the whole recruitment
consequence, falling out of the nationalities you signed rather than being
enforced anywhere.

### Squads are named the week before

The first implementation called players up and played the week in the same
tick, so nobody was ever visibly away: the flag was set and consumed before a
screen could render it, and the squad list's "Away" chip was unreachable code.
A real call-up arrives days ahead, and that gap is the point — the loss is
something you watch coming and cannot do anything about, which is a different
feeling from finding out afterwards.

### A loanee is called up by his country, and his loan club loses him

Not the club that owns him. A young international on loan is precisely the
player who disappears every break, and the club borrowing him has to plan
around it without ever having chosen him.

### The flight, not the football

The grievance was never really about a friendly. It is about a player crossing
a confederation, losing two days to aeroplanes at each end, playing at altitude
or in heat his season has not prepared him for, and landing on the Friday of a
Saturday game. So the odds of him coming back hurt scale with how far he went —
home, continental, intercontinental — read off the confederations the nations
already carry. It also retired a function that had stopped doing anything: the
nation-strength score survived the rewrite with a comment claiming it stood for
how far a call-up travels, which nothing used. Decoration with a justification
attached is worse than dead code, because it reads as a decision.

### The tournament premium fades

Caps never come back down; a summer does. A player who is the story of a June
is priced on it for about a year and then priced on his football again, and a
club that did not sell him in that window finds the number gone. It is the
cruellest honest thing in this market and it happens every other year — which
is what makes "sell now or find out what it costs to say no" a real decision
rather than a line of flavour text.

Around one in five of the players who go to a tournament come back repriced.
The first cut boosted more than half of them, which is not a tournament, it is
an inflation.

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

**It also has to stay up long enough to be read.** The first cut showed for
exactly as long as the tick took, which is 275ms at the median — the screen
appeared and vanished, and the reader registered that something had happened
without ever seeing what it said, which is worse than no loading screen. It is
now floored at 900ms once it is up: measured over ten weeks of the walkthrough,
908–971ms, mean 922. Every piece of blocking work in the store goes through one
`withLoading` helper that yields a frame so the screen paints before the thread
blocks, then holds it to the floor.

**And it belongs in the phone column.** It was `position: fixed`, so on a
desktop-width window it escaped the 520px column everything else lives in and
took over the whole browser. It stays fixed — an absolutely positioned overlay
would be trapped by any ancestor that happened to be `position: relative` — and
is pinned to the column instead. Measured at 1280px: the column runs 380–900px
and the loading screen and sheet backdrop now run 380–900px with it.

Making the tick itself faster is a separate job and not this one.

## Out of work — built

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
gate — and the sacking itself takes four off your reputation, so being
dismissed twice in three years shows.

**Your own job is top of the board, and you cannot have it.** The club you ran
on Friday is advertising for a director of football on Monday: the vacancy is
real, it is public, and it is the first listing anybody in that position would
look for. It is listed, with the reason spelled out — *they dismissed you, they
will not be taking your application* — because leaving it off would be tidier
and would say nothing. It comes off the board the same way any other listing
does, when somebody else takes it.

The door then stays shut. Any club whose spell ended in a dismissal is filtered
out of every later draw, read straight off the career history rather than kept
as a second list. Boards do occasionally re-hire; they do not re-hire the man
they sacked eighteen months ago, and a door that quietly reopens costs the
sacking its weight.

**As built.** `dismissDirector` does what a sacking always should have: closes
the career entry so the spell is a matter of record, takes the reputation hit,
releases the club, and puts the first vacancies up. `playerClubId` is nullable
now, which is what makes any of it possible — the fifty-odd places that indexed
it blind go through `playerClub(state)`, and the shell keeps you on the jobs
board while you have no club, because every other screen is about a club you do
not have.

A test reproduces the original bug directly: run a career until the board turns,
and assert you cannot be dismissed twice from the same chair.

## The news feed

It lives on the league screen, sorted by league.

That is a better home than the inbox, which is for things addressed to you, and
better than a screen of its own, which nobody would open for half an item a
week. On the league screen it is what it actually is: what has been happening
in this division. A rival being taken over belongs next to that rival's league
position.

## How big a save gets

Asked directly, and answered by running it rather than estimating.
`scripts/savegrowth.ts` plays a full career to the age cap on a standard world
(492 clubs, 15,283 players) and takes the size every five seasons — raw JSON,
and gzipped, which is what IndexedDB actually holds.

| | raw | stored |
|---|---|---|
| at creation | 27.8 MB | **2.78 MB** |
| season 10 | 48.2 MB | 5.10 MB |
| season 25 | 52.4 MB | 5.52 MB |
| at retirement, season 35 | 52.1 MB | **5.49 MB** |

1,820 weeks, 35 seasons, 7 sackings. A whole career less than doubles the save:
raw x1.87, stored x1.97, about 79 KB of stored growth a season. It is flat from
season 25 on.

A finished career is 80% players and 12% clubs. The news feed and inbox are
already pruned (250 and 150 items); `xpLog` is cleared at each season review,
so it holds one season rather than a career. The only genuinely linear term is
`club.history` — 492 clubs, one `SeasonHistory` row each per season, ~145 KB of
raw JSON a year, which gzips to near nothing.

**So storage is not a constraint and was never going to be.** Any argument for
moving off IndexedDB has to be made on other grounds — surviving a data clear,
moving a career between devices, migrating old saves eagerly rather than
lazily, or verifying a leaderboard entry — and not on size.

## Continental competition

The last large hole. Leagues have awarded qualification places since the world
was first generated and there was nothing on the other end of them, which is
worse than not awarding them at all — it promises the player something the game
cannot pay.

**What it is, from this chair.** Four things: a reason the final league
position matters beyond the title, a fixture burden that tests squad depth, a
revenue line big enough to change what the club can afford, and a standing that
makes players answer the phone. Emphatically not a tactical layer — the head
coach picks the side for a European night the same as any other.

**The shape falls out of the data rather than being decided.** Counting the
places the nations actually award: UEFA raises 29 clubs for an elite
competition and 26 for a secondary one, CONMEBOL 8 and 4, CONCACAF 4 and 4, and
Japan on its own raises three. So the rule is a minimum field of eight, and:

| confederation | competitions |
|---|---|
| UEFA | two — European Cup (29), European Trophy (26) |
| CONMEBOL | one — South American Cup (12), the two sets of places merged |
| CONCACAF | one — North American Cup (8), merged |
| AFC | none — and its leagues' places are removed |

That last row is the honest half. A one-nation confederation has no continent
to play, so rather than leave the hook dangling the place is taken off the
league and a club finishing second in Japan is told the truth.

**The world is now global, which is what made the rule bite properly.** It had
13 UEFA nations, two CONMEBOL, two CONCACAF, one AFC and no African nation at
all — so the rule above stripped Japan's places and two African competitions
sat defined and uncreatable. Twelve nations were added: Egypt, Morocco, Nigeria
and South Africa; South Korea, Saudi Arabia and Australia; Colombia, Uruguay
and Chile; Costa Rica and Canada. All five confederations now field a
competition and no league awards a place to nothing.

The rule that decides the shape still stands and still does the work — CONCACAF
raises 8 elite and 7 secondary, so its two sets of places merge into one
competition of 15; AFC merges into one of 14; CAF raises 8 and 8 and gets two.

The cost is 186 clubs on top of 492, about 38% more of everything the weekly
tick walks. That is deliberate: a world with a continent in it that cannot play
anybody is not a smaller world, it is a broken one. The loading screen's floor
went to a round second at the same time, so a typical week still reads as one
line of terrace humour rather than as a wait.

**Two legs in every round but the final**, against the domestic cup's single
two-legged semi-final. That is not decoration: it is what makes a European run
cost a squad rather than a Saturday. Measured across seventeen leagues, a
qualified club plays **4.7 more matches** than its own league-mates — the
comparison has to be against league-mates, because a non-league club plays 42
league games to a top-flight club's 38 and league size otherwise swamps the
effect entirely.

**The money is proportionate rather than invented.** The ladder steepens by
about 1.9x a round, so a run is worth far more than the sum of its early
rounds. Winning the European Cup pays £44.6m across the campaign against a top
English club's £120m from the league — roughly the ratio the real competition
pays, and transformative rather than decorative for a Scottish or Danish
champion collecting the same first-round cheque.

Names are invented. Real club names are used in this game; real competition
names are somebody's trade mark and are not.

**Deferred inside it:** the league phase. The real elite competition now opens
with a 36-club Swiss-model group stage rather than a straight knockout. That is
a much larger job and it mostly adds guaranteed fixtures; the two-legged
knockout delivers all four of the things above. Worth revisiting, not worth
blocking on.

## Saves that survive an update

`migrate()` had six version steps and no test exercised any of them. Every one
is code that runs against data no test ever saw, on somebody else's career,
exactly once — and a mistake in it costs a forty-season save. Three things now
sit under it.

**A test per historical format.** A save is loaded from every version and
asserted to arrive at the current format intact, plus a test that each step
repairs the thing it exists for. The coverage stopped at v7 when it was
written — the five steps added since (recruitment policy, buy-back clauses,
the findings list, the trait rename, international football) were shipped
under the same silence the net was built to end, so the fixtures now strip
back to every version through v12. The fixtures are honest about what they
are: not real historical saves — no build of this game is old enough to have
written one — but a current save with exactly the fields a version's migration
adds stripped back out, which is the shape that code is written to repair. That
proves every branch runs; it cannot prove the stripped shape matches a real v3
save in every other respect. When a genuinely old save turns up, keep it.

It found a real defect on its first run. The steps walk in ascending order, but
the v2 step rebuilds squad lists through `autoRegister`, which asks whether the
club is under a registration embargo — and the record that question reads is
created by the **v4** step. A genuinely old save threw on load. Six version
steps had been shipped without anything ever running them.

**A copy taken before migrating.** A migration that throws leaves the slot
alone, so that was never the danger. The danger is one that *succeeds* and is
wrong: the game carries on, autosaves over the slot inside a week, and the last
good copy is gone. So the untouched bytes are put aside the moment the format
is seen to have moved, under a `premigration:` id that `listSaves` hides and
`listBackups` offers. Failing to take a backup never blocks a load — a full
disk is a reason to play without a safety net, not a reason to be locked out of
your own career.

**An integrity check after migrating.** A short list of things whose absence
makes the game unplayable — no clubs, no leagues, no date, still on an old
format, in charge of a club that is not in the world — checked before the world
reaches the UI, so a bad migration fails legibly next to its own backup rather
than three screens later.

What this does **not** do is make the cloud a migration story. If a new build
cannot read an old save, a copy of that old save in Frankfurt does not help.
Migration safety is local work and this is it.

## Known defects

Bugs found in play go in `docs/bugs.md` — this section is for the ones with a
measurement behind them.

**No set-piece coach.** The ask was for coaching posts you assign — youth, set
pieces, goalkeeping. `academyDirector` and `goalkeepingCoach` exist and both
do something: the academy director moves intake quality, the goalkeeping coach
moves keeper development. There is nothing in the match engine for a set-piece
coach to act on, so adding the post would be a job title with no consequence —
a dial that does not turn. It waits on set pieces existing as a modelled part
of a match. Named here so it is a deferral rather than an omission.

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
