import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GraduationCap, Save } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  academicApi,
  type GradebookAvailableSheet,
  type GradebookResponse,
  type GradebookBlockedItem,
  type Group,
  type Period,
  type TeacherAssignment,
} from '../services/academic'
import { useAuthStore } from '../store/auth'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Toast, type ToastType } from '../components/ui/Toast'

type CellKey = `${number}:${number}`

const makeKey = (enrollmentId: number, achievementId: number): CellKey => `${enrollmentId}:${achievementId}`

export default function Grades() {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  const navigate = useNavigate()

  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [groups, setGroups] = useState<Group[]>([])

  const [selectedGradeId, setSelectedGradeId] = useState<number | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [selectedAcademicLoadId, setSelectedAcademicLoadId] = useState<number | null>(null)
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedTeacherAssignmentId, setSelectedTeacherAssignmentId] = useState<number | null>(null)

  const [gradebook, setGradebook] = useState<GradebookResponse | null>(null)

  const [availableSheets, setAvailableSheets] = useState<GradebookAvailableSheet[]>([])
  const [loadingSheets, setLoadingSheets] = useState(false)

  const [loadingInit, setLoadingInit] = useState(true)
  const [loadingGradebook, setLoadingGradebook] = useState(false)
  const [saving, setSaving] = useState(false)

  const saveTimersRef = useRef<Record<CellKey, number>>({})
  const inFlightSavesRef = useRef<Set<CellKey>>(new Set())
  const statusTimersRef = useRef<Record<CellKey, number>>({})
  const lastInteractionRef = useRef<'keyboard' | 'pointer'>('pointer')
  const [cellStatus, setCellStatus] = useState<Record<CellKey, 'saving' | 'saved' | 'error'>>({})
  const [computedOverrides, setComputedOverrides] = useState<Record<number, { final_score: number | string; scale: string | null }>>({})

  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }, [])

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
  const [lastBlocked, setLastBlocked] = useState<GradebookBlockedItem[]>([])

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
    const gradeIds = new Set<number>()
    for (const a of visibleAssignments) {
      const g = groupById.get(a.group)
      if (g) gradeIds.add(g.grade)
    }

    const options: { id: number; name: string }[] = []
    for (const gradeId of gradeIds) {
      const anyGroup = groups.find((g) => g.grade === gradeId)
      options.push({ id: gradeId, name: anyGroup?.grade_name || `Grado ${gradeId}` })
    }
    options.sort((a, b) => a.name.localeCompare(b.name))
    return options
  }, [groupById, groups, visibleAssignments])

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
    if (user?.role === 'TEACHER') {
      if (!selectedTeacherAssignmentId) return null
      return visibleAssignments.find((a) => a.id === selectedTeacherAssignmentId) ?? null
    }

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
      .filter((p) => yearIds.has(p.academic_year))
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

  const parseScoreOrNull = (raw: string): number | null => {
    const trimmed = sanitizeScoreInput(raw).trim()
    if (!trimmed) return null
    const score = Number(trimmed)
    if (!Number.isFinite(score)) return NaN
    return score
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
        return { label: 'Bajo', className: 'border-rose-200 bg-rose-50 text-rose-700' }
      case 'basic':
        return { label: 'Básico', className: 'border-amber-200 bg-amber-50 text-amber-700' }
      case 'high':
        return { label: 'Alto', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
      case 'superior':
        return { label: 'Superior', className: 'border-sky-200 bg-sky-50 text-sky-700' }
      default:
        return { label: null, className: 'border-slate-200 bg-white text-slate-900' }
    }
  }

  const dimensionById = useMemo(() => {
    const map = new Map<number, { id: number; name: string; percentage: number }>()
    for (const d of gradebook?.dimensions ?? []) map.set(d.id, d)
    return map
  }, [gradebook?.dimensions])

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
          const key = makeKey(enrollmentId, a.id)
          const scoreOrNull = parseScoreOrNull(cellValues[key] ?? '')
          const score = scoreOrNull === null ? 1 : scoreOrNull
          if (!Number.isFinite(score)) return null

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
    [achievementsByDimension, cellValues, dimensionById, dimensionOrder, gradebook]
  )

  const computeDimScoreForEnrollment = useCallback(
    (enrollmentId: number, dimId: number) => {
      if (!gradebook) return null

      const dimAchievements = achievementsByDimension.get(dimId) ?? []
      if (dimAchievements.length === 0) return null

      let totalWeight = 0
      let weightedTotal = 0

      for (const a of dimAchievements) {
        const key = makeKey(enrollmentId, a.id)
        const scoreOrNull = parseScoreOrNull(cellValues[key] ?? '')
        const score = scoreOrNull === null ? 1 : scoreOrNull
        if (!Number.isFinite(score)) return null

        const w = a.percentage ? Number(a.percentage) : 1
        totalWeight += w
        weightedTotal += score * w
      }

      const dimGrade = totalWeight > 0 ? weightedTotal / totalWeight : 1
      return Number.isFinite(dimGrade) ? dimGrade : null
    },
    [achievementsByDimension, cellValues, gradebook]
  )

  const completion = useMemo(() => {
    const studentsCount = gradebook?.students?.length ?? 0
    const achievementsCount = gradebook?.achievements?.length ?? 0
    const total = studentsCount * achievementsCount
    if (!gradebook || total <= 0) {
      return { total: 0, filled: 0, percent: 0 }
    }

    let filled = 0
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

    const percent = Math.round((filled / total) * 100)
    return { total, filled, percent }
  }, [cellValues, gradebook])

  const loadInit = useCallback(async () => {
    setLoadingInit(true)
    try {
      const [assignmentsRes, periodsRes, groupsRes] = await Promise.all([
        user?.role === 'TEACHER' ? academicApi.listMyAssignments() : academicApi.listAssignments(),
        academicApi.listPeriods(),
        academicApi.listGroups(),
      ])

      setAssignments(assignmentsRes.data)
      setPeriods(periodsRes.data)
      setGroups(groupsRes.data)

      const filteredAssignments = assignmentsRes.data

      if (filteredAssignments.length > 0) {
        const firstAssignment = filteredAssignments[0]
        const firstGroup = groupsRes.data.find((g) => g.id === firstAssignment.group)

        if (firstGroup) {
          setSelectedGradeId(firstGroup.grade)
          setSelectedGroupId(firstGroup.id)
        }
        setSelectedAcademicLoadId(firstAssignment.academic_load)

        const pForYear = periodsRes.data.filter((p) => p.academic_year === firstAssignment.academic_year)
        if (pForYear.length > 0 && selectedPeriodId == null) setSelectedPeriodId(pForYear[0].id)

        // Nota: no forzar selección en TEACHER; el flujo por defecto es cards.
      }
    } catch (e) {
      console.error(e)
      showToast('No se pudo cargar asignaciones/periodos', 'error')
    } finally {
      setLoadingInit(false)
    }
  }, [selectedPeriodId, showToast, user?.id, user?.role])

  useEffect(() => {
    if (user?.role !== 'TEACHER') return
    const params = new URLSearchParams(location.search)
    const periodRaw = params.get('period')
    const taRaw = params.get('ta')

    const parsedPeriod = periodRaw ? Number(periodRaw) : null
    const parsedTa = taRaw ? Number(taRaw) : null

    const periodId = parsedPeriod && Number.isFinite(parsedPeriod) && parsedPeriod > 0 ? parsedPeriod : null
    const teacherAssignmentId = parsedTa && Number.isFinite(parsedTa) && parsedTa > 0 ? parsedTa : null

    if (periodId && periodId !== selectedPeriodId) setSelectedPeriodId(periodId)
    if (teacherAssignmentId !== selectedTeacherAssignmentId) setSelectedTeacherAssignmentId(teacherAssignmentId)
  }, [location.search, selectedPeriodId, selectedTeacherAssignmentId, user?.role])

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

      setBaseValues(nextBase)
      setCellValues(nextBase)
      setDirtyKeys(new Set())
    } catch (e) {
      console.error(e)
      setGradebook(null)
      setBaseValues({})
      setCellValues({})
      setDirtyKeys(new Set())
      showToast('No se pudo cargar la planilla', 'error')
    } finally {
      setLoadingGradebook(false)
    }
  }, [showToast])

  useEffect(() => {
    loadInit()
  }, [loadInit])

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

  const anyInFlightSaves = inFlightSavesRef.current.size > 0
  const hasDirty = dirtyKeys.size > 0
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
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : user?.role === 'TEACHER' && gradeWindowClosed && !activeGradeGrant?.hasFull && (activeGradeGrant?.allowedEnrollments?.size ?? 0) === 0
      ? 'border-rose-200 bg-rose-50 text-rose-700'
    : saving || anyInFlightSaves
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : hasDirty
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700'

  if (loadingInit) return <div className="p-6">Cargando…</div>

  const teacherMode = user?.role === 'TEACHER'
  const showingCards = teacherMode && !selectedTeacherAssignmentId

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
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <GraduationCap className="h-6 w-6 text-blue-600" />
            </div>
            Calificaciones
          </h2>
          <p className="text-slate-500 mt-1">Planilla de notas por logros.</p>
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
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

            <Button
              onClick={handleSave}
              disabled={saving || dirtyKeys.size === 0 || !gradebook || periodIsClosed}
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
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                dirtyKeys.size === 0 ||
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
          </div>
        )}
      </div>

      {user?.role === 'TEACHER' && gradeWindowClosed && (
        <Card className="border border-rose-200 bg-rose-50">
          <CardHeader>
            <CardTitle className="text-rose-800">Edición cerrada (Planilla)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-rose-700">
              El plazo para editar las notas de este periodo ya venció.
              {loadingGradeGrant ? ' Verificando permisos…' : ''}
              {activeGradeGrant?.validUntil ? ` Permiso vigente hasta: ${new Date(activeGradeGrant.validUntil).toLocaleString()}` : ''}
            </p>
            <p className="text-xs text-rose-700">
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
        <div className="border border-amber-200 bg-amber-50 text-amber-800 rounded-lg p-3 text-sm">
          <div className="font-semibold">Algunas notas no se guardaron</div>
          <div className="mt-1 text-xs">
            Bloqueadas: {Array.from(new Set(lastBlocked.map((b) => b.enrollment)))
              .map((enr) => gradebook.students.find((s) => s.enrollment_id === enr)?.student_name || `Enrollment ${enr}`)
              .join(', ')}
          </div>
        </div>
      )}

      {teacherMode && showingCards && !selectedPeriodId && (
        <div className="p-4 text-slate-600">Selecciona un periodo para ver tus planillas.</div>
      )}

      {teacherMode && showingCards && selectedPeriodId && (
        <div className="space-y-4">
          {loadingSheets ? <div className="p-4">Cargando planillas…</div> : null}

          {!loadingSheets && availableSheets.length === 0 ? (
            <div className="p-4 text-slate-600">No hay planillas disponibles para este periodo.</div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {availableSheets.map((s) => {
              const complete = s.completion.is_complete
              const badgeClass = complete
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700'

              return (
                <Card key={s.teacher_assignment_id} className="border-slate-200 shadow-sm">
                  <CardHeader className="border-b border-slate-100 bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base font-semibold text-slate-900">
                          {s.grade_name} • {s.group_name}
                        </CardTitle>
                        <div className="text-sm text-slate-500 mt-0.5">{s.subject_name ?? 'Asignatura'}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{s.period.name}{s.period.is_closed ? ' (Cerrado)' : ''}</div>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeClass}`}>
                        {complete ? 'Completa' : 'Incompleta'}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>
                        Diligenciamiento: {s.completion.filled}/{s.completion.total}
                      </span>
                      <span className="font-medium text-slate-700">{s.completion.percent}%</span>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.completion.percent}>
                      <div className="h-2 rounded-full bg-blue-600" style={{ width: `${s.completion.percent}%` }} />
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-xs text-slate-500">
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
      )}

      {loadingGradebook && !showingCards && <div className="p-4">Cargando planilla…</div>}

      {!loadingGradebook && gradebook && !showingCards && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-white">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-lg font-semibold text-slate-900">Planilla</CardTitle>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${globalSaveClass}`}>
                  {globalSaveLabel}
                </span>
                {periodIsClosed && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-amber-200 bg-amber-50 text-amber-700">
                    Periodo cerrado
                  </span>
                )}
              </div>
            </div>

            {gradebook?.achievements?.length ? (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    Diligenciamiento: {completion.filled}/{completion.total}
                  </span>
                  <span className="font-medium text-slate-700">{completion.percent}%</span>
                </div>
                <div
                  className="mt-2 h-2 w-full rounded-full bg-slate-200"
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
              <div className="text-sm text-slate-600 mb-3">
                Este periodo está cerrado. La planilla está en modo solo lectura.
              </div>
            )}

            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <table className="min-w-max w-full text-xs sm:text-sm text-left">
                <thead className="text-[11px] sm:text-xs text-slate-500 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200 sticky top-0 z-20">
                  <tr>
                    <th className="px-3 sm:px-6 py-3 sm:py-4 font-semibold sticky left-0 z-30 bg-linear-to-r from-slate-50 to-slate-100" rowSpan={2}>
                      Estudiante
                    </th>
                    {dimensionOrder.map((dimId) => {
                      const dim = dimensionById.get(dimId)
                      const dimAchievements = achievementsByDimension.get(dimId) ?? []
                      if (dimAchievements.length === 0) return null
                      return (
                        <th
                          key={dimId}
                          className="px-3 sm:px-6 py-3 sm:py-4 font-semibold text-center"
                          colSpan={dimAchievements.length + 1}
                          title={dim?.name ?? ''}
                        >
                          <div className="flex flex-col items-center">
                            <span className="normal-case text-slate-700">
                              <span className="sm:hidden">{abbrevDimensionName(dim?.name ?? `Dimensión ${dimId}`)}</span>
                              <span className="hidden sm:inline">{dim?.name ?? `Dimensión ${dimId}`}</span>
                            </span>
                            <span className="text-[10px] text-slate-400 normal-case">{dim?.percentage ?? 0}%</span>
                          </div>
                        </th>
                      )
                    })}
                    <th className="px-6 py-4 font-semibold" rowSpan={2}>Definitiva</th>
                  </tr>

                  <tr>
                    {dimensionOrder.flatMap((dimId) => {
                      const dimAchievements = achievementsByDimension.get(dimId) ?? []
                      return [
                        ...dimAchievements.map((a, idx) => (
                          <th key={a.id} className="px-3 sm:px-6 py-3 sm:py-4 font-semibold" title={a.description}>
                            <div className="flex flex-col">
                              <span>{`L${idx + 1}`}</span>
                              <span className="text-[10px] text-slate-400 normal-case">{a.percentage}%</span>
                            </div>
                          </th>
                        )),
                        <th key={`dim-${dimId}-avg`} className="px-3 sm:px-6 py-3 sm:py-4 font-semibold text-center" title="Promedio de la dimensión">
                          <span className="normal-case">Prom.</span>
                        </th>,
                      ]
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {gradebook.students.map((s) => (
                    <tr key={s.enrollment_id} className="bg-white hover:bg-slate-50/80 transition-colors">
                      <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap sticky left-0 z-10 bg-white">
                        <div className="font-medium text-slate-900 max-w-40 sm:max-w-none truncate" title={s.student_name}>
                          {s.student_name}
                        </div>
                      </td>

                      {dimensionOrder.flatMap((dimId) => {
                        const dimAchievements = achievementsByDimension.get(dimId) ?? []
                        const dim = dimensionById.get(dimId)
                        const cells = dimAchievements.map((a, idx) => {
                          const key = makeKey(s.enrollment_id, a.id)
                          const value = cellValues[key] ?? ''
                          const status = cellStatus[key]
                          const isDirty = dirtyKeys.has(key)

                          const statusClass =
                            status === 'error'
                              ? 'border-rose-300 focus-visible:ring-rose-500'
                              : status === 'saving'
                                ? 'border-blue-300 focus-visible:ring-blue-500'
                                : status === 'saved'
                                  ? 'border-emerald-300 focus-visible:ring-emerald-500'
                                  : isDirty
                                    ? 'border-amber-300 focus-visible:ring-amber-500'
                                    : 'border-slate-200 focus-visible:ring-blue-500'

                          return (
                            <td key={a.id} className="px-3 sm:px-6 py-3 sm:py-4">
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
                                className={`w-20 sm:w-24 h-9 sm:h-10 px-2 sm:px-3 text-center ${statusClass}`}
                                placeholder="1.00–5.00"
                                aria-label={`Nota ${s.student_name} ${dim?.name ? `(${dim.name})` : ''} logro L${idx + 1}. Rango 1 a 5.`}
                              />
                            </td>
                          )
                        })

                        const dimAvg = computeDimScoreForEnrollment(s.enrollment_id, dimId)

                        cells.push(
                          <td key={`dim-${dimId}-avg`} className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                            {dimAvg === null ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold border border-slate-200 bg-white text-slate-900">
                                {dimAvg.toFixed(2)}
                              </span>
                            )}
                          </td>
                        )

                        return cells
                      })}

                      <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
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
                              {c?.scale ? <span className="text-xs text-slate-500">{c.scale}</span> : null}
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
              <div className="text-sm text-slate-500">No hay estudiantes activos en el grupo.</div>
            )}

            {gradebook.achievements.length === 0 && (
              <div className="text-sm text-slate-500 mt-2">No hay logros planeados para este periodo/asignación.</div>
            )}

            {gradebook.achievements.length > 0 && !periodIsClosed && (
              <div className="text-xs text-slate-500 mt-3">
                Atajos: Enter/Shift+Enter (abajo/arriba), ↑↓ (fila), ←→ (columna), Tab/Shift+Tab (siguiente/anterior), Cmd/Ctrl+S (guardar), Esc (salir).
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!loadingGradebook && !gradebook && (
        <div className="p-4 text-slate-600">
          Selecciona grado, grupo, asignatura y periodo.
        </div>
      )}
    </div>
  )
}
