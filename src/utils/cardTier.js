export const CARD_TIER_RANGES = {
  bronze: { min: 40, max: 64 },
  silver: { min: 65, max: 74 },
  gold: { min: 75, max: 84 },
  special: { min: 85, max: 95 },
}

export function getCardTier(ovr) {
  const boundedOvr = Math.min(CARD_TIER_RANGES.special.max, Math.max(CARD_TIER_RANGES.bronze.min, ovr))
  if (boundedOvr >= CARD_TIER_RANGES.special.min) return 'special'
  if (boundedOvr >= CARD_TIER_RANGES.gold.min) return 'gold'
  if (boundedOvr >= CARD_TIER_RANGES.silver.min) return 'silver'
  return 'bronze'
}
