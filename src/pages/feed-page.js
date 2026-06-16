import { supabase } from '../supabase.js'
import { toDisplayHandle } from '../lib/profile.js'
import {
  dismissSignal,
  getVisibleSignals,
  syncDismissedSignalIds
} from '../lib/badge.js'

const OPEN_PLAY_OPTION_VALUE = '__open_play__'
const OPEN_PLAY_DESTINATION = 'looking for something to do'

export class FeedPage extends HTMLElement {
  constructor() {
    super()
    this.signals = []
    this.userLocations = []
    this.currentUserId = null
    this.handleOpenComposer = this.handleOpenComposer.bind(this)
    this.handleGlobalOpenComposer = this.handleGlobalOpenComposer.bind(this)
    this.handleCancelComposer = this.handleCancelComposer.bind(this)
    this.handleCreateSignal = this.handleCreateSignal.bind(this)
    this.handleLocationSelectionChange = this.handleLocationSelectionChange.bind(this)
    this.handleSignalAction = this.handleSignalAction.bind(this)
  }

  async connectedCallback() {
    this.render()
    this.bindEvents()
    await this.loadCurrentUser()
    await this.loadUserLocations()
    await this.loadSignals()

    // Subscribe to real-time changes
    this.channel = supabase
      .channel('kid-colliders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'signals' },
        () => this.loadSignals()
      )
      .subscribe()
  }

  disconnectedCallback() {
    if (this.channel) supabase.removeChannel(this.channel)
    this.unbindEvents()
  }

  bindEvents() {
    document.addEventListener('open-signal-composer', this.handleGlobalOpenComposer)
    this.querySelector('#cancel-signal-composer')?.addEventListener('click', this.handleCancelComposer)
    this.querySelector('#signal-form')?.addEventListener('submit', this.handleCreateSignal)
    this.querySelector('#signal-location-select')?.addEventListener('change', this.handleLocationSelectionChange)
    this.querySelector('#signals-list')?.addEventListener('click', this.handleSignalAction)
  }

  unbindEvents() {
    document.removeEventListener('open-signal-composer', this.handleGlobalOpenComposer)
    this.querySelector('#cancel-signal-composer')?.removeEventListener('click', this.handleCancelComposer)
    this.querySelector('#signal-form')?.removeEventListener('submit', this.handleCreateSignal)
    this.querySelector('#signal-location-select')?.removeEventListener('change', this.handleLocationSelectionChange)
    this.querySelector('#signals-list')?.removeEventListener('click', this.handleSignalAction)
  }

  async loadCurrentUser() {
    const { data: userData, error } = await supabase.auth.getUser()
    if (!error && userData?.user) {
      this.currentUserId = userData.user.id
    }
  }

  async loadUserLocations() {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      return
    }

    const { data, error } = await supabase
      .from('user_locations')
      .select(`
        id,
        global_location_id,
        custom_name,
        custom_address,
        custom_website,
        is_starred,
        created_at,
        locations_global (
          id,
          name,
          address,
          website
        )
      `)
      .eq('user_id', userData.user.id)
      .order('is_starred', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      return
    }

