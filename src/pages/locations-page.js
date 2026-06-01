import { supabase } from '../supabase.js'

export class LocationsPage extends HTMLElement {
  constructor() {
    super()
    this.locations = []
    this.editingId = null
    this.handleSubmit = this.handleSubmit.bind(this)
    this.handleCancelEdit = this.handleCancelEdit.bind(this)
    this.handleListClick = this.handleListClick.bind(this)
  }

  connectedCallback() {
    this.render()
    this.bindEvents()
    this.loadLocations()
  }

  disconnectedCallback() {
    this.querySelector('#location-form')?.removeEventListener('submit', this.handleSubmit)
    this.querySelector('#cancel-location-edit')?.removeEventListener('click', this.handleCancelEdit)
    this.querySelector('#locations-list')?.removeEventListener('click', this.handleListClick)
  }

  bindEvents() {
    this.querySelector('#location-form')?.addEventListener('submit', this.handleSubmit)
    this.querySelector('#cancel-location-edit')?.addEventListener('click', this.handleCancelEdit)
    this.querySelector('#locations-list')?.addEventListener('click', this.handleListClick)
  }

  render() {
    this.innerHTML = `
      <h2>My Places</h2>
      <p>Manage your private saved locations for quick bat signals.</p>

      <form id="location-form">
        <div class="form-group">
          <label for="location-name">Name</label>
          <input id="location-name" type="text" required placeholder="Cooper Park" />
        </div>
        <div class="form-group">
          <label for="location-address">Address</label>
          <input id="location-address" type="text" placeholder="123 Main St" />
        </div>
        <div class="form-group">
          <label for="location-website">Website</label>
          <input id="location-website" type="url" placeholder="https://example.com" />
        </div>
        <div class="form-group checkbox-row">
          <label>
            <input id="location-starred" type="checkbox" />
            Star this place
          </label>
        </div>

        <div class="signal-actions">
          <button id="save-location-btn" type="submit">Save Place</button>
          <button id="cancel-location-edit" type="button" hidden>Cancel Edit</button>
        </div>
        <p id="location-status" role="status"></p>
      </form>

      <div id="locations-list" aria-live="polite">
        <p>Loading your places...</p>
      </div>
    `
  }

  async loadLocations() {
    const listEl = this.querySelector('#locations-list')

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      listEl.innerHTML = '<p>Sign in to manage locations.</p>'
      return
    }

    this.userId = userData.user.id

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
      .eq('user_id', this.userId)
      .order('is_starred', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      listEl.innerHTML = `<p>${error.message}</p>`
      return
    }

    this.locations = data || []
    this.renderList()
  }

  renderList() {
    const listEl = this.querySelector('#locations-list')

    if (!this.locations.length) {
      listEl.innerHTML = '<p>No saved places yet.</p>'
      return
    }

    listEl.innerHTML = '<ul>' + this.locations.map((row) => {
      const name = row.custom_name || row.locations_global?.name || 'Unnamed place'
      const address = row.custom_address || row.locations_global?.address || ''
      const website = row.custom_website || row.locations_global?.website || ''
      return `
        <li data-location-id="${row.id}">
          <strong>${name}</strong>${row.is_starred ? ' (starred)' : ''}
          ${address ? `<br /><small>${address}</small>` : ''}
          ${website ? `<br /><small><a href="${website}" target="_blank" rel="noopener noreferrer">${website}</a></small>` : ''}
          <div class="signal-actions">
            <button type="button" data-action="edit" data-location-id="${row.id}">Edit</button>
            <button type="button" data-action="delete" data-location-id="${row.id}">Delete</button>
          </div>
        </li>
      `
    }).join('') + '</ul>'
  }

  handleCancelEdit() {
    this.editingId = null
    this.querySelector('#location-form')?.reset()
    this.querySelector('#cancel-location-edit').hidden = true
    this.querySelector('#save-location-btn').textContent = 'Save Place'
    this.querySelector('#location-status').textContent = ''
  }

  async handleListClick(event) {
    const button = event.target.closest('button[data-action]')
    if (!button) {
      return
    }

    const action = button.getAttribute('data-action')
    const locationId = button.getAttribute('data-location-id')
    const row = this.locations.find((item) => item.id === locationId)

    if (!row) {
      return
    }

    if (action === 'edit') {
      this.editingId = row.id
      this.querySelector('#location-name').value = row.custom_name || row.locations_global?.name || ''
      this.querySelector('#location-address').value = row.custom_address || row.locations_global?.address || ''
      this.querySelector('#location-website').value = row.custom_website || row.locations_global?.website || ''
      this.querySelector('#location-starred').checked = Boolean(row.is_starred)
      this.querySelector('#save-location-btn').textContent = 'Update Place'
      this.querySelector('#cancel-location-edit').hidden = false
      this.querySelector('#location-status').textContent = ''
      return
    }

    if (action === 'delete') {
      const statusEl = this.querySelector('#location-status')
      statusEl.textContent = 'Deleting...'

      const { error } = await supabase
        .from('user_locations')
        .delete()
        .eq('id', row.id)

      if (error) {
        statusEl.textContent = error.message
        return
      }

      statusEl.textContent = 'Place deleted.'
      this.handleCancelEdit()
      await this.loadLocations()
      return
    }
  }

  async handleSubmit(event) {
    event.preventDefault()

    const name = this.querySelector('#location-name').value.trim()
    const address = this.querySelector('#location-address').value.trim()
    const website = this.querySelector('#location-website').value.trim()
    const isStarred = this.querySelector('#location-starred').checked
    const statusEl = this.querySelector('#location-status')

    if (!name) {
      statusEl.textContent = 'Name is required.'
      return
    }

    statusEl.textContent = this.editingId ? 'Updating...' : 'Saving...'

    if (!this.userId) {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData?.user) {
        statusEl.textContent = 'Sign in required.'
        return
      }
      this.userId = userData.user.id
    }

    const payload = {
      user_id: this.userId,
      global_location_id: null,
      custom_name: name,
      custom_address: address || null,
      custom_website: website || null,
      is_starred: isStarred
    }

    let error

    if (this.editingId) {
      ;({ error } = await supabase
        .from('user_locations')
        .update(payload)
        .eq('id', this.editingId)
      )
    } else {
      ;({ error } = await supabase
        .from('user_locations')
        .insert(payload)
      )
    }

    if (error) {
      statusEl.textContent = error.message
      return
    }

    statusEl.textContent = this.editingId ? 'Place updated.' : 'Place saved.'
    this.handleCancelEdit()
    await this.loadLocations()
  }
}

customElements.define('locations-page', LocationsPage)
