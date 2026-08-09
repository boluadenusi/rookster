import { attributeStorage } from './storage.js'

const COUNTER_KEY = 'rookster:metrics:cards-generated:v1'
const EVENT_PREFIX = 'rookster:metrics:card-event:v1:'
const EVENT_TTL_SECONDS = 7 * 24 * 60 * 60
const EVENT_ID_PATTERN = /^[a-z0-9-]{16,80}$/i

export class CardCountError extends Error {
  constructor(message, status = 500) {
    super(message)
    this.name = 'CardCountError'
    this.status = status
  }
}

export async function getGeneratedCardCount({ storage = attributeStorage } = {}) {
  const value = Number(await storage.get(COUNTER_KEY))
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export async function recordGeneratedCards({
  eventId,
  cardCount,
  storage = attributeStorage,
} = {}) {
  const normalizedEventId = eventId?.trim().toLowerCase()
  const amount = Number(cardCount)
  if (!normalizedEventId || !EVENT_ID_PATTERN.test(normalizedEventId)) {
    throw new CardCountError('A valid generation event is required.', 400)
  }
  if (amount !== 1 && amount !== 2) {
    throw new CardCountError('A generation may contain one or two cards.', 400)
  }
  if (typeof storage.incrementOnce !== 'function') {
    throw new CardCountError('Atomic card counting is unavailable.', 500)
  }

  return storage.incrementOnce(
    COUNTER_KEY,
    `${EVENT_PREFIX}${normalizedEventId}`,
    amount,
    { expirationSeconds: EVENT_TTL_SECONDS },
  )
}