    this.userLocations = this.sortLocations(data || [])
    this.renderLocationOptions()
  }

  getLocationLabel(row) {
    return row.custom_name || row.locations_global?.name || 'Unnamed place'
  }

  sortLocations(rows) {
    return [...rows].sort((a, b) => {
      if (Boolean(a.is_starred) !== Boolean(b.is_starred)) {
        return a.is_starred ? -1 : 1
      }

      return this.getLocationLabel(a).localeCompare(this.getLocationLabel(b), undefined, { sensitivity: 'base' })
    })
  }

  renderLocationOptions() {
    const selectEl = this.querySelector('#signal-location-select')
    if (!selectEl) {
      return
    }

    const options = [
      '<option value="">Select a saved place</option>',
      '<option value="__open_play__">I\'m free to play (no destination)</option>',
      ...this.userLocations.map((row) => {
        const name = this.getLocationLabel(row)
        return `<option value="${row.id}">${name}${row.is_starred ? ' (starred)' : ''}</option>`
      }),
      '<option value="__custom__">Use one-time custom destination</option>'
    ]

    selectEl.innerHTML = options.join('')
  }

  handleLocationSelectionChange() {
    const selectEl = this.querySelector('#signal-location-select')
    const customGroupEl = this.querySelector('#signal-custom-destination-group')
    const customInputEl = this.querySelector('#signal-custom-destination')

    const isCustom = selectEl?.value === '__custom__'
    if (customGroupEl) {
      customGroupEl.hidden = !isCustom
    }

    if (customInputEl) {
      customInputEl.required = Boolean(isCustom)
      if (!isCustom) {
        customInputEl.value = ''
      }
    }
  }

  handleOpenComposer() {
    const composer = this.querySelector('#signal-composer')
    const now = new Date()
    now.setMinutes(now.getMinutes() + 15)
    const etaEl = this.querySelector('#signal-eta')

    if (etaEl && !etaEl.value) {
      etaEl.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    }

    if (composer) {
      composer.hidden = false
    }
  }

  handleGlobalOpenComposer() {
    this.handleOpenComposer()
  }

  handleCancelComposer() {
    const composer = this.querySelector('#signal-composer')
    const form = this.querySelector('#signal-form')
    const statusEl = this.querySelector('#signal-status')

    if (form) {
      form.reset()
    }

    if (statusEl) {
      statusEl.textContent = ''
    }

    if (composer) {
      composer.hidden = true
    }
  }

  async handleCreateSignal(event) {
    event.preventDefault()

    const selectedLocationId = this.querySelector('#signal-location-select')?.value || ''
    const customDestination = this.querySelector('#signal-custom-destination')?.value.trim() || ''
    const etaInput = this.querySelector('#signal-eta')?.value
    const message = this.querySelector('#signal-message')?.value.trim()
    const expiresInMinutes = Number(this.querySelector('#signal-expiration')?.value || 60)
    const statusEl = this.querySelector('#signal-status')
    const submitBtn = this.querySelector('#signal-submit')

    const isCustom = selectedLocationId === '__custom__'
    const isOpenPlay = selectedLocationId === OPEN_PLAY_OPTION_VALUE
    const selectedLocation = this.userLocations.find((row) => row.id === selectedLocationId)
    const destination = isOpenPlay
      ? OPEN_PLAY_DESTINATION
      : isCustom
      ? customDestination
      : (selectedLocation ? this.getLocationLabel(selectedLocation) : '')

    if (!destination || !etaInput) {
      if (statusEl) {
        statusEl.textContent = 'Location and ETA are required.'
      }
      return
    }

    const etaDate = this.getTodayEtaDate(etaInput)
    if (Number.isNaN(etaDate.getTime())) {
      if (statusEl) {
        statusEl.textContent = 'Please provide a valid arrival time.'
      }
      return
    }

    const expiresAt = new Date(etaDate.getTime() + expiresInMinutes * 60_000).toISOString()
    const userNote = message || null

    if (submitBtn) {
      submitBtn.disabled = true
    }
    if (statusEl) {
      statusEl.textContent = 'Reticulating splines....'
    }

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) {
        throw userError
      }

      const user = userData?.user
      if (!user) {
        throw new Error('You need to sign in to create a signal.')
      }

      let locationId = selectedLocation?.global_location_id || null
      const userLocationId = (isCustom || isOpenPlay) ? null : (selectedLocation?.id || null)

      if (!locationId) {
        locationId = await this.resolveLocationId(destination, user.id)
      }

      const payloads = [
        {
          user_id: user.id,
          location_id: locationId,
          user_location_id: userLocationId,
          destination_text: destination,
          eta_at: etaDate.toISOString(),
          message: userNote,
          expires_at: expiresAt
        },
        {
          user_id: user.id,
          location_id: locationId,
          user_location_id: userLocationId,
          destination: destination,
          eta_at: etaDate.toISOString(),
          message: userNote,
          expires_at: expiresAt
        },
        {
          user_id: user.id,
          location_id: locationId,
          user_location_id: userLocationId,
          eta_at: etaDate.toISOString(),
          message: userNote,
          expires_at: expiresAt
        }
      ]

      let lastError = null
      let insertSucceeded = false

      for (const payload of payloads) {
        const { error } = await supabase.from('signals').insert(payload)
        if (!error) {
          insertSucceeded = true
          break
        }
        lastError = error
      }

      if (!insertSucceeded) {
        throw lastError || new Error('Could not create signal.')
      }

      if (statusEl) {
        statusEl.textContent = 'Collider activated! Your signal is live.'
      }

      this.handleCancelComposer()
      await this.loadUserLocations()
      await this.loadSignals()
    } catch (error) {
      console.error(error)
      if (statusEl) {
        statusEl.textContent = error.message || 'Could not send signal.'
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false
      }
    }
  }

  async resolveLocationId(destination, userId) {
    const destinationName = destination.trim()

    if (!destinationName) {
      throw new Error('Destination is required.')
    }

    const selectAttempts = [
      () => supabase.from('locations_global').select('id').eq('name', destinationName).limit(1).maybeSingle(),
      () => supabase.from('locations_global').select('id').ilike('name', destinationName).limit(1).maybeSingle()
    ]

    for (const attempt of selectAttempts) {
      const { data, error } = await attempt()
      if (!error && data?.id) {
        return data.id
      }
    }

    const createPayloads = [
      { name: destinationName, created_by: userId },
      { name: destinationName, user_id: userId },
      { name: destinationName, owner_id: userId },
      { name: destinationName }
    ]

    let lastError = null

    for (const payload of createPayloads) {
      const { data, error } = await supabase
        .from('locations_global')
        .insert(payload)
        .select('id')
        .single()

      if (!error && data?.id) {
        return data.id
      }

      lastError = error
    }

    // If insert failed due to an existing unique location, try one last read.
    const { data: retryData } = await supabase
      .from('locations_global')
      .select('id')
      .ilike('name', destinationName)
      .limit(1)
      .maybeSingle()

    if (retryData?.id) {
      return retryData.id
    }

    if (lastError) {
      throw lastError
    }

    throw new Error('Could not resolve destination location.')
  }

  getTodayEtaDate(etaInput) {
    if (!etaInput || !etaInput.includes(':')) {
      return new Date('invalid')
    }

    const [hourRaw, minuteRaw] = etaInput.split(':')
    const hours = Number(hourRaw)
    const minutes = Number(minuteRaw)

    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return new Date('invalid')
    }

    const etaDate = new Date()
    etaDate.setSeconds(0, 0)
    etaDate.setHours(hours, minutes, 0, 0)
    return etaDate
  }

  async loadSignals() {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('signals')
      .select(`
        *,
        profiles (email, display_name, display_tag)
      `)
      .gt('expires_at', now)
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      return
    }

    this.signals = await this.enrichSignalsWithDestinations(data || [])
    syncDismissedSignalIds(this.signals.map((signal) => signal.id))
    this.renderList()
  }

  async enrichSignalsWithDestinations(signals) {
    const userLocationIds = [...new Set(signals.map((s) => s.user_location_id).filter(Boolean))]
    const directLocationIds = [...new Set(signals.map((s) => s.location_id).filter(Boolean))]

    const userLocationMap = new Map()
    const globalLocationMap = new Map()

    if (userLocationIds.length) {
      const { data: userLocations, error } = await supabase
        .from('user_locations')
        .select(`
          id,
          global_location_id,
          custom_name,
          locations_global (
            id,
            name
          )
        `)
        .in('id', userLocationIds)

      if (!error && userLocations) {
        for (const row of userLocations) {
          userLocationMap.set(row.id, row)
        }
      }
    }

    const globalIdsFromUserLocations = [...new Set(
      [...userLocationMap.values()]
        .map((row) => row.global_location_id)
        .filter(Boolean)
    )]
    const allGlobalLocationIds = [...new Set([...directLocationIds, ...globalIdsFromUserLocations])]

    if (allGlobalLocationIds.length) {
      const { data: globalLocations, error } = await supabase
        .from('locations_global')
        .select('id, name')
        .in('id', allGlobalLocationIds)

      if (!error && globalLocations) {
        for (const row of globalLocations) {
          globalLocationMap.set(row.id, row.name)
        }
      }
    }

    return signals.map((signal) => {
      const userLocation = signal.user_location_id ? userLocationMap.get(signal.user_location_id) : null
      const destinationFromRelations =
        userLocation?.custom_name ||
        userLocation?.locations_global?.name ||
        (signal.location_id ? globalLocationMap.get(signal.location_id) : null) ||
        null

      return {
        ...signal,
        resolved_destination: destinationFromRelations || signal.destination_text || signal.destination || 'somewhere nearby'
      }
    })
  }

  handleSignalAction(event) {
    const button = event.target.closest('button[data-signal-action]')
    if (!button) {
      return
    }

    const signalId = button.getAttribute('data-signal-id')
    const action = button.getAttribute('data-signal-action')
    const statusEl = this.querySelector('#signals-status')

    if (!signalId) {
      return
    }

    if (action === 'dismiss') {
      dismissSignal(signalId)
      syncDismissedSignalIds(this.signals.map((signal) => signal.id))
      this.renderList()
      document.dispatchEvent(new CustomEvent('signals-visibility-change'))
      if (statusEl) {
        statusEl.textContent = 'Signal dismissed.'
      }
      return
    }

    if (action === 'delete' && this.currentUserId) {
      if (statusEl) {
        statusEl.textContent = 'Deleting your signal...'
      }

      supabase
        .from('signals')
        .delete()
        .eq('id', signalId)
        .eq('user_id', this.currentUserId)
        .then(({ error }) => {
          if (error) {
            if (statusEl) {
              statusEl.textContent = error.message
            }
            return
          }

          if (statusEl) {
            statusEl.textContent = 'Your signal was deleted.'
            setTimeout(() => {
              statusEl.textContent = ''
            }, 2000)
          }

          document.dispatchEvent(new CustomEvent('signals-visibility-change'))
          this.loadSignals()
        })
    }
  }

  render() {
    this.innerHTML = `
      
      <section id="signal-composer" hidden>
        <h3>Activate Collider</h3>
        <form id="signal-form">
          <div class="form-group">
            <label for="signal-location-select">Saved Location</label>
            <select id="signal-location-select" required>
              <option value="">Loading places...</option>
            </select>
          </div>
          <div class="form-group" id="signal-custom-destination-group" hidden>
            <label for="signal-custom-destination">One-Time Destination</label>
            <input type="text" id="signal-custom-destination" placeholder="Cooper Park" />
          </div>
          <div class="form-group">
            <label for="signal-eta">Expected Arrival Time</label>
            <input type="time" id="signal-eta" required />
          </div>
          <div class="form-group">
            <label for="signal-message">Message</label>
            <textarea id="signal-message" rows="3" placeholder="Optional note for friends"></textarea>
          </div>
          <div class="form-group">
            <label for="signal-expiration">Expiration</label>
            <select id="signal-expiration">
              <option value="10">10 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60" selected>1 hour</option>
              <option value="120">2 hours</option>
              <option value="300">5 hours</option>
            </select>
          </div>
          <div class="signal-actions">
            <button id="signal-submit" type="submit" class="primary-button">Send Signal</button>
            <button id="cancel-signal-composer" type="button">Cancel</button>
          </div>
          <p id="signal-status" role="status"></p>
        </form>
      </section>
      <p id="signals-status" role="status"></p>
      <div id="signals-list" aria-live="polite">
        <p>Loading...</p>
      </div>
    `
  }

  renderList() {
    const listEl = this.querySelector('#signals-list')
    const visibleSignals = getVisibleSignals(this.signals)

    if (!visibleSignals.length) {
      listEl.innerHTML = '<p>No active signals right now.</p>'
      return
    }

    listEl.innerHTML = '<ul class="feed-list">' + visibleSignals.map((signal) => {
      const handle = toDisplayHandle(signal.profiles, 'A friend')
      const name = handle.tag
        ? `${handle.base} <span class="display-tag">#${handle.tag}</span>`
        : handle.base
      const note = (signal.message || '').trim()
      const destination = signal.resolved_destination || 'somewhere nearby';
      console.log(signal.eta_at);
      const now = new Date();
      const eta = new Date(signal.eta_at);
      const etaText = (() => {
        if (!signal.eta_at) {
          return ' soon';
        } else if (eta < now){
          return ' now-ish';
        } else if (eta - now < 5 * 60 * 1000) {
          return ', any minute now';
        } else {
          return ` at ${eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
        }
      })()
      const expiresText = new Date(signal.expires_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      const isOwnSignal = signal.user_id && signal.user_id === this.currentUserId
      const actionLabel = isOwnSignal ? 'Delete My Signal' : 'Dismiss'
      const actionType = isOwnSignal ? 'delete' : 'dismiss'
      const isOpenPlaySignal = destination.toLowerCase() === OPEN_PLAY_DESTINATION

      return `
        <li>
          <article class="signal-card">
            <div>
              <header class="signal-card-header">
                <p class="signal-summary">${isOpenPlaySignal
                  ? `<span class="signal-user">${name}</span><span class="signal-destination"> is <strong>${OPEN_PLAY_DESTINATION}</strong>${etaText}.</span>`
                  : `<span class="signal-user">${name}</span><span class="signal-destination"> ➤ <strong>${destination}</strong>${etaText}.</span>`}
                </p>
              </header>
              <dl class="signal-meta">
                <div>
                  <dt>Expires</dt>
                  <dd>${expiresText}</dd>
                </div>
              </dl>
              ${note ? `<p class="signal-message">${note}</p>` : ''}
            </div>
            <div class="list-item-actions">
              <button type="button" data-signal-action="${actionType}" data-signal-id="${signal.id}">
                ${isOwnSignal ? `<svg viewBox="-0.5 -0.5 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" id="Trash--Streamline-Iconoir" height="16" width="16">
                  <desc>
                    Trash Streamline Icon: https://streamlinehq.com
                  </desc>
                  <path d="m12.96975 5.4488125 -1.3639999999999999 7.75775c-0.1149375 0.6538125 -0.6829375 1.130625 -1.34675 1.130625H4.7410000000000005c-0.663875 0 -1.2318125 -0.47681250000000003 -1.34675 -1.130625L2.03025 5.4488125" stroke="#000000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1"></path>
                  <path d="M13.653500000000001 3.3976875h-3.8459375000000002m-8.461062499999999 0h3.8459375000000002m0 0V2.03025c0 -0.75525 0.61225 -1.3674374999999999 1.3674374999999999 -1.3674374999999999h1.88025c0.75525 0 1.3674374999999999 0.6121875 1.3674374999999999 1.3674374999999999v1.3674374999999999m-4.615125 0h4.615125" stroke="#000000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1"></path>
                </svg>` : `<svg viewBox="-0.5 -0.5 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" id="Xmark--Streamline-Iconoir" height="16" width="16">
                <desc>
                  Xmark Streamline Icon: https://streamlinehq.com
                </desc>
                <path d="M1.069875 13.930125 7.5 7.5M13.930125 1.069875 7.5 7.5m0 0L1.069875 1.069875M7.5 7.5l6.430125 6.430125" stroke="#000000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1"></path>
              </svg>`}
              </button>
            </div>
          </article>
        </li>
      `
    }).join('') + '</ul>'
  }
}

customElements.define('feed-page', FeedPage)
