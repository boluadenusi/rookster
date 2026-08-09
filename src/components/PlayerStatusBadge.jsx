import { useId, useState } from 'react'
import { getPlayerStatus } from '../utils/playerStatus.js'

function appearanceLabel(count) {
  return `${count.toLocaleString()} rated ${count === 1 ? 'appearance' : 'appearances'}`
}

export default function PlayerStatusBadge({
  rating,
  totalGames = 0,
  allFormatGames = totalGames,
  controlId = 'rapid',
  compact = false,
}) {
  const [expanded, setExpanded] = useState(false)
  const tooltipId = useId()
  const status = getPlayerStatus(rating, totalGames, controlId, allFormatGames)
  const formatName = `${controlId.charAt(0).toUpperCase()}${controlId.slice(1)}`
  const formatSample = appearanceLabel(totalGames)
  const careerSample = appearanceLabel(allFormatGames)
  const rationale = status.careerAdjusted
    ? `${status.label} — an experienced overall campaign rules out a junior profile: ${careerSample} across all formats, with a ${rating.toLocaleString()} ${formatName} rating.`
    : `${status.label} — a ${rating.toLocaleString()} ${formatName} rating assessed over ${formatSample}, backed by ${careerSample} across all formats.`

  return (
    <span className={`player-status-help ${expanded ? 'is-open' : ''}`}>
      <button
        type="button"
        className={`player-status status-${status.tier} ${compact ? 'player-status-compact' : ''}`}
        aria-describedby={tooltipId}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        onBlur={() => setExpanded(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setExpanded(false)
        }}
      >
        <span><small>Scout status</small>{status.label}</span>
      </button>
      <span className="player-status-tooltip" id={tooltipId} role="tooltip">
        {rationale}
      </span>
    </span>
  )
}
