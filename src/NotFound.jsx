import { ArrowLeft, SearchX } from 'lucide-react'
import { Link } from 'react-router-dom'
import SiteFooter from './components/SiteFooter.jsx'
import SiteNav from './components/SiteNav.jsx'
import useDocumentTitle from './utils/useDocumentTitle.js'

export default function NotFound() {
  useDocumentTitle('rookster | Page not found')

  return (
    <main>
      <SiteNav />

      <section className="not-found-page">
        <div className="not-found-copy">
          <span className="section-kicker"><SearchX size={15} /> SCOUTING TRAIL LOST</span>
          <p className="not-found-code" aria-hidden="true">404</p>
          <h1>This fixture isn&apos;t<br />on the board.</h1>
          <p>The route has gone missing from today&apos;s team sheet. Return to the scouting room and open a verified player report.</p>
          <Link className="not-found-action" to="/">
            <ArrowLeft size={17} /> Return to the scouting desk
          </Link>
        </div>

        <div className="not-found-emblem" aria-hidden="true">
          <span className="rookster-logo" />
          <i />
          <b>NO FIXTURE</b>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
