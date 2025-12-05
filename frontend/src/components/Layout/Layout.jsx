import { NavLink, useLocation } from 'react-router-dom'
import { useApp } from '../../contexts/AppContext'
import styles from './Layout.module.css'

function Layout({ children }) {
  const { darkMode, toggleDarkMode, configuredApps } = useApp()
  const location = useLocation()

  // Determine active section for sidebar highlighting
  const isAppsSection = location.pathname.startsWith('/apps')
  const isSettingsSection = location.pathname.startsWith('/settings')

  return (
    <div className={styles.layout}>
      {/* Main Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <img src="/static/logo/huntarr.png" alt="Huntarr" />
          <span>Huntarr</span>
        </div>

        <nav className={styles.nav}>
          <NavLink
            to="/"
            className={({ isActive }) =>
              `${styles.navItem} ${isActive && !isAppsSection && !isSettingsSection ? styles.active : ''}`
            }
          >
            <i className="fas fa-home" />
            <span>Home</span>
          </NavLink>

          <NavLink
            to="/apps/sonarr"
            className={`${styles.navItem} ${isAppsSection ? styles.active : ''}`}
          >
            <i className="fas fa-th-large" />
            <span>Apps</span>
          </NavLink>

          <NavLink
            to="/hunt-manager"
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
          >
            <i className="fas fa-crosshairs" />
            <span>Hunt Manager</span>
          </NavLink>

          <NavLink
            to="/logs"
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
          >
            <i className="fas fa-file-alt" />
            <span>Logs</span>
          </NavLink>

          <NavLink
            to="/settings"
            className={`${styles.navItem} ${isSettingsSection ? styles.active : ''}`}
          >
            <i className="fas fa-cog" />
            <span>Settings</span>
          </NavLink>
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            className={styles.themeToggle}
            onClick={toggleDarkMode}
            aria-label="Toggle dark mode"
          >
            <i className={darkMode ? 'fas fa-sun' : 'fas fa-moon'} />
          </button>
        </div>
      </aside>

      {/* Apps Sub-Sidebar (shown when in apps section) */}
      {isAppsSection && (
        <aside className={styles.subSidebar}>
          <div className={styles.subSidebarHeader}>
            <h3>Applications</h3>
          </div>
          <nav className={styles.subNav}>
            {['sonarr', 'radarr', 'lidarr', 'readarr', 'whisparr', 'eros'].map(app => (
              <NavLink
                key={app}
                to={`/apps/${app}`}
                className={({ isActive }) =>
                  `${styles.subNavItem} ${styles[app]} ${isActive ? styles.active : ''} ${!configuredApps[app] ? styles.disabled : ''}`
                }
              >
                <img
                  src={`/static/images/app-icons/${app}.png`}
                  alt={app}
                  className={styles.appIcon}
                />
                <span>{app.charAt(0).toUpperCase() + app.slice(1)}</span>
                {configuredApps[app] && (
                  <span className={styles.configuredBadge}>
                    <i className="fas fa-check" />
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </aside>
      )}

      {/* Main Content */}
      <main className={styles.main}>
        {children}
      </main>
    </div>
  )
}

export default Layout
