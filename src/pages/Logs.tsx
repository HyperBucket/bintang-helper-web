import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { formatTime } from '../utils'

export function LogsPage() {
  const navigate = useNavigate()
  const { logs } = useStore()

  return (
    <div className="app-shell">
      <div className="nav-bar">
        <button className="nav-bar__back" onClick={() => navigate('/')}>←</button>
        <span className="nav-bar__title">Launch Logs</span>
      </div>
      <div className="page-content">
        <div className="card">
          {logs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon">📋</div>
              <div className="empty-state__text">No logs yet</div>
            </div>
          ) : (
            logs.map((ts, i) => (
              <div key={ts} className="account-item" style={{ gap: 12 }}>
                <span className="badge badge-primary">{i + 1}</span>
                <span className="text-sm">{formatTime(new Date(ts))}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
