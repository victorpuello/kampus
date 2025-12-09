import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { teachersApi } from '../services/teachers'
import { academicApi, type AcademicYear } from '../services/academic'
import type { Teacher } from '../services/teachers'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Toast, type ToastType } from '../components/ui/Toast'
import { Plus, Search, Trash2 } from 'lucide-react'
import { Input } from '../components/ui/Input'

export default function TeacherList() {
  const [data, setData] = useState<Teacher[]>([])
  const [years, setYears] = useState<AcademicYear[]>([])
  const [selectedYear, setSelectedYear] = useState<string>('')
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

  const loadData = async () => {
    setLoading(true)
    try {
      // Load years first if not loaded
      let currentYearId = selectedYear
      if (years.length === 0) {
        const yearsRes = await academicApi.listYears()
        setYears(yearsRes.data)
        if (yearsRes.data.length > 0 && !currentYearId) {
          const activeYear = yearsRes.data.find(y => y.status === 'ACTIVE')
          currentYearId = String(activeYear ? activeYear.id : yearsRes.data[0].id)
          setSelectedYear(currentYearId)
        }
      }

      const teachersRes = await teachersApi.getAll(currentYearId ? Number(currentYearId) : undefined)
      setData(teachersRes.data)
    } catch (err) {
      console.error(err)
      setError('No se pudo cargar la información')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedYear])

  const handleDelete = async (id: number) => {
    try {
      await teachersApi.delete(id)
      showToast('Docente eliminado correctamente', 'success')
      setDeleteConfirm(null)
      loadData()
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

  const getTargetHours = (level: string) => {
    switch (level) {
      case 'PRESCHOOL': return 20;
      case 'PRIMARY': return 25;
      case 'SECONDARY': return 22;
      default: return 22;
    }
  }

  const getLevelLabel = (level: string) => {
    switch (level) {
      case 'PRESCHOOL': return 'Preescolar';
      case 'PRIMARY': return 'Primaria';
      case 'SECONDARY': return 'Secundaria';
      default: return '';
    }
  }

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
        <div className="flex items-center gap-4">
          <div className="w-40">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {years.map(y => (
                <option key={y.id} value={y.id}>Año {y.year} {y.status_display ? `(${y.status_display})` : ''}</option>
              ))}
            </select>
          </div>
          <Link to="/teachers/new">
            <Button className="w-full md:w-auto">
              <Plus className="mr-2 h-4 w-4" /> Nuevo Docente
            </Button>
          </Link>
        </div>
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
                  <th className="px-6 py-3">Carga Académica</th>
                  <th className="px-6 py-3">Escalafón</th>
                  <th className="px-6 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-slate-500">
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
                        <div className="w-full max-w-[180px]">
                          <div className="flex justify-between text-xs mb-1 font-medium">
                            <span className={
                                (t.assigned_hours || 0) > getTargetHours(t.teaching_level) ? 'text-amber-600 font-bold' : 
                                (t.assigned_hours || 0) === getTargetHours(t.teaching_level) ? 'text-emerald-600 font-bold' : 'text-slate-700'
                            }>
                                {t.assigned_hours || 0} / {getTargetHours(t.teaching_level)}h
                            </span>
                            <span className="text-slate-500 text-[10px] uppercase tracking-wider">{getLevelLabel(t.teaching_level)}</span>
                          </div>
                          <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden border border-slate-300">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                (t.assigned_hours || 0) > getTargetHours(t.teaching_level) ? 'bg-amber-500' : 
                                (t.assigned_hours || 0) === getTargetHours(t.teaching_level) ? 'bg-emerald-500' : 'bg-blue-500'
                              }`}
                              style={{ width: `${Math.min(((t.assigned_hours || 0) / getTargetHours(t.teaching_level)) * 100, 100)}%` }}
                            />
                          </div>
                          {(t.assigned_hours || 0) > getTargetHours(t.teaching_level) && (
                            <div className="text-xs font-medium text-amber-600 mt-1 flex items-center">
                                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1"></span>
                                +{(t.assigned_hours || 0) - getTargetHours(t.teaching_level)} horas extras
                            </div>
                          )}
                        </div>
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
