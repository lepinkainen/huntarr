import { useState, useEffect, useRef, useCallback } from 'react'
import { useLogStream } from '../../hooks/useSSE'
import styles from './Logs.module.css'

const APP_FILTERS = [
  { value: 'all', label: 'All Apps' },
  { value: 'sonarr', label: 'Sonarr' },
  { value: 'radarr', label: 'Radarr' },
  { value: 'lidarr', label: 'Lidarr' },
  { value: 'readarr', label: 'Readarr' },
  { value: 'whisparr', label: 'Whisparr' },
  { value: 'eros', label: 'Eros' }
]

const LEVEL_COLORS = {
  DEBUG: 'var(--text-muted)',
  INFO: 'var(--accent-color)',
  WARNING: 'var(--warning-color)',
  ERROR: 'var(--danger-color)',
  CRITICAL: 'var(--danger-color)'
}

function Logs() {
  const [filter, setFilter] = useState('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const [search, setSearch] = useState('')
  const logsEndRef = useRef(null)

  const { logs, connected, clearLogs, connect } = useLogStream(
    filter === 'all' ? null : filter
  )

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  // Filter logs by search term
  const filteredLogs = search
    ? logs.filter(log =>
        log.message?.toLowerCase().includes(search.toLowerCase()) ||
        log.app?.toLowerCase().includes(search.toLowerCase())
      )
    : logs

  // Handle filter change - reconnect with new filter
  const handleFilterChange = useCallback((e) => {
    setFilter(e.target.value)
  }, [])

  return (
    <div className={styles.logs}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.headerLeft}>
            <h3>
              <i className="fas fa-file-alt" /> Real-time Logs
            </h3>
            <span className={`${styles.status} ${connected ? styles.connected : styles.disconnected}`}>
              <i className={`fas fa-circle`} />
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
              value={filter}
              onChange={handleFilterChange}
              className={styles.filterSelect}
            >
              {APP_FILTERS.map(({ value, label }) => (
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
          {filteredLogs.length === 0 ? (
            <div className={styles.emptyState}>
              <i className="fas fa-inbox" />
              <p>No logs yet. Waiting for activity...</p>
            </div>
          ) : (
            <div className={styles.logsList}>
              {filteredLogs.map((log, index) => (
                <div key={index} className={styles.logEntry}>
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
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Logs
