import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { fetchWithTimeout } from '../../api/client'
import SettingsField from '../../components/SettingsField'
import {
  getInstanceFields,
  getGlobalFields,
  getCustomTagsFields,
  getAdvancedFields,
  getInstanceDefaults
} from '../../config/appSettings'
import styles from './Apps.module.css'

// App page component - handles all app types with same UI pattern
function AppSection({ appName }) {
  const appTitle = appName.charAt(0).toUpperCase() + appName.slice(1)

  // State
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState({ total_configured: 0, connected_count: 0 })
  const [settings, setSettings] = useState({ instances: [] })
  const [testResults, setTestResults] = useState({})
  const [actionStatus, setActionStatus] = useState(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [stateInfo, setStateInfo] = useState({})

  // Get field definitions for this app
  const instanceFields = getInstanceFields(appName)
  const globalFields = getGlobalFields(appName)
  const customTagsFields = getCustomTagsFields(appName)
  const advancedFields = getAdvancedFields()

  // Load app status and settings
  const loadData = useCallback(async () => {
    try {
      const [statusRes, settingsRes] = await Promise.all([
        fetchWithTimeout(`/api/status/${appName}`),
        fetchWithTimeout(`/api/settings/${appName}`)
      ])

      if (statusRes.ok) {
        const statusData = await statusRes.json()
        setStatus(statusData)
      }

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json()
        // Normalize instances array
        const instances = settingsData.instances || []
        // Flatten custom_tags object for form fields
        const flatSettings = {
          ...settingsData,
          instances,
          custom_tag_missing: settingsData.custom_tags?.missing || 'huntarr-missing',
          custom_tag_upgrade: settingsData.custom_tags?.upgrade || 'huntarr-upgrade',
          custom_tag_shows_missing: settingsData.custom_tags?.shows_missing || 'huntarr-shows-missing'
        }
        setSettings(flatSettings)
      }
    } catch (error) {
      console.error(`Failed to load ${appName} data:`, error)
    } finally {
      setLoading(false)
    }
  }, [appName])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Fetch state info for all instances
  const loadStateInfo = useCallback(async () => {
    const info = {}
    for (const instance of settings.instances) {
      if (instance.state_management_mode !== 'disabled' && instance.name) {
        try {
          const res = await fetchWithTimeout(
            `/api/stateful/summary?app_type=${appName}&instance_name=${encodeURIComponent(instance.name)}`
          )
          if (res.ok) {
            const data = await res.json()
            info[instance.name] = data
          }
        } catch (error) {
          console.debug(`Failed to load state info for ${instance.name}:`, error)
        }
      }
    }
    setStateInfo(info)
  }, [appName, settings.instances])

  // Load state info when instances change
  useEffect(() => {
    if (settings.instances.length > 0) {
      loadStateInfo()
    }
  }, [settings.instances, loadStateInfo])

  // Test connection for an instance
  const testConnection = useCallback(async (index) => {
    const instance = settings.instances[index]
    if (!instance) return

    setTestResults(prev => ({ ...prev, [index]: { testing: true } }))

    try {
      const res = await fetchWithTimeout(`/api/${appName}/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_url: instance.api_url,
          api_key: instance.api_key
        })
      })

      const data = await res.json()
      setTestResults(prev => ({
        ...prev,
        [index]: { success: data.success, message: data.message }
      }))
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [index]: { success: false, message: error.message }
      }))
    }
  }, [appName, settings.instances])

  // Update instance field
  const updateInstance = useCallback((index, field, value) => {
    setSettings(prev => {
      const instances = [...prev.instances]
      instances[index] = { ...instances[index], [field]: value }
      return { ...prev, instances }
    })
  }, [])

  // Update global setting
  const updateGlobal = useCallback((field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }))
  }, [])

  // Add new instance
  const addInstance = useCallback(() => {
    if (settings.instances.length >= 9) return

    const defaults = getInstanceDefaults(appName)
    setSettings(prev => ({
      ...prev,
      instances: [
        ...prev.instances,
        { ...defaults, name: `Instance ${prev.instances.length + 1}`, api_url: '', api_key: '' }
      ]
    }))
  }, [appName, settings.instances.length])

  // Remove instance
  const removeInstance = useCallback((index) => {
    if (settings.instances.length <= 1) return

    setSettings(prev => ({
      ...prev,
      instances: prev.instances.filter((_, i) => i !== index)
    }))
    setTestResults(prev => {
      const newResults = { ...prev }
      delete newResults[index]
      return newResults
    })
  }, [settings.instances.length])

  // Save settings
  const saveSettings = useCallback(async () => {
    setActionStatus({ type: 'saving', message: 'Saving...' })

    try {
      // Unflatten custom_tags back to nested object for API
      const { custom_tag_missing, custom_tag_upgrade, custom_tag_shows_missing, ...rest } = settings
      const customTags = {
        missing: custom_tag_missing || 'huntarr-missing',
        upgrade: custom_tag_upgrade || 'huntarr-upgrade'
      }
      // Only include shows_missing for Sonarr
      if (appName === 'sonarr') {
        customTags.shows_missing = custom_tag_shows_missing || 'huntarr-shows-missing'
      }
      const payload = {
        ...rest,
        custom_tags: customTags
      }

      const res = await fetchWithTimeout(`/api/settings/${appName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        setActionStatus({ type: 'success', message: 'Settings saved!' })
        loadData() // Refresh status
      } else {
        const data = await res.json()
        setActionStatus({ type: 'error', message: data.error || 'Failed to save' })
      }
    } catch (error) {
      setActionStatus({ type: 'error', message: error.message })
    }

    setTimeout(() => setActionStatus(null), 3000)
  }, [appName, settings, loadData])

  // Trigger manual search
  const triggerSearch = useCallback(async (type) => {
    const label = type === 'missing' ? 'Missing Search' : 'Upgrade Search'
    setActionStatus({ type: 'running', message: `Running ${label}...` })

    try {
      const res = await fetchWithTimeout(`/api/${appName}/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await res.json()
      if (res.ok) {
        const count = type === 'missing' ? data.hunted : data.upgraded
        setActionStatus({ type: 'success', message: `${label}: ${count || 0} items processed` })
      } else {
        setActionStatus({ type: 'error', message: data.error || `${label} failed` })
      }
    } catch (error) {
      setActionStatus({ type: 'error', message: error.message })
    }

    setTimeout(() => setActionStatus(null), 5000)
  }, [appName])

  // Reset cycle
  const resetCycle = useCallback(async () => {
    setActionStatus({ type: 'running', message: 'Resetting cycle...' })

    try {
      const res = await fetchWithTimeout(`/api/cycle/reset/${appName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await res.json()
      if (data.success) {
        setActionStatus({ type: 'success', message: 'Cycle reset!' })
      } else {
        setActionStatus({ type: 'error', message: data.error || 'Reset failed' })
      }
    } catch (error) {
      setActionStatus({ type: 'error', message: error.message })
    }

    setTimeout(() => setActionStatus(null), 3000)
  }, [appName])

  if (loading) {
    return (
      <div className={styles.appSection}>
        <div className={styles.card}>
          <div className={styles.cardBody}>
            <div className={styles.loading}>
              <i className="fas fa-spinner fa-spin" />
              <p>Loading {appTitle}...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const isConfigured = status.total_configured > 0
  const isConnected = status.connected_count > 0

  // Separate connection fields from settings fields for instances
  const _connectionFields = instanceFields.filter(f =>
    ['name', 'api_url', 'api_key', 'external_url', 'enabled'].includes(f.name)
  )
  const instanceSettingsFields = instanceFields.filter(f =>
    !['name', 'api_url', 'api_key', 'external_url', 'enabled'].includes(f.name)
  )

  return (
    <div className={styles.appSection}>
      {/* Header Card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.headerLeft}>
            <img
              src={`/static/images/app-icons/${appName}.png`}
              alt={appTitle}
              className={styles.appIcon}
            />
            <h2>{appTitle}</h2>
            <span className={`${styles.statusBadge} ${isConnected ? styles.connected : isConfigured ? styles.disconnected : styles.notConfigured}`}>
              {isConnected
                ? `Connected ${status.connected_count}/${status.total_configured}`
                : isConfigured
                  ? 'Disconnected'
                  : 'Not Configured'}
            </span>
          </div>

          <div className={styles.headerActions}>
            {actionStatus && (
              <span className={`${styles.actionStatus} ${styles[actionStatus.type]}`}>
                {actionStatus.type === 'running' || actionStatus.type === 'saving' ? (
                  <i className="fas fa-spinner fa-spin" />
                ) : actionStatus.type === 'success' ? (
                  <i className="fas fa-check" />
                ) : (
                  <i className="fas fa-exclamation-circle" />
                )}
                {actionStatus.message}
              </span>
            )}
            <button className={styles.btnPrimary} onClick={saveSettings}>
              <i className="fas fa-save" /> Save
            </button>
          </div>
        </div>
      </div>

      {/* Quick Actions Card */}
      {isConfigured && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3><i className="fas fa-bolt" /> Quick Actions</h3>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.actionsGrid}>
              <button
                className={styles.actionBtn}
                onClick={() => triggerSearch('missing')}
                disabled={!isConnected}
              >
                <i className="fas fa-search" />
                <span>Search Missing</span>
              </button>
              <button
                className={styles.actionBtn}
                onClick={() => triggerSearch('upgrade')}
                disabled={!isConnected}
              >
                <i className="fas fa-arrow-up" />
                <span>Search Upgrades</span>
              </button>
              <button
                className={`${styles.actionBtn} ${styles.secondary}`}
                onClick={resetCycle}
              >
                <i className="fas fa-sync-alt" />
                <span>Reset Cycle</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instances Card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3><i className="fas fa-server" /> Instances</h3>
          <button
            className={styles.btnSecondary}
            onClick={addInstance}
            disabled={settings.instances.length >= 9}
          >
            <i className="fas fa-plus" /> Add Instance
          </button>
        </div>
        <div className={styles.cardBody}>
          {settings.instances.length === 0 ? (
            <div className={styles.emptyState}>
              <i className="fas fa-plug" />
              <p>No instances configured. Add one to get started.</p>
            </div>
          ) : (
            <div className={styles.instancesList}>
              {settings.instances.map((instance, index) => (
                <div key={index} className={styles.instanceCard}>
                  {/* Connection Section */}
                  <div className={styles.instanceHeader}>
                    <input
                      type="text"
                      className={styles.instanceName}
                      value={instance.name || `Instance ${index + 1}`}
                      onChange={(e) => updateInstance(index, 'name', e.target.value)}
                      placeholder="Instance name"
                    />
                    <label className={styles.enableToggle}>
                      <input
                        type="checkbox"
                        checked={instance.enabled !== false}
                        onChange={(e) => updateInstance(index, 'enabled', e.target.checked)}
                      />
                      <span>Enabled</span>
                    </label>
                  </div>

                  <div className={styles.instanceFields}>
                    <div className={styles.field}>
                      <label>API URL</label>
                      <input
                        type="text"
                        value={instance.api_url || ''}
                        onChange={(e) => updateInstance(index, 'api_url', e.target.value)}
                        placeholder={`http://${appName}:8989`}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>API Key</label>
                      <input
                        type="password"
                        value={instance.api_key || ''}
                        onChange={(e) => updateInstance(index, 'api_key', e.target.value)}
                        placeholder="Enter API key"
                      />
                    </div>
                    <div className={styles.field}>
                      <label>External URL <span className={styles.optional}>(optional)</span></label>
                      <input
                        type="text"
                        value={instance.external_url || ''}
                        onChange={(e) => updateInstance(index, 'external_url', e.target.value)}
                        placeholder={`https://${appName}.example.com`}
                      />
                      <small className={styles.fieldHelp}>Public URL for browser links. Uses API URL if empty.</small>
                    </div>
                  </div>

                  <div className={styles.instanceActions}>
                    <button
                      className={styles.btnTest}
                      onClick={() => testConnection(index)}
                      disabled={!instance.api_url || !instance.api_key}
                    >
                      {testResults[index]?.testing ? (
                        <><i className="fas fa-spinner fa-spin" /> Testing...</>
                      ) : (
                        <><i className="fas fa-plug" /> Test Connection</>
                      )}
                    </button>

                    {testResults[index] && !testResults[index].testing && (
                      <span className={`${styles.testResult} ${testResults[index].success ? styles.success : styles.error}`}>
                        <i className={testResults[index].success ? 'fas fa-check' : 'fas fa-times'} />
                        {testResults[index].message}
                      </span>
                    )}

                    {settings.instances.length > 1 && (
                      <button
                        className={styles.btnRemove}
                        onClick={() => removeInstance(index)}
                      >
                        <i className="fas fa-trash" />
                      </button>
                    )}
                  </div>

                  {/* Instance Settings Section */}
                  {instanceSettingsFields.length > 0 && (
                    <div className={styles.instanceSettings}>
                      <h4>Instance Settings</h4>
                      <div className={styles.settingsGrid}>
                        {instanceSettingsFields.map((field) => (
                          <SettingsField
                            key={field.name}
                            field={field}
                            value={instance[field.name]}
                            onChange={(name, value) => updateInstance(index, name, value)}
                            instanceData={instance}
                          />
                        ))}
                      </div>

                      {/* State Info (when state management is enabled) */}
                      {instance.state_management_mode !== 'disabled' && stateInfo[instance.name] && (
                        <div className={styles.stateInfo}>
                          <div className={styles.stateStats}>
                            <span className={styles.stateStat}>
                              <i className="fas fa-database" />
                              Tracked: {stateInfo[instance.name].processed_count || 0} items
                            </span>
                            {stateInfo[instance.name].next_reset_time && (
                              <span className={styles.stateStat}>
                                <i className="fas fa-clock" />
                                Next Reset: {stateInfo[instance.name].next_reset_time}
                              </span>
                            )}
                          </div>
                          <button
                            className={styles.btnResetState}
                            onClick={async () => {
                              if (!confirm(`Reset state for ${instance.name}? This will clear all tracked items.`)) return
                              try {
                                const res = await fetchWithTimeout('/api/stateful/reset', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    app_type: appName,
                                    instance_name: instance.name
                                  })
                                })
                                if (res.ok) {
                                  loadStateInfo()
                                  setActionStatus({ type: 'success', message: 'State reset!' })
                                  setTimeout(() => setActionStatus(null), 3000)
                                }
                              } catch (error) {
                                setActionStatus({ type: 'error', message: error.message })
                                setTimeout(() => setActionStatus(null), 3000)
                              }
                            }}
                          >
                            <i className="fas fa-redo" /> Reset State
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Global Settings Card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3><i className="fas fa-cog" /> Global Settings</h3>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.settingsGrid}>
            {globalFields.map((field) => (
              <SettingsField
                key={field.name}
                field={field}
                value={settings[field.name]}
                onChange={(name, value) => updateGlobal(name, value)}
                instanceData={settings}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Custom Tags Card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3><i className="fas fa-tags" /> Custom Tags</h3>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.settingsGrid}>
            {customTagsFields.map((field) => (
              <SettingsField
                key={field.name}
                field={field}
                value={settings[field.name]}
                onChange={(name, value) => updateGlobal(name, value)}
                instanceData={settings}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Advanced Settings Card */}
      <div className={styles.card}>
        <div
          className={styles.cardHeader}
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{ cursor: 'pointer' }}
        >
          <h3>
            <i className={`fas fa-chevron-${showAdvanced ? 'down' : 'right'}`} style={{ marginRight: '0.5rem', width: '12px' }} />
            <i className="fas fa-sliders-h" /> Advanced Settings
          </h3>
        </div>
        {showAdvanced && (
          <div className={styles.cardBody}>
            <div className={styles.settingsGrid}>
              {advancedFields.map((field) => (
                <SettingsField
                  key={field.name}
                  field={field}
                  value={settings[field.name]}
                  onChange={(name, value) => updateGlobal(name, value)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Apps() {
  return (
    <Routes>
      <Route path="sonarr" element={<AppSection appName="sonarr" />} />
      <Route path="radarr" element={<AppSection appName="radarr" />} />
      <Route path="lidarr" element={<AppSection appName="lidarr" />} />
      <Route path="readarr" element={<AppSection appName="readarr" />} />
      <Route path="whisparr" element={<AppSection appName="whisparr" />} />
      <Route path="eros" element={<AppSection appName="eros" />} />
      <Route path="*" element={<Navigate to="sonarr" replace />} />
    </Routes>
  )
}

export default Apps
