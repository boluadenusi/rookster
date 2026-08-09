import { useId, useState } from 'react'
import { buildCardStats, getSkillMoves, getTotalRatedGames } from '../utils.js'
import { getScoutingProfile } from '../utils/scoutingProfile.js'
import ScoutingRadar from './ScoutingRadar.jsx'
import SkillMoves from './SkillMoves.jsx'
import StreakLabel from './StreakLabel.jsx'
import PlayerStatusBadge from './PlayerStatusBadge.jsx'
import ScoutingDisclaimer from './ScoutingDisclaimer.jsx'

function getReport(stats, control, attributeStats) {
  const selected = stats?.[control.key]
  const record = selected?.record ?? {}
  const wins = record.win ?? 0
  const losses = record.loss ?? 0
  const draws = record.draw ?? 0
  const total = wins + losses + draws
  const winRate = total ? (wins / total) * 100 : 0
  const unbeatenRate = total ? ((wins + draws) / total) * 100 : 0
  const card = buildCardStats(stats, control, attributeStats)
  const allFormatGames = getTotalRatedGames(stats)
  const tactics = stats?.tactics?.highest?.rating ?? stats?.tactics?.last?.rating
  const puzzleRush = stats?.puzzle_rush?.best?.score

  const metrics = [
    {
      label: 'Current rating',
      value: card.rating.toLocaleString(),
      progress: ((card.ovr - 40) / 55) * 100,
      description: `The player's latest public Chess.com ${control.label.toLowerCase()} rating.`,
    },
    {
      label: 'Win rate',
      value: `${Math.round(winRate)}%`,
      progress: winRate,
      description: `Wins as a percentage of all rated ${control.label.toLowerCase()} appearances on the player's record.`,
    },
    {
      label: 'Unbeaten record',
      value: `${Math.round(unbeatenRate)}%`,
      progress: unbeatenRate,
      description: `Wins and draws combined as a percentage of all rated ${control.label.toLowerCase()} appearances.`,
    },
    {
      label: `${control.label} appearances`,
      value: total.toLocaleString(),
      progress: (Math.min(total, 200) / 200) * 100,
      description: `The player's total rated ${control.label.toLowerCase()} games recorded by Chess.com.`,
    },
    {
      label: 'All-format appearances',
      value: allFormatGames.toLocaleString(),
      progress: (Math.min(allFormatGames, 10000) / 10000) * 100,
      description: 'Combined rated appearances across rapid, blitz and bullet.',
    },
  ]

  if (Number.isFinite(attributeStats?.sampleGames)) {
    metrics.splice(1, 0, {
      label: attributeStats.extendedSample
        ? `Extended ${attributeStats.sampleMonths}-month sample`
        : '12-month scouting sample',
      value: attributeStats.sampleGames.toLocaleString(),
      progress: (Math.min(attributeStats.sampleGames, 100) / 100) * 100,
      description: attributeStats.extendedSample
        ? `Games analysed for the rolling attributes. The usual 12-month window extended to ${attributeStats.sampleMonths} months to strengthen a sparse sample.`
        : 'Games analysed for PAC, PAS, DRI and DEF across the latest 12-month scouting window.',
    })
  }

  if (Number.isFinite(tactics)) {
    const tacticsScore = card.attributes.find((attribute) => attribute.label === 'SHO')?.value ?? card.ovr
    metrics.push({
      label: 'Tactics rating',
      value: tactics.toLocaleString(),
      progress: ((tacticsScore - 40) / 55) * 100,
      description: "The player's highest public Chess.com tactics rating. It informs SHO, with unusually weak or stale evidence checked against current playing strength.",
    })
  }

  if (Number.isFinite(puzzleRush)) {
    metrics.push({
      label: 'Puzzle Rush ceiling',
      value: puzzleRush.toLocaleString(),
      progress: Math.min(100, (puzzleRush / 80) * 100),
      description: "The player's best public Chess.com Puzzle Rush score, used to assign the Skill Moves star rating.",
    })
  }

  return metrics
}

