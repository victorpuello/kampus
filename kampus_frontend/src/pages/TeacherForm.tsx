import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { teachersApi } from '../services/teachers'
import { academicApi, type AcademicYear, type Group, type TeacherAssignment, type AcademicLoad, type Grade } from '../services/academic'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { Toast, type ToastType } from '../components/ui/Toast'
import { ArrowLeft, Save, Plus, Trash2, BookOpen } from 'lucide-react'
import { useAuthStore } from '../store/auth'

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

type TeachingLevel = 'PRESCHOOL' | 'PRIMARY' | 'SECONDARY'

type TeacherFormData = {
  first_name: string
  last_name: string
  email: string
  document_type: string
  document_number: string
  phone: string
  address: string
  title: string
  specialty: string
  regime: string
  salary_scale: string
  teaching_level: TeachingLevel
  hiring_date: string
}

export default function TeacherForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditing = !!id

  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'

  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  })
  
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }, [])

  const getErrorMessage = (error: unknown, defaultMessage: string): string => {
    const errObj = (typeof error === 'object' && error !== null)
      ? (error as { response?: { data?: unknown } })
      : null

    if (errObj?.response?.data) {
      const data = errObj.response.data
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
      if (typeof data === 'object' && data !== null && 'detail' in data) {
        const detail = (data as { detail?: unknown }).detail
        if (typeof detail === 'string') return detail
      }
    }
    return defaultMessage
  }
  
  const [formData, setFormData] = useState<TeacherFormData>({
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

  const [teacherPhotoUrl, setTeacherPhotoUrl] = useState<string | null>(null)
  const [teacherPhotoFile, setTeacherPhotoFile] = useState<File | null>(null)
  const [teacherPhotoPreviewUrl, setTeacherPhotoPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (teacherPhotoPreviewUrl) URL.revokeObjectURL(teacherPhotoPreviewUrl)
    }
  }, [teacherPhotoPreviewUrl])

  const [activeTab, setActiveTab] = useState<'info' | 'assignments'>('info')
  
  // Assignment states
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [years, setYears] = useState<AcademicYear[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [academicLoads, setAcademicLoads] = useState<AcademicLoad[]>([])
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [newAssignment, setNewAssignment] = useState({
    group: '',
    academic_load: ''
  })

  const [autoAssignPrimaryPlan, setAutoAssignPrimaryPlan] = useState(true)
  const [autoAssignedGroups, setAutoAssignedGroups] = useState<Set<string>>(() => new Set())

  const isPrimaryTeacher = formData.teaching_level === 'PRIMARY'

  const loadAssignmentData = useCallback(async () => {
    try {
      const [yearsRes, groupsRes, gradesRes, assignmentsRes, loadsRes] = await Promise.all([
        academicApi.listYears(),
        academicApi.listGroups(),
        academicApi.listGrades(),
        academicApi.listAssignments(),
        academicApi.listAcademicLoads()
      ])
      
      setYears(yearsRes.data)
      setGroups(groupsRes.data)
      setGrades(gradesRes.data)
      setAcademicLoads(loadsRes.data)
      
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
  }, [id, selectedYear, showToast])

  useEffect(() => {
    if (activeTab === 'assignments' && isEditing) {
      loadAssignmentData()
    }
  }, [activeTab, isEditing, loadAssignmentData])

  const handleAddAssignment = async () => {
    if (!selectedYear || !newAssignment.group || !newAssignment.academic_load) {
      showToast('Por favor complete todos los campos', 'error')
      return
    }

    try {
      const response = await academicApi.createAssignment({
        teacher: Number(id),
        academic_year: Number(selectedYear),
        group: Number(newAssignment.group),
        academic_load: Number(newAssignment.academic_load)
      })
      
      setAssignments([...assignments, response.data])
      setNewAssignment({ group: '', academic_load: '' })
      showToast('Asignación agregada correctamente', 'success')
    } catch (error: unknown) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al agregar asignación'), 'error')
    }
  }

  const handleAssignGradePlan = async (groupIdRaw?: string) => {
    const groupId = groupIdRaw ?? newAssignment.group
    if (!selectedYear || !groupId) {
      showToast('Selecciona año y grupo', 'error')
      return
    }

    try {
      const res = await academicApi.assignGradePlan({
        teacher: Number(id),
        academic_year: Number(selectedYear),
        group: Number(groupId),
      })

      const { created, skipped_existing, skipped_taken } = res.data
      const msgParts = []
      if (created) msgParts.push(`${created} creadas`)
      if (skipped_existing) msgParts.push(`${skipped_existing} ya existían`)
      if (skipped_taken) msgParts.push(`${skipped_taken} ya asignadas a otro docente`)
      showToast(`Plan del grado: ${msgParts.join(' • ') || 'sin cambios'}`, skipped_taken ? 'warning' : 'success')

      await loadAssignmentData()
    } catch (error: unknown) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al asignar plan del grado'), 'error')
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
    const gradeOrdinalById = new Map<number, number | null | undefined>()
    for (const gr of grades) gradeOrdinalById.set(gr.id, gr.ordinal)

    return groups
      .filter(g => g.academic_year === Number(selectedYear))
      .slice()
      .sort((a, b) => {
        const ao = gradeOrdinalById.get(a.grade)
        const bo = gradeOrdinalById.get(b.grade)
        const aOrd = ao === null || ao === undefined ? -9999 : ao
        const bOrd = bo === null || bo === undefined ? -9999 : bo
        if (aOrd !== bOrd) return bOrd - aOrd
        const aLabel = `${a.grade_name || ''} ${a.name || ''}`.trim()
        const bLabel = `${b.grade_name || ''} ${b.name || ''}`.trim()
        return aLabel.localeCompare(bLabel)
      })
  }

  const selectedYearObj = years.find((y) => y.id === Number(selectedYear))
  const isSelectedYearClosed = selectedYearObj?.status === 'CLOSED'

  const getFilteredLoads = () => {
    if (!newAssignment.group) return []
    const group = groups.find(g => g.id === Number(newAssignment.group))
    if (!group) return []
    return academicLoads.filter(l => l.grade === group.grade)
  }

  const getTargetHours = (level: TeachingLevel) => {
    switch (level) {
      case 'PRESCHOOL': return 20;
      case 'PRIMARY': return 25;
      case 'SECONDARY': return 22;
      default: return 22;
    }
  }

  const getLevelLabel = (level: TeachingLevel) => {
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

    // Multigrade handling:
    // Some teachers teach the same hour simultaneously to multiple groups (different grades).
    // In that case, the UI should not count those hours multiple times.
    // We rely on the Group.is_multigrade flag (set in AcademicConfigPanel) and bucket by
    // subject + shift + campus + classroom.
    // If classroom is missing, we fall back to including the group name to reduce the risk
    // of collapsing unrelated multigrade groups.
    const loadById = new Map<number, AcademicLoad>()
    for (const l of academicLoads) loadById.set(l.id, l)

    const groupById = new Map<number, Group>()
    for (const g of groups) groupById.set(g.id, g)

    type BucketItem = { hours: number; gradeId: number; assignmentId: number }
    const buckets = new Map<string, BucketItem[]>()
    const standalone: BucketItem[] = []

    for (const a of yearAssignments) {
      const load = loadById.get(a.academic_load)
      const group = groupById.get(a.group)
      const hours = load?.hours_per_week || 0

      if (!load || !group || !group.is_multigrade) {
        standalone.push({ hours, gradeId: group?.grade ?? -1, assignmentId: a.id })
        continue
      }

      const subjectId = load.subject
      const baseKey = `${subjectId}|${group.shift}|${group.campus ?? ''}`
      const key = group.classroom
        ? `${baseKey}|${group.classroom}`
        : `${baseKey}|${group.name}`
      const item: BucketItem = { hours, gradeId: group.grade, assignmentId: a.id }
      const arr = buckets.get(key) || []
      arr.push(item)
      buckets.set(key, arr)
    }

    let total = 0

    // Count non-bucketed items normally
    for (const it of standalone) total += it.hours

    // Count bucketed items: if they span multiple grades, count only once (max hours)
    for (const items of buckets.values()) {
      const gradeSet = new Set(items.map(i => i.gradeId))
      if (gradeSet.size >= 2) {
        total += Math.max(...items.map(i => i.hours))
      } else {
        total += items.reduce((sum, i) => sum + i.hours, 0)
      }
    }

    return total
  }

  useEffect(() => {
    if (isEditing && id) {
      setLoading(true)
      teachersApi.getById(Number(id))
        .then(res => {
          const teacher = res.data
          setTeacherPhotoUrl(teacher.photo || null)
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
  }, [id, isEditing, showToast])

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setTeacherPhotoFile(file)

    if (teacherPhotoPreviewUrl) URL.revokeObjectURL(teacherPhotoPreviewUrl)
    setTeacherPhotoPreviewUrl(file ? URL.createObjectURL(file) : null)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => {
      const newData: TeacherFormData = { ...prev }

      if (name === 'teaching_level') {
        if (value === 'PRESCHOOL' || value === 'PRIMARY' || value === 'SECONDARY') {
          newData.teaching_level = value
        }
        return newData
      }

      if (name in newData) {
        ;(newData as Record<string, string>)[name] = value
      }
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
        ...(teacherPhotoFile ? { photo: teacherPhotoFile } : {}),
      }

      if (isEditing) {
        const res = await teachersApi.update(Number(id), payload)
        setTeacherPhotoUrl(res.data.photo || teacherPhotoUrl)
        setTeacherPhotoFile(null)
        if (teacherPhotoPreviewUrl) URL.revokeObjectURL(teacherPhotoPreviewUrl)
        setTeacherPhotoPreviewUrl(null)
        showToast('Docente actualizado correctamente', 'success')
      } else {
        const res = await teachersApi.create(payload)
        setTeacherPhotoUrl(res.data.photo || null)
        setTeacherPhotoFile(null)
        if (teacherPhotoPreviewUrl) URL.revokeObjectURL(teacherPhotoPreviewUrl)
        setTeacherPhotoPreviewUrl(null)
        showToast('Docente creado correctamente', 'success')
      }
      setTimeout(() => navigate('/teachers'), 1500)
    } catch (err: unknown) {
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

  if (isTeacher) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Docentes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600">No tienes permisos para crear o editar docentes.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading && isEditing) return <div className="p-6" role="status" aria-live="polite">Cargando...</div>

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

      <div className="flex space-x-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Secciones del docente">
        <button
          onClick={() => setActiveTab('info')}
          id="teacher-tab-info"
          role="tab"
          aria-selected={activeTab === 'info'}
          aria-controls="teacher-panel-info"
          tabIndex={activeTab === 'info' ? 0 : -1}
          className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 ${
            activeTab === 'info'
              ? 'bg-white text-blue-700 shadow'
              : 'text-slate-600 hover:bg-white/12 hover:text-slate-800'
          }`}
        >
          Información General
        </button>
        <button
          onClick={() => setActiveTab('assignments')}
          disabled={!isEditing}
          id="teacher-tab-assignments"
          role="tab"
          aria-selected={activeTab === 'assignments'}
          aria-controls="teacher-panel-assignments"
          tabIndex={activeTab === 'assignments' ? 0 : -1}
          className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 ${
            activeTab === 'assignments'
              ? 'bg-white text-blue-700 shadow'
              : 'text-slate-600 hover:bg-white/12 hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed'
          }`}
        >
          Asignación Académica
        </button>
      </div>

      {activeTab === 'info' ? (
        <form onSubmit={handleSubmit} className="space-y-6" id="teacher-panel-info" role="tabpanel" aria-labelledby="teacher-tab-info">
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

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="photo">Foto</Label>
                <div className="flex items-center gap-4">
                  {(teacherPhotoPreviewUrl || teacherPhotoUrl) ? (
                    <img
                      src={teacherPhotoPreviewUrl || teacherPhotoUrl || ''}
                      alt="Foto del docente"
                      className="h-16 w-16 rounded-full object-cover border border-slate-200"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-full border border-dashed border-slate-300 bg-slate-50" />
                  )}
                  <input
                    id="photo"
                    name="photo"
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                  />
                </div>
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
        <div className="space-y-6" id="teacher-panel-assignments" role="tabpanel" aria-labelledby="teacher-tab-assignments">
          <Card>
            <CardHeader>
              <CardTitle>Asignación Académica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-48">
                  <Label htmlFor="teacher-academic-year">Año Académico</Label>
                  <select
                    id="teacher-academic-year"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {years.map(y => (
                      <option key={y.id} value={y.id}>{y.year} {y.status_display ? `(${y.status_display})` : ''}</option>
                    ))}
                  </select>
                  {isSelectedYearClosed && (
                    <p className="mt-1 text-xs text-amber-700">
                      Año finalizado: no se permiten nuevas asignaciones.
                    </p>
                  )}
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
                  <Label htmlFor="teacher-assignment-group">Grupo</Label>
                  <select
                    id="teacher-assignment-group"
                    value={newAssignment.group}
                    onChange={async (e) => {
                      const nextGroup = e.target.value
                      setNewAssignment(prev => ({ ...prev, group: nextGroup, academic_load: '' }))

                      if (isSelectedYearClosed) return
                      if (!isPrimaryTeacher) return
                      if (!autoAssignPrimaryPlan) return
                      if (!nextGroup) return

                      // Avoid re-triggering for the same group during this session.
                      if (autoAssignedGroups.has(nextGroup)) return
                      setAutoAssignedGroups(prev => new Set([...prev, nextGroup]))

                      await handleAssignGradePlan(nextGroup)
                    }}
                    disabled={isSelectedYearClosed}
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Seleccione un grupo</option>
                    {getFilteredGroups().map(g => (
                      <option key={g.id} value={g.id}>{g.grade_name} - {g.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Automático (Primaria)</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={autoAssignPrimaryPlan}
                      onChange={(e) => setAutoAssignPrimaryPlan(e.target.checked)}
                      disabled={!isPrimaryTeacher || isSelectedYearClosed}
                    />
                    <span className="text-sm text-slate-600">Cargar todas las asignaturas al elegir grupo</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="teacher-assignment-academic-load">Asignatura</Label>
                  <select
                    id="teacher-assignment-academic-load"
                    value={newAssignment.academic_load}
                    onChange={(e) => setNewAssignment(prev => ({ ...prev, academic_load: e.target.value }))}
                    disabled={!newAssignment.group || isSelectedYearClosed}
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                  >
                    <option value="">Seleccione una asignatura</option>
                    {getFilteredLoads().map(l => (
                      <option key={l.id} value={l.id}>{l.subject_name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  {isPrimaryTeacher && (
                    <Button
                      variant="outline"
                      onClick={() => handleAssignGradePlan()}
                      disabled={!newAssignment.group || isSelectedYearClosed}
                      title="Asigna automáticamente todas las asignaturas del plan del grado"
                    >
                      <Plus className="mr-2 h-4 w-4" /> Plan completo
                    </Button>
                  )}
                  <Button onClick={handleAddAssignment} disabled={!newAssignment.group || !newAssignment.academic_load || isSelectedYearClosed}>
                    <Plus className="mr-2 h-4 w-4" /> Agregar
                  </Button>
                </div>
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
                        const load = academicLoads.find(l => l.id === assignment.academic_load)
                        const group = groups.find(g => g.id === assignment.group)
                        return (
                          <div key={assignment.id} className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                <BookOpen className="h-5 w-5" />
                              </div>
                              <div>
                                <p className="font-medium text-slate-900">{load?.subject_name || 'Asignatura desconocida'}</p>
                                <p className="text-sm text-slate-500">
                                  Grupo {group?.grade_name} - {group?.name} • {load?.hours_per_week} horas/semana
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
