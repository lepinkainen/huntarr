import { useState, useEffect, useRef } from 'react'
import api from '../../api/client'
import styles from './Settings.module.css'

function UserSettings() {
  // User info state
  const [userInfo, setUserInfo] = useState({ username: '', is_2fa_enabled: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Username change state
  const [newUsername, setNewUsername] = useState('')
  const [usernamePassword, setUsernamePassword] = useState('')
  const [usernameStatus, setUsernameStatus] = useState(null)
  const [usernameLoading, setUsernameLoading] = useState(false)

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordStatus, setPasswordStatus] = useState(null)
  const [passwordLoading, setPasswordLoading] = useState(false)

  // 2FA state
  const [tfaSetup, setTfaSetup] = useState(null) // { secret, qr_code_url }
  const [tfaCode, setTfaCode] = useState('')
  const [tfaEnableStatus, setTfaEnableStatus] = useState(null)
  const [tfaEnableLoading, setTfaEnableLoading] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [tfaDisableStatus, setTfaDisableStatus] = useState(null)
  const [tfaDisableLoading, setTfaDisableLoading] = useState(false)

  // Recovery key state
  const [recoveryPassword, setRecoveryPassword] = useState('')
  const [recoveryTfaCode, setRecoveryTfaCode] = useState('')
  const [recoveryKey, setRecoveryKey] = useState(null)
  const [recoveryStatus, setRecoveryStatus] = useState(null)
  const [recoveryLoading, setRecoveryLoading] = useState(false)

  // Plex account state
  const [plexStatus, setPlexStatus] = useState({ plex_linked: false })
  const [showPlexModal, setShowPlexModal] = useState(false)
  const [plexPinId, setPlexPinId] = useState(null)
  const [plexLinkStatus, setPlexLinkStatus] = useState(null)
  const [plexLinking, setPlexLinking] = useState(false)
  const [plexUnlinking, setPlexUnlinking] = useState(false)
  const [plexUnlinkStatus, setPlexUnlinkStatus] = useState(null)
  const plexPollingRef = useRef(null)

  // Load user info on mount
  useEffect(() => {
    loadUserInfo()
    checkPlexReturn()
    // Cleanup polling on unmount
    return () => {
      if (plexPollingRef.current) {
        clearInterval(plexPollingRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadUserInfo = async () => {
    try {
      const data = await api.get('/api/user/info')
      // API returns {username, is_2fa_enabled} directly, not wrapped in success
      if (data.username) {
        setUserInfo({
          username: data.username,
          is_2fa_enabled: data.is_2fa_enabled
        })
      }
      // Also load Plex status
      await loadPlexStatus()
      setLoading(false)
    } catch (err) {
      console.error('Failed to load user info:', err)
      setError('Failed to load user information')
      setLoading(false)
    }
  }

  // Load Plex account status
  const loadPlexStatus = async () => {
    try {
      const data = await api.get('/api/auth/plex/status')
      if (data.success) {
        setPlexStatus({
          plex_linked: data.plex_linked,
          plex_username: data.plex_username,
          plex_email: data.plex_email,
          plex_linked_at: data.plex_linked_at
        })
      }
    } catch (err) {
      console.debug('Failed to load Plex status:', err)
      // Not a critical error, just set as not linked
      setPlexStatus({ plex_linked: false })
    }
  }

  // Check if returning from Plex OAuth
  const checkPlexReturn = () => {
    const plexLinking = localStorage.getItem('huntarr-plex-linking')
    const storedPinId = localStorage.getItem('huntarr-plex-pin-id')
    const userMode = localStorage.getItem('huntarr-plex-user-mode')

    if (plexLinking === 'true' && storedPinId && userMode === 'true') {
      console.debug('Detected return from Plex authentication, PIN ID:', storedPinId)

      // Clear the flags
      localStorage.removeItem('huntarr-plex-linking')
      localStorage.removeItem('huntarr-plex-pin-id')
      localStorage.removeItem('huntarr-plex-user-mode')
      localStorage.removeItem('huntarr-plex-linking-timestamp')

      // Show modal and start checking
      setShowPlexModal(true)
      setPlexPinId(storedPinId)
      setPlexLinkStatus({ type: 'info', message: 'Completing Plex authentication...' })
      startPlexPolling(storedPinId)
    }
  }

  // Start Plex account linking
  const handleLinkPlex = async () => {
    setShowPlexModal(true)
    setPlexLinkStatus({ type: 'info', message: 'Preparing Plex authentication...' })
    setPlexLinking(true)

    try {
      const data = await api.post('/api/auth/plex/pin', { user_mode: true })

      if (data.success) {
        setPlexPinId(data.pin_id)

        // Store for return from Plex
        localStorage.setItem('huntarr-plex-pin-id', data.pin_id)
        localStorage.setItem('huntarr-plex-linking', 'true')
        localStorage.setItem('huntarr-plex-user-mode', 'true')
        localStorage.setItem('huntarr-plex-linking-timestamp', Date.now().toString())

        setPlexLinkStatus({ type: 'info', message: 'Redirecting to Plex...' })

        // Redirect to Plex auth
        setTimeout(() => {
          window.location.href = data.auth_url
        }, 1500)
      } else {
        setPlexLinkStatus({ type: 'error', message: data.error || 'Failed to create Plex PIN' })
        setPlexLinking(false)
      }
    } catch (err) {
      console.error('Failed to create Plex PIN:', err)
      setPlexLinkStatus({ type: 'error', message: 'Network error. Please try again.' })
      setPlexLinking(false)
    }
  }

  // Start polling for PIN claim
  const startPlexPolling = (pinId) => {
    if (plexPollingRef.current) {
      clearInterval(plexPollingRef.current)
    }

    plexPollingRef.current = setInterval(async () => {
      try {
        const data = await api.get(`/api/auth/plex/check/${pinId}`)

        if (data.success && data.claimed) {
          // PIN claimed, link the account
          clearInterval(plexPollingRef.current)
          plexPollingRef.current = null
          await linkWithPlexToken(data.token)
        } else if (!data.success) {
          clearInterval(plexPollingRef.current)
          plexPollingRef.current = null
          setPlexLinkStatus({ type: 'error', message: data.error || 'Authentication check failed' })
          setPlexLinking(false)
        }
      } catch (err) {
        console.error('Error checking Plex PIN:', err)
        clearInterval(plexPollingRef.current)
        plexPollingRef.current = null
        setPlexLinkStatus({ type: 'error', message: 'Network error checking authentication' })
        setPlexLinking(false)
      }
    }, 2000)

    // Timeout after 10 minutes
    setTimeout(() => {
      if (plexPollingRef.current) {
        clearInterval(plexPollingRef.current)
        plexPollingRef.current = null
        setPlexLinkStatus({ type: 'error', message: 'Authentication timeout. Please try again.' })
        setPlexLinking(false)
      }
    }, 600000)
  }

  // Complete Plex account linking
  const linkWithPlexToken = async (token) => {
    setPlexLinkStatus({ type: 'info', message: 'Finalizing account link...' })

    try {
      const result = await api.post('/api/auth/plex/link', {
        token: token,
        setup_mode: true
      })

      if (result.success) {
        setPlexLinkStatus({ type: 'success', message: 'Plex account linked successfully!' })
        await loadPlexStatus()
        setTimeout(() => {
          setShowPlexModal(false)
          setPlexLinkStatus(null)
          setPlexLinking(false)
        }, 2000)
      } else {
        setPlexLinkStatus({ type: 'error', message: result.error || 'Failed to link account' })
        setPlexLinking(false)
      }
    } catch (err) {
      console.error('Failed to link Plex account:', err)
      setPlexLinkStatus({ type: 'error', message: 'Network error linking account' })
      setPlexLinking(false)
    }
  }

  // Cancel Plex linking
  const cancelPlexLink = () => {
    if (plexPollingRef.current) {
      clearInterval(plexPollingRef.current)
      plexPollingRef.current = null
    }
    localStorage.removeItem('huntarr-plex-linking')
    localStorage.removeItem('huntarr-plex-pin-id')
    localStorage.removeItem('huntarr-plex-user-mode')
    localStorage.removeItem('huntarr-plex-linking-timestamp')
    setShowPlexModal(false)
    setPlexPinId(null)
    setPlexLinkStatus(null)
    setPlexLinking(false)
  }

  // Unlink Plex account
  const handleUnlinkPlex = async () => {
    if (!window.confirm('Are you sure you want to unlink your Plex account?')) {
      return
    }

    setPlexUnlinking(true)
    setPlexUnlinkStatus(null)

    try {
      const result = await api.post('/api/auth/plex/unlink', {})

      if (result.success) {
        setPlexUnlinkStatus({ type: 'success', message: 'Plex account unlinked' })
        setPlexStatus({ plex_linked: false })
        setTimeout(() => setPlexUnlinkStatus(null), 3000)
      } else {
        setPlexUnlinkStatus({ type: 'error', message: result.error || 'Failed to unlink' })
      }
    } catch (err) {
      console.error('Failed to unlink Plex:', err)
      setPlexUnlinkStatus({ type: 'error', message: 'Network error' })
    } finally {
      setPlexUnlinking(false)
    }
  }

  // Format Plex linked timestamp
  const formatPlexLinkedAt = (timestamp) => {
    if (!timestamp) return 'Unknown'
    try {
      const date = new Date(timestamp * 1000)
      return date.toLocaleString()
    } catch {
      return 'Unknown'
    }
  }

  // Change username handler
  const handleChangeUsername = async (e) => {
    e.preventDefault()
    if (!newUsername.trim() || !usernamePassword) return

    setUsernameLoading(true)
    setUsernameStatus(null)
    try {
      const result = await api.post('/api/user/change-username', {
        new_username: newUsername.trim(),
        password: usernamePassword
      })
      if (result.success) {
        setUsernameStatus({ type: 'success', message: 'Username changed successfully' })
        setUserInfo(prev => ({ ...prev, username: newUsername.trim() }))
        setNewUsername('')
        setUsernamePassword('')
      } else {
        setUsernameStatus({ type: 'error', message: result.error || 'Failed to change username' })
      }
    } catch (err) {
      console.error('Failed to change username:', err)
      setUsernameStatus({ type: 'error', message: 'Failed to change username' })
    } finally {
      setUsernameLoading(false)
    }
  }

  // Change password handler
  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (!currentPassword || !newPassword || !confirmPassword) return

    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'Passwords do not match' })
      return
    }

    if (newPassword.length < 8) {
      setPasswordStatus({ type: 'error', message: 'Password must be at least 8 characters' })
      return
    }

    setPasswordLoading(true)
    setPasswordStatus(null)
    try {
      const result = await api.post('/api/user/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      })
      if (result.success) {
        setPasswordStatus({ type: 'success', message: 'Password changed successfully' })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        setPasswordStatus({ type: 'error', message: result.error || 'Failed to change password' })
      }
    } catch (err) {
      console.error('Failed to change password:', err)
      setPasswordStatus({ type: 'error', message: 'Failed to change password' })
    } finally {
      setPasswordLoading(false)
    }
  }

  // Setup 2FA (get QR code)
  const handleSetup2FA = async () => {
    setTfaEnableLoading(true)
    setTfaEnableStatus(null)
    try {
      const result = await api.post('/api/user/2fa/setup', {})
      if (result.success) {
        setTfaSetup({
          secret: result.secret,
          qr_code_url: result.qr_code_url
        })
      } else {
        setTfaEnableStatus({ type: 'error', message: result.error || 'Failed to setup 2FA' })
      }
    } catch (err) {
      console.error('Failed to setup 2FA:', err)
      setTfaEnableStatus({ type: 'error', message: 'Failed to setup 2FA' })
    } finally {
      setTfaEnableLoading(false)
    }
  }

  // Verify and enable 2FA
  const handleVerify2FA = async (e) => {
    e.preventDefault()
    if (!tfaCode || tfaCode.length !== 6) return

    setTfaEnableLoading(true)
    setTfaEnableStatus(null)
    try {
      const result = await api.post('/api/user/2fa/verify', {
        code: tfaCode
      })
      if (result.success) {
        setTfaEnableStatus({ type: 'success', message: '2FA enabled successfully' })
        setUserInfo(prev => ({ ...prev, is_2fa_enabled: true }))
        setTfaSetup(null)
        setTfaCode('')
      } else {
        setTfaEnableStatus({ type: 'error', message: result.error || 'Invalid code' })
      }
    } catch (err) {
      console.error('Failed to verify 2FA:', err)
      setTfaEnableStatus({ type: 'error', message: 'Failed to verify 2FA code' })
    } finally {
      setTfaEnableLoading(false)
    }
  }

  // Disable 2FA
  const handleDisable2FA = async (e) => {
    e.preventDefault()
    if (!disablePassword || !disableCode) return

    setTfaDisableLoading(true)
    setTfaDisableStatus(null)
    try {
      const result = await api.post('/api/user/2fa/disable', {
        password: disablePassword,
        otp_code: disableCode
      })
      if (result.success) {
        setTfaDisableStatus({ type: 'success', message: '2FA disabled successfully' })
        setUserInfo(prev => ({ ...prev, is_2fa_enabled: false }))
        setDisablePassword('')
        setDisableCode('')
      } else {
        setTfaDisableStatus({ type: 'error', message: result.error || 'Failed to disable 2FA' })
      }
    } catch (err) {
      console.error('Failed to disable 2FA:', err)
      setTfaDisableStatus({ type: 'error', message: 'Failed to disable 2FA' })
    } finally {
      setTfaDisableLoading(false)
    }
  }

  // Generate recovery key
  const handleGenerateRecoveryKey = async (e) => {
    e.preventDefault()
    if (!recoveryPassword) return
    if (userInfo.is_2fa_enabled && !recoveryTfaCode) return

    setRecoveryLoading(true)
    setRecoveryStatus(null)
    try {
      const payload = { password: recoveryPassword }
      if (userInfo.is_2fa_enabled) {
        payload.otp_code = recoveryTfaCode
      }
      const result = await api.post('/auth/recovery-key/generate', payload)
      if (result.success) {
        setRecoveryKey(result.recovery_key)
        setRecoveryStatus({ type: 'success', message: 'Recovery key generated' })
        setRecoveryPassword('')
        setRecoveryTfaCode('')
      } else {
        setRecoveryStatus({ type: 'error', message: result.error || 'Failed to generate recovery key' })
      }
    } catch (err) {
      console.error('Failed to generate recovery key:', err)
      setRecoveryStatus({ type: 'error', message: 'Failed to generate recovery key' })
    } finally {
      setRecoveryLoading(false)
    }
  }

  // Copy recovery key to clipboard
  const copyRecoveryKey = () => {
    if (recoveryKey) {
      navigator.clipboard.writeText(recoveryKey)
      setRecoveryStatus({ type: 'success', message: 'Copied to clipboard' })
      setTimeout(() => setRecoveryStatus(null), 2000)
    }
  }

  // Cancel 2FA setup
  const cancelTfaSetup = () => {
    setTfaSetup(null)
    setTfaCode('')
    setTfaEnableStatus(null)
  }

  if (loading) {
    return (
      <div className={styles.section}>
        <div className={styles.loading}>
          <i className="fas fa-spinner fa-spin" />
          <span>Loading user settings...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.section}>
        <div className={styles.error}>
          <i className="fas fa-exclamation-triangle" />
          <span>{error}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>User Account</h2>
      </div>

      {/* Change Username */}
      <div className={styles.settingsGroup}>
        <h3>
          <i className="fas fa-user" /> Change Username
        </h3>
        <div className={styles.field}>
          <label>Current Username</label>
          <div className={styles.readOnlyValue}>
            <i className="fas fa-user" /> {userInfo.username}
          </div>
        </div>
        <form onSubmit={handleChangeUsername} className={styles.userForm}>
          <div className={styles.fieldsGrid}>
            <div className={styles.field}>
              <label htmlFor="newUsername">New Username</label>
              <input
                type="text"
                id="newUsername"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className={styles.textInput}
                placeholder="Enter new username"
                autoComplete="username"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="usernamePassword">Current Password</label>
              <input
                type="password"
                id="usernamePassword"
                value={usernamePassword}
                onChange={(e) => setUsernamePassword(e.target.value)}
                className={styles.textInput}
                placeholder="Verify with password"
                autoComplete="current-password"
              />
            </div>
          </div>
          <div className={styles.formActions}>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={!newUsername.trim() || !usernamePassword || usernameLoading}
            >
              {usernameLoading ? (
                <>
                  <i className="fas fa-spinner fa-spin" /> Changing...
                </>
              ) : (
                <>
                  <i className="fas fa-save" /> Change Username
                </>
              )}
            </button>
            {usernameStatus && (
              <span className={usernameStatus.type === 'success' ? styles.saveSuccess : styles.saveError}>
                <i className={usernameStatus.type === 'success' ? 'fas fa-check' : 'fas fa-times'} />
                {usernameStatus.message}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Change Password */}
      <div className={styles.settingsGroup}>
        <h3>
          <i className="fas fa-key" /> Change Password
        </h3>
        <form onSubmit={handleChangePassword} className={styles.userForm}>
          <div className={styles.fieldsGrid}>
            <div className={styles.field}>
              <label htmlFor="currentPassword">Current Password</label>
              <input
                type="password"
                id="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={styles.textInput}
                placeholder="Enter current password"
                autoComplete="current-password"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="newPassword">New Password</label>
              <input
                type="password"
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={styles.textInput}
                placeholder="Enter new password"
                autoComplete="new-password"
              />
              <p className={styles.help}>Minimum 8 characters</p>
            </div>
            <div className={styles.field}>
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={styles.textInput}
                placeholder="Confirm new password"
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className={styles.formActions}>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={!currentPassword || !newPassword || !confirmPassword || passwordLoading}
            >
              {passwordLoading ? (
                <>
                  <i className="fas fa-spinner fa-spin" /> Changing...
                </>
              ) : (
                <>
                  <i className="fas fa-save" /> Change Password
                </>
              )}
            </button>
            {passwordStatus && (
              <span className={passwordStatus.type === 'success' ? styles.saveSuccess : styles.saveError}>
                <i className={passwordStatus.type === 'success' ? 'fas fa-check' : 'fas fa-times'} />
                {passwordStatus.message}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Two-Factor Authentication */}
      <div className={styles.settingsGroup}>
        <h3>
          <i className="fas fa-shield-alt" /> Two-Factor Authentication
        </h3>
        <div className={styles.tfaStatus}>
          <span className={userInfo.is_2fa_enabled ? styles.statusEnabled : styles.statusDisabled}>
            <i className={userInfo.is_2fa_enabled ? 'fas fa-check-circle' : 'fas fa-times-circle'} />
            {userInfo.is_2fa_enabled ? '2FA Enabled' : '2FA Disabled'}
          </span>
        </div>

        {!userInfo.is_2fa_enabled ? (
          // Enable 2FA flow
          <>
            {!tfaSetup ? (
              // Step 1: Start setup
              <div className={styles.tfaSetup}>
                <p className={styles.groupDescription}>
                  Two-factor authentication adds an extra layer of security to your account by requiring a code from your authenticator app.
                </p>
                <button
                  className={styles.btnPrimary}
                  onClick={handleSetup2FA}
                  disabled={tfaEnableLoading}
                >
                  {tfaEnableLoading ? (
                    <>
                      <i className="fas fa-spinner fa-spin" /> Setting up...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-shield-alt" /> Enable 2FA
                    </>
                  )}
                </button>
                {tfaEnableStatus && (
                  <span className={tfaEnableStatus.type === 'success' ? styles.saveSuccess : styles.saveError}>
                    <i className={tfaEnableStatus.type === 'success' ? 'fas fa-check' : 'fas fa-times'} />
                    {tfaEnableStatus.message}
                  </span>
                )}
              </div>
            ) : (
              // Step 2: Scan QR and verify
              <div className={styles.tfaVerify}>
                <p className={styles.groupDescription}>
                  Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code to verify.
                </p>
                <div className={styles.qrContainer}>
                  <img src={tfaSetup.qr_code_url} alt="2FA QR Code" className={styles.qrCode} />
                </div>
                <div className={styles.secretContainer}>
                  <label>Manual Entry Key:</label>
                  <code className={styles.secretCode}>{tfaSetup.secret}</code>
                </div>
                <form onSubmit={handleVerify2FA} className={styles.verifyForm}>
                  <div className={styles.field}>
                    <label htmlFor="tfaCode">Enter 6-digit code</label>
                    <input
                      type="text"
                      id="tfaCode"
                      value={tfaCode}
                      onChange={(e) => setTfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className={styles.otpInput}
                      placeholder="000000"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      autoComplete="one-time-code"
                    />
                  </div>
                  <div className={styles.formActions}>
                    <button
                      type="submit"
                      className={styles.btnPrimary}
                      disabled={tfaCode.length !== 6 || tfaEnableLoading}
                    >
                      {tfaEnableLoading ? (
                        <>
                          <i className="fas fa-spinner fa-spin" /> Verifying...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-check" /> Verify & Enable
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={cancelTfaSetup}
                    >
                      Cancel
                    </button>
                    {tfaEnableStatus && (
                      <span className={tfaEnableStatus.type === 'success' ? styles.saveSuccess : styles.saveError}>
                        <i className={tfaEnableStatus.type === 'success' ? 'fas fa-check' : 'fas fa-times'} />
                        {tfaEnableStatus.message}
                      </span>
                    )}
                  </div>
                </form>
              </div>
            )}
          </>
        ) : (
          // Disable 2FA flow
          <div className={styles.tfaDisable}>
            <div className={styles.warningBox}>
              <i className="fas fa-exclamation-triangle" />
              <p>Disabling 2FA will make your account less secure. You'll need to enter your password and current 2FA code to confirm.</p>
            </div>
            <form onSubmit={handleDisable2FA} className={styles.userForm}>
              <div className={styles.fieldsGrid}>
                <div className={styles.field}>
                  <label htmlFor="disablePassword">Password</label>
                  <input
                    type="password"
                    id="disablePassword"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    className={styles.textInput}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="disableCode">2FA Code</label>
                  <input
                    type="text"
                    id="disableCode"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className={styles.otpInput}
                    placeholder="000000"
                    maxLength={6}
                    autoComplete="one-time-code"
                  />
                </div>
              </div>
              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={styles.btnDanger}
                  disabled={!disablePassword || disableCode.length !== 6 || tfaDisableLoading}
                >
                  {tfaDisableLoading ? (
                    <>
                      <i className="fas fa-spinner fa-spin" /> Disabling...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-times" /> Disable 2FA
                    </>
                  )}
                </button>
                {tfaDisableStatus && (
                  <span className={tfaDisableStatus.type === 'success' ? styles.saveSuccess : styles.saveError}>
                    <i className={tfaDisableStatus.type === 'success' ? 'fas fa-check' : 'fas fa-times'} />
                    {tfaDisableStatus.message}
                  </span>
                )}
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Recovery Key */}
      <div className={styles.settingsGroup}>
        <h3>
          <i className="fas fa-life-ring" /> Recovery Key
        </h3>
        <p className={styles.groupDescription}>
          Generate a recovery key to regain access to your account if you lose your 2FA device. Store this key in a secure location.
        </p>

        {recoveryKey ? (
          <div className={styles.recoveryKeyDisplay}>
            <div className={styles.recoveryKeyBox}>
              <code>{recoveryKey}</code>
            </div>
            <div className={styles.formActions}>
              <button className={styles.btnPrimary} onClick={copyRecoveryKey}>
                <i className="fas fa-copy" /> Copy to Clipboard
              </button>
              <button className={styles.btnSecondary} onClick={() => setRecoveryKey(null)}>
                <i className="fas fa-times" /> Done
              </button>
            </div>
            <div className={styles.warningBox}>
              <i className="fas fa-exclamation-triangle" />
              <p>Save this key now! It will not be shown again. Anyone with this key can access your account.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleGenerateRecoveryKey} className={styles.userForm}>
            <div className={styles.fieldsGrid}>
              <div className={styles.field}>
                <label htmlFor="recoveryPassword">Password</label>
                <input
                  type="password"
                  id="recoveryPassword"
                  value={recoveryPassword}
                  onChange={(e) => setRecoveryPassword(e.target.value)}
                  className={styles.textInput}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
              </div>
              {userInfo.is_2fa_enabled && (
                <div className={styles.field}>
                  <label htmlFor="recoveryTfaCode">2FA Code</label>
                  <input
                    type="text"
                    id="recoveryTfaCode"
                    value={recoveryTfaCode}
                    onChange={(e) => setRecoveryTfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className={styles.otpInput}
                    placeholder="000000"
                    maxLength={6}
                    autoComplete="one-time-code"
                  />
                </div>
              )}
            </div>
            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={!recoveryPassword || (userInfo.is_2fa_enabled && recoveryTfaCode.length !== 6) || recoveryLoading}
              >
                {recoveryLoading ? (
                  <>
                    <i className="fas fa-spinner fa-spin" /> Generating...
                  </>
                ) : (
                  <>
                    <i className="fas fa-key" /> Generate Recovery Key
                  </>
                )}
              </button>
              {recoveryStatus && (
                <span className={recoveryStatus.type === 'success' ? styles.saveSuccess : styles.saveError}>
                  <i className={recoveryStatus.type === 'success' ? 'fas fa-check' : 'fas fa-times'} />
                  {recoveryStatus.message}
                </span>
              )}
            </div>
          </form>
        )}
      </div>

      {/* Plex Account */}
      <div className={styles.settingsGroup}>
        <h3>
          <i className="fas fa-tv" /> Plex Account
        </h3>
        <div className={styles.tfaStatus}>
          <span className={plexStatus.plex_linked ? styles.statusEnabled : styles.statusDisabled}>
            <i className={plexStatus.plex_linked ? 'fas fa-check-circle' : 'fas fa-times-circle'} />
            {plexStatus.plex_linked ? 'Linked' : 'Not Linked'}
          </span>
        </div>

        {!plexStatus.plex_linked ? (
          // Not linked - show link button
          <div className={styles.tfaSetup}>
            <p className={styles.groupDescription}>
              Link your Plex account to enable Plex-based authentication as an alternative to username/password login.
            </p>
            <button
              className={styles.btnPrimary}
              onClick={handleLinkPlex}
              disabled={plexLinking}
            >
              {plexLinking ? (
                <>
                  <i className="fas fa-spinner fa-spin" /> Linking...
                </>
              ) : (
                <>
                  <i className="fas fa-link" /> Link Plex Account
                </>
              )}
            </button>
          </div>
        ) : (
          // Linked - show info and unlink button
          <div className={styles.plexLinkedInfo}>
            <div className={styles.plexInfoGrid}>
              <div className={styles.plexInfoItem}>
                <label>Plex Username</label>
                <span>{plexStatus.plex_username || 'Unknown'}</span>
              </div>
              <div className={styles.plexInfoItem}>
                <label>Plex Email</label>
                <span>{plexStatus.plex_email || 'N/A'}</span>
              </div>
              <div className={styles.plexInfoItem}>
                <label>Linked On</label>
                <span>{formatPlexLinkedAt(plexStatus.plex_linked_at)}</span>
              </div>
            </div>
            <div className={styles.formActions}>
              <button
                className={styles.btnDanger}
                onClick={handleUnlinkPlex}
                disabled={plexUnlinking}
              >
                {plexUnlinking ? (
                  <>
                    <i className="fas fa-spinner fa-spin" /> Unlinking...
                  </>
                ) : (
                  <>
                    <i className="fas fa-unlink" /> Unlink Plex Account
                  </>
                )}
              </button>
              {plexUnlinkStatus && (
                <span className={plexUnlinkStatus.type === 'success' ? styles.saveSuccess : styles.saveError}>
                  <i className={plexUnlinkStatus.type === 'success' ? 'fas fa-check' : 'fas fa-times'} />
                  {plexUnlinkStatus.message}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Plex Link Modal */}
      {showPlexModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>
                <i className="fas fa-tv" /> Link Plex Account
              </h3>
              <button className={styles.modalClose} onClick={cancelPlexLink}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.plexModalContent}>
                {plexPinId && (
                  <div className={styles.plexPinDisplay}>
                    <label>PIN Code</label>
                    <code>{plexPinId}</code>
                  </div>
                )}
                {plexLinkStatus && (
                  <div className={`${styles.plexStatus} ${styles[plexLinkStatus.type]}`}>
                    <i className={
                      plexLinkStatus.type === 'success' ? 'fas fa-check-circle' :
                      plexLinkStatus.type === 'error' ? 'fas fa-exclamation-circle' :
                      'fas fa-spinner fa-spin'
                    } />
                    <span>{plexLinkStatus.message}</span>
                  </div>
                )}
                <p className={styles.help}>
                  You will be redirected to Plex to sign in. After authentication, you will be brought back here automatically.
                </p>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnSecondary} onClick={cancelPlexLink}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserSettings
