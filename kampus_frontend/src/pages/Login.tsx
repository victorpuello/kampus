import { type FormEvent, useState } from 'react'
import { useAuthStore } from '../store/auth'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { Loader2 } from 'lucide-react'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const login = useAuthStore((s) => s.login)
  const loading = useAuthStore((s) => s.loading)
  const navigate = useNavigate()

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    try {
      await login(username, password)
      navigate('/')
    } catch {
      setLocalError('Credenciales incorrectas. Inténtalo de nuevo.')
    }
  }

  return (
    <div className="w-full h-screen lg:grid lg:grid-cols-2 overflow-hidden">
      {/* Left Side - Visual / Branding */}
      <div className="hidden lg:flex flex-col justify-between bg-slate-900 p-10 text-white relative overflow-hidden">
        {/* Abstract Background Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
           <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-blue-500 blur-3xl"></div>
           <div className="absolute top-1/2 left-1/2 w-64 h-64 rounded-full bg-purple-500 blur-3xl"></div>
           <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-indigo-500 blur-3xl"></div>
        </div>

        <div className="relative z-10 flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">K</span>
          </div>
          <span className="text-xl font-bold tracking-tight">Kampus</span>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl font-bold tracking-tight mb-4">
            Gestión académica simplificada y moderna.
          </h2>
          <p className="text-slate-400 text-lg">
            Administra estudiantes, cursos y calificaciones desde una plataforma unificada y diseñada para el futuro.
          </p>
        </div>

        <div className="relative z-10 text-sm text-slate-500">
          &copy; {new Date().getFullYear()} Kampus Inc.
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex items-center justify-center p-8 bg-white h-full">
        <div className="mx-auto w-full max-w-[350px] space-y-6">
          <div className="flex flex-col space-y-2 text-center">
            <div className="lg:hidden flex justify-center mb-4">
               <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">K</span>
              </div>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Iniciar sesión
            </h1>
            <p className="text-sm text-slate-500">
              Ingresa tu usuario y contraseña para continuar
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                placeholder="nombre.apellido"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="bg-slate-50 border-slate-200 focus:bg-white transition-colors"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Contraseña</Label>
                <a 
                  href="#" 
                  className="text-sm font-medium text-blue-600 hover:text-blue-500 hover:underline"
                  onClick={(e) => e.preventDefault()}
                >
                  ¿Olvidaste tu contraseña?
                </a>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="bg-slate-50 border-slate-200 focus:bg-white transition-colors"
              />
            </div>

            {localError && (
              <div className="text-sm text-red-500 font-medium text-center bg-red-50 p-2 rounded border border-red-100">
                {localError}
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full bg-slate-900 hover:bg-slate-800 text-white h-11"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                'Ingresar a la plataforma'
              )}
            </Button>
          </form>

          <p className="px-8 text-center text-sm text-slate-500">
            Al continuar, aceptas nuestros{" "}
            <a href="#" className="underline underline-offset-4 hover:text-slate-900">
              Términos de Servicio
            </a>{" "}
            y{" "}
            <a href="#" className="underline underline-offset-4 hover:text-slate-900">
              Política de Privacidad
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}

