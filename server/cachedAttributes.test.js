import assert from 'node:assert/strict'
import test from 'node:test'
import { getCachedPlayerAttributeBatch, getCachedPlayerAttributes } from './cachedAttributes.js'

const base = 'https://api.chess.com/pub/player/tester'
const january = `${base}/games/2026/01`
const february = `${base}/games/2026/02`
const march = `${base}/games/2026/03`

function archiveGame(opening, opponentRating = 1550, timeClass = 'rapid') {
  return {
    time_class: timeClass,
    white: { username: 'Tester', rating: 1500, result: 'win' },
    black: { username: 'Opponent', rating: opponentRating, result: 'resigned' },
    pgn: `[TimeControl "300+0"]\n[Opening "${opening}"]\n\n1. e4 {[%clk 0:04:00]} e5 {[%clk 0:04:30]} 1-0`,
  }
}

function mixedArchiveGames({ gamesPerControl = 2, bulletGames = gamesPerControl } = {}) {
  return [
    ...Array.from({ length: gamesPerControl }, () => archiveGame('Sicilian Defense', 1550, 'rapid')),
    ...Array.from({ length: gamesPerControl }, () => archiveGame('French Defense', 1550, 'blitz')),
    ...Array.from({ length: bulletGames }, () => archiveGame('Caro-Kann Defense', 1550, 'bullet')),
  ]
}

function allControlStats(games = 100) {
  return {
    chess_rapid: { last: { rating: 1500 }, record: { win: games } },
    chess_blitz: { last: { rating: 1550 }, record: { win: games } },
    chess_bullet: { last: { rating: 1600 }, record: { win: games } },
  }
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
  }
}

function createMemoryStorage() {
  const values = new Map()
  return {
    values,
    async get(key) { return values.get(key) ?? null },
    async set(key, value) { values.set(key, structuredClone(value)) },
  }
}

test('locks closed months and refreshes only the live month on cache hits', async () => {
  const storage = createMemoryStorage()
  storage.values.set('tester:rapid', {
    cacheVersion: 1,
    lockedTotals: {},
    currentMonthTotals: {},
    currentMonthKey: '2026-02',
  })
  let archiveUrls = [january, february]
  const archiveFetches = []
  const archives = {
    [january]: [archiveGame('Sicilian Defense')],
    [february]: [archiveGame('French Defense', 1600)],
    [march]: [archiveGame('Caro-Kann Defense', 1650)],
  }
  const fetchImpl = async (url) => {
    if (url === `${base}/games/archives`) return jsonResponse({ archives: archiveUrls })
    if (url === `${base}/stats`) {
      return jsonResponse({ chess_rapid: { last: { rating: 1500 }, record: { win: 3 } } })
    }
    archiveFetches.push(url)
    return jsonResponse({ games: archives[url] })
  }

  let now = new Date('2026-02-15T12:00:00Z')
  await getCachedPlayerAttributes({ username: 'Tester', timeControl: 'rapid', storage, fetchImpl, now })
  assert.deepEqual(archiveFetches, [january, february])
  const initialRecord = structuredClone(storage.values.get('tester:rapid'))
  assert.equal(initialRecord.cacheVersion, 3)
  assert.equal(initialRecord.months['2026-01'].totalGames, 1)
  assert.equal(initialRecord.months['2026-02'].totalGames, 1)
  assert.ok(storage.values.has('tester:blitz'))
  assert.ok(storage.values.has('tester:bullet'))

  archiveFetches.length = 0
  await getCachedPlayerAttributes({ username: 'Tester', timeControl: 'blitz', storage, fetchImpl, now })
  assert.deepEqual(archiveFetches, [february])

  archiveFetches.length = 0
  await getCachedPlayerAttributes({ username: 'Tester', timeControl: 'rapid', storage, fetchImpl, now })
  assert.deepEqual(archiveFetches, [february])
  assert.deepEqual(storage.values.get('tester:rapid').months['2026-01'], initialRecord.months['2026-01'])

  archiveFetches.length = 0
  archiveUrls = [january, february, march]
  now = new Date('2026-03-15T12:00:00Z')
  await getCachedPlayerAttributes({ username: 'Tester', timeControl: 'rapid', storage, fetchImpl, now })
  assert.deepEqual(archiveFetches, [march])
  const transitionedRecord = storage.values.get('tester:rapid')
  assert.equal(transitionedRecord.months['2026-01'].totalGames, 1)
  assert.equal(transitionedRecord.months['2026-02'].totalGames, 1)
  assert.equal(transitionedRecord.months['2026-03'].totalGames, 1)
})

function monthUrl(year, month) {
  return `${base}/games/${year}/${String(month).padStart(2, '0')}`
}

function recentMonthUrls(count, endYear = 2026, endMonth = 12) {
  const endIndex = endYear * 12 + endMonth - 1
  return Array.from({ length: count }, (_, offset) => {
    const index = endIndex - count + 1 + offset
    return monthUrl(Math.floor(index / 12), (index % 12) + 1)
  })
}

test('cold aggregation fetches only the latest 12 months when the sample is sufficient', async () => {
  const storage = createMemoryStorage()
  const archiveUrls = recentMonthUrls(30)
  const fetchedArchives = []
  const fetchImpl = async (url) => {
    if (url === `${base}/games/archives`) return jsonResponse({ archives: archiveUrls })
    if (url === `${base}/stats`) return jsonResponse({ chess_rapid: { last: { rating: 1500 }, record: { win: 150 } } })
    fetchedArchives.push(url)
    return jsonResponse({ games: Array.from({ length: 5 }, () => archiveGame('Sicilian Defense')) })
  }

  const result = await getCachedPlayerAttributes({
    username: 'Tester',
    timeControl: 'rapid',
    storage,
    fetchImpl,
    now: new Date('2026-12-15T12:00:00Z'),
  })

  assert.equal(fetchedArchives.length, 12)
  assert.equal(result.sampleGames, 60)
  assert.equal(result.sampleMonths, 12)
  assert.equal(result.extendedSample, false)
  assert.equal(result.evidence.PAS.sampleSize, 60)
  assert.equal(result.evidence.PAC.source, 'clock')
})

