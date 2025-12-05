import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useLogStream } from '../../hooks/useSSE'
import styles from './Logs.module.css'

const APP_FILTERS = [
  { value: 'all', label: 'All Apps' },
  { value: 'system', label: 'System' },
  { value: 'sonarr', label: 'Sonarr' },
  { value: 'radarr', label: 'Radarr' },
  { value: 'lidarr', label: 'Lidarr' },
  { value: 'readarr', label: 'Readarr' },
  { value: 'whisparr', label: 'Whisparr' },
  { value: 'eros', label: 'Eros' }
]

const LEVEL_FILTERS = [
  { value: 'DEBUG', label: 'Debug' },
  { value: 'INFO', label: 'Info' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'ERROR', label: 'Error' }
]

// Log level priority - show this level and above
const LEVEL_PRIORITY = { DEBUG: 0, INFO: 1, WARNING: 2, ERROR: 3, CRITICAL: 4 }

const LEVEL_COLORS = {
  DEBUG: 'var(--text-muted)',
  INFO: 'var(--accent-color)',
  WARNING: 'var(--warning-color)',
  ERROR: 'var(--danger-color)',
  CRITICAL: 'var(--danger-color)'
}

function Logs() {
  const [appFilter, setAppFilter] = useState('all')
  const [levelFilter, setLevelFilter] = useState('INFO') // Default to INFO like legacy
  const [autoScroll, setAutoScroll] = useState(true)
  const [search, setSearch] = useState('')
  const logsTopRef = useRef(null)

  const { logs, connected, loading, clearLogs, connect } = useLogStream(appFilter)

  // Auto-scroll to TOP when new logs arrive (newest logs are first)
  useEffect(() => {
    if (autoScroll && logsTopRef.current) {
      logsTopRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  // Filter logs by level and search term
  const filteredLogs = useMemo(() => {
    const minPriority = LEVEL_PRIORITY[levelFilter] || 0

    return logs.filter(log => {
      // Level filter - show this level and above
      const logPriority = LEVEL_PRIORITY[log.level] ?? 1
      if (logPriority < minPriority) return false

      // Search filter
      if (search) {
        const searchLower = search.toLowerCase()
        const matchesMessage = log.message?.toLowerCase().includes(searchLower)
        const matchesApp = log.app?.toLowerCase().includes(searchLower)
        if (!matchesMessage && !matchesApp) return false
      }

      return true
    })
  }, [logs, levelFilter, search])

  return (
    <div className={styles.logs}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.headerLeft}>
            <h3>
              <i className="fas fa-file-alt" /> Real-time Logs
            </h3>
            <span className={`${styles.status} ${connected ? styles.connected : styles.disconnected}`}>
              <i className="fas fa-circle" />
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <div className={styles.controls}>
            <div className={styles.searchBox}>
              <i className="fas fa-search" />
              <input
                type="text"
                placeholder="Search logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select
              value={appFilter}
              onChange={(e) => setAppFilter(e.target.value)}
              className={styles.filterSelect}
            >
              {APP_FILTERS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className={styles.filterSelect}
            >
              {LEVEL_FILTERS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <label className={styles.autoScrollToggle}>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              <span>Auto-scroll</span>
            </label>

            <button
              className={styles.clearBtn}
              onClick={clearLogs}
            >
              <i className="fas fa-trash" /> Clear
            </button>

            {!connected && (
              <button
                className={styles.reconnectBtn}
                onClick={connect}
              >
                <i className="fas fa-plug" /> Reconnect
              </button>
            )}
          </div>
        </div>

        <div className={styles.logsContainer}>
          {loading ? (
            <div className={styles.emptyState}>
              <i className="fas fa-spinner fa-spin" />
              <p>Loading logs...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className={styles.emptyState}>
              <i className="fas fa-inbox" />
              <p>No logs match the current filters.</p>
            </div>
          ) : (
            <div className={styles.logsList}>
              <div ref={logsTopRef} />
              {filteredLogs.map((log, index) => (
                <div key={log.id ?? index} className={styles.logEntry}>
                  <span className={styles.timestamp}>
                    {log.timestamp || new Date().toLocaleTimeString()}
                  </span>
                  {log.app && (
                    <span className={`${styles.appBadge} ${styles[log.app]}`}>
                      {log.app}
                    </span>
                  )}
                  <span
                    className={styles.level}
                    style={{ color: LEVEL_COLORS[log.level] || 'inherit' }}
                  >
                    {log.level || 'INFO'}
                  </span>
                  <span className={styles.message}>{log.message || log.raw}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Logs
