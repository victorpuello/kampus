import { X } from 'lucide-react'
import { Button } from './Button'

interface ConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
  loading?: boolean
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'default',
  loading = false
}: ConfirmationModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 transition-opacity backdrop-blur-sm" 
        onClick={!loading ? onClose : undefined}
      />
      
      {/* Modal Content */}
      <div className="relative z-50 w-full max-w-md transform overflow-hidden rounded-lg bg-white p-6 shadow-xl transition-all sm:mx-auto animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold leading-6 text-slate-900">
            {title}
          </h3>
          <button
            onClick={!loading ? onClose : undefined}
            className="rounded-full p-1 hover:bg-slate-100 transition-colors disabled:opacity-50"
            disabled={loading}
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        
        <div className="mt-2">
          <p className="text-sm text-slate-500">
            {description}
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant={variant}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Procesando...' : confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}
