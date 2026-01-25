import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rbacApi, type RbacPermission, type RbacRole } from '../services/rbac'
import { usersApi, type User } from '../services/users'
import { useAuthStore } from '../store/auth'
import { formatPermissionGroupEs, formatPermissionNameEs } from '../lib/permissionsI18n'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Toast, type ToastType } from '../components/ui/Toast'

type Mode = 'role' | 'user'

export default function RbacSettings() {
  const navigate = useNavigate()
  const me = useAuthStore((s) => s.user)
  const isTeacher = me?.role === 'TEACHER'

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

  const [userSearch, setUserSearch] = useState('')
  const [permissionSearch, setPermissionSearch] = useState('')

  const roleSelectRef = useRef<HTMLSelectElement | null>(null)
  const userSelectRef = useRef<HTMLSelectElement | null>(null)
  const permissionsHeadingRef = useRef<HTMLHeadingElement | null>(null)

  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<number>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const a11yStatusText = useMemo(() => {
    if (saving) return 'Guardando permisos...'
    if (toast.isVisible && toast.message) return toast.message
    return ''
  }, [saving, toast.isVisible, toast.message])

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    if (!q) return users
    const out = users.filter((u) => {
      const name = `${u.first_name || ''} ${u.last_name || ''}`.trim().toLowerCase()
      const username = (u.username || '').toLowerCase()
      const email = (u.email || '').toLowerCase()
      return name.includes(q) || username.includes(q) || email.includes(q)
    })

    if (selectedUserId) {
      const selected = users.find((u) => u.id === selectedUserId)
      if (selected && !out.some((u) => u.id === selected.id)) out.unshift(selected)
    }

    return out
  }, [selectedUserId, userSearch, users])

  const filteredPermissions = useMemo(() => {
    const q = permissionSearch.trim().toLowerCase()
    if (!q) return permissions
    return permissions.filter((p) => {
      const name = formatPermissionNameEs(p).toLowerCase()
      const code = `${p.app_label}.${p.model}.${p.codename}`.toLowerCase()
      const group = formatPermissionGroupEs(p.app_label, p.model).toLowerCase()
      return name.includes(q) || code.includes(q) || group.includes(q)
    })
  }, [permissionSearch, permissions])

  const groupedPermissions = useMemo(() => {
    const groups: Record<string, RbacPermission[]> = {}
    for (const p of filteredPermissions) {
      const key = `${p.app_label}.${p.model}`
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredPermissions])

  const allGroupKeys = useMemo(() => groupedPermissions.map(([key]) => key), [groupedPermissions])

  useEffect(() => {
    // Keep expanded groups in sync with current filter.
    setExpandedGroups((prev) => {
      if (allGroupKeys.length === 0) return new Set()
      const next = new Set<string>()
      for (const k of allGroupKeys) {
        if (prev.has(k)) next.add(k)
      }

      // Auto-expand the first group when filtering and none are open.
      if (permissionSearch.trim() && next.size === 0 && allGroupKeys[0]) next.add(allGroupKeys[0])
      return next
    })
  }, [allGroupKeys, permissionSearch])

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

  if (isTeacher) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Permisos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">No tienes permisos para gestionar roles o permisos.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

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
    return <div className="p-6 text-slate-700 dark:text-slate-200">No tienes permisos para administrar RBAC.</div>
  }

  if (loading) {
    return <div className="p-6 text-slate-700 dark:text-slate-200">Cargando...</div>
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6" aria-busy={loading || saving}>
      <a
        href="#rbac-permissions"
        className="sr-only focus:not-sr-only focus:inline-block focus:rounded focus:border focus:border-slate-300 focus:bg-white focus:px-3 focus:py-2 dark:focus:border-slate-700 dark:focus:bg-slate-900 dark:focus:text-slate-100"
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
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Permisos (RBAC)</h2>
        <p className="text-slate-500 dark:text-slate-400">Asigna permisos por rol y excepciones por usuario.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Modo</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-2" aria-describedby="rbac-mode-help">
            <legend className="sr-only">Modo de asignación</legend>
            <Button
              type="button"
              variant={mode === 'role' ? 'default' : 'outline'}
              className="w-full"
              aria-pressed={mode === 'role'}
              onClick={() => {
                setMode('role')
                setSelectedUserId('')
                setUserSearch('')
                setSelectedPermissionIds(new Set())
              }}
            >
              Por rol
            </Button>
            <Button
              type="button"
              variant={mode === 'user' ? 'default' : 'outline'}
              className="w-full"
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
          <CardTitle className="text-slate-900 dark:text-slate-100">Selección</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === 'role' ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="role">
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
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:ring-offset-slate-950"
              >
                <option value="">Selecciona un rol</option>
                {roles.map((r) => (
                  <option key={r.role} value={r.role}>
                    {r.label} ({r.role})
                  </option>
                ))}
              </select>
              <p id="rbac-role-help" className="text-xs text-slate-500 dark:text-slate-400">
                Selecciona un rol para editar los permisos asignados a ese rol.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="user">
                Usuario
              </label>
              <Input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Buscar usuario (nombre, username, email)"
              />
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
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:ring-offset-slate-950"
              >
                <option value="">Selecciona un usuario</option>
                {filteredUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.first_name} {u.last_name} ({u.username}) — {u.role}
                  </option>
                ))}
              </select>
              <p id="rbac-user-help" className="text-xs text-slate-500 dark:text-slate-400">
                Los permisos aquí son solo excepciones; se suman a los permisos del rol.
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setSelectedPermissionIds(new Set())}
              disabled={saving}
            >
              Limpiar
            </Button>
            <Button type="button" className="w-full sm:w-auto" onClick={onSave} disabled={saving} aria-disabled={saving}>
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
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="permission-search">
                Buscar permisos
              </label>
              <Input
                id="permission-search"
                value={permissionSearch}
                onChange={(e) => setPermissionSearch(e.target.value)}
                placeholder="Ej: students, ver, crear, disciplina..."
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Filtra por nombre, grupo o código (app.model.codename).
              </p>
            </div>

            <div className="flex items-end">
              <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                Seleccionados: <span className="font-semibold">{selectedPermissionIds.size}</span>
              </div>
            </div>
          </div>

          {(mode === 'role' ? !!selectedRole : !!selectedUserId) && groupedPermissions.length > 0 ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setExpandedGroups(new Set(allGroupKeys))}
              >
                Expandir todo
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setExpandedGroups(new Set())}
              >
                Colapsar todo
              </Button>
            </div>
          ) : null}

          {!selectedRole && mode === 'role' ? (
            <div className="text-sm text-slate-600 dark:text-slate-300">Selecciona un rol para ver y editar permisos.</div>
          ) : null}
          {!selectedUserId && mode === 'user' ? (
            <div className="text-sm text-slate-600 dark:text-slate-300">Selecciona un usuario para editar excepciones.</div>
          ) : null}

          {(mode === 'role' ? !!selectedRole : !!selectedUserId) && (
            <div className="space-y-6">
              {groupedPermissions.map(([key, perms]) => (
                <fieldset
                  key={key}
                  className="rounded-lg border border-slate-200 dark:border-slate-800"
                  aria-describedby={`perm-group-help-${key.replace(/\./g, '-')}`}
                >
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 w-full dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-3">
                      <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {getGroupLabel(key)}
                      </legend>

                      <button
                        type="button"
                        className="md:hidden text-xs font-medium rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                        onClick={() =>
                          setExpandedGroups((prev) => {
                            const next = new Set(prev)
                            if (next.has(key)) next.delete(key)
                            else next.add(key)
                            return next
                          })
                        }
                        aria-expanded={expandedGroups.has(key)}
                        aria-controls={`perm-group-${key.replace(/\./g, '-')}`}
                      >
                        {expandedGroups.has(key) ? 'Ocultar' : 'Mostrar'}
                      </button>
                    </div>
                  </div>
                  <p id={`perm-group-help-${key.replace(/\./g, '-')}`} className="sr-only">
                    Lista de permisos para {getGroupLabel(key)}.
                  </p>

                  {/* Mobile (collapsible) */}
                  {expandedGroups.has(key) ? (
                    <div
                      id={`perm-group-${key.replace(/\./g, '-')}`}
                      className="md:hidden p-4 grid grid-cols-1 gap-3"
                    >
                      {perms.map((p) => {
                        const inputId = `perm-${p.id}`
                        return (
                          <div key={p.id} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                            <input
                              id={inputId}
                              type="checkbox"
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-700 dark:bg-slate-950"
                              checked={selectedPermissionIds.has(p.id)}
                              onChange={() => togglePermission(p.id)}
                            />
                            <label htmlFor={inputId} className="cursor-pointer">
                              <span className="font-medium">{formatPermissionNameEs(p)}</span>
                              <span className="block text-xs text-slate-500 dark:text-slate-400 font-mono">
                                {p.app_label}.{p.model}.{p.codename}
                              </span>
                            </label>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}

                  {/* Desktop (always expanded) */}
                  <div className="hidden md:grid p-4 grid-cols-2 gap-3">
                    {perms.map((p) => {
                      const inputId = `perm-${p.id}`
                      return (
                        <div key={p.id} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                          <input
                            id={inputId}
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-700 dark:bg-slate-950"
                            checked={selectedPermissionIds.has(p.id)}
                            onChange={() => togglePermission(p.id)}
                          />
                          <label htmlFor={inputId} className="cursor-pointer">
                            <span className="font-medium">{formatPermissionNameEs(p)}</span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400 font-mono">
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
