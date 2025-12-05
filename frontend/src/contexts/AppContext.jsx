import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { fetchWithTimeout } from '../api/client'

const AppContext = createContext(null)

// App types supported by Huntarr
const APP_TYPES = ['sonarr', 'radarr', 'lidarr', 'readarr', 'whisparr', 'eros']

export function AppProvider({ children }) {
  // Loading state
  const [isLoading, setIsLoading] = useState(true)

  // Theme state
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('huntarr-dark-mode')
    return saved === 'true' || saved === null // Default to dark mode
  })

  // App configuration state
  const [configuredApps, setConfiguredApps] = useState(() => {
    return APP_TYPES.reduce((acc, app) => ({ ...acc, [app]: false }), {})
  })

  // Settings state
  const [settings, setSettings] = useState({})

  // Stats state
  const [stats, setStats] = useState({
    hunted: {},
    upgraded: {}
  })

  // Fetch initial data
  useEffect(() => {
    async function loadInitialData() {
      try {
        // Load settings
        const settingsRes = await fetchWithTimeout('/api/settings')
        if (settingsRes.ok) {
          const data = await settingsRes.json()
          setSettings(data)
        }

        // Check which apps are configured
        const appStatus = {}
        await Promise.all(
          APP_TYPES.map(async (app) => {
            try {
              const res = await fetchWithTimeout(`/api/status/${app}`)
              const data = await res.json()
              // API returns { connected_count, total_configured }
              appStatus[app] = (data.total_configured || 0) > 0
            } catch {
              appStatus[app] = false
            }
          })
        )
        setConfiguredApps(appStatus)

        // Load stats
        const statsRes = await fetchWithTimeout('/api/stats')
        if (statsRes.ok) {
          const statsData = await statsRes.json()
          setStats(statsData)
        }
      } catch (error) {
        console.error('Failed to load initial data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadInitialData()
  }, [])

  // Apply dark mode to document
  useEffect(() => {
    document.body.classList.toggle('dark-theme', darkMode)
    localStorage.setItem('huntarr-dark-mode', String(darkMode))
  }, [darkMode])

  // Toggle dark mode
  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => !prev)
  }, [])

  // Update settings
  const updateSettings = useCallback(async (appName, newSettings) => {
    try {
      const res = await fetchWithTimeout(`/api/settings/${appName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      })

      if (res.ok) {
        setSettings(prev => ({
          ...prev,
          [appName]: { ...prev[appName], ...newSettings }
        }))
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to update settings:', error)
      return false
    }
  }, [])

  // Refresh app status
  const refreshAppStatus = useCallback(async (appName) => {
    try {
      const res = await fetchWithTimeout(`/api/status/${appName}`)
      const data = await res.json()
      setConfiguredApps(prev => ({
        ...prev,
        [appName]: (data.total_configured || 0) > 0
      }))
      return data
    } catch (error) {
      console.error(`Failed to refresh ${appName} status:`, error)
      return null
    }
  }, [])

  // Refresh stats
  const refreshStats = useCallback(async () => {
    try {
      const res = await fetchWithTimeout('/api/stats')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
        return data
      }
    } catch (error) {
      console.error('Failed to refresh stats:', error)
    }
    return null
  }, [])

  const value = {
    // State
    isLoading,
    darkMode,
    configuredApps,
    settings,
    stats,
    appTypes: APP_TYPES,

    // Actions
    toggleDarkMode,
    updateSettings,
    refreshAppStatus,
    refreshStats,
    setSettings
  }

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}

export default AppContext
