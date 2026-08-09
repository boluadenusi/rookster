const STATUS = {
  academy: { key: 'academy-prospect', label: 'Academy Prospect', tier: 'prospect' },
  hotProspect: { key: 'hot-prospect', label: 'Hot Prospect', tier: 'prospect' },
  oneToWatch: { key: 'one-to-watch', label: 'One to Watch', tier: 'rising' },
  emerging: { key: 'emerging-talent', label: 'Emerging Talent', tier: 'rising' },
  breakout: { key: 'breakout-talent', label: 'Breakout Talent', tier: 'rising' },
  firstTeamProspect: { key: 'first-team-prospect', label: 'First-Team Prospect', tier: 'prospect' },
  risingStar: { key: 'rising-star', label: 'Rising Star', tier: 'rising' },
  established: { key: 'established-player', label: 'Established Player', tier: 'established' },
  keyPlayer: { key: 'key-player', label: 'Key Player', tier: 'established' },
  star: { key: 'star-player', label: 'Star Player', tier: 'elite' },
  elite: { key: 'elite-player', label: 'Elite Player', tier: 'elite' },
  worldClass: { key: 'world-class', label: 'World Class', tier: 'elite' },
  superstar: { key: 'superstar', label: 'Superstar', tier: 'elite' },
  generational: { key: 'generational-talent', label: 'Generational Talent', tier: 'legend' },
  veteran: { key: 'veteran', label: 'Veteran', tier: 'veteran' },
  eliteVeteran: { key: 'elite-veteran', label: 'Elite Veteran', tier: 'veteran' },
  cultHero: { key: 'cult-hero', label: 'Cult Hero', tier: 'legend' },
  clubLegend: { key: 'club-legend', label: 'Club Legend', tier: 'legend' },
  legend: { key: 'legend', label: 'Legend', tier: 'legend' },
  icon: { key: 'icon', label: 'Icon', tier: 'icon' },
}

const RATING_CEILINGS = [1000, 1400, 1800, 2200, 2500, 2700]
const EXPERIENCE_ORDER = ['prospect', 'breakout', 'emerging', 'firstTeam', 'key', 'established', 'veteran', 'eliteVeteran']

// Rating decides the level; appearances decide how confidently that level can be framed.
// Every row progresses forward in football language as the sample grows.
const STAGE_STATUSES = {
  prospect: [STATUS.academy, STATUS.hotProspect, STATUS.oneToWatch, STATUS.oneToWatch, STATUS.risingStar, STATUS.star, STATUS.elite],
  breakout: [STATUS.hotProspect, STATUS.oneToWatch, STATUS.emerging, STATUS.breakout, STATUS.star, STATUS.elite, STATUS.worldClass],
  emerging: [STATUS.oneToWatch, STATUS.emerging, STATUS.breakout, STATUS.risingStar, STATUS.elite, STATUS.worldClass, STATUS.superstar],
  firstTeam: [STATUS.emerging, STATUS.breakout, STATUS.risingStar, STATUS.keyPlayer, STATUS.worldClass, STATUS.superstar, STATUS.superstar],
  key: [STATUS.breakout, STATUS.firstTeamProspect, STATUS.keyPlayer, STATUS.star, STATUS.worldClass, STATUS.superstar, STATUS.generational],
  established: [STATUS.established, STATUS.established, STATUS.keyPlayer, STATUS.star, STATUS.worldClass, STATUS.superstar, STATUS.generational],
  veteran: [STATUS.veteran, STATUS.veteran, STATUS.veteran, STATUS.eliteVeteran, STATUS.clubLegend, STATUS.legend, STATUS.legend],
  eliteVeteran: [STATUS.veteran, STATUS.veteran, STATUS.eliteVeteran, STATUS.cultHero, STATUS.clubLegend, STATUS.legend, STATUS.icon],
}

const FORMAT_EXPERIENCE_STAGES = {
  rapid: [
    { minimumGames: 5000, stage: 'eliteVeteran' },
    { minimumGames: 3000, stage: 'veteran' },
    { minimumGames: 2000, stage: 'established' },
    { minimumGames: 1000, stage: 'key' },
    { minimumGames: 500, stage: 'firstTeam' },
    { minimumGames: 201, stage: 'emerging' },
    { minimumGames: 101, stage: 'breakout' },
    { minimumGames: 0, stage: 'prospect' },
  ],
  blitz: [
    { minimumGames: 12000, stage: 'eliteVeteran' },
    { minimumGames: 8000, stage: 'veteran' },
    { minimumGames: 5000, stage: 'established' },
    { minimumGames: 3000, stage: 'key' },
    { minimumGames: 1500, stage: 'firstTeam' },
    { minimumGames: 501, stage: 'emerging' },
    { minimumGames: 251, stage: 'breakout' },
    { minimumGames: 0, stage: 'prospect' },
  ],
  bullet: [
    { minimumGames: 25000, stage: 'eliteVeteran' },
    { minimumGames: 15000, stage: 'veteran' },
    { minimumGames: 10000, stage: 'established' },
    { minimumGames: 6000, stage: 'key' },
    { minimumGames: 3000, stage: 'firstTeam' },
    { minimumGames: 1001, stage: 'emerging' },
    { minimumGames: 501, stage: 'breakout' },
    { minimumGames: 0, stage: 'prospect' },
  ],
}

// A long overall career prevents a player looking new merely because one format is sparse.
const CAREER_FLOORS = [
  { minimumGames: 10000, stage: 'veteran' },
  { minimumGames: 5000, stage: 'established' },
  { minimumGames: 2000, stage: 'breakout' },
]

function safeCount(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function getRatingBand(rating) {
  const band = RATING_CEILINGS.findIndex((ceiling) => rating < ceiling)
  return band === -1 ? RATING_CEILINGS.length : band
}

function laterStage(first, second) {
  return EXPERIENCE_ORDER.indexOf(first) >= EXPERIENCE_ORDER.indexOf(second) ? first : second
}

export function getExperienceStage(controlId, totalGames = 0) {
  const stages = FORMAT_EXPERIENCE_STAGES[controlId] ?? FORMAT_EXPERIENCE_STAGES.rapid
  const games = safeCount(totalGames)
  return stages.find(({ minimumGames }) => games >= minimumGames).stage
}

export function getCareerFloor(allFormatGames = 0) {
  const games = safeCount(allFormatGames)
  return CAREER_FLOORS.find(({ minimumGames }) => games >= minimumGames)?.stage ?? 'prospect'
}

export function getPlayerStatus(rating, totalGames = 0, controlId = 'rapid', allFormatGames = totalGames) {
  const safeRating = Number.isFinite(rating) ? Math.max(0, rating) : 0
  const formatStage = getExperienceStage(controlId, totalGames)
  const careerFloor = getCareerFloor(Math.max(safeCount(totalGames), safeCount(allFormatGames)))
  const stage = laterStage(formatStage, careerFloor)

  return {
    ...STAGE_STATUSES[stage][getRatingBand(safeRating)],
    stage,
    formatStage,
    careerFloor,
    careerAdjusted: stage !== formatStage,
  }
}
