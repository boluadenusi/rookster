const CHESS_API = 'https://api.chess.com/pub/player'
const RECENT_GAME_LIMIT = 5
const RETRY_DELAYS = [300, 900]

export class PlayerFetchError extends Error {
  constructor(message, kind = 'network') {
    super(message)
    this.name = 'PlayerFetchError'
    this.kind = kind
  }
}

function getAbortError(signal) {
  if (signal?.reason === 'timeout') {
    return new PlayerFetchError('The scouting request timed out after three minutes. Please run it again.', 'timeout')
  }
  return new PlayerFetchError('The scouting request was cancelled.', 'cancelled')
}

function waitForRetry(delay, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(getAbortError(signal))
      return
    }

    const onAbort = () => {
      globalThis.clearTimeout(timer)
      reject(getAbortError(signal))
    }
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delay)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function fetchJson(url, {
  isProfile = false,
  notFoundMessage = 'No player found.',
  resourceLabel = 'player data',
  signal,
} = {}) {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
    let response
    try {
      response = await fetch(url, { signal, cache: 'no-store' })
    } catch {
      if (signal?.aborted) throw getAbortError(signal)
      if (attempt < RETRY_DELAYS.length) {
        await waitForRetry(RETRY_DELAYS[attempt], signal)
        continue
      }
      throw new PlayerFetchError('We could not reach the chess server. Check your connection and try again.')
    }

    if (response.ok) {
      try {
        return await response.json()
      } catch {
        throw new PlayerFetchError(`Chess.com returned unreadable ${resourceLabel}. Please run the report again.`, 'incomplete-data')
      }
    }

    const retryable = response.status === 404 || response.status >= 500
    if (retryable && attempt < RETRY_DELAYS.length) {
      await waitForRetry(RETRY_DELAYS[attempt], signal)
      continue
    }

    if (response.status === 404) {
      if (isProfile) throw new PlayerFetchError(notFoundMessage, 'not-found')
      throw new PlayerFetchError(
        `The player exists, but Chess.com could not return their ${resourceLabel}. Please run the report again.`,
        'incomplete-data',
      )
    }

    if (response.status === 429) {
      throw new PlayerFetchError('The chess server is busy right now. Wait a moment, then try again.', 'rate-limit')
    }

    throw new PlayerFetchError('Something went wrong while loading this player. Please try again.')
  }

  throw new PlayerFetchError('Something went wrong while loading this player. Please try again.')
}

async function getRecentChessGames(archiveUrls = [], { signal } = {}) {
  const recentGames = []
  const archiveCache = {}

  for (let index = archiveUrls.length - 1; index >= 0 && recentGames.length < RECENT_GAME_LIMIT; index -= 1) {
    let archive
    try {
      archive = await fetchJson(archiveUrls[index], { signal, resourceLabel: 'recent game archive' })
    } catch (error) {
      if (error.kind === 'incomplete-data') continue
      throw error
    }
    const games = [...(archive.games ?? [])]
      .sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0))
    archiveCache[archiveUrls[index]] = games

    recentGames.push(...games.slice(0, RECENT_GAME_LIMIT - recentGames.length))
  }

  return { recentGames, archiveCache }
}

function getArchiveMonthIndex(url) {
  const match = url.match(/\/games\/(\d{4})\/(\d{2})(?:\/|$)/)
  if (!match) return null
  return Number(match[1]) * 12 + Number(match[2]) - 1
}

export async function getChessHeadToHead(player, opponentUsername, monthCount = 3, { signal } = {}) {
  const now = new Date()
  const currentMonth = now.getUTCFullYear() * 12 + now.getUTCMonth()
  const cutoffMonth = currentMonth - Math.max(0, monthCount - 1)
  const primaryUsername = player.profile.username.toLowerCase()
  const opponent = opponentUsername.toLowerCase()
  const games = []

  if (primaryUsername === opponent) return games

  const archiveUrls = (player.archiveUrls ?? [])
    .filter((url) => {
      const archiveMonth = getArchiveMonthIndex(url)
      return archiveMonth !== null && archiveMonth >= cutoffMonth && archiveMonth <= currentMonth
    })
    .sort((a, b) => (getArchiveMonthIndex(b) ?? 0) - (getArchiveMonthIndex(a) ?? 0))

  const archiveBatches = await Promise.all(archiveUrls.map(async (archiveUrl) => (
    player.archiveCache?.[archiveUrl]
      ?? (await fetchJson(archiveUrl, { signal })).games
      ?? []
  )))

  for (const archiveGames of archiveBatches) {
    games.push(...archiveGames.filter((game) => {
      const white = game.white?.username?.toLowerCase()
      const black = game.black?.username?.toLowerCase()
      return [white, black].includes(primaryUsername) && [white, black].includes(opponent)
    }))
  }

  return games.sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0))
}

