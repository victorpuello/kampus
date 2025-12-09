import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { studentsApi, documentsApi } from '../../services/students'
import { enrollmentsApi } from '../../services/enrollments'
import { academicApi, type AcademicYear, type Grade, type Group } from '../../services/academic'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Label } from '../../components/ui/Label'
import { Toast, type ToastType } from '../../components/ui/Toast'
import { ArrowLeft, Check, Upload, FileText, User, BookOpen, AlertCircle } from 'lucide-react'

const STEPS = [
  { id: 1, title: 'Datos del Estudiante', icon: User },
  { id: 2, title: 'Documentos', icon: FileText },
  { id: 3, title: 'Matrícula Académica', icon: BookOpen },
]

export default function EnrollmentWizard() {
  const navigate = useNavigate()
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
    // Load academic data
    Promise.all([
      academicApi.listYears(),
      academicApi.listGrades(),
      academicApi.listGroups()
    ]).then(([yearsRes, gradesRes, groupsRes]) => {
      setYears(yearsRes.data)
      setGrades(gradesRes.data)
      setGroups(groupsRes.data)
      
      // Set active year default
      const activeYear = yearsRes.data.find(y => y.status === 'ACTIVE')
      if (activeYear) {
        setAcademicData(prev => ({ ...prev, academic_year: String(activeYear.id) }))
      }
    }).catch(console.error)
  }, [])

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
            showToast('Estudiante creado, pero hubo un error al subir la foto.', 'warning')
            // We don't throw here, so we can proceed to next step
        }
      } else {
        showToast('Estudiante creado correctamente', 'success')
      }

      setCurrentStep(2)
    } catch (error: any) {
      console.error('Error creating student:', error)
      let msg = 'Error al crear estudiante'
      
      if (error.response?.data) {
        const data = error.response.data
        if (data.document_number) msg = `Documento: ${data.document_number[0]}`
        else if (data.email) msg = `Email: ${data.email[0]}`
        else if (data.username) msg = `Usuario: ${data.username[0]}`
        else if (data.detail) msg = data.detail
        else if (typeof data === 'object') {
            const firstKey = Object.keys(data)[0]
            if (firstKey) {
                const val = data[firstKey]
                msg = `${firstKey}: ${Array.isArray(val) ? val[0] : val}`
            }
        }
      }
      
      showToast(msg, 'error')
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
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
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
      setTimeout(() => navigate('/enrollments'), 1500)
    } catch (error: any) {
      console.error(error)
      const msg = error.response?.data?.group ? error.response.data.group[0] : 
                  error.response?.data?.student ? error.response.data.student[0] :
                  'Error al matricular'
      showToast(msg, 'error')
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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/enrollments')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          Nueva Matrícula
        </h2>
      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />

      {/* Steps Indicator */}
      <div className="flex justify-between items-center px-10 py-4 bg-white rounded-lg shadow-sm">
        {STEPS.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
              currentStep >= step.id ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-slate-300 text-slate-300'
            }`}>
              {currentStep > step.id ? <Check className="w-6 h-6" /> : <step.icon className="w-5 h-5" />}
            </div>
            <span className={`ml-3 font-medium ${currentStep >= step.id ? 'text-blue-900' : 'text-slate-400'}`}>
              {step.title}
            </span>
            {index < STEPS.length - 1 && (
              <div className={`w-24 h-0.5 mx-4 ${currentStep > step.id ? 'bg-blue-600' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
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
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={loading}>
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
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setCurrentStep(1)}>Atrás</Button>
              <Button onClick={handleDocumentUpload} disabled={loading}>
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
                  {grades.map(g => (
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
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setCurrentStep(2)}>Atrás</Button>
              <Button onClick={handleEnrollmentSubmit} disabled={loading}>
                {loading ? 'Matricular' : 'Finalizar Matrícula'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
