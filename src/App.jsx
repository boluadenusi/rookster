import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Crown,
  LoaderCircle,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import {
  getCachedAttributeBatch,
  getCachedAttributes,
  getChessHeadToHead,
  getChessPlayer,
  recordCardGeneration,
} from './api.js'
import Card from './components/Card.jsx'
import CardGenerationCount from './components/CardGenerationCount.jsx'
import CompareControls from './components/CompareControls.jsx'
import ComparisonCore from './components/ComparisonCore.jsx'
import HomepageSpecimens from './components/HomepageSpecimens.jsx'
import LoadingScreen from './components/LoadingScreen.jsx'
import PackReveal from './components/PackReveal.jsx'
import ScoutingReport from './components/ScoutingReport.jsx'
import ShareActions from './components/ShareActions.jsx'
import SiteFooter from './components/SiteFooter.jsx'
import SiteNav from './components/SiteNav.jsx'
import {
  buildCardStats,
  formatDate,
  getAvailableControls,
  getDefaultControl,
  summarizeRecentGames,
} from './utils.js'
import { getCardTier } from './utils/cardTier.js'
import { CARD_EXPORTS, renderCardExport } from './utils/cardExport.js'
import { getOpeningStyle } from './utils/openingStyle.js'
import { isPackOpenRemembered, rememberPackOpened } from './utils/packState.js'
import { resolvePosition } from './utils/position.js'
import useDocumentTitle from './utils/useDocumentTitle.js'

const REQUEST_TIMEOUT_MS = 3 * 60 * 1000
const HEAD_TO_HEAD_TIMEOUT_MS = 30 * 1000
const HOME_TITLE = 'rookster | Chess ratings, made iconic.'
const DOCUMENT_WAS_RELOADED = typeof window !== 'undefined'
  && window.performance?.getEntriesByType('navigation')?.[0]?.type === 'reload'
let appHasMountedInDocument = false

