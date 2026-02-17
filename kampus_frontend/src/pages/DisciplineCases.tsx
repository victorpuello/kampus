import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { useAuthStore } from '../store/auth'
import { enrollmentsApi, type Enrollment } from '../services/enrollments'
import {
  disciplineApi,
  type DisciplineCaseListItem,
  type DisciplineLaw1620Type,
  type DisciplineManualSeverity,
} from '../services/discipline'

const canAccess = (role?: string) =>
  role === 'TEACHER' || role === 'COORDINATOR' || role === 'ADMIN' || role === 'SUPERADMIN' || role === 'PARENT'

const statusLabel = (s: string) => {
  switch (s) {
    case 'OPEN':
      return 'Abierto'
    case 'DECIDED':
      return 'Decidido'
    case 'CLOSED':
      return 'Cerrado'
    default:
      return s
  }
}

export default function DisciplineCases() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const isParent = user?.role === 'PARENT'
  const isTeacher = user?.role === 'TEACHER'
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN'
  const canCreate = isTeacher || isAdmin

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<DisciplineCaseListItem[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [hasNext, setHasNext] = useState(false)
  const [hasPrevious, setHasPrevious] = useState(false)

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [loadingEnrollments, setLoadingEnrollments] = useState(false)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [enrollmentId, setEnrollmentId] = useState<number | ''>('')
  const [search, setSearch] = useState('')

  const [occurredAtLocal, setOccurredAtLocal] = useState('')
  const [location, setLocation] = useState('')
  const [narrative, setNarrative] = useState('')
  const [severity, setSeverity] = useState<DisciplineManualSeverity>('MINOR')
  const [lawType, setLawType] = useState<DisciplineLaw1620Type>('I')
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([])
  const [evidenceUploadTotal, setEvidenceUploadTotal] = useState(0)
  const [evidenceUploadDone, setEvidenceUploadDone] = useState(0)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const fileKey = (f: File) => `${f.name}-${f.size}-${f.lastModified}`

  const toDatetimeLocalValue = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const enrollmentStudentLabel = useCallback((enr: Enrollment): string => {
    const student = typeof enr.student === 'object' && enr.student ? enr.student : null
    const fullName = (student && 'full_name' in student ? String(student.full_name || '') : '').trim()
    const doc = (student && 'document_number' in student ? String(student.document_number || '') : '').trim()
    const group = typeof enr.group === 'object' && enr.group ? (enr.group as { name?: string }).name : ''
    const groupLabel = (group || '').trim()
    const base = fullName || `Estudiante ${student && 'id' in student ? String(student.id) : ''}`.trim()
    const meta = [doc ? `Doc: ${doc}` : null, groupLabel ? `Grupo: ${groupLabel}` : null].filter(Boolean).join(' · ')
    return meta ? `${base} — ${meta}` : base
  }, [])

  const loadEnrollments = async (q?: string) => {
    setLoadingEnrollments(true)
    try {
      if (isTeacher) {
        const res = await enrollmentsApi.my({ page: 1, page_size: 200, ...(q ? { q } : {}) })
        setEnrollments(res.data?.results ?? [])
      } else if (isAdmin) {
        const res = await enrollmentsApi.list({
          page: 1,
          page_size: 200,
          status: 'ACTIVE',
          ...(q ? { search: q } : {}),
        })
        setEnrollments(res.data?.results ?? [])
      } else {
        setEnrollments([])
      }
    } catch (e) {
      console.error(e)
      setEnrollments([])
      setCreateError('No se pudieron cargar las matrículas permitidas para registrar el caso.')
    } finally {
      setLoadingEnrollments(false)
    }
  }

  const openCreateModal = async () => {
    setCreateError(null)
    setEnrollmentId('')
    setSearch('')
    setOccurredAtLocal(toDatetimeLocalValue(new Date()))
    setLocation('')
    setNarrative('')
    setSeverity('MINOR')
    setLawType('I')
    setEvidenceFiles([])
    setEvidenceUploadTotal(0)
    setEvidenceUploadDone(0)
    setIsCreateOpen(true)
    await loadEnrollments()
  }

  const filteredEnrollments = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return enrollments
    return enrollments.filter((enr) => enrollmentStudentLabel(enr).toLowerCase().includes(q))
  }, [enrollments, search, enrollmentStudentLabel])

  const submitCreate = async () => {
    if (enrollmentId === '') {
      setCreateError('Selecciona un estudiante (matrícula).')
      return
    }
    if (!occurredAtLocal) {
      setCreateError('Selecciona la fecha y hora del hecho.')
      return
    }
    if (!narrative.trim()) {
      setCreateError('La descripción es obligatoria.')
      return
    }

    try {
      setCreating(true)
      setCreateError(null)
      setEvidenceUploadTotal(0)
      setEvidenceUploadDone(0)
      const res = await disciplineApi.create({
        enrollment_id: Number(enrollmentId),
        occurred_at: new Date(occurredAtLocal).toISOString(),
        location: location.trim() || undefined,
        narrative: narrative.trim(),
        manual_severity: severity,
        law_1620_type: lawType,
      })
      const id = res.data?.id
      let uploadToast: { message: string; type: 'success' | 'error' | 'info' } | undefined
      let uploadFailures: string[] | undefined
      if (id && evidenceFiles.length > 0) {
        const failures: string[] = []
        setEvidenceUploadTotal(evidenceFiles.length)
        setEvidenceUploadDone(0)
        for (const file of evidenceFiles) {
          try {
            await disciplineApi.addAttachment(id, { file, kind: 'EVIDENCE' })
          } catch (e) {
            console.error(e)
            failures.push(file.name)
          } finally {
            setEvidenceUploadDone((v) => v + 1)
          }
        }
        if (failures.length > 0) {
          uploadToast = {
            type: 'error',
            message: `El caso se creó, pero falló la carga de ${failures.length} evidencia(s): ${failures.slice(0, 3).join(', ')}${failures.length > 3 ? '…' : ''}`,
          }
          uploadFailures = failures
        }
      }
      setIsCreateOpen(false)
      if (id)
        navigate(`/discipline/cases/${id}`, {
          state: uploadToast
            ? {
                toast: uploadToast,
                uploadFailures,
              }
            : undefined,
        })
    } catch (e) {
      console.error(e)
      setCreateError('No se pudo registrar el caso.')
    } finally {
      setCreating(false)
    }
  }

  useEffect(() => {
    if (!canAccess(user?.role)) return

    let mounted = true
    setLoading(true)
    setError(null)

    disciplineApi
      .list({ page, page_size: pageSize })
      .then((res) => {
        if (!mounted) return
        setItems(res.data?.results || [])
        setCount(typeof res.data?.count === 'number' ? res.data.count : 0)
        setHasNext(Boolean(res.data?.next))
        setHasPrevious(Boolean(res.data?.previous))
      })
      .catch((e) => {
        if (!mounted) return
        console.error(e)
        setError('No se pudieron cargar los casos')
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [page, pageSize, user?.role])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / pageSize)), [count, pageSize])

  const pageNumbers = useMemo(() => {
    const pages: Array<number | 'ellipsis'> = []
    if (totalPages <= 7) {
      for (let p = 1; p <= totalPages; p++) pages.push(p)
      return pages
    }

    pages.push(1)
    const start = Math.max(2, page - 1)
    const end = Math.min(totalPages - 1, page + 1)

    if (start > 2) pages.push('ellipsis')
    for (let p = start; p <= end; p++) pages.push(p)
    if (end < totalPages - 1) pages.push('ellipsis')
    pages.push(totalPages)
    return pages
  }, [page, totalPages])

  const startIndex = useMemo(() => (count === 0 ? 0 : (page - 1) * pageSize + 1), [count, page, pageSize])
  const endIndex = useMemo(() => Math.min(page * pageSize, count), [count, page, pageSize])

  if (!canAccess(user?.role)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Convivencia</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">No tienes permisos para acceder al módulo de convivencia.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading)
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
        Cargando…
      </div>
    )
  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
        {error}
      </div>
    )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Convivencia</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {isParent ? 'Casos asociados a tus acudidos.' : 'Casos registrados en el observador (MVP).'}
          </p>
        </div>

        {canCreate && (
          <div className="w-full lg:w-auto">
            <Button className="min-h-11 w-full bg-cyan-600 text-white hover:bg-cyan-700 lg:w-auto" onClick={openCreateModal}>
              Registrar caso
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Casos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {count === 0 ? 'Sin casos.' : `Mostrando ${startIndex}-${endIndex} de ${count} • Página ${page} de ${totalPages}`}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:items-center">
              <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
                <span className="text-sm text-slate-500 dark:text-slate-400">Por página</span>
                <select
                  className="h-11 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-800 dark:bg-slate-900/80"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!hasPrevious || page <= 1}
              >
                Anterior
              </Button>

              <div className="hidden xl:flex items-center gap-1">
                {pageNumbers.map((p, idx) =>
                  p === 'ellipsis' ? (
                    <span key={`e-${idx}`} className="px-2 text-slate-500 dark:text-slate-400">
                      …
                    </span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === page ? 'secondary' : 'outline'}
                      size="sm"
                      className="min-h-11"
                      onClick={() => setPage(p)}
                      aria-current={p === page ? 'page' : undefined}
                    >
                      {p}
                    </Button>
                  )
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={!hasNext}
              >
                Siguiente
              </Button>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 xl:hidden">
            {items.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                No hay casos.
              </div>
            ) : (
              items.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {c.student_full_name || `#${c.student_id}`}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {(c.grade_name || '-') + ' / ' + (c.group_name || '-')}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {new Date(c.occurred_at).toLocaleString()}
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200">
                        {statusLabel(c.status)}
                      </span>
                      {c.sealed_at ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200">
                          Sellado
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Ley 1620: {c.law_1620_type}</span>
                    <Link to={`/discipline/cases/${c.id}`} className="text-blue-600 dark:text-blue-300 hover:underline">
                      Ver
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden xl:block overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-700 dark:text-slate-200">
              <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-linear-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-semibold">Fecha</th>
                  <th className="px-6 py-4 font-semibold">Estudiante</th>
                  <th className="px-6 py-4 font-semibold">Grado/Grupo</th>
                  <th className="px-6 py-4 font-semibold">Ley 1620</th>
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((c) => (
                  <tr key={c.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                    <td className="px-6 py-4">{new Date(c.occurred_at).toLocaleString()}</td>
                    <td className="px-6 py-4">{c.student_full_name || `#${c.student_id}`}</td>
                    <td className="px-6 py-4">{(c.grade_name || '-') + ' / ' + (c.group_name || '-')}</td>
                    <td className="px-6 py-4">{c.law_1620_type}</td>
                    <td className="px-6 py-4">

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200">
                          {statusLabel(c.status)}
                        </span>
                        {c.sealed_at && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200">
                            Sellado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Link to={`/discipline/cases/${c.id}`} className="text-blue-600 dark:text-blue-300 hover:underline">
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td className="px-6 py-6 text-slate-500 dark:text-slate-400" colSpan={6}>
                      No hay casos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {isCreateOpen && canCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-2">
          <div
            className="fixed inset-0 bg-black/50 transition-opacity backdrop-blur-sm"
            onClick={() => {
              if (!creating) setIsCreateOpen(false)
            }}
          />
          <div className="relative z-50 max-h-[85vh] w-full max-w-xl transform overflow-y-auto rounded-lg bg-white p-4 shadow-xl transition-all sm:mx-auto sm:p-6 animate-in fade-in zoom-in-95 duration-200 dark:bg-slate-900">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold leading-6 text-slate-900 dark:text-slate-100">Registrar caso (Observador)</h3>
              <button
                onClick={() => {
                  if (!creating) setIsCreateOpen(false)
                }}
                className="rounded-full p-1 text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
                disabled={creating}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {createError && (
                <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md dark:bg-rose-950/30 dark:text-rose-200">{createError}</div>
              )}

              {creating && evidenceUploadTotal > 0 ? (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Subiendo evidencias: {Math.min(evidenceUploadDone, evidenceUploadTotal)}/{evidenceUploadTotal}
                </div>
              ) : null}

              {isAdmin && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Vista administrativa: se cargan hasta 200 matrículas activas (usa el buscador para filtrar).
                </div>
              )}

              <div>
                <Label>Fecha y hora del hecho</Label>
                <Input
                  className="h-11"
                  type="datetime-local"
                  value={occurredAtLocal}
                  onChange={(e) => setOccurredAtLocal(e.target.value)}
                  disabled={creating}
                />
              </div>

              <div>
                <Label>Buscar estudiante (opcional)</Label>
                <Input
                  className="h-11"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nombre o documento…"
                  disabled={creating}
                />
              </div>

              <div>
                <Label>Estudiante (matrícula)</Label>
                <select
                  className="flex h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-100 dark:scheme-dark"
                  value={enrollmentId}
                  onChange={(e) => setEnrollmentId(e.target.value ? Number(e.target.value) : '')}
                  disabled={loadingEnrollments || creating}
                >
                  <option value="">{loadingEnrollments ? 'Cargando…' : '— Selecciona —'}</option>
                  {filteredEnrollments.map((enr) => (
                    <option key={enr.id} value={enr.id}>
                      {enrollmentStudentLabel(enr)}
                    </option>
                  ))}
                </select>
                {!loadingEnrollments && enrollments.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    No hay matrículas activas disponibles (o no tienes acceso).
                  </p>
                ) : null}
              </div>

              <div>
                <Label>Lugar (opcional)</Label>
                <Input className="h-11" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ej: Salón, Patio…" disabled={creating} />
              </div>

              <div>
                <Label>Descripción (obligatoria)</Label>
                <textarea
                  className="min-h-[120px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500"
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value)}
                  placeholder="Describe lo ocurrido de forma objetiva…"
                  disabled={creating}
                />
              </div>

              <div>
                <Label>Evidencias (opcional)</Label>
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*,audio/*"
                  className="mt-1 block w-full text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200 dark:text-slate-200 dark:file:bg-slate-800 dark:hover:file:bg-slate-700"
                  disabled={creating}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || [])
                    if (files.length === 0) return
                    setEvidenceFiles((prev) => {
                      const merged = [...prev, ...files]
                      const dedup = new Map<string, File>()
                      for (const f of merged) dedup.set(fileKey(f), f)
                      return Array.from(dedup.values())
                    })
                    // Allow selecting the same file again if the user wants.
                    e.currentTarget.value = ''
                  }}
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Puedes adjuntar fotos, audios o videos. Se subirán automáticamente después de crear el caso.
                </p>
                {evidenceFiles.length > 0 && (
                  <div className="mt-2 rounded-md border border-slate-200 p-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    <div className="flex items-center justify-between">
                      <span>{evidenceFiles.length} archivo(s) seleccionados</span>
                      <button
                        type="button"
                        className="text-blue-600 hover:underline dark:text-blue-300"
                        onClick={() => setEvidenceFiles([])}
                        disabled={creating}
                      >
                        Limpiar
                      </button>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {evidenceFiles.slice(0, 8).map((f) => (
                        <li key={fileKey(f)} className="flex items-center justify-between gap-3">
                          <span className="truncate" title={f.name}>
                            {f.name}
                          </span>
                          <button
                            type="button"
                            className="shrink-0 text-slate-500 hover:text-slate-900 hover:underline dark:text-slate-300 dark:hover:text-slate-100"
                            onClick={() => setEvidenceFiles((prev) => prev.filter((x) => fileKey(x) !== fileKey(f)))}
                            disabled={creating}
                          >
                            Quitar
                          </button>
                        </li>
                      ))}
                      {evidenceFiles.length > 8 ? <li className="text-slate-500 dark:text-slate-400">…</li> : null}
                    </ul>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Severidad (manual)</Label>
                  <select
                    className="flex h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-100 dark:scheme-dark"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as DisciplineManualSeverity)}
                    disabled={creating}
                  >
                    <option value="MINOR">Leve</option>
                    <option value="MAJOR">Grave</option>
                    <option value="VERY_MAJOR">Muy grave</option>
                  </select>
                </div>
                <div>
                  <Label>Tipo Ley 1620</Label>
                  <select
                    className="flex h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-100 dark:scheme-dark"
                    value={lawType}
                    onChange={(e) => setLawType(e.target.value as DisciplineLaw1620Type)}
                    disabled={creating}
                  >
                    <option value="I">Tipo I</option>
                    <option value="II">Tipo II</option>
                    <option value="III">Tipo III</option>
                    <option value="UNKNOWN">No definido</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  variant="outline"
                  className="min-h-11 w-full sm:w-auto"
                  onClick={() => loadEnrollments(search.trim() || undefined)}
                  disabled={loadingEnrollments || creating}
                >
                  Recargar
                </Button>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {loadingEnrollments ? 'Cargando…' : `${filteredEnrollments.length} opciones`}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button className="min-h-11 w-full sm:w-auto" variant="outline" onClick={() => setIsCreateOpen(false)} disabled={creating}>
                Cancelar
              </Button>
              <Button className="min-h-11 w-full bg-cyan-600 text-white hover:bg-cyan-700 sm:w-auto" onClick={submitCreate} disabled={creating}>
                {creating
                  ? evidenceUploadTotal > 0
                    ? `Registrando… (${Math.min(evidenceUploadDone, evidenceUploadTotal)}/${evidenceUploadTotal})`
                    : 'Registrando…'
                  : 'Registrar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
