/**
 * What a scout says about a player.
 *
 * The scout is the voice a director hears most often, and he was the one with
 * least to say. A report on a player seen once was one of four sentences, and
 * every player he flagged arrived as exactly that — a voicecheck over two
 * seasons had him send ninety-eight messages drawn from four lines, the
 * commonest of them thirty times. A reviewer put it plainly: the scout runs
 * out of things to say.
 *
 * Variety that is only more sentences in a pool wears out too, just later. So
 * a report is built from what the scout actually saw in this player: the one
 * thing he does best, the thing he does worst, how old he is, what sort of
 * character he is. Two players at the same level now read differently because
 * they are different players, and the pools underneath only have to stop two
 * reports about the same kind of player from sounding identical.
 *
 * What he can tell depends on how long he has watched. One viewing gives the
 * thing that jumps out — pace, a touch, a leap — and nothing about the mind.
 * A weakness needs a few games, because a bad afternoon is not a flaw. The
 * character read needs a proper file, as it always did.
 *
 * Every pick is `phrase`, keyed on the scout and the player, so a report never
 * rewords itself when it is reopened.
 */

import { phrase, withArticle } from './voice'
import type { AttributeKey, Player, Position, Staff } from '../types'

const KEEPER_KEYS: readonly AttributeKey[] = ['reflexes', 'handling', 'distribution', 'command']

/** What a single viewing can show you. Nobody reads temperament off one game. */
const VISIBLE_AT_A_GLANCE: readonly AttributeKey[] = [
  'passing', 'shooting', 'dribbling', 'tackling', 'heading', 'crossing', 'setPieces',
  'firstTouch', 'pace', 'strength', 'stamina', 'agility', 'vision', 'workRate',
  ...KEEPER_KEYS,
]

/**
 * How a scout says a player is good at something. Written as he would say it
 * to you, not as a label: "he's got a lovely first touch", not "First Touch: 16".
 */
const STRENGTH: Record<AttributeKey, readonly string[]> = {
  passing: ['He can pass. Properly — both feet, any distance.', 'Everything goes through him, and it goes where he means it to.', 'His passing is the first thing you notice.'],
  shooting: ['He can finish. Gets his shot away quicker than anyone on that pitch.', 'Give him half a yard in the box and it is in the net.', 'Hits a ball as cleanly as anyone I have seen at that level.'],
  dribbling: ['Beats people for fun.', 'He will take a full-back on every single time, and win most of them.', 'Keeps the ball in a phone box. Defenders hate him.'],
  tackling: ['Wins his tackles, and wins them clean.', 'Nobody gets past him easily. He times a challenge beautifully.', 'A proper tackler — you hear it from the stand.'],
  heading: ['Dominant in the air, both boxes.', 'Wins everything that goes up near him.', 'He attacks the ball in the air like it owes him money.'],
  crossing: ['Whips a ball in from anywhere.', 'His delivery is the best thing about him — right onto a head, every time.', 'Gets to the byline and puts it on a plate.'],
  setPieces: ['Dead balls are a weapon with him on them.', 'Corners, free kicks — he is worth a goal a month from those alone.', 'Stands over a free kick like he expects it to go in, and it usually does.'],
  firstTouch: ['Lovely first touch. The ball just dies for him.', 'Takes it down off his chest like it is nothing.', 'His touch buys him a yard every time he gets it.'],
  pace: ['Rapid. Properly rapid.', 'He is the quickest player I have seen at that level this season.', 'Frightening pace. Nobody on the pitch could live with him.'],
  strength: ['Strong as an ox. Nobody moves him off the ball.', 'Built like a door and uses it.', 'Big lad, and he knows how to use it.'],
  stamina: ['Runs all day. Still going in the ninetieth minute.', 'His engine is ridiculous — box to box and back again.', 'Never stops. You would tire before he did.'],
  agility: ['Quick feet, quick turn. Gone before you have set yourself.', 'Twists and turns like there is no one there.', 'Light on his feet for a lad his size.'],
  composure: ['Nothing rattles him.', 'Ice in his veins. The bigger the moment the calmer he gets.', 'He is the calmest man on the pitch, every game.'],
  vision: ['Sees a pass nobody else in the ground has seen.', 'He is always two moves ahead of the play.', 'Picks out runs I had not spotted from the stand.'],
  workRate: ['Works his socks off for the team.', 'Presses from the front and never lets up.', 'Graft. Pure graft. The coach will love him.'],
  positioning: ['Always in the right place. Reads it early.', 'He never seems to have to run, because he is already there.', 'Reads the game beautifully.'],
  leadership: ['Organises everyone round him. A captain already.', 'The others look to him when it goes wrong.', 'Talks the whole game. The dressing room will follow him.'],
  determination: ['He wants it more than anyone on that pitch.', 'Never knows when he is beaten.', 'Stubborn in the best way.'],
  temperament: ['Keeps his head when everyone else loses theirs.', 'You could kick him all afternoon and he would not bite.', 'Very even. Nothing gets to him.'],
  reflexes: ['Brilliant reflexes. Made two saves he had no right to.', 'Shot-stopper — quick down, quick up.', 'He saved one from four yards that I still do not understand.'],
  handling: ['Safe hands. Nothing spills.', 'Catches everything cleanly — you never worry about a rebound.', 'Holds on to the ball like it is glued to him.'],
  distribution: ['Starts attacks with his feet and his throws.', 'His distribution is as good as their midfield\'s.', 'Kicks it sixty yards onto a sixpence.'],
  command: ['Owns his box. Comes and claims everything.', 'Bosses his area and shouts at everyone in it.', 'Nothing lands in his six-yard box without his permission.'],
}