function ScoutingMetric({ metric }) {
  const [expanded, setExpanded] = useState(false)
  const descriptionId = useId()

  return (
    <div className={`scouting-metric-help ${expanded ? 'is-open' : ''}`}>
      <button
        type="button"
        className="scouting-metric"
        aria-describedby={descriptionId}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        onBlur={() => setExpanded(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setExpanded(false)
        }}
      >
        <div>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </div>
        <span
          className="scouting-track"
          role="progressbar"
          aria-label={`${metric.label}: ${metric.value}`}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(metric.progress)}
        >
          <i style={{ width: `${Math.max(2, metric.progress)}%` }} />
        </span>
      </button>
      <span className="scouting-metric-tooltip" id={descriptionId} role="tooltip">
        {metric.description}
      </span>
    </div>
  )
}

export default function ScoutingReport({ players, selectedControl, revealed = true, animateEntrance = false }) {
  const skillMoveRatings = players
    .map((player) => ({ username: player.username, rating: getSkillMoves(player.stats) }))
    .filter((player) => player.rating)

  return (
    <section
      className={`scouting-panel ${players.length > 1 ? 'scouting-comparison' : ''} ${animateEntrance ? 'scouting-entrance' : ''} ${revealed ? 'is-revealed' : ''}`}
    >
      <div className="panel-heading scouting-heading">
        <div>
          <span>RECRUITMENT REPORT</span>
          <h2>{selectedControl.label} scout brief</h2>
        </div>
        {skillMoveRatings.length > 0 && (
          <div className="scouting-skill-moves">
            {skillMoveRatings.map((player) => (
              <SkillMoves
                className="report-skill-moves"
                key={player.username}
                label={players.length > 1 ? `Skill Moves / ${player.username}` : 'Skill Moves'}
                rating={player.rating}
              />
            ))}
          </div>
        )}
      </div>

      <div className="scouting-players">
        {players.map((player, playerIndex) => {
          const attributeStats = player.attributeStats?.[selectedControl.id]
          const profile = getScoutingProfile(
            player.stats,
            selectedControl,
            player.position,
            attributeStats,
            player.openingStyle,
          )
          const allFormatGames = getTotalRatedGames(player.stats)

          return (
            <article
              className="scouting-player"
              key={player.username}
              style={{ '--scout-delay': `${playerIndex * 0.08}s` }}
            >
              <header className="scouting-player-header">
                <div>
                  <span className="scouted-player-label">SCOUTED PLAYER</span>
                  <h3>{player.username}</h3>
                  <PlayerStatusBadge
                    rating={profile.card.rating}
                    totalGames={profile.card.total}
                    allFormatGames={allFormatGames}
                    controlId={selectedControl.id}
                  />
                </div>
                <div className={`scout-confidence confidence-${profile.confidence.key}`}>
                  <span>{profile.confidence.label}</span>
                  <small>{profile.confidence.detail}</small>
                </div>
              </header>

              <div className="scouting-assessment">
                <ScoutingRadar
                  attributes={profile.card.attributes}
                  username={player.username}
                />

                <div className="scout-notes">
                  <div className="scout-verdict">
                    <span>SCOUT VERDICT</span>
                    <p>{profile.verdict}</p>
                  </div>

                  {(profile.strengths.length > 0 || profile.development.length > 0) && (
                    <div className={`scout-traits ${!profile.strengths.length || !profile.development.length ? 'single-trait-group' : ''}`}>
                      {profile.strengths.length > 0 && (
                        <div className="strength-traits">
                          <span>Key strengths</span>
                          {profile.strengths.map((trait) => (
                            <strong key={trait.label}><i>+</i>{trait.name}</strong>
                          ))}
                        </div>
                      )}
                      {profile.development.length > 0 && (
                        <div className="development-traits">
                          <span>Development areas</span>
                          {profile.development.map((trait) => (
                            <strong key={trait.label}><i>&ndash;</i>{trait.name}</strong>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="scouting-metrics">
                {getReport(player.stats, selectedControl, attributeStats).map((metric) => (
                  <ScoutingMetric key={metric.label} metric={metric} />
                ))}
              </div>
              <div className="scouting-highlights">
                <div>
                  <span>Playing archetype</span>
                  <strong className="scouting-archetype">{profile.archetype.label}</strong>
                </div>
                <div>
                  <span>Form status</span>
                  <StreakLabel summary={player.recentSummary} />
                </div>
                {player.recentSummary?.bestWin && (
                  <div>
                    <span>Statement result</span>
                    <strong>
                      {player.recentSummary.bestWin.opponent}
                      {' '}&bull; {player.recentSummary.bestWin.opponentRating}
                    </strong>
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
      <ScoutingDisclaimer />
    </section>
  )
}
