import { useState, useEffect } from 'react'
import api from '../../api/client'
import SettingsField from '../../components/SettingsField/SettingsField'
import { TIMEZONES } from '../../config/timezones'
import styles from './Settings.module.css'

// Auth mode options
const AUTH_MODES = [
  { value: 'login', label: 'Require Login' },
  { value: 'local_bypass', label: 'Bypass for Local Network' },
  { value: 'no_login', label: 'No Login Required (Proxy Auth)' }
]

// Field definitions for General Settings - System section
const SYSTEM_FIELDS = [
  {
    name: 'check_for_updates',
    label: 'Check for Updates',
    type: 'checkbox',
    help: 'Automatically check for Huntarr updates'
  },
  {
    name: 'low_usage_mode',
    label: 'Low Usage Mode',
    type: 'checkbox',
    help: 'Disables animations to reduce CPU/GPU usage on older devices'
  },
  {
    name: 'timezone',
    label: 'Timezone',
    type: 'select',
    options: TIMEZONES,
    help: 'Set your timezone for accurate time display'
  }
]

// Display Settings
const DISPLAY_FIELDS = [
  {
    name: 'display_community_resources',
    label: 'Show Community Resources',
    type: 'checkbox',
    help: 'Display the Resources section on the home page'
  },
  {
    name: 'display_huntarr_support',
    label: 'Show Huntarr Support',
    type: 'checkbox',
    help: 'Display support section for GitHub stars and donations'
  }
]

// Security Settings
const SECURITY_FIELDS = [
  {
    name: 'ssl_verify',
    label: 'Verify SSL Certificates',
    type: 'checkbox',
    help: 'Verify SSL certificates when connecting to *arr apps. Disable for self-signed certificates.'
  },
  {
    name: 'auth_mode',
    label: 'Authentication Mode',
    type: 'select',
    options: AUTH_MODES,
    help: 'How users authenticate to Huntarr'
  }
]

// Advanced Settings
const ADVANCED_FIELDS = [
  {
    name: 'api_timeout',
    label: 'API Timeout (seconds)',
    type: 'number',
    min: 10,
    help: 'Timeout for API requests to *arr applications'
  },
  {
    name: 'command_wait_delay',
    label: 'Command Wait Delay (seconds)',
    type: 'number',
    min: 1,
    help: 'Delay between command status checks'
  },
  {
    name: 'command_wait_attempts',
    label: 'Command Wait Attempts',
    type: 'number',
    min: 1,
    help: 'Maximum attempts to check command completion status'
  },
  {
    name: 'minimum_download_queue_size',
    label: 'Min Download Queue Size',
    type: 'number',
    min: -1,
    help: 'Skip processing if download queue exceeds this size (-1 to disable)'
  },
  {
    name: 'log_refresh_interval_seconds',
    label: 'Log Refresh Interval (seconds)',
    type: 'number',
    min: 5,
    help: 'How often the logs page refreshes'
  },
  {
    name: 'base_url',
    label: 'Base URL',
    type: 'text',
    placeholder: '/huntarr',
    help: 'Base URL path for reverse proxy setups (e.g., "/huntarr")'
  }
]

function GeneralSettings() {
  const [settings, setSettings] = useState({})
  const [originalSettings, setOriginalSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null) // 'success' | 'error' | null
  const [error, setError] = useState(null)

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await api.get('/api/settings')
        const generalSettings = data.general || {}
        setSettings(generalSettings)
        setOriginalSettings(generalSettings)
        setLoading(false)
      } catch (err) {
        console.error('Failed to load settings:', err)
        setError('Failed to load settings')
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  // Check if settings have changed
  const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings)

  // Handle field changes
  const handleChange = (name, value) => {
    setSettings(prev => ({ ...prev, [name]: value }))
    setSaveStatus(null) // Clear save status on change
  }

  // Save handler
  const handleSave = async () => {
    setSaving(true)
    setSaveStatus(null)
    try {
      await api.post('/api/settings/general', settings)
      setOriginalSettings(settings)
      setSaveStatus('success')
      // Clear success message after 3 seconds
      setTimeout(() => setSaveStatus(null), 3000)
    } catch (err) {
      console.error('Failed to save settings:', err)
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.section}>
        <div className={styles.loading}>
          <i className="fas fa-spinner fa-spin" />
          <span>Loading settings...</span>
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
        <h2>General Settings</h2>
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
            onClick={handleSave}
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

      {/* System Settings */}
      <div className={styles.settingsGroup}>
        <h3>
          <i className="fas fa-cog" /> System Settings
        </h3>
        <div className={styles.fieldsGrid}>
          {SYSTEM_FIELDS.map(field => (
            <SettingsField
              key={field.name}
              field={field}
              value={settings[field.name]}
              onChange={handleChange}
              instanceData={settings}
            />
          ))}
        </div>
      </div>

      {/* Display Settings */}
      <div className={styles.settingsGroup}>
        <h3>
          <i className="fas fa-desktop" /> Display Settings
        </h3>
        <div className={styles.fieldsGrid}>
          {DISPLAY_FIELDS.map(field => (
            <SettingsField
              key={field.name}
              field={field}
              value={settings[field.name]}
              onChange={handleChange}
              instanceData={settings}
            />
          ))}
        </div>
      </div>

      {/* Security Settings */}
      <div className={styles.settingsGroup}>
        <h3>
          <i className="fas fa-shield-alt" /> Security Settings
        </h3>
        <div className={styles.fieldsGrid}>
          {SECURITY_FIELDS.map(field => (
            <SettingsField
              key={field.name}
              field={field}
              value={settings[field.name]}
              onChange={handleChange}
              instanceData={settings}
            />
          ))}
        </div>
      </div>

      {/* Advanced Settings */}
      <div className={styles.settingsGroup}>
        <h3>
          <i className="fas fa-sliders-h" /> Advanced Settings
        </h3>
        <div className={styles.fieldsGrid}>
          {ADVANCED_FIELDS.map(field => (
            <SettingsField
              key={field.name}
              field={field}
              value={settings[field.name]}
              onChange={handleChange}
              instanceData={settings}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default GeneralSettings
