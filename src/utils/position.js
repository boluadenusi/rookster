const ZONE_ATTRIBUTES = [
  { label: 'SHO', zone: 'attacking', pair: 'PAC' },
  { label: 'PAS', zone: 'central', pair: 'DRI' },
  { label: 'DEF', zone: 'defensive', pair: 'PHY' },
]

const NEAR_TIE_MARGIN = 5

function attributeMap(attributes) {
  return Object.fromEntries(attributes.map(({ label, value }) => [label, Number(value) || 0]))
}

export function selectPositionZone(attributes = []) {
  const values = attributeMap(attributes)
  const ranked = [...ZONE_ATTRIBUTES].sort((left, right) => {
    const difference = values[right.label] - values[left.label]
    return difference || ZONE_ATTRIBUTES.indexOf(left) - ZONE_ATTRIBUTES.indexOf(right)
  })
  const leader = ranked[0]
  const contenders = ranked.filter(
    (candidate) => values[leader.label] - values[candidate.label] <= NEAR_TIE_MARGIN,
  )

  if (contenders.length === 1) return leader.zone

  const pairedRanking = [...contenders].sort((left, right) => {
    const leftTotal = values[left.label] + values[left.pair]
    const rightTotal = values[right.label] + values[right.pair]
    const pairedDifference = rightTotal - leftTotal
    if (pairedDifference) return pairedDifference

    const rawDifference = values[right.label] - values[left.label]
    return rawDifference || ZONE_ATTRIBUTES.indexOf(left) - ZONE_ATTRIBUTES.indexOf(right)
  })

  return pairedRanking[0].zone
}

export function resolvePosition(attributes = []) {
  const values = attributeMap(attributes)
  const zone = selectPositionZone(attributes)

  if (zone === 'defensive') {
    return values.PAS + values.DRI > values.PHY + values.PAC ? 'DM' : 'CB'
  }
  if (zone === 'central') {
    return values.DRI + values.SHO > values.PHY + values.DEF ? 'CAM' : 'CM'
  }
  return values.PAC + values.PHY > values.DRI + values.PAS ? 'CF' : 'SS'
}
