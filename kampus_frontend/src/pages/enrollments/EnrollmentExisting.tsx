import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { studentsApi, type Student } from '../../services/students'
import { academicApi, type AcademicYear, type Grade, type Group } from '../../services/academic'
import { enrollmentsApi } from '../../services/enrollments'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Label } from '../../components/ui/Label'
import { Search, UserCheck, AlertCircle } from 'lucide-react'

export default function EnrollmentExisting() {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  
  // Academic Data
  const [activeYear, setActiveYear] = useState<AcademicYear | null>(null)
  const [grades, setGrades] = useState<Grade[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  
  // Form Data
  const [selectedGrade, setSelectedGrade] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (selectedGrade && activeYear) {
      loadGroups(Number(selectedGrade))
    } else {
      setGroups([])
    }
  }, [selectedGrade, activeYear])

  const loadInitialData = async () => {
    try {
      const [yearsRes, gradesRes] = await Promise.all([
        academicApi.listYears(),
        academicApi.listGrades()
      ])
      
      const currentYear = yearsRes.data.find(y => y.status === 'ACTIVE')
      if (currentYear) {
        setActiveYear(currentYear)
      } else {
        setError('No hay un año académico activo configurado.')
      }
      
      setGrades(gradesRes.data)
    } catch (error) {
      console.error('Error loading initial data:', error)
      setError('Error cargando datos académicos.')
    }
  }

  const loadGroups = async (gradeId: number) => {
    if (!activeYear) return
    try {
      const response = await academicApi.listGroups({ 
        grade: gradeId,
        academic_year: activeYear.id 
      })
      setGroups(response.data)
    } catch (error) {
      console.error('Error loading groups:', error)
    }
  }

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!searchTerm.trim()) {
        setStudents([])
        return
    }

    setSearching(true)
    // Only clear selected student if explicitly searching new term? 
    // For now let's keep the behavior but maybe don't clear selectedStudent immediately if it's just typing?
    // The user might want to keep the current selection while looking for another.
    // But the UI hides the list if selectedStudent is present.
    // Let's clear selectedStudent if the user explicitly searches (hits enter or types enough)
    // actually, let's NOT clear it automatically on type, but let the user clear it or replace it.
    
    try {
      const response = await studentsApi.list({ search: searchTerm })
      setStudents(response.data)
    } catch (error) {
      console.error('Error searching students:', error)
    } finally {
      setSearching(false)
    }
  }

  // Predictive search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.trim().length >= 2) {
        handleSearch()
      } else {
        setStudents([])
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [searchTerm])

  const handleEnroll = async () => {
    if (!selectedStudent || !activeYear || !selectedGrade) return

    setLoading(true)
    setError('')

    try {
      await enrollmentsApi.create({
        student: selectedStudent.id,
        academic_year: activeYear.id,
        grade: Number(selectedGrade),
        group: selectedGroup ? Number(selectedGroup) : null,
        status: 'ACTIVE'
      })
      
      navigate('/enrollments')
    } catch (err: any) {
      console.error('Error enrolling student:', err)
      if (err.response?.data) {
        // Handle specific validation errors
        const errors = err.response.data
        if (errors.non_field_errors) {
          setError(errors.non_field_errors[0])
        } else if (errors.detail) {
          setError(errors.detail)
        } else {
          setError('Error al procesar la matrícula. Verifique los datos.')
        }
      } else {
        setError('Error de conexión al servidor.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (!activeYear && !error) {
    return <div className="p-8 text-center">Cargando configuración académica...</div>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Matricular Estudiante Antiguo</h2>
        <p className="text-slate-500">Busque un estudiante existente para matricularlo en el año {activeYear?.year}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Buscar Estudiante</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Nombre o número de documento..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={searching}>
              <Search className="mr-2 h-4 w-4" />
              {searching ? 'Buscando...' : 'Buscar'}
            </Button>
          </form>

          {students.length > 0 && (
            <div className="mt-6 border rounded-md divide-y">
              {students.map(student => (
                <div 
                  key={student.id} 
                  className="p-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer"
                  onClick={() => {
                    setSelectedStudent(student)
                    setStudents([])
                    setSearchTerm('')
                  }}
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {student.user.first_name} {student.user.last_name}
                    </p>
                    <p className="text-sm text-slate-500">
                      {student.document_type}: {student.document_number}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm">Seleccionar</Button>
                </div>
              ))}
            </div>
          )}

          {students.length === 0 && searchTerm && !searching && (
            <div className="mt-6 text-center text-slate-500">
              No se encontraron estudiantes con ese criterio.
            </div>
          )}
        </CardContent>
      </Card>

      {selectedStudent && (
        <Card className="border-blue-200 ring-1 ring-blue-100">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl">
                {selectedStudent.user.first_name[0]}
              </div>
              <div>
                <CardTitle>{selectedStudent.user.first_name} {selectedStudent.user.last_name}</CardTitle>
                <p className="text-sm text-slate-500">
                  {selectedStudent.document_type} {selectedStudent.document_number}
                </p>
              </div>
              <Button variant="ghost" className="ml-auto" onClick={() => setSelectedStudent(null)}>
                Cambiar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Grado a Matricular</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedGrade}
                  onChange={(e) => {
                    setSelectedGrade(e.target.value)
                    setSelectedGroup('')
                  }}
                >
                  <option value="">Seleccione un grado...</option>
                  {grades.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Grupo (Opcional)</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  disabled={!selectedGrade}
                >
                  <option value="">Seleccione un grupo...</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name} (Disponibles: {g.capacity - g.enrolled_count} de {g.capacity})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={handleEnroll} disabled={loading || !selectedGrade}>
                <UserCheck className="mr-2 h-4 w-4" />
                {loading ? 'Procesando...' : 'Confirmar Matrícula'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}