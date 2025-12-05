import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import styles from './Settings.module.css'

// Placeholder for settings sections
function SettingsSection({ title, icon }) {
  return (
    <div className={styles.section}>
      <div className={styles.placeholder}>
        <i className={icon} />
        <h3>{title}</h3>
        <p>
          This section is being migrated to React.
          For now, please use the legacy interface.
        </p>
        <a href="/#settings" className={styles.legacyLink}>
          <i className="fas fa-external-link-alt" /> Open Legacy Settings
        </a>
      </div>
    </div>
  )
}

// Settings sidebar navigation
function SettingsSidebar() {
  const location = useLocation()

  const navItems = [
    { path: '/settings/general', label: 'General', icon: 'fas fa-cog' },
    { path: '/settings/apps', label: 'Applications', icon: 'fas fa-th-large' },
    { path: '/settings/scheduling', label: 'Scheduling', icon: 'fas fa-clock' },
    { path: '/settings/notifications', label: 'Notifications', icon: 'fas fa-bell' },
    { path: '/settings/backup', label: 'Backup & Restore', icon: 'fas fa-database' },
    { path: '/settings/user', label: 'User Account', icon: 'fas fa-user' }
  ]

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <h3>Settings</h3>
      </div>
      <nav className={styles.nav}>
        {navItems.map(({ path, label, icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
          >
            <i className={icon} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

function Settings() {
  return (
    <div className={styles.settings}>
      <SettingsSidebar />

      <div className={styles.content}>
        <Routes>
          <Route
            path="general"
            element={<SettingsSection title="General Settings" icon="fas fa-cog" />}
          />
          <Route
            path="apps"
            element={<SettingsSection title="Application Settings" icon="fas fa-th-large" />}
          />
          <Route
            path="scheduling"
            element={<SettingsSection title="Scheduling" icon="fas fa-clock" />}
          />
          <Route
            path="notifications"
            element={<SettingsSection title="Notifications" icon="fas fa-bell" />}
          />
          <Route
            path="backup"
            element={<SettingsSection title="Backup & Restore" icon="fas fa-database" />}
          />
          <Route
            path="user"
            element={<SettingsSection title="User Account" icon="fas fa-user" />}
          />
          <Route path="*" element={<Navigate to="general" replace />} />
        </Routes>
      </div>
    </div>
  )
}

export default Settings
