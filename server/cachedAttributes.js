import { aggregateGames, createEmptyTotals, mergeTotals, totalsToAttributes } from './attributeAggregation.js'
import { attributeStorage } from './storage.js'

const CHESS_API = 'https://api.chess.com/pub/player'
const TIME_CONTROLS = ['rapid', 'blitz', 'bullet']
const VALID_TIME_CONTROLS = new Set(TIME_CONTROLS)
const CACHE_VERSION = 3
const BASE_WINDOW_MONTHS = 12
const MAX_WINDOW_MONTHS = 24
const MIN_SAMPLE_GAMES = 20
const ARCHIVE_CONCURRENCY = 3
const RETRY_DELAYS = [350, 1000, 2500]
const USERNAME_PATTERN = /^[a-z0-9_-]{1,25}$/i
const DEFAULT_FETCH_TIMEOUT_MS = 8_000
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60

export class AttributeServiceError extends Error {
  constructor(message, status = 500) {
    super(message)
    this.name = 'AttributeServiceError'
    this.status = status
  }
}

function archiveInfo(url) {
  const match = url.match(/\/games\/(\d{4})\/(\d{2})(?:\/|$)/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  return {
    url,
    key: `${match[1]}-${match[2]}`,
    index: year * 12 + month - 1,
  }
}

function monthKeyIndex(key) {
  const match = key?.match(/^(\d{4})-(\d{2})$/)
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null
}

function currentUtcMonthIndex(now) {
  return now.getUTCFullYear() * 12 + now.getUTCMonth()
}

function wait(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay))
}

async function fetchChessJson(url, fetchImpl) {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
    let response
    try {
      response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'rookster/0.1 (public Chess.com stats card)',
        },
      })
    } catch (error) {
      if (error instanceof AttributeServiceError) {
        if (error.retryable && attempt < RETRY_DELAYS.length) {
          await wait(RETRY_DELAYS[attempt])
          continue
        }
        throw error
      }
      if (attempt < RETRY_DELAYS.length) {
        await wait(RETRY_DELAYS[attempt])
        continue
      }
      throw new AttributeServiceError('Chess.com could not be reached while compiling the report.', 502)
    }

    if (response.status === 404) return null
    if ((response.status === 429 || response.status >= 500) && attempt < RETRY_DELAYS.length) {
      await wait(RETRY_DELAYS[attempt])
      continue
    }
    if (response.status === 429) {
      throw new AttributeServiceError('Chess.com is rate limiting this scouting request. Please try again shortly.', 429)
    }
    if (!response.ok) {
      throw new AttributeServiceError('Chess.com returned an incomplete archive response.', 502)
    }

    return response.json()
  }

  throw new AttributeServiceError('Chess.com could not be reached while compiling the report.', 502)
}

function createTimedFetch(fetchImpl, { signal, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = {}) {
  return async function timedFetch(url, options = {}) {
    if (signal?.aborted) {
      throw new AttributeServiceError('The scouting request exceeded its processing deadline.', 504)
    }

    const controller = new AbortController()
    let timedOut = false
    const onParentAbort = () => controller.abort(signal.reason ?? 'deadline')
    signal?.addEventListener('abort', onParentAbort, { once: true })
    const timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort('upstream-timeout')
    }, timeoutMs)

    try {
      return await fetchImpl(url, { ...options, signal: controller.signal })
    } catch (error) {
      if (signal?.aborted) {
        throw new AttributeServiceError('The scouting request exceeded its processing deadline.', 504)
      }
      if (timedOut) {
        const timeoutError = new AttributeServiceError(
          'Chess.com took too long to return part of the scouting record.',
          504,
        )
        timeoutError.retryable = true
        throw timeoutError
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', onParentAbort)
    }
  }
}

function normalizeUsername(username) {
  const normalized = username?.trim().toLowerCase()
  if (!normalized) throw new AttributeServiceError('A Chess.com username is required.', 400)
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new AttributeServiceError(
      'Chess.com usernames may only contain letters, numbers, underscores, and hyphens, up to 25 characters.',
      400,
    )
  }
  return normalized
}

function createRecord() {
  return { cacheVersion: CACHE_VERSION, months: {} }
}

function isCacheRecord(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && value.cacheVersion === CACHE_VERSION
    && value.months
    && typeof value.months === 'object',
  )
}

function pruneRecord(record, currentMonthIndex) {
  const oldestAllowed = currentMonthIndex - MAX_WINDOW_MONTHS + 1
  const months = Object.fromEntries(
    Object.entries(record.months ?? {}).filter(([key]) => {
      const index = monthKeyIndex(key)
      return index !== null && index >= oldestAllowed && index <= currentMonthIndex
    }),
  )
  return { cacheVersion: CACHE_VERSION, months }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  )
  return results
}

