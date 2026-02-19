import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usersApi } from '../services/users'
import { rbacApi, type RbacPermission } from '../services/rbac'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { ArrowLeft, Save } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { formatPermissionGroupEs, formatPermissionNameEs } from '../lib/permissionsI18n'

export default function UserForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditing = !!id

  const me = useAuthStore((s) => s.user)
  const isTeacher = me?.role === 'TEACHER'
  const canManageRbac = me?.role === 'ADMIN' || me?.role === 'SUPERADMIN'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Password reset (admin)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState<string | null>(null)

  // RBAC (user exceptions)
  const [rbacLoading, setRbacLoading] = useState(false)
  const [rbacSaving, setRbacSaving] = useState(false)
  const [rbacError, setRbacError] = useState<string | null>(null)
  const [rbacSuccess, setRbacSuccess] = useState<string | null>(null)
  const [permissionSearch, setPermissionSearch] = useState('')

  const [permissions, setPermissions] = useState<RbacPermission[]>([])
  const [rolePermissionIds, setRolePermissionIds] = useState<Set<number>>(new Set())
  const [userPermissionIds, setUserPermissionIds] = useState<Set<number>>(new Set())
  const [effectivePermissionIds, setEffectivePermissionIds] = useState<Set<number>>(new Set())
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    role: 'STUDENT',
    password: '',
    is_active: true
  })

  useEffect(() => {
    if (isEditing && id) {
      setLoading(true)
      usersApi.getById(Number(id))
        .then(res => {
          const user = res.data
          setFormData(prev => ({
            ...prev,
            username: user.username || '',
            email: user.email || '',
            first_name: user.first_name || '',
            last_name: user.last_name || '',
            role: user.role || 'STUDENT',
            is_active: user.is_active ?? true,
          }))
        })
        .catch((err) => {
          console.error(err)
          setError('Error al cargar el usuario')
        })
        .finally(() => setLoading(false))
    }
  }, [id, isEditing])

  useEffect(() => {
    const run = async () => {
      if (!isEditing || !id) return
      if (!canManageRbac) return

      setRbacLoading(true)
      setRbacError(null)
      setRbacSuccess(null)

      try {
        const [permsRes, userPermsRes] = await Promise.all([
          rbacApi.listPermissions(),
          rbacApi.getUserPermissions(Number(id)),
        ])
        setPermissions(permsRes.data.permissions)
        setRolePermissionIds(new Set(userPermsRes.data.role_permission_ids))
        setUserPermissionIds(new Set(userPermsRes.data.user_permission_ids))
        setEffectivePermissionIds(new Set(userPermsRes.data.effective_permission_ids))
      } catch (e: unknown) {
        const maybe = e as { response?: { data?: { detail?: string } } }
        setRbacError(maybe?.response?.data?.detail || 'Error cargando permisos del usuario')
      } finally {
        setRbacLoading(false)
      }
    }

    run()
  }, [canManageRbac, id, isEditing])

  const groupedPermissions = useMemo(() => {
    const term = permissionSearch.trim().toLowerCase()
    const list = term
      ? permissions.filter((p) => {
          const key = `${p.app_label}.${p.model}.${p.codename} ${p.name}`.toLowerCase()
          return key.includes(term)
        })
      : permissions

    const groups: Record<string, RbacPermission[]> = {}
    for (const p of list) {
      const key = `${p.app_label}.${p.model}`
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [permissions, permissionSearch])

  if (isTeacher) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Usuarios</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">No tienes permisos para acceder a la gestión de usuarios.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/dashboard')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const toggleUserPermission = (permId: number) => {
    setUserPermissionIds((prev) => {
      const next = new Set(prev)
      if (next.has(permId)) next.delete(permId)
      else next.add(permId)
      return next
    })
  }

  const saveUserPermissions = async () => {
    if (!isEditing || !id) return

    setRbacSaving(true)
    setRbacError(null)
    setRbacSuccess(null)
    try {
      const ids = Array.from(userPermissionIds).sort((a, b) => a - b)
      await rbacApi.setUserPermissions(Number(id), ids)
      const refreshed = await rbacApi.getUserPermissions(Number(id))
      setRolePermissionIds(new Set(refreshed.data.role_permission_ids))
      setUserPermissionIds(new Set(refreshed.data.user_permission_ids))
      setEffectivePermissionIds(new Set(refreshed.data.effective_permission_ids))
      setRbacSuccess('Permisos del usuario actualizados')
    } catch (e: unknown) {
      const maybe = e as { response?: { data?: { detail?: string } } }
      setRbacError(maybe?.response?.data?.detail || 'Error guardando permisos del usuario')
    } finally {
      setRbacSaving(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target
    setFormData(prev => ({ ...prev, [name]: checked }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (isEditing) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...dataToUpdate } = formData
        await usersApi.update(Number(id), dataToUpdate)
      } else {
        await usersApi.create(formData)
      }
      navigate('/users')
    } catch (e: unknown) {
      const maybe = e as { response?: { data?: { detail?: string } } }
      setError(maybe?.response?.data?.detail || 'Error al guardar el usuario')
    } finally {
      setLoading(false)
    }
  }

  const handleSavePassword = async () => {
    if (!isEditing || !id) return
    setPwError(null)
    setPwSuccess(null)

    const trimmed = pw.trim()
    if (!trimmed) {
      setPwError('Ingresa una nueva contraseña')
      return
    }
    if (trimmed.length < 8) {
      setPwError('La contraseña debe tener mínimo 8 caracteres')
      return
    }
    if (trimmed !== pw2.trim()) {
      setPwError('Las contraseñas no coinciden')
      return
    }

    setPwSaving(true)
    try {
      await usersApi.setPassword(Number(id), trimmed)
      setPw('')
      setPw2('')
      setPwSuccess('Contraseña actualizada')
    } catch (e: unknown) {
      const maybe = e as { response?: { data?: { detail?: string } } }
      setPwError(maybe?.response?.data?.detail || 'Error actualizando la contraseña')
    } finally {
      setPwSaving(false)
    }
  }

  if (loading && isEditing) return <div className="p-6">Cargando...</div>

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <Button variant="ghost" size="sm" className="min-h-11 w-full sm:w-auto" onClick={() => navigate('/users')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
          {isEditing ? 'Editar Usuario' : 'Nuevo Usuario'}
        </h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Información de la Cuenta</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-200">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="username">Nombre de Usuario</Label>
                <Input
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  required
                  disabled={isEditing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="first_name">Nombres</Label>
                <Input
                  id="first_name"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="last_name">Apellidos</Label>
                <Input
                  id="last_name"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Rol</Label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="flex h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:scheme-dark"
                >
                  <option value="STUDENT">Estudiante</option>
                  <option value="TEACHER">Docente</option>
                  <option value="COORDINATOR">Coordinador</option>
                  <option value="SECRETARY">Secretaría</option>
                  <option value="ADMIN">Administrador</option>
                  <option value="SUPERADMIN">Super Admin</option>
                  <option value="PARENT">Acudiente</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="is_active">Estado</Label>
                <div className="flex min-h-11 items-center">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="is_active"
                      checked={formData.is_active}
                      onChange={handleCheckboxChange}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-200">Usuario Activo</span>
                  </label>
                </div>
              </div>

              {!isEditing && (
                <div className="space-y-2 lg:col-span-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleChange}
                    required={!isEditing}
                    minLength={8}
                  />
                  <p className="text-xs text-slate-500">Mínimo 8 caracteres.</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={loading}>
                <Save className="mr-2 h-4 w-4" />
                {loading ? 'Guardando...' : 'Guardar Usuario'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isEditing && (me?.role === 'ADMIN' || me?.role === 'SUPERADMIN') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-slate-900 dark:text-slate-100">Contraseña</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {me?.role === 'ADMIN' && formData.role === 'SUPERADMIN' ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                Solo SUPERADMIN puede cambiar la contraseña de un usuario SUPERADMIN.
              </div>
            ) : (
              <>
                {pwError && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-200">{pwError}</div>
                )}
                {pwSuccess && (
                  <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200">{pwSuccess}</div>
                )}

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="new_password">Nueva contraseña</Label>
                    <Input
                      id="new_password"
                      type="password"
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new_password_2">Confirmar contraseña</Label>
                    <Input
                      id="new_password_2"
                      type="password"
                      value={pw2}
                      onChange={(e) => setPw2(e.target.value)}
                      placeholder="Repite la contraseña"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="button" className="min-h-11 w-full sm:w-auto" onClick={handleSavePassword} disabled={pwSaving}>
                    {pwSaving ? 'Guardando...' : 'Guardar contraseña'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {isEditing && canManageRbac && (
        <Card>
          <CardHeader>
            <CardTitle className="text-slate-900 dark:text-slate-100">Permisos (excepciones por usuario)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {me?.role === 'ADMIN' && formData.role === 'SUPERADMIN' ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                Solo SUPERADMIN puede modificar permisos de un usuario SUPERADMIN.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <div className="text-xs uppercase text-slate-500">Rol</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formData.role}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Permisos del rol: {rolePermissionIds.size}</div>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <div className="text-xs uppercase text-slate-500">Excepciones</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Usuario</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Asignados: {userPermissionIds.size}</div>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <div className="text-xs uppercase text-slate-500">Efectivos</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Rol + Usuario</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Total: {effectivePermissionIds.size}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="permissionSearch">Buscar permiso</Label>
                  <Input
                    id="permissionSearch"
                    value={permissionSearch}
                    onChange={(e) => setPermissionSearch(e.target.value)}
                    placeholder="Ej: academic.view_dimension"
                  />
                  <p className="text-xs text-slate-500">
                    Aquí solo asignas excepciones; se suman a los permisos del rol.
                  </p>
                </div>

                {rbacError && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-200">
                    {rbacError}
                  </div>
                )}
                {rbacSuccess && (
                  <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200">
                    {rbacSuccess}
                  </div>
                )}

                {rbacLoading ? (
                  <div className="text-sm text-slate-600">Cargando permisos...</div>
                ) : (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                      {groupedPermissions.length === 0 ? (
                        <div className="p-4 text-sm text-slate-600 dark:text-slate-300">No hay permisos para mostrar.</div>
                      ) : (
                        groupedPermissions.map(([key, perms]) => (
                          <div key={key} className="p-4">
                            <div className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {(() => {
                                const [appLabel, model] = key.split('.') as [string, string]
                                return formatPermissionGroupEs(appLabel, model)
                              })()}
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                              {perms.map((p) => (
                                <label key={p.id} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                                    checked={userPermissionIds.has(p.id)}
                                    onChange={() => toggleUserPermission(p.id)}
                                  />
                                  <span>
                                    <span className="font-medium">{formatPermissionNameEs(p)}</span>
                                    <span className="block text-xs text-slate-500 font-mono">
                                      {p.app_label}.{p.model}.{p.codename}
                                    </span>
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button type="button" className="min-h-11 w-full sm:w-auto" onClick={saveUserPermissions} disabled={rbacSaving || rbacLoading}>
                    {rbacSaving ? 'Guardando...' : 'Guardar permisos'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
