const PACK_STATE_PREFIX = 'rookster:pack-open:v1:'
const PACK_STATE_TTL = 60 * 60 * 1000

function getKey(username) {
  return `${PACK_STATE_PREFIX}${username.trim().toLowerCase()}`
}

export function isPackOpenRemembered(username) {
  if (!username) return false
  try {
    const openedAt = Number(window.localStorage.getItem(getKey(username)))
    if (!openedAt || Date.now() - openedAt >= PACK_STATE_TTL) {
      window.localStorage.removeItem(getKey(username))
      return false
    }
    return true
  } catch {
    return false
  }
}

export function rememberPackOpened(username) {
  if (!username) return
  try {
    window.localStorage.setItem(getKey(username), String(Date.now()))
  } catch {
    // The reveal still works when browser storage is unavailable.
  }
}
