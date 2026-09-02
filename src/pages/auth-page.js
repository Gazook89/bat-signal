import { supabase } from '../supabase.js'
import { ensureProfileRecord } from '../lib/profile.js'


export class AuthPage extends HTMLElement {
  constructor() {
    super()
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  connectedCallback() {
    this.innerHTML = `
      <div class="auth-container">
        <!-- Skip to Sign In Button -->
        <div class="skip-to-signin">
          <a href="#signin-form" class="btn-skip">Sign In</a>
        </div>

        <!-- App Information Section -->
          <div class="info-section">
            <h3>What is Collider?</h3>
            <p>
              Collider brings you together with the people you know.  
            </p>
            <p>
              Heading to a neighborhood park and think it would be more fun if someone dropped by? Tired of the rigamarole of coordinating with multiple people on exact plans, and just want to say "Hey, I'm heading here, meet me if interested?"
            </p>
            <p>
              Collider lets you broadcast your availability only to trusted friends with where and when you intend to be active, leaving the planning and communication to the other platforms you already use.
            </p>
            <p>  No social media noise, no pressure to engage, only a simple signal to others that you are available.
            </p>
          </div>


          <div class="gallery">
            <div class="item">
            <img src="${new URL('../assets/collider - 1.jpeg', import.meta.url).href}" alt="Collider Gallery Image" />
            </div>
            <div class="item">
              <img src="${new URL('../assets/collider - 2.jpeg', import.meta.url).href}" alt="Collider Gallery Image" />
            </div>
            <div class="item">
              <img src="${new URL('../assets/collider - 3.jpeg', import.meta.url).href}" alt="Collider Gallery Image" />
            </div>
          </div>


          <div class="info-section">
            <h3>Key Features</h3>
            <ul>
              <li>Broadcast only.  No Likes, Comments, Messaging.</li>
              <li>Locations are freeform- specific addresses not needed.</li>
              <li>Signals are ephemeral and only visible to friends while active.</li>
            </ul>
          </div>

          <div class="info-section">
            <h3>Getting Started</h3>
            <ol>
              <li>Register an account.  No user info required beyond email address and password.</li>
              <li>Connect with friends using their username or email address.  Friends must accept the request before you can see their availability.</li>
              <li>Power on your Signal to broadcast your availability on the Feed to your friends.  Set your destination, the ETA, how long you want the signal to be up, and a short message.</li>
            </ol>
          </div>

        <!-- Sign In / Sign Up Form -->
        <section id="signin-form" class="auth-form-section">
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
          <p>A new account will be created if one doesn't exist for the provided email, and a confirmation email will hit your inbox shortly.</p>
          <p>If the link within the confirmation email opens a page in your browser but otherwise seems to do nothing, try coming back to the Sign In page and signing in again.</p>
        </section>
      </div>
    `
    this.querySelector('#auth-form').addEventListener('submit', this.handleSubmit)
  }

  async handleSubmit(e) {
    e.preventDefault()
    const email = this.querySelector('#email').value.trim()
    const password = this.querySelector('#password').value
    const errorEl = this.querySelector('#auth-error')
    const submitButton = this.querySelector('#auth-submit')
    const rawBasePath = import.meta.env.BASE_URL || '/'
    const basePath = rawBasePath.endsWith('/') ? rawBasePath : `${rawBasePath}/`
    const emailRedirectTo = new URL(basePath, window.location.origin).toString()
    errorEl.textContent = ''
    submitButton.disabled = true
    submitButton.textContent = 'Working...'

    try {
      // Try to sign in first. If credentials are invalid, create a new account.
      let { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        const signUpResult = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo
          }
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
