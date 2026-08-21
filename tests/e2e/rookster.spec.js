import { expect, test } from '@playwright/test'

const ratings = {
  rapid: { rating: 1500, peak: 1580 },
  blitz: { rating: 1600, peak: 1675 },
  bullet: { rating: 1550, peak: 1620 },
}

function statsPayload({ rapidSpecialist = false } = {}) {
  return {
    chess_rapid: { last: { rating: rapidSpecialist ? 1800 : ratings.rapid.rating }, best: { rating: rapidSpecialist ? 1850 : ratings.rapid.peak }, record: { win: 12, loss: 5, draw: 3 } },
    chess_blitz: { last: { rating: ratings.blitz.rating }, best: { rating: ratings.blitz.peak }, record: { win: 20, loss: 8, draw: 2 } },
    chess_bullet: { last: { rating: ratings.bullet.rating }, best: { rating: ratings.bullet.peak }, record: { win: 15, loss: 10, draw: 5 } },
    tactics: { highest: { rating: 1750 } },
    puzzle_rush: { best: { score: 42 } },
  }
}

function attributePayload(username, { rapidSpecialist = false } = {}) {
  return {
    username,
    attributes: Object.fromEntries(Object.keys(ratings).map((control) => [
      control,
      {
        PAC: control === 'bullet' ? 82 : 76,
        PAS: rapidSpecialist ? 90 : 78,
        DRI: control === 'blitz' ? 84 : 77,
        DEF: 72,
        sampleGames: 30,
        sampleMonths: 12,
        extendedSample: false,
        evidence: {},
      },
    ])),
  }
}

async function mockRooksterData(page, { rapidSpecialistComparison = false } = {}) {
  const tally = { count: 1234, posts: [] }
  await page.route('**/api/card-count', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      tally.posts.push(body)
      tally.count += body.cardCount
      await route.fulfill({ json: { count: tally.count, incremented: true } })
      return
    }
    await route.fulfill({ json: { count: tally.count } })
  })

  await page.route('**/api/featured', async (route) => {
    const usernames = ['MagnusCarlsen', 'grukjr', 'gmjlh', 'GothamChess', 'FabianoCaruana']
    await route.fulfill({
      json: {
        version: 1,
        generatedAt: new Date().toISOString(),
        players: usernames.map((username, index) => ({
          className: `specimen-${index}`,
          profile: { username, title: username === 'MagnusCarlsen' ? 'GM' : undefined },
          stats: statsPayload(),
          attributeStats: attributePayload(username).attributes,
        })),
      },
    })
  })

  await page.route('**/api/attributes?**', async (route) => {
    const url = new URL(route.request().url())
    const username = url.searchParams.get('username') ?? 'tester'
    await route.fulfill({
      json: attributePayload(username.toLowerCase(), {
        rapidSpecialist: rapidSpecialistComparison,
      }),
    })
  })

  await page.route('https://api.chess.com/pub/player/**', async (route) => {
    const url = new URL(route.request().url())
    const parts = url.pathname.split('/').filter(Boolean)
    const playerIndex = parts.indexOf('player')
    const username = decodeURIComponent(parts[playerIndex + 1] ?? 'tester')
    const suffix = parts.slice(playerIndex + 2).join('/')

    if (suffix === 'stats') {
      await route.fulfill({ json: statsPayload({ rapidSpecialist: rapidSpecialistComparison }) })
      return
    }
    if (suffix === 'games/archives') {
      await route.fulfill({ json: { archives: [`https://api.chess.com/pub/player/${username}/games/2026/08`] } })
      return
    }
    if (suffix.startsWith('games/')) {
      await route.fulfill({
        json: {
          games: [{
            url: `https://chess.com/game/${username}-1`,
            end_time: 1_786_000_000,
            time_class: 'rapid',
            white: { username, rating: 1500, result: 'win' },
            black: { username: 'Opponent', rating: 1510, result: 'resigned' },
            pgn: '[Opening "Sicilian Defense"]',
          }],
        },
      })
      return
    }

    await route.fulfill({
      json: {
        username,
        title: username.toLowerCase().includes('magnus') ? 'GM' : undefined,
      },
    })
  })

  return tally
}

