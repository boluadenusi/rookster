function getControl(stats, key) {
  const control = stats?.[key]
  const record = control?.record ?? {}
  return {
    rating: control?.last?.rating ?? 0,
    games: (record.win ?? 0) + (record.loss ?? 0) + (record.draw ?? 0),
  }
}

export function getPlayerArchetype(stats, position) {
  const rapid = getControl(stats, 'chess_rapid')
  const blitz = getControl(stats, 'chess_blitz')
  const bullet = getControl(stats, 'chess_bullet')
  const controls = [rapid, blitz, bullet]
  const totalGames = controls.reduce((sum, control) => sum + control.games, 0)
  const highestRating = Math.max(...controls.map((control) => control.rating))
  const puzzleRush = stats?.puzzle_rush?.best?.score ?? 0
  const tactics = stats?.tactics?.highest?.rating ?? stats?.tactics?.last?.rating ?? 0

  if (puzzleRush >= 70) return { label: 'Puzzle Machine', key: 'puzzle' }
  if (position === 'CF' || position === 'SS') return { label: 'Gambit Instinct', key: 'gambit' }
  if (totalGames >= 3500) return { label: 'Marathon Grinder', key: 'marathon' }
  if (bullet.rating && bullet.rating >= Math.max(rapid.rating, blitz.rating) + 75) {
    return { label: 'Speed Demon', key: 'speed' }
  }
  if (position === 'CB' || position === 'DM') return { label: 'Iron Defender', key: 'defender' }
  if (blitz.rating === highestRating && blitz.games >= Math.max(rapid.games, bullet.games)) {
    return { label: 'Blitz Merchant', key: 'blitz' }
  }
  if (rapid.rating === highestRating && rapid.rating > 0) {
    return { label: 'Rapid Specialist', key: 'rapid' }
  }
  if (tactics >= highestRating + 200 || puzzleRush >= 45) {
    return { label: 'The Tactician', key: 'tactician' }
  }
  if (position === 'CAM' || position === 'CM') return { label: 'Creative Playmaker', key: 'creator' }
  return { label: 'Complete Player', key: 'complete' }
}
