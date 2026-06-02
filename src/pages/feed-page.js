import { supabase } from '../supabase.js'

export class FeedPage extends HTMLElement {
  constructor() {
    super()
    this.signals = []
    this.userLocations = []
    this.handleOpenComposer = this.handleOpenComposer.bind(this)
    this.handleGlobalOpenComposer = this.handleGlobalOpenComposer.bind(this)
    this.handleCancelComposer = this.handleCancelComposer.bind(this)
    this.handleCreateSignal = this.handleCreateSignal.bind(this)
    this.handleLocationSelectionChange = this.handleLocationSelectionChange.bind(this)
  }

  async connectedCallback() {
    this.render()
    this.bindEvents()
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
  }

  unbindEvents() {
    document.removeEventListener('open-signal-composer', this.handleGlobalOpenComposer)
    this.querySelector('#cancel-signal-composer')?.removeEventListener('click', this.handleCancelComposer)
    this.querySelector('#signal-form')?.removeEventListener('submit', this.handleCreateSignal)
    this.querySelector('#signal-location-select')?.removeEventListener('change', this.handleLocationSelectionChange)
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

    this.userLocations = data || []
    this.renderLocationOptions()
  }

  renderLocationOptions() {
    const selectEl = this.querySelector('#signal-location-select')
    if (!selectEl) {
      return
    }

    const options = [
      '<option value="">Select a saved place</option>',
      ...this.userLocations.map((row) => {
        const name = row.custom_name || row.locations_global?.name || 'Unnamed place'
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
      etaEl.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
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
    const selectedLocation = this.userLocations.find((row) => row.id === selectedLocationId)
    const destination = isCustom
      ? customDestination
      : (selectedLocation?.custom_name || selectedLocation?.locations_global?.name || '')

    if (!destination || !etaInput) {
      if (statusEl) {
        statusEl.textContent = 'Location and ETA are required.'
      }
      return
    }

    const etaDate = new Date(etaInput)
    if (Number.isNaN(etaDate.getTime())) {
      if (statusEl) {
        statusEl.textContent = 'Please provide a valid ETA.'
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
      const userLocationId = isCustom ? null : (selectedLocation?.id || null)

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

  async loadSignals() {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('signals')
      .select(`
        *,
        profiles (email, display_name)
      `)
      .gt('expires_at', now)
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      return
    }

    this.signals = await this.enrichSignalsWithDestinations(data || [])
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
            <input type="datetime-local" id="signal-eta" required />
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
            <button id="signal-submit" type="submit">Send Signal</button>
            <button id="cancel-signal-composer" type="button">Cancel</button>
          </div>
          <p id="signal-status" role="status"></p>
        </form>
      </section>
      <div id="signals-list" aria-live="polite">
        <p>Loading...</p>
      </div>
    `
  }

  renderList() {
    const listEl = this.querySelector('#signals-list')
    if (!this.signals.length) {
      listEl.innerHTML = '<p>No active signals right now.</p>'
      return
    }

    listEl.innerHTML = '<ul class="feed-list">' + this.signals.map(s => `
      <li>
        ${(() => {
          const name = s.profiles?.display_name || s.profiles?.email || 'A friend'
          const note = (s.message || '').trim()
          const destination = s.resolved_destination || 'somewhere nearby'
          const etaText = s.eta_at
            ? new Date(s.eta_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            : 'soon'
          const expiresText = new Date(s.expires_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

          return `
            <article class="signal-card">
              <header class="signal-card-header">
                <p class="signal-summary"><strong>${name}</strong> is headed to <strong>${destination}</strong>.</p>
              </header>
              <dl class="signal-meta">
                <div>
                  <dt>ETA</dt>
                  <dd>${etaText}</dd>
                </div>
                <div>
                  <dt>Expires</dt>
                  <dd>${expiresText}</dd>
                </div>
              </dl>
              ${note ? `<p class="signal-message">${note}</p>` : ''}
            </article>`
        })()}
      </li>
    `).join('') + '</ul>'
  }
}

customElements.define('feed-page', FeedPage)