/** And how he says what worries him. Shorter, because it is the caveat. */
const WEAKNESS: Record<AttributeKey, readonly string[]> = {
  passing: ['His passing lets him down.', 'Gives the ball away more than I would like.'],
  shooting: ['Cannot finish, though.', 'He will miss more than he scores.'],
  dribbling: ['Do not ask him to beat a man.', 'Nothing much with the ball at his feet.'],
  tackling: ['Cannot tackle to save his life.', 'He goes to ground and misses.'],
  heading: ['Poor in the air.', 'Anything high and he is in trouble.'],
  crossing: ['Delivery is poor.', 'His crossing is wasteful.'],
  setPieces: ['Keep him off the dead balls.', 'Nothing from set pieces.'],
  firstTouch: ['Heavy touch, though.', 'His first touch lets him down under pressure.'],
  pace: ['Not quick, and that will get found out higher up.', 'He has no pace to speak of.'],
  strength: ['Gets knocked off it too easily.', 'Lightweight. Physical sides will bully him.'],
  stamina: ['Blows up after an hour.', 'Fitness is a problem — he fades badly.'],
  agility: ['Turns like a bus.', 'Stiff. Slow to turn.'],
  composure: ['Panics under pressure.', 'Snatches at things when it matters.'],
  vision: ['Only sees the simple ball.', 'Does not lift his head enough.'],
  workRate: ['Does not track back.', 'Goes missing when we do not have the ball.'],
  positioning: ['Positionally all over the place.', 'Gets caught out of position a lot.'],
  leadership: ['Quiet. Will not organise anybody.', 'Nobody follows him.'],
  determination: ['Drops his head when it goes against him.', 'Not sure he really wants it.'],
  temperament: ['Short fuse.', 'He will get himself sent off at some point.'],
  reflexes: ['Slow getting down.', 'Beaten too easily low to his left.'],
  handling: ['Spills things.', 'Palms it back into danger too often.'],
  distribution: ['Kicking is poor.', 'Gives it straight back to them from his kicks.'],
  command: ['Stays on his line when he should come.', 'Does not command his area.'],
}

/** A scout's shorthand for a position. */
const POSITION_WORD: Record<Position, string> = {
  GK: 'keeper', DC: 'centre-back', DL: 'left-back', DR: 'right-back', DM: 'holding midfielder',
  MC: 'central midfielder', ML: 'left winger', MR: 'right winger', AM: 'number ten', ST: 'striker',
}

export function positionWord(position: Position): string {
  return POSITION_WORD[position] ?? 'player'
}

function relevantKeys(position: Position, knowledge: number): AttributeKey[] {
  const pool = knowledge < 20 ? VISIBLE_AT_A_GLANCE : (Object.keys(STRENGTH) as AttributeKey[])
  return pool.filter((key) => (position === 'GK') === KEEPER_KEYS.includes(key))
}

