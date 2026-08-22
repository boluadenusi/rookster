import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getFeaturedPlayers } from '../api.js'
import { buildCardStats, getAvailableControls, getDefaultControl } from '../utils.js'
import { resolvePosition } from '../utils/position.js'
import Card from './Card.jsx'

let featuredPlayersRequest

function loadFeaturedPlayers() {
  featuredPlayersRequest ??= getFeaturedPlayers().then((players) => players.map((player) => {
    const availableControls = getAvailableControls(player.stats)
      .filter((control) => player.attributeStats?.[control.id])
    const selectedControl = getDefaultControl(availableControls)
    if (!selectedControl) throw new Error('No supported live rating')
    const card = buildCardStats(
      player.stats,
      selectedControl,
      player.attributeStats[selectedControl.id],
    )

    return {
      ...player,
      username: player.profile.username,
      availableControls,
      selectedControl,
      position: resolvePosition(card.attributes),
    }
  }))

  return featuredPlayersRequest
}

function showroomSlot(index, activeIndex, count) {
  if (index === activeIndex) return 'showroom-center'
  if (count > 2 && index === (activeIndex - 1 + count) % count) return 'showroom-left'
  if (index === (activeIndex + 1) % count) return 'showroom-right'
  return 'showroom-hidden'
}

export default function HomepageSpecimens() {
  const [specimens, setSpecimens] = useState([])
  const [loadComplete, setLoadComplete] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    let mounted = true
    loadFeaturedPlayers()
      .then((players) => {
        if (mounted) setSpecimens(players)
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoadComplete(true)
      })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (
      specimens.length < 2
      || isPaused
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return undefined
    }
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % specimens.length)
    }, 4800)

    return () => window.clearInterval(interval)
  }, [isPaused, specimens.length])

  function moveActive(direction) {
    setActiveIndex((current) => (current + direction + specimens.length) % specimens.length)
  }

  if (!specimens.length) {
    return (
      <div
        className="homepage-card-dial homepage-card-dial-loading"
        aria-label={loadComplete ? 'Featured scout reports unavailable' : 'Loading featured scout reports'}
      >
        {loadComplete ? (
          <span>Featured reports temporarily unavailable</span>
        ) : (
          <span className="featured-box-loader" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        )}
      </div>
    )
  }

  return (
    <nav
      className="homepage-card-dial"
      aria-label="Featured scout reports"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsPaused(false)
      }}
    >
      <div className="homepage-showroom-light" aria-hidden="true" />
      <div className="homepage-showroom-platform" aria-hidden="true">
        <span className="homepage-showroom-platform-base" />
        <span className="homepage-showroom-platform-deck" />
      </div>
      <div className="homepage-card-dial-track">
        {specimens.map((specimen, index) => {
          const slot = showroomSlot(index, activeIndex, specimens.length)
          const isActive = slot === 'showroom-center'
          return (
            <div
              aria-hidden={!isActive || undefined}
              className={`homepage-specimen ${slot}`}
              key={specimen.username}
            >
              <div className="homepage-specimen-scale" aria-hidden="true" inert="">
                <Card
                  profile={specimen.profile}
                  stats={specimen.stats}
                  selectedControl={specimen.selectedControl}
                  pendingControl={null}
                  availableControls={[specimen.selectedControl]}
                  onControlChange={() => {}}
                  position={specimen.position}
                  attributeStats={specimen.attributeStats[specimen.selectedControl.id]}
                />
              </div>
              <Link
                className="homepage-specimen-link"
                to={`/${encodeURIComponent(specimen.profile.username)}`}
                state={{ scoutingEntry: 'homepage-card' }}
                aria-label={`Open ${specimen.profile.username}'s scout report`}
                tabIndex={isActive ? 0 : -1}
              />
            </div>
          )
        })}
      </div>
      <div className="homepage-showroom-controls">
        <button type="button" onClick={() => moveActive(-1)} aria-label="Previous featured player">
          <ChevronLeft size={15} />
        </button>
        <div className="homepage-showroom-dots" aria-label="Choose featured player">
          {specimens.map((specimen, index) => (
            <button
              type="button"
              className={index === activeIndex ? 'is-active' : ''}
              onClick={() => setActiveIndex(index)}
              aria-label={`Show ${specimen.profile.username}`}
              aria-current={index === activeIndex ? 'true' : undefined}
              key={`dot-${specimen.username}`}
            />
          ))}
        </div>
        <button type="button" onClick={() => moveActive(1)} aria-label="Next featured player">
          <ChevronRight size={15} />
        </button>
      </div>
    </nav>
  )
}
