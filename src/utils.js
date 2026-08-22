import { getOpeningName } from './utils/openingStyle.js'

export const CONTROLS = [
  { id: 'rapid', key: 'chess_rapid', label: 'Rapid' },
  { id: 'blitz', key: 'chess_blitz', label: 'Blitz' },
  { id: 'bullet', key: 'chess_bullet', label: 'Bullet' },
]

export const clamp = (value, min = 40, max = 95) => Math.min(max, Math.max(min, value))

const ATTRIBUTE_OVR_OFFSET = -2
const ATTRIBUTE_RAW_CENTER = 75
const ATTRIBUTE_CONTRAST = 0.5

export function ratingToOvr(rating) {
  if (rating <= 100) return 45

  const value = rating < 1500
    ? 45 + ((rating - 100) / 1400) * 30
    : 75 + 20 * Math.sqrt((rating - 1500) / (3100 - 1500))

  return clamp(Math.round(value))
}

export function calibrateAttributeToOvr(rawValue, ovr) {
  const safeRawValue = Number.isFinite(rawValue) ? clamp(rawValue) : ATTRIBUTE_RAW_CENTER
  const safeOvr = Number.isFinite(ovr) ? clamp(ovr) : ATTRIBUTE_RAW_CENTER

  return clamp(Math.round(
    safeOvr
    + ATTRIBUTE_OVR_OFFSET
    + ATTRIBUTE_CONTRAST * (safeRawValue - ATTRIBUTE_RAW_CENTER),
  ))
}

function ratingToLegacyAttribute(rating) {
  return clamp(Math.round(75 + (rating - 1500) / 40))
}

export function getShootingAttribute(rating, tacticsRating) {
  const ovr = ratingToOvr(rating)
  if (!Number.isFinite(tacticsRating)) {
    return { value: ovr, source: 'selected-rating-fallback', confidence: 0 }
  }

  const tacticsValue = ratingToOvr(tacticsRating)
  const downwardGap = Math.max(0, rating - tacticsRating)

  // Chess.com exposes a tactics high-water mark without enough evidence to tell
  // whether it is current or representative. A result far below the player's
  // playing rating is therefore blended back toward OVR instead of being allowed
  // to define SHO, their inferred role, and the whole report by itself.
  const confidence = downwardGap <= 600
    ? 1
    : Math.max(0.15, 1 - (downwardGap - 600) / 1400)
  const value = clamp(Math.round(ovr * (1 - confidence) + tacticsValue * confidence))

  return {
    value,
    source: confidence < 1 ? 'tactics-rating-blend' : 'tactics-peak',
    confidence,
  }
}

export function getSkillMoves(stats) {
  const score = stats?.puzzle_rush?.best?.score
  if (!Number.isFinite(score)) return null
  if (score < 20) return 1
  if (score < 40) return 2
  if (score < 60) return 3
  if (score < 80) return 4
  return 5
}

export function getAvailableControls(stats) {
  return CONTROLS.filter((control) => Number.isFinite(stats?.[control.key]?.last?.rating))
}

export function getDefaultControl(availableControls) {
  return (
    availableControls.find((control) => control.id === 'rapid') ??
    availableControls.find((control) => control.id === 'blitz') ??
    availableControls[0]
  )
}

export function getTotalRatedGames(stats) {
  return CONTROLS.reduce((total, control) => {
    const record = stats?.[control.key]?.record ?? {}
    return total + (record.win ?? 0) + (record.loss ?? 0) + (record.draw ?? 0)
  }, 0)
}

export function classifyChessGame(game, username) {
  const target = username.toLowerCase()
  const isWhite = game.white?.username?.toLowerCase() === target
  const userSide = isWhite ? game.white : game.black
  const opponentSide = isWhite ? game.black : game.white

  let result = 'D'
  if (userSide?.result === 'win') result = 'W'
  else if (opponentSide?.result === 'win') result = 'L'

  return {
    result,
    opponent: opponentSide?.username ?? 'Unknown',
    opponentRating: opponentSide?.rating,
    color: isWhite ? 'White' : 'Black',
    opening: getOpeningName(game),
    date: game.end_time ? new Date(game.end_time * 1000) : null,
    url: game.url,
  }
}

