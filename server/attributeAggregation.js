import { getOpeningName } from '../src/utils/openingStyle.js'

const ATTRIBUTE_MIN = 40
const ATTRIBUTE_MAX = 95

function clamp(value, min = ATTRIBUTE_MIN, max = ATTRIBUTE_MAX) {
  return Math.min(max, Math.max(min, value))
}

function percentageToAttribute(percentage) {
  return clamp(Math.round(40 + clamp(percentage, 0, 100) * 0.6))
}

function performanceDeltaToPas(performanceDelta) {
  return clamp(Math.round(75 + 20 * Math.tanh(performanceDelta / 0.25)))
}

export function createEmptyTotals() {
  return {
    performanceGameCount: 0,
    sumPerformanceDelta: 0,
    underdogGameCount: 0,
    underdogNonLossCount: 0,
    totalNonLossCount: 0,
    recentOpenings: [],
    totalGames: 0,
    clockGameCount: 0,
    sumTimeUsedFraction: 0,
  }
}

function getHeader(pgn, name) {
  return pgn?.match(new RegExp(`\\[${name}\\s+"([^"]+)"\\]`, 'i'))?.[1] ?? ''
}

function parseBaseSeconds(pgn) {
  const timeControl = getHeader(pgn, 'TimeControl')
  const base = Number(timeControl.split('+', 1)[0])
  return Number.isFinite(base) && base > 0 ? base : null
}

function parseClockSeconds(value) {
  const parts = value.trim().split(':').map(Number)
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return null

  return parts.reduce((seconds, part) => seconds * 60 + part, 0)
}

function stripVariations(movetext) {
  let depth = 0
  let result = ''

  for (const character of movetext) {
    if (character === '(') depth += 1
    else if (character === ')' && depth > 0) depth -= 1
    else if (depth === 0) result += character
  }

  return result
}

export function getFinalClockSeconds(pgn, playerColor) {
  const movetext = stripVariations((pgn ?? '').replace(/^\s*\[[^\]]*\]\s*$/gm, ' '))
  const tokens = movetext.match(/\d+\.(?:\.\.)?|\{[^}]*\}|\$\d+|\S+/g) ?? []
  const finalClocks = { white: null, black: null }
  let sideToMove = 'white'
  let lastMoveSide = null

  for (const token of tokens) {
    if (/^\d+\.\.\.$/.test(token)) {
      sideToMove = 'black'
      lastMoveSide = null
      continue
    }

    if (/^\d+\.$/.test(token)) {
      sideToMove = 'white'
      lastMoveSide = null
      continue
    }

    if (token.startsWith('{')) {
      const clock = token.match(/\[%clk\s+([^\]]+)\]/i)?.[1]
      if (clock && lastMoveSide) {
        const seconds = parseClockSeconds(clock)
        if (Number.isFinite(seconds)) finalClocks[lastMoveSide] = seconds
      }
      continue
    }

    if (token.startsWith('$') || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)) continue

    lastMoveSide = sideToMove
    sideToMove = sideToMove === 'white' ? 'black' : 'white'
  }

  return finalClocks[playerColor]
}

function classifyGame(game, username) {
  const normalizedUsername = username.toLowerCase()
  const isWhite = game.white?.username?.toLowerCase() === normalizedUsername
  const player = isWhite ? game.white : game.black
  const opponent = isWhite ? game.black : game.white

  let result = 'draw'
  if (player?.result === 'win') result = 'win'
  else if (opponent?.result === 'win') result = 'loss'

  return { player, opponent, result, playerColor: isWhite ? 'white' : 'black' }
}

export function aggregateGames(games, username, timeControl) {
  const totals = createEmptyTotals()
  const chronologicalGames = [...(games ?? [])]
    .sort((left, right) => (left.end_time ?? 0) - (right.end_time ?? 0))

  for (const game of chronologicalGames) {
    if (game.time_class?.toLowerCase() !== timeControl) continue

    const { player, opponent, result, playerColor } = classifyGame(game, username)
    if (!player || !opponent) continue

    totals.totalGames += 1
    if (result !== 'loss') totals.totalNonLossCount += 1

    if (Number.isFinite(player.rating) && Number.isFinite(opponent.rating)) {
      const expectedScore = 1 / (1 + 10 ** ((opponent.rating - player.rating) / 400))
      const actualScore = result === 'win' ? 1 : result === 'loss' ? 0 : 0.5
      totals.performanceGameCount += 1
      totals.sumPerformanceDelta += actualScore - expectedScore
    }

    if (Number.isFinite(player.rating) && Number.isFinite(opponent.rating) && opponent.rating > player.rating) {
      totals.underdogGameCount += 1
      if (result !== 'loss') totals.underdogNonLossCount += 1
    }

    const openingName = getOpeningName(game)
    totals.recentOpenings.push(
      openingName && openingName !== 'Opening unavailable' ? openingName.toLowerCase() : null,
    )
    if (totals.recentOpenings.length > 100) totals.recentOpenings.shift()

    const baseSeconds = parseBaseSeconds(game.pgn)
    const finalClockSeconds = baseSeconds && getFinalClockSeconds(game.pgn, playerColor)
    if (baseSeconds && Number.isFinite(finalClockSeconds)) {
      const timeUsedFraction = clamp(1 - finalClockSeconds / baseSeconds, 0, 1)
      totals.clockGameCount += 1
      totals.sumTimeUsedFraction += timeUsedFraction
    }
  }

  return totals
}

