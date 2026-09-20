# The phone

The gimmick, and the reason it is cheap: **the game is already a director's
phone and does not admit it.**

You play in portrait. You are interrupted rather than scheduled. Messages
arrive from a chairman, a head coach, an agent, a club secretary and a
journalist, each with an opinion and a deadline. The urgent ones block the week
because somebody is waiting on an answer. That is not a dashboard with an inbox
bolted on. That is a phone going off, and every screen in the game is currently
pretending otherwise.

So: make the fiction literal. **The engine does not change.** This is a UI
layer, which is the whole argument for doing it — `src/engine/` has no framework
imports and no DOM, the store is a thin wrapper over it, and nothing below
`src/ui/` needs to know that the inbox now looks like a conversation.

---

## What this is not

Stating the anti-goals first, because every one of them is a way this could
undo work that was done deliberately.

- **Not a reskin of thirty views.** The squad list is twenty-five rows of nine
  attributes and it is *correct*: dense, typographic, hairline-ruled, thirteen
  rows without scrolling. A phone chrome wrapped around it would cost rows.
  Those screens stay exactly as they are.
- **Not a change to the advance button.** One button, one place, two lines,
  naming the next real event. It is the best-reasoned control in the build.
  The cute version of this idea — "put the phone down" to end the week, the
  screen dimming, the week passing while you are not looking — hides what the
  week holds, which is the exact thing the advance button was designed to stop.
  Rejected outright.
- **Not the end of the outcome screen.** A refusal — "the board will not
  sanction building work while the club is in crisis" — takes the whole screen
  and waits for a tap. Turning refusals into grey system bubbles in a thread
  puts them back in a scrolling region where they can be missed, which is the
  toast problem the notice screen was built to fix. Refusals stay full-screen.
- **Not engagement theatre.** No fabricated typing indicators that add latency
  to a tick that runs in under 100ms. No badge inflation. No notification
  sound. No read receipts, because the engine has no concept the UI could
  honour. No chairman using emoji.

What is left after those four is narrow, and it is the part that is actually
good.

---

## The one mechanical win, and it is free

`InboxDecision` already holds a prompt, a list of options each with a label and
a consequence hint, a chosen id, and an `outcomeText` written for after you
choose. Today that renders as a stack of full-width buttons under a paragraph:
a form.

In a thread it is a **reply**. Their message sits left. Your options are the
things you could say back. You pick one, it appears right-aligned as something
you said, and `outcomeText` arrives underneath as their answer.

Nothing in the engine moves. The same four fields, read in the same order,
become a conversation instead of a form — and a conversation is the correct
shape, because the fiction was always that a person asked you a question and is
waiting.

That is the whole idea. Everything below is how to do it without lying to the
player or breaking a save.

### The hint must not be hidden to make this look like a chat app

`InboxOption.hint` carries the consequence — what this answer is likely to cost
you. Real messaging apps have no equivalent, and the temptation is to hide the
hints behind a long-press so the reply row looks like suggested replies.

**Do not.** The hint is the information the decision is made on. A reply row of
four bare labels is a prettier screen that asks you to choose blind, which is
a worse game. So the replies are not chips in a row: they are a **reply sheet**
that rises from the bottom, one option per row, label in Inter and hint in mono
underneath — the same two-line shape the buttons have now, in a container that
reads as composing rather than as a form. `unavailableReason` renders in place
of the hint on an option that is blocked, as it does today.

---

## Threads

### Grouping, with no engine change

`InboxItem.from` is not prose. Across the whole engine it resolves to one of
about twenty values, and nearly all of them are a **role**, not a person:
`Chairman`, `Club Secretary`, `Recruitment`, `Your representative`,
`Academy Director`, `Medical Department`, `Safety Officer`, `Press Officer`,
`The League`. The rest resolve to a named character or organisation — the head
coach's `knownAs`, a scout's `knownAs`, an outlet's name, an architect firm.

So the thread key is **`from`, verbatim**. A registry in the UI maps the known
labels to a display name and an icon; an unrecognised sender gets a thread of
its own rather than being dropped. That is the self-healing behaviour: a new
call site with a new label costs a generic-looking thread, never a lost message.

Two consequences, both acceptable, both stated rather than discovered later:

- **Sack the head coach and his thread stops and a new one starts.** That is
  not a bug to fix, it is the right behaviour — the old conversation stays in
  the list as history, which is a better record of a career than the current
  flat inbox gives you.
- **Two coaches over thirty-five seasons could share a name and merge.** A
  cosmetic collision in a save that has already run for decades. Not worth an
  engine field.

