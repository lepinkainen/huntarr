import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from './contexts/AppContext'
import Layout from './components/Layout/Layout'
import Home from './pages/Home/Home'
import Logs from './pages/Logs/Logs'

// Lazy load less-used pages for code splitting
import { lazy, Suspense } from 'react'
const Settings = lazy(() => import('./pages/Settings/Settings'))
const Apps = lazy(() => import('./pages/Apps/Apps'))

function App() {
  const { isLoading } = useApp()

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading Huntarr...</p>
      </div>
    )
  }

  return (
    <Layout>
      <Suspense fallback={<div className="loading-spinner" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/apps/*" element={<Apps />} />
          <Route path="/settings/*" element={<Settings />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}

export default App
