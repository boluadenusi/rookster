# rookster

rookster turns a public Chess.com profile into a downloadable, football-card-inspired chess player card.

## Run locally

Create a `.env` file with your Upstash REST credentials:

```bash
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

Node 20 or newer is required. Optional endpoint safeguards can also be tuned:

```bash
ATTRIBUTE_REQUEST_DEADLINE_MS=50000
ATTRIBUTE_RATE_LIMIT_PER_MINUTE=30
FEATURED_REQUEST_DEADLINE_MS=90000
```

Then install and start the app:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Checks

```bash
npm test
npm run build
npm run test:e2e
```

The browser smoke suite uses the locally installed stable Chrome channel and covers the homepage, direct player routes, remembered pack restoration, time-control switching, comparison mode, and the 404 route with deterministic mocked Chess.com data.

## Production build

```bash
npm run build
npm run preview
```

## How it works

- Fetches public profile and ratings from Chess.com, walking backward through monthly archives only when needed to collect the five most recent games.
- Calculates OVR, SHO, PHY, peak rating, form, and position from the existing live profile data. Each face attribute is calibrated around the selected format's Elo-derived OVR, while SHO discounts tactics evidence that is implausibly far below the player's current playing strength.
- Calculates PAC, PAS, DRI, and DEF for every available time control in one shared rolling-window request before opening the report. Sparse formats extend backward only until 20 games are found, with a hard limit of 24 months.
- Changes the card finish across bronze, silver, gold, and special OVR tiers.
- Supports two-player comparisons, Puzzle Rush skill moves, six-stat position inference, opening-style verdict flavor, and a pack-opening reveal.
- Adds a selected-time-control scouting report with rating, form percentages, activity, tactics, and Puzzle Rush context.
- Exports the card as a clean PNG, branded square post, or vertical story graphic with player and Rookster attribution.
- Regenerates live cards from shareable URLs such as `/hikaru` and optional comparisons such as `?compare=MagnusCarlsen`. Legacy `/card/username` links redirect to the canonical profile URL.
- Explains the scouting model in plain language at `/how-it-works`.

No login or Chess.com API key is required. The aggregation endpoint needs the two server-only Upstash variables shown above; never expose them through `VITE_` variables or client code.

## Attribute endpoint

The client compiles every available tab with one request:

```text
GET /api/attributes?username=hikaru&timeControl=all
```

The original single-format form, such as `timeControl=rapid`, remains supported as a compatibility fallback.

The framework-independent implementation lives in `server/`. Ready-made adapters are included for:

- Vercel: `api/attributes.js`
- Express or another Node HTTP server: mount the handler returned by `createNodeAttributeHandler()` from `server/http.js`
- Local Vite development and preview: configured automatically in `vite.config.js`

On a first request or Redis eviction, the endpoint fetches the latest 12 monthly archives once and aggregates rapid, blitz, and bullet together. If any available format has fewer than 20 games, the shared walk continues only until every format reaches 20 games or the 24-month limit. Archives are never fetched separately per format. Later requests refresh the active archive once for all formats. Redis stores versioned monthly numeric totals plus up to 100 compact opening identifiers per format per retained month, never raw games. Records expire after 30 days without use and older cache formats rebuild automatically on their next request.

The endpoint validates Chess.com usernames, coalesces identical in-flight compilations, applies a moderate per-process/IP request limit, aborts slow Chess.com fetches, and returns a clean timeout response when the overall compilation deadline is exceeded. For horizontally scaled production hosting, add the host's edge-level rate limiting as a second layer.

## Featured homepage cards

The homepage makes one request to `GET /api/featured`. Its five featured cards are compiled with the same live model as full player reports and saved as one compact Upstash snapshot. A snapshot is fresh for 24 hours. The stored copy is retained for 48 hours so yesterday's cards can still be served if Chess.com is temporarily unavailable during the next daily refresh. Simultaneous refresh requests share one in-process build.

## Generated-card tally

`GET /api/card-count` returns the public tally and `POST /api/card-count` records a completed, user-initiated generation. Solo reports add one card and comparisons add two. A random event ID is written atomically alongside the counter in Upstash, so client retries cannot count the same generation twice. Reloads, shared URLs, format switches, exports, and homepage specimen cards do not increment the tally.

## Browser note

The app depends on public Chess.com data and images. Network errors and API rate limits are handled in the interface. Card export works best after the player avatar and flag have finished loading.

### SPA fallback for share links

Direct browser loads of `/username`, legacy `/card/username` links, or `/how-it-works` must be rewritten to `index.html` by the chosen host while `/api/*` remains routed to the Node-compatible backend function. Configure production security headers at that same host boundary.
