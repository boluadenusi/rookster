import { forwardRef } from 'react'
import { buildCardStats, getCountryCode } from '../utils.js'
import { getCardTier } from '../utils/cardTier.js'

const Card = forwardRef(function Card(
  {
    profile,
    stats,
    selectedControl,
    pendingControl,
    availableControls,
    onControlChange,
    position,
    comparisonStats,
    attributeStats,
    comparisonAttributeStats,
  },
  ref,
) {
  const card = buildCardStats(stats, selectedControl, attributeStats)
  const comparisonCard = comparisonStats
    ? buildCardStats(comparisonStats, selectedControl, comparisonAttributeStats)
    : null
  const tier = getCardTier(card.ovr)
  const countryCode = getCountryCode(profile.country)
  const displayName = profile.username ?? 'Unknown player'
  const title = profile.title

  function handlePointerMove(event) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    event.currentTarget.style.setProperty('--tilt-x', `${(0.5 - y) * 7}deg`)
    event.currentTarget.style.setProperty('--tilt-y', `${(x - 0.5) * 9}deg`)
  }

  function resetPointer(event) {
    event.currentTarget.style.setProperty('--tilt-x', '0deg')
    event.currentTarget.style.setProperty('--tilt-y', '0deg')
  }

  return (
    <article
      className={`player-card card-${tier}`}
      ref={ref}
      aria-label={`${displayName} ${tier} football-style chess scouting card`}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      onPointerUp={resetPointer}
      onPointerCancel={resetPointer}
    >
      <div className="card-noise" aria-hidden="true" />
      <div className="card-topline">
        <span>rookster</span>
        <span>EST. MMXXVI</span>
      </div>

      <div className="card-tabs" role="tablist" aria-label={`${displayName} time control`}>
        {availableControls.map((control) => (
          <button
            type="button"
            role="tab"
            aria-selected={(pendingControl?.id ?? selectedControl.id) === control.id}
            aria-busy={pendingControl?.id === control.id}
            className={(pendingControl?.id ?? selectedControl.id) === control.id ? 'active' : ''}
            key={control.id}
            onClick={() => onControlChange(control)}
          >
            {control.label}
            {pendingControl?.id === control.id && <span className="tab-loading" aria-hidden="true" />}
          </button>
        ))}
      </div>

      <div className="card-hero">
        <div className="identity-stack">
          <strong className={`ovr ${comparisonCard && card.ovr > comparisonCard.ovr ? 'stat-winner' : ''}`}>
            {card.ovr}
          </strong>
          <span className="ovr-label">OVR</span>
          <span className="position-slot" title="Role inferred from the six scouting attributes">{position}</span>
          {countryCode ? (
            <img
              className="flag"
              src={`https://flagcdn.com/${countryCode}.svg`}
              alt={`${countryCode.toUpperCase()} flag`}
              crossOrigin="anonymous"
            />
          ) : (
            <span className="flag-placeholder" aria-label="Country unavailable">&#9671;</span>
          )}
        </div>

        <div className="portrait-wrap">
          <div className="portrait-halo" aria-hidden="true" />
          {profile.avatar ? (
            <img className="portrait" src={profile.avatar} alt={`${displayName} avatar`} crossOrigin="anonymous" />
          ) : (
            <div className="portrait portrait-placeholder" role="img" aria-label="Rook silhouette">&#9820;</div>
          )}
        </div>
      </div>

      <div className="player-heading">
        <div className="name-row">
          <h2>{displayName}</h2>
          {title && <span className="title-badge">{title}</span>}
        </div>
        <div className="rating-line">
          <span>{selectedControl.label}</span>
          <strong>{card.rating.toLocaleString()}</strong>
          {Number.isFinite(card.peak) && <span className="peak-pill">Peak {card.peak.toLocaleString()}</span>}
        </div>
      </div>

      <div className="rule" aria-hidden="true"><span>&#9820;</span></div>

      <div className="attributes" aria-label="Scouting attributes">
        {card.attributes.map((attribute, index) => (
          <div
            className={`attribute ${comparisonCard && attribute.value > comparisonCard.attributes[index].value ? 'stat-winner' : ''}`}
            key={attribute.label}
          >
            <strong>{attribute.value}</strong>
            <span>{attribute.label}</span>
          </div>
        ))}
      </div>

      <span className="rookster-logo card-footer-logo" aria-hidden="true" />
    </article>
  )
})

export default Card
