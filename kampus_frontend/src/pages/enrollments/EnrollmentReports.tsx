import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { enrollmentsApi } from '../../services/enrollments'
import { academicApi, type AcademicYear, type Grade, type Group } from '../../services/academic'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Label } from '../../components/ui/Label'
import { Toast, type ToastType } from '../../components/ui/Toast'
import { FileSpreadsheet, FileText } from 'lucide-react'
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

  // Report Filters State
  const [filters, setFilters] = useState({
    year: '',
    grade: '',
    group: ''
  })
  
  const [years, setYears] = useState<AcademicYear[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [groups, setGroups] = useState<Group[]>([])

  useEffect(() => {
    if (isTeacher) return
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
  }, [isTeacher])

  if (isTeacher) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reportes de Matrículas</CardTitle>
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

  const handleDownloadReport = async (format: 'csv' | 'pdf' | 'xlsx' = 'csv') => {
    setLoading(true)
    try {
      const response = await enrollmentsApi.downloadReport({ ...filters, export: format })

      const blob = response.data instanceof Blob ? response.data : new Blob([response.data])
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url

      const filename =
        format === 'csv' ? 'matriculados.csv' :
        format === 'xlsx' ? 'matriculados.xlsx' :
        'reporte_matriculados.pdf'

      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
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
        Reportes de Matrículas
      </h2>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />

      <div className="grid grid-cols-1 gap-6">
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
              <Button onClick={() => handleDownloadReport('xlsx')} disabled={loading} variant="outline" className="flex-1">
                <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />
                XLSX
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
