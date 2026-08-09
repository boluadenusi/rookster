import { Flame } from 'lucide-react'

export default function StreakLabel({ summary }) {
  const label = summary?.streak || 'No recent form'

  return (
    <strong className={`streak-label ${summary?.winStreak ? 'streak-label-hot' : ''}`}>
      {summary?.winStreak > 0 && <Flame aria-hidden="true" size={13} />}
      <span>{label}</span>
    </strong>
  )
}