async function fetchArchiveBatches(infos, fetchImpl) {
  return mapWithConcurrency(infos, ARCHIVE_CONCURRENCY, async (info) => {
    const archive = await fetchChessJson(info.url, fetchImpl)
    return { info, games: archive?.games ?? [] }
  })
}

function applyBatchToRecord(record, batch, username, timeControl) {
  record.months[batch.info.key] = aggregateGames(batch.games, username, timeControl)
}

function applyBatchesToAllRecords(records, batches, username) {
  for (const batch of batches) {
    for (const control of TIME_CONTROLS) {
      applyBatchToRecord(records[control], batch, username, control)
    }
  }
}

function selectWindow(record, archiveInfos, currentMonthIndex) {
  const baseStart = currentMonthIndex - BASE_WINDOW_MONTHS + 1
  const availableInfos = archiveInfos.filter((info) => record.months[info.key])
  const selectedKeys = new Set(
    availableInfos.filter((info) => info.index >= baseStart).map((info) => info.key),
  )

  let totals = mergeTotals(
    ...availableInfos
      .filter((info) => selectedKeys.has(info.key))
      .sort((left, right) => left.index - right.index)
      .map((info) => record.months[info.key]),
  )

  if (totals.totalGames < MIN_SAMPLE_GAMES) {
    const olderInfos = availableInfos
      .filter((info) => info.index < baseStart)
      .sort((left, right) => right.index - left.index)

    for (const info of olderInfos) {
      selectedKeys.add(info.key)
      totals = mergeTotals(
        ...availableInfos
          .filter((candidate) => selectedKeys.has(candidate.key))
          .sort((left, right) => left.index - right.index)
          .map((candidate) => record.months[candidate.key]),
      )
      if (totals.totalGames >= MIN_SAMPLE_GAMES) break
    }
  }

  const selectedInfos = availableInfos.filter((info) => selectedKeys.has(info.key))
  const oldestSelectedIndex = selectedInfos.length
    ? Math.min(...selectedInfos.map((info) => info.index))
    : currentMonthIndex
  const stillSparse = totals.totalGames < MIN_SAMPLE_GAMES
  const windowMonths = stillSparse
    ? MAX_WINDOW_MONTHS
    : Math.max(BASE_WINDOW_MONTHS, currentMonthIndex - oldestSelectedIndex + 1)

  return {
    totals,
    sampleGames: totals.totalGames,
    windowMonths,
    extendedSample: windowMonths > BASE_WINDOW_MONTHS,
  }
}

async function ensureSparseExtension({
  record,
  archiveInfos,
  currentMonthIndex,
  username,
  timeControl,
  fetchImpl,
  allRecords = null,
}) {
  const baseStart = currentMonthIndex - BASE_WINDOW_MONTHS + 1
  const olderInfos = archiveInfos
    .filter((info) => info.index < baseStart)
    .sort((left, right) => right.index - left.index)

  let selection = selectWindow(record, archiveInfos, currentMonthIndex)
  for (let index = 0; selection.sampleGames < MIN_SAMPLE_GAMES && index < olderInfos.length; index += ARCHIVE_CONCURRENCY) {
    const group = olderInfos.slice(index, index + ARCHIVE_CONCURRENCY)
    const missing = group.filter((info) => !record.months[info.key])
    if (missing.length) {
      const batches = await fetchArchiveBatches(missing, fetchImpl)
      if (allRecords) applyBatchesToAllRecords(allRecords, batches, username)
      else batches.forEach((batch) => applyBatchToRecord(record, batch, username, timeControl))
    }
    selection = selectWindow(record, archiveInfos, currentMonthIndex)
  }

  return selection
}

async function buildInitialRecords({ archiveInfos, currentMonthIndex, username, timeControl, fetchImpl }) {
  const records = Object.fromEntries(TIME_CONTROLS.map((control) => [control, createRecord()]))
  const baseStart = currentMonthIndex - BASE_WINDOW_MONTHS + 1
  const baseInfos = archiveInfos.filter((info) => info.index >= baseStart)
  const baseBatches = await fetchArchiveBatches(baseInfos, fetchImpl)
  applyBatchesToAllRecords(records, baseBatches, username)

  const selection = await ensureSparseExtension({
    record: records[timeControl],
    archiveInfos,
    currentMonthIndex,
    username,
    timeControl,
    fetchImpl,
    allRecords: records,
  })

  return { records, selection }
}

