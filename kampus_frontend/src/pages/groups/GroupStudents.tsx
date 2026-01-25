import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Toast, type ToastType } from '../../components/ui/Toast'
import { academicApi, type Group, type Period, type TeacherAssignment } from '../../services/academic'
import { downloadAttendanceManualSheetPdf } from '../../services/attendance'
import { enrollmentsApi, type Enrollment } from '../../services/enrollments'
import { useAuthStore } from '../../store/auth'

type LocationState = {
  group?: Group
}

function getStudent(enrollment: Enrollment): { id: number | null; fullName: string; document: string } {
  const raw = enrollment.student
  if (typeof raw === 'number' || raw === null || raw === undefined) {
    return { id: typeof raw === 'number' ? raw : null, fullName: `Estudiante #${String(raw ?? '')}`.trim(), document: '' }
  }

  return {
    id: raw.id ?? null,
    fullName: raw.full_name || '',
    document: raw.document_number || '',
  }
}

export default function GroupStudents() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const { groupId } = useParams<{ groupId: string }>()
  const state = (location.state as LocationState | null) ?? null

  const numericGroupId = Number(groupId)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false,
  })

  const [group, setGroup] = useState<Group | null>(state?.group ?? null)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [totalCount, setTotalCount] = useState(0)

  const [printing, setPrinting] = useState(false)
  const [printingGrades, setPrintingGrades] = useState(false)

  const [periods, setPeriods] = useState<Period[]>([])
  const [gradeSheetAssignments, setGradeSheetAssignments] = useState<TeacherAssignment[]>([])
  const [gradeSheetAssignmentId, setGradeSheetAssignmentId] = useState('')
  const [gradeSheetAssignmentsLoading, setGradeSheetAssignmentsLoading] = useState(false)
  const [isGradeSheetModalOpen, setIsGradeSheetModalOpen] = useState(false)
  const [gradeSheetPeriodId, setGradeSheetPeriodId] = useState('')
  const [gradeSheetSubject, setGradeSheetSubject] = useState('')
  const [gradeSheetTeacher, setGradeSheetTeacher] = useState('')

  const [statusFilter, setStatusFilter] = useState<'ALL' | Enrollment['status']>('ACTIVE')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    if (!Number.isFinite(numericGroupId) || numericGroupId <= 0) {
      setError('Grupo inválido.')
      return
    }

    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        setError(null)

        if (!state?.group) {
          const res = await academicApi.getGroup(numericGroupId)
          if (!cancelled) setGroup(res.data)
        }

        const params: Record<string, unknown> = {
          group: numericGroupId,
          page,
          page_size: pageSize,
        }

        if (statusFilter !== 'ALL') params.status = statusFilter
        if (debouncedQuery.trim()) params.search = debouncedQuery.trim()

        const res = await enrollmentsApi.list(params)
        if (cancelled) return

        setEnrollments(res.data?.results ?? [])
        setTotalCount(res.data?.count ?? 0)
      } catch (e) {
        console.error(e)
        if (!cancelled) setError('No se pudo cargar la lista de estudiantes del grupo.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [debouncedQuery, numericGroupId, page, pageSize, state?.group, statusFilter])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    // Reset to first page when filters change
    setPage(1)
  }, [debouncedQuery, pageSize, statusFilter])

  const title = useMemo(() => {
    if (!group) return `Grupo #${numericGroupId}`
    const grade = group.grade_name ? `${group.grade_name} ` : ''
    return `${grade}${group.name}`.trim()
  }, [group, numericGroupId])

  const subtitle = useMemo(() => {
    if (!group) return null

    const bits: string[] = []
    if (group.campus_name) bits.push(group.campus_name)
    if (group.shift) bits.push(group.shift)
    if (group.classroom) bits.push(`Salón ${group.classroom}`)
    return bits.length ? bits.join(' • ') : null
  }, [group])

  const rows = useMemo(() => {
    return (enrollments ?? []).map((e) => {
      const s = getStudent(e)
      return {
        enrollment: e,
        studentId: s.id,
        fullName: s.fullName,
        document: s.document,
        status: e.status,
      }
    })
  }, [enrollments])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil((totalCount || 0) / pageSize))
  }, [pageSize, totalCount])

  const pageButtons = useMemo(() => {
    const maxButtons = 7
    const current = Math.min(Math.max(page, 1), totalPages)
    if (totalPages <= maxButtons) return Array.from({ length: totalPages }, (_, i) => i + 1)

    const radius = 2
    let start = Math.max(1, current - radius)
    let end = Math.min(totalPages, current + radius)

    // Expand window if we're near edges
    while (end - start + 1 < maxButtons - 2) {
      if (start > 2) start -= 1
      else if (end < totalPages - 1) end += 1
      else break
    }

    const nums: number[] = []
    nums.push(1)

    const windowStart = Math.max(2, start)
    const windowEnd = Math.min(totalPages - 1, end)

    if (windowStart > 2) nums.push(-1)
    for (let p = windowStart; p <= windowEnd; p++) nums.push(p)
    if (windowEnd < totalPages - 1) nums.push(-1)

    nums.push(totalPages)
    return nums
  }, [page, totalPages])

  const handlePrintManualSheet = async () => {
    if (!Number.isFinite(numericGroupId) || numericGroupId <= 0) {
      setToast({ message: 'Grupo inválido para imprimir planilla.', type: 'error', isVisible: true })
      return
    }

    try {
      setPrinting(true)
      const blob = await downloadAttendanceManualSheetPdf({ group_id: numericGroupId })
      const url = URL.createObjectURL(blob)

      const filename = `planilla_asistencia_grupo_${numericGroupId}.pdf`
      const w = window.open(url, '_blank', 'noopener,noreferrer')
      if (!w) {
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        setToast({ message: 'Descargando planilla…', type: 'success', isVisible: true })
      }

      // Revoke after a bit; the new tab needs time to load it.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      console.error(e)
      setToast({ message: 'No se pudo generar la planilla de asistencia.', type: 'error', isVisible: true })
    } finally {
      setPrinting(false)
    }
  }

  const handlePrintGradeReportSheet = async () => {
    if (!Number.isFinite(numericGroupId) || numericGroupId <= 0) {
      setToast({ message: 'Grupo inválido para imprimir planilla.', type: 'error', isVisible: true })
      return
    }

    try {
      setPrintingGrades(true)

      const period = gradeSheetPeriodId ? Number(gradeSheetPeriodId) : undefined
      const subject = gradeSheetSubject.trim() ? gradeSheetSubject.trim() : undefined
      const teacher = gradeSheetTeacher.trim() ? gradeSheetTeacher.trim() : undefined

      const res = await academicApi.downloadGradeReportSheetPdf(numericGroupId, { period, subject, teacher })
      const blob = res.data as unknown as Blob
      const url = URL.createObjectURL(blob)

      const filename = `planilla_notas_grupo_${numericGroupId}.pdf`
      const w = window.open(url, '_blank', 'noopener,noreferrer')
      if (!w) {
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        setToast({ message: 'Descargando planilla…', type: 'success', isVisible: true })
      }

      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setIsGradeSheetModalOpen(false)
    } catch (e) {
      console.error(e)
      setToast({ message: 'No se pudo generar la planilla de notas.', type: 'error', isVisible: true })
    } finally {
      setPrintingGrades(false)
    }
  }

  useEffect(() => {
    if (!group?.academic_year) return

    let cancelled = false
    const loadPeriods = async () => {
      try {
        const res = await academicApi.listPeriods()
        if (cancelled) return
        setPeriods(res.data)
      } catch (e) {
        console.error(e)
      }
    }
    loadPeriods()

    return () => {
      cancelled = true
    }
  }, [group?.academic_year])

  useEffect(() => {
    if (!isGradeSheetModalOpen) return
    if (!Number.isFinite(numericGroupId) || numericGroupId <= 0) return

    let cancelled = false

    const loadAssignments = async () => {
      try {
        setGradeSheetAssignmentsLoading(true)

        const isTeacher = user?.role === 'TEACHER'
        const yearParam = group?.academic_year ?? ''

        const res = isTeacher
          ? await academicApi.listMyAssignments({ academic_year: yearParam })
          : await academicApi.listAssignments()

        if (cancelled) return
        const all = res.data ?? []
        const filtered = all.filter((a) => a.group === numericGroupId)
        setGradeSheetAssignments(filtered)

        // If an assignment exists, default to the first one.
        if (!gradeSheetAssignmentId && filtered.length > 0) {
          const first = filtered[0]
          setGradeSheetAssignmentId(String(first.id))
          setGradeSheetTeacher(first.teacher_name || '')
          const subj = [first.area_name, first.subject_name].filter(Boolean).join(' - ') || first.academic_load_name || ''
          setGradeSheetSubject(subj)
        }
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setGradeSheetAssignmentsLoading(false)
      }
    }

    loadAssignments()
    return () => {
      cancelled = true
    }
    // Intentionally keep gradeSheetAssignmentId out to avoid refetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGradeSheetModalOpen, numericGroupId, group?.academic_year, user?.role])

  return (
    <div className="space-y-6">
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((prev) => ({ ...prev, isVisible: false }))}
      />

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {subtitle ? subtitle : 'Estudiantes matriculados (activos) en este grupo.'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold px-2 py-1 rounded border bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
              Total: {totalCount}
            </span>
            <span className="text-xs font-semibold px-2 py-1 rounded border bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
              Mostrando: {rows.length} (página {page} de {totalPages})
            </span>
            {group?.director_name ? (
              <span className="text-xs font-semibold px-2 py-1 rounded border bg-cyan-50 text-cyan-700 border-cyan-100 dark:bg-cyan-950/25 dark:text-cyan-200 dark:border-cyan-500/20">
                Director: {group.director_name}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Button
            className="bg-cyan-600 hover:bg-cyan-700 text-white"
            onClick={() => {
              if (!Number.isFinite(numericGroupId) || numericGroupId <= 0) {
                setToast({ message: 'Grupo inválido para matricular.', type: 'error', isVisible: true })
                return
              }

              const params = new URLSearchParams()
              params.set('group', String(numericGroupId))
              params.set('returnTo', `/groups/${numericGroupId}/students`)
              navigate(`/enrollments/new?${params.toString()}`)
            }}
            disabled={!Number.isFinite(numericGroupId) || numericGroupId <= 0}
          >
            Matricular estudiante
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (!Number.isFinite(numericGroupId) || numericGroupId <= 0) {
                setToast({ message: 'Grupo inválido para matricular.', type: 'error', isVisible: true })
                return
              }

              const params = new URLSearchParams()
              params.set('group', String(numericGroupId))
              params.set('returnTo', `/groups/${numericGroupId}/students`)
              navigate(`/enrollments/existing?${params.toString()}`)
            }}
            disabled={!Number.isFinite(numericGroupId) || numericGroupId <= 0}
          >
            Matricular antiguo
          </Button>
          <Button variant="secondary" onClick={handlePrintManualSheet} disabled={printing || !Number.isFinite(numericGroupId) || numericGroupId <= 0}>
            {printing ? 'Generando…' : 'Imprimir planilla'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (!Number.isFinite(numericGroupId) || numericGroupId <= 0) {
                setToast({ message: 'Grupo inválido para imprimir.', type: 'error', isVisible: true })
                return
              }
              setGradeSheetAssignments([])
              setGradeSheetAssignmentId('')
              setGradeSheetPeriodId('')
              setGradeSheetSubject('')
              setGradeSheetTeacher('')
              setIsGradeSheetModalOpen(true)
            }}
            disabled={printingGrades || !Number.isFinite(numericGroupId) || numericGroupId <= 0}
          >
            {printingGrades ? 'Generando…' : 'Imprimir notas'}
          </Button>
          <Button variant="outline" onClick={() => navigate('/groups')}>
            Volver a grupos
          </Button>
        </div>
      </div>

      {isGradeSheetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
          <div
            className="fixed inset-0 bg-black/50 transition-opacity backdrop-blur-sm"
            onClick={() => {
              if (!printingGrades) setIsGradeSheetModalOpen(false)
            }}
          />
          <div className="relative z-50 w-full max-w-lg transform overflow-hidden rounded-lg bg-white p-6 shadow-xl transition-all sm:mx-auto animate-in fade-in zoom-in-95 duration-200 dark:bg-slate-900">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold leading-6 text-slate-900 dark:text-slate-100">Imprimir planilla de notas</h3>
              <button
                onClick={() => {
                  if (!printingGrades) setIsGradeSheetModalOpen(false)
                }}
                className="rounded-full p-1 hover:bg-slate-100 transition-colors disabled:opacity-50 dark:hover:bg-slate-800"
                disabled={printingGrades}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
                  Asignatura/Docente (del grupo)
                </label>
                <select
                  className="w-full p-2 border rounded text-sm bg-white text-slate-900 focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={gradeSheetAssignmentId}
                  onChange={(e) => {
                    const next = e.target.value
                    setGradeSheetAssignmentId(next)
                    const picked = gradeSheetAssignments.find((a) => String(a.id) === next)
                    if (picked) {
                      setGradeSheetTeacher(picked.teacher_name || '')
                      const subj = [picked.area_name, picked.subject_name].filter(Boolean).join(' - ') || picked.academic_load_name || ''
                      setGradeSheetSubject(subj)
                    }
                  }}
                  disabled={gradeSheetAssignmentsLoading || gradeSheetAssignments.length === 0}
                >
                  {gradeSheetAssignments.length === 0 ? (
                    <option value="">
                      {gradeSheetAssignmentsLoading ? 'Cargando asignaciones…' : 'Sin asignaciones (puedes escribir manual)'}
                    </option>
                  ) : (
                    gradeSheetAssignments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {([a.area_name, a.subject_name].filter(Boolean).join(' - ') || a.academic_load_name || 'Asignatura') +
                          (a.teacher_name ? ` — ${a.teacher_name}` : '')}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Período</label>
                  <select
                    className="w-full p-2 border rounded text-sm bg-white text-slate-900 focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    value={gradeSheetPeriodId}
                    onChange={(e) => setGradeSheetPeriodId(e.target.value)}
                  >
                    <option value="">(En blanco)</option>
                    {periods
                      .filter((p) => (group?.academic_year ? p.academic_year === group.academic_year : true))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Docente</label>
                  <input
                    value={gradeSheetTeacher}
                    onChange={(e) => setGradeSheetTeacher(e.target.value)}
                    placeholder="Nombre del docente (opcional)"
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Área/Asignatura</label>
                <input
                  value={gradeSheetSubject}
                  onChange={(e) => setGradeSheetSubject(e.target.value)}
                  placeholder="Ej: Matemáticas"
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsGradeSheetModalOpen(false)} disabled={printingGrades}>
                Cancelar
              </Button>
              <Button className="bg-cyan-600 hover:bg-cyan-700 text-white" onClick={handlePrintGradeReportSheet} disabled={printingGrades}>
                {printingGrades ? 'Generando…' : 'Imprimir'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="border-b border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <CardTitle className="text-slate-900 dark:text-slate-100">Listado</CardTitle>
            <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="flex h-10 w-full md:w-44 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
                aria-label="Filtrar por estado"
              >
                <option value="ACTIVE">Activos</option>
                <option value="RETIRED">Retirados</option>
                <option value="GRADUATED">Graduados</option>
                <option value="ALL">Todos</option>
              </select>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="flex h-10 w-full md:w-40 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
                aria-label="Tamaño de página"
              >
                <option value={10}>10 / pág</option>
                <option value={25}>25 / pág</option>
                <option value={50}>50 / pág</option>
                <option value={100}>100 / pág</option>
              </select>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre o documento…"
                className="flex h-10 w-full md:w-80 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          </div>

          {loading && <p className="mt-2 text-sm text-slate-500">Cargando…</p>}
          {error && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {/* Mobile list */}
          <div className="md:hidden p-4 space-y-3">
            {!loading && rows.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                No hay matrículas activas en este grupo.
              </div>
            ) : (
              rows.map((r) => (
                <div
                  key={r.enrollment.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{r.fullName || '-'}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Matrícula #{r.enrollment.id}</div>
                    </div>
                    <span className="shrink-0 text-xs font-semibold px-2 py-1 rounded border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/25 dark:text-emerald-200 dark:border-emerald-500/20">
                      {r.status}
                    </span>
                  </div>

                  <div className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Documento: </span>
                    <span className="font-mono">{r.document || '-'}</span>
                  </div>

                  <div className="mt-3">
                    {r.studentId ? (
                      <Link to={`/students/${r.studentId}`}>
                        <Button size="sm" variant="outline" className="w-full">Ver ficha</Button>
                      </Link>
                    ) : (
                      <div className="text-xs text-slate-400 text-center">Sin ficha vinculada</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200 dark:text-slate-300 dark:from-slate-900 dark:to-slate-800 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-semibold">Estudiante</th>
                  <th className="px-6 py-4 font-semibold">Documento</th>
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {!loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-slate-500 dark:text-slate-400">
                      No hay matrículas activas en este grupo.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.enrollment.id}
                      className="bg-white hover:bg-slate-50/80 transition-colors dark:bg-slate-900 dark:hover:bg-slate-800/60"
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{r.fullName || '-'}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Matrícula #{r.enrollment.id}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono bg-slate-100 px-2 py-1 rounded text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {r.document || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-semibold px-2 py-1 rounded border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/25 dark:text-emerald-200 dark:border-emerald-500/20">
                          {r.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {r.studentId ? (
                          <Link to={`/students/${r.studentId}`}>
                            <Button size="sm" variant="outline">Ver ficha</Button>
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {totalCount > 0 ? `Mostrando ${rows.length} de ${totalCount}` : 'Sin resultados'}
            </div>
            <div className="flex items-center gap-1 justify-end flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={loading || page <= 1}
              >
                Anterior
              </Button>
              {pageButtons.map((p, idx) =>
                p === -1 ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-slate-400">…</span>
                ) : (
                  <Button
                    key={p}
                    size="sm"
                    variant={p === page ? 'secondary' : 'outline'}
                    className="h-8 px-2"
                    onClick={() => setPage(p)}
                    disabled={loading}
                    aria-current={p === page ? 'page' : undefined}
                  >
                    {p}
                  </Button>
                )
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={loading || page >= totalPages}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
