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

**5. Stop.** Measure by playing. Option A is a separate decision taken after
this has been lived in, not a phase of this work.

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
