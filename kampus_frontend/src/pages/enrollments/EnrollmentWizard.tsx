import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { studentsApi, documentsApi } from '../../services/students'
import { enrollmentsApi } from '../../services/enrollments'
import { academicApi, type AcademicYear, type Grade, type Group } from '../../services/academic'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Label } from '../../components/ui/Label'
import { Toast, type ToastType } from '../../components/ui/Toast'
import { ArrowLeft, Check, FileText, User, BookOpen, AlertCircle } from 'lucide-react'
import { useAuthStore } from '../../store/auth'

const STEPS = [
  { id: 1, title: 'Datos del Estudiante', icon: User },
  { id: 2, title: 'Documentos', icon: FileText },
  { id: 3, title: 'Matrícula Académica', icon: BookOpen },
]

export default function EnrollmentWizard() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'

  const prefill = (() => {
    const params = new URLSearchParams(location.search)
    const groupParam = params.get('group')
    const returnToParam = params.get('returnTo')
    const groupId = groupParam ? Number(groupParam) : null

    // Prevent open redirects: only allow internal paths.
    const safeReturnTo = returnToParam && returnToParam.startsWith('/') ? returnToParam : null
    return { groupId: groupId && Number.isFinite(groupId) ? groupId : null, returnTo: safeReturnTo }
  })()

  const [prefillApplied, setPrefillApplied] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [studentId, setStudentId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const getErrorResponseData = (err: unknown): unknown => {
    return (err as { response?: { data?: unknown } } | undefined)?.response?.data
  }

  const getErrorMessage = (err: unknown, fallback: string) => {
    const data = getErrorResponseData(err)
    if (!data) return fallback

    if (typeof data === 'string') return data

    if (typeof data === 'object') {
      const obj = data as Record<string, unknown>
      const detail = obj.detail
      if (typeof detail === 'string') return detail

      const knownKeys = ['document_number', 'email', 'username', 'group', 'student']
      for (const k of knownKeys) {
        const v = obj[k]
        if (Array.isArray(v) && typeof v[0] === 'string') return `${k}: ${v[0]}`
        if (typeof v === 'string') return `${k}: ${v}`
      }

      const firstKey = Object.keys(obj)[0]
      if (firstKey) {
        const v = obj[firstKey]
        if (Array.isArray(v) && typeof v[0] === 'string') return `${firstKey}: ${v[0]}`
        if (typeof v === 'string') return `${firstKey}: ${v}`
      }
    }

    return fallback
  }

  // Step 1: Student Data
  const [studentData, setStudentData] = useState({
    first_name: '',
    last_name: '',
    document_type: 'TI',
    document_number: '',
    email: '',
    phone: '',
    address: '',
    photo: null as File | null
  })

  // Step 2: Documents
  const [documents, setDocuments] = useState<{ type: string; file: File | null; progress: number; uploaded: boolean }[]>([
    { type: 'IDENTITY', file: null, progress: 0, uploaded: false },
    { type: 'VACCINES', file: null, progress: 0, uploaded: false },
    { type: 'EPS', file: null, progress: 0, uploaded: false },
    { type: 'ACADEMIC', file: null, progress: 0, uploaded: false },
  ])

  // Step 3: Enrollment
  const [academicData, setAcademicData] = useState({
    academic_year: '',
    grade: '',
    group: '',
    campus: '' // Optional if group implies campus
  })
  
  const [years, setYears] = useState<AcademicYear[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [groups, setGroups] = useState<Group[]>([])

  useEffect(() => {
    if (isTeacher) return
    // Load academic data
    Promise.all([
      academicApi.listYears(),
      academicApi.listGrades(),
      academicApi.listGroups()
    ]).then(([yearsRes, gradesRes, groupsRes]) => {
      setYears(yearsRes.data)
      setGrades(gradesRes.data)
      setGroups(groupsRes.data)

      // Prefill from group (if provided)
      if (!prefillApplied && prefill.groupId) {
        const g = groupsRes.data.find((x) => x.id === prefill.groupId)
        if (g) {
          setAcademicData((prev) => ({
            ...prev,
            academic_year: String(g.academic_year),
            grade: String(g.grade),
            group: String(g.id),
            campus: g.campus ? String(g.campus) : ''
          }))
          setPrefillApplied(true)
          return
        }
      }

      // Set active year default (fallback)
      const activeYear = yearsRes.data.find(y => y.status === 'ACTIVE')
      if (activeYear) {
        setAcademicData(prev => ({ ...prev, academic_year: prev.academic_year || String(activeYear.id) }))
      }
    }).catch(console.error)
  }, [isTeacher, prefill.groupId, prefillApplied])

  if (isTeacher) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nueva Matrícula</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600">No tienes permisos para crear matrículas.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = {
        ...studentData,
        photo: undefined
      }
      
      const response = await studentsApi.create(payload)
      setStudentId(response.data.id)
      
      // Upload photo if exists
      if (studentData.photo) {
        try {
            const formData = new FormData()
            formData.append('student', String(response.data.id))
            formData.append('document_type', 'PHOTO')
            formData.append('file', studentData.photo)
            await documentsApi.create(formData)
        } catch (photoError) {
            console.error('Error uploading photo:', photoError)
          showToast('Estudiante creado, pero hubo un error al subir la foto.', 'info')
            // We don't throw here, so we can proceed to next step
        }
      } else {
        showToast('Estudiante creado correctamente', 'success')
      }

      setCurrentStep(2)
    } catch (error: unknown) {
      console.error('Error creating student:', error)
      showToast(getErrorMessage(error, 'Error al crear estudiante'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDocumentUpload = async () => {
    if (!studentId) return
    setLoading(true)
    
    try {
      // Upload documents sequentially to track progress individually
      const newDocs = [...documents]
      
      for (let i = 0; i < newDocs.length; i++) {
        const doc = newDocs[i]
        if (doc.file && !doc.uploaded) {
          const formData = new FormData()
          formData.append('student', String(studentId))
          formData.append('document_type', doc.type)
          formData.append('file', doc.file)
          
          await documentsApi.create(formData, (progressEvent) => {
            const total = progressEvent.total ?? 0
            const percentCompleted = total > 0 ? Math.round((progressEvent.loaded * 100) / total) : 0
            newDocs[i].progress = percentCompleted
            setDocuments([...newDocs])
          })
          
          newDocs[i].uploaded = true
          newDocs[i].progress = 100
          setDocuments([...newDocs])
        }
      }
      
      showToast('Documentos procesados', 'success')
      setCurrentStep(3)
    } catch (error) {
      console.error(error)
      showToast('Error al subir documentos', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleEnrollmentSubmit = async () => {
    if (!studentId || !academicData.academic_year || !academicData.grade) {
        showToast('Faltan datos requeridos', 'error')
        return
    }
    setLoading(true)
    try {
      await enrollmentsApi.create({
        student: studentId,
        academic_year: Number(academicData.academic_year),
        grade: Number(academicData.grade),
        group: academicData.group ? Number(academicData.group) : null,
        status: 'ACTIVE'
      })
      showToast('Matrícula exitosa', 'success')
      setTimeout(() => navigate(prefill.returnTo || '/enrollments'), 1500)
    } catch (error: unknown) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al matricular'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const getFilteredGroups = () => {
    if (!academicData.grade || !academicData.academic_year) return []
    return groups.filter(g => 
        g.grade === Number(academicData.grade) && 
        g.academic_year === Number(academicData.academic_year)
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(prefill.returnTo || '/enrollments')} className="w-full sm:w-auto justify-start">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          Nueva Matrícula
        </h2>
      </div>

      <div className="sm:hidden text-sm text-slate-600">
        Paso {currentStep} de {STEPS.length} — {STEPS[Math.min(Math.max(currentStep - 1, 0), STEPS.length - 1)].title}
      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />

      {/* Steps Indicator */}
      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <div className="flex items-center gap-6 px-4 sm:px-10 py-4 min-w-max">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
              currentStep >= step.id ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-slate-300 text-slate-300'
            }`}>
              {currentStep > step.id ? <Check className="w-6 h-6" /> : <step.icon className="w-5 h-5" />}
            </div>
            <span className={`ml-3 font-medium hidden sm:inline ${currentStep >= step.id ? 'text-blue-900' : 'text-slate-400'}`}>
              {step.title}
            </span>
            {index < STEPS.length - 1 && (
              <div className={`w-10 sm:w-24 h-0.5 mx-3 sm:mx-4 ${currentStep > step.id ? 'bg-blue-600' : 'bg-slate-200'}`} />
            )}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Student Data */}
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Información del Estudiante</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleStudentSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombres</Label>
                  <Input 
                    value={studentData.first_name} 
                    onChange={e => setStudentData({...studentData, first_name: e.target.value})} 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Apellidos</Label>
                  <Input 
                    value={studentData.last_name} 
                    onChange={e => setStudentData({...studentData, last_name: e.target.value})} 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo Documento</Label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={studentData.document_type}
                    onChange={e => setStudentData({...studentData, document_type: e.target.value})}
                  >
                    <option value="TI">Tarjeta de Identidad</option>
                    <option value="RC">Registro Civil</option>
                    <option value="CC">Cédula de Ciudadanía</option>
                    <option value="CE">Cédula de Extranjería</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Número Documento</Label>
                  <Input 
                    value={studentData.document_number} 
                    onChange={e => setStudentData({...studentData, document_number: e.target.value})} 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email (Opcional)</Label>
                  <Input 
                    type="email"
                    value={studentData.email} 
                    onChange={e => setStudentData({...studentData, email: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input 
                    value={studentData.phone} 
                    onChange={e => setStudentData({...studentData, phone: e.target.value})} 
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Dirección</Label>
                  <Input 
                    value={studentData.address} 
                    onChange={e => setStudentData({...studentData, address: e.target.value})} 
                  />
                </div>
                {/* Photo Upload Placeholder */}
                <div className="space-y-2 md:col-span-2">
                    <Label>Foto del Estudiante (Opcional)</Label>
                    <Input 
                        type="file" 
                        accept="image/*"
                        onChange={e => {
                            if (e.target.files?.[0]) {
                                setStudentData({...studentData, photo: e.target.files[0]})
                            }
                        }}
                    />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-end pt-4">
                <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                  {loading ? 'Guardando...' : 'Siguiente'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Documents */}
      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Carga de Documentos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">Instrucciones de carga:</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Formatos permitidos: <strong>PDF, JPG, PNG</strong>.</li>
                  <li>Tamaño máximo por archivo: <strong>5 MB</strong>.</li>
                  <li>Puede continuar sin cargar todos los documentos; el sistema notificará semanalmente los pendientes.</li>
                </ul>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {documents.map((doc, index) => (
                <div key={doc.type} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <Label className="font-medium">
                      {doc.type === 'IDENTITY' ? 'Documento de Identidad' :
                       doc.type === 'VACCINES' ? 'Carnet de Vacunas' :
                       doc.type === 'EPS' ? 'Certificado EPS' :
                       'Certificado Académico'}
                    </Label>
                    {doc.uploaded && <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-medium">Cargado</span>}
                  </div>
                  
                  <div className="space-y-2">
                    <Input 
                      type="file" 
                      accept=".pdf,.jpg,.png"
                      disabled={doc.uploaded}
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file && file.size > 5 * 1024 * 1024) {
                          showToast('El archivo excede el tamaño máximo de 5MB', 'error')
                          e.target.value = ''
                          return
                        }
                        const newDocs = [...documents]
                        newDocs[index].file = file || null
                        newDocs[index].progress = 0
                        newDocs[index].uploaded = false
                        setDocuments(newDocs)
                      }}
                    />
                    
                    {/* Progress Bar */}
                    {doc.file && !doc.uploaded && (
                      <div className="w-full bg-slate-200 rounded-full h-2.5">
                        <div 
                          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                          style={{ width: `${doc.progress}%` }}
                        ></div>
                      </div>
                    )}
                    
                    {doc.file && !doc.uploaded && doc.progress > 0 && (
                      <p className="text-xs text-slate-500 text-right">{doc.progress}%</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-4">
              <Button variant="outline" onClick={() => setCurrentStep(1)} className="w-full sm:w-auto">Atrás</Button>
              <Button onClick={handleDocumentUpload} disabled={loading} className="w-full sm:w-auto">
                {loading ? 'Procesando...' : 'Siguiente'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Enrollment */}
      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Datos de Matrícula</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Año Académico</Label>
                <select 
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={academicData.academic_year}
                  onChange={e => setAcademicData({...academicData, academic_year: e.target.value})}
                >
                  <option value="">Seleccione...</option>
                  {years.map(y => (
                    <option key={y.id} value={y.id}>{y.year} ({y.status})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Grado</Label>
                <select 
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={academicData.grade}
                  onChange={e => setAcademicData({...academicData, grade: e.target.value, group: ''})}
                >
                  <option value="">Seleccione...</option>
                  {grades
                    .slice()
                    .sort((a, b) => {
                      const ao = a.ordinal === null || a.ordinal === undefined ? -9999 : a.ordinal
                      const bo = b.ordinal === null || b.ordinal === undefined ? -9999 : b.ordinal
                      if (ao !== bo) return bo - ao
                      return (a.name || '').localeCompare(b.name || '')
                    })
                    .map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Grupo</Label>
                <select 
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={academicData.group}
                  onChange={e => setAcademicData({...academicData, group: e.target.value})}
                  disabled={!academicData.grade || !academicData.academic_year}
                >
                  <option value="">Seleccione...</option>
                  {getFilteredGroups().map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name} (Disponibles: {g.capacity - g.enrolled_count} de {g.capacity})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-4">
              <Button variant="outline" onClick={() => setCurrentStep(2)} className="w-full sm:w-auto">Atrás</Button>
              <Button onClick={handleEnrollmentSubmit} disabled={loading} className="w-full sm:w-auto">
                {loading ? 'Matricular' : 'Finalizar Matrícula'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
