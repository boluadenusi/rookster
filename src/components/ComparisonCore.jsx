import { buildCardStats, classifyChessGame, getTotalRatedGames } from '../utils.js'
import { getComparisonDecision } from '../utils/comparisonRemark.js'
import { getPlayerArchetype } from '../utils/playerArchetype.js'
import PlayerStatusBadge from './PlayerStatusBadge.jsx'
import ScoutingDisclaimer from './ScoutingDisclaimer.jsx'

function getPlayerMetrics(player, control) {
  const { stats } = player
  const card = buildCardStats(stats, control, player.attributeStats?.[control.id])
  const record = stats?.[control.key]?.record ?? {}
  const wins = record.win ?? 0
  const losses = record.loss ?? 0
  const draws = record.draw ?? 0
  const total = wins + losses + draws

  return {
    card,
    rating: card.rating,
    winRate: total ? Math.round((wins / total) * 100) : 0,
    games: total,
    allGames: getTotalRatedGames(stats),
  }
}

function barWidth(value) {
  return `${Math.max(8, Math.min(100, ((value - 40) / 55) * 100))}%`
}

function archetypeLengthClass(label) {
  if (label.length >= 21) return 'archetype-extra-long'
  if (label.length >= 17) return 'archetype-long'
  if (label.length >= 14) return 'archetype-medium'
  return ''
}

function getRecentHeadToHead(primary, games) {
  const seenGames = new Set()

  const meetings = games
    .filter((game) => {
      const white = game.white?.username?.toLowerCase()
      const black = game.black?.username?.toLowerCase()
      const gameKey = game.url ?? `${game.end_time}-${white}-${black}`

      if (seenGames.has(gameKey)) return false
      seenGames.add(gameKey)
      return true
    })
    .sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0))

  return meetings.reduce((record, game) => {
    const result = classifyChessGame(game, primary.profile.username).result
    if (result === 'W') record.primaryWins += 1
    else if (result === 'L') record.opponentWins += 1
    else record.draws += 1
    return record
  }, { primaryWins: 0, opponentWins: 0, draws: 0, total: meetings.length })
}

