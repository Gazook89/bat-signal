import { supabase } from '../supabase.js'
import { ensureProfileRecord } from '../lib/profile.js'

export class AuthPage extends HTMLElement {
  constructor() {
    super()
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  connectedCallback() {
    this.innerHTML = `
      <h2>Sign In / Sign Up</h2>
      <form id="auth-form">
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" required autocomplete="email" />
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" required minlength="6" autocomplete="current-password" />
        </div>
        <button id="auth-submit" type="submit">Sign Up / Sign In</button>
        <p id="auth-error" class="error" role="alert"></p>
      </form>
    `
    this.querySelector('#auth-form').addEventListener('submit', this.handleSubmit)
  }

  async handleSubmit(e) {
    e.preventDefault()
    const email = this.querySelector('#email').value.trim()
    const password = this.querySelector('#password').value
    const errorEl = this.querySelector('#auth-error')
    const submitButton = this.querySelector('#auth-submit')
    errorEl.textContent = ''
    submitButton.disabled = true
    submitButton.textContent = 'Working...'

    try {
      // Try to sign in first. If credentials are invalid, create a new account.
      let { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        const signUpResult = await supabase.auth.signUp({
          email,
          password
        })

        data = signUpResult.data
        error = signUpResult.error

        if (error) {
          const normalizedMessage = String(error.message || '').toLowerCase()
          if (
            normalizedMessage.includes('already registered') ||
            normalizedMessage.includes('already been registered') ||
            normalizedMessage.includes('user already exists') ||
            normalizedMessage.includes('database error saving new user')
          ) {
            errorEl.textContent = 'Check your email for a confirmation link, then come back and sign in.'
            return
          }
        }
      }

      const session = data?.session

      if (error) {
        errorEl.textContent = error.message
      } else if (!session) {
        errorEl.textContent = `Check ${email} for a confirmation link, then come back and sign in.`
      } else {
        try {
          await ensureProfileRecord(supabase, session.user)
        } catch (profileError) {
          console.error(profileError)
        }
        errorEl.textContent = ''
        window.location.hash = '#feed'
      }
    } finally {
      submitButton.disabled = false
      submitButton.textContent = 'Sign Up / Sign In'
    }
  }
}

customElements.define('auth-page', AuthPage)
