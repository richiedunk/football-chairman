# Identity

What the game is, in one sentence, and what follows from having picked one.

The game had three identities and had not chosen between them. The name said
*information* — you never see a player's true attributes. The role said
*powerlessness* — you are the director of football, and somebody else picks
the team. The shell said *phone* — home screen, notifications, a coach who
texts. Each was well argued on its own. None had been made to serve the
others, and three names tracked the split: the repository is
`football-chairman`, the leagues are named "in the Football Chairman idiom",
the job is director of football, the product is Undisclosed Football.

The first two are the same idea. So:

> **You buy players you cannot fully see, for a coach you do not control.**

Everything below answers to that sentence. The phone is how the coach and the
agent reach you. It is the delivery mechanism, not the point.

---

## What was wrong, specifically

**The named mechanic was the least present on screen.** "Undisclosed"
promises fog, and the game delivered it only on the buy side. A checkbox in
Settings switched it off entirely. Fees were exact numbers everywhere, so the
pun in the title — *for an undisclosed fee* — never once appeared in play.
Your own players were shown at full precision, which is defensible (they train
with your staff every day) but meant the one person whose opinion of them
decides everything, the head coach, had no visible opinion at all.

**The coach was the strongest idea and the least visible.** He is the thing no
rival game has: an antagonist who can bench your signing. He was not on the
home screen. He was a row in the staff list with four numbers. The badge was a
man in a suit holding a ball, which is you, and could be any management game
ever made.

**The phone was newest and loudest.** A shell is not an identity, and the phone
document says so itself. The risk was that "football management, but it's a
chat app" became the headline because it was the most recent thing built.

---

## What changes

### 1. The fog is total

- **The reveal setting is gone.** `revealTrueAttributes` was a debug toggle
  in the Settings screen, which is to say a button labelled "make the game's
  central idea stop working". A debug tool belongs in a script, not in the
  player's hand. Removed from the type, the world generator and the profile
  screen. Old saves carrying the key load fine; nothing reads it.
- **Fees you were not party to are undisclosed.** `CompletedTransfer.fee` is
  still exact in the engine, because the finance system needs it. What the
  *player* sees for another club's deal is the word the title is named after,
  and beneath it what the press reckon: "Undisclosed · THE HERALD RECKONS
  £4.2M". The figure is the outlet's, not the club's — a sensational outlet
  inflates, a sober one rounds, and the same deal reported by two papers gives
  two numbers. `systems/disclosure.ts` derives it deterministically from the
  transfer id and the outlet, so reopening the screen never changes what was
  printed, and no new state is stored. Deals you were in still show the real
  number: you signed the paperwork.

  This is the media system's design — credibility and sensationalism as
  something the reader *feels* — reaching one more screen, and it puts the
  title in front of the player every window.

### 2. The coach is on the home screen

The Club app opens on the standing, then the match, then what is waiting on
you. Now the coach sits under the match, in his own voice, with the one
number that matters weekly: **how many of your signings he picked.** "YOUR
SIGNINGS: 3 OF 5 STARTED", the names of the two he left out, and a line from
him in whichever of his four registers he is in. Tap it and you are in the
staff room. A director who signed a striker for a record fee and finds him on
the bench should learn it here, from the man who did it, not by scrolling a
match report.

A signing is a player who arrived by transfer during your time at the club.
`systems/coachView.ts` has the rule.

### 3. His opinion of your own players is his, not the truth

Your staff know the numbers. His rating is what decides selection, and it
was never shown. The player profile now carries, beside the ability figure,
what the coach makes of him: *first name on the sheet*, *in his plans*,
*squad*, *not fancied*, *would rather not*. Where the reason is legible it is
given — he wants pace and the lad has none; he does not trust anyone under
twenty-one; the player is out of position for the shape. Derived from the
same selection score the match engine uses, without the weekly whim, so what
the screen says and what happens on Saturday agree.

"He doesn't rate your signing" was a sentence in the README. Now it is a
thing you watch happen, with a reason attached, before you have spent the
money on the next one.

### 4. The phone holds at four registers

The phone document sets a rule — *the medium is chosen by who authored the
information, not by how the data is shaped* — and gives four registers:
messages (a person is talking to you), documents (a department reports to
you), websites (the public discusses you), and the club's own system (you
operate it). It says four is the limit.

This matters for identity because the registers are where the sentence
above becomes visible. The coach reaches you through **messages**, because a
person is waiting on an answer and you cannot make him wait. The fog reaches
you through **documents**, because a scout report is a dated, numbered
dossier that narrows over weeks — knowledge bought with time — and a
document can be superseded but not argued with. The press reaches you through
**websites**, which can be wrong, and the undisclosed fee lives there: a
number in a newspaper, not a number in your accounts. Everything you actually
operate stays in the **club's system**, dense and typographic, because that
part of the game is already right.

Each register has to earn a *behavioural* difference, not a typeface. The
failure modes are symmetrical: every screen becomes a chat, or the phone is a
frame around thirty unchanged tables and means nothing. A fifth register — a
fan forum, a spreadsheet costume, a browser with a URL bar — is how a shell
stops knowing what it is. So: no more fiction on the phone. It carries the
coach and the agent to you. That is its job.

### 5. One name, and a badge that says the idea

The product is Undisclosed Football. "Football Chairman" survives only in the
repository name and as a phrase describing the league-name idiom, and the
latter is retired from the README. Renaming a repository is a decision for the
owner, not for a commit.

The badge is a man in a suit. `design/badges/` holds four drafts that put the
*idea* in the mark instead:

- **Redacted** — the same suit, a black bar where his face is. The player you
  are buying is the one you cannot see.
- **The range** — a shield whose crest is a scout's range, `115–140`, with
  the bounds lit and the middle dark. What you know about anyone.
- **Brackets** — a ball inside square brackets, `[ ● ]`. A range containing a
  football. Reads at 48px, which is the size that matters on a home screen.
- **The stamp** — the shield as a cutting, UNDISCLOSED stamped across it at
  an angle, the way the fee line reads in every paper.

`design/badges/index.html` lays them out at launcher and hero sizes on the
game's ground colour.

**Taken: the redacted man, everywhere.** `design/badge.svg` carries the bar
now, and every icon, lockup, favicon and splash is cut from it by
`npm run icons`, so nothing drifts. The other three stay in `design/badges/`
as the record of what was considered. The keyline on the bar was thickened
once, from three units to nine, after the first render lost it at 48px.

---

## What does not change

- The engine's model of scouting, selection, transfers and the press. All of
  the above is derivation over state that already exists.
- The advance button, the outcome screen, the squad list, the dashboard's
  shape. Everything the design directions settled stays settled.
- The visual language. Near-black, one lime, mono for numbers. It is coherent
  and it is not the problem; the problem was that nothing in the *content*
  said what the game was.

## Order of work

Each is one commit with tests, per the standing rules.

1. The fog: remove the reveal, add `disclosure.ts`, print undisclosed fees.
2. The coach's view: `coachView.ts`, the profile line, the dashboard block,
   and the test that the verdict agrees with the selector. One commit rather
   than two, because the profile and the dashboard share the module and the
   stylesheet and neither means much without the other.
3. The badges, as drafts, for a decision rather than a merge.

## Seen on the way

The end-to-end worlds had Crawley Town and Shrewsbury Town in them, and the
README said the generator re-rolled real club names. The README was the
stale one: real clubs are shipped on purpose, from `realClubs.ts`, with the
disclaimer on the About screen, and the roadmap records the decision. The
README paragraph is corrected. Nothing in the world needed fixing.
