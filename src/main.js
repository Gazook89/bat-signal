import { supabase } from './supabase.js'
import './pages/auth-page.js'
import { ensureProfileRecord } from './lib/profile.js'

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
const currentUserEl = document.getElementById('current-user')
const navOpenComposerButton = document.getElementById('nav-open-signal-composer')
let shouldOpenComposerOnFeed = false

function dispatchOpenComposerEvent() {
  document.dispatchEvent(new CustomEvent('open-signal-composer'))
}

function setCurrentUserDisplay(profile, user) {
  if (!currentUserEl) {
    return
  }

  const label = profile?.display_name || profile?.email || user?.user_metadata?.display_name || user?.email || ''

  if (label) {
    currentUserEl.textContent = label
    currentUserEl.hidden = false
  } else {
    currentUserEl.textContent = ''
    currentUserEl.hidden = true
  }
}

async function enterAuthenticatedArea(session, nextHash = '#feed') {
  nav.hidden = false

  try {
    const profile = await ensureProfileRecord(supabase, session.user)
    setCurrentUserDisplay(profile, session.user)
  } catch (error) {
    console.error(error)
    setCurrentUserDisplay(null, session.user)
  }

  window.location.hash = nextHash
}

// Simple hash router
const routes = {
  '': async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      nav.hidden = true
      app.innerHTML = '<auth-page></auth-page>'
    } else {
      await enterAuthenticatedArea(session, '#feed')
    }
  },
  '#feed': async () => {
    await loadPage('feed-page')
    app.innerHTML = '<feed-page></feed-page>'
    nav.hidden = false

    if (shouldOpenComposerOnFeed) {
      shouldOpenComposerOnFeed = false
      queueMicrotask(() => dispatchOpenComposerEvent())
    }
  },
  '#profile': async () => {
    await loadPage('profile-page')
    app.innerHTML = '<profile-page></profile-page>'
    nav.hidden = false
  },
  '#locations': async () => {
    await loadPage('locations-page')
    app.innerHTML = '<locations-page></locations-page>'
    nav.hidden = false
  },
  '#friends': async () => {
    await loadPage('friends-page')
    app.innerHTML = '<friends-page></friends-page>'
    nav.hidden = false
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
    nav.hidden = true
    if (currentUserEl) {
      currentUserEl.textContent = ''
      currentUserEl.hidden = true
    }
    window.location.hash = ''
  }
})

document.addEventListener('profile-change', (event) => {
  setCurrentUserDisplay(event.detail?.profile, event.detail?.user)
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
