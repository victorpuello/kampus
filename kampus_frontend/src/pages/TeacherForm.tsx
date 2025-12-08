import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { teachersApi } from '../services/teachers'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { Toast, type ToastType } from '../components/ui/Toast'
import { ArrowLeft, Save } from 'lucide-react'

const REGIME_OPTIONS = [
  { value: '2277', label: 'Estatuto 2277 de 1979 (Antiguo)' },
  { value: '1278', label: 'Estatuto 1278 de 2002 (Nuevo)' },
]

const SCALE_OPTIONS_2277 = Array.from({ length: 14 }, (_, i) => ({
  value: String(i + 1),
  label: `Grado ${i + 1}`
}))

const SCALE_OPTIONS_1278 = [
  { value: '1A', label: '1A' }, { value: '1B', label: '1B' }, { value: '1C', label: '1C' }, { value: '1D', label: '1D' },
  { value: '2A', label: '2A' }, { value: '2B', label: '2B' }, { value: '2C', label: '2C' }, { value: '2D', label: '2D' },
  { value: '3A', label: '3A' }, { value: '3B', label: '3B' }, { value: '3C', label: '3C' }, { value: '3D', label: '3D' },
]

export default function TeacherForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditing = !!id

  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  })
  
  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const getErrorMessage = (error: any, defaultMessage: string): string => {
    if (error.response?.data) {
      const data = error.response.data
      // Manejar errores de validación de Django
      if (typeof data === 'object') {
        // Buscar errores de unicidad comunes
        const errorStr = JSON.stringify(data)
        if (errorStr.includes('email') && (errorStr.includes('unique') || errorStr.includes('already exists') || errorStr.includes('ya existe'))) {
          return 'El correo electrónico ya está registrado en el sistema'
        }
        if (errorStr.includes('document_number') && (errorStr.includes('unique') || errorStr.includes('already exists') || errorStr.includes('ya existe'))) {
          return 'El número de documento ya está registrado en el sistema'
        }
        // Otros errores de campo
        const messages: string[] = []
        for (const [field, value] of Object.entries(data)) {
          if (Array.isArray(value)) {
            messages.push(`${field}: ${value.join(', ')}`)
          } else if (typeof value === 'string') {
            messages.push(value)
          }
        }
        if (messages.length > 0) {
          return messages.join('. ')
        }
      }
      if (data.detail) return data.detail
    }
    return defaultMessage
  }
  
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    document_type: 'CC',
    document_number: '',
    phone: '',
    address: '',
    title: '',
    specialty: '',
    regime: '',
    salary_scale: '',
    hiring_date: '',
  })

  useEffect(() => {
    if (isEditing && id) {
      setLoading(true)
      teachersApi.getById(Number(id))
        .then(res => {
          const teacher = res.data
          setFormData({
            first_name: teacher.user.first_name,
            last_name: teacher.user.last_name,
            email: teacher.user.email,
            document_type: teacher.document_type || 'CC',
            document_number: teacher.document_number || '',
            phone: teacher.phone || '',
            address: teacher.address || '',
            title: teacher.title || '',
            specialty: teacher.specialty || '',
            regime: teacher.regime || '',
            salary_scale: teacher.salary_scale || '',
            hiring_date: teacher.hiring_date || '',
          })
        })
        .catch((err) => {
          console.error(err)
          showToast('Error al cargar el docente', 'error')
        })
        .finally(() => setLoading(false))
    }
  }, [id, isEditing])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => {
      const newData = { ...prev, [name]: value }
      // Clear salary scale if regime changes
      if (name === 'regime') {
        newData.salary_scale = ''
      }
      return newData
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Prepare data: convert empty strings to null for optional fields
      const payload = {
        ...formData,
        hiring_date: formData.hiring_date || null,
      }

      if (isEditing) {
        await teachersApi.update(Number(id), payload)
        showToast('Docente actualizado correctamente', 'success')
      } else {
        await teachersApi.create(payload)
        showToast('Docente creado correctamente', 'success')
      }
      setTimeout(() => navigate('/teachers'), 1500)
    } catch (err: any) {
      console.error(err)
      showToast(getErrorMessage(err, 'Error al guardar el docente'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const getScaleOptions = () => {
    if (formData.regime === '2277') return SCALE_OPTIONS_2277
    if (formData.regime === '1278') return SCALE_OPTIONS_1278
    return []
  }

  if (loading && isEditing) return <div className="p-6">Cargando...</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/teachers')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          {isEditing ? 'Editar Docente' : 'Nuevo Docente'}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
        />

        <Card>
          <CardHeader>
            <CardTitle>Información Personal</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">Nombres</Label>
              <Input
                id="first_name"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Apellidos</Label>
              <Input
                id="last_name"
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                required
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Información Profesional</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="document_type">Tipo Documento</Label>
              <select
                id="document_type"
                name="document_type"
                value={formData.document_type}
                onChange={handleChange}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="CC">Cédula de Ciudadanía</option>
                <option value="CE">Cédula de Extranjería</option>
                <option value="TI">Tarjeta de Identidad</option>
                <option value="PP">Pasaporte</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="document_number">Número Documento</Label>
              <Input
                id="document_number"
                name="document_number"
                value={formData.document_number}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Dirección</Label>
              <Input
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Título Profesional</Label>
              <Input
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="specialty">Especialidad</Label>
              <Input
                id="specialty"
                name="specialty"
                value={formData.specialty}
                onChange={handleChange}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="regime">Régimen</Label>
              <select
                id="regime"
                name="regime"
                value={formData.regime}
                onChange={handleChange}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Seleccione un régimen</option>
                {REGIME_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="salary_scale">Escalafón</Label>
              <select
                id="salary_scale"
                name="salary_scale"
                value={formData.salary_scale}
                onChange={handleChange}
                disabled={!formData.regime}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">Seleccione un grado</option>
                {getScaleOptions().map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hiring_date">Fecha Contratación</Label>
              <Input
                id="hiring_date"
                name="hiring_date"
                type="date"
                value={formData.hiring_date}
                onChange={handleChange}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={loading}>
            <Save className="mr-2 h-4 w-4" />
            {loading ? 'Guardando...' : 'Guardar Docente'}
          </Button>
        </div>
      </form>
    </div>
  )
}