export function summarizeRecentGames(games, username) {
  const form = games.map((game) => classifyChessGame(game, username))

  let wins = 0
  let unbeaten = 0
  for (const game of form) {
    if (game.result === 'W') wins += 1
    else break
  }
  for (const game of form) {
    if (game.result !== 'L') unbeaten += 1
    else break
  }

  let streak = 'No recent form'
  if (wins > 0) streak = `🔥 ${wins} game win streak`
  else if (unbeaten > 0) streak = `${unbeaten} game${unbeaten === 1 ? '' : 's'} unbeaten`
  else if (form.length) streak = 'Last outing: loss'
  if (wins > 0) streak = `${wins} game win streak`

  const bestWin = form
    .filter((game) => game.result === 'W' && Number.isFinite(game.opponentRating))
    .sort((a, b) => b.opponentRating - a.opponentRating)[0]

  return { form, streak, bestWin, winStreak: wins, unbeatenStreak: unbeaten }
}

export function buildCardStats(stats, control, cachedAttributes = null) {
  const selected = stats[control.key]
  const rating = selected.last.rating
  const record = selected.record ?? {}
  const wins = record.win ?? 0
  const losses = record.loss ?? 0
  const draws = record.draw ?? 0
  const total = wins + losses + draws
  const winRate = total ? (wins / total) * 100 : 0
  const lossRate = total ? (losses / total) * 100 : 0
  const ovr = ratingToOvr(rating)
  const bulletOrBlitz = stats.chess_bullet?.last?.rating ?? stats.chess_blitz?.last?.rating ?? rating
  const blitz = stats.chess_blitz?.last?.rating ?? rating
  const tacticsRating = stats.tactics?.highest?.rating ?? stats.tactics?.last?.rating
  const cachedValue = (label, fallback) => (
    Number.isFinite(cachedAttributes?.[label]) ? clamp(cachedAttributes[label]) : fallback
  )
  const cachedEvidence = (label, fallback) => cachedAttributes?.evidence?.[label] ?? fallback
  const shooting = getShootingAttribute(rating, tacticsRating)
  const rawAttributes = [
    {
      label: 'PAC',
      value: cachedValue('PAC', ratingToLegacyAttribute(bulletOrBlitz)),
      evidence: cachedEvidence('PAC', { source: 'rating-fallback', sampleSize: 0 }),
    },
    {
      label: 'SHO',
      value: shooting.value,
      evidence: Number.isFinite(tacticsRating)
        ? {
            source: shooting.source,
            rating: tacticsRating,
            sampleSize: 1,
            confidence: shooting.confidence,
          }
        : { source: 'selected-rating-fallback', rating, sampleSize: 0 },
    },
    {
      label: 'PAS',
      value: cachedValue('PAS', clamp(Math.round(40 + winRate * 0.6))),
      evidence: cachedEvidence('PAS', { source: 'win-rate-fallback', sampleSize: total }),
    },
    {
      label: 'DRI',
      value: cachedValue('DRI', ratingToLegacyAttribute(blitz)),
      evidence: cachedEvidence('DRI', { source: 'rating-fallback', sampleSize: 0 }),
    },
    {
      label: 'DEF',
      value: cachedValue('DEF', clamp(Math.round(40 + (100 - lossRate) * 0.6))),
      evidence: cachedEvidence('DEF', { source: 'overall-record', sampleSize: 0, totalGames: total }),
    },
    {
      label: 'PHY',
      value: clamp(Math.round(
        40 + 55 * (Math.log1p(Math.min(total, 2000)) / Math.log1p(2000)),
      )),
      evidence: { source: 'appearances', sampleSize: total },
    },
  ]

  return {
    rating,
    peak: selected.best?.rating,
    ovr,
    total,
    attributes: rawAttributes.map((attribute) => ({
      ...attribute,
      value: calibrateAttributeToOvr(attribute.value, ovr),
    })),
  }
}

export function getCountryCode(countryUrl) {
  const code = countryUrl?.split('/').filter(Boolean).at(-1)
  return /^[a-z]{2}$/i.test(code ?? '') ? code.toLowerCase() : null
}

export function formatDate(date) {
  if (!date || Number.isNaN(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}