async function refreshRecord({ record, archiveInfos, currentMonthIndex, username, timeControl, fetchImpl }) {
  const refreshed = pruneRecord(record, currentMonthIndex)
  const baseStart = currentMonthIndex - BASE_WINDOW_MONTHS + 1
  const baseInfos = archiveInfos.filter((info) => info.index >= baseStart)
  const currentInfo = archiveInfos.find((info) => info.index === currentMonthIndex)
  const neededByKey = new Map(
    baseInfos
      .filter((info) => !refreshed.months[info.key])
      .map((info) => [info.key, info]),
  )
  if (currentInfo) neededByKey.set(currentInfo.key, currentInfo)

  const batches = await fetchArchiveBatches([...neededByKey.values()], fetchImpl)
  batches.forEach((batch) => applyBatchToRecord(refreshed, batch, username, timeControl))
  const selection = await ensureSparseExtension({
    record: refreshed,
    archiveInfos,
    currentMonthIndex,
    username,
    timeControl,
    fetchImpl,
  })

  return { record: refreshed, selection }
}

function availableTimeControls(stats) {
  return TIME_CONTROLS.filter((control) => (
    Number.isFinite(stats?.[`chess_${control}`]?.last?.rating)
  ))
}

function formatAttributeResult(username, timeControl, selection, stats) {
  return {
    username,
    timeControl,
    ...totalsToAttributes(selection.totals, stats, timeControl),
    sampleGames: selection.sampleGames,
    sampleMonths: selection.windowMonths,
    extendedSample: selection.extendedSample,
  }
}

async function refreshAllRecords({ records, controls, archiveInfos, currentMonthIndex, username, fetchImpl }) {
  const refreshed = Object.fromEntries(TIME_CONTROLS.map((control) => [
    control,
    pruneRecord(records[control] ?? createRecord(), currentMonthIndex),
  ]))
  const baseStart = currentMonthIndex - BASE_WINDOW_MONTHS + 1
  const baseInfos = archiveInfos.filter((info) => info.index >= baseStart)
  const currentInfo = archiveInfos.find((info) => info.index === currentMonthIndex)
  const neededByKey = new Map(
    baseInfos
      .filter((info) => controls.some((control) => !refreshed[control].months[info.key]))
      .map((info) => [info.key, info]),
  )
  if (currentInfo) neededByKey.set(currentInfo.key, currentInfo)

  const baseBatches = await fetchArchiveBatches([...neededByKey.values()], fetchImpl)
  applyBatchesToAllRecords(refreshed, baseBatches, username)

  let selections = Object.fromEntries(controls.map((control) => [
    control,
    selectWindow(refreshed[control], archiveInfos, currentMonthIndex),
  ]))
  const olderInfos = archiveInfos
    .filter((info) => info.index < baseStart)
    .sort((left, right) => right.index - left.index)

  for (let index = 0; index < olderInfos.length; index += ARCHIVE_CONCURRENCY) {
    const sparseControls = controls.filter(
      (control) => selections[control].sampleGames < MIN_SAMPLE_GAMES,
    )
    if (!sparseControls.length) break

    const group = olderInfos.slice(index, index + ARCHIVE_CONCURRENCY)
    const missing = group.filter((info) => (
      sparseControls.some((control) => !refreshed[control].months[info.key])
    ))
    if (missing.length) {
      const batches = await fetchArchiveBatches(missing, fetchImpl)
      applyBatchesToAllRecords(refreshed, batches, username)
    }

    selections = Object.fromEntries(controls.map((control) => [
      control,
      selectWindow(refreshed[control], archiveInfos, currentMonthIndex),
    ]))
  }

  return { records: refreshed, selections }
}

