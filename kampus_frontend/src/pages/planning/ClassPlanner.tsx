import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookMarked, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, Download, PenSquare, Plus, Sparkles, Wand2 } from 'lucide-react'
import { academicApi } from '../../services/academic'
import type {
  AcademicYear,
  ClassPlan,
  ClassPlannerSummaryResponse,
  Period,
  PeriodTopic,
  TeacherAssignment,
} from '../../services/academic'
import { reportsApi } from '../../services/reports'
import type { ReportJob } from '../../services/reports'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Label } from '../../components/ui/Label'
import { Modal } from '../../components/ui/Modal'
import { Toast, type ToastType } from '../../components/ui/Toast'

type ClassPlanFormState = {
  period: number | ''
  teacher_assignment: number | ''
  topic: number | ''
  title: string
  class_date: string
  duration_minutes: number
  learning_result: string
  dba_reference: string
  standard_reference: string
  competency_know: string
  competency_do: string
  competency_be: string
  class_purpose: string
  start_time_minutes: number
  start_activities: string
  development_time_minutes: number
  development_activities: string
  closing_time_minutes: number
  closing_activities: string
  evidence_product: string
  evaluation_instrument: string
  evaluation_criterion: string
  resources: string
  dua_adjustments: string
  status: 'DRAFT' | 'FINALIZED'
}

const createEmptyForm = (): ClassPlanFormState => ({
  period: '',
  teacher_assignment: '',
  topic: '',
  title: '',
  class_date: '',
  duration_minutes: 55,
  learning_result: '',
  dba_reference: '',
  standard_reference: '',
  competency_know: '',
  competency_do: '',
  competency_be: '',
  class_purpose: '',
  start_time_minutes: 10,
  start_activities: '',
  development_time_minutes: 35,
  development_activities: '',
  closing_time_minutes: 10,
  closing_activities: '',
  evidence_product: '',
  evaluation_instrument: '',
  evaluation_criterion: '',
  resources: '',
  dua_adjustments: '',
  status: 'DRAFT',
})

const NUMERIC_CLASS_PLAN_FIELDS = new Set<keyof ClassPlanFormState>([
  'duration_minutes',
  'start_time_minutes',
  'development_time_minutes',
  'closing_time_minutes',
])

const TEXT_CLASS_PLAN_FIELDS = new Set<keyof ClassPlanFormState>([
  'title',
  'learning_result',
  'dba_reference',
  'standard_reference',
  'competency_know',
  'competency_do',
  'competency_be',
  'class_purpose',
  'start_activities',
  'development_activities',
  'closing_activities',
  'evidence_product',
  'evaluation_instrument',
  'evaluation_criterion',
  'resources',
  'dua_adjustments',
])

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error !== 'object' || error === null) return fallback
  const maybeAxios = error as { response?: { data?: unknown } }
  const data = maybeAxios.response?.data

  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const detail = (data as Record<string, unknown>).detail
    if (typeof detail === 'string') return detail
    const firstValue = Object.values(data as Record<string, unknown>)[0]
    if (typeof firstValue === 'string') return firstValue
    if (Array.isArray(firstValue) && typeof firstValue[0] === 'string') return firstValue[0]
  }

  return fallback
}

