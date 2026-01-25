import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { academicApi } from '../services/academic'
import { coreApi, type Institution, type Campus } from '../services/core'
import { downloadAttendanceManualSheetPdf } from '../services/attendance'
import { usersApi, type User } from '../services/users'
import type {
  AcademicYear,
  Grade,
  Period,
  Area,
  Subject,
  AcademicLoad,
  Group,
  TeacherAssignment,
  EvaluationScale,
  AcademicLevel,
} from '../services/academic'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { ConfirmationModal } from '../components/ui/ConfirmationModal'
import { Toast, type ToastType } from '../components/ui/Toast'
import DimensionsConfig from './planning/DimensionsConfig'
import { useAuthStore } from '../store/auth'
import DisciplineManualConfig from './discipline/DisciplineManualConfig'

const ACADEMIC_CONFIG_TABS_FULL = [
  'general',
  'institution',
  'grades_levels',
  'areas_subjects',
  'study_plan',
  'evaluation',
  'convivencia_manual',
] as const

const ACADEMIC_CONFIG_TAB_LABEL: Record<(typeof ACADEMIC_CONFIG_TABS_FULL)[number], string> = {
  general: 'General',
  institution: 'Institucional',
  grades_levels: 'Grados y Niveles',
  areas_subjects: 'Áreas y Asignaturas',
  study_plan: 'Plan de Estudios',
  evaluation: 'Evaluación (SIEE)',
  convivencia_manual: 'Convivencia (Manual)',
}

type AcademicConfigFullTab = (typeof ACADEMIC_CONFIG_TABS_FULL)[number]
type AcademicConfigTab = AcademicConfigFullTab | 'organization'

const ACTIVE_TAB_STORAGE_KEY = 'kampus.academic_config.active_tab'

type AcademicConfigPanelMode = 'full' | 'groups-only'

