import { buildCardStats } from '../utils.js'
import { getPlayerArchetype } from './playerArchetype.js'

const ATTRIBUTE_COPY = {
  PAC: 'Speed profile',
  SHO: 'Tactical sharpness',
  PAS: 'Statement results',
  DRI: 'Opening variety',
  DEF: 'Defensive resilience',
  PHY: 'Match experience',
}

const STRENGTH_THRESHOLD = 75
const DEVELOPMENT_THRESHOLD = 64
const RELATIVE_STRENGTH_MARGIN = 5
const RELATIVE_DEVELOPMENT_MARGIN = 6
const ELITE_STRENGTH_CEILING = 94
const STANDOUT_MARGIN = 3
const ATTRIBUTE_PRIORITY = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY']

function evidenceConfidence(evidence = {}) {
  const sampleSize = Math.max(0, Number(evidence.sampleSize) || 0)
  const totalGames = Math.max(0, Number(evidence.totalGames) || 0)

  switch (evidence.source) {
    case 'clock': return Math.min(sampleSize / 20, 1)
    case 'performance': return Math.min(sampleSize / 20, 1)
    case 'openings': return Math.min(sampleSize / 20, 1)
    case 'blended-results':
      return Math.min(totalGames / 20, 1) * 0.5 + Math.min(sampleSize / 25, 1) * 0.5
    case 'overall-record': return Math.min((totalGames || sampleSize) / 20, 1) * 0.65
    case 'win-rate-fallback': return Math.min(sampleSize / 20, 1) * 0.65
    case 'tactics-peak': return 0.9
    case 'appearances': return Math.min(sampleSize / 100, 1)
    case 'rating-fallback': return 0.5
    case 'selected-rating-fallback': return 0.5
    default: return 0
  }
}

function evidenceLabel(label, evidence = {}) {
  const sampleSize = Math.max(0, Number(evidence.sampleSize) || 0)
  const totalGames = Math.max(0, Number(evidence.totalGames) || 0)
  const games = (count, noun = 'matches') => `${count.toLocaleString()} ${noun}`

  switch (evidence.source) {
    case 'clock': return games(sampleSize, 'clocked matches')
    case 'performance': return games(sampleSize, 'rated results')
    case 'openings': return games(sampleSize, 'opening records')
    case 'blended-results': return `${sampleSize.toLocaleString()} underdog / ${totalGames.toLocaleString()} total results`
    case 'overall-record': return games(totalGames || sampleSize, 'career results')
    case 'win-rate-fallback': return games(sampleSize, 'career results')
    case 'tactics-peak': return `Tactics peak ${(Number(evidence.rating) || 0).toLocaleString()}`
    case 'appearances': return games(sampleSize, 'career appearances')
    case 'selected-rating-fallback': return 'Selected-rating fallback'
    case 'rating-fallback': return 'Short-format rating fallback'
    default: return `${label} evidence unavailable`
  }
}

function decorateAttribute(attribute) {
  const confidence = evidenceConfidence(attribute.evidence)
  return {
    ...attribute,
    name: ATTRIBUTE_COPY[attribute.label],
    evidenceConfidence: confidence,
    evidenceLabel: evidenceLabel(attribute.label, attribute.evidence),
    provisional: confidence < 0.5,
  }
}

function priorityDifference(left, right) {
  return ATTRIBUTE_PRIORITY.indexOf(left.label) - ATTRIBUTE_PRIORITY.indexOf(right.label)
}

function strengthsStandApart(strengths, attributes) {
  if (!strengths.length) return false
  const selected = new Set(strengths.map((attribute) => attribute.label))
  const highestOutside = attributes
    .filter((attribute) => !selected.has(attribute.label))
    .reduce((highest, attribute) => Math.max(highest, attribute.value), -Infinity)
  return highestOutside === -Infinity
    || Math.min(...strengths.map((attribute) => attribute.value)) - highestOutside >= STANDOUT_MARGIN
}

function getTraitThresholds(ovr) {
  if (!Number.isFinite(ovr)) {
    return { strength: STRENGTH_THRESHOLD, development: DEVELOPMENT_THRESHOLD }
  }

  return {
    strength: Math.min(ELITE_STRENGTH_CEILING, ovr + RELATIVE_STRENGTH_MARGIN),
    development: Math.max(40, ovr - RELATIVE_DEVELOPMENT_MARGIN),
  }
}

