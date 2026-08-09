import { ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function SiteNav({ onHowItWorks = false }) {
  return (
    <nav className="nav-shell" aria-label="Main navigation">
      <Link className="brand" to="/" aria-label="rookster home">
        <span className="rookster-logo brand-logo" aria-hidden="true" />
        <span>rookster</span>
      </Link>
      <div className="nav-actions">
        <Link className="nav-link" to={onHowItWorks ? '/' : '/how-it-works'}>
          {onHowItWorks ? 'Open scouting desk' : 'Scouting model'}
        </Link>

      </div>
    </nav>
  )
}