export default function AcademicConfigPanel({ mode = 'full' }: { mode?: AcademicConfigPanelMode } = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'
  const isGroupsOnly = mode === 'groups-only'

  const [activeTab, setActiveTab] = useState<AcademicConfigTab>(() => {
    if (isGroupsOnly) return 'organization'
    try {
      const saved = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY)
      if (saved && (ACADEMIC_CONFIG_TABS_FULL as readonly string[]).includes(saved)) return saved as AcademicConfigFullTab
    } catch {
      // ignore
    }
    return 'general'
  })

  const [urlTabApplied, setUrlTabApplied] = useState(false)

  const setActiveTabPersisted = (tab: AcademicConfigTab) => {
    setActiveTab(tab)
    try {
      localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tab)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (urlTabApplied) return
    if (isGroupsOnly) {
      setUrlTabApplied(true)
      return
    }

    const params = new URLSearchParams(location.search)
    const requestedTab = params.get('tab')

    if (requestedTab === 'organization') {
      setUrlTabApplied(true)
      navigate('/groups', { replace: true })
      return
    }

    if (requestedTab && (ACADEMIC_CONFIG_TABS_FULL as readonly string[]).includes(requestedTab)) {
      const nextTab = requestedTab as AcademicConfigFullTab
      setActiveTab(nextTab)
      try {
        localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, nextTab)
      } catch {
        // ignore
      }
      setUrlTabApplied(true)
      navigate(location.pathname, { replace: true })
      return
    }

    setUrlTabApplied(true)
  }, [isGroupsOnly, location.pathname, location.search, navigate, urlTabApplied])
  
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
  const [yearInput, setYearInput] = useState<{
    year: string
    status: AcademicYear['status']
    start_date: string
    end_date: string
  }>({
    year: '',
    status: 'PLANNING',
    start_date: '',
    end_date: '',
  })
  const [editingYearId, setEditingYearId] = useState<number | null>(null)
  const [periodInput, setPeriodInput] = useState({
    name: '',
    start_date: '',
    end_date: '',
    academic_year: '',
    grades_edit_until: '',
    planning_edit_until: '',
  })
  const [editingPeriodId, setEditingPeriodId] = useState<number | null>(null)

  // Levels & Grades state
  const [levelInput, setLevelInput] = useState({ name: '', level_type: 'PRIMARY', min_age: 5, max_age: 100 })
  const [editingLevelId, setEditingLevelId] = useState<number | null>(null)
  const [gradeInput, setGradeInput] = useState('')
  const [gradeLevelInput, setGradeLevelInput] = useState('')
  const [gradeOrdinalInput, setGradeOrdinalInput] = useState('')
  const [editingGradeId, setEditingGradeId] = useState<number | null>(null)

  // Areas & Subjects state
  const [areaInput, setAreaInput] = useState({ name: '', description: '' })
  const [editingAreaId, setEditingAreaId] = useState<number | null>(null)
  const [createSubjectForArea, setCreateSubjectForArea] = useState(false)
  const [subjectInput, setSubjectInput] = useState({ name: '', area: '' })
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null)
  const [areaSearch, setAreaSearch] = useState('')
  const [subjectSearch, setSubjectSearch] = useState('')
  
  // Academic Load state
  const [academicLoadInput, setAcademicLoadInput] = useState({ subject: '', grade: '', weight_percentage: 100, hours_per_week: 1 })
  const [editingAcademicLoadId, setEditingAcademicLoadId] = useState<number | null>(null)
  const [selectedSubjectGrade, setSelectedSubjectGrade] = useState<number | null>(null)
  const [copyFromGradeId, setCopyFromGradeId] = useState<string>('')
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [academicLoadToDelete, setAcademicLoadToDelete] = useState<number | null>(null)
  const [deletingAcademicLoad, setDeletingAcademicLoad] = useState(false)

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

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false)
  const [groupSearch, setGroupSearch] = useState('')
  const [groupShiftFilter, setGroupShiftFilter] = useState<'ALL' | 'MORNING' | 'AFTERNOON' | 'NIGHT' | 'FULL' | 'WEEKEND'>('ALL')
  const [groupCampusFilter, setGroupCampusFilter] = useState<'ALL' | string>('ALL')
  const [groupsPerPage, setGroupsPerPage] = useState(8)
  const [groupsPage, setGroupsPage] = useState(1)
  const [openGroupActionsId, setOpenGroupActionsId] = useState<number | null>(null)
  const [showGroupFiltersMobile, setShowGroupFiltersMobile] = useState(false)

  const [printingManualSheetGroupId, setPrintingManualSheetGroupId] = useState<number | null>(null)

  const [importGroupsModalOpen, setImportGroupsModalOpen] = useState(false)
  const [importingGroups, setImportingGroups] = useState(false)
  const [importGroupsSourceYearId, setImportGroupsSourceYearId] = useState<number | null>(null)
  const [importGroupsTargetYearId, setImportGroupsTargetYearId] = useState<number | null>(null)

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

  const resetGroupForm = useCallback((yearId: string) => {
    setGroupInput({
      name: '',
      grade: '',
      campus: '',
      director: '',
      shift: 'MORNING',
      classroom: '',
      academic_year: yearId,
    })
    setIsMultigrade(false)
  }, [])

  const openNewGroupModal = useCallback(() => {
    setEditingGroupId(null)
    resetGroupForm(groupInput.academic_year)
    setIsGroupModalOpen(true)
  }, [groupInput.academic_year, resetGroupForm])

  const closeGroupModal = useCallback(() => {
    setIsGroupModalOpen(false)
    setEditingGroupId(null)
    resetGroupForm(groupInput.academic_year)
  }, [groupInput.academic_year, resetGroupForm])

  useEffect(() => {
    if (!isGroupModalOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeGroupModal()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeGroupModal, isGroupModalOpen])

  useEffect(() => {
    if (openGroupActionsId === null) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenGroupActionsId(null)
    }

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      // Close if click is outside any actions menu trigger/container
      const inside = target.closest('[data-group-actions-root="true"]')
      if (!inside) setOpenGroupActionsId(null)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [openGroupActionsId])

  const printManualAttendanceSheet = async (groupId: number) => {
    try {
      setPrintingManualSheetGroupId(groupId)
      const blob = await downloadAttendanceManualSheetPdf({ group_id: groupId })
      const url = URL.createObjectURL(blob)

      const w = window.open(url, '_blank', 'noopener,noreferrer')
      if (!w) {
        const a = document.createElement('a')
        a.href = url
        a.download = `planilla_asistencia_grupo_${groupId}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
        showToast('Descargando planilla…', 'success')
      }

      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      console.error(err)
      showToast('No se pudo generar la planilla de asistencia.', 'error')
    } finally {
      setPrintingManualSheetGroupId(null)
    }
  }

  const [isGradeSheetModalOpen, setIsGradeSheetModalOpen] = useState(false)
  const [gradeSheetModalGroup, setGradeSheetModalGroup] = useState<Group | null>(null)
  const [gradeSheetPeriodId, setGradeSheetPeriodId] = useState('')
  const [gradeSheetSubject, setGradeSheetSubject] = useState('')
  const [gradeSheetTeacher, setGradeSheetTeacher] = useState('')
  const [gradeSheetAssignmentId, setGradeSheetAssignmentId] = useState('')
  const [gradeSheetAssignments, setGradeSheetAssignments] = useState<TeacherAssignment[]>([])
  const [gradeSheetAssignmentsLoading, setGradeSheetAssignmentsLoading] = useState(false)
  const [printingGradeSheet, setPrintingGradeSheet] = useState(false)

  const openGradeSheetModal = (g: Group) => {
    setGradeSheetModalGroup(g)
    setGradeSheetPeriodId('')
    setGradeSheetSubject('')
    setGradeSheetTeacher('')
    setGradeSheetAssignmentId('')
    setGradeSheetAssignments([])
    setIsGradeSheetModalOpen(true)

    ;(async () => {
      try {
        setGradeSheetAssignmentsLoading(true)
        const res = await academicApi.listAssignments()
        const all = res.data ?? []
        const filtered = all.filter((a) => a.group === g.id)
        setGradeSheetAssignments(filtered)

        if (filtered.length > 0) {
          const first = filtered[0]
          setGradeSheetAssignmentId(String(first.id))
          setGradeSheetTeacher(first.teacher_name || '')
          const subj = [first.area_name, first.subject_name].filter(Boolean).join(' - ') || first.academic_load_name || ''
          setGradeSheetSubject(subj)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setGradeSheetAssignmentsLoading(false)
      }
    })()
  }

  const closeGradeSheetModal = () => {
    if (printingGradeSheet) return
    setIsGradeSheetModalOpen(false)
    setGradeSheetModalGroup(null)
  }

  const confirmPrintGradeReportSheet = async () => {
    const g = gradeSheetModalGroup
    if (!g) return
    try {
      setPrintingGradeSheet(true)

      const period = gradeSheetPeriodId ? Number(gradeSheetPeriodId) : undefined
      const subject = gradeSheetSubject.trim() ? gradeSheetSubject.trim() : undefined
      const teacher = gradeSheetTeacher.trim() ? gradeSheetTeacher.trim() : undefined

      const res = await academicApi.downloadGradeReportSheetPdf(g.id, { period, subject, teacher })
      const blob = res.data as unknown as Blob
      const url = URL.createObjectURL(blob)

      const w = window.open(url, '_blank', 'noopener,noreferrer')
      if (!w) {
        const a = document.createElement('a')
        a.href = url
        a.download = `planilla_notas_grupo_${g.id}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
        showToast('Descargando planilla…', 'success')
      }

      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setIsGradeSheetModalOpen(false)
      setGradeSheetModalGroup(null)
    } catch (err) {
      console.error(err)
      showToast('No se pudo generar la planilla de notas.', 'error')
    } finally {
      setPrintingGradeSheet(false)
    }
  }

  const getCampusBadgeClasses = (campusId: number | null | undefined) => {
    const palette = [
      'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/25 dark:text-cyan-200 dark:border-cyan-500/30',
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/25 dark:text-emerald-200 dark:border-emerald-500/30',
      'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/25 dark:text-violet-200 dark:border-violet-500/30',
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/25 dark:text-amber-200 dark:border-amber-500/30',
      'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/25 dark:text-sky-200 dark:border-sky-500/30',
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/25 dark:text-rose-200 dark:border-rose-500/30',
      'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/25 dark:text-indigo-200 dark:border-indigo-500/30',
      'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/25 dark:text-teal-200 dark:border-teal-500/30',
    ]

    if (!campusId) {
      return 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
    }

    const idx = Math.abs(campusId) % palette.length
    return palette[idx]
  }

  const activeGroupFilterCount =
    (groupSearch.trim() ? 1 : 0) +
    (groupCampusFilter !== 'ALL' ? 1 : 0) +
    (groupShiftFilter !== 'ALL' ? 1 : 0) +
    (groupsPerPage !== 8 ? 1 : 0)

  useEffect(() => {
    // Reset pagination when filters change
    setGroupsPage(1)
  }, [groupInput.academic_year, groupSearch, groupShiftFilter, groupCampusFilter, groupsPerPage])

  useEffect(() => {
    // Clamp current page when underlying data changes
    const yearId = groupInput.academic_year
    if (!yearId) return
    const q = (groupSearch || '').trim().toLowerCase()
    const campusId = groupCampusFilter !== 'ALL' ? parseInt(groupCampusFilter) : null

    const filteredCount = groups
      .filter(g => g.academic_year.toString() === yearId)
      .filter(g => (groupShiftFilter === 'ALL' ? true : g.shift === groupShiftFilter))
      .filter(g => (campusId ? g.campus === campusId : true))
      .filter(g => {
        if (!q) return true
        const hay = [
          g.grade_name,
          g.name,
          g.campus_name,
          g.director_name,
          g.classroom,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      }).length

    const totalPages = Math.max(1, Math.ceil(filteredCount / Math.max(1, groupsPerPage)))
    if (groupsPage > totalPages) setGroupsPage(totalPages)
  }, [groups, groupCampusFilter, groupInput.academic_year, groupSearch, groupShiftFilter, groupsPage, groupsPerPage])

  const toDateTimeLocal = (iso: string | null | undefined) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (!Number.isFinite(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const dateTimeLocalToIso = (value: string) => {
    if (!value) return null
    const d = new Date(value)
    if (!Number.isFinite(d.getTime())) return null
    return d.toISOString()
  }

  const getErrorMessage = (error: unknown, defaultMsg: string) => {
    const data = (error as { response?: { data?: unknown } } | undefined)?.response?.data
    if (!data) return defaultMsg
    if (typeof data === 'string') return data

    if (typeof data === 'object' && data) {
      const obj = data as Record<string, unknown>
      const detail = obj.detail
      if (typeof detail === 'string') return detail

      const nonField = obj.non_field_errors
      if (Array.isArray(nonField)) return nonField.filter((x) => typeof x === 'string').join(', ')
      if (typeof nonField === 'string') return nonField

      const messages = Object.entries(obj).map(([field, errors]) => {
        if (Array.isArray(errors)) {
          return `${field}: ${errors.filter((x) => typeof x === 'string').join(', ')}`
        }
        return `${field}: ${String(errors)}`
      })

      if (messages.length > 0) return messages.join('\n')
    }

    return defaultMsg
  }

  // Loading state
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
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

      // Default Groups filter to ACTIVE year (if not selected)
      const activeYear = y.data.find(year => year.status === 'ACTIVE')
      setGroupInput(prev => {
        if (prev.academic_year) return prev
        return { ...prev, academic_year: activeYear ? String(activeYear.id) : '' }
      })

      // Default Period form year to ACTIVE year (if not selected and not editing)
      setPeriodInput(prev => {
        if (editingPeriodId) return prev
        if (prev.academic_year) return prev
        return { ...prev, academic_year: activeYear ? String(activeYear.id) : '' }
      })

      if (!hasInitializedFilters) {
        if (activeYear) {
          setSelectedScaleYear(activeYear.id)
          setSelectedPeriodYear(activeYear.id)
        }
        setHasInitializedFilters(true)
      }
    } catch (error) {
      console.error("Failed to load data", error)
    } finally {
      setLoading(false)
    }
  }, [editingPeriodId, hasInitializedFilters])

  useEffect(() => {
    if (isTeacher) return
    load()
  }, [isTeacher, load])

  if (isTeacher) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Configuración Académica</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">No tienes permisos para acceder a la configuración académica.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const onAddYear = async (e: FormEvent) => {
    e.preventDefault()
    const y = parseInt(yearInput.year, 10)
    if (!y) return
    
    const data = {
      year: y,
      status: yearInput.status,
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
    } catch (error: unknown) {
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

        // Determine affected grades via AcademicLoads before deleting
        const loadsRes = await academicApi.listAcademicLoads()
        const affectedGrades = new Set<number>(
          loadsRes.data.filter(l => l.subject === itemToDelete).map(l => l.grade)
        )

        await academicApi.deleteSubject(itemToDelete)
        showToast('Asignatura eliminada correctamente', 'success')

        if (subjectToDelete && affectedGrades.size > 0) {
          let updatedTotal = 0
          for (const gradeId of affectedGrades) {
            updatedTotal += await recalculateWeights(gradeId, subjectToDelete.area)
          }
          if (updatedTotal > 0) {
            showToast(`Se recalcularon los pesos de ${updatedTotal} asignaturas`, 'info')
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
    } catch (error: unknown) {
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

    const selectedYearObj = years.find(y => y.id === parseInt(periodInput.academic_year))
    if (selectedYearObj?.status === 'CLOSED') {
      showToast('No se pueden crear o modificar periodos en un año lectivo finalizado.', 'error')
      return
    }
    try {
      const gradesEditUntilIso = periodInput.grades_edit_until ? dateTimeLocalToIso(periodInput.grades_edit_until) : null
      const planningEditUntilIso = periodInput.planning_edit_until ? dateTimeLocalToIso(periodInput.planning_edit_until) : null

      if (periodInput.grades_edit_until && !gradesEditUntilIso) {
        showToast('Fecha/hora inválida para edición de notas', 'error')
        return
      }
      if (periodInput.planning_edit_until && !planningEditUntilIso) {
        showToast('Fecha/hora inválida para edición de planeación', 'error')
        return
      }

      const data = {
        name: periodInput.name,
        start_date: periodInput.start_date,
        end_date: periodInput.end_date,
        academic_year: parseInt(periodInput.academic_year),
        is_closed: false,
        grades_edit_until: gradesEditUntilIso,
        planning_edit_until: planningEditUntilIso,
      }

      if (editingPeriodId) {
        await academicApi.updatePeriod(editingPeriodId, data)
        setEditingPeriodId(null)
        showToast('Periodo actualizado correctamente', 'success')
      } else {
        await academicApi.createPeriod(data)
        showToast('Periodo creado correctamente', 'success')
      }
      
      setPeriodInput({ name: '', start_date: '', end_date: '', academic_year: '', grades_edit_until: '', planning_edit_until: '' })
      await load()
    } catch (error: unknown) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al guardar el periodo'), 'error')
    }
  }

  const onEditPeriod = (period: Period) => {
    const yearObj = years.find(y => y.id === period.academic_year)
    if (yearObj?.status === 'CLOSED') {
      showToast('No se pueden editar periodos de un año lectivo finalizado.', 'error')
      return
    }
    setPeriodInput({
      name: period.name,
      start_date: period.start_date,
      end_date: period.end_date,
      academic_year: period.academic_year.toString(),
      grades_edit_until: toDateTimeLocal(period.grades_edit_until),
      planning_edit_until: toDateTimeLocal(period.planning_edit_until),
    })
    setEditingPeriodId(period.id)
  }

  const onDeletePeriod = (id: number) => {
    const periodObj = periods.find(p => p.id === id)
    const yearObj = years.find(y => y.id === periodObj?.academic_year)
    if (yearObj?.status === 'CLOSED') {
      showToast('No se pueden eliminar periodos de un año lectivo finalizado.', 'error')
      return
    }
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
    setPeriodInput({ name: '', start_date: '', end_date: '', academic_year: '', grades_edit_until: '', planning_edit_until: '' })
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
    } catch (error: unknown) {
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
      const ordinal = gradeOrdinalInput === '' ? undefined : parseInt(gradeOrdinalInput, 10)

      const data = { 
        name: gradeInput.trim(),
        level: gradeLevelInput ? parseInt(gradeLevelInput) : undefined,
        ordinal,
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
      setGradeOrdinalInput('')
      await load()
    } catch (error: unknown) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al guardar el grado'), 'error')
    }
  }

  const onEditGrade = (grade: Grade) => {
    setGradeInput(grade.name)
    setGradeLevelInput(grade.level ? grade.level.toString() : '')
    const ordinal = grade.ordinal
    const inRange = ordinal !== null && ordinal !== undefined && ordinal >= -2 && ordinal <= 11
    setGradeOrdinalInput(inRange ? String(ordinal) : '')
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
    setGradeOrdinalInput('')
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
          const subjectRes = await academicApi.createSubject({
            name: areaInput.name,
            area: res.data.id,
          })

          await academicApi.createAcademicLoad({
            subject: subjectRes.data.id,
            grade: selectedSubjectGrade,
            weight_percentage: 100,
            hours_per_week: 1,
          })
          showToast('Área y asignatura creadas correctamente', 'success')
        } else {
          showToast('Área creada correctamente', 'success')
        }
      }
      setAreaInput({ name: '', description: '' })
      setCreateSubjectForArea(false)
      await load()
    } catch (error: unknown) {
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
      const weights = areaLoads.map(l => ({
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    setAcademicLoadToDelete(id)
  }

  const confirmDeleteAcademicLoad = async () => {
    if (academicLoadToDelete === null || deletingAcademicLoad) return
    setDeletingAcademicLoad(true)
    try {
      await academicApi.deleteAcademicLoad(academicLoadToDelete)
      showToast('Carga académica eliminada', 'success')
      setAcademicLoadToDelete(null)
      await load()
    } catch (error: unknown) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al eliminar la carga académica'), 'error')
    } finally {
      setDeletingAcademicLoad(false)
    }
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
      setIsGroupModalOpen(false)
    } catch (error: unknown) {
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
    setIsGroupModalOpen(true)
  }

  const onDeleteGroup = (id: number) => {
    setItemToDelete(id)
    setDeleteType('group')
    setDeleteModalOpen(true)
  }

  const findPreviousAcademicYearId = (targetYearId: number) => {
    const targetYear = years.find((y) => y.id === targetYearId)
    if (!targetYear) return null

    const exactPrev = years.find((y) => y.year === targetYear.year - 1)
    if (exactPrev) return exactPrev.id

    const prevBySort = years
      .filter((y) => y.year < targetYear.year)
      .sort((a, b) => b.year - a.year)[0]

    return prevBySort ? prevBySort.id : null
  }

  const openImportGroupsModal = () => {
    if (!groupInput.academic_year) {
      showToast('Selecciona un año destino para importar grupos', 'error')
      return
    }
    const targetYearId = parseInt(groupInput.academic_year)
    const sourceYearId = findPreviousAcademicYearId(targetYearId)
    if (!sourceYearId) {
      showToast('No se encontró un año anterior para importar grupos', 'error')
      return
    }

    setImportGroupsTargetYearId(targetYearId)
    setImportGroupsSourceYearId(sourceYearId)
    setImportGroupsModalOpen(true)
  }

  const confirmImportGroups = async () => {
    if (!importGroupsSourceYearId || !importGroupsTargetYearId) return
    setImportingGroups(true)
    try {
      const res = await academicApi.copyGroupsFromYear(importGroupsSourceYearId, importGroupsTargetYearId)
      showToast(res.data?.message || 'Grupos importados correctamente', 'success')
      setImportGroupsModalOpen(false)
      await load()
    } catch (error: unknown) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al importar grupos'), 'error')
    } finally {
      setImportingGroups(false)
    }
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al copiar las escalas'), 'error')
    }
  }

  const formatGradeOrdinal = (value: number) => {
    const abs = Math.abs(value)
    const padded = abs < 10 ? `0${abs}` : String(abs)
    return value < 0 ? `-${padded}` : padded
  }

  if (loading) {
    return <div className="p-6 text-slate-500 dark:text-slate-400">Cargando configuración...</div>
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-slate-50/30 min-h-screen dark:bg-slate-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {isGroupsOnly ? 'Administración de Grupos' : 'Configuración Académica'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isGroupsOnly ? 'Crea, edita e importa grupos del año lectivo' : 'Gestiona años, grados, asignaturas y más'}
            </p>
          </div>
        </div>
        <Button
          onClick={load}
          variant="outline"
          size="sm"
          className="w-full sm:w-auto hover:bg-blue-50 hover:text-blue-600 border-slate-200 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-sky-300"
        >
          🔄 Actualizar
        </Button>
      </div>

      {!isGroupsOnly && (
        <>
          {/* Mobile: dropdown selector (easier than horizontal scrolling) */}
          <div className="sm:hidden">
            <label className="sr-only" htmlFor="academic-config-tab">
              Sección de configuración
            </label>
            <select
              id="academic-config-tab"
              value={activeTab}
              onChange={(e) => {
                const next = e.target.value
                if ((ACADEMIC_CONFIG_TABS_FULL as readonly string[]).includes(next)) {
                  setActiveTabPersisted(next as AcademicConfigFullTab)
                }
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
            >
              {ACADEMIC_CONFIG_TABS_FULL.map((tab) => (
                <option key={tab} value={tab}>
                  {ACADEMIC_CONFIG_TAB_LABEL[tab]}
                </option>
              ))}
            </select>
          </div>

          {/* Desktop: segmented buttons */}
          <div className="hidden sm:flex space-x-1 bg-slate-100 p-1 rounded-lg w-full overflow-x-auto border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
            {ACADEMIC_CONFIG_TABS_FULL.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTabPersisted(tab)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab
                    ? 'bg-white text-blue-700 shadow-sm ring-1 ring-black/5 dark:bg-slate-950 dark:text-sky-300 dark:ring-white/10'
                    : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:text-slate-400 dark:hover:text-sky-300 dark:hover:bg-slate-800'
                }`}
              >
                {ACADEMIC_CONFIG_TAB_LABEL[tab]}
              </button>
            ))}
          </div>
        </>
      )}

      {activeTab === 'convivencia_manual' && (
        <DisciplineManualConfig />
      )}

      {activeTab === 'general' && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-t-4 border-t-blue-500 shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b pb-3 dark:bg-slate-900/50 dark:border-slate-800">
              <CardTitle className="text-blue-800 flex items-center gap-2">
                📅 Años Lectivos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <form onSubmit={onAddYear} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    placeholder="Ej: 2025"
                    value={yearInput.year}
                    onChange={(e) => setYearInput({...yearInput, year: e.target.value})}
                    type="number"
                    className="w-full flex-1 border-blue-100 focus:border-blue-300 focus:ring-blue-200"
                  />
                  <select
                    value={yearInput.status}
                    onChange={(e) => {
                      const next = e.target.value
                      if (next === 'PLANNING' || next === 'ACTIVE' || next === 'CLOSED') {
                        setYearInput({ ...yearInput, status: next })
                      }
                    }}
                    className="w-full sm:w-48 border border-blue-100 rounded-md bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="PLANNING">En Planeación</option>
                    <option value="ACTIVE">Activo</option>
                    <option value="CLOSED">Finalizado</option>
                  </select>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Inicio</label>
                    <Input
                      type="date"
                      value={yearInput.start_date}
                      onChange={(e) => setYearInput({...yearInput, start_date: e.target.value})}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Fin</label>
                    <Input
                      type="date"
                      value={yearInput.end_date}
                      onChange={(e) => setYearInput({...yearInput, end_date: e.target.value})}
                    />
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700 w-full sm:flex-1">{editingYearId ? 'Actualizar' : 'Agregar'}</Button>
                  {editingYearId && (
                    <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onCancelEditYear}>Cancelar</Button>
                  )}
                </div>
              </form>
              <div className="space-y-2">
                {years.map((y) => (
                  <div key={y.id} className="group p-3 bg-white hover:bg-blue-50 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 transition-colors shadow-sm dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800/60">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-700 text-lg dark:text-slate-100">{y.year}</span>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          y.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-200' :
                          y.status === 'CLOSED'
                            ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200' :
                            'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                        }`}>
                          {y.status_display}
                        </span>
                      </div>
                      {(y.start_date || y.end_date) && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {y.start_date || 'N/A'} - {y.end_date || 'N/A'}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto justify-end">
                      <Button size="sm" variant="ghost" className="h-10 w-10 p-0 sm:h-8 sm:w-8 sm:p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-100 dark:text-sky-300 dark:hover:bg-slate-800" onClick={() => onEditYear(y)}>✎</Button>
                      <Button size="sm" variant="ghost" className="h-10 w-10 p-0 sm:h-8 sm:w-8 sm:p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30" onClick={() => onDeleteYear(y.id)}>×</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-indigo-500 shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b pb-3 dark:bg-slate-900/50 dark:border-slate-800">
              <CardTitle className="text-indigo-800 flex items-center gap-2">
                ⏱️ Periodos Académicos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-indigo-50 p-3 rounded-lg border border-indigo-100 mb-4 dark:bg-indigo-950/30 dark:border-indigo-500/30">
                <span className="text-sm font-bold text-indigo-700 dark:text-indigo-200">Filtrar por Año:</span>
                <select
                  className="w-full sm:w-auto p-1.5 border border-indigo-200 rounded text-sm sm:min-w-[120px] bg-white text-indigo-900 focus:ring-indigo-500 focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={selectedPeriodYear || ''}
                  onChange={(e) => setSelectedPeriodYear(e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">Año Activo</option>
                  {years.map(y => <option key={y.id} value={y.id}>{y.year}</option>)}
                </select>
              </div>

              {(() => {
                const displayYearObj = years.find(y => y.id === selectedPeriodYear) || years.find(y => y.status === 'ACTIVE')
                if (displayYearObj?.status !== 'CLOSED') return null
                return (
                  <div className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg p-3 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200">
                    Este año lectivo está finalizado. No se pueden editar ni eliminar periodos.
                  </div>
                )
              })()}

              <form onSubmit={onAddPeriod} className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800">
                <select
                  className="w-full p-2 border rounded text-sm bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Inicio</label>
                    <Input
                      type="date"
                      value={periodInput.start_date}
                      onChange={(e) => setPeriodInput({...periodInput, start_date: e.target.value})}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Fin</label>
                    <Input
                      type="date"
                      value={periodInput.end_date}
                      onChange={(e) => setPeriodInput({...periodInput, end_date: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Edición notas hasta</label>
                    <Input
                      type="datetime-local"
                      value={periodInput.grades_edit_until}
                      onChange={(e) => setPeriodInput({ ...periodInput, grades_edit_until: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Edición planeación hasta</label>
                    <Input
                      type="datetime-local"
                      value={periodInput.planning_edit_until}
                      onChange={(e) => setPeriodInput({ ...periodInput, planning_edit_until: e.target.value })}
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
                  const activeYearObj = years.find(y => y.status === 'ACTIVE')
                  const displayYearId = selectedPeriodYear || activeYearObj?.id
                  const filteredPeriods = periods.filter(p => displayYearId ? p.academic_year === displayYearId : false)

                  if (filteredPeriods.length === 0) return <p className="text-slate-400 dark:text-slate-500 text-sm italic text-center py-4">No hay periodos para el año seleccionado.</p>

                  return filteredPeriods.map((p) => (
                    <div key={p.id} className="p-3 bg-white hover:bg-indigo-50 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 shadow-sm transition-colors group dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800/60">
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-700 dark:group-hover:text-indigo-300">{p.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-1">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 border dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                            {p.start_date} - {p.end_date}
                          </span>
                          <span className="text-slate-400 dark:text-slate-500 font-medium">
                            ({years.find(y => y.id === p.academic_year)?.year})
                          </span>
                        </div>
                        {(p.grades_edit_until || p.planning_edit_until) && (
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                            <div>
                              <span className="font-semibold text-slate-600 dark:text-slate-300">Notas hasta:</span>{' '}
                              {p.grades_edit_until ? new Date(p.grades_edit_until).toLocaleString() : '—'}
                            </div>
                            <div>
                              <span className="font-semibold text-slate-600 dark:text-slate-300">Planeación hasta:</span>{' '}
                              {p.planning_edit_until ? new Date(p.planning_edit_until).toLocaleString() : '—'}
                            </div>
                          </div>
                        )}
                      </div>
                      {(() => {
                        const yearObj = years.find(y => y.id === p.academic_year)
                        if (yearObj?.status === 'CLOSED') return null
                        return (
                          <div className="flex gap-1 opacity-100 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity w-full sm:w-auto justify-end">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-indigo-600 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-slate-800" onClick={() => onEditPeriod(p)}>✎</Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-950/30" onClick={() => onDeletePeriod(p.id)}>×</Button>
                          </div>
                        )
                      })()}
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
            <CardHeader className="bg-slate-50/50 border-b pb-3 dark:bg-slate-900/50 dark:border-slate-800">
              <CardTitle className="text-emerald-800 flex items-center gap-2">
                🏫 Institución
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {institutions.length === 0 && (
              <form onSubmit={onAddInstitution} className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800">
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
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Rector</label>
                    <select
                      className="w-full p-2 border rounded text-sm bg-white border-emerald-100 text-slate-900 focus:border-emerald-300 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Secretario/a</label>
                    <select
                      className="w-full p-2 border rounded text-sm bg-white border-emerald-100 text-slate-900 focus:border-emerald-300 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Escudo / Logo</label>
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
                  <div key={i.id} className="p-4 bg-white hover:bg-emerald-50 rounded-lg border border-slate-200 flex gap-4 items-center shadow-sm transition-colors dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800/60">
                    {i.logo && <img src={i.logo} alt="Logo" className="w-16 h-16 object-contain bg-white rounded border p-1 dark:bg-slate-950 dark:border-slate-800" />}
                    <div>
                      <div className="font-bold text-slate-800 text-lg dark:text-slate-100">{i.name}</div>
                      <div className="text-xs text-slate-500 mt-1 dark:text-slate-400">
                        <span className="font-semibold">NIT:</span> {i.nit} <span className="mx-2">|</span> <span className="font-semibold">DANE:</span> {i.dane_code}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 dark:text-slate-400">
                        <span className="font-semibold">Rector:</span> {i.rector_name || 'No asignado'} <span className="mx-2">|</span> <span className="font-semibold">Secretario:</span> {i.secretary_name || 'No asignado'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-teal-500 shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b pb-3 dark:bg-slate-900/50 dark:border-slate-800">
              <CardTitle className="text-teal-800 flex items-center gap-2">
                🏢 Sedes (Campus)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <form onSubmit={onAddCampus} className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800">
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
                  <div key={c.id} className="p-3 bg-white hover:bg-teal-50 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 shadow-sm transition-colors dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800/60">
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{c.name}</span>
                      {c.is_main && <span className="ml-2 text-xs bg-teal-100 text-teal-800 px-2 py-0.5 rounded border border-teal-200 dark:bg-teal-950/40 dark:text-teal-200 dark:border-teal-500/30">Principal</span>}
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto justify-end">
                      <Button size="sm" variant="ghost" className="text-teal-600 hover:text-teal-800 hover:bg-teal-100 dark:text-teal-300 dark:hover:bg-slate-800" onClick={() => onEditCampus(c.id)}>✎</Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30" onClick={() => onDeleteCampus(c.id)}>×</Button>
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
              <CardHeader className="bg-slate-50/50 border-b pb-3 dark:bg-slate-900/50 dark:border-slate-800">
                <CardTitle className="text-amber-800 flex items-center gap-2">
                  📊 Niveles Académicos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <form onSubmit={onAddLevel} className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800">
                  <Input
                    placeholder="Nombre Nivel (Ej: Básica Primaria)"
                    value={levelInput.name}
                    onChange={(e) => setLevelInput({...levelInput, name: e.target.value})}
                    className="border-amber-100 focus:border-amber-300 focus:ring-amber-200"
                  />
                  <select
                    className="w-full p-2 border rounded text-sm bg-white border-amber-100 text-slate-900 focus:border-amber-300 focus:ring-amber-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    value={levelInput.level_type}
                    onChange={(e) => setLevelInput({...levelInput, level_type: e.target.value})}
                  >
                    <option value="PRESCHOOL">Preescolar</option>
                    <option value="PRIMARY">Básica Primaria</option>
                    <option value="SECONDARY">Básica Secundaria</option>
                    <option value="MEDIA">Media Académica</option>
                  </select>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Edad Mín</label>
                      <Input
                        type="number"
                        value={levelInput.min_age}
                        onChange={(e) => setLevelInput({...levelInput, min_age: parseInt(e.target.value)})}
                        className="border-amber-100 focus:border-amber-300 focus:ring-amber-200"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Edad Máx</label>
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
                    <div key={l.id} className="p-3 bg-white hover:bg-amber-50 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 shadow-sm transition-colors dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800/60">
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-100">{l.name}</div>
                        <div className="text-xs text-slate-500 mt-1 dark:text-slate-400">
                          <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-200 dark:bg-amber-950/35 dark:text-amber-200 dark:border-amber-500/30">{l.level_type}</span>
                          <span className="ml-2 text-slate-400 dark:text-slate-500">({l.min_age}-{l.max_age} años)</span>
                        </div>
                      </div>
                      <div className="flex gap-2 w-full sm:w-auto justify-end">
                        <Button size="sm" variant="ghost" className="text-amber-600 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-slate-800" onClick={() => onEditLevel(l)}>✎</Button>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30" onClick={() => onDeleteLevel(l.id)}>×</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-t-4 border-t-orange-500 shadow-sm">
              <CardHeader className="bg-slate-50/50 border-b pb-3 dark:bg-slate-900/50 dark:border-slate-800">
                <CardTitle className="text-orange-800 flex items-center gap-2">
                  🎓 Grados Escolares
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <form onSubmit={onAddGrade} className="flex flex-col sm:flex-row gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800">
                  <Input
                    placeholder="Nombre Grado"
                    value={gradeInput}
                    onChange={(e) => setGradeInput(e.target.value)}
                    className="w-full flex-1 border-orange-100 focus:border-orange-300 focus:ring-orange-200"
                  />
                  <select
                    className="w-full sm:w-24 p-2 border rounded text-sm bg-white border-orange-100 text-slate-900 focus:border-orange-300 focus:ring-orange-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    value={gradeOrdinalInput}
                    onChange={(e) => setGradeOrdinalInput(e.target.value)}
                    title="Ordinal (orden institucional)"
                  >
                    <option value="">Ord...</option>
                    {Array.from({ length: 14 }, (_, i) => i - 2).map((n) => (
                      <option key={n} value={String(n)}>
                        {formatGradeOrdinal(n)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="w-full sm:w-32 p-2 border rounded text-sm bg-white border-orange-100 text-slate-900 focus:border-orange-300 focus:ring-orange-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    value={gradeLevelInput}
                    onChange={(e) => setGradeLevelInput(e.target.value)}
                  >
                    <option value="">Nivel...</option>
                    {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <Button type="submit" className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700 text-white">
                    {editingGradeId ? 'Actualizar' : 'Agregar'}
                  </Button>
                  {editingGradeId && (
                    <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onCancelEditGrade}>X</Button>
                  )}
                </form>
                <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                  {[...levels]
                    .sort((a, b) => {
                      const order: Record<string, number> = { 'PRESCHOOL': 1, 'PRIMARY': 2, 'SECONDARY': 3, 'MEDIA': 4 }
                      return (order[a.level_type] || 99) - (order[b.level_type] || 99)
                    })
                    .map(level => {
                      const levelGrades = grades
                        .filter(g => g.level === level.id)
                        .slice()
                        .sort((a, b) => {
                          const ao = a.ordinal === null || a.ordinal === undefined ? 999 : a.ordinal
                          const bo = b.ordinal === null || b.ordinal === undefined ? 999 : b.ordinal
                          if (ao !== bo) return ao - bo
                          return (a.name || '').localeCompare(b.name || '')
                        })
                      if (levelGrades.length === 0) return null
                      return (
                        <div key={level.id}>
                          <div className="text-xs font-bold text-orange-600 mb-2 uppercase tracking-wider flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                            {level.name}
                          </div>
                          <div className="space-y-2 pl-3 border-l-2 border-orange-100">
                            {levelGrades.map((g) => (
                              <div key={g.id} className="p-3 bg-white hover:bg-orange-50 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 shadow-sm transition-colors dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800/60">
                                <div className="flex items-center gap-2">
                                  <div className="font-bold text-slate-700 dark:text-slate-100">{g.name}</div>
                                  {g.ordinal !== null && g.ordinal !== undefined && (
                                    <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded border border-orange-200 dark:bg-orange-950/35 dark:text-orange-200 dark:border-orange-500/30" title="Ordinal">
                                      {formatGradeOrdinal(g.ordinal)}
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto justify-end">
                                  <Button size="sm" variant="ghost" className="text-orange-600 hover:text-orange-800 hover:bg-orange-100 dark:text-orange-300 dark:hover:bg-slate-800" onClick={() => onEditGrade(g)}>✎</Button>
                                  <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30" onClick={() => onDeleteGrade(g.id)}>×</Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}

                  {grades.filter(g => !g.level).length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">Sin Nivel Asignado</div>
                      <div className="space-y-2 pl-2 border-l-2 border-slate-200 dark:border-slate-800">
                        {grades.filter(g => !g.level).map((g) => (
                          <div key={g.id} className="p-2 bg-slate-50 rounded border flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 dark:bg-slate-900 dark:border-slate-800">
                            <div className="font-medium">{g.name}</div>
                            <div className="flex gap-2 w-full sm:w-auto justify-end">
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
            <CardHeader className="bg-slate-50/50 border-b pb-3 dark:bg-slate-900/50 dark:border-slate-800">
              <CardTitle className="text-fuchsia-800 flex items-center gap-2">
                📚 Áreas del Conocimiento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <form onSubmit={onAddArea} className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800">
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
              <Input
                placeholder="Buscar áreas…"
                value={areaSearch}
                onChange={(e) => setAreaSearch(e.target.value)}
              />
              <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
                {areas
                  .filter((a) => a.name.toLowerCase().includes(areaSearch.trim().toLowerCase()))
                  .map((a) => (
                    <div
                      key={a.id}
                      className="p-2 text-sm bg-white hover:bg-fuchsia-50 rounded border border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 group transition-colors dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800/60"
                    >
                      <span className="font-medium text-slate-700 dark:text-slate-100">{a.name}</span>
                      <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity w-full sm:w-auto justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 sm:h-6 sm:w-6 sm:p-0 text-fuchsia-600 hover:bg-fuchsia-100 dark:text-fuchsia-300 dark:hover:bg-slate-800"
                          onClick={() => onEditArea(a)}
                        >
                          ✎
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 sm:h-6 sm:w-6 sm:p-0 text-red-500 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-950/30"
                          onClick={() => onDeleteArea(a.id)}
                        >
                          ×
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Subjects Catalog Management */}
          <Card className="border-t-4 border-t-cyan-500 shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b pb-3 dark:bg-slate-900/50 dark:border-slate-800">
              <CardTitle className="text-cyan-800 flex items-center gap-2">
                📖 Catálogo de Asignaturas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <form onSubmit={onAddSubject} className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800">
                <select
                  className="w-full p-2 border rounded text-sm bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
              <Input
                placeholder="Buscar asignaturas…"
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
              />
              <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
                {subjects
                  .filter((s) => {
                    const q = subjectSearch.trim().toLowerCase()
                    if (!q) return true
                    const areaName = (areas.find((a) => a.id === s.area)?.name || '').toLowerCase()
                    return s.name.toLowerCase().includes(q) || areaName.includes(q)
                  })
                  .map((s) => (
                    <div
                      key={s.id}
                      className="p-2 text-sm bg-white hover:bg-cyan-50 rounded border border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 group transition-colors dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800/60"
                    >
                      <div>
                        <span className="font-medium text-slate-700 dark:text-slate-100 block">{s.name}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{areas.find(a => a.id === s.area)?.name}</span>
                      </div>
                      <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity w-full sm:w-auto justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 sm:h-6 sm:w-6 sm:p-0 text-cyan-600 hover:bg-cyan-100 dark:text-cyan-300 dark:hover:bg-slate-800"
                          onClick={() => onEditSubject(s)}
                        >
                          ✎
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 sm:h-6 sm:w-6 sm:p-0 text-red-500 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-950/30"
                          onClick={() => onDeleteSubject(s.id)}
                        >
                          ×
                        </Button>
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
              <CardHeader className="bg-slate-50/50 border-b pb-3 dark:bg-slate-900/50 dark:border-slate-800">
                <CardTitle className="text-violet-800 flex items-center gap-2">
                  🎓 Seleccionar Grado
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
                  {levels.map(level => {
                    const levelGrades = grades
                      .filter(g => g.level === level.id)
                      .slice()
                      .sort((a, b) => {
                        const ao = a.ordinal === null || a.ordinal === undefined ? -9999 : a.ordinal
                        const bo = b.ordinal === null || b.ordinal === undefined ? -9999 : b.ordinal
                        if (ao !== bo) return bo - ao
                        return (a.name || '').localeCompare(b.name || '')
                      })
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
                                  ? 'bg-violet-50 border-violet-500 text-violet-700 font-bold shadow-sm dark:bg-violet-950/35 dark:border-violet-500/40 dark:text-violet-200'
                                  : 'bg-white border-transparent hover:bg-slate-50 text-slate-600 hover:text-slate-900 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
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
                        {grades
                          .filter(g => !g.level)
                          .slice()
                          .sort((a, b) => {
                            const ao = a.ordinal === null || a.ordinal === undefined ? -9999 : a.ordinal
                            const bo = b.ordinal === null || b.ordinal === undefined ? -9999 : b.ordinal
                            if (ao !== bo) return bo - ao
                            return (a.name || '').localeCompare(b.name || '')
                          })
                          .map(g => (
                          <button
                            key={g.id}
                            onClick={() => setSelectedSubjectGrade(g.id)}
                            className={`w-full text-left px-3 py-2 rounded-md border transition-all text-sm ${
                              selectedSubjectGrade === g.id
                                ? 'bg-violet-50 border-violet-500 text-violet-700 font-bold shadow-sm dark:bg-violet-950/35 dark:border-violet-500/40 dark:text-violet-200'
                                : 'bg-white border-transparent hover:bg-slate-50 text-slate-600 hover:text-slate-900 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
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
              <CardHeader className="bg-slate-50/50 border-b pb-3 flex flex-row items-center justify-between dark:bg-slate-900/50 dark:border-slate-800">
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
                    className="text-indigo-700 border-indigo-200 hover:bg-indigo-50 dark:text-indigo-300 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    📋 Importar Plan
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-6 pt-4">
                {showCopyModal && (
                  <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200 mb-4 shadow-sm dark:bg-indigo-950/30 dark:border-indigo-500/30">
                    <h4 className="font-bold text-indigo-800 mb-2 flex items-center gap-2 dark:text-indigo-200">
                      <span className="text-xl">📋</span> Importar Plan de Estudios
                    </h4>
                    <p className="text-sm text-indigo-600 mb-3 dark:text-indigo-200/80">
                      Copia todas las asignaturas y configuraciones de otro grado al grado actual.
                      <br/>
                      <span className="font-bold text-red-500 dark:text-red-300">¡Advertencia! Esto reemplazará el plan actual.</span>
                    </p>
                    <div className="flex gap-2">
                      <select
                        className="flex-1 p-2 border rounded text-sm bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        value={copyFromGradeId}
                        onChange={(e) => setCopyFromGradeId(e.target.value)}
                      >
                        <option value="">Seleccionar Grado Origen</option>
                        {grades
                          .filter(g => g.id !== selectedSubjectGrade)
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
                  <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-300 dark:bg-slate-900/40 dark:border-slate-700">
                    <div className="text-4xl mb-3">👈</div>
                    <h3 className="text-lg font-medium text-slate-700 dark:text-slate-100">Selecciona un grado</h3>
                    <p className="text-slate-500 dark:text-slate-400">Selecciona un grado del menú lateral para configurar su plan de estudios.</p>
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
                          <div className={`p-4 rounded-lg border mb-4 dark:border-slate-800 ${isCompliant ? 'bg-green-50 border-green-200 dark:bg-green-950/25' : 'bg-amber-50 border-amber-200 dark:bg-amber-950/25'}`}>
                            <div className="flex justify-between items-end mb-2">
                              <div>
                                <h4 className={`font-bold ${isCompliant ? 'text-green-800 dark:text-green-200' : 'text-amber-800 dark:text-amber-200'}`}>
                                  Intensidad Horaria Semanal ({levelLabel})
                                </h4>
                                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                                  Norma Nacional: Mínimo <strong>{minHours} horas</strong>.
                                  {totalHours > minHours && <span className="ml-1 text-blue-600 dark:text-sky-300">(Jornada Única o Extendida)</span>}
                                </p>
                              </div>
                              <div className="text-right">
                                <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{totalHours} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">/ {minHours} h</span></div>
                              </div>
                            </div>
                            <div className="w-full bg-white rounded-full h-2.5 border dark:bg-slate-950 dark:border-slate-800">
                              <div 
                                className={`h-2.5 rounded-full transition-all duration-500 ${isCompliant ? 'bg-green-500' : 'bg-amber-500'}`} 
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>
                            {!isCompliant && (
                              <div className="mt-2 text-xs text-amber-700 dark:text-amber-200 flex items-center gap-1">
                                ⚠️ Faltan {minHours - totalHours} horas para cumplir el mínimo legal.
                              </div>
                            )}
                          </div>
                        )
                      }
                      return null
                    })()}

                    <form onSubmit={onAddAcademicLoad} className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200 shadow-sm dark:bg-slate-900/50 dark:border-slate-800">
                      <div className="sm:col-span-5">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1 block">Asignatura</label>
                        <select
                          className="w-full p-2 border rounded text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          value={academicLoadInput.subject}
                          onChange={(e) => setAcademicLoadInput({...academicLoadInput, subject: e.target.value})}
                        >
                          <option value="">Seleccionar Asignatura</option>
                          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div className="sm:col-span-3">
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1 block">Horas/Semana</label>
                        <Input
                          type="number"
                          min="1"
                          value={academicLoadInput.hours_per_week}
                          onChange={(e) => setAcademicLoadInput({...academicLoadInput, hours_per_week: parseInt(e.target.value) || 0})}
                          className="bg-white"
                        />
                      </div>
                      <div className="sm:col-span-4 flex items-end">
                        <div className="flex flex-col sm:flex-row gap-2 w-full">
                          <Button type="submit" className="w-full sm:flex-1 bg-indigo-600 hover:bg-indigo-700 text-white">
                            {editingAcademicLoadId ? 'Actualizar' : 'Agregar'}
                          </Button>
                          {editingAcademicLoadId && (
                            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onCancelEditAcademicLoad}>
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
                          <div key={area.id} className="border rounded-lg overflow-hidden shadow-sm bg-white dark:bg-slate-900 dark:border-slate-800">
                            <div className="bg-slate-50 px-4 py-2 border-b flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 dark:bg-slate-900/50 dark:border-slate-800">
                              <h4 className="font-bold text-slate-700 flex items-center gap-2 dark:text-slate-100">
                                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                {area.name}
                              </h4>
                              <div className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded border shadow-sm dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300">
                                {totalHours} Horas Semanales
                              </div>
                            </div>
                            <div className="divide-y">
                              {areaLoads.map(l => {
                                const subjectName = subjects.find(s => s.id === l.subject)?.name || 'Desconocida'
                                return (
                                  <div key={l.id} className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-slate-50 transition-colors group dark:hover:bg-slate-800/60">
                                    <div>
                                      <div className="font-medium text-slate-800 dark:text-slate-100">{subjectName}</div>
                                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex gap-3">
                                        <span className="flex items-center gap-1">
                                          ⏱️ {l.hours_per_week} Horas
                                        </span>
                                        <span className={`flex items-center gap-1 ${totalWeight !== 100 ? 'text-amber-600 font-bold' : ''}`}>
                                          📊 {l.weight_percentage}% Peso
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity w-full sm:w-auto justify-end">
                                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-indigo-600 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-slate-800" onClick={() => onEditAcademicLoad(l)}>✎</Button>
                                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-950/30" onClick={() => onDeleteAcademicLoad(l.id)}>×</Button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                            {totalWeight !== 100 && (
                              <div className="bg-amber-50 px-4 py-2 text-xs text-amber-700 border-t border-amber-100 flex items-center gap-2 dark:bg-amber-950/25 dark:text-amber-200 dark:border-amber-500/20">
                                ⚠️ La suma de porcentajes es {totalWeight}% (debería ser 100%)
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="h-auto py-0.5 px-2 text-amber-800 hover:bg-amber-100 ml-auto text-xs dark:text-amber-200 dark:hover:bg-slate-800"
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
                        <div className="text-center py-8 text-slate-400 dark:text-slate-500 italic">
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

      {(isGroupsOnly || activeTab === 'organization') && (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-3 space-y-6">
            <Card className="border-t-4 border-t-cyan-500 shadow-sm">
              <CardHeader className="sticky top-0 md:top-4 z-30 bg-slate-50/90 border-b pb-3 backdrop-blur dark:bg-slate-900/85 dark:border-slate-800">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <CardTitle className="text-cyan-800 flex items-center gap-2">
                    📋 Grupos Configurados
                  </CardTitle>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <Button
                      size="sm"
                      className="bg-cyan-600 hover:bg-cyan-700 text-white"
                      onClick={openNewGroupModal}
                      disabled={isGroupModalOpen}
                    >
                      + Nuevo grupo
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-cyan-600 border-cyan-200 hover:bg-cyan-50 dark:text-cyan-300 dark:border-slate-700 dark:hover:bg-slate-800"
                      onClick={openImportGroupsModal}
                      disabled={!groupInput.academic_year || isGroupModalOpen}
                    >
                      📥 Importar del año anterior
                    </Button>
                  </div>
                </div>

                {years.filter(y => y.status === 'ACTIVE').length === 0 ? null : (
                  <div className="mt-3 bg-cyan-50 p-3 rounded-lg border border-cyan-100 dark:bg-cyan-950/25 dark:border-cyan-500/20">
                    {/* Desktop filters */}
                    <div className="hidden md:flex md:items-center md:justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-cyan-700 dark:text-cyan-200">Año:</span>
                        <select
                          className="p-1.5 border border-cyan-200 rounded text-sm min-w-[120px] bg-white text-cyan-900 focus:ring-cyan-500 focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          value={groupInput.academic_year}
                          onChange={(e) => setGroupInput({ ...groupInput, academic_year: e.target.value })}
                          aria-label="Filtrar por año"
                        >
                          {years.map((y) => (
                            <option key={y.id} value={y.id}>
                              {y.year}
                            </option>
                          ))}
                        </select>

                        <span className="text-sm font-bold text-cyan-700 dark:text-cyan-200">Sede:</span>
                        <select
                          className="p-1.5 border border-cyan-200 rounded text-sm min-w-40 bg-white text-cyan-900 focus:ring-cyan-500 focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          value={groupCampusFilter}
                          onChange={(e) => setGroupCampusFilter(e.target.value as typeof groupCampusFilter)}
                          aria-label="Filtrar por sede"
                        >
                          <option value="ALL">Todas</option>
                          {campuses.map((c) => (
                            <option key={c.id} value={String(c.id)}>
                              {c.name}
                            </option>
                          ))}
                        </select>

                        <span className="text-sm font-bold text-cyan-700 dark:text-cyan-200">Jornada:</span>
                        <select
                          className="p-1.5 border border-cyan-200 rounded text-sm min-w-[140px] bg-white text-cyan-900 focus:ring-cyan-500 focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          value={groupShiftFilter}
                          onChange={(e) => setGroupShiftFilter(e.target.value as typeof groupShiftFilter)}
                          aria-label="Filtrar por jornada"
                        >
                          <option value="ALL">Todas</option>
                          <option value="MORNING">Mañana</option>
                          <option value="AFTERNOON">Tarde</option>
                          <option value="NIGHT">Noche</option>
                          <option value="FULL">Única</option>
                          <option value="WEEKEND">Fin de semana</option>
                        </select>

                        <span className="text-sm font-bold text-cyan-700 dark:text-cyan-200">Por pág:</span>
                        <select
                          className="p-1.5 border border-cyan-200 rounded text-sm min-w-[100px] bg-white text-cyan-900 focus:ring-cyan-500 focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          value={groupsPerPage}
                          onChange={(e) => setGroupsPerPage(parseInt(e.target.value) || 8)}
                          aria-label="Grupos por página"
                        >
                          <option value={8}>8</option>
                          <option value={12}>12</option>
                          <option value={24}>24</option>
                        </select>
                      </div>

                      <input
                        value={groupSearch}
                        onChange={(e) => setGroupSearch(e.target.value)}
                        placeholder="Buscar (grado, grupo, sede, director, salón)…"
                        className="w-full md:w-96 h-9 rounded-md border border-cyan-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>

                    {/* Mobile filters */}
                    <div className="md:hidden space-y-2">
                      <div className="grid grid-cols-1 gap-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] font-semibold text-cyan-700 dark:text-cyan-200">Año</label>
                            <select
                              className="w-full h-9 px-2 border border-cyan-200 rounded text-sm bg-white text-cyan-900 focus:ring-cyan-500 focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                              value={groupInput.academic_year}
                              onChange={(e) => setGroupInput({ ...groupInput, academic_year: e.target.value })}
                              aria-label="Filtrar por año"
                            >
                              {years.map((y) => (
                                <option key={y.id} value={y.id}>
                                  {y.year}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-cyan-700 dark:text-cyan-200">Sede</label>
                            <select
                              className="w-full h-9 px-2 border border-cyan-200 rounded text-sm bg-white text-cyan-900 focus:ring-cyan-500 focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                              value={groupCampusFilter}
                              onChange={(e) => setGroupCampusFilter(e.target.value as typeof groupCampusFilter)}
                              aria-label="Filtrar por sede"
                            >
                              <option value="ALL">Todas</option>
                              {campuses.map((c) => (
                                <option key={c.id} value={String(c.id)}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <input
                          value={groupSearch}
                          onChange={(e) => setGroupSearch(e.target.value)}
                          placeholder="Buscar grupos…"
                          className="w-full h-9 rounded-md border border-cyan-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />

                        <div className="flex items-center justify-between gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9"
                            onClick={() => setShowGroupFiltersMobile((v) => !v)}
                            aria-expanded={showGroupFiltersMobile}
                          >
                            {showGroupFiltersMobile ? 'Ocultar filtros' : 'Filtros'}
                            {activeGroupFilterCount > 0 ? ` (${activeGroupFilterCount})` : ''}
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-9"
                            onClick={() => {
                              setGroupSearch('')
                              setGroupCampusFilter('ALL')
                              setGroupShiftFilter('ALL')
                              setGroupsPerPage(8)
                            }}
                          >
                            Limpiar
                          </Button>
                        </div>

                        {showGroupFiltersMobile && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] font-semibold text-cyan-700 dark:text-cyan-200">Jornada</label>
                              <select
                                className="w-full h-9 px-2 border border-cyan-200 rounded text-sm bg-white text-cyan-900 focus:ring-cyan-500 focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                value={groupShiftFilter}
                                onChange={(e) => setGroupShiftFilter(e.target.value as typeof groupShiftFilter)}
                                aria-label="Filtrar por jornada"
                              >
                                <option value="ALL">Todas</option>
                                <option value="MORNING">Mañana</option>
                                <option value="AFTERNOON">Tarde</option>
                                <option value="NIGHT">Noche</option>
                                <option value="FULL">Única</option>
                                <option value="WEEKEND">Fin de semana</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-cyan-700 dark:text-cyan-200">Por página</label>
                              <select
                                className="w-full h-9 px-2 border border-cyan-200 rounded text-sm bg-white text-cyan-900 focus:ring-cyan-500 focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                value={groupsPerPage}
                                onChange={(e) => setGroupsPerPage(parseInt(e.target.value) || 8)}
                                aria-label="Grupos por página"
                              >
                                <option value={8}>8</option>
                                <option value={12}>12</option>
                                <option value={24}>24</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {years.filter(y => y.status === 'ACTIVE').length === 0 ? (
                  <div className="text-center py-12 text-slate-400 dark:text-slate-500 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700">
                    <p className="text-lg font-medium">No hay un año lectivo activo</p>
                    <p className="text-sm">Activa un año para visualizar los grupos.</p>
                  </div>
                ) : (
                  <>
                    {(() => {
                      const yearId = groupInput.academic_year
                      const gradeById = new Map(grades.map(gr => [gr.id, gr]))
                      const levelById = new Map(levels.map(l => [l.id, l]))
                      const order: Record<string, number> = { PRESCHOOL: 1, PRIMARY: 2, SECONDARY: 3, MEDIA: 4 }
                      const orderedLevels = [...levels].sort((a, b) => {
                        const ta = order[a.level_type] || 99
                        const tb = order[b.level_type] || 99
                        if (ta !== tb) return ta - tb
                        return (a.name || '').localeCompare(b.name || '')
                      })
                      const levelIndexById = new Map(orderedLevels.map((l, idx) => [l.id, idx]))

                      const getLevelMetaForGroup = (g: Group) => {
                        const grade = gradeById.get(g.grade)
                        const levelId = grade?.level ?? null
                        const levelName = levelId ? levelById.get(levelId)?.name ?? null : null
                        const levelIndex = levelId != null && levelIndexById.has(levelId) ? (levelIndexById.get(levelId) as number) : 999
                        return { levelId, levelName: levelName || 'Sin Nivel', levelIndex }
                      }

                      const q = (groupSearch || '').trim().toLowerCase()
                      const campusId = groupCampusFilter !== 'ALL' ? parseInt(groupCampusFilter) : null

                      const filteredGroups = groups
                        .filter(g => yearId && g.academic_year.toString() === yearId)
                        .filter(g => (groupShiftFilter === 'ALL' ? true : g.shift === groupShiftFilter))
                        .filter(g => (campusId ? g.campus === campusId : true))
                        .filter(g => {
                          if (!q) return true
                          const hay = [
                            g.grade_name,
                            g.name,
                            g.campus_name,
                            g.director_name,
                            g.classroom,
                          ]
                            .filter(Boolean)
                            .join(' ')
                            .toLowerCase()
                          return hay.includes(q)
                        })
                        .slice()
                        .sort((a, b) => {
                          const am = getLevelMetaForGroup(a)
                          const bm = getLevelMetaForGroup(b)
                          if (am.levelIndex !== bm.levelIndex) return am.levelIndex - bm.levelIndex

                          const gradeCmp = (a.grade_name || '').localeCompare(b.grade_name || '')
                          if (gradeCmp !== 0) return gradeCmp

                          return (a.name || '').localeCompare(b.name || '')
                        })

                      const totalPages = Math.max(1, Math.ceil(filteredGroups.length / Math.max(1, groupsPerPage)))
                      const currentPage = Math.min(groupsPage, totalPages)
                      const pageItems = filteredGroups.slice(
                        (currentPage - 1) * groupsPerPage,
                        currentPage * groupsPerPage
                      )

                      if (filteredGroups.length === 0) {
                        return (
                          <div className="text-center py-12 text-slate-400 dark:text-slate-500 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700">
                            <p className="text-lg font-medium">No hay grupos configurados</p>
                            <p className="text-sm">Intenta cambiar el filtro de año o crea un nuevo grupo.</p>
                          </div>
                        )
                      }

                      const groupCard = (g: Group) => (
                        (() => {
                          const meta = getLevelMetaForGroup(g)
                          const actionsOpen = openGroupActionsId === g.id
                          return (
                        <div
                          key={g.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => navigate(`/groups/${g.id}/students`, { state: { group: g } })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              navigate(`/groups/${g.id}/students`, { state: { group: g } })
                            }
                          }}
                          className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-cyan-300 group cursor-pointer dark:bg-slate-900 dark:border-slate-800 dark:hover:border-cyan-500/40"
                        >
                          <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-cyan-500 via-sky-500 to-indigo-500 opacity-80" />
                          <div className="flex justify-between items-start mb-2 gap-3">
                            <div>
                              <div className="text-lg font-bold text-slate-800 flex flex-wrap items-center gap-2 dark:text-slate-100">
                                <span className="inline-flex items-center gap-2">
                                  <span className="h-7 w-7 rounded-lg bg-cyan-50 text-cyan-700 border border-cyan-100 flex items-center justify-center text-xs font-extrabold dark:bg-cyan-950/25 dark:text-cyan-200 dark:border-cyan-500/20">
                                    G
                                  </span>
                                  <span>{g.grade_name}</span>
                                </span>
                                <span className="text-slate-300 dark:text-slate-700">•</span>
                                <span className="text-slate-700 dark:text-slate-100">Grupo {g.name}</span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                                  g.shift === 'MORNING' ? 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/35 dark:text-yellow-200 dark:border-yellow-500/30' :
                                  g.shift === 'AFTERNOON' ? 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/35 dark:text-orange-200 dark:border-orange-500/30' :
                                  g.shift === 'NIGHT' ? 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/35 dark:text-indigo-200 dark:border-indigo-500/30' :
                                  'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
                                }`}>
                                  {g.shift === 'MORNING' ? 'Mañana' :
                                   g.shift === 'AFTERNOON' ? 'Tarde' :
                                   g.shift === 'NIGHT' ? 'Noche' :
                                   g.shift === 'FULL' ? 'Única' : 'Fin de Semana'}
                                </span>
                                <span className="text-xs font-semibold px-2 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">Nivel: {meta.levelName}</span>
                              </div>
                              <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2 dark:text-slate-400">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border ${getCampusBadgeClasses(
                                    typeof g.campus === 'number' ? g.campus : null
                                  )}`}
                                >
                                  <span className="font-semibold">Sede:</span> {g.campus_name || 'Sin Sede'}
                                </span>
                                {g.classroom && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 border border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                                    <span className="font-semibold">Salón:</span> {g.classroom}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-start gap-2" data-group-actions-root="true" onClick={(e) => e.stopPropagation()}>
                              <div className="text-xs font-bold bg-cyan-50 text-cyan-700 px-2 py-1 rounded border border-cyan-100 dark:bg-cyan-950/25 dark:text-cyan-200 dark:border-cyan-500/20">
                                {years.find(y => y.id === g.academic_year)?.year}
                              </div>

                              <div className="relative" data-group-actions-root="true">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-9 w-9 p-0 md:h-7 md:w-7"
                                  aria-haspopup="menu"
                                  aria-expanded={actionsOpen}
                                  onClick={() => setOpenGroupActionsId((prev) => (prev === g.id ? null : g.id))}
                                  title="Acciones"
                                >
                                  ⋮
                                </Button>

                                {actionsOpen && (
                                  <div
                                    className="absolute right-0 mt-2 w-48 rounded-md border border-slate-200 bg-white shadow-lg z-30 overflow-hidden dark:border-slate-800 dark:bg-slate-900"
                                    role="menu"
                                    aria-label="Acciones del grupo"
                                    data-group-actions-root="true"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                                      role="menuitem"
                                      onClick={() => {
                                        setOpenGroupActionsId(null)
                                        onEditGroup(g)
                                      }}
                                    >
                                      Editar
                                    </button>
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                                      role="menuitem"
                                      onClick={() => {
                                        setOpenGroupActionsId(null)
                                        printManualAttendanceSheet(g.id)
                                      }}
                                    >
                                      Imprimir planilla
                                    </button>
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                                      role="menuitem"
                                      onClick={() => {
                                        setOpenGroupActionsId(null)
                                        openGradeSheetModal(g)
                                      }}
                                    >
                                      Imprimir planilla de notas
                                    </button>
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                                      role="menuitem"
                                      onClick={() => {
                                        setOpenGroupActionsId(null)
                                        const params = new URLSearchParams()
                                        params.set('group', String(g.id))
                                        params.set('returnTo', `/groups/${g.id}/students`)
                                        navigate(`/enrollments/new?${params.toString()}`)
                                      }}
                                    >
                                      Matricular (nuevo)
                                    </button>
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                                      role="menuitem"
                                      onClick={() => {
                                        setOpenGroupActionsId(null)
                                        const params = new URLSearchParams()
                                        params.set('group', String(g.id))
                                        params.set('returnTo', `/groups/${g.id}/students`)
                                        navigate(`/enrollments/existing?${params.toString()}`)
                                      }}
                                    >
                                      Matricular (antiguo)
                                    </button>
                                    <div className="h-px bg-slate-100 dark:bg-slate-800" />
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
                                      role="menuitem"
                                      onClick={() => {
                                        setOpenGroupActionsId(null)
                                        onDeleteGroup(g.id)
                                      }}
                                    >
                                      Eliminar
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3 dark:border-slate-800">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${
                              g.director_name ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/35 dark:text-cyan-200' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                              {g.director_name ? g.director_name.charAt(0) : '?'}
                            </div>
                            <div>
                              <div className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">Director de Grupo</div>
                              <div className={`text-sm font-medium ${g.director_name ? 'text-slate-700 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500 italic'}`}>
                                {g.director_name || 'Sin asignar'}
                              </div>
                            </div>
                            <div className="ml-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-9 sm:h-8 w-full sm:w-auto"
                                disabled={printingManualSheetGroupId === g.id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  printManualAttendanceSheet(g.id)
                                }}
                              >
                                {printingManualSheetGroupId === g.id ? 'Generando…' : 'Imprimir planilla'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9 sm:h-8 w-full sm:w-auto"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate(`/groups/${g.id}/students`, { state: { group: g } })
                                }}
                              >
                                Ver estudiantes
                              </Button>
                            </div>
                          </div>
                        </div>
                          )
                        })()
                      )

                      return (
                        <div className="space-y-5">
                          {totalPages > 1 && (
                            <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                Página {currentPage} de {totalPages} • {filteredGroups.length} grupos
                              </div>

                              {/* Mobile pagination (no overflow) */}
                              <div className="flex items-center gap-2 md:hidden">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8"
                                  disabled={currentPage <= 1}
                                  onClick={() => setGroupsPage(Math.max(1, currentPage - 1))}
                                >
                                  ◀
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8"
                                  disabled={currentPage >= totalPages}
                                  onClick={() => setGroupsPage(Math.min(totalPages, currentPage + 1))}
                                >
                                  ▶
                                </Button>
                              </div>

                              {/* Desktop pagination */}
                              <div className="hidden md:flex flex-wrap gap-1 justify-end">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                                  <Button
                                    key={p}
                                    variant={p === currentPage ? 'secondary' : 'outline'}
                                    size="sm"
                                    className="h-8 px-2"
                                    onClick={() => setGroupsPage(p)}
                                    aria-current={p === currentPage ? 'page' : undefined}
                                  >
                                    {p}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {pageItems.map(groupCard)}
                          </div>
                        </div>
                      )
                    })()}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'evaluation' && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="md:col-span-1 h-fit shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b pb-3 dark:bg-slate-900/50 dark:border-slate-800">
              <CardTitle className="text-lg text-slate-700 dark:text-slate-100">
                {editingScaleId ? 'Editar Escala' : 'Nueva Escala'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={onAddScale} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Año Lectivo</label>
                  <select
                    className="w-full p-2 border rounded-md bg-white text-slate-900 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Nombre de la Escala</label>
                  <Input
                    placeholder="Ej. Superior, Alto, Básico..."
                    value={scaleInput.name}
                    onChange={(e) => setScaleInput({ ...scaleInput, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Tipo de Escala</label>
                  <select
                    className="w-full p-2 border rounded-md bg-white text-slate-900 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    value={scaleInput.scale_type}
                    onChange={(e) => setScaleInput({ ...scaleInput, scale_type: e.target.value as 'NUMERIC' | 'QUALITATIVE' })}
                  >
                    <option value="NUMERIC">Numérica (Básica/Media)</option>
                    <option value="QUALITATIVE">Cualitativa (Preescolar)</option>
                  </select>
                </div>

                {scaleInput.scale_type === 'NUMERIC' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Mínimo</label>
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
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Máximo</label>
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
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Descripción (Opcional)</label>
                  <textarea
                    className="w-full p-2 border rounded-md bg-white text-slate-900 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    rows={3}
                    placeholder="Descripción del desempeño..."
                    value={scaleInput.description}
                    onChange={(e) => setScaleInput({ ...scaleInput, description: e.target.value })}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <Button type="submit" className="w-full sm:flex-1 bg-rose-600 hover:bg-rose-700 text-white">
                    {editingScaleId ? 'Actualizar' : 'Guardar'}
                  </Button>
                  {editingScaleId && (
                    <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onCancelEditScale}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
            </Card>

            <Card className="md:col-span-2 border-t-4 border-t-rose-500 shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b pb-3 dark:bg-slate-900/50 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <CardTitle className="text-rose-800 flex items-center gap-2">
                  📊 Escala de Valoración (SIEE)
                </CardTitle>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full sm:w-auto text-rose-600 border-rose-200 hover:bg-rose-50 dark:text-rose-300 dark:border-slate-700 dark:hover:bg-slate-800"
                  onClick={() => setShowCopyScalesModal(true)}
                >
                  📋 Copiar desde otro año
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-rose-50 p-3 rounded-lg border border-rose-100 mb-4 dark:bg-rose-950/25 dark:border-rose-500/20">
                <span className="text-sm font-bold text-rose-700 dark:text-rose-200">Filtrar por Año:</span>
                <select
                  className="w-full sm:w-auto p-1.5 border border-rose-200 rounded text-sm sm:min-w-[120px] bg-white text-rose-900 focus:ring-rose-500 focus:border-rose-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={selectedScaleYear || ''}
                  onChange={(e) => setSelectedScaleYear(e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">Todos los años</option>
                  {years.map(y => <option key={y.id} value={y.id}>{y.year}</option>)}
                </select>
              </div>

              <div className="space-y-3">
                {scales.filter(s => !selectedScaleYear || s.academic_year === selectedScaleYear).length === 0 && (
                  <div className="text-center py-12 text-slate-400 dark:text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300 dark:bg-slate-900/40 dark:border-slate-700">
                    <p className="text-lg font-medium">No hay escala de valoración configurada</p>
                    <p className="text-sm">Utiliza el formulario para agregar los rangos de desempeño.</p>
                  </div>
                )}
                {scales.filter(s => !selectedScaleYear || s.academic_year === selectedScaleYear).map((s) => (
                  <div key={s.id} className="p-4 bg-white hover:bg-rose-50 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 shadow-sm transition-colors group dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800/60">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg text-slate-800 dark:text-slate-100">{s.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${s.scale_type === 'QUALITATIVE' ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/35 dark:text-purple-200 dark:border-purple-500/30' : 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/35 dark:text-blue-200 dark:border-blue-500/30'}`}>
                          {s.scale_type === 'QUALITATIVE' ? 'Cualitativa' : 'Numérica'}
                        </span>
                      </div>
                      {s.description && <p className="text-sm text-slate-600 mt-1 dark:text-slate-300">{s.description}</p>}
                      <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">
                        Año: {years.find(y => y.id === s.academic_year)?.year}
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
                      {s.scale_type === 'NUMERIC' && (
                        <span className="text-rose-700 bg-rose-100 px-4 py-1.5 rounded-full text-sm font-bold border border-rose-200 dark:bg-rose-950/35 dark:text-rose-200 dark:border-rose-500/30 self-start sm:self-auto">
                          {s.min_score} - {s.max_score}
                        </span>
                      )}
                      <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity w-full sm:w-auto justify-end">
                        <Button size="sm" variant="ghost" className="h-10 w-10 p-0 sm:h-8 sm:w-8 sm:p-0" onClick={() => onEditScale(s)}>
                          ✏️
                        </Button>
                        <Button size="sm" variant="ghost" className="h-10 w-10 p-0 sm:h-8 sm:w-8 sm:p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30" onClick={() => onDeleteScale(s.id)}>
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

      <ConfirmationModal
        isOpen={academicLoadToDelete !== null}
        onClose={() => {
          if (!deletingAcademicLoad) setAcademicLoadToDelete(null)
        }}
        onConfirm={confirmDeleteAcademicLoad}
        title="Eliminar Carga Académica"
        description="¿Estás seguro de eliminar esta carga académica? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        variant="destructive"
        loading={deletingAcademicLoad}
      />

      <ConfirmationModal
        isOpen={importGroupsModalOpen}
        onClose={() => {
          if (!importingGroups) setImportGroupsModalOpen(false)
        }}
        onConfirm={confirmImportGroups}
        title="Importar grupos del año anterior"
        description={`Se importarán los grupos del año ${years.find((y) => y.id === importGroupsSourceYearId)?.year ?? ''} al año ${years.find((y) => y.id === importGroupsTargetYearId)?.year ?? ''}. Si el año destino ya tiene grupos, se bloqueará la importación.`}
        confirmText="Importar"
        loading={importingGroups}
      />

      {/* Copy Scales Modal */}
      {showCopyScalesModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200 dark:bg-slate-900 dark:border dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-800 mb-4 dark:text-slate-100">Copiar Escalas de Valoración</h3>
            <p className="text-sm text-slate-600 mb-4 dark:text-slate-300">
              Selecciona el año de origen y el año de destino para copiar las escalas de valoración.
              Las escalas con el mismo nombre no se duplicarán.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Año Origen (Desde)</label>
                <select
                  className="w-full p-2 border rounded-md bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Año Destino (Para)</label>
                <select
                  className="w-full p-2 border rounded-md bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-6">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setShowCopyScalesModal(false)}>
                Cancelar
              </Button>
              <Button 
                className="bg-rose-600 hover:bg-rose-700 text-white"
                className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white"
                onClick={handleCopyScales}
                disabled={!copyScalesData.sourceYear || !copyScalesData.targetYear}
              >
                Copiar Escalas
              </Button>
            </div>
          </div>
        </div>
      )}

      {isGroupModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={closeGroupModal} />
            <div className="relative w-full max-w-2xl">
              <Card className="border border-slate-200 shadow-xl max-h-[calc(100vh-2rem)] flex flex-col dark:border-slate-800">
                <CardHeader className="bg-white border-b shrink-0 dark:bg-slate-900 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-slate-900 dark:text-slate-100">
                    {editingGroupId ? 'Editar grupo' : 'Nuevo grupo'}
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={closeGroupModal} aria-label="Cerrar">
                    ×
                  </Button>
                </div>
                </CardHeader>

                <CardContent className="pt-4 flex-1 overflow-y-auto">
                  <form onSubmit={onAddGroup} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Año lectivo</label>
                      <select
                        className="w-full p-2 border rounded text-sm bg-white text-slate-900 focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        value={groupInput.academic_year}
                        onChange={(e) => setGroupInput({ ...groupInput, academic_year: e.target.value })}
                        required
                      >
                        <option value="">Seleccionar año...</option>
                        {years.map((y) => (
                          <option key={y.id} value={y.id}>
                            {y.year}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Sede (campus)</label>
                      <select
                        className="w-full p-2 border rounded text-sm bg-white text-slate-900 focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        value={groupInput.campus}
                        onChange={(e) => setGroupInput({ ...groupInput, campus: e.target.value })}
                        required
                      >
                        <option value="">Seleccionar sede...</option>
                        {campuses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Grado</label>
                    <select
                      className="w-full p-2 border rounded text-sm bg-white text-slate-900 focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      value={groupInput.grade}
                      onChange={(e) => setGroupInput({ ...groupInput, grade: e.target.value })}
                      required
                    >
                      <option value="">Seleccionar grado...</option>
                      {levels.map((level) => {
                        const levelGrades = grades
                          .filter((g) => g.level === level.id)
                          .slice()
                          .sort((a, b) => {
                            const ao = a.ordinal === null || a.ordinal === undefined ? -9999 : a.ordinal
                            const bo = b.ordinal === null || b.ordinal === undefined ? -9999 : b.ordinal
                            if (ao !== bo) return bo - ao
                            return (a.name || '').localeCompare(b.name || '')
                          })
                        if (levelGrades.length === 0) return null
                        return (
                          <optgroup key={level.id} label={level.name}>
                            {levelGrades.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </optgroup>
                        )
                      })}
                      {grades.filter((g) => !g.level).length > 0 && (
                        <optgroup label="Sin Nivel">
                          {grades
                            .filter((g) => !g.level)
                            .slice()
                            .sort((a, b) => {
                              const ao = a.ordinal === null || a.ordinal === undefined ? -9999 : a.ordinal
                              const bo = b.ordinal === null || b.ordinal === undefined ? -9999 : b.ordinal
                              if (ao !== bo) return bo - ao
                              return (a.name || '').localeCompare(b.name || '')
                            })
                            .map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Grupo</label>
                      <Input
                        placeholder="Ej: A, 01"
                        value={groupInput.name}
                        onChange={(e) => setGroupInput({ ...groupInput, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Salón</label>
                      <Input
                        placeholder="Ej: 101"
                        value={groupInput.classroom}
                        onChange={(e) => setGroupInput({ ...groupInput, classroom: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Jornada</label>
                      <select
                        className="w-full p-2 border rounded text-sm bg-white text-slate-900 focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        value={groupInput.shift}
                        onChange={(e) => setGroupInput({ ...groupInput, shift: e.target.value })}
                      >
                        <option value="MORNING">Mañana</option>
                        <option value="AFTERNOON">Tarde</option>
                        <option value="NIGHT">Noche</option>
                        <option value="FULL">Jornada Única</option>
                        <option value="WEEKEND">Fin de Semana</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Director de grupo</label>
                    <select
                      className="w-full p-2 border rounded text-sm bg-white text-slate-900 focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      value={groupInput.director}
                      onChange={(e) => setGroupInput({ ...groupInput, director: e.target.value })}
                    >
                      <option value="">Seleccionar docente...</option>
                      {users
                        .filter((u) => u.role === 'TEACHER')
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.first_name} {u.last_name}
                          </option>
                        ))}
                    </select>
                  </div>

                  {groupInput.director && (
                    <div className="flex items-start space-x-2 bg-amber-50 p-3 rounded border border-amber-200 dark:bg-amber-950/25 dark:border-amber-500/30">
                      <input
                        type="checkbox"
                        id="multigrade"
                        className="mt-1 rounded border-amber-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
                        checked={isMultigrade}
                        onChange={(e) => setIsMultigrade(e.target.checked)}
                      />
                      <label htmlFor="multigrade" className="text-xs text-amber-800 dark:text-amber-200 cursor-pointer select-none leading-tight">
                        <strong>Grupo multigrado</strong>
                        <br />
                        Permitir que este docente dirija múltiples grupos.
                      </label>
                    </div>
                  )}

                  <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={closeGroupModal}>
                      Cancelar
                    </Button>
                    <Button type="submit" className="bg-cyan-600 hover:bg-cyan-700 text-white">
                      {editingGroupId ? 'Guardar cambios' : 'Crear grupo'}
                    </Button>
                  </div>
                  </form>
                </CardContent>
              </Card>
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

      {isGradeSheetModalOpen && gradeSheetModalGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
          <div className="fixed inset-0 bg-black/50 transition-opacity backdrop-blur-sm" onClick={closeGradeSheetModal} />
          <div className="relative z-50 w-full max-w-lg transform overflow-hidden rounded-lg bg-white p-6 shadow-xl transition-all sm:mx-auto animate-in fade-in zoom-in-95 duration-200 dark:bg-slate-900">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold leading-6 text-slate-900 dark:text-slate-100">
                Imprimir planilla de notas
              </h3>
              <button
                onClick={closeGradeSheetModal}
                className="rounded-full p-1 hover:bg-slate-100 transition-colors disabled:opacity-50 dark:hover:bg-slate-800"
                disabled={printingGradeSheet}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Grupo</label>
                <div className="text-sm text-slate-700 dark:text-slate-200">
                  {gradeSheetModalGroup.grade_name ? `${gradeSheetModalGroup.grade_name}-${gradeSheetModalGroup.name}` : `Grupo ${gradeSheetModalGroup.name}`}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Asignatura/Docente (del grupo)</label>
                  <select
                    className="w-full p-2 border rounded text-sm bg-white text-slate-900 focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    value={gradeSheetAssignmentId}
                    onChange={(e) => {
                      const next = e.target.value
                      setGradeSheetAssignmentId(next)
                      const picked = gradeSheetAssignments.find((a) => String(a.id) === next)
                      if (picked) {
                        setGradeSheetTeacher(picked.teacher_name || '')
                        const subj = [picked.area_name, picked.subject_name].filter(Boolean).join(' - ') || picked.academic_load_name || ''
                        setGradeSheetSubject(subj)
                      }
                    }}
                    disabled={gradeSheetAssignmentsLoading || gradeSheetAssignments.length === 0}
                  >
                    {gradeSheetAssignments.length === 0 ? (
                      <option value="">
                        {gradeSheetAssignmentsLoading ? 'Cargando asignaciones…' : 'Sin asignaciones (puedes escribir manual)'}
                      </option>
                    ) : (
                      gradeSheetAssignments.map((a) => (
                        <option key={a.id} value={a.id}>
                          {([a.area_name, a.subject_name].filter(Boolean).join(' - ') || a.academic_load_name || 'Asignatura') +
                            (a.teacher_name ? ` — ${a.teacher_name}` : '')}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Período</label>
                  <select
                    className="w-full p-2 border rounded text-sm bg-white text-slate-900 focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400 outline-none transition-all dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    value={gradeSheetPeriodId}
                    onChange={(e) => setGradeSheetPeriodId(e.target.value)}
                  >
                    <option value="">(En blanco)</option>
                    {periods
                      .filter((p) => p.academic_year === gradeSheetModalGroup.academic_year)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Docente</label>
                  <Input
                    placeholder="Nombre del docente (opcional)"
                    value={gradeSheetTeacher}
                    onChange={(e) => setGradeSheetTeacher(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Área/Asignatura</label>
                <Input
                  placeholder="Ej: Matemáticas"
                  value={gradeSheetSubject}
                  onChange={(e) => setGradeSheetSubject(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={closeGradeSheetModal} disabled={printingGradeSheet}>
                Cancelar
              </Button>
              <Button
                className="bg-cyan-600 hover:bg-cyan-700 text-white"
                onClick={confirmPrintGradeReportSheet}
                disabled={printingGradeSheet}
              >
                {printingGradeSheet ? 'Generando…' : 'Imprimir'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

