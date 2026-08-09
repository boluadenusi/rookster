import { Info } from 'lucide-react'

export default function ScoutingDisclaimer() {
  return (
    <p className="scouting-disclaimer">
      <Info aria-hidden="true" />
      <span>Rookster ratings and scout labels reflect only a player&apos;s documented public performance on Chess.com. They are not a complete measure of overall chess ability, career standing, or over-the-board strength.</span>
    </p>
  )
}
