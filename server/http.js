import {
  AttributeServiceError,
  getCachedPlayerAttributeBatch,
  getCachedPlayerAttributes,
} from './cachedAttributes.js'

const DEFAULT_DEADLINE_MS = 50_000
const DEFAULT_RATE_LIMIT = 30
const DEFAULT_RATE_WINDOW_MS = 60_000
const inFlightCompilations = new Map()

function numericEnvironmentValue(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function createInMemoryRateLimiter({
  limit = DEFAULT_RATE_LIMIT,
  windowMs = DEFAULT_RATE_WINDOW_MS,
  now = () => Date.now(),
} = {}) {
  const buckets = new Map()

  return {
    consume(identity) {
      if (!identity) return { allowed: true, remaining: limit }

      const currentTime = now()
      const existing = buckets.get(identity)
      const bucket = !existing || currentTime >= existing.resetAt
        ? { count: 0, resetAt: currentTime + windowMs }
        : existing
      bucket.count += 1
      buckets.set(identity, bucket)

      if (buckets.size > 5_000) {
        for (const [key, value] of buckets) {
          if (currentTime >= value.resetAt) buckets.delete(key)
        }
      }

      return {
        allowed: bucket.count <= limit,
        remaining: Math.max(0, limit - bucket.count),
        retryAfter: Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000)),
      }
    },
  }
}

const defaultRateLimiter = createInMemoryRateLimiter({
  limit: numericEnvironmentValue('ATTRIBUTE_RATE_LIMIT_PER_MINUTE', DEFAULT_RATE_LIMIT),
})

function publicError(status, error) {
  if (status === 504) return 'The scouting report took too long to compile. Please try again.'
  if (status >= 500) return 'The scouting service is temporarily unavailable. Please try again shortly.'
  return error?.message ?? 'The cached scouting attributes could not be compiled.'
}

function compilationKey(username, timeControl) {
  return `${username?.trim().toLowerCase()}:${timeControl?.trim().toLowerCase()}`
}

function startCompilation({ username, timeControl }, dependencies, deadlineMs) {
  const controller = new AbortController()
  let timeoutId
  const deadline = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort('deadline')
      reject(new AttributeServiceError('The scouting request exceeded its processing deadline.', 504))
    }, deadlineMs)
  })
  const serviceDependencies = { ...dependencies, signal: controller.signal }
  delete serviceDependencies.deadlineMs
  delete serviceDependencies.rateLimiter
  delete serviceDependencies.inFlight

  const compilation = timeControl?.toLowerCase() === 'all'
    ? getCachedPlayerAttributeBatch({ username, ...serviceDependencies })
    : getCachedPlayerAttributes({ username, timeControl, ...serviceDependencies })

  return Promise.race([compilation, deadline]).finally(() => {
    clearTimeout(timeoutId)
  })
}

export async function runAttributeRequest(
  { method = 'GET', username, timeControl, ip },
  dependencies = {},
) {
  const baseHeaders = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  }

  if (method.toUpperCase() !== 'GET') {
    return { status: 405, body: { error: 'Method not allowed.' }, headers: { ...baseHeaders, Allow: 'GET' } }
  }

  const rateLimiter = dependencies.rateLimiter ?? defaultRateLimiter
  const rate = rateLimiter.consume(ip)
  if (!rate.allowed) {
    return {
      status: 429,
      body: { error: 'Too many scouting requests. Please wait a moment and try again.' },
      headers: { ...baseHeaders, 'Retry-After': String(rate.retryAfter) },
    }
  }

  const deadlineMs = dependencies.deadlineMs
    ?? numericEnvironmentValue('ATTRIBUTE_REQUEST_DEADLINE_MS', DEFAULT_DEADLINE_MS)
  const inFlight = dependencies.inFlight ?? inFlightCompilations
  const key = compilationKey(username, timeControl)

  try {
    let compilation = inFlight.get(key)
    if (!compilation) {
      compilation = startCompilation({ username, timeControl }, dependencies, deadlineMs)
      inFlight.set(key, compilation)
      compilation.finally(() => {
        if (inFlight.get(key) === compilation) inFlight.delete(key)
      }).catch(() => {})
    }

    const result = await compilation
    return { status: 200, body: result, headers: baseHeaders }
  } catch (error) {
    const status = Number(error.status) || 500
    return {
      status,
      body: { error: publicError(status, error) },
      headers: baseHeaders,
    }
  }
}

export function getRequestIp(request) {
  const forwarded = request.headers?.['x-forwarded-for']
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]
  return firstForwarded?.trim()
    || request.headers?.['x-real-ip']
    || request.socket?.remoteAddress
    || ''
}

export function createNodeAttributeHandler(dependencies = {}) {
  return async function attributeHandler(request, response) {
    const requestUrl = new URL(request.url, 'http://localhost')
    const username = request.query?.username ?? requestUrl.searchParams.get('username')
    const timeControl = request.query?.timeControl ?? requestUrl.searchParams.get('timeControl')
    const result = await runAttributeRequest(
      { method: request.method, username, timeControl, ip: getRequestIp(request) },
      dependencies,
    )

    for (const [name, value] of Object.entries(result.headers ?? {})) response.setHeader(name, value)
    response.statusCode = result.status
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify(result.body))
  }
}
