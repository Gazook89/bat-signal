import { supabase } from '../supabase.js'
import { fetchProfileRecord, saveProfileRecord, toDisplayHandle } from '../lib/profile.js'
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
    this.handleBadgeModeChange = this.handleBadgeModeChange.bind(this)
    this.handleCopyPublicHandle = this.handleCopyPublicHandle.bind(this)
  }

  connectedCallback() {
    this.render()
    this.loadProfile()
  }

  disconnectedCallback() {
    this.querySelector('#profile-form')?.removeEventListener('submit', this.handleSubmit)
    this.querySelector('#profile-sign-out-btn')?.removeEventListener('click', this.handleSignOut)
    this.querySelector('#profile-delete-account-btn')?.removeEventListener('click', this.handleDeleteAccount)
    this.querySelector('#badge-mode')?.removeEventListener('change', this.handleBadgeModeChange)
    this.querySelector('#copy-public-handle-btn')?.removeEventListener('click', this.handleCopyPublicHandle)
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
          <div class="profile-handle-row">
            <p id="profile-display-handle" class="small-note"></p>
            <button id="copy-public-handle-btn" type="button" class="small-copy-button">
              <svg viewBox="-0.5 -0.5 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" id="Copy--Streamline-Iconoir" height="16" width="16">
                <desc>
                  Copy Streamline Icon: https://streamlinehq.com
                </desc>
                <path d="M13.716 14.219999999999999H5.484c-0.27837500000000004 0 -0.504 -0.225625 -0.504 -0.504V5.484c0 -0.27837500000000004 0.225625 -0.504 0.504 -0.504h8.232000000000001c0.27837500000000004 0 0.504 0.225625 0.504 0.504v8.232000000000001c0 0.27837500000000004 -0.225625 0.504 -0.504 0.504Z" stroke="#000000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1"></path>
                <path d="M10.02 4.98V1.2839999999999998c0 -0.27837500000000004 -0.225625 -0.504 -0.504 -0.504H1.2839999999999998c-0.27837500000000004 0 -0.504 0.225625 -0.504 0.504v8.232000000000001c0 0.27837500000000004 0.225625 0.504 0.504 0.504H4.98" stroke="#000000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="signal-actions">
          <button type="submit" class="primary-button">Save Profile</button>
          <button id="profile-sign-out-btn" type="button">Sign Out</button>
        </div>

        <details>
          <summary>App Badge Preferences (Optional)</summary>
          <p class="small-note">
            This only updates the app icon badge count. It does not send popup messages from this app.
            The badge counts other users' signals plus pending friend requests sent to you, and it excludes your own signal.
          </p>
          <div class="form-group">
            <label for="badge-mode">Badge Setting</label>
            <select id="badge-mode">
              <option value="disabled">Badge Count is Disabled</option>
              <option value="new">Unread Signals</option>
              <option value="active">All Signals</option>
            </select>
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
    this.displayHandleEl = this.querySelector('#profile-display-handle')
    this.copyPublicHandleButtonEl = this.querySelector('#copy-public-handle-btn')
    this.saveButtonEl = this.querySelector('button[type="submit"]')
    this.signOutButtonEl = this.querySelector('#profile-sign-out-btn')
    this.deleteAccountButtonEl = this.querySelector('#profile-delete-account-btn')
    this.badgeModeEl = this.querySelector('#badge-mode')
    this.badgeStatusEl = this.querySelector('#badge-status')

    this.formEl.addEventListener('submit', this.handleSubmit)
    this.signOutButtonEl.addEventListener('click', this.handleSignOut)
    this.deleteAccountButtonEl.addEventListener('click', this.handleDeleteAccount)
    this.badgeModeEl.addEventListener('change', this.handleBadgeModeChange)
    this.copyPublicHandleButtonEl?.addEventListener('click', this.handleCopyPublicHandle)

    const badgeSettings = getBadgeSettings()
    this.badgeModeEl.value = badgeSettings.enabled ? badgeSettings.mode : 'disabled'
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
      this.updateDisplayHandle(profile)

      this.formEl.hidden = false

      document.dispatchEvent(
        new CustomEvent('profile-change', {
          detail: {
            profile: profile || {
              email: user.email || '',
              display_name: user.user_metadata?.display_name || '',
              display_tag: profile?.display_tag ?? null
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
      this.updateDisplayHandle(updatedProfile)
      this.statusEl.textContent = `Profile saved for ${toDisplayHandle(updatedProfile, updatedProfile.email).full}.`
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

  async handleBadgeModeChange() {
    const mode = this.badgeModeEl.value

    if (mode === 'disabled') {
      saveBadgeSettings({ enabled: false })
      await clearBadge()
      this.badgeStatusEl.textContent = 'Badge count is disabled.'
      document.dispatchEvent(new CustomEvent('badge-settings-change'))
      return
    }

    saveBadgeSettings({ enabled: true, mode })
    const result = await requestNotificationPermission()

    if (result === 'unsupported') {
      this.badgeStatusEl.textContent = mode === 'active'
        ? 'All Signals enabled. Browser permission controls are not exposed here.'
        : 'Unread Signals enabled. Browser permission controls are not exposed here.'
    } else if (result === 'granted') {
      this.badgeStatusEl.textContent = mode === 'active'
        ? 'Badge mode set to All Signals.'
        : 'Badge mode set to Unread Signals.'
    } else if (result === 'denied') {
      this.badgeStatusEl.textContent = 'Badge mode saved, but permission is denied in browser/device settings.'
    } else {
      this.badgeStatusEl.textContent = 'Badge mode saved. Permission prompt was dismissed.'
    }

    if (mode === 'new') {
      markSignalsSeenNow()
    }

    document.dispatchEvent(new CustomEvent('badge-settings-change'))
  }

  updateDisplayHandle(profile) {
    if (!this.displayHandleEl) {
      return
    }

    const fallback = this.user?.email || 'User'
    const handle = toDisplayHandle(profile, fallback)

    if (handle.tag) {
      this.displayHandleEl.textContent = `Your public handle: ${handle.full}`
      if (this.copyPublicHandleButtonEl) {
        this.copyPublicHandleButtonEl.disabled = false
      }
    } else {
      this.displayHandleEl.textContent = 'Your 4-digit handle tag will be assigned automatically.'
      if (this.copyPublicHandleButtonEl) {
        this.copyPublicHandleButtonEl.disabled = true
      }
    }
  }

  async handleCopyPublicHandle() {
    const handle = toDisplayHandle(this.profile, this.user?.email || 'User')
    if (!handle.tag) {
      this.statusEl.textContent = 'Save your profile first to get your public handle tag.'
      return
    }

    try {
      await this.copyTextToClipboard(handle.full)
      this.statusEl.textContent = 'Public handle copied to clipboard.'
    } catch (error) {
      console.error(error)
      this.statusEl.textContent = 'Could not copy automatically. Please copy your handle manually.'
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
}

customElements.define('profile-page', ProfilePage)