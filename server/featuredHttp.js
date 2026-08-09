import { AttributeServiceError } from './cachedAttributes.js'
import { getFeaturedPlayerSnapshot } from './featuredPlayers.js'
import { createInMemoryRateLimiter, getRequestIp } from './http.js'

const DEFAULT_DEADLINE_MS = 90_000
const defaultRateLimiter = createInMemoryRateLimiter({ limit: 60 })

function configuredDeadline(dependencies) {
  if (Number.isFinite(dependencies.deadlineMs) && dependencies.deadlineMs > 0) {
    return dependencies.deadlineMs
  }
  const environmentValue = Number(process.env.FEATURED_REQUEST_DEADLINE_MS)
  return Number.isFinite(environmentValue) && environmentValue > 0
    ? environmentValue
    : DEFAULT_DEADLINE_MS
}

export async function runFeaturedRequest({ method = 'GET', ip } = {}, dependencies = {}) {
  const headers = {
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  }
  if (method.toUpperCase() !== 'GET') {
    return { status: 405, body: { error: 'Method not allowed.' }, headers: { ...headers, Allow: 'GET' } }
  }

  const rate = (dependencies.rateLimiter ?? defaultRateLimiter).consume(ip)
  if (!rate.allowed) {
    return {
      status: 429,
      body: { error: 'Too many featured-card requests. Please wait a moment.' },
      headers: { ...headers, 'Retry-After': String(rate.retryAfter) },
    }
  }

  const controller = new AbortController()
  const deadlineMs = configuredDeadline(dependencies)
  const timeoutId = setTimeout(() => controller.abort('deadline'), deadlineMs)
  const serviceDependencies = { ...dependencies, signal: controller.signal }
  delete serviceDependencies.deadlineMs
  delete serviceDependencies.rateLimiter

  try {
    const deadline = new Promise((resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(
        new AttributeServiceError('The featured report refresh exceeded its deadline.', 504),
      ), { once: true })
    })
    const snapshot = await Promise.race([
      getFeaturedPlayerSnapshot(serviceDependencies),
      deadline,
    ])
    return { status: 200, body: snapshot, headers }
  } catch (error) {
    const status = Number(error.status) || 500
    return {
      status,
      body: {
        error: status === 504
          ? 'The featured reports took too long to refresh.'
          : 'Featured reports are temporarily unavailable.',
      },
      headers,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

export function createNodeFeaturedHandler(dependencies = {}) {
  return async function featuredHandler(request, response) {
    const result = await runFeaturedRequest(
      { method: request.method, ip: getRequestIp(request) },
      dependencies,
    )
    for (const [name, value] of Object.entries(result.headers ?? {})) response.setHeader(name, value)
    response.statusCode = result.status
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify(result.body))
  }
}