If it ever is worth an engine field, the shape is an **additive** optional
`fromId?: ID` written at the call sites where a real character exists (coach,
agent, scout, outlet). Old saves lack it and fall back to the string, so saves
survive the update, which is the standing constraint. Explicitly deferred — the
string does the job.

### Thread list

Ordered by the most recent message, not by category. Each row: sender, the last
line of the latest message, a mono relative stamp, unread count. A thread
holding an unanswered decision carries the same `Decide` / `Urgent` chip the
inbox rows carry today, and for the same reason: urgency, not category, is what
earns colour.

The three filters on the inbox today (All / Unread / Decisions) survive as they
are. "Decisions" is the one that matters and it is the one that maps worst onto
a messaging idiom, because the things that need you are spread across threads.
It stays a filter over the thread list, showing only threads with an open
decision.

### Inside a thread

The visual-language decision is "nothing is boxed" — near-black ground,
hairline rules, no card-in-card. A chat bubble is a box, so this needs
resolving rather than hand-waving.

The fault that decision was fixing was **sections boxed against sections**: six
bordered panels on one screen, nothing louder than anything else. A thread has
no competing sections. It is one column, one conversation, in time order. A
container around an utterance there is not the same failure, and it is doing
work — it says who is speaking without an avatar or a name label on every line.

So, concretely:

- **Their messages**: left, flush to a 12px gutter, no bubble — just the text,
  with a hairline rule between utterances and the sender named once at the top
  of the day's run. Denser than a bubble and unmistakably not you.
- **Your replies**: right, in a bubble, the single saturated lime at low alpha.
  One colour, used once per screen for the thing you did, which is exactly how
  the accent is already used.
- **Day separators**: mono, centred, hairline, reading in game time — `WEEK 23`
  rather than a date, because the calendar is a detail and the week is what the
  player thinks in.
- **No avatars.** A circle of colour per sender is twenty new colours competing
  for attention on a screen whose whole design is one accent.
- **The link button stays.** `linkLabel()` already names the destination and the
  player — "Open Bruno's profile", not "Open". It renders as an attachment
  under the message it belongs to.

---

## The four registers

The question this has to answer before any screen is drawn: if the phone is the
shell, what *is* each screen? A league table is not a conversation. A squad list
is not a document. Getting this wrong in either direction is how the idea fails
— either everything becomes a chat thread, or the phone is a frame around
thirty unchanged tables and means nothing.

**Faking a spreadsheet is rejected.** Column letters and gridlines over a table
that already exists cost rows and add nothing. So is a fake browser chrome with
a URL bar. A medium that only changes the font is a costume.

The rule that replaces it:

> **The medium is chosen by who authored the information, not by how the data is
> shaped.**

Ask of each screen: *who wrote this, and how would it reach my phone?* That
gives four registers, and **four is the limit** — a shell with six does not know
what it is.

1. **Messages** — a person is talking to you. Two-way, short, has a deadline.
2. **Documents** — a department is reporting to you. Authored, dated, on a
   letterhead, stating judgement together with its uncertainty. Cannot be
   edited. Can be *superseded* by a later revision.
3. **Websites** — the public is discussing you. You learn public facts the way
   the public does, from a source with a bias, which may be wrong.
4. **The club's own system** — you operate it. Dense, typographic, sortable, no
   fiction at all.

**Register 4 is what the game already is, and it is already right.** That is the
deflationary half of this idea and the reason it is affordable: most views do not
change. What changes is that the shell stops rendering four registers
identically.

Each register has to earn a **behavioural** difference, not a typeface. Messages
can be replied to. A document has an author and a revision number and cannot be
argued with. A website can be wrong. If a register cannot be told from register
4 by what it *does*, it should not exist.

### Where each screen sits

| Register | Screens | Why |
| --- | --- | --- |
| **Messages** | Inbox, Agents, board *requests*, the head coach, the player liaison's read of the room, briefing a named journalist | Somebody is waiting on an answer |
| **Documents** | Scout reports, the data department, the accounts, architect tenders, medical notes, the squad list as filed by the League, your own career record | A department authored it, dated it and stands behind it |
| **Websites** | League tables, the results archive, the press, transfer rumours, deadline day as a live blog, the one that got away, the jobs board | Public, biased, sometimes wrong |
| **The club's system** | Squad, player profiles, registration, transfers in progress, scouting assignments, search, staff, recruitment policy, academy, club, board standing, settings, milestones | You operate it; density is the feature |

