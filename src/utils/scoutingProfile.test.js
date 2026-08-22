import assert from 'node:assert/strict'
import test from 'node:test'
import { getScoutingProfile, selectScoutingTraits } from './scoutingProfile.js'

const control = { id: 'rapid', key: 'chess_rapid', label: 'Rapid' }
const stats = {
  chess_rapid: {
    last: { rating: 1500 },
    best: { rating: 1550 },
    record: { win: 20, loss: 10, draw: 5 },
  },
}
const attributeStats = { PAC: 70, PAS: 76, DRI: 73, DEF: 68 }

function attributes(values, evidence = {}) {
  return ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'].map((label) => ({
    label,
    value: values[label] ?? 70,
    evidence: evidence[label],
  }))
}

test('adds opening style to verdict copy without changing card attributes', () => {
  const plain = getScoutingProfile(stats, control, 'CAM', attributeStats)
  const flavored = getScoutingProfile(stats, control, 'CAM', attributeStats, {
    key: 'aggressive',
    description: 'Recent opening choices suggest an aggressive, attacking-minded approach.',
  })

  assert.deepEqual(flavored.card, plain.card)
  assert.match(flavored.verdict, /aggressive, attacking-minded approach/)
  assert.doesNotMatch(plain.verdict, /opening choices/)
})

test('bases report confidence on the rolling scouting sample', () => {
  const limited = getScoutingProfile(stats, control, 'CAM', {
    ...attributeStats,
    sampleGames: 10,
    sampleMonths: 24,
    extendedSample: true,
  })
  const strong = getScoutingProfile(stats, control, 'CAM', {
    ...attributeStats,
    sampleGames: 100,
    sampleMonths: 12,
    extendedSample: false,
  })

  assert.equal(limited.confidence.label, 'Limited sample')
  assert.match(limited.confidence.detail, /10 rated games across 24 months/)
  assert.equal(strong.confidence.label, 'High confidence')
  assert.match(strong.confidence.detail, /100 rated games in the 12-month sample/)
})

test('uses 75 and 64 as inclusive trait boundaries while leaving 65-74 neutral', () => {
  const profile = selectScoutingTraits(attributes({
    PAC: 75,
    SHO: 74,
    PAS: 65,
    DRI: 64,
    DEF: 70,
    PHY: 70,
  }))

  assert.deepEqual(profile.strengths.map((trait) => trait.label), ['PAC'])
  assert.deepEqual(profile.development.map((trait) => trait.label), ['DRI'])
})

test('moves trait boundaries with OVR while retaining an elite strength ceiling', () => {
  const standard = selectScoutingTraits(attributes({
    PAC: 80,
    SHO: 79,
    PAS: 70,
    DRI: 69,
  }), 75)
  const elite = selectScoutingTraits(attributes({
    PAC: 94,
    SHO: 93,
    PAS: 89,
    DRI: 88,
    DEF: 89,
    PHY: 89,
  }), 94)

  assert.deepEqual(standard.strengths.map((trait) => trait.label), ['PAC'])
  assert.deepEqual(standard.development.map((trait) => trait.label), ['DRI'])
  assert.deepEqual(elite.strengths.map((trait) => trait.label), ['PAC'])
  assert.deepEqual(elite.development.map((trait) => trait.label), ['DRI'])
})

test('returns no trait entries when all attributes sit in the neutral band', () => {
  const profile = selectScoutingTraits(attributes({
    PAC: 70,
    SHO: 70,
    PAS: 70,
    DRI: 70,
    DEF: 70,
    PHY: 70,
  }))

  assert.deepEqual(profile.strengths, [])
  assert.deepEqual(profile.development, [])
})

test('uses normalized evidence confidence to resolve exact score ties at the cutoff', () => {
  const profile = selectScoutingTraits(attributes({
    PAC: 80,
    SHO: 80,
    PAS: 80,
    DRI: 80,
  }, {
    PAC: { source: 'clock', sampleSize: 5 },
    SHO: { source: 'tactics-peak', rating: 1800, sampleSize: 1 },
    PAS: { source: 'performance', sampleSize: 20 },
    DRI: { source: 'openings', sampleSize: 15 },
  }))

  assert.deepEqual(profile.strengths.map((trait) => trait.label), ['PAS', 'SHO'])
})

test('uses the same evidence-first tie policy for development areas', () => {
  const profile = selectScoutingTraits(attributes({
    PAS: 60,
    DRI: 60,
    DEF: 60,
  }, {
    PAS: { source: 'performance', sampleSize: 5 },
    DRI: { source: 'openings', sampleSize: 20 },
    DEF: { source: 'blended-results', sampleSize: 25, totalGames: 100 },
  }))

  assert.deepEqual(profile.development.map((trait) => trait.label), ['DRI', 'DEF'])
})

test('uses fixed attribute priority only after both value and evidence tie', () => {
  const profile = selectScoutingTraits(attributes({ PAC: 80, SHO: 80, PAS: 80 }))
  assert.deepEqual(profile.strengths.map((trait) => trait.label), ['PAC', 'SHO'])
})

test('avoids standout wording when qualifying strengths do not separate from the pack', () => {
  const profile = getScoutingProfile(stats, control, 'CAM', {
    PAC: 95,
    PAS: 95,
    DRI: 95,
    DEF: 95,
  })

  assert.match(profile.verdict, /lead the attribute board/)
  assert.doesNotMatch(profile.verdict, /standout tools/)
})
