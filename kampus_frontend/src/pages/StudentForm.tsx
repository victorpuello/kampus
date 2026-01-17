import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { studentsApi, familyMembersApi } from '../services/students'
import type { FamilyMember } from '../services/students'
import StudentDocuments from '../components/students/StudentDocuments'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { Toast, type ToastType } from '../components/ui/Toast'
import { ConfirmationModal } from '../components/ui/ConfirmationModal'
import { ArrowLeft, User, Home, Activity, Heart, Users, Plus, Trash2, Edit2, X, FileText, GraduationCap } from 'lucide-react'
import { colombiaData } from '../data/colombia'
import { epsList, ethnicityList } from '../data/socioeconomic'
import { useAuthStore } from '../store/auth'
import { academicApi } from '../services/academic'
import { enrollmentsApi, type Enrollment } from '../services/enrollments'
import { disciplineApi, type DisciplineCaseListItem } from '../services/discipline'

const getErrorDetail = (err: unknown): string | undefined => {
    if (typeof err !== 'object' || err === null) return undefined
    const maybe = err as { response?: { data?: { detail?: unknown } } }
    const detail = maybe.response?.data?.detail
    return typeof detail === 'string' ? detail : undefined
}

const disciplineStatusLabel = (s: string) => {
    switch (s) {
        case 'OPEN':
            return 'Abierto'
        case 'DECIDED':
            return 'Decidido'
        case 'CLOSED':
            return 'Cerrado'
        default:
            return s
    }
}

