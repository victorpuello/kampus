import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GraduationCap, Save, Trash2 } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  academicApi,
  type Grade,
  type GradebookAvailableSheet,
  type GradebookResponse,
  type GradeSheetListItem,
  type GradeSheetGradingMode,
  type GradebookActivityColumn,
  type Group,
  type Period,
  type TeacherAssignment,
} from '../services/academic'
import { useAuthStore } from '../store/auth'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { ConfirmationModal } from '../components/ui/ConfirmationModal'
import { Input } from '../components/ui/Input'
import { Toast, type ToastType } from '../components/ui/Toast'

type CellKey = `${number}:${number}`
type ActivityCellKey = `${number}:${number}`

const makeKey = (enrollmentId: number, achievementId: number): CellKey => `${enrollmentId}:${achievementId}`
const makeActivityKey = (enrollmentId: number, columnId: number): ActivityCellKey => `${enrollmentId}:${columnId}`

type BlockedAny = { enrollment: number; reason: string; achievement?: number; column?: number }

function isCurrentPeriod(period: Period): boolean {
  const start = new Date(`${period.start_date}T00:00:00`)
  const end = new Date(`${period.end_date}T23:59:59`)
  const now = new Date()
  return now.getTime() >= start.getTime() && now.getTime() <= end.getTime()
}

const sanitizeScoreInput = (raw: string): string => {
  // Allow teachers to type decimals using comma; normalize to dot.
  // Also keep only digits and a single dot to reduce accidental invalid values.
  const normalized = raw.replace(/,/g, '.')
  let out = ''
  let dotSeen = false
  for (const ch of normalized) {
    if (ch >= '0' && ch <= '9') out += ch
    else if (ch === '.' && !dotSeen) {
      out += ch
      dotSeen = true
    }
  }
  return out
}

const parseScoreOrNull = (raw: string): number | null => {
  const trimmed = sanitizeScoreInput(raw).trim()
  if (!trimmed) return null
  const score = Number(trimmed)
  if (!Number.isFinite(score)) return NaN
  return score
}

