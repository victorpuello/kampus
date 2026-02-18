import { useEffect, useMemo, useState } from 'react'

import { Button } from '../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card'
import { ConfirmationModal } from '../components/ui/ConfirmationModal'
import { Input } from '../components/ui/Input'
import { electionsApi, getApiErrorMessage, type ElectionProcessItem, type ElectionRoleItem } from '../services/elections'
import { useAuthStore } from '../store/auth'

export default function ElectionRolesManage() {
  const user = useAuthStore((s) => s.user)
  const canManage = user?.role === 'SUPERADMIN' || user?.role === 'ADMIN'

  const [processes, setProcesses] = useState<ElectionProcessItem[]>([])
  const [roles, setRoles] = useState<ElectionRoleItem[]>([])
  const [processId, setProcessId] = useState('')
  const [code, setCode] = useState<'PERSONERO' | 'CONTRALOR'>('PERSONERO')
  const [title, setTitle] = useState('Personería Estudiantil')
  const [description, setDescription] = useState('')
  const [displayOrder, setDisplayOrder] = useState('1')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingRoleId, setDeletingRoleId] = useState<number | null>(null)
  const [roleToDelete, setRoleToDelete] = useState<ElectionRoleItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const processOptions = useMemo(() => processes.map((item) => ({ value: String(item.id), label: item.name })), [processes])

  const loadData = async () => {
    if (!canManage) return
    setLoading(true)
    setError(null)
    try {
      const [processResponse, roleResponse] = await Promise.all([
        electionsApi.listProcesses(),
        electionsApi.listRoles(),
      ])
      setProcesses(processResponse.results)
      setRoles(roleResponse.results)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible cargar procesos y cargos.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage])

  useEffect(() => {
    setTitle(code === 'PERSONERO' ? 'Personería Estudiantil' : 'Contraloría Estudiantil')
  }, [code])

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canManage) return

    const parsedProcessId = Number(processId)
    const parsedOrder = Number(displayOrder || '1')

    if (!Number.isFinite(parsedProcessId) || parsedProcessId <= 0) {
      setError('Debes seleccionar una jornada electoral.')
      return
    }

    if (!title.trim()) {
      setError('Debes ingresar el título del cargo.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await electionsApi.createRole({
        process: parsedProcessId,
        code,
        title: title.trim(),
        description: description.trim(),
        display_order: Number.isFinite(parsedOrder) && parsedOrder > 0 ? parsedOrder : 1,
      })
      setDescription('')
      setDisplayOrder('1')
      setSuccess('Cargo electoral creado correctamente.')
      await loadData()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible crear el cargo electoral.'))
    } finally {
      setSaving(false)
    }
  }

  const onRequestDeleteRole = (roleItem: ElectionRoleItem) => {
    setRoleToDelete(roleItem)
  }

  const onConfirmDeleteRole = async () => {
    if (!roleToDelete) return

    setDeletingRoleId(roleToDelete.id)
    setError(null)
    setSuccess(null)
    try {
      await electionsApi.deleteRole(roleToDelete.id)
      setSuccess('Cargo electoral eliminado correctamente.')
      setRoleToDelete(null)
      await loadData()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible eliminar el cargo electoral.'))
    } finally {
      setDeletingRoleId(null)
    }
  }

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sin permisos</CardTitle>
          <CardDescription>Solo superadmin y administrador pueden gestionar Gobierno Escolar.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cargos electorales</CardTitle>
          <CardDescription>Crea los cargos en Election Roles (solo Personería y Contraloría).</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Jornada</label>
              <select
                value={processId}
                onChange={(event) => setProcessId(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">Selecciona una jornada</option>
                {processOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Código</label>
              <select
                value={code}
                onChange={(event) => setCode(event.target.value as 'PERSONERO' | 'CONTRALOR')}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="PERSONERO">Personería</option>
                <option value="CONTRALOR">Contraloría</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Título</label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Orden</label>
              <Input type="number" min={1} value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Descripción</label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="md:col-span-2">
              <Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Crear cargo'}</Button>
            </div>
          </form>

          {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p> : null}
          {success ? <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-300">{success}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado de cargos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Cargando cargos...</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Jornada</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Código</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Título</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Orden</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                  {roles.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.process_name}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.code}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{item.title}</span>
                          {item.candidates_count > 0 ? (
                            <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                              Con candidaturas ({item.candidates_count})
                            </span>
                          ) : null}
                          {item.votes_count > 0 ? (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                              Con votos ({item.votes_count})
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.display_order}</td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={deletingRoleId === item.id || !item.can_delete}
                          title={
                            item.can_delete
                              ? 'Eliminar cargo'
                              : 'No se puede eliminar: el cargo tiene candidaturas o votos registrados.'
                          }
                          onClick={() => onRequestDeleteRole(item)}
                        >
                          {deletingRoleId === item.id ? 'Eliminando...' : 'Eliminar'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmationModal
        isOpen={Boolean(roleToDelete)}
        onClose={() => {
          if (!deletingRoleId) {
            setRoleToDelete(null)
          }
        }}
        onConfirm={() => void onConfirmDeleteRole()}
        title="Eliminar cargo electoral"
        description={
          roleToDelete
            ? `¿Estás seguro de eliminar el cargo ${roleToDelete.title} de la jornada ${roleToDelete.process_name}? Esta acción no se puede deshacer.`
            : '¿Estás seguro de eliminar este cargo?'
        }
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="destructive"
        loading={deletingRoleId !== null}
      />
    </div>
  )
}
