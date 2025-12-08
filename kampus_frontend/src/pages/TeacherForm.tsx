import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { teachersApi } from '../services/teachers'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { ArrowLeft, Save } from 'lucide-react'

export default function TeacherForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditing = !!id

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    user: {
      username: '',
      email: '',
      first_name: '',
      last_name: '',
      password: '',
    },
    document_type: 'CC',
    document_number: '',
    phone: '',
    address: '',
    title: '',
    specialty: '',
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
            user: {
              username: teacher.user.username,
              email: teacher.user.email,
              first_name: teacher.user.first_name,
              last_name: teacher.user.last_name,
              password: '', // Password not returned
            },
            document_type: teacher.document_type || 'CC',
            document_number: teacher.document_number || '',
            phone: teacher.phone || '',
            address: teacher.address || '',
            title: teacher.title || '',
            specialty: teacher.specialty || '',
            salary_scale: teacher.salary_scale || '',
            hiring_date: teacher.hiring_date || '',
          })
        })
        .catch((err) => {
          console.error(err)
          setError('Error al cargar el docente')
        })
        .finally(() => setLoading(false))
    }
  }, [id, isEditing])

  const handleUserChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      user: { ...prev.user, [name]: value }
    }))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Prepare data: convert empty strings to null for optional fields
      const payload = {
        ...formData,
        user: {
          ...formData.user,
          role: 'TEACHER',
        },
        hiring_date: formData.hiring_date || null,
      }

      if (isEditing) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...userWithoutPassword } = payload.user
        const dataToUpdate = {
          ...payload,
          user: userWithoutPassword
        }
        await teachersApi.update(Number(id), dataToUpdate)
      } else {
        await teachersApi.create(payload)
      }
      navigate('/teachers')
    } catch (err: any) {
      console.error(err)
      setError(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Error al guardar el docente')
    } finally {
      setLoading(false)
    }
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
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Información Personal (Usuario)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                name="username"
                value={formData.user.username}
                onChange={handleUserChange}
                required
                disabled={isEditing}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.user.email}
                onChange={handleUserChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="first_name">Nombres</Label>
              <Input
                id="first_name"
                name="first_name"
                value={formData.user.first_name}
                onChange={handleUserChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Apellidos</Label>
              <Input
                id="last_name"
                name="last_name"
                value={formData.user.last_name}
                onChange={handleUserChange}
                required
              />
            </div>
            {!isEditing && (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.user.password}
                  onChange={handleUserChange}
                  required={!isEditing}
                  minLength={8}
                />
              </div>
            )}
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
              <Label htmlFor="salary_scale">Escalafón</Label>
              <Input
                id="salary_scale"
                name="salary_scale"
                value={formData.salary_scale}
                onChange={handleChange}
              />
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
