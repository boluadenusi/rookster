import { createNodeAttributeHandler } from './http.js'
import { createNodeFeaturedHandler } from './featuredHttp.js'
import { createNodeCardCountHandler } from './cardCountHttp.js'
import { createUpstashStorage } from './storage.js'

export function attributesApiPlugin(env) {
  const storage = createUpstashStorage({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  })
  const handler = createNodeAttributeHandler({ storage })
  const featuredHandler = createNodeFeaturedHandler({ storage })
  const cardCountHandler = createNodeCardCountHandler({ storage })

  const mount = (server) => {
    server.middlewares.use('/api/attributes', handler)
    server.middlewares.use('/api/featured', featuredHandler)
    server.middlewares.use('/api/card-count', cardCountHandler)
  }

  return {
    name: 'rookster-attributes-api',
    configureServer: mount,
    configurePreviewServer: mount,
  }
}
