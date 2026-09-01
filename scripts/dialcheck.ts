/**
 * Fields nobody reads.
 *
 * Prints what `tests/dials.test.ts` enforces, which is where the reasoning
 * lives. Use it while wiring up a dial or deleting one, to see the list move
 * without waiting for a test run.
 *
 * Run: `npx tsx scripts/dialcheck.ts`
 */
import { findUnreadFields } from '../tests/support/unreadFields'

const { declared, unread } = findUnreadFields()

console.log(`${declared} fields declared in types.ts`)
console.log(`${unread.length} of them are read by nothing in src/ or scripts/\n`)
for (const f of unread) {
  console.log(`  ${f.owner}.${f.name}`.padEnd(44) + `types.ts:${f.line}`)
}
