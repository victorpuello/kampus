import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { useAuthStore } from '../store/auth'
import { academicApi, type AcademicYear, type TeacherAssignment } from '../services/academic'

export default function TeacherAssignments() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'

  const [loading, setLoading] = useState(false)
  const [loadingYears, setLoadingYears] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])

  const [years, setYears] = useState<AcademicYear[]>([])
  const [yearId, setYearId] = useState<number | ''>('')

  const pageSize = 10
  const [page, setPage] = useState(1)

  useEffect(() => {
    let mounted = true
    if (!isTeacher) return

    setLoadingYears(true)
    academicApi
      .listYears()
      .then((res) => {
        if (!mounted) return
        const items = res.data ?? []
        setYears(items)

        // Default to ACTIVE year.
        const active = items.find((y) => y.status === 'ACTIVE')
        const fallback = items[0]
        const nextId = active?.id ?? fallback?.id

        if (yearId === '' && nextId) setYearId(nextId)
      })
      .catch(() => {
        if (!mounted) return
        // Keep page usable; year filter will show empty.
        setYears([])
      })
      .finally(() => {
        if (!mounted) return
        setLoadingYears(false)
      })

    return () => {
      mounted = false
    }
  }, [isTeacher])

  useEffect(() => {
    // Reset pagination when scope changes.
    setPage(1)
  }, [yearId])

  useEffect(() => {
    let mounted = true

    if (!isTeacher) return

    // Wait until a year is selected (we default it from ACTIVE year).
    if (!yearId) return

    setLoading(true)
    setError(null)

    academicApi
      .listMyAssignments({ academic_year: Number(yearId) })
      .then((res) => {
        if (!mounted) return
        setAssignments(res.data)
      })
      .catch((err: any) => {
        if (!mounted) return
        const status = err?.response?.status
        if (status === 403) setError('No tienes permisos para ver esta información.')
        else setError('No se pudo cargar la asignación académica.')
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [isTeacher, yearId])

  const rows = useMemo(() => {
    return assignments.map((a) => {
      const subject = a.subject_name ?? '—'
      const area = a.area_name ?? null
      const group = a.group_name ?? '—'
      const grade = a.grade_name ?? null
      const year = a.academic_year_year ?? null
      const hours = a.hours_per_week ?? null

      return {
        id: a.id,
        subject,
        area,
        group,
        grade,
        year,
        hours,
      }
    })
  }, [assignments])

  const paginated = useMemo(() => {
    const total = rows.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.max(1, Math.min(page, totalPages))

    const startIdx = (safePage - 1) * pageSize
    const endIdx = Math.min(total, startIdx + pageSize)

    return {
      total,
      totalPages,
      page: safePage,
      startIdx,
      endIdx,
      items: rows.slice(startIdx, endIdx),
    }
  }, [rows, page, pageSize])

  if (!isTeacher) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Asignación Académica</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600">Esta pantalla es solo para docentes.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Asignación Académica</h2>
          <p className="text-sm text-slate-600">Tus grupos y asignaturas asignadas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Año</span>
            <select
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
              value={yearId}
              disabled={loadingYears || years.length === 0}
              onChange={(e) => setYearId(e.target.value ? Number(e.target.value) : '')}
            >
              {years.length === 0 ? <option value="">—</option> : null}
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.year} {y.status === 'ACTIVE' ? '(Activo)' : ''}
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" onClick={() => navigate('/')}>Ir al Dashboard</Button>
        </div>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">{error}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Mis asignaciones</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-slate-500">Cargando…</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-slate-500">No tienes asignaciones registradas.</div>
          ) : (
            <div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Asignatura</th>
                      <th className="px-6 py-4 font-semibold">Área</th>
                      <th className="px-6 py-4 font-semibold">Grado</th>
                      <th className="px-6 py-4 font-semibold">Grupo</th>
                      <th className="px-6 py-4 font-semibold">Año</th>
                      <th className="px-6 py-4 font-semibold text-right">Horas/Semana</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginated.items.map((r) => (
                      <tr key={r.id} className="bg-white hover:bg-slate-50/80 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900">{r.subject}</td>
                        <td className="px-6 py-4">{r.area ?? '—'}</td>
                        <td className="px-6 py-4">{r.grade ?? '—'}</td>
                        <td className="px-6 py-4">{r.group}</td>
                        <td className="px-6 py-4">{r.year ?? '—'}</td>
                        <td className="px-6 py-4 text-right">{r.hours ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-600">
                  Mostrando {paginated.startIdx + 1}–{paginated.endIdx} de {paginated.total}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={paginated.page <= 1}
                  >
                    Anterior
                  </Button>
                  <div className="text-sm text-slate-600">
                    Página {paginated.page} de {paginated.totalPages}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => Math.min(paginated.totalPages, p + 1))}
                    disabled={paginated.page >= paginated.totalPages}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
