import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { studentsApi, noveltiesApi } from '../services/students'
import type { Student, StudentNovelty } from '../services/students'

export default function StudentProfile() {
  const { id } = useParams()
  const [data, setData] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const studentId = Number(id)

  // Novelty Form State
  const [isAddingNovelty, setIsAddingNovelty] = useState(false)
  const [noveltyForm, setNoveltyForm] = useState({
    novelty_type: 'RETIRO',
    observation: '',
    date: new Date().toISOString().split('T')[0]
  })

  const loadStudent = () => {
    if (!studentId) return
    setLoading(true)
    studentsApi
      .get(studentId)
      .then((res) => setData(res.data))
      .catch(() => setError('No se pudo cargar el perfil'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadStudent()
  }, [studentId])

  const handleAddNovelty = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentId) return
    
    if (!confirm('¿Está seguro de registrar esta novedad? Esto podría afectar el estado del estudiante.')) return

    try {
      await noveltiesApi.create({
        student: studentId,
        ...noveltyForm
      })
      setIsAddingNovelty(false)
      setNoveltyForm(prev => ({ ...prev, observation: '' }))
      loadStudent() // Refresh to see new novelty and potential status change
    } catch (err) {
      console.error(err)
      alert('Error al registrar la novedad')
    }
  }

  if (loading && !data) return <div className="p-6">Cargando…</div>
  if (error || !data)
    return (
      <div className="p-6">
        <div className="text-red-600 mb-4">{error || 'No encontrado'}</div>
        <Link className="underline" to="/students">Volver</Link>
      </div>
    )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Perfil de Estudiante</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${data.user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {data.user.is_active ? 'ACTIVO' : 'INACTIVO'}
            </span>
            <span className="text-sm text-slate-500">ID: {data.id}</span>
          </div>
        </div>
        <Link className="text-sm text-blue-600 hover:underline" to="/students">Volver a la lista</Link>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Personal Info */}
        <section className="border rounded-lg p-5 bg-white shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-semibold text-lg">Información Personal</h3>
            <Link to={`/students/${studentId}`} className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded text-slate-700">Editar</Link>
          </div>
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <span className="text-slate-500">Usuario:</span>
              <span className="col-span-2 font-medium">{data.user.username}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-slate-500">Nombre:</span>
              <span className="col-span-2 font-medium">{data.user.first_name} {data.user.last_name}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-slate-500">Documento:</span>
              <span className="col-span-2">{data.document_type} {data.document_number}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-slate-500">Dirección:</span>
              <span className="col-span-2">{data.address}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-slate-500">EPS:</span>
              <span className="col-span-2">{data.eps}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-slate-500">RH:</span>
              <span className="col-span-2">{data.blood_type}</span>
            </div>
          </div>
        </section>

        {/* Novelties System */}
        <section className="border rounded-lg p-5 bg-white shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg">Historial de Novedades</h3>
            <button 
              onClick={() => setIsAddingNovelty(!isAddingNovelty)}
              className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded font-medium"
            >
              {isAddingNovelty ? 'Cancelar' : '+ Registrar Novedad'}
            </button>
          </div>

          {isAddingNovelty && (
            <form onSubmit={handleAddNovelty} className="mb-6 p-4 bg-slate-50 rounded-md border border-slate-200">
              <h4 className="text-sm font-medium mb-3 text-slate-700">Nueva Novedad</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Tipo</label>
                  <select 
                    className="w-full text-sm border-slate-300 rounded-md"
                    value={noveltyForm.novelty_type}
                    onChange={e => setNoveltyForm({...noveltyForm, novelty_type: e.target.value})}
                  >
                    <option value="RETIRO">RETIRO (Inactiva usuario)</option>
                    <option value="REINGRESO">REINGRESO (Activa usuario)</option>
                    <option value="INGRESO">INGRESO</option>
                    <option value="OTRO">OTRO</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Fecha</label>
                  <input 
                    type="date" 
                    className="w-full text-sm border-slate-300 rounded-md"
                    value={noveltyForm.date}
                    onChange={e => setNoveltyForm({...noveltyForm, date: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Observación</label>
                  <textarea 
                    className="w-full text-sm border-slate-300 rounded-md"
                    rows={2}
                    value={noveltyForm.observation}
                    onChange={e => setNoveltyForm({...noveltyForm, observation: e.target.value})}
                    placeholder="Motivo o detalles..."
                    required
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <button type="submit" className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded hover:bg-blue-700">
                    Guardar
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {data.novelties && data.novelties.length > 0 ? (
              data.novelties.map((novelty) => (
                <div key={novelty.id} className="p-3 border rounded bg-slate-50 text-sm">
                  <div className="flex justify-between items-start mb-1">
                    <span className={`font-semibold px-2 py-0.5 rounded text-xs ${
                      novelty.novelty_type === 'RETIRO' ? 'bg-red-100 text-red-700' :
                      novelty.novelty_type === 'REINGRESO' ? 'bg-green-100 text-green-700' :
                      'bg-gray-200 text-gray-700'
                    }`}>
                      {novelty.novelty_type}
                    </span>
                    <span className="text-slate-500 text-xs">{novelty.date}</span>
                  </div>
                  <p className="text-slate-700 mt-1">{novelty.observation}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 italic text-center py-4">No hay novedades registradas.</p>
            )}
          </div>
        </section>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="border rounded-lg p-5 bg-white shadow-sm">
          <h3 className="font-semibold text-lg mb-4">Núcleo Familiar</h3>
          {data.family_members && data.family_members.length > 0 ? (
             <ul className="space-y-2">
               {data.family_members.map(fm => (
                 <li key={fm.id} className="text-sm border-b pb-2 last:border-0">
                   <span className="font-medium">{fm.full_name}</span> <span className="text-slate-500">({fm.relationship})</span>
                   {fm.is_main_guardian && <span className="ml-2 text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded">Acudiente</span>}
                   <div className="text-xs text-slate-500 mt-0.5">{fm.phone}</div>
                 </li>
               ))}
             </ul>
          ) : (
            <p className="text-sm text-slate-500 italic">No hay familiares registrados.</p>
          )}
        </section>
      </div>
    </div>
  )
}