function FamilyMemberForm({ 
    studentId, 
    member, 
    onSave, 
    onCancel 
}: { 
    studentId: number, 
    member?: FamilyMember, 
    onSave: () => void, 
    onCancel: () => void 
}) {
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        full_name: member?.full_name || '',
        document_number: member?.document_number || '',
        relationship: member?.relationship || '',
        phone: member?.phone || '',
        email: member?.email || '',
        address: member?.address || '',
        is_main_guardian: member?.is_main_guardian || false,
        is_head_of_household: member?.is_head_of_household || false,
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target
        setFormData(prev => ({ ...prev, [name]: checked }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const payload = { ...formData, student: studentId }
            if (member) {
                await familyMembersApi.update(member.id, payload)
            } else {
                await familyMembersApi.create(payload)
            }
            onSave()
        } catch (error: unknown) {
            console.error(error)
            alert(getErrorDetail(error) || 'Error al guardar familiar')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{member ? 'Editar Familiar' : 'Nuevo Familiar'}</h3>
                    <button onClick={onCancel}><X className="h-5 w-5 text-slate-500 dark:text-slate-400" /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Nombre Completo</Label>
                            <Input name="full_name" value={formData.full_name} onChange={handleChange} required />
                        </div>
                        <div className="space-y-2">
                            <Label>Parentesco</Label>
                            <select
                                name="relationship"
                                value={formData.relationship}
                                onChange={handleChange}
                                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                required
                            >
                                <option value="">Seleccione...</option>
                                <option value="Madre">Madre</option>
                                <option value="Padre">Padre</option>
                                <option value="Abuelo/a">Abuelo/a</option>
                                <option value="Tío/a">Tío/a</option>
                                <option value="Hermano/a">Hermano/a</option>
                                <option value="Acudiente">Acudiente</option>
                                <option value="Otro">Otro</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label>Documento</Label>
                            <Input name="document_number" value={formData.document_number} onChange={handleChange} />
                        </div>
                        <div className="space-y-2">
                            <Label>Teléfono</Label>
                            <Input name="phone" value={formData.phone} onChange={handleChange} />
                        </div>
                        <div className="space-y-2">
                            <Label>Email</Label>
                            <Input name="email" type="email" value={formData.email} onChange={handleChange} />
                        </div>
                        <div className="space-y-2">
                            <Label>Dirección</Label>
                            <Input name="address" value={formData.address} onChange={handleChange} />
                        </div>
                    </div>
                    <div className="flex gap-6 pt-2">
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input type="checkbox" name="is_main_guardian" checked={formData.is_main_guardian} onChange={handleCheckboxChange} className="h-4 w-4 rounded border-slate-300 dark:border-slate-700" />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Acudiente Principal</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input type="checkbox" name="is_head_of_household" checked={formData.is_head_of_household} onChange={handleCheckboxChange} className="h-4 w-4 rounded border-slate-300 dark:border-slate-700" />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Cabeza de Familia</span>
                        </label>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
                        <Button type="submit" disabled={loading}>{loading ? 'Guardando...' : 'Guardar'}</Button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default function StudentForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditing = !!id
    const user = useAuthStore((s) => s.user)
    const isTeacher = user?.role === 'TEACHER'
        const blockedHistoryImport = user?.role === 'TEACHER' || user?.role === 'PARENT' || user?.role === 'STUDENT'

    const [teacherHasDirectedGroup, setTeacherHasDirectedGroup] = useState<boolean | null>(null)
    const canEdit = !isTeacher || (isEditing && teacherHasDirectedGroup === true)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('identification')

    const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
        message: '',
        type: 'info',
        isVisible: false,
    })

    const showToast = (message: string, type: ToastType = 'info') => {
        setToast({ message, type, isVisible: true })
    }

    const studentId = useMemo(() => {
        if (!isEditing) return null
        const n = Number(id)
        return Number.isFinite(n) ? n : null
    }, [id, isEditing])

    const [disciplineLoading, setDisciplineLoading] = useState(false)
    const [disciplineError, setDisciplineError] = useState<string | null>(null)
    const [disciplineCases, setDisciplineCases] = useState<DisciplineCaseListItem[]>([])
    const [enrollments, setEnrollments] = useState<Enrollment[]>([])
    const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(null)

    const [currentEnrollment, setCurrentEnrollment] = useState<Enrollment | null>(null)
    const [currentEnrollmentLoading, setCurrentEnrollmentLoading] = useState(false)

    const [academicHistory, setAcademicHistory] = useState<Enrollment[]>([])
    const [academicHistoryLoading, setAcademicHistoryLoading] = useState(false)
    const [academicHistoryError, setAcademicHistoryError] = useState<string | null>(null)
    const [newCaseOccurredAt, setNewCaseOccurredAt] = useState<string>('')
    const [newCaseLocation, setNewCaseLocation] = useState<string>('')
    const [newCaseNarrative, setNewCaseNarrative] = useState<string>('')
    const [newCaseManualSeverity, setNewCaseManualSeverity] = useState<'MINOR' | 'MAJOR' | 'VERY_MAJOR'>('MINOR')
    const [newCaseLawType, setNewCaseLawType] = useState<'I' | 'II' | 'III' | 'UNKNOWN'>('UNKNOWN')

    // External academic history import (SIEE)
    const [historyGrades, setHistoryGrades] = useState<Array<{ id: number; name: string }>>([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historyYear, setHistoryYear] = useState<string>('')
    const [historyGradeId, setHistoryGradeId] = useState<number | ''>('')
    const [historyOriginSchool, setHistoryOriginSchool] = useState<string>('')
    const [historySubjectsText, setHistorySubjectsText] = useState<string>('')
    const [historyResult, setHistoryResult] = useState<null | {
        enrollment_id: number
        decision: string
        failed_subjects_count: number
        failed_areas_count: number
    }>(null)
    const [historyConfirmOpen, setHistoryConfirmOpen] = useState(false)

    useEffect(() => {
        if (activeTab !== 'discipline') return
        if (!studentId) return

        let mounted = true

        const localNow = (() => {
            const d = new Date()
            const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
            return local.toISOString().slice(0, 16)
        })()

        if (!newCaseOccurredAt) setNewCaseOccurredAt(localNow)

        setDisciplineLoading(true)
        setDisciplineError(null)

        Promise.all([
            enrollmentsApi.list({ student: studentId, status: 'ACTIVE' }),
            disciplineApi.list({ student: studentId }),
        ])
            .then(([enRes, casesRes]) => {
                if (!mounted) return

                const results = enRes.data?.results || []
                setEnrollments(results)
                setDisciplineCases(casesRes.data || [])

                if (!selectedEnrollmentId && results.length > 0) {
                    setSelectedEnrollmentId(results[0].id)
                }
            })
            .catch((e: unknown) => {
                if (!mounted) return
                console.error(e)
                setDisciplineError(getErrorDetail(e) || 'No se pudo cargar convivencia')
            })
            .finally(() => {
                if (!mounted) return
                setDisciplineLoading(false)
            })

        return () => {
            mounted = false
        }
    }, [activeTab, newCaseOccurredAt, selectedEnrollmentId, studentId])

    const enrollmentYearLabel = (en: Enrollment): string => {
        if (typeof en.academic_year === 'object' && en.academic_year) return String(en.academic_year.year)
        return typeof en.academic_year === 'number' ? String(en.academic_year) : '-'
    }

    const enrollmentGradeLabel = (en: Enrollment): string => {
        if (typeof en.grade === 'object' && en.grade) return String(en.grade.name)
        return typeof en.grade === 'number' ? String(en.grade) : '-'
    }

    const enrollmentGroupLabel = (en: Enrollment): string => {
        if (!en.group) return '-'
        if (typeof en.group === 'object') return String(en.group.name)
        return String(en.group)
    }

    useEffect(() => {
        if (!studentId) return

        let mounted = true
        setCurrentEnrollmentLoading(true)

        enrollmentsApi
            .list({ student: studentId, status: 'ACTIVE', page_size: 50 })
            .then((res) => {
                if (!mounted) return
                const results = res.data?.results || []
                const sorted = results.slice().sort((a, b) => {
                    const ay = Number(enrollmentYearLabel(a))
                    const by = Number(enrollmentYearLabel(b))
                    if (Number.isFinite(ay) && Number.isFinite(by)) return by - ay
                    return enrollmentYearLabel(b).localeCompare(enrollmentYearLabel(a))
                })
                setCurrentEnrollment(sorted[0] || null)
            })
            .catch(() => {
                if (!mounted) return
                setCurrentEnrollment(null)
            })
            .finally(() => {
                if (!mounted) return
                setCurrentEnrollmentLoading(false)
            })

        return () => {
            mounted = false
        }
    }, [studentId])

    useEffect(() => {
        if (activeTab !== 'academic_history') return
        if (!studentId) return

        let mounted = true
        setAcademicHistoryLoading(true)
        setAcademicHistoryError(null)

        enrollmentsApi
            .list({ student: studentId, page_size: 200 })
            .then((res) => {
                if (!mounted) return
                const results = res.data?.results || []
                const sorted = results.slice().sort((a, b) => {
                    const ay = Number(enrollmentYearLabel(a))
                    const by = Number(enrollmentYearLabel(b))
                    if (Number.isFinite(ay) && Number.isFinite(by)) return by - ay
                    return enrollmentYearLabel(b).localeCompare(enrollmentYearLabel(a))
                })
                setAcademicHistory(sorted)
            })
            .catch((e: unknown) => {
                if (!mounted) return
                console.error(e)
                setAcademicHistory([])
                setAcademicHistoryError(getErrorDetail(e) || 'No se pudo cargar el historial académico')
            })
            .finally(() => {
                if (!mounted) return
                setAcademicHistoryLoading(false)
            })

        return () => {
            mounted = false
        }
    }, [activeTab, studentId])

    useEffect(() => {
        if (activeTab !== 'documents') return
        if (!studentId) return
        if (blockedHistoryImport) return

        let mounted = true
        academicApi
            .listGrades()
            .then((res) => {
                if (!mounted) return
                const list = (res.data || []).map((g) => ({ id: g.id, name: g.name }))
                setHistoryGrades(list)
            })
            .catch(() => {
                if (!mounted) return
                setHistoryGrades([])
            })

        return () => {
            mounted = false
        }
    }, [activeTab, blockedHistoryImport, studentId])

    const parseHistorySubjects = () => {
        const lines = historySubjectsText
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)

        const subjects: Array<{ area: string; subject: string; final_score: string }> = []
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            const parts = (line.includes(';') ? line.split(';') : line.split(','))
                .map((p) => p.trim())
                .filter((p) => p !== '')
            if (parts.length !== 3) {
                throw new Error(`Línea ${i + 1}: usa formato "Área, Materia, Nota"`)
            }
            const [area, subject, final_score] = parts
            if (!area || !subject || !final_score) {
                throw new Error(`Línea ${i + 1}: faltan campos (area, subject, final_score)`)
            }
            subjects.push({ area, subject, final_score })
        }

        if (subjects.length === 0) {
            throw new Error('Agrega al menos una materia')
        }

        return subjects
    }

    const openHistoryImportConfirm = () => {
        try {
            if (!studentId) throw new Error('Estudiante inválido')
            const year = Number(historyYear)
            if (!Number.isFinite(year) || year <= 0) throw new Error('academic_year inválido')
            if (historyGradeId === '') throw new Error('Selecciona un grado')
            parseHistorySubjects()
            setHistoryConfirmOpen(true)
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Datos inválidos'
            showToast(msg, 'error')
        }
    }

    const confirmHistoryImport = async () => {
        if (!studentId) return
        setHistoryLoading(true)
        setHistoryResult(null)
        try {
            const year = Number(historyYear)
            const subjects = parseHistorySubjects()

            const res = await studentsApi.importAcademicHistory(studentId, {
                academic_year: year,
                grade: historyGradeId as number,
                origin_school: historyOriginSchool.trim() || undefined,
                subjects,
            })

            setHistoryResult({
                enrollment_id: res.data.enrollment_id,
                decision: res.data.decision,
                failed_subjects_count: res.data.failed_subjects_count,
                failed_areas_count: res.data.failed_areas_count,
            })
            showToast('Historial importado correctamente', 'success')
            setHistoryConfirmOpen(false)
        } catch (e: unknown) {
            console.error(e)
            showToast(getErrorDetail(e) || 'No se pudo importar el historial', 'error')
        } finally {
            setHistoryLoading(false)
        }
    }

  const [selectedDepartment, setSelectedDepartment] = useState('')
  const [selectedCity, setSelectedCity] = useState('')

  // Family Members State
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [showFamilyModal, setShowFamilyModal] = useState(false)
  const [editingMember, setEditingMember] = useState<FamilyMember | undefined>(undefined)

  const [formData, setFormData] = useState({
    // User info (flattened)
    username: '', // Read-only for display
    email: '',
    first_name: '',
    last_name: '',
    
    // Identification
    document_type: 'TI',
    document_number: '',
    place_of_issue: '',
    nationality: 'Colombiana',
    birth_date: '',
    sex: '',
    blood_type: '',
    
    // Residence & Contact
    address: '',
    neighborhood: '',
    phone: '',
    living_with: '',
    stratum: '',
    
    // Socioeconomic
    ethnicity: '',
    sisben_score: '',
    eps: '',
    is_victim_of_conflict: false,
    
    // Disability & Support
    has_disability: false,
    disability_description: '',
    disability_type: '',
        support_needs: '',
    })

    const [studentPhotoUrl, setStudentPhotoUrl] = useState<string | null>(null)
    const [studentPhotoFile, setStudentPhotoFile] = useState<File | null>(null)
    const [studentPhotoPreviewUrl, setStudentPhotoPreviewUrl] = useState<string | null>(null)

    useEffect(() => {
        return () => {
            if (studentPhotoPreviewUrl) URL.revokeObjectURL(studentPhotoPreviewUrl)
        }
    }, [studentPhotoPreviewUrl])

    useEffect(() => {
        let mounted = true

        if (!isTeacher || !user?.id) {
            setTeacherHasDirectedGroup(null)
            return
        }

        setTeacherHasDirectedGroup(null)

        ;(async () => {
            try {
                const yearsRes = await academicApi.listYears()
                const activeYear = yearsRes.data.find((y) => y.status === 'ACTIVE')
                const groupsRes = await academicApi.listGroups({
                    director: user.id,
                    ...(activeYear ? { academic_year: activeYear.id } : {}),
                })
                if (!mounted) return
                setTeacherHasDirectedGroup(groupsRes.data.length > 0)
            } catch {
                if (!mounted) return
                setTeacherHasDirectedGroup(false)
            }
        })()

        return () => {
            mounted = false
        }
    }, [isTeacher, user?.id])

  useEffect(() => {
        if (isTeacher && teacherHasDirectedGroup !== true) return

    if (isEditing && id) {
      setLoading(true)
      studentsApi.get(Number(id))
        .then(res => {
          const student = res.data
                  setStudentPhotoUrl(student.photo || null)
          
          // Parse place_of_issue if possible
          let dept = ''
          let city = ''
          if (student.place_of_issue) {
            const parts = student.place_of_issue.split(' - ')
            if (parts.length === 2) {
                city = parts[0]
                dept = parts[1]
            } else {
                // Try to find exact match in cities if format is different
                // Or just leave it as is in the state but dropdowns might be empty
                city = student.place_of_issue
            }
          }

          setSelectedDepartment(dept)
          setSelectedCity(city)
          
          setFamilyMembers(student.family_members || [])

          setFormData({
            username: student.user?.username || '',
            email: student.user?.email || '',
            first_name: student.user?.first_name || '',
            last_name: student.user?.last_name || '',
            
            document_type: student.document_type || 'TI',
            document_number: student.document_number || '',
            place_of_issue: student.place_of_issue || '',
            nationality: student.nationality || 'Colombiana',
            birth_date: student.birth_date || '',
            sex: student.sex || '',
            blood_type: student.blood_type || '',
            
            address: student.address || '',
            neighborhood: student.neighborhood || '',
            phone: student.phone || '',
            living_with: student.living_with || '',
            stratum: student.stratum || '',
            
            ethnicity: student.ethnicity || '',
            sisben_score: student.sisben_score || '',
            eps: student.eps || '',
            is_victim_of_conflict: student.is_victim_of_conflict || false,
            
            has_disability: student.has_disability || false,
            disability_description: student.disability_description || '',
            disability_type: student.disability_type || '',
            support_needs: student.support_needs || '',
          })
        })
        .catch((err) => {
          console.error(err)
                    const status = err?.response?.status
                    if (status === 404) setError('Estudiante no encontrado')
                    else if (status === 403) setError('No tienes permisos para ver este estudiante')
                    else setError('Error al cargar el estudiante')
        })
        .finally(() => setLoading(false))
    }
    }, [id, isEditing, isTeacher, teacherHasDirectedGroup])
    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null
        setStudentPhotoFile(file)

        if (studentPhotoPreviewUrl) URL.revokeObjectURL(studentPhotoPreviewUrl)
        setStudentPhotoPreviewUrl(file ? URL.createObjectURL(file) : null)
    }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target
    setFormData(prev => ({ ...prev, [name]: checked }))
  }

  const handleDepartmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const dept = e.target.value
    setSelectedDepartment(dept)
    setSelectedCity('') // Reset city when department changes
    // Update formData immediately or wait for submit? 
    // Better to update formData on submit or useEffect, but let's keep it simple
  }

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const city = e.target.value
    setSelectedCity(city)
  }

  const refreshFamilyMembers = async () => {
    if (!id) return
    try {
        const res = await studentsApi.get(Number(id))
        setFamilyMembers(res.data.family_members || [])
    } catch (error) {
        console.error(error)
    }
  }

  const handleDeleteFamilyMember = async (memberId: number) => {
    if (!confirm('¿Estás seguro de eliminar este familiar?')) return
    try {
        await familyMembersApi.delete(memberId)
        refreshFamilyMembers()
    } catch (error) {
        console.error(error)
        alert('Error al eliminar familiar')
    }
  }

  const handleSaveStep = async (nextTab?: string) => {
        if (isTeacher) {
            if (!isEditing) {
                setError('No tienes permisos para crear estudiantes')
                return
            }
            if (teacherHasDirectedGroup !== true) {
                setError('No tienes asignación como director de grupo')
                return
            }
        }

    setLoading(true)
    setError(null)

    try {
      // Construct place_of_issue
      let finalPlaceOfIssue = formData.place_of_issue
      if (selectedDepartment && selectedCity) {
        finalPlaceOfIssue = `${selectedCity} - ${selectedDepartment}`
      } else if (selectedCity) {
        finalPlaceOfIssue = selectedCity
      }

      const payload = {
        ...formData,
        place_of_issue: finalPlaceOfIssue,
        birth_date: formData.birth_date || null,
                ...(studentPhotoFile ? { photo: studentPhotoFile } : {}),
      }

      if (isEditing) {
                const res = await studentsApi.update(Number(id), payload)
                setStudentPhotoUrl(res.data.photo || studentPhotoUrl)
                setStudentPhotoFile(null)
                if (studentPhotoPreviewUrl) URL.revokeObjectURL(studentPhotoPreviewUrl)
                setStudentPhotoPreviewUrl(null)
        if (nextTab) setActiveTab(nextTab)
        else navigate('/students')
      } else {
                const res = await studentsApi.create(payload)
                setStudentPhotoUrl(res.data.photo || null)
                setStudentPhotoFile(null)
                if (studentPhotoPreviewUrl) URL.revokeObjectURL(studentPhotoPreviewUrl)
                setStudentPhotoPreviewUrl(null)
        const newId = res.data.user.id
        // Navigate to edit mode but keep state
        navigate(`/students/${newId}`, { replace: true })
        if (nextTab) setActiveTab(nextTab)
      }
        } catch (err: unknown) {
            console.error(err)
            const maybe = err as { response?: { data?: unknown } }
            const data = maybe.response?.data
            setError(getErrorDetail(err) || (data ? JSON.stringify(data) : 'Error al guardar el estudiante'))
    } finally {
      setLoading(false)
    }
  }

  const tabs = [
    { id: 'identification', label: 'Identificación', icon: User },
    { id: 'residence', label: 'Residencia', icon: Home },
    { id: 'socioeconomic', label: 'Socioeconómico', icon: Activity },
    { id: 'support', label: 'Apoyos', icon: Heart },
        { id: 'discipline', label: 'Convivencia', icon: FileText },
        { id: 'academic_history', label: 'Historial académico', icon: GraduationCap },
    { id: 'family', label: 'Familia', icon: Users },
    { id: 'documents', label: 'Documentos', icon: FileText },
  ]

    const visibleTabs = isTeacher && !(isEditing && teacherHasDirectedGroup === true)
        ? tabs.filter((t) => t.id !== 'family' && t.id !== 'documents')
        : tabs

    if (isTeacher) {
        if (teacherHasDirectedGroup === null) return <div className="p-6">Cargando…</div>

        if (teacherHasDirectedGroup === false) {
            return (
                <Card>
                    <CardHeader>
                        <CardTitle>Estudiantes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-slate-600">
                            No tienes asignación como director de grupo. Para ver estudiantes, primero debes estar asignado
                            como director de un grupo.
                        </p>
                        <div className="mt-4">
                            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
                        </div>
                    </CardContent>
                </Card>
            )
        }

        if (!isEditing) {
            return (
                <Card>
                    <CardHeader>
                        <CardTitle>Estudiantes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-slate-600">No tienes permisos para crear estudiantes.</p>
                        <div className="mt-4">
                            <Button variant="outline" onClick={() => navigate('/students')}>Volver</Button>
                        </div>
                    </CardContent>
                </Card>
            )
        }
    }

    if (loading && isEditing && !formData.first_name) return <div className="p-6 text-slate-600 dark:text-slate-300">Cargando...</div>

    if (error && isEditing && !loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Estudiantes</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-red-600">{error}</p>
                    <div className="mt-4">
                        <Button variant="outline" onClick={() => navigate('/students')}>Volver</Button>
                    </div>
                </CardContent>
            </Card>
        )
    }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/students')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
                <div className="flex flex-col">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                            {isEditing ? 'Editar Estudiante' : 'Nuevo Estudiante'}
                        </h2>
                        {isEditing && studentId && (
                <div className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                                        <span className="font-medium">Grado / Matrícula actual:</span>{' '}
                                        {currentEnrollmentLoading ? (
                                                'Cargando…'
                                        ) : currentEnrollment ? (
                                                `${enrollmentGradeLabel(currentEnrollment)} / ${enrollmentGroupLabel(currentEnrollment)} (${enrollmentYearLabel(currentEnrollment)})`
                                        ) : (
                                                'Sin matrícula activa'
                                        )}
                                </div>
                        )}
                </div>
      </div>

      <div className="flex space-x-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 p-1">
                {visibleTabs.map((tab) => {
            const Icon = tab.icon
            return (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 flex items-center justify-center gap-2
                    ${activeTab === tab.id 
            ? 'bg-white text-blue-700 shadow dark:bg-slate-900 dark:text-blue-300'
            : 'text-slate-600 hover:bg-white/12 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-slate-900/50 dark:hover:text-blue-300'
                    }`}
                >
                    <Icon className="h-4 w-4" />
                    <span className="hidden md:inline">{tab.label}</span>
                </button>
            )
        })}
      </div>

      <div className="space-y-6">
        {error && (
                    <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

                {!canEdit && (
                                        <div className="p-3 text-sm text-slate-600 bg-slate-50 rounded-md border border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800">
                        Vista de solo lectura. Como docente no puedes editar datos del estudiante.
                    </div>
                )}

        {/* IDENTIFICATION TAB */}
        <div className={activeTab === 'identification' ? 'block' : 'hidden'}>
            <Card>
            <CardHeader><CardTitle>Datos de Identificación</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isEditing && (
                    <div className="space-y-2">
                        <Label>Usuario (Sistema)</Label>
                        <Input name="username" value={formData.username || ''} readOnly disabled />
                    </div>
                )}
                <div className="space-y-2">
                    <Label>Email</Label>
                    <Input name="email" type="email" value={formData.email} onChange={handleChange} disabled={!canEdit} />
                </div>
                <div className="space-y-2">
                    <Label>Nombres</Label>
                    <Input name="first_name" value={formData.first_name} onChange={handleChange} required disabled={!canEdit} />
                </div>
                <div className="space-y-2">
                    <Label>Apellidos</Label>
                    <Input name="last_name" value={formData.last_name} onChange={handleChange} required disabled={!canEdit} />
                </div>

                <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="student_photo">Foto</Label>
                    <div className="flex items-center gap-4">
                        {(studentPhotoPreviewUrl || studentPhotoUrl) ? (
                            <img
                                src={studentPhotoPreviewUrl || studentPhotoUrl || ''}
                                alt="Foto del estudiante"
                                className="h-16 w-16 rounded-full object-cover border border-slate-200 dark:border-slate-800"
                            />
                        ) : (
                            <div className="h-16 w-16 rounded-full border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40" />
                        )}

                        <input
                            id="student_photo"
                            name="photo"
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoChange}
                            disabled={!canEdit}
                            className="block w-full text-sm text-slate-700 dark:text-slate-300 file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200 disabled:opacity-60 dark:file:bg-slate-800 dark:file:text-slate-200 dark:hover:file:bg-slate-700"
                        />
                    </div>
                </div>
                
                <div className="col-span-full border-t border-slate-200 dark:border-slate-800 my-2"></div>

                <div className="space-y-2">
                    <Label>Tipo Documento</Label>
                    <select name="document_type" value={formData.document_type} onChange={handleChange} disabled={!canEdit} className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/60">
                        <option value="TI">Tarjeta de Identidad</option>
                        <option value="CC">Cédula de Ciudadanía</option>
                        <option value="RC">Registro Civil</option>
                        <option value="CE">Cédula de Extranjería</option>
                        <option value="NES">NES</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <Label>Número Documento</Label>
                    <Input name="document_number" value={formData.document_number} onChange={handleChange} disabled={!canEdit} />
                </div>
                
                <div className="space-y-2">
                    <Label>Departamento de Expedición</Label>
                    <select 
                        value={selectedDepartment} 
                        onChange={handleDepartmentChange}
                        disabled={!canEdit}
                        className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/60"
                    >
                        <option value="">Seleccione Departamento...</option>
                        {colombiaData.map((dept) => (
                            <option key={dept.departamento} value={dept.departamento}>
                                {dept.departamento}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="space-y-2">
                    <Label>Ciudad de Expedición</Label>
                    <select 
                        value={selectedCity} 
                        onChange={handleCityChange}
                        disabled={!canEdit || !selectedDepartment}
                        className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/60"
                    >
                        <option value="">Seleccione Ciudad...</option>
                        {selectedDepartment && colombiaData.find(d => d.departamento === selectedDepartment)?.ciudades.map((city) => (
                            <option key={city} value={city}>
                                {city}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="space-y-2">
                    <Label>Nacionalidad</Label>
                    <Input name="nationality" value={formData.nationality} onChange={handleChange} disabled={!canEdit} />
                </div>
                <div className="space-y-2">
                    <Label>Fecha de Nacimiento</Label>
                    <Input type="date" name="birth_date" value={formData.birth_date} onChange={handleChange} disabled={!canEdit} />
                </div>
                <div className="space-y-2">
                    <Label>Sexo</Label>
                    <select name="sex" value={formData.sex} onChange={handleChange} disabled={!canEdit} className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/60">
                        <option value="">Seleccione...</option>
                        <option value="M">Masculino</option>
                        <option value="F">Femenino</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <Label>Tipo de Sangre</Label>
                    <select 
                        name="blood_type" 
                        value={formData.blood_type} 
                        onChange={handleChange} 
                        disabled={!canEdit}
                        className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/60"
                    >
                        <option value="">Seleccione...</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                    </select>
                </div>
            </CardContent>
            <div className="flex justify-end p-4 border-t bg-slate-50 rounded-b-lg dark:border-slate-800 dark:bg-slate-900/40">
                <Button onClick={() => handleSaveStep('residence')} disabled={loading || !canEdit}>
                    Guardar y Continuar
                </Button>
            </div>
            </Card>
        </div>

        {/* RESIDENCE TAB */}
        <div className={activeTab === 'residence' ? 'block' : 'hidden'}>
            <Card>
            <CardHeader><CardTitle>Residencia y Contacto</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Dirección de Residencia</Label>
                    <Input name="address" value={formData.address} onChange={handleChange} disabled={!canEdit} />
                </div>
                <div className="space-y-2">
                    <Label>Barrio / Vereda</Label>
                    <Input name="neighborhood" value={formData.neighborhood} onChange={handleChange} disabled={!canEdit} />
                </div>
                <div className="space-y-2">
                    <Label>Teléfono</Label>
                    <Input name="phone" value={formData.phone} onChange={handleChange} disabled={!canEdit} />
                </div>
                <div className="space-y-2">
                    <Label>Con quién vive</Label>
                    <select 
                        name="living_with" 
                        value={formData.living_with} 
                        onChange={handleChange} 
                        disabled={!canEdit}
                        className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/60"
                    >
                        <option value="">Seleccione...</option>
                        <option value="Madre">Madre</option>
                        <option value="Padre">Padre</option>
                        <option value="Ambos Padres">Ambos Padres</option>
                        <option value="Abuelos">Abuelos</option>
                        <option value="Tíos">Tíos</option>
                        <option value="Hermanos">Hermanos</option>
                        <option value="Tutor Legal">Tutor Legal</option>
                        <option value="Otro">Otro</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <Label>Estrato</Label>
                    <Input name="stratum" value={formData.stratum} onChange={handleChange} disabled={!canEdit} />
                </div>
            </CardContent>
            <div className="flex justify-between p-4 border-t bg-slate-50 rounded-b-lg dark:border-slate-800 dark:bg-slate-900/40">
                <Button variant="outline" onClick={() => setActiveTab('identification')}>Anterior</Button>
                <Button onClick={() => handleSaveStep('socioeconomic')} disabled={loading || !canEdit}>
                    Guardar y Continuar
                </Button>
            </div>
            </Card>
        </div>

        {/* SOCIOECONOMIC TAB */}
        <div className={activeTab === 'socioeconomic' ? 'block' : 'hidden'}>
            <Card>
            <CardHeader><CardTitle>Información Socioeconómica</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>SISBÉN (Puntaje/Nivel)</Label>
                    <Input name="sisben_score" value={formData.sisben_score} onChange={handleChange} disabled={!canEdit} />
                </div>
                <div className="space-y-2">
                    <Label>EPS</Label>
                    <Input 
                        name="eps" 
                        value={formData.eps} 
                        onChange={handleChange} 
                        list="eps-list" 
                        placeholder="Escriba o seleccione..."
                        disabled={!canEdit}
                    />
                    <datalist id="eps-list">
                        {epsList.map((eps) => (
                            <option key={eps} value={eps} />
                        ))}
                    </datalist>
                </div>
                <div className="space-y-2">
                    <Label>Etnia</Label>
                    <select 
                        name="ethnicity" 
                        value={formData.ethnicity} 
                        onChange={handleChange} 
                        disabled={!canEdit}
                        className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/60"
                    >
                        <option value="">Seleccione...</option>
                        {ethnicityList.map((eth) => (
                            <option key={eth} value={eth}>{eth}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-2 flex items-center pt-6">
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input type="checkbox" name="is_victim_of_conflict" checked={formData.is_victim_of_conflict} onChange={handleCheckboxChange} disabled={!canEdit} className="h-4 w-4 rounded border-slate-300 dark:border-slate-700" />
                        <span className="text-sm text-slate-700 dark:text-slate-300">¿Víctima del conflicto?</span>
                    </label>
                </div>
            </CardContent>
            <div className="flex justify-between p-4 border-t bg-slate-50 rounded-b-lg dark:border-slate-800 dark:bg-slate-900/40">
                <Button variant="outline" onClick={() => setActiveTab('residence')}>Anterior</Button>
                <Button onClick={() => handleSaveStep('support')} disabled={loading || !canEdit}>
                    Guardar y Continuar
                </Button>
            </div>
            </Card>
        </div>

        {/* SUPPORT TAB */}
        <div className={activeTab === 'support' ? 'block' : 'hidden'}>
            <Card>
            <CardHeader><CardTitle>Desarrollo Integral y Apoyos</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                    <input type="checkbox" name="has_disability" checked={formData.has_disability} onChange={handleCheckboxChange} disabled={!canEdit} className="h-4 w-4 rounded border-slate-300 dark:border-slate-700" />
                    <Label>¿Tiene alguna discapacidad o condición especial?</Label>
                </div>

                {formData.has_disability && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6 border-l-2 border-slate-200 dark:border-slate-800">
                        <div className="space-y-2">
                            <Label>Tipo de Discapacidad</Label>
                            <select name="disability_type" value={formData.disability_type} onChange={handleChange} disabled={!canEdit} className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/60">
                                <option value="">Seleccione...</option>
                                <option value="FISICA">Física</option>
                                <option value="INTELECTUAL">Intelectual</option>
                                <option value="SENSORIAL">Sensorial (Auditiva/Visual)</option>
                                <option value="MULTIPLE">Múltiple</option>
                                <option value="OTRA">Otra</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label>Descripción</Label>
                            <Input name="disability_description" value={formData.disability_description} onChange={handleChange} placeholder="Detalles de la condición..." disabled={!canEdit} />
                        </div>
                    </div>
                )}

                <div className="space-y-2">
                    <Label>Apoyos Requeridos</Label>
                    <textarea 
                        name="support_needs" 
                        value={formData.support_needs} 
                        onChange={handleChange} 
                        disabled={!canEdit}
                        className="flex min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/60"
                        placeholder="Trabajo en aula, casa, terapias, etc."
                    />
                </div>
            </CardContent>
            <div className="flex justify-between p-4 border-t bg-slate-50 rounded-b-lg dark:border-slate-800 dark:bg-slate-900/40">
                <Button variant="outline" onClick={() => setActiveTab('socioeconomic')}>Anterior</Button>
                <Button onClick={() => handleSaveStep('family')} disabled={loading || !canEdit}>
                    Guardar y Continuar
                </Button>
            </div>
            </Card>
        </div>

                {/* DISCIPLINE TAB */}
                <div className={activeTab === 'discipline' ? 'block' : 'hidden'}>
                    {!studentId ? (
                        <Card>
                            <CardContent className="py-8 text-center text-slate-500">
                                Guarde el estudiante primero para gestionar convivencia.
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between gap-4">
                                        <CardTitle>Convivencia (Observador)</CardTitle>
                                        <Link to="/discipline/cases" className="text-sm text-blue-600 hover:underline">
                                            Ver todos
                                        </Link>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-slate-600">
                                        Registro mínimo (MVP): hechos, descargos, decisión y cierre.
                                    </p>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Registrar caso</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {disciplineError && (
                                        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
                                            {disciplineError}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Matrícula (Año activo)</Label>
                                            <select
                                                value={selectedEnrollmentId ?? ''}
                                                onChange={(e) => setSelectedEnrollmentId(e.target.value ? Number(e.target.value) : null)}
                                                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                            >
                                                <option value="">Seleccione...</option>
                                                {enrollments.map((en) => (
                                                    <option key={en.id} value={en.id}>
                                                        #{en.id} • {typeof en.grade === 'object' ? en.grade.name : en.grade} / {typeof en.group === 'object' ? en.group?.name : en.group}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Fecha y hora</Label>
                                            <Input
                                                type="datetime-local"
                                                value={newCaseOccurredAt}
                                                onChange={(e) => setNewCaseOccurredAt(e.target.value)}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Manual (Severidad)</Label>
                                            <select
                                                value={newCaseManualSeverity}
                                                onChange={(e) => {
                                                    const v = e.target.value
                                                    if (v === 'MINOR' || v === 'MAJOR' || v === 'VERY_MAJOR') setNewCaseManualSeverity(v)
                                                }}
                                                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                            >
                                                <option value="MINOR">Leve</option>
                                                <option value="MAJOR">Grave</option>
                                                <option value="VERY_MAJOR">Muy Grave</option>
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Ley 1620 (Tipo)</Label>
                                            <select
                                                value={newCaseLawType}
                                                onChange={(e) => {
                                                    const v = e.target.value
                                                    if (v === 'I' || v === 'II' || v === 'III' || v === 'UNKNOWN') setNewCaseLawType(v)
                                                }}
                                                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                            >
                                                <option value="UNKNOWN">Sin clasificar</option>
                                                <option value="I">Tipo I</option>
                                                <option value="II">Tipo II</option>
                                                <option value="III">Tipo III</option>
                                            </select>
                                        </div>

                                        <div className="space-y-2 md:col-span-2">
                                            <Label>Lugar</Label>
                                            <Input value={newCaseLocation} onChange={(e) => setNewCaseLocation(e.target.value)} placeholder="Salón, patio, ruta, etc." />
                                        </div>

                                        <div className="space-y-2 md:col-span-2">
                                            <Label>Relato / Hechos</Label>
                                            <textarea
                                                value={newCaseNarrative}
                                                onChange={(e) => setNewCaseNarrative(e.target.value)}
                                                className="flex min-h-[120px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                                placeholder="Descripción objetiva de los hechos"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-end">
                                        <Button
                                            type="button"
                                            disabled={disciplineLoading}
                                            onClick={async () => {
                                                if (!studentId) return
                                                if (!selectedEnrollmentId) return alert('Seleccione una matrícula')
                                                if (!newCaseNarrative.trim()) return alert('Escriba el relato de los hechos')

                                                setDisciplineLoading(true)
                                                setDisciplineError(null)
                                                try {
                                                    const occurred_at = newCaseOccurredAt
                                                        ? new Date(newCaseOccurredAt).toISOString()
                                                        : new Date().toISOString()

                                                    await disciplineApi.create({
                                                        enrollment_id: selectedEnrollmentId,
                                                        occurred_at,
                                                        location: newCaseLocation || undefined,
                                                        narrative: newCaseNarrative,
                                                        manual_severity: newCaseManualSeverity,
                                                        law_1620_type: newCaseLawType,
                                                    })

                                                    setNewCaseNarrative('')
                                                    setNewCaseLocation('')
                                                    setNewCaseLawType('UNKNOWN')
                                                    setNewCaseManualSeverity('MINOR')
                                                    setNewCaseOccurredAt('')

                                                    const listRes = await disciplineApi.list({ student: studentId })
                                                    setDisciplineCases(listRes.data || [])
                                                } catch (e: unknown) {
                                                    console.error(e)
                                                    setDisciplineError(getErrorDetail(e) || 'No se pudo crear el caso')
                                                } finally {
                                                    setDisciplineLoading(false)
                                                }
                                            }}
                                        >
                                            {disciplineLoading ? 'Guardando…' : 'Crear caso'}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Casos del estudiante</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="text-xs text-slate-500 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200 dark:text-slate-300 dark:from-slate-900 dark:to-slate-800 dark:border-slate-800">
                                                <tr>
                                                    <th className="px-6 py-4 font-semibold">Fecha</th>
                                                    <th className="px-6 py-4 font-semibold">Grado/Grupo</th>
                                                    <th className="px-6 py-4 font-semibold">Ley 1620</th>
                                                    <th className="px-6 py-4 font-semibold">Estado</th>
                                                    <th className="px-6 py-4 font-semibold">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                {disciplineCases.map((c) => (
                                                    <tr key={c.id} className="bg-white hover:bg-slate-50/80 transition-colors dark:bg-slate-900/40 dark:hover:bg-slate-800/50">
                                                        <td className="px-6 py-4">{new Date(c.occurred_at).toLocaleString()}</td>
                                                        <td className="px-6 py-4">{(c.grade_name || '-') + ' / ' + (c.group_name || '-')}</td>
                                                        <td className="px-6 py-4">{c.law_1620_type}</td>

                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-slate-200 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                                                                    {disciplineStatusLabel(c.status)}
                                                                </span>
                                                                {c.sealed_at && (
                                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-slate-200 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                                                                        Sellado
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <Link to={`/discipline/cases/${c.id}`} className="text-blue-600 hover:underline dark:text-blue-300">
                                                                Ver
                                                            </Link>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {disciplineCases.length === 0 && (
                                                    <tr>
                                                        <td className="px-6 py-6 text-slate-500 dark:text-slate-400" colSpan={5}>
                                                            No hay casos.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>

        {/* ACADEMIC HISTORY TAB */}
        <div className={activeTab === 'academic_history' ? 'block' : 'hidden'}>
            {!studentId ? (
                <Card>
                    <CardContent className="py-8 text-center text-slate-500">
                        Guarde el estudiante primero para ver el historial académico.
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>Historial académico</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {academicHistoryError && (
                            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md dark:bg-red-950/30 dark:text-red-300">
                                {academicHistoryError}
                            </div>
                        )}

                        {academicHistoryLoading ? (
                            <div className="text-slate-600 dark:text-slate-300">Cargando…</div>
                        ) : academicHistory.length === 0 ? (
                            <div className="text-slate-600 dark:text-slate-300">No hay matrículas registradas para este estudiante.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-500 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200 dark:text-slate-300 dark:from-slate-900 dark:to-slate-800 dark:border-slate-800">
                                        <tr>
                                            <th className="px-6 py-4 font-semibold">Año</th>
                                            <th className="px-6 py-4 font-semibold">Grado</th>
                                            <th className="px-6 py-4 font-semibold">Grupo</th>
                                            <th className="px-6 py-4 font-semibold">Estado</th>
                                            <th className="px-6 py-4 font-semibold">Promoción</th>
                                            <th className="px-6 py-4 font-semibold">Procedencia</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {academicHistory.map((en) => (
                                            <tr key={en.id} className="bg-white hover:bg-slate-50/80 transition-colors dark:bg-slate-900/40 dark:hover:bg-slate-800/50">
                                                <td className="px-6 py-4">{enrollmentYearLabel(en)}</td>
                                                <td className="px-6 py-4">{enrollmentGradeLabel(en)}</td>
                                                <td className="px-6 py-4">{enrollmentGroupLabel(en)}</td>
                                                <td className="px-6 py-4">{en.status}</td>
                                                <td className="px-6 py-4">{en.final_status || '-'}</td>
                                                <td className="px-6 py-4">{en.origin_school || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>

        {/* FAMILY TAB */}
        <div className={activeTab === 'family' ? 'block' : 'hidden'}>
            <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Referencias Familiares</CardTitle>
                    {isEditing && canEdit && (
                        <Button size="sm" onClick={() => { setEditingMember(undefined); setShowFamilyModal(true); }} type="button">
                            <Plus className="h-4 w-4 mr-2" /> Agregar Familiar
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {!isEditing ? (
                    <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                        <p>Guarde el estudiante primero para agregar familiares.</p>
                    </div>
                ) : familyMembers.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                        <p>No hay familiares registrados.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200 dark:text-slate-300 dark:from-slate-900 dark:to-slate-800 dark:border-slate-800">
                                <tr>
                                    <th className="px-6 py-3 font-semibold">Nombre</th>
                                    <th className="px-6 py-3 font-semibold">Parentesco</th>
                                    <th className="px-6 py-3 font-semibold">Teléfono</th>
                                    <th className="px-6 py-3 font-semibold">Acudiente</th>
                                    {canEdit && <th className="px-6 py-3 font-semibold text-right">Acciones</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {familyMembers.map((member) => (
                                    <tr key={member.id} className="bg-white hover:bg-slate-50/80 transition-colors dark:bg-slate-900/40 dark:hover:bg-slate-800/50">
                                        <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-100">{member.full_name}</td>
                                        <td className="px-6 py-3">{member.relationship}</td>
                                        <td className="px-6 py-3">{member.phone}</td>
                                        <td className="px-6 py-3">
                                            {member.is_main_guardian && <span className="px-2 py-1 text-xs font-semibold text-emerald-700 bg-emerald-100 rounded-full border border-emerald-200 dark:text-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/40">Principal</span>}
                                        </td>
                                        {canEdit && (
                                          <td className="px-6 py-3 text-right">
                                              <div className="flex items-center justify-end gap-2">
                                                  <Button variant="ghost" size="sm" onClick={() => { setEditingMember(member); setShowFamilyModal(true); }} type="button" className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-300">
                                                      <Edit2 className="h-4 w-4" />
                                                  </Button>
                                                  <Button variant="ghost" size="sm" onClick={() => handleDeleteFamilyMember(member.id)} type="button" className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 dark:hover:text-red-300">
                                                      <Trash2 className="h-4 w-4" />
                                                  </Button>
                                              </div>
                                          </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
            <div className="flex justify-between p-4 border-t bg-slate-50 rounded-b-lg dark:border-slate-800 dark:bg-slate-900/40">
                <Button variant="outline" onClick={() => setActiveTab('support')}>Anterior</Button>
                <Button onClick={() => setActiveTab('documents')} disabled={loading}>
                    Siguiente
                </Button>
            </div>
            </Card>
        </div>

        {/* DOCUMENTS TAB */}
        <div className={activeTab === 'documents' ? 'block' : 'hidden'}>
            {isTeacher && !canEdit ? (
                <Card>
                    <CardContent className="py-8 text-center text-slate-500 dark:text-slate-400">
                        Como docente no puedes gestionar documentos del estudiante.
                    </CardContent>
                </Card>
            ) : !isEditing ? (
                <Card>
                    <CardContent className="py-8 text-center text-slate-500 dark:text-slate-400">
                        Guarde el estudiante primero para gestionar sus documentos.
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-6">
                    {!blockedHistoryImport && studentId && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Importar historial académico externo</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label>Año (academic_year)</Label>
                                        <Input
                                            type="number"
                                            placeholder="Ej: 2023"
                                            value={historyYear}
                                            onChange={(e) => setHistoryYear(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Grado</Label>
                                        <select
                                            value={historyGradeId}
                                            onChange={(e) => setHistoryGradeId(e.target.value ? Number(e.target.value) : '')}
                                            className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900/40"
                                        >
                                            <option value="">Seleccione…</option>
                                            {historyGrades.map((g) => (
                                                <option key={g.id} value={g.id}>
                                                    {g.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Institución de origen (opcional)</Label>
                                        <Input
                                            placeholder="Ej: Colegio Externo"
                                            value={historyOriginSchool}
                                            onChange={(e) => setHistoryOriginSchool(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Materias (una por línea)</Label>
                                    <textarea
                                        value={historySubjectsText}
                                        onChange={(e) => setHistorySubjectsText(e.target.value)}
                                        placeholder={
                                            'Formato: Área, Materia, Nota\n' +
                                            'Ej:\n' +
                                            'Matemáticas, Álgebra, 4.20\n' +
                                            'Ciencias, Biología, 2.50'
                                        }
                                        className="min-h-[120px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                                    />
                                    <div className="text-xs text-slate-500 dark:text-slate-400">Separador: coma (,) o punto y coma (;).</div>
                                </div>

                                <div className="flex gap-2">
                                    <Button onClick={openHistoryImportConfirm} disabled={historyLoading}>
                                        {historyLoading ? 'Importando…' : 'Importar historial'}
                                    </Button>
                                </div>

                                {historyResult ? (
                                    <div className="p-3 rounded-md bg-slate-50 border border-slate-200 text-sm text-slate-700 dark:bg-slate-900/40 dark:border-slate-800 dark:text-slate-200">
                                        <div><span className="font-medium">Matrícula:</span> {historyResult.enrollment_id}</div>
                                        <div><span className="font-medium">Decisión:</span> {historyResult.decision}</div>
                                        <div><span className="font-medium">Reprobadas:</span> {historyResult.failed_subjects_count} materia(s), {historyResult.failed_areas_count} área(s)</div>
                                    </div>
                                ) : null}
                            </CardContent>
                        </Card>
                    )}

                    <StudentDocuments studentId={Number(id)} />
                </div>
            )}
            <div className="flex justify-between p-4 mt-4">
                <Button variant="outline" onClick={() => setActiveTab(isTeacher ? 'support' : 'family')}>Anterior</Button>
                <Button onClick={() => navigate('/students')}>Finalizar</Button>
            </div>
        </div>

        <ConfirmationModal
            isOpen={historyConfirmOpen}
            onClose={() => {
                if (!historyLoading) setHistoryConfirmOpen(false)
            }}
            onConfirm={confirmHistoryImport}
            title="Importar historial académico"
            description="Esto creará (o reutilizará) una matrícula del año indicado y guardará un snapshot de promoción con los datos importados."
            confirmText="Confirmar"
            cancelText="Cancelar"
            loading={historyLoading}
        />

        <Toast
            message={toast.message}
            type={toast.type}
            isVisible={toast.isVisible}
            onClose={() => setToast((t) => ({ ...t, isVisible: false }))}
        />

                {showFamilyModal && id && canEdit && (
            <FamilyMemberForm 
                studentId={Number(id)} 
                member={editingMember} 
                onSave={() => { setShowFamilyModal(false); refreshFamilyMembers(); }} 
                onCancel={() => setShowFamilyModal(false)} 
            />
        )}
      </div>
    </div>
  )
}
