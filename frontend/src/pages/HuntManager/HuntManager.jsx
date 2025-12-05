import { useState, useEffect, useCallback } from 'react'
import { fetchWithTimeout } from '../../api/client'
import styles from './HuntManager.module.css'

const APP_TYPES = ['all', 'sonarr', 'radarr', 'lidarr', 'readarr', 'whisparr', 'eros']
const PAGE_SIZES = [10, 20, 30, 50, 100, 250, 1000]

function HuntManager() {
  // State
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentApp, setCurrentApp] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalPages, setTotalPages] = useState(1)
  const [totalEntries, setTotalEntries] = useState(0)
  const [actionStatus, setActionStatus] = useState(null)

  // Load hunt history
  const loadHistory = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString()
      })
      if (searchQuery) {
        params.append('search', searchQuery)
      }

      const res = await fetchWithTimeout(`/api/hunt-manager/${currentApp}?${params}`)
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries || [])
        setTotalPages(data.total_pages || 1)
        setTotalEntries(data.total_entries || 0)
      }
    } catch (error) {
      console.error('Failed to load hunt history:', error)
    } finally {
      setLoading(false)
    }
  }, [currentApp, page, pageSize, searchQuery])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // Handle search
  const handleSearch = () => {
    setSearchQuery(searchInput)
    setPage(1)
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  // Handle app filter change
  const handleAppChange = (e) => {
    setCurrentApp(e.target.value)
    setPage(1)
  }

  // Handle page size change
  const handlePageSizeChange = (e) => {
    setPageSize(parseInt(e.target.value))
    setPage(1)
  }

  // Clear history
  const handleClearHistory = async () => {
    const appName = currentApp === 'all' ? 'all apps' : currentApp
    if (!window.confirm(`Are you sure you want to clear hunt history for ${appName}? This cannot be undone.`)) {
      return
    }

    setActionStatus({ type: 'clearing', message: 'Clearing...' })
    try {
      const res = await fetchWithTimeout(`/api/hunt-manager/${currentApp}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setActionStatus({ type: 'success', message: 'History cleared' })
        loadHistory()
      } else {
        throw new Error('Failed to clear history')
      }
    } catch (error) {
      setActionStatus({ type: 'error', message: error.message })
    }

    setTimeout(() => setActionStatus(null), 3000)
  }

  // Generate slug from title for *arr app URLs
  const generateSlug = (title) => {
    return title
      .toLowerCase()
      .trim()
      .replace(/\s*\((\d{4})\)\s*/g, '-$1')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  // Open item in external app
  const handleItemClick = async (entry) => {
    const supportedApps = ['sonarr', 'radarr', 'lidarr', 'readarr', 'whisparr', 'eros']
    if (!supportedApps.includes(entry.app_type) || !entry.instance_name) return

    try {
      // Fetch instance settings to get URL
      const res = await fetchWithTimeout(`/api/settings/${entry.app_type}`)
      if (!res.ok) return

      const settings = await res.json()
      const instance = settings.instances?.find(inst => inst.name === entry.instance_name)
      if (!instance?.api_url && !instance?.external_url) return

      // Use external_url if set, otherwise fall back to api_url
      const baseUrl = (instance.external_url || instance.api_url).replace(/\/$/, '')
      let targetUrl = baseUrl

      if (entry.media_id && entry.processed_info) {
        // Extract title (remove season/episode/year info for slug generation)
        let title = entry.processed_info
        if (title.includes(' - ')) {
          title = title.split(' - ')[0]
        }

        const slug = generateSlug(title)

        // Generate app-specific URL
        // Note: Radarr/Lidarr use numeric IDs, others use slugs
        switch (entry.app_type) {
          case 'sonarr':
            targetUrl = `${baseUrl}/series/${slug}`
            break
          case 'radarr':
            targetUrl = `${baseUrl}/movie/${entry.media_id}`
            break
          case 'lidarr':
            targetUrl = `${baseUrl}/artist/${entry.media_id}`
            break
          case 'readarr':
            targetUrl = `${baseUrl}/author/${slug}`
            break
          case 'whisparr':
          case 'eros':
            targetUrl = `${baseUrl}/series/${slug}`
            break
          default:
            targetUrl = baseUrl
        }
      }

      window.open(targetUrl, '_blank')
    } catch (error) {
      console.error('Failed to open item:', error)
    }
  }

  // Format operation type
  const formatOperation = (type) => {
    const operationClass = type === 'missing' ? styles.operationMissing : styles.operationUpgrade
    return (
      <span className={`${styles.operationBadge} ${operationClass}`}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    )
  }

  // Format app instance with colored badge
  const formatAppInstance = (appType, instanceName) => {
    const appName = appType.charAt(0).toUpperCase() + appType.slice(1)
    return (
      <span className={`${styles.appBadge} ${styles[appType]}`}>
        {appName} ({instanceName})
      </span>
    )
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>
          <i className="fas fa-crosshairs" />
          Hunt Manager
        </h1>
      </header>

      {/* Controls */}
      <div className={styles.controls}>
        <div className={styles.controlsLeft}>
          {/* App Filter */}
          <select
            value={currentApp}
            onChange={handleAppChange}
            className={styles.select}
          >
            {APP_TYPES.map(app => (
              <option key={app} value={app}>
                {app === 'all' ? 'All Apps' : app.charAt(0).toUpperCase() + app.slice(1)}
              </option>
            ))}
          </select>

          {/* Search */}
          <div className={styles.searchBox}>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Search by title or ID..."
              className={styles.searchInput}
            />
            <button onClick={handleSearch} className={styles.searchButton}>
              <i className="fas fa-search" />
            </button>
          </div>

          {/* Page Size */}
          <select
            value={pageSize}
            onChange={handlePageSizeChange}
            className={styles.select}
          >
            {PAGE_SIZES.map(size => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>
        </div>

        <div className={styles.controlsRight}>
          <button
            onClick={handleClearHistory}
            className={styles.clearButton}
            disabled={actionStatus?.type === 'clearing'}
          >
            <i className="fas fa-trash" />
            Clear History
          </button>
        </div>
      </div>

      {/* Action Status */}
      {actionStatus && (
        <div className={`${styles.actionStatus} ${styles[actionStatus.type]}`}>
          {actionStatus.message}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading hunt history...</span>
        </div>
      ) : entries.length === 0 ? (
        <div className={styles.emptyState}>
          <i className="fas fa-inbox" />
          <p>No hunt history found</p>
          {searchQuery && <p className={styles.hint}>Try a different search term</p>}
        </div>
      ) : (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Processed Information</th>
                <th>Operation</th>
                <th>ID Number</th>
                <th>App Instance</th>
                <th>How Long Ago</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr key={`${entry.id || index}-${entry.date_time}`}>
                  <td>
                    <span
                      className={`${styles.processedInfo} ${entry.instance_name ? styles.clickable : ''}`}
                      onClick={() => handleItemClick(entry)}
                      title={entry.instance_name ? `Click to open in ${entry.app_type.charAt(0).toUpperCase() + entry.app_type.slice(1)} (${entry.instance_name})` : ''}
                    >
                      {entry.processed_info}
                    </span>
                    {!!entry.discovered && (
                      <span className={styles.discoveryBadge}>🔍 Discovered</span>
                    )}
                  </td>
                  <td>{formatOperation(entry.operation_type)}</td>
                  <td>{entry.media_id}</td>
                  <td>{formatAppInstance(entry.app_type, entry.instance_name)}</td>
                  <td>{entry.how_long_ago}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className={styles.pagination}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className={styles.pageButton}
            >
              <i className="fas fa-chevron-left" />
              Previous
            </button>

            <span className={styles.pageInfo}>
              Page {page} of {totalPages}
              <span className={styles.totalEntries}>({totalEntries} total)</span>
            </span>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className={styles.pageButton}
            >
              Next
              <i className="fas fa-chevron-right" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default HuntManager
