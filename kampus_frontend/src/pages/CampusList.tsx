import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { coreApi, type Campus, SEDE_TYPE_OPTIONS, SEDE_STATUS_OPTIONS } from '../services/core'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Toast, type ToastType } from '../components/ui/Toast'
import { Plus, Edit, Trash2, MapPin, Building, Phone } from 'lucide-react'

export default function CampusList() {
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
        return 'bg-green-100 text-green-800'
      case 'CERRADA':
        return 'bg-red-100 text-red-800'
      case 'EN_REAPERTURA':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Confirmar eliminación</h3>
            <p className="text-slate-600 mb-4">
              ¿Estás seguro de que deseas eliminar esta sede? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
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

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Sedes</h2>
          <p className="text-slate-500">Administra las sedes de la institución educativa.</p>
        </div>
        <Link to="/campuses/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nueva Sede
          </Button>
        </Link>
      </div>

      {campuses.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Building className="h-12 w-12 mx-auto text-slate-400 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No hay sedes registradas</h3>
            <p className="text-slate-500 mb-4">Comienza agregando la primera sede de tu institución.</p>
            <Link to="/campuses/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Agregar Sede
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campuses.map((campus) => (
            <Card key={campus.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{campus.name}</CardTitle>
                    <p className="text-sm text-slate-500">Sede {campus.sede_number}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(campus.status)}`}>
                    {getStatusLabel(campus.status)}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Building className="h-4 w-4" />
                    <span>{getSedeTypeLabel(campus.sede_type)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <MapPin className="h-4 w-4" />
                    <span className="truncate">{campus.address}</span>
                  </div>
                  {campus.phone && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <Phone className="h-4 w-4" />
                      <span>{campus.phone}</span>
                    </div>
                  )}
                  <div className="text-slate-500">
                    <span className="font-medium">DANE:</span> {campus.dane_code}
                  </div>
                  {campus.director_name && (
                    <div className="text-slate-500">
                      <span className="font-medium">Director:</span> {campus.director_name}
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2 mt-4 pt-4 border-t">
                  <Link to={`/campuses/${campus.id}/edit`} className="flex-1">
                    <Button variant="outline" className="w-full">
                      <Edit className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                  </Link>
                  <Button 
                    variant="outline" 
                    onClick={() => setDeleteId(campus.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
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