### Two places where the register carries information rather than decoration

**A scout report is a revised document.** A range narrowing over weeks *is* a
dossier being revised, and "third report — range narrowed" says something a
live-updating widget cannot: that knowledge was bought with time. The engine
already models the narrowing; the document is what makes it legible.

**A website can be wrong, and the engine already knows how wrong.**
`MediaOutlet` carries `credibility` and `sensationalism` and the UI throws both
away. A rumour on a sensationalist outlet should *look* like one, so the reader
learns to discount it — which is the media system's whole design, currently
invisible. And a planted fabrication should be read where it was planted, on
that outlet's page, rather than as a row in a list.

### The dressing room is a defect, and this is what it reveals

Ask who authored the dressing room screen and the answer is nobody. There is no
document in football called "the dressing room."

The system is explicitly built to give **information and consequences, never
man-management** — and then delivers that information as a leaderboard of
influence figures to one decimal place. That is register 4 rendering something
the club has no system for. A director does not read the room off a dashboard;
somebody tells him about it.

So the room becomes **a person's read**: a short recurring briefing from the
player liaison or the coach, naming two or three players and what they are doing
to the room, with the setters-and-draggers list as its *attachment* rather than
its headline. `+0.7` becomes words, because a liaison says "he has been
excellent with the young lads," not "+0.7." The figure is telemetry for a
judgement, and showing telemetry is what makes a judgement read as a gauge.

**This is worth fixing whether or not the phone ever ships.**

**Fixed.** Narrower than the diagnosis above, in the end: `roomSummary` was
already naming names in the right voice, so the prose was never missing. What
was wrong was the leaderboard of decimals sitting beside it and the fact that
nothing on the screen said who was telling you. The read is attributed now — to
the head coach where there is one, since he is in there daily and already has a
voice in this game, and to the player liaison otherwise — it leads rather than
sits third, and `influenceWord` turns `+0.7` into "Good for the room". The
lists stay, as who he named rather than as a chart. The end-to-end run asserts
the attribution exists and that no figure has crept back into the column.

### Form, and the discipline of leaving things alone

Form is a public fact. `FormRun` in the squad list is the reader operating the
club's system, which is correct. The same WWDLW on a results site is correct
too. Nothing needs inventing, and a breakdown that finds a new medium for every
screen is not a design, it is enthusiasm.

### Declined: a fan forum

Supporter mood is computed weekly from its causes and a forum or social feed is
the obvious home for it. It is declined. It is the one register needing more
generated prose than this game can write well, a thin one reads as filler, and a
generator of crowd opinion is a generator of abuse that would then have to be
policed. Supporter mood stays on the board screen as the causal breakdown, which
is better than a fake timeline.

## The shell

This is the one genuine fork, and it needs a decision before any of the above
is built.

**Option A — the phone is the shell.** Home becomes a lock screen: club crest,
league standing, and a stack of notifications you tap into. The tab bar becomes
a home screen of apps. Maximum commitment to the gimmick.

**Option B — the phone is where conversations live.** The dashboard stays
exactly as designed — standing at 66px, board confidence with a marker at the
target, next match in the opponent's colour, six departments as one small bar
chart. The phone idiom applies to the interrupt channel and nowhere else.

**Taken, in the end: A — and the recommendation below was wrong twice.**

The argument for B was that "a lock screen shows less than a dashboard". That
framed the choice as *replacement* when it is *relocation*. The dashboard is
not deleted by a home screen; it becomes the Club app, first in the grid, and
it still carries the standing, board confidence against its target and the next
match. Nothing is lost, and the thing that is gained is an information
architecture that fits the game: thirty screens were being pushed through five
tabs, which meant four of the five were doorways and everything else — finance,
the boardroom, the academy, the ground, the press — was a drill-down. A home
screen of apps puts every surface one tap from home, gives each one a badge
that can say whether it wants something, and makes adding a surface cost an
icon rather than another level of menu.

What survives from B: the dashboard itself, the advance button in its one
place, the outcome screens, and the conversations. What goes is the tab bar,
replaced by the phone's own navigation — Home, and Messages, because the
interrupt channel two taps away would undo the reason it moved to the middle.

The original recommendation follows, kept because being wrong in a specific
way is worth keeping.

**Recommendation: B, and build it first.** The dashboard was designed against
three drawn directions and it is doing the hardest job on the phone well; a
lock screen is a screen that shows less and costs a tap to get anywhere. More
to the point, B is the version that can be measured — if threads do not feel
better than the inbox list, B has cost two views and A has cost the whole app.

