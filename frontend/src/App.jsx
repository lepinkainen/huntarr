import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useApp } from './contexts/AppContext'
import Layout from './components/Layout/Layout'
import Home from './pages/Home/Home'
import Logs from './pages/Logs/Logs'

// Lazy load less-used pages for code splitting
import { lazy, Suspense } from 'react'
const Settings = lazy(() => import('./pages/Settings/Settings'))
const Apps = lazy(() => import('./pages/Apps/Apps'))
const HuntManager = lazy(() => import('./pages/HuntManager/HuntManager'))
const Login = lazy(() => import('./pages/Login/Login'))
const Setup = lazy(() => import('./pages/Setup/Setup'))

function App() {
  const { isLoading } = useApp()
  const location = useLocation()

  // Auth pages render without Layout
  const isAuthPage = location.pathname === '/login' || location.pathname === '/setup'

  if (isLoading && !isAuthPage) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading Huntarr...</p>
      </div>
    )
  }

  // Auth pages (Login/Setup) render without Layout wrapper
  if (isAuthPage) {
    return (
      <Suspense fallback={<div className="loading-screen"><div className="loading-spinner" /></div>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<Setup />} />
        </Routes>
      </Suspense>
    )
  }

  return (
    <Layout>
      <Suspense fallback={<div className="loading-spinner" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/apps/*" element={<Apps />} />
          <Route path="/hunt-manager" element={<HuntManager />} />
          <Route path="/settings/*" element={<Settings />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}

export default App
