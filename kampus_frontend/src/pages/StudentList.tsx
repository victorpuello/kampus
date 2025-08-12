import { useEffect, useState } from 'react'
import { studentsApi, Student } from '../services/students'
import { Link } from 'react-router-dom'

export default function StudentList() {
  const [data, setData] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  if (loading) return <div className="p-6">Cargando…</div>
  if (error) return <div className="p-6 text-red-600">{error}</div>

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Estudiantes</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Usuario</th>
              <th className="py-2 pr-4">Nombre</th>
              <th className="py-2 pr-4">Documento</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.user} className="border-b last:border-0">
                <td className="py-2 pr-4">{s.user_username}</td>
                <td className="py-2 pr-4">
                  <Link className="underline" to={`/students/${s.user}`}>
                    {`${s.user_first_name} ${s.user_last_name}`}
                  </Link>
                </td>
                <td className="py-2 pr-4">{s.document_number}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

