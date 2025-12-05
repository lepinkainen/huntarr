import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchWithTimeout } from '../../api/client'
import styles from './Login.module.css'

// Check if setup is needed (no user exists)
async function checkSetupNeeded() {
  try {
    const res = await fetchWithTimeout('/api/setup/status')
    if (res.ok) {
      const data = await res.json()
      // No user exists = need setup
      return !data.user_exists
    }
  } catch (err) {
    // If we can't check, continue to login
  }
  return false
}

function Login() {
  const navigate = useNavigate()
  const [checkingSetup, setCheckingSetup] = useState(true)

  // Check if setup is needed on mount
  useEffect(() => {
    checkSetupNeeded().then((needsSetup) => {
      if (needsSetup) {
        window.location.href = '/setup'
      } else {
        setCheckingSetup(false)
      }
    })
  }, [])

  // Form state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // UI state
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [requires2FA, setRequires2FA] = useState(false)

  // Modal state
  const [showPlexModal, setShowPlexModal] = useState(false)
  const [showRecoveryModal, setShowRecoveryModal] = useState(false)
  const [plexPinId, setPlexPinId] = useState(null)
  const [plexAuthUrl, setPlexAuthUrl] = useState('')
  const [plexChecking, setPlexChecking] = useState(false)

  // Recovery modal state
  const [recoveryKey, setRecoveryKey] = useState('')
  const [recoveryUsername, setRecoveryUsername] = useState('')
  const [recoveryStep, setRecoveryStep] = useState('verify') // verify | reset
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryError, setRecoveryError] = useState('')
  const [recoveryLoading, setRecoveryLoading] = useState(false)

  // Handle login form submission
  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetchWithTimeout('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          twoFactorCode: requires2FA ? twoFactorCode : undefined,
          rememberMe
        })
      })

      const data = await res.json()

      if (data.success) {
        // Redirect to home or specified redirect URL
        window.location.href = data.redirect || '/'
      } else if (data.requires_2fa || data.requiresTwoFactor) {
        setRequires2FA(true)
        setError('')
      } else {
        setError(data.error || 'Login failed')
      }
    } catch (err) {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Handle 2FA code input (digits only)
  const handle2FAChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6)
    setTwoFactorCode(value)
  }

  // Start Plex authentication flow
  const startPlexAuth = async () => {
    setError('')
    setPlexChecking(true)

    try {
      const res = await fetchWithTimeout('/api/auth/plex/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      const data = await res.json()

      if (data.success) {
        setPlexPinId(data.pin_id)
        setPlexAuthUrl(data.auth_url)
        setShowPlexModal(true)
        // Open Plex auth in new window
        window.open(data.auth_url, '_blank', 'width=800,height=600')
      } else {
        setError(data.error || 'Failed to start Plex authentication')
        setPlexChecking(false)
      }
    } catch (err) {
      setError('Failed to connect to Plex')
      setPlexChecking(false)
    }
  }

  // Poll for Plex PIN claim
  useEffect(() => {
    if (!plexPinId || !showPlexModal) return

    const checkPin = async () => {
      try {
        const res = await fetchWithTimeout(`/api/auth/plex/check/${plexPinId}`)
        const data = await res.json()

        if (data.claimed && data.token) {
          // PIN claimed, login with Plex token
          const loginRes = await fetchWithTimeout('/api/auth/plex/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: data.token })
          })

          const loginData = await loginRes.json()

          if (loginData.success) {
            window.location.href = loginData.redirect || '/'
          } else {
            setError(loginData.error || 'Plex login failed')
            setShowPlexModal(false)
            setPlexChecking(false)
          }
        }
      } catch (err) {
        // Continue polling
      }
    }

    const interval = setInterval(checkPin, 2000)
    const timeout = setTimeout(() => {
      clearInterval(interval)
      setShowPlexModal(false)
      setPlexChecking(false)
      setError('Plex authentication timed out')
    }, 600000) // 10 minutes

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [plexPinId, showPlexModal])

  // Close Plex modal
  const closePlexModal = () => {
    setShowPlexModal(false)
    setPlexChecking(false)
    setPlexPinId(null)
  }

  // Open recovery modal
  const openRecoveryModal = () => {
    setShowRecoveryModal(true)
    setRecoveryStep('verify')
    setRecoveryKey('')
    setRecoveryUsername('')
    setNewPassword('')
    setConfirmPassword('')
    setRecoveryError('')
  }

  // Verify recovery key
  const handleVerifyRecoveryKey = async () => {
    setRecoveryError('')
    setRecoveryLoading(true)

    try {
      const res = await fetchWithTimeout('/auth/recovery-key/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recovery_key: recoveryKey })
      })

      const data = await res.json()

      if (data.success) {
        setRecoveryUsername(data.username)
        setRecoveryStep('reset')
      } else {
        setRecoveryError(data.error || 'Invalid recovery key')
      }
    } catch (err) {
      setRecoveryError('Failed to verify recovery key')
    } finally {
      setRecoveryLoading(false)
    }
  }

  // Reset password with recovery key
  const handleResetPassword = async () => {
    if (newPassword.length < 8) {
      setRecoveryError('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setRecoveryError('Passwords do not match')
      return
    }

    setRecoveryError('')
    setRecoveryLoading(true)

    try {
      const res = await fetchWithTimeout('/auth/recovery-key/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recovery_key: recoveryKey,
          new_password: newPassword
        })
      })

      const data = await res.json()

      if (data.success) {
        setShowRecoveryModal(false)
        setError('')
        // Pre-fill username for convenience
        setUsername(recoveryUsername)
        setPassword('')
        alert('Password reset successfully. You can now log in with your new password.')
      } else {
        setRecoveryError(data.error || 'Failed to reset password')
      }
    } catch (err) {
      setRecoveryError('Failed to reset password')
    } finally {
      setRecoveryLoading(false)
    }
  }

  // Show loading while checking setup status
  if (checkingSetup) {
    return (
      <div className={styles.loginPage}>
        <div className={styles.loginContainer}>
          <div className={styles.logo}>
            <img src="/static/logo/huntarr.png" alt="Huntarr" />
            <h1>Huntarr</h1>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.loginPage}>
      <div className={styles.loginContainer}>
        <div className={styles.logo}>
          <img src="/static/logo/huntarr.png" alt="Huntarr" />
          <h1>Huntarr</h1>
        </div>

        <form onSubmit={handleLogin} className={styles.loginForm}>
          {error && (
            <div className={styles.error}>
              <i className="fas fa-exclamation-circle" />
              {error}
            </div>
          )}

          <div className={styles.inputGroup}>
            <label htmlFor="username">
              <i className="fas fa-user" /> Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              autoComplete="username"
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password">
              <i className="fas fa-lock" /> Password
            </label>
            <div className={styles.passwordWrapper}>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className={styles.togglePassword}
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                <i className={showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'} />
              </button>
            </div>
          </div>

          {requires2FA && (
            <div className={styles.inputGroup}>
              <label htmlFor="twoFactorCode">
                <i className="fas fa-shield-alt" /> Two-Factor Code
              </label>
              <input
                type="text"
                id="twoFactorCode"
                value={twoFactorCode}
                onChange={handle2FAChange}
                placeholder="Enter 6-digit code"
                maxLength={6}
                autoComplete="one-time-code"
                autoFocus
              />
            </div>
          )}

          <div className={styles.rememberMe}>
            <label>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me</span>
            </label>
          </div>

          <button
            type="submit"
            className={styles.loginBtn}
            disabled={loading}
          >
            {loading ? (
              <>
                <i className="fas fa-spinner fa-spin" /> Logging in...
              </>
            ) : (
              <>
                <i className="fas fa-sign-in-alt" /> Login
              </>
            )}
          </button>
        </form>

        <div className={styles.divider}>
          <span>or</span>
        </div>

        <button
          className={styles.plexBtn}
          onClick={startPlexAuth}
          disabled={plexChecking}
        >
          {plexChecking ? (
            <>
              <i className="fas fa-spinner fa-spin" /> Connecting to Plex...
            </>
          ) : (
            <>
              <img src="/static/images/plex-icon.png" alt="Plex" className={styles.plexIcon} />
              Sign in with Plex
            </>
          )}
        </button>

        <button
          className={styles.forgotLink}
          onClick={openRecoveryModal}
        >
          Forgot password?
        </button>
      </div>

      {/* Plex Modal */}
      {showPlexModal && (
        <div className={styles.modal} onClick={closePlexModal}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>Sign in with Plex</h2>
            <p>A new window has opened for Plex authentication.</p>
            <p>Complete the sign-in process in that window.</p>
            <div className={styles.modalSpinner}>
              <i className="fas fa-spinner fa-spin" />
              <span>Waiting for Plex authentication...</span>
            </div>
            <button className={styles.modalClose} onClick={closePlexModal}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Recovery Modal */}
      {showRecoveryModal && (
        <div className={styles.modal} onClick={() => setShowRecoveryModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>
              <i className="fas fa-key" /> Password Recovery
            </h2>

            {recoveryError && (
              <div className={styles.error}>
                <i className="fas fa-exclamation-circle" />
                {recoveryError}
              </div>
            )}

            {recoveryStep === 'verify' ? (
              <>
                <p>Enter your recovery key to reset your password.</p>
                <div className={styles.inputGroup}>
                  <label htmlFor="recoveryKey">Recovery Key</label>
                  <input
                    type="text"
                    id="recoveryKey"
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value)}
                    placeholder="Enter your recovery key"
                  />
                </div>
                <div className={styles.modalActions}>
                  <button
                    className={styles.modalClose}
                    onClick={() => setShowRecoveryModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className={styles.loginBtn}
                    onClick={handleVerifyRecoveryKey}
                    disabled={!recoveryKey || recoveryLoading}
                  >
                    {recoveryLoading ? 'Verifying...' : 'Verify Key'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>Account found: <strong>{recoveryUsername}</strong></p>
                <p>Enter your new password below.</p>
                <div className={styles.inputGroup}>
                  <label htmlFor="newPassword">New Password</label>
                  <input
                    type="password"
                    id="newPassword"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label htmlFor="confirmPassword">Confirm Password</label>
                  <input
                    type="password"
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>
                <div className={styles.modalActions}>
                  <button
                    className={styles.modalClose}
                    onClick={() => setShowRecoveryModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className={styles.loginBtn}
                    onClick={handleResetPassword}
                    disabled={!newPassword || !confirmPassword || recoveryLoading}
                  >
                    {recoveryLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Login
