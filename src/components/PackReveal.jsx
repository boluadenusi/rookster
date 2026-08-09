import { useEffect, useRef, useState } from 'react'

function PackFragment({ side }) {
  return (
    <span className={`pack-cut-piece pack-cut-${side}`} aria-hidden="true">
      <span className="pack-cut-face">
        <span className="rookster-logo pack-logo" />
        <span className="pack-cta">Open player pack</span>
      </span>
    </span>
  )
}

export default function PackReveal({
  children,
  playerCount = 1,
  tier = 'gold',
  onOpen,
  initiallyOpened = false,
}) {
  const [opened, setOpened] = useState(initiallyOpened)
  const [slicing, setSlicing] = useState(false)
  const openingTimer = useRef(null)

  useEffect(() => () => window.clearTimeout(openingTimer.current), [])

  function openPack() {
    if (opened || slicing) return
    onOpen?.()

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setOpened(true)
      return
    }

    setSlicing(true)
    openingTimer.current = window.setTimeout(() => setOpened(true), 500)
  }

  return (
    <div className={`pack-reveal reveal-${tier} ${slicing ? 'is-slicing' : ''} ${opened ? 'is-open' : ''} ${initiallyOpened ? 'is-restored' : ''}`}>
      <div className="sealed-pack-shell">
        <button
          type="button"
          className="sealed-pack"
          onClick={openPack}
          aria-expanded={opened}
          aria-busy={slicing && !opened}
          aria-label={`Open ${playerCount === 2 ? 'comparison' : 'scouted player'} pack`}
        >
          <span className="pack-shine" aria-hidden="true" />
          <span className="rookster-logo pack-logo" aria-hidden="true" />
          <span className="pack-cta">Open player pack</span>
        </button>
        <PackFragment side="upper" />
        <PackFragment side="lower" />
        <span className="pack-slice-line" aria-hidden="true" />
      </div>
      <div className="revealed-cards" aria-hidden={!opened}>
        {children}
      </div>
    </div>
  )
}
