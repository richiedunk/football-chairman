import fs from 'node:fs'
import path from 'node:path'

/**
 * Which fields of the world model nothing reads.
 *
 * Shared by `tests/dials.test.ts`, which fails on a new one, and
 * `scripts/dialcheck.ts`, which prints the list. The reasoning for why this
 * exists at all is in the test; this file is the mechanism.
 *
 * It is textual, and it is meant to be. A type checker cannot help — a field
 * written once and read never is perfectly well typed — and the alternative,
 * walking the TypeScript AST for every property access in the project, would
 * be a great deal of machinery to answer a question that grep answers. What
 * matters is that the shape of failure it exists for, a field that appears
 * nowhere else at all, is one no amount of approximation can hide.
 */

export interface Field {
  owner: string
  name: string
  line: number
}

/** Every field declared at the top level of an interface or type in a file. */
function declaredFields(source: string): Field[] {
  const fields: Field[] = []
  const lines = source.split('\n')
  let owner = ''
  let depth = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const decl = line.match(/^(?:export )?(?:interface|type) (\w+)/)
    if (decl && depth === 0) owner = decl[1]

    // Only the top level of a declaration body. A nested object literal inside
    // a field's type is reached through its parent, and the parent is what is
    // being asked about here.
    if (depth === 1) {
      const field = line.match(/^\s{2}(?:readonly )?(\w+)\??:/)
      if (field && owner) fields.push({ owner, name: field[1], line: i + 1 })
    }

    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length
    if (depth <= 0) { depth = 0; owner = '' }
  }
  return fields
}

/** Somewhere in `source` that consults the field rather than setting it. */
function isRead(name: string, source: string): boolean {
  // `.field`, but not `.field =`. `=>`, `==` and `===` are not assignment;
  // `+=` and its family are, but they read as well as write, so they count.
  const dotted = new RegExp(`\\.${name}\\b(?!\\s*=(?![=>]))`)
  const indexed = new RegExp(`\\[['"\`]${name}['"\`]\\]`)
  // `const { field } = thing`, approximated.
  const destructured = new RegExp(`\\{[^}\\n]*\\b${name}\\b[^}\\n]*\\}\\s*=[^=]`)
  // The name as a string. Player and staff attributes are consulted through
  // tables keyed by name — `keys: ['passing', 'tackling', ...]`, then
  // `attrs[key]` — which is a real read that looking for `.name` cannot find.
  // Counting the quoted form makes this weaker and correct.
  const quoted = new RegExp(`['"\`]${name}['"\`]`)
  return dotted.test(source) || indexed.test(source)
    || destructured.test(source) || quoted.test(source)
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|vue)$/.test(entry.name)) out.push(full)
  }
  return out
}

export interface UnreadReport {
  declared: number
  unread: Field[]
}

/** Read the world model, then look for a reader of each of its fields. */
export function findUnreadFields(root = process.cwd()): UnreadReport {
  const types = path.join(root, 'src/engine/types.ts')
  const declared = declaredFields(fs.readFileSync(types, 'utf8'))

  const sources = [...walk(path.join(root, 'src')), ...walk(path.join(root, 'scripts'))]
    .filter((f) => f !== types)
    .map((f) => fs.readFileSync(f, 'utf8'))

  return {
    declared: declared.length,
    unread: declared.filter((f) => !sources.some((s) => isRead(f.name, s))),
  }
}
