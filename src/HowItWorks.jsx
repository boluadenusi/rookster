import { ArrowLeft, Database, Gauge, ScanSearch, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import SiteFooter from './components/SiteFooter.jsx'
import SiteNav from './components/SiteNav.jsx'
import useDocumentTitle from './utils/useDocumentTitle.js'

const attributes = [
  ['PAC', 'Clock efficiency and speed under pressure.'],
  ['SHO', 'Tactical sharpness from Chess.com tactics performance, checked against current playing strength.'],
  ['PAS', 'How often results outperform rating expectations.'],
  ['DRI', 'Variety and flexibility across recent openings.'],
  ['DEF', 'Resilience when facing stronger opposition.'],
  ['PHY', 'Match experience in the selected format.'],
]

export default function HowItWorks() {
  useDocumentTitle('rookster | The scouting model')

  return (
    <main>
      <SiteNav onHowItWorks />

      <section className="method-page">
        <header className="method-hero">
          <span className="section-kicker">THE SCOUTING MODEL</span>
          <h1>Every grade earns<br />its place.</h1>
          <p>Public chess performance, translated into a football-style scouting report.</p>
          <Link className="method-back" to="/"><ArrowLeft size={16} /> Enter the scouting room</Link>
        </header>

        <div className="method-grid">
          <article className="method-block method-featured">
            <Gauge size={21} />
            <span>01 // PLAYER RATING</span>
            <h2>OVR sets the headline grade.</h2>
            <p>OVR comes from the player's Chess.com rating and is calculated separately for rapid, blitz, and bullet. It runs from 45 to 95, with stronger ratings becoming progressively harder to separate.</p>
          </article>

          <article className="method-block">
            <Database size={21} />
            <span>02 // MATCH SAMPLE</span>
            <h2>Recent play leads the report.</h2>
            <p>Most performance grades use the last 12 months. Sparse profiles can extend to 24 months so the scout still has enough evidence.</p>
          </article>

          <article className="method-block">
            <ScanSearch size={21} />
            <span>03 // FORM GUIDE</span>
            <h2>The last five shape the form read.</h2>
            <p>The five latest games provide recent form, active streaks, the best recent win, and a lightweight read on playing style.</p>
          </article>

          <article className="method-block">
            <ShieldCheck size={21} />
            <span>04 // EVIDENCE READ</span>
            <h2>The sample sets the confidence.</h2>
            <p>Reports are marked Limited, Developing, or High confidence according to how many relevant games are available.</p>
          </article>
        </div>

        <section className="attribute-method">
          <div>
            <span className="section-kicker">SCOUTING ATTRIBUTES</span>
            <h2>Six football-style grades. One consistent model.</h2>
            <p>Each grade runs from 40 to 95. The selected format's OVR sets the baseline, while performance evidence moves individual grades above or below it.</p>
          </div>
          <dl>
            {attributes.map(([label, description]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="method-notes">
          <article>
            <span>INFERRED ROLE</span>
            <h3>CB, DM, CM, CAM, SS, or CF</h3>
            <p>The strongest combination of attacking, creative, or defensive attributes determines the player's role.</p>
          </article>
          <article>
            <span>REPORT CALLS</span>
            <h3>Strengths must stand apart</h3>
            <p>Key strengths and development areas are judged relative to the player's OVR, so every level can show a credible individual profile.</p>
          </article>
          <article>
            <span>CARD CLASS</span>
            <h3>Bronze, silver, gold, special</h3>
            <p>The selected format's OVR determines the card finish and can change when the format changes.</p>
          </article>
          <article>
            <span>PLAYER STATUS</span>
            <h3>Rating meets seniority</h3>
            <p>Status balances playing strength with experience, keeping prospect, established, veteran, and icon labels believable.</p>
          </article>
          <article>
            <span>ARCHETYPE + FLAIR</span>
            <h3>A profile beyond the numbers</h3>
            <p>Puzzle Rush, role, experience, and preferred format shape the archetype and Skill Moves rating.</p>
          </article>
          <article>
            <span>SCOUT DUEL</span>
            <h3>Six attributes decide the edge</h3>
            <p>Comparisons reward the player who wins more attribute battles, with recent meetings shown as supporting context.</p>
          </article>
        </section>
      </section>

      <SiteFooter />
    </main>
  )
}
