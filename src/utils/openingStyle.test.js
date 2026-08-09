import assert from 'node:assert/strict'
import test from 'node:test'
import { getOpeningStyle } from './openingStyle.js'

function opening(name) {
  return { pgn: `[Opening "${name}"]` }
}

test('classifies opening evidence as aggressive verdict flavor', () => {
  const style = getOpeningStyle([
    opening('Sicilian Defense'),
    opening("King's Gambit"),
    opening('Najdorf Variation'),
    opening('French Defense'),
  ])
  assert.equal(style.key, 'aggressive')
  assert.equal(style.aggressionScore, 0.75)
})

test('classifies opening evidence as balanced verdict flavor at both boundaries', () => {
  const lowerBoundary = getOpeningStyle([
    opening('Sicilian Defense'),
    opening('Dragon Variation'),
    opening('French Defense'),
    opening('Slav Defense'),
    opening('Catalan Opening'),
  ])
  const upperBoundary = getOpeningStyle([
    opening('Sicilian Defense'),
    opening('Dragon Variation'),
    opening('Najdorf Variation'),
    opening('French Defense'),
    opening('Slav Defense'),
  ])
  assert.equal(lowerBoundary.aggressionScore, 0.4)
  assert.equal(lowerBoundary.key, 'balanced')
  assert.equal(upperBoundary.aggressionScore, 0.6)
  assert.equal(upperBoundary.key, 'balanced')
})

test('classifies positional evidence and has no position fallback for absent evidence', () => {
  assert.equal(getOpeningStyle([
    opening('French Defense'),
    opening('Caro-Kann Defense'),
    opening('Sicilian Defense'),
  ]).key, 'positional')

  assert.deepEqual(getOpeningStyle([]), {
    classified: 0,
    aggressionScore: null,
    key: null,
    description: null,
  })
})
