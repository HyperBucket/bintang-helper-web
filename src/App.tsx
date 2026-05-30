import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useStore } from './store'
import { IndexPage } from './pages/Index'
import { CourtsPage } from './pages/Courts'
import { CourtPage } from './pages/Court'
import { LogsPage } from './pages/Logs'
import { Toast } from './components/Toast'

function AppInner() {
  const { hydrate, addLog, tick, synced } = useStore()

  useEffect(() => {
    hydrate()
    addLog()
  }, [])

  useEffect(() => {
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [tick])

  return (
    <div className="app-shell">
      {!synced && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 999,
          background: 'var(--c-bg)', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 36 }}>🏸</div>
          <div style={{ fontSize: 14, color: 'var(--c-text-muted)', fontWeight: 600 }}>Syncing…</div>
        </div>
      )}
      <Routes>
        <Route path="/" element={<IndexPage />} />
        <Route path="/courts" element={<CourtsPage />} />
        <Route path="/court/:id" element={<CourtPage />} />
        <Route path="/logs" element={<LogsPage />} />
      </Routes>
      <Toast />
      <div id="modal-root" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppInner />
    </BrowserRouter>
  )
}
