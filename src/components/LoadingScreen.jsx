import { useEffect, useState } from 'react'

const BOARD_SQUARES = Array.from({ length: 64 })

export default function LoadingScreen({ primaryName, opponentName }) {
  const [activePhase, setActivePhase] = useState(0)
  const isComparison = Boolean(opponentName)
  const phases = [
    'Compiling scout reports',
    'Watching previous matches',
    'Checking current ratings',
    isComparison ? 'Reviewing recent meetings' : 'Reading tactical tendencies',
    isComparison ? 'Preparing the opposition brief' : 'Assigning the player role',
  ]

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActivePhase((phase) => (phase + 1) % phases.length)
    }, 1400)

    return () => window.clearInterval(timer)
  }, [phases.length])

  return (
    <section
      className="loading-screen"
      role="status"
      aria-live="polite"
      aria-label={isComparison ? 'Preparing player comparison' : 'Preparing player card'}
    >
      <div className="loading-visual" aria-hidden="true">
        <div className="loading-board">
          {BOARD_SQUARES.map((_, index) => <i key={index} />)}
          <span className="loading-board-rook">&#9820;</span>
          <span className="loading-board-king">&#9818;</span>
          <b className="loading-board-scan" />
        </div>
      </div>

      <div className="loading-copy">
        <span className="loading-kicker">ROOKSTER SCOUTING ROOM</span>
        <h1>{isComparison ? 'Scouting the matchup.' : 'Scouting the player.'}</h1>
        <p className="loading-players">
          <strong>{primaryName}</strong>
          {isComparison && <><span>VS</span><strong>{opponentName}</strong></>}
        </p>
        <div className="loading-status-line" aria-live="polite">
          <i aria-hidden="true" />
          <span key={activePhase}>{phases[activePhase]}</span>
        </div>
      </div>
    </section>
  )
}