test('sparse aggregation extends toward 20 games but never beyond 24 months', async () => {
  const storage = createMemoryStorage()
  const archiveUrls = recentMonthUrls(30)
  const fetchedArchives = []
  const fetchImpl = async (url) => {
    if (url === `${base}/games/archives`) return jsonResponse({ archives: archiveUrls })
    if (url === `${base}/stats`) return jsonResponse({ chess_rapid: { last: { rating: 1500 }, record: { win: 30 } } })
    fetchedArchives.push(url)
    return jsonResponse({ games: [archiveGame('Sicilian Defense')] })
  }

  const result = await getCachedPlayerAttributes({
    username: 'Tester',
    timeControl: 'rapid',
    storage,
    fetchImpl,
    now: new Date('2026-12-15T12:00:00Z'),
  })

  assert.equal(fetchedArchives.length, 21)
  assert.equal(result.sampleGames, 20)
  assert.equal(result.sampleMonths, 20)
  assert.equal(result.extendedSample, true)
  assert.ok(Object.keys(storage.values.get('tester:rapid').months).length <= 24)
})

test('batch aggregation compiles all available controls from one 12-month archive walk', async () => {
  const storage = createMemoryStorage()
  const archiveUrls = recentMonthUrls(30)
  const fetchedArchives = []
  const fetchImpl = async (url) => {
    if (url === `${base}/games/archives`) return jsonResponse({ archives: archiveUrls })
    if (url === `${base}/stats`) return jsonResponse(allControlStats())
    fetchedArchives.push(url)
    return jsonResponse({ games: mixedArchiveGames() })
  }

  const result = await getCachedPlayerAttributeBatch({
    username: 'Tester',
    storage,
    fetchImpl,
    now: new Date('2026-12-15T12:00:00Z'),
  })

  assert.deepEqual(Object.keys(result.attributes), ['rapid', 'blitz', 'bullet'])
  assert.equal(fetchedArchives.length, 12)
  assert.equal(new Set(fetchedArchives).size, 12)
  assert.equal(result.attributes.rapid.sampleGames, 24)
  assert.equal(result.attributes.blitz.sampleGames, 24)
  assert.equal(result.attributes.bullet.sampleGames, 24)
  assert.ok(storage.values.has('tester:rapid'))
  assert.ok(storage.values.has('tester:blitz'))
  assert.ok(storage.values.has('tester:bullet'))
})

test('batch aggregation extends the shared walk only until every format has 20 games', async () => {
  const storage = createMemoryStorage()
  const archiveUrls = recentMonthUrls(30)
  const fetchedArchives = []
  const fetchImpl = async (url) => {
    if (url === `${base}/games/archives`) return jsonResponse({ archives: archiveUrls })
    if (url === `${base}/stats`) return jsonResponse(allControlStats())
    fetchedArchives.push(url)
    return jsonResponse({ games: mixedArchiveGames({ gamesPerControl: 2, bulletGames: 1 }) })
  }

  const result = await getCachedPlayerAttributeBatch({
    username: 'Tester',
    storage,
    fetchImpl,
    now: new Date('2026-12-15T12:00:00Z'),
  })

  assert.equal(fetchedArchives.length, 21)
  assert.equal(new Set(fetchedArchives).size, 21)
  assert.equal(result.attributes.rapid.sampleMonths, 12)
  assert.equal(result.attributes.blitz.sampleMonths, 12)
  assert.equal(result.attributes.bullet.sampleGames, 20)
  assert.equal(result.attributes.bullet.sampleMonths, 20)
  assert.equal(result.attributes.bullet.extendedSample, true)
})

test('batch cache hits refresh the live archive once for every format', async () => {
  const storage = createMemoryStorage()
  const archiveUrls = recentMonthUrls(12)
  const fetchedArchives = []
  const fetchImpl = async (url) => {
    if (url === `${base}/games/archives`) return jsonResponse({ archives: archiveUrls })
    if (url === `${base}/stats`) return jsonResponse(allControlStats())
    fetchedArchives.push(url)
    return jsonResponse({ games: mixedArchiveGames() })
  }
  const request = {
    username: 'Tester',
    storage,
    fetchImpl,
    now: new Date('2026-12-15T12:00:00Z'),
  }

  await getCachedPlayerAttributeBatch(request)
  fetchedArchives.length = 0
  const result = await getCachedPlayerAttributeBatch(request)

  assert.deepEqual(fetchedArchives, [archiveUrls.at(-1)])
  assert.equal(result.attributes.rapid.sampleGames, 24)
  assert.equal(result.attributes.blitz.sampleGames, 24)
  assert.equal(result.attributes.bullet.sampleGames, 24)
})

test('a partial archive failure returns a controlled upstream error', async () => {
  const storage = createMemoryStorage()
  const fetchImpl = async (url) => {
    if (url === `${base}/games/archives`) return jsonResponse({ archives: [january] })
    if (url === `${base}/stats`) return jsonResponse(allControlStats())
    return jsonResponse({ code: 0, message: 'upstream failure' }, 400)
  }

  await assert.rejects(
    getCachedPlayerAttributeBatch({
      username: 'Tester',
      storage,
      fetchImpl,
      now: new Date('2026-01-15T12:00:00Z'),
    }),
    (error) => error.status === 502 && /incomplete archive/i.test(error.message),
  )
})
