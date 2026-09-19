/**
 * Serialising a save without ever holding it whole.
 *
 * `JSON.stringify(state)` builds one string of about 56MB. Strings are UTF-16,
 * so that is roughly 112MB in a single allocation on top of the 122MB the game
 * already occupies — `scripts/savememory.ts` measured the peak at 2.2x the
 * resting heap. On a phone a spike like that is how a tab gets killed rather
 * than merely slowed, and it is the one cost that the autosave cadence and the
 * career-record tuple did not touch.
 *
 * So the save is emitted in pieces instead, each one small enough not to
 * matter, and fed straight into compression as it is produced. Nothing larger
 * than a single player ever exists.
 *
 * ## It must match `JSON.stringify` exactly
 *
 * Not merely parse back to something equal — exactly, byte for byte. Saves are
 * compared by hash (`scripts/worldhash.ts`), migrations run against stored
 * text, and a difference that only shows up in somebody's forty-season career
 * is not a difference anybody wants to debug. A test asserts equality on a
 * real world, which is the only way to be sure of the corners: `undefined` in
 * an object drops the key, `undefined` in an array becomes `null`, and key
 * order is insertion order.
 */

/**
 * How deep to stream before handing over to `JSON.stringify`.
 *
 * Two is what the state's shape needs: the root, then each table, with each
 * *entry* stringified whole. An entry is a player or a club, a couple of
 * kilobytes. Going deeper would buy nothing and cost a great many more
 * generator steps; going shallower would stringify a whole table and put the
 * spike straight back.
 */
const STREAM_DEPTH = 2

export function* streamJson(value: unknown, depth = STREAM_DEPTH): Generator<string> {
  // Below the streaming depth, or anything that is not a container: one call
  // to the real thing, which is also what guarantees the output matches it.
  if (depth <= 0 || value === null || typeof value !== 'object') {
    yield JSON.stringify(value) ?? 'null'
    return
  }

  if (Array.isArray(value)) {
    yield '['
    for (let i = 0; i < value.length; i++) {
      if (i > 0) yield ','
      // `JSON.stringify(undefined)` returns undefined, not a string, and in an
      // array position the answer is `null`. `streamJson` handles that below,
      // but only because this recurses rather than stringifying directly.
      yield* streamJson(value[i], depth - 1)
    }
    yield ']'
    return
  }

  yield '{'
  let first = true
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    // A key whose value is undefined is omitted entirely, which is what
    // `JSON.stringify` does and why this cannot simply emit every key.
    if (entry === undefined) continue
    if (!first) yield ','
    first = false
    yield `${JSON.stringify(key)}:`
    yield* streamJson(entry, depth - 1)
  }
  yield '}'
}

/**
 * The same pieces as an encoded byte stream, ready for `CompressionStream`.
 *
 * Pulled rather than pushed: the generator only advances when compression asks
 * for more, so back-pressure keeps the queue short instead of racing ahead and
 * building in memory the thing this exists to avoid.
 */
export function jsonByteStream(
  value: unknown,
  /**
   * Called with the length of the JSON that was produced, once it has all been
   * produced. The save metadata reports an uncompressed size and there is no
   * string left to measure, so it is counted on the way past.
   */
  onLength?: (length: number) => void,
): ReadableStream<BufferSource> {
  const encoder = new TextEncoder()
  const chunks = streamJson(value)
  let length = 0
  // Typed as `BufferSource` rather than `Uint8Array` only to satisfy
  // `pipeThrough`: `CompressionStream`'s writable side declares that wider
  // type, and TypeScript treats the pair as invariant.
  return new ReadableStream<BufferSource>({
    pull(controller) {
      // Several fragments per pull: a chunk of `{` or `,` on its own is a
      // whole stream transaction for one byte, and the generator emits plenty
      // of those.
      let buffer = ''
      while (buffer.length < 64 * 1024) {
        const next = chunks.next()
        if (next.done) {
          length += buffer.length
          if (buffer) controller.enqueue(encoder.encode(buffer))
          onLength?.(length)
          controller.close()
          return
        }
        buffer += next.value
      }
      length += buffer.length
      controller.enqueue(encoder.encode(buffer))
    },
  })
}
