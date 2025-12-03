import { useAuthStore } from '../store/auth'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Users, GraduationCap, BookOpen, Calendar } from 'lucide-react'

export default function DashboardHome() {
  const user = useAuthStore((s) => s.user)

  const stats = [
    {
      title: "Estudiantes Activos",
      value: "1,234",
      description: "+12% desde el mes pasado",
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-100"
    },
    {
      title: "Cursos Abiertos",
      value: "42",
      description: "3 nuevos esta semana",
      icon: BookOpen,
      color: "text-emerald-600",
      bg: "bg-emerald-100"
    },
    {
      title: "Promedio General",
      value: "8.7",
      description: "+0.2 puntos vs semestre anterior",
      icon: GraduationCap,
      color: "text-purple-600",
      bg: "bg-purple-100"
    },
    {
      title: "Eventos Próximos",
      value: "5",
      description: "Para los próximos 7 días",
      icon: Calendar,
      color: "text-amber-600",
      bg: "bg-amber-100"
    }
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-slate-500">
          Bienvenido de nuevo, {user?.first_name || user?.username}. Aquí tienes un resumen de hoy.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Card key={index}>
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
          <CardHeader>
            <CardTitle>Actividad Reciente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center">
                  <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center">
                    <span className="text-xs font-medium text-slate-500">JD</span>
                  </div>
                  <div className="ml-4 space-y-1">
                    <p className="text-sm font-medium leading-none">Juan Doe se inscribió en Matemáticas</p>
                    <p className="text-sm text-slate-500">hace {i} horas</p>
                  </div>
                  <div className="ml-auto font-medium text-sm text-slate-500">
                    Ver detalles
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Accesos Rápidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {['Registrar Estudiante', 'Crear Curso', 'Generar Reporte', 'Configuración Académica'].map((action, i) => (
                <button key={i} className="w-full flex items-center justify-between p-3 text-sm font-medium text-slate-700 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                  {action}
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
