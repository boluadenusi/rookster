import { getGeneratedCardCount, recordGeneratedCards } from './cardCount.js'
import { createInMemoryRateLimiter, getRequestIp } from './http.js'

const postRateLimiter = createInMemoryRateLimiter({ limit: 12 })

async function readJsonBody(request) {
  if (request.body && typeof request.body === 'object') return request.body

  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 8_192) throw Object.assign(new Error('Request body is too large.'), { status: 413 })
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 })
  }
}

export async function runCardCountRequest(
  { method = 'GET', ip, body = {} } = {},
  dependencies = {},
) {
  const normalizedMethod = method.toUpperCase()
  const baseHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  }

  try {
    if (normalizedMethod === 'GET') {
      const count = await getGeneratedCardCount(dependencies)
      return {
        status: 200,
        body: { count },
        headers: { ...baseHeaders, 'Cache-Control': 'public, max-age=60' },
      }
    }

    if (normalizedMethod === 'POST') {
      const rate = (dependencies.rateLimiter ?? postRateLimiter).consume(ip)
      if (!rate.allowed) {
        return {
          status: 429,
          body: { error: 'Too many generation events. Please wait a moment.' },
          headers: {
            ...baseHeaders,
            'Cache-Control': 'no-store',
            'Retry-After': String(rate.retryAfter),
          },
        }
      }
      const result = await recordGeneratedCards({ ...body, ...dependencies })
      return {
        status: 200,
        body: result,
        headers: { ...baseHeaders, 'Cache-Control': 'no-store' },
      }
    }

    return {
      status: 405,
      body: { error: 'Method not allowed.' },
      headers: { ...baseHeaders, 'Cache-Control': 'no-store', Allow: 'GET, POST' },
    }
  } catch (error) {
    const status = Number(error.status) || 500
    return {
      status,
      body: {
        error: status >= 500
          ? 'The card tally is temporarily unavailable.'
          : error.message,
      },
      headers: { ...baseHeaders, 'Cache-Control': 'no-store' },
    }
  }
}

export function createNodeCardCountHandler(dependencies = {}) {
  return async function cardCountHandler(request, response) {
    let body = {}
    let result
    try {
      if (request.method?.toUpperCase() === 'POST') body = await readJsonBody(request)
      result = await runCardCountRequest(
        { method: request.method, ip: getRequestIp(request), body },
        dependencies,
      )
    } catch (error) {
      result = {
        status: Number(error.status) || 400,
        body: { error: error.message },
        headers: { 'Cache-Control': 'no-store' },
      }
    }

    for (const [name, value] of Object.entries(result.headers ?? {})) response.setHeader(name, value)
    response.statusCode = result.status
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify(result.body))
  }
}
