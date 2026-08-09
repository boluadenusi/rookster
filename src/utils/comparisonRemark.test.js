import assert from 'node:assert/strict'
import test from 'node:test'
import { getComparisonDecision } from './comparisonRemark.js'

function attributes(values) {
  return ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'].map((label, index) => ({
    label,
    value: values[index],
  }))
}

function decision(overrides = {}) {
  return getComparisonDecision({
    primaryName: 'Alpha',
    opponentName: 'Bravo',
    primaryRating: 1800,
    opponentRating: 1750,
    primaryOvr: 82,
    opponentOvr: 81,
    primaryAttributes: attributes([80, 80, 80, 80, 80, 80]),
    opponentAttributes: attributes([75, 75, 75, 75, 75, 75]),
    ...overrides,
  })
}

test('self-comparisons always finish without a winner', () => {
  const result = decision({ opponentName: 'ALPHA' })
  assert.equal(result.isSelf, true)
  assert.equal(result.winner, 'draw')
  assert.equal(result.tone, 'self')
  assert.equal(result.remark, 'No winner — what did you think was going to happen?')
})

test('recognises when the higher-rated favourite wins decisively', () => {
  const result = decision()
  assert.equal(result.winner, 'primary')
  assert.equal(result.tone, 'expected')
  assert.match(result.remark, /higher rating and backed it up across the board/)
})

test('gives a respectful upset remark when the lower-rated player edges the duel', () => {
  const result = decision({
    primaryRating: 2000,
    opponentRating: 1800,
    primaryAttributes: attributes([80, 80, 80, 80, 80, 80]),
    opponentAttributes: attributes([81, 80, 80, 80, 80, 80]),
  })
  assert.equal(result.winner, 'opponent')
  assert.equal(result.tone, 'upset')
  assert.match(result.remark, /shades the higher-rated player/)
})

test('returns a draw when attributes and OVR cannot separate different players', () => {
  const result = decision({
    primaryRating: 1800,
    opponentRating: 1800,
    primaryOvr: 82,
    opponentOvr: 82,
    opponentAttributes: attributes([80, 80, 80, 80, 80, 80]),
  })
  assert.equal(result.winner, 'draw')
  assert.equal(result.tone, 'draw')
  assert.match(result.remark, /No winner on the numbers/)
})

test('uses a close-call remark when similarly rated players have a one-stat edge', () => {
  const result = decision({
    primaryRating: 1800,
    opponentRating: 1790,
    primaryAttributes: attributes([81, 80, 80, 80, 80, 80]),
    opponentAttributes: attributes([80, 80, 80, 80, 80, 80]),
  })
  assert.equal(result.winner, 'primary')
  assert.equal(result.tone, 'close')
  assert.match(result.remark, /smallest of edges/)
})
