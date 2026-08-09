const AGGRESSIVE_OPENINGS = [
  'sicilian',
  "king's gambit",
  'grand prix',
  'dragon',
  'najdorf',
  'benoni',
  'alekhine',
  'scandinavian',
  'evans gambit',
  'danish gambit',
]

const POSITIONAL_OPENINGS = [
  'caro-kann',
  'french defense',
  "queen's gambit declined",
  'slav defense',
  'london system',
  'catalan',
  'berlin defense',
]

function extractPgnHeader(pgn, header) {
  return pgn?.match(new RegExp(`\\[${header}\\s+"([^"]+)"\\]`, 'i'))?.[1] ?? ''
}

function normalizeOpening(value) {
  return value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getOpeningText(game) {
  const ecoUrl = game.eco ?? extractPgnHeader(game.pgn, 'ECOUrl')
  const rawSlug = ecoUrl?.split('/').filter(Boolean).at(-1) ?? ''
  let slug = rawSlug
  try {
    slug = decodeURIComponent(rawSlug)
  } catch {
    // Keep the raw slug if a third-party URL contains malformed escapes.
  }
  return normalizeOpening([
    extractPgnHeader(game.pgn, 'Opening'),
    extractPgnHeader(game.pgn, 'Variation'),
    extractPgnHeader(game.pgn, 'ECO'),
    slug,
  ]
    .filter(Boolean)
    .join(' '))
}

export function getOpeningName(game) {
  const opening = extractPgnHeader(game?.pgn, 'Opening')
  const variation = extractPgnHeader(game?.pgn, 'Variation')
  if (opening) return [opening, variation].filter(Boolean).join(' · ')

  const ecoUrl = game?.eco ?? extractPgnHeader(game?.pgn, 'ECOUrl')
  const rawSlug = ecoUrl?.split('/').filter(Boolean).at(-1) ?? ''
  if (!rawSlug) return 'Opening unavailable'

  try {
    return decodeURIComponent(rawSlug).replace(/[-_]+/g, ' ').trim()
  } catch {
    return rawSlug.replace(/[-_]+/g, ' ').trim() || 'Opening unavailable'
  }
}

export function getOpeningStyle(games = []) {
  let aggressive = 0
  let positional = 0

  for (const game of games) {
    const opening = getOpeningText(game)
    if (AGGRESSIVE_OPENINGS.some((keyword) => opening.includes(normalizeOpening(keyword)))) aggressive += 1
    else if (POSITIONAL_OPENINGS.some((keyword) => opening.includes(normalizeOpening(keyword)))) positional += 1
  }

  const classified = aggressive + positional
  if (!classified) {
    return { classified, aggressionScore: null, key: null, description: null }
  }

  const aggressionScore = aggressive / classified
  if (aggressionScore > 0.6) {
    return {
      classified,
      aggressionScore,
      key: 'aggressive',
      description: 'Recent opening choices suggest an aggressive, attacking-minded approach.',
    }
  }
  if (aggressionScore < 0.4) {
    return {
      classified,
      aggressionScore,
      key: 'positional',
      description: 'Recent opening choices suggest a positional, patient approach.',
    }
  }
  return {
    classified,
    aggressionScore,
    key: 'balanced',
    description: 'Recent opening choices suggest a balanced, tactically flexible approach.',
  }
}
