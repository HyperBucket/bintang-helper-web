import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  title: string
  children: ReactNode
  actions?: ReactNode
  onClose: () => void
}

export function Modal({ title, children, actions, onClose }: ModalProps) {
  const [vvHeight, setVvHeight] = useState<number | null>(null)
  const [vvBottom, setVvBottom] = useState(0)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Track visual viewport so the sheet stays above the soft keyboard
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const bottom = window.innerHeight - vv.offsetTop - vv.height
      setVvBottom(Math.max(0, bottom))
      setVvHeight(vv.height)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  // Lock background scroll on iOS. position:fixed is the only reliable way
  // to stop rubber-band / momentum scrolling on the page behind the modal.
  useEffect(() => {
    const scrollY = window.scrollY
    const body = document.body
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.overflow = 'hidden'
    return () => {
      body.style.position = ''
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      body.style.overflow = ''
      window.scrollTo(0, scrollY)
    }
  }, [])

  const keyboardOpen = vvBottom > 50
  const sheetStyle: React.CSSProperties = keyboardOpen
    ? {
        marginBottom: vvBottom,
        maxHeight: (vvHeight ?? window.innerHeight) - 60,
        transition: 'none',
      }
    : {
        maxHeight: '82%',
      }

  const root = document.getElementById('modal-root') ?? document.body

  return createPortal(
    <div
      ref={overlayRef}
      className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-sheet" style={sheetStyle}>
        <div className="modal-handle" />
        <div className="modal-title">{title}</div>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>,
    root
  )
}
