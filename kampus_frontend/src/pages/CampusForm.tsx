import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { 
  coreApi, 
  type Campus, 
  type User,
  SEDE_TYPE_OPTIONS,
  SEDE_STATUS_OPTIONS,
  CHARACTER_OPTIONS,
  SPECIALTY_OPTIONS,
  METHODOLOGY_OPTIONS,
  ZONE_OPTIONS,
  LEVEL_OPTIONS,
  SHIFT_OPTIONS,
  CALENDAR_OPTIONS,
} from '../services/core'
import { COLOMBIA_DATA } from '../lib/colombia'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { Toast, type ToastType } from '../components/ui/Toast'
import { Save, ArrowLeft, Building, FileText, MapPin, GraduationCap, Phone, Users } from 'lucide-react'
import { useAuthStore } from '../store/auth'

const initialFormData: Partial<Campus> = {
  institution: 0,
  dane_code: '',
  dane_code_previous: '',
  sede_number: '',
  nit: '',
  name: '',
  sede_type: 'PRINCIPAL',
  status: 'ACTIVA',
  resolution_number: '',
  resolution_date: '',
  character: 'ACADEMICA',
  specialty: 'ACADEMICO',
  methodology: 'TRADICIONAL',
  department: '',
  municipality: '',
  zone: 'URBANA',
  neighborhood: '',
  address: '',
  latitude: null,
  longitude: null,
  levels: [],
  shifts: [],
  calendar: 'A',
  phone: '',
  mobile: '',
  email: '',
  other_contact: '',
  director: null,
  campus_secretary: null,
  coordinator: null,
  is_main: false,
}

