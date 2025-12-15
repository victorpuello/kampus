import { type FormEvent, useEffect, useState } from 'react'
import { academicApi } from '../services/academic'
import { coreApi, type Institution, type Campus } from '../services/core'
import { usersApi, type User } from '../services/users'
import type { AcademicYear, Grade, Period, Area, Subject, AcademicLoad, Group, EvaluationScale, AcademicLevel } from '../services/academic'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { ConfirmationModal } from '../components/ui/ConfirmationModal'
import { Toast, type ToastType } from '../components/ui/Toast'
import DimensionsConfig from './planning/DimensionsConfig'

export default function AcademicConfigPanel() {
  const [activeTab, setActiveTab] = useState<'general' | 'institution' | 'grades_levels' | 'areas_subjects' | 'study_plan' | 'organization' | 'evaluation'>('general')
  
  // Data states
  const [years, setYears] = useState<AcademicYear[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [levels, setLevels] = useState<AcademicLevel[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [academicLoads, setAcademicLoads] = useState<AcademicLoad[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [scales, setScales] = useState<EvaluationScale[]>([])
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [users, setUsers] = useState<User[]>([])

  // Form states
  const [yearInput, setYearInput] = useState({
    year: '',
    status: 'PLANNING',
    start_date: '',
    end_date: ''
  })
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
  const [subjectInput, setSubjectInput] = useState({ name: '', area: '' })
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null)
  
  // Academic Load state
  const [academicLoadInput, setAcademicLoadInput] = useState({ subject: '', grade: '', weight_percentage: 100, hours_per_week: 1 })
  const [editingAcademicLoadId, setEditingAcademicLoadId] = useState<number | null>(null)
  const [selectedSubjectGrade, setSelectedSubjectGrade] = useState<number | null>(null)
  const [copyFromGradeId, setCopyFromGradeId] = useState<string>('')
  const [showCopyModal, setShowCopyModal] = useState(false)

  // Groups state
  const [groupInput, setGroupInput] = useState({ 
    name: '', 
    grade: '', 
    campus: '', 
    director: '', 
    shift: 'MORNING', 
    classroom: '',
    academic_year: '' 
  })
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
  const [isMultigrade, setIsMultigrade] = useState(false)

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
  const [editingCampusId, setEditingCampusId] = useState<number | null>(null)
  
  // Scale state
  const [scaleInput, setScaleInput] = useState({
    name: '',
    min_score: '',
    max_score: '',
    scale_type: 'NUMERIC' as 'NUMERIC' | 'QUALITATIVE',
    description: '',
    academic_year: ''
  })
  const [editingScaleId, setEditingScaleId] = useState<number | null>(null)
  const [showCopyScalesModal, setShowCopyScalesModal] = useState(false)
  const [copyScalesData, setCopyScalesData] = useState({ sourceYear: '', targetYear: '' })
  
  // Modal states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<number | null>(null)
  const [deleteType, setDeleteType] = useState<'year' | 'period' | 'campus' | 'level' | 'grade' | 'area' | 'subject' | 'group' | null>(null)

  // Filter states
  const [selectedPeriodYear, setSelectedPeriodYear] = useState<number | null>(null)
  const [selectedScaleYear, setSelectedScaleYear] = useState<number | null>(null)
  const [hasInitializedFilters, setHasInitializedFilters] = useState(false)

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
      const [y, p, l, g, a, s, al, gr, sc, i, c, u] = await Promise.all([
        academicApi.listYears(),
        academicApi.listPeriods(),
        academicApi.listLevels(),
        academicApi.listGrades(),
        academicApi.listAreas(),
        academicApi.listSubjects(),
        academicApi.listAcademicLoads(),
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
      setAcademicLoads(al.data)
      setGroups(gr.data)
      setScales(sc.data)
      setInstitutions(i.data)
      setCampuses(c.data)
      setUsers(u.data)

      if (!hasInitializedFilters) {
        const currentYear = new Date().getFullYear()
        const currentAcademicYear = y.data.find(year => year.year === currentYear)
        if (currentAcademicYear) {
          setSelectedScaleYear(currentAcademicYear.id)
        }
        setHasInitializedFilters(true)
      }
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
    const y = parseInt(yearInput.year, 10)
    if (!y) return
    
    const data = {
      year: y,
      status: yearInput.status as any,
      start_date: yearInput.start_date || null,
      end_date: yearInput.end_date || null
    }

    try {
      if (editingYearId) {
        await academicApi.updateYear(editingYearId, data)
        setEditingYearId(null)
      } else {
        await academicApi.createYear(data)
      }
      setYearInput({ year: '', status: 'PLANNING', start_date: '', end_date: '' })
      await load()
      showToast(editingYearId ? 'Año lectivo actualizado correctamente' : 'Año lectivo creado correctamente', 'success')
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al guardar el año lectivo'), 'error')
    }
  }

  const onEditYear = (year: AcademicYear) => {
    setYearInput({
      year: year.year.toString(),
      status: year.status,
      start_date: year.start_date || '',
      end_date: year.end_date || ''
    })
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
      } else if (deleteType === 'group') {
        await academicApi.deleteGroup(itemToDelete)
        showToast('Grupo eliminado correctamente', 'success')
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
      else if (deleteType === 'group') itemType = 'el grupo'
      
      showToast(getErrorMessage(error, `Error al eliminar ${itemType}`), 'error')
    }
  }

  const onCancelEditYear = () => {
    setYearInput({ year: '', status: 'PLANNING', start_date: '', end_date: '' })
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
    const alResponse = await academicApi.listAcademicLoads()
    const allLoads = alResponse.data
    
    // Filter loads for this grade where the subject belongs to the given area
    const areaSubjectsIds = subjects.filter(s => s.area === areaId).map(s => s.id)
    const areaLoads = allLoads.filter(l => l.grade === gradeId && areaSubjectsIds.includes(l.subject))
    
    const totalHours = areaLoads.reduce((acc, l) => acc + l.hours_per_week, 0)
    
    if (totalHours > 0) {
      // Calculate initial weights
      let weights = areaLoads.map(l => ({
        ...l,
        newWeight: Math.round((l.hours_per_week / totalHours) * 100)
      }))
      
      // Adjust to ensure sum is 100
      const currentSum = weights.reduce((acc, w) => acc + w.newWeight, 0)
      const diff = 100 - currentSum
      
      if (diff !== 0) {
        // Add difference to the item with the most hours (or the first one if equal)
        // Sort by hours descending to find the best candidate to absorb the difference
        weights.sort((a, b) => b.hours_per_week - a.hours_per_week)
        weights[0].newWeight += diff
      }

      let updatedCount = 0
      await Promise.all(weights.map(l => {
        if (l.weight_percentage !== l.newWeight) {
          updatedCount++
          return academicApi.updateAcademicLoad(l.id, { 
            subject: l.subject,
            grade: l.grade,
            weight_percentage: l.newWeight,
            hours_per_week: l.hours_per_week
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
      // 1. Get academic loads from source grade
      const sourceLoads = academicLoads.filter(l => l.grade === sourceGradeId)
      
      if (sourceLoads.length === 0) {
        showToast('El grado de origen no tiene asignaturas configuradas', 'error')
        return
      }

      // 2. Delete existing loads in target grade
      const targetLoads = academicLoads.filter(l => l.grade === targetGradeId)
      if (targetLoads.length > 0) {
        await Promise.all(targetLoads.map(l => academicApi.deleteAcademicLoad(l.id)))
      }

      // 3. Create new loads
      let createdCount = 0
      await Promise.all(sourceLoads.map(async (l) => {
        await academicApi.createAcademicLoad({
          subject: l.subject,
          grade: targetGradeId,
          weight_percentage: l.weight_percentage,
          hours_per_week: l.hours_per_week
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

  const onAddAcademicLoad = async (e: FormEvent) => {
    e.preventDefault()
    const gradeId = selectedSubjectGrade || (academicLoadInput.grade ? parseInt(academicLoadInput.grade) : null)
    
    if (!academicLoadInput.subject || !gradeId) {
      showToast('Por favor complete todos los campos requeridos', 'error')
      return
    }

    try {
      const subjectId = parseInt(academicLoadInput.subject)
      const subject = subjects.find(s => s.id === subjectId)
      if (!subject) throw new Error("Asignatura no encontrada")

      const data = {
        subject: subjectId,
        grade: gradeId,
        weight_percentage: 0, // Placeholder
        hours_per_week: academicLoadInput.hours_per_week
      }

      if (editingAcademicLoadId) {
        await academicApi.updateAcademicLoad(editingAcademicLoadId, data)
        setEditingAcademicLoadId(null)
        showToast('Carga académica actualizada correctamente', 'success')
      } else {
        await academicApi.createAcademicLoad(data)
        showToast('Carga académica creada correctamente', 'success')
      }
      
      setAcademicLoadInput({ subject: '', grade: '', weight_percentage: 100, hours_per_week: 1 })
      
      // Recalculate weights
      const updatedNew = await recalculateWeights(gradeId, subject.area)
      
      if (updatedNew > 0) {
        showToast(`Se recalcularon los pesos de ${updatedNew} asignaturas`, 'info')
      }

      await load()
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al guardar la carga académica'), 'error')
    }
  }

  const onEditAcademicLoad = (loadItem: AcademicLoad) => {
    setAcademicLoadInput({
      subject: loadItem.subject.toString(),
      grade: loadItem.grade.toString(),
      weight_percentage: loadItem.weight_percentage,
      hours_per_week: loadItem.hours_per_week
    })
    setEditingAcademicLoadId(loadItem.id)
  }

  const onDeleteAcademicLoad = (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar esta carga académica?')) return
    academicApi.deleteAcademicLoad(id).then(() => {
      showToast('Carga académica eliminada', 'success')
      load()
    }).catch(err => showToast('Error al eliminar', 'error'))
  }

  const onCancelEditAcademicLoad = () => {
    setAcademicLoadInput({ subject: '', grade: '', weight_percentage: 100, hours_per_week: 1 })
    setEditingAcademicLoadId(null)
  }

  const onAddSubject = async (e: FormEvent) => {
    e.preventDefault()
    
    if (!subjectInput.name || !subjectInput.area) {
      showToast('Por favor complete todos los campos requeridos', 'error')
      return
    }

    try {
      const areaId = parseInt(subjectInput.area)
      const data = {
        name: subjectInput.name,
        area: areaId,
      }

      if (editingSubjectId) {
        await academicApi.updateSubject(editingSubjectId, data)
        setEditingSubjectId(null)
        showToast('Asignatura actualizada correctamente', 'success')
      } else {
        const res = await academicApi.createSubject(data)
        showToast('Asignatura creada correctamente', 'success')
        
        if (createSubjectForArea && selectedSubjectGrade) {
             await academicApi.createAcademicLoad({
                subject: res.data.id,
                grade: selectedSubjectGrade,
                weight_percentage: 100,
                hours_per_week: 1
             })
             showToast('Asignatura asignada al grado seleccionado', 'success')
        }
      }
      
      setSubjectInput({ name: '', area: '' })
      setCreateSubjectForArea(false)
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
    })
    setEditingSubjectId(subject.id)
  }

  const onDeleteSubject = (id: number) => {
    setItemToDelete(id)
    setDeleteType('subject')
    setDeleteModalOpen(true)
  }

  const onCancelEditSubject = () => {
    setSubjectInput({ name: '', area: '' })
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
      if (editingCampusId) {
        await coreApi.updateCampus(editingCampusId, {
          name: campusInput.name,
          institution: institutionId
        })
        setEditingCampusId(null)
        showToast('Sede actualizada correctamente', 'success')
      } else {
        await coreApi.createCampus({ 
          name: campusInput.name, 
          institution: institutionId,
          dane_code: '', address: '', phone: '', is_main: false 
        })
        showToast('Sede creada correctamente', 'success')
      }
      setCampusInput({ name: '', institution: '' })
      await load()
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al guardar la sede'), 'error')
    }
  }

  const onEditCampus = (id: number) => {
    const campus = campuses.find(c => c.id === id)
    if (campus) {
      setCampusInput({ name: campus.name, institution: campus.institution.toString() })
      setEditingCampusId(id)
    }
  }

  const onCancelEditCampus = () => {
    setCampusInput({ name: '', institution: '' })
    setEditingCampusId(null)
  }

  const onAddGroup = async (e: FormEvent) => {
    e.preventDefault()
    if (!groupInput.name || !groupInput.grade || !groupInput.academic_year || !groupInput.campus) {
      showToast('Por favor complete los campos obligatorios', 'error')
      return
    }

    // Director validation
    if (groupInput.director && !isMultigrade) {
      const directorId = parseInt(groupInput.director)
      const yearId = parseInt(groupInput.academic_year)
      const existingGroup = groups.find(g => 
        g.director === directorId && 
        g.academic_year === yearId && 
        g.id !== editingGroupId
      )
      
      if (existingGroup) {
        showToast(`El docente ya es director del grupo ${existingGroup.name}. Marque "Grupo Multigrado" si desea permitirlo.`, 'error')
        return
      }
    }

    try {
      const data = {
        name: groupInput.name,
        grade: parseInt(groupInput.grade),
        campus: parseInt(groupInput.campus),
        academic_year: parseInt(groupInput.academic_year),
        director: groupInput.director ? parseInt(groupInput.director) : null,
        shift: groupInput.shift,
        classroom: groupInput.classroom
      }

      if (editingGroupId) {
        await academicApi.updateGroup(editingGroupId, data)
        setEditingGroupId(null)
        showToast('Grupo actualizado correctamente', 'success')
      } else {
        await academicApi.createGroup(data)
        showToast('Grupo creado correctamente', 'success')
      }
      
      setGroupInput({ 
        name: '', 
        grade: '', 
        campus: '', 
        director: '', 
        shift: 'MORNING', 
        classroom: '',
        academic_year: groupInput.academic_year // Keep year selected
      })
      setIsMultigrade(false)
      await load()
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al guardar el grupo'), 'error')
    }
  }

  const onEditGroup = (group: Group) => {
    setGroupInput({
      name: group.name,
      grade: group.grade.toString(),
      campus: group.campus ? group.campus.toString() : '',
      director: group.director ? group.director.toString() : '',
      shift: group.shift || 'MORNING',
      classroom: group.classroom || '',
      academic_year: group.academic_year.toString()
    })
    setEditingGroupId(group.id)
    setIsMultigrade(false) // Reset, user can check if needed
  }

  const onDeleteGroup = (id: number) => {
    setItemToDelete(id)
    setDeleteType('group')
    setDeleteModalOpen(true)
  }

  const onCancelEditGroup = () => {
    setGroupInput({ 
      name: '', 
      grade: '', 
      campus: '', 
      director: '', 
      shift: 'MORNING', 
      classroom: '',
      academic_year: groupInput.academic_year 
    })
    setEditingGroupId(null)
    setIsMultigrade(false)
  }

  const onAddScale = async (e: FormEvent) => {
    e.preventDefault()
    if (!scaleInput.name || !scaleInput.academic_year) {
      showToast('Por favor complete los campos obligatorios', 'error')
      return
    }

    if (scaleInput.scale_type === 'NUMERIC' && (!scaleInput.min_score || !scaleInput.max_score)) {
      showToast('Para escala numérica, debe definir puntaje mínimo y máximo', 'error')
      return
    }

    try {
      const data = {
        name: scaleInput.name,
        min_score: scaleInput.scale_type === 'NUMERIC' ? parseFloat(scaleInput.min_score) : null,
        max_score: scaleInput.scale_type === 'NUMERIC' ? parseFloat(scaleInput.max_score) : null,
        academic_year: parseInt(scaleInput.academic_year),
        scale_type: scaleInput.scale_type,
        description: scaleInput.description
      }

      if (editingScaleId) {
        await academicApi.updateEvaluationScale(editingScaleId, data)
        setEditingScaleId(null)
        showToast('Escala actualizada correctamente', 'success')
      } else {
        await academicApi.createEvaluationScale(data)
        showToast('Escala creada correctamente', 'success')
      }
      
      setScaleInput({
        name: '',
        min_score: '',
        max_score: '',
        scale_type: 'NUMERIC',
        description: '',
        academic_year: scaleInput.academic_year
      })
      await load()
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al guardar la escala'), 'error')
    }
  }

  const onEditScale = (scale: EvaluationScale) => {
    setScaleInput({
      name: scale.name,
      min_score: scale.min_score ? scale.min_score.toString() : '',
      max_score: scale.max_score ? scale.max_score.toString() : '',
      scale_type: scale.scale_type || 'NUMERIC',
      description: scale.description || '',
      academic_year: scale.academic_year.toString()
    })
    setEditingScaleId(scale.id)
  }

  const onDeleteScale = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar esta escala?')) return
    try {
      await academicApi.deleteEvaluationScale(id)
      showToast('Escala eliminada correctamente', 'success')
      await load()
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al eliminar la escala'), 'error')
    }
  }

  const onCancelEditScale = () => {
    setScaleInput({
      name: '',
      min_score: '',
      max_score: '',
      scale_type: 'NUMERIC',
      description: '',
      academic_year: scaleInput.academic_year
    })
    setEditingScaleId(null)
  }

  const handleCopyScales = async () => {
    if (!copyScalesData.sourceYear || !copyScalesData.targetYear) {
      showToast('Seleccione el año origen y destino', 'error')
      return
    }
    
    if (copyScalesData.sourceYear === copyScalesData.targetYear) {
      showToast('El año origen y destino deben ser diferentes', 'error')
      return
    }

    try {
      await academicApi.copyEvaluationScales(
        parseInt(copyScalesData.sourceYear), 
        parseInt(copyScalesData.targetYear)
      )
      showToast('Escalas copiadas correctamente', 'success')
      setShowCopyScalesModal(false)
      await load()
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al copiar las escalas'), 'error')
    }
  }

  if (loading) {
    return <div className="p-6 text-slate-500">Cargando configuración...</div>
  }

  return (
    <div className="p-6 space-y-6 bg-slate-50/30 min-h-screen">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Configuración Académica</h2>
            <p className="text-sm text-slate-500">Gestiona años, grados, asignaturas y grupos</p>
          </div>
        </div>
        <Button onClick={load} variant="outline" size="sm" className="hover:bg-blue-50 hover:text-blue-600 border-slate-200">
          🔄 Actualizar
        </Button>
      </div>

      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-fit overflow-x-auto border border-slate-200">
        {(['general', 'institution', 'grades_levels', 'areas_subjects', 'study_plan', 'organization', 'evaluation'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab 
                ? 'bg-white text-blue-700 shadow-sm ring-1 ring-black/5' 
                : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'
            }`}
          >
            {tab === 'general' && 'General'}
            {tab === 'institution' && 'Institucional'}
            {tab === 'grades_levels' && 'Grados y Niveles'}
            {tab === 'areas_subjects' && 'Áreas y Asignaturas'}
            {tab === 'study_plan' && 'Plan de Estudios'}
            {tab === 'organization' && 'Organización'}
            {tab === 'evaluation' && 'Evaluación (SIEE)'}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-t-4 border-t-blue-500 shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b pb-3">
              <CardTitle className="text-blue-800 flex items-center gap-2">
                📅 Años Lectivos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <form onSubmit={onAddYear} className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Ej: 2025"
                    value={yearInput.year}
                    onChange={(e) => setYearInput({...yearInput, year: e.target.value})}
                    type="number"
                    className="border-blue-100 focus:border-blue-300 focus:ring-blue-200"
                  />
                  <select
                    value={yearInput.status}
                    onChange={(e) => setYearInput({...yearInput, status: e.target.value})}
                    className="border border-blue-100 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="PLANNING">En Planeación</option>
                    <option value="ACTIVE">Activo</option>
                    <option value="CLOSED">Finalizado</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Inicio</label>
                    <Input
                      type="date"
                      value={yearInput.start_date}
                      onChange={(e) => setYearInput({...yearInput, start_date: e.target.value})}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Fin</label>
                    <Input
                      type="date"
                      value={yearInput.end_date}
                      onChange={(e) => setYearInput({...yearInput, end_date: e.target.value})}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700 w-full">{editingYearId ? 'Actualizar' : 'Agregar'}</Button>
                  {editingYearId && (
                    <Button type="button" variant="outline" onClick={onCancelEditYear}>Cancelar</Button>
                  )}
                </div>
              </form>
              <div className="space-y-2">
                {years.map((y) => (
                  <div key={y.id} className="p-3 bg-white hover:bg-blue-50 rounded-lg border border-slate-200 flex justify-between items-center transition-colors shadow-sm">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-700 text-lg">{y.year}</span>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          y.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                          y.status === 'CLOSED' ? 'bg-slate-100 text-slate-600' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {y.status_display}
                        </span>
                      </div>
                      {(y.start_date || y.end_date) && (
                        <div className="text-xs text-slate-500 mt-1">
                          {y.start_date || 'N/A'} - {y.end_date || 'N/A'}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-800 hover:bg-blue-100" onClick={() => onEditYear(y)}>✎</Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => onDeleteYear(y.id)}>×</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-indigo-500 shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b pb-3">
              <CardTitle className="text-indigo-800 flex items-center gap-2">
                ⏱️ Periodos Académicos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="flex items-center justify-between bg-indigo-50 p-3 rounded-lg border border-indigo-100 mb-4">
                <span className="text-sm font-bold text-indigo-700">Filtrar por Año:</span>
                <select
                  className="p-1.5 border border-indigo-200 rounded text-sm min-w-[120px] bg-white text-indigo-900 focus:ring-indigo-500 focus:border-indigo-500"
                  value={selectedPeriodYear || ''}
                  onChange={(e) => setSelectedPeriodYear(e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">Año Actual</option>
                  {years.map(y => <option key={y.id} value={y.id}>{y.year}</option>)}
                </select>
              </div>

              <form onSubmit={onAddPeriod} className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <select
                  className="w-full p-2 border rounded text-sm bg-white"
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
                    <label className="text-xs font-semibold text-slate-500 uppercase">Inicio</label>
                    <Input
                      type="date"
                      value={periodInput.start_date}
                      onChange={(e) => setPeriodInput({...periodInput, start_date: e.target.value})}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Fin</label>
                    <Input
                      type="date"
                      value={periodInput.end_date}
                      onChange={(e) => setPeriodInput({...periodInput, end_date: e.target.value})}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700">{editingPeriodId ? 'Actualizar Periodo' : 'Agregar Periodo'}</Button>
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

                  if (filteredPeriods.length === 0) return <p className="text-slate-400 text-sm italic text-center py-4">No hay periodos para el año seleccionado.</p>

                  return filteredPeriods.map((p) => (
                    <div key={p.id} className="p-3 bg-white hover:bg-indigo-50 rounded-lg border border-slate-200 flex justify-between items-center shadow-sm transition-colors group">
                      <div>
                        <div className="font-bold text-slate-800 group-hover:text-indigo-700">{p.name}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 border">
                            {p.start_date} - {p.end_date}
                          </span>
                          <span className="text-slate-400 font-medium">
                            ({years.find(y => y.id === p.academic_year)?.year})
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-indigo-600 hover:bg-indigo-100" onClick={() => onEditPeriod(p)}>✎</Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:bg-red-100" onClick={() => onDeletePeriod(p.id)}>×</Button>
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
          <Card className="border-t-4 border-t-emerald-500 shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b pb-3">
              <CardTitle className="text-emerald-800 flex items-center gap-2">
                🏫 Institución
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {institutions.length === 0 && (
              <form onSubmit={onAddInstitution} className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <Input
                  placeholder="Nombre Institución"
                  value={instInput.name}
                  onChange={(e) => setInstInput({...instInput, name: e.target.value})}
                  className="border-emerald-100 focus:border-emerald-300 focus:ring-emerald-200"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="NIT"
                    value={instInput.nit}
                    onChange={(e) => setInstInput({...instInput, nit: e.target.value})}
                    className="border-emerald-100 focus:border-emerald-300 focus:ring-emerald-200"
                  />
                  <Input
                    placeholder="Código DANE"
                    value={instInput.dane_code}
                    onChange={(e) => setInstInput({...instInput, dane_code: e.target.value})}
                    className="border-emerald-100 focus:border-emerald-300 focus:ring-emerald-200"
                  />
                </div>
                <Input
                  placeholder="Dirección"
                  value={instInput.address}
                  onChange={(e) => setInstInput({...instInput, address: e.target.value})}
                  className="border-emerald-100 focus:border-emerald-300 focus:ring-emerald-200"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="Teléfono"
                    value={instInput.phone}
                    onChange={(e) => setInstInput({...instInput, phone: e.target.value})}
                    className="border-emerald-100 focus:border-emerald-300 focus:ring-emerald-200"
                  />
                  <Input
                    placeholder="Email"
                    value={instInput.email}
                    onChange={(e) => setInstInput({...instInput, email: e.target.value})}
                    className="border-emerald-100 focus:border-emerald-300 focus:ring-emerald-200"
                  />
                </div>
                <Input
                  placeholder="Sitio Web"
                  value={instInput.website}
                  onChange={(e) => setInstInput({...instInput, website: e.target.value})}
                  className="border-emerald-100 focus:border-emerald-300 focus:ring-emerald-200"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">Rector</label>
                    <select
                      className="w-full p-2 border rounded text-sm bg-white border-emerald-100 focus:border-emerald-300 focus:ring-emerald-200"
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
                    <label className="text-xs font-semibold text-slate-500 uppercase">Secretario/a</label>
                    <select
                      className="w-full p-2 border rounded text-sm bg-white border-emerald-100 focus:border-emerald-300 focus:ring-emerald-200"
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
                  <label className="text-xs font-semibold text-slate-500 uppercase">Escudo / Logo</label>
                  <Input 
                    type="file" 
                    accept="image/png, image/jpeg"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setInstLogo(e.target.files[0])
                      }
                    }}
                    className="border-emerald-100 focus:border-emerald-300 focus:ring-emerald-200"
                  />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">Guardar Institución</Button>
              </form>
              )}
              <div className="space-y-2 mt-4">
                {institutions.map((i) => (
                  <div key={i.id} className="p-4 bg-white hover:bg-emerald-50 rounded-lg border border-slate-200 flex gap-4 items-center shadow-sm transition-colors">
                    {i.logo && <img src={i.logo} alt="Logo" className="w-16 h-16 object-contain bg-white rounded border p-1" />}
                    <div>
                      <div className="font-bold text-slate-800 text-lg">{i.name}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        <span className="font-semibold">NIT:</span> {i.nit} <span className="mx-2">|</span> <span className="font-semibold">DANE:</span> {i.dane_code}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        <span className="font-semibold">Rector:</span> {i.rector_name || 'No asignado'} <span className="mx-2">|</span> <span className="font-semibold">Secretario:</span> {i.secretary_name || 'No asignado'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-teal-500 shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b pb-3">
              <CardTitle className="text-teal-800 flex items-center gap-2">
                🏢 Sedes (Campus)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <form onSubmit={onAddCampus} className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <Input
                  placeholder="Nombre Sede"
                  value={campusInput.name}
                  onChange={(e) => setCampusInput({...campusInput, name: e.target.value})}
                  className="border-teal-100 focus:border-teal-300 focus:ring-teal-200"
                />
                <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700">
                  {editingCampusId ? 'Actualizar Sede' : 'Agregar Sede'}
                </Button>
                {editingCampusId && (
                  <Button type="button" variant="outline" className="w-full" onClick={onCancelEditCampus}>Cancelar</Button>
                )}
              </form>
              <div className="space-y-2">
                {campuses.map((c) => (
                  <div key={c.id} className="p-3 bg-white hover:bg-teal-50 rounded-lg border border-slate-200 flex justify-between items-center shadow-sm transition-colors">
                    <div>
                      <span className="font-bold text-slate-800">{c.name}</span>
                      {c.is_main && <span className="ml-2 text-xs bg-teal-100 text-teal-800 px-2 py-0.5 rounded border border-teal-200">Principal</span>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" className="text-teal-600 hover:text-teal-800 hover:bg-teal-100" onClick={() => onEditCampus(c.id)}>✎</Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => onDeleteCampus(c.id)}>×</Button>
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
            <Card className="border-t-4 border-t-amber-500 shadow-sm">
              <CardHeader className="bg-slate-50/50 border-b pb-3">
                <CardTitle className="text-amber-800 flex items-center gap-2">
                  📊 Niveles Académicos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <form onSubmit={onAddLevel} className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <Input
                    placeholder="Nombre Nivel (Ej: Básica Primaria)"
                    value={levelInput.name}
                    onChange={(e) => setLevelInput({...levelInput, name: e.target.value})}
                    className="border-amber-100 focus:border-amber-300 focus:ring-amber-200"
                  />
                  <select
                    className="w-full p-2 border rounded text-sm bg-white border-amber-100 focus:border-amber-300 focus:ring-amber-200"
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
                      <label className="text-xs font-semibold text-slate-500 uppercase">Edad Mín</label>
                      <Input
                        type="number"
                        value={levelInput.min_age}
                        onChange={(e) => setLevelInput({...levelInput, min_age: parseInt(e.target.value)})}
                        className="border-amber-100 focus:border-amber-300 focus:ring-amber-200"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-slate-500 uppercase">Edad Máx</label>
                      <Input
                        type="number"
                        value={levelInput.max_age}
                        onChange={(e) => setLevelInput({...levelInput, max_age: parseInt(e.target.value)})}
                        className="border-amber-100 focus:border-amber-300 focus:ring-amber-200"
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white">
                    {editingLevelId ? 'Actualizar Nivel' : 'Agregar Nivel'}
                  </Button>
                  {editingLevelId && (
                    <Button type="button" variant="outline" className="w-full" onClick={onCancelEditLevel}>Cancelar</Button>
                  )}
                </form>
                <div className="space-y-2">
                  {levels.map((l) => (
                    <div key={l.id} className="p-3 bg-white hover:bg-amber-50 rounded-lg border border-slate-200 flex justify-between items-center shadow-sm transition-colors">
                      <div>
                        <div className="font-bold text-slate-800">{l.name}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-200">{l.level_type}</span>
                          <span className="ml-2 text-slate-400">({l.min_age}-{l.max_age} años)</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" className="text-amber-600 hover:text-amber-800 hover:bg-amber-100" onClick={() => onEditLevel(l)}>✎</Button>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => onDeleteLevel(l.id)}>×</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-t-4 border-t-orange-500 shadow-sm">
              <CardHeader className="bg-slate-50/50 border-b pb-3">
                <CardTitle className="text-orange-800 flex items-center gap-2">
                  🎓 Grados Escolares
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <form onSubmit={onAddGrade} className="flex gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <Input
                    placeholder="Nombre Grado"
                    value={gradeInput}
                    onChange={(e) => setGradeInput(e.target.value)}
                    className="flex-1 border-orange-100 focus:border-orange-300 focus:ring-orange-200"
                  />
                  <select
                    className="w-32 p-2 border rounded text-sm bg-white border-orange-100 focus:border-orange-300 focus:ring-orange-200"
                    value={gradeLevelInput}
                    onChange={(e) => setGradeLevelInput(e.target.value)}
                  >
                    <option value="">Nivel...</option>
                    {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white">
                    {editingGradeId ? 'Actualizar' : 'Agregar'}
                  </Button>
                  {editingGradeId && (
                    <Button type="button" variant="outline" onClick={onCancelEditGrade}>X</Button>
                  )}
                </form>
                <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
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
                          <div className="text-xs font-bold text-orange-600 mb-2 uppercase tracking-wider flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                            {level.name}
                          </div>
                          <div className="space-y-2 pl-3 border-l-2 border-orange-100">
                            {levelGrades.map((g) => (
                              <div key={g.id} className="p-3 bg-white hover:bg-orange-50 rounded-lg border border-slate-200 flex justify-between items-center shadow-sm transition-colors">
                                <div className="font-bold text-slate-700">{g.name}</div>
                                <div className="flex gap-2">
                                  <Button size="sm" variant="ghost" className="text-orange-600 hover:text-orange-800 hover:bg-orange-100" onClick={() => onEditGrade(g)}>✎</Button>
                                  <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => onDeleteGrade(g.id)}>×</Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}

                  {grades.filter(g => !g.level).length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Sin Nivel Asignado</div>
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

      {activeTab === 'areas_subjects' && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Areas Management */}
          <Card className="border-t-4 border-t-fuchsia-500 shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b pb-3">
              <CardTitle className="text-fuchsia-800 flex items-center gap-2">
                📚 Áreas del Conocimiento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <form onSubmit={onAddArea} className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <Input
                  placeholder="Nueva Área (Ej: Matemáticas)"
                  value={areaInput.name}
                  onChange={(e) => setAreaInput({...areaInput, name: e.target.value})}
                  className="border-fuchsia-100 focus:border-fuchsia-300 focus:ring-fuchsia-200"
                />
                <Button type="submit" className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white" size="sm">{editingAreaId ? 'Actualizar' : 'Crear Área'}</Button>
                {editingAreaId && (
                  <Button type="button" variant="outline" className="w-full" size="sm" onClick={onCancelEditArea}>Cancelar</Button>
                )}
              </form>
              <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
                {areas.map((a) => (
                  <div key={a.id} className="p-2 text-sm bg-white hover:bg-fuchsia-50 rounded border border-slate-200 flex justify-between items-center group transition-colors">
                    <span className="font-medium text-slate-700">{a.name}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-fuchsia-600 hover:bg-fuchsia-100" onClick={() => onEditArea(a)}>✎</Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:bg-red-100" onClick={() => onDeleteArea(a.id)}>×</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Subjects Catalog Management */}
          <Card className="border-t-4 border-t-cyan-500 shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b pb-3">
              <CardTitle className="text-cyan-800 flex items-center gap-2">
                📖 Catálogo de Asignaturas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <form onSubmit={onAddSubject} className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <select
                  className="w-full p-2 border rounded text-sm bg-white"
                  value={subjectInput.area}
                  onChange={(e) => setSubjectInput({...subjectInput, area: e.target.value})}
                >
                  <option value="">Seleccionar Área</option>
                  {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <Input
                  placeholder="Nombre Asignatura (Ej: Álgebra)"
                  value={subjectInput.name}
                  onChange={(e) => setSubjectInput({...subjectInput, name: e.target.value})}
                  className="border-cyan-100 focus:border-cyan-300 focus:ring-cyan-200"
                />
                <Button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-700 text-white" size="sm">{editingSubjectId ? 'Actualizar' : 'Crear Asignatura'}</Button>
                {editingSubjectId && (
                  <Button type="button" variant="outline" className="w-full" size="sm" onClick={onCancelEditSubject}>Cancelar</Button>
                )}
              </form>
              <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
                {subjects.map((s) => (
                  <div key={s.id} className="p-2 text-sm bg-white hover:bg-cyan-50 rounded border border-slate-200 flex justify-between items-center group transition-colors">
                    <div>
                      <span className="font-medium text-slate-700 block">{s.name}</span>
                      <span className="text-xs text-slate-500">{areas.find(a => a.id === s.area)?.name}</span>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-cyan-600 hover:bg-cyan-100" onClick={() => onEditSubject(s)}>✎</Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:bg-red-100" onClick={() => onDeleteSubject(s.id)}>×</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'study_plan' && (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-6">
            <Card className="border-t-4 border-t-violet-500 shadow-sm h-fit sticky top-4">
              <CardHeader className="bg-slate-50/50 border-b pb-3">
                <CardTitle className="text-violet-800 flex items-center gap-2">
                  🎓 Seleccionar Grado
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
                  {levels.map(level => {
                    const levelGrades = grades.filter(g => g.level === level.id)
                    if (levelGrades.length === 0) return null
                    
                    return (
                      <div key={level.id} className="space-y-1">
                        <h4 className="text-xs font-bold text-violet-600 uppercase tracking-wider px-1 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
                          {level.name}
                        </h4>
                        <div className="space-y-1 pl-2 border-l-2 border-violet-100">
                          {levelGrades.map(g => (
                            <button
                              key={g.id}
                              onClick={() => setSelectedSubjectGrade(g.id)}
                              className={`w-full text-left px-3 py-2 rounded-md border transition-all text-sm ${
                                selectedSubjectGrade === g.id
                                  ? 'bg-violet-50 border-violet-500 text-violet-700 font-bold shadow-sm'
                                  : 'bg-white border-transparent hover:bg-slate-50 text-slate-600 hover:text-slate-900'
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
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Sin Nivel</h4>
                      <div className="space-y-1 pl-2 border-l-2 border-slate-100">
                        {grades.filter(g => !g.level).map(g => (
                          <button
                            key={g.id}
                            onClick={() => setSelectedSubjectGrade(g.id)}
                            className={`w-full text-left px-3 py-2 rounded-md border transition-all text-sm ${
                              selectedSubjectGrade === g.id
                                ? 'bg-violet-50 border-violet-500 text-violet-700 font-bold shadow-sm'
                                : 'bg-white border-transparent hover:bg-slate-50 text-slate-600 hover:text-slate-900'
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
          </div>

          <div className="md:col-span-2 space-y-6">
            <Card className="border-t-4 border-t-indigo-500 shadow-sm">
              <CardHeader className="bg-slate-50/50 border-b pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-indigo-800 flex items-center gap-2">
                  {selectedSubjectGrade 
                    ? `📖 Plan de Estudios: ${grades.find(g => g.id === selectedSubjectGrade)?.name}`
                    : '📖 Plan de Estudios'}
                </CardTitle>
                {selectedSubjectGrade && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowCopyModal(true)}
                    className="text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                  >
                    📋 Importar Plan
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-6 pt-4">
                {showCopyModal && (
                  <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200 mb-4 shadow-sm">
                    <h4 className="font-bold text-indigo-800 mb-2 flex items-center gap-2">
                      <span className="text-xl">📋</span> Importar Plan de Estudios
                    </h4>
                    <p className="text-sm text-indigo-600 mb-3">
                      Copia todas las asignaturas y configuraciones de otro grado al grado actual.
                      <br/>
                      <span className="font-bold text-red-500">¡Advertencia! Esto reemplazará el plan actual.</span>
                    </p>
                    <div className="flex gap-2">
                      <select
                        className="flex-1 p-2 border rounded text-sm bg-white"
                        value={copyFromGradeId}
                        onChange={(e) => setCopyFromGradeId(e.target.value)}
                      >
                        <option value="">Seleccionar Grado Origen</option>
                        {grades.filter(g => g.id !== selectedSubjectGrade).map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                      <Button 
                        onClick={onCopyStudyPlan}
                        disabled={!copyFromGradeId}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        Copiar Plan
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => setShowCopyModal(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}

                {!selectedSubjectGrade ? (
                  <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                    <div className="text-4xl mb-3">👈</div>
                    <h3 className="text-lg font-medium text-slate-700">Selecciona un grado</h3>
                    <p className="text-slate-500">Selecciona un grado del menú lateral para configurar su plan de estudios.</p>
                  </div>
                ) : (
                  <>
                    {/* Intensity Validator */}
                    {(() => {
                      const currentGrade = grades.find(g => g.id === selectedSubjectGrade)
                      const currentLevel = currentGrade ? levels.find(l => l.id === currentGrade.level) : null
                      const gradeLoads = academicLoads.filter(l => l.grade === selectedSubjectGrade)
                      const totalHours = gradeLoads.reduce((acc, l) => acc + l.hours_per_week, 0)
                      
                      let minHours = 0
                      let levelLabel = ''
                      
                      if (currentLevel) {
                        if (currentLevel.level_type === 'PRESCHOOL') {
                          minHours = 20
                          levelLabel = 'Preescolar'
                        } else if (currentLevel.level_type === 'PRIMARY') {
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
                          <div className={`p-4 rounded-lg border mb-4 ${isCompliant ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
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

                    <form onSubmit={onAddAcademicLoad} className="grid grid-cols-12 gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200 shadow-sm">
                      <div className="col-span-5">
                        <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Asignatura</label>
                        <select
                          className="w-full p-2 border rounded text-sm bg-white focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all"
                          value={academicLoadInput.subject}
                          onChange={(e) => setAcademicLoadInput({...academicLoadInput, subject: e.target.value})}
                        >
                          <option value="">Seleccionar Asignatura</option>
                          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div className="col-span-3">
                        <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Horas/Semana</label>
                        <Input
                          type="number"
                          min="1"
                          value={academicLoadInput.hours_per_week}
                          onChange={(e) => setAcademicLoadInput({...academicLoadInput, hours_per_week: parseInt(e.target.value) || 0})}
                          className="bg-white"
                        />
                      </div>
                      <div className="col-span-4 flex items-end">
                        <div className="flex gap-2 w-full">
                          <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white">
                            {editingAcademicLoadId ? 'Actualizar' : 'Agregar'}
                          </Button>
                          {editingAcademicLoadId && (
                            <Button type="button" variant="outline" onClick={onCancelEditAcademicLoad}>
                              Cancelar
                            </Button>
                          )}
                        </div>
                      </div>
                    </form>

                    <div className="space-y-6">
                      {areas.map(area => {
                        const areaSubjectsIds = subjects.filter(s => s.area === area.id).map(s => s.id)
                        const areaLoads = academicLoads.filter(l => l.grade === selectedSubjectGrade && areaSubjectsIds.includes(l.subject))
                        
                        if (areaLoads.length === 0) return null

                        const totalHours = areaLoads.reduce((acc, l) => acc + l.hours_per_week, 0)
                        const totalWeight = areaLoads.reduce((acc, l) => acc + l.weight_percentage, 0)

                        return (
                          <div key={area.id} className="border rounded-lg overflow-hidden shadow-sm bg-white">
                            <div className="bg-slate-50 px-4 py-2 border-b flex justify-between items-center">
                              <h4 className="font-bold text-slate-700 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                {area.name}
                              </h4>
                              <div className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded border shadow-sm">
                                {totalHours} Horas Semanales
                              </div>
                            </div>
                            <div className="divide-y">
                              {areaLoads.map(l => {
                                const subjectName = subjects.find(s => s.id === l.subject)?.name || 'Desconocida'
                                return (
                                  <div key={l.id} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                                    <div>
                                      <div className="font-medium text-slate-800">{subjectName}</div>
                                      <div className="text-xs text-slate-500 mt-0.5 flex gap-3">
                                        <span className="flex items-center gap-1">
                                          ⏱️ {l.hours_per_week} Horas
                                        </span>
                                        <span className={`flex items-center gap-1 ${totalWeight !== 100 ? 'text-amber-600 font-bold' : ''}`}>
                                          📊 {l.weight_percentage}% Peso
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-indigo-600 hover:bg-indigo-100" onClick={() => onEditAcademicLoad(l)}>✎</Button>
                                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:bg-red-100" onClick={() => onDeleteAcademicLoad(l.id)}>×</Button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                            {totalWeight !== 100 && (
                              <div className="bg-amber-50 px-4 py-2 text-xs text-amber-700 border-t border-amber-100 flex items-center gap-2">
                                ⚠️ La suma de porcentajes es {totalWeight}% (debería ser 100%)
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="h-auto py-0.5 px-2 text-amber-800 hover:bg-amber-100 ml-auto text-xs"
                                  onClick={async () => {
                                    await recalculateWeights(selectedSubjectGrade!, area.id)
                                    await load()
                                  }}
                                >
                                  Recalcular Automáticamente
                                </Button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                      
                      {academicLoads.filter(l => l.grade === selectedSubjectGrade).length === 0 && (
                        <div className="text-center py-8 text-slate-400 italic">
                          No hay asignaturas configuradas para este grado.
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
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-6">
            <Card className="border-t-4 border-t-sky-500 shadow-sm h-fit sticky top-4">
              <CardHeader className="bg-slate-50/50 border-b pb-3">
                <CardTitle className="text-sky-800 flex items-center gap-2">
                  👥 Configurar Grupo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <form onSubmit={onAddGroup} className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">Año Lectivo</label>
                    <select
                      className="w-full p-2 border rounded text-sm bg-white border-sky-100 focus:border-sky-300 focus:ring-sky-200"
                      value={groupInput.academic_year}
                      onChange={(e) => setGroupInput({...groupInput, academic_year: e.target.value})}
                    >
                      <option value="">Seleccionar Año...</option>
                      {years.map(y => <option key={y.id} value={y.id}>{y.year}</option>)}
                    </select>
                  </div>
                  
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">Sede (Campus)</label>
                    <select
                      className="w-full p-2 border rounded text-sm bg-white border-sky-100 focus:border-sky-300 focus:ring-sky-200"
                      value={groupInput.campus}
                      onChange={(e) => setGroupInput({...groupInput, campus: e.target.value})}
                    >
                      <option value="">Seleccionar Sede...</option>
                      {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">Grado</label>
                    <select
                      className="w-full p-2 border rounded text-sm bg-white border-sky-100 focus:border-sky-300 focus:ring-sky-200"
                      value={groupInput.grade}
                      onChange={(e) => setGroupInput({...groupInput, grade: e.target.value})}
                    >
                      <option value="">Seleccionar Grado...</option>
                      {levels.map(level => {
                        const levelGrades = grades.filter(g => g.level === level.id)
                        if (levelGrades.length === 0) return null
                        return (
                          <optgroup key={level.id} label={level.name}>
                            {levelGrades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </optgroup>
                        )
                      })}
                      {grades.filter(g => !g.level).length > 0 && (
                        <optgroup label="Sin Nivel">
                          {grades.filter(g => !g.level).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase">Grupo</label>
                      <Input
                        placeholder="Ej: A, 01"
                        value={groupInput.name}
                        onChange={(e) => setGroupInput({...groupInput, name: e.target.value})}
                        className="border-sky-100 focus:border-sky-300 focus:ring-sky-200"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase">Salón</label>
                      <Input
                        placeholder="Ej: 101"
                        value={groupInput.classroom}
                        onChange={(e) => setGroupInput({...groupInput, classroom: e.target.value})}
                        className="border-sky-100 focus:border-sky-300 focus:ring-sky-200"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">Jornada</label>
                    <select
                      className="w-full p-2 border rounded text-sm bg-white border-sky-100 focus:border-sky-300 focus:ring-sky-200"
                      value={groupInput.shift}
                      onChange={(e) => setGroupInput({...groupInput, shift: e.target.value})}
                    >
                      <option value="MORNING">Mañana</option>
                      <option value="AFTERNOON">Tarde</option>
                      <option value="NIGHT">Noche</option>
                      <option value="FULL">Jornada Única</option>
                      <option value="WEEKEND">Fin de Semana</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">Director de Grupo</label>
                    <select
                      className="w-full p-2 border rounded text-sm bg-white border-sky-100 focus:border-sky-300 focus:ring-sky-200"
                      value={groupInput.director}
                      onChange={(e) => setGroupInput({...groupInput, director: e.target.value})}
                    >
                      <option value="">Seleccionar Docente...</option>
                      {users.filter(u => u.role === 'TEACHER').map(u => (
                        <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                      ))}
                    </select>
                  </div>

                  {groupInput.director && (
                    <div className="flex items-start space-x-2 bg-amber-50 p-3 rounded border border-amber-200">
                      <input 
                        type="checkbox" 
                        id="multigrade"
                        className="mt-1 rounded border-amber-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
                        checked={isMultigrade}
                        onChange={(e) => setIsMultigrade(e.target.checked)}
                      />
                      <label htmlFor="multigrade" className="text-xs text-amber-800 cursor-pointer select-none leading-tight">
                        <strong>Grupo Multigrado</strong><br/>
                        Permitir que este docente dirija múltiples grupos.
                      </label>
                    </div>
                  )}

                  <Button type="submit" className="w-full bg-sky-600 hover:bg-sky-700 text-white">
                    {editingGroupId ? 'Actualizar Grupo' : 'Crear Grupo'}
                  </Button>
                  {editingGroupId && (
                    <Button type="button" variant="outline" className="w-full" onClick={onCancelEditGroup}>Cancelar</Button>
                  )}
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2 space-y-6">
            <Card className="border-t-4 border-t-cyan-500 shadow-sm">
              <CardHeader className="bg-slate-50/50 border-b pb-3">
                <CardTitle className="text-cyan-800 flex items-center gap-2">
                  📋 Grupos Configurados
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="flex items-center justify-between bg-cyan-50 p-3 rounded-lg border border-cyan-100 mb-4">
                  <span className="text-sm font-bold text-cyan-700">Filtrar por Año:</span>
                  <select
                    className="p-1.5 border border-cyan-200 rounded text-sm min-w-[120px] bg-white text-cyan-900 focus:ring-cyan-500 focus:border-cyan-500"
                    value={groupInput.academic_year}
                    onChange={(e) => setGroupInput({...groupInput, academic_year: e.target.value})}
                  >
                    <option value="">Todos</option>
                    {years.map(y => <option key={y.id} value={y.id}>{y.year}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {groups
                    .filter(g => !groupInput.academic_year || g.academic_year.toString() === groupInput.academic_year)
                    .map((g) => (
                    <div key={g.id} className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-all hover:border-cyan-300 relative group">
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-cyan-600 hover:bg-cyan-100" onClick={() => onEditGroup(g)}>✎</Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:bg-red-100" onClick={() => onDeleteGroup(g.id)}>×</Button>
                      </div>
                      
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            {g.grade_name} - {g.name}
                            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                              g.shift === 'MORNING' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : 
                              g.shift === 'AFTERNOON' ? 'bg-orange-100 text-orange-700 border-orange-200' : 
                              g.shift === 'NIGHT' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 
                              'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                              {g.shift === 'MORNING' ? 'Mañana' : 
                               g.shift === 'AFTERNOON' ? 'Tarde' : 
                               g.shift === 'NIGHT' ? 'Noche' : 
                               g.shift === 'FULL' ? 'Única' : 'Fin de Semana'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                            <span className="flex items-center gap-1"><span className="text-slate-400">🏢</span> {g.campus_name || 'Sin Sede'}</span>
                            {g.classroom && <span className="flex items-center gap-1"><span className="text-slate-400">🚪</span> Salón {g.classroom}</span>}
                          </div>
                        </div>
                        <div className="text-xs font-bold bg-cyan-50 text-cyan-700 px-2 py-1 rounded border border-cyan-100">
                          {years.find(y => y.id === g.academic_year)?.year}
                        </div>
                      </div>
                      
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          g.director_name ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-400'
                        }`}>
                          {g.director_name ? g.director_name.charAt(0) : '?'}
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Director de Grupo</div>
                          <div className={`text-sm font-medium ${g.director_name ? 'text-slate-700' : 'text-slate-400 italic'}`}>
                            {g.director_name || 'Sin asignar'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {groups.filter(g => !groupInput.academic_year || g.academic_year.toString() === groupInput.academic_year).length === 0 && (
                    <div className="col-span-full text-center py-12 text-slate-400 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50">
                      <p className="text-lg font-medium">No hay grupos configurados</p>
                      <p className="text-sm">Intenta cambiar el filtro de año o crea un nuevo grupo.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'evaluation' && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="md:col-span-1 h-fit shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b pb-3">
              <CardTitle className="text-lg text-slate-700">
                {editingScaleId ? 'Editar Escala' : 'Nueva Escala'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={onAddScale} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Año Lectivo</label>
                  <select
                    className="w-full p-2 border rounded-md bg-white focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all"
                    value={scaleInput.academic_year}
                    onChange={(e) => setScaleInput({ ...scaleInput, academic_year: e.target.value })}
                    required
                  >
                    <option value="">Seleccione un año...</option>
                    {years.map((y) => (
                      <option key={y.id} value={y.id}>{y.year}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la Escala</label>
                  <Input
                    placeholder="Ej. Superior, Alto, Básico..."
                    value={scaleInput.name}
                    onChange={(e) => setScaleInput({ ...scaleInput, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Escala</label>
                  <select
                    className="w-full p-2 border rounded-md bg-white focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all"
                    value={scaleInput.scale_type}
                    onChange={(e) => setScaleInput({ ...scaleInput, scale_type: e.target.value as 'NUMERIC' | 'QUALITATIVE' })}
                  >
                    <option value="NUMERIC">Numérica (Básica/Media)</option>
                    <option value="QUALITATIVE">Cualitativa (Preescolar)</option>
                  </select>
                </div>

                {scaleInput.scale_type === 'NUMERIC' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Mínimo</label>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="0.0"
                        value={scaleInput.min_score}
                        onChange={(e) => setScaleInput({ ...scaleInput, min_score: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Máximo</label>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="5.0"
                        value={scaleInput.max_score}
                        onChange={(e) => setScaleInput({ ...scaleInput, max_score: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Descripción (Opcional)</label>
                  <textarea
                    className="w-full p-2 border rounded-md focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all"
                    rows={3}
                    placeholder="Descripción del desempeño..."
                    value={scaleInput.description}
                    onChange={(e) => setScaleInput({ ...scaleInput, description: e.target.value })}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button type="submit" className="flex-1 bg-rose-600 hover:bg-rose-700 text-white">
                    {editingScaleId ? 'Actualizar' : 'Guardar'}
                  </Button>
                  {editingScaleId && (
                    <Button type="button" variant="outline" onClick={onCancelEditScale}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
            </Card>

            <Card className="md:col-span-2 border-t-4 border-t-rose-500 shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-rose-800 flex items-center gap-2">
                  📊 Escala de Valoración (SIEE)
                </CardTitle>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-rose-600 border-rose-200 hover:bg-rose-50"
                  onClick={() => setShowCopyScalesModal(true)}
                >
                  📋 Copiar desde otro año
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between bg-rose-50 p-3 rounded-lg border border-rose-100 mb-4">
                <span className="text-sm font-bold text-rose-700">Filtrar por Año:</span>
                <select
                  className="p-1.5 border border-rose-200 rounded text-sm min-w-[120px] bg-white text-rose-900 focus:ring-rose-500 focus:border-rose-500"
                  value={selectedScaleYear || ''}
                  onChange={(e) => setSelectedScaleYear(e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">Todos los años</option>
                  {years.map(y => <option key={y.id} value={y.id}>{y.year}</option>)}
                </select>
              </div>

              <div className="space-y-3">
                {scales.filter(s => !selectedScaleYear || s.academic_year === selectedScaleYear).length === 0 && (
                  <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                    <p className="text-lg font-medium">No hay escala de valoración configurada</p>
                    <p className="text-sm">Utiliza el formulario para agregar los rangos de desempeño.</p>
                  </div>
                )}
                {scales.filter(s => !selectedScaleYear || s.academic_year === selectedScaleYear).map((s) => (
                  <div key={s.id} className="p-4 bg-white hover:bg-rose-50 rounded-lg border border-slate-200 flex justify-between items-center shadow-sm transition-colors group">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg text-slate-800">{s.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${s.scale_type === 'QUALITATIVE' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                          {s.scale_type === 'QUALITATIVE' ? 'Cualitativa' : 'Numérica'}
                        </span>
                      </div>
                      {s.description && <p className="text-sm text-slate-600 mt-1">{s.description}</p>}
                      <p className="text-xs text-slate-500 mt-1">
                        Año: {years.find(y => y.id === s.academic_year)?.year}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {s.scale_type === 'NUMERIC' && (
                        <span className="text-rose-700 bg-rose-100 px-4 py-1.5 rounded-full text-sm font-bold border border-rose-200">
                          {s.min_score} - {s.max_score}
                        </span>
                      )}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="ghost" onClick={() => onEditScale(s)}>
                          ✏️
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => onDeleteScale(s.id)}>
                          🗑️
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            </Card>
          </div>

          <DimensionsConfig />
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

      {/* Copy Scales Modal */}
      {showCopyScalesModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Copiar Escalas de Valoración</h3>
            <p className="text-sm text-slate-600 mb-4">
              Selecciona el año de origen y el año de destino para copiar las escalas de valoración.
              Las escalas con el mismo nombre no se duplicarán.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Año Origen (Desde)</label>
                <select
                  className="w-full p-2 border rounded-md bg-white"
                  value={copyScalesData.sourceYear}
                  onChange={(e) => setCopyScalesData({ ...copyScalesData, sourceYear: e.target.value })}
                >
                  <option value="">Seleccione año origen...</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>{y.year}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Año Destino (Para)</label>
                <select
                  className="w-full p-2 border rounded-md bg-white"
                  value={copyScalesData.targetYear}
                  onChange={(e) => setCopyScalesData({ ...copyScalesData, targetYear: e.target.value })}
                >
                  <option value="">Seleccione año destino...</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>{y.year}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowCopyScalesModal(false)}>
                Cancelar
              </Button>
              <Button 
                className="bg-rose-600 hover:bg-rose-700 text-white"
                onClick={handleCopyScales}
                disabled={!copyScalesData.sourceYear || !copyScalesData.targetYear}
              >
                Copiar Escalas
              </Button>
            </div>
          </div>
        </div>
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast({ ...toast, isVisible: false })}
      />
    </div>
  )
}

