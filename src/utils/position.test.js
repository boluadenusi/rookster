import assert from 'node:assert/strict'
import test from 'node:test'
import { resolvePosition, selectPositionZone } from './position.js'

function attributes(values) {
  return ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY']
    .map((label) => ({ label, value: values[label] ?? 40 }))
}

test('resolves both positions inside the defensive zone', () => {
  assert.equal(resolvePosition(attributes({ DEF: 90, PAS: 75, PHY: 65 })), 'DM')
  assert.equal(resolvePosition(attributes({ DEF: 90, PAS: 65, PHY: 75 })), 'CB')
  assert.equal(resolvePosition(attributes({ DEF: 90, PAS: 70, PHY: 70 })), 'CB')
})

test('resolves both positions inside the central zone', () => {
  assert.equal(resolvePosition(attributes({ PAS: 90, DRI: 80, PHY: 70 })), 'CAM')
  assert.equal(resolvePosition(attributes({ PAS: 90, DRI: 70, PHY: 80 })), 'CM')
  assert.equal(resolvePosition(attributes({ PAS: 90, DRI: 75, PHY: 75 })), 'CM')
})

test('resolves both positions inside the attacking zone', () => {
  assert.equal(resolvePosition(attributes({ SHO: 90, PAC: 80, DRI: 70 })), 'CF')
  assert.equal(resolvePosition(attributes({ SHO: 90, PAC: 70, DRI: 80 })), 'SS')
  assert.equal(resolvePosition(attributes({ SHO: 90, PAC: 75, DRI: 75 })), 'SS')
})

test('uses paired totals when the top two zone attributes are within five points', () => {
  const profile = attributes({ SHO: 90, PAC: 40, PAS: 87, DRI: 90, DEF: 70, PHY: 60 })
  assert.equal(selectPositionZone(profile), 'central')
  assert.equal(resolvePosition(profile), 'CAM')
})

test('includes all three zone attributes when each is within five points of the leader', () => {
  const profile = attributes({ SHO: 90, PAC: 40, PAS: 89, DRI: 40, DEF: 88, PHY: 95 })
  assert.equal(selectPositionZone(profile), 'defensive')
  assert.equal(resolvePosition(profile), 'CB')
})

test('keeps the raw leader when it also has the strongest pair in a three-way contest', () => {
  const profile = attributes({ SHO: 90, PAC: 95, PAS: 89, DRI: 40, DEF: 88, PHY: 40 })
  assert.equal(selectPositionZone(profile), 'attacking')
})

test('excludes a zone attribute more than five points behind the leader', () => {
  const profile = attributes({ SHO: 90, PAC: 40, PAS: 84, DRI: 95, DEF: 70, PHY: 95 })
  assert.equal(selectPositionZone(profile), 'attacking')
})

test('falls back to the raw zone attributes when paired totals tie', () => {
  const profile = attributes({ SHO: 90, PAC: 80, PAS: 88, DRI: 82, DEF: 60, PHY: 60 })
  assert.equal(selectPositionZone(profile), 'attacking')
  assert.equal(resolvePosition(profile), 'SS')
})

test('uses raw values to resolve a three-way paired-total tie', () => {
  const profile = attributes({ SHO: 90, PAC: 80, PAS: 89, DRI: 81, DEF: 88, PHY: 82 })
  assert.equal(selectPositionZone(profile), 'attacking')
})

test('resolves an exact raw and paired tie deterministically in the declared SHO/PAS/DEF order', () => {
  const profile = attributes({ SHO: 90, PAC: 80, PAS: 90, DRI: 80, DEF: 90, PHY: 80 })
  assert.equal(selectPositionZone(profile), 'attacking')
})

test('does not let a capped PHY make DM or CAM structurally impossible', () => {
  assert.equal(resolvePosition(attributes({
    DEF: 90,
    PAS: 85,
    DRI: 95,
    PHY: 95,
    PAC: 40,
  })), 'DM')
  assert.equal(resolvePosition(attributes({
    PAS: 90,
    DRI: 95,
    SHO: 85,
    DEF: 70,
    PHY: 95,
    PAC: 40,
  })), 'CAM')
})
