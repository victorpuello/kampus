import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { teachersApi } from '../services/teachers'
import type { Teacher } from '../services/teachers'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Plus, Search } from 'lucide-react'
import { Input } from '../components/ui/Input'

export default function TeacherList() {
  const [data, setData] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    let mounted = true
    teachersApi
      .getAll()
      .then((res) => {
        if (mounted) setData(res.data)
      })
      .catch(() => setError('No se pudo cargar la lista de docentes'))
      .finally(() => setLoading(false))
    return () => {
      mounted = false
    }
  }, [])

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
                    <tr key={t.user.id} className="bg-white border-b hover:bg-slate-50">
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
                      <td className="px-6 py-4">{t.salary_scale}</td>
                      <td className="px-6 py-4">
                        <Link to={`/teachers/${t.user.id}`}>
                          <Button variant="ghost" size="sm">Editar</Button>
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
