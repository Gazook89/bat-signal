import { supabase } from '../supabase.js'
import { fetchProfileRecord, saveProfileRecord } from '../lib/profile.js'

export class ProfilePage extends HTMLElement {
  constructor() {
    super()
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  connectedCallback() {
    this.render()
    this.loadProfile()
  }

  disconnectedCallback() {
    this.querySelector('#profile-form')?.removeEventListener('submit', this.handleSubmit)
  }

  render() {
    this.innerHTML = `
      <h2>Profile</h2>
      <p>Update the name your friends see and add a phone number if you want one later.</p>
      <p id="profile-status" role="status"></p>
      <form id="profile-form" hidden>
        <div class="form-group">
          <label for="profile-email">Email</label>
          <input type="email" id="profile-email" readonly />
        </div>
        <div class="form-group">
          <label for="profile-display-name">Display name</label>
          <input type="text" id="profile-display-name" autocomplete="name" placeholder="How friends should see you" />
        </div>
        <div class="form-group">
          <label for="profile-phone">Phone number</label>
          <input type="tel" id="profile-phone" autocomplete="tel" />
        </div>
        <button type="submit">Save Profile</button>
      </form>
    `

    this.statusEl = this.querySelector('#profile-status')
    this.formEl = this.querySelector('#profile-form')
    this.emailEl = this.querySelector('#profile-email')
    this.displayNameEl = this.querySelector('#profile-display-name')
    this.phoneEl = this.querySelector('#profile-phone')
    this.saveButtonEl = this.querySelector('button[type="submit"]')

    this.formEl.addEventListener('submit', this.handleSubmit)
  }

  async loadProfile() {
    this.statusEl.textContent = 'Loading your profile...'

    try {
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error) {
        throw error
      }

      if (!user) {
        this.statusEl.textContent = 'Sign in to manage your profile.'
        return
      }

      let profile = null

      try {
        profile = await fetchProfileRecord(supabase, user.id)
      } catch (profileError) {
        console.error(profileError)
        this.statusEl.textContent = 'Profile data could not be loaded, but you can still edit your account details.'
      }

      this.user = user
      this.profile = profile

      this.emailEl.value = user.email || ''
      this.displayNameEl.value = profile?.display_name || user.user_metadata?.display_name || ''
      this.phoneEl.value = profile?.phone_number || user.user_metadata?.phone_number || ''

      this.formEl.hidden = false

      document.dispatchEvent(
        new CustomEvent('profile-change', {
          detail: {
            profile: profile || {
              email: user.email || '',
              display_name: user.user_metadata?.display_name || '',
              phone_number: user.user_metadata?.phone_number || ''
            },
            user
          }
        })
      )

      if (!this.statusEl.textContent || this.statusEl.textContent === 'Loading your profile...') {
        this.statusEl.textContent = ''
      }
    } catch (error) {
      console.error(error)
      this.statusEl.textContent = error.message || 'Could not load your profile.'
    }
  }

  async handleSubmit(event) {
    event.preventDefault()

    const displayName = this.displayNameEl.value.trim()
    const phoneNumber = this.phoneEl.value.trim()

    if (!this.user) {
      this.statusEl.textContent = 'You need to be signed in to save your profile.'
      return
    }

    this.statusEl.textContent = 'Saving...'
    this.saveButtonEl.disabled = true

    try {
      const updatedProfile = await saveProfileRecord(supabase, this.user, { displayName, phoneNumber })
      this.profile = updatedProfile
      this.displayNameEl.value = updatedProfile.display_name || ''
      this.phoneEl.value = updatedProfile.phone_number || ''
      this.statusEl.textContent = `Profile saved for ${updatedProfile.display_name || updatedProfile.email}.`
      document.dispatchEvent(
        new CustomEvent('profile-change', {
          detail: {
            profile: updatedProfile,
            user: this.user
          }
        })
      )
    } catch (error) {
      console.error(error)
      if ((error.message || '').toLowerCase().includes('permission denied')) {
        this.statusEl.textContent = 'Your profiles table policy is blocking this write (check INSERT/UPDATE policies).'
      } else {
        this.statusEl.textContent = error.message || 'Could not save profile.'
      }
    } finally {
      this.saveButtonEl.disabled = false
    }
  }
}

customElements.define('profile-page', ProfilePage)