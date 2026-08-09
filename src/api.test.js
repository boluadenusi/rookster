import assert from 'node:assert/strict'
import test from 'node:test'
import { getChessHeadToHead } from './api.js'

test('does not classify a player\'s own games as head-to-head meetings', async () => {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const archiveUrl = `https://api.chess.com/pub/player/tester/games/${year}/${month}`
  const player = {
    profile: { username: 'Tester' },
    archiveUrls: [archiveUrl],
    archiveCache: {
      [archiveUrl]: [{
        url: 'https://www.chess.com/game/live/1',
        white: { username: 'Tester', result: 'win' },
        black: { username: 'SomeoneElse', result: 'resigned' },
      }],
    },
  }

  assert.deepEqual(await getChessHeadToHead(player, 'tester'), [])
})
