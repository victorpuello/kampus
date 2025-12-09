import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { studentsApi } from '../services/students'
import type { Student } from '../services/students'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Plus, Search, FileText, Users, User, UserCheck, GraduationCap } from 'lucide-react'
import { Input } from '../components/ui/Input'

export default function StudentList() {
  const navigate = useNavigate()
  const [data, setData] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    let mounted = true
    studentsApi
      .list()
      .then((res) => {
        if (mounted) setData(res.data)
      })
      .catch(() => setError('No se pudo cargar la lista'))
      .finally(() => setLoading(false))
    return () => {
      mounted = false
    }
  }, [])

  const filteredData = data.filter(s => {
    const firstName = s.user?.first_name || ''
    const lastName = s.user?.last_name || ''
    const username = s.user?.username || ''
    const docNumber = s.document_number || ''
    
    return (
      firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      docNumber.includes(searchTerm)
    )
  })

  if (loading) return <div className="p-6">Cargando…</div>
  if (error) return <div className="p-6 text-red-600">{error}</div>

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Estudiantes</h2>
          </div>
          <p className="text-slate-500">Gestiona la información de los estudiantes matriculados.</p>
        </div>
        <Link to="/students/new">
          <Button className="w-full md:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Nuevo Estudiante
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Total Estudiantes</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{filteredData.length}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Hombres</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {filteredData.filter(s => s.sex === 'M').length}
                </p>
              </div>
              <div className="p-3 bg-indigo-100 rounded-lg">
                <User className="h-6 w-6 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Mujeres</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {filteredData.filter(s => s.sex === 'F').length}
                </p>
              </div>
              <div className="p-3 bg-pink-100 rounded-lg">
                <UserCheck className="h-6 w-6 text-pink-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle>Listado de Alumnos</CardTitle>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
              <Input 
                placeholder="Buscar estudiante..." 
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Estudiante
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Documento
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Contacto
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="p-4 bg-slate-100 rounded-full">
                          <GraduationCap className="h-8 w-8 text-slate-400" />
                        </div>
                        <p className="text-slate-500 text-sm">No se encontraron estudiantes</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredData.map((s, index) => (
                    <tr 
                      key={s.user?.id || s.document_number || index} 
                      className="hover:bg-blue-50/50 transition-colors duration-150 cursor-pointer"
                      onClick={() => navigate(`/students/${s.user?.id}`)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                            <span className="text-white font-semibold text-sm">
                              {(s.user?.first_name?.[0] || '')}{(s.user?.last_name?.[0] || '')}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="font-semibold text-slate-900 uppercase">
                              {s.user?.first_name} {s.user?.last_name}
                            </div>
                            <div className="text-xs text-slate-500">@{s.user?.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-900 font-mono">{s.document_number || '-'}</div>
                        <div className="text-xs text-slate-500">{s.document_type}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-900">{s.phone || '-'}</div>
                        <div className="text-xs text-slate-500">{s.user?.email || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/students/${s.user?.id}`)
                          }}
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          Ver Ficha →
                        </Button>
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
