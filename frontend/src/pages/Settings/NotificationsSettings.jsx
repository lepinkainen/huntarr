import { useState, useEffect } from 'react'
import api from '../../api/client'
import styles from './Settings.module.css'

// Notification level options
const NOTIFICATION_LEVELS = [
  { value: 'info', label: 'Info' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' }
]

// Default settings
const DEFAULT_SETTINGS = {
  enable_notifications: false,
  notification_level: 'info',
  apprise_urls: [],
  notify_on_missing: true,
  notify_on_upgrade: true,
  notification_include_instance: true,
  notification_include_app: true
}

function NotificationsSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [originalSettings, setOriginalSettings] = useState(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  // For textarea display
  const [urlsText, setUrlsText] = useState('')

  // Load settings on mount
  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const data = await api.get('/api/settings')
      const general = data.general || {}
      const loaded = {
        enable_notifications: general.enable_notifications ?? false,
        notification_level: general.notification_level ?? 'info',
        apprise_urls: general.apprise_urls ?? [],
        notify_on_missing: general.notify_on_missing ?? true,
        notify_on_upgrade: general.notify_on_upgrade ?? true,
        notification_include_instance: general.notification_include_instance ?? true,
        notification_include_app: general.notification_include_app ?? true
      }
      setSettings(loaded)
      setOriginalSettings(loaded)
      setUrlsText((loaded.apprise_urls || []).join('\n'))
      setLoading(false)
    } catch (err) {
      console.error('Failed to load notification settings:', err)
      setLoading(false)
    }
  }

  // Convert textarea text to array
  const textToUrls = (text) => {
    return text.split('\n').map(s => s.trim()).filter(Boolean)
  }

  // Check for changes
  const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings)

  // Handle field changes
  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }))
    setSaveStatus(null)
  }

  // Handle URLs textarea change
  const handleUrlsChange = (text) => {
    setUrlsText(text)
    setSettings(prev => ({ ...prev, apprise_urls: textToUrls(text) }))
    setSaveStatus(null)
  }

  // Save settings
  const saveSettings = async () => {
    setSaving(true)
    setSaveStatus(null)
    try {
      await api.post('/api/settings/general', settings)
      setOriginalSettings(settings)
      setSaveStatus('success')
      setTimeout(() => setSaveStatus(null), 3000)
    } catch (err) {
      console.error('Failed to save notification settings:', err)
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  // Test notification
  const testNotification = async () => {
    // Auto-save first if there are changes
    if (hasChanges) {
      await saveSettings()
    }

    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.post('/api/test-notification', {})
      if (result.success) {
        setTestResult({ type: 'success', message: result.message || 'Test notification sent!' })
      } else {
        setTestResult({ type: 'error', message: result.error || 'Failed to send test notification' })
      }
    } catch (err) {
      console.error('Failed to send test notification:', err)
      setTestResult({ type: 'error', message: 'Failed to send test notification' })
    } finally {
      setTesting(false)
      setTimeout(() => setTestResult(null), 5000)
    }
  }

  if (loading) {
    return (
      <div className={styles.section}>
        <div className={styles.loading}>
          <i className="fas fa-spinner fa-spin" />
          <span>Loading notification settings...</span>
        </div>
      </div>
    )
  }

  const isDisabled = !settings.enable_notifications

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>Notifications</h2>
        <div className={styles.headerActions}>
          {saveStatus === 'success' && (
            <span className={styles.saveSuccess}>
              <i className="fas fa-check" /> Saved
            </span>
          )}
          {saveStatus === 'error' && (
            <span className={styles.saveError}>
              <i className="fas fa-times" /> Failed to save
            </span>
          )}
          <button
            className={styles.btnSave}
            onClick={saveSettings}
            disabled={!hasChanges || saving}
          >
            {saving ? (
              <>
                <i className="fas fa-spinner fa-spin" /> Saving...
              </>
            ) : (
              <>
                <i className="fas fa-save" /> Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Enable Notifications */}
      <div className={styles.settingsGroup}>
        <h3>
          <i className="fas fa-bell" /> Enable Notifications
        </h3>
        <div className={styles.field}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={settings.enable_notifications}
              onChange={(e) => handleChange('enable_notifications', e.target.checked)}
              className={styles.checkbox}
            />
            <span className={styles.checkboxText}>Enable Notifications</span>
          </label>
          <p className={styles.help}>
            Master toggle for all notification features. When disabled, no notifications will be sent.
          </p>
        </div>
      </div>

      {/* Notification Configuration */}
      <div className={`${styles.settingsGroup} ${isDisabled ? styles.disabledGroup : ''}`}>
        <h3>
          <i className="fas fa-sliders-h" /> Notification Configuration
        </h3>

        <div className={styles.fieldsGrid}>
          <div className={styles.field}>
            <label htmlFor="notification_level">Notification Level</label>
            <select
              id="notification_level"
              value={settings.notification_level}
              onChange={(e) => handleChange('notification_level', e.target.value)}
              className={styles.select}
              disabled={isDisabled}
            >
              {NOTIFICATION_LEVELS.map(level => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
            <p className={styles.help}>
              Only notifications at or above this level will be sent
            </p>
          </div>
        </div>

        <div className={styles.field} style={{ marginTop: '1rem' }}>
          <label htmlFor="apprise_urls">Apprise URLs</label>
          <textarea
            id="apprise_urls"
            value={urlsText}
            onChange={(e) => handleUrlsChange(e.target.value)}
            className={styles.textarea}
            rows={5}
            placeholder="Enter one Apprise URL per line..."
            disabled={isDisabled}
          />
          <p className={styles.help}>
            Enter notification service URLs, one per line. Supports Discord, Telegram, Slack, email, and 150+ other services.
            <br />
            Examples: <code>discord://webhook_id/token</code>, <code>tgram://bottoken/chatid</code>
          </p>
        </div>
      </div>

      {/* Notification Events */}
      <div className={`${styles.settingsGroup} ${isDisabled ? styles.disabledGroup : ''}`}>
        <h3>
          <i className="fas fa-calendar-check" /> Notification Events
        </h3>
        <p className={styles.groupDescription}>
          Choose which events trigger notifications.
        </p>
        <div className={styles.checkboxGrid}>
          <div className={styles.field}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.notify_on_missing}
                onChange={(e) => handleChange('notify_on_missing', e.target.checked)}
                className={styles.checkbox}
                disabled={isDisabled}
              />
              <span className={styles.checkboxText}>Notify on Missing Media</span>
            </label>
            <p className={styles.help}>Send notification when missing media is found and added</p>
          </div>
          <div className={styles.field}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.notify_on_upgrade}
                onChange={(e) => handleChange('notify_on_upgrade', e.target.checked)}
                className={styles.checkbox}
                disabled={isDisabled}
              />
              <span className={styles.checkboxText}>Notify on Upgrades</span>
            </label>
            <p className={styles.help}>Send notification when quality upgrades are found</p>
          </div>
        </div>
      </div>

      {/* Notification Format */}
      <div className={`${styles.settingsGroup} ${isDisabled ? styles.disabledGroup : ''}`}>
        <h3>
          <i className="fas fa-align-left" /> Notification Format
        </h3>
        <p className={styles.groupDescription}>
          Customize what information is included in notifications.
        </p>
        <div className={styles.checkboxGrid}>
          <div className={styles.field}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.notification_include_app}
                onChange={(e) => handleChange('notification_include_app', e.target.checked)}
                className={styles.checkbox}
                disabled={isDisabled}
              />
              <span className={styles.checkboxText}>Include App Name</span>
            </label>
            <p className={styles.help}>Include the app name (Sonarr, Radarr, etc.) in notifications</p>
          </div>
          <div className={styles.field}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.notification_include_instance}
                onChange={(e) => handleChange('notification_include_instance', e.target.checked)}
                className={styles.checkbox}
                disabled={isDisabled}
              />
              <span className={styles.checkboxText}>Include Instance Name</span>
            </label>
            <p className={styles.help}>Include the instance name in notifications</p>
          </div>
        </div>
      </div>

      {/* Test Notification */}
      <div className={`${styles.settingsGroup} ${isDisabled ? styles.disabledGroup : ''}`}>
        <h3>
          <i className="fas fa-paper-plane" /> Test Notification
        </h3>
        <p className={styles.groupDescription}>
          Send a test notification to verify your configuration is working.
        </p>
        <div className={styles.backupActions}>
          <button
            className={styles.btnPrimary}
            onClick={testNotification}
            disabled={isDisabled || testing || settings.apprise_urls.length === 0}
          >
            {testing ? (
              <>
                <i className="fas fa-spinner fa-spin" /> Sending...
              </>
            ) : (
              <>
                <i className="fas fa-paper-plane" /> Send Test Notification
              </>
            )}
          </button>
          {testResult && (
            <span className={testResult.type === 'success' ? styles.saveSuccess : styles.saveError}>
              <i className={testResult.type === 'success' ? 'fas fa-check' : 'fas fa-times'} />
              {testResult.message}
            </span>
          )}
          {settings.apprise_urls.length === 0 && !isDisabled && (
            <span className={styles.helpInline}>
              <i className="fas fa-info-circle" /> Add at least one Apprise URL to test
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default NotificationsSettings