export async function getChessPlayer(username, { signal } = {}) {
  const safeUsername = encodeURIComponent(username.trim())
  const base = `${CHESS_API}/${safeUsername}`

  const profile = await fetchJson(base, { signal, isProfile: true, resourceLabel: 'profile' })
  const [stats, archives] = await Promise.all([
    fetchJson(`${base}/stats`, { signal, resourceLabel: 'rating data' }),
    fetchJson(`${base}/games/archives`, { signal, resourceLabel: 'game archive list' }),
  ])

  const archiveUrls = archives.archives ?? []
  const { recentGames, archiveCache } = await getRecentChessGames(archiveUrls, { signal })

  return { profile, stats, recentGames, archiveUrls, archiveCache }
}

async function requestCachedAttributes(query, signal) {
  let response
  try {
    response = await fetch(`/api/attributes?${query}`, { signal, cache: 'no-store' })
  } catch {
    if (signal?.aborted) throw getAbortError(signal)
    throw new PlayerFetchError('The scouting attribute service could not be reached. Please try again.')
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new PlayerFetchError('The scouting attribute service returned an unreadable response.', 'incomplete-data')
  }

  if (!response.ok) {
    const kind = response.status === 404
      ? 'not-found'
      : response.status === 429
        ? 'rate-limit'
        : 'network'
    throw new PlayerFetchError(payload.error ?? 'The scouting attributes could not be compiled.', kind)
  }

  return payload
}

function normalizeCachedAttributes(payload) {
  return {
    PAC: payload.PAC,
    PAS: payload.PAS,
    DRI: payload.DRI,
    DEF: payload.DEF,
    evidence: payload.evidence ?? null,
    sampleGames: payload.sampleGames,
    sampleMonths: payload.sampleMonths,
    extendedSample: payload.extendedSample,
  }
}

export async function getCachedAttributes(username, timeControl, { signal } = {}) {
  const query = new URLSearchParams({ username, timeControl })
  const payload = await requestCachedAttributes(query, signal)

  return normalizeCachedAttributes(payload)
}

export async function getCachedAttributeBatch(username, { signal } = {}) {
  const query = new URLSearchParams({ username, timeControl: 'all' })
  const payload = await requestCachedAttributes(query, signal)

  return Object.fromEntries(
    Object.entries(payload.attributes ?? {}).map(([control, attributes]) => [
      control,
      normalizeCachedAttributes(attributes),
    ]),
  )
}

export async function getFeaturedPlayers({ signal } = {}) {
  let response
  try {
    response = await fetch('/api/featured', { signal })
  } catch {
    if (signal?.aborted) throw getAbortError(signal)
    throw new PlayerFetchError('The featured scouting cards could not be reached.')
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new PlayerFetchError('The featured scouting cards returned an unreadable response.', 'incomplete-data')
  }

  if (!response.ok || !Array.isArray(payload.players)) {
    throw new PlayerFetchError(payload.error ?? 'The featured scouting cards are unavailable.')
  }

  return payload.players
}

export async function getGeneratedCardCount({ signal } = {}) {
  const response = await fetch('/api/card-count', { signal })
  const payload = await response.json()
  if (!response.ok || !Number.isFinite(payload.count)) {
    throw new PlayerFetchError(payload.error ?? 'The card tally is unavailable.')
  }
  return payload.count
}

export async function recordCardGeneration(eventId, cardCount) {
  const response = await fetch('/api/card-count', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, cardCount }),
  })
  const payload = await response.json()
  if (!response.ok || !Number.isFinite(payload.count)) {
    throw new PlayerFetchError(payload.error ?? 'The card generation could not be counted.')
  }
  window.dispatchEvent(new CustomEvent('rookster:card-count-updated', {
    detail: { count: payload.count },
  }))
  return payload
}