export default function ClassPlanner() {
  type TopicSortKey = 'grade' | 'period'

  const TOPICS_PAGE_SIZE = 6
  const PLANS_PAGE_SIZE = 6
  const [years, setYears] = useState<AcademicYear[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [topics, setTopics] = useState<PeriodTopic[]>([])
  const [plans, setPlans] = useState<ClassPlan[]>([])
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [plannerSummary, setPlannerSummary] = useState<ClassPlannerSummaryResponse | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | ''>('')
  const [selectedPeriod, setSelectedPeriod] = useState<number | ''>('')
  const [selectedGrade, setSelectedGrade] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [draftAlreadyGenerated, setDraftAlreadyGenerated] = useState(false)
  const [draftProgress, setDraftProgress] = useState(0)
  const [generatingSection, setGeneratingSection] = useState<string | null>(null)
  const [activeExportJobs, setActiveExportJobs] = useState<Record<number, ReportJob>>({})
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null)
  const [formData, setFormData] = useState<ClassPlanFormState>(createEmptyForm())
  const [topicSearch, setTopicSearch] = useState('')
  const [topicSort, setTopicSort] = useState<{ key: TopicSortKey; direction: 'asc' | 'desc' }>({ key: 'grade', direction: 'asc' })
  const [planSearch, setPlanSearch] = useState('')
  const [topicPage, setTopicPage] = useState(1)
  const [planPage, setPlanPage] = useState(1)
  const downloadedJobIds = useRef<Set<number>>(new Set())
  const draftStreamAbortRef = useRef<AbortController | null>(null)
  const typingTimersRef = useRef<Partial<Record<keyof ClassPlanFormState, number>>>({})
  const formDataRef = useRef<ClassPlanFormState>(formData)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  useEffect(() => {
    formDataRef.current = formData
  }, [formData])

  const clearTypingTimerForField = (field: keyof ClassPlanFormState) => {
    const timerId = typingTimersRef.current[field]
    if (timerId !== undefined) {
      window.clearInterval(timerId)
      delete typingTimersRef.current[field]
    }
  }

  const clearAllTypingTimers = () => {
    for (const field of Object.keys(typingTimersRef.current) as Array<keyof ClassPlanFormState>) {
      clearTypingTimerForField(field)
    }
  }

  const animateTextFieldValue = (field: keyof ClassPlanFormState, targetValue: string) => {
    clearTypingTimerForField(field)

    const currentValueRaw = formDataRef.current[field]
    const currentValue = typeof currentValueRaw === 'string' ? currentValueRaw : ''
    const target = targetValue || ''

    if (!target || currentValue === target) {
      setFormData((prev) => ({ ...prev, [field]: target as never }))
      return
    }

    const startsWithCurrent = target.startsWith(currentValue)
    let index = startsWithCurrent ? currentValue.length : 0

    if (!startsWithCurrent) {
      setFormData((prev) => ({ ...prev, [field]: '' as never }))
      formDataRef.current = { ...formDataRef.current, [field]: '' }
    }

    const remaining = Math.max(target.length - index, 1)
    const frames = Math.min(48, Math.max(18, remaining))
    const step = Math.max(1, Math.ceil(remaining / frames))

    const timerId = window.setInterval(() => {
      index = Math.min(target.length, index + step)
      const nextChunk = target.slice(0, index)
      setFormData((prev) => ({ ...prev, [field]: nextChunk as never }))
      formDataRef.current = { ...formDataRef.current, [field]: nextChunk }

      if (index >= target.length) {
        clearTypingTimerForField(field)
      }
    }, 55)

    typingTimersRef.current[field] = timerId
  }

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [yearsRes, periodsRes] = await Promise.all([
          academicApi.listYears(),
          academicApi.listPeriods(),
        ])
        setYears(yearsRes.data)
        const activeYear = yearsRes.data.find((year) => year.status === 'ACTIVE')
        const fallbackYear = activeYear?.id ?? yearsRes.data[0]?.id ?? ''
        setSelectedYear(fallbackYear)

        if (fallbackYear) {
          const filteredPeriods = periodsRes.data.filter((period) => period.academic_year === fallbackYear)
          setPeriods(filteredPeriods)
          setSelectedPeriod('')
        }
      } catch (err) {
        console.error(err)
        setError('No se pudo cargar el contexto inicial del planeador de clases.')
      }
    }

    loadInitialData()
  }, [])

  useEffect(() => {
    if (!selectedYear) {
      setPeriods([])
      setSelectedPeriod('')
      return
    }

    const loadPeriods = async () => {
      try {
        const res = await academicApi.listPeriods()
        const filteredPeriods = res.data.filter((period) => period.academic_year === Number(selectedYear))
        setPeriods(filteredPeriods)
        setSelectedPeriod((current) => {
          if (current && filteredPeriods.some((period) => period.id === Number(current))) {
            return current
          }
          return ''
        })
      } catch (err) {
        console.error(err)
        setError('No se pudieron cargar los periodos del año seleccionado.')
      }
    }

    loadPeriods()
  }, [selectedYear])

  const refreshPlannerData = useCallback(async () => {
    if (!selectedYear) return
    const params: Record<string, unknown> = { academic_year: Number(selectedYear) }
    if (selectedPeriod) params.period = Number(selectedPeriod)

    const [topicsRes, plansRes, assignmentsRes, summaryRes] = await Promise.all([
      academicApi.listMyPeriodTopics(params),
      academicApi.listMyClassPlans(params),
      academicApi.listMyAssignments({ academic_year: Number(selectedYear) }),
      academicApi.getMyClassPlanSummary(params),
    ])
    setTopics(topicsRes.data)
    setPlans(plansRes.data)
    setAssignments(assignmentsRes.data)
    setPlannerSummary(summaryRes.data)
  }, [selectedPeriod, selectedYear])

  useEffect(() => {
    if (!selectedYear) {
      setTopics([])
      setPlans([])
      setAssignments([])
      return
    }

    const loadPlannerData = async () => {
      setLoading(true)
      setError(null)
      try {
        await refreshPlannerData()
      } catch (err) {
        console.error(err)
        setError('No se pudieron cargar las temáticas, asignaciones y planes del docente.')
      } finally {
        setLoading(false)
      }
    }

    loadPlannerData()
  }, [refreshPlannerData, selectedPeriod, selectedYear])

  const finalizedPlans = useMemo(
    () => plans.filter((plan) => plan.status === 'FINALIZED').length,
    [plans]
  )

  useEffect(() => {
    const jobs = Object.values(activeExportJobs)
    if (jobs.length === 0) return

    const polling = window.setInterval(async () => {
      try {
        const results = await Promise.all(jobs.map((job) => reportsApi.getJob(job.id)))
        const nextJobs: Record<number, ReportJob> = {}

        for (const result of results) {
          const job = result.data
          const classPlanId = Number(job.params.class_plan_id)
          if (!Number.isFinite(classPlanId) || !classPlanId) continue

          if (job.status === 'SUCCEEDED') {
            if (!downloadedJobIds.current.has(job.id)) {
              downloadedJobIds.current.add(job.id)
              const downloadResponse = await reportsApi.downloadJob(job.id)
              const url = window.URL.createObjectURL(new Blob([downloadResponse.data], { type: 'application/pdf' }))
              const link = document.createElement('a')
              link.href = url
              link.download = job.output_filename ?? `plan_de_clase_${classPlanId}.pdf`
              document.body.appendChild(link)
              link.click()
              link.remove()
              window.URL.revokeObjectURL(url)
              showToast('El PDF del plan ya está listo y se descargó.', 'success')
              void refreshPlannerData()
            }
            continue
          }

          if (job.status === 'FAILED' || job.status === 'CANCELED') {
            if (!downloadedJobIds.current.has(job.id)) {
              downloadedJobIds.current.add(job.id)
              showToast(job.error_message || 'La exportación del plan no se pudo completar.', 'error')
              void refreshPlannerData()
            }
            continue
          }

          nextJobs[classPlanId] = job
        }

        setActiveExportJobs(nextJobs)
      } catch (pollError) {
        console.error(pollError)
      }
    }, 2000)

    return () => window.clearInterval(polling)
  }, [activeExportJobs, refreshPlannerData])

  const compatibleAssignments = useMemo(() => {
    if (!formData.topic) return assignments
    const topic = topics.find((item) => item.id === Number(formData.topic))
    if (!topic) return assignments
    return assignments.filter((assignment) => assignment.academic_load === topic.academic_load)
  }, [assignments, formData.topic, topics])

  const topicOptions = useMemo(() => {
    if (!selectedPeriod) return topics
    return topics.filter((topic) => topic.period === Number(selectedPeriod))
  }, [selectedPeriod, topics])

  const topicsForKpi = useMemo(() => {
    const gradeFilter = selectedGrade.trim().toLowerCase()
    if (!gradeFilter) return topicOptions
    return topicOptions.filter((topic) => (topic.grade_name || '').toLowerCase() === gradeFilter)
  }, [selectedGrade, topicOptions])

  const plansForKpi = useMemo(() => {
    const gradeFilter = selectedGrade.trim().toLowerCase()
    if (!gradeFilter) return plans
    return plans.filter((plan) => (plan.grade_name || '').toLowerCase() === gradeFilter)
  }, [plans, selectedGrade])

  const planByTopicId = useMemo(() => {
    const map = new Map<number, ClassPlan>()
    for (const plan of plans) {
      if (typeof plan.topic !== 'number') continue
      const current = map.get(plan.topic)
      if (!current || new Date(plan.updated_at).getTime() > new Date(current.updated_at).getTime()) {
        map.set(plan.topic, plan)
      }
    }
    return map
  }, [plans])

  const topicsWithoutPlanCount = useMemo(() => {
    const plannedTopicIds = new Set(
      plansForKpi
        .map((plan) => plan.topic)
        .filter((topicId): topicId is number => typeof topicId === 'number')
    )
    return topicsForKpi.filter((topic) => !plannedTopicIds.has(topic.id)).length
  }, [plansForKpi, topicsForKpi])

  const availableGrades = useMemo(() => {
    const gradeSet = new Set<string>()

    for (const topic of topics) {
      const grade = (topic.grade_name || '').trim()
      if (grade) gradeSet.add(grade)
    }

    for (const plan of plans) {
      const grade = (plan.grade_name || '').trim()
      if (grade) gradeSet.add(grade)
    }

    for (const assignment of assignments) {
      const grade = (assignment.grade_name || '').trim()
      if (grade) gradeSet.add(grade)
    }

    return Array.from(gradeSet).sort((left, right) =>
      left.localeCompare(right, 'es', { sensitivity: 'base', numeric: true })
    )
  }, [assignments, plans, topics])

  const filteredAvailableTopics = useMemo(() => {
    const gradeFilter = selectedGrade.trim().toLowerCase()
    const query = topicSearch.trim().toLowerCase()
    const gradeFiltered = gradeFilter
      ? topicOptions.filter((topic) => (topic.grade_name || '').toLowerCase() === gradeFilter)
      : topicOptions

    if (!query) return gradeFiltered
    return gradeFiltered.filter((topic) => {
      const haystack = [topic.title, topic.description, topic.subject_name, topic.grade_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [selectedGrade, topicOptions, topicSearch])

  const sortedAvailableTopics = useMemo(() => {
    const topicsToSort = [...filteredAvailableTopics]
    const directionFactor = topicSort.direction === 'asc' ? 1 : -1

    const compareText = (left?: string, right?: string) =>
      (left || '').localeCompare(right || '', 'es', { sensitivity: 'base', numeric: true })

    return topicsToSort.sort((left, right) => {
      const gradeCmp = compareText(left.grade_name, right.grade_name)
      const periodCmp = compareText(left.period_name, right.period_name)
      const titleCmp = compareText(left.title, right.title)

      const baseCmp = topicSort.key === 'grade'
        ? gradeCmp || periodCmp || titleCmp
        : periodCmp || gradeCmp || titleCmp

      return baseCmp * directionFactor
    })
  }, [filteredAvailableTopics, topicSort])

  const paginatedAvailableTopics = useMemo(() => {
    const start = (topicPage - 1) * TOPICS_PAGE_SIZE
    return sortedAvailableTopics.slice(start, start + TOPICS_PAGE_SIZE)
  }, [sortedAvailableTopics, topicPage])

  const totalTopicPages = Math.max(1, Math.ceil(sortedAvailableTopics.length / TOPICS_PAGE_SIZE))

  const toggleTopicSort = (key: TopicSortKey) => {
    setTopicSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key, direction: 'asc' }
    })
  }

  const filteredPlans = useMemo(() => {
    const gradeFilter = selectedGrade.trim().toLowerCase()
    const query = planSearch.trim().toLowerCase()
    const gradeFiltered = gradeFilter
      ? plans.filter((plan) => (plan.grade_name || '').toLowerCase() === gradeFilter)
      : plans

    if (!query) return gradeFiltered
    return gradeFiltered.filter((plan) => {
      const haystack = [plan.title, plan.topic_title, plan.group_name, plan.subject_name, plan.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [plans, planSearch, selectedGrade])

  const paginatedPlans = useMemo(() => {
    const start = (planPage - 1) * PLANS_PAGE_SIZE
    return filteredPlans.slice(start, start + PLANS_PAGE_SIZE)
  }, [filteredPlans, planPage])

  const totalPlanPages = Math.max(1, Math.ceil(filteredPlans.length / PLANS_PAGE_SIZE))

  useEffect(() => {
    setTopicPage(1)
  }, [topicSearch, selectedGrade, selectedPeriod, selectedYear])

  useEffect(() => {
    if (topicPage > totalTopicPages) setTopicPage(totalTopicPages)
  }, [topicPage, totalTopicPages])

  useEffect(() => {
    setPlanPage(1)
  }, [planSearch, selectedGrade, selectedPeriod, selectedYear])

  useEffect(() => {
    if (planPage > totalPlanPages) setPlanPage(totalPlanPages)
  }, [planPage, totalPlanPages])

  const openCreateModal = (topic?: PeriodTopic) => {
    const nextForm = createEmptyForm()
    nextForm.period = selectedPeriod || ''
    if (topic) {
      const matchingAssignments = assignments.filter((assignment) => assignment.academic_load === topic.academic_load)
      nextForm.topic = topic.id
      nextForm.title = topic.title
      nextForm.teacher_assignment = matchingAssignments.length === 1 ? matchingAssignments[0].id : ''
      nextForm.period = topic.period
    }
    setEditingPlanId(null)
    setFormData(nextForm)
    setDraftAlreadyGenerated(false)
    setIsModalOpen(true)
  }

  const openEditModal = (plan: ClassPlan) => {
    setEditingPlanId(plan.id)
    setFormData({
      period: plan.period,
      teacher_assignment: plan.teacher_assignment,
      topic: plan.topic ?? '',
      title: plan.title,
      class_date: plan.class_date ?? '',
      duration_minutes: plan.duration_minutes,
      learning_result: plan.learning_result,
      dba_reference: plan.dba_reference,
      standard_reference: plan.standard_reference,
      competency_know: plan.competency_know,
      competency_do: plan.competency_do,
      competency_be: plan.competency_be,
      class_purpose: plan.class_purpose,
      start_time_minutes: plan.start_time_minutes,
      start_activities: plan.start_activities,
      development_time_minutes: plan.development_time_minutes,
      development_activities: plan.development_activities,
      closing_time_minutes: plan.closing_time_minutes,
      closing_activities: plan.closing_activities,
      evidence_product: plan.evidence_product,
      evaluation_instrument: plan.evaluation_instrument,
      evaluation_criterion: plan.evaluation_criterion,
      resources: plan.resources,
      dua_adjustments: plan.dua_adjustments,
      status: plan.status,
    })
    setDraftAlreadyGenerated(false)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return
    if (draftStreamAbortRef.current) {
      draftStreamAbortRef.current.abort()
      draftStreamAbortRef.current = null
    }
    clearAllTypingTimers()
    setIsModalOpen(false)
    setEditingPlanId(null)
    setFormData(createEmptyForm())
    setDraftAlreadyGenerated(false)
    setDraftProgress(0)
  }

  useEffect(() => {
    return () => {
      if (draftStreamAbortRef.current) {
        draftStreamAbortRef.current.abort()
        draftStreamAbortRef.current = null
      }
      clearAllTypingTimers()
    }
  }, [])

  const handleTopicChange = (topicIdRaw: string) => {
    const topicId = topicIdRaw ? Number(topicIdRaw) : ''
    if (!topicId) {
      setFormData((prev) => ({ ...prev, topic: '', teacher_assignment: '' }))
      return
    }

    const topic = topics.find((item) => item.id === topicId)
    const nextAssignments = assignments.filter((assignment) => assignment.academic_load === topic?.academic_load)
    setFormData((prev) => ({
      ...prev,
      topic: topicId,
      title: prev.title.trim() ? prev.title : topic?.title ?? '',
      teacher_assignment: nextAssignments.length === 1 ? nextAssignments[0].id : prev.teacher_assignment,
    }))
  }

  const handleNumberChange = (field: keyof ClassPlanFormState, value: string) => {
    const numericValue = Number(value)
    setFormData((prev) => ({
      ...prev,
      [field]: Number.isFinite(numericValue) ? numericValue : 0,
    }))
  }

  const handleSubmit = async (nextStatus: 'DRAFT' | 'FINALIZED') => {
    if (!formData.period) {
      showToast('Selecciona un periodo válido antes de guardar el plan.', 'warning')
      return
    }

    if (!formData.teacher_assignment) {
      showToast('Selecciona una asignación docente para guardar el plan.', 'warning')
      return
    }

    if (!formData.title.trim()) {
      showToast('El título del plan es obligatorio.', 'warning')
      return
    }

    const payload = {
      ...formData,
      period: Number(formData.period),
      teacher_assignment: Number(formData.teacher_assignment),
      topic: formData.topic ? Number(formData.topic) : null,
      title: formData.title.trim(),
      class_date: formData.class_date || null,
      status: nextStatus,
    }

    setSaving(true)
    try {
      if (editingPlanId) {
        await academicApi.updateClassPlan(editingPlanId, payload)
        showToast(nextStatus === 'FINALIZED' ? 'Plan finalizado correctamente.' : 'Plan actualizado correctamente.', 'success')
      } else {
        await academicApi.createClassPlan(payload)
        showToast(nextStatus === 'FINALIZED' ? 'Plan creado y finalizado.' : 'Plan creado en borrador.', 'success')
      }
      await refreshPlannerData()
      closeModal()
    } catch (err) {
      console.error(err)
      showToast(getErrorMessage(err, 'No se pudo guardar el plan de clase.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleGenerateDraft = async () => {
    if (!formData.topic && !formData.title.trim()) {
      showToast('Selecciona una temática o escribe un título antes de usar IA.', 'warning')
      return
    }

    if (draftStreamAbortRef.current) {
      draftStreamAbortRef.current.abort()
      draftStreamAbortRef.current = null
    }
    clearAllTypingTimers()

    const controller = new AbortController()
    draftStreamAbortRef.current = controller

    setGeneratingDraft(true)
    setDraftProgress(5)
    try {
      const periodName = periods.find((period) => period.id === Number(selectedPeriod))?.name
      let didReceiveDone = false

      await academicApi.generateClassPlanDraftStream(
        {
        teacher_assignment: formData.teacher_assignment ? Number(formData.teacher_assignment) : undefined,
        topic: formData.topic ? Number(formData.topic) : undefined,
        duration_minutes: formData.duration_minutes,
        title: formData.title,
        period_name: periodName,
        },
        (event) => {
          if (typeof event.progress === 'number') {
            setDraftProgress(Math.max(0, Math.min(100, event.progress)))
          }

          if ((event.event === 'patch' || event.event === 'done') && event.data) {
            const numericPatch: Partial<ClassPlanFormState> = {}

            for (const [rawKey, rawValue] of Object.entries(event.data ?? {})) {
              const key = rawKey as keyof ClassPlanFormState
              if (!(key in formDataRef.current) || rawValue === undefined || rawValue === null) continue

              if (NUMERIC_CLASS_PLAN_FIELDS.has(key)) {
                const numericValue = Number(rawValue)
                if (Number.isFinite(numericValue)) {
                  numericPatch[key] = numericValue as never
                }
                continue
              }

              if (TEXT_CLASS_PLAN_FIELDS.has(key) && typeof rawValue === 'string') {
                animateTextFieldValue(key, rawValue)
              }
            }

            if (Object.keys(numericPatch).length > 0) {
              setFormData((prev) => ({ ...prev, ...numericPatch }))
              formDataRef.current = { ...formDataRef.current, ...numericPatch }
            }
          }

          if (event.event === 'done') {
            didReceiveDone = true
            setDraftProgress(100)
          }

          if (event.event === 'error') {
            const message = event.detail?.trim() || 'No se pudo completar la generación en tiempo real.'
            throw new Error(message)
          }
        },
        controller.signal,
      )

      if (!didReceiveDone) {
        throw new Error('La generación en tiempo real se interrumpió antes de finalizar.')
      }
      setDraftAlreadyGenerated(true)
      showToast('La IA generó un borrador editable del plan.', 'success')
    } catch (err) {
      if (controller.signal.aborted) {
        return
      }
      console.error(err)
      showToast(getErrorMessage(err, 'No se pudo generar el borrador con IA.'), 'error')
    } finally {
      if (draftStreamAbortRef.current === controller) {
        draftStreamAbortRef.current = null
      }
      setGeneratingDraft(false)
      setDraftProgress(0)
    }
  }

  const formInputsDisabled = saving || generatingDraft

  const buildSectionContext = () => {
    const topic = topics.find((item) => item.id === Number(formData.topic))
    const assignment = assignments.find((item) => item.id === Number(formData.teacher_assignment))
    const periodName = periods.find((period) => period.id === Number(selectedPeriod))?.name ?? ''

    return {
      topic_title: topic?.title ?? formData.title,
      topic_description: topic?.description ?? '',
      subject_name: assignment?.subject_name ?? topic?.subject_name ?? '',
      grade_name: assignment?.grade_name ?? topic?.grade_name ?? '',
      group_name: assignment?.group_name ?? '',
      teacher_name: assignment?.teacher_name ?? '',
      period_name: periodName,
      duration_minutes: formData.duration_minutes,
      learning_result: formData.learning_result,
      title: formData.title,
    }
  }

  const handleGenerateSection = async (section: 'learning' | 'competencies' | 'sequence' | 'evaluation' | 'support') => {
    if (!formData.topic && !formData.title.trim()) {
      showToast('Selecciona una temática o escribe un título antes de usar IA por secciones.', 'warning')
      return
    }

    setGeneratingSection(section)
    try {
      const response = await academicApi.generateClassPlanSection({
        section,
        ...buildSectionContext(),
      })

      setFormData((prev) => ({
        ...prev,
        ...response.data,
      }))
      showToast('La IA actualizó la sección solicitada.', 'success')
    } catch (error) {
      console.error(error)
      showToast(getErrorMessage(error, 'No se pudo generar la sección con IA.'), 'error')
    } finally {
      setGeneratingSection(null)
    }
  }

  const handleDownloadPdf = async (planId: number) => {
    try {
      const response = await reportsApi.createClassPlanJob(planId)
      setActiveExportJobs((prev) => ({
        ...prev,
        [planId]: response.data,
      }))
      showToast('Se inició la exportación del plan. La descarga comenzará cuando el PDF esté listo.', 'info')
    } catch (error) {
      console.error(error)
      showToast(getErrorMessage(error, 'No se pudo exportar el PDF del plan.'), 'error')
    }
  }

  const exportStatusByPlanId = useMemo(() => {
    return Object.entries(activeExportJobs).reduce<Record<number, ReportJob>>((acc, [planId, job]) => {
      acc[Number(planId)] = job
      return acc
    }, {})
  }, [activeExportJobs])

  const recentActivity = plannerSummary?.recent_activity ?? []

  const activityLabel = (eventType: string) => {
    switch (eventType) {
      case 'class_plan.created':
        return 'Plan creado'
      case 'class_plan.updated':
        return 'Plan actualizado'
      case 'class_plan.finalized':
        return 'Plan finalizado'
      case 'class_plan.export_requested':
        return 'Exportación solicitada'
      case 'class_plan.export_downloaded':
        return 'PDF descargado'
      case 'class_plan.generate_draft':
        return 'Borrador IA generado'
      case 'class_plan.generate_section':
        return 'Sección IA generada'
      default:
        return eventType
    }
  }

  const formatActivityTime = (value: string) => {
    try {
      return new Intl.DateTimeFormat('es-CO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    } catch {
      return value
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-lg border border-sky-100 bg-linear-to-br from-white via-sky-50/70 to-amber-50/60 p-4 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 dark:shadow-none">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Planeador de clases docente
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
                Planeación detallada de sesiones de clase
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
                Crea, ajusta y finaliza planes de clase a partir de tus temáticas del periodo, con ayuda por secciones y exportación al formato institucional.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Año lectivo
                <select
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(event.target.value ? Number(event.target.value) : '')}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none ring-0 focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">Selecciona un año</option>
                  {years.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.year} - {year.status_display}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Periodo
                <select
                  value={selectedPeriod}
                  onChange={(event) => setSelectedPeriod(event.target.value ? Number(event.target.value) : '')}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none ring-0 focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">Todos los periodos</option>
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Grado
                <select
                  value={selectedGrade}
                  onChange={(event) => setSelectedGrade(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none ring-0 focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">Todos los grados</option>
                  {availableGrades.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              </label>

              <Button type="button" onClick={() => openCreateModal()} className="w-full gap-2 sm:w-auto">
                <Plus size={16} />
                Nuevo plan
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <div className="rounded-lg border border-amber-100 bg-linear-to-br from-white to-amber-50/80 p-4 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-800 dark:shadow-none">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-amber-100 p-2 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                <BookMarked size={18} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Temáticas</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{topicsForKpi.length}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Sin plan aún: {topicsWithoutPlanCount}</p>
          </div>

          <div className="rounded-lg border border-sky-100 bg-linear-to-br from-white to-sky-50/80 p-4 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-800 dark:shadow-none">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-sky-100 p-2 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                <ClipboardList size={18} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Planes</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{plans.length}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Borradores: {plannerSummary?.summary.draft_plans ?? Math.max(plans.length - finalizedPlans, 0)}</p>
          </div>

          <div className="rounded-lg border border-emerald-100 bg-linear-to-br from-white to-emerald-50/80 p-4 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-800 dark:shadow-none">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Sparkles size={18} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Finalizados</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{finalizedPlans}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Cobertura: {plannerSummary?.summary.completion_rate ?? 0}%</p>
          </div>

          <div className="rounded-lg border border-violet-100 bg-linear-to-br from-white to-violet-50/80 p-4 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-800 dark:shadow-none">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-violet-100 p-2 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                <Download size={18} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Exportaciones</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{plannerSummary?.summary.export_completed ?? 0}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">En cola: {plannerSummary?.summary.export_pending ?? 0}</p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.4fr_1.4fr_0.9fr]">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Temáticas disponibles</h3>
            </div>
            <div className="border-b border-slate-200 bg-sky-50/40 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
              <Input
                value={topicSearch}
                onChange={(event) => setTopicSearch(event.target.value)}
                placeholder="Buscar por temática, asignatura o grado"
              />
            </div>
            <div className="space-y-3 md:hidden">
              {loading ? (
                <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  Cargando temáticas...
                </div>
              ) : filteredAvailableTopics.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  No hay temáticas que coincidan con la búsqueda actual.
                </div>
              ) : (
                paginatedAvailableTopics.map((topic) => {
                  const matchingAssignments = assignments.filter((assignment) => assignment.academic_load === topic.academic_load)
                  const canCreate = matchingAssignments.length > 0
                  const linkedPlan = planByTopicId.get(topic.id)
                  const hasPlan = Boolean(linkedPlan)

                  return (
                    <article
                      key={topic.id}
                      className={`rounded-lg border p-4 dark:border-slate-800 ${hasPlan ? 'cursor-pointer border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-slate-200 bg-slate-50/70 dark:bg-slate-950/30'}`}
                      role={hasPlan ? 'button' : undefined}
                      tabIndex={hasPlan ? 0 : undefined}
                      onClick={hasPlan ? () => linkedPlan && openEditModal(linkedPlan) : undefined}
                      onKeyDown={hasPlan ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          if (linkedPlan) openEditModal(linkedPlan)
                        }
                      } : undefined}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{topic.title}</h4>
                            {hasPlan ? <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-300" /> : null}
                          </div>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {topic.grade_name ?? '-'} · Orden {topic.sequence_order}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${hasPlan ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                          {topic.subject_name ?? '-'}
                        </span>
                      </div>
                      {hasPlan ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => linkedPlan && openEditModal(linkedPlan)}
                          className="mt-3 w-full justify-center border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                        >
                          Ver plan
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" size="sm" onClick={() => openCreateModal(topic)} disabled={!canCreate} className="mt-3 w-full justify-center">
                          Crear plan
                        </Button>
                      )}
                    </article>
                  )
                })
              )}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-950/60">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Temática</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                      <button
                        type="button"
                        onClick={() => toggleTopicSort('period')}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                        aria-label={`Ordenar por periodo ${topicSort.key === 'period' && topicSort.direction === 'asc' ? 'descendente' : 'ascendente'}`}
                      >
                        Periodo
                        {topicSort.key === 'period' ? (
                          topicSort.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                        ) : null}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                      <button
                        type="button"
                        onClick={() => toggleTopicSort('grade')}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                        aria-label={`Ordenar por grado ${topicSort.key === 'grade' && topicSort.direction === 'asc' ? 'descendente' : 'ascendente'}`}
                      >
                        Grado
                        {topicSort.key === 'grade' ? (
                          topicSort.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                        ) : null}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Asignatura</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                        Cargando temáticas...
                      </td>
                    </tr>
                  ) : sortedAvailableTopics.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                        No hay temáticas que coincidan con la búsqueda actual.
                      </td>
                    </tr>
                  ) : (
                    paginatedAvailableTopics.map((topic) => {
                      const matchingAssignments = assignments.filter((assignment) => assignment.academic_load === topic.academic_load)
                      const canCreate = matchingAssignments.length > 0
                      const linkedPlan = planByTopicId.get(topic.id)
                      const hasPlan = Boolean(linkedPlan)

                      return (
                        <tr
                          key={topic.id}
                          className={hasPlan ? 'cursor-pointer bg-emerald-50/40 hover:bg-emerald-50 dark:bg-emerald-950/10 dark:hover:bg-emerald-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}
                          onClick={hasPlan ? () => linkedPlan && openEditModal(linkedPlan) : undefined}
                        >
                          <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                            <div className="flex items-center gap-2 font-medium">
                              <span>{topic.title}</span>
                              {hasPlan ? <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-300" /> : null}
                            </div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Orden {topic.sequence_order}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{topic.period_name ?? '-'}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{topic.grade_name ?? '-'}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{topic.subject_name ?? '-'}</td>
                          <td className="px-4 py-3 text-sm">
                            {hasPlan ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => linkedPlan && openEditModal(linkedPlan)}
                                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                              >
                                Ver plan
                              </Button>
                            ) : (
                              <Button type="button" variant="outline" size="sm" onClick={() => openCreateModal(topic)} disabled={!canCreate}>
                                Crear plan
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">
                Mostrando {sortedAvailableTopics.length === 0 ? 0 : (topicPage - 1) * TOPICS_PAGE_SIZE + 1}
                {' '}-{' '}
                {Math.min(topicPage * TOPICS_PAGE_SIZE, sortedAvailableTopics.length)} de {sortedAvailableTopics.length}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setTopicPage((page) => Math.max(1, page - 1))} disabled={topicPage === 1}>
                  Anterior
                </Button>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Página {topicPage} de {totalTopicPages}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => setTopicPage((page) => Math.min(totalTopicPages, page + 1))} disabled={topicPage >= totalTopicPages}>
                  Siguiente
                </Button>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Mis planes de clase</h3>
            </div>
            <div className="border-b border-slate-200 bg-emerald-50/40 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
              <Input
                value={planSearch}
                onChange={(event) => setPlanSearch(event.target.value)}
                placeholder="Buscar por plan, temática, grupo o estado"
              />
            </div>
            <div className="space-y-3 md:hidden">
              {loading ? (
                <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  Cargando planes...
                </div>
              ) : filteredPlans.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  No hay planes que coincidan con la búsqueda actual.
                </div>
              ) : (
                paginatedPlans.map((plan) => {
                  const exportJob = exportStatusByPlanId[plan.id]

                  return (
                    <article key={plan.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{plan.title}</h4>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{plan.topic_title ?? 'Sin temática asociada'}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Grupo {plan.group_name ?? '-'}</p>
                        </div>
                        <span
                          className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            plan.status === 'FINALIZED'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                          }`}
                        >
                          {plan.status === 'FINALIZED' ? 'Finalizado' : 'Borrador'}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-col gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => openEditModal(plan)} className="w-full justify-center gap-2">
                          <PenSquare size={14} />
                          Editar
                        </Button>
                        {plan.status === 'FINALIZED' && (
                          <Button type="button" variant="outline" size="sm" onClick={() => handleDownloadPdf(plan.id)} disabled={!!exportJob} className="w-full justify-center gap-2">
                            <Download size={14} />
                            {exportJob ? (exportJob.status === 'RUNNING' ? 'Generando...' : 'En cola...') : 'Descargar PDF'}
                          </Button>
                        )}
                      </div>
                    </article>
                  )
                })
              )}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-950/60">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Plan</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Grupo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                        Cargando planes...
                      </td>
                    </tr>
                  ) : filteredPlans.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                        No hay planes que coincidan con la búsqueda actual.
                      </td>
                    </tr>
                  ) : (
                    paginatedPlans.map((plan) => {
                      const exportJob = exportStatusByPlanId[plan.id]

                      return (
                        <tr key={plan.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                            <div className="font-medium">{plan.title}</div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{plan.topic_title ?? 'Sin temática asociada'}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{plan.group_name ?? '-'}</td>
                          <td className="px-4 py-3 text-sm">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                plan.status === 'FINALIZED'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                              }`}
                            >
                              {plan.status === 'FINALIZED' ? 'Finalizado' : 'Borrador'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => openEditModal(plan)} className="gap-2">
                                <PenSquare size={14} />
                                Editar
                              </Button>
                              {plan.status === 'FINALIZED' && (
                                <Button type="button" variant="outline" size="sm" onClick={() => handleDownloadPdf(plan.id)} disabled={!!exportJob} className="gap-2">
                                  <Download size={14} />
                                  {exportJob ? (exportJob.status === 'RUNNING' ? 'Generando...' : 'En cola...') : 'PDF'}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">
                Mostrando {filteredPlans.length === 0 ? 0 : (planPage - 1) * PLANS_PAGE_SIZE + 1}
                {' '}-{' '}
                {Math.min(planPage * PLANS_PAGE_SIZE, filteredPlans.length)} de {filteredPlans.length}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setPlanPage((page) => Math.max(1, page - 1))} disabled={planPage === 1}>
                  Anterior
                </Button>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Página {planPage} de {totalPlanPages}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => setPlanPage((page) => Math.min(totalPlanPages, page + 1))} disabled={planPage >= totalPlanPages}>
                  Siguiente
                </Button>
              </div>
            </div>
          </section>

          <aside className="rounded-lg border border-violet-100 bg-linear-to-br from-white via-violet-50/40 to-slate-50 p-4 shadow-sm md:col-span-2 xl:col-span-1 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 dark:shadow-none">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Trazabilidad</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Eventos recientes del planeador y exportaciones.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                IA: {plannerSummary?.summary.ai_assisted_plans ?? 0}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Aún no hay eventos registrados para este contexto.</p>
              ) : (
                recentActivity.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{activityLabel(item.event_type)}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{String(item.metadata.title || item.metadata.topic_title || 'Planeador de clases')}</p>
                      </div>
                      <span className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{formatActivityTime(item.created_at)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingPlanId ? 'Editar plan de clase' : 'Nuevo plan de clase'}
        description="Completa el formato base del plan y decide si lo guardas como borrador o lo finalizas."
        size="xl"
        loading={saving}
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" variant="secondary" onClick={() => handleSubmit('DRAFT')} disabled={saving || generatingDraft}>
              Guardar borrador
            </Button>
            <Button type="button" onClick={() => handleSubmit('FINALIZED')} disabled={saving || generatingDraft}>
              Finalizar plan
            </Button>
          </>
        }
      >
        <div className="grid gap-6">
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={handleGenerateDraft} disabled={saving || generatingDraft || draftAlreadyGenerated} className="gap-2">
              <Wand2 size={16} />
              {generatingDraft ? `Generando borrador... ${draftProgress}%` : 'Sugerir borrador con IA'}
            </Button>
          </div>
          <fieldset disabled={formInputsDisabled} className="grid gap-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="xl:col-span-2">
              <Label htmlFor="topic">Temática</Label>
              <select
                id="topic"
                value={formData.topic}
                onChange={(event) => handleTopicChange(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-400"
              >
                <option value="">Selecciona una temática</option>
                {topicOptions.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title} · {topic.subject_name ?? '-'} · {topic.grade_name ?? '-'}
                  </option>
                ))}
              </select>
            </div>

            <div className="xl:col-span-2">
              <Label htmlFor="teacher_assignment">Grupo / asignación docente</Label>
              <select
                id="teacher_assignment"
                value={formData.teacher_assignment}
                onChange={(event) => setFormData((prev) => ({ ...prev, teacher_assignment: event.target.value ? Number(event.target.value) : '' }))}
                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-400"
              >
                <option value="">Selecciona una asignación</option>
                {compatibleAssignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.subject_name ?? 'Asignatura'} · {assignment.grade_name ?? '-'} · Grupo {assignment.group_name ?? '-'}
                  </option>
                ))}
              </select>
            </div>

            <div className="xl:col-span-2">
              <Label htmlFor="title">Título del plan</Label>
              <Input id="title" value={formData.title} onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))} />
            </div>

            <div>
              <Label htmlFor="class_date">Fecha</Label>
              <Input id="class_date" type="date" value={formData.class_date} onChange={(event) => setFormData((prev) => ({ ...prev, class_date: event.target.value }))} />
            </div>

            <div>
              <Label htmlFor="duration_minutes">Duración total</Label>
              <Input id="duration_minutes" type="number" min={1} value={formData.duration_minutes} onChange={(event) => handleNumberChange('duration_minutes', event.target.value)} />
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="lg:col-span-2 flex justify-end">
              <Button type="button" variant="outline" onClick={() => handleGenerateSection('learning')} disabled={saving || generatingSection !== null} className="gap-2">
                <Wand2 size={16} />
                {generatingSection === 'learning' ? 'Generando...' : 'IA para aprendizaje'}
              </Button>
            </div>
            <div>
              <Label htmlFor="learning_result">Resultado de aprendizaje</Label>
              <textarea id="learning_result" value={formData.learning_result} onChange={(event) => setFormData((prev) => ({ ...prev, learning_result: event.target.value }))} className="mt-1 min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-400" />
            </div>
            <div className="grid gap-4">
              <div>
                <Label htmlFor="dba_reference">DBA</Label>
                <textarea id="dba_reference" value={formData.dba_reference} onChange={(event) => setFormData((prev) => ({ ...prev, dba_reference: event.target.value }))} className="mt-1 min-h-16 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-400" />
              </div>
              <div>
                <Label htmlFor="standard_reference">Estándar</Label>
                <textarea id="standard_reference" value={formData.standard_reference} onChange={(event) => setFormData((prev) => ({ ...prev, standard_reference: event.target.value }))} className="mt-1 min-h-16 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-400" />
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-3 flex justify-end">
              <Button type="button" variant="outline" onClick={() => handleGenerateSection('competencies')} disabled={saving || generatingSection !== null} className="gap-2">
                <Wand2 size={16} />
                {generatingSection === 'competencies' ? 'Generando...' : 'IA para competencias'}
              </Button>
            </div>
            <div>
              <Label htmlFor="competency_know">Competencia Saber</Label>
              <textarea id="competency_know" value={formData.competency_know} onChange={(event) => setFormData((prev) => ({ ...prev, competency_know: event.target.value }))} className="mt-1 min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-400" />
            </div>
            <div>
              <Label htmlFor="competency_do">Competencia Hacer</Label>
              <textarea id="competency_do" value={formData.competency_do} onChange={(event) => setFormData((prev) => ({ ...prev, competency_do: event.target.value }))} className="mt-1 min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-400" />
            </div>
            <div>
              <Label htmlFor="competency_be">Competencia Ser</Label>
              <textarea id="competency_be" value={formData.competency_be} onChange={(event) => setFormData((prev) => ({ ...prev, competency_be: event.target.value }))} className="mt-1 min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-400" />
            </div>
          </section>

          <section className="grid gap-4">
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => handleGenerateSection('sequence')} disabled={saving || generatingSection !== null} className="gap-2">
                <Wand2 size={16} />
                {generatingSection === 'sequence' ? 'Generando...' : 'IA para secuencia'}
              </Button>
            </div>
            <div>
              <Label htmlFor="class_purpose">Propósito de la clase</Label>
              <textarea id="class_purpose" value={formData.class_purpose} onChange={(event) => setFormData((prev) => ({ ...prev, class_purpose: event.target.value }))} className="mt-1 min-h-20 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-400" />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <Label htmlFor="start_time_minutes">Inicio</Label>
                  <Input id="start_time_minutes" type="number" min={0} value={formData.start_time_minutes} onChange={(event) => handleNumberChange('start_time_minutes', event.target.value)} className="w-24" />
                </div>
                <textarea value={formData.start_activities} onChange={(event) => setFormData((prev) => ({ ...prev, start_activities: event.target.value }))} className="min-h-32 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-400" />
              </div>

              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <Label htmlFor="development_time_minutes">Desarrollo</Label>
                  <Input id="development_time_minutes" type="number" min={0} value={formData.development_time_minutes} onChange={(event) => handleNumberChange('development_time_minutes', event.target.value)} className="w-24" />
                </div>
                <textarea value={formData.development_activities} onChange={(event) => setFormData((prev) => ({ ...prev, development_activities: event.target.value }))} className="min-h-32 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-400" />
              </div>

              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <Label htmlFor="closing_time_minutes">Cierre</Label>
                  <Input id="closing_time_minutes" type="number" min={0} value={formData.closing_time_minutes} onChange={(event) => handleNumberChange('closing_time_minutes', event.target.value)} className="w-24" />
                </div>
                <textarea value={formData.closing_activities} onChange={(event) => setFormData((prev) => ({ ...prev, closing_activities: event.target.value }))} className="min-h-32 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-400" />
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="lg:col-span-2 flex justify-end">
              <Button type="button" variant="outline" onClick={() => handleGenerateSection('evaluation')} disabled={saving || generatingSection !== null} className="gap-2">
                <Wand2 size={16} />
                {generatingSection === 'evaluation' ? 'Generando...' : 'IA para evaluación'}
              </Button>
            </div>
            <div>
              <Label htmlFor="evidence_product">Evidencia / producto</Label>
              <textarea id="evidence_product" value={formData.evidence_product} onChange={(event) => setFormData((prev) => ({ ...prev, evidence_product: event.target.value }))} className="mt-1 min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-400" />
            </div>
            <div className="grid gap-4">
              <div>
                <Label htmlFor="evaluation_instrument">Instrumento de evaluación</Label>
                <textarea id="evaluation_instrument" value={formData.evaluation_instrument} onChange={(event) => setFormData((prev) => ({ ...prev, evaluation_instrument: event.target.value }))} className="mt-1 min-h-16 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-400" />
              </div>
              <div>
                <Label htmlFor="evaluation_criterion">Criterio SIEE</Label>
                <textarea id="evaluation_criterion" value={formData.evaluation_criterion} onChange={(event) => setFormData((prev) => ({ ...prev, evaluation_criterion: event.target.value }))} className="mt-1 min-h-16 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-400" />
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="lg:col-span-2 flex justify-end">
              <Button type="button" variant="outline" onClick={() => handleGenerateSection('support')} disabled={saving || generatingSection !== null} className="gap-2">
                <Wand2 size={16} />
                {generatingSection === 'support' ? 'Generando...' : 'IA para recursos y DUA'}
              </Button>
            </div>
            <div>
              <Label htmlFor="resources">Recursos</Label>
              <textarea id="resources" value={formData.resources} onChange={(event) => setFormData((prev) => ({ ...prev, resources: event.target.value }))} className="mt-1 min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-400" />
            </div>
            <div>
              <Label htmlFor="dua_adjustments">Observaciones / ajustes DUA</Label>
              <textarea id="dua_adjustments" value={formData.dua_adjustments} onChange={(event) => setFormData((prev) => ({ ...prev, dua_adjustments: event.target.value }))} className="mt-1 min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-400" />
            </div>
          </section>
          </fieldset>
        </div>
      </Modal>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((prev) => ({ ...prev, isVisible: false }))}
      />
    </>
  )
}