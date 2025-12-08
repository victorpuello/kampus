import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { teachersApi } from '../services/teachers'
import type { Teacher } from '../services/teachers'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Toast, type ToastType } from '../components/ui/Toast'
import { Plus, Search, Trash2 } from 'lucide-react'
import { Input } from '../components/ui/Input'

export default function TeacherList() {
  const [data, setData] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const loadTeachers = () => {
    setLoading(true)
    teachersApi
      .getAll()
      .then((res) => {
        setData(res.data)
      })
      .catch(() => setError('No se pudo cargar la lista de docentes'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadTeachers()
  }, [])

  const handleDelete = async (id: number) => {
    try {
      await teachersApi.delete(id)
      showToast('Docente eliminado correctamente', 'success')
      setDeleteConfirm(null)
      loadTeachers()
    } catch (err) {
      console.error(err)
      showToast('Error al eliminar el docente', 'error')
    }
  }

  const filteredData = data.filter(t => 
    t.user.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.user.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.document_number.includes(searchTerm) ||
    t.title.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) return <div className="p-6">Cargando…</div>
  if (error) return <div className="p-6 text-red-600">{error}</div>

  return (
    <div className="space-y-6">
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />

      {/* Modal de confirmación de eliminación */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">¿Eliminar docente?</h3>
            <p className="text-slate-600 mb-4">
              Esta acción no se puede deshacer. Se eliminará el docente y su cuenta de usuario asociada.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                Cancelar
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => handleDelete(deleteConfirm)}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Docentes</h2>
          <p className="text-slate-500">Gestiona la planta docente de la institución.</p>
        </div>
        <Link to="/teachers/new">
          <Button className="w-full md:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Nuevo Docente
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle>Listado de Docentes</CardTitle>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
              <Input 
                placeholder="Buscar docente..." 
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                <tr>
                  <th className="px-6 py-3">Usuario</th>
                  <th className="px-6 py-3">Nombre Completo</th>
                  <th className="px-6 py-3">Título / Especialidad</th>
                  <th className="px-6 py-3">Escalafón</th>
                  <th className="px-6 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-slate-500">
                      No se encontraron docentes.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((t) => (
                    <tr key={t.id} className="bg-white border-b hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-900">{t.user.username}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center mr-3 text-emerald-700 font-bold text-xs">
                            {t.user.first_name[0]}{t.user.last_name[0]}
                          </div>
                          <div>
                            <div className="font-medium">{t.user.first_name} {t.user.last_name}</div>
                            <div className="text-xs text-slate-500">{t.user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium">{t.title}</div>
                        <div className="text-xs text-slate-500">{t.specialty}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium">{t.salary_scale}</div>
                        <div className="text-xs text-slate-500">
                          {t.regime === '2277' ? 'Estatuto 2277' : t.regime === '1278' ? 'Estatuto 1278' : ''}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <Link to={`/teachers/${t.id}`}>
                            <Button variant="ghost" size="sm">Editar</Button>
                          </Link>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setDeleteConfirm(t.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
