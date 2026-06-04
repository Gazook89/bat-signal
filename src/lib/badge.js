const BADGE_ENABLED_KEY = 'kc.badge.enabled'
const BADGE_MODE_KEY = 'kc.badge.mode'
const BADGE_LAST_SEEN_AT_KEY = 'kc.badge.lastSeenAt'
const DISMISSED_SIGNAL_IDS_KEY = 'kc.dismissedSignalIds'

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

export function getDismissedSignalIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISSED_SIGNAL_IDS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function dismissSignal(signalId) {
  if (!signalId) {
    return
  }

  const ids = new Set(getDismissedSignalIds())
  ids.add(signalId)
  localStorage.setItem(DISMISSED_SIGNAL_IDS_KEY, JSON.stringify([...ids]))
}

export function syncDismissedSignalIds(activeSignalIds) {
  const activeIds = new Set((activeSignalIds || []).filter((id) => typeof id === 'string'))
  const remaining = getDismissedSignalIds().filter((id) => activeIds.has(id))
  localStorage.setItem(DISMISSED_SIGNAL_IDS_KEY, JSON.stringify(remaining))
  return remaining
}

export function isSignalDismissed(signalId) {
  return getDismissedSignalIds().includes(signalId)
}

export function getVisibleSignals(signals) {
  const dismissedIds = new Set(getDismissedSignalIds())
  return (signals || []).filter((signal) => !dismissedIds.has(signal.id))
}

function countRelevantSignals(signals, currentUserId) {
  return getVisibleSignals(signals).filter((signal) => signal.user_id && signal.user_id !== currentUserId)
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

export function countIncomingPendingRequests(friendships, currentUserId) {
  return friendships.filter((relationship) => {
    return relationship.addressee_id === currentUserId && relationship.status === 'pending'
  }).length
}

export function countActiveSignalsFromOthers(signals, currentUserId) {
  return countActiveSignals(signals, currentUserId)
}

export function countNewSignalsFromOthers(signals, currentUserId) {
  return countNewSignals(signals, currentUserId)
}

export function getCombinedBadgeCount({ signals, friendships, currentUserId }) {
  const incomingRequests = countIncomingPendingRequests(friendships || [], currentUserId)
  const { mode } = getBadgeSettings()

  if (mode === 'active') {
    return countActiveSignalsFromOthers(signals || [], currentUserId) + incomingRequests
  }

  return countNewSignalsFromOthers(signals || [], currentUserId) + incomingRequests
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