export default function Grades() {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  const navigate = useNavigate()

  const teacherMode = user?.role === 'TEACHER'
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN'

  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [grades, setGrades] = useState<Grade[]>([])

  const [selectedGradeId, setSelectedGradeId] = useState<number | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [selectedAcademicLoadId, setSelectedAcademicLoadId] = useState<number | null>(null)
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedTeacherAssignmentId, setSelectedTeacherAssignmentId] = useState<number | null>(null)

  const [gradebook, setGradebook] = useState<GradebookResponse | null>(null)

  const [availableSheets, setAvailableSheets] = useState<GradebookAvailableSheet[]>([])
  const [loadingSheets, setLoadingSheets] = useState(false)
  const [sheetsPage, setSheetsPage] = useState(1)

  const [adminSheets, setAdminSheets] = useState<GradeSheetListItem[]>([])
  const [adminSheetsCount, setAdminSheetsCount] = useState(0)
  const [adminSheetsLoading, setAdminSheetsLoading] = useState(false)
  const [adminSheetsPage, setAdminSheetsPage] = useState(1)
  const [adminSheetsSearch, setAdminSheetsSearch] = useState('')
  const [adminSheetsDebouncedSearch, setAdminSheetsDebouncedSearch] = useState('')

  const [loadingInit, setLoadingInit] = useState(true)
  const [loadingGradebook, setLoadingGradebook] = useState(false)
  const [saving, setSaving] = useState(false)

  const saveTimersRef = useRef<Record<CellKey, number>>({})
  const inFlightSavesRef = useRef<Set<CellKey>>(new Set())
  const statusTimersRef = useRef<Record<CellKey, number>>({})
  const lastInteractionRef = useRef<'keyboard' | 'pointer'>('pointer')
  const [cellStatus, setCellStatus] = useState<Record<CellKey, 'saving' | 'saved' | 'error'>>({})
  const [computedOverrides, setComputedOverrides] = useState<Record<number, { final_score: number | string; scale: string | null }>>({})

  const activitySaveTimersRef = useRef<Record<ActivityCellKey, number>>({})
  const inFlightActivitySavesRef = useRef<Set<ActivityCellKey>>(new Set())
  const activityStatusTimersRef = useRef<Record<ActivityCellKey, number>>({})
  const [activityCellStatus, setActivityCellStatus] = useState<Record<ActivityCellKey, 'saving' | 'saved' | 'error'>>({})

  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }, [])

  const loadAdminGradeSheets = useCallback(
    async (opts?: { page?: number; search?: string }) => {
      if (!isAdmin) return

      const page = opts?.page ?? adminSheetsPage
      const search = opts?.search ?? adminSheetsDebouncedSearch

      setAdminSheetsLoading(true)
      try {
        const res = await academicApi.listGradeSheets({
          page,
          page_size: 20,
          search: search.trim() ? search.trim() : undefined,
          ordering: '-updated_at',
        })

        const data = res.data as unknown
        const results: GradeSheetListItem[] = Array.isArray(data)
          ? (data as GradeSheetListItem[])
          : (((data as { results?: unknown })?.results ?? []) as GradeSheetListItem[])
        const count: number = Array.isArray(data)
          ? results.length
          : typeof (data as { count?: unknown })?.count === 'number'
            ? ((data as { count: number }).count as number)
            : results.length

        setAdminSheets(results)
        setAdminSheetsCount(count)
      } catch (e) {
        console.error(e)
        setAdminSheets([])
        setAdminSheetsCount(0)
        showToast('No se pudieron cargar las planillas', 'error')
      } finally {
        setAdminSheetsLoading(false)
      }
    },
    [adminSheetsDebouncedSearch, adminSheetsPage, isAdmin, showToast]
  )

  const handleOpenAdminSheet = useCallback(
    (sheet: GradeSheetListItem) => {
      setSelectedGradeId(null)
      setSelectedGroupId(null)
      setSelectedAcademicLoadId(null)

      setSelectedTeacherAssignmentId(sheet.teacher_assignment)
      setSelectedPeriodId(sheet.period)
      setGradebook(null)
    },
    [setGradebook]
  )

  useEffect(() => {
    if (!isAdmin) return
    const timeoutId = window.setTimeout(() => {
      setAdminSheetsDebouncedSearch(adminSheetsSearch)
    }, 300)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [adminSheetsSearch, isAdmin])

  const getFilenameFromContentDisposition = (value?: string) => {
    if (!value) return null
    const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i.exec(value)
    const raw = match?.[1] || match?.[2] || match?.[3]
    if (!raw) return null
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  const handleDownloadGroupReport = useCallback(async () => {
    const groupId = gradebook?.teacher_assignment?.group ?? selectedGroupId
    const periodId = gradebook?.period?.id ?? selectedPeriodId

    if (!groupId || !periodId) {
      showToast('Selecciona grupo y periodo.', 'error')
      return
    }

    try {
      const res = await academicApi.downloadAcademicPeriodReportByGroup(groupId, periodId)
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
      const headers = res.headers as Record<string, string | undefined>
      const filename =
        getFilenameFromContentDisposition(headers?.['content-disposition']) ||
        `informe-academico-grupo-${groupId}-period-${periodId}.pdf`

      downloadBlob(blob, filename)
    } catch (e) {
      console.error(e)
      showToast('Error al descargar el informe del grupo', 'error')
    }
  }, [gradebook?.period?.id, gradebook?.teacher_assignment?.group, selectedGroupId, selectedPeriodId, showToast])

  const selectedPeriod = useMemo(() => {
    if (!selectedPeriodId) return null
    return periods.find((p) => p.id === selectedPeriodId) ?? null
  }, [periods, selectedPeriodId])

  const [activeGradeGrant, setActiveGradeGrant] = useState<
    | null
    | {
        hasFull: boolean
        allowedEnrollments: Set<number>
        validUntil: string | null
      }
  >(null)
  const [loadingGradeGrant, setLoadingGradeGrant] = useState(false)
  const [lastBlocked, setLastBlocked] = useState<BlockedAny[]>([])

  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resettingSheet, setResettingSheet] = useState(false)

  const gradeWindowClosed = useMemo(() => {
    if (user?.role !== 'TEACHER') return false
    const until = selectedPeriod?.grades_edit_until
    if (until) return Date.now() > new Date(until).getTime()

    // Fallback: if no explicit deadline configured, use end of period end_date.
    const endDate = selectedPeriod?.end_date
    if (!endDate) return false
    const fallback = new Date(`${endDate}T23:59:59`).getTime()
    return Date.now() > fallback
  }, [selectedPeriod?.end_date, selectedPeriod?.grades_edit_until, user?.role])

  const replaceTeacherSearch = useCallback(
    (periodId: number | null, teacherAssignmentId: number | null) => {
      const params = new URLSearchParams()
      if (periodId) params.set('period', String(periodId))
      if (teacherAssignmentId) params.set('ta', String(teacherAssignmentId))

      const nextSearch = params.toString() ? `?${params.toString()}` : ''
      if (location.search === nextSearch) return
      navigate({ pathname: location.pathname, search: nextSearch }, { replace: true })
    },
    [location.pathname, location.search, navigate]
  )

  const [baseValues, setBaseValues] = useState<Record<CellKey, string>>({})
  const [cellValues, setCellValues] = useState<Record<CellKey, string>>({})
  const [dirtyKeys, setDirtyKeys] = useState<Set<CellKey>>(new Set())

  const [activityBaseValues, setActivityBaseValues] = useState<Record<ActivityCellKey, string>>({})
  const [activityValues, setActivityValues] = useState<Record<ActivityCellKey, string>>({})
  const [dirtyActivityKeys, setDirtyActivityKeys] = useState<Set<ActivityCellKey>>(new Set())

  const [editingActivityColumnId, setEditingActivityColumnId] = useState<number | null>(null)
  const [editingActivityColumnLabel, setEditingActivityColumnLabel] = useState('')
  const [savingActivityColumnEdit, setSavingActivityColumnEdit] = useState(false)

  const activitiesMode = gradebook?.gradesheet?.grading_mode === 'ACTIVITIES'

  const activeActivityColumns = useMemo(() => {
    const cols = (gradebook?.activity_columns ?? []).filter((c) => c.is_active)
    cols.sort((a, b) => (a.achievement - b.achievement) || (a.order - b.order) || (a.id - b.id))
    return cols
  }, [gradebook?.activity_columns])

  const activityColumnIndexById = useMemo(() => {
    const map = new Map<number, number>()
    for (let i = 0; i < activeActivityColumns.length; i += 1) {
      map.set(activeActivityColumns[i].id, i)
    }
    return map
  }, [activeActivityColumns])

  const activityColumnsByAchievement = useMemo(() => {
    const map = new Map<number, GradebookActivityColumn[]>()
    for (const c of activeActivityColumns) {
      const list = map.get(c.achievement) ?? []
      list.push(c)
      map.set(c.achievement, list)
    }
    for (const [k, v] of map.entries()) {
      v.sort((a, b) => (a.order - b.order) || (a.id - b.id))
      map.set(k, v)
    }
    return map
  }, [activeActivityColumns])

  const activityColumnToAchievement = useMemo(() => {
    const map = new Map<number, number>()
    for (const c of activeActivityColumns) map.set(c.id, c.achievement)
    return map
  }, [activeActivityColumns])

  const activityColumnById = useMemo(() => {
    const map = new Map<number, GradebookActivityColumn>()
    for (const c of gradebook?.activity_columns ?? []) map.set(c.id, c)
    return map
  }, [gradebook?.activity_columns])

  useEffect(() => {
    if (editingActivityColumnId == null) return
    const exists = activeActivityColumns.some((c) => c.id === editingActivityColumnId)
    if (!exists) {
      setEditingActivityColumnId(null)
      setEditingActivityColumnLabel('')
      setSavingActivityColumnEdit(false)
    }
  }, [activeActivityColumns, editingActivityColumnId])

  const getAchievementScoreForEnrollment = useCallback(
    (enrollmentId: number, achievementId: number) => {
      if (!gradebook) return null

      if (!activitiesMode) {
        const key = makeKey(enrollmentId, achievementId)
        const scoreOrNull = parseScoreOrNull(cellValues[key] ?? '')
        const score = scoreOrNull === null ? 1 : scoreOrNull
        return Number.isFinite(score) ? score : null
      }

      const cols = activityColumnsByAchievement.get(achievementId) ?? []
      if (cols.length === 0) {
        const key = makeKey(enrollmentId, achievementId)
        const scoreOrNull = parseScoreOrNull(cellValues[key] ?? '')
        const score = scoreOrNull === null ? 1 : scoreOrNull
        return Number.isFinite(score) ? score : null
      }

      let total = 0
      for (const c of cols) {
        const k = makeActivityKey(enrollmentId, c.id)
        const scoreOrNull = parseScoreOrNull(activityValues[k] ?? '')
        const score = scoreOrNull === null ? 1 : scoreOrNull
        if (!Number.isFinite(score)) return null
        total += score
      }
      const avg = total / cols.length
      return Number.isFinite(avg) ? avg : null
    },
    [activitiesMode, activityColumnsByAchievement, activityValues, cellValues, gradebook]
  )

  const SHEETS_PAGE_SIZE = 9

  const orderedAvailableSheets = useMemo(() => {
    const gradeById = new Map<number, Grade>()
    for (const g of grades) gradeById.set(g.id, g)

    const compareText = (a: string, b: string) =>
      a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })

    const bySubjectThenGrade = (a: GradebookAvailableSheet, b: GradebookAvailableSheet) => {
      const subjectA = (a.subject_name ?? 'Sin asignatura').trim()
      const subjectB = (b.subject_name ?? 'Sin asignatura').trim()
      const subjectCmp = compareText(subjectA, subjectB)
      if (subjectCmp !== 0) return subjectCmp

      const aOrdinal = gradeById.get(a.grade_id)?.ordinal
      const bOrdinal = gradeById.get(b.grade_id)?.ordinal
      const ao = aOrdinal === null || aOrdinal === undefined ? Number.POSITIVE_INFINITY : aOrdinal
      const bo = bOrdinal === null || bOrdinal === undefined ? Number.POSITIVE_INFINITY : bOrdinal
      if (ao !== bo) return ao - bo

      const gradeCmp = compareText((a.grade_name ?? '').trim(), (b.grade_name ?? '').trim())
      if (gradeCmp !== 0) return gradeCmp

      const groupCmp = compareText((a.group_name ?? '').trim(), (b.group_name ?? '').trim())
      if (groupCmp !== 0) return groupCmp

      const completionCmp = Number(a.completion.is_complete) - Number(b.completion.is_complete)
      if (completionCmp !== 0) return completionCmp

      return a.teacher_assignment_id - b.teacher_assignment_id
    }

    const next = [...availableSheets]
    next.sort(bySubjectThenGrade)
    return next
  }, [availableSheets, grades])

  const sheetsTotalPages = useMemo(
    () => Math.max(1, Math.ceil(orderedAvailableSheets.length / SHEETS_PAGE_SIZE)),
    [orderedAvailableSheets.length]
  )

  useEffect(() => {
    setSheetsPage(1)
  }, [selectedPeriodId])

  useEffect(() => {
    setSheetsPage((prev) => Math.min(Math.max(1, prev), sheetsTotalPages))
  }, [sheetsTotalPages])

  const pagedAvailableSheets = useMemo(() => {
    const start = (sheetsPage - 1) * SHEETS_PAGE_SIZE
    return orderedAvailableSheets.slice(start, start + SHEETS_PAGE_SIZE)
  }, [orderedAvailableSheets, sheetsPage])

  const pagedSheetsGroupedBySubject = useMemo(() => {
    const groups: { subject: string; sheets: GradebookAvailableSheet[] }[] = []
    const subjectIndex = new Map<string, number>()

    for (const s of pagedAvailableSheets) {
      const subject = (s.subject_name ?? 'Sin asignatura').trim() || 'Sin asignatura'
      const idx = subjectIndex.get(subject)
      if (idx === undefined) {
        subjectIndex.set(subject, groups.length)
        groups.push({ subject, sheets: [s] })
      } else {
        groups[idx].sheets.push(s)
      }
    }

    return groups
  }, [pagedAvailableSheets])

  const visibleAssignments = useMemo(() => {
    if (user?.role === 'TEACHER') return assignments.filter((a) => a.teacher === user.id)
    return assignments
  }, [assignments, user?.id, user?.role])

  const groupById = useMemo(() => {
    const map = new Map<number, Group>()
    for (const g of groups) map.set(g.id, g)
    return map
  }, [groups])

  const gradeOptions = useMemo(() => {
    const gradeById = new Map<number, Grade>()
    for (const g of grades) gradeById.set(g.id, g)

    const gradeIds = new Set<number>()
    for (const a of visibleAssignments) {
      const g = groupById.get(a.group)
      if (g) gradeIds.add(g.grade)
    }

    const options: { id: number; name: string; ordinal?: number | null }[] = []
    for (const gradeId of gradeIds) {
      const anyGroup = groups.find((g) => g.grade === gradeId)
      const grade = gradeById.get(gradeId)
      options.push({
        id: gradeId,
        name: grade?.name || anyGroup?.grade_name || `Grado ${gradeId}`,
        ordinal: grade?.ordinal,
      })
    }
    options.sort((a, b) => {
      const ao = a.ordinal === null || a.ordinal === undefined ? -9999 : a.ordinal
      const bo = b.ordinal === null || b.ordinal === undefined ? -9999 : b.ordinal
      if (ao !== bo) return bo - ao
      return a.name.localeCompare(b.name)
    })
    return options
  }, [grades, groupById, groups, visibleAssignments])

  const groupOptions = useMemo(() => {
    if (!selectedGradeId) return [] as Group[]

    const allowedGroupIds = new Set<number>(visibleAssignments.map((a) => a.group))
    return groups
      .filter((g) => allowedGroupIds.has(g.id) && g.grade === selectedGradeId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [groups, selectedGradeId, visibleAssignments])

  const subjectOptions = useMemo(() => {
    if (!selectedGroupId) return [] as { academic_load: number; subject_name: string }[]
    const map = new Map<number, string>()
    for (const a of visibleAssignments) {
      if (a.group !== selectedGroupId) continue
      map.set(a.academic_load, a.subject_name || a.academic_load_name || `Carga ${a.academic_load}`)
    }
    return Array.from(map.entries())
      .map(([academic_load, subject_name]) => ({ academic_load, subject_name }))
      .sort((a, b) => a.subject_name.localeCompare(b.subject_name))
  }, [selectedGroupId, visibleAssignments])

  const selectedAssignment = useMemo(() => {
    if (selectedTeacherAssignmentId) {
      return visibleAssignments.find((a) => a.id === selectedTeacherAssignmentId) ?? null
    }

    if (user?.role === 'TEACHER') return null

    if (!selectedGroupId || !selectedAcademicLoadId) return null
    return (
      visibleAssignments.find(
        (a) => a.group === selectedGroupId && a.academic_load === selectedAcademicLoadId
      ) ?? null
    )
  }, [selectedAcademicLoadId, selectedGroupId, selectedTeacherAssignmentId, user?.role, visibleAssignments])

  const refreshGradeGrants = useCallback(async () => {
    if (user?.role !== 'TEACHER') {
      setActiveGradeGrant(null)
      return
    }
    if (!selectedAssignment || !selectedPeriodId) {
      setActiveGradeGrant(null)
      return
    }
    if (!gradeWindowClosed) {
      setActiveGradeGrant(null)
      return
    }

    setLoadingGradeGrant(true)
    try {
      const res = await academicApi.listMyEditGrants({
        scope: 'GRADES',
        period: selectedPeriodId,
        teacher_assignment: selectedAssignment.id,
      })

      const now = Date.now()
      const active = (res.data ?? []).filter((g) => new Date(g.valid_until).getTime() > now)
      const hasFull = active.some((g) => g.grant_type === 'FULL')

      const allowedEnrollments = new Set<number>()
      let maxValidUntil: string | null = null

      for (const g of active) {
        if (!maxValidUntil || new Date(g.valid_until).getTime() > new Date(maxValidUntil).getTime()) {
          maxValidUntil = g.valid_until
        }
        if (g.grant_type !== 'PARTIAL') continue
        for (const item of g.items ?? []) {
          allowedEnrollments.add(item.enrollment_id)
        }
      }

      setActiveGradeGrant({ hasFull, allowedEnrollments, validUntil: maxValidUntil })
    } catch (e) {
      console.error(e)
      setActiveGradeGrant(null)
    } finally {
      setLoadingGradeGrant(false)
    }
  }, [gradeWindowClosed, selectedAssignment, selectedPeriodId, user?.role])

  useEffect(() => {
    refreshGradeGrants()
  }, [refreshGradeGrants])

  const visiblePeriods = useMemo(() => {
    if (!selectedAssignment) return []
    return periods.filter((p) => p.academic_year === selectedAssignment.academic_year)
  }, [periods, selectedAssignment])

  const teacherPeriods = useMemo(() => {
    if (user?.role !== 'TEACHER') return []
    const yearIds = new Set<number>()
    for (const a of visibleAssignments) yearIds.add(a.academic_year)
    return periods
      .filter((p) => yearIds.has(p.academic_year) && isCurrentPeriod(p))
      .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
  }, [periods, user?.role, visibleAssignments])

  const periodIsClosed = !!gradebook?.period?.is_closed

  const canEditEnrollment = useCallback(
    (enrollmentId: number) => {
      if (periodIsClosed) return false
      if (user?.role !== 'TEACHER') return true
      if (!gradeWindowClosed) return true
      if (activeGradeGrant?.hasFull) return true
      return !!activeGradeGrant?.allowedEnrollments?.has(enrollmentId)
    },
    [activeGradeGrant?.allowedEnrollments, activeGradeGrant?.hasFull, gradeWindowClosed, periodIsClosed, user?.role]
  )

  const computedByEnrollmentId = useMemo(() => {
    const map = new Map<number, { final_score: number | string; scale: string | null }>()
    for (const c of gradebook?.computed ?? []) {
      map.set(c.enrollment_id, { final_score: c.final_score, scale: c.scale })
    }

    for (const [enrollmentIdStr, computed] of Object.entries(computedOverrides)) {
      const enrollmentId = Number(enrollmentIdStr)
      if (!Number.isFinite(enrollmentId)) continue
      map.set(enrollmentId, computed)
    }
    return map
  }, [computedOverrides, gradebook?.computed])

  const formatScore = (value: number | string) => {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return String(value)
    return n.toFixed(2)
  }

  const intOrZero = (value: unknown): number => {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return 0
    return Math.trunc(n)
  }

  const clampScoreToRangeInput = (sanitized: string): string => {
    const trimmed = sanitized.trim()

    // Allow intermediate typing states without forcing a number yet.
    // Examples: "" (empty), "." or "4.".
    if (!trimmed || trimmed === '.' || trimmed.endsWith('.')) return sanitized

    const n = Number(trimmed)
    if (!Number.isFinite(n)) return sanitized

    if (n < 1) return '1'
    if (n > 5) return '5'
    return sanitized
  }

  const clampScoreNumber = (n: number): number => {
    if (!Number.isFinite(n)) return n
    if (n < 1) return 1
    if (n > 5) return 5
    return n
  }

  const normalizeText = (raw: string) =>
    raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()

  const abbrevDimensionName = (raw: string) => {
    const n = normalizeText(raw)
    if (n.includes('cognit')) return 'Cog.'
    if (n.includes('proced')) return 'Proc.'
    if (n.includes('actitud')) return 'Act.'
    const trimmed = raw.trim()
    return trimmed.length <= 6 ? trimmed : `${trimmed.slice(0, 6)}…`
  }

  const dimensionTone = (rawName?: string | null) => {
    const n = rawName ? normalizeText(rawName) : ''
    if (n.includes('cognit')) {
      return {
        groupBg: 'bg-indigo-50/40 dark:bg-indigo-950/15',
        edgeBorder: 'border-indigo-200/70 dark:border-indigo-900/40',
      }
    }
    if (n.includes('proced')) {
      return {
        groupBg: 'bg-emerald-50/35 dark:bg-emerald-950/15',
        edgeBorder: 'border-emerald-200/70 dark:border-emerald-900/40',
      }
    }
    if (n.includes('actitud')) {
      return {
        groupBg: 'bg-amber-50/35 dark:bg-amber-950/15',
        edgeBorder: 'border-amber-200/70 dark:border-amber-900/40',
      }
    }
    return {
      groupBg: 'bg-slate-50/40 dark:bg-slate-900/20',
      edgeBorder: 'border-slate-200 dark:border-slate-800',
    }
  }

  const categoryFromScale = (scaleName: string | null | undefined) => {
    if (!scaleName) return null
    const s = normalizeText(scaleName)
    if (s.includes('bajo')) return 'low' as const
    if (s.includes('basico')) return 'basic' as const
    if (s.includes('alto')) return 'high' as const
    if (s.includes('superior')) return 'superior' as const
    return null
  }

  const categoryFromScore = (score: number | null) => {
    if (score === null || !Number.isFinite(score)) return null
    // Fallback ranges (can be adjusted to your institutional scale if needed)
    if (score < 3) return 'low' as const
    if (score < 4) return 'basic' as const
    if (score < 4.6) return 'high' as const
    return 'superior' as const
  }

  const definitiveStyle = (category: ReturnType<typeof categoryFromScore>) => {
    switch (category) {
      case 'low':
        return {
          label: 'Bajo',
          className:
            'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200',
        }
      case 'basic':
        return {
          label: 'Básico',
          className:
            'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200',
        }
      case 'high':
        return {
          label: 'Alto',
          className:
            'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200',
        }
      case 'superior':
        return {
          label: 'Superior',
          className:
            'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/25 dark:text-sky-200',
        }
      default:
        return {
          label: null,
          className: 'border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
        }
    }
  }

  const dimensionById = useMemo(() => {
    const map = new Map<number, { id: number; name: string; percentage: number }>()
    for (const d of gradebook?.dimensions ?? []) map.set(d.id, d)
    return map
  }, [gradebook?.dimensions])

  // Mobile quick capture mode (phones/tablets): focus one achievement and optionally one student.
  const [mobileQuickCapture, setMobileQuickCapture] = useState(false)
  const [mobileAchievementFocus, setMobileAchievementFocus] = useState<number | 'ALL'>('ALL')
  const [mobileStudentIndex, setMobileStudentIndex] = useState(0)

  useEffect(() => {
    setMobileStudentIndex(0)
  }, [gradebook?.teacher_assignment?.id, gradebook?.period?.id])

  const mobileStudents = useMemo(() => {
    if (!gradebook) return []
    if (!mobileQuickCapture) return gradebook.students
    const one = gradebook.students[mobileStudentIndex]
    return one ? [one] : []
  }, [gradebook, mobileQuickCapture, mobileStudentIndex])

  const mobileAchievementOptions = useMemo(() => {
    if (!gradebook) return [] as { id: number; label: string }[]
    return gradebook.achievements.map((a, idx) => ({ id: a.id, label: `L${idx + 1} · ${a.percentage}%` }))
  }, [gradebook])

  useEffect(() => {
    if (!mobileQuickCapture) return
    if (!gradebook) return

    const student = gradebook.students[mobileStudentIndex]
    if (!student) return

    const achievementId =
      mobileAchievementFocus === 'ALL'
        ? (gradebook.achievements[0]?.id ?? null)
        : mobileAchievementFocus
    if (!achievementId) return

    const targetId = (() => {
      if (!activitiesMode) return `gradecell-${student.enrollment_id}-${achievementId}`

      const cols = activityColumnsByAchievement.get(achievementId) ?? []
      const firstCol = cols[0]
      if (!firstCol) return `gradecell-${student.enrollment_id}-${achievementId}`
      return `activitycell-${student.enrollment_id}-${firstCol.id}`
    })()

    // Let the DOM render before focusing.
    window.setTimeout(() => {
      const el = document.getElementById(targetId) as HTMLInputElement | null
      if (el) el.focus()
    }, 0)
  }, [activitiesMode, activityColumnsByAchievement, gradebook, mobileAchievementFocus, mobileQuickCapture, mobileStudentIndex])

  const achievementsByDimension = useMemo(() => {
    const groups = new Map<number, GradebookResponse['achievements']>()
    for (const a of gradebook?.achievements ?? []) {
      if (!a.dimension) continue
      const list = groups.get(a.dimension) ?? []
      list.push(a)
      groups.set(a.dimension, list)
    }
    return groups
  }, [gradebook?.achievements])

  const dimensionOrder = useMemo(() => {
    const ids = Array.from(achievementsByDimension.keys())

    const normalize = (raw: string) =>
      raw
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim()

    const priority: Record<string, number> = {
      cognitivo: 0,
      procedimental: 1,
      actitudinal: 2,
    }

    ids.sort((a, b) => {
      const anRaw = dimensionById.get(a)?.name ?? ''
      const bnRaw = dimensionById.get(b)?.name ?? ''
      const an = normalize(anRaw)
      const bn = normalize(bnRaw)

      const ap = priority[an]
      const bp = priority[bn]
      const aHas = Number.isFinite(ap)
      const bHas = Number.isFinite(bp)

      if (aHas && bHas) return ap - bp
      if (aHas) return -1
      if (bHas) return 1

      return anRaw.localeCompare(bnRaw)
    })
    return ids
  }, [achievementsByDimension, dimensionById])

  const achievementOrder = useMemo(() => {
    // Flatten in displayed order (dimensionOrder then achievement id order)
    return dimensionOrder.flatMap((dimId) => achievementsByDimension.get(dimId) ?? [])
  }, [achievementsByDimension, dimensionOrder])

  const rowOrder = useMemo(() => (gradebook?.students ?? []).map((s) => s.enrollment_id), [gradebook?.students])

  const focusCell = (enrollmentId: number, achievementId: number) => {
    const el = document.getElementById(`gradecell-${enrollmentId}-${achievementId}`) as HTMLInputElement | null
    if (!el) return
    el.focus()
    try {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    } catch {
      // ignore
    }
    // Selecting helps fast overwrite when navigating with keys
    try {
      el.select()
    } catch {
      // ignore
    }
  }

  const computeFinalScoreForEnrollment = useCallback(
    (enrollmentId: number) => {
      if (!gradebook) return null

      // Per-dimension weighted average of its achievements
      const dimGrades: Array<{ dimId: number; dimGrade: number; dimPercentage: number }> = []

      for (const dimId of dimensionOrder) {
        const dimAchievements = achievementsByDimension.get(dimId) ?? []
        if (dimAchievements.length === 0) continue

        let totalWeight = 0
        let weightedTotal = 0

        for (const a of dimAchievements) {
          const score = getAchievementScoreForEnrollment(enrollmentId, a.id)
          if (score === null) return null

          const w = a.percentage ? Number(a.percentage) : 1
          totalWeight += w
          weightedTotal += score * w
        }

        const dimGrade = totalWeight > 0 ? weightedTotal / totalWeight : 1
        const dimPercentage = dimensionById.get(dimId)?.percentage ?? 0
        dimGrades.push({ dimId, dimGrade, dimPercentage })
      }

      const totalPercentage = dimGrades.reduce((acc, d) => acc + (Number(d.dimPercentage) || 0), 0)
      if (totalPercentage <= 0) return null

      const finalScore =
        dimGrades.reduce((acc, d) => acc + d.dimGrade * (Number(d.dimPercentage) || 0), 0) / totalPercentage

      return Number.isFinite(finalScore) ? finalScore : null
    },
    [achievementsByDimension, dimensionById, dimensionOrder, getAchievementScoreForEnrollment, gradebook]
  )

  const computeDimScoreForEnrollment = useCallback(
    (enrollmentId: number, dimId: number) => {
      if (!gradebook) return null

      const dimAchievements = achievementsByDimension.get(dimId) ?? []
      if (dimAchievements.length === 0) return null

      let totalWeight = 0
      let weightedTotal = 0

      for (const a of dimAchievements) {
        const score = getAchievementScoreForEnrollment(enrollmentId, a.id)
        if (score === null) return null

        const w = a.percentage ? Number(a.percentage) : 1
        totalWeight += w
        weightedTotal += score * w
      }

      const dimGrade = totalWeight > 0 ? weightedTotal / totalWeight : 1
      return Number.isFinite(dimGrade) ? dimGrade : null
    },
    [achievementsByDimension, getAchievementScoreForEnrollment, gradebook]
  )

  const completion = useMemo(() => {
    const studentsCount = gradebook?.students?.length ?? 0
    const total = (() => {
      if (!gradebook) return 0
      if (!activitiesMode) return studentsCount * (gradebook.achievements?.length ?? 0)

      const colsPerStudent = gradebook.achievements.reduce((acc, a) => {
        const n = activityColumnsByAchievement.get(a.id)?.length ?? 0
        return acc + Math.max(1, n)
      }, 0)

      return studentsCount * colsPerStudent
    })()
    if (!gradebook || total <= 0) {
      return { total: 0, filled: 0, percent: 0 }
    }

    let filled = 0
    if (activitiesMode) {
      for (const s of gradebook.students) {
        for (const a of gradebook.achievements) {
          const cols = activityColumnsByAchievement.get(a.id) ?? []

          if (cols.length === 0) {
            const key = makeKey(s.enrollment_id, a.id)
            const raw = (cellValues[key] ?? '').trim()
            if (!raw) continue
            const parsed = parseScoreOrNull(raw)
            if (parsed === null) continue
            if (!Number.isFinite(parsed)) continue
            if (parsed < 1 || parsed > 5) continue
            filled += 1
            continue
          }

          for (const c of cols) {
            const key = makeActivityKey(s.enrollment_id, c.id)
            const raw = (activityValues[key] ?? '').trim()
            if (!raw) continue
            const parsed = parseScoreOrNull(raw)
            if (parsed === null) continue
            if (!Number.isFinite(parsed)) continue
            if (parsed < 1 || parsed > 5) continue
            filled += 1
          }
        }
      }
    } else {
      for (const s of gradebook.students) {
        for (const a of gradebook.achievements) {
          const key = makeKey(s.enrollment_id, a.id)
          const raw = (cellValues[key] ?? '').trim()
          if (!raw) continue
          const parsed = parseScoreOrNull(raw)
          if (parsed === null) continue
          if (!Number.isFinite(parsed)) continue
          if (parsed < 1 || parsed > 5) continue
          filled += 1
        }
      }
    }

    const percent = Math.round((filled / total) * 100)
    return { total, filled, percent }
  }, [activitiesMode, activityColumnsByAchievement, activityValues, cellValues, gradebook])

  const loadInit = useCallback(async () => {
    setLoadingInit(true)
    try {
      const [assignmentsRes, periodsRes, groupsRes, gradesRes] = await Promise.all([
        user?.role === 'TEACHER' ? academicApi.listMyAssignments() : academicApi.listAssignments(),
        academicApi.listPeriods(),
        academicApi.listGroups(),
        academicApi.listGrades(),
      ])

      setAssignments(assignmentsRes.data)
      setPeriods(periodsRes.data)
      setGroups(groupsRes.data)
      setGrades(gradesRes.data)

      const filteredAssignments = assignmentsRes.data

      if (isAdmin) {
        // Admin should not auto-open any grade sheet.
        setSelectedGradeId(null)
        setSelectedGroupId(null)
        setSelectedAcademicLoadId(null)
      }

      if (filteredAssignments.length > 0 && !isAdmin) {
        const firstAssignment = filteredAssignments[0]
        const firstGroup = groupsRes.data.find((g) => g.id === firstAssignment.group)

        if (firstGroup) {
          setSelectedGradeId(firstGroup.grade)
          setSelectedGroupId(firstGroup.id)
        }
        setSelectedAcademicLoadId(firstAssignment.academic_load)

        const pForYear = periodsRes.data.filter((p) => p.academic_year === firstAssignment.academic_year)
        const current = pForYear.find((p) => isCurrentPeriod(p)) ?? null
        if (selectedPeriodId == null) {
          setSelectedPeriodId(current?.id ?? null)
          if (!current) showToast('No hay un periodo actual activo para diligenciar planillas.', 'error')
        }

        // Nota: no forzar selección en TEACHER; el flujo por defecto es cards.
      }
    } catch (e) {
      console.error(e)
      showToast('No se pudo cargar asignaciones/periodos', 'error')
    } finally {
      setLoadingInit(false)
    }
  }, [isAdmin, selectedPeriodId, showToast, user?.role])

  useEffect(() => {
    if (user?.role !== 'TEACHER') return
    const params = new URLSearchParams(location.search)
    const periodRaw = params.get('period')
    const taRaw = params.get('ta')

    const parsedPeriod = periodRaw ? Number(periodRaw) : null
    const parsedTa = taRaw ? Number(taRaw) : null

    const periodId = parsedPeriod && Number.isFinite(parsedPeriod) && parsedPeriod > 0 ? parsedPeriod : null
    const teacherAssignmentId = parsedTa && Number.isFinite(parsedTa) && parsedTa > 0 ? parsedTa : null

    if (periodId && periodId !== selectedPeriodId) {
      const candidate = periods.find((p) => p.id === periodId)
      if (candidate && isCurrentPeriod(candidate)) {
        setSelectedPeriodId(periodId)
      }
    }
    if (teacherAssignmentId !== selectedTeacherAssignmentId) setSelectedTeacherAssignmentId(teacherAssignmentId)
  }, [location.search, periods, selectedPeriodId, selectedTeacherAssignmentId, user?.role])

  const showingCards = teacherMode && !selectedTeacherAssignmentId

  const canResetSheet = useMemo(() => {
    if (user?.role !== 'TEACHER') return false
    if (!gradebook) return false
    if (periodIsClosed) return false
    if (showingCards) return false
    if (!gradeWindowClosed) return true
    return !!activeGradeGrant?.hasFull
  }, [activeGradeGrant?.hasFull, gradeWindowClosed, gradebook, periodIsClosed, showingCards, user?.role])

  const loadAvailableSheets = useCallback(
    async (periodId: number) => {
      if (user?.role !== 'TEACHER') return
      setLoadingSheets(true)
      try {
        const res = await academicApi.listAvailableGradeSheets(periodId)
        setAvailableSheets(res.data.results)
      } catch (e) {
        console.error(e)
        setAvailableSheets([])
        showToast('No se pudieron cargar las planillas del periodo', 'error')
      } finally {
        setLoadingSheets(false)
      }
    },
    [showToast, user?.role]
  )

  const loadGradebook = useCallback(async (teacherAssignmentId: number, periodId: number) => {
    setLoadingGradebook(true)
    try {
      const res = await academicApi.getGradebook(teacherAssignmentId, periodId)
      setGradebook(res.data)
      setComputedOverrides({})

      const nextBase: Record<CellKey, string> = {}
      for (const c of res.data.cells) {
        const key = makeKey(c.enrollment, c.achievement)
        nextBase[key] = c.score === null || c.score === undefined ? '' : String(c.score)
      }

      const nextActivityBase: Record<ActivityCellKey, string> = {}
      for (const c of res.data.activity_cells ?? []) {
        const key = makeActivityKey(c.enrollment, c.column)
        nextActivityBase[key] = c.score === null || c.score === undefined ? '' : String(c.score)
      }

      setActivityBaseValues(nextActivityBase)
      setActivityValues(nextActivityBase)
      setDirtyActivityKeys(new Set())
      setActivityCellStatus({})

      setBaseValues(nextBase)
      setCellValues(nextBase)
      setDirtyKeys(new Set())
    } catch (e) {
      console.error(e)
      setGradebook(null)
      setBaseValues({})
      setCellValues({})
      setDirtyKeys(new Set())
      setActivityBaseValues({})
      setActivityValues({})
      setDirtyActivityKeys(new Set())
      setActivityCellStatus({})
      showToast('No se pudo cargar la planilla', 'error')
    } finally {
      setLoadingGradebook(false)
    }
  }, [showToast])

  const handleResetSheet = useCallback(async () => {
    if (!gradebook?.gradesheet?.id) return
    const taId = gradebook?.teacher_assignment?.id
    const pId = gradebook?.period?.id
    if (!taId || !pId) return

    setResettingSheet(true)
    try {
      await academicApi.resetGradeSheet(gradebook.gradesheet.id)
      showToast('Planilla restablecida.', 'success')
      await loadGradebook(taId, pId)
    } catch (e) {
      console.error(e)
      showToast('No se pudo restablecer la planilla.', 'error')
    } finally {
      setResettingSheet(false)
      setResetModalOpen(false)
    }
  }, [gradebook, loadGradebook, showToast])

  const setGradingMode = useCallback(
    async (mode: GradeSheetGradingMode) => {
      if (!selectedAssignment || !selectedPeriodId) return
      if (periodIsClosed) return
      try {
        const res = await academicApi.setGradeSheetGradingMode({
          teacher_assignment: selectedAssignment.id,
          period: selectedPeriodId,
          grading_mode: mode,
          default_columns: mode === 'ACTIVITIES' ? 2 : 0,
        })
        if (res.data.created_columns > 0) {
          showToast(`Modo actualizado. Se crearon ${res.data.created_columns} columnas.`, 'success')
        } else {
          showToast('Modo actualizado', 'success')
        }
        await loadGradebook(selectedAssignment.id, selectedPeriodId)
      } catch (e) {
        console.error(e)
        showToast('No se pudo cambiar el modo de calificación', 'error')
      }
    },
    [loadGradebook, periodIsClosed, selectedAssignment, selectedPeriodId, showToast]
  )

  const addActivityColumn = useCallback(
    async (achievementId: number) => {
      if (!selectedAssignment || !selectedPeriodId) return
      if (periodIsClosed) return

      const existing = activityColumnsByAchievement.get(achievementId) ?? []
      const nextN = existing.length + 1
      const label = `Actividad ${nextN}`

      try {
        await academicApi.bulkUpsertActivityColumns({
          teacher_assignment: selectedAssignment.id,
          period: selectedPeriodId,
          columns: [{ achievement: achievementId, label }],
        })
        await loadGradebook(selectedAssignment.id, selectedPeriodId)
      } catch (e) {
        console.error(e)
        showToast('No se pudo agregar la columna', 'error')
      }
    },
    [activityColumnsByAchievement, loadGradebook, periodIsClosed, selectedAssignment, selectedPeriodId, showToast]
  )

  const deactivateActivityColumn = useCallback(
    async (columnId: number) => {
      if (!selectedAssignment || !selectedPeriodId) return
      if (periodIsClosed) return

      const col = activityColumnById.get(columnId)
      if (!col) return

      const ok = window.confirm(`¿Desactivar la columna "${col.label}"?\n\nNo se borra el historial, solo deja de mostrarse.`)
      if (!ok) return

      if (editingActivityColumnId === columnId) {
        setEditingActivityColumnId(null)
        setEditingActivityColumnLabel('')
        setSavingActivityColumnEdit(false)
      }

      try {
        await academicApi.bulkUpsertActivityColumns({
          teacher_assignment: selectedAssignment.id,
          period: selectedPeriodId,
          columns: [
            {
              id: columnId,
              achievement: col.achievement,
              label: col.label,
              order: col.order,
              is_active: false,
            },
          ],
        })
        showToast('Columna desactivada', 'success')
        await loadGradebook(selectedAssignment.id, selectedPeriodId)
      } catch (e) {
        console.error(e)
        showToast('No se pudo desactivar la columna', 'error')
      }
    },
    [activityColumnById, editingActivityColumnId, loadGradebook, periodIsClosed, selectedAssignment, selectedPeriodId, showToast]
  )

  const startEditActivityColumn = useCallback(
    (columnId: number, currentLabel: string) => {
      if (periodIsClosed) return
      setEditingActivityColumnId(columnId)
      setEditingActivityColumnLabel(currentLabel)
    },
    [periodIsClosed]
  )

  const cancelEditActivityColumn = useCallback(() => {
    setEditingActivityColumnId(null)
    setEditingActivityColumnLabel('')
    setSavingActivityColumnEdit(false)
  }, [])

  const saveEditActivityColumn = useCallback(async () => {
    if (!selectedAssignment || !selectedPeriodId) return
    if (periodIsClosed) return
    if (editingActivityColumnId == null) return

    const label = editingActivityColumnLabel.trim()
    if (!label) {
      showToast('El nombre no puede estar vacío', 'error')
      return
    }

    const achievementId = activityColumnToAchievement.get(editingActivityColumnId)
    if (!achievementId) return

    setSavingActivityColumnEdit(true)
    try {
      await academicApi.bulkUpsertActivityColumns({
        teacher_assignment: selectedAssignment.id,
        period: selectedPeriodId,
        columns: [{ id: editingActivityColumnId, achievement: achievementId, label }],
      })
      cancelEditActivityColumn()
      await loadGradebook(selectedAssignment.id, selectedPeriodId)
    } catch (e) {
      console.error(e)
      showToast('No se pudo renombrar la columna', 'error')
    } finally {
      setSavingActivityColumnEdit(false)
    }
  }, [activityColumnToAchievement, cancelEditActivityColumn, editingActivityColumnId, editingActivityColumnLabel, loadGradebook, periodIsClosed, selectedAssignment, selectedPeriodId, showToast])

  const handleActivityColumnLabelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveEditActivityColumn()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEditActivityColumn()
    }
  }

  const focusActivityCell = (enrollmentId: number, columnId: number) => {
    const el = document.getElementById(`activitycell-${enrollmentId}-${columnId}`) as HTMLInputElement | null
    if (!el) return
    el.focus()
    el.select()
  }

  const handleActivityCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    enrollmentId: number,
    columnId: number
  ) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      handleSave()
      return
    }
    if (e.key === 'Escape') {
      ;(e.currentTarget as HTMLInputElement).blur()
      return
    }

    // Grid navigation (Excel-like)
    // - Up/Down: move row
    // - Enter: move down
    // - Left/Right: move only when caret is at start/end
    const key = e.key
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'Enter') {
      return
    }

    const rowIndex = rowOrder.indexOf(enrollmentId)
    const colIndex = activityColumnIndexById.get(columnId)
    if (rowIndex < 0 || colIndex == null) return

    const input = e.currentTarget as HTMLInputElement
    const selStart = input.selectionStart
    const selEnd = input.selectionEnd
    const caretStart = selStart == null ? 0 : selStart
    const caretEnd = selEnd == null ? caretStart : selEnd
    const atStart = caretStart === 0 && caretEnd === 0
    const atEnd = caretStart === input.value.length && caretEnd === input.value.length

    let nextRow = rowIndex
    let nextCol = colIndex

    if (key === 'ArrowUp') nextRow = rowIndex - 1
    if (key === 'ArrowDown' || key === 'Enter') nextRow = rowIndex + 1
    if (key === 'ArrowLeft') {
      if (!atStart) return
      nextCol = colIndex - 1
    }
    if (key === 'ArrowRight') {
      if (!atEnd) return
      nextCol = colIndex + 1
    }

    if (nextRow === rowIndex && nextCol === colIndex) return
    if (nextRow < 0 || nextRow >= rowOrder.length) return
    if (nextCol < 0 || nextCol >= activeActivityColumns.length) return

    e.preventDefault()
    focusActivityCell(rowOrder[nextRow], activeActivityColumns[nextCol].id)
  }

  const saveActivityCellDebounced = useCallback(
    (enrollmentId: number, columnId: number, value: string) => {
      if (!selectedAssignment || !selectedPeriodId) return
      if (periodIsClosed) return
      if (!canEditEnrollment(enrollmentId)) return

      const key = makeActivityKey(enrollmentId, columnId)

      const existing = activitySaveTimersRef.current[key]
      if (existing) window.clearTimeout(existing)

      activitySaveTimersRef.current[key] = window.setTimeout(async () => {
        const rawScore = sanitizeScoreInput(value ?? '').trim()
        if (rawScore === '.' || rawScore.endsWith('.')) return

        const parsed = parseScoreOrNull(rawScore)
        if (Number.isNaN(parsed)) {
          showToast('Valor inválido. Usa un número entre 1.00 y 5.00', 'error')
          return
        }
        if (parsed !== null && (parsed < 1 || parsed > 5)) {
          showToast('Las notas deben estar entre 1.00 y 5.00', 'error')
          return
        }

        if (inFlightActivitySavesRef.current.has(key)) return
        inFlightActivitySavesRef.current.add(key)
        setActivityCellStatus((prev) => ({ ...prev, [key]: 'saving' }))

        try {
          const res = await academicApi.bulkUpsertActivityGrades({
            teacher_assignment: selectedAssignment.id,
            period: selectedPeriodId,
            grades: [{ enrollment: enrollmentId, column: columnId, score: parsed }],
          })

          const blocked = res.data.blocked ?? []
          if (blocked.some((b) => b.enrollment === enrollmentId && b.column === columnId)) {
            setLastBlocked(blocked.map((b) => ({ enrollment: b.enrollment, column: b.column, reason: b.reason })))
            showToast('Edición cerrada. Debes solicitar permiso.', 'error')
            setActivityCellStatus((prev) => ({ ...prev, [key]: 'error' }))
            return
          }

          setActivityBaseValues((prev) => ({ ...prev, [key]: rawScore }))
          setDirtyActivityKeys((prev) => {
            const next = new Set(prev)
            next.delete(key)
            return next
          })

          if (res.data.computed && res.data.computed.length > 0) {
            setComputedOverrides((prev) => {
              const next = { ...prev }
              for (const row of res.data.computed ?? []) {
                next[row.enrollment_id] = { final_score: row.final_score, scale: row.scale }
              }
              return next
            })
          }

          setActivityCellStatus((prev) => ({ ...prev, [key]: 'saved' }))
          const existingTimer = activityStatusTimersRef.current[key]
          if (existingTimer) window.clearTimeout(existingTimer)
          activityStatusTimersRef.current[key] = window.setTimeout(() => {
            setActivityCellStatus((prev) => {
              const next = { ...prev }
              if (next[key] === 'saved') delete next[key]
              return next
            })
          }, 1200)
        } catch (e) {
          console.error(e)
          showToast('No se pudo guardar la nota', 'error')
          setActivityCellStatus((prev) => ({ ...prev, [key]: 'error' }))
        } finally {
          inFlightActivitySavesRef.current.delete(key)
        }
      }, 700)
    },
    [canEditEnrollment, periodIsClosed, selectedAssignment, selectedPeriodId, showToast]
  )

  const handleChangeActivityCell = (enrollmentId: number, columnId: number, value: string) => {
    const key = makeActivityKey(enrollmentId, columnId)
    const sanitized = clampScoreToRangeInput(sanitizeScoreInput(value))

    setActivityCellStatus((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })

    setActivityValues((prev) => ({ ...prev, [key]: sanitized }))
    setDirtyActivityKeys((prev) => {
      const next = new Set(prev)
      const base = activityBaseValues[key] ?? ''
      if (sanitized === base) next.delete(key)
      else next.add(key)
      return next
    })

    saveActivityCellDebounced(enrollmentId, columnId, sanitized)
  }

  useEffect(() => {
    loadInit()
  }, [loadInit])

  useEffect(() => {
    if (!isAdmin) return
    if (gradebook) return
    setAdminSheetsPage(1)
  }, [adminSheetsDebouncedSearch, gradebook, isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    if (gradebook) return
    loadAdminGradeSheets({ page: adminSheetsPage })
  }, [adminSheetsPage, gradebook, isAdmin, loadAdminGradeSheets])

  useEffect(() => {
    const onKeyDown = () => {
      lastInteractionRef.current = 'keyboard'
    }
    const onPointerDown = () => {
      lastInteractionRef.current = 'pointer'
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointerdown', onPointerDown, true)

    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [])

  useEffect(() => {
    if (!selectedAssignment || !selectedPeriodId) return
    loadGradebook(selectedAssignment.id, selectedPeriodId)
  }, [loadGradebook, selectedAssignment, selectedPeriodId])

  useEffect(() => {
    if (user?.role !== 'TEACHER') return
    if (!selectedPeriodId) return
    loadAvailableSheets(selectedPeriodId)
  }, [loadAvailableSheets, selectedPeriodId, user?.role])

  const saveCellDebounced = useCallback(
    (enrollmentId: number, achievementId: number, value: string) => {
      if (!selectedAssignment || !selectedPeriodId) return
      if (periodIsClosed) return
      if (!canEditEnrollment(enrollmentId)) return

      const key = makeKey(enrollmentId, achievementId)

      // Clear existing timer per cell
      const existing = saveTimersRef.current[key]
      if (existing) window.clearTimeout(existing)

      saveTimersRef.current[key] = window.setTimeout(async () => {
        const rawScore = sanitizeScoreInput(value ?? '').trim()

        // Avoid flashing errors while user is mid-typing (e.g. "4.")
        if (rawScore === '.' || rawScore.endsWith('.')) return

        const parsed = parseScoreOrNull(rawScore)

        if (Number.isNaN(parsed)) {
          showToast('Valor inválido. Usa un número entre 1.00 y 5.00', 'error')
          return
        }

        if (parsed !== null && (parsed < 1 || parsed > 5)) {
          showToast('Las notas deben estar entre 1.00 y 5.00', 'error')
          return
        }

        if (inFlightSavesRef.current.has(key)) return
        inFlightSavesRef.current.add(key)

        setCellStatus((prev) => ({ ...prev, [key]: 'saving' }))

        try {
          const res = await academicApi.bulkUpsertGradebook({
            teacher_assignment: selectedAssignment.id,
            period: selectedPeriodId,
            grades: [{ enrollment: enrollmentId, achievement: achievementId, score: parsed }],
          })

          const blocked = res.data.blocked ?? []
          if (blocked.some((b) => b.enrollment === enrollmentId && b.achievement === achievementId)) {
            setLastBlocked(blocked)
            showToast('Edición cerrada. Debes solicitar permiso.', 'error')
            setCellStatus((prev) => ({ ...prev, [key]: 'error' }))
            return
          }

          // Sync base/dirty state for this cell
          setBaseValues((prev) => ({ ...prev, [key]: rawScore }))
          setDirtyKeys((prev) => {
            const next = new Set(prev)
            next.delete(key)
            return next
          })

          if (res.data.computed && res.data.computed.length > 0) {
            setComputedOverrides((prev) => {
              const next = { ...prev }
              for (const row of res.data.computed ?? []) {
                next[row.enrollment_id] = { final_score: row.final_score, scale: row.scale }
              }
              return next
            })
          }

          setCellStatus((prev) => ({ ...prev, [key]: 'saved' }))
          const existingTimer = statusTimersRef.current[key]
          if (existingTimer) window.clearTimeout(existingTimer)
          statusTimersRef.current[key] = window.setTimeout(() => {
            setCellStatus((prev) => {
              const next = { ...prev }
              if (next[key] === 'saved') delete next[key]
              return next
            })
          }, 1200)
        } catch (e) {
          console.error(e)
          showToast('No se pudo guardar la nota', 'error')
          setCellStatus((prev) => ({ ...prev, [key]: 'error' }))
        } finally {
          inFlightSavesRef.current.delete(key)
        }
      }, 700)
    },
    [canEditEnrollment, periodIsClosed, selectedAssignment, selectedPeriodId, showToast]
  )

  const handleCellBlur = (enrollmentId: number, achievementId: number) => {
    const key = makeKey(enrollmentId, achievementId)
    const current = cellValues[key] ?? ''
    const trimmed = sanitizeScoreInput(current).trim()

    // Don't force formatting mid-typing.
    if (!trimmed || trimmed === '.' || trimmed.endsWith('.')) return

    const parsed = parseScoreOrNull(trimmed)
    if (parsed === null || Number.isNaN(parsed) || !Number.isFinite(parsed)) return

    const clamped = clampScoreNumber(parsed)
    const formatted = clamped.toFixed(2)

    if (formatted !== current) {
      handleChangeCell(enrollmentId, achievementId, formatted)
    }
  }

  const handleChangeCell = (enrollmentId: number, achievementId: number, value: string) => {
    const key = makeKey(enrollmentId, achievementId)

    const sanitized = clampScoreToRangeInput(sanitizeScoreInput(value))

    // If user edits again, clear transient statuses
    setCellStatus((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })

    setCellValues((prev) => ({ ...prev, [key]: sanitized }))
    setDirtyKeys((prev) => {
      const next = new Set(prev)
      const base = baseValues[key] ?? ''
      if (sanitized === base) next.delete(key)
      else next.add(key)
      return next
    })

    saveCellDebounced(enrollmentId, achievementId, sanitized)
  }

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    enrollmentId: number,
    achievementId: number
  ) => {
    // Save shortcut
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      handleSave()
      return
    }

    if (e.key === 'Escape') {
      ;(e.currentTarget as HTMLInputElement).blur()
      return
    }

    const rowIdx = rowOrder.indexOf(enrollmentId)
    const colIdx = achievementOrder.findIndex((a) => a.id === achievementId)
    if (rowIdx < 0 || colIdx < 0) return

    const inputEl = e.currentTarget
    const len = (inputEl.value ?? '').length
    const start = inputEl.selectionStart ?? 0
    const end = inputEl.selectionEnd ?? 0

    const moveTo = (nextRow: number, nextCol: number) => {
      if (nextRow < 0 || nextRow >= rowOrder.length) return
      if (nextCol < 0 || nextCol >= achievementOrder.length) return
      e.preventDefault()
      focusCell(rowOrder[nextRow], achievementOrder[nextCol].id)
    }

    if (e.key === 'Enter') {
      moveTo(e.shiftKey ? rowIdx - 1 : rowIdx + 1, colIdx)
      return
    }

    if (e.key === 'ArrowUp') {
      moveTo(rowIdx - 1, colIdx)
      return
    }
    if (e.key === 'ArrowDown') {
      moveTo(rowIdx + 1, colIdx)
      return
    }
    if (e.key === 'ArrowLeft') {
      // Don't steal cursor navigation unless caret is at the start
      if (start === 0 && end === 0) moveTo(rowIdx, colIdx - 1)
      return
    }
    if (e.key === 'ArrowRight') {
      // Don't steal cursor navigation unless caret is at the end
      if (start === len && end === len) moveTo(rowIdx, colIdx + 1)
      return
    }
  }

  const handleCellFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (lastInteractionRef.current !== 'keyboard') return
    const el = e.currentTarget
    try {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    } catch {
      // ignore
    }
    try {
      el.select()
    } catch {
      // ignore
    }
  }

  const handleSave = async () => {
    if (!selectedAssignment || !selectedPeriodId) return

    if (activitiesMode) {
      if (dirtyActivityKeys.size === 0) return

      const dirtySnapshot = Array.from(dirtyActivityKeys)
      const grades: { enrollment: number; column: number; score: number | null }[] = []

      for (const key of dirtySnapshot) {
        const [enrollmentStr, columnStr] = key.split(':')
        const enrollment = Number(enrollmentStr)
        const column = Number(columnStr)
        const raw = (activityValues[key] ?? '').trim()

        if (!raw) {
          grades.push({ enrollment, column, score: null })
          continue
        }

        const score = Number(raw)
        if (!Number.isFinite(score)) {
          showToast('Hay celdas con valores inválidos', 'error')
          return
        }
        if (score < 1 || score > 5) {
          showToast('Las notas deben estar entre 1.00 y 5.00', 'error')
          return
        }

        grades.push({ enrollment, column, score })
      }

      setSaving(true)
      try {
        const res = await academicApi.bulkUpsertActivityGrades({
          teacher_assignment: selectedAssignment.id,
          period: selectedPeriodId,
          grades,
        })

        const blocked = res.data.blocked ?? []
        setLastBlocked(blocked.map((b) => ({ enrollment: b.enrollment, column: b.column, reason: b.reason })))
        const blockedKeys = new Set(blocked.map((b) => makeActivityKey(b.enrollment, b.column)))

        if (blocked.length > 0) {
          showToast(`Guardadas: ${res.data.updated}. Bloqueadas: ${blocked.length}.`, 'info')
        } else {
          showToast('Notas guardadas', 'success')
        }

        if (res.data.computed && res.data.computed.length > 0) {
          setComputedOverrides((prev) => {
            const next = { ...prev }
            for (const row of res.data.computed ?? []) {
              next[row.enrollment_id] = { final_score: row.final_score, scale: row.scale }
            }
            return next
          })
        }

        setDirtyActivityKeys((prev) => {
          const next = new Set(prev)
          for (const k of Array.from(prev)) {
            if (!blockedKeys.has(k)) next.delete(k)
          }
          return next
        })

        setActivityBaseValues((prev) => {
          const next = { ...prev }
          for (const k of dirtySnapshot) {
            if (blockedKeys.has(k)) continue
            next[k] = (activityValues[k] ?? '').trim()
          }
          return next
        })

        if (blocked.length > 0) {
          setActivityCellStatus((prev) => {
            const next = { ...prev }
            for (const b of blocked) {
              next[makeActivityKey(b.enrollment, b.column)] = 'error'
            }
            return next
          })
        } else {
          await loadGradebook(selectedAssignment.id, selectedPeriodId)
        }
      } catch (e) {
        console.error(e)
        showToast('No se pudieron guardar las notas', 'error')
      } finally {
        setSaving(false)
      }

      return
    }

    if (dirtyKeys.size === 0) return

    const dirtySnapshot = Array.from(dirtyKeys)

    const grades: { enrollment: number; achievement: number; score: number | null }[] = []

    for (const key of dirtySnapshot) {
      const [enrollmentStr, achievementStr] = key.split(':')
      const enrollment = Number(enrollmentStr)
      const achievement = Number(achievementStr)
      const raw = (cellValues[key] ?? '').trim()

      if (!raw) {
        grades.push({ enrollment, achievement, score: null })
        continue
      }

      const score = Number(raw)
      if (!Number.isFinite(score)) {
        showToast('Hay celdas con valores inválidos', 'error')
        return
      }
      if (score < 1 || score > 5) {
        showToast('Las notas deben estar entre 1.00 y 5.00', 'error')
        return
      }

      grades.push({ enrollment, achievement, score })
    }

    setSaving(true)
    try {
      const res = await academicApi.bulkUpsertGradebook({
        teacher_assignment: selectedAssignment.id,
        period: selectedPeriodId,
        grades,
      })

      const blocked = res.data.blocked ?? []
      setLastBlocked(blocked)
      const blockedKeys = new Set(blocked.map((b) => makeKey(b.enrollment, b.achievement)))

      if (blocked.length > 0) {
        showToast(`Guardadas: ${res.data.updated}. Bloqueadas: ${blocked.length}.`, 'info')
      } else {
        showToast('Notas guardadas', 'success')
      }

      if (res.data.computed && res.data.computed.length > 0) {
        setComputedOverrides((prev) => {
          const next = { ...prev }
          for (const row of res.data.computed ?? []) {
            next[row.enrollment_id] = { final_score: row.final_score, scale: row.scale }
          }
          return next
        })
      }

      // Apply partial success: mark non-blocked cells as saved; keep blocked cells dirty.
      setDirtyKeys((prev) => {
        const next = new Set(prev)
        for (const key of Array.from(prev)) {
          if (!blockedKeys.has(key)) next.delete(key)
        }
        return next
      })

      setBaseValues((prev) => {
        const next = { ...prev }
        for (const key of dirtySnapshot) {
          if (blockedKeys.has(key)) continue
          next[key] = (cellValues[key] ?? '').trim()
        }
        return next
      })

      // Mark blocked cells as error for quick visual feedback
      if (blocked.length > 0) {
        setCellStatus((prev) => {
          const next = { ...prev }
          for (const b of blocked) {
            next[makeKey(b.enrollment, b.achievement)] = 'error'
          }
          return next
        })
      } else {
        await loadGradebook(selectedAssignment.id, selectedPeriodId)
      }
    } catch (e) {
      console.error(e)
      showToast('No se pudieron guardar las notas', 'error')
    } finally {
      setSaving(false)
    }
  }

  const anyInFlightSaves = inFlightSavesRef.current.size > 0 || inFlightActivitySavesRef.current.size > 0
  const hasDirty = dirtyKeys.size > 0 || dirtyActivityKeys.size > 0
  const globalSaveLabel = periodIsClosed
    ? 'Solo lectura'
    : user?.role === 'TEACHER' && gradeWindowClosed && !activeGradeGrant?.hasFull && (activeGradeGrant?.allowedEnrollments?.size ?? 0) === 0
      ? 'Edición cerrada'
    : saving || anyInFlightSaves
      ? 'Guardando…'
      : hasDirty
        ? 'Cambios sin guardar'
        : 'Todo guardado'

  const globalSaveClass = periodIsClosed
    ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200'
    : user?.role === 'TEACHER' && gradeWindowClosed && !activeGradeGrant?.hasFull && (activeGradeGrant?.allowedEnrollments?.size ?? 0) === 0
      ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200'
    : saving || anyInFlightSaves
      ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200'
      : hasDirty
        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200'

  if (loadingInit) return <div className="p-6 text-slate-600 dark:text-slate-300">Cargando…</div>

  if (isAdmin && !gradebook) {
    const totalPages = Math.max(1, Math.ceil(adminSheetsCount / 20))
    const currentPage = Math.min(adminSheetsPage, totalPages)

    return (
      <div className="space-y-6">
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={() => setToast((prev) => ({ ...prev, isVisible: false }))}
        />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <div className="p-2 bg-blue-100 dark:bg-blue-950/30 rounded-lg">
                <GraduationCap className="h-6 w-6 text-blue-600 dark:text-blue-300" />
              </div>
              Calificaciones
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Selecciona una planilla para abrirla.
            </p>
          </div>
        </div>

        <Card className="shadow-lg border border-slate-200 dark:border-slate-800">
          <CardHeader className="space-y-3">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <CardTitle className="text-slate-900 dark:text-slate-100">Planillas de calificaciones</CardTitle>
              <div className="w-full md:max-w-sm">
                <Input
                  placeholder="Buscar (docente, grupo, grado, asignatura, periodo…)"
                  value={adminSheetsSearch}
                  onChange={(e) => setAdminSheetsSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{adminSheetsCount} resultados</span>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => loadAdminGradeSheets({ page: adminSheetsPage, search: adminSheetsDebouncedSearch })}
                disabled={adminSheetsLoading}
              >
                {adminSheetsLoading ? 'Actualizando…' : 'Actualizar'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200 dark:text-slate-300 dark:from-slate-900 dark:to-slate-800 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Periodo</th>
                    <th className="px-6 py-4 font-semibold">Año</th>
                    <th className="px-6 py-4 font-semibold">Grado</th>
                    <th className="px-6 py-4 font-semibold">Grupo</th>
                    <th className="px-6 py-4 font-semibold">Asignatura</th>
                    <th className="px-6 py-4 font-semibold">Docente</th>
                    <th className="px-6 py-4 font-semibold">Actualizado</th>
                    <th className="px-6 py-4 font-semibold">Estado</th>
                    <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {adminSheetsLoading && adminSheets.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-10 text-center text-slate-500 dark:text-slate-400">
                        Cargando…
                      </td>
                    </tr>
                  ) : adminSheets.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-10 text-center text-slate-500 dark:text-slate-400">
                        No se encontraron planillas.
                      </td>
                    </tr>
                  ) : (
                    adminSheets.map((s) => (
                      <tr
                        key={s.id}
                        className="bg-white hover:bg-slate-50/80 transition-colors dark:bg-slate-900 dark:hover:bg-slate-800/60"
                      >
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{s.period_name ?? s.period}</div>
                        </td>
                        <td className="px-6 py-4">{s.academic_year_name ?? '-'}</td>
                        <td className="px-6 py-4">{s.grade_name ?? '-'}</td>
                        <td className="px-6 py-4">{s.group_name ?? '-'}</td>
                        <td className="px-6 py-4">{s.subject_name ?? '-'}</td>
                        <td className="px-6 py-4">{s.teacher_name ?? '-'}</td>
                        <td className="px-6 py-4">
                          {s.updated_at ? new Date(s.updated_at).toLocaleString() : '-'}
                        </td>
                        <td className="px-6 py-4">
                          {s.period_is_closed === null
                            ? '-'
                            : s.period_is_closed
                              ? 'Cerrado'
                              : 'Abierto'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button size="sm" onClick={() => handleOpenAdminSheet(s)}>
                            Abrir
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {adminSheetsCount > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Página {currentPage} de {totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    disabled={currentPage <= 1}
                    onClick={() => setAdminSheetsPage(Math.max(1, currentPage - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    disabled={currentPage >= totalPages}
                    onClick={() => setAdminSheetsPage(Math.min(totalPages, currentPage + 1))}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((prev) => ({ ...prev, isVisible: false }))}
      />

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-950/30 rounded-lg">
              <GraduationCap className="h-6 w-6 text-blue-600 dark:text-blue-300" />
            </div>
            Calificaciones
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Planilla de notas por logros.</p>
        </div>

        {!teacherMode ? (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="min-w-44">
              <select
                value={selectedGradeId ?? ''}
                onChange={(e) => {
                  const gradeId = e.target.value ? Number(e.target.value) : null
                  setSelectedGradeId(gradeId)
                  setSelectedGroupId(null)
                  setSelectedAcademicLoadId(null)
                  setSelectedPeriodId(null)
                  setGradebook(null)
                }}
                className="flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="" disabled>Selecciona grado</option>
                {gradeOptions.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div className="min-w-44">
              <select
                value={selectedGroupId ?? ''}
                onChange={(e) => {
                  const groupId = e.target.value ? Number(e.target.value) : null
                  setSelectedGroupId(groupId)
                  setSelectedAcademicLoadId(null)
                  setSelectedPeriodId(null)
                  setGradebook(null)
                }}
                className="flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!selectedGradeId}
              >
                <option value="" disabled>Selecciona grupo</option>
                {groupOptions.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div className="min-w-56">
              <select
                value={selectedAcademicLoadId ?? ''}
                onChange={(e) => {
                  const loadId = e.target.value ? Number(e.target.value) : null
                  setSelectedAcademicLoadId(loadId)
                  setSelectedPeriodId(null)
                  setGradebook(null)
                }}
                className="flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!selectedGroupId}
              >
                <option value="" disabled>Selecciona asignatura</option>
                {subjectOptions.map((s) => (
                  <option key={s.academic_load} value={s.academic_load}>{s.subject_name}</option>
                ))}
              </select>
            </div>

            <div className="min-w-44">
              <select
                value={selectedPeriodId ?? ''}
                onChange={(e) => setSelectedPeriodId(e.target.value ? Number(e.target.value) : null)}
                className="flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!selectedAssignment}
              >
                <option value="" disabled>Selecciona periodo</option>
                {visiblePeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.is_closed ? ' (Cerrado)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {isAdmin && gradebook ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedTeacherAssignmentId(null)
                  setSelectedPeriodId(null)
                  setGradebook(null)
                }}
              >
                Volver al listado
              </Button>
            ) : null}

            <Button
              onClick={handleSave}
              disabled={saving || !hasDirty || !gradebook || periodIsClosed}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Save className="mr-2 h-4 w-4" />
              Guardar
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="min-w-56">
              <select
                value={selectedPeriodId ?? ''}
                onChange={(e) => {
                  const next = e.target.value ? Number(e.target.value) : null
                  setSelectedPeriodId(next)
                  setSelectedTeacherAssignmentId(null)
                  setGradebook(null)
                  replaceTeacherSearch(next, null)
                }}
                className="flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={teacherPeriods.length === 0}
              >
                <option value="" disabled>Selecciona periodo</option>
                {teacherPeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.is_closed ? ' (Cerrado)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {!showingCards && (
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedTeacherAssignmentId(null)
                  setGradebook(null)
                  replaceTeacherSearch(selectedPeriodId, null)
                }}
              >
                Volver
              </Button>
            )}

            <Button
              onClick={handleSave}
              disabled={
                saving ||
                !hasDirty ||
                !gradebook ||
                periodIsClosed ||
                showingCards ||
                (user?.role === 'TEACHER' &&
                  gradeWindowClosed &&
                  !activeGradeGrant?.hasFull &&
                  (activeGradeGrant?.allowedEnrollments?.size ?? 0) === 0)
              }
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Save className="mr-2 h-4 w-4" />
              Guardar
            </Button>

            {canResetSheet ? (
              <Button
                variant="destructive"
                onClick={() => setResetModalOpen(true)}
                disabled={resettingSheet}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {resettingSheet ? 'Restableciendo…' : 'Restablecer'}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={resetModalOpen}
        onClose={() => {
          if (resettingSheet) return
          setResetModalOpen(false)
        }}
        onConfirm={handleResetSheet}
        title="Restablecer planilla"
        description="Esto borrará todas las calificaciones y actividades de la planilla y la dejará con valores por defecto."
        confirmText="Restablecer"
        cancelText="Cancelar"
        variant="destructive"
        loading={resettingSheet}
      />

      {user?.role === 'TEACHER' && gradeWindowClosed && (
        <Card className="border border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30">
          <CardHeader>
            <CardTitle className="text-rose-800 dark:text-rose-200">Edición cerrada (Planilla)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-rose-700 dark:text-rose-200/90">
              El plazo para editar las notas de este periodo ya venció.
              {loadingGradeGrant ? ' Verificando permisos…' : ''}
              {activeGradeGrant?.validUntil ? ` Permiso vigente hasta: ${new Date(activeGradeGrant.validUntil).toLocaleString()}` : ''}
            </p>
            <p className="text-xs text-rose-700 dark:text-rose-200/90">
              Si necesitas modificar, envía una solicitud con justificación.
            </p>

            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={refreshGradeGrants}
                disabled={loadingGradeGrant || !selectedPeriodId || !selectedAssignment}
              >
                {loadingGradeGrant ? 'Revisando…' : 'Revisar permisos'}
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() =>
                  navigate(
                    `/edit-requests/grades?period=${selectedPeriodId ?? ''}&teacher_assignment=${selectedAssignment?.id ?? ''}`
                  )
                }
                disabled={!selectedPeriodId || !selectedAssignment}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Ir a Solicitudes de edición
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/edit-requests/grades')}
              >
                Ver mis solicitudes
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {lastBlocked.length > 0 && gradebook && (
        <div className="border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100 rounded-lg p-3 text-sm">
          <div className="font-semibold">Algunas notas no se guardaron</div>
          <div className="mt-1 text-xs">
            Bloqueadas: {Array.from(new Set(lastBlocked.map((b) => b.enrollment)))
              .map((enr) => gradebook.students.find((s) => s.enrollment_id === enr)?.student_name || `Enrollment ${enr}`)
              .join(', ')}
          </div>
        </div>
      )}

      {teacherMode && showingCards && !selectedPeriodId && (
        <div className="p-4 text-slate-600 dark:text-slate-300">Selecciona un periodo para ver tus planillas.</div>
      )}

      {teacherMode && showingCards && selectedPeriodId && (
        <div className="space-y-4">
          {loadingSheets ? <div className="p-4 text-slate-600 dark:text-slate-300">Cargando planillas…</div> : null}

          {!loadingSheets && availableSheets.length === 0 ? (
            <div className="p-4 text-slate-600 dark:text-slate-300">No hay planillas disponibles para este periodo.</div>
          ) : null}

          {!loadingSheets && availableSheets.length > 0 ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-1">
              <div className="text-sm text-slate-600 dark:text-slate-300">
                {(() => {
                  const total = orderedAvailableSheets.length
                  const start = (sheetsPage - 1) * SHEETS_PAGE_SIZE
                  const from = total === 0 ? 0 : start + 1
                  const to = Math.min(start + pagedAvailableSheets.length, total)
                  return `Mostrando ${from}-${to} de ${total}`
                })()}
              </div>

              {sheetsTotalPages > 1 ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSheetsPage((p) => Math.max(1, p - 1))}
                    disabled={sheetsPage <= 1}
                  >
                    Anterior
                  </Button>
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    Página {sheetsPage} de {sheetsTotalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSheetsPage((p) => Math.min(sheetsTotalPages, p + 1))}
                    disabled={sheetsPage >= sheetsTotalPages}
                  >
                    Siguiente
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-6">
            {pagedSheetsGroupedBySubject.map((group) => (
              <div key={group.subject} className="space-y-3">
                <div className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {group.subject}
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.sheets.map((s) => {
                    const complete = s.completion.is_complete
                    const badgeClass = complete
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200'
                      : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200'

                    return (
                      <Card key={s.teacher_assignment_id} className="border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none">
                        <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                {s.grade_name} • {s.group_name}
                              </CardTitle>
                              <div className="text-xs text-slate-400 mt-0.5">{s.period.name}{s.period.is_closed ? ' (Cerrado)' : ''}</div>
                            </div>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeClass}`}>
                              {complete ? 'Completa' : 'Incompleta'}
                            </span>
                          </div>
                        </CardHeader>

                        <CardContent className="pt-4">
                          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>
                              Diligenciamiento: {s.completion.filled}/{s.completion.total}
                            </span>
                            <span className="font-medium text-slate-700 dark:text-slate-200">{s.completion.percent}%</span>
                          </div>
                          <div className="mt-2 h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.completion.percent}>
                            <div className="h-2 rounded-full bg-blue-600" style={{ width: `${s.completion.percent}%` }} />
                          </div>

                          <div className="mt-4 flex items-center justify-between">
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {s.students_count} estudiantes • {s.achievements_count} logros
                            </div>
                            <Button
                              className="bg-blue-600 hover:bg-blue-700"
                              onClick={() => {
                                setSelectedTeacherAssignmentId(s.teacher_assignment_id)
                                replaceTeacherSearch(selectedPeriodId, s.teacher_assignment_id)
                              }}
                              disabled={!selectedPeriodId}
                            >
                              Ingresar
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loadingGradebook && !showingCards && <div className="p-4 text-slate-600 dark:text-slate-300">Cargando planilla…</div>}

      {!loadingGradebook && gradebook && !showingCards && (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">Planilla</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  className="hidden md:inline-flex"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadGroupReport}
                  disabled={!gradebook}
                  title="Descargar informe académico del grupo"
                >
                  Descargar informe (grupo)
                </Button>

                <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setGradingMode('ACHIEVEMENT')}
                    disabled={periodIsClosed}
                    className={`px-2.5 py-1 text-xs font-medium ${activitiesMode ? 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60' : 'bg-blue-600 text-white'} disabled:opacity-60`}
                    title="Notas directas por logro"
                  >
                    Tradicional
                  </button>
                  <button
                    type="button"
                    onClick={() => setGradingMode('ACTIVITIES')}
                    disabled={periodIsClosed}
                    className={`px-2.5 py-1 text-xs font-medium ${activitiesMode ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'} disabled:opacity-60`}
                    title="Actividades por logro (promedio)"
                  >
                    Actividades
                  </button>
                </div>

                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${globalSaveClass}`}>
                  {globalSaveLabel}
                </span>
                {periodIsClosed && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200">
                    Periodo cerrado
                  </span>
                )}
              </div>
            </div>

            {gradebook?.achievements?.length ? (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    Diligenciamiento: {completion.filled}/{completion.total}
                  </span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">{completion.percent}%</span>
                </div>
                <div
                  className="mt-2 h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700"
                  role="progressbar"
                  aria-label="Progreso de diligenciamiento de la planilla"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={completion.percent}
                >
                  <div
                    className="h-2 rounded-full bg-blue-600"
                    style={{ width: `${completion.percent}%` }}
                  />
                </div>
              </div>
            ) : null}
          </CardHeader>

          <CardContent className="pt-6">
            <p id="grade-input-help" className="sr-only">
              Rango permitido: 1.00 a 5.00. Puedes escribir con coma o punto.
            </p>

            {periodIsClosed && (
              <div className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                Este periodo está cerrado. La planilla está en modo solo lectura.
              </div>
            )}

            {/* Mobile view: student cards (no horizontal scroll) */}
            <div className="md:hidden space-y-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Vista móvil</div>
                    <button
                      type="button"
                      onClick={() => setMobileQuickCapture((v) => !v)}
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${mobileQuickCapture ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/25 dark:text-blue-200' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}
                      title="Reduce scroll enfocando un estudiante"
                    >
                      {mobileQuickCapture ? 'Captura rápida: ON' : 'Captura rápida: OFF'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-600 dark:text-slate-300 shrink-0">Enfoque</label>
                    <select
                      value={mobileAchievementFocus}
                      onChange={(e) => {
                        const v = e.target.value
                        setMobileAchievementFocus(v === 'ALL' ? 'ALL' : Number(v))
                      }}
                      className="h-10 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-slate-100"
                      aria-label="Seleccionar logro para enfoque en móvil"
                    >
                      <option value="ALL">Todos los logros</option>
                      {mobileAchievementOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {mobileQuickCapture && gradebook.students.length > 0 && (
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setMobileStudentIndex((i) => Math.max(0, i - 1))}
                        disabled={mobileStudentIndex <= 0}
                        className="h-10 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        Estudiante {Math.min(mobileStudentIndex + 1, gradebook.students.length)}/{gradebook.students.length}
                      </div>
                      <button
                        type="button"
                        onClick={() => setMobileStudentIndex((i) => Math.min(gradebook.students.length - 1, i + 1))}
                        disabled={mobileStudentIndex >= gradebook.students.length - 1}
                        className="h-10 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 disabled:opacity-50"
                      >
                        Siguiente
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {mobileStudents.map((s) => (
                <div
                  key={s.enrollment_id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                >
                  <div className="px-3 py-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div
                          className="font-semibold text-slate-900 dark:text-slate-100 truncate"
                          title={s.student_name}
                        >
                          {s.student_name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">#{s.enrollment_id}</div>
                      </div>

                      {(() => {
                        const liveFinal = computeFinalScoreForEnrollment(s.enrollment_id)
                        const c = computedByEnrollmentId.get(s.enrollment_id)
                        if (liveFinal === null && !c) return <span className="text-slate-400">—</span>

                        const finalScore = liveFinal !== null ? liveFinal : c ? Number(c.final_score) : null
                        const category = categoryFromScale(c?.scale) ?? categoryFromScore(finalScore)
                        const style = definitiveStyle(category)

                        return (
                          <div className="flex flex-col items-end">
                            <span
                              className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold border ${style.className}`}
                              aria-label={`Definitiva ${liveFinal !== null ? liveFinal.toFixed(2) : c ? formatScore(c.final_score) : '—'}${style.label ? ` (${style.label})` : ''}`}
                            >
                              {liveFinal !== null ? liveFinal.toFixed(2) : c ? formatScore(c.final_score) : '—'}
                            </span>
                            {c?.scale ? (
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">{c.scale}</span>
                            ) : null}
                          </div>
                        )
                      })()}
                    </div>
                  </div>

                  <div className="px-3 py-3 space-y-4">
                    {dimensionOrder.map((dimId) => {
                      const dim = dimensionById.get(dimId)
                      const rawDimAchievements = achievementsByDimension.get(dimId) ?? []
                      const dimAchievements =
                        mobileAchievementFocus === 'ALL'
                          ? rawDimAchievements
                          : rawDimAchievements.filter((a) => a.id === mobileAchievementFocus)
                      if (dimAchievements.length === 0) return null

                      const dimAvg = computeDimScoreForEnrollment(s.enrollment_id, dimId)
                      const tone = dimensionTone(dim?.name)

                      return (
                        <section
                          key={dimId}
                          className={`space-y-2 rounded-md border-l-2 pl-2 ${tone.groupBg} ${tone.edgeBorder}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                                {dim?.name ?? `Dimensión ${dimId}`}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {intOrZero(dim?.percentage)}%
                              </div>
                            </div>
                            <div className="shrink-0">
                              {dimAvg === null ? (
                                <span className="text-slate-400 text-xs">—</span>
                              ) : (
                                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                                  {dimAvg.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="space-y-3">
                            {dimAchievements.map((a, idx) => {
                              const avg = activitiesMode
                                ? getAchievementScoreForEnrollment(s.enrollment_id, a.id)
                                : null
                              const cols = activityColumnsByAchievement.get(a.id) ?? []

                              return (
                                <div key={a.id} className="rounded-lg border border-slate-100 dark:border-slate-800 p-2.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate" title={a.description}>
                                        L{idx + 1} · {a.percentage}%
                                      </div>
                                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={a.description}>
                                        {a.description}
                                      </div>
                                    </div>
                                    {activitiesMode ? (
                                      <div className="shrink-0">
                                        {avg === null ? (
                                          <span className="text-slate-400 text-xs">—</span>
                                        ) : (
                                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                                            {avg.toFixed(2)}
                                          </span>
                                        )}
                                      </div>
                                    ) : null}
                                  </div>

                                  {!activitiesMode ? (
                                    <div className="mt-2">
                                      {(() => {
                                        const key = makeKey(s.enrollment_id, a.id)
                                        const value = cellValues[key] ?? ''
                                        const status = cellStatus[key]
                                        const isDirty = dirtyKeys.has(key)

                                        const statusClass =
                                          status === 'error'
                                            ? 'border-rose-300 dark:border-rose-800/60 focus-visible:ring-rose-500'
                                            : status === 'saving'
                                              ? 'border-blue-300 dark:border-blue-800/60 focus-visible:ring-blue-500'
                                              : status === 'saved'
                                                ? 'border-emerald-300 dark:border-emerald-800/60 focus-visible:ring-emerald-500'
                                                : isDirty
                                                  ? 'border-amber-300 dark:border-amber-800/60 focus-visible:ring-amber-500'
                                                  : 'border-slate-200 dark:border-slate-700 focus-visible:ring-blue-500'

                                        return (
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[11px] text-slate-500 dark:text-slate-400">Nota</span>
                                            <Input
                                              value={value}
                                              onChange={(e) => handleChangeCell(s.enrollment_id, a.id, e.target.value)}
                                              onBlur={() => handleCellBlur(s.enrollment_id, a.id)}
                                              onKeyDown={(e) => handleCellKeyDown(e, s.enrollment_id, a.id)}
                                              onFocus={handleCellFocus}
                                              disabled={!canEditEnrollment(s.enrollment_id)}
                                              inputMode="decimal"
                                              pattern="^([1-4](\\.[0-9]{0,2})?|5(\\.0{0,2})?)$"
                                              id={`gradecell-${s.enrollment_id}-${a.id}`}
                                              aria-invalid={status === 'error' ? true : undefined}
                                              aria-busy={status === 'saving' ? true : undefined}
                                              aria-describedby="grade-input-help"
                                              className={`w-24 h-10 px-2 text-center ${statusClass}`}
                                              placeholder="1.00–5.00"
                                              aria-label={`Nota ${s.student_name} logro L${idx + 1}. Rango 1 a 5.`}
                                            />
                                          </div>
                                        )
                                      })()}
                                    </div>
                                  ) : (
                                    <div className="mt-2 space-y-2">
                                      {cols.length === 0 ? (
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                          No hay actividades activas para este logro.
                                        </div>
                                      ) : (
                                        <div className="flex flex-wrap gap-2">
                                          {cols.map((c, cIdx) => {
                                            const key = makeActivityKey(s.enrollment_id, c.id)
                                            const value = activityValues[key] ?? ''
                                            const status = activityCellStatus[key]
                                            const isDirty = dirtyActivityKeys.has(key)

                                            const statusClass =
                                              status === 'error'
                                                ? 'border-rose-300 dark:border-rose-800/60 focus-visible:ring-rose-500'
                                                : status === 'saving'
                                                  ? 'border-blue-300 dark:border-blue-800/60 focus-visible:ring-blue-500'
                                                  : status === 'saved'
                                                    ? 'border-emerald-300 dark:border-emerald-800/60 focus-visible:ring-emerald-500'
                                                    : isDirty
                                                      ? 'border-amber-300 dark:border-amber-800/60 focus-visible:ring-amber-500'
                                                      : 'border-slate-200 dark:border-slate-700 focus-visible:ring-blue-500'

                                            return (
                                              <div key={c.id} className="flex flex-col items-center">
                                                <span className="text-[10px] text-slate-500 dark:text-slate-400" title={c.label}>
                                                  A{cIdx + 1}
                                                </span>
                                                <Input
                                                  value={value}
                                                  onChange={(e) => handleChangeActivityCell(s.enrollment_id, c.id, e.target.value)}
                                                  onKeyDown={(e) => handleActivityCellKeyDown(e, s.enrollment_id, c.id)}
                                                  onFocus={handleCellFocus}
                                                  disabled={!canEditEnrollment(s.enrollment_id)}
                                                  inputMode="decimal"
                                                  pattern="^([1-4](\\.[0-9]{0,2})?|5(\\.0{0,2})?)$"
                                                  id={`activitycell-${s.enrollment_id}-${c.id}`}
                                                  aria-invalid={status === 'error' ? true : undefined}
                                                  aria-busy={status === 'saving' ? true : undefined}
                                                  aria-describedby="grade-input-help"
                                                  className={`w-20 h-10 px-2 text-center ${statusClass}`}
                                                  placeholder="1.00"
                                                  aria-label={`Nota actividad ${c.label} ${s.student_name}. Rango 1 a 5.`}
                                                />
                                              </div>
                                            )
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </section>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop/tablet view: existing table */}
            <div className="hidden md:block overflow-x-auto -mx-2 sm:mx-0">
              <table className="min-w-max w-full text-xs lg:text-sm text-left">
                <thead className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 uppercase bg-linear-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20">
                  {activitiesMode ? (
                    <>
                      <tr>
                        <th
                          className="px-1.5 lg:px-2 py-2 lg:py-2.5 font-semibold sticky left-0 z-30 bg-linear-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800"
                          rowSpan={3}
                        >
                          Estudiante
                        </th>
                        {dimensionOrder.map((dimId) => {
                          const dim = dimensionById.get(dimId)
                          const dimAchievements = achievementsByDimension.get(dimId) ?? []
                          if (dimAchievements.length === 0) return null

                          const tone = dimensionTone(dim?.name)

                          const dimCols = dimAchievements.reduce((acc, a) => {
                            const n = activityColumnsByAchievement.get(a.id)?.length ?? 0
                            return acc + Math.max(1, n)
                          }, 0)

                          return (
                            <th
                              key={dimId}
                              className={`px-1.5 lg:px-2 py-2 lg:py-2.5 font-semibold text-center border-l-2 ${tone.groupBg} ${tone.edgeBorder}`}
                              colSpan={dimCols + 1}
                              title={dim?.name ?? ''}
                            >
                              <div className="flex flex-col items-center">
                                <span className="normal-case text-slate-700 dark:text-slate-200">
                                  <span className="sm:hidden">{abbrevDimensionName(dim?.name ?? `Dimensión ${dimId}`)}</span>
                                  <span className="hidden sm:inline">{dim?.name ?? `Dimensión ${dimId}`}</span>
                                </span>
                                <span className="text-[10px] text-slate-400 normal-case">{dim?.percentage ?? 0}%</span>
                              </div>
                            </th>
                          )
                        })}
                        <th className="px-2 lg:px-3 py-2 lg:py-2.5 font-semibold" rowSpan={3}>
                          Definitiva
                        </th>
                      </tr>

                      <tr>
                        {dimensionOrder.flatMap((dimId) => {
                          const dim = dimensionById.get(dimId)
                          const tone = dimensionTone(dim?.name)
                          const dimAchievements = achievementsByDimension.get(dimId) ?? []
                          return [
                            ...dimAchievements.map((a, idx) => {
                              const cols = activityColumnsByAchievement.get(a.id) ?? []
                              return (
                                <th
                                  key={a.id}
                                  className={`px-1.5 lg:px-2 py-2 lg:py-2.5 font-semibold ${tone.groupBg} ${idx === 0 ? `border-l-2 ${tone.edgeBorder}` : ''}`}
                                  colSpan={Math.max(1, cols.length)}
                                  title={a.description}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex flex-col">
                                      <span>{`L${idx + 1}`}</span>
                                      <span className="text-[10px] text-slate-400 normal-case">{a.percentage}%</span>
                                    </div>
                                    {!periodIsClosed && (
                                      <button
                                        type="button"
                                        onClick={() => addActivityColumn(a.id)}
                                        className="h-7 w-7 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                        title="Agregar columna de actividad"
                                      >
                                        +
                                      </button>
                                    )}
                                  </div>
                                </th>
                              )
                            }),
                            <th
                              key={`dim-${dimId}-avg`}
                              className={`px-1.5 lg:px-2 py-2 lg:py-2.5 font-semibold text-center ${tone.groupBg}`}
                              title="Promedio de la dimensión"
                              rowSpan={2}
                            >
                              <span className="normal-case">Prom.</span>
                            </th>,
                          ]
                        })}
                      </tr>

                      <tr>
                        {dimensionOrder.flatMap((dimId) => {
                          const dim = dimensionById.get(dimId)
                          const tone = dimensionTone(dim?.name)
                          const dimAchievements = achievementsByDimension.get(dimId) ?? []
                          return dimAchievements.flatMap((a) => {
                            const cols = activityColumnsByAchievement.get(a.id) ?? []
                            return [
                              ...(cols.length > 0
                                ? cols.map((c, idx) => (
                                    <th
                                      key={c.id}
                                      className={`px-1.5 lg:px-2 py-2 lg:py-2.5 font-semibold normal-case ${tone.groupBg}`}
                                      title={c.label}
                                    >
                                      {editingActivityColumnId === c.id && !periodIsClosed ? (
                                        <div className="flex items-center gap-2">
                                          <Input
                                            value={editingActivityColumnLabel}
                                            onChange={(e) => setEditingActivityColumnLabel(e.target.value)}
                                            onKeyDown={handleActivityColumnLabelKeyDown}
                                            disabled={savingActivityColumnEdit}
                                            className="h-8 w-40 px-2 text-sm"
                                            autoFocus
                                            aria-label="Editar nombre de columna de actividad"
                                          />
                                          <button
                                            type="button"
                                            onClick={saveEditActivityColumn}
                                            disabled={savingActivityColumnEdit}
                                            className="h-8 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 disabled:opacity-60"
                                            title="Guardar"
                                          >
                                            OK
                                          </button>
                                          <button
                                            type="button"
                                            onClick={cancelEditActivityColumn}
                                            disabled={savingActivityColumnEdit}
                                            className="h-8 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 disabled:opacity-60"
                                            title="Cancelar"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-between gap-2">
                                          <button
                                            type="button"
                                            onClick={() => startEditActivityColumn(c.id, c.label)}
                                            disabled={periodIsClosed}
                                            className="text-left w-full hover:underline disabled:no-underline disabled:opacity-60"
                                          >
                                            <span className="sm:hidden">{`A${idx + 1}`}</span>
                                            <span className="hidden sm:inline">{c.label}</span>
                                          </button>
                                          {!periodIsClosed && (
                                            <button
                                              type="button"
                                              onClick={() => deactivateActivityColumn(c.id)}
                                              className="h-7 w-7 shrink-0 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                              title="Desactivar columna"
                                            >
                                              −
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </th>
                                  ))
                                : [
                                    <th
                                      key={`ach-${a.id}-fallback`}
                                      className={`px-1.5 lg:px-2 py-2 lg:py-2.5 font-semibold normal-case ${tone.groupBg}`}
                                      title="Nota directa (sin actividades activas)"
                                    >
                                      Nota
                                    </th>,
                                  ]),
                            ]
                          })
                        })}
                      </tr>
                    </>
                  ) : (
                    <>
                      <tr>
                        <th className="px-1.5 lg:px-2 py-2 lg:py-2.5 font-semibold sticky left-0 z-30 bg-linear-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800" rowSpan={2}>
                          Estudiante
                        </th>
                        {dimensionOrder.map((dimId) => {
                          const dim = dimensionById.get(dimId)
                          const dimAchievements = achievementsByDimension.get(dimId) ?? []
                          if (dimAchievements.length === 0) return null
                          const tone = dimensionTone(dim?.name)
                          return (
                            <th
                              key={dimId}
                              className={`px-1.5 lg:px-2 py-2 lg:py-2.5 font-semibold text-center border-l-2 ${tone.groupBg} ${tone.edgeBorder}`}
                              colSpan={dimAchievements.length + 1}
                              title={dim?.name ?? ''}
                            >
                              <div className="flex flex-col items-center">
                                <span className="normal-case text-slate-700 dark:text-slate-200">
                                  <span className="sm:hidden">{abbrevDimensionName(dim?.name ?? `Dimensión ${dimId}`)}</span>
                                  <span className="hidden sm:inline">{dim?.name ?? `Dimensión ${dimId}`}</span>
                                </span>
                                <span className="text-[10px] text-slate-400 normal-case">{dim?.percentage ?? 0}%</span>
                              </div>
                            </th>
                          )
                        })}
                        <th className="px-2 lg:px-3 py-2 lg:py-2.5 font-semibold" rowSpan={2}>Definitiva</th>
                      </tr>

                      <tr>
                        {dimensionOrder.flatMap((dimId) => {
                          const dim = dimensionById.get(dimId)
                          const tone = dimensionTone(dim?.name)
                          const dimAchievements = achievementsByDimension.get(dimId) ?? []
                          return [
                            ...dimAchievements.map((a, idx) => (
                              <th
                                key={a.id}
                                className={`px-1.5 lg:px-2 py-2 lg:py-2.5 font-semibold ${tone.groupBg} ${idx === 0 ? `border-l-2 ${tone.edgeBorder}` : ''}`}
                                title={a.description}
                              >
                                <div className="flex flex-col">
                                  <span>{`L${idx + 1}`}</span>
                                  <span className="text-[10px] text-slate-400 normal-case">{a.percentage}%</span>
                                </div>
                              </th>
                            )),
                            <th
                              key={`dim-${dimId}-avg`}
                              className={`px-1.5 lg:px-2 py-2 lg:py-2.5 font-semibold text-center ${tone.groupBg}`}
                              title="Promedio de la dimensión"
                            >
                              <span className="normal-case">Prom.</span>
                            </th>,
                          ]
                        })}
                      </tr>
                    </>
                  )}
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {gradebook.students.map((s) => (
                    <tr key={s.enrollment_id} className="bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                      <td className="px-1.5 lg:px-2 py-2 lg:py-2.5 whitespace-nowrap sticky left-0 z-10 bg-white dark:bg-slate-900">
                        <div className="font-medium text-slate-900 dark:text-slate-100 max-w-40 sm:max-w-none truncate" title={s.student_name}>
                          {s.student_name}
                        </div>
                      </td>

                      {activitiesMode
                        ? dimensionOrder.flatMap((dimId) => {
                            const dim = dimensionById.get(dimId)
                            const tone = dimensionTone(dim?.name)
                            const dimAchievements = achievementsByDimension.get(dimId) ?? []
                            const cells = dimAchievements.flatMap((a, aIdx) => {
                              const cols = activityColumnsByAchievement.get(a.id) ?? []
                              if (cols.length === 0) {
                                const key = makeKey(s.enrollment_id, a.id)
                                const value = cellValues[key] ?? ''
                                const status = cellStatus[key]
                                const isDirty = dirtyKeys.has(key)

                                const statusClass =
                                  status === 'error'
                                    ? 'border-rose-300 dark:border-rose-800/60 focus-visible:ring-rose-500'
                                    : status === 'saving'
                                      ? 'border-blue-300 dark:border-blue-800/60 focus-visible:ring-blue-500'
                                      : status === 'saved'
                                        ? 'border-emerald-300 dark:border-emerald-800/60 focus-visible:ring-emerald-500'
                                        : isDirty
                                          ? 'border-amber-300 dark:border-amber-800/60 focus-visible:ring-amber-500'
                                          : 'border-slate-200 dark:border-slate-700 focus-visible:ring-blue-500'

                                return [
                                  <td
                                    key={`ach-${a.id}-fallback`}
                                    className={`px-1.5 lg:px-2 py-2 lg:py-2.5 ${tone.groupBg} ${aIdx === 0 ? `border-l-2 ${tone.edgeBorder}` : ''}`}
                                  >
                                    <Input
                                      value={value}
                                      onChange={(e) => handleChangeCell(s.enrollment_id, a.id, e.target.value)}
                                      onBlur={() => handleCellBlur(s.enrollment_id, a.id)}
                                      onKeyDown={(e) => handleCellKeyDown(e, s.enrollment_id, a.id)}
                                      onFocus={handleCellFocus}
                                      disabled={!canEditEnrollment(s.enrollment_id)}
                                      inputMode="decimal"
                                      pattern="^([1-4](\\.[0-9]{0,2})?|5(\\.0{0,2})?)$"
                                      id={`gradecell-${s.enrollment_id}-${a.id}`}
                                      aria-invalid={status === 'error' ? true : undefined}
                                      aria-busy={status === 'saving' ? true : undefined}
                                      aria-describedby="grade-input-help"
                                      className={`w-16 lg:w-20 h-8 lg:h-9 px-1.5 lg:px-2 text-center ${statusClass}`}
                                      placeholder="1.00–5.00"
                                      aria-label={`Nota ${s.student_name} logro. Rango 1 a 5.`}
                                    />
                                  </td>,
                                ]
                              }

                              return cols.map((c, colIdx) => {
                                const key = makeActivityKey(s.enrollment_id, c.id)
                                const value = activityValues[key] ?? ''
                                const status = activityCellStatus[key]
                                const isDirty = dirtyActivityKeys.has(key)

                                const statusClass =
                                  status === 'error'
                                    ? 'border-rose-300 dark:border-rose-800/60 focus-visible:ring-rose-500'
                                    : status === 'saving'
                                      ? 'border-blue-300 dark:border-blue-800/60 focus-visible:ring-blue-500'
                                      : status === 'saved'
                                        ? 'border-emerald-300 dark:border-emerald-800/60 focus-visible:ring-emerald-500'
                                        : isDirty
                                          ? 'border-amber-300 dark:border-amber-800/60 focus-visible:ring-amber-500'
                                          : 'border-slate-200 dark:border-slate-700 focus-visible:ring-blue-500'

                                return (
                                  <td
                                    key={c.id}
                                    className={`px-1.5 lg:px-2 py-2 lg:py-2.5 ${tone.groupBg} ${aIdx === 0 && colIdx === 0 ? `border-l-2 ${tone.edgeBorder}` : ''}`}
                                  >
                                    <Input
                                      value={value}
                                      onChange={(e) => handleChangeActivityCell(s.enrollment_id, c.id, e.target.value)}
                                      onKeyDown={(e) => handleActivityCellKeyDown(e, s.enrollment_id, c.id)}
                                      onFocus={handleCellFocus}
                                      disabled={!canEditEnrollment(s.enrollment_id)}
                                      inputMode="decimal"
                                      pattern="^([1-4](\\.[0-9]{0,2})?|5(\\.0{0,2})?)$"
                                      id={`activitycell-${s.enrollment_id}-${c.id}`}
                                      aria-invalid={status === 'error' ? true : undefined}
                                      aria-busy={status === 'saving' ? true : undefined}
                                      aria-describedby="grade-input-help"
                                      className={`w-16 lg:w-20 h-8 lg:h-9 px-1.5 lg:px-2 text-center ${statusClass}`}
                                      placeholder="1.00–5.00"
                                      aria-label={`Nota actividad ${c.label} ${s.student_name}. Rango 1 a 5.`}
                                    />
                                  </td>
                                )
                              })
                            })

                            const dimAvg = computeDimScoreForEnrollment(s.enrollment_id, dimId)
                            cells.push(
                              <td
                                key={`dim-${dimId}-avg`}
                                className={`px-1.5 lg:px-2 py-2 lg:py-2.5 whitespace-nowrap ${tone.groupBg}`}
                              >
                                {dimAvg === null ? (
                                  <span className="text-slate-400">—</span>
                                ) : (
                                  <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                                    {dimAvg.toFixed(2)}
                                  </span>
                                )}
                              </td>
                            )

                            return cells
                          })
                        : dimensionOrder.flatMap((dimId) => {
                            const dimAchievements = achievementsByDimension.get(dimId) ?? []
                            const dim = dimensionById.get(dimId)
                            const tone = dimensionTone(dim?.name)
                            const cells = dimAchievements.map((a, idx) => {
                              const key = makeKey(s.enrollment_id, a.id)
                              const value = cellValues[key] ?? ''
                              const status = cellStatus[key]
                              const isDirty = dirtyKeys.has(key)

                              const statusClass =
                                status === 'error'
                                  ? 'border-rose-300 dark:border-rose-800/60 focus-visible:ring-rose-500'
                                  : status === 'saving'
                                    ? 'border-blue-300 dark:border-blue-800/60 focus-visible:ring-blue-500'
                                    : status === 'saved'
                                      ? 'border-emerald-300 dark:border-emerald-800/60 focus-visible:ring-emerald-500'
                                      : isDirty
                                        ? 'border-amber-300 dark:border-amber-800/60 focus-visible:ring-amber-500'
                                        : 'border-slate-200 dark:border-slate-700 focus-visible:ring-blue-500'

                              return (
                                <td
                                  key={a.id}
                                  className={`px-1.5 lg:px-2 py-2 lg:py-2.5 ${tone.groupBg} ${idx === 0 ? `border-l-2 ${tone.edgeBorder}` : ''}`}
                                >
                                  <Input
                                    value={value}
                                    onChange={(e) => handleChangeCell(s.enrollment_id, a.id, e.target.value)}
                                    onBlur={() => handleCellBlur(s.enrollment_id, a.id)}
                                    onKeyDown={(e) => handleCellKeyDown(e, s.enrollment_id, a.id)}
                                    onFocus={handleCellFocus}
                                    disabled={!canEditEnrollment(s.enrollment_id)}
                                    inputMode="decimal"
                                    pattern="^([1-4](\\.[0-9]{0,2})?|5(\\.0{0,2})?)$"
                                    id={`gradecell-${s.enrollment_id}-${a.id}`}
                                    aria-invalid={status === 'error' ? true : undefined}
                                    aria-busy={status === 'saving' ? true : undefined}
                                    aria-describedby="grade-input-help"
                                    className={`w-16 lg:w-20 h-8 lg:h-9 px-1.5 lg:px-2 text-center ${statusClass}`}
                                    placeholder="1.00–5.00"
                                    aria-label={`Nota ${s.student_name} ${dim?.name ? `(${dim.name})` : ''} logro L${idx + 1}. Rango 1 a 5.`}
                                  />
                                </td>
                              )
                            })

                            const dimAvg = computeDimScoreForEnrollment(s.enrollment_id, dimId)

                            cells.push(
                              <td
                                key={`dim-${dimId}-avg`}
                                className={`px-1.5 lg:px-2 py-2 lg:py-2.5 whitespace-nowrap ${tone.groupBg}`}
                              >
                                {dimAvg === null ? (
                                  <span className="text-slate-400">—</span>
                                ) : (
                                  <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                                    {dimAvg.toFixed(2)}
                                  </span>
                                )}
                              </td>
                            )

                            return cells
                          })}

                      <td className="px-1.5 lg:px-2 py-2 lg:py-2.5 whitespace-nowrap">
                        {(() => {
                          const liveFinal = computeFinalScoreForEnrollment(s.enrollment_id)
                          const c = computedByEnrollmentId.get(s.enrollment_id)

                          if (liveFinal === null && !c) return <span className="text-slate-400">—</span>

                          const finalScore = liveFinal !== null ? liveFinal : c ? Number(c.final_score) : null
                          const category = categoryFromScale(c?.scale) ?? categoryFromScore(finalScore)
                          const style = definitiveStyle(category)

                          return (
                            <div className="flex flex-col">
                              <span
                                className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style.className} w-fit`}
                                aria-label={`Definitiva ${liveFinal !== null ? liveFinal.toFixed(2) : c ? formatScore(c.final_score) : '—'}${style.label ? ` (${style.label})` : ''}`}
                              >
                                {liveFinal !== null ? liveFinal.toFixed(2) : c ? formatScore(c.final_score) : '—'}
                              </span>
                              {c?.scale ? <span className="text-xs text-slate-500 dark:text-slate-400">{c.scale}</span> : null}
                            </div>
                          )
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {gradebook.students.length === 0 && (
              <div className="text-sm text-slate-500 dark:text-slate-400">No hay estudiantes activos en el grupo.</div>
            )}

            {gradebook.achievements.length === 0 && (
              <div className="text-sm text-slate-500 dark:text-slate-400 mt-2">No hay logros planeados para este periodo/asignación.</div>
            )}

            {gradebook.achievements.length > 0 && !periodIsClosed && (
              <div className="hidden md:block text-xs text-slate-500 dark:text-slate-400 mt-3">
                Atajos: Enter/Shift+Enter (abajo/arriba), ↑↓ (fila), ←→ (columna), Tab/Shift+Tab (siguiente/anterior), Cmd/Ctrl+S (guardar), Esc (salir).
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!loadingGradebook && !gradebook && (
        <div className="p-4 text-slate-600 dark:text-slate-300">
          Selecciona grado, grupo, asignatura y periodo.
        </div>
      )}
    </div>
  )
}
