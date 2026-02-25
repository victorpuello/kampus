import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export default function ProtectedRoute() {
  const user = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const location = useLocation()
  const attemptedRef = useRef(false)
  const [bootstrapping, setBootstrapping] = useState(true)

  useEffect(() => {
    if (attemptedRef.current) return
    attemptedRef.current = true

    fetchMe()
      .catch(() => {
        // noop: unresolved session will redirect to /login
      })
      .finally(() => {
        setBootstrapping(false)
      })

    return () => {}
  }, [fetchMe])

  if (bootstrapping) {
    return (
      <div className="p-4 text-sm text-slate-600 dark:text-slate-300">
        Verificando sesión...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (user.must_change_password && location.pathname !== '/account') {
    return <Navigate to="/account" replace />
  }

  return <Outlet />
}

