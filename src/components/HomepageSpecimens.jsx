import { useEffect, useMemo, useState } from 'react'
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

function dialSlot(index, activeIndex) {
  const distance = index - activeIndex
  if (distance <= -2) return 'dial-above'
  if (distance === -1) return 'dial-top'
  if (distance === 0) return 'dial-center'
  if (distance === 1) return 'dial-bottom'
  return 'dial-below'
}

export default function HomepageSpecimens() {
  const [specimens, setSpecimens] = useState([])
  const [loadComplete, setLoadComplete] = useState(false)
  const [activeIndex, setActiveIndex] = useState(1)
  const [isResetting, setIsResetting] = useState(false)

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

  const loopedSpecimens = useMemo(() => {
    if (!specimens.length) return []
    return [specimens.at(-1), ...specimens, specimens[0], specimens[1] ?? specimens[0]]
  }, [specimens])

  useEffect(() => {
    if (specimens.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined
    }
    const interval = window.setInterval(() => {
      setActiveIndex((current) => current + 1)
    }, 4000)

    return () => window.clearInterval(interval)
  }, [specimens.length])

  useEffect(() => {
    if (!specimens.length || activeIndex !== specimens.length + 1) return undefined

    const reset = window.setTimeout(() => {
      setIsResetting(true)
      setActiveIndex(1)
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setIsResetting(false))
      })
    }, 1050)

    return () => window.clearTimeout(reset)
  }, [activeIndex, specimens.length])

  if (!loopedSpecimens.length) {
    return (
      <div
        className="homepage-card-dial homepage-card-dial-loading"
        aria-label={loadComplete ? 'Featured scout reports unavailable' : 'Loading featured scout reports'}
      >
        {loadComplete ? (
          <span>Featured reports temporarily unavailable</span>
        ) : (
          <span className="featured-rook-loader" aria-hidden="true">
            <i className="featured-rook-track" />
            <b>&#9820;</b>
          </span>
        )}
      </div>
    )
  }

  return (
    <nav
      className={`homepage-card-dial ${isResetting ? 'is-resetting' : ''}`}
      aria-label="Featured scout reports"
    >
      <div className={`homepage-card-dial-track ${isResetting ? 'is-resetting' : ''}`}>
        {loopedSpecimens.map((specimen, index) => {
          const isClone = index === 0 || index > specimens.length
          return (
            <div
              aria-hidden={isClone || undefined}
              className={`homepage-specimen ${dialSlot(index, activeIndex)}`}
              key={`${specimen.username}-${index}`}
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
                tabIndex={isClone ? -1 : 0}
              />
            </div>
          )
        })}
      </div>
      <span className="homepage-dial-pointer" aria-hidden="true">
        {loopedSpecimens.map((specimen, index) => (
          <span
            className={`homepage-dial-tick ${dialSlot(index, activeIndex)}`}
            key={`tick-${specimen.username}-${index}`}
          />
        ))}
      </span>
    </nav>
  )
}
