import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { studentsApi } from '../services/students'
import type { Student } from '../services/students'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Plus, Search } from 'lucide-react'
import { Input } from '../components/ui/Input'

export default function StudentList() {
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

  const filteredData = data.filter(s => 
    s.user_first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.user_last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.user_username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.document_number.includes(searchTerm)
  )

  if (loading) return <div className="p-6">Cargando…</div>
  if (error) return <div className="p-6 text-red-600">{error}</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Estudiantes</h2>
          <p className="text-slate-500">Gestiona la información de los estudiantes matriculados.</p>
        </div>
        <Button className="w-full md:w-auto">
          <Plus className="mr-2 h-4 w-4" /> Nuevo Estudiante
        </Button>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                <tr>
                  <th className="px-6 py-3">Usuario</th>
                  <th className="px-6 py-3">Nombre Completo</th>
                  <th className="px-6 py-3">Documento</th>
                  <th className="px-6 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-slate-500">
                      No se encontraron estudiantes.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((s) => (
                    <tr key={s.user} className="bg-white border-b hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-900">{s.user_username}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center mr-3 text-blue-700 font-bold text-xs">
                            {s.user_first_name[0]}{s.user_last_name[0]}
                          </div>
                          {s.user_first_name} {s.user_last_name}
                        </div>
                      </td>
                      <td className="px-6 py-4">{s.document_number}</td>
                      <td className="px-6 py-4">
                        <Link to={`/students/${s.user}`}>
                          <Button variant="ghost" size="sm">Ver Perfil</Button>
                        </Link>
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

