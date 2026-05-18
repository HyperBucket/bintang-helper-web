import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useStore } from './store'
import { IndexPage } from './pages/Index'
import { CourtsPage } from './pages/Courts'
import { CourtPage } from './pages/Court'
import { LogsPage } from './pages/Logs'

function AppInner() {
  const { hydrate, addLog, tick } = useStore()

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
      <Routes>
        <Route path="/" element={<IndexPage />} />
        <Route path="/courts" element={<CourtsPage />} />
        <Route path="/court/:id" element={<CourtPage />} />
        <Route path="/logs" element={<LogsPage />} />
      </Routes>
      {/* Modal portal root — scoped inside the app shell */}
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
