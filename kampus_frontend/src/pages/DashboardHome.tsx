import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import {
  Users,
  GraduationCap,
  BookOpen,
  Bell,
  ClipboardCheck,
  BarChart3,
  FileSpreadsheet,
  Clock3,
  AlertTriangle,
  CalendarDays,
  TrendingUp,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  X,
  CalendarRange,
  UserCircle2,
  ChevronRight,
  ChevronLeft,
  Zap,
} from 'lucide-react'
import { studentsApi } from '../services/students'
import { teachersApi } from '../services/teachers'
import type { TeacherDashboardSummaryResponse } from '../services/teachers'
import { academicApi, type Period } from '../services/academic'
import { notificationsApi, type AdminDashboardSummary, type Notification } from '../services/notifications'
import { operationalPlanApi, type OperationalPlanActivity } from '../services/operationalPlan'

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
  const [teacherMotivationalPhrase, setTeacherMotivationalPhrase] = useState<string>('Hoy enseñas, inspiras y transformas con cada clase.')
  const [teacherSummary, setTeacherSummary] = useState<TeacherDashboardSummaryResponse | null>(null)
  const [gradeDeadlines, setGradeDeadlines] = useState<Array<{ periodId: number; periodName: string; deadline: Date; isClosed: boolean }>>([])

  const [recentLoading, setRecentLoading] = useState(true)
  const [recentNotifications, setRecentNotifications] = useState<Notification[]>([])
  const [recentPage, setRecentPage] = useState(0)
  const [notificationsTrend, setNotificationsTrend] = useState<{ last7: number; last30: number }>({ last7: 0, last30: 0 })
  const [operationalPlanLoading, setOperationalPlanLoading] = useState(true)
  const [operationalPlanItems, setOperationalPlanItems] = useState<OperationalPlanActivity[]>([])
  const [completingItemId, setCompletingItemId] = useState<number | null>(null)
  const [selectedPlanItem, setSelectedPlanItem] = useState<OperationalPlanActivity | null>(null)
  const [manualRefreshLoading, setManualRefreshLoading] = useState(false)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true)
  const [lastDashboardRefreshAt, setLastDashboardRefreshAt] = useState<Date | null>(null)

  const AUTO_REFRESH_MS = 120000
  const RECENT_PAGE_SIZE = 3
  const TEACHER_PHRASE_FALLBACK = 'Hoy enseñas, inspiras y transformas con cada clase.'
  const focusRingClass =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-sky-400'

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('es-CO', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
      }).format(new Date()),
    []
  )

  const userDisplayName = useMemo(() => {
    const formatName = (value: string) => {
      const lowercaseConnectors = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'do', 'dos', 'das'])

      return value
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word, index) => {
          const normalized = word.toLocaleLowerCase('es-CO')
          if (index > 0 && lowercaseConnectors.has(normalized)) {
            return normalized
          }

          const first = normalized.charAt(0).toLocaleUpperCase('es-CO')
          const rest = normalized.slice(1)
          return `${first}${rest}`
        })
        .join(' ')
    }

    const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
    const baseName = fullName || user?.username || 'usuario'
    return formatName(baseName)
  }, [user?.first_name, user?.last_name, user?.username])

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
        const [summaryRes, unreadRes, yearsRes, periodsRes] = await Promise.allSettled([
          teachersApi.myDashboardSummary(),
          notificationsApi.unreadCount(),
          academicApi.listYears(),
          academicApi.listPeriods(),
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

        if (yearsRes.status === 'fulfilled' && periodsRes.status === 'fulfilled') {
          const activeYear = yearsRes.value.data.find((y) => y.status === 'ACTIVE')
          const periodsForYear = activeYear
            ? (periodsRes.value.data || []).filter((p) => p.academic_year === activeYear.id)
            : (periodsRes.value.data || [])

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
        } else {
          setGradeDeadlines([])
        }

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

      setTeacherSummary(null)
    } catch {
      setMetricsError('No se pudieron cargar los indicadores.')
    } finally {
      setMetricsLoading(false)
    }
  }, [isTeacher])

  const loadRecent = useCallback(async () => {
    if (isAdmin) {
      setRecentLoading(true)
      setOperationalPlanLoading(true)
      try {
        const res = await notificationsApi.adminDashboardSummary()
        const summary: AdminDashboardSummary = res.data
        setUnreadNotificationsCount(summary.notifications.unread || 0)
        setNotificationsTrend({
          last7: summary.notifications.trend.last7 || 0,
          last30: summary.notifications.trend.last30 || 0,
        })
        setRecentNotifications(summary.notifications.recent_unread || [])
        setRecentPage(0)
        setOperationalPlanItems(summary.operational_plan.upcoming_items || [])
      } catch {
        setRecentNotifications([])
        setRecentPage(0)
        setNotificationsTrend({ last7: 0, last30: 0 })
      } finally {
        setRecentLoading(false)
        setOperationalPlanLoading(false)
      }
      return
    }

    setRecentLoading(true)
    try {
      const res = await notificationsApi.list()
      const unread = (res.data || []).filter((n) => !n.is_read)
      const now = Date.now()
      const last7Ms = 7 * 24 * 60 * 60 * 1000
      const last30Ms = 30 * 24 * 60 * 60 * 1000

      let unreadLast7 = 0
      let unreadLast30 = 0

      for (const item of unread) {
        const ts = new Date(item.created_at).getTime()
        if (!Number.isFinite(ts)) continue
        const age = now - ts
        if (age <= last30Ms) unreadLast30 += 1
        if (age <= last7Ms) unreadLast7 += 1
      }

      setNotificationsTrend({ last7: unreadLast7, last30: unreadLast30 })
      unread.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      setRecentNotifications(unread)
      setRecentPage(0)
    } catch {
      setRecentNotifications([])
      setRecentPage(0)
      setNotificationsTrend({ last7: 0, last30: 0 })
    } finally {
      setRecentLoading(false)
    }
  }, [isAdmin])

  const loadOperationalPlan = useCallback(async () => {
    if (isAdmin) {
      setOperationalPlanLoading(true)
      setRecentLoading(true)
      try {
        const res = await notificationsApi.adminDashboardSummary()
        const summary: AdminDashboardSummary = res.data
        setUnreadNotificationsCount(summary.notifications.unread || 0)
        setNotificationsTrend({
          last7: summary.notifications.trend.last7 || 0,
          last30: summary.notifications.trend.last30 || 0,
        })
        setRecentNotifications(summary.notifications.recent_unread || [])
        setRecentPage(0)
        setOperationalPlanItems(summary.operational_plan.upcoming_items || [])
      } catch {
        setOperationalPlanItems([])
      } finally {
        setOperationalPlanLoading(false)
        setRecentLoading(false)
      }
      return
    }

    setOperationalPlanLoading(true)
    try {
      const res = await operationalPlanApi.upcoming({ days: 30, limit: 50 })
      setOperationalPlanItems(res.data.results || [])
    } catch {
      setOperationalPlanItems([])
    } finally {
      setOperationalPlanLoading(false)
    }
  }, [isAdmin])

  const handleMarkComplete = useCallback(async (id: number) => {
    setCompletingItemId(id)
    try {
      await operationalPlanApi.markCompleted(id)
      setOperationalPlanItems((prev) => prev.filter((item) => item.id !== id))
    } catch {
      // silently ignore
    } finally {
      setCompletingItemId(null)
    }
  }, [])

  const refreshOperationalWidgets = useCallback(async () => {
    if (isAdmin) {
      await loadRecent()
      setLastDashboardRefreshAt(new Date())
      return
    }

    await Promise.all([loadRecent(), loadOperationalPlan()])
    setLastDashboardRefreshAt(new Date())
  }, [isAdmin, loadOperationalPlan, loadRecent])

  const refreshDashboardNow = useCallback(async () => {
    setManualRefreshLoading(true)
    try {
      if (isAdmin) {
        await Promise.all([loadMetrics(), loadRecent()])
      } else {
        await Promise.all([loadMetrics(), loadRecent(), loadOperationalPlan()])
      }
      setLastDashboardRefreshAt(new Date())
    } finally {
      setManualRefreshLoading(false)
    }
  }, [isAdmin, loadMetrics, loadOperationalPlan, loadRecent])

  useEffect(() => {
    refreshDashboardNow()
  }, [refreshDashboardNow, user?.id])

  useEffect(() => {
    if (!isTeacher || !user?.id) return

    let mounted = true

    ;(async () => {
      const cacheKey = `kampus:teacher:motivational-phrase:${user.id}`
      const today = new Intl.DateTimeFormat('en-CA').format(new Date())

      try {
        const cachedRaw = localStorage.getItem(cacheKey)
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw) as { phrase?: string; date?: string }
          const cachedPhrase = (cached?.phrase || '').trim()
          if (cached?.date === today && cachedPhrase) {
            if (mounted) setTeacherMotivationalPhrase(cachedPhrase)
            return
          }
        }
      } catch {
        void 0
      }

      try {
        const res = await notificationsApi.teacherMotivationalPhrase()
        if (!mounted) return
        const phrase = (res.data?.phrase || '').trim()
        if (phrase) {
          setTeacherMotivationalPhrase(phrase)
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ phrase, date: today }))
          } catch {
            void 0
          }
          return
        }
      } catch {
        void 0
      }

      if (!mounted) return
      setTeacherMotivationalPhrase(TEACHER_PHRASE_FALLBACK)
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ phrase: TEACHER_PHRASE_FALLBACK, date: today }))
      } catch {
        void 0
      }
    })()

    return () => {
      mounted = false
    }
  }, [isTeacher, user?.id])

  useEffect(() => {
    if (!isAdmin || !autoRefreshEnabled) return

    const interval = window.setInterval(() => {
      if (document.hidden) return
      refreshOperationalWidgets()
    }, AUTO_REFRESH_MS)

    return () => window.clearInterval(interval)
  }, [autoRefreshEnabled, isAdmin, refreshOperationalWidgets])

  const lastRefreshLabel = useMemo(() => {
    if (!lastDashboardRefreshAt) return 'sin actualización reciente'
    return new Intl.DateTimeFormat('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(lastDashboardRefreshAt)
  }, [lastDashboardRefreshAt])

  const quickActions = useMemo(() => {
    if (isTeacher) {
      return [
        { label: 'Calificaciones', description: 'Registrar y revisar notas', to: '/grades', icon: FileSpreadsheet },
        { label: 'Planeador de clases', description: 'Crear y ajustar planes de clase', to: '/class-planner', icon: ClipboardCheck },
        { label: 'Mi asignación', description: 'Ver grupos y cargas', to: '/my-assignment', icon: BookOpen },
        {
          label: 'Notificaciones',
          description:
            unreadNotificationsCount > 0
              ? `${unreadNotificationsCount} pendientes por revisar`
              : 'Ver pendientes',
          to: '/notifications',
          icon: Bell,
        },
      ]
    }

    if (isAdmin) {
      return [
        { label: 'Registrar estudiante', description: 'Crear nuevo estudiante', to: '/students/new', icon: Users },
        { label: 'Crear docente', description: 'Registrar nuevo docente', to: '/teachers/new', icon: GraduationCap },
        { label: 'Matrículas', description: 'Gestionar matrículas', to: '/enrollments', icon: BookOpen },
        { label: 'Configuración académica', description: 'Años, grupos y más', to: '/academic-config', icon: BarChart3 },
      ]
    }

    return [
      { label: 'Estudiantes', description: 'Consultar listado', to: '/students', icon: Users },
      { label: 'Docentes', description: 'Consultar listado', to: '/teachers', icon: GraduationCap },
      { label: 'Notificaciones', description: 'Ver pendientes', to: '/notifications', icon: Bell },
      { label: 'Configuración académica', description: 'Años, grupos y más', to: '/academic-config', icon: BarChart3 },
    ]
  }, [isAdmin, isTeacher, unreadNotificationsCount])

  const notificationsHealth = useMemo(() => {
    if (unreadNotificationsCount >= 30) {
      return {
        label: 'Crítico',
        description: 'Hay alto volumen de pendientes por atender',
        badgeClass:
          'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200',
      }
    }

    if (unreadNotificationsCount >= 10) {
      return {
        label: 'Atención',
        description: 'Conviene revisar la bandeja para evitar acumulación',
        badgeClass:
          'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200',
      }
    }

    return {
      label: 'Estable',
      description: 'Flujo de notificaciones bajo control',
      badgeClass:
        'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200',
    }
  }, [unreadNotificationsCount])

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
          title: 'Planeación de periodo diligenciada',
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

  const teacherDailyFocus = useMemo(() => {
    if (!isTeacher) return []

    const atRisk = teacherSummary?.widgets.performance.at_risk_students ?? 0
    const planningPending = Math.max(
      0,
      (teacherSummary?.widgets.planning.assignments_total ?? 0) -
        (teacherSummary?.widgets.planning.assignments_with_planning ?? 0)
    )
    const pendingSheets =
      (teacherSummary?.widgets.grade_sheets.current.pending ?? 0) +
      (teacherSummary?.widgets.grade_sheets.next.pending ?? 0)

    return [
      {
        title: 'Riesgo académico',
        value: atRisk,
        helper: atRisk > 0 ? 'Estudiantes que requieren seguimiento' : 'Sin alertas críticas hoy',
        icon: AlertTriangle,
        to: '/teacher-stats',
      },
      {
        title: 'Planeación de periodo pendiente',
        value: planningPending,
        helper: planningPending > 0 ? 'Asignaciones por diligenciar en el periodo' : 'Planeación de periodo al día',
        icon: ClipboardCheck,
        to: '/planning',
      },
      {
        title: 'Notificaciones sin leer',
        value: unreadNotificationsCount,
        helper: unreadNotificationsCount > 0 ? 'Pendientes por revisar' : 'Sin pendientes',
        icon: Bell,
        to: '/notifications',
      },
      {
        title: 'Planillas pendientes',
        value: pendingSheets,
        helper: 'Periodo actual + siguiente',
        icon: FileSpreadsheet,
        to: dashboardPeriodId ? `/grades?period=${dashboardPeriodId}` : '/grades',
      },
    ]
  }, [dashboardPeriodId, isTeacher, teacherSummary, unreadNotificationsCount])

  const adminControlWidgets = useMemo(() => {
    if (isTeacher) return []

    const studentsPerTeacher = teachersCount > 0 ? (studentsCount / teachersCount).toFixed(1) : '—'
    const studentsPerGroup = groupsCount > 0 ? (studentsCount / groupsCount).toFixed(1) : '—'
    const groupsPerTeacher = teachersCount > 0 ? (groupsCount / teachersCount).toFixed(1) : '—'

    return [
      {
        title: 'Carga por docente',
        value: studentsPerTeacher,
        helper: 'Promedio estudiantes/docente',
        icon: GraduationCap,
        to: '/teachers',
      },
      {
        title: 'Tamaño promedio de grupo',
        value: studentsPerGroup,
        helper: 'Promedio estudiantes/grupo',
        icon: Users,
        to: '/groups',
      },
      {
        title: 'Cobertura docente',
        value: groupsPerTeacher,
        helper: 'Promedio grupos/docente',
        icon: BookOpen,
        to: '/academic-config',
      },
      {
        title: 'Salud de notificaciones',
        value: notificationsHealth.label,
        helper: notificationsHealth.description,
        icon: Bell,
        to: '/notifications',
      },
    ]
  }, [groupsCount, isTeacher, notificationsHealth.description, notificationsHealth.label, studentsCount, teachersCount])

  const operationalPlanSummary = useMemo(() => {
    let within7Days = 0
    let within30Days = 0
    let dueToday = 0
    let dueSoon = 0
    let withoutResponsible = 0

    for (const item of operationalPlanItems) {
      const daysUntil = item.days_until
      if (daysUntil >= 0 && daysUntil <= 7) within7Days += 1
      if (daysUntil >= 0 && daysUntil <= 30) within30Days += 1
      if (daysUntil === 0) dueToday += 1
      if (daysUntil >= 1 && daysUntil <= 3) dueSoon += 1
      if (item.responsible_users.length === 0) withoutResponsible += 1
    }

    return {
      within7Days,
      within30Days,
      dueToday,
      dueSoon,
      withoutResponsible,
    }
  }, [operationalPlanItems])

  const adminTrend = useMemo(() => {
    if (isTeacher) {
      return {
        operational7: 0,
        operational30: 0,
        unread7: 0,
        unread30: 0,
        operationalProgressPct: 0,
        unreadProgressPct: 0,
      }
    }

    const operational7 = operationalPlanSummary.within7Days
    const operational30 = operationalPlanSummary.within30Days
    const unread7 = notificationsTrend.last7
    const unread30 = notificationsTrend.last30

    return {
      operational7,
      operational30,
      unread7,
      unread30,
      operationalProgressPct: operational30 > 0 ? Math.round((operational7 / operational30) * 100) : 0,
      unreadProgressPct: unread30 > 0 ? Math.round((unread7 / unread30) * 100) : 0,
    }
  }, [isTeacher, notificationsTrend.last30, notificationsTrend.last7, operationalPlanSummary.within30Days, operationalPlanSummary.within7Days])

  const adminCriticalItems = useMemo(() => {
    if (isTeacher) return []

    const buildLevel = (value: number, critical: number, warning: number): 'red' | 'yellow' | 'green' => {
      if (value >= critical) return 'red'
      if (value >= warning) return 'yellow'
      return 'green'
    }

    return [
      {
        label: 'Notificaciones por atender',
        value: unreadNotificationsCount,
        helper: 'Bandeja operativa sin leer',
        level: buildLevel(unreadNotificationsCount, 30, 10),
        to: '/notifications',
      },
      {
        label: 'Actividades para hoy',
        value: operationalPlanSummary.dueToday,
        helper: 'Compromisos con vencimiento hoy',
        level: buildLevel(operationalPlanSummary.dueToday, 3, 1),
        to: '/operations/plan-activities',
      },
      {
        label: 'Actividades en 1-3 días',
        value: operationalPlanSummary.dueSoon,
        helper: 'Pendientes de ventana corta',
        level: buildLevel(operationalPlanSummary.dueSoon, 8, 4),
        to: '/operations/plan-activities',
      },
      {
        label: 'Sin responsable asignado',
        value: operationalPlanSummary.withoutResponsible,
        helper: 'Actividades sin dueño definido',
        level: buildLevel(operationalPlanSummary.withoutResponsible, 3, 1),
        to: '/operations/plan-activities',
      },
    ]
  }, [isTeacher, operationalPlanSummary.dueSoon, operationalPlanSummary.dueToday, operationalPlanSummary.withoutResponsible, unreadNotificationsCount])

  const totalRecentPages = useMemo(
    () => Math.max(1, Math.ceil(recentNotifications.length / RECENT_PAGE_SIZE)),
    [recentNotifications.length]
  )

  const recentNotificationsPage = useMemo(() => {
    const start = recentPage * RECENT_PAGE_SIZE
    return recentNotifications.slice(start, start + RECENT_PAGE_SIZE)
  }, [recentNotifications, recentPage])

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
        {/* Indigo left accent bar — academia/learning signature */}
        <div className="absolute left-0 inset-y-0 w-1 rounded-l-xl bg-linear-to-b from-indigo-400 to-violet-500" />
        {/* Subtle background warmth */}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-indigo-50/40 via-transparent to-transparent dark:from-indigo-950/15" />
        <div className="relative flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">{todayLabel}</p>
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
              {isTeacher ? 'DOCENTE' : 'ADMINISTRADOR'}
            </span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                Bienvenido, {userDisplayName}.
              </h1>
              {isTeacher ? (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{teacherMotivationalPhrase}</p>
              ) : (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Priorizamos lo más importante para hoy.</p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-stretch gap-2">
              <button
                type="button"
                className={`flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-left hover:bg-amber-100 transition-colors dark:border-amber-900/40 dark:bg-amber-950/20 dark:hover:bg-amber-950/30 ${focusRingClass}`}
                onClick={() => navigate('/notifications')}
              >
                <Bell className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">Pendientes</p>
                  <p className="text-lg font-bold leading-tight text-amber-900 dark:text-amber-100">{metricsLoading ? '—' : unreadNotificationsCount}</p>
                </div>
              </button>
              <button
                type="button"
                className={`flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-left hover:bg-blue-100 transition-colors dark:border-blue-900/40 dark:bg-blue-950/20 dark:hover:bg-blue-950/30 ${focusRingClass}`}
                onClick={() => navigate(isTeacher ? '/planning' : '/operations/plan-activities')}
              >
                <CalendarDays className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <div>
                  <p className="text-[11px] font-medium text-blue-700 dark:text-blue-300">Actividades</p>
                  <p className="text-lg font-bold leading-tight text-blue-900 dark:text-blue-100">{operationalPlanLoading ? '—' : operationalPlanItems.length}</p>
                </div>
              </button>
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 dark:border-slate-700 dark:bg-slate-800/60">
                <span className={`shrink-0 h-2.5 w-2.5 rounded-full ${
                  unreadNotificationsCount >= 30 ? 'bg-rose-500' :
                  unreadNotificationsCount >= 10 ? 'bg-amber-500' :
                  'bg-emerald-500'
                }`} />
                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Estado</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{notificationsHealth.label}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Indicadores clave
        </h2>
        <div className="flex items-center gap-2">
          {isTeacher ? (
            <>
              <button
                type="button"
                className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 min-h-9 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors dark:text-slate-300 dark:hover:bg-slate-800 ${focusRingClass}`}
                onClick={() => navigate('/grades')}
              >
                Calificaciones <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 min-h-9 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors dark:text-slate-300 dark:hover:bg-slate-800 ${focusRingClass}`}
                onClick={() => navigate('/notifications')}
              >
                Notificaciones <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <p className="hidden sm:block text-[11px] text-slate-400 dark:text-slate-500" role="status" aria-live="polite">
                {lastRefreshLabel}
              </p>
              <button
                type="button"
                title={autoRefreshEnabled ? 'Desactivar auto-refresh' : 'Activar auto-refresh'}
                aria-pressed={autoRefreshEnabled}
                className={`flex items-center justify-center min-h-9 min-w-9 rounded-lg border transition-colors ${focusRingClass} ${
                  autoRefreshEnabled
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-400'
                    : 'border-slate-200 text-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                }`}
                onClick={() => setAutoRefreshEnabled((prev) => !prev)}
              >
                <Zap className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Actualizar panel"
                disabled={manualRefreshLoading}
                className={`flex items-center justify-center min-h-9 min-w-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 transition-colors dark:border-slate-700 dark:hover:bg-slate-800 ${focusRingClass}`}
                onClick={refreshDashboardNow}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${manualRefreshLoading ? 'animate-spin' : ''}`} />
              </button>
            </>
          )}
        </div>
      </div>

      {metricsError && (
        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">{metricsError}</div>
          <Button className="w-full sm:w-auto" variant="outline" size="sm" onClick={loadMetrics}>
            Reintentar
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => {
          const borderCls = (
            { 'text-emerald-600': 'border-l-emerald-400', 'text-blue-600': 'border-l-blue-400', 'text-purple-600': 'border-l-purple-400', 'text-amber-600': 'border-l-amber-400' } as Record<string, string>
          )[stat.color] ?? 'border-l-slate-300'
          return (
            <Card
              key={index}
              className={`cursor-pointer touch-manipulation border-slate-200 border-l-4 ${borderCls} hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] active:translate-y-0 transition-all dark:border-slate-800 ${focusRingClass}`}
              onClick={stat.onClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  stat.onClick()
                }
              }}
            >
              <CardHeader className="p-4 pb-1.5 sm:p-5 sm:pb-1.5">
                <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {stat.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{stat.value}</div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-snug">{stat.description}</p>
                  </div>
                  <div className={`shrink-0 p-2.5 rounded-xl ${stat.bg}`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {isTeacher && teacherSummary ? (
        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-7">
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
                  <span>Planeación de periodo diligenciada</span>
                  <span className="font-semibold">{teacherSummary.widgets.planning.completion_percent}%</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${Math.min(100, Math.max(0, teacherSummary.widgets.planning.completion_percent))}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {teacherSummary.widgets.planning.assignments_with_planning}/{teacherSummary.widgets.planning.assignments_total} asignaciones con planeación de periodo
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

          <Card className="lg:col-span-5">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle>Foco docente del día</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {teacherDailyFocus.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    className={`min-h-20 rounded-lg border border-slate-200 p-3 text-left transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${focusRingClass}`}
                    onClick={() => navigate(item.to)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{item.title}</p>
                        <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{item.value}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.helper}</p>
                      </div>
                      <item.icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                    </div>
                  </button>
                ))}
              </div>

              {teacherSummary.widgets.student_records.enabled ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Fichas estudiantiles completas (director)</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {teacherSummary.widgets.student_records.complete_100_count}/
                    {teacherSummary.widgets.student_records.students_computable}
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

      {!isTeacher ? (
        <Card>
          <CardHeader className="flex flex-col gap-2 p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Centro de control administrativo</CardTitle>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Widgets sugeridos para balancear capacidad, carga y operación diaria.
              </p>
            </div>
            <Button className="w-full md:w-auto" variant="outline" size="sm" onClick={() => navigate('/notifications')}>
              Ir a bandeja operativa
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {adminControlWidgets.map((widget) => (
                <button
                  key={widget.title}
                  type="button"
                  onClick={() => navigate(widget.to)}
                  className={`min-h-24 rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:bg-slate-800/60 ${focusRingClass}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500 dark:text-slate-400">{widget.title}</p>
                      <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{widget.value}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{widget.helper}</p>
                    </div>
                    <widget.icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!isTeacher ? (
        <Card>
          <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-300">Pendientes críticos</CardTitle>
              <button
                type="button"
                className={`flex items-center gap-1 rounded-md px-2 py-1.5 min-h-9 text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors dark:text-slate-400 dark:hover:bg-slate-800 ${focusRingClass}`}
                onClick={() => navigate('/notifications')}
              >
                Ver todo <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
            <div className="grid grid-cols-2 gap-2.5">
              {adminCriticalItems.map((item) => {
                const borderCls = item.level === 'red'
                  ? 'border-t-rose-400'
                  : item.level === 'yellow'
                    ? 'border-t-amber-400'
                    : 'border-t-emerald-400'
                const valueCls = item.level === 'red'
                  ? 'text-rose-600 dark:text-rose-400'
                  : item.level === 'yellow'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                const dotCls = item.level === 'red'
                  ? 'bg-rose-400'
                  : item.level === 'yellow'
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
                return (
                  <button
                    key={item.label}
                    type="button"
                    className={`rounded-xl border-2 border-t-4 border-slate-100 ${borderCls} bg-slate-50/60 p-3 text-left transition-all hover:bg-white hover:shadow-sm dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800/70 ${focusRingClass}`}
                    onClick={() => navigate(item.to)}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <p className="text-[11px] font-medium leading-snug text-slate-500 dark:text-slate-400">{item.label}</p>
                      <span className={`mt-0.5 shrink-0 h-2 w-2 rounded-full ${dotCls}`} />
                    </div>
                    <p className={`mt-1.5 text-3xl font-bold tracking-tight leading-none ${valueCls}`}>{item.value}</p>
                    <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500 leading-snug">{item.helper}</p>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!isTeacher ? (
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-slate-400" />
              Tendencia 7/30 días
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
            <button
              type="button"
              className={`w-full rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${focusRingClass}`}
              onClick={() => navigate('/operations/plan-activities')}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Actividades operativas</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {operationalPlanLoading ? '—' : `${adminTrend.operational7} / ${adminTrend.operational30}`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Próximas en 7 días vs ventana de 30 días</p>
                </div>
                <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
                  {operationalPlanLoading ? '—' : `${adminTrend.operationalProgressPct}%`}
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${Math.max(0, Math.min(100, adminTrend.operationalProgressPct))}%` }}
                />
              </div>
            </button>

            <button
              type="button"
              className={`w-full rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${focusRingClass}`}
              onClick={() => navigate('/notifications')}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Notificaciones no leídas</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {recentLoading ? '—' : `${adminTrend.unread7} / ${adminTrend.unread30}`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Pendientes creadas en los últimos 7 días sobre 30 días</p>
                </div>
                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                  {recentLoading ? '—' : `${adminTrend.unreadProgressPct}%`}
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full bg-amber-500"
                  style={{ width: `${Math.max(0, Math.min(100, adminTrend.unreadProgressPct))}%` }}
                />
              </div>
            </button>
          </CardContent>
        </Card>
      ) : null}

      {isTeacher && metricsLoading && !teacherSummary ? (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3 animate-pulse">
          <Card className="lg:col-span-2 xl:col-span-2">
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

      <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-6 xl:col-span-5 space-y-4 self-start">
          <Card>
            <CardHeader className="flex items-center justify-between gap-3 p-4 pb-0 sm:p-6 sm:pb-0">
              <CardTitle>Actividad Reciente</CardTitle>
              <Button className="shrink-0" variant="outline" size="sm" onClick={() => navigate('/notifications')}>
                Ver todo
              </Button>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-4 sm:pt-6">
              {recentLoading ? (
                <div className="text-sm text-slate-500">Cargando actividad…</div>
              ) : recentNotifications.length === 0 ? (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="text-sm text-slate-500">No tienes notificaciones pendientes recientes. Puedes revisar el historial completo.</div>
                  <Button className="w-full min-h-11 sm:w-auto" variant="outline" size="sm" onClick={loadRecent}>
                    Actualizar
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="space-y-3 overflow-y-auto overscroll-contain max-h-72 pr-1">
                    {recentNotificationsPage.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className={`w-full text-left rounded-lg px-3 py-2.5 hover:bg-slate-50 active:bg-slate-100 transition-colors touch-manipulation dark:hover:bg-slate-800/50 ${focusRingClass}`}
                        onClick={() => navigate('/notifications')}
                      >
                        <div className="flex items-start gap-3">
                          <span className="shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-400 dark:bg-amber-500" />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2 sm:line-clamp-1">{n.title}</p>
                              <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{formatRelativeTime(n.created_at)}</span>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 sm:line-clamp-1">{n.body}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setRecentPage((prev) => Math.max(0, prev - 1))}
                      disabled={recentPage === 0}
                      className={`flex items-center justify-center min-h-11 min-w-11 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors dark:hover:bg-slate-800 dark:hover:text-slate-300 ${focusRingClass}`}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {Math.min(recentPage + 1, totalRecentPages)}/{totalRecentPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRecentPage((prev) => Math.min(totalRecentPages - 1, prev + 1))}
                      disabled={recentPage >= totalRecentPages - 1}
                      className={`flex items-center justify-center min-h-11 min-w-11 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors dark:hover:bg-slate-800 dark:hover:text-slate-300 ${focusRingClass}`}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {!isTeacher ? (
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle>Alertas y tiempos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
                <button
                  type="button"
                  className={`w-full rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${focusRingClass}`}
                  onClick={() => navigate('/notifications')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Pendientes de atención</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{metricsLoading ? '—' : unreadNotificationsCount}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Prioriza lectura y cierre de pendientes</p>
                    </div>
                    <AlertTriangle className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  </div>
                </button>
                <button
                  type="button"
                  className={`w-full rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${focusRingClass}`}
                  onClick={() => navigate('/operations/plan-activities')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Agenda operativa (30 días)</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                        {operationalPlanLoading ? '—' : operationalPlanItems.length}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Actividades con seguimiento cercano</p>
                    </div>
                    <Clock3 className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  </div>
                </button>
              </CardContent>
            </Card>
          ) : null}

          {isTeacher ? (
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6">
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  Fechas importantes
                </CardTitle>
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
                {gradeDeadlines.length === 0 ? (
                  <div className="text-sm text-slate-500">No hay fechas de cierre configuradas para los periodos del año activo.</div>
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
                        <div key={d.periodId} className="flex flex-col gap-2 min-[430px]:flex-row min-[430px]:items-start min-[430px]:justify-between min-[430px]:gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2 min-[430px]:line-clamp-1">{d.periodName}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              Límite: {formatDeadline(d.deadline)}
                            </div>
                          </div>
                          <span className={`shrink-0 self-start inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badgeClass}`}>
                            {badgeLabel}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
        <div className="lg:col-span-6 xl:col-span-7 space-y-4">
          <Card>
            <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3">
              <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-300">Accesos rápidos</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-1">
                {quickActions.slice(0, 4).map((a) => {
                  const ActionIcon = a.icon
                  return (
                    <button
                      key={a.to}
                      type="button"
                      className={`w-full flex items-start gap-3 rounded-lg px-3 py-3 min-h-11 text-left hover:bg-slate-50 active:bg-slate-100 touch-manipulation transition-colors dark:hover:bg-slate-800/50 sm:items-center ${focusRingClass}`}
                      onClick={() => navigate(a.to)}
                    >
                      {ActionIcon && (
                        <span className="mt-0.5 shrink-0 w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 sm:mt-0">
                          <ActionIcon className="h-4 w-4" />
                        </span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">{a.label}</span>
                        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400 line-clamp-2 sm:line-clamp-1">{a.description}</span>
                      </span>
                      <span className="mt-0.5 flex shrink-0 items-center gap-1.5 sm:mt-0">
                        {a.to === '/notifications' && unreadNotificationsCount > 0 ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            {unreadNotificationsCount}
                          </span>
                        ) : null}
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-600" />
                      </span>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 sm:p-6 pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle>Plan operativo</CardTitle>
                  {!operationalPlanLoading && operationalPlanItems.length > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      {operationalPlanItems.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!isTeacher && (
                    <button
                      type="button"
                      title="Ir a plan operativo"
                      className={`flex items-center justify-center min-h-9 min-w-9 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors dark:hover:bg-slate-800 dark:hover:text-slate-300 ${focusRingClass}`}
                      onClick={() => navigate('/operations/plan-activities')}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    title="Actualizar"
                    className={`flex items-center justify-center min-h-9 min-w-9 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors dark:hover:bg-slate-800 dark:hover:text-slate-300 ${focusRingClass}`}
                    onClick={loadOperationalPlan}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              {operationalPlanLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-9 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                  ))}
                </div>
              ) : operationalPlanItems.length === 0 ? (
                <p className="py-2 text-sm text-slate-500 dark:text-slate-400">
                  Sin actividades en los próximos 30 días.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {operationalPlanItems.slice(0, 6).map((item) => {
                    const d = item.days_until
                    const daysLabel = d < 0 ? 'Vencida' : d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : `+${d}d`
                    const chipCls =
                      d <= 0
                        ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                        : d === 1
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300'
                          : d <= 3
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            : d <= 7
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    const completing = completingItemId === item.id
                    return (
                      <div key={item.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0 sm:items-center">
                        <button
                          type="button"
                          className={`flex-1 min-w-0 flex flex-col items-start gap-1.5 text-left group/row rounded sm:flex-row sm:items-center sm:gap-2 ${focusRingClass}`}
                          onClick={() => setSelectedPlanItem(item)}
                        >
                          <span
                            className={`shrink-0 w-18 text-center text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${chipCls}`}
                          >
                            {daysLabel}
                          </span>
                          <span className="flex-1 min-w-0 text-sm font-medium leading-snug text-slate-800 dark:text-slate-200 transition-colors line-clamp-2 sm:truncate sm:line-clamp-1 group-hover/row:text-sky-600 dark:group-hover/row:text-sky-400">
                            {item.title}
                          </span>
                        </button>
                        {item.responsible_users.length > 0 && (
                          <div className="hidden sm:flex shrink-0 -space-x-1.5">
                            {item.responsible_users.slice(0, 2).map((u) => (
                              <span
                                key={u.id}
                                title={u.full_name}
                                className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 flex items-center justify-center text-[10px] font-bold ring-2 ring-white dark:ring-slate-900 select-none"
                              >
                                {u.full_name
                                  .split(' ')
                                  .map((w) => w[0])
                                  .filter(Boolean)
                                  .slice(0, 2)
                                  .join('')
                                  .toUpperCase()}
                              </span>
                            ))}
                            {item.responsible_users.length > 2 && (
                              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 flex items-center justify-center text-[10px] font-bold ring-2 ring-white dark:ring-slate-900 select-none">
                                +{item.responsible_users.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                        {!isTeacher && (
                          <button
                            type="button"
                            disabled={completing}
                            title="Marcar completada"
                            className={`shrink-0 flex items-center justify-center min-h-9 min-w-9 rounded-lg text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400 transition-colors disabled:opacity-40 ${focusRingClass}`}
                            onClick={() => handleMarkComplete(item.id)}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity detail panel */}
          {selectedPlanItem && (() => {
            const item = selectedPlanItem
            const d = item.days_until
            const daysLabel = d < 0 ? 'Vencida' : d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : `+${d}d`
            const chipCls =
              d <= 0
                ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                : d === 1
                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300'
                  : d <= 3
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                    : d <= 7
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            const fmt = (s: string) =>
              new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
                new Date(s + 'T00:00:00'),
              )
            const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
            return (
              <>
                <div
                  className="fixed inset-0 z-40 bg-black/30 dark:bg-black/50"
                  onClick={() => setSelectedPlanItem(null)}
                />
                <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-full sm:w-88 bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800">
                  {/* Panel header */}
                  <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex-1 min-w-0">
                      <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full ${chipCls}`}>
                        {daysLabel}
                      </span>
                      <h2 className="mt-2 text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
                        {item.title}
                      </h2>
                    </div>
                    <button
                      type="button"
                      title="Cerrar"
                      className={`shrink-0 flex items-center justify-center min-h-11 min-w-11 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors ${focusRingClass}`}
                      onClick={() => setSelectedPlanItem(null)}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Panel body */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-5">

                    {/* Dates */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                        <CalendarRange className="w-3.5 h-3.5" />
                        Tiempos
                      </div>
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 space-y-1.5 text-sm">
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-500 dark:text-slate-400">Inicio</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200 text-right">
                            {capitalize(fmt(item.activity_date))}
                          </span>
                        </div>
                        {item.end_date && item.end_date !== item.activity_date && (
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-500 dark:text-slate-400">Fin</span>
                            <span className="font-medium text-slate-800 dark:text-slate-200 text-right">
                              {capitalize(fmt(item.end_date))}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between gap-2 pt-1 border-t border-slate-200 dark:border-slate-700">
                          <span className="text-slate-500 dark:text-slate-400">Estado</span>
                          <span
                            className={`font-semibold ${
                              d < 0
                                ? 'text-red-600 dark:text-red-400'
                                : d === 0
                                  ? 'text-orange-600 dark:text-orange-400'
                                  : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {d < 0
                              ? `Vencida hace ${Math.abs(d)} día${Math.abs(d) !== 1 ? 's' : ''}`
                              : d === 0
                                ? 'Inicia hoy'
                                : d === 1
                                  ? 'Inicia mañana'
                                  : `Inicia en ${d} días`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    {item.description && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Descripción</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{item.description}</p>
                      </div>
                    )}

                    {/* Responsible users */}
                    {item.responsible_users.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                          <UserCircle2 className="w-3.5 h-3.5" />
                          Responsables ({item.responsible_users.length})
                        </div>
                        <div className="space-y-1.5">
                          {item.responsible_users.map((u) => (
                            <div
                              key={u.id}
                              className="flex items-center gap-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2"
                            >
                              <span className="shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 flex items-center justify-center text-xs font-bold select-none">
                                {u.full_name
                                  .split(' ')
                                  .map((w) => w[0])
                                  .filter(Boolean)
                                  .slice(0, 2)
                                  .join('')
                                  .toUpperCase()}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{u.full_name}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.role}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* No responsibles warning */}
                    {item.responsible_users.length === 0 && (
                      <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-3 text-center">
                        <p className="text-xs text-slate-400 dark:text-slate-500">Sin responsables asignados</p>
                      </div>
                    )}

                  </div>

                  {/* Panel footer — admin actions */}
                  {!isTeacher && (
                    <div className="p-4 pb-8 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        disabled={completingItemId === item.id}
                        className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50 transition-colors disabled:opacity-40 ${focusRingClass}`}
                        onClick={async () => {
                          await handleMarkComplete(item.id)
                          setSelectedPlanItem(null)
                        }}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Marcar como completada
                      </button>
                    </div>
                  )}
                </div>
              </>
            )
          })()}

        </div>
      </div>
    </div>
  )
}