/** His best and worst relevant attribute, as far as this viewing can tell. */
function bestAndWorst(player: Player, knowledge: number): { best: AttributeKey; worst: AttributeKey } | null {
  const keys = relevantKeys(player.position, knowledge)
    .filter((key) => typeof player.attributes[key] === 'number')
  if (keys.length === 0) return null
  // Ties go to the earlier key, so the pick is stable across calls.
  let best = keys[0]
  let worst = keys[0]
  for (const key of keys) {
    if (player.attributes[key] > player.attributes[best]) best = key
    if (player.attributes[key] < player.attributes[worst]) worst = key
  }
  return { best, worst }
}

const FIRST_LOOK_CAVEAT = [
  'One game, mind. I want another look before I say more.',
  'Only seen him the once, so do not act on it yet.',
  'Too early to call. Give me a few more games.',
  'That is one viewing — could have been his day.',
  'I am going back for another look before I put my name to anything.',
  'First look only. Nothing I would hang a bid on.',
  'Early days. Let me watch him against better opposition.',
  'Could be a one-off. I will know more in a fortnight.',
] as const

const OPENERS: Record<'elite' | 'good' | 'solid' | 'lower' | 'poor', readonly string[]> = {
  elite: [
    'Outstanding at this level', 'He is far too good for this level', 'Exceptional — miles above what he is playing in',
    'The best player I have watched this season', 'Top drawer', 'A proper footballer, playing among part-timers',
  ],
  good: [
    'A very good player', 'Genuinely good, this one', 'Well worth your time',
    'Better than anything we have in that position', 'Quality', 'A real player',
  ],
  solid: [
    'A solid professional', 'Dependable, no more and no less', 'He does a job, week in week out',
    'Honest, reliable, seven out of ten every week', 'Steady', 'A good squad player',
  ],
  lower: [
    'Lower-division standard', 'He is what he is — lower division', 'Honest enough, but this is his level',
    'Fine for where he is', 'A grafter at a modest level', 'Limited',
  ],
  poor: [
    'Not up to much', 'I would not bother', 'There is nothing here',
    'Not for us', 'Short of what we need', 'I cannot make a case for him',
  ],
}

const CEILING = {
  high: ['with a genuinely high ceiling', 'and I do not think we have seen half of him yet', 'with a lot more in him', 'and he could be anything'],
  room: ['with room to improve', 'and still getting better', 'with a bit more to come', 'and he has not stopped learning'],
  past: ['and past his best', 'though the legs are going', 'but on the way down, if I am honest', 'though he has had his best years'],
  flat: ['at or near his ceiling', 'and what you see is what you get', 'and I would not expect much more', 'and he is about the finished article'],
} as const

/**
 * The character read, which is where a good scout earns his money — and
 * where an unreliable one does real damage. Every trait a player can carry
 * has something said about it now, where five of sixteen did.
 */
const TRAIT_READ: Partial<Record<Player['traits'][number], readonly string[]>> = {
  professional: ['He trains impeccably.', 'First in, last out. Every day.', 'You could not fault his professionalism.'],
  disruptive: ['I have to warn you: he is trouble in a dressing room.', 'Be careful. He poisons a room.', 'Talented, but I would not have him near your squad.'],
  hothead: ['Discipline worries me.', 'He loses his head, and it costs.', 'Watch his temper.'],
  injuryProne: ['His injury history worries me.', 'He breaks down a lot. Check the medical.', 'Fit, he is good. He is not fit often.'],
  leader: ['A natural leader.', 'Others listen to him. That is worth something.', 'He runs the dressing room, in the good way.'],
  mercenary: ['He goes where the money is. Do not expect loyalty.', 'His agent will be in your office every summer.', 'He is here for the wage, and he will tell you so.'],
  loyal: ['Loyal to a fault — getting him out will not be easy.', 'He loves that club. They will want a lot for him.', 'One-club man in the making. Once he is yours, he stays.'],
  lateDeveloper: ['He has come on late. I think there is more yet.', 'A slow starter — the best of him is still coming.', 'People wrote him off at eighteen. They were early.'],
  wonderkid: ['People are going to talk about this lad.', 'Every club in the country will know his name inside a year.', 'Get in before the big clubs do.'],
  mediaDarling: ['The press love him, which cuts both ways.', 'He will sell shirts. He will also sell stories.', 'Camera-friendly. He enjoys the attention.'],
  mediaShy: ['Keeps himself to himself. Will not give the papers anything.', 'Shy off the pitch. No trouble with it.', 'Quiet lad. Avoids the cameras.'],
  bigGameplayer: ['Turns up in the big games.', 'The bigger the crowd, the better he plays.', 'Saw him in a derby. He wanted the ball every time.'],
  inconsistent: ['Brilliant one week, invisible the next.', 'You never know which one you will get.', 'Frustrating. He has it, but not every Saturday.'],
  ambitious: ['Ambitious. He will want to be moving up soon.', 'He has plans, and we might only be a step in them.', 'Hungry. He will not sit on a bench quietly.'],
  homesick: ['He has struggled away from home before.', 'Settling him will take work — he misses home.', 'Check his family situation. He has gone home early before.'],
  versatile: ['Plays three positions and does not complain about any of them.', 'Useful — you can move him around.', 'He will fill in anywhere you ask.'],
}

