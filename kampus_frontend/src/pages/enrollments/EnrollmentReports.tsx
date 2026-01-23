import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { enrollmentsApi } from '../../services/enrollments'
import { academicApi, type AcademicYear, type Grade, type Group, type Period } from '../../services/academic'
import { reportsApi, type ReportJob } from '../../services/reports'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Label } from '../../components/ui/Label'
import { Toast, type ToastType } from '../../components/ui/Toast'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { useAuthStore } from '../../store/auth'

type EnrollmentOption = {
  id: number
  student: { id: number; full_name: string; document_number: string }
}

export default function EnrollmentReports() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  // Report Filters State
  const [filters, setFilters] = useState({
    year: '',
    grade: '',
    group: ''
  })
  
  const [years, setYears] = useState<AcademicYear[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [periods, setPeriods] = useState<Period[]>([])

  const [bulletinMode, setBulletinMode] = useState<'GROUP' | 'STUDENT'>('GROUP')
  const [bulletinPeriodId, setBulletinPeriodId] = useState('')
  const [bulletinEnrollmentId, setBulletinEnrollmentId] = useState('')
  const [bulletinEnrollments, setBulletinEnrollments] = useState<EnrollmentOption[]>([])
  const [loadingBulletinEnrollments, setLoadingBulletinEnrollments] = useState(false)

  const [bulletinJob, setBulletinJob] = useState<ReportJob | null>(null)
  const [enrollmentListJob, setEnrollmentListJob] = useState<ReportJob | null>(null)

  const getFilenameFromContentDisposition = (value?: string) => {
    if (!value) return null
    const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i.exec(value)
    const raw = match?.[1] || match?.[2] || match?.[3]
    if (!raw) return null
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const pollJobUntilFinished = async (
    jobId: number,
    onUpdate?: (job: ReportJob) => void
  ): Promise<ReportJob> => {
    // ~2 min worst-case with backoff.
    const delaysMs = [400, 700, 1000, 1500, 2000, 2500, 3000, 3500]
    for (let i = 0; i < 60; i++) {
      const res = await reportsApi.getJob(jobId)
      const job = res.data
      onUpdate?.(job)
      if (job.status === 'SUCCEEDED' || job.status === 'FAILED' || job.status === 'CANCELED') {
        return job
      }
      const delay = delaysMs[Math.min(i, delaysMs.length - 1)]
      await sleep(delay)
    }
    throw new Error('Timeout esperando la generación del PDF')
  }

  useEffect(() => {
    if (isTeacher) return
    Promise.all([
      academicApi.listYears(),
      academicApi.listGrades(),
      academicApi.listGroups(),
      academicApi.listPeriods(),
    ]).then(([yearsRes, gradesRes, groupsRes, periodsRes]) => {
      setYears(yearsRes.data)
      setGrades(gradesRes.data)
      setGroups(groupsRes.data)
      setPeriods(periodsRes.data)
      
      const activeYear = yearsRes.data.find(y => y.status === 'ACTIVE')
      if (activeYear) {
        setFilters(prev => ({ ...prev, year: String(activeYear.id) }))
      }
    }).catch(console.error)
  }, [isTeacher])

  const handleDownloadReport = async (format: 'csv' | 'pdf' | 'xlsx' = 'csv') => {
    setLoading(true)
    try {
      if (format === 'pdf') {
        showToast('Generando PDF…', 'info')

        const created = await reportsApi.createJob({
          report_type: 'ENROLLMENT_LIST',
          params: {
            year_id: filters.year ? Number(filters.year) : null,
            grade_id: filters.grade ? Number(filters.grade) : null,
            group_id: filters.group ? Number(filters.group) : null,
          },
        })

        setEnrollmentListJob(created.data)
        const job = await pollJobUntilFinished(created.data.id, setEnrollmentListJob)

        if (job.status !== 'SUCCEEDED') {
          showToast(job.error_message || 'No se pudo generar el PDF', 'error')
          return
        }

        const res = await reportsApi.downloadJob(job.id)
        const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
        const headers = res.headers as Record<string, string | undefined>
        const filename =
          getFilenameFromContentDisposition(headers?.['content-disposition']) ||
          job.output_filename ||
          'reporte_matriculados.pdf'

        downloadBlob(blob, filename)
        showToast('PDF listo.', 'success')
        return
      }

      const response = await enrollmentsApi.downloadReport({ ...filters, export: format })
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data])
      const filename = format === 'csv' ? 'matriculados.csv' : 'matriculados.xlsx'
      downloadBlob(blob, filename)
    } catch (error) {
      console.error(error)
      showToast('Error al descargar reporte', 'error')
    } finally {
      setLoading(false)
    }
  }

  const periodOptions = useMemo(() => {
    const yearId = filters.year ? Number(filters.year) : null
    if (!yearId) return [] as Period[]
    return periods
      .filter((p) => p.academic_year === yearId)
      .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
  }, [filters.year, periods])

  useEffect(() => {
    if (!filters.year) {
      setBulletinPeriodId('')
      return
    }
    if (bulletinPeriodId && periodOptions.some((p) => String(p.id) === bulletinPeriodId)) {
      return
    }
    setBulletinPeriodId(periodOptions.length ? String(periodOptions[0].id) : '')
  }, [filters.year, periodOptions, bulletinPeriodId])

  useEffect(() => {
    // When changing group/year or switching mode, reset student selection.
    setBulletinEnrollmentId('')
    setBulletinEnrollments([])
    setBulletinJob(null)
  }, [filters.group, filters.year, bulletinMode])

  useEffect(() => {
    if (isTeacher) return
    if (bulletinMode !== 'STUDENT') return
    if (!filters.year || !filters.group) return

    let cancelled = false
    setLoadingBulletinEnrollments(true)
    enrollmentsApi
      .list({
        academic_year: Number(filters.year),
        group: Number(filters.group),
        status: 'ACTIVE',
        page_size: 200,
      })
      .then((res) => {
        if (cancelled) return
        const results = (res.data?.results ?? []) as unknown as EnrollmentOption[]
        setBulletinEnrollments(
          results
            .filter((e) => e && typeof e.id === 'number' && e.student && typeof e.student.full_name === 'string')
            .sort((a, b) => a.student.full_name.localeCompare(b.student.full_name))
        )
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setBulletinEnrollments([])
      })
      .finally(() => {
        if (!cancelled) setLoadingBulletinEnrollments(false)
      })

    return () => {
      cancelled = true
    }
  }, [bulletinMode, filters.group, filters.year, isTeacher])

  const handleDownloadBulletin = async () => {
    if (!filters.group || !filters.year) {
      showToast('Selecciona año y grupo.', 'error')
      return
    }
    if (!bulletinPeriodId) {
      showToast('Selecciona el periodo.', 'error')
      return
    }

    setLoading(true)
    try {
      const groupId = Number(filters.group)
      const periodId = Number(bulletinPeriodId)

      if (bulletinMode === 'GROUP') {
        showToast('Generando PDF…', 'info')

        const created = await reportsApi.createAcademicPeriodGroupJob(groupId, periodId)
        const jobId = created.data.id

        setBulletinJob(created.data)

        const job = await pollJobUntilFinished(jobId, setBulletinJob)
        if (job.status !== 'SUCCEEDED') {
          showToast(job.error_message || 'No se pudo generar el PDF', 'error')
          return
        }

        const res = await reportsApi.downloadJob(jobId)
        const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
        const headers = res.headers as Record<string, string | undefined>
        const filename =
          getFilenameFromContentDisposition(headers?.['content-disposition']) ||
          job.output_filename ||
          `informe-academico-grupo-${groupId}-periodo-${periodId}.pdf`
        downloadBlob(blob, filename)
        showToast('PDF listo.', 'success')
        return
      }

      if (!bulletinEnrollmentId) {
        showToast('Selecciona el estudiante.', 'error')
        return
      }

      const enrollmentId = Number(bulletinEnrollmentId)
      showToast('Generando PDF…', 'info')

      const created = await reportsApi.createAcademicPeriodEnrollmentJob(enrollmentId, periodId)
      const jobId = created.data.id

      setBulletinJob(created.data)

      const job = await pollJobUntilFinished(jobId, setBulletinJob)
      if (job.status !== 'SUCCEEDED') {
        showToast(job.error_message || 'No se pudo generar el PDF', 'error')
        return
      }

      const res = await reportsApi.downloadJob(jobId)
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
      const headers = res.headers as Record<string, string | undefined>
      const filename =
        getFilenameFromContentDisposition(headers?.['content-disposition']) ||
        job.output_filename ||
        `informe-academico-enrollment-${enrollmentId}-periodo-${periodId}.pdf`
      downloadBlob(blob, filename)
      showToast('PDF listo.', 'success')
    } catch (err) {
      console.error(err)
      showToast('Error al generar el boletín', 'error')
    } finally {
      setLoading(false)
    }
  }

  const getFilteredGroups = () => {
    if (!filters.year) return []
    const yearId = Number(filters.year)
    const gradeId = filters.grade ? Number(filters.grade) : null
    const gradeOrdinalById = new Map<number, number | null | undefined>()
    for (const grade of grades) gradeOrdinalById.set(grade.id, grade.ordinal)

    return groups
      .filter((g) => {
      if (g.academic_year !== yearId) return false
      if (gradeId && g.grade !== gradeId) return false
      return true
      })
      .slice()
      .sort((a, b) => {
        const ao = gradeOrdinalById.get(a.grade)
        const bo = gradeOrdinalById.get(b.grade)
        const aOrd = ao === null || ao === undefined ? -9999 : ao
        const bOrd = bo === null || bo === undefined ? -9999 : bo
        if (aOrd !== bOrd) return bOrd - aOrd
        return (a.name || '').localeCompare(b.name || '')
      })
  }

  if (isTeacher) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Reportes de Matrículas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">No tienes permisos para acceder a reportes de matrículas.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        Reportes
      </h2>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Reporte de Matriculados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Año Académico</Label>
              <select 
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={filters.year}
                onChange={e => setFilters({...filters, year: e.target.value})}
              >
                <option value="">Todos</option>
                {years.map(y => (
                  <option key={y.id} value={y.id}>{y.year} ({y.status})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Grado</Label>
              <select 
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={filters.grade}
                onChange={e => setFilters({...filters, grade: e.target.value, group: ''})}
              >
                <option value="">Todos</option>
                {grades
                  .slice()
                  .sort((a, b) => {
                    const ao = a.ordinal === null || a.ordinal === undefined ? -9999 : a.ordinal
                    const bo = b.ordinal === null || b.ordinal === undefined ? -9999 : b.ordinal
                    if (ao !== bo) return bo - ao
                    return (a.name || '').localeCompare(b.name || '')
                  })
                  .map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Grupo</Label>
              <select 
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={filters.group}
                onChange={e => setFilters({...filters, group: e.target.value})}
                disabled={!filters.year}
              >
                <option value="">Todos</option>
                {getFilteredGroups().map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => handleDownloadReport('csv')} disabled={loading} variant="outline" className="flex-1">
                <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />
                CSV
              </Button>
              <Button onClick={() => handleDownloadReport('xlsx')} disabled={loading} variant="outline" className="flex-1">
                <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />
                XLSX
              </Button>
              <Button onClick={() => handleDownloadReport('pdf')} disabled={loading} variant="outline" className="flex-1">
                <FileText className="w-4 h-4 mr-2 text-red-600" />
                PDF
              </Button>
            </div>

            {enrollmentListJob && (
              <div className="text-xs text-slate-600 dark:text-slate-300">
                PDF: <span className="font-medium">{enrollmentListJob.status}</span>
                {typeof enrollmentListJob.progress === 'number' ? ` (${enrollmentListJob.progress}%)` : ''}
                {enrollmentListJob.status === 'FAILED' && enrollmentListJob.error_message
                  ? ` — ${enrollmentListJob.error_message}`
                  : ''}
              </div>
            )}

            {enrollmentListJob?.status === 'FAILED' && (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDownloadReport('pdf')}
                disabled={loading}
                className="w-full"
              >
                Reintentar PDF
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Boletines por periodo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Periodo</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={bulletinPeriodId}
                  onChange={(e) => setBulletinPeriodId(e.target.value)}
                  disabled={!filters.year}
                >
                  <option value="">Selecciona…</option>
                  {periodOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Generar para</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={bulletinMode === 'GROUP' ? 'secondary' : 'outline'}
                    className="flex-1"
                    onClick={() => setBulletinMode('GROUP')}
                  >
                    Grupo
                  </Button>
                  <Button
                    type="button"
                    variant={bulletinMode === 'STUDENT' ? 'secondary' : 'outline'}
                    className="flex-1"
                    onClick={() => setBulletinMode('STUDENT')}
                    disabled={!filters.group || !filters.year}
                    title={!filters.group || !filters.year ? 'Selecciona año y grupo primero' : undefined}
                  >
                    Estudiante
                  </Button>
                </div>
              </div>
            </div>

            {bulletinMode === 'STUDENT' && (
              <div className="space-y-2">
                <Label>Estudiante</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={bulletinEnrollmentId}
                  onChange={(e) => setBulletinEnrollmentId(e.target.value)}
                  disabled={!filters.group || !filters.year || loadingBulletinEnrollments}
                >
                  <option value="">Selecciona…</option>
                  {bulletinEnrollments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.student.full_name} ({e.student.document_number})
                    </option>
                  ))}
                </select>
                {loadingBulletinEnrollments && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">Cargando estudiantes…</div>
                )}
                {!loadingBulletinEnrollments && filters.group && filters.year && bulletinEnrollments.length === 0 && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">No hay matrículas activas para este grupo.</div>
                )}
              </div>
            )}

            <Button
              onClick={handleDownloadBulletin}
              disabled={loading || !filters.group || !filters.year || !bulletinPeriodId || (bulletinMode === 'STUDENT' && !bulletinEnrollmentId)}
              className="w-full"
            >
              Generar PDF
            </Button>

            {bulletinJob && (
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Estado: <span className="font-medium">{bulletinJob.status}</span>
                {typeof bulletinJob.progress === 'number' ? ` (${bulletinJob.progress}%)` : ''}
                {bulletinJob.status === 'FAILED' && bulletinJob.error_message ? ` — ${bulletinJob.error_message}` : ''}
              </div>
            )}

            {bulletinJob?.status === 'FAILED' && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadBulletin}
                disabled={loading || !filters.group || !filters.year || !bulletinPeriodId || (bulletinMode === 'STUDENT' && !bulletinEnrollmentId)}
                className="w-full"
              >
                Reintentar
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
