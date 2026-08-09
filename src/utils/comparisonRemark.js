const FAVOURITE_RATING_MARGIN = 25

function normalizedName(value) {
  return value?.trim().toLowerCase() ?? ''
}

function attributeValues(attributes = []) {
  return attributes.map((attribute) => Number(attribute.value) || 0)
}

export function getComparisonDecision({
  primaryName,
  opponentName,
  primaryRating,
  opponentRating,
  primaryOvr,
  opponentOvr,
  primaryAttributes,
  opponentAttributes,
}) {
  const isSelf = normalizedName(primaryName) === normalizedName(opponentName)
  const leftValues = attributeValues(primaryAttributes)
  const rightValues = attributeValues(opponentAttributes)
  const leftWins = leftValues.filter((value, index) => value > (rightValues[index] ?? 0)).length
  const rightWins = rightValues.filter((value, index) => value > (leftValues[index] ?? 0)).length
  const leftTotal = leftValues.reduce((sum, value) => sum + value, 0)
  const rightTotal = rightValues.reduce((sum, value) => sum + value, 0)
  const averageGap = leftValues.length
    ? Math.abs(leftTotal - rightTotal) / leftValues.length
    : 0

  if (isSelf) {
    return {
      isSelf: true,
      winner: 'draw',
      leftWins,
      rightWins,
      tone: 'self',
      remark: 'No winner — what did you think was going to happen?',
    }
  }

  let winner = 'draw'
  if (leftWins !== rightWins) winner = leftWins > rightWins ? 'primary' : 'opponent'
  else if (leftTotal !== rightTotal) winner = leftTotal > rightTotal ? 'primary' : 'opponent'
  else if (primaryOvr !== opponentOvr) winner = primaryOvr > opponentOvr ? 'primary' : 'opponent'

  if (winner === 'draw') {
    return {
      isSelf: false,
      winner,
      leftWins,
      rightWins,
      tone: 'draw',
      remark: 'No winner on the numbers — this one needs another look from the scouting room.',
    }
  }

  const ratingDifference = primaryRating - opponentRating
  const favourite = Math.abs(ratingDifference) >= FAVOURITE_RATING_MARGIN
    ? ratingDifference > 0 ? 'primary' : 'opponent'
    : null
  const winnerName = winner === 'primary' ? primaryName : opponentName
  const attributeMargin = Math.abs(leftWins - rightWins)
  const close = attributeMargin <= 1 && averageGap < 3
  const decisive = attributeMargin >= 4 || averageGap >= 8

  if (favourite === winner) {
    return {
      isSelf: false,
      winner,
      leftWins,
      rightWins,
      tone: 'expected',
      remark: decisive
        ? `${winnerName} came in with the higher rating and backed it up across the board.`
        : close
          ? `${winnerName} gets the nod, but the favourite had to work for every edge.`
          : `${winnerName} justifies the higher rating with the stronger all-round brief.`,
    }
  }

  if (favourite && favourite !== winner) {
    return {
      isSelf: false,
      winner,
      leftWins,
      rightWins,
      tone: 'upset',
      remark: decisive
        ? `${winnerName} flips the pre-match order with a statement all-round showing.`
        : close
          ? `${winnerName} shades the higher-rated player in a duel decided by fine margins.`
          : `${winnerName} beats the rating forecast with the stronger scouting profile.`,
    }
  }

  return {
    isSelf: false,
    winner,
    leftWins,
    rightWins,
    tone: close ? 'close' : 'open',
    remark: close
      ? `${winnerName} finds the smallest of edges in a matchup that was almost too close to call.`
      : decisive
        ? `${winnerName} takes control of an evenly billed matchup.`
        : `${winnerName} earns the edge where the ratings could not separate them.`,
  }
}