export async function getCachedPlayerAttributeBatch({
  username,
  storage = attributeStorage,
  fetchImpl = globalThis.fetch,
  now = new Date(),
  signal,
  fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  includeStats = false,
}) {
  const normalizedUsername = normalizeUsername(username)
  if (typeof fetchImpl !== 'function') throw new AttributeServiceError('This runtime does not provide fetch.', 500)
  const timedFetch = createTimedFetch(fetchImpl, { signal, timeoutMs: fetchTimeoutMs })

  const safeUsername = encodeURIComponent(normalizedUsername)
  const baseUrl = `${CHESS_API}/${safeUsername}`
  const [archiveList, stats] = await Promise.all([
    fetchChessJson(`${baseUrl}/games/archives`, timedFetch),
    fetchChessJson(`${baseUrl}/stats`, timedFetch),
  ])
  if (!archiveList || !stats) throw new AttributeServiceError('No player found.', 404)

  const controls = availableTimeControls(stats)
  if (!controls.length) {
    throw new AttributeServiceError('This player has no rapid, blitz, or bullet rating yet.', 422)
  }

  const currentMonthIndex = currentUtcMonthIndex(now)
  const oldestAllowed = currentMonthIndex - MAX_WINDOW_MONTHS + 1
  const archiveInfos = [...new Map(
    (archiveList.archives ?? [])
      .map(archiveInfo)
      .filter((info) => info && info.index >= oldestAllowed && info.index <= currentMonthIndex)
      .map((info) => [info.key, info]),
  ).values()].sort((left, right) => left.index - right.index)
  const cachedRecords = await Promise.all(TIME_CONTROLS.map((control) => (
    storage.get(`${normalizedUsername}:${control}`)
  )))
  const records = Object.fromEntries(TIME_CONTROLS.map((control, index) => [
    control,
    isCacheRecord(cachedRecords[index]) ? cachedRecords[index] : createRecord(),
  ]))
  const refreshed = await refreshAllRecords({
    records,
    controls,
    archiveInfos,
    currentMonthIndex,
    username: normalizedUsername,
    fetchImpl: timedFetch,
  })

  await Promise.all(TIME_CONTROLS.map((control) => (
    storage.set(
      `${normalizedUsername}:${control}`,
      refreshed.records[control],
      { expirationSeconds: CACHE_TTL_SECONDS },
    )
  )))

  return {
    username: normalizedUsername,
    ...(includeStats ? { stats } : {}),
    attributes: Object.fromEntries(controls.map((control) => [
      control,
      formatAttributeResult(
        normalizedUsername,
        control,
        refreshed.selections[control],
        stats,
      ),
    ])),
  }
}

export async function getCachedPlayerAttributes({
  username,
  timeControl,
  storage = attributeStorage,
  fetchImpl = globalThis.fetch,
  now = new Date(),
  signal,
  fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
}) {
  const normalizedUsername = normalizeUsername(username)
  const normalizedControl = timeControl?.trim().toLowerCase()

  if (!VALID_TIME_CONTROLS.has(normalizedControl)) {
    throw new AttributeServiceError('Time control must be rapid, blitz, or bullet.', 400)
  }
  if (typeof fetchImpl !== 'function') throw new AttributeServiceError('This runtime does not provide fetch.', 500)
  const timedFetch = createTimedFetch(fetchImpl, { signal, timeoutMs: fetchTimeoutMs })

  const safeUsername = encodeURIComponent(normalizedUsername)
  const baseUrl = `${CHESS_API}/${safeUsername}`
  const [archiveList, stats] = await Promise.all([
    fetchChessJson(`${baseUrl}/games/archives`, timedFetch),
    fetchChessJson(`${baseUrl}/stats`, timedFetch),
  ])

  if (!archiveList || !stats) throw new AttributeServiceError('No player found.', 404)

  const currentMonthIndex = currentUtcMonthIndex(now)
  const oldestAllowed = currentMonthIndex - MAX_WINDOW_MONTHS + 1
  const archiveInfos = [...new Map(
    (archiveList.archives ?? [])
      .map(archiveInfo)
      .filter((info) => info && info.index >= oldestAllowed && info.index <= currentMonthIndex)
      .map((info) => [info.key, info]),
  ).values()].sort((left, right) => left.index - right.index)
  const cacheKey = `${normalizedUsername}:${normalizedControl}`
  const cached = await storage.get(cacheKey)
  let record
  let selection

  if (isCacheRecord(cached)) {
    const refreshed = await refreshRecord({
      record: cached,
      archiveInfos,
      currentMonthIndex,
      username: normalizedUsername,
      timeControl: normalizedControl,
      fetchImpl: timedFetch,
    })
    record = refreshed.record
    selection = refreshed.selection
    await storage.set(cacheKey, record, { expirationSeconds: CACHE_TTL_SECONDS })
  } else {
    const initial = await buildInitialRecords({
      archiveInfos,
      currentMonthIndex,
      username: normalizedUsername,
      timeControl: normalizedControl,
      fetchImpl: timedFetch,
    })
    record = initial.records[normalizedControl]
    selection = initial.selection
    await Promise.all(TIME_CONTROLS.map((control) => (
      storage.set(
        `${normalizedUsername}:${control}`,
        initial.records[control],
        { expirationSeconds: CACHE_TTL_SECONDS },
      )
    )))
  }

  return formatAttributeResult(normalizedUsername, normalizedControl, selection, stats)
}
