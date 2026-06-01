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
        <button type="submit">Sign Up / Sign In</button>
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
    errorEl.textContent = ''

    // Try to sign in first. If credentials are invalid, create a new account.
    let { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      const signUpResult = await supabase.auth.signUp({
        email,
        password
      })

      data = signUpResult.data
      error = signUpResult.error
    }

    const session = data?.session

    if (error) {
      errorEl.textContent = error.message
    } else if (!session) {
      errorEl.textContent = 'Account created. Check your email to confirm, then sign in.'
    } else {
      try {
        await ensureProfileRecord(supabase, session.user)
      } catch (profileError) {
        console.error(profileError)
      }
      errorEl.textContent = ''
      window.location.hash = '#feed'
    }
  }
}

customElements.define('auth-page', AuthPage)
