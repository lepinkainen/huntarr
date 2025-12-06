import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchWithTimeout } from '../../api/client'
import styles from './Setup.module.css'

// Check if setup is already complete
async function checkSetupStatus() {
  try {
    const res = await fetchWithTimeout('/api/setup/status')
    if (res.ok) {
      const data = await res.json()
      // User exists and setup is NOT in progress = setup complete
      return {
        setup_complete: data.user_exists && !data.setup_in_progress
      }
    }
  } catch (_err) {
    // If we can't check status, let setup proceed
  }
  return { setup_complete: false }
}

const STEPS = [
  { id: 1, name: 'Account', icon: 'fa-user' },
  { id: 2, name: '2FA', icon: 'fa-shield-alt' },
  { id: 3, name: 'Plex', icon: 'fa-play-circle' },
  { id: 4, name: 'Security', icon: 'fa-lock' },
  { id: 5, name: 'Recovery', icon: 'fa-key' },
  { id: 6, name: 'Complete', icon: 'fa-check-circle' }
]

const AUTH_MODES = [
  { value: 'login', label: 'Require Login', desc: 'Standard login required for all access' },
  { value: 'local_bypass', label: 'Local Network Bypass', desc: 'Skip login for local network (192.168.x.x, 10.x.x.x)' },
  { value: 'no_login', label: 'No Login Required', desc: 'Disable authentication entirely (use with reverse proxy auth)' }
]

