import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../../contexts/AppContext'
import { fetchWithTimeout } from '../../api/client'
import styles from './Home.module.css'

// App stats card component
function AppStatsCard({ app, stats, onReset }) {
  const appStats = stats[app] || { hunted: 0, upgraded: 0, apiUsed: 0, apiLimit: 20 }
  const apiPercent = appStats.apiLimit > 0
    ? Math.min((appStats.apiUsed / appStats.apiLimit) * 100, 100)
    : 0

  return (
    <div className={`${styles.appCard} ${styles[app]}`}>
      <div className={styles.appHeader}>
        <img
          src={`./static/images/app-icons/${app}.png`}
          alt={app}
          className={styles.appIcon}
        />
        <h4>{app.charAt(0).toUpperCase() + app.slice(1)}</h4>
      </div>

      <div className={styles.apiProgress}>
        <div className={styles.apiBar}>
          <div
            className={styles.apiFill}
            style={{ width: `${apiPercent}%` }}
          />
        </div>
        <span className={styles.apiText}>
          API: {appStats.apiUsed} / {appStats.apiLimit}
        </span>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statBox}>
          <span className={styles.statNumber}>{appStats.hunted}</span>
          <span className={styles.statLabel}>Searches</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statNumber}>{appStats.upgraded}</span>
          <span className={styles.statLabel}>Upgrades</span>
        </div>
      </div>

      <button
        className={styles.resetBtn}
        onClick={() => onReset(app)}
      >
        <i className="fas fa-sync-alt" /> Reset Cycle
      </button>
    </div>
  )
}

// Community links data
const COMMUNITY_LINKS = [
  {
    title: 'Discord',
    description: 'Join the community',
    url: 'https://discord.gg/huntarr',
    icon: 'fab fa-discord',
    color: '#5865f2'
  },
  {
    title: 'GitHub',
    description: 'Source code & issues',
    url: 'https://github.com/plexguide/Huntarr.io',
    icon: 'fab fa-github',
    color: '#333'
  },
  {
    title: 'Documentation',
    description: 'Setup guides & docs',
    url: 'https://huntarr.io/docs',
    icon: 'fas fa-book',
    color: '#3498db'
  },
  {
    title: 'Donate',
    description: 'Support development',
    url: 'https://ko-fi.com/huntarr',
    icon: 'fas fa-heart',
    color: '#e74c3c'
  }
]

function Home() {
  const { configuredApps, refreshStats } = useApp()
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)

  // Fetch stats on mount and periodically
  const loadStats = useCallback(async () => {
    try {
      const res = await fetchWithTimeout('./api/stats')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Failed to load stats:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStats()

    // Refresh stats every 30 seconds
    const interval = setInterval(loadStats, 30000)
    return () => clearInterval(interval)
  }, [loadStats])

  // Handle cycle reset for an app
  const handleReset = useCallback(async (app) => {
    try {
      const res = await fetchWithTimeout(`./api/cycle/reset/${app}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      if (res.ok) {
        loadStats()
      }
    } catch (error) {
      console.error(`Failed to reset ${app} cycle:`, error)
    }
  }, [loadStats])

  // Handle global stats reset
  const handleResetAll = useCallback(async () => {
    if (!confirm('Are you sure you want to reset all statistics?')) {
      return
    }

    try {
      const res = await fetchWithTimeout('./api/stats/reset_public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      if (res.ok) {
        loadStats()
        refreshStats()
      }
    } catch (error) {
      console.error('Failed to reset stats:', error)
    }
  }, [loadStats, refreshStats])

  // Get list of configured apps
  const activeApps = Object.entries(configuredApps)
    .filter(([, configured]) => configured)
    .map(([app]) => app)

  return (
    <div className={styles.home}>
      {/* Stats Card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>
            <i className="fas fa-crosshairs" /> Live Hunts Executed
          </h3>
          <button
            className={`${styles.btn} ${styles.btnDanger}`}
            onClick={handleResetAll}
          >
            <i className="fas fa-trash" /> Reset All
          </button>
        </div>

        <div className={styles.cardBody}>
          {loading ? (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <p>Loading stats...</p>
            </div>
          ) : activeApps.length === 0 ? (
            <div className={styles.emptyState}>
              <i className="fas fa-plug" />
              <p>No apps configured yet.</p>
              <p className={styles.muted}>
                Configure your *arr applications in Settings to start hunting.
              </p>
            </div>
          ) : (
            <div className={styles.appsGrid}>
              {activeApps.map(app => (
                <AppStatsCard
                  key={app}
                  app={app}
                  stats={stats}
                  onReset={handleReset}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Community Links */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>
            <i className="fas fa-users" /> Community & Resources
          </h3>
        </div>

        <div className={styles.cardBody}>
          <div className={styles.linksGrid}>
            {COMMUNITY_LINKS.map(link => (
              <a
                key={link.title}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.linkCard}
              >
                <div
                  className={styles.linkIcon}
                  style={{ backgroundColor: link.color }}
                >
                  <i className={link.icon} />
                </div>
                <div className={styles.linkContent}>
                  <span className={styles.linkTitle}>{link.title}</span>
                  <span className={styles.linkDesc}>{link.description}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home