test('the homepage and its live featured reports render', async ({ page }) => {
  await mockRooksterData(page)
  await page.goto('/')

  await expect(page).toHaveTitle(/Chess ratings, made iconic/i)
  await expect(page.getByRole('heading', { name: /Chess ratings/i })).toBeVisible()
  await expect(page.locator('.card-generation-count')).toContainText('1,234')
  await expect(page.locator('.card-generation-count')).toContainText('scout cards generated')
  await expect(page.getByRole('link', { name: /Open MagnusCarlsen's scout report/i }).first()).toHaveAttribute('href', '/MagnusCarlsen')
})

test('a successful homepage submission records one unique generation event', async ({ page }) => {
  const tally = await mockRooksterData(page)
  await page.goto('/')

  await page.locator('.generator-form input').first().fill('tester')
  await page.getByRole('button', { name: /Scout player/i }).click()
  await expect(page.getByRole('heading', { name: /scouting report is in/i })).toBeVisible()
  await expect(page).toHaveURL('/tester')
  await expect.poll(() => tally.posts.length).toBe(1)
  expect(tally.posts[0].cardCount).toBe(1)
  expect(tally.posts[0].eventId).toMatch(/^[a-z0-9-]{16,80}$/i)
})

test('a remembered player pack restores and format tabs switch immediately', async ({ page }) => {
  const tally = await mockRooksterData(page)
  await page.addInitScript(() => {
    localStorage.setItem('rookster:pack-open:v1:tester', String(Date.now()))
  })
  await page.goto('/tester')

  const card = page.locator('article.player-card')
  await expect(card).toBeVisible()
  await expect(page.locator('.pack-reveal')).toHaveClass(/is-restored/)
  await page.getByRole('tab', { name: 'Blitz' }).click()
  await expect(page).toHaveTitle(/tester 1600/i)
  await expect(card.locator('.rating-line')).toContainText('1,600')
  expect(tally.posts).toHaveLength(0)
})

test('card exports offer clean, square, and vertical story PNG layouts', async ({ page }) => {
  test.setTimeout(90_000)
  await mockRooksterData(page)
  await page.addInitScript(() => {
    localStorage.setItem('rookster:pack-open:v1:tester', String(Date.now()))
  })
  await page.goto('/tester')
  await expect(page.locator('article.player-card')).toBeVisible()

  const layout = page.getByLabel('Player card layout')
  await expect(layout.locator('option')).toHaveText(['Clean card', 'Square post', 'Vertical story'])

  for (const [value, filename] of [
    ['plain', 'tester-rapid-rookster-card.png'],
    ['square', 'tester-rapid-rookster-square.png'],
    ['story', 'tester-rapid-rookster-story.png'],
  ]) {
    await layout.selectOption(value)
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /Download/ }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(filename)
  }
})

test('comparison routes render both cards and the core matchup metrics', async ({ page }) => {
  await mockRooksterData(page, { rapidSpecialistComparison: true })
  await page.goto('/tester?compare=rival')

  await expect(page.locator('article.player-card')).toHaveCount(2)
  await expect(page.getByText('SCOUTING METRICS')).toBeVisible()
  const archetypes = page.locator('.duel-archetypes span')
  await expect(archetypes).toHaveText(['Rapid Specialist', 'Rapid Specialist'])
  await expect(archetypes.first()).toHaveClass(/archetype-medium/)
  await expect(page).toHaveTitle(/tester 1800 \(v rival 1800\)/i)
})

test('legacy card routes redirect to the canonical profile URL', async ({ page }) => {
  await mockRooksterData(page)
  await page.goto('/card/tester?compare=rival')

  await expect(page).toHaveURL('/tester?compare=rival')
})

test('unknown multi-segment routes use the branded 404 page', async ({ page }) => {
  await page.goto('/missing/fixture')

  await expect(page).toHaveTitle(/Page not found/i)
  await expect(page.getByRole('heading', { name: /fixture isn't on the board/i })).toBeVisible()
})