export function scoutVerdict(
  player: Player,
  ability: number,
  potential: number,
  knowledge: number,
  scout: Staff,
): string {
  const key = `${scout.id}:${player.id}`
  const marks = bestAndWorst(player, knowledge)

  if (knowledge < 20) {
    // What jumps out of one game, and the honest caveat. Two pools and a
    // twenty-three-way choice of what jumped out, where there used to be four
    // fixed sentences for every player a scout had seen once.
    const eye = marks ? phrase(`${key}:eye`, STRENGTH[marks.best]) : ''
    return [eye, phrase(`${key}:caveat`, FIRST_LOOK_CAVEAT)].filter(Boolean).join(' ')
  }

  const band =
    ability >= 155 ? 'elite'
      : ability >= 130 ? 'good'
        : ability >= 105 ? 'solid'
          : ability >= 80 ? 'lower'
            : 'poor'
  const headroom = potential - ability
  const ceiling =
    headroom > 45 && player.age <= 21 ? CEILING.high
      : headroom > 22 ? CEILING.room
        : player.age >= 31 ? CEILING.past
          : CEILING.flat

  const sentences: string[] = [
    `${phrase(`${key}:open`, OPENERS[band])} ${phrase(`${key}:ceiling`, ceiling)}.`,
  ]
  if (marks) {
    sentences.push(phrase(`${key}:best`, STRENGTH[marks.best]))
    // A weakness needs a few games: a bad afternoon is not a flaw. And a
    // weakness that is also his best attribute is a player with one number.
    if (knowledge >= 40 && marks.worst !== marks.best) {
      sentences.push(phrase(`${key}:worst`, WEAKNESS[marks.worst]))
    }
  }
  if (knowledge >= 60) {
    const read = player.traits.map((t) => TRAIT_READ[t]).find(Boolean)
    if (read) sentences.push(phrase(`${key}:read`, read))
  }
  return sentences.join(' ')
}

/**
 * The message a scout sends when he has found somebody.
 *
 * It used to be the report and nothing else, so it opened on "Seen him once"
 * with no idea who "him" was until you read the subject line. A scout ringing
 * you leads with who and where.
 */
export function scoutPitch(
  player: Player,
  clubName: string | null,
  verdict: string,
  scout: Staff,
  week: number,
): string {
  const pos = positionWord(player.position)
  const name = player.knownAs
  const age = `${player.age}-year-old`
  const lead = clubName
    ? phrase(`${scout.id}:${player.id}:${week}:lead`, [
      `There is ${withArticle(age)} ${pos} at ${clubName} you should know about. ${name}.`,
      `Found one. ${name}, ${pos}, ${clubName}.`,
      `Been at ${clubName} this week. Their ${pos}, ${name}, is worth your time.`,
      `${name} — ${player.age}, ${pos}, ${clubName}. Have a look.`,
      `Watched ${clubName} on Tuesday. ${name}, the ${pos}, caught my eye.`,
      `Name for you: ${name}. ${clubName}'s ${pos}, ${player.age}.`,
      `I think I have got something at ${clubName}. ${name}, plays ${pos}.`,
    ])
    : phrase(`${scout.id}:${player.id}:${week}:lead`, [
      `${name} is without a club. ${withArticle(age)[0].toUpperCase()}${withArticle(age).slice(1)} ${pos}, and nobody has picked him up.`,
      `Free agent for you: ${name}, ${pos}, ${player.age}.`,
      `Nobody has signed ${name} yet. ${player.age}, ${pos}. Could be worth a call.`,
    ])
  return `${lead} ${verdict}`
}
