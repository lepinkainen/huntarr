import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import styles from './Settings.module.css'
import GeneralSettings from './GeneralSettings'
import BackupSettings from './BackupSettings'
import NotificationsSettings from './NotificationsSettings'
import UserSettings from './UserSettings'

// Placeholder for settings sections not yet implemented
function SettingsSection({ title, icon, legacyHash }) {
  return (
    <div className={styles.section}>
      <div className={styles.placeholder}>
        <i className={icon} />
        <h3>{title}</h3>
        <p>
          This section is being migrated to React.
          For now, please use the legacy interface.
        </p>
        <a href={`/#${legacyHash || 'settings'}`} className={styles.legacyLink}>
          <i className="fas fa-external-link-alt" /> Open Legacy Settings
        </a>
      </div>
    </div>
  )
}

// Settings sidebar navigation
function SettingsSidebar() {
  const _location = useLocation()

  const navItems = [
    { path: '/settings/general', label: 'General', icon: 'fas fa-cog' },
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
          <Route path="general" element={<GeneralSettings />} />
          <Route
            path="scheduling"
            element={<SettingsSection title="Scheduling" icon="fas fa-clock" legacyHash="scheduling" />}
          />
          <Route path="notifications" element={<NotificationsSettings />} />
          <Route path="backup" element={<BackupSettings />} />
          <Route path="user" element={<UserSettings />} />
          <Route path="*" element={<Navigate to="general" replace />} />
        </Routes>
      </div>
    </div>
  )
}

export default Settings
