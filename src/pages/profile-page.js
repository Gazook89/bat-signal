import { supabase } from '../supabase.js'
import { fetchProfileRecord, saveProfileRecord } from '../lib/profile.js'
import {
  clearBadge,
  getBadgeSettings,
  markSignalsSeenNow,
  requestNotificationPermission,
  saveBadgeSettings
} from '../lib/badge.js'

export class ProfilePage extends HTMLElement {
  constructor() {
    super()
    this.handleSubmit = this.handleSubmit.bind(this)
    this.handleSignOut = this.handleSignOut.bind(this)
    this.handleDeleteAccount = this.handleDeleteAccount.bind(this)
    this.handleBadgeEnabledChange = this.handleBadgeEnabledChange.bind(this)
    this.handleBadgeModeChange = this.handleBadgeModeChange.bind(this)
    this.handleBadgePermissionRequest = this.handleBadgePermissionRequest.bind(this)
    this.handleClearBadge = this.handleClearBadge.bind(this)
  }

  connectedCallback() {
    this.render()
    this.loadProfile()
  }

  disconnectedCallback() {
    this.querySelector('#profile-form')?.removeEventListener('submit', this.handleSubmit)
    this.querySelector('#profile-sign-out-btn')?.removeEventListener('click', this.handleSignOut)
    this.querySelector('#profile-delete-account-btn')?.removeEventListener('click', this.handleDeleteAccount)
    this.querySelector('#badge-enabled')?.removeEventListener('change', this.handleBadgeEnabledChange)
    this.querySelector('#badge-mode')?.removeEventListener('change', this.handleBadgeModeChange)
    this.querySelector('#badge-request-permission-btn')?.removeEventListener('click', this.handleBadgePermissionRequest)
    this.querySelector('#badge-clear-btn')?.removeEventListener('click', this.handleClearBadge)
  }