export function selectScoutingTraits(attributes = [], ovr) {
  const decorated = attributes.map(decorateAttribute)
  const thresholds = getTraitThresholds(ovr)
  const strengths = decorated
    .filter((attribute) => attribute.value >= thresholds.strength)
    .sort((left, right) => (
      right.value - left.value
      || right.evidenceConfidence - left.evidenceConfidence
      || priorityDifference(left, right)
    ))
    .slice(0, 2)
  const development = decorated
    .filter((attribute) => attribute.value <= thresholds.development)
    .sort((left, right) => (
      left.value - right.value
      || right.evidenceConfidence - left.evidenceConfidence
      || priorityDifference(left, right)
    ))
    .slice(0, 2)

  return {
    strengths,
    development,
    strengthsAreDistinct: strengthsStandApart(strengths, decorated),
  }
}

function getConfidence(total, sampleMonths, extendedSample) {
  const windowLabel = extendedSample
    ? `extended ${sampleMonths}-month sample`
    : `${sampleMonths}-month sample`
  if (total >= 100) {
    return { key: 'strong', label: 'High confidence', detail: `${total.toLocaleString()} rated games in the ${windowLabel}` }
  }

  if (total >= 20) {
    return { key: 'developing', label: 'Developing read', detail: `${total.toLocaleString()} rated games in the ${windowLabel}` }
  }

  return { key: 'limited', label: 'Limited sample', detail: `${total.toLocaleString()} rated game${total === 1 ? '' : 's'} across ${sampleMonths} months` }
}

function buildVerdict(strengths, development, strengthsAreDistinct, control, sampleCaveat, openingStyle) {
  const brief = `this ${control.label.toLowerCase()} brief`
  const styleCaveat = openingStyle?.description ? ` ${openingStyle.description}` : ''

  if (!strengths.length && !development.length) {
    return `This ${control.label.toLowerCase()} brief shows a balanced, well-rounded profile with no clear standout strength or weakness yet.${styleCaveat}${sampleCaveat}`
  }

  let strengthClause
  if (strengths.length === 2) {
    strengthClause = strengthsAreDistinct
      ? `${strengths[0].name} and ${strengths[1].name.toLowerCase()} are the standout tools in ${brief}`
      : `${strengths[0].name} and ${strengths[1].name.toLowerCase()} lead the attribute board in ${brief}`
  } else if (strengths.length === 1) {
    strengthClause = strengthsAreDistinct
      ? `${strengths[0].name} is the standout tool in ${brief}`
      : `${strengths[0].name} leads the attribute board in ${brief}`
  } else {
    strengthClause = `No attribute currently stands out as a clear strength in ${brief}`
  }

  const closingClause = development.length
    ? `${development[0].name.toLowerCase()} remains a priority development area.`
    : 'there is no clear development area right now.'

  return `${strengthClause}; ${closingClause}${styleCaveat}${sampleCaveat}`
}

export function getScoutingProfile(stats, control, position, attributeStats, openingStyle) {
  const card = buildCardStats(stats, control, attributeStats)
  const archetype = getPlayerArchetype(stats, position)
  const { strengths, development, strengthsAreDistinct } = selectScoutingTraits(card.attributes, card.ovr)
  const sampleGames = Number.isFinite(attributeStats?.sampleGames)
    ? attributeStats.sampleGames
    : card.total
  const sampleMonths = Number.isFinite(attributeStats?.sampleMonths)
    ? attributeStats.sampleMonths
    : 12
  const confidence = getConfidence(sampleGames, sampleMonths, Boolean(attributeStats?.extendedSample))
  const sampleCaveat = confidence.key === 'limited'
    ? ' Treat this as an early scout read until more appearances are logged.'
    : ''

  return {
    archetype,
    card,
    confidence,
    strengths,
    development,
    verdict: buildVerdict(
      strengths,
      development,
      strengthsAreDistinct,
      control,
      sampleCaveat,
      openingStyle,
    ),
  }
}
