import { Redis } from '@upstash/redis'

export function createUpstashStorage({
  url = process.env.UPSTASH_REDIS_REST_URL,
  token = process.env.UPSTASH_REDIS_REST_TOKEN,
} = {}) {
  let client
  let incrementOnceScript

  function getClient() {
    if (!url || !token) {
      throw new Error(
        'Upstash Redis is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
      )
    }

    client ??= new Redis({ url, token })
    return client
  }

  function getIncrementOnceScript() {
    incrementOnceScript ??= getClient().createScript(`
      if redis.call('EXISTS', KEYS[2]) == 1 then
        return { tonumber(redis.call('GET', KEYS[1]) or '0'), 0 }
      end
      redis.call('SET', KEYS[2], '1', 'EX', ARGV[2])
      local count = redis.call('INCRBY', KEYS[1], ARGV[1])
      return { count, 1 }
    `)
    return incrementOnceScript
  }

  return {
    async get(key) {
      return getClient().get(key)
    },

    async set(key, value, { expirationSeconds } = {}) {
      const options = Number.isFinite(expirationSeconds) && expirationSeconds > 0
        ? { ex: Math.round(expirationSeconds) }
        : undefined
      await getClient().set(key, value, options)
    },

    async incrementOnce(counterKey, eventKey, amount, { expirationSeconds } = {}) {
      const safeAmount = Math.max(1, Math.round(Number(amount) || 1))
      const safeExpiration = Math.max(60, Math.round(Number(expirationSeconds) || 604800))
      const result = await getIncrementOnceScript().exec(
        [counterKey, eventKey],
        [String(safeAmount), String(safeExpiration)],
      )
      return {
        count: Number(result?.[0]) || 0,
        incremented: Number(result?.[1]) === 1,
      }
    },
  }
}

export const attributeStorage = createUpstashStorage()
