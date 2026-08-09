import { AttributeServiceError, getCachedPlayerAttributeBatch } from './cachedAttributes.js'
import { attributeStorage } from './storage.js'

const CHESS_API = 'https://api.chess.com/pub/player'
const SNAPSHOT_VERSION = 1
const SNAPSHOT_KEY = 'rookster:featured-players:v1'
const FRESH_FOR_MS = 24 * 60 * 60 * 1000
const STORAGE_TTL_SECONDS = 48 * 60 * 60
const PROFILE_TIMEOUT_MS = 8_000
const BUILD_CONCURRENCY = 2

export const FEATURED_PLAYERS = [
  { username: 'MagnusCarlsen', className: 'specimen-magnus' },
  { username: 'grukjr', className: 'specimen-agdestein' },
  { username: 'gmjlh', className: 'specimen-hammer' },
  { username: 'GothamChess', className: 'specimen-gotham' },
  { username: 'FabianoCaruana', className: 'specimen-fabiano' },
]

const activeBuilds = new Map()

function isSnapshot(value) {
  return Boolean(
    value
    && value.version === SNAPSHOT_VERSION
    && Number.isFinite(Date.parse(value.generatedAt))
    && Array.isArray(value.players)
    && value.players.length,
  )
}

function isFresh(snapshot, now) {
  return isSnapshot(snapshot) && now.getTime() - Date.parse(snapshot.generatedAt) < FRESH_FOR_MS
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      try {
        results[index] = { status: 'fulfilled', value: await mapper(items[index]) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  ))
  return results
}

async function fetchProfile(username, fetchImpl, signal, timeoutMs = PROFILE_TIMEOUT_MS) {
  const controller = new AbortController()
  let timedOut = false
  const onAbort = () => controller.abort(signal.reason ?? 'deadline')
  signal?.addEventListener('abort', onAbort, { once: true })
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort('profile-timeout')
  }, timeoutMs)

  try {
    const response = await fetchImpl(`${CHESS_API}/${encodeURIComponent(username)}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'rookster/0.1 (featured public Chess.com scout cards)',
      },
    })
    if (!response.ok) {
      throw new AttributeServiceError('A featured Chess.com profile was unavailable.', 502)
    }
    return await response.json()
  } catch (error) {
    if (signal?.aborted) {
      throw new AttributeServiceError('The featured report refresh exceeded its deadline.', 504)
    }
    if (timedOut) {
      throw new AttributeServiceError('A featured Chess.com profile took too long to load.', 504)
    }
    if (error instanceof AttributeServiceError) throw error
    throw new AttributeServiceError('A featured Chess.com profile was unavailable.', 502)
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onAbort)
  }
}

export async function buildFeaturedSnapshot({
  storage = attributeStorage,
  fetchImpl = globalThis.fetch,
  signal,
  now = new Date(),
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new AttributeServiceError('This runtime does not provide fetch.', 500)
  }

  const results = await mapWithConcurrency(
    FEATURED_PLAYERS,
    BUILD_CONCURRENCY,
    async (featured) => {
      const [profile, compiled] = await Promise.all([
        fetchProfile(featured.username, fetchImpl, signal),
        getCachedPlayerAttributeBatch({
          username: featured.username,
          storage,
          fetchImpl,
          signal,
          includeStats: true,
        }),
      ])

      return {
        className: featured.className,
        profile: {
          username: profile.username,
          title: profile.title,
          country: profile.country,
          avatar: profile.avatar,
        },
        stats: compiled.stats,
        attributeStats: compiled.attributes,
      }
    },
  )
  const players = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)

  if (players.length < 3) {
    throw new AttributeServiceError('Too few featured reports could be refreshed.', 502)
  }

  return {
    version: SNAPSHOT_VERSION,
    generatedAt: now.toISOString(),
    refreshAfter: new Date(now.getTime() + FRESH_FOR_MS).toISOString(),
    players,
  }
}

export async function getFeaturedPlayerSnapshot({
  storage = attributeStorage,
  now = new Date(),
  buildSnapshot = buildFeaturedSnapshot,
  inFlight = activeBuilds,
  ...dependencies
} = {}) {
  let cached = null
  try {
    cached = await storage.get(SNAPSHOT_KEY)
  } catch {
    // A live refresh may still succeed; the caller gets a clean service error if it cannot.
  }
  if (isFresh(cached, now)) return cached

  let build = inFlight.get(SNAPSHOT_KEY)
  if (!build) {
    build = buildSnapshot({ storage, now, ...dependencies })
      .then(async (snapshot) => {
        try {
          await storage.set(
            SNAPSHOT_KEY,
            snapshot,
            { expirationSeconds: STORAGE_TTL_SECONDS },
          )
        } catch {
          // Serving the newly compiled snapshot is more useful than failing the homepage.
        }
        return snapshot
      })
    inFlight.set(SNAPSHOT_KEY, build)
    build.finally(() => {
      if (inFlight.get(SNAPSHOT_KEY) === build) inFlight.delete(SNAPSHOT_KEY)
    }).catch(() => {})
  }

  try {
    return await build
  } catch (error) {
    if (isSnapshot(cached)) return { ...cached, stale: true }
    throw error
  }
}
