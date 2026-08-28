import { supabase } from '../supabase.js'
import { toDisplayHandle } from '../lib/profile.js'

export class FriendsPage extends HTMLElement {
  constructor() {
    super()
    this.user = null
    this.currentUserProfile = null
    this.relationships = []
    this.profileMap = new Map()
    this.searchResults = []
    this.handleSearchSubmit = this.handleSearchSubmit.bind(this)
    this.handleFriendActionClick = this.handleFriendActionClick.bind(this)
    this.handleCopyPublicHandle = this.handleCopyPublicHandle.bind(this)
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
    this.querySelector('#friends-copy-public-handle-btn')?.addEventListener('click', this.handleCopyPublicHandle)
  }

  unbindEvents() {
    this.querySelector('#friend-search-form')?.removeEventListener('submit', this.handleSearchSubmit)
    this.querySelector('#friends-page')?.removeEventListener('click', this.handleFriendActionClick)
    this.querySelector('#friends-copy-public-handle-btn')?.removeEventListener('click', this.handleCopyPublicHandle)
  }

  render() {
    this.innerHTML = `
      <section id="friends-page">
        <p>Search by exact handle (Display Name #1234) or exact registered email to connect.</p>

        <form id="friend-search-form">
          <div class="form-group">
            <label for="friend-search-term">Find a friend</label>
            <input
              id="friend-search-term"
              type="text"
              required
              placeholder="Exact handle (Name #1234) or email"
              autocomplete="off"
            />
          </div>
          <button id="friend-search-btn" type="submit" class="primary-button">Search</button>
        </form>

        <div class="profile-handle-row">
          <p id="friends-display-handle" class="small-note"></p>
          <button id="friends-copy-public-handle-btn" type="button" class="small-copy-button" disabled>
            <svg viewBox="-0.5 -0.5 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" id="Copy--Streamline-Iconoir" height="16" width="16">
              <desc>
                Copy Streamline Icon: https://streamlinehq.com
              </desc>
              <path d="M13.716 14.219999999999999H5.484c-0.27837500000000004 0 -0.504 -0.225625 -0.504 -0.504V5.484c0 -0.27837500000000004 0.225625 -0.504 0.504 -0.504h8.232000000000001c0.27837500000000004 0 0.504 0.225625 0.504 0.504v8.232000000000001c0 0.27837500000000004 -0.225625 0.504 -0.504 0.504Z" stroke="#000000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1"></path>
              <path d="M10.02 4.98V1.2839999999999998c0 -0.27837500000000004 -0.225625 -0.504 -0.504 -0.504H1.2839999999999998c-0.27837500000000004 0 -0.504 0.225625 -0.504 0.504v8.232000000000001c0 0.27837500000000004 0.225625 0.504 0.504 0.504H4.98" stroke="#000000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1"></path>
            </svg>
          </button>
        </div>

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
    await this.loadCurrentUserProfile()
    this.updateCurrentUserHandle()

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

  async loadCurrentUserProfile() {
    if (!this.user?.id) {
      this.currentUserProfile = null
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, display_name, display_tag')
      .eq('id', this.user.id)
      .maybeSingle()

    if (error) {
      console.error(error)
      this.currentUserProfile = null
      return
    }

    this.currentUserProfile = data || null
  }

  updateCurrentUserHandle() {
    const handleEl = this.querySelector('#friends-display-handle')
    const copyButtonEl = this.querySelector('#friends-copy-public-handle-btn')
    if (!handleEl || !copyButtonEl) {
      return
    }

    const fallback = this.user?.email || 'User'
    const handle = toDisplayHandle(this.currentUserProfile, fallback)

    if (handle.tag) {
      handleEl.textContent = `Your public handle: ${handle.full}`
      copyButtonEl.disabled = false
    } else {
      handleEl.textContent = 'Your 4-digit handle tag will be assigned automatically.'
      copyButtonEl.disabled = true
    }
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
        .select('id, email, display_name, display_tag')
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
        <button type="button" data-action="remove-friend" data-id="${row.id}">Remove</button>
        <button type="button" data-action="block" data-target-id="${otherId}">Block</button>
      </div>
    `)

