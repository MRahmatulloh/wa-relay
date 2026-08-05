import { useEffect } from 'react'

const TOAST_MS = 5000

/** Fixed toast; auto-dismisses after `ms` (default 5s). */
export default function Toast({ message, onClose, ms = TOAST_MS, tone = 'error' }) {
  useEffect(() => {
    if (!message) return undefined
    const id = setTimeout(() => onClose?.(), ms)
    return () => clearTimeout(id)
  }, [message, onClose, ms])

  if (!message) return null

  return (
    <div className={`toast toast-${tone}`} role="status" aria-live="polite">
      <p className="toast-text">{message}</p>
      <button type="button" className="toast-close" onClick={onClose} title="Dismiss" aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}

export function ToastStack({ items, onDismiss }) {
  if (!items?.length) return null
  return (
    <div className="toast-stack">
      {items.map((t) => (
        <Toast
          key={t.id}
          message={t.message}
          tone={t.tone || 'error'}
          onClose={() => onDismiss(t.id)}
        />
      ))}
    </div>
  )
}
