import { describe, expect, it } from 'vitest'
import { LIST_NAME_BUDGET, fullName, listName, nickname } from '../src/ui/playerName'

const p = (firstName: string, lastName: string, knownAs = `${firstName} ${lastName}`) =>
  ({ firstName, lastName, knownAs })

describe('listName', () => {
  it('writes the full name when it fits', () => {
    expect(listName(p('Bruno', 'Fernandes'))).toBe('Bruno Fernandes')
  })

  it('abbreviates the forename only when the full name will not fit', () => {
    const long = p('Maximilian', 'Wolfsburger-Hartmann')
    expect(fullName(long).length).toBeGreaterThan(LIST_NAME_BUDGET)
    expect(listName(long)).toBe('M. Wolfsburger-Hartmann')
  })

  it('keeps a name that is exactly at the budget', () => {
    const name = p('Aaaaaaaaaaaa', 'Bbbbbbbbbbbbb')
    expect(fullName(name)).toHaveLength(LIST_NAME_BUDGET)
    expect(listName(name)).toBe(fullName(name))
  })

  it('leaves ordinary Iberian double surnames alone', () => {
    // The budget was 22, which abbreviated this one — 23 characters and 178px
    // in a 288px box. Measured, not guessed; see LIST_NAME_BUDGET.
    expect(listName(p('Gonzalo', 'Montero Robledo'))).toBe('Gonzalo Montero Robledo')
    expect(listName(p('Wladyslaw', 'Wojciechowski'))).toBe('Wladyslaw Wojciechowski')
  })

  it('never invents an initial from an empty forename', () => {
    expect(listName(p('', 'Ronaldinho'), 4)).toBe('Ronaldinho')
  })

  it('does not use what he is known as — a list is a register', () => {
    // Rodri is a real way to refer to him; a squad list is not the place.
    expect(listName(p('Rodrigo', 'Hernández', 'Rodri'))).toBe('Rodrigo Hernández')
  })
})

describe('nickname', () => {
  it('shows a genuine one', () => {
    expect(nickname(p('Rodrigo', 'Hernández', 'Rodri'))).toBe('Rodri')
  })

  it('stays quiet when it is just his name again', () => {
    expect(nickname(p('Bruno', 'Fernandes'))).toBeNull()
    expect(nickname(p('Bruno', 'Fernandes', 'Fernandes'))).toBeNull()
  })

  it('stays quiet when there is nothing there', () => {
    expect(nickname(p('Bruno', 'Fernandes', '   '))).toBeNull()
  })
})