    this.renderRelationshipList('#blocked-users', blocked, (row, otherId) => `
      <div class="signal-actions">
        <button type="button" data-action="unblock" data-id="${row.id}" data-target-id="${otherId}">Unblock</button>
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
      const handleMarkup = this.renderHandleMarkup(profile, otherId)
      const secondary = profile?.display_name && profile?.email
        ? `<div><small>${this.escapeHtml(profile.email)}</small></div>`
        : ''

      return `
        <li class="friend-card">
          <article>
            ${handleMarkup}
            ${secondary}
          </article>
          ${actionsTemplate(row, otherId)}
        </li>
      `
    }).join('') + '</ul>'
  }

  getProfileHandle(profile, fallbackId) {
    return toDisplayHandle(profile, `User ${String(fallbackId).slice(0, 8)}`)
  }

  renderHandleMarkup(profile, fallbackId) {
    const handle = this.getProfileHandle(profile, fallbackId)
    const safeBase = this.escapeHtml(handle.base)

    if (!handle.tag) {
      return `<strong>${safeBase}</strong>`
    }

    return `<div class="display-handle"><strong>${safeBase}</strong><span class="display-tag">#${handle.tag}</span></div>`
  }

  parseHandleTerm(term) {
    const match = String(term || '').trim().match(/^(.*)\s+#([0-9]{4})$/)
    if (!match) {
      return null
    }

    const name = match[1].trim()
    const tag = Number(match[2])
    if (!name || Number.isNaN(tag)) {
      return null
    }

    return { name, tag }
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
      statusEl.textContent = 'Please enter an exact email or exact handle (Display Name #1234).'
      return
    }

    statusEl.textContent = 'Searching...'

    let results = []
    const rpc = await supabase.rpc('find_profiles_exact', { term })
    if (!rpc.error) {
      results = rpc.data || []
    } else {
      const normalizedEmail = term.toLowerCase()
      const parsedHandle = this.parseHandleTerm(term)
      const emailQuery = supabase
        .from('profiles')
        .select('id, email, display_name, display_tag')
        .eq('email', normalizedEmail)

      const handleQuery = parsedHandle
        ? supabase
          .from('profiles')
          .select('id, email, display_name, display_tag')
          .eq('display_name', parsedHandle.name)
          .eq('display_tag', parsedHandle.tag)
        : supabase
          .from('profiles')
          .select('id, email, display_name, display_tag')
          .eq('display_name', term)

      const [emailMatch, nameMatch] = await Promise.all([emailQuery, handleQuery])

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
      const handleMarkup = this.renderHandleMarkup(profile, profile.id)
      const relationship = this.findRelationshipWithUser(profile.id)
      const buttonMarkup = this.renderConnectButton(relationship, profile.id)

      return `
        <li>
          ${handleMarkup}
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
      return `
        <button type="button" disabled>Connected</button>
        <button type="button" data-action="remove-friend" data-id="${relationship.id}">Remove Friend</button>
      `
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
        const confirmed = window.confirm('Unblock this user?')
        if (!confirmed) {
          statusEl.textContent = 'Unblock canceled.'
          return
        }

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
        return
      }

      if (action === 'remove-friend' && id) {
        const confirmed = window.confirm('Remove this friend?')
        if (!confirmed) {
          statusEl.textContent = 'Remove friend canceled.'
          return
        }

        statusEl.textContent = 'Removing friend...'
        await this.removeFriendship(id)
        await this.loadData()
        this.renderSearchResults()
        statusEl.textContent = 'Friend removed.'
      }
    } catch (error) {
      console.error(error)
      statusEl.textContent = error.message || 'Could not complete this action.'
    }
  }

  async handleCopyPublicHandle() {
    const statusEl = this.querySelector('#friends-status')
    const handle = toDisplayHandle(this.currentUserProfile, this.user?.email || 'User')

    if (!handle.tag) {
      statusEl.textContent = 'Your handle tag is not available yet. Save your profile first.'
      return
    }

    try {
      await this.copyTextToClipboard(handle.full)
      statusEl.textContent = 'Public handle copied to clipboard.'
    } catch (error) {
      console.error(error)
      statusEl.textContent = 'Could not copy automatically. Please copy your handle manually.'
    }
  }

  async copyTextToClipboard(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return
    }

    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-1000px'
    this.append(textarea)
    textarea.select()

    const copied = document.execCommand('copy')
    textarea.remove()

    if (!copied) {
      throw new Error('Clipboard copy failed.')
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

  async removeFriendship(relationshipId) {
    const relationship = this.relationships.find((row) => row.id === relationshipId)

    if (!relationship) {
      throw new Error('Could not find that friendship record.')
    }

    if (relationship.status !== 'accepted') {
      throw new Error('Only accepted friendships can be removed.')
    }

    const isParticipant = relationship.requester_id === this.user.id || relationship.addressee_id === this.user.id
    if (!isParticipant) {
      throw new Error('You are not part of this friendship.')
    }

    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', relationshipId)

    if (error) {
      throw error
    }
  }
}

customElements.define('friends-page', FriendsPage)