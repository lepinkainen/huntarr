import { useState, useEffect } from 'react'
import api from '../../api/client'
import styles from './Settings.module.css'

// Utility functions
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatDate(isoString) {
  if (!isoString) return 'Unknown'
  return new Date(isoString).toLocaleString()
}

function BackupSettings() {
  // Settings state
  const [settings, setSettings] = useState({ frequency: 3, retention: 3 })
  const [originalSettings, setOriginalSettings] = useState({ frequency: 3, retention: 3 })
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsStatus, setSettingsStatus] = useState(null)

  // Backups state
  const [backups, setBackups] = useState([])
  const [nextBackup, setNextBackup] = useState(null)
  const [loading, setLoading] = useState(true)

  // Action states
  const [creating, setCreating] = useState(false)
  const [createStatus, setCreateStatus] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Form states
  const [selectedBackup, setSelectedBackup] = useState('')
  const [restoreConfirm, setRestoreConfirm] = useState('')
  const [deleteDbConfirm, setDeleteDbConfirm] = useState('')

  // Load data on mount
  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([loadSettings(), loadBackups(), loadNextScheduled()])
    setLoading(false)
  }

  const loadSettings = async () => {
    try {
      const data = await api.get('/api/backup/settings')
      if (data.success && data.settings) {
        setSettings(data.settings)
        setOriginalSettings(data.settings)
      }
    } catch (err) {
      console.error('Failed to load backup settings:', err)
    }
  }

  const loadBackups = async () => {
    try {
      const data = await api.get('/api/backup/list')
      if (data.success) {
        setBackups(data.backups || [])
      }
    } catch (err) {
      console.error('Failed to load backups:', err)
      setBackups([])
    }
  }

  const loadNextScheduled = async () => {
    try {
      const data = await api.get('/api/backup/next-scheduled')
      if (data.success) {
        setNextBackup(data.next_backup)
      }
    } catch (err) {
      console.error('Failed to load next scheduled backup:', err)
    }
  }

  // Settings handlers
  const hasSettingsChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings)

  const handleSettingsChange = (field, value) => {
    const numValue = parseInt(value, 10)
    if (isNaN(numValue)) return

    // Validate ranges
    if (field === 'frequency' && (numValue < 1 || numValue > 30)) return
    if (field === 'retention' && (numValue < 1 || numValue > 10)) return

    setSettings(prev => ({ ...prev, [field]: numValue }))
    setSettingsStatus(null)
  }

  const saveSettings = async () => {
    setSettingsSaving(true)
    setSettingsStatus(null)
    try {
      await api.post('/api/backup/settings', settings)
      setOriginalSettings(settings)
      setSettingsStatus('success')
      loadNextScheduled() // Refresh next backup time
      setTimeout(() => setSettingsStatus(null), 3000)
    } catch (err) {
      console.error('Failed to save backup settings:', err)
      setSettingsStatus('error')
    } finally {
      setSettingsSaving(false)
    }
  }

  // Backup actions
  const createBackup = async () => {
    setCreating(true)
    setCreateStatus(null)
    try {
      const result = await api.post('/api/backup/create', { type: 'manual' })
      if (result.success) {
        setCreateStatus({
          type: 'success',
          message: `Backup created: ${result.backup_name} (${formatBytes(result.backup_size)})`
        })
        loadBackups()
        loadNextScheduled()
      } else {
        setCreateStatus({ type: 'error', message: 'Failed to create backup' })
      }
    } catch (err) {
      console.error('Failed to create backup:', err)
      setCreateStatus({ type: 'error', message: 'Failed to create backup' })
    } finally {
      setCreating(false)
      setTimeout(() => setCreateStatus(null), 5000)
    }
  }

  const deleteBackup = async (backupId) => {
    if (!window.confirm('Are you sure you want to delete this backup? This action cannot be undone.')) {
      return
    }
    try {
      await api.post('/api/backup/delete', { backup_id: backupId })
      loadBackups()
    } catch (err) {
      console.error('Failed to delete backup:', err)
      alert('Failed to delete backup')
    }
  }

  const restoreBackup = async () => {
    if (restoreConfirm.toUpperCase() !== 'RESTORE') return
    if (!window.confirm('This will permanently overwrite your current database with the selected backup. All current data will be lost. Are you absolutely sure?')) {
      return
    }

    setRestoring(true)
    try {
      await api.post('/api/backup/restore', { backup_id: selectedBackup })
      // Backend triggers page reload after 2 seconds
    } catch (err) {
      console.error('Failed to restore backup:', err)
      alert('Failed to restore backup')
      setRestoring(false)
    }
  }

  const deleteDatabase = async () => {
    if (deleteDbConfirm.toLowerCase() !== 'huntarr') return
    if (!window.confirm('This will PERMANENTLY DELETE your entire Huntarr database. This action CANNOT be undone. Are you absolutely sure?')) {
      return
    }

    setDeleting(true)
    try {
      await api.post('/api/backup/delete-database')
      // Backend triggers redirect to setup after 2 seconds
    } catch (err) {
      console.error('Failed to delete database:', err)
      alert('Failed to delete database')
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.section}>
        <div className={styles.loading}>
          <i className="fas fa-spinner fa-spin" />
          <span>Loading backup settings...</span>
        </div>
      </div>
    )
  }

  const canRestore = selectedBackup && restoreConfirm.toUpperCase() === 'RESTORE'
  const canDeleteDb = deleteDbConfirm.toLowerCase() === 'huntarr'

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>Backup & Restore</h2>
      </div>

      {/* Automatic Backup Settings */}
      <div className={styles.settingsGroup}>
        <h3>
          <i className="fas fa-clock" /> Automatic Backup Settings
        </h3>
        <div className={styles.fieldsGrid}>
          <div className={styles.field}>
            <label htmlFor="frequency">Backup Frequency (days)</label>
            <input
              type="number"
              id="frequency"
              min="1"
              max="30"
              value={settings.frequency}
              onChange={(e) => handleSettingsChange('frequency', e.target.value)}
              className={styles.numberInput}
            />
            <p className={styles.help}>How often Huntarr should automatically create database backups (1-30 days)</p>
          </div>
          <div className={styles.field}>
            <label htmlFor="retention">Backup Retention Count</label>
            <input
              type="number"
              id="retention"
              min="1"
              max="10"
              value={settings.retention}
              onChange={(e) => handleSettingsChange('retention', e.target.value)}
              className={styles.numberInput}
            />
            <p className={styles.help}>Number of backup copies to keep. Older backups are automatically deleted (1-10)</p>
          </div>
          <div className={styles.field}>
            <label>Next Scheduled Backup</label>
            <div className={styles.readOnlyValue}>
              <i className="fas fa-calendar-alt" /> {nextBackup ? formatDate(nextBackup) : 'Not scheduled'}
            </div>
          </div>
        </div>
        <div className={styles.settingsActions}>
          {settingsStatus === 'success' && (
            <span className={styles.saveSuccess}>
              <i className="fas fa-check" /> Saved
            </span>
          )}
          {settingsStatus === 'error' && (
            <span className={styles.saveError}>
              <i className="fas fa-times" /> Failed to save
            </span>
          )}
          <button
            className={styles.btnSave}
            onClick={saveSettings}
            disabled={!hasSettingsChanges || settingsSaving}
          >
            {settingsSaving ? (
              <>
                <i className="fas fa-spinner fa-spin" /> Saving...
              </>
            ) : (
              <>
                <i className="fas fa-save" /> Save Settings
              </>
            )}
          </button>
        </div>
      </div>

      {/* Manual Backup */}
      <div className={styles.settingsGroup}>
        <h3>
          <i className="fas fa-download" /> Manual Backup
        </h3>
        <p className={styles.groupDescription}>
          Create a backup of your Huntarr database immediately.
        </p>
        <div className={styles.backupActions}>
          <button
            className={styles.btnPrimary}
            onClick={createBackup}
            disabled={creating}
          >
            {creating ? (
              <>
                <i className="fas fa-spinner fa-spin" /> Creating Backup...
              </>
            ) : (
              <>
                <i className="fas fa-save" /> Create Manual Backup
              </>
            )}
          </button>
          {createStatus && (
            <span className={createStatus.type === 'success' ? styles.saveSuccess : styles.saveError}>
              <i className={createStatus.type === 'success' ? 'fas fa-check' : 'fas fa-times'} />
              {createStatus.message}
            </span>
          )}
        </div>
      </div>

      {/* Available Backups */}
      <div className={styles.settingsGroup}>
        <h3>
          <i className="fas fa-archive" /> Available Backups
        </h3>
        {backups.length === 0 ? (
          <div className={styles.emptyState}>
            <i className="fas fa-inbox" />
            <p>No backups available</p>
          </div>
        ) : (
          <div className={styles.backupsList}>
            {backups.map((backup) => (
              <div key={backup.id} className={styles.backupItem}>
                <div className={styles.backupInfo}>
                  <div className={styles.backupName}>{backup.name}</div>
                  <div className={styles.backupMeta}>
                    <span><i className="fas fa-calendar" /> {formatDate(backup.timestamp)}</span>
                    <span><i className="fas fa-hdd" /> {formatBytes(backup.size)}</span>
                    <span className={styles.backupType}>{backup.type}</span>
                  </div>
                </div>
                <button
                  className={styles.btnDelete}
                  onClick={() => deleteBackup(backup.id)}
                  title="Delete backup"
                >
                  <i className="fas fa-trash" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Restore Database */}
      <div className={styles.settingsGroup}>
        <h3>
          <i className="fas fa-upload" /> Restore Database
        </h3>
        <div className={styles.warningBox}>
          <i className="fas fa-exclamation-triangle" />
          <p>This action will permanently overwrite your current database with the selected backup. All current data will be lost.</p>
        </div>
        <div className={styles.restoreForm}>
          <div className={styles.field}>
            <label htmlFor="backupSelect">Select Backup</label>
            <select
              id="backupSelect"
              value={selectedBackup}
              onChange={(e) => setSelectedBackup(e.target.value)}
              className={styles.select}
            >
              <option value="">-- Select a backup --</option>
              {backups.map((backup) => (
                <option key={backup.id} value={backup.id}>
                  {backup.name} - {formatDate(backup.timestamp)} ({formatBytes(backup.size)})
                </option>
              ))}
            </select>
          </div>
          {selectedBackup && (
            <div className={styles.field}>
              <label htmlFor="restoreConfirm">Type "RESTORE" to confirm</label>
              <input
                type="text"
                id="restoreConfirm"
                value={restoreConfirm}
                onChange={(e) => setRestoreConfirm(e.target.value)}
                className={styles.confirmInput}
                placeholder="RESTORE"
              />
            </div>
          )}
          <button
            className={styles.btnDanger}
            onClick={restoreBackup}
            disabled={!canRestore || restoring}
          >
            {restoring ? (
              <>
                <i className="fas fa-spinner fa-spin" /> Restoring...
              </>
            ) : (
              <>
                <i className="fas fa-upload" /> Restore Database
              </>
            )}
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className={`${styles.settingsGroup} ${styles.dangerZone}`}>
        <h3>
          <i className="fas fa-skull" /> Danger Zone
        </h3>
        <p className={styles.dangerDescription}>
          This will permanently delete your current database. Use this for testing or complete reset purposes only.
        </p>
        <div className={styles.dangerForm}>
          <div className={styles.field}>
            <label htmlFor="deleteConfirm">Type "huntarr" to enable deletion</label>
            <input
              type="text"
              id="deleteConfirm"
              value={deleteDbConfirm}
              onChange={(e) => setDeleteDbConfirm(e.target.value)}
              className={styles.confirmInput}
              placeholder="huntarr"
            />
          </div>
          {canDeleteDb && (
            <div className={styles.finalWarning}>
              <i className="fas fa-exclamation-circle" />
              <p>FINAL WARNING: This action cannot be undone. Your entire Huntarr database will be permanently deleted.</p>
            </div>
          )}
          <button
            className={styles.btnDanger}
            onClick={deleteDatabase}
            disabled={!canDeleteDb || deleting}
          >
            {deleting ? (
              <>
                <i className="fas fa-spinner fa-spin" /> Deleting...
              </>
            ) : (
              <>
                <i className="fas fa-trash" /> Delete Database
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default BackupSettings
