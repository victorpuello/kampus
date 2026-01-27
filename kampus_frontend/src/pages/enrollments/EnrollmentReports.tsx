import { useMemo, useState, useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { enrollmentsApi } from '../../services/enrollments'
import { academicApi, type AcademicYear, type Grade, type Group, type Period } from '../../services/academic'
import { reportsApi, type ReportJob } from '../../services/reports'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Label } from '../../components/ui/Label'
import { Modal } from '../../components/ui/Modal'
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
  const [loadingFilters, setLoadingFilters] = useState(false)
  const [activeModal, setActiveModal] = useState<null | 'ENROLLMENT_LIST' | 'BULLETINS' | 'SABANA'>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const selectClassName =
    'flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

  const [enrollmentFilters, setEnrollmentFilters] = useState({
    year: '',
    grade: '',
    group: '',
  })

  const [bulletinFilters, setBulletinFilters] = useState({
    year: '',
    group: '',
  })

  const [sabanaFilters, setSabanaFilters] = useState({
    year: '',
    group: '',
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

  const [sabanaPeriodId, setSabanaPeriodId] = useState('')

  const [bulletinJob, setBulletinJob] = useState<ReportJob | null>(null)
  const [sabanaJob, setSabanaJob] = useState<ReportJob | null>(null)
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
    let cancelled = false
    setLoadingFilters(true)

    Promise.allSettled([
      academicApi.listYears(),
      academicApi.listGrades(),
      academicApi.listGroups(),
      academicApi.listPeriods(),
    ])
      .then((results) => {
        if (cancelled) return

        const [yearsRes, gradesRes, groupsRes, periodsRes] = results

        if (yearsRes.status === 'fulfilled') {
          setYears(yearsRes.value.data)
          const activeYear = yearsRes.value.data.find((y) => y.status === 'ACTIVE')
          if (activeYear) {
            const yearId = String(activeYear.id)
            setEnrollmentFilters((prev) => ({ ...prev, year: prev.year || yearId }))
            setBulletinFilters((prev) => ({ ...prev, year: prev.year || yearId }))
            setSabanaFilters((prev) => ({ ...prev, year: prev.year || yearId }))
          }
        } else {
          console.error(yearsRes.reason)
          showToast('No se pudieron cargar los años académicos', 'error')
          setYears([])
        }

        if (gradesRes.status === 'fulfilled') {
          setGrades(gradesRes.value.data)
        } else {
          console.error(gradesRes.reason)
          showToast('No se pudieron cargar los grados', 'error')
          setGrades([])
        }

        if (groupsRes.status === 'fulfilled') {
          setGroups(groupsRes.value.data)
        } else {
          console.error(groupsRes.reason)
          showToast('No se pudieron cargar los grupos (revisa permisos o sesión)', 'error')
          setGroups([])
        }

        if (periodsRes.status === 'fulfilled') {
          setPeriods(periodsRes.value.data)
        } else {
          console.error(periodsRes.reason)
          showToast('No se pudieron cargar los periodos', 'error')
          setPeriods([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingFilters(false)
      })

    return () => {
      cancelled = true
    }
  }, [isTeacher])

  const handleDownloadReport = async (format: 'csv' | 'pdf' | 'xlsx' = 'csv') => {
    setLoading(true)
    try {
      if (format === 'pdf') {
        showToast('Generando PDF…', 'info')

        const created = await reportsApi.createJob({
          report_type: 'ENROLLMENT_LIST',
          params: {
            year_id: enrollmentFilters.year ? Number(enrollmentFilters.year) : null,
            grade_id: enrollmentFilters.grade ? Number(enrollmentFilters.grade) : null,
            group_id: enrollmentFilters.group ? Number(enrollmentFilters.group) : null,
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

      const response = await enrollmentsApi.downloadReport({ ...enrollmentFilters, export: format })
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
    const yearId = bulletinFilters.year ? Number(bulletinFilters.year) : null
    if (!yearId) return [] as Period[]
    return periods
      .filter((p) => p.academic_year === yearId)
      .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
  }, [bulletinFilters.year, periods])

  const sabanaPeriodOptions = useMemo(() => {
    const yearId = sabanaFilters.year ? Number(sabanaFilters.year) : null
    if (!yearId) return [] as Period[]
    return periods
      .filter((p) => p.academic_year === yearId)
      .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
  }, [sabanaFilters.year, periods])

  useEffect(() => {
    if (!bulletinFilters.year) {
      setBulletinPeriodId('')
      return
    }
    if (bulletinPeriodId && periodOptions.some((p) => String(p.id) === bulletinPeriodId)) {
      return
    }
    setBulletinPeriodId(periodOptions.length ? String(periodOptions[0].id) : '')
  }, [bulletinFilters.year, periodOptions, bulletinPeriodId])

  useEffect(() => {
    if (!sabanaFilters.year) {
      setSabanaPeriodId('')
      return
    }
    if (sabanaPeriodId && sabanaPeriodOptions.some((p) => String(p.id) === sabanaPeriodId)) {
      return
    }
    setSabanaPeriodId(sabanaPeriodOptions.length ? String(sabanaPeriodOptions[0].id) : '')
  }, [sabanaFilters.year, sabanaPeriodOptions, sabanaPeriodId])

  useEffect(() => {
    // When changing group/year or switching mode, reset student selection.
    setBulletinEnrollmentId('')
    setBulletinEnrollments([])
    setBulletinJob(null)
  }, [bulletinFilters.group, bulletinFilters.year, bulletinMode])

  useEffect(() => {
    setSabanaJob(null)
  }, [sabanaFilters.group, sabanaFilters.year, sabanaPeriodId])

  useEffect(() => {
    if (isTeacher) return
    if (bulletinMode !== 'STUDENT') return
    if (!bulletinFilters.year || !bulletinFilters.group) return

    let cancelled = false
    setLoadingBulletinEnrollments(true)
    enrollmentsApi
      .list({
        academic_year: Number(bulletinFilters.year),
        group: Number(bulletinFilters.group),
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
  }, [bulletinMode, bulletinFilters.group, bulletinFilters.year, isTeacher])

  const handleDownloadBulletin = async () => {
    if (!bulletinFilters.group || !bulletinFilters.year) {
      showToast('Selecciona año y grupo.', 'error')
      return
    }
    if (!bulletinPeriodId) {
      showToast('Selecciona el periodo.', 'error')
      return
    }

    setLoading(true)
    try {
      const groupId = Number(bulletinFilters.group)
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

  const handleDownloadSabana = async () => {
    if (!sabanaFilters.group || !sabanaFilters.year) {
      showToast('Selecciona año y grupo.', 'error')
      return
    }
    if (!sabanaPeriodId) {
      showToast('Selecciona el periodo.', 'error')
      return
    }

    setLoading(true)
    try {
      const groupId = Number(sabanaFilters.group)
      const periodId = Number(sabanaPeriodId)

      showToast('Generando PDF…', 'info')

      const created = await reportsApi.createAcademicPeriodSabanaJob(groupId, periodId)
      const jobId = created.data.id
      setSabanaJob(created.data)

      const job = await pollJobUntilFinished(jobId, setSabanaJob)
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
        `sabana-notas-grupo-${groupId}-periodo-${periodId}.pdf`
      downloadBlob(blob, filename)
      showToast('PDF listo.', 'success')
    } catch (err) {
      console.error(err)
      showToast('Error al generar la sábana', 'error')
    } finally {
      setLoading(false)
    }
  }

  const getFilteredGroups = ({ year, grade }: { year: string; grade: string }) => {
    const yearId = year ? Number(year) : null
    const gradeId = grade ? Number(grade) : null
    const gradeOrdinalById = new Map<number, number | null | undefined>()
    for (const grade of grades) gradeOrdinalById.set(grade.id, grade.ordinal)

    return groups
      .filter((g) => {
        if (yearId && g.academic_year !== yearId) return false
        if (gradeId && g.grade !== gradeId) return false
        return true
      })
      .slice()
      .sort((a, b) => {
        const ao = gradeOrdinalById.get(a.grade)
        const bo = gradeOrdinalById.get(b.grade)
        const aOrd = ao === null || ao === undefined ? 9999 : ao
        const bOrd = bo === null || bo === undefined ? 9999 : bo
        if (aOrd !== bOrd) return aOrd - bOrd
        return (a.name || '').localeCompare(b.name || '')
      })
  }

  const gradeNameById = useMemo(() => {
    const map = new Map<number, string>()
    for (const gr of grades) map.set(gr.id, gr.name)
    return map
  }, [grades])

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

  const ReportCard = ({
    title,
    description,
    icon,
    actionText,
    onAction,
    disabled,
  }: {
    title: string
    description: string
    icon: ReactNode
    actionText: string
    onAction: () => void
    disabled?: boolean
  }) => {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {icon}
            </span>
            <span>{title}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>
          <Button onClick={onAction} disabled={disabled} className="w-full">
            {actionText}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Centro de Reportes</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Genera reportes y PDFs desde un solo lugar. Cada reporte abre su propio formulario.
        </p>
      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <ReportCard
          title="Reporte de Matriculados"
          description="Exporta matrículas activas por año, grado y/o grupo (CSV/XLSX) o genera PDF desde Jobs."
          icon={<FileSpreadsheet className="h-5 w-5" />}
          actionText="Abrir"
          onAction={() => setActiveModal('ENROLLMENT_LIST')}
        />
        <ReportCard
          title="Boletines por periodo"
          description="Genera boletines en PDF por grupo o por estudiante, con verificación por QR."
          icon={<FileText className="h-5 w-5" />}
          actionText="Abrir"
          onAction={() => setActiveModal('BULLETINS')}
        />
        <ReportCard
          title="Sábana de notas por periodo"
          description="Genera un PDF horizontal (grupo × asignaturas) con semáforo por nivel y conteo de perdidas."
          icon={<FileSpreadsheet className="h-5 w-5" />}
          actionText="Abrir"
          onAction={() => setActiveModal('SABANA')}
        />
        <ReportCard
          title="Reporte de Seguimiento"
          description="Asistencias, novedades y observaciones (próximamente)."
          icon={<FileText className="h-5 w-5" />}
          actionText="Próximamente"
          onAction={() => showToast('Este reporte estará disponible pronto.', 'info')}
          disabled
        />
      </div>

      {/* Enrollment List Modal */}
      <Modal
        isOpen={activeModal === 'ENROLLMENT_LIST'}
        onClose={() => setActiveModal(null)}
        title="Reporte de Matriculados"
        description="Exporta CSV/XLSX o genera PDF vía Jobs."
        size="lg"
        loading={loading}
        footer={
          <Button variant="outline" onClick={() => setActiveModal(null)} disabled={loading}>
            Cerrar
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Año Académico</Label>
            <select
              className={selectClassName}
              value={enrollmentFilters.year}
              onChange={(e) => setEnrollmentFilters((prev) => ({ ...prev, year: e.target.value }))}
              disabled={loadingFilters}
            >
              <option value="">Todos</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.year} ({y.status})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Grado</Label>
            <select
              className={selectClassName}
              value={enrollmentFilters.grade}
              onChange={(e) => setEnrollmentFilters((prev) => ({ ...prev, grade: e.target.value, group: '' }))}
              disabled={loadingFilters}
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
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Grupo</Label>
            <select
              className={selectClassName}
              value={enrollmentFilters.group}
              onChange={(e) => {
                const nextGroupId = e.target.value
                if (!nextGroupId) {
                  setEnrollmentFilters((prev) => ({ ...prev, group: '' }))
                  return
                }

                const selected = groups.find((g) => String(g.id) === nextGroupId)
                setEnrollmentFilters((prev) => ({
                  ...prev,
                  group: nextGroupId,
                  year: prev.year || (selected ? String(selected.academic_year) : prev.year),
                }))
              }}
              disabled={loadingFilters}
            >
              <option value="">Todos</option>
              {getFilteredGroups({ year: enrollmentFilters.year, grade: enrollmentFilters.grade }).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            {!enrollmentFilters.year ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Tip: puedes seleccionar el grupo primero; el año se autocompleta.
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => handleDownloadReport('csv')} disabled={loading} variant="outline" className="w-full sm:flex-1">
            <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />
            CSV
          </Button>
          <Button onClick={() => handleDownloadReport('xlsx')} disabled={loading} variant="outline" className="w-full sm:flex-1">
            <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />
            XLSX
          </Button>
          <Button onClick={() => handleDownloadReport('pdf')} disabled={loading} variant="outline" className="w-full sm:flex-1">
            <FileText className="w-4 h-4 mr-2 text-red-600" />
            PDF
          </Button>
        </div>

        {enrollmentListJob ? (
          <div className="mt-4 text-xs text-slate-600 dark:text-slate-300">
            PDF: <span className="font-medium">{enrollmentListJob.status}</span>
            {typeof enrollmentListJob.progress === 'number' ? ` (${enrollmentListJob.progress}%)` : ''}
            {enrollmentListJob.status === 'FAILED' && enrollmentListJob.error_message
              ? ` — ${enrollmentListJob.error_message}`
              : ''}
          </div>
        ) : null}

        {enrollmentListJob?.status === 'FAILED' ? (
          <div className="mt-3">
            <Button type="button" variant="outline" onClick={() => handleDownloadReport('pdf')} disabled={loading} className="w-full">
              Reintentar PDF
            </Button>
          </div>
        ) : null}
      </Modal>

      {/* Bulletins Modal */}
      <Modal
        isOpen={activeModal === 'BULLETINS'}
        onClose={() => setActiveModal(null)}
        title="Boletines por periodo"
        description="Genera PDFs por grupo o por estudiante."
        size="lg"
        loading={loading}
        footer={
          <Button variant="outline" onClick={() => setActiveModal(null)} disabled={loading}>
            Cerrar
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Año Académico</Label>
            <select
              className={selectClassName}
              value={bulletinFilters.year}
              onChange={(e) => setBulletinFilters((prev) => ({ ...prev, year: e.target.value }))}
              disabled={loadingFilters}
            >
              <option value="">Selecciona…</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.year} ({y.status})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Grupo</Label>
            <select
              className={selectClassName}
              value={bulletinFilters.group}
              onChange={(e) => {
                const nextGroupId = e.target.value
                if (!nextGroupId) {
                  setBulletinFilters((prev) => ({ ...prev, group: '' }))
                  return
                }

                const selected = groups.find((g) => String(g.id) === nextGroupId)
                setBulletinFilters((prev) => ({
                  ...prev,
                  group: nextGroupId,
                  year: prev.year || (selected ? String(selected.academic_year) : prev.year),
                }))
              }}
              disabled={loadingFilters}
            >
              <option value="">Selecciona…</option>
              {getFilteredGroups({ year: bulletinFilters.year, grade: '' }).map((g) => (
                <option key={g.id} value={g.id}>
                  {(gradeNameById.get(g.grade) ? `${gradeNameById.get(g.grade)} — ` : '') + g.name}
                </option>
              ))}
            </select>
            {bulletinFilters.group ? (
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Selección:{' '}
                <span className="font-medium">
                  {(() => {
                    const selected = groups.find((gg) => String(gg.id) === bulletinFilters.group)
                    const gradeName = selected ? gradeNameById.get(selected.grade) : undefined
                    return `${gradeName || 'Grado'} / ${selected?.name || 'Grupo'}`
                  })()}
                </span>
              </div>
            ) : null}
            {!bulletinFilters.year ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Tip: puedes seleccionar el grupo primero; el año se autocompleta.
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Periodo</Label>
            <select
              className={selectClassName}
              value={bulletinPeriodId}
              onChange={(e) => setBulletinPeriodId(e.target.value)}
              disabled={!bulletinFilters.year}
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
                disabled={!bulletinFilters.group || !bulletinFilters.year}
                title={!bulletinFilters.group || !bulletinFilters.year ? 'Selecciona año y grupo primero' : undefined}
              >
                Estudiante
              </Button>
            </div>
          </div>
        </div>

        {bulletinMode === 'STUDENT' ? (
          <div className="mt-4 space-y-2">
            <Label>Estudiante</Label>
            <select
              className={selectClassName}
              value={bulletinEnrollmentId}
              onChange={(e) => setBulletinEnrollmentId(e.target.value)}
              disabled={!bulletinFilters.group || !bulletinFilters.year || loadingBulletinEnrollments}
            >
              <option value="">Selecciona…</option>
              {bulletinEnrollments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.student.full_name} ({e.student.document_number})
                </option>
              ))}
            </select>
            {loadingBulletinEnrollments ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">Cargando estudiantes…</div>
            ) : null}
            {!loadingBulletinEnrollments && bulletinFilters.group && bulletinFilters.year && bulletinEnrollments.length === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">No hay matrículas activas para este grupo.</div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5">
          <Button
            onClick={handleDownloadBulletin}
            disabled={
              loading ||
              !bulletinFilters.group ||
              !bulletinFilters.year ||
              !bulletinPeriodId ||
              (bulletinMode === 'STUDENT' && !bulletinEnrollmentId)
            }
            className="w-full"
          >
            Generar PDF
          </Button>
        </div>

        {bulletinJob ? (
          <div className="mt-4 text-xs text-slate-600 dark:text-slate-300">
            Estado: <span className="font-medium">{bulletinJob.status}</span>
            {typeof bulletinJob.progress === 'number' ? ` (${bulletinJob.progress}%)` : ''}
            {bulletinJob.status === 'FAILED' && bulletinJob.error_message ? ` — ${bulletinJob.error_message}` : ''}
          </div>
        ) : null}

        {bulletinJob?.status === 'FAILED' ? (
          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadBulletin}
              disabled={
                loading ||
                !bulletinFilters.group ||
                !bulletinFilters.year ||
                !bulletinPeriodId ||
                (bulletinMode === 'STUDENT' && !bulletinEnrollmentId)
              }
              className="w-full"
            >
              Reintentar
            </Button>
          </div>
        ) : null}
      </Modal>

      {/* Sabana Modal */}
      <Modal
        isOpen={activeModal === 'SABANA'}
        onClose={() => setActiveModal(null)}
        title="Sábana de notas por periodo"
        description="Genera un PDF horizontal con todas las notas del grupo para un periodo."
        size="lg"
        loading={loading}
        footer={
          <Button variant="outline" onClick={() => setActiveModal(null)} disabled={loading}>
            Cerrar
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Año Académico</Label>
            <select
              className={selectClassName}
              value={sabanaFilters.year}
              onChange={(e) => setSabanaFilters((prev) => ({ ...prev, year: e.target.value }))}
              disabled={loadingFilters}
            >
              <option value="">Selecciona…</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.year} ({y.status})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Grupo</Label>
            <select
              className={selectClassName}
              value={sabanaFilters.group}
              onChange={(e) => {
                const nextGroupId = e.target.value
                if (!nextGroupId) {
                  setSabanaFilters((prev) => ({ ...prev, group: '' }))
                  return
                }

                const selected = groups.find((g) => String(g.id) === nextGroupId)
                setSabanaFilters((prev) => ({
                  ...prev,
                  group: nextGroupId,
                  year: prev.year || (selected ? String(selected.academic_year) : prev.year),
                }))
              }}
              disabled={loadingFilters}
            >
              <option value="">Selecciona…</option>
              {getFilteredGroups({ year: sabanaFilters.year, grade: '' }).map((g) => (
                <option key={g.id} value={g.id}>
                  {(gradeNameById.get(g.grade) ? `${gradeNameById.get(g.grade)} — ` : '') + g.name}
                </option>
              ))}
            </select>
            {!sabanaFilters.year ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Tip: puedes seleccionar el grupo primero; el año se autocompleta.
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label>Periodo</Label>
          <select
            className={selectClassName}
            value={sabanaPeriodId}
            onChange={(e) => setSabanaPeriodId(e.target.value)}
            disabled={loadingFilters || !sabanaFilters.year}
          >
            <option value="">Selecciona…</option>
            {sabanaPeriodOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5">
          <Button
            onClick={handleDownloadSabana}
            disabled={loading || !sabanaFilters.group || !sabanaFilters.year || !sabanaPeriodId}
            className="w-full"
          >
            Generar PDF
          </Button>
        </div>

        {sabanaJob ? (
          <div className="mt-4 text-xs text-slate-600 dark:text-slate-300">
            Estado: <span className="font-medium">{sabanaJob.status}</span>
            {typeof sabanaJob.progress === 'number' ? ` (${sabanaJob.progress}%)` : ''}
            {sabanaJob.status === 'FAILED' && sabanaJob.error_message ? ` — ${sabanaJob.error_message}` : ''}
          </div>
        ) : null}

        {sabanaJob?.status === 'FAILED' ? (
          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadSabana}
              disabled={loading || !sabanaFilters.group || !sabanaFilters.year || !sabanaPeriodId}
              className="w-full"
            >
              Reintentar
            </Button>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
