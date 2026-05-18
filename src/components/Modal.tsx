import { type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  title: string
  children: ReactNode
  actions?: ReactNode
  onClose: () => void
}

export function Modal({ title, children, actions, onClose }: ModalProps) {
  const [bottomOffset, setBottomOffset] = useState(0)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Push sheet up when soft keyboard opens
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const offset = window.innerHeight - vv.height - vv.offsetTop
      setBottomOffset(Math.max(0, offset))
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  const root = document.getElementById('modal-root') ?? document.body

  return createPortal(
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-sheet" style={{ marginBottom: bottomOffset, transition: bottomOffset ? 'none' : 'margin 0.2s' }}>
        <div className="modal-handle" />
        <div className="modal-title">{title}</div>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>,
    root
  )
}
