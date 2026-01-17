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
      <CardContent>
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
          <p className="text-slate-600 dark:text-slate-300">Cargando…</p>
        ) : (
          <div className="space-y-4">
            {error ? (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-rose-950/30 dark:text-rose-200">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Pendientes: {count}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={load} disabled={loading}>
                  Actualizar
                </Button>
                <Button variant="outline" onClick={() => navigate('/attendance')}>
                  Volver
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
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
                              <Pill text="Cerrada" className="bg-amber-50 text-amber-800 border-amber-200" />
                            ) : (
                              <Pill text="Abierta" className="bg-emerald-50 text-emerald-700 border-emerald-200" />
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex flex-wrap gap-2">
                              <Button variant="outline" onClick={() => navigate(`/attendance/sessions/${s.id}`)}>
                                Ver
                              </Button>
                              <Button
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

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="text-slate-500 dark:text-slate-400">
                Página {page} de {totalPages}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Anterior
                </Button>
                <Button variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
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
