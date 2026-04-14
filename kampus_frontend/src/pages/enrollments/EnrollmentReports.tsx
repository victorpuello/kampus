import { useMemo, useState, useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { enrollmentsApi } from '../../services/enrollments'
import { academicApi, type AcademicYear, type Grade, type Group, type Period } from '../../services/academic'
import { reportsApi, type ReportJob } from '../../services/reports'
import { pollJobUntilDone } from '../../utils/reportPolling'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Label } from '../../components/ui/Label'
import { Modal } from '../../components/ui/Modal'
import { Toast, type ToastType } from '../../components/ui/Toast'
import { FileSpreadsheet, FileText, BookOpen, ClipboardList, Clock, Users, ChevronRight, Loader2, Download } from 'lucide-react'
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
  const [activeModal, setActiveModal] = useState<null | 'ENROLLMENT_LIST' | 'BULLETINS' | 'SABANA' | 'FAMILY_DIRECTORY'>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const selectClassName =
    'flex h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

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
  const [familyDirectoryJob, setFamilyDirectoryJob] = useState<ReportJob | null>(null)

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
        const job = await pollJobUntilDone(created.data.id, { onUpdate: setEnrollmentListJob })

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

  const handleDownloadFamilyDirectoryByGroupPdf = async () => {
    setLoading(true)
    try {
      showToast('Generando PDF…', 'info')

      const created = await reportsApi.createJob({
        report_type: 'FAMILY_DIRECTORY_BY_GROUP',
        params: {},
      })

      setFamilyDirectoryJob(created.data)
      const job = await pollJobUntilDone(created.data.id, { onUpdate: setFamilyDirectoryJob })

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
        'directorio_padres_por_grado_grupo.pdf'

      downloadBlob(blob, filename)
      showToast('PDF listo.', 'success')
    } catch (error) {
      console.error(error)
      showToast('Error al generar el directorio de padres en PDF', 'error')
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

        const job = await pollJobUntilDone(jobId, { onUpdate: setBulletinJob })
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

      const job = await pollJobUntilDone(jobId, { onUpdate: setBulletinJob })
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

      const job = await pollJobUntilDone(jobId, { onUpdate: setSabanaJob })
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
      <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100 text-xl sm:text-2xl">Reportes de Matrículas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">No tienes permisos para acceder a reportes de matrículas.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
      </div>
    )
  }

  const JobStatusBadge = ({ job }: { job: ReportJob | null }) => {
    if (!job) return null
    const config: Record<string, { ring: string; dot: string; label: string }> = {
      PENDING:   { ring: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300',   dot: 'bg-amber-400',                    label: 'En cola…'   },
      RUNNING:   { ring: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300',         dot: 'bg-blue-500 animate-pulse',       label: 'Generando…' },
      SUCCEEDED: { ring: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300', dot: 'bg-emerald-500', label: '¡PDF listo!' },
      FAILED:    { ring: 'border-red-200 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300',               dot: 'bg-red-500',                      label: 'Error'      },
      CANCELED:  { ring: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400',      dot: 'bg-slate-400',                    label: 'Cancelado'  },
    }
    const cfg = config[job.status] ?? config.CANCELED
    return (
      <div className="mt-4 space-y-2">
        <div className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${cfg.ring}`}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} />
          <span className="font-medium">{cfg.label}</span>
          {typeof job.progress === 'number' && (
            <span className="ml-auto text-xs opacity-60">{job.progress}%</span>
          )}
          {job.status === 'FAILED' && job.error_message && (
            <span className="ml-1 truncate text-xs opacity-70">{job.error_message}</span>
          )}
        </div>
        {(job.status === 'RUNNING' || job.status === 'PENDING') && typeof job.progress === 'number' && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-700"
              style={{ width: `${Math.max(4, job.progress)}%` }}
            />
          </div>
        )}
      </div>
    )
  }

  const ReportCard = ({
    title,
    description,
    icon,
    formats,
    accentClass,
    iconBgClass,
    onAction,
    comingSoon,
  }: {
    title: string
    description: string
    icon: ReactNode
    formats?: ('CSV' | 'XLSX' | 'PDF')[]
    accentClass: string
    iconBgClass: string
    onAction: () => void
    comingSoon?: boolean
  }) => {
    const formatPill: Record<string, string> = {
      CSV:  'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
      XLSX: 'border-green-200 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300',
      PDF:  'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-300',
    }
    return (
      <div
        className={`group relative flex flex-col overflow-hidden rounded-xl border border-l-4 border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 ${accentClass} ${comingSoon ? 'opacity-55' : 'hover:shadow-md transition-shadow duration-200'}`}
      >
        {comingSoon && (
          <span className="absolute right-3 top-3 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            Próximamente
          </span>
        )}
        <div className="flex flex-1 flex-col p-5">
          <div className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBgClass}`}>
            {icon}
          </div>
          <h3 className="mt-3 text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
          {formats && formats.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {formats.map((f) => (
                <span key={f} className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold ${formatPill[f]}`}>
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <button
            onClick={onAction}
            disabled={comingSoon}
            className={`flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-colors ${comingSoon ? 'cursor-not-allowed text-slate-300 dark:text-slate-600' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}
          >
            {comingSoon
              ? 'Disponible pronto'
              : <><Download className="h-3.5 w-3.5" /><span>Generar reporte</span><ChevronRight className="h-3.5 w-3.5 opacity-40" /></>
            }
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
          Centro de Reportes
        </h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Genera y descarga reportes académicos e institucionales.
        </p>
      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ReportCard
          title="Reporte de Matriculados"
          description="Exporta matrículas activas por año, grado y grupo en CSV, XLSX o PDF institucional."
          icon={<ClipboardList className="h-5 w-5" />}
          formats={['CSV', 'XLSX', 'PDF']}
          accentClass="border-l-indigo-500"
          iconBgClass="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300"
          onAction={() => setActiveModal('ENROLLMENT_LIST')}
        />
        <ReportCard
          title="Boletines por periodo"
          description="Boletines en PDF por grupo completo o por estudiante, con código QR de verificación."
          icon={<BookOpen className="h-5 w-5" />}
          formats={['PDF']}
          accentClass="border-l-violet-500"
          iconBgClass="bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300"
          onAction={() => setActiveModal('BULLETINS')}
        />
        <ReportCard
          title="Sábana de notas"
          description="PDF horizontal con todas las notas del grupo, semáforo por nivel y conteo de perdidas."
          icon={<FileSpreadsheet className="h-5 w-5" />}
          formats={['PDF']}
          accentClass="border-l-teal-500"
          iconBgClass="bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300"
          onAction={() => setActiveModal('SABANA')}
        />
        <ReportCard
          title="Directorio de padres"
          description="PDF ordenado por grado y grupo con acudientes, teléfonos y membrete institucional."
          icon={<Users className="h-5 w-5" />}
          formats={['PDF']}
          accentClass="border-l-rose-500"
          iconBgClass="bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300"
          onAction={() => setActiveModal('FAMILY_DIRECTORY')}
        />
        <ReportCard
          title="Reporte de Seguimiento"
          description="Asistencias, novedades y observaciones consolidadas."
          icon={<Clock className="h-5 w-5" />}
          accentClass="border-l-slate-300"
          iconBgClass="bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
          onAction={() => {}}
          comingSoon
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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

        <div className="mt-6">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Formato de descarga</p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { fmt: 'csv'  as const, label: 'CSV',  icon: <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, hover: 'hover:border-emerald-300 hover:bg-emerald-50 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20' },
              { fmt: 'xlsx' as const, label: 'XLSX', icon: <FileSpreadsheet className="h-5 w-5 text-green-600 dark:text-green-400" />,   hover: 'hover:border-green-300 hover:bg-green-50 dark:hover:border-green-700 dark:hover:bg-green-900/20' },
              { fmt: 'pdf'  as const, label: 'PDF',  icon: <FileText className="h-5 w-5 text-rose-600 dark:text-rose-400" />,             hover: 'hover:border-rose-300 hover:bg-rose-50 dark:hover:border-rose-700 dark:hover:bg-rose-900/20' },
            ].map(({ fmt, label, icon, hover }) => (
              <button
                key={fmt}
                onClick={() => handleDownloadReport(fmt)}
                disabled={loading}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-4 text-center transition-colors disabled:opacity-40 dark:border-slate-700 ${hover}`}
              >
                {icon}
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <JobStatusBadge job={enrollmentListJob} />

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
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generando…</>
              : <><FileText className="mr-2 h-4 w-4" />Generar PDF</>
            }
          </Button>
        </div>

        <JobStatusBadge job={bulletinJob} />

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
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generando…</>
              : <><FileText className="mr-2 h-4 w-4" />Generar PDF</>
            }
          </Button>
        </div>

        <JobStatusBadge job={sabanaJob} />

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

      {/* Family Directory Modal */}
      <Modal
        isOpen={activeModal === 'FAMILY_DIRECTORY'}
        onClose={() => setActiveModal(null)}
        title="Directorio de padres por grado y grupo"
        description="Genera un PDF del año lectivo activo, ordenado por grados y grupos, con membrete institucional."
        size="lg"
        loading={loading}
        footer={
          <Button variant="outline" onClick={() => setActiveModal(null)} disabled={loading}>
            Cerrar
          </Button>
        }
      >
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          Este reporte incluye: grado, grupo, estudiante, acudiente, identificación, teléfono, dirección y parentezco.
        </div>

        <div className="mt-5">
          <Button onClick={handleDownloadFamilyDirectoryByGroupPdf} disabled={loading} className="w-full">
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generando…</>
              : <><FileText className="mr-2 h-4 w-4" />Generar PDF</>
            }
          </Button>
        </div>

        <JobStatusBadge job={familyDirectoryJob} />

        {familyDirectoryJob?.status === 'FAILED' ? (
          <div className="mt-3">
            <Button type="button" variant="outline" onClick={handleDownloadFamilyDirectoryByGroupPdf} disabled={loading} className="w-full">
              Reintentar PDF
            </Button>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
