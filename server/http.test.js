import assert from 'node:assert/strict'
import test from 'node:test'
import { createInMemoryRateLimiter, runAttributeRequest } from './http.js'

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
  }
}

function memoryStorage({ fail = false } = {}) {
  return {
    async get() {
      if (fail) throw new Error('redis-token-should-never-leak')
      return null
    },
    async set() {},
  }
}

test('the endpoint rejects malformed usernames before contacting Chess.com', async () => {
  let fetchCount = 0
  const result = await runAttributeRequest(
    { username: '../not-a-player', timeControl: 'all' },
    {
      fetchImpl: async () => {
        fetchCount += 1
        return jsonResponse({})
      },
      storage: memoryStorage(),
      inFlight: new Map(),
    },
  )

  assert.equal(result.status, 400)
  assert.equal(fetchCount, 0)
})

test('the endpoint ends a stalled upstream compilation with a clean 504', async () => {
  const fetchImpl = async (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error(`aborted ${url}`)), { once: true })
  })
  const result = await runAttributeRequest(
    { username: 'tester', timeControl: 'all' },
    {
      fetchImpl,
      storage: memoryStorage(),
      deadlineMs: 15,
      fetchTimeoutMs: 5_000,
      inFlight: new Map(),
    },
  )

  assert.equal(result.status, 504)
  assert.match(result.body.error, /too long/i)
  assert.doesNotMatch(result.body.error, /aborted/i)
})

test('unexpected server errors never expose internal details', async () => {
  const base = 'https://api.chess.com/pub/player/tester'
  const fetchImpl = async (url) => {
    if (url === `${base}/games/archives`) return jsonResponse({ archives: [] })
    return jsonResponse({ chess_rapid: { last: { rating: 1500 } } })
  }
  const result = await runAttributeRequest(
    { username: 'tester', timeControl: 'all' },
    {
      fetchImpl,
      storage: memoryStorage({ fail: true }),
      inFlight: new Map(),
    },
  )

  assert.equal(result.status, 500)
  assert.equal(result.body.error, 'The scouting service is temporarily unavailable. Please try again shortly.')
  assert.doesNotMatch(result.body.error, /redis-token/i)
})

test('the endpoint applies a per-client request limit', async () => {
  const limiter = createInMemoryRateLimiter({ limit: 1, windowMs: 60_000 })
  const dependencies = { rateLimiter: limiter, inFlight: new Map() }

  const first = await runAttributeRequest(
    { username: 'bad name', timeControl: 'all', ip: '203.0.113.8' },
    dependencies,
  )
  const second = await runAttributeRequest(
    { username: 'bad name', timeControl: 'all', ip: '203.0.113.8' },
    dependencies,
  )

  assert.equal(first.status, 400)
  assert.equal(second.status, 429)
  assert.equal(second.headers['Retry-After'], '60')
})

test('simultaneous identical requests share one compilation', async () => {
  const inFlight = new Map()
  let fetchCount = 0
  const base = 'https://api.chess.com/pub/player/tester'
  const fetchImpl = async (url) => {
    fetchCount += 1
    await new Promise((resolve) => setTimeout(resolve, 8))
    if (url === `${base}/games/archives`) return jsonResponse({ archives: [] })
    return jsonResponse({ chess_rapid: { last: { rating: 1500 }, record: { win: 2 } } })
  }
  const dependencies = { fetchImpl, storage: memoryStorage(), inFlight }

  const [first, second] = await Promise.all([
    runAttributeRequest({ username: 'tester', timeControl: 'all' }, dependencies),
    runAttributeRequest({ username: 'TESTER', timeControl: 'all' }, dependencies),
  ])

  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal(fetchCount, 2)
})
