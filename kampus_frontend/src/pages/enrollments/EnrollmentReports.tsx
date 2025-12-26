import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { enrollmentsApi } from '../../services/enrollments'
import { academicApi, type AcademicYear, type Grade, type Group } from '../../services/academic'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Label } from '../../components/ui/Label'
import { Toast, type ToastType } from '../../components/ui/Toast'
import { Upload, FileSpreadsheet, FileText } from 'lucide-react'
import { useAuthStore } from '../../store/auth'

export default function EnrollmentReports() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  // Bulk Upload State
  const [file, setFile] = useState<File | null>(null)
  const [uploadResult, setUploadResult] = useState<{ success: number; errors: string[] } | null>(null)

  // Report Filters State
  const [filters, setFilters] = useState({
    year: '',
    grade: '',
    group: ''
  })
  
  const [years, setYears] = useState<AcademicYear[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [groups, setGroups] = useState<Group[]>([])

  if (isTeacher) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Gestión Masiva y Reportes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600">No tienes permisos para acceder a reportes de matrículas.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  useEffect(() => {
    Promise.all([
      academicApi.listYears(),
      academicApi.listGrades(),
      academicApi.listGroups()
    ]).then(([yearsRes, gradesRes, groupsRes]) => {
      setYears(yearsRes.data)
      setGrades(gradesRes.data)
      setGroups(groupsRes.data)
      
      const activeYear = yearsRes.data.find(y => y.status === 'ACTIVE')
      if (activeYear) {
        setFilters(prev => ({ ...prev, year: String(activeYear.id) }))
      }
    }).catch(console.error)
  }, [])

  const handleBulkUpload = async () => {
    if (!file) {
      showToast('Seleccione un archivo CSV', 'error')
      return
    }
    setLoading(true)
    setUploadResult(null)
    try {
      const response = await enrollmentsApi.bulkUpload(file)
      setUploadResult(response.data)
      showToast(`Proceso completado: ${response.data.success} matriculados`, 'success')
    } catch (error: any) {
      console.error(error)
      showToast('Error al procesar el archivo', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadReport = async (format: 'csv' | 'pdf' = 'csv') => {
    setLoading(true)
    try {
      const response = await enrollmentsApi.downloadReport({ ...filters, format })
      // Create blob link to download
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', format === 'csv' ? 'matriculados.csv' : 'reporte_matriculados.pdf')
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      console.error(error)
      showToast('Error al descargar reporte', 'error')
    } finally {
      setLoading(false)
    }
  }

  const getFilteredGroups = () => {
    if (!filters.grade || !filters.year) return []
    return groups.filter(g => 
        g.grade === Number(filters.grade) && 
        g.academic_year === Number(filters.year)
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-3xl font-bold tracking-tight text-slate-900">
        Gestión Masiva y Reportes
      </h2>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bulk Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Carga Masiva de Matrículas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-blue-50 text-blue-800 rounded-md text-sm">
              <p className="font-medium mb-1">Instrucciones:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>El archivo debe ser formato <strong>.csv</strong></li>
                <li>Columnas requeridas: <code>document_number</code>, <code>first_name</code>, <code>last_name</code>, <code>grade_name</code></li>
                <li>Columnas opcionales: <code>group_name</code>, <code>email</code></li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <Label>Seleccionar Archivo</Label>
              <Input 
                type="file" 
                accept=".csv"
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
            </div>

            <Button onClick={handleBulkUpload} disabled={loading || !file} className="w-full">
              {loading ? 'Procesando...' : 'Cargar Matrículas'}
            </Button>

            {uploadResult && (
              <div className="mt-4 p-4 border rounded-md bg-slate-50">
                <p className="font-medium text-green-600">Exitosos: {uploadResult.success}</p>
                {uploadResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="font-medium text-red-600">Errores:</p>
                    <ul className="text-sm text-red-500 list-disc list-inside max-h-40 overflow-y-auto">
                      {uploadResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reports Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Reporte de Matriculados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Año Académico</Label>
              <select 
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                value={filters.year}
                onChange={e => setFilters({...filters, year: e.target.value})}
              >
                <option value="">Todos</option>
                {years.map(y => (
                  <option key={y.id} value={y.id}>{y.year} ({y.status})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Grado</Label>
              <select 
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                value={filters.grade}
                onChange={e => setFilters({...filters, grade: e.target.value, group: ''})}
              >
                <option value="">Todos</option>
                {grades.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Grupo</Label>
              <select 
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                value={filters.group}
                onChange={e => setFilters({...filters, group: e.target.value})}
                disabled={!filters.grade || !filters.year}
              >
                <option value="">Todos</option>
                {getFilteredGroups().map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => handleDownloadReport('csv')} disabled={loading} variant="outline" className="flex-1">
                <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />
                CSV
              </Button>
              <Button onClick={() => handleDownloadReport('pdf')} disabled={loading} variant="outline" className="flex-1">
                <FileText className="w-4 h-4 mr-2 text-red-600" />
                PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
