import { Star } from 'lucide-react'
import { useId, useState } from 'react'

export default function SkillMoves({ rating, label = 'Skill Moves', className = 'skill-moves' }) {
  const [expanded, setExpanded] = useState(false)
  const descriptionId = useId()
  if (!rating) return null

  return (
    <div className={`skill-moves-help ${expanded ? 'is-open' : ''}`}>
      <button
        type="button"
        className={className}
        aria-label={`${label}: ${rating} out of 5 stars. Show explanation.`}
        aria-describedby={descriptionId}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        onBlur={() => setExpanded(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setExpanded(false)
        }}
      >
        <span>{label}</span>
        <div aria-hidden="true">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star key={star} size={11} fill={star <= rating ? 'currentColor' : 'none'} />
          ))}
        </div>
      </button>
      <span className="skill-moves-tooltip" id={descriptionId} role="tooltip">
        <span>A cosmetic measure of tactical speed, based on the player's best Chess.com Puzzle Rush score.</span>
      </span>
    </div>
  )
}
