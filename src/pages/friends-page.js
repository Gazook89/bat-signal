import { supabase } from '../supabase.js'

export class FriendsPage extends HTMLElement {
  constructor() {
    super()
    this.user = null
    this.relationships = []
    this.profileMap = new Map()
    this.searchResults = []
    this.handleSearchSubmit = this.handleSearchSubmit.bind(this)
    this.handleFriendActionClick = this.handleFriendActionClick.bind(this)
  }

  connectedCallback() {
    this.render()
    this.bindEvents()
    this.loadData()
  }

  disconnectedCallback() {
    this.unbindEvents()
  }

  bindEvents() {
    this.querySelector('#friend-search-form')?.addEventListener('submit', this.handleSearchSubmit)
    this.querySelector('#friends-page')?.addEventListener('click', this.handleFriendActionClick)
  }

  unbindEvents() {
    this.querySelector('#friend-search-form')?.removeEventListener('submit', this.handleSearchSubmit)
    this.querySelector('#friends-page')?.removeEventListener('click', this.handleFriendActionClick)
  }

  render() {
    this.innerHTML = `
      <section id="friends-page">
        <h2>Friends</h2>
        <p>Search by exact display name or exact registered email to connect.</p>

        <form id="friend-search-form">
          <div class="form-group">
            <label for="friend-search-term">Find a friend</label>
            <input
              id="friend-search-term"
              type="text"
              required
              placeholder="Exact display name or email"
              autocomplete="off"
            />
          </div>
          <button id="friend-search-btn" type="submit">Search</button>
        </form>

        <p id="friends-status" role="status"></p>

        <section id="friend-search-results-section" hidden>
          <h3>Search Results</h3>
          <div id="friend-search-results"></div>
        </section>

        <section>
          <h3>Incoming Requests</h3>
          <div id="incoming-requests"></div>
        </section>

        <section>
          <h3>Outgoing Requests</h3>
          <div id="outgoing-requests"></div>
        </section>

        <section>
          <h3>Connected Friends</h3>
          <div id="accepted-friends"></div>
        </section>

        <details id="blocked-users-panel">
          <summary>Blocked Users</summary>
          <div id="blocked-users"></div>
        </details>
      </section>
    `
  }

  async loadData() {
    const statusEl = this.querySelector('#friends-status')
    statusEl.textContent = 'Loading friends data...'

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      statusEl.textContent = 'Sign in to manage friends.'
      return
    }

    this.user = userData.user

    const { data, error } = await supabase
      .from('friendships')
      .select('id, requester_id, addressee_id, status, created_at')
      .or(`requester_id.eq.${this.user.id},addressee_id.eq.${this.user.id}`)
      .order('created_at', { ascending: false })

    if (error) {
      statusEl.textContent = error.message || 'Could not load friendships.'
      return
    }

