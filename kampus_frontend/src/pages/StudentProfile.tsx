import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { studentsApi } from '../services/students'
import type { Student } from '../services/students'

export default function StudentProfile() {
  const { id } = useParams()
  const [data, setData] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const studentId = Number(id)

  useEffect(() => {
    if (!studentId) return
    studentsApi
      .get(studentId)
      .then((res) => setData(res.data))
      .catch(() => setError('No se pudo cargar el perfil'))
      .finally(() => setLoading(false))
  }, [studentId])

  if (loading) return <div className="p-6">Cargando…</div>
  if (error || !data)
    return (
      <div className="p-6">
        <div className="text-red-600 mb-4">{error || 'No encontrado'}</div>
        <Link className="underline" to="/students">Volver</Link>
      </div>
    )

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Perfil de Estudiante</h2>
        <Link className="text-sm underline" to="/students">Volver a la lista</Link>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="border rounded p-4">
          <h3 className="font-medium mb-2">Información Personal</h3>
          <div className="space-y-1 text-sm">
            <div><span className="text-gray-500">Usuario:</span> {data.user_username}</div>
            <div><span className="text-gray-500">Nombre:</span> {data.user_first_name} {data.user_last_name}</div>
            <div><span className="text-gray-500">Documento:</span> {data.document_type} {data.document_number}</div>
            <div><span className="text-gray-500">Dirección:</span> {data.address}</div>
            <div><span className="text-gray-500">EPS:</span> {data.eps}</div>
            <div><span className="text-gray-500">RH:</span> {data.blood_type}</div>
            <div><span className="text-gray-500">Etnia:</span> {data.ethnicity}</div>
          </div>
        </section>

        <section className="border rounded p-4">
          <h3 className="font-medium mb-2">Núcleo Familiar</h3>
          <p className="text-sm text-gray-500">(Próximamente: listado y edición de acudientes)</p>
        </section>
      </div>
    </div>
  )
}

