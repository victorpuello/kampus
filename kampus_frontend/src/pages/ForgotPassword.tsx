import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { authApi } from '../services/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const response = await authApi.requestPasswordReset(email)
      setMessage(response.data.detail)
    } catch {
      setError('No fue posible procesar la solicitud. Inténtalo de nuevo en unos minutos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-8">
      <div className="w-full max-w-[420px] space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Recuperar contraseña</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ingresa tu correo institucional y te enviaremos un enlace seguro.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@colegio.edu.co"
              autoComplete="email"
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
                Enviando...
              </>
            ) : (
              'Enviar enlace de recuperación'
            )}
          </Button>
        </form>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          ¿Recordaste tu contraseña?{' '}
          <Link to="/login" className="font-medium text-sky-600 hover:underline dark:text-sky-400">
            Volver al inicio de sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