export default function ComparisonCore({
  primary,
  opponent,
  selectedControl,
  headToHeadData,
  primaryPosition,
  opponentPosition,
}) {
  const left = getPlayerMetrics(primary, selectedControl)
  const right = getPlayerMetrics(opponent, selectedControl)
  const leftArchetype = getPlayerArchetype(primary.stats, primaryPosition)
  const rightArchetype = getPlayerArchetype(opponent.stats, opponentPosition)
  const decision = getComparisonDecision({
    primaryName: primary.profile.username,
    opponentName: opponent.profile.username,
    primaryRating: left.rating,
    opponentRating: right.rating,
    primaryOvr: left.card.ovr,
    opponentOvr: right.card.ovr,
    primaryAttributes: left.card.attributes,
    opponentAttributes: right.card.attributes,
  })
  const headToHead = decision.isSelf
    ? { primaryWins: 0, opponentWins: 0, draws: 0, total: 0 }
    : getRecentHeadToHead(primary, headToHeadData.games)

  const coreRows = [
    { label: 'Rating', left: left.rating.toLocaleString(), right: right.rating.toLocaleString(), leftRaw: left.rating, rightRaw: right.rating },
    { label: 'Win rate', left: `${left.winRate}%`, right: `${right.winRate}%`, leftRaw: left.winRate, rightRaw: right.winRate },
    { label: `${selectedControl.label} games`, left: left.games.toLocaleString(), right: right.games.toLocaleString(), leftRaw: left.games, rightRaw: right.games },
    { label: 'All formats', left: left.allGames.toLocaleString(), right: right.allGames.toLocaleString(), leftRaw: left.allGames, rightRaw: right.allGames },
  ]

  return (
    <section className="comparison-core" aria-label={`${primary.profile.username} versus ${opponent.profile.username} core metrics`}>
      <span className="duel-kicker">SCOUT REPORT</span>
      <div className="duel-names">
        <span title={primary.profile.username}>{primary.profile.username}</span>
        <b>VS</b>
        <span title={opponent.profile.username}>{opponent.profile.username}</span>
      </div>
      <div className="duel-archetypes">
        <span className={archetypeLengthClass(leftArchetype.label)} title={leftArchetype.label}>
          {leftArchetype.label}
        </span>
        <b>ARCHETYPE</b>
        <span className={archetypeLengthClass(rightArchetype.label)} title={rightArchetype.label}>
          {rightArchetype.label}
        </span>
      </div>
      <div className="duel-statuses">
        <PlayerStatusBadge rating={left.rating} totalGames={left.games} allFormatGames={left.allGames} controlId={selectedControl.id} compact />
        <b>STATUS</b>
        <PlayerStatusBadge rating={right.rating} totalGames={right.games} allFormatGames={right.allGames} controlId={selectedControl.id} compact />
      </div>

      <div className="duel-overall">
        <strong className={left.card.ovr > right.card.ovr ? 'duel-winner' : ''}>{left.card.ovr}</strong>
        <div><span>{selectedControl.label}</span><b>OVR</b></div>
        <strong className={right.card.ovr > left.card.ovr ? 'duel-winner' : ''}>{right.card.ovr}</strong>
      </div>

      <div className="duel-scoreline">
        <span>{decision.leftWins}</span>
        <i />
        <small>ATTRIBUTE EDGE</small>
        <i />
        <span>{decision.rightWins}</span>
      </div>

      <div className="duel-attributes">
        {left.card.attributes.map((attribute, index) => {
          const opponentAttribute = right.card.attributes[index]
          return (
            <div className="duel-attribute" key={attribute.label}>
              <strong className={attribute.value > opponentAttribute.value ? 'duel-winner' : ''}>{attribute.value}</strong>
              <span className="duel-bar duel-bar-left"><i style={{ width: barWidth(attribute.value) }} /></span>
              <b>{attribute.label}</b>
              <span className="duel-bar duel-bar-right"><i style={{ width: barWidth(opponentAttribute.value) }} /></span>
              <strong className={opponentAttribute.value > attribute.value ? 'duel-winner' : ''}>{opponentAttribute.value}</strong>
            </div>
          )
        })}
      </div>

      <div className="duel-core-metrics">
        <span>SCOUTING METRICS</span>
        {coreRows.map((row) => (
          <div key={row.label}>
            <strong className={row.leftRaw > row.rightRaw ? 'duel-winner' : ''}>{row.left}</strong>
            <b>{row.label}</b>
            <strong className={row.rightRaw > row.leftRaw ? 'duel-winner' : ''}>{row.right}</strong>
          </div>
        ))}
      </div>

      <div className={`duel-remark remark-${decision.tone}`}>
        <span>TOUCHLINE VERDICT</span>
        <p>{decision.remark}</p>
      </div>

      {!decision.isSelf && (
      <div className="recent-head-to-head">
        <span>RECENT MEETINGS · 3 MONTHS</span>
        {headToHeadData.loading ? (
          <p>Reviewing the last three months of fixtures...</p>
        ) : headToHeadData.unavailable ? (
          <p>The recent meetings report is temporarily unavailable.</p>
        ) : headToHead.total ? (
          <>
            <div>
              <strong>{headToHead.primaryWins}</strong>
              <b>WINS</b>
              <small>{headToHead.draws} DRAW{headToHead.draws === 1 ? '' : 'S'}</small>
              <b>WINS</b>
              <strong>{headToHead.opponentWins}</strong>
            </div>
            <p>{headToHead.total} fixture{headToHead.total === 1 ? '' : 's'} found across the last three months</p>
          </>
        ) : (
          <p>No recent fixtures between these players.</p>
        )}
      </div>
      )}
      <ScoutingDisclaimer />
    </section>
  )
}
