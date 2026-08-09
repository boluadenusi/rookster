import { useEffect, useState } from 'react'
import { getGeneratedCardCount } from '../api.js'

const formatter = new Intl.NumberFormat('en')

export default function CardGenerationCount() {
  const [count, setCount] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const updateCount = (event) => {
      if (Number.isFinite(event.detail?.count)) setCount(event.detail.count)
    }
    window.addEventListener('rookster:card-count-updated', updateCount)
    getGeneratedCardCount({ signal: controller.signal })
      .then(setCount)
      .catch(() => {})

    return () => {
      controller.abort()
      window.removeEventListener('rookster:card-count-updated', updateCount)
    }
  }, [])

  return (
    <div className={`card-generation-count ${count === null ? 'is-loading' : ''}`} aria-live="polite">
      <strong>{count === null ? '—' : formatter.format(count)}</strong>
      <small>scout cards generated</small>
    </div>
  )
}
