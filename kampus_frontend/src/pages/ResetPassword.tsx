import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { authApi } from '../services/api'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const token = useMemo(() => searchParams.get('token') || '', [searchParams])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setMessage(null)

    if (!token) {
      setError('El enlace no es válido. Solicita uno nuevo.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    try {
      const response = await authApi.confirmPasswordReset(token, newPassword)
      setMessage(response.data.detail)
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } } | undefined)?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'No fue posible actualizar la contraseña.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-8">
      <div className="w-full max-w-[420px] space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Nueva contraseña</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Define una contraseña segura para acceder a tu cuenta.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nueva contraseña</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar contraseña</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          {error && (
            <div className="text-sm font-medium text-center bg-red-50 p-2 rounded border border-red-100 text-red-600 dark:bg-red-950/40 dark:border-red-900/50 dark:text-red-300">
              {error}
            </div>
          )}

          {message && (
            <div className="text-sm font-medium text-center bg-emerald-50 p-2 rounded border border-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900/50 dark:text-emerald-300">
              {message}
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white dark:bg-sky-600 dark:hover:bg-sky-700"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Actualizando...
              </>
            ) : (
              'Actualizar contraseña'
            )}
          </Button>
        </form>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          <Link to="/login" className="font-medium text-sky-600 hover:underline dark:text-sky-400">
            Volver al inicio de sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
