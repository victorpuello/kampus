import { X } from 'lucide-react'
import type { ReactNode } from 'react'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

const sizeClassName = (size: ModalSize) => {
  switch (size) {
    case 'sm':
      return 'max-w-md'
    case 'md':
      return 'max-w-2xl'
    case 'lg':
      return 'max-w-4xl'
    case 'xl':
      return 'max-w-6xl'
    default:
      return 'max-w-2xl'
  }
}

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: ModalSize
  loading?: boolean
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  loading = false,
}: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
      <div
        className="fixed inset-0 bg-black/50 transition-opacity backdrop-blur-sm"
        onClick={!loading ? onClose : undefined}
      />

      <div
        className={`relative z-50 flex w-full ${sizeClassName(size)} transform flex-col overflow-hidden rounded-xl bg-white shadow-xl transition-all sm:mx-auto animate-in fade-in zoom-in-95 duration-200 dark:bg-slate-900 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)]`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-semibold leading-6 text-slate-900 dark:text-slate-100">{title}</h3>
            {description ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">{description}</p> : null}
          </div>
          <button
            onClick={!loading ? onClose : undefined}
            className="rounded-full p-1 hover:bg-slate-100 transition-colors disabled:opacity-50 dark:hover:bg-slate-800"
            disabled={loading}
            aria-label="Cerrar"
            title="Cerrar"
          >
            <X className="h-5 w-5 text-slate-500 dark:text-slate-300" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto">{children}</div>

        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-end dark:border-slate-800">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
