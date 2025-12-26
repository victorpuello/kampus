import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rbacApi, type RbacPermission, type RbacRole } from '../services/rbac'
import { usersApi, type User } from '../services/users'
import { useAuthStore } from '../store/auth'
import { formatPermissionGroupEs, formatPermissionNameEs } from '../lib/permissionsI18n'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Toast, type ToastType } from '../components/ui/Toast'

type Mode = 'role' | 'user'

export default function RbacSettings() {
  const navigate = useNavigate()
  const me = useAuthStore((s) => s.user)
  const isTeacher = me?.role === 'TEACHER'

  if (isTeacher) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Permisos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600">No tienes permisos para gestionar roles o permisos.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const [mode, setMode] = useState<Mode>('role')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const getErrorDetail = (e: unknown) => {
    const maybe = e as { response?: { data?: { detail?: string } } }
    return maybe?.response?.data?.detail
  }

  const canManage = me?.role === 'ADMIN' || me?.role === 'SUPERADMIN'

  const [roles, setRoles] = useState<RbacRole[]>([])
  const [permissions, setPermissions] = useState<RbacPermission[]>([])
  const [users, setUsers] = useState<User[]>([])

  const [selectedRole, setSelectedRole] = useState<string>('')
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('')

  const roleSelectRef = useRef<HTMLSelectElement | null>(null)
  const userSelectRef = useRef<HTMLSelectElement | null>(null)
  const permissionsHeadingRef = useRef<HTMLHeadingElement | null>(null)

  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<number>>(new Set())

  const a11yStatusText = useMemo(() => {
    if (saving) return 'Guardando permisos...'
    if (toast.isVisible && toast.message) return toast.message
    return ''
  }, [saving, toast.isVisible, toast.message])

  const groupedPermissions = useMemo(() => {
    const groups: Record<string, RbacPermission[]> = {}
    for (const p of permissions) {
      const key = `${p.app_label}.${p.model}`
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [permissions])

  const getGroupLabel = (key: string) => {
    const [appLabel, model] = key.split('.') as [string, string]
    return formatPermissionGroupEs(appLabel, model)
  }

  useEffect(() => {
    const run = async () => {
      if (!canManage) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const [rolesRes, permsRes, usersRes] = await Promise.all([
          rbacApi.listRoles(),
          rbacApi.listPermissions(),
          usersApi.getAll(),
        ])
        setRoles(rolesRes.data.roles)
        setPermissions(permsRes.data.permissions)
        setUsers(usersRes.data)
      } catch (e: unknown) {
        const detail = getErrorDetail(e)
        showToast(detail || 'Error cargando configuración de permisos', 'error')
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [canManage])

  useEffect(() => {
    // Keyboard UX: move focus to the relevant selector when switching modes.
    if (mode === 'role') {
      roleSelectRef.current?.focus()
    } else {
      userSelectRef.current?.focus()
    }
  }, [mode])

  const loadRolePermissions = async (role: string) => {
    setLoading(true)
    try {
      const res = await rbacApi.getRolePermissions(role)
      setSelectedPermissionIds(new Set(res.data.permission_ids))
      // After load, move focus to permissions section for quick keyboard flow.
      requestAnimationFrame(() => permissionsHeadingRef.current?.focus())
    } catch (e: unknown) {
      const detail = getErrorDetail(e)
      showToast(detail || 'Error cargando permisos del rol', 'error')
      setSelectedPermissionIds(new Set())
    } finally {
      setLoading(false)
    }
  }

  const loadUserPermissions = async (userId: number) => {
    setLoading(true)
    try {
      const res = await rbacApi.getUserPermissions(userId)
      setSelectedPermissionIds(new Set(res.data.user_permission_ids))
      requestAnimationFrame(() => permissionsHeadingRef.current?.focus())
    } catch (e: unknown) {
      const detail = getErrorDetail(e)
      showToast(detail || 'Error cargando permisos del usuario', 'error')
      setSelectedPermissionIds(new Set())
    } finally {
      setLoading(false)
    }
  }

  const togglePermission = (id: number) => {
    setSelectedPermissionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const onSave = async () => {
    if (!canManage) return

    if (mode === 'role') {
      if (!selectedRole) {
        showToast('Selecciona un rol', 'error')
        return
      }
    } else {
      if (!selectedUserId) {
        showToast('Selecciona un usuario', 'error')
        return
      }
    }

    setSaving(true)
    try {
      const ids = Array.from(selectedPermissionIds).sort((a, b) => a - b)
      if (mode === 'role') {
        await rbacApi.setRolePermissions(selectedRole, ids)
        showToast('Permisos del rol actualizados', 'success')
      } else {
        await rbacApi.setUserPermissions(Number(selectedUserId), ids)
        showToast('Permisos del usuario actualizados', 'success')
      }
    } catch (e: unknown) {
      const detail = getErrorDetail(e)
      showToast(detail || 'Error guardando permisos', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!canManage) {
    return <div className="p-6">No tienes permisos para administrar RBAC.</div>
  }

  if (loading) {
    return <div className="p-6">Cargando...</div>
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6" aria-busy={loading || saving}>
      <a
        href="#rbac-permissions"
        className="sr-only focus:not-sr-only focus:inline-block focus:rounded focus:border focus:border-slate-300 focus:bg-white focus:px-3 focus:py-2"
      >
        Saltar a la lista de permisos
      </a>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {a11yStatusText}
      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((prev) => ({ ...prev, isVisible: false }))}
      />

      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Permisos (RBAC)</h2>
        <p className="text-slate-500">Asigna permisos por rol y excepciones por usuario.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Modo</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset className="flex flex-wrap gap-2" aria-describedby="rbac-mode-help">
            <legend className="sr-only">Modo de asignación</legend>
            <Button
              type="button"
              variant={mode === 'role' ? 'default' : 'outline'}
              aria-pressed={mode === 'role'}
              onClick={() => {
                setMode('role')
                setSelectedUserId('')
                setSelectedPermissionIds(new Set())
              }}
            >
              Por rol
            </Button>
            <Button
              type="button"
              variant={mode === 'user' ? 'default' : 'outline'}
              aria-pressed={mode === 'user'}
              onClick={() => {
                setMode('user')
                setSelectedRole('')
                setSelectedPermissionIds(new Set())
              }}
            >
              Por usuario (excepciones)
            </Button>
          </fieldset>
          <p id="rbac-mode-help" className="sr-only">
            Cambia entre asignar permisos por rol o por usuario.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Selección</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === 'role' ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="role">
                Rol
              </label>
              <select
                id="role"
                ref={roleSelectRef}
                value={selectedRole}
                onChange={(e) => {
                  const next = e.target.value
                  setSelectedRole(next)
                  setSelectedPermissionIds(new Set())
                  if (next) loadRolePermissions(next)
                }}
                aria-describedby="rbac-role-help"
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
              >
                <option value="">Selecciona un rol</option>
                {roles.map((r) => (
                  <option key={r.role} value={r.role}>
                    {r.label} ({r.role})
                  </option>
                ))}
              </select>
              <p id="rbac-role-help" className="text-xs text-slate-500">
                Selecciona un rol para editar los permisos asignados a ese rol.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="user">
                Usuario
              </label>
              <select
                id="user"
                ref={userSelectRef}
                value={selectedUserId}
                onChange={(e) => {
                  const next = e.target.value ? Number(e.target.value) : ''
                  setSelectedUserId(next)
                  setSelectedPermissionIds(new Set())
                  if (next) loadUserPermissions(next)
                }}
                aria-describedby="rbac-user-help"
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
              >
                <option value="">Selecciona un usuario</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.first_name} {u.last_name} ({u.username}) — {u.role}
                  </option>
                ))}
              </select>
              <p id="rbac-user-help" className="text-xs text-slate-500">
                Los permisos aquí son solo excepciones; se suman a los permisos del rol.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="button" onClick={onSave} disabled={saving} aria-disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h3 id="rbac-permissions" ref={permissionsHeadingRef} tabIndex={-1}>
              Permisos
            </h3>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!selectedRole && mode === 'role' ? (
            <div className="text-sm text-slate-600">Selecciona un rol para ver y editar permisos.</div>
          ) : null}
          {!selectedUserId && mode === 'user' ? (
            <div className="text-sm text-slate-600">Selecciona un usuario para editar excepciones.</div>
          ) : null}

          {(mode === 'role' ? !!selectedRole : !!selectedUserId) && (
            <div className="space-y-6">
              {groupedPermissions.map(([key, perms]) => (
                <fieldset
                  key={key}
                  className="rounded-lg border border-slate-200"
                  aria-describedby={`perm-group-help-${key.replace(/\./g, '-')}`}
                >
                  <legend className="px-4 py-3 border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 w-full">
                    {getGroupLabel(key)}
                  </legend>
                  <p id={`perm-group-help-${key.replace(/\./g, '-')}`} className="sr-only">
                    Lista de permisos para {getGroupLabel(key)}.
                  </p>
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {perms.map((p) => {
                      const inputId = `perm-${p.id}`
                      return (
                        <div key={p.id} className="flex items-start gap-2 text-sm text-slate-700">
                          <input
                            id={inputId}
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-slate-300"
                            checked={selectedPermissionIds.has(p.id)}
                            onChange={() => togglePermission(p.id)}
                          />
                          <label htmlFor={inputId} className="cursor-pointer">
                            <span className="font-medium">{formatPermissionNameEs(p)}</span>
                            <span className="block text-xs text-slate-500 font-mono">
                              {p.app_label}.{p.model}.{p.codename}
                            </span>
                          </label>
                        </div>
                      )
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