A stays on the table, after B has shipped and been lived with for a season of
play. Not before.

---

## Order of work

Each step is one commit with tests, per the standing rules.

**1. The thread model, pure, with no visual change.**
`src/ui/threads.ts`, no Vue import: `groupThreads(items: InboxItem[]): Thread[]`
plus the sender registry. Testable in Node like the engine is. The tests that
earn their keep here — each made to fail on purpose once:

- An unrecognised `from` gets its own thread and no message is dropped.
- Threads order by latest message; a thread whose only message is old sinks.
- Unread counts per thread sum to `store.unread`.
- A thread with an unanswered decision is flagged; one whose decision expired
  and auto-resolved is not.
- Two senders differing only in case or trailing space do not split. (Cheap,
  and the alternative is a duplicate thread nobody can explain.)

**2. `ThreadsView` and `ThreadView`, replacing `InboxView`.**
**The route name `inbox` must not change.** Inbox items carry
`link: { view, id }` and those items are *in the save file* — a career a season
old has fifty of them. `resolveLink()` is already defensive about links that
name nothing, but renaming the route turns every stored `{ view: 'inbox' }`
into a dead link for no gain. `/inbox` stays; a thread is `/inbox/:from`,
url-encoded, falling back to the thread list when the key matches nothing.

**3. Decisions as replies.** The reply sheet, the right-aligned utterance,
`outcomeText` as their answer. This is the step the whole idea is for, and it
is third because it wants the two views underneath it to be stable.

**4. The dashboard's decision block points at threads.** Home already renders
decisions as an inbox; it starts rendering them as the threads they belong to.
Small, and the last thing that would look inconsistent.

**5. Stop, and measure by playing.** Option A is a separate decision taken
after this has been lived in, not a phase of this work.

Only then, the other registers, in this order and for this reason: **documents
first, proving themselves on the scout report**, because the revision model is
the one that changes what the reader understands rather than how it looks; then
**websites, starting with the results archive and the league table**, which are
the two screens most obviously nobody's but the public's. The dressing-room
rewrite rides with the document and message work, being one briefing and one
attachment.

Two new renderers in total, then. Everything else in the table above is an
existing view sitting in a register it already suited.

### Where the websites register actually started

Not on the league table or the results archive, in the end. Both are already
dense, typographic and correct, and a new medium for them would have been a
skin over a table — which is the enthusiasm this document warns about twice.
The league screen already files results, fixtures and its own news behind
tabs.

It started on the press instead, because that is where the register pays for
itself: `MediaOutlet` carries `credibility` and `sensationalism`, the engine
uses both, and the UI printed them as two numbers on the media screen's staff
list and then rendered every story identically. A reader had the outlet's
character available as arithmetic and never as something they could feel.

A story is now a cutting, set in its outlet's voice — three voices, chosen by
sensationalism, with credibility separating the paper that shouts and is
usually right from the one that shouts and is not. The one distinction worth
drawing is that a sensational outlet with real credibility is the dangerous
one: it will run anything and people believe it.

Two rules came out of building it. **The page never marks its own story
false.** `truth` is real and the club does know it — a club knows whether its
striker asked to leave — but it belongs to the club's note under the cutting,
not to the printed page, because a paper does not print that it made the story
up. And **the newspaper list keeps its raw numbers**, because that list is the
club's own system for deciding who to ring, and choosing whom to brief is an
operating decision rather than something to be felt.

---

## What this costs, honestly

- **`scripts/e2e.mjs` needs real surgery, not a selector update.** Two of its
  steps are specifically about the inbox: it counts message links, follows every
  one, and asserts that no button still says "Open". Those assertions are good
  and must survive in thread form — which means rewriting them against the new
  structure, not deleting them.
- **`design/` has no artboard for this.** The visual language was settled by
  drawing three directions and picking one, and that process is why the
  dashboard is good. A thread screen should be drawn before it is built. The
  bubble-versus-hairline question above is a reasoned guess, and a reasoned
  guess is what artboards are for testing.
- **`main.css` is 1,223 lines of a system that has no messaging idiom in it.**
  This adds one. Kept to: utterance, reply, day rule, reply sheet. If it needs
  a fifth, the idiom is wrong.
- **The word "gimmick" cuts both ways.** A messaging UI over an interrupt
  channel is the honest presentation of what the game already does. A messaging
  UI over the squad list would be a costume. The line between those two is the
  anti-goals at the top of this document, and it is worth re-reading before each
  of the five steps.
