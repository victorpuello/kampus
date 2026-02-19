import { useEffect } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastProps {
  message: string
  type?: ToastType
  isVisible: boolean
  onClose: () => void
  duration?: number
}

export function Toast({ 
  message, 
  type = 'info', 
  isVisible, 
  onClose, 
  duration = 5000 
}: ToastProps) {
  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(() => {
        onClose()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [isVisible, duration, onClose])

  if (!isVisible) return null

  const bgColors = {
    success: 'bg-green-50 border-green-200 text-green-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-200',
    error: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-900 dark:text-red-200',
    info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-200',
    warning:
      'bg-yellow-50 border-yellow-200 text-yellow-900 dark:bg-yellow-950/30 dark:border-yellow-900 dark:text-yellow-200'
  }

  const icons = {
    success: <CheckCircle className="h-5 w-5 text-green-500 dark:text-emerald-300" />,
    error: <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-300" />,
    info: <AlertCircle className="h-5 w-5 text-blue-500 dark:text-blue-300" />,
    warning: <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-300" />
  }

  return (
    <div
      className={`fixed bottom-4 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 items-start gap-3 rounded-lg border p-4 shadow-lg transition-all animate-in slide-in-from-top-2 sm:top-4 sm:right-4 sm:bottom-auto sm:left-auto sm:w-auto sm:translate-x-0 ${bgColors[type]}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <div className="mt-0.5 shrink-0">
        {icons[type]}
      </div>
      <div className="flex-1 text-sm font-medium">
        {message}
      </div>
      <button
        onClick={onClose}
        className="shrink-0 rounded-md p-1 hover:bg-black/5 transition-colors dark:hover:bg-white/10"
        aria-label="Cerrar notificación"
      >
        <X className="h-4 w-4 opacity-50" />
      </button>
    </div>
  )
}
