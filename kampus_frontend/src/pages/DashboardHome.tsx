import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Users, GraduationCap, BookOpen, Bell, ClipboardCheck, BarChart3, FileSpreadsheet } from 'lucide-react'
import { studentsApi } from '../services/students'
import { teachersApi } from '../services/teachers'
import type { TeacherDashboardSummaryResponse } from '../services/teachers'
import { academicApi, type Period } from '../services/academic'
import { notificationsApi, type Notification } from '../services/notifications'

export default function DashboardHome() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const isTeacher = user?.role === 'TEACHER'
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN'

  const [metricsLoading, setMetricsLoading] = useState(true)
  const [metricsError, setMetricsError] = useState<string | null>(null)
  const [studentsCount, setStudentsCount] = useState<number>(0)
  const [teachersCount, setTeachersCount] = useState<number>(0)
  const [groupsCount, setGroupsCount] = useState<number>(0)
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0)

  const [dashboardPeriodId, setDashboardPeriodId] = useState<number | null>(null)
  const [dashboardPeriodName, setDashboardPeriodName] = useState<string | null>(null)
  const [nextPeriodName, setNextPeriodName] = useState<string | null>(null)
  const [teacherSummary, setTeacherSummary] = useState<TeacherDashboardSummaryResponse | null>(null)
  const [gradeDeadlines, setGradeDeadlines] = useState<Array<{ periodId: number; periodName: string; deadline: Date; isClosed: boolean }>>([])

  const [recentLoading, setRecentLoading] = useState(true)
  const [recentNotifications, setRecentNotifications] = useState<Notification[]>([])

  const formatRelativeTime = (iso: string) => {
    const date = new Date(iso)
    const ts = date.getTime()
    if (!Number.isFinite(ts)) return ''
    const diffMs = Date.now() - ts

    const minutes = Math.floor(diffMs / 60000)
    if (minutes < 1) return 'hace un momento'
    if (minutes < 60) return `hace ${minutes} min`

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `hace ${hours} h`

    const days = Math.floor(hours / 24)
    return `hace ${days} d`
  }

  const formatDeadline = (d: Date) => {
    const ts = d.getTime()
    if (!Number.isFinite(ts)) return ''
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getGradeDeadlineForPeriod = (p: Period): Date => {
    if (p.grades_edit_until) return new Date(p.grades_edit_until)
    return new Date(`${p.end_date}T23:59:59`)
  }

  const pickDashboardPeriod = (periods: Period[]): Period | null => {
    if (periods.length === 0) return null

    const now = new Date()
    const byStartAsc = [...periods].sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))

    const current = byStartAsc.find((p) => {
      const start = new Date(`${p.start_date}T00:00:00`)
      const end = new Date(`${p.end_date}T23:59:59`)
      return now.getTime() >= start.getTime() && now.getTime() <= end.getTime()
    })
    if (current) return current

    const open = byStartAsc.find((p) => !p.is_closed)
    if (open) return open

    return byStartAsc[byStartAsc.length - 1]
  }

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true)
    setMetricsError(null)

    try {
      if (isTeacher) {
        const [summaryRes, unreadRes] = await Promise.allSettled([
          teachersApi.myDashboardSummary(),
          notificationsApi.unreadCount(),
        ])

        const unread = unreadRes.status === 'fulfilled' ? unreadRes.value.data.unread || 0 : 0
        setUnreadNotificationsCount(unread)

        if (summaryRes.status !== 'fulfilled') {
          throw new Error('No se pudo cargar resumen docente')
        }

        const summary = summaryRes.value.data
        setTeacherSummary(summary)

        const currentPeriod = summary.periods.current
        const nextPeriod = summary.periods.next
        setDashboardPeriodId(currentPeriod?.id ?? null)
        setDashboardPeriodName(currentPeriod?.name ?? null)
        setNextPeriodName(nextPeriod?.name ?? null)

        setGradeDeadlines([])

        // Avoid showing admin/global metrics for teachers.
        setStudentsCount(0)
        setTeachersCount(0)
        setGroupsCount(0)
        return
      }

      // Non-teacher
      const [yearsRes, periodsRes, unreadRes] = await Promise.all([
        academicApi.listYears(),
        academicApi.listPeriods(),
        notificationsApi.unreadCount(),
      ])

      const activeYear = yearsRes.data.find((y) => y.status === 'ACTIVE')
      setUnreadNotificationsCount(unreadRes.data.unread || 0)

      const periodsForYear = activeYear
        ? (periodsRes.data || []).filter((p) => p.academic_year === activeYear.id)
        : (periodsRes.data || [])

      const dashboardPeriod = pickDashboardPeriod(periodsForYear)
      setDashboardPeriodId(dashboardPeriod?.id ?? null)
      setDashboardPeriodName(dashboardPeriod?.name ?? null)

      const deadlines = periodsForYear
        .map((p) => ({
          periodId: p.id,
          periodName: p.name,
          deadline: getGradeDeadlineForPeriod(p),
          isClosed: p.is_closed,
        }))
        .filter((x) => Number.isFinite(x.deadline.getTime()))
        .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())

      setGradeDeadlines(deadlines)

      // Admin / other roles
      const [studentsRes, teachersRes] = await Promise.all([
        studentsApi.list({ page: 1 }),
        teachersApi.getAll(),
      ])

      const groupsRes = await academicApi.listGroups(activeYear ? { academic_year: activeYear.id } : undefined)
      setStudentsCount(studentsRes.data.count ?? 0)
      setTeachersCount((teachersRes.data || []).length)
      setGroupsCount((groupsRes.data || []).length)

      setDashboardPeriodId(null)
      setDashboardPeriodName(null)
      setNextPeriodName(null)
      setGradeDeadlines([])
      setTeacherSummary(null)
    } catch {
      setMetricsError('No se pudieron cargar los indicadores.')
    } finally {
      setMetricsLoading(false)
    }
  }, [isTeacher])

  const loadRecent = useCallback(async () => {
    setRecentLoading(true)
    try {
      const res = await notificationsApi.list()
      const unread = (res.data || []).filter((n) => !n.is_read)
      unread.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      setRecentNotifications(unread.slice(0, 5))
    } catch {
      setRecentNotifications([])
    } finally {
      setRecentLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMetrics()
    loadRecent()
  }, [loadMetrics, loadRecent, user?.id])

  const quickActions = useMemo(() => {
    if (isTeacher) {
      return [
        { label: 'Calificaciones', description: 'Registrar y revisar notas', to: '/grades' },
        { label: 'Planeación', description: 'Gestionar planeación', to: '/planning' },
        { label: 'Mi asignación', description: 'Ver grupos y cargas', to: '/my-assignment' },
        {
          label: 'Notificaciones',
          description:
            unreadNotificationsCount > 0
              ? `${unreadNotificationsCount} pendientes por revisar`
              : 'Ver pendientes',
          to: '/notifications',
        },
      ]
    }

    if (isAdmin) {
      return [
        { label: 'Registrar estudiante', description: 'Crear nuevo estudiante', to: '/students/new' },
        { label: 'Crear docente', description: 'Registrar nuevo docente', to: '/teachers/new' },
        { label: 'Matrículas', description: 'Gestionar matrículas', to: '/enrollments' },
        { label: 'Configuración académica', description: 'Años, grupos y más', to: '/academic-config' },
      ]
    }

    return [
      { label: 'Estudiantes', description: 'Consultar listado', to: '/students' },
      { label: 'Docentes', description: 'Consultar listado', to: '/teachers' },
      { label: 'Notificaciones', description: 'Ver pendientes', to: '/notifications' },
      { label: 'Configuración académica', description: 'Años, grupos y más', to: '/academic-config' },
    ]
  }, [isAdmin, isTeacher, unreadNotificationsCount])

  const stats = useMemo(() => {
    if (isTeacher) {
      const performance = teacherSummary?.widgets.performance
      const planning = teacherSummary?.widgets.planning
      const recordSummary = teacherSummary?.widgets.student_records
      const sheetsSummary = teacherSummary?.widgets.grade_sheets

      const recordsPercent = recordSummary?.avg_percent ?? null

      return [
        {
          title: 'Rendimiento estudiantil',
          value: metricsLoading ? '—' : `${performance?.gradebook_completion_percent ?? 0}%`,
          description:
            metricsLoading
              ? 'Cargando...'
              : `${performance?.students_active ?? 0} estudiantes · ${performance?.at_risk_students ?? 0} en riesgo`,
          icon: BarChart3,
          color: 'text-emerald-600',
          bg: 'bg-emerald-100',
          onClick: () => navigate('/teacher-stats'),
        },
        {
          title: 'Planeación diligenciada',
          value: metricsLoading ? '—' : `${planning?.completion_percent ?? 0}%`,
          description:
            metricsLoading
              ? 'Cargando...'
              : `${planning?.assignments_with_planning ?? 0}/${planning?.assignments_total ?? 0} asignaciones en ${planning?.period?.name ?? 'periodo actual'}`,
          icon: ClipboardCheck,
          color: 'text-blue-600',
          bg: 'bg-blue-100',
          onClick: () => navigate('/planning'),
        },
        {
          title: 'Diligenciamiento fichas (director)',
          value: metricsLoading ? '—' : recordSummary?.enabled ? `${recordsPercent ?? 0}%` : 'N/A',
          description:
            metricsLoading
              ? 'Cargando...'
              : recordSummary?.enabled
                ? `${recordSummary.complete_100_count}/${recordSummary.students_total} al 100%`
                : 'No eres director de grupo en el año activo',
          icon: Users,
          color: 'text-purple-600',
          bg: 'bg-purple-100',
          onClick: () => navigate('/students'),
        },
        {
          title: 'Planillas pendientes',
          value: metricsLoading ? '—' : `${sheetsSummary?.current?.pending ?? 0} · ${sheetsSummary?.next?.pending ?? 0}`,
          description:
            metricsLoading
              ? 'Cargando...'
              : `${sheetsSummary?.current?.period?.name ?? dashboardPeriodName ?? 'Actual'} / ${sheetsSummary?.next?.period?.name ?? nextPeriodName ?? 'Siguiente'}`,
          icon: FileSpreadsheet,
          color: 'text-amber-600',
          bg: 'bg-amber-100',
          onClick: () => navigate(dashboardPeriodId ? `/grades?period=${dashboardPeriodId}` : '/grades'),
        },
      ]
    }

    return [
      {
        title: 'Estudiantes',
        value: metricsLoading ? '—' : String(studentsCount),
        description: 'Total registrados',
        icon: Users,
        color: 'text-blue-600',
        bg: 'bg-blue-100',
        onClick: () => navigate('/students'),
      },
      {
        title: 'Docentes',
        value: metricsLoading ? '—' : String(teachersCount),
        description: 'Total registrados',
        icon: GraduationCap,
        color: 'text-emerald-600',
        bg: 'bg-emerald-100',
        onClick: () => navigate('/teachers'),
      },
      {
        title: 'Grupos',
        value: metricsLoading ? '—' : String(groupsCount),
        description: 'En el año activo (si existe)',
        icon: BookOpen,
        color: 'text-purple-600',
        bg: 'bg-purple-100',
        onClick: () => navigate('/academic-config'),
      },
      {
        title: 'Notificaciones',
        value: metricsLoading ? '—' : String(unreadNotificationsCount),
        description: 'Pendientes por revisar',
        icon: Bell,
        color: 'text-amber-600',
        bg: 'bg-amber-100',
        onClick: () => navigate('/notifications'),
      },
    ]
  }, [
    groupsCount,
    dashboardPeriodId,
    dashboardPeriodName,
    isTeacher,
    metricsLoading,
    nextPeriodName,
    navigate,
    teacherSummary,
    studentsCount,
    teachersCount,
    unreadNotificationsCount,
  ])

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-sm sm:text-base text-slate-500">
          Bienvenido de nuevo, {user?.first_name || user?.username}. Aquí tienes un resumen de hoy.
        </p>
      </div>

      {metricsError && (
        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">{metricsError}</div>
          <Button className="w-full sm:w-auto" variant="outline" size="sm" onClick={loadMetrics}>
            Reintentar
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Card
            key={index}
            className="cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all"
            onClick={stat.onClick}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-full ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 sm:h-4 sm:w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-slate-500 leading-snug">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isTeacher && teacherSummary ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle>Estado académico del periodo</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
                  <span>Rendimiento (celdas calificadas)</span>
                  <span className="font-semibold">{teacherSummary.widgets.performance.gradebook_completion_percent}%</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${Math.min(100, Math.max(0, teacherSummary.widgets.performance.gradebook_completion_percent))}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
                  <span>Planeación diligenciada</span>
                  <span className="font-semibold">{teacherSummary.widgets.planning.completion_percent}%</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${Math.min(100, Math.max(0, teacherSummary.widgets.planning.completion_percent))}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {teacherSummary.widgets.planning.assignments_with_planning}/{teacherSummary.widgets.planning.assignments_total} asignaciones con planeación
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Estudiantes activos</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{teacherSummary.widgets.performance.students_active}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Estudiantes en riesgo</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{teacherSummary.widgets.performance.at_risk_students}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle>Planillas por periodo</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 space-y-3">
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {teacherSummary.widgets.grade_sheets.current.period?.name ?? 'Periodo actual'}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {teacherSummary.widgets.grade_sheets.current.pending} pendientes
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {teacherSummary.widgets.grade_sheets.next.period?.name ?? 'Siguiente periodo'}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {teacherSummary.widgets.grade_sheets.next.pending} pendientes
                </p>
              </div>

              {teacherSummary.widgets.student_records.enabled ? (
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Fichas estudiantiles completas</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {teacherSummary.widgets.student_records.complete_100_count}/{teacherSummary.widgets.student_records.students_computable}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Sin grupos dirigidos para medir fichas completas.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {isTeacher && metricsLoading && !teacherSummary ? (
        <div className="grid gap-4 lg:grid-cols-3 animate-pulse">
          <Card className="lg:col-span-2">
            <CardHeader className="p-4 sm:p-6">
              <div className="h-5 w-48 rounded bg-slate-200 dark:bg-slate-800" />
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
              <div className="space-y-2">
                <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-2 w-full rounded bg-slate-200 dark:bg-slate-800" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-2 w-full rounded bg-slate-200 dark:bg-slate-800" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="h-16 rounded-lg bg-slate-200 dark:bg-slate-800" />
                <div className="h-16 rounded-lg bg-slate-200 dark:bg-slate-800" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 sm:p-6">
              <div className="h-5 w-36 rounded bg-slate-200 dark:bg-slate-800" />
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 space-y-3">
              <div className="h-14 rounded-lg bg-slate-200 dark:bg-slate-800" />
              <div className="h-14 rounded-lg bg-slate-200 dark:bg-slate-800" />
              <div className="h-14 rounded-lg bg-slate-200 dark:bg-slate-800" />
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="md:col-span-2 lg:col-span-4">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6">
            <CardTitle>Actividad Reciente</CardTitle>
            <Button className="w-full sm:w-auto" variant="outline" size="sm" onClick={() => navigate('/notifications')}>
              Ver todo
            </Button>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            {recentLoading ? (
              <div className="text-sm text-slate-500">Cargando actividad…</div>
            ) : recentNotifications.length === 0 ? (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-sm text-slate-500">Sin actividad reciente.</div>
                <Button className="w-full sm:w-auto" variant="outline" size="sm" onClick={loadRecent}>
                  Actualizar
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {recentNotifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="w-full text-left p-3 sm:p-4 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                    onClick={() => navigate('/notifications')}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center flex-none">
                        <Bell className="h-4 w-4 text-amber-700" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{n.title}</div>
                        <div className="text-xs text-slate-500 mt-1 line-clamp-2">{n.body}</div>
                        <div className="text-xs text-slate-400 mt-2">{formatRelativeTime(n.created_at)}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <div className="md:col-span-2 lg:col-span-3 space-y-4">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle>Accesos Rápidos</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="space-y-2">
                {quickActions.slice(0, 4).map((a) => (
                  <button
                    key={a.to}
                    type="button"
                    className="w-full flex items-center justify-between p-3 text-sm font-medium text-slate-700 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors dark:text-slate-200 dark:bg-slate-900/40 dark:hover:bg-slate-800/60"
                    onClick={() => navigate(a.to)}
                  >
                    <span className="flex flex-col items-start">
                      <span>{a.label}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-normal line-clamp-2">{a.description}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {a.to === '/notifications' && unreadNotificationsCount > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                          {unreadNotificationsCount}
                        </span>
                      ) : null}
                      <span className="text-slate-400 dark:text-slate-500">→</span>
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6">
              <CardTitle>Fechas importantes</CardTitle>
              {dashboardPeriodId ? (
                <Button
                  className="w-full sm:w-auto"
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/grades?period=${dashboardPeriodId}`)}
                >
                  Ir a calificaciones
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              {!isTeacher ? (
                <div className="text-sm text-slate-500">Disponible para docentes.</div>
              ) : gradeDeadlines.length === 0 ? (
                <div className="text-sm text-slate-500">No hay fechas configuradas.</div>
              ) : (
                <div className="space-y-3">
                  {gradeDeadlines.slice(0, 4).map((d) => {
                    const now = Date.now()
                    const ts = d.deadline.getTime()
                    const overdue = Number.isFinite(ts) ? ts < now : false
                    const badgeClass = d.isClosed
                      ? 'border-slate-200 bg-slate-50 text-slate-600'
                      : overdue
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'

                    const badgeLabel = d.isClosed ? 'Cerrado' : overdue ? 'Vencido' : 'Vigente'

                    return (
                      <div key={d.periodId} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{d.periodName}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Límite cargue de notas: {formatDeadline(d.deadline)}
                          </div>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeClass} self-start sm:self-auto`}>
                          {badgeLabel}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
