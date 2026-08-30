/**
 * Id minting.
 *
 * Ids are short, sequential and prefixed by entity kind (`p1`, `c14`, `s203`)
 * rather than UUIDs. The save file holds tens of thousands of id references,
 * and 36-character UUIDs would roughly triple its size for no benefit — ids
 * only need to be unique within one save.
 */
export class IdFactory {
  constructor(private counter = 1) {}

  next(prefix: string): string {
    return `${prefix}${this.counter++}`
  }

  get value(): number {
    return this.counter
  }

  set value(n: number) {
    this.counter = n
  }
}

export const ID_PREFIX = {
  nation: 'n',
  league: 'l',
  club: 'c',
  player: 'p',
  staff: 's',
  agent: 'a',
  outlet: 'o',
  fixture: 'f',
  negotiation: 'g',
  inbox: 'i',
  news: 'w',
  story: 'm',
  project: 'j',
  request: 'r',
  cup: 'k',
  transfer: 't',
  sanction: 'x',
  takeover: 'v',
} as const
