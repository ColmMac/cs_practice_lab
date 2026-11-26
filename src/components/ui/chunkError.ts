/**
 * A page's own chunk could not be loaded: offline, or a tab left open across a deploy (hashed assets, `no-cache` HTML).
 * `React.lazy` remembers the failure, so only a full reload can get past it.
 */
export class ChunkLoadError extends Error {
  constructor(cause: unknown) {
    super('A page chunk failed to load', { cause })
    this.name = 'ChunkLoadError'
  }
}

export async function loadChunk<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (cause) {
    throw new ChunkLoadError(cause)
  }
}
