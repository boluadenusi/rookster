import assert from 'node:assert/strict'
import test from 'node:test'
import { getFeaturedPlayerSnapshot } from './featuredPlayers.js'

function snapshotAt(date, marker = 'cached') {
  return {
    version: 1,
    generatedAt: date.toISOString(),
    refreshAfter: new Date(date.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    players: [{ profile: { username: marker } }],
  }
}

function memoryStorage(initial = null) {
  let value = initial
  const writes = []
  return {
    writes,
    async get() { return structuredClone(value) },
    async set(key, nextValue, options) {
      value = structuredClone(nextValue)
      writes.push({ key, value: structuredClone(nextValue), options })
    },
  }
}

test('serves a featured snapshot without rebuilding it during its first 24 hours', async () => {
  const now = new Date('2026-08-09T12:00:00Z')
  const storage = memoryStorage(snapshotAt(new Date('2026-08-09T00:00:00Z')))
  let builds = 0

  const result = await getFeaturedPlayerSnapshot({
    storage,
    now,
    inFlight: new Map(),
    buildSnapshot: async () => {
      builds += 1
      return snapshotAt(now, 'rebuilt')
    },
  })

  assert.equal(result.players[0].profile.username, 'cached')
  assert.equal(builds, 0)
  assert.equal(storage.writes.length, 0)
})

test('refreshes an expired daily snapshot and retains it for stale fallback', async () => {
  const now = new Date('2026-08-09T12:00:00Z')
  const storage = memoryStorage(snapshotAt(new Date('2026-08-08T10:00:00Z')))

  const result = await getFeaturedPlayerSnapshot({
    storage,
    now,
    inFlight: new Map(),
    buildSnapshot: async () => snapshotAt(now, 'fresh'),
  })

  assert.equal(result.players[0].profile.username, 'fresh')
  assert.equal(storage.writes.length, 1)
  assert.equal(storage.writes[0].options.expirationSeconds, 48 * 60 * 60)
})

test('falls back to yesterday\'s snapshot when the daily refresh fails', async () => {
  const now = new Date('2026-08-09T12:00:00Z')
  const cached = snapshotAt(new Date('2026-08-08T10:00:00Z'))
  const result = await getFeaturedPlayerSnapshot({
    storage: memoryStorage(cached),
    now,
    inFlight: new Map(),
    buildSnapshot: async () => { throw new Error('Chess.com unavailable') },
  })

  assert.equal(result.players[0].profile.username, 'cached')
  assert.equal(result.stale, true)
})

test('coalesces simultaneous daily snapshot rebuilds', async () => {
  const now = new Date('2026-08-09T12:00:00Z')
  const storage = memoryStorage()
  const inFlight = new Map()
  let builds = 0
  const buildSnapshot = async () => {
    builds += 1
    await new Promise((resolve) => setTimeout(resolve, 10))
    return snapshotAt(now, 'fresh')
  }

  const [first, second] = await Promise.all([
    getFeaturedPlayerSnapshot({ storage, now, inFlight, buildSnapshot }),
    getFeaturedPlayerSnapshot({ storage, now, inFlight, buildSnapshot }),
  ])

  assert.equal(first.players[0].profile.username, 'fresh')
  assert.deepEqual(first, second)
  assert.equal(builds, 1)
  assert.equal(storage.writes.length, 1)
})
