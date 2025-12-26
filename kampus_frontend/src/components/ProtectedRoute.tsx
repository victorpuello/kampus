import { useEffect, useRef } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export default function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const attemptedRef = useRef(false)

  useEffect(() => {
    // If we have a token after refresh, reload the user profile once.
    // Do not block rendering while bootstrapping.
    if (accessToken && !user && !attemptedRef.current) {
      attemptedRef.current = true

      fetchMe()
        .catch(() => {
          // fetchMe will clear tokens on 401/403; otherwise ignore.
        })
    }

    return () => {}
  }, [accessToken, user, fetchMe])

  if (!accessToken) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

