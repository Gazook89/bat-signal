const BADGE_ENABLED_KEY = 'kc.badge.enabled'
const BADGE_MODE_KEY = 'kc.badge.mode'
const BADGE_LAST_SEEN_AT_KEY = 'kc.badge.lastSeenAt'

export function isBadgingSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.setAppBadge === 'function' && typeof navigator.clearAppBadge === 'function'
}

export function getBadgeSettings() {
  const enabledValue = localStorage.getItem(BADGE_ENABLED_KEY)
  const modeValue = localStorage.getItem(BADGE_MODE_KEY)

  return {
    enabled: enabledValue === 'true',
    mode: modeValue === 'active' ? 'active' : 'new'
  }
}

export function saveBadgeSettings({ enabled, mode }) {
  if (typeof enabled === 'boolean') {
    localStorage.setItem(BADGE_ENABLED_KEY, String(enabled))
  }

  if (mode === 'active' || mode === 'new') {
    localStorage.setItem(BADGE_MODE_KEY, mode)
  }
}

export function getLastSeenAt() {
  const raw = localStorage.getItem(BADGE_LAST_SEEN_AT_KEY)
  if (!raw) {
    return null
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed
}

export function markSignalsSeenNow() {
  localStorage.setItem(BADGE_LAST_SEEN_AT_KEY, new Date().toISOString())
}

function countRelevantSignals(signals, currentUserId) {
  return signals.filter((signal) => signal.user_id && signal.user_id !== currentUserId)
}

function countNewSignals(signals, currentUserId) {
  const lastSeen = getLastSeenAt()
  if (!lastSeen) {
    return 0
  }

  return countRelevantSignals(signals, currentUserId).filter((signal) => {
    const createdAt = new Date(signal.created_at)
    return !Number.isNaN(createdAt.getTime()) && createdAt > lastSeen
  }).length
}

function countActiveSignals(signals, currentUserId) {
  return countRelevantSignals(signals, currentUserId).length
}

export function getBadgeCount(signals, currentUserId) {
  const { mode } = getBadgeSettings()
  if (mode === 'active') {
    return countActiveSignals(signals, currentUserId)
  }
  return countNewSignals(signals, currentUserId)
}

export async function applyBadgeCount(count) {
  if (!isBadgingSupported()) {
    return
  }

  if (count > 0) {
    await navigator.setAppBadge(count)
  } else {
    await navigator.clearAppBadge()
  }
}

export async function clearBadge() {
  if (!isBadgingSupported()) {
    return
  }
  await navigator.clearAppBadge()
}

export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined' || typeof Notification.requestPermission !== 'function') {
    return 'unsupported'
  }

  return Notification.requestPermission()
}