    this.relationships = data || []
    await this.loadProfilesForRelationships()
    this.renderSections()
    statusEl.textContent = ''
  }

  async loadProfilesForRelationships() {
    const ids = [...new Set(
      this.relationships
        .flatMap((row) => [row.requester_id, row.addressee_id])
        .filter(Boolean)
    )]

    if (!ids.length) {
      this.profileMap = new Map()
      return
    }

    let profiles = []

    const rpcResult = await supabase.rpc('get_profiles_basic', { profile_ids: ids })
    if (!rpcResult.error) {
      profiles = rpcResult.data || []
    } else {
      const fallback = await supabase
        .from('profiles')
        .select('id, email, display_name')
        .in('id', ids)

      if (!fallback.error) {
        profiles = fallback.data || []
      }
    }

    this.profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]))
  }

  renderSections() {
    const incoming = this.relationships.filter((row) => row.status === 'pending' && row.addressee_id === this.user.id)
    const outgoing = this.relationships.filter((row) => row.status === 'pending' && row.requester_id === this.user.id)
    const accepted = this.relationships.filter((row) => row.status === 'accepted')
    const blocked = this.relationships.filter((row) => row.status === 'blocked' && row.requester_id === this.user.id)

    this.renderRelationshipList('#incoming-requests', incoming, (row, otherId) => `
      <div class="signal-actions">
        <button type="button" data-action="accept" data-id="${row.id}">Accept</button>
        <button type="button" data-action="deny" data-id="${row.id}">Deny</button>
        <button type="button" data-action="block" data-target-id="${otherId}">Block</button>
      </div>
    `)

    this.renderRelationshipList('#outgoing-requests', outgoing, () => '<p class="small-note">Waiting for response.</p>')

    this.renderRelationshipList('#accepted-friends', accepted, (row, otherId) => `
      <div class="signal-actions">
        <button type="button" data-action="block" data-target-id="${otherId}">Block</button>
      </div>
    `)

    this.renderRelationshipList('#blocked-users', blocked, (row, otherId) => `
      <div class="signal-actions">
        <button type="button" data-action="unblock" data-id="${row.id}" data-target-id="${otherId}">Remove Block</button>
      </div>
    `)
  }

  renderRelationshipList(containerSelector, rows, actionsTemplate) {
    const container = this.querySelector(containerSelector)
    if (!container) {
      return
    }

    if (!rows.length) {
      container.innerHTML = '<p class="small-note">None.</p>'
      return
    }

    container.innerHTML = '<ul class="friend-list">' + rows.map((row) => {
      const otherId = row.requester_id === this.user.id ? row.addressee_id : row.requester_id
      const profile = this.profileMap.get(otherId)
      const label = this.escapeHtml(this.formatProfileLabel(profile, otherId))
      const secondary = profile?.display_name && profile?.email
        ? `<small>${this.escapeHtml(profile.email)}</small>`
        : ''

      return `
        <li>
          <strong>${label}</strong>
          ${secondary}
          ${actionsTemplate(row, otherId)}
        </li>
      `
    }).join('') + '</ul>'
  }

  formatProfileLabel(profile, fallbackId) {
    if (profile?.display_name) {
      return profile.display_name
    }
    if (profile?.email) {
      return profile.email
    }
    return `User ${String(fallbackId).slice(0, 8)}`
  }

  findRelationshipWithUser(targetId) {
    return this.relationships.find((row) => (
      (row.requester_id === this.user.id && row.addressee_id === targetId) ||
      (row.requester_id === targetId && row.addressee_id === this.user.id)
    ))
  }

  async handleSearchSubmit(event) {
    event.preventDefault()

    const termInput = this.querySelector('#friend-search-term')
    const statusEl = this.querySelector('#friends-status')
    const resultsSection = this.querySelector('#friend-search-results-section')

    const term = termInput?.value.trim() || ''
    if (!term) {
      statusEl.textContent = 'Please enter an exact email or exact display name.'
      return
    }

    statusEl.textContent = 'Searching...'

    let results = []
    const rpc = await supabase.rpc('find_profiles_exact', { term })
    if (!rpc.error) {
      results = rpc.data || []
    } else {
      const normalizedEmail = term.toLowerCase()
      const [emailMatch, nameMatch] = await Promise.all([
        supabase.from('profiles').select('id, email, display_name').eq('email', normalizedEmail),
        supabase.from('profiles').select('id, email, display_name').eq('display_name', term)
      ])

      if (emailMatch.error && nameMatch.error) {
        statusEl.textContent = (emailMatch.error || nameMatch.error).message || 'Could not search profiles.'
        return
      }

      const combined = [...(emailMatch.data || []), ...(nameMatch.data || [])]
      const uniqueById = new Map(combined.map((row) => [row.id, row]))
      results = [...uniqueById.values()]
    }

    this.searchResults = (results || []).filter((row) => row.id !== this.user.id)
    this.renderSearchResults()

    resultsSection.hidden = false
    statusEl.textContent = this.searchResults.length
      ? ''
      : 'No exact profile match found.'
  }

  renderSearchResults() {
    const container = this.querySelector('#friend-search-results')
    if (!container) {
      return
    }

    if (!this.searchResults.length) {
      container.innerHTML = '<p class="small-note">No matching users.</p>'
      return
    }

    container.innerHTML = '<ul class="friend-list">' + this.searchResults.map((profile) => {
      const label = this.escapeHtml(this.formatProfileLabel(profile, profile.id))
      const relationship = this.findRelationshipWithUser(profile.id)
      const buttonMarkup = this.renderConnectButton(relationship, profile.id)

      return `
        <li>
          <strong>${label}</strong>
          ${profile.email ? `<small>${this.escapeHtml(profile.email)}</small>` : ''}
          <div class="signal-actions">
            ${buttonMarkup}
          </div>
        </li>
      `
    }).join('') + '</ul>'
  }

  renderConnectButton(relationship, targetId) {
    if (!relationship) {
      return `<button type="button" data-action="connect" data-target-id="${targetId}">Connect</button>`
    }

    if (relationship.status === 'accepted') {
      return '<button type="button" disabled>Connected</button>'
    }

    if (relationship.status === 'pending') {
      if (relationship.requester_id === this.user.id) {
        return '<button type="button" disabled>Request Pending</button>'
      }
      return '<button type="button" disabled>Incoming Request Pending</button>'
    }

    if (relationship.status === 'blocked') {
      if (relationship.requester_id === this.user.id) {
        return `<button type="button" data-action="unblock" data-id="${relationship.id}" data-target-id="${targetId}">Unblock</button>`
      }
      return '<button type="button" disabled>You Are Blocked</button>'
    }

    return `<button type="button" data-action="connect" data-target-id="${targetId}">Connect</button>`
  }

  async handleFriendActionClick(event) {
    const button = event.target.closest('button[data-action]')
    if (!button || !this.user) {
      return
    }

    const action = button.getAttribute('data-action')
    const id = button.getAttribute('data-id')
    const targetId = button.getAttribute('data-target-id')
    const statusEl = this.querySelector('#friends-status')

    try {
      if (action === 'connect' && targetId) {
        statusEl.textContent = 'Sending request...'
        await this.sendRequest(targetId)
        await this.loadData()
        this.renderSearchResults()
        statusEl.textContent = 'Connection request sent.'
        return
      }

      if (action === 'accept' && id) {
        statusEl.textContent = 'Accepting request...'
        const { error } = await supabase
          .from('friendships')
          .update({ status: 'accepted' })
          .eq('id', id)

        if (error) {
          statusEl.textContent = error.message
          return
        }

        await this.loadData()
        this.renderSearchResults()
        statusEl.textContent = 'Request accepted.'
        return
      }

      if (action === 'deny' && id) {
        statusEl.textContent = 'Denying request...'
        const { error } = await supabase
          .from('friendships')
          .delete()
          .eq('id', id)

        if (error) {
          statusEl.textContent = error.message
          return
        }

        await this.loadData()
        this.renderSearchResults()
        statusEl.textContent = 'Request denied.'
        return
      }

      if (action === 'block' && targetId) {
        statusEl.textContent = 'Blocking user...'
        await this.blockUser(targetId)
        await this.loadData()
        this.renderSearchResults()
        statusEl.textContent = 'User blocked.'
        return
      }

      if (action === 'unblock' && id) {
        statusEl.textContent = 'Removing block...'
        const { error } = await supabase
          .from('friendships')
          .delete()
          .eq('id', id)
          .eq('requester_id', this.user.id)
          .eq('status', 'blocked')

        if (error) {
          statusEl.textContent = error.message
          return
        }

        await this.loadData()
        this.renderSearchResults()
        statusEl.textContent = 'Block removed.'
      }
    } catch (error) {
      console.error(error)
      statusEl.textContent = error.message || 'Could not complete this action.'
    }
  }

  escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }

  async sendRequest(targetId) {
    const existing = this.findRelationshipWithUser(targetId)
    if (existing) {
      if (existing.status === 'blocked' && existing.requester_id === targetId) {
        throw new Error('This user has blocked you.')
      }
      if (existing.status === 'blocked' && existing.requester_id === this.user.id) {
        throw new Error('You have blocked this user. Unblock first to reconnect.')
      }
      if (existing.status === 'accepted') {
        throw new Error('You are already connected.')
      }
      if (existing.status === 'pending' && existing.requester_id === this.user.id) {
        throw new Error('A request is already pending.')
      }
      if (existing.status === 'pending' && existing.requester_id === targetId) {
        throw new Error('This user already sent you a request. Accept or deny it in Incoming Requests.')
      }
    }

    const { error } = await supabase
      .from('friendships')
      .insert({
        requester_id: this.user.id,
        addressee_id: targetId,
        status: 'pending'
      })

    if (error) {
      throw error
    }
  }

  async blockUser(targetId) {
    const existing = this.findRelationshipWithUser(targetId)

    if (existing?.requester_id === this.user.id) {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'blocked' })
        .eq('id', existing.id)

      if (error) {
        throw error
      }
      return
    }

    if (existing?.id) {
      const removeExisting = await supabase
        .from('friendships')
        .delete()
        .eq('id', existing.id)

      if (removeExisting.error) {
        throw removeExisting.error
      }
    }

    const { error } = await supabase
      .from('friendships')
      .insert({
        requester_id: this.user.id,
        addressee_id: targetId,
        status: 'blocked'
      })

    if (error) {
      throw error
    }
  }
}

customElements.define('friends-page', FriendsPage)