export default function CampusForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'

  if (isTeacher) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Sedes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">No tienes permisos para crear o editar sedes.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }
  
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<Partial<Campus>>(initialFormData)
  const [institutionId, setInstitutionId] = useState<number | null>(null)
  
  // Listas de usuarios
  const [rectorsList, setRectorsList] = useState<User[]>([])
  const [secretariesList, setSecretariesList] = useState<User[]>([])
  const [coordinatorsList, setCoordinatorsList] = useState<User[]>([])

  // Municipios filtrados
  const [municipalities, setMunicipalities] = useState<string[]>([])

  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  useEffect(() => {
    loadInitialData()
  }, [id])

  const loadInitialData = async () => {
    try {
      // Cargar institución
      const instRes = await coreApi.listInstitutions()
      if (instRes.data.length > 0) {
        setInstitutionId(instRes.data[0].id)
        setFormData(prev => ({ ...prev, institution: instRes.data[0].id }))
      }

      // Cargar listas de usuarios
      const [rectorsRes, secretariesRes, coordinatorsRes] = await Promise.all([
        coreApi.listRectors(),
        coreApi.listSecretaries(),
        coreApi.listCoordinators(),
      ])
      setRectorsList(rectorsRes.data)
      setSecretariesList(secretariesRes.data)
      setCoordinatorsList(coordinatorsRes.data)

      // Si es edición, cargar datos de la sede
      if (id) {
        const campusRes = await coreApi.getCampus(Number(id))
        setFormData(campusRes.data)
        
        // Cargar municipios si hay departamento seleccionado
        if (campusRes.data.department) {
          const deptData = COLOMBIA_DATA.find(d => d.department === campusRes.data.department)
          if (deptData) {
            setMunicipalities(deptData.municipalities)
          }
        }
      }
    } catch (err) {
      console.error(err)
      showToast('Error al cargar los datos', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    
    if (name === 'department') {
      // Actualizar municipios cuando cambia el departamento
      const deptData = COLOMBIA_DATA.find(d => d.department === value)
      setMunicipalities(deptData ? deptData.municipalities : [])
      // Limpiar municipio seleccionado
      setFormData(prev => ({ ...prev, [name]: value, municipality: '' }))
      return
    }

    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked
      setFormData(prev => ({ ...prev, [name]: checked }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleMultiSelect = (field: 'levels' | 'shifts', value: string) => {
    setFormData(prev => {
      const current = prev[field] || []
      if (current.includes(value)) {
        return { ...prev, [field]: current.filter(v => v !== value) }
      } else {
        return { ...prev, [field]: [...current, value] }
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      // Preparar datos
      const dataToSend: Partial<Campus> = { 
        ...formData,
        institution: institutionId || undefined,
        director: formData.director || undefined,
        campus_secretary: formData.campus_secretary || undefined,
        coordinator: formData.coordinator || undefined,
      }

      if (isEdit && id) {
        await coreApi.updateCampus(Number(id), dataToSend)
        showToast('Sede actualizada correctamente', 'success')
      } else {
        await coreApi.createCampus(dataToSend)
        showToast('Sede creada correctamente', 'success')
      }
      
      setTimeout(() => navigate('/campuses'), 1500)
    } catch (err: unknown) {
      console.error(err)
      const error = err as { response?: { data?: Record<string, string[]> } }
      if (error.response?.data) {
        const messages = Object.entries(error.response.data)
          .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(', ') : val}`)
          .join('. ')
        showToast(messages || 'Error al guardar la sede', 'error')
      } else {
        showToast('Error al guardar la sede', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-slate-700 dark:text-slate-200">Cargando...</div>

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />

      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/campuses')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {isEdit ? 'Editar Sede' : 'Nueva Sede'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            {isEdit ? 'Modifica la información de la sede.' : 'Registra una nueva sede educativa.'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1. Identificación de la Sede */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Identificación de la Sede
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Nombre de la Sede *</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Ej: Sede Principal San José"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sede_number">Número de Sede *</Label>
              <Input
                id="sede_number"
                name="sede_number"
                value={formData.sede_number}
                onChange={handleChange}
                placeholder="Ej: 01"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dane_code">Código DANE Actual *</Label>
              <Input
                id="dane_code"
                name="dane_code"
                value={formData.dane_code}
                onChange={handleChange}
                placeholder="Ej: 123456789012"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dane_code_previous">Código DANE Anterior</Label>
              <Input
                id="dane_code_previous"
                name="dane_code_previous"
                value={formData.dane_code_previous}
                onChange={handleChange}
                placeholder="Para trazabilidad"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nit">NIT *</Label>
              <Input
                id="nit"
                name="nit"
                value={formData.nit}
                onChange={handleChange}
                placeholder="Ej: 900123456-1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sede_type">Tipo de Sede *</Label>
              <select
                id="sede_type"
                name="sede_type"
                value={formData.sede_type}
                onChange={handleChange}
                required
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:ring-slate-300"
              >
                {SEDE_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Estado *</Label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                required
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:ring-slate-300"
              >
                {SEDE_STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2 flex items-center pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="is_main"
                  checked={formData.is_main}
                  onChange={handleChange}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:focus:ring-sky-400"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Es Sede Principal</span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* 2. Normatividad y Características Académicas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Normatividad y Características Académicas
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="resolution_number">Número de Resolución *</Label>
              <Input
                id="resolution_number"
                name="resolution_number"
                value={formData.resolution_number}
                onChange={handleChange}
                placeholder="Ej: 756"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resolution_date">Fecha de Resolución *</Label>
              <Input
                id="resolution_date"
                name="resolution_date"
                type="date"
                value={formData.resolution_date}
                onChange={handleChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="character">Carácter *</Label>
              <select
                id="character"
                name="character"
                value={formData.character}
                onChange={handleChange}
                required
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:ring-slate-300"
              >
                {CHARACTER_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="specialty">Especialidad *</Label>
              <select
                id="specialty"
                name="specialty"
                value={formData.specialty}
                onChange={handleChange}
                required
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:ring-slate-300"
              >
                {SPECIALTY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="methodology">Metodología *</Label>
              <select
                id="methodology"
                name="methodology"
                value={formData.methodology}
                onChange={handleChange}
                required
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:ring-slate-300"
              >
                {METHODOLOGY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* 3. Ubicación */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Ubicación
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="department">Departamento *</Label>
              <select
                id="department"
                name="department"
                value={formData.department}
                onChange={handleChange}
                required
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:ring-slate-300"
              >
                <option value="">Seleccione...</option>
                {COLOMBIA_DATA.map(dept => (
                  <option key={dept.department} value={dept.department}>
                    {dept.department}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="municipality">Municipio *</Label>
              <select
                id="municipality"
                name="municipality"
                value={formData.municipality}
                onChange={handleChange}
                required
                disabled={!formData.department}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:ring-slate-300"
              >
                <option value="">Seleccione...</option>
                {municipalities.map(mun => (
                  <option key={mun} value={mun}>
                    {mun}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="zone">Zona *</Label>
              <select
                id="zone"
                name="zone"
                value={formData.zone}
                onChange={handleChange}
                required
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:ring-slate-300"
              >
                {ZONE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="neighborhood">Vereda o Barrio *</Label>
              <Input
                id="neighborhood"
                name="neighborhood"
                value={formData.neighborhood}
                onChange={handleChange}
                placeholder="Ej: Barrio Centro"
                required
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Dirección *</Label>
              <Input
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Ej: Calle 10 # 20-30"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="latitude">Latitud</Label>
              <Input
                id="latitude"
                name="latitude"
                type="number"
                step="any"
                value={formData.latitude || ''}
                onChange={handleChange}
                placeholder="Ej: 10.3910"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="longitude">Longitud</Label>
              <Input
                id="longitude"
                name="longitude"
                type="number"
                step="any"
                value={formData.longitude || ''}
                onChange={handleChange}
                placeholder="Ej: -75.4794"
              />
            </div>
          </CardContent>
        </Card>

        {/* 4. Oferta Educativa */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Oferta Educativa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label>Niveles que Ofrece *</Label>
              <div className="flex flex-wrap gap-3">
                {LEVEL_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.levels?.includes(opt.value) || false}
                      onChange={() => handleMultiSelect('levels', opt.value)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:focus:ring-sky-400"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-200">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <Label>Jornadas *</Label>
              <div className="flex flex-wrap gap-3">
                {SHIFT_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.shifts?.includes(opt.value) || false}
                      onChange={() => handleMultiSelect('shifts', opt.value)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:focus:ring-sky-400"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-200">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="calendar">Calendario *</Label>
              <select
                id="calendar"
                name="calendar"
                value={formData.calendar}
                onChange={handleChange}
                required
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:ring-slate-300"
              >
                {CALENDAR_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* 5. Contacto */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Contacto
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono Fijo *</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                placeholder="Ej: (605) 123 4567"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobile">Celular de Contacto</Label>
              <Input
                id="mobile"
                name="mobile"
                type="tel"
                value={formData.mobile}
                onChange={handleChange}
                placeholder="Ej: 300 123 4567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Correo Institucional *</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Ej: sede@institucion.edu.co"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="other_contact">Otro Medio de Contacto</Label>
              <Input
                id="other_contact"
                name="other_contact"
                value={formData.other_contact}
                onChange={handleChange}
                placeholder="Ej: WhatsApp, radio, etc."
              />
            </div>
          </CardContent>
        </Card>

        {/* 6. Responsables */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Responsables
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="director">Rector(a) o Director(a)</Label>
              <select
                id="director"
                name="director"
                value={formData.director || ''}
                onChange={handleChange}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:ring-slate-300"
              >
                <option value="">Sin asignar</option>
                {rectorsList.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name} ({user.username})
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400">Usuarios con rol Administrador o Docente</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="campus_secretary">Secretario(a)</Label>
              <select
                id="campus_secretary"
                name="campus_secretary"
                value={formData.campus_secretary || ''}
                onChange={handleChange}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:ring-slate-300"
              >
                <option value="">Sin asignar</option>
                {secretariesList.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name} ({user.username})
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400">Usuarios con rol Secretaría</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="coordinator">Coordinador(a)</Label>
              <select
                id="coordinator"
                name="coordinator"
                value={formData.coordinator || ''}
                onChange={handleChange}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:ring-slate-300"
              >
                <option value="">Sin asignar</option>
                {coordinatorsList.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name} ({user.username})
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400">Usuarios con rol Coordinador</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => navigate('/campuses')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Guardando...' : (isEdit ? 'Guardar Cambios' : 'Crear Sede')}
          </Button>
        </div>
      </form>
    </div>
  )
}