function createGenerationEventId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `generation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
}

function playerTitleLabel(player, control) {
  const username = player?.profile?.username
  const rating = player?.stats?.[control?.key]?.last?.rating
  if (!username) return ''
  return Number.isFinite(rating) ? `${username} ${rating}` : username
}

function FormBadge({ game, index, compact = false }) {
  const [expanded, setExpanded] = useState(false)
  const tooltipId = useId()
  const label = game.result === 'W' ? 'Win' : game.result === 'L' ? 'Loss' : 'Draw'
  const opponentRating = Number.isFinite(game.opponentRating)
    ? game.opponentRating.toLocaleString()
    : 'Unrated'

  return (
    <div className={`form-badge-wrap ${compact ? 'compact' : ''} ${expanded ? 'is-expanded' : ''}`}>
      <span className="fixture-number">{String(index + 1).padStart(2, '0')}</span>
      <button
        type="button"
        className={`form-badge result-${game.result.toLowerCase()}`}
        aria-label={`${label} against ${game.opponent}, rated ${opponentRating}, playing ${game.color}, ${game.opening}, ${formatDate(game.date)}`}
        aria-controls={tooltipId}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        onBlur={() => setExpanded(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setExpanded(false)
        }}
      >
        {game.result}
      </button>
      <span className="fixture-opponent">{game.opponent}</span>
      <span className="game-tooltip" id={tooltipId} role="tooltip">
        <span className="fixture-tooltip-kicker">{label} · Fixture {String(index + 1).padStart(2, '0')}</span>
        <strong>vs {game.opponent}</strong>
        <span className="fixture-tooltip-grid">
          <span><b>Opponent rating</b><em>{opponentRating}</em></span>
          <span><b>Colour</b><em>{game.color}</em></span>
          <span className="fixture-opening"><b>Opening</b><em>{game.opening}</em></span>
          <span className="fixture-date"><b>Played</b><em>{formatDate(game.date)}</em></span>
        </span>
      </span>
    </div>
  )
}

function RecentFormPanel({ username, summary, role }) {
  const fixtures = summary.form.slice(0, 5)

  return (
    <section className="form-panel">
      <div className="panel-heading">
        <div>
          <span>FORM GUIDE · {role}</span>
          <h2>{username}'s last five</h2>
        </div>
      </div>

      {fixtures.length ? (
        <div
          className="form-strip"
          style={{ '--fixture-count': fixtures.length, '--fixture-edge': `${50 / fixtures.length}%` }}
        >
          {fixtures.map((game, index) => (
            <FormBadge game={game} index={index} key={`${game.url}-${index}`} />
          ))}
        </div>
      ) : (
        <p className="empty-form">No recent fixtures on record.</p>
      )}

      <div className="form-legend">
        <span><i className="win-key" /> Win</span>
        <span><i className="draw-key" /> Draw</span>
        <span><i className="loss-key" /> Loss</span>
      </div>
    </section>
  )
}

function App() {
  const { username: routeUsername } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const isHomepageCardEntry = location.state?.scoutingEntry === 'homepage-card'
  const initialOpponent = routeUsername
    ? new URLSearchParams(location.search).get('compare') ?? ''
    : ''
  const [chessUsername, setChessUsername] = useState(routeUsername ?? '')
  const [compareEnabled, setCompareEnabled] = useState(Boolean(initialOpponent))
  const [compareUsername, setCompareUsername] = useState(initialOpponent)
  const [submittedNames, setSubmittedNames] = useState(
    routeUsername ? { chess: routeUsername, compare: initialOpponent } : null,
  )
  const [playerData, setPlayerData] = useState(null)
  const [comparisonData, setComparisonData] = useState(null)
  const [headToHeadData, setHeadToHeadData] = useState({ games: [], unavailable: false, loading: false })
  const [selectedControl, setSelectedControl] = useState(null)
  const [pendingControl, setPendingControl] = useState(null)
  const [status, setStatus] = useState(routeUsername
    ? (isHomepageCardEntry ? 'loading' : 'route-loading')
    : 'idle')
  const [error, setError] = useState(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [packOpened, setPackOpened] = useState(false)
  const [packRestored, setPackRestored] = useState(false)
  const [quietRouteReload] = useState(() => (
    Boolean(routeUsername)
    && !isHomepageCardEntry
    && DOCUMENT_WAS_RELOADED
    && !appHasMountedInDocument
  ))
  const exportRef = useRef(null)
  const autoLoadKey = useRef('')
  const activeRequest = useRef(null)
  const headToHeadRequest = useRef(null)
  const attributeRequest = useRef(null)
  const appMounted = useRef(false)

  useEffect(() => {
    try {
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith('rookster:search:v1:'))
        .forEach((key) => window.localStorage.removeItem(key))
    } catch {
      // Storage may be unavailable; the app no longer reads cached search data.
    }
  }, [])

  useEffect(() => {
    appHasMountedInDocument = true
    appMounted.current = true

    return () => {
      appMounted.current = false
      window.setTimeout(() => {
        if (appMounted.current) return
        const request = activeRequest.current
        const meetingsRequest = headToHeadRequest.current
        const cachedAttributeRequest = attributeRequest.current
        activeRequest.current = null
        headToHeadRequest.current = null
        attributeRequest.current = null
        request?.controller.abort('unmounted')
        meetingsRequest?.controller.abort('unmounted')
        cachedAttributeRequest?.controller.abort('unmounted')
      }, 0)
    }
  }, [])

  const availableControls = useMemo(() => {
    if (!playerData) return []
    const primary = getAvailableControls(playerData.stats)
    if (!comparisonData) return primary
    const comparisonIds = new Set(getAvailableControls(comparisonData.stats).map((control) => control.id))
    return primary.filter((control) => comparisonIds.has(control.id))
  }, [playerData, comparisonData])

  const recentSummary = useMemo(
    () => playerData
      ? summarizeRecentGames(playerData.recentGames, playerData.profile.username)
      : { form: [], streak: '', bestWin: null },
    [playerData],
  )

  const comparisonSummary = useMemo(
    () => comparisonData
      ? summarizeRecentGames(comparisonData.recentGames, comparisonData.profile.username)
      : { form: [], streak: '', bestWin: null },
    [comparisonData],
  )

  const primaryOpeningStyle = useMemo(
    () => getOpeningStyle(playerData?.recentGames),
    [playerData],
  )

  const primaryPosition = useMemo(() => {
    if (!playerData || !selectedControl) return null
    const attributes = buildCardStats(
      playerData.stats,
      selectedControl,
      playerData.attributeStats?.[selectedControl.id],
    ).attributes
    return resolvePosition(attributes)
  }, [playerData, selectedControl])

  const comparisonPosition = useMemo(() => {
    if (!comparisonData || !selectedControl) return null
    const attributes = buildCardStats(
      comparisonData.stats,
      selectedControl,
      comparisonData.attributeStats?.[selectedControl.id],
    ).attributes
    return resolvePosition(attributes)
  }, [comparisonData, selectedControl])

  const revealTier = useMemo(() => {
    if (!playerData || !selectedControl) return 'gold'
    const tierRank = { bronze: 0, silver: 1, gold: 2, special: 3 }
    const tiers = [getCardTier(buildCardStats(playerData.stats, selectedControl).ovr)]
    if (comparisonData) {
      tiers.push(getCardTier(buildCardStats(comparisonData.stats, selectedControl).ovr))
    }
    return tiers.sort((a, b) => tierRank[b] - tierRank[a])[0]
  }, [playerData, comparisonData, selectedControl])

  const pageTitle = useMemo(() => {
    if (playerData && selectedControl) {
      const primary = playerTitleLabel(playerData, selectedControl)
      const opponent = playerTitleLabel(comparisonData, selectedControl)
      return opponent
        ? `rookster | ${primary} (v ${opponent})`
        : `rookster | ${primary}`
    }

    if (routeUsername) {
      const opponent = new URLSearchParams(location.search).get('compare')
      return opponent
        ? `rookster | ${routeUsername} (v ${opponent})`
        : `rookster | Scouting ${routeUsername}`
    }

    return HOME_TITLE
  }, [playerData, comparisonData, selectedControl, routeUsername, location.search])

  useDocumentTitle(pageTitle)

  function loadHeadToHead(primary, opponent) {
    const previousRequest = headToHeadRequest.current
    headToHeadRequest.current = null
    previousRequest?.controller.abort('superseded')

    const primaryUsername = primary.profile.username?.trim().toLowerCase()
    const opponentUsername = opponent.profile.username?.trim().toLowerCase()
    if (primaryUsername && primaryUsername === opponentUsername) {
      setHeadToHeadData({ games: [], unavailable: false, loading: false })
      return
    }

    const requestId = Symbol('meetings-request')
    const controller = new AbortController()
    const timeoutId = window.setTimeout(
      () => controller.abort('timeout'),
      HEAD_TO_HEAD_TIMEOUT_MS,
    )
    headToHeadRequest.current = { id: requestId, controller }
    setHeadToHeadData({ games: [], unavailable: false, loading: true })

    void getChessHeadToHead(
      primary,
      opponent.profile.username,
      3,
      { signal: controller.signal },
    ).then((games) => {
      if (headToHeadRequest.current?.id !== requestId) return
      setHeadToHeadData({ games, unavailable: false, loading: false })
    }).catch(() => {
      if (headToHeadRequest.current?.id !== requestId) return
      setHeadToHeadData({ games: [], unavailable: true, loading: false })
    }).finally(() => {
      window.clearTimeout(timeoutId)
      if (headToHeadRequest.current?.id === requestId) headToHeadRequest.current = null
    })
  }

  async function selectTimeControl(control) {
    if (!playerData || (control.id === selectedControl?.id && !pendingControl)) return

    const primaryCached = playerData.attributeStats?.[control.id]
    const comparisonCached = comparisonData?.attributeStats?.[control.id]
    if (primaryCached && (!comparisonData || comparisonCached)) {
      setSelectedControl(control)
      setPendingControl(null)
      return
    }

    attributeRequest.current?.controller.abort('superseded')
    const requestId = Symbol('attribute-request')
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort('timeout'), REQUEST_TIMEOUT_MS)
    attributeRequest.current = { id: requestId, controller }
    setPendingControl(control)
    setError(null)

    try {
      const [primaryAttributes, comparisonAttributes] = await Promise.all([
        primaryCached
          ? Promise.resolve(primaryCached)
          : getCachedAttributes(playerData.profile.username, control.id, { signal: controller.signal }),
        !comparisonData || comparisonCached
          ? Promise.resolve(comparisonCached)
          : getCachedAttributes(comparisonData.profile.username, control.id, { signal: controller.signal }),
      ])
      if (attributeRequest.current?.id !== requestId) return

      setPlayerData((current) => ({
        ...current,
        attributeStats: { ...current.attributeStats, [control.id]: primaryAttributes },
      }))
      if (comparisonData) {
        setComparisonData((current) => ({
          ...current,
          attributeStats: { ...current.attributeStats, [control.id]: comparisonAttributes },
        }))
      }
      setSelectedControl(control)
      setPendingControl(null)
      setError(null)
    } catch (requestError) {
      if (attributeRequest.current?.id !== requestId) return
      setError({
        kind: requestError.kind ?? 'network',
        message: requestError.message ?? 'The selected time control could not be compiled.',
      })
      setPendingControl(null)
    } finally {
      window.clearTimeout(timeoutId)
      if (attributeRequest.current?.id === requestId) attributeRequest.current = null
    }
  }

  async function generatePlayers(
    chessName,
    opponentName = '',
    { restorePack = false, silentLoad = false, generationEvent = null } = {},
  ) {
    if (!chessName) return
    const previousRequest = activeRequest.current
    const previousMeetingsRequest = headToHeadRequest.current
    const previousAttributeRequest = attributeRequest.current
    activeRequest.current = null
    headToHeadRequest.current = null
    attributeRequest.current = null
    previousRequest?.controller.abort('superseded')
    previousMeetingsRequest?.controller.abort('superseded')
    previousAttributeRequest?.controller.abort('superseded')
    const requestId = Symbol('scout-request')
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort('timeout'), REQUEST_TIMEOUT_MS)
    activeRequest.current = { id: requestId, controller }

    setStatus(silentLoad ? 'route-loading' : 'loading')
    setError(null)
    setPlayerData(null)
    setComparisonData(null)
    setHeadToHeadData({ games: [], unavailable: false, loading: false })
    setPendingControl(null)
    setPackOpened(false)
    setPackRestored(false)
    setSubmittedNames({ chess: chessName, compare: opponentName })

    try {
      const primaryPromise = getChessPlayer(chessName, { signal: controller.signal })
      const requestedSelfComparison = Boolean(
        opponentName
        && chessName.trim().toLowerCase() === opponentName.trim().toLowerCase(),
      )
      const primaryAttributePromise = getCachedAttributeBatch(
        chessName,
        { signal: controller.signal },
      )
      const opponentPromise = opponentName
        ? (requestedSelfComparison
            ? primaryPromise.then((player) => ({ ...player }))
            : getChessPlayer(opponentName, { signal: controller.signal })
          ).catch((requestError) => {
            requestError.message = `Comparison player: ${requestError.message}`
            throw requestError
          })
        : Promise.resolve(null)
      const opponentAttributePromise = !opponentName
        ? Promise.resolve(null)
        : requestedSelfComparison
          ? primaryAttributePromise
          : getCachedAttributeBatch(
              opponentName,
              { signal: controller.signal },
            ).catch((requestError) => {
              requestError.message = `Comparison player: ${requestError.message}`
              throw requestError
            })
      const [primary, opponent, primaryAttributes, opponentAttributes] = await Promise.all([
        primaryPromise,
        opponentPromise,
        primaryAttributePromise,
        opponentAttributePromise,
      ])

      const primaryControls = getAvailableControls(primary.stats)
      const opponentIds = opponent
        ? new Set(getAvailableControls(opponent.stats).map((control) => control.id))
        : null
      const sharedControls = opponent
        ? primaryControls.filter((control) => opponentIds.has(control.id))
        : primaryControls

      if (!sharedControls.length) {
        throw Object.assign(
          new Error(opponent
            ? 'These players do not share a rated rapid, blitz, or bullet time control.'
            : 'This player has no rapid, blitz, or bullet rating yet.'),
          { kind: 'no-ratings' },
        )
      }

      const defaultControl = getDefaultControl(sharedControls)
      const resolvedSelfComparison = Boolean(
        opponent
        && primary.profile.username?.trim().toLowerCase()
          === opponent.profile.username?.trim().toLowerCase(),
      )
      const resolvedOpponentAttributes = resolvedSelfComparison
        ? primaryAttributes
        : opponentAttributes
      if (!primaryAttributes[defaultControl.id] || (opponent && !resolvedOpponentAttributes?.[defaultControl.id])) {
        throw Object.assign(
          new Error('The scouting desk could not compile every available time control.'),
          { kind: 'incomplete-data' },
        )
      }
      primary.attributeStats = primaryAttributes
      if (opponent) opponent.attributeStats = resolvedOpponentAttributes

      if (activeRequest.current?.id !== requestId) return

      setPlayerData(primary)
      setComparisonData(opponent)
      setSelectedControl(defaultControl)
      const shouldRestorePack = !opponent
        && restorePack
        && isPackOpenRemembered(primary.profile.username)
      setPackOpened(Boolean(opponent) || shouldRestorePack)
      setPackRestored(shouldRestorePack)
      setStatus('success')

      if (generationEvent) {
        void recordCardGeneration(
          generationEvent.eventId,
          generationEvent.cardCount,
        ).catch(() => {
          // A tally outage must never interrupt a completed scouting report.
        })
      }

      const primaryUsername = primary.profile.username ?? chessName
      const opponentUsername = opponent?.profile.username ?? opponentName
      const profilePath = `/${encodeURIComponent(primaryUsername)}`
      const comparisonQuery = opponentUsername
        ? `?compare=${encodeURIComponent(opponentUsername)}`
        : ''
      autoLoadKey.current = `${primaryUsername.toLowerCase()}::${opponentUsername.toLowerCase()}`
      navigate(`${profilePath}${comparisonQuery}`, { replace: Boolean(routeUsername) })
      if (opponent) loadHeadToHead(primary, opponent)
    } catch (requestError) {
      if (activeRequest.current?.id !== requestId) return
      setError({
        kind: requestError.kind ?? 'network',
        message: requestError.message ?? 'Something went wrong. Please try again.',
      })
      setStatus('error')
    } finally {
      window.clearTimeout(timeoutId)
      if (activeRequest.current?.id === requestId) activeRequest.current = null
    }
  }

  useEffect(() => {
    if (!routeUsername) return
    const opponent = new URLSearchParams(location.search).get('compare') ?? ''
    const key = `${routeUsername.toLowerCase()}::${opponent.toLowerCase()}`
    if (autoLoadKey.current === key) return
    autoLoadKey.current = key
    setChessUsername(routeUsername)
    setCompareEnabled(Boolean(opponent))
    setCompareUsername(opponent)
    void generatePlayers(routeUsername, opponent, {
      restorePack: true,
      silentLoad: !isHomepageCardEntry,
    })
  }, [routeUsername, location.search])

  useEffect(() => {
    if (routeUsername || location.pathname !== '/') return
    const request = activeRequest.current
    const meetingsRequest = headToHeadRequest.current
    const cachedAttributeRequest = attributeRequest.current
    activeRequest.current = null
    headToHeadRequest.current = null
    attributeRequest.current = null
    request?.controller.abort('cancelled')
    meetingsRequest?.controller.abort('cancelled')
    cachedAttributeRequest?.controller.abort('cancelled')
    autoLoadKey.current = ''
    setChessUsername('')
    setCompareEnabled(false)
    setCompareUsername('')
    setSubmittedNames(null)
    setPlayerData(null)
    setComparisonData(null)
    setHeadToHeadData({ games: [], unavailable: false, loading: false })
    setSelectedControl(null)
    setPendingControl(null)
    setPackOpened(false)
    setPackRestored(false)
    setError(null)
    setStatus('idle')
    window.scrollTo(0, 0)
  }, [routeUsername, location.pathname])

  function generateCard(event) {
    event?.preventDefault()
    const chessName = chessUsername.trim()
    const opponentName = compareEnabled ? compareUsername.trim() : ''
    if (!chessName || (compareEnabled && !opponentName)) return
    void generatePlayers(chessName, opponentName, {
      restorePack: Boolean(routeUsername),
      generationEvent: {
        eventId: createGenerationEventId(),
        cardCount: opponentName ? 2 : 1,
      },
    })
  }

  async function downloadCard(mode = 'plain') {
    if (!exportRef.current || !playerData || !packOpened) return
    setIsDownloading(true)
    try {
      const exportMode = CARD_EXPORTS[mode] ? mode : 'plain'
      const canvas = await renderCardExport(
        exportRef.current,
        exportMode,
        playerData.profile.username,
      )
      const suffix = comparisonData ? `-vs-${comparisonData.profile.username}` : ''
      const link = document.createElement('a')
      link.download = `${playerData.profile.username}${suffix}-${selectedControl.id}-rookster-${CARD_EXPORTS[exportMode].fileSuffix}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch {
      setError({
        kind: 'download',
        message: 'The player card could not be exported. Try again once the profile image has loaded.',
      })
    } finally {
      setIsDownloading(false)
    }
  }

  function resetGenerator() {
    navigate('/', { replace: true })
    autoLoadKey.current = ''
    setStatus('idle')
    setError(null)
  }

  const isHomeRoute = location.pathname === '/'
  const displayStatus = isHomeRoute && status !== 'loading' && status !== 'error'
    ? 'idle'
    : status
  const showIntro = displayStatus === 'idle' || displayStatus === 'error'
  const isComparing = Boolean(comparisonData)
  const revealKey = `${submittedNames?.chess ?? ''}-${submittedNames?.compare ?? ''}`

  return (
    <main>
      <SiteNav />

      {showIntro && (
        <section className="hero" id="top">
          <div className="hero-left">
            <div className="hero-copy">
              <div className="eyebrow">Control the midfield</div>
              <h1>
                Chess ratings,<br />
                <em>made iconi<span className="iconic-c">c<Crown className="iconic-crown" aria-hidden="true" /></span>.</em>
              </h1>
            </div>

            <form className="generator-form" onSubmit={generateCard}>
            <label>
              <div className="input-frame">
                <span className="platform-dot chess-dot" aria-hidden="true">&#9820;</span>
                <input
                  required
                  value={chessUsername}
                  onChange={(event) => setChessUsername(event.target.value)}
                  placeholder="Enter a Chess.com username"
                  autoComplete="off"
                  spellCheck="false"
                />
                {chessUsername && <Check size={18} aria-hidden="true" />}
              </div>
            </label>

            <p className="profile-examples">
              Try{' '}
              <button type="button" onClick={() => setChessUsername('hikaru')}>hikaru</button>
              <span aria-hidden="true">·</span>
              <button type="button" onClick={() => setChessUsername('magnuscarlsen')}>magnuscarlsen</button>
              <span aria-hidden="true">·</span>
              or scout your own
            </p>

            <CompareControls
              enabled={compareEnabled}
              onToggle={setCompareEnabled}
              username={compareUsername}
              onUsernameChange={setCompareUsername}
            />

            <button
              className="primary-button"
              type="submit"
              disabled={displayStatus === 'loading' || !chessUsername.trim() || (compareEnabled && !compareUsername.trim())}
            >
              {displayStatus === 'loading' ? (
                <><LoaderCircle className="spin" size={20} /> Compiling scout report...</>
              ) : (
                <>{compareEnabled ? 'Run scout duel' : 'Scout player'} <ArrowRight size={20} /></>
              )}
            </button>

            <CardGenerationCount />

            {displayStatus === 'error' && error && (
              <div className="error-message" role="alert">
                <CircleAlert size={20} />
                <div>
                  <strong>{error.kind === 'not-found' ? 'Player not found' : 'Scouting desk unavailable'}</strong>
                  <span>{error.message}</span>
                </div>
                <button type="button" onClick={generateCard}><RotateCcw size={15} /> Run again</button>
              </div>
            )}
            </form>
          </div>

          <HomepageSpecimens />
        </section>
      )}

      {displayStatus === 'loading' && (
        <LoadingScreen
          primaryName={submittedNames?.chess ?? chessUsername}
          opponentName={submittedNames?.compare ?? ''}
        />
      )}

      {displayStatus === 'route-loading' && (
        quietRouteReload ? (
          <section className="route-loading-screen" role="status" aria-live="polite">
            <span className="rookster-logo route-loading-logo" aria-hidden="true" />
            <p>{initialOpponent ? 'Compiling matchup report' : 'Compiling scouting report'}</p>
          </section>
        ) : (
          <LoadingScreen
            primaryName={routeUsername ?? submittedNames?.chess ?? chessUsername}
            opponentName={initialOpponent || submittedNames?.compare || ''}
          />
        )
      )}

      {displayStatus === 'success' && playerData && selectedControl && (
        <section className={`result-section ${isComparing ? 'comparison-mode' : ''}`} aria-live="polite">
          <header className="result-header">
            <div>
              <h1>{isComparing ? 'The matchup report is in.' : 'The scouting report is in.'}</h1>
              <p>
                {isComparing
                  ? 'Switch time controls to review both players against the same recruitment brief.'
                  : 'Open the player pack, then switch time controls to inspect the full profile.'}
              </p>
            </div>
            <button className="text-button" type="button" onClick={resetGenerator}>
              Scout another <ChevronRight size={17} />
            </button>
          </header>

          {error && error.kind !== 'download' && (
            <p className="inline-error" role="alert"><CircleAlert size={16} /> {error.message}</p>
          )}

          {pendingControl && (
            <p className="control-refresh" role="status" aria-live="polite">
              <LoaderCircle size={15} aria-hidden="true" />
              Compiling {pendingControl.label} season attributes&hellip;
            </p>
          )}

          <div className={`result-grid ${isComparing ? 'comparison-result' : ''}`}>
            <div className={`card-column ${isComparing ? 'comparison-card-column' : ''}`}>
              <div className={`card-stage ${isComparing ? 'comparison-stage' : ''}`}>
                {isComparing ? (
                  <div ref={exportRef} className="cards-export two-cards">
                    <Card
                      profile={playerData.profile}
                      stats={playerData.stats}
                      selectedControl={selectedControl}
                      pendingControl={pendingControl}
                      availableControls={availableControls}
                      onControlChange={selectTimeControl}
                      position={primaryPosition}
                      comparisonStats={comparisonData?.stats}
                      attributeStats={playerData.attributeStats?.[selectedControl.id]}
                      comparisonAttributeStats={comparisonData?.attributeStats?.[selectedControl.id]}
                    />
                    <ComparisonCore
                      primary={playerData}
                      opponent={comparisonData}
                      selectedControl={selectedControl}
                      headToHeadData={headToHeadData}
                      primaryPosition={primaryPosition}
                      opponentPosition={comparisonPosition}
                    />
                    <Card
                      profile={comparisonData.profile}
                      stats={comparisonData.stats}
                      selectedControl={selectedControl}
                      pendingControl={pendingControl}
                      availableControls={availableControls}
                      onControlChange={selectTimeControl}
                      position={comparisonPosition}
                      comparisonStats={playerData.stats}
                      attributeStats={comparisonData.attributeStats?.[selectedControl.id]}
                      comparisonAttributeStats={playerData.attributeStats?.[selectedControl.id]}
                    />
                  </div>
                ) : (
                  <PackReveal
                    key={revealKey}
                    tier={revealTier}
                    initiallyOpened={packRestored}
                    onOpen={() => {
                      setPackOpened(true)
                      rememberPackOpened(playerData.profile.username)
                    }}
                  >
                    <div ref={exportRef} className="cards-export">
                      <Card
                        profile={playerData.profile}
                        stats={playerData.stats}
                        selectedControl={selectedControl}
                        pendingControl={pendingControl}
                        availableControls={availableControls}
                        onControlChange={selectTimeControl}
                        position={primaryPosition}
                        attributeStats={playerData.attributeStats?.[selectedControl.id]}
                      />
                    </div>
                  </PackReveal>
                )}
              </div>

              <div className={`recent-forms ${comparisonData ? 'comparison-forms' : ''}`}>
                <RecentFormPanel
                  username={playerData.profile.username}
                  summary={recentSummary}
                  role={comparisonData ? 'FIRST TEAM' : 'PLAYER FORM'}
                />
                {comparisonData && (
                  <RecentFormPanel
                    username={comparisonData.profile.username}
                    summary={comparisonSummary}
                    role="OPPOSITION"
                  />
                )}
              </div>

              {comparisonData && (
                <div className="comparison-share">
                  <ShareActions
                    username={playerData.profile.username}
                    compareUsername={comparisonData.profile.username}
                    onDownload={downloadCard}
                    isDownloading={isDownloading}
                    canDownload={packOpened}
                    showExport={false}
                  />

                  {error?.kind === 'download' && (
                    <p className="inline-error" role="alert"><CircleAlert size={16} /> {error.message}</p>
                  )}
                </div>
              )}
            </div>

            {!comparisonData && (
              <aside className="result-details">
                <ScoutingReport
                  selectedControl={selectedControl}
                  animateEntrance={!packRestored}
                  players={[
                    {
                      username: playerData.profile.username,
                      stats: playerData.stats,
                      recentSummary,
                      position: primaryPosition,
                      attributeStats: playerData.attributeStats,
                      openingStyle: primaryOpeningStyle,
                    },
                  ]}
                />

                <ShareActions
                  username={playerData.profile.username}
                  onDownload={downloadCard}
                  isDownloading={isDownloading}
                  canDownload={packOpened}
                />

                {error?.kind === 'download' && (
                  <p className="inline-error" role="alert"><CircleAlert size={16} /> {error.message}</p>
                )}
              </aside>
            )}
          </div>
        </section>
      )}

      <SiteFooter />
    </main>
  )
}

export default App
