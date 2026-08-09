import assert from 'node:assert/strict'
import test from 'node:test'

import { getCareerFloor, getExperienceStage, getPlayerStatus } from './playerStatus.js'

test('keeps format-specific appearance thresholds intact', () => {
  assert.equal(getExperienceStage('rapid', 100), 'prospect')
  assert.equal(getExperienceStage('rapid', 101), 'breakout')
  assert.equal(getExperienceStage('rapid', 2000), 'established')
  assert.equal(getExperienceStage('blitz', 2000), 'firstTeam')
  assert.equal(getExperienceStage('bullet', 2000), 'emerging')
  assert.equal(getExperienceStage('rapid', 2999), 'established')
  assert.equal(getExperienceStage('rapid', 3000), 'veteran')
  assert.equal(getExperienceStage('rapid', 5000), 'eliteVeteran')
  assert.equal(getExperienceStage('blitz', 8000), 'veteran')
  assert.equal(getExperienceStage('blitz', 12000), 'eliteVeteran')
  assert.equal(getExperienceStage('bullet', 15000), 'veteran')
  assert.equal(getExperienceStage('bullet', 25000), 'eliteVeteran')
})

test('uses overall career volume to prevent junior classifications', () => {
  assert.equal(getCareerFloor(1999), 'prospect')
  assert.equal(getCareerFloor(2000), 'breakout')
  assert.equal(getCareerFloor(5000), 'established')
  assert.equal(getCareerFloor(9999), 'established')
  assert.equal(getCareerFloor(10000), 'veteran')

  assert.equal(getPlayerStatus(900, 10, 'rapid', 2000).label, 'Hot Prospect')
  assert.equal(getPlayerStatus(900, 10, 'rapid', 5000).label, 'Established Player')
  assert.equal(getPlayerStatus(900, 10, 'rapid', 10000).label, 'Veteran')
})

test('reserves the highest ability and legacy labels for credible samples', () => {
  assert.equal(getPlayerStatus(2750, 25, 'rapid', 25).label, 'Elite Player')
  assert.equal(getPlayerStatus(2750, 101, 'rapid', 101).label, 'World Class')
  assert.equal(getPlayerStatus(2750, 1000, 'rapid', 1000).label, 'Generational Talent')
  assert.equal(getPlayerStatus(2750, 4999, 'rapid', 4999).label, 'Legend')
  assert.equal(getPlayerStatus(2750, 5000, 'rapid', 5000).label, 'Icon')
})

test('avoids backwards wording as a rapid sample grows', () => {
  const expected = [
    [0, 'Academy Prospect'],
    [101, 'Hot Prospect'],
    [201, 'One to Watch'],
    [500, 'Emerging Talent'],
    [1000, 'Breakout Talent'],
    [2000, 'Established Player'],
    [3000, 'Veteran'],
  ]

  for (const [games, label] of expected) {
    assert.equal(getPlayerStatus(900, games, 'rapid', games).label, label)
  }
})
