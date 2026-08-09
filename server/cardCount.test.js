import assert from 'node:assert/strict'
import test from 'node:test'
import { getGeneratedCardCount, recordGeneratedCards } from './cardCount.js'
import { createInMemoryRateLimiter } from './http.js'
import { runCardCountRequest } from './cardCountHttp.js'

function memoryCounterStorage() {
  let count = 0
  const events = new Set()
  return {
    async get() { return count },
    async incrementOnce(counterKey, eventKey, amount) {
      if (events.has(eventKey)) return { count, incremented: false }
      events.add(eventKey)
      count += amount
      return { count, incremented: true }
    },
  }
}

test('counts each generation event once while allowing later generations', async () => {
  const storage = memoryCounterStorage()
  const firstId = '01912f5a-76d4-7a89-9123-123456789abc'
  const secondId = '01912f5a-76d4-7a89-9123-abcdef123456'

  assert.deepEqual(
    await recordGeneratedCards({ eventId: firstId, cardCount: 1, storage }),
    { count: 1, incremented: true },
  )
  assert.deepEqual(
    await recordGeneratedCards({ eventId: firstId, cardCount: 1, storage }),
    { count: 1, incremented: false },
  )
  assert.deepEqual(
    await recordGeneratedCards({ eventId: secondId, cardCount: 2, storage }),
    { count: 3, incremented: true },
  )
  assert.equal(await getGeneratedCardCount({ storage }), 3)
})

test('rejects malformed events and card amounts', async () => {
  const storage = memoryCounterStorage()
  await assert.rejects(
    recordGeneratedCards({ eventId: 'not valid', cardCount: 1, storage }),
    (error) => error.status === 400,
  )
  await assert.rejects(
    recordGeneratedCards({ eventId: '01912f5a-76d4-7a89-9123-123456789abc', cardCount: 3, storage }),
    (error) => error.status === 400,
  )
})

test('serves the tally and rate-limits repeated writes', async () => {
  const storage = memoryCounterStorage()
  const limiter = createInMemoryRateLimiter({ limit: 1, windowMs: 60_000 })
  const dependencies = { storage, rateLimiter: limiter }
  const event = {
    eventId: '01912f5a-76d4-7a89-9123-123456789abc',
    cardCount: 1,
  }

  const first = await runCardCountRequest(
    { method: 'POST', ip: '203.0.113.12', body: event },
    dependencies,
  )
  const second = await runCardCountRequest(
    { method: 'POST', ip: '203.0.113.12', body: event },
    dependencies,
  )
  const read = await runCardCountRequest({ method: 'GET' }, dependencies)

  assert.equal(first.status, 200)
  assert.equal(second.status, 429)
  assert.deepEqual(read.body, { count: 1 })
})
