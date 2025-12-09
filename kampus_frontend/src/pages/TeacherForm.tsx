import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { teachersApi } from '../services/teachers'
import { academicApi, type AcademicYear, type Subject, type Group, type TeacherAssignment } from '../services/academic'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { Toast, type ToastType } from '../components/ui/Toast'
import { ArrowLeft, Save, Plus, Trash2, BookOpen } from 'lucide-react'

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
          if (field === 'non_field_errors' && Array.isArray(value)) {
             messages.push(value.join(', '))
             continue
          }
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
    teaching_level: 'SECONDARY',
    hiring_date: '',
  })

  const [activeTab, setActiveTab] = useState<'info' | 'assignments'>('info')
  
  // Assignment states
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [years, setYears] = useState<AcademicYear[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [newAssignment, setNewAssignment] = useState({
    group: '',
    subject: ''
  })

  useEffect(() => {
    if (activeTab === 'assignments' && isEditing) {
      loadAssignmentData()
    }
  }, [activeTab, isEditing])

  const loadAssignmentData = async () => {
    try {
      const [yearsRes, subjectsRes, groupsRes, assignmentsRes] = await Promise.all([
        academicApi.listYears(),
        academicApi.listSubjects(),
        academicApi.listGroups(),
        academicApi.listAssignments()
      ])
      
      setYears(yearsRes.data)
      setSubjects(subjectsRes.data)
      setGroups(groupsRes.data)
      
      // Filter assignments for this teacher
      const teacherAssignments = assignmentsRes.data.filter(a => a.teacher === Number(id))
      setAssignments(teacherAssignments)

      // Set default year if not set
      if (!selectedYear && yearsRes.data.length > 0) {
        const activeYear = yearsRes.data.find(y => y.status === 'ACTIVE')
        setSelectedYear(String(activeYear ? activeYear.id : yearsRes.data[0].id))
      }
    } catch (error) {
      console.error('Error loading assignment data:', error)
      showToast('Error al cargar datos de asignación', 'error')
    }
  }

  const handleAddAssignment = async () => {
    if (!selectedYear || !newAssignment.group || !newAssignment.subject) {
      showToast('Por favor complete todos los campos', 'error')
      return
    }

    try {
      const response = await academicApi.createAssignment({
        teacher: Number(id),
        academic_year: Number(selectedYear),
        group: Number(newAssignment.group),
        subject: Number(newAssignment.subject)
      })
      
      setAssignments([...assignments, response.data])
      setNewAssignment({ group: '', subject: '' })
      showToast('Asignación agregada correctamente', 'success')
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al agregar asignación'), 'error')
    }
  }

  const handleDeleteAssignment = async (assignmentId: number) => {
    if (!confirm('¿Está seguro de eliminar esta asignación?')) return

    try {
      await academicApi.deleteAssignment(assignmentId)
      setAssignments(assignments.filter(a => a.id !== assignmentId))
      showToast('Asignación eliminada correctamente', 'success')
    } catch (error) {
      console.error(error)
      showToast('Error al eliminar asignación', 'error')
    }
  }

  const getFilteredGroups = () => {
    if (!selectedYear) return []
    return groups.filter(g => g.academic_year === Number(selectedYear))
  }

  const getFilteredSubjects = () => {
    if (!newAssignment.group) return []
    const group = groups.find(g => g.id === Number(newAssignment.group))
    if (!group) return []
    return subjects.filter(s => s.grade === group.grade)
  }

  const getTargetHours = (level: string) => {
    switch (level) {
      case 'PRESCHOOL': return 20;
      case 'PRIMARY': return 25;
      case 'SECONDARY': return 22;
      default: return 22;
    }
  }

  const getLevelLabel = (level: string) => {
    switch (level) {
      case 'PRESCHOOL': return 'Preescolar';
      case 'PRIMARY': return 'Primaria';
      case 'SECONDARY': return 'Secundaria';
      default: return '';
    }
  }

  const calculateAssignedHours = () => {
    if (!selectedYear) return 0
    const yearAssignments = assignments.filter(a => a.academic_year === Number(selectedYear))
    return yearAssignments.reduce((total, assignment) => {
      const subject = subjects.find(s => s.id === assignment.subject)
      return total + (subject?.hours_per_week || 0)
    }, 0)
  }

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
            teaching_level: teacher.teaching_level || 'SECONDARY',
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

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />

      <div className="flex space-x-1 rounded-xl bg-slate-100 p-1">
        <button
          onClick={() => setActiveTab('info')}
          className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 ${
            activeTab === 'info'
              ? 'bg-white text-blue-700 shadow'
              : 'text-slate-600 hover:bg-white/[0.12] hover:text-slate-800'
          }`}
        >
          Información General
        </button>
        <button
          onClick={() => setActiveTab('assignments')}
          disabled={!isEditing}
          className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 ${
            activeTab === 'assignments'
              ? 'bg-white text-blue-700 shadow'
              : 'text-slate-600 hover:bg-white/[0.12] hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed'
          }`}
        >
          Asignación Académica
        </button>
      </div>

      {activeTab === 'info' ? (
        <form onSubmit={handleSubmit} className="space-y-6">
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
                <Label htmlFor="teaching_level">Nivel de Enseñanza</Label>
                <select
                  id="teaching_level"
                  name="teaching_level"
                  value={formData.teaching_level}
                  onChange={handleChange}
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="PRESCHOOL">Preescolar (20 horas)</option>
                  <option value="PRIMARY">Básica Primaria (25 horas)</option>
                  <option value="SECONDARY">Básica Secundaria y Media (22 horas)</option>
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
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Asignación Académica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-48">
                  <Label>Año Académico</Label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {years.map(y => (
                      <option key={y.id} value={y.id}>{y.year} {y.status_display ? `(${y.status_display})` : ''}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="flex justify-between text-sm mb-1 font-medium">
                    <span className="text-slate-700">Carga Académica</span>
                    <span className={
                        calculateAssignedHours() > getTargetHours(formData.teaching_level) ? 'text-amber-600 font-bold' : 
                        calculateAssignedHours() === getTargetHours(formData.teaching_level) ? 'text-emerald-600 font-bold' : 'text-slate-700'
                    }>
                        {calculateAssignedHours()} / {getTargetHours(formData.teaching_level)}h
                    </span>
                  </div>
                  <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden border border-slate-300">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        calculateAssignedHours() > getTargetHours(formData.teaching_level) ? 'bg-amber-500' : 
                        calculateAssignedHours() === getTargetHours(formData.teaching_level) ? 'bg-emerald-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min((calculateAssignedHours() / getTargetHours(formData.teaching_level)) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">{getLevelLabel(formData.teaching_level)}</span>
                    {calculateAssignedHours() > getTargetHours(formData.teaching_level) && (
                      <div className="text-xs font-medium text-amber-600 flex items-center">
                          <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1"></span>
                          +{calculateAssignedHours() - getTargetHours(formData.teaching_level)} horas extras
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end border-b pb-6">
                <div className="space-y-2">
                  <Label>Grupo</Label>
                  <select
                    value={newAssignment.group}
                    onChange={(e) => setNewAssignment(prev => ({ ...prev, group: e.target.value, subject: '' }))}
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Seleccione un grupo</option>
                    {getFilteredGroups().map(g => (
                      <option key={g.id} value={g.id}>{g.grade_name} - {g.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Asignatura</Label>
                  <select
                    value={newAssignment.subject}
                    onChange={(e) => setNewAssignment(prev => ({ ...prev, subject: e.target.value }))}
                    disabled={!newAssignment.group}
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                  >
                    <option value="">Seleccione una asignatura</option>
                    {getFilteredSubjects().map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.hours_per_week}h)</option>
                    ))}
                  </select>
                </div>
                <Button onClick={handleAddAssignment} disabled={!newAssignment.group || !newAssignment.subject}>
                  <Plus className="mr-2 h-4 w-4" /> Agregar
                </Button>
              </div>

              <div className="space-y-4">
                <h3 className="font-medium text-slate-900">Asignaciones Actuales</h3>
                {assignments.filter(a => a.academic_year === Number(selectedYear)).length === 0 ? (
                  <p className="text-slate-500 text-sm">No hay asignaciones para este año.</p>
                ) : (
                  <div className="border rounded-lg divide-y">
                    {assignments
                      .filter(a => a.academic_year === Number(selectedYear))
                      .map(assignment => {
                        const subject = subjects.find(s => s.id === assignment.subject)
                        const group = groups.find(g => g.id === assignment.group)
                        return (
                          <div key={assignment.id} className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                <BookOpen className="h-5 w-5" />
                              </div>
                              <div>
                                <p className="font-medium text-slate-900">{subject?.name}</p>
                                <p className="text-sm text-slate-500">
                                  Grupo {group?.grade_name} - {group?.name} • {subject?.hours_per_week} horas/semana
                                </p>
                              </div>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDeleteAssignment(assignment.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
