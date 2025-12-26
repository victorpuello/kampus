import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { coreApi, type Campus, SEDE_TYPE_OPTIONS, SEDE_STATUS_OPTIONS } from '../services/core'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Toast, type ToastType } from '../components/ui/Toast'
import { Plus, Edit, Trash2, MapPin, Building, Phone, School, CheckCircle, Trees } from 'lucide-react'
import { useAuthStore } from '../store/auth'

export default function CampusList() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'

  if (isTeacher) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sedes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600">No tienes permisos para acceder al módulo de sedes.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const [campuses, setCampuses] = useState<Campus[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  useEffect(() => {
    loadCampuses()
  }, [])

  const loadCampuses = async () => {
    try {
      const res = await coreApi.listCampuses()
      setCampuses(res.data)
    } catch (err) {
      console.error(err)
      showToast('Error al cargar las sedes', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await coreApi.deleteCampus(id)
      showToast('Sede eliminada correctamente', 'success')
      loadCampuses()
    } catch (err) {
      console.error(err)
      showToast('Error al eliminar la sede', 'error')
    } finally {
      setDeleteId(null)
    }
  }

  const getSedeTypeLabel = (value: string) => {
    return SEDE_TYPE_OPTIONS.find(opt => opt.value === value)?.label || value
  }

  const getStatusLabel = (value: string) => {
    return SEDE_STATUS_OPTIONS.find(opt => opt.value === value)?.label || value
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVA':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200'
      case 'CERRADA':
        return 'bg-red-100 text-red-700 border-red-200'
      case 'EN_REAPERTURA':
        return 'bg-amber-100 text-amber-700 border-amber-200'
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200'
    }
  }

  // Stats
  const totalCampuses = campuses.length
  const activeCampuses = campuses.filter(c => c.status === 'ACTIVA').length
  const ruralCampuses = campuses.filter(c => c.sede_type === 'RURAL').length

  if (loading) return <div className="p-6">Cargando...</div>

  return (
    <div className="space-y-6">
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />

      {/* Modal de confirmación */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Confirmar eliminación</h3>
            <p className="text-slate-600 mb-4">
              ¿Estás seguro de que deseas eliminar esta sede? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteId(null)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={() => handleDelete(deleteId)}>
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <School className="h-6 w-6 text-blue-600" />
            </div>
            Sedes Educativas
          </h2>
          <p className="text-slate-500 mt-1">Administra las sedes de la institución educativa.</p>
        </div>
        <Link to="/campuses/new">
          <Button className="w-full md:w-auto bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" />
            Nueva Sede
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500">Total Sedes</p>
              <Building className="h-4 w-4 text-slate-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{totalCampuses}</div>
            <p className="text-xs text-slate-500 mt-1">
              Infraestructura física
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500">Sedes Activas</p>
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{activeCampuses}</div>
            <p className="text-xs text-slate-500 mt-1">
              En funcionamiento
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500">Sedes Rurales</p>
              <Trees className="h-4 w-4 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{ruralCampuses}</div>
            <p className="text-xs text-slate-500 mt-1">
              Ubicación rural
            </p>
          </CardContent>
        </Card>
      </div>

      {campuses.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="p-12 text-center">
            <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">No hay sedes registradas</h3>
            <p className="text-slate-500 mb-6 max-w-sm mx-auto">Comienza agregando la primera sede de tu institución para gestionar la infraestructura.</p>
            <Link to="/campuses/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Agregar Primera Sede
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {campuses.map((campus) => (
            <Card key={campus.id} className="hover:shadow-md transition-all duration-200 border-slate-200 group">
              <CardHeader className="pb-3 border-b border-slate-50 bg-slate-50/50">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-blue-600 shadow-sm">
                      <Building className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold text-slate-900">{campus.name}</CardTitle>
                      <p className="text-xs text-slate-500 font-medium">Sede {campus.sede_number}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(campus.status)}`}>
                    {getStatusLabel(campus.status)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-3 text-slate-600">
                    <MapPin className="h-4 w-4 mt-0.5 text-slate-400 shrink-0" />
                    <span className="line-clamp-2">{campus.address}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                      <Building className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-xs font-medium">{getSedeTypeLabel(campus.sede_type)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-xs font-medium truncate">{campus.phone || 'Sin teléfono'}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 mt-2">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>DANE:</span>
                      <span className="font-mono font-medium text-slate-700">{campus.dane_code}</span>
                    </div>
                    {campus.director_name && (
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Director:</span>
                        <span className="font-medium text-slate-700 truncate max-w-[150px]">{campus.director_name}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2 mt-5 pt-0">
                  <Link to={`/campuses/${campus.id}/edit`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200">
                      <Edit className="mr-2 h-3.5 w-3.5" />
                      Editar
                    </Button>
                  </Link>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setDeleteId(campus.id)}
                    className="text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
