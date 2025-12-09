import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { academicApi } from '../services/academic'
import { coreApi, type Institution, type Campus } from '../services/core'
import { usersApi, type User } from '../services/users'
import type { AcademicYear, Grade, Period, Area, Subject, Group, EvaluationScale, AcademicLevel } from '../services/academic'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { ConfirmationModal } from '../components/ui/ConfirmationModal'
import { Toast, type ToastType } from '../components/ui/Toast'

export default function AcademicConfigPanel() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'general' | 'institution' | 'grades_levels' | 'study_plan' | 'organization' | 'evaluation'>('general')
  
  // Data states
  const [years, setYears] = useState<AcademicYear[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [levels, setLevels] = useState<AcademicLevel[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [scales, setScales] = useState<EvaluationScale[]>([])
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [users, setUsers] = useState<User[]>([])

  // Form states
  const [yearInput, setYearInput] = useState('')
  const [editingYearId, setEditingYearId] = useState<number | null>(null)
  const [periodInput, setPeriodInput] = useState({ name: '', start_date: '', end_date: '', academic_year: '' })
  const [editingPeriodId, setEditingPeriodId] = useState<number | null>(null)
  
  // Levels & Grades state
  const [levelInput, setLevelInput] = useState({ name: '', level_type: 'PRIMARY', min_age: 5, max_age: 100 })
  const [editingLevelId, setEditingLevelId] = useState<number | null>(null)
  const [gradeInput, setGradeInput] = useState('')
  const [gradeLevelInput, setGradeLevelInput] = useState('')
  const [editingGradeId, setEditingGradeId] = useState<number | null>(null)

  // Areas & Subjects state
  const [areaInput, setAreaInput] = useState({ name: '', description: '' })
  const [editingAreaId, setEditingAreaId] = useState<number | null>(null)
  const [createSubjectForArea, setCreateSubjectForArea] = useState(false)
  const [subjectInput, setSubjectInput] = useState({ name: '', area: '', grade: '', weight_percentage: 100, hours_per_week: 1 })
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null)
  const [selectedSubjectGrade, setSelectedSubjectGrade] = useState<number | null>(null)
  const [copyFromGradeId, setCopyFromGradeId] = useState<string>('')
  const [showCopyModal, setShowCopyModal] = useState(false)

  const [instInput, setInstInput] = useState({
    name: '',
    nit: '',
    dane_code: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    rector: '',
    secretary: ''
  })
  const [instLogo, setInstLogo] = useState<File | null>(null)
  const [campusInput, setCampusInput] = useState({ name: '', institution: '' })
  
  // Modal states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<number | null>(null)
  const [deleteType, setDeleteType] = useState<'year' | 'period' | 'campus' | 'level' | 'grade' | 'area' | 'subject' | null>(null)

  // Filter states
  const [selectedPeriodYear, setSelectedPeriodYear] = useState<number | null>(null)

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const getErrorMessage = (error: any, defaultMsg: string) => {
    if (error.response?.data) {
      const data = error.response.data
      if (typeof data === 'string') return data
      if (data.detail) return data.detail
      if (data.non_field_errors) return Array.isArray(data.non_field_errors) ? data.non_field_errors.join(', ') : data.non_field_errors
      
      // If it's an object with field errors
      const messages = Object.entries(data).map(([field, errors]) => {
        if (Array.isArray(errors)) {
          return `${field}: ${errors.join(', ')}`
        }
        return `${field}: ${errors}`
      })
      
      if (messages.length > 0) return messages.join('\n')
    }
    return defaultMsg
  }

  // Loading state
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [y, p, l, g, a, s, gr, sc, i, c, u] = await Promise.all([
        academicApi.listYears(),
        academicApi.listPeriods(),
        academicApi.listLevels(),
        academicApi.listGrades(),
        academicApi.listAreas(),
        academicApi.listSubjects(),
        academicApi.listGroups(),
        academicApi.listEvaluationScales(),
        coreApi.listInstitutions(),
        coreApi.listCampuses(),
        usersApi.getAll()
      ])
      setYears(y.data)
      setPeriods(p.data)
      setLevels(l.data)
      setGrades(g.data)
      setAreas(a.data)
      setSubjects(s.data)
      setGroups(gr.data)
      setScales(sc.data)
      setInstitutions(i.data)
      setCampuses(c.data)
      setUsers(u.data)
    } catch (error) {
      console.error("Failed to load data", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const onAddYear = async (e: FormEvent) => {
    e.preventDefault()
    const y = parseInt(yearInput, 10)
    if (!y) return
    try {
      if (editingYearId) {
        await academicApi.updateYear(editingYearId, y)
        setEditingYearId(null)
      } else {
        await academicApi.createYear(y)
      }
      setYearInput('')
      await load()
      showToast(editingYearId ? 'Año lectivo actualizado correctamente' : 'Año lectivo creado correctamente', 'success')
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al guardar el año lectivo'), 'error')
    }
  }

  const onEditYear = (year: AcademicYear) => {
    setYearInput(year.year.toString())
    setEditingYearId(year.id)
  }

  const onDeleteYear = (id: number) => {
    setItemToDelete(id)
    setDeleteType('year')
    setDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!itemToDelete || !deleteType) return
    try {
      if (deleteType === 'year') {
        await academicApi.deleteYear(itemToDelete)
        showToast('Año lectivo eliminado correctamente', 'success')
      } else if (deleteType === 'period') {
        await academicApi.deletePeriod(itemToDelete)
        showToast('Periodo eliminado correctamente', 'success')
      } else if (deleteType === 'campus') {
        await coreApi.deleteCampus(itemToDelete)
        showToast('Sede eliminada correctamente', 'success')
      } else if (deleteType === 'level') {
        await academicApi.deleteLevel(itemToDelete)
        showToast('Nivel eliminado correctamente', 'success')
      } else if (deleteType === 'grade') {
        await academicApi.deleteGrade(itemToDelete)
        showToast('Grado eliminado correctamente', 'success')
      } else if (deleteType === 'area') {
        await academicApi.deleteArea(itemToDelete)
        showToast('Área eliminada correctamente', 'success')
      } else if (deleteType === 'subject') {
        const subjectToDelete = subjects.find(s => s.id === itemToDelete)
        await academicApi.deleteSubject(itemToDelete)
        showToast('Asignatura eliminada correctamente', 'success')
        
        if (subjectToDelete) {
          const updatedCount = await recalculateWeights(subjectToDelete.grade, subjectToDelete.area)
          if (updatedCount > 0) {
            showToast(`Se recalcularon los pesos de ${updatedCount} asignaturas`, 'info')
          }
        }
      }
      await load()
      setDeleteModalOpen(false)
      setItemToDelete(null)
      setDeleteType(null)
    } catch (error: any) {
      console.error(error)
      let itemType = 'el elemento'
      if (deleteType === 'year') itemType = 'el año lectivo'
      else if (deleteType === 'period') itemType = 'el periodo'
      else if (deleteType === 'campus') itemType = 'la sede'
      else if (deleteType === 'level') itemType = 'el nivel'
      else if (deleteType === 'grade') itemType = 'el grado'
      else if (deleteType === 'area') itemType = 'el área'
      else if (deleteType === 'subject') itemType = 'la asignatura'
      
      showToast(getErrorMessage(error, `Error al eliminar ${itemType}`), 'error')
    }
  }

  const onCancelEditYear = () => {
    setYearInput('')
    setEditingYearId(null)
  }

  const onAddPeriod = async (e: FormEvent) => {
    e.preventDefault()
    if (!periodInput.name || !periodInput.start_date || !periodInput.end_date || !periodInput.academic_year) return
    try {
      const data = {
        name: periodInput.name,
        start_date: periodInput.start_date,
        end_date: periodInput.end_date,
        academic_year: parseInt(periodInput.academic_year),
        is_closed: false
      }

      if (editingPeriodId) {
        await academicApi.updatePeriod(editingPeriodId, data)
        setEditingPeriodId(null)
        showToast('Periodo actualizado correctamente', 'success')
      } else {
        await academicApi.createPeriod(data)
        showToast('Periodo creado correctamente', 'success')
      }
      
      setPeriodInput({ name: '', start_date: '', end_date: '', academic_year: '' })
      await load()
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al guardar el periodo'), 'error')
    }
  }

  const onEditPeriod = (period: Period) => {
    setPeriodInput({
      name: period.name,
      start_date: period.start_date,
      end_date: period.end_date,
      academic_year: period.academic_year.toString()
    })
    setEditingPeriodId(period.id)
  }

  const onDeletePeriod = (id: number) => {
    setItemToDelete(id)
    setDeleteType('period')
    setDeleteModalOpen(true)
  }

  const onDeleteCampus = (id: number) => {
    setItemToDelete(id)
    setDeleteType('campus')
    setDeleteModalOpen(true)
  }

  const onEditCampus = (id: number) => {
    navigate(`/campuses/${id}/edit`)
  }

  const onCancelEditPeriod = () => {
    setPeriodInput({ name: '', start_date: '', end_date: '', academic_year: '' })
    setEditingPeriodId(null)
  }

  const onAddLevel = async (e: FormEvent) => {
    e.preventDefault()
    if (!levelInput.name) return
    try {
      if (editingLevelId) {
        await academicApi.updateLevel(editingLevelId, levelInput)
        setEditingLevelId(null)
        showToast('Nivel actualizado correctamente', 'success')
      } else {
        await academicApi.createLevel(levelInput)
        showToast('Nivel creado correctamente', 'success')
      }
      setLevelInput({ name: '', level_type: 'PRIMARY', min_age: 5, max_age: 100 })
      await load()
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al guardar el nivel'), 'error')
    }
  }

  const onEditLevel = (level: AcademicLevel) => {
    setLevelInput({
      name: level.name,
      level_type: level.level_type,
      min_age: level.min_age,
      max_age: level.max_age
    })
    setEditingLevelId(level.id)
  }

  const onDeleteLevel = (id: number) => {
    setItemToDelete(id)
    setDeleteType('level')
    setDeleteModalOpen(true)
  }

  const onCancelEditLevel = () => {
    setLevelInput({ name: '', level_type: 'PRIMARY', min_age: 5, max_age: 100 })
    setEditingLevelId(null)
  }

  const onAddGrade = async (e: FormEvent) => {
    e.preventDefault()
    if (!gradeInput.trim()) return
    try {
      const data = { 
        name: gradeInput.trim(),
        level: gradeLevelInput ? parseInt(gradeLevelInput) : undefined
      }

      if (editingGradeId) {
        await academicApi.updateGrade(editingGradeId, data)
        setEditingGradeId(null)
        showToast('Grado actualizado correctamente', 'success')
      } else {
        await academicApi.createGrade(data)
        showToast('Grado creado correctamente', 'success')
      }
      
      setGradeInput('')
      setGradeLevelInput('')
      await load()
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al guardar el grado'), 'error')
    }
  }

  const onEditGrade = (grade: Grade) => {
    setGradeInput(grade.name)
    setGradeLevelInput(grade.level ? grade.level.toString() : '')
    setEditingGradeId(grade.id)
  }

  const onDeleteGrade = (id: number) => {
    setItemToDelete(id)
    setDeleteType('grade')
    setDeleteModalOpen(true)
  }

  const onCancelEditGrade = () => {
    setGradeInput('')
    setGradeLevelInput('')
    setEditingGradeId(null)
  }

  const onAddArea = async (e: FormEvent) => {
    e.preventDefault()
    if (!areaInput.name.trim()) return
    try {
      if (editingAreaId) {
        await academicApi.updateArea(editingAreaId, areaInput)
        setEditingAreaId(null)
        showToast('Área actualizada correctamente', 'success')
      } else {
        const res = await academicApi.createArea(areaInput)
        
        if (createSubjectForArea && selectedSubjectGrade) {
          await academicApi.createSubject({
            name: areaInput.name,
            area: res.data.id,
            grade: selectedSubjectGrade,
            weight_percentage: 100,
            hours_per_week: 1
          })
          showToast('Área y asignatura creadas correctamente', 'success')
        } else {
          showToast('Área creada correctamente', 'success')
        }
      }
      setAreaInput({ name: '', description: '' })
      setCreateSubjectForArea(false)
      await load()
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al guardar el área'), 'error')
    }
  }

  const onEditArea = (area: Area) => {
    setAreaInput({ name: area.name, description: area.description })
    setEditingAreaId(area.id)
  }

  const onDeleteArea = (id: number) => {
    setItemToDelete(id)
    setDeleteType('area')
    setDeleteModalOpen(true)
  }

  const onCancelEditArea = () => {
    setAreaInput({ name: '', description: '' })
    setEditingAreaId(null)
  }

  const recalculateWeights = async (gradeId: number, areaId: number) => {
    const sResponse = await academicApi.listSubjects()
    const allSubjects = sResponse.data
    const areaSubjects = allSubjects.filter(s => s.grade === gradeId && s.area === areaId)
    
    const totalHours = areaSubjects.reduce((acc, s) => acc + s.hours_per_week, 0)
    
    if (totalHours > 0) {
      let updatedCount = 0
      await Promise.all(areaSubjects.map(s => {
        const newWeight = Math.round((s.hours_per_week / totalHours) * 100)
        if (s.weight_percentage !== newWeight) {
          updatedCount++
          return academicApi.updateSubject(s.id, { 
            name: s.name,
            area: s.area,
            grade: s.grade,
            hours_per_week: s.hours_per_week,
            weight_percentage: newWeight 
          })
        }
        return Promise.resolve()
      }))
      return updatedCount
    }
    return 0
  }

  const onCopyStudyPlan = async () => {
    if (!selectedSubjectGrade || !copyFromGradeId) return
    
    const sourceGradeId = parseInt(copyFromGradeId)
    const targetGradeId = selectedSubjectGrade
    
    if (sourceGradeId === targetGradeId) {
      showToast('No puedes copiar el plan del mismo grado', 'error')
      return
    }

    try {
      // 1. Get subjects from source grade
      const sourceSubjects = subjects.filter(s => s.grade === sourceGradeId)
      
      if (sourceSubjects.length === 0) {
        showToast('El grado de origen no tiene asignaturas configuradas', 'error')
        return
      }

      // 2. Delete existing subjects in target grade (optional, but cleaner for "Copy Plan")
      const targetSubjects = subjects.filter(s => s.grade === targetGradeId)
      if (targetSubjects.length > 0) {
        await Promise.all(targetSubjects.map(s => academicApi.deleteSubject(s.id)))
      }

      // 3. Create new subjects
      let createdCount = 0
      await Promise.all(sourceSubjects.map(async (s) => {
        await academicApi.createSubject({
          name: s.name,
          area: s.area,
          grade: targetGradeId,
          weight_percentage: s.weight_percentage,
          hours_per_week: s.hours_per_week
        })
        createdCount++
      }))

      showToast(`Se copiaron ${createdCount} asignaturas correctamente`, 'success')
      setShowCopyModal(false)
      setCopyFromGradeId('')
      await load()
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al copiar el plan de estudios'), 'error')
    }
  }

  const onAddSubject = async (e: FormEvent) => {
    e.preventDefault()
    const gradeId = selectedSubjectGrade || (subjectInput.grade ? parseInt(subjectInput.grade) : null)
    
    if (!subjectInput.name || !subjectInput.area || !gradeId) {
      showToast('Por favor complete todos los campos requeridos', 'error')
      return
    }

    try {
      const areaId = parseInt(subjectInput.area)
      const data = {
        name: subjectInput.name,
        area: areaId,
        grade: gradeId,
        weight_percentage: 0, // Placeholder, will be recalculated
        hours_per_week: subjectInput.hours_per_week
      }

      // Capture old subject state for recalculation if moving areas
      const oldSubject = editingSubjectId ? subjects.find(s => s.id === editingSubjectId) : null

      if (editingSubjectId) {
        await academicApi.updateSubject(editingSubjectId, data)
        setEditingSubjectId(null)
        showToast('Asignatura actualizada correctamente', 'success')
      } else {
        await academicApi.createSubject(data)
        showToast('Asignatura creada correctamente', 'success')
      }
      
      setSubjectInput({ name: '', area: '', grade: '', weight_percentage: 100, hours_per_week: 1 })
      
      // Recalculate weights for the NEW area/grade
      const updatedNew = await recalculateWeights(gradeId, areaId)
      
      // If it was an edit and area/grade changed, recalculate for the OLD area/grade
      let updatedOld = 0
      if (oldSubject && (oldSubject.area !== areaId || oldSubject.grade !== gradeId)) {
        updatedOld = await recalculateWeights(oldSubject.grade, oldSubject.area)
      }

      if (updatedNew + updatedOld > 0) {
        showToast(`Se recalcularon los pesos de ${updatedNew + updatedOld} asignaturas`, 'info')
      }

      await load()
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al guardar la asignatura'), 'error')
    }
  }

  const onEditSubject = (subject: Subject) => {
    setSubjectInput({
      name: subject.name,
      area: subject.area.toString(),
      grade: subject.grade.toString(),
      weight_percentage: subject.weight_percentage,
      hours_per_week: subject.hours_per_week
    })
    setEditingSubjectId(subject.id)
    // Ensure the grade is selected so the form is visible
    if (!selectedSubjectGrade) {
      setSelectedSubjectGrade(subject.grade)
    }
  }

  const onDeleteSubject = (id: number) => {
    setItemToDelete(id)
    setDeleteType('subject')
    setDeleteModalOpen(true)
  }

  const onCancelEditSubject = () => {
    setSubjectInput({ name: '', area: '', grade: '', weight_percentage: 100, hours_per_week: 1 })
    setEditingSubjectId(null)
  }

  const onAddInstitution = async (e: FormEvent) => {
    e.preventDefault()
    if (!instInput.name) return
    try {
      const formData = new FormData()
      formData.append('name', instInput.name)
      formData.append('nit', instInput.nit)
      formData.append('dane_code', instInput.dane_code)
      formData.append('address', instInput.address)
      formData.append('phone', instInput.phone)
      formData.append('email', instInput.email)
      formData.append('website', instInput.website)
      if (instInput.rector) formData.append('rector', instInput.rector)
      if (instInput.secretary) formData.append('secretary', instInput.secretary)
      if (instLogo) formData.append('logo', instLogo)

      await coreApi.createInstitution(formData)
      setInstInput({
        name: '',
        nit: '',
        dane_code: '',
        address: '',
        phone: '',
        email: '',
        website: '',
        rector: '',
        secretary: ''
      })
      setInstLogo(null)
      await load()
      showToast('Institución creada correctamente', 'success')
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al crear la institución'), 'error')
    }
  }

  const onAddCampus = async (e: FormEvent) => {
    e.preventDefault()
    if (!campusInput.name) return
    
    const institutionId = institutions.length > 0 ? institutions[0].id : null
    if (!institutionId) {
      showToast('No hay una institución registrada', 'error')
      return
    }

    try {
      await coreApi.createCampus({ 
        name: campusInput.name, 
        institution: institutionId,
        dane_code: '', address: '', phone: '', is_main: false 
      })
      setCampusInput({ name: '', institution: '' })
      await load()
      showToast('Sede creada correctamente', 'success')
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al crear la sede'), 'error')
    }
  }

  if (loading) {
    return <div className="p-6 text-slate-500">Cargando configuración...</div>
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Configuración Académica</h2>
        <Button onClick={load} variant="outline" size="sm">Actualizar</Button>
      </div>

      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-fit overflow-x-auto">
        {(['general', 'institution', 'grades_levels', 'study_plan', 'organization', 'evaluation'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab 
                ? 'bg-white text-slate-900 shadow-sm' 
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {tab === 'general' && 'General'}
            {tab === 'institution' && 'Institucional'}
            {tab === 'grades_levels' && 'Grados y Niveles'}
            {tab === 'study_plan' && 'Plan de Estudios'}
            {tab === 'organization' && 'Organización'}
            {tab === 'evaluation' && 'Evaluación (SIEE)'}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Años Lectivos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={onAddYear} className="flex gap-2">
                <Input
                  placeholder="Ej: 2025"
                  value={yearInput}
                  onChange={(e) => setYearInput(e.target.value)}
                  type="number"
                />
                <Button type="submit">{editingYearId ? 'Actualizar' : 'Agregar'}</Button>
                {editingYearId && (
                  <Button type="button" variant="outline" onClick={onCancelEditYear}>Cancelar</Button>
                )}
              </form>
              <div className="space-y-2">
                {years.map((y) => (
                  <div key={y.id} className="p-2 bg-slate-50 rounded border flex justify-between items-center">
                    <span className="font-medium">{y.year}</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => onEditYear(y)}>Editar</Button>
                      <Button size="sm" variant="destructive" onClick={() => onDeleteYear(y.id)}>Eliminar</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Periodos Académicos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between bg-slate-50 p-2 rounded border mb-4">
                <span className="text-sm font-medium text-slate-600">Filtrar por Año Lectivo:</span>
                <select
                  className="p-1 border rounded text-sm min-w-[120px]"
                  value={selectedPeriodYear || ''}
                  onChange={(e) => setSelectedPeriodYear(e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">Año Actual</option>
                  {years.map(y => <option key={y.id} value={y.id}>{y.year}</option>)}
                </select>
              </div>

              <form onSubmit={onAddPeriod} className="space-y-2">
                <select
                  className="w-full p-2 border rounded text-sm"
                  value={periodInput.academic_year}
                  onChange={(e) => setPeriodInput({...periodInput, academic_year: e.target.value})}
                >
                  <option value="">Seleccionar Año Lectivo</option>
                  {years.map(y => <option key={y.id} value={y.id}>{y.year}</option>)}
                </select>
                <Input
                  placeholder="Nombre Periodo (Ej: Primer Periodo)"
                  value={periodInput.name}
                  onChange={(e) => setPeriodInput({...periodInput, name: e.target.value})}
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500">Inicio</label>
                    <Input
                      type="date"
                      value={periodInput.start_date}
                      onChange={(e) => setPeriodInput({...periodInput, start_date: e.target.value})}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-500">Fin</label>
                    <Input
                      type="date"
                      value={periodInput.end_date}
                      onChange={(e) => setPeriodInput({...periodInput, end_date: e.target.value})}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full">{editingPeriodId ? 'Actualizar Periodo' : 'Agregar Periodo'}</Button>
                {editingPeriodId && (
                  <Button type="button" variant="outline" className="w-full" onClick={onCancelEditPeriod}>Cancelar Edición</Button>
                )}
              </form>
              <div className="space-y-2">
                {(() => {
                  const currentYear = new Date().getFullYear()
                  const currentYearObj = years.find(y => y.year === currentYear)
                  const displayYearId = selectedPeriodYear || currentYearObj?.id
                  const filteredPeriods = periods.filter(p => displayYearId ? p.academic_year === displayYearId : false)

                  if (filteredPeriods.length === 0) return <p className="text-slate-500 text-sm">No hay periodos para el año seleccionado.</p>

                  return filteredPeriods.map((p) => (
                    <div key={p.id} className="p-2 bg-slate-50 rounded border flex justify-between items-center">
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-slate-500">
                          {p.start_date} - {p.end_date} 
                          <span className="ml-2 text-slate-400">
                            ({years.find(y => y.id === p.academic_year)?.year})
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => onEditPeriod(p)}>Editar</Button>
                        <Button size="sm" variant="destructive" onClick={() => onDeletePeriod(p.id)}>Eliminar</Button>
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'institution' && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Institución</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {institutions.length === 0 && (
              <form onSubmit={onAddInstitution} className="space-y-2">
                <Input
                  placeholder="Nombre Institución"
                  value={instInput.name}
                  onChange={(e) => setInstInput({...instInput, name: e.target.value})}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="NIT"
                    value={instInput.nit}
                    onChange={(e) => setInstInput({...instInput, nit: e.target.value})}
                  />
                  <Input
                    placeholder="Código DANE"
                    value={instInput.dane_code}
                    onChange={(e) => setInstInput({...instInput, dane_code: e.target.value})}
                  />
                </div>
                <Input
                  placeholder="Dirección"
                  value={instInput.address}
                  onChange={(e) => setInstInput({...instInput, address: e.target.value})}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Teléfono"
                    value={instInput.phone}
                    onChange={(e) => setInstInput({...instInput, phone: e.target.value})}
                  />
                  <Input
                    placeholder="Email"
                    value={instInput.email}
                    onChange={(e) => setInstInput({...instInput, email: e.target.value})}
                  />
                </div>
                <Input
                  placeholder="Sitio Web"
                  value={instInput.website}
                  onChange={(e) => setInstInput({...instInput, website: e.target.value})}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500">Rector</label>
                    <select
                      className="w-full p-2 border rounded text-sm"
                      value={instInput.rector}
                      onChange={(e) => setInstInput({...instInput, rector: e.target.value})}
                    >
                      <option value="">Seleccionar Rector</option>
                      {users.filter(u => ['ADMIN', 'TEACHER'].includes(u.role)).map(u => (
                        <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Secretario/a</label>
                    <select
                      className="w-full p-2 border rounded text-sm"
                      value={instInput.secretary}
                      onChange={(e) => setInstInput({...instInput, secretary: e.target.value})}
                    >
                      <option value="">Seleccionar Secretario/a</option>
                      {users.filter(u => u.role === 'SECRETARY').map(u => (
                        <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Escudo / Logo</label>
                  <Input 
                    type="file" 
                    accept="image/png, image/jpeg"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setInstLogo(e.target.files[0])
                      }
                    }}
                  />
                </div>
                <Button type="submit" className="w-full">Guardar Institución</Button>
              </form>
              )}
              <div className="space-y-2 mt-4">
                {institutions.map((i) => (
                  <div key={i.id} className="p-3 bg-slate-50 rounded border flex gap-4 items-center">
                    {i.logo && <img src={i.logo} alt="Logo" className="w-16 h-16 object-contain bg-white rounded border p-1" />}
                    <div>
                      <div className="font-bold">{i.name}</div>
                      <div className="text-xs text-slate-500">NIT: {i.nit} | DANE: {i.dane_code}</div>
                      <div className="text-xs text-slate-500">
                        Rector: {i.rector_name || 'No asignado'} | Secretario: {i.secretary_name || 'No asignado'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sedes (Campus)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={onAddCampus} className="space-y-2">
                <Input
                  placeholder="Nombre Sede"
                  value={campusInput.name}
                  onChange={(e) => setCampusInput({...campusInput, name: e.target.value})}
                />
                <Button type="submit" className="w-full">Agregar Sede</Button>
              </form>
              <div className="space-y-2">
                {campuses.map((c) => (
                  <div key={c.id} className="p-2 bg-slate-50 rounded border flex justify-between items-center">
                    <div>
                      <span className="font-medium">{c.name}</span>
                      {c.is_main && <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Principal</span>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => onEditCampus(c.id)}>Editar</Button>
                      <Button size="sm" variant="destructive" onClick={() => onDeleteCampus(c.id)}>Eliminar</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'grades_levels' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Niveles Académicos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={onAddLevel} className="space-y-2">
                  <Input
                    placeholder="Nombre Nivel (Ej: Básica Primaria)"
                    value={levelInput.name}
                    onChange={(e) => setLevelInput({...levelInput, name: e.target.value})}
                  />
                  <select
                    className="w-full p-2 border rounded text-sm"
                    value={levelInput.level_type}
                    onChange={(e) => setLevelInput({...levelInput, level_type: e.target.value})}
                  >
                    <option value="PRESCHOOL">Preescolar</option>
                    <option value="PRIMARY">Básica Primaria</option>
                    <option value="SECONDARY">Básica Secundaria</option>
                    <option value="MEDIA">Media Académica</option>
                  </select>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-slate-500">Edad Mín</label>
                      <Input
                        type="number"
                        value={levelInput.min_age}
                        onChange={(e) => setLevelInput({...levelInput, min_age: parseInt(e.target.value)})}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-slate-500">Edad Máx</label>
                      <Input
                        type="number"
                        value={levelInput.max_age}
                        onChange={(e) => setLevelInput({...levelInput, max_age: parseInt(e.target.value)})}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full">{editingLevelId ? 'Actualizar Nivel' : 'Agregar Nivel'}</Button>
                  {editingLevelId && (
                    <Button type="button" variant="outline" className="w-full" onClick={onCancelEditLevel}>Cancelar</Button>
                  )}
                </form>
                <div className="space-y-2">
                  {levels.map((l) => (
                    <div key={l.id} className="p-2 bg-slate-50 rounded border flex justify-between items-center">
                      <div>
                        <div className="font-medium">{l.name}</div>
                        <div className="text-xs text-slate-500">
                          {l.level_type} ({l.min_age}-{l.max_age} años)
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => onEditLevel(l)}>Editar</Button>
                        <Button size="sm" variant="destructive" onClick={() => onDeleteLevel(l.id)}>Eliminar</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Grados Escolares</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={onAddGrade} className="flex gap-2">
                  <Input
                    placeholder="Nombre Grado"
                    value={gradeInput}
                    onChange={(e) => setGradeInput(e.target.value)}
                    className="flex-1"
                  />
                  <select
                    className="w-32 p-2 border rounded text-sm"
                    value={gradeLevelInput}
                    onChange={(e) => setGradeLevelInput(e.target.value)}
                  >
                    <option value="">Nivel...</option>
                    {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <Button type="submit">{editingGradeId ? 'Actualizar' : 'Agregar'}</Button>
                  {editingGradeId && (
                    <Button type="button" variant="outline" onClick={onCancelEditGrade}>X</Button>
                  )}
                </form>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {[...levels]
                    .sort((a, b) => {
                      const order: Record<string, number> = { 'PRESCHOOL': 1, 'PRIMARY': 2, 'SECONDARY': 3, 'MEDIA': 4 }
                      return (order[a.level_type] || 99) - (order[b.level_type] || 99)
                    })
                    .map(level => {
                      const levelGrades = grades.filter(g => g.level === level.id)
                      if (levelGrades.length === 0) return null
                      return (
                        <div key={level.id}>
                          <div className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">{level.name}</div>
                          <div className="space-y-2 pl-2 border-l-2 border-slate-200">
                            {levelGrades.map((g) => (
                              <div key={g.id} className="p-2 bg-slate-50 rounded border flex justify-between items-center">
                                <div className="font-medium">{g.name}</div>
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" onClick={() => onEditGrade(g)}>Editar</Button>
                                  <Button size="sm" variant="destructive" onClick={() => onDeleteGrade(g.id)}>Eliminar</Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}

                  {grades.filter(g => !g.level).length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Sin Nivel Asignado</div>
                      <div className="space-y-2 pl-2 border-l-2 border-slate-200">
                        {grades.filter(g => !g.level).map((g) => (
                          <div key={g.id} className="p-2 bg-slate-50 rounded border flex justify-between items-center">
                            <div className="font-medium">{g.name}</div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => onEditGrade(g)}>Editar</Button>
                              <Button size="sm" variant="destructive" onClick={() => onDeleteGrade(g.id)}>Eliminar</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'study_plan' && (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Seleccionar Grado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {levels.map(level => {
                    const levelGrades = grades.filter(g => g.level === level.id)
                    if (levelGrades.length === 0) return null
                    
                    return (
                      <div key={level.id} className="space-y-1">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">{level.name}</h4>
                        <div className="space-y-1">
                          {levelGrades.map(g => (
                            <button
                              key={g.id}
                              onClick={() => setSelectedSubjectGrade(g.id)}
                              className={`w-full text-left p-2 rounded border transition-colors text-sm ${
                                selectedSubjectGrade === g.id
                                  ? 'bg-blue-50 border-blue-500 text-blue-700 font-medium'
                                  : 'bg-white hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              {g.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  
                  {grades.filter(g => !g.level).length > 0 && (
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Sin Nivel</h4>
                      <div className="space-y-1">
                        {grades.filter(g => !g.level).map(g => (
                          <button
                            key={g.id}
                            onClick={() => setSelectedSubjectGrade(g.id)}
                            className={`w-full text-left p-2 rounded border transition-colors text-sm ${
                              selectedSubjectGrade === g.id
                                ? 'bg-blue-50 border-blue-500 text-blue-700 font-medium'
                                : 'bg-white hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            {g.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Áreas Disponibles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={onAddArea} className="space-y-2">
                  <Input
                    placeholder="Nueva Área (Ej: Matemáticas)"
                    value={areaInput.name}
                    onChange={(e) => setAreaInput({...areaInput, name: e.target.value})}
                  />
                  
                  {!editingAreaId && selectedSubjectGrade && (
                    <div className="flex items-center space-x-2 px-1">
                      <input 
                        type="checkbox" 
                        id="auto-subject"
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        checked={createSubjectForArea}
                        onChange={(e) => setCreateSubjectForArea(e.target.checked)}
                      />
                      <label htmlFor="auto-subject" className="text-xs text-slate-600 cursor-pointer select-none">
                        Crear también como asignatura
                      </label>
                    </div>
                  )}

                  <Button type="submit" className="w-full" size="sm">{editingAreaId ? 'Actualizar' : 'Crear Área'}</Button>
                  {editingAreaId && (
                    <Button type="button" variant="outline" className="w-full" size="sm" onClick={onCancelEditArea}>Cancelar</Button>
                  )}
                </form>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {areas.map((a) => (
                    <div key={a.id} className="p-2 text-sm bg-slate-50 rounded border flex justify-between items-center group">
                      <span>{a.name}</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onEditArea(a)}>✎</Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" onClick={() => onDeleteArea(a.id)}>×</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>
                  {selectedSubjectGrade 
                    ? `Plan de Estudios: ${grades.find(g => g.id === selectedSubjectGrade)?.name}`
                    : 'Selecciona un grado para configurar su plan de estudios'}
                </CardTitle>
                {selectedSubjectGrade && (
                  <Button variant="outline" size="sm" onClick={() => setShowCopyModal(true)}>
                    Importar Plan
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                {showCopyModal && (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-4">
                    <h4 className="font-bold text-blue-800 mb-2">Importar Plan de Estudios</h4>
                    <p className="text-sm text-blue-600 mb-3">
                      Esto <strong>reemplazará</strong> todas las asignaturas actuales de este grado con las del grado seleccionado.
                    </p>
                    <div className="flex gap-2">
                      <select
                        className="flex-1 p-2 border rounded text-sm"
                        value={copyFromGradeId}
                        onChange={(e) => setCopyFromGradeId(e.target.value)}
                      >
                        <option value="">Seleccionar Grado de Origen...</option>
                        {grades
                          .filter(g => g.id !== selectedSubjectGrade)
                          .map(g => <option key={g.id} value={g.id}>{g.name}</option>)
                        }
                      </select>
                      <Button onClick={onCopyStudyPlan} disabled={!copyFromGradeId}>Copiar</Button>
                      <Button variant="ghost" onClick={() => setShowCopyModal(false)}>Cancelar</Button>
                    </div>
                  </div>
                )}

                {!selectedSubjectGrade ? (
                  <div className="text-center py-12 text-slate-400">
                    <p>Selecciona un grado de la lista izquierda para ver y editar sus asignaturas.</p>
                  </div>
                ) : (
                  <>
                    {/* Intensity Validator */}
                    {(() => {
                      const currentGrade = grades.find(g => g.id === selectedSubjectGrade)
                      const currentLevel = currentGrade ? levels.find(l => l.id === currentGrade.level) : null
                      const gradeSubjects = subjects.filter(s => s.grade === selectedSubjectGrade)
                      const totalHours = gradeSubjects.reduce((acc, s) => acc + s.hours_per_week, 0)
                      
                      let minHours = 0
                      let levelLabel = ''
                      
                      if (currentLevel) {
                        if (currentLevel.level_type === 'PRIMARY') {
                          minHours = 25
                          levelLabel = 'Básica Primaria'
                        } else if (currentLevel.level_type === 'SECONDARY') {
                          minHours = 30
                          levelLabel = 'Básica Secundaria'
                        } else if (currentLevel.level_type === 'MEDIA') {
                          minHours = 30
                          levelLabel = 'Media Académica'
                        }
                      }

                      if (minHours > 0) {
                        const isCompliant = totalHours >= minHours
                        const percentage = Math.min((totalHours / minHours) * 100, 100)
                        
                        return (
                          <div className={`p-4 rounded-lg border ${isCompliant ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                            <div className="flex justify-between items-end mb-2">
                              <div>
                                <h4 className={`font-bold ${isCompliant ? 'text-green-800' : 'text-amber-800'}`}>
                                  Intensidad Horaria Semanal ({levelLabel})
                                </h4>
                                <p className="text-xs text-slate-600 mt-1">
                                  Norma Nacional: Mínimo <strong>{minHours} horas</strong>.
                                  {totalHours > minHours && <span className="ml-1 text-blue-600">(Jornada Única o Extendida)</span>}
                                </p>
                              </div>
                              <div className="text-right">
                                <div className="text-2xl font-bold text-slate-800">{totalHours} <span className="text-sm font-normal text-slate-500">/ {minHours} h</span></div>
                              </div>
                            </div>
                            <div className="w-full bg-white rounded-full h-2.5 border">
                              <div 
                                className={`h-2.5 rounded-full transition-all duration-500 ${isCompliant ? 'bg-green-500' : 'bg-amber-500'}`} 
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>
                            {!isCompliant && (
                              <div className="mt-2 text-xs text-amber-700 flex items-center gap-1">
                                ⚠️ Faltan {minHours - totalHours} horas para cumplir el mínimo legal.
                              </div>
                            )}
                          </div>
                        )
                      }
                      return null
                    })()}

                    <div className="bg-slate-50 p-4 rounded-lg border space-y-4">
                      <h3 className="font-medium text-slate-700 mb-2">Agregar Asignatura al Grado</h3>
                      <form onSubmit={onAddSubject} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                        <div className="md:col-span-4">
                          <label className="text-xs text-slate-500">Área</label>
                          <select
                            className="w-full p-2 border rounded text-sm"
                            value={subjectInput.area}
                            onChange={(e) => setSubjectInput({...subjectInput, area: e.target.value})}
                          >
                            <option value="">Seleccionar Área...</option>
                            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </div>
                        <div className="md:col-span-4">
                          <label className="text-xs text-slate-500">Nombre Asignatura</label>
                          <Input
                            placeholder="Ej: Aritmética"
                            value={subjectInput.name}
                            onChange={(e) => setSubjectInput({...subjectInput, name: e.target.value})}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="text-xs text-slate-500">Horas/Sem</label>
                          <Input
                            type="number"
                            value={subjectInput.hours_per_week}
                            onChange={(e) => setSubjectInput({...subjectInput, hours_per_week: parseInt(e.target.value)})}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Button type="submit" className="w-full">
                            {editingSubjectId ? 'Guardar' : 'Agregar'}
                          </Button>
                        </div>
                      </form>
                      {editingSubjectId && (
                        <div className="flex justify-end">
                          <Button variant="ghost" size="sm" onClick={onCancelEditSubject} className="text-red-500">Cancelar Edición</Button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      {areas.map(area => {
                        const areaSubjects = subjects.filter(s => s.grade === selectedSubjectGrade && s.area === area.id)
                        if (areaSubjects.length === 0) return null
                        
                        const totalHours = areaSubjects.reduce((acc, s) => acc + s.hours_per_week, 0)
                        
                        return (
                          <div key={area.id} className="border rounded-lg overflow-hidden">
                            <div className="bg-slate-100 p-3 flex justify-between items-center">
                              <div className="font-bold text-slate-700">{area.name}</div>
                              <div className="text-xs font-medium bg-white px-2 py-1 rounded border">
                                Total: {totalHours} horas/sem
                              </div>
                            </div>
                            <div className="divide-y">
                              {areaSubjects.map(s => {
                                const calculatedWeight = totalHours > 0 ? Math.round((s.hours_per_week / totalHours) * 100) : 0
                                return (
                                  <div key={s.id} className="p-3 flex justify-between items-center bg-white hover:bg-slate-50">
                                    <div>
                                      <div className="font-medium text-slate-800">{s.name}</div>
                                      <div className="text-xs text-slate-500">
                                        Intensidad: {s.hours_per_week}h • Peso Sugerido: {calculatedWeight}%
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <div className="text-right">
                                        <div className="text-xs text-slate-400">Peso Actual</div>
                                        <div className={`font-bold ${s.weight_percentage !== calculatedWeight ? 'text-amber-600' : 'text-green-600'}`}>
                                          {s.weight_percentage}%
                                        </div>
                                      </div>
                                      <div className="flex gap-1">
                                        <Button size="sm" variant="ghost" onClick={() => onEditSubject(s)}>✎</Button>
                                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => onDeleteSubject(s.id)}>×</Button>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                      
                      {subjects.filter(s => s.grade === selectedSubjectGrade).length === 0 && (
                        <div className="text-center py-8 text-slate-400 border-2 border-dashed rounded-lg">
                          No hay asignaturas configuradas para este grado.
                          <br/>Agrega una usando el formulario de arriba.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'organization' && (
        <div className="grid md:grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Grupos y Directores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {groups.map((g) => (
                  <div key={g.id} className="p-4 bg-white border rounded-lg shadow-sm">
                    <div className="text-lg font-bold text-slate-800">{g.grade_name} - {g.name}</div>
                    <div className="text-xs text-slate-500 mb-2">{g.campus_name || 'Sin Sede'}</div>
                    <div className="text-sm text-slate-500 mt-1">
                      Director: {g.director_name || 'Sin asignar'}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'evaluation' && (
        <div className="grid md:grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Escala de Valoración (SIEE)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {scales.length === 0 && <p className="text-slate-500 text-sm">No hay escala configurada.</p>}
                {scales.map((s) => (
                  <div key={s.id} className="p-3 bg-slate-50 rounded border flex justify-between items-center">
                    <span className="font-bold text-lg">{s.name}</span>
                    <span className="text-slate-600 bg-slate-200 px-3 py-1 rounded-full text-sm">
                      {s.min_score} - {s.max_score}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title={`Eliminar ${deleteType === 'year' ? 'Año Lectivo' : deleteType === 'period' ? 'Periodo' : 'Sede'}`}
        description={`¿Estás seguro de que deseas eliminar ${deleteType === 'year' ? 'este año lectivo' : deleteType === 'period' ? 'este periodo' : 'esta sede'}? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        variant="destructive"
      />

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast({ ...toast, isVisible: false })}
      />
    </div>
  )
}

