import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { ConfirmationModal } from '../../components/ui/ConfirmationModal'
import { Pill } from '../../components/ui/Pill'
import { Toast, type ToastType } from '../../components/ui/Toast'
import {
  deleteAttendanceSession,
  listPendingDeletionAttendanceSessions,
  type AttendanceSession,
  type PaginatedResponse,
} from '../../services/attendance'

function formatDateTime(value: string | null | undefined) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

function isPaginated<T>(value: unknown): value is PaginatedResponse<T> {
  return typeof value === 'object' && value !== null && 'results' in value && 'count' in value
}

export default function AttendanceDeletionRequests() {
  const navigate = useNavigate()

  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<AttendanceSession[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteModalSessionId, setDeleteModalSessionId] = useState<number | null>(null)

  const totalPages = Math.max(1, Math.ceil((count || 0) / pageSize))

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listPendingDeletionAttendanceSessions({ page, page_size: pageSize })
      if (isPaginated<AttendanceSession>(res)) {
        setItems(res.results)
        setCount(res.count)
      } else {
        setItems(res)
        setCount(Array.isArray(res) ? res.length : 0)
      }
    } catch (err) {
      console.error(err)
      setError('No se pudieron cargar las solicitudes de eliminación.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const rows = useMemo(() => items, [items])

  const openDeleteDefinitiveModal = (sessionId: number) => {
    setDeleteModalSessionId(sessionId)
    setDeleteModalOpen(true)
  }

  const handleDeleteDefinitiveConfirmed = async () => {
    if (!deleteModalSessionId) return

    setDeletingId(deleteModalSessionId)
    try {
      await deleteAttendanceSession(deleteModalSessionId)
      showToast('Planilla eliminada definitivamente.', 'success')
      await load()
    } catch (err) {
      console.error(err)
      showToast('No se pudo eliminar la planilla. Verifica permisos o que exista solicitud.', 'error')
    } finally {
      setDeletingId(null)
      setDeleteModalOpen(false)
      setDeleteModalSessionId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Solicitudes de eliminación (Asistencias)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={() => setToast((t) => ({ ...t, isVisible: false }))}
        />

        <ConfirmationModal
          isOpen={deleteModalOpen}
          onClose={() => {
            if (deletingId) return
            setDeleteModalOpen(false)
            setDeleteModalSessionId(null)
          }}
          onConfirm={handleDeleteDefinitiveConfirmed}
          title="Eliminar definitivamente"
          description={deleteModalSessionId ? `Esto eliminará definitivamente la planilla #${deleteModalSessionId}.` : 'Esto eliminará definitivamente la planilla.'}
          confirmText="Eliminar definitivo"
          cancelText="Cancelar"
          variant="destructive"
          loading={Boolean(deletingId) && deletingId === deleteModalSessionId}
        />

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
            Cargando…
          </div>
        ) : (
          <div className="space-y-4">
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
                {error}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Pendientes: {count}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button className="min-h-11 w-full sm:w-auto" variant="outline" onClick={load} disabled={loading}>
                  Actualizar
                </Button>
                <Button className="min-h-11 w-full sm:w-auto" variant="outline" onClick={() => navigate('/attendance')}>
                  Volver
                </Button>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="xl:hidden space-y-3 sm:space-y-4">
              {rows.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  No hay solicitudes pendientes.
                </div>
              ) : (
                rows.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Planilla #{s.id}</div>
                        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {s.subject_name || 'Materia'} · {s.group_display || s.group_name || 'Grupo'}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {s.locked_at ? (
                          <Pill text="Cerrada" className="bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/40" />
                        ) : (
                          <Pill text="Abierta" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/40" />
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Fecha:</span> {s.class_date}
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Solicitada:</span> {formatDateTime(s.deletion_requested_at ?? null)}
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-slate-500 dark:text-slate-400">Docente:</span> {s.teacher_name || `ID ${s.teacher_id ?? ''}`}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-2">
                      <Button className="min-h-11 w-full" variant="outline" onClick={() => navigate(`/attendance/sessions/${s.id}`)}>
                        Ver
                      </Button>
                      <Button
                        className="min-h-11 w-full"
                        variant="destructive"
                        onClick={() => openDeleteDefinitiveModal(s.id)}
                        disabled={deletingId === s.id}
                      >
                        {deletingId === s.id ? 'Eliminando…' : 'Eliminar definitivo'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden xl:block overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200 dark:text-slate-300 dark:from-slate-900 dark:to-slate-800 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Docente</th>
                      <th className="px-4 py-3">Grupo</th>
                      <th className="px-4 py-3">Materia</th>
                      <th className="px-4 py-3">Solicitada</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-slate-600 dark:text-slate-300" colSpan={8}>
                          No hay solicitudes pendientes.
                        </td>
                      </tr>
                    ) : (
                      rows.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                          <td className="px-4 py-3 whitespace-nowrap">{s.id}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{s.class_date}</td>
                          <td className="px-4 py-3">{s.teacher_name || `ID ${s.teacher_id ?? ''}`}</td>
                          <td className="px-4 py-3">{s.group_display || s.group_name}</td>
                          <td className="px-4 py-3">{s.subject_name || 'Materia'}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(s.deletion_requested_at ?? null)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {s.locked_at ? (
                              <Pill text="Cerrada" className="bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/40" />
                            ) : (
                              <Pill text="Abierta" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/40" />
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex flex-wrap gap-2">
                              <Button className="min-h-11" variant="outline" onClick={() => navigate(`/attendance/sessions/${s.id}`)}>
                                Ver
                              </Button>
                              <Button
                                className="min-h-11"
                                variant="destructive"
                                onClick={() => openDeleteDefinitiveModal(s.id)}
                                disabled={deletingId === s.id}
                              >
                                {deletingId === s.id ? 'Eliminando…' : 'Eliminar definitivo'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="text-slate-500 dark:text-slate-400">
                Página {page} de {totalPages}
              </div>
              <div className="flex gap-2">
                <Button className="min-h-11 w-full sm:w-auto" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Anterior
                </Button>
                <Button className="min-h-11 w-full sm:w-auto" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  Siguiente
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
