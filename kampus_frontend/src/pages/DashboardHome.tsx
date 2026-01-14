import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Users, GraduationCap, BookOpen, Bell } from 'lucide-react'
import { studentsApi } from '../services/students'
import { teachersApi } from '../services/teachers'
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

  const [myAssignmentsCount, setMyAssignmentsCount] = useState<number>(0)
  const [myStudentsCount, setMyStudentsCount] = useState<number>(0)
  const [pendingSheetsCount, setPendingSheetsCount] = useState<number>(0)
  const [dashboardPeriodId, setDashboardPeriodId] = useState<number | null>(null)
  const [dashboardPeriodName, setDashboardPeriodName] = useState<string | null>(null)
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
        const [yearsRes, periodsRes, unreadRes, assignmentsRes] = await Promise.allSettled([
          academicApi.listYears(),
          academicApi.listPeriods(),
          notificationsApi.unreadCount(),
          academicApi.listMyAssignments(),
        ])

        const unread = unreadRes.status === 'fulfilled' ? unreadRes.value.data.unread || 0 : 0
        setUnreadNotificationsCount(unread)

        const assignments = assignmentsRes.status === 'fulfilled' ? assignmentsRes.value.data || [] : []
        setMyAssignmentsCount(assignments.length)

        // Determine an "active" year id for teacher dashboard. Prefer official ACTIVE year,
        // fallback to the most frequent year from teacher assignments.
        const years = yearsRes.status === 'fulfilled' ? yearsRes.value.data || [] : []
        const activeYear = years.find((y) => y.status === 'ACTIVE')

        let yearId: number | null = activeYear?.id ?? null
        if (!yearId && assignments.length > 0) {
          const counts = new Map<number, number>()
          for (const a of assignments) counts.set(a.academic_year, (counts.get(a.academic_year) ?? 0) + 1)
          let bestId: number | null = null
          let bestCount = -1
          for (const [id, c] of counts.entries()) {
            if (c > bestCount) {
              bestCount = c
              bestId = id
            }
          }
          yearId = bestId
        }

        const periods = periodsRes.status === 'fulfilled' ? periodsRes.value.data || [] : []
        const periodsForYear = yearId ? periods.filter((p) => p.academic_year === yearId) : periods

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

        if (dashboardPeriod?.id) {
          try {
            const sheetsRes = await academicApi.listAvailableGradeSheets(dashboardPeriod.id)
            const sheets = sheetsRes.data.results || []

            const pending = sheets.filter((s) => !s.completion.is_complete).length
            setPendingSheetsCount(pending)

            const studentsByGroup = new Map<number, number>()
            for (const s of sheets) {
              const prev = studentsByGroup.get(s.group_id) ?? 0
              studentsByGroup.set(s.group_id, Math.max(prev, s.students_count || 0))
            }
            const totalStudents = Array.from(studentsByGroup.values()).reduce((acc, n) => acc + n, 0)
            setMyStudentsCount(totalStudents)
          } catch {
            setPendingSheetsCount(0)
            setMyStudentsCount(0)
          }
        } else {
          setPendingSheetsCount(0)
          setMyStudentsCount(0)
        }

        // If nothing meaningful loaded, show error; otherwise allow partial UI.
        const nothingLoaded =
          unreadRes.status !== 'fulfilled' &&
          assignmentsRes.status !== 'fulfilled' &&
          periodsRes.status !== 'fulfilled'
        if (nothingLoaded) setMetricsError('No se pudieron cargar los indicadores.')

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

      setMyAssignmentsCount(0)
      setPendingSheetsCount(0)
      setMyStudentsCount(0)
      setDashboardPeriodId(null)
      setDashboardPeriodName(null)
      setGradeDeadlines([])
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
      return [
        {
          title: 'Mis asignaciones',
          value: metricsLoading ? '—' : String(myAssignmentsCount),
          description: 'Cargas asignadas (año activo si existe)',
          icon: GraduationCap,
          color: 'text-emerald-600',
          bg: 'bg-emerald-100',
          onClick: () => navigate('/my-assignment'),
        },
        {
          title: 'Planillas pendientes',
          value: metricsLoading ? '—' : String(pendingSheetsCount),
          description: dashboardPeriodName ? `En ${dashboardPeriodName}` : 'En el periodo actual',
          icon: BookOpen,
          color: 'text-blue-600',
          bg: 'bg-blue-100',
          onClick: () => navigate(dashboardPeriodId ? `/grades?period=${dashboardPeriodId}` : '/grades'),
        },
        {
          title: 'Mis estudiantes',
          value: metricsLoading ? '—' : String(myStudentsCount),
          description: dashboardPeriodName ? `En mis grupos (${dashboardPeriodName})` : 'En mis grupos',
          icon: Users,
          color: 'text-purple-600',
          bg: 'bg-purple-100',
          onClick: () => navigate('/students'),
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
    myAssignmentsCount,
    myStudentsCount,
    navigate,
    pendingSheetsCount,
    studentsCount,
    teachersCount,
    unreadNotificationsCount,
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-slate-500">
          Bienvenido de nuevo, {user?.first_name || user?.username}. Aquí tienes un resumen de hoy.
        </p>
      </div>

      {metricsError && (
        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm flex items-center justify-between gap-3">
          <div>{metricsError}</div>
          <Button variant="outline" size="sm" onClick={loadMetrics}>
            Reintentar
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Card
            key={index}
            className="cursor-pointer hover:border-slate-300 transition-colors"
            onClick={stat.onClick}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-full ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-slate-500">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Actividad Reciente</CardTitle>
            <Button variant="outline" size="sm" onClick={() => navigate('/notifications')}>
              Ver todo
            </Button>
          </CardHeader>
          <CardContent>
            {recentLoading ? (
              <div className="text-sm text-slate-500">Cargando actividad…</div>
            ) : recentNotifications.length === 0 ? (
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-slate-500">Sin actividad reciente.</div>
                <Button variant="outline" size="sm" onClick={loadRecent}>
                  Actualizar
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {recentNotifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="w-full text-left p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
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
        <div className="col-span-3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Accesos Rápidos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {quickActions.slice(0, 4).map((a) => (
                  <button
                    key={a.to}
                    type="button"
                    className="w-full flex items-center justify-between p-3 text-sm font-medium text-slate-700 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                    onClick={() => navigate(a.to)}
                  >
                    <span className="flex flex-col items-start">
                      <span>{a.label}</span>
                      <span className="text-xs text-slate-500 font-normal">{a.description}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {a.to === '/notifications' && unreadNotificationsCount > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-amber-200 bg-amber-50 text-amber-700">
                          {unreadNotificationsCount}
                        </span>
                      ) : null}
                      <span className="text-slate-400">→</span>
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Fechas importantes</CardTitle>
              {dashboardPeriodId ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/grades?period=${dashboardPeriodId}`)}
                >
                  Ir a calificaciones
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
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
                      <div key={d.periodId} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{d.periodName}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Límite cargue de notas: {formatDeadline(d.deadline)}
                          </div>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeClass}`}>
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
