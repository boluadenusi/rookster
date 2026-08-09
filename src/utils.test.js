import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCardStats, clamp, getShootingAttribute, ratingToOvr } from './utils.js'
import { CARD_TIER_RANGES, getCardTier } from './utils/cardTier.js'

test('the OVR curve separates verified elite reference ratings without reaching 95', () => {
  assert.equal(ratingToOvr(2453), 90)
  assert.equal(ratingToOvr(2839), 93)
  assert.equal(ratingToOvr(2912), 94)
  assert.equal(ratingToOvr(2900), 94)
  assert.equal(ratingToOvr(2995), 94)
})

test('the OVR curve joins at 1500 and reaches its ceiling only at 3100', () => {
  assert.equal(ratingToOvr(100), 45)
  assert.equal(ratingToOvr(346), 50)
  assert.equal(ratingToOvr(400), 51)
  assert.equal(ratingToOvr(950), 63)
  assert.equal(ratingToOvr(1500), 75)
  assert.equal(ratingToOvr(3100), 95)
  assert.equal(ratingToOvr(3300), 95)
})

test('the shared card clamp uses the 40-95 range', () => {
  assert.equal(clamp(39), 40)
  assert.equal(clamp(96), 95)
})

test('the special tier is explicitly bounded at 85-95', () => {
  assert.deepEqual(CARD_TIER_RANGES.special, { min: 85, max: 95 })
  assert.equal(getCardTier(84), 'gold')
  assert.equal(getCardTier(85), 'special')
  assert.equal(getCardTier(95), 'special')
})

test('PHY follows the slower logarithmic career curve', () => {
  const control = { id: 'rapid', key: 'chess_rapid', label: 'Rapid' }
  const phyAt = (games) => buildCardStats({
    chess_rapid: { last: { rating: 1500 }, record: { win: games } },
  }, control).attributes.find((attribute) => attribute.label === 'PHY').value

  assert.equal(phyAt(20), 62)
  assert.equal(phyAt(100), 73)
  assert.equal(phyAt(200), 78)
  assert.equal(phyAt(500), 85)
  assert.equal(phyAt(1000), 90)
  assert.equal(phyAt(2000), 95)
})

test('SHO uses the shared decelerating rating curve instead of saturating early', () => {
  const control = { id: 'rapid', key: 'chess_rapid', label: 'Rapid' }
  const shootingAt = (rating) => buildCardStats({
    chess_rapid: { last: { rating: 1500 }, record: { win: 100 } },
    tactics: { highest: { rating } },
  }, control).attributes.find((attribute) => attribute.label === 'SHO').value

  assert.equal(shootingAt(1305), 71)
  assert.equal(shootingAt(1575), 79)
  assert.equal(shootingAt(2000), 86)
  assert.equal(shootingAt(3100), 95)
})

test('SHO discounts tactics evidence that is implausibly far below the playing rating', () => {
  const safeguarded = getShootingAttribute(2912, 400)

  assert.equal(safeguarded.source, 'tactics-rating-blend')
  assert.equal(safeguarded.confidence, 0.15)
  assert.equal(safeguarded.value, 88)
})

test('SHO keeps credible tactics evidence intact', () => {
  const credible = getShootingAttribute(1500, 1575)

  assert.equal(credible.source, 'tactics-peak')
  assert.equal(credible.confidence, 1)
  assert.equal(credible.value, 79)
})
