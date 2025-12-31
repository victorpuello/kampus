import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Users, GraduationCap, BookOpen, Bell } from 'lucide-react'
import { studentsApi } from '../services/students'
import { teachersApi } from '../services/teachers'
import { academicApi } from '../services/academic'
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

  useEffect(() => {
    let mounted = true

    const loadMetrics = async () => {
      setMetricsLoading(true)
      setMetricsError(null)
      try {
        const [studentsRes, teachersRes, yearsRes, unreadRes] = await Promise.all([
          studentsApi.list({ page: 1 }),
          teachersApi.getAll(),
          academicApi.listYears(),
          notificationsApi.unreadCount(),
        ])

        const activeYear = yearsRes.data.find((y) => y.status === 'ACTIVE')
        const groupsRes = await academicApi.listGroups(activeYear ? { academic_year: activeYear.id } : undefined)

        if (!mounted) return
        setStudentsCount(studentsRes.data.count ?? 0)
        setTeachersCount((teachersRes.data || []).length)
        setGroupsCount((groupsRes.data || []).length)
        setUnreadNotificationsCount(unreadRes.data.unread || 0)
      } catch {
        if (!mounted) return
        setMetricsError('No se pudieron cargar los indicadores.')
      } finally {
        if (!mounted) return
        setMetricsLoading(false)
      }
    }

    const loadRecent = async () => {
      setRecentLoading(true)
      try {
        const res = await notificationsApi.list()
        const unread = (res.data || []).filter((n) => !n.is_read)
        unread.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        if (!mounted) return
        setRecentNotifications(unread.slice(0, 5))
      } catch {
        if (!mounted) return
        setRecentNotifications([])
      } finally {
        if (!mounted) return
        setRecentLoading(false)
      }
    }

    loadMetrics()
    loadRecent()

    return () => {
      mounted = false
    }
  }, [user?.id])

  const quickActions = useMemo(() => {
    if (isTeacher) {
      return [
        { label: 'Calificaciones', description: 'Registrar y revisar notas', to: '/grades' },
        { label: 'Planeación', description: 'Gestionar planeación', to: '/planning' },
        { label: 'Mi asignación', description: 'Ver grupos y cargas', to: '/my-assignment' },
        { label: 'Notificaciones', description: 'Ver pendientes', to: '/notifications' },
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
  }, [isAdmin, isTeacher])

  const stats = [
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-slate-500">
          Bienvenido de nuevo, {user?.first_name || user?.username}. Aquí tienes un resumen de hoy.
        </p>
      </div>

      {metricsError && (
        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
          {metricsError}
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
              <div className="text-sm text-slate-500">Sin actividad reciente.</div>
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
        <Card className="col-span-3">
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
                  <span className="text-slate-400">→</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