function Setup() {
  const _navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(true)

  // Check if setup is already complete on mount
  useEffect(() => {
    checkSetupStatus().then((status) => {
      if (status.setup_complete) {
        // Redirect to login if setup is already done
        window.location.href = '/login'
      } else {
        setCheckingStatus(false)
      }
    })
  }, [])

  // Step 1: Account
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Step 2: 2FA
  const [twoFactorSecret, setTwoFactorSecret] = useState('')
  const [twoFactorQR, setTwoFactorQR] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [twoFactorVerified, setTwoFactorVerified] = useState(false)

  // Step 3: Plex
  const [plexLinked, setPlexLinked] = useState(false)
  const [plexPinId, setPlexPinId] = useState(null)
  const [showPlexModal, setShowPlexModal] = useState(false)

  // Step 4: Auth Mode
  const [authMode, setAuthMode] = useState('login')

  // Step 5: Recovery Key
  const [recoveryKey, setRecoveryKey] = useState('')
  const [recoveryKeyCopied, setRecoveryKeyCopied] = useState(false)
  const [countdown, setCountdown] = useState(10)
  const [countdownActive, setCountdownActive] = useState(false)

  // Step 1: Create Account
  const handleCreateAccount = async () => {
    if (username.length < 3) {
      setError('Username must be at least 3 characters')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setError('')
    setLoading(true)

    try {
      const res = await fetchWithTimeout('/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, confirm_password: confirmPassword })
      })

      const data = await res.json()

      if (data.success) {
        setCurrentStep(2)
        // Start 2FA setup
        setup2FA()
      } else {
        setError(data.error || 'Failed to create account')
      }
    } catch (_err) {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Setup 2FA
  const setup2FA = async () => {
    try {
      const res = await fetchWithTimeout('/api/user/2fa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      const data = await res.json()

      if (data.success) {
        setTwoFactorSecret(data.secret)
        setTwoFactorQR(data.qr_code_url)
      }
    } catch (err) {
      console.error('Failed to setup 2FA:', err) // Error logged for debugging
    }
  }

  const verify2FA = async () => {
    if (twoFactorCode.length !== 6) {
      setError('Please enter a 6-digit code')
      return
    }

    setError('')
    setLoading(true)

    try {
      const res = await fetchWithTimeout('/api/user/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: twoFactorCode })
      })

      const data = await res.json()

      if (data.success) {
        setTwoFactorVerified(true)
        setCurrentStep(3)
      } else {
        setError(data.error || 'Invalid code. Please try again.')
      }
    } catch (_err) {
      setError('Failed to verify code')
    } finally {
      setLoading(false)
    }
  }

  const skip2FA = () => {
    setCurrentStep(3)
  }

  // Step 3: Plex Link
  const startPlexLink = async () => {
    setError('')

    try {
      const res = await fetchWithTimeout('/api/auth/plex/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setup_mode: true })
      })

      const data = await res.json()

      if (data.success) {
        setPlexPinId(data.pin_id)
        setShowPlexModal(true)
        window.open(data.auth_url, '_blank', 'width=800,height=600')
      } else {
        setError(data.error || 'Failed to start Plex authentication')
      }
    } catch (_err) {
      setError('Failed to connect to Plex')
    }
  }

  // Poll for Plex PIN
  useEffect(() => {
    if (!plexPinId || !showPlexModal) return

    const checkPin = async () => {
      try {
        const res = await fetchWithTimeout(`/api/auth/plex/check/${plexPinId}`)
        const data = await res.json()

        if (data.claimed && data.token) {
          // Link Plex account
          const linkRes = await fetchWithTimeout('/api/auth/plex/link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: data.token, setup_mode: true })
          })

          const linkData = await linkRes.json()

          if (linkData.success) {
            setPlexLinked(true)
            setShowPlexModal(false)
            setCurrentStep(4)
          } else {
            setError(linkData.error || 'Failed to link Plex account')
            setShowPlexModal(false)
          }
        }
      } catch (_err) {
        // Continue polling
      }
    }

    const interval = setInterval(checkPin, 2000)
    const timeout = setTimeout(() => {
      clearInterval(interval)
      setShowPlexModal(false)
      setError('Plex authentication timed out')
    }, 600000)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [plexPinId, showPlexModal])

  const skipPlex = () => {
    setCurrentStep(4)
  }

  // Step 4: Auth Mode
  const saveAuthMode = async () => {
    setError('')
    setLoading(true)

    try {
      const res = await fetchWithTimeout('/api/settings/general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_mode: authMode,
          local_access_bypass: authMode === 'local_bypass',
          proxy_auth_bypass: authMode === 'no_login'
        })
      })

      const data = await res.json()

      if (data.success !== false) {
        setCurrentStep(5)
        generateRecoveryKey()
      } else {
        setError(data.error || 'Failed to save settings')
      }
    } catch (_err) {
      setError('Failed to save settings')
    } finally {
      setLoading(false)
    }
  }

  // Step 5: Recovery Key
  const generateRecoveryKey = async () => {
    try {
      const res = await fetchWithTimeout('/auth/recovery-key/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setup_mode: true })
      })

      const data = await res.json()

      if (data.success) {
        setRecoveryKey(data.recovery_key)
        startCountdown()
      }
    } catch (err) {
      console.error('Failed to generate recovery key:', err)
    }
  }

  const startCountdown = () => {
    setCountdown(10)
    setCountdownActive(true)
  }

  useEffect(() => {
    if (!countdownActive || countdown <= 0) return

    const timer = setTimeout(() => {
      setCountdown(countdown - 1)
    }, 1000)

    return () => clearTimeout(timer)
  }, [countdown, countdownActive])

  const copyRecoveryKey = () => {
    navigator.clipboard.writeText(recoveryKey)
    setRecoveryKeyCopied(true)
  }

  const confirmRecoveryKey = () => {
    if (!recoveryKeyCopied && countdown > 0) {
      setError('Please copy your recovery key first')
      return
    }
    setCurrentStep(6)
  }

  const needMoreTime = () => {
    startCountdown()
  }

  // Step 6: Complete
  const goToDashboard = () => {
    window.location.href = '/'
  }

  // Handle 2FA code input
  const handle2FACodeChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6)
    setTwoFactorCode(value)
  }

  // Copy secret to clipboard
  const copySecret = () => {
    navigator.clipboard.writeText(twoFactorSecret)
  }

  // Show loading while checking setup status
  if (checkingStatus) {
    return (
      <div className={styles.setupPage}>
        <div className={styles.setupContainer}>
          <div className={styles.logo}>
            <img src="/static/logo/256.png" alt="Huntarr" />
            <h1>Huntarr</h1>
          </div>
          <div className={styles.stepContent}>
            <p>Checking setup status...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.setupPage}>
      <div className={styles.setupContainer}>
        <div className={styles.logo}>
          <img src="/static/logo/256.png" alt="Huntarr" />
          <h1>Huntarr Setup</h1>
        </div>

        {/* Step Indicator */}
        <div className={styles.stepIndicator}>
          {STEPS.map((step) => (
            <div
              key={step.id}
              className={`${styles.step} ${currentStep === step.id ? styles.active : ''} ${currentStep > step.id ? styles.completed : ''}`}
            >
              <div className={styles.stepIcon}>
                <i className={`fas ${step.icon}`} />
              </div>
              <span className={styles.stepName}>{step.name}</span>
            </div>
          ))}
        </div>

        {error && (
          <div className={styles.error}>
            <i className="fas fa-exclamation-circle" />
            {error}
          </div>
        )}

        {/* Step 1: Create Account */}
        {currentStep === 1 && (
          <div className={styles.stepContent}>
            <h2>Create Your Account</h2>
            <p>Set up your administrator account to get started.</p>

            <div className={styles.inputGroup}>
              <label htmlFor="username">
                <i className="fas fa-user" /> Username
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Minimum 3 characters"
                autoComplete="username"
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="password">
                <i className="fas fa-lock" /> Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="confirmPassword">
                <i className="fas fa-lock" /> Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
              />
            </div>

            <button
              className={styles.primaryBtn}
              onClick={handleCreateAccount}
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Create Account & Continue'}
            </button>
          </div>
        )}

        {/* Step 2: 2FA Setup */}
        {currentStep === 2 && (
          <div className={styles.stepContent}>
            <h2>Two-Factor Authentication</h2>
            <p>Add an extra layer of security to your account (optional).</p>

            {twoFactorQR && (
              <div className={styles.qrContainer}>
                <img src={twoFactorQR} alt="2FA QR Code" className={styles.qrCode} />
                <p className={styles.secretLabel}>Or enter this code manually:</p>
                <div className={styles.secretBox}>
                  <code>{twoFactorSecret}</code>
                  <button className={styles.copyBtn} onClick={copySecret}>
                    <i className="fas fa-copy" />
                  </button>
                </div>
              </div>
            )}

            <div className={styles.inputGroup}>
              <label htmlFor="verifyCode">
                <i className="fas fa-key" /> Verification Code
              </label>
              <input
                type="text"
                id="verifyCode"
                value={twoFactorCode}
                onChange={handle2FACodeChange}
                placeholder="Enter 6-digit code"
                maxLength={6}
                className={styles.codeInput}
              />
            </div>

            <div className={styles.buttonGroup}>
              <button className={styles.skipBtn} onClick={skip2FA}>
                Skip for Now
              </button>
              <button
                className={styles.primaryBtn}
                onClick={verify2FA}
                disabled={loading || twoFactorCode.length !== 6}
              >
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Plex Link */}
        {currentStep === 3 && (
          <div className={styles.stepContent}>
            <h2>Link Plex Account</h2>
            <p>Optionally link your Plex account for easy sign-in.</p>

            <div className={styles.infoBox}>
              <i className="fas fa-info-circle" />
              <div>
                <strong>Why link Plex?</strong>
                <p>Sign in with your Plex account instead of remembering another password.</p>
              </div>
            </div>

            {plexLinked ? (
              <div className={styles.successBox}>
                <i className="fas fa-check-circle" />
                Plex account linked successfully!
              </div>
            ) : (
              <button className={styles.plexBtn} onClick={startPlexLink}>
                <i className="fab fa-plex" />
                Link Plex Account
              </button>
            )}

            <div className={styles.buttonGroup}>
              <button className={styles.skipBtn} onClick={skipPlex}>
                {plexLinked ? 'Continue' : 'Skip for Now'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Auth Mode */}
        {currentStep === 4 && (
          <div className={styles.stepContent}>
            <h2>Authentication Mode</h2>
            <p>Choose how users authenticate to Huntarr.</p>

            <div className={styles.radioGroup}>
              {AUTH_MODES.map((mode) => (
                <label key={mode.value} className={styles.radioOption}>
                  <input
                    type="radio"
                    name="authMode"
                    value={mode.value}
                    checked={authMode === mode.value}
                    onChange={(e) => setAuthMode(e.target.value)}
                  />
                  <div className={styles.radioContent}>
                    <strong>{mode.label}</strong>
                    <span>{mode.desc}</span>
                  </div>
                </label>
              ))}
            </div>

            {authMode === 'no_login' && (
              <div className={styles.warningBox}>
                <i className="fas fa-exclamation-triangle" />
                <span>Warning: This disables all authentication. Only use behind a reverse proxy with its own authentication.</span>
              </div>
            )}

            <button
              className={styles.primaryBtn}
              onClick={saveAuthMode}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        )}

        {/* Step 5: Recovery Key */}
        {currentStep === 5 && (
          <div className={styles.stepContent}>
            <h2>Recovery Key</h2>
            <p>Save this key to recover your account if you lose access.</p>

            <div className={styles.recoveryKeyBox}>
              <code>{recoveryKey || 'Generating...'}</code>
            </div>

            <button
              className={`${styles.copyBtn} ${styles.copyBtnLarge} ${recoveryKeyCopied ? styles.copied : ''}`}
              onClick={copyRecoveryKey}
              disabled={!recoveryKey}
            >
              <i className={recoveryKeyCopied ? 'fas fa-check' : 'fas fa-copy'} />
              {recoveryKeyCopied ? 'Copied!' : 'Copy to Clipboard'}
            </button>

            <div className={styles.warningBox}>
              <i className="fas fa-exclamation-triangle" />
              <span>This key will only be shown once. Store it in a safe place.</span>
            </div>

            {countdownActive && countdown > 0 ? (
              <p className={styles.countdown}>
                Please copy your key. Continuing in {countdown}s...
                <button className={styles.needTimeBtn} onClick={needMoreTime}>
                  Need more time
                </button>
              </p>
            ) : (
              <button
                className={styles.primaryBtn}
                onClick={confirmRecoveryKey}
              >
                I've Saved My Recovery Key
              </button>
            )}
          </div>
        )}

        {/* Step 6: Complete */}
        {currentStep === 6 && (
          <div className={styles.stepContent}>
            <div className={styles.completeIcon}>
              <i className="fas fa-check-circle" />
            </div>
            <h2>Setup Complete!</h2>
            <p>Your Huntarr instance is ready to use.</p>

            <div className={styles.summaryBox}>
              <div className={styles.summaryItem}>
                <i className="fas fa-user" />
                <span>Account: <strong>{username}</strong></span>
              </div>
              <div className={styles.summaryItem}>
                <i className="fas fa-shield-alt" />
                <span>2FA: <strong>{twoFactorVerified ? 'Enabled' : 'Disabled'}</strong></span>
              </div>
              <div className={styles.summaryItem}>
                <i className="fab fa-plex" />
                <span>Plex: <strong>{plexLinked ? 'Linked' : 'Not Linked'}</strong></span>
              </div>
            </div>

            <button className={styles.primaryBtn} onClick={goToDashboard}>
              <i className="fas fa-home" /> Go to Dashboard
            </button>
          </div>
        )}

        {/* Plex Modal */}
        {showPlexModal && (
          <div className={styles.modal} onClick={() => setShowPlexModal(false)}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <h2>Link Plex Account</h2>
              <p>A new window has opened for Plex authentication.</p>
              <div className={styles.modalSpinner}>
                <i className="fas fa-spinner fa-spin" />
                <span>Waiting for Plex...</span>
              </div>
              <button className={styles.modalClose} onClick={() => setShowPlexModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Setup