export function mergeTotals(...values) {
  const merged = createEmptyTotals()

  for (const totals of values) {
    if (!totals) continue
    merged.performanceGameCount += Number(totals.performanceGameCount) || 0
    merged.sumPerformanceDelta += Number(totals.sumPerformanceDelta) || 0
    merged.underdogGameCount += Number(totals.underdogGameCount) || 0
    merged.underdogNonLossCount += Number(totals.underdogNonLossCount) || 0
    merged.totalNonLossCount += Number(totals.totalNonLossCount) || 0
    merged.totalGames += Number(totals.totalGames) || 0
    merged.clockGameCount += Number(totals.clockGameCount) || 0
    merged.sumTimeUsedFraction += Number(totals.sumTimeUsedFraction) || 0
    merged.recentOpenings.push(...(totals.recentOpenings ?? []))
    if (merged.recentOpenings.length > 100) merged.recentOpenings = merged.recentOpenings.slice(-100)
  }

  return merged
}

function ratingToLegacyAttribute(rating) {
  return clamp(Math.round(75 + (rating - 1500) / 40))
}

export function totalsToAttributes(totals, stats, timeControl) {
  const selectedRecord = stats?.[`chess_${timeControl}`]?.record ?? {}
  const recordTotal = (selectedRecord.win ?? 0) + (selectedRecord.loss ?? 0) + (selectedRecord.draw ?? 0)

  const averagePerformanceDelta = totals.performanceGameCount
    ? totals.sumPerformanceDelta / totals.performanceGameCount
    : 0
  const fallbackWinRate = recordTotal ? ((selectedRecord.win ?? 0) / recordTotal) * 100 : 0
  const pas = totals.performanceGameCount >= 2
    ? performanceDeltaToPas(averagePerformanceDelta)
    : percentageToAttribute(fallbackWinRate)

  const underdogNonLossRate = totals.underdogGameCount
    ? (totals.underdogNonLossCount / totals.underdogGameCount) * 100
    : 0
  const overallNonLossRate = totals.totalGames
    ? (totals.totalNonLossCount / totals.totalGames) * 100
    : recordTotal
    ? ((recordTotal - (selectedRecord.loss ?? 0)) / recordTotal) * 100
    : 0
  const underdogWeight = Math.min(totals.underdogGameCount / 25, 1)
  const blendedNonLossRate = underdogNonLossRate * underdogWeight
    + overallNonLossRate * (1 - underdogWeight)
  const def = percentageToAttribute(blendedNonLossRate)

  const recentOpeningSample = (totals.recentOpenings ?? []).filter(Boolean)
  const openingVariety = recentOpeningSample.length
    ? (new Set(recentOpeningSample).size / recentOpeningSample.length) * 100
    : 0
  const dri = percentageToAttribute(openingVariety)

  const avgTimeUsed = totals.clockGameCount
    ? totals.sumTimeUsedFraction / totals.clockGameCount
    : null
  const fallbackPaceRating = stats?.chess_bullet?.last?.rating
    ?? stats?.chess_blitz?.last?.rating
    ?? stats?.[`chess_${timeControl}`]?.last?.rating
    ?? 0
  const pac = avgTimeUsed === null
    ? ratingToLegacyAttribute(fallbackPaceRating)
    : clamp(Math.round(40 + (1 - clamp(avgTimeUsed, 0, 1)) * 59))

  return {
    PAC: pac,
    PAS: pas,
    DRI: dri,
    DEF: def,
    evidence: {
      PAC: {
        source: avgTimeUsed === null ? 'rating-fallback' : 'clock',
        sampleSize: totals.clockGameCount,
      },
      PAS: {
        source: totals.performanceGameCount >= 2 ? 'performance' : 'win-rate-fallback',
        sampleSize: totals.performanceGameCount >= 2 ? totals.performanceGameCount : recordTotal,
      },
      DRI: {
        source: 'openings',
        sampleSize: recentOpeningSample.length,
      },
      DEF: {
        source: totals.underdogGameCount ? 'blended-results' : 'overall-record',
        sampleSize: totals.underdogGameCount,
        totalGames: totals.totalGames || recordTotal,
      },
    },
  }
}
