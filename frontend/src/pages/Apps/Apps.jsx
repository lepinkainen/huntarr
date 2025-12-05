import { Routes, Route, Navigate } from 'react-router-dom'
import styles from './Apps.module.css'

// Placeholder components for each app
function AppSection({ appName }) {
  const appTitle = appName.charAt(0).toUpperCase() + appName.slice(1)

  return (
    <div className={styles.appSection}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.headerLeft}>
            <img
              src={`./static/images/app-icons/${appName}.png`}
              alt={appTitle}
              className={styles.appIcon}
            />
            <h2>{appTitle}</h2>
          </div>
        </div>

        <div className={styles.cardBody}>
          <div className={styles.placeholder}>
            <i className="fas fa-tools" />
            <h3>{appTitle} Management</h3>
            <p>
              This section is being migrated to React.
              For now, please use the legacy interface.
            </p>
            <a href={`/#${appName}`} className={styles.legacyLink}>
              <i className="fas fa-external-link-alt" /> Open Legacy View
            </a>
          </div>
        </div>
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