  render() {
    this.innerHTML = `
      <p>Manage profile information, settings, and friend lists.</p>
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
        <div class="signal-actions">
          <button type="submit">Save Profile</button>
          <button id="profile-sign-out-btn" type="button">Sign Out</button>
        </div>

        <details>
          <summary>App Badge Preferences (Optional)</summary>
          <p class="small-note">
            This only updates the app icon badge count. It does not send popup messages from this app.
            The badge counts other users' signals plus pending friend requests sent to you, and it excludes your own signal.
          </p>
          <div class="form-group checkbox-row">
            <label>
              <input id="badge-enabled" type="checkbox" />
              Enable app icon badge
            </label>
          </div>
          <div class="form-group">
            <label for="badge-mode">Badge number shows</label>
            <select id="badge-mode">
              <option value="new">New signals since you last opened Feed</option>
              <option value="active">Total active signals from friends</option>
            </select>
          </div>
          <div class="signal-actions">
            <button id="badge-request-permission-btn" type="button">Request Badge/Notification Permission</button>
            <button id="badge-clear-btn" type="button">Clear Badge Now</button>
          </div>
          <p id="badge-status" class="small-note" role="status"></p>
          <p class="small-note">
            To fully revoke OS-level permissions later, use your browser or device app settings.
          </p>
        </details>

        <details>
          <summary>Delete Account</summary>
          <p class="small-note">
            This permanently removes your friend links, active/past signals, personal saved places, and profile personal info.
            Historical metrics and your UUID are retained for aggregate app analytics.
          </p>
          <div class="signal-actions">
            <button id="profile-delete-account-btn" type="button" class="danger-button">Delete Account Permanently</button>
          </div>
        </details>
      </form>
    `

    this.statusEl = this.querySelector('#profile-status')
    this.formEl = this.querySelector('#profile-form')
    this.emailEl = this.querySelector('#profile-email')
    this.displayNameEl = this.querySelector('#profile-display-name')
    this.saveButtonEl = this.querySelector('button[type="submit"]')
    this.signOutButtonEl = this.querySelector('#profile-sign-out-btn')
    this.deleteAccountButtonEl = this.querySelector('#profile-delete-account-btn')
    this.badgeEnabledEl = this.querySelector('#badge-enabled')
    this.badgeModeEl = this.querySelector('#badge-mode')
    this.badgeStatusEl = this.querySelector('#badge-status')
    this.badgePermissionButtonEl = this.querySelector('#badge-request-permission-btn')
    this.badgeClearButtonEl = this.querySelector('#badge-clear-btn')

    this.formEl.addEventListener('submit', this.handleSubmit)
    this.signOutButtonEl.addEventListener('click', this.handleSignOut)
    this.deleteAccountButtonEl.addEventListener('click', this.handleDeleteAccount)
    this.badgeEnabledEl.addEventListener('change', this.handleBadgeEnabledChange)
    this.badgeModeEl.addEventListener('change', this.handleBadgeModeChange)
    this.badgePermissionButtonEl.addEventListener('click', this.handleBadgePermissionRequest)
    this.badgeClearButtonEl.addEventListener('click', this.handleClearBadge)

    const badgeSettings = getBadgeSettings()
    this.badgeEnabledEl.checked = badgeSettings.enabled
    this.badgeModeEl.value = badgeSettings.mode
    this.badgeStatusEl.textContent = ''
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

      this.formEl.hidden = false

      document.dispatchEvent(
        new CustomEvent('profile-change', {
          detail: {
            profile: profile || {
              email: user.email || '',
              display_name: user.user_metadata?.display_name || ''
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

    if (!this.user) {
      this.statusEl.textContent = 'You need to be signed in to save your profile.'
      return
    }

    this.statusEl.textContent = 'Saving...'
    this.saveButtonEl.disabled = true

    try {
      const updatedProfile = await saveProfileRecord(supabase, this.user, { displayName })
      this.profile = updatedProfile
      this.displayNameEl.value = updatedProfile.display_name || ''
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

  async handleSignOut() {
    this.statusEl.textContent = 'Signing out...'
    this.signOutButtonEl.disabled = true

    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error(error)
      this.statusEl.textContent = error.message || 'Could not sign out.'
      this.signOutButtonEl.disabled = false
    }
  }

  async handleDeleteAccount() {
    if (!this.user) {
      this.statusEl.textContent = 'You need to be signed in to delete your account.'
      return
    }

    const confirmed = window.confirm(
      'Delete your account? This cannot be undone and will remove your friend links, personal locations, signals, and personal profile data.'
    )

    if (!confirmed) {
      this.statusEl.textContent = 'Account deletion canceled.'
      return
    }

    this.statusEl.textContent = 'Deleting account...'
    this.saveButtonEl.disabled = true
    this.signOutButtonEl.disabled = true
    this.deleteAccountButtonEl.disabled = true

    try {
      const { error } = await supabase.functions.invoke('delete_user', {
        method: 'POST',
        body: {}
      })
      if (error) {
        if ((error.message || '').toLowerCase().includes('recent sign-in required')) {
          throw new Error('For safety, please sign out and sign back in, then delete your account again within a few minutes.')
        }
        throw error
      }

      this.statusEl.textContent = 'Account deleted. Signing out...'
      await supabase.auth.signOut()
    } catch (error) {
      console.error(error)
      this.statusEl.textContent = error.message || 'Could not delete account.'
      this.saveButtonEl.disabled = false
      this.signOutButtonEl.disabled = false
      this.deleteAccountButtonEl.disabled = false
    }
  }

  async handleBadgeEnabledChange() {
    const enabled = this.badgeEnabledEl.checked
    saveBadgeSettings({ enabled })

    if (enabled) {
      this.badgeStatusEl.textContent = 'Badge updates are enabled.'
      markSignalsSeenNow()
    } else {
      await clearBadge()
      this.badgeStatusEl.textContent = 'Badge updates are disabled and the current badge was cleared.'
    }

    document.dispatchEvent(new CustomEvent('badge-settings-change'))
  }

  handleBadgeModeChange() {
    const mode = this.badgeModeEl.value
    saveBadgeSettings({ mode })
    this.badgeStatusEl.textContent = mode === 'active'
      ? 'Badge mode set to active signal count.'
      : 'Badge mode set to new signals since last Feed visit.'

    document.dispatchEvent(new CustomEvent('badge-settings-change'))
  }

  async handleBadgePermissionRequest() {
    const result = await requestNotificationPermission()

    if (result === 'unsupported') {
      this.badgeStatusEl.textContent = 'This browser does not expose notification permission controls here.'
      return
    }

    if (result === 'granted') {
      this.badgeStatusEl.textContent = 'Permission granted. Badge support depends on your OS/browser/PWA install.'
      return
    }

    if (result === 'denied') {
      this.badgeStatusEl.textContent = 'Permission denied. You can re-enable it later in browser/device settings.'
      return
    }

    this.badgeStatusEl.textContent = 'Permission prompt dismissed.'
  }

  async handleClearBadge() {
    await clearBadge()
    this.badgeStatusEl.textContent = 'Badge cleared.'
  }
}

customElements.define('profile-page', ProfilePage)