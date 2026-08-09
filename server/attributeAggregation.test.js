import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aggregateGames,
  getFinalClockSeconds,
  mergeTotals,
  totalsToAttributes,
} from './attributeAggregation.js'

function game({
  color = 'white',
  result = 'win',
  playerRating = 1500,
  opponentRating = 1575,
  opening = 'Sicilian Defense',
  finalWhite = '0:02:00',
  finalBlack = '0:01:00',
  endTime = 0,
} = {}) {
  const player = { username: 'Tester', rating: playerRating, result }
  const opponent = {
    username: 'Opponent',
    rating: opponentRating,
    result: result === 'win' ? 'resigned' : result === 'loss' ? 'win' : 'agreed',
  }

  return {
    end_time: endTime,
    time_class: 'rapid',
    white: color === 'white' ? player : opponent,
    black: color === 'black' ? player : opponent,
    pgn: `[TimeControl "300+5"]\n[Opening "${opening}"]\n\n1. e4 {[%clk ${finalWhite}]} e5 {[%clk ${finalBlack}]} 2. Nf3 {[%clk ${finalWhite}]} Nc6 {[%clk ${finalBlack}]} 1-0`,
  }
}

test('extracts the final clock for each side from PGN clock comments', () => {
  const pgn = game().pgn
  assert.equal(getFinalClockSeconds(pgn, 'white'), 120)
  assert.equal(getFinalClockSeconds(pgn, 'black'), 60)
})

test('aggregates selected-window inputs and maps the four cached attributes', () => {
  const first = aggregateGames([
    game(),
    game({ color: 'black', opponentRating: 1650, opening: 'French Defense', finalBlack: '0:04:00' }),
  ], 'tester', 'rapid')
  const second = aggregateGames([
    game({ result: 'draw', opening: 'Caro-Kann Defense' }),
  ], 'tester', 'rapid')
  const totals = mergeTotals(first, second)
  const stats = {
    chess_rapid: { last: { rating: 1500 }, record: { win: 2, draw: 1, loss: 0 } },
    chess_bullet: { last: { rating: 1700 } },
  }

  assert.equal(totals.totalGames, 3)
  assert.equal(totals.performanceGameCount, 3)
  assert.deepEqual(new Set(totals.recentOpenings), new Set([
    'sicilian defense',
    'french defense',
    'caro-kann defense',
  ]))
  assert.deepEqual(totalsToAttributes(totals, stats, 'rapid'), {
    PAC: 71,
    PAS: 94,
    DRI: 95,
    DEF: 95,
    evidence: {
      PAC: { source: 'clock', sampleSize: 3 },
      PAS: { source: 'performance', sampleSize: 3 },
      DRI: { source: 'openings', sampleSize: 3 },
      DEF: { source: 'blended-results', sampleSize: 3, totalGames: 3 },
    },
  })
})

test('uses rating, win-rate, and non-loss fallbacks when samples are too small', () => {
  const totals = aggregateGames([
    game({ result: 'loss', opponentRating: 1400, finalWhite: '' }),
  ], 'tester', 'rapid')
  const stats = {
    chess_rapid: { last: { rating: 1500 }, record: { win: 0, draw: 0, loss: 1 } },
    chess_bullet: { last: { rating: 1900 } },
  }

  assert.deepEqual(totalsToAttributes(totals, stats, 'rapid'), {
    PAC: 85,
    PAS: 40,
    DRI: 95,
    DEF: 40,
    evidence: {
      PAC: { source: 'rating-fallback', sampleSize: 0 },
      PAS: { source: 'win-rate-fallback', sampleSize: 1 },
      DRI: { source: 'openings', sampleSize: 1 },
      DEF: { source: 'overall-record', sampleSize: 0, totalGames: 1 },
    },
  })
})

test('maps Elo underperformance below the neutral PAS score', () => {
  const totals = {
    ...aggregateGames([], 'tester', 'rapid'),
    performanceGameCount: 10,
    sumPerformanceDelta: -2,
  }
  const stats = {
    chess_rapid: { last: { rating: 1500 }, record: { win: 2, draw: 0, loss: 0 } },
  }

  assert.equal(totalsToAttributes(totals, stats, 'rapid').PAS, 62)
})

test('centres PAS at expected Elo performance and rewards sustained overperformance', () => {
  const stats = {
    chess_rapid: { last: { rating: 1500 }, record: { win: 2, draw: 0, loss: 0 } },
  }
  const neutral = { ...aggregateGames([], 'tester', 'rapid'), performanceGameCount: 10 }
  const strong = { ...neutral, sumPerformanceDelta: 2 }
  const extreme = { ...neutral, sumPerformanceDelta: 10 }

  assert.equal(totalsToAttributes(neutral, stats, 'rapid').PAS, 75)
  assert.equal(totalsToAttributes(strong, stats, 'rapid').PAS, 88)
  assert.equal(totalsToAttributes(extreme, stats, 'rapid').PAS, 95)
})

test('preserves separation between materially different performance deltas', () => {
  const stats = {
    chess_rapid: { last: { rating: 1500 }, record: { win: 2, draw: 0, loss: 0 } },
  }
  const totalsForDelta = (averageDelta) => ({
    performanceGameCount: 10,
    sumPerformanceDelta: averageDelta * 10,
    underdogGameCount: 0,
    underdogNonLossCount: 0,
    totalNonLossCount: 0,
    recentOpenings: [],
    totalGames: 10,
    clockGameCount: 0,
    sumTimeUsedFraction: 0,
  })

  assert.equal(totalsToAttributes(totalsForDelta(-0.3608), stats, 'rapid').PAS, 57)
  assert.equal(totalsToAttributes(totalsForDelta(-0.2934), stats, 'rapid').PAS, 58)
})

test('blends small underdog samples with the full non-loss record', () => {
  const stats = { chess_rapid: { last: { rating: 1500 }, record: { win: 50, draw: 30, loss: 20 } } }
  const totals = {
    ...aggregateGames([], 'tester', 'rapid'),
    totalGames: 100,
    totalNonLossCount: 80,
    underdogGameCount: 5,
    underdogNonLossCount: 5,
  }

  assert.equal(totalsToAttributes(totals, stats, 'rapid').DEF, 90)
  assert.equal(totalsToAttributes({
    ...totals,
    underdogGameCount: 25,
    underdogNonLossCount: 25,
  }, stats, 'rapid').DEF, 95)
})

test('computes opening variety from only the latest 100 selected-format games', () => {
  const games = Array.from({ length: 120 }, (_, index) => game({
    endTime: index + 1,
    opening: index < 20 ? `Historic Opening ${index}` : 'Sicilian Defense',
  }))
  const totals = aggregateGames(games, 'tester', 'rapid')
  const stats = { chess_rapid: { last: { rating: 1500 }, record: { win: 120 } } }

  assert.equal(totals.recentOpenings.length, 100)
  assert.deepEqual(new Set(totals.recentOpenings), new Set(['sicilian defense']))
  assert.equal(totalsToAttributes(totals, stats, 'rapid').DRI, 41)
})
