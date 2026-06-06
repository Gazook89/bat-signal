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
      <p>Manage your private saved locations to quickly activate the collider.</p>

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
            Star this place
            <input id="location-starred" type="checkbox" />
          </label>
        </div>
        <div class="form-group checkbox-row">
          <label>
            Share anonymized copy for community location trends
            <input id="location-share-anonymized" type="checkbox" />
          </label>
          <p><small>Please don't share any home addresses or other sensitive location information.  Addresses are completely optional.</small></p>
        </div>

        <div class="signal-actions">
          <button id="save-location-btn" type="submit" class="primary-button">Save Place</button>
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

    this.locations = this.sortLocations(data || [])
    this.renderList()
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

  renderList() {
    const listEl = this.querySelector('#locations-list')

    if (!this.locations.length) {
      listEl.innerHTML = '<p>No saved places yet.</p>'
      return
    }

    const starSVG = (
      `<svg viewBox="-0.5 -0.5 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" id="Star--Streamline-Iconoir" height="16" width="16">
      <desc>
        Star Streamline Icon: https://streamlinehq.com
      </desc>
      <path d="m5.1666875 4.9264375 1.776 -3.577375c0.22793750000000002 -0.4591875 0.8866875000000001 -0.4591875 1.114625 0l1.7759375 3.577375 3.9716875000000003 0.57725c0.5095625 0.07400000000000001 0.7126250000000001 0.6968125000000001 0.34375 1.0540625000000001l-2.8733750000000002 2.7826875 0.678125 3.9311249999999998c0.0870625 0.504875 -0.445875 0.8898125 -0.901875 0.651375L7.5 12.065874999999998l-3.551625 1.8570624999999998c-0.4559375 0.2384375 -0.9888750000000001 -0.1465 -0.9018125 -0.651375l0.678125 -3.9311249999999998 -2.8733750000000002 -2.7826875c-0.36893750000000003 -0.35725 -0.16581249999999997 -0.9800625000000001 0.34375 -1.0540625000000001l3.9716249999999995 -0.57725Z" stroke="#000000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1"></path>
    </svg>`
    )

    listEl.innerHTML = '<ul>' + this.locations.map((row) => {
      const name = this.getLocationLabel(row)
      const address = row.custom_address || row.locations_global?.address || ''
      const website = row.custom_website || row.locations_global?.website || ''
      return `
        <li data-location-id="${row.id}">
          <div>
          ${row.is_starred ? ` ${starSVG} ` : ''}<strong>${name}</strong>
          ${address ? `<small>${address}</small>` : ''}
          ${website ? `<br /><small><a href="${website}" target="_blank" rel="noopener noreferrer">${website}</a></small>` : ''}
          </div>
          <div class="list-item-actions">
            <button type="button" data-action="edit" data-location-id="${row.id}">
              <svg viewBox="-0.5 -0.5 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" id="Edit--Streamline-Iconoir" height="16" width="16">
                <desc>
                  Edit Streamline Icon: https://streamlinehq.com
                </desc>
                <path d="M0.7153750000000001 14.284625h13.56925" stroke="#000000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1"></path>
                <path d="m7.6671875 2.8475625 2.13225 -2.1321875 3.7313125000000005 3.731375 -2.1321875 2.132125m-3.731375 -3.7313125000000005 -4.226500000000001 4.226500000000001c-0.1413125 0.141375 -0.22075 0.333125 -0.22075 0.5330625v3.4190625000000003h3.419125c0.19987499999999997 0 0.391625 -0.079375 0.533 -0.2208125l4.226500000000001 -4.226500000000001m-3.731375 -3.7313125000000005 3.731375 3.7313125000000005" stroke="#000000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1"></path>
              </svg>
            </button>
            <button type="button" data-action="delete" data-location-id="${row.id}">
              <svg viewBox="-0.5 -0.5 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" id="Trash--Streamline-Iconoir" height="16" width="16">
                <desc>
                  Trash Streamline Icon: https://streamlinehq.com
                </desc>
                <path d="m12.96975 5.4488125 -1.3639999999999999 7.75775c-0.1149375 0.6538125 -0.6829375 1.130625 -1.34675 1.130625H4.7410000000000005c-0.663875 0 -1.2318125 -0.47681250000000003 -1.34675 -1.130625L2.03025 5.4488125" stroke="#000000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1"></path>
                <path d="M13.653500000000001 3.3976875h-3.8459375000000002m-8.461062499999999 0h3.8459375000000002m0 0V2.03025c0 -0.75525 0.61225 -1.3674374999999999 1.3674374999999999 -1.3674374999999999h1.88025c0.75525 0 1.3674374999999999 0.6121875 1.3674374999999999 1.3674374999999999v1.3674374999999999m-4.615125 0h4.615125" stroke="#000000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1"></path>
              </svg>
            </button>
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
      this.querySelector('#location-share-anonymized').checked = false
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
    const shareAnonymized = this.querySelector('#location-share-anonymized').checked
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

    let contributed = false
    if (shareAnonymized) {
      const { error: contributionError } = await supabase.rpc('contribute_location_to_catalog', {
        p_name: name,
        p_address: address || null,
        p_website: website || null
      })

      if (contributionError) {
        console.error(contributionError)
      } else {
        contributed = true
      }
    }

    if (this.editingId) {
      statusEl.textContent = contributed ? 'Place updated. Shared anonymously.' : 'Place updated.'
    } else {
      statusEl.textContent = contributed ? 'Place saved. Shared anonymously.' : 'Place saved.'
    }
    this.handleCancelEdit()
    await this.loadLocations()
  }
}

customElements.define('locations-page', LocationsPage)
