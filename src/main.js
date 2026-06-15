import { supabase } from './supabase.js'
import './pages/auth-page.js'
import { ensureProfileRecord, toDisplayHandle } from './lib/profile.js'
import {
  applyBadgeCount,
  clearBadge,
  getCombinedBadgeCount,
  getBadgeSettings,
  markSignalsSeenNow
} from './lib/badge.js'

// Lazy loaders must use static import strings so Vite can analyze them.
const pageLoaders = {
  'feed-page': () => import('./pages/feed-page.js'),
  'profile-page': () => import('./pages/profile-page.js'),
  'locations-page': () => import('./pages/locations-page.js'),
  'friends-page': () => import('./pages/friends-page.js')
}

const loadPage = async (tagName) => {
  if (!customElements.get(tagName)) {
    const load = pageLoaders[tagName]
    if (!load) {
      throw new Error(`No loader found for ${tagName}`)
    }
    await load()
  }
}

const app = document.getElementById('app')
const nav = document.getElementById('main-nav')
const appHeader = document.getElementById('app-header')
const brandTitleEl = document.getElementById('brand-title')
const pageTitleEl = document.getElementById('page-title')
const currentUserEl = document.getElementById('current-user')
const navOpenComposerButton = document.getElementById('nav-open-signal-composer')
let shouldOpenComposerOnFeed = false
let badgeChannel = null
let currentUserId = null

const headerByRoute = {
  '#feed': { mode: 'feed', pageTitle: '', showUser: true },
  '#locations': { mode: 'subpage', pageTitle: 'My Places', showUser: false },
  '#friends': { mode: 'subpage', pageTitle: 'Friends', showUser: false },
  '#profile': { mode: 'subpage', pageTitle: 'Profile', showUser: false }
}

function updateHeader(hash = '') {
  if (!appHeader || !brandTitleEl || !pageTitleEl || !currentUserEl) {
    return
  }

  const config = headerByRoute[hash] || { mode: 'auth', pageTitle: '', showUser: false }

  appHeader.classList.remove('header-feed', 'header-subpage', 'header-auth')
  appHeader.classList.add(`header-${config.mode}`)

  brandTitleEl.textContent = 'Kid Collider'

  if (config.pageTitle) {
    pageTitleEl.textContent = config.pageTitle
    pageTitleEl.hidden = false
  } else {
    pageTitleEl.textContent = ''
    pageTitleEl.hidden = true
  }

  const hasUserLabel = Boolean((currentUserEl.textContent || '').trim())
  currentUserEl.hidden = !(config.showUser && hasUserLabel)
}

function dispatchOpenComposerEvent() {
  document.dispatchEvent(new CustomEvent('open-signal-composer'))
}

function handleSignalsVisibilityChange() {
  refreshBadge()
}

document.addEventListener('signals-visibility-change', handleSignalsVisibilityChange)

async function fetchActiveSignals() {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('signals')
    .select('id, user_id, created_at, expires_at')
    .gt('expires_at', now)

  if (error) {
    throw error
  }

  return data || []
}

async function fetchIncomingFriendRequests() {
  if (!currentUserId) {
    return []
  }

  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status, created_at')
    .eq('addressee_id', currentUserId)
    .eq('status', 'pending')

  if (error) {
    throw error
  }

  return data || []
}

async function refreshBadge() {
  if (!currentUserId) {
    return
  }

  const settings = getBadgeSettings()
  if (!settings.enabled) {
    await clearBadge()
    return
  }

  try {
    const [signals, friendships] = await Promise.all([
      fetchActiveSignals(),
      fetchIncomingFriendRequests()
    ])
    const badgeCount = getCombinedBadgeCount({ signals, friendships, currentUserId })
    await applyBadgeCount(badgeCount)
  } catch (error) {
    console.error(error)
  }
}

function stopBadgeWatcher() {
  if (badgeChannel) {
    supabase.removeChannel(badgeChannel)
    badgeChannel = null
  }
}

function startBadgeWatcher() {
  if (!currentUserId) {
    return
  }

  stopBadgeWatcher()

  badgeChannel = supabase
    .channel('signals-badge-updates')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'signals' },
      () => refreshBadge()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'friendships' },
      () => refreshBadge()
    )
    .subscribe()

  refreshBadge()
}

function setCurrentUserDisplay(profile, user) {
  if (!currentUserEl) {
    return
  }

  const fallback = user?.user_metadata?.display_name || user?.email || ''
  const handle = toDisplayHandle(profile, fallback)

  if (handle.base) {
    currentUserEl.textContent = ''

    const baseEl = document.createElement('span')
    baseEl.textContent = handle.base
    currentUserEl.append(baseEl)

    if (handle.tag) {
      const tagEl = document.createElement('span')
      tagEl.className = 'display-tag'
      tagEl.textContent = `#${handle.tag}`
      currentUserEl.append(tagEl)
    }
  } else {
    currentUserEl.textContent = ''
  }

  updateHeader(window.location.hash)
}

async function enterAuthenticatedArea(session, nextHash = '#feed') {
  nav.hidden = false
  currentUserId = session?.user?.id || null

  try {
    const profile = await ensureProfileRecord(supabase, session.user)
    setCurrentUserDisplay(profile, session.user)
  } catch (error) {
    console.error(error)
    setCurrentUserDisplay(null, session.user)
  }

  startBadgeWatcher()
  window.location.hash = nextHash
}

// Simple hash router
const routes = {
  '': async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      nav.hidden = true
      app.innerHTML = '<auth-page></auth-page>'
      updateHeader('')
    } else {
      await enterAuthenticatedArea(session, '#feed')
    }
  },
  '#feed': async () => {
    await loadPage('feed-page')
    app.innerHTML = '<feed-page></feed-page>'
    nav.hidden = false
    updateHeader('#feed')

    markSignalsSeenNow()
    refreshBadge()

    if (shouldOpenComposerOnFeed) {
      shouldOpenComposerOnFeed = false
      queueMicrotask(() => dispatchOpenComposerEvent())
    }
  },
  '#profile': async () => {
    await loadPage('profile-page')
    app.innerHTML = '<profile-page></profile-page>'
    nav.hidden = false
    updateHeader('#profile')
  },
  '#locations': async () => {
    await loadPage('locations-page')
    app.innerHTML = '<locations-page></locations-page>'
    nav.hidden = false
    updateHeader('#locations')
  },
  '#friends': async () => {
    await loadPage('friends-page')
    app.innerHTML = '<friends-page></friends-page>'
    nav.hidden = false
    updateHeader('#friends')
  }
}

function navigate() {
  const hash = window.location.hash
  const route = routes[hash] || routes['']
  route()
}

// Handle auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    enterAuthenticatedArea(session, '#feed')
  } else if (event === 'SIGNED_OUT') {
    stopBadgeWatcher()
    currentUserId = null
    clearBadge()
    nav.hidden = true
    if (currentUserEl) {
      currentUserEl.textContent = ''
      currentUserEl.hidden = true
    }
    updateHeader('')
    window.location.hash = ''
  }
})

document.addEventListener('profile-change', (event) => {
  setCurrentUserDisplay(event.detail?.profile, event.detail?.user)
})

document.addEventListener('badge-settings-change', () => {
  refreshBadge()
})

navOpenComposerButton?.addEventListener('click', async () => {
  shouldOpenComposerOnFeed = true

  if (window.location.hash === '#feed') {
    dispatchOpenComposerEvent()
    shouldOpenComposerOnFeed = false
    return
  }

  window.location.hash = '#feed'
})

// Init
window.addEventListener('hashchange', navigate)
navigate()
