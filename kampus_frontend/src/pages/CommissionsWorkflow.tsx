import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Toast, type ToastType } from '../components/ui/Toast'
import { ConfirmationModal } from '../components/ui/ConfirmationModal'
import { academicApi, type AcademicYear, type Commission, type CommissionDecision, type Group, type Period } from '../services/academic'
import { reportsApi, type ReportJob } from '../services/reports'
import { useAuthStore } from '../store/auth'

const EMPTY_FORM = {
  commission_type: 'EVALUATION' as 'EVALUATION' | 'PROMOTION',
  academic_year: '',
  period: '',
  group: '',
  title: '',
  notes: '',
}

type CommissionTabKey = 'create' | 'commissions' | 'decisions' | 'jobs'

type CommissionPreconditionItem = {
  reason_code: string
  reason_message: string
  action_hint: string
  group_name: string
  period_name: string
  subject_name: string
  teacher_name: string
  meta?: {
    filled?: number
    total?: number
  }
}

type CommissionPreconditionsPayload = {
  message: string
  blocking_items: CommissionPreconditionItem[]
  summary?: {
    total_groups_evaluated?: number
    total_blocking_items?: number
    reasons_count?: Record<string, number>
  }
}

const PRECONDITION_REASON_PRIORITY: Record<string, number> = {
  PERIOD_NOT_CLOSED: 1,
  OPEN_PERIODS_FOR_PROMOTION: 1,
  MISSING_TEACHER_ASSIGNMENT: 2,
  MISSING_ACHIEVEMENTS: 3,
  MISSING_GRADEBOOK: 4,
  INCOMPLETE_GRADEBOOK: 5,
}

const PRECONDITION_REASON_RECOMMENDATION: Record<string, string> = {
  PERIOD_NOT_CLOSED: 'Cierra el periodo seleccionado antes de crear la comisión.',
  OPEN_PERIODS_FOR_PROMOTION: 'Cierra todos los periodos pendientes del año para habilitar promoción.',
  MISSING_TEACHER_ASSIGNMENT: 'Completa la asignación de docentes por asignatura y grupo.',
  MISSING_ACHIEVEMENTS: 'Configura logros del periodo para las asignaturas sin planeación.',
  MISSING_GRADEBOOK: 'Crea las planillas faltantes para las asignaturas y periodos indicados.',
  INCOMPLETE_GRADEBOOK: 'Diligencia los registros pendientes en las planillas incompletas.',
}

const PRECONDITION_REASON_LABEL: Record<string, string> = {
  PERIOD_NOT_CLOSED: 'Periodo no cerrado',
  OPEN_PERIODS_FOR_PROMOTION: 'Periodos abiertos para promoción',
  MISSING_TEACHER_ASSIGNMENT: 'Docente sin asignación',
  MISSING_ACHIEVEMENTS: 'Logros no configurados',
  MISSING_GRADEBOOK: 'Planilla no creada',
  INCOMPLETE_GRADEBOOK: 'Planilla incompleta',
}

const PRECONDITION_REASON_SEVERITY: Record<string, 'critical' | 'high' | 'medium'> = {
  PERIOD_NOT_CLOSED: 'critical',
  OPEN_PERIODS_FOR_PROMOTION: 'critical',
  MISSING_TEACHER_ASSIGNMENT: 'high',
  MISSING_ACHIEVEMENTS: 'high',
  MISSING_GRADEBOOK: 'medium',
  INCOMPLETE_GRADEBOOK: 'medium',
}

const PRECONDITION_SEVERITY_WEIGHT: Record<'critical' | 'high' | 'medium', number> = {
  critical: 1,
  high: 2,
  medium: 3,
}

const PRECONDITION_REASON_ROUTE: Record<string, { href: string; label: string }> = {
  PERIOD_NOT_CLOSED: { href: '/academic-config', label: 'Abrir periodos' },
  OPEN_PERIODS_FOR_PROMOTION: { href: '/academic-config', label: 'Abrir periodos' },
  MISSING_TEACHER_ASSIGNMENT: { href: '/my-assignment', label: 'Abrir asignaciones' },
  MISSING_ACHIEVEMENTS: { href: '/planning', label: 'Abrir planeación' },
  MISSING_GRADEBOOK: { href: '/grades', label: 'Abrir planillas' },
  INCOMPLETE_GRADEBOOK: { href: '/grades', label: 'Abrir planillas' },
}

const toNullableNumber = (value: unknown): number | undefined => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const toText = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  return String(value)
}

const parseCommissionPreconditionsError = (error: unknown): CommissionPreconditionsPayload | null => {
  if (!axios.isAxiosError(error)) return null

  const rawResponse = error.response?.data
  if (!rawResponse || typeof rawResponse !== 'object') return null

  const record = rawResponse as Record<string, unknown>
  const preconditions = record.preconditions
  if (!preconditions || typeof preconditions !== 'object') return null

  const payload = preconditions as Record<string, unknown>
  const rawItems = payload.blocking_items
  if (!Array.isArray(rawItems) || rawItems.length === 0) return null

  const blockingItems: CommissionPreconditionItem[] = rawItems.map((rawItem) => {
    const itemRecord = (rawItem ?? {}) as Record<string, unknown>
    const rawMeta = itemRecord.meta
    const metaRecord = rawMeta && typeof rawMeta === 'object' ? (rawMeta as Record<string, unknown>) : null

    return {
      reason_code: toText(itemRecord.reason_code),
      reason_message: toText(itemRecord.reason_message),
      action_hint: toText(itemRecord.action_hint),
      group_name: toText(itemRecord.group_name),
      period_name: toText(itemRecord.period_name),
      subject_name: toText(itemRecord.subject_name),
      teacher_name: toText(itemRecord.teacher_name),
      meta: metaRecord
        ? {
          filled: toNullableNumber(metaRecord.filled),
          total: toNullableNumber(metaRecord.total),
        }
        : undefined,
    }
  })

  const rawSummary = payload.summary
  const summaryRecord = rawSummary && typeof rawSummary === 'object' ? (rawSummary as Record<string, unknown>) : null
  const rawReasons = summaryRecord?.reasons_count
  const reasonsRecord = rawReasons && typeof rawReasons === 'object' ? (rawReasons as Record<string, unknown>) : null

  const reasonsCount: Record<string, number> = {}
  if (reasonsRecord) {
    Object.entries(reasonsRecord).forEach(([key, value]) => {
      const parsed = toNullableNumber(value)
      if (parsed !== undefined) {
        reasonsCount[key] = parsed
      }
    })
  }

  return {
    message: toText(payload.message) || 'No se puede crear la comisión porque existen prerequisitos incumplidos.',
    blocking_items: blockingItems,
    summary: summaryRecord
      ? {
        total_groups_evaluated: toNullableNumber(summaryRecord.total_groups_evaluated),
        total_blocking_items: toNullableNumber(summaryRecord.total_blocking_items),
        reasons_count: reasonsCount,
      }
      : undefined,
  }
}

export default function CommissionsWorkflow() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const canManage = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN' || user?.role === 'COORDINATOR'

  const [years, setYears] = useState<AcademicYear[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [selectedCommissionId, setSelectedCommissionId] = useState<number | null>(null)
  const [decisions, setDecisions] = useState<CommissionDecision[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [loadingDecisions, setLoadingDecisions] = useState(false)
  const [viewingCommissionId, setViewingCommissionId] = useState<number | null>(null)
  const [deletingCommissionId, setDeletingCommissionId] = useState<number | null>(null)
  const [commissionPendingDeleteId, setCommissionPendingDeleteId] = useState<number | null>(null)
  const [jobsLoading, setJobsLoading] = useState(false)
  const [actaJobs, setActaJobs] = useState<ReportJob[]>([])
  const [activeTab, setActiveTab] = useState<CommissionTabKey>('commissions')
  const [decisionsPage, setDecisionsPage] = useState(1)
  const [decisionsPageSize, setDecisionsPageSize] = useState(10)
  const [decisionsTotalCount, setDecisionsTotalCount] = useState(0)
  const [decisionsSummary, setDecisionsSummary] = useState({
    total_students: 0,
    total_flagged: 0,
    total_not_flagged: 0,
    flagged_rate: 0,
  })
  const [form, setForm] = useState(EMPTY_FORM)
  const [preconditionsModal, setPreconditionsModal] = useState<CommissionPreconditionsPayload | null>(null)
  const [preconditionsSearch, setPreconditionsSearch] = useState('')
  const [expandedReasonCodes, setExpandedReasonCodes] = useState<string[]>([])
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const selectedYearId = useMemo(() => {
    const parsed = Number(form.academic_year)
    return Number.isNaN(parsed) || parsed <= 0 ? null : parsed
  }, [form.academic_year])

  const selectedPeriod = useMemo(() => {
    const periodId = Number(form.period)
    if (!periodId || Number.isNaN(periodId)) return null
    return periods.find((period) => period.id === periodId) ?? null
  }, [form.period, periods])

  const selectedGroup = useMemo(() => {
    const groupId = Number(form.group)
    if (!groupId || Number.isNaN(groupId)) return null
    return groups.find((group) => group.id === groupId) ?? null
  }, [form.group, groups])

  const selectedYear = useMemo(() => {
    if (!selectedYearId) return null
    return years.find((year) => year.id === selectedYearId) ?? null
  }, [years, selectedYearId])

  const generatedCommissionTitle = useMemo(() => {
    const normalizeSegment = (value: string) => {
      return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase()
    }

    const periodo = form.commission_type === 'EVALUATION'
      ? (selectedPeriod?.name || 'SIN_PERIODO')
      : 'ANUAL'
    const grado = selectedGroup?.grade_name || 'SIN_GRADO'
    const grupo = selectedGroup?.name || 'SIN_GRUPO'
    const ano = selectedYear?.year ? String(selectedYear.year) : 'SIN_ANO'

    const periodoSegment = normalizeSegment(periodo) || 'SIN_PERIODO'
    const gradoSegment = normalizeSegment(grado) || 'SIN_GRADO'
    const grupoSegment = normalizeSegment(grupo) || 'SIN_GRUPO'
    const anoSegment = normalizeSegment(ano) || 'SIN_ANIO'

    return `Comisión_${periodoSegment}_${gradoSegment}_${grupoSegment}_${anoSegment}`
  }, [form.commission_type, selectedGroup?.grade_name, selectedGroup?.name, selectedPeriod?.name, selectedYear?.year])

  const selectedCommission = useMemo(
    () => commissions.find((commission) => commission.id === selectedCommissionId) ?? null,
    [commissions, selectedCommissionId],
  )
  const commissionPendingDelete = useMemo(
    () => commissions.find((commission) => commission.id === commissionPendingDeleteId) ?? null,
    [commissions, commissionPendingDeleteId],
  )
  const decisionsTotalPages = useMemo(() => {
    if (decisionsTotalCount === 0) return 1
    return Math.ceil(decisionsTotalCount / decisionsPageSize)
  }, [decisionsTotalCount, decisionsPageSize])

  const decisionsPageStart = decisionsTotalCount === 0 ? 0 : (decisionsPage - 1) * decisionsPageSize + 1
  const decisionsPageEnd = decisionsTotalCount === 0 ? 0 : Math.min(decisionsTotalCount, decisionsPageStart + decisions.length - 1)
  const groupedPreconditions = useMemo(() => {
    if (!preconditionsModal) return []

    const buckets = new Map<string, CommissionPreconditionItem[]>()
    preconditionsModal.blocking_items.forEach((item) => {
      const key = item.reason_code || 'UNKNOWN'
      const current = buckets.get(key) || []
      current.push(item)
      buckets.set(key, current)
    })

    return Array.from(buckets.entries())
      .map(([reasonCode, items]) => ({
        reasonCode,
        severity: PRECONDITION_REASON_SEVERITY[reasonCode] ?? 'medium',
        reasonLabel: PRECONDITION_REASON_LABEL[reasonCode] ?? reasonCode,
        items: [...items].sort((left, right) => {
          const leftKey = `${left.group_name}|${left.period_name}|${left.subject_name}|${left.teacher_name}`
          const rightKey = `${right.group_name}|${right.period_name}|${right.subject_name}|${right.teacher_name}`
          return leftKey.localeCompare(rightKey, 'es-CO')
        }),
      }))
      .sort((left, right) => {
        const leftSeverity = PRECONDITION_SEVERITY_WEIGHT[left.severity] ?? 9
        const rightSeverity = PRECONDITION_SEVERITY_WEIGHT[right.severity] ?? 9
        if (leftSeverity !== rightSeverity) return leftSeverity - rightSeverity
        const leftPriority = PRECONDITION_REASON_PRIORITY[left.reasonCode] ?? 99
        const rightPriority = PRECONDITION_REASON_PRIORITY[right.reasonCode] ?? 99
        if (leftPriority !== rightPriority) return leftPriority - rightPriority
        return left.reasonCode.localeCompare(right.reasonCode, 'es-CO')
      })
  }, [preconditionsModal])
  const filteredPreconditionGroups = useMemo(() => {
    const term = preconditionsSearch.trim().toLowerCase()
    if (!term) return groupedPreconditions

    return groupedPreconditions
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const haystack = [
            group.reasonCode,
            group.reasonLabel,
            item.reason_message,
            item.action_hint,
            item.group_name,
            item.period_name,
            item.subject_name,
            item.teacher_name,
          ]
            .join(' ')
            .toLowerCase()
          return haystack.includes(term)
        }),
      }))
      .filter((group) => group.items.length > 0)
  }, [groupedPreconditions, preconditionsSearch])
  const recommendedActions = useMemo(() => {
    return groupedPreconditions.map((group) => {
      const text = PRECONDITION_REASON_RECOMMENDATION[group.reasonCode] || group.items[0]?.action_hint || ''
      const route = PRECONDITION_REASON_ROUTE[group.reasonCode]
      return {
        reasonCode: group.reasonCode,
        reasonLabel: group.reasonLabel,
        severity: group.severity,
        text,
        href: route?.href,
        label: route?.label,
      }
    })
      .filter((action) => Boolean(action.text))
      .slice(0, 3)
  }, [groupedPreconditions])

  useEffect(() => {
    if (!preconditionsModal) {
      setPreconditionsSearch('')
      setExpandedReasonCodes([])
      return
    }

    const criticalCodes = groupedPreconditions
      .filter((group) => group.severity === 'critical')
      .map((group) => group.reasonCode)

    setExpandedReasonCodes(criticalCodes)
  }, [groupedPreconditions, preconditionsModal])

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const getSeverityLabel = (severity: 'critical' | 'high' | 'medium') => {
    if (severity === 'critical') return 'Crítico'
    if (severity === 'high') return 'Alto'
    return 'Medio'
  }

  const getSeverityClasses = (severity: 'critical' | 'high' | 'medium') => {
    if (severity === 'critical') {
      return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300'
    }
    if (severity === 'high') {
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300'
    }
    return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300'
  }

  const togglePreconditionGroup = (reasonCode: string) => {
    setExpandedReasonCodes((prev) => (
      prev.includes(reasonCode) ? prev.filter((code) => code !== reasonCode) : [...prev, reasonCode]
    ))
  }

  const copyPreconditionsSummary = async () => {
    if (!preconditionsModal) return

    const lines: string[] = [
      'Prerequisitos incumplidos para crear comisión',
      `Bloqueos: ${preconditionsModal.summary?.total_blocking_items ?? preconditionsModal.blocking_items.length}`,
      `Grupos evaluados: ${preconditionsModal.summary?.total_groups_evaluated ?? 'N/D'}`,
      '',
    ]

    groupedPreconditions.forEach((group) => {
      lines.push(`${group.reasonLabel} (${group.items.length})`)
      group.items.slice(0, 5).forEach((item) => {
        const detail = [
          item.group_name ? `grupo ${item.group_name}` : '',
          item.period_name ? `periodo ${item.period_name}` : '',
          item.subject_name ? `asignatura ${item.subject_name}` : '',
        ].filter(Boolean).join(', ')
        lines.push(`- ${item.reason_message}${detail ? ` (${detail})` : ''}`)
      })
      lines.push('')
    })

    try {
      await navigator.clipboard.writeText(lines.join('\n').trim())
      showToast('Resumen copiado al portapapeles', 'success')
    } catch {
      showToast('No se pudo copiar el resumen', 'error')
    }
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(url)
  }

  const getDecisionIdFromJob = (job: ReportJob) => {
    const raw = job.params?.decision_id
    if (typeof raw === 'number') return raw
    if (typeof raw === 'string') {
      const parsed = Number(raw)
      return Number.isNaN(parsed) ? null : parsed
    }
    return null
  }

  const getAllDecisionIdsForCommission = useCallback(async (commissionId: number): Promise<number[]> => {
    const allIds: number[] = []
    const pageSize = 100
    let page = 1

    for (;;) {
      const res = await academicApi.listCommissionDecisions({ commission: commissionId, page, page_size: pageSize })
      allIds.push(...res.data.results.map((item) => item.id))
      if (!res.data.next) break
      page += 1
    }

    return allIds
  }, [])

  const loadCommissionActaJobs = useCallback(async (commissionId: number | null, silent = false) => {
    if (!commissionId) {
      setActaJobs([])
      return
    }

    if (!silent) setJobsLoading(true)
    try {
      const allDecisionIds = await getAllDecisionIdsForCommission(commissionId)
      if (allDecisionIds.length === 0) {
        setActaJobs([])
        return
      }

      const decisionIds = new Set(allDecisionIds)
      const res = await reportsApi.listJobs()
      const jobs = res.data
        .filter((job) => {
          if (job.report_type !== 'ACADEMIC_COMMISSION_ACTA') return false
          const decisionId = getDecisionIdFromJob(job)
          return decisionId !== null && decisionIds.has(decisionId)
        })
        .sort((a, b) => b.id - a.id)
      setActaJobs(jobs)
    } catch {
      if (!silent) showToast('No se pudo cargar el estado de jobs asíncronos', 'error')
    } finally {
      if (!silent) setJobsLoading(false)
    }
  }, [getAllDecisionIdsForCommission])

  const loadBaseData = useCallback(async () => {
    setLoading(true)
    try {
      const [yearsRes, periodsRes, groupsRes, commissionsRes] = await Promise.all([
        academicApi.listYears(),
        academicApi.listPeriods(),
        academicApi.listGroups(),
        academicApi.listCommissions(),
      ])

      const sortedCommissions = [...commissionsRes.data].sort((a, b) => b.id - a.id)
      setYears(yearsRes.data)
      setPeriods(periodsRes.data)
      setGroups(groupsRes.data)
      setCommissions(sortedCommissions)

      if (!form.academic_year) {
        const activeYear = yearsRes.data.find((year) => year.status === 'ACTIVE')
        if (activeYear) setForm((prev) => ({ ...prev, academic_year: String(activeYear.id) }))
      }

      if (!selectedCommissionId && sortedCommissions.length > 0) {
        setSelectedCommissionId(sortedCommissions[0].id)
      }
    } catch {
      showToast('No se pudieron cargar los datos base', 'error')
    } finally {
      setLoading(false)
    }
  }, [form.academic_year, selectedCommissionId])

  const loadDecisions = useCallback(async (commissionId: number, page = decisionsPage, pageSize = decisionsPageSize) => {
    setLoadingDecisions(true)
    try {
      const res = await academicApi.listCommissionDecisions({ commission: commissionId, page, page_size: pageSize })
      setDecisions(res.data.results)
      setDecisionsTotalCount(res.data.count)
      setDecisionsSummary(
        res.data.summary || {
          total_students: res.data.count,
          total_flagged: res.data.results.filter((decision) => decision.is_flagged).length,
          total_not_flagged: res.data.count - res.data.results.filter((decision) => decision.is_flagged).length,
          flagged_rate: 0,
        },
      )
      await loadCommissionActaJobs(commissionId)
      return res.data.count
    } catch {
      showToast('No se pudieron cargar las decisiones de la comisión', 'error')
      setDecisions([])
      setDecisionsTotalCount(0)
      setDecisionsSummary({ total_students: 0, total_flagged: 0, total_not_flagged: 0, flagged_rate: 0 })
      setActaJobs([])
      return 0
    } finally {
      setLoadingDecisions(false)
    }
  }, [decisionsPage, decisionsPageSize, loadCommissionActaJobs])

  useEffect(() => {
    if (!canManage) return
    loadBaseData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage])

  useEffect(() => {
    if (!selectedCommissionId) {
      setDecisions([])
      setDecisionsTotalCount(0)
      setDecisionsSummary({ total_students: 0, total_flagged: 0, total_not_flagged: 0, flagged_rate: 0 })
      setActaJobs([])
      return
    }
    void loadDecisions(selectedCommissionId, decisionsPage, decisionsPageSize)
  }, [decisionsPage, decisionsPageSize, loadDecisions, selectedCommissionId])

  useEffect(() => {
    if (decisionsPage > decisionsTotalPages) {
      setDecisionsPage(decisionsTotalPages)
    }
  }, [decisionsPage, decisionsTotalPages])

  useEffect(() => {
    const hasActiveJobs = actaJobs.some((job) => job.status === 'PENDING' || job.status === 'RUNNING')
    if (!hasActiveJobs || decisionsTotalCount === 0 || !selectedCommissionId) return

    const intervalId = window.setInterval(() => {
      void loadCommissionActaJobs(selectedCommissionId, true)
    }, 3000)

    return () => window.clearInterval(intervalId)
  }, [actaJobs, decisionsTotalCount, loadCommissionActaJobs, selectedCommissionId])

  useEffect(() => {
    setForm((prev) => (prev.title === generatedCommissionTitle ? prev : { ...prev, title: generatedCommissionTitle }))
  }, [generatedCommissionTitle])

  const handleCreate = async () => {
    if (!selectedYearId) {
      showToast('Selecciona un año académico', 'warning')
      return
    }
    if (form.commission_type === 'EVALUATION' && !form.period) {
      showToast('La comisión de evaluación requiere periodo', 'warning')
      return
    }

    setCreating(true)
    try {
      const payload: Partial<Commission> = {
        commission_type: form.commission_type,
        academic_year: selectedYearId,
        period: form.commission_type === 'EVALUATION' ? Number(form.period) : null,
        group: form.group ? Number(form.group) : null,
        title: form.title,
        notes: form.notes,
      }
      const res = await academicApi.createCommission(payload)

      setCommissions((prev) => [res.data, ...prev])
      setSelectedCommissionId(res.data.id)
      setForm((prev) => ({
        ...EMPTY_FORM,
        academic_year: prev.academic_year,
      }))
      setActiveTab('commissions')
      showToast('Comisión creada', 'success')
    } catch (error) {
      const preconditionsPayload = parseCommissionPreconditionsError(error)
      if (preconditionsPayload) {
        setPreconditionsModal(preconditionsPayload)
        showToast('Hay prerequisitos pendientes antes de crear la comisión', 'warning')
      } else {
        showToast('No se pudo crear la comisión', 'error')
      }
    } finally {
      setCreating(false)
    }
  }

  const handleRefreshDifficulties = async (commissionId: number) => {
    try {
      const res = await academicApi.refreshCommissionDifficulties(commissionId)
      const summary = res.data.summary
      showToast(
        `Dificultades actualizadas: ${res.data.created} creadas, ${res.data.updated} actualizadas · En riesgo: ${summary.total_flagged}/${summary.total_students}`,
        'success',
      )
      await loadDecisions(commissionId, decisionsPage, decisionsPageSize)
    } catch {
      showToast('No se pudieron recalcular las dificultades', 'error')
    }
  }

  const handleCloseCommission = async (commissionId: number) => {
    try {
      const res = await academicApi.closeCommission(commissionId)
      setCommissions((prev) => prev.map((item) => (item.id === commissionId ? res.data : item)))
      showToast('Comisión cerrada', 'success')
    } catch {
      showToast('No se pudo cerrar la comisión', 'error')
    }
  }

  const handleStartCommission = async (commissionId: number) => {
    try {
      const res = await academicApi.startCommission(commissionId)
      setCommissions((prev) => prev.map((item) => (item.id === commissionId ? res.data : item)))
      showToast('Comisión iniciada', 'success')
    } catch {
      showToast('No se pudo iniciar la comisión', 'error')
    }
  }

  const handleViewCommission = async (commissionId: number) => {
    setViewingCommissionId(commissionId)
    setSelectedCommissionId(commissionId)
    setDecisionsPage(1)
    try {
      const loadedCount = await loadDecisions(commissionId, 1, decisionsPageSize)
      const commission = commissions.find((item) => item.id === commissionId)

      if ((loadedCount ?? 0) === 0 && commission?.status === 'DRAFT') {
        try {
          await academicApi.refreshCommissionDifficulties(commissionId)
          await loadDecisions(commissionId, 1, decisionsPageSize)
          showToast('Se calcularon automáticamente las dificultades de la comisión en borrador', 'info')
        } catch {
          showToast('No se pudieron calcular automáticamente las dificultades en borrador', 'warning')
        }
      }

      setActiveTab('decisions')
    } finally {
      setViewingCommissionId(null)
    }
  }

  const handleRequestDeleteCommission = (commissionId: number) => {
    setCommissionPendingDeleteId(commissionId)
  }

  const handleCloseDeleteModal = () => {
    if (deletingCommissionId !== null) return
    setCommissionPendingDeleteId(null)
  }

  const handleDeleteCommission = async () => {
    if (commissionPendingDeleteId === null) return

    const commissionId = commissionPendingDeleteId
    setDeletingCommissionId(commissionId)
    try {
      await academicApi.deleteCommission(commissionId)
      const remaining = commissions.filter((item) => item.id !== commissionId)
      setCommissions(remaining)

      if (selectedCommissionId === commissionId) {
        const nextSelectedId = remaining.length > 0 ? remaining[0].id : null
        setSelectedCommissionId(nextSelectedId)
        setDecisionsPage(1)
      }

      showToast('Comisión eliminada', 'success')
    } catch {
      showToast('No se pudo eliminar la comisión', 'error')
    } finally {
      setDeletingCommissionId(null)
      setCommissionPendingDeleteId(null)
    }
  }

  const handleGenerateActa = async (decision: CommissionDecision) => {
    try {
      await academicApi.generateCommissionActa(decision.id)
      showToast('Acta generada y registrada en observador', 'success')
      if (selectedCommissionId) {
        await loadDecisions(selectedCommissionId, decisionsPage, decisionsPageSize)
      }
    } catch {
      showToast('No se pudo generar el acta', 'error')
    }
  }

  const handleDownloadActaPdf = async (decision: CommissionDecision) => {
    try {
      const res = await academicApi.downloadCommissionActaPdf(decision.id)
      downloadBlob(res.data, `comision-acta-decision-${decision.id}.pdf`)
    } catch {
      showToast('No se pudo descargar el acta en PDF', 'error')
    }
  }

  const handleOpenObserver = (decision: CommissionDecision) => {
    if (!decision.student_id) {
      showToast('No se encontró el estudiante para abrir el observador', 'warning')
      return
    }
    navigate(`/students/${decision.student_id}?tab=observer_annotations`)
  }

  const handleQueueBulkActas = async (commissionId: number) => {
    try {
      const res = await academicApi.queueCommissionActasBulk(commissionId, { only_flagged: true })
      showToast(`Se encolaron ${res.data.count} actas para generación asíncrona`, 'success')
      await loadDecisions(commissionId, decisionsPage, decisionsPageSize)
    } catch {
      showToast('No se pudieron encolar las actas asíncronas', 'error')
    }
  }

  const handleDownloadJob = async (job: ReportJob) => {
    try {
      const res = await reportsApi.downloadJob(job.id)
      downloadBlob(res.data, job.output_filename || `reporte-${job.id}.pdf`)
    } catch {
      showToast('No se pudo descargar el archivo del job', 'error')
    }
  }

  const getStatusLabel = (status: ReportJob['status']) => {
    if (status === 'PENDING') return 'Pendiente'
    if (status === 'RUNNING') return 'En proceso'
    if (status === 'SUCCEEDED') return 'Completado'
    if (status === 'FAILED') return 'Fallido'
    return 'Cancelado'
  }

  const getCommissionStatusLabel = (status: Commission['status']) => {
    if (status === 'DRAFT') return 'Borrador'
    if (status === 'IN_PROGRESS') return 'En curso'
    return 'Cerrada'
  }

  const getCommissionStatusClasses = (status: Commission['status']) => {
    if (status === 'DRAFT') {
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/40'
    }
    if (status === 'IN_PROGRESS') {
      return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/40'
    }
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/40'
  }

  const getRecalculateDisabledReason = (status: Commission['status']) => {
    if (status === 'DRAFT') return 'Recalcular dificultades'
    if (status === 'IN_PROGRESS') return 'Solo disponible en estado Borrador'
    return 'La comisión está cerrada'
  }

  const getQueueActasDisabledReason = (status: Commission['status']) => {
    if (status === 'IN_PROGRESS') return 'Encolar actas asíncronas'
    if (status === 'DRAFT') return 'Inicia la comisión para habilitar actas async'
    return 'La comisión está cerrada'
  }

  const getGenerateActaDisabledReason = (commissionStatus: Commission['status'] | undefined, isFlagged: boolean) => {
    if (!isFlagged) return 'Solo disponible para estudiantes en riesgo'
    if (commissionStatus !== 'IN_PROGRESS') return 'Inicia la comisión para generar actas'
    return 'Generar acta'
  }

  const yearFilteredPeriods = useMemo(() => {
    if (!selectedYearId) return periods
    return periods.filter((period) => period.academic_year === selectedYearId)
  }, [periods, selectedYearId])

  const yearFilteredGroups = useMemo(() => {
    if (!selectedYearId) return groups
    return groups.filter((group) => group.academic_year === selectedYearId)
  }, [groups, selectedYearId])

  const tabs: Array<{ key: CommissionTabKey; label: string; count?: number }> = [
    { key: 'create', label: 'Crear' },
    { key: 'commissions', label: 'Comisiones', count: commissions.length },
    { key: 'decisions', label: 'Decisiones', count: decisionsTotalCount },
    { key: 'jobs', label: 'Jobs', count: actaJobs.length },
  ]

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comisiones académicas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">No tienes permisos para este módulo.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
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

      <ConfirmationModal
        isOpen={commissionPendingDelete !== null}
        onClose={handleCloseDeleteModal}
        onConfirm={handleDeleteCommission}
        title="Eliminar comisión"
        description={
          commissionPendingDelete
            ? `¿Seguro que deseas eliminar la comisión #${commissionPendingDelete.id}? Esta acción no se puede deshacer.`
            : '¿Seguro que deseas eliminar esta comisión?'
        }
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="destructive"
        loading={deletingCommissionId !== null}
      />

      {preconditionsModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="flex h-[92vh] w-full max-w-5xl flex-col rounded-t-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:h-auto sm:max-h-[90vh] sm:rounded-xl">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-700 dark:bg-slate-900 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">No se puede crear la comisión</h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{preconditionsModal.message}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setPreconditionsModal(null)}>
                  Cerrar
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
                  <p className="text-slate-500 dark:text-slate-400">Bloqueos</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {preconditionsModal.summary?.total_blocking_items ?? preconditionsModal.blocking_items.length}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
                  <p className="text-slate-500 dark:text-slate-400">Tipos</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {Object.keys(preconditionsModal.summary?.reasons_count || {}).length}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
                  <p className="text-slate-500 dark:text-slate-400">Grupos</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {preconditionsModal.summary?.total_groups_evaluated ?? '—'}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
                  <p className="text-slate-500 dark:text-slate-400">Filtrados</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{filteredPreconditionGroups.length}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={preconditionsSearch}
                  onChange={(event) => setPreconditionsSearch(event.target.value)}
                  placeholder="Buscar por motivo, grupo, asignatura o docente"
                  className="h-10"
                />
                {preconditionsSearch ? (
                  <Button variant="outline" size="sm" onClick={() => setPreconditionsSearch('')} className="min-h-10 sm:min-h-0">
                    Limpiar
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-6">
              {recommendedActions.length > 0 ? (
                <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Acciones recomendadas</p>
                  <ul className="mt-2 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    {recommendedActions.map((action) => (
                      <li key={`${action.reasonCode}-${action.text}`} className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 font-medium ${getSeverityClasses(action.severity)}`}>
                          {getSeverityLabel(action.severity)}
                        </span>
                        <span>{action.text}</span>
                        {action.href && action.label ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setPreconditionsModal(null)
                              navigate(action.href)
                            }}
                          >
                            {action.label}
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {filteredPreconditionGroups.length === 0 ? (
                <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  No hay bloqueos que coincidan con tu búsqueda.
                </div>
              ) : filteredPreconditionGroups.map((group) => {
                const isExpanded = expandedReasonCodes.includes(group.reasonCode)
                return (
                  <div key={`precondition-group-${group.reasonCode}`} className="rounded-md border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => togglePreconditionGroup(group.reasonCode)}
                      className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-3 text-left"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getSeverityClasses(group.severity)}`}>
                          {getSeverityLabel(group.severity)}
                        </span>
                        <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{group.reasonLabel}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>{group.items.length} caso(s)</span>
                        <span>{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {isExpanded ? (
                      <div className="space-y-2 border-t border-slate-200 px-3 py-3 dark:border-slate-700">
                        {group.items.map((item, index) => (
                          <div key={`${item.reason_code}-${item.group_name}-${item.subject_name}-${item.period_name}-${index}`} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                              {item.group_name ? <span>Grupo: {item.group_name}</span> : null}
                              {item.period_name ? <span>Periodo: {item.period_name}</span> : null}
                              {item.subject_name ? <span>Asignatura: {item.subject_name}</span> : null}
                              {item.teacher_name ? <span>Docente: {item.teacher_name}</span> : null}
                            </div>
                            <p className="mt-2 text-sm text-slate-800 dark:text-slate-100">{item.reason_message}</p>
                            {item.meta?.filled !== undefined && item.meta?.total !== undefined ? (
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Avance registrado: {item.meta.filled}/{item.meta.total}
                              </p>
                            ) : null}
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Acción sugerida: {item.action_hint}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>

            <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:justify-between sm:px-6">
              <Button variant="outline" onClick={() => void copyPreconditionsSummary()} className="w-full sm:w-auto">
                Copiar resumen
              </Button>
              <Button onClick={() => setPreconditionsModal(null)} className="w-full sm:w-auto">
                Entendido
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-4 py-2 text-sm transition-colors ${
                    isActive
                      ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{tab.label}</span>
                  {typeof tab.count === 'number' ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {activeTab === 'create' ? (
      <Card>
        <CardHeader>
          <CardTitle>Comisiones de evaluación y promoción</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="text-sm text-slate-600 dark:text-slate-300">
              Tipo de comisión
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={form.commission_type}
                onChange={(e) => setForm((prev) => ({ ...prev, commission_type: e.target.value as 'EVALUATION' | 'PROMOTION', period: '' }))}
              >
                <option value="EVALUATION">Evaluación (por periodo)</option>
                <option value="PROMOTION">Promoción (cierre anual)</option>
              </select>
            </label>

            <label className="text-sm text-slate-600 dark:text-slate-300">
              Año académico
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={form.academic_year}
                onChange={(e) => setForm((prev) => ({ ...prev, academic_year: e.target.value }))}
              >
                <option value="">Selecciona...</option>
                {years.map((year) => (
                  <option key={year.id} value={year.id}>Año {year.year}</option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-600 dark:text-slate-300">
              Periodo
              <select
                disabled={form.commission_type !== 'EVALUATION'}
                className="mt-1 flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
                value={form.period}
                onChange={(e) => setForm((prev) => ({ ...prev, period: e.target.value }))}
              >
                <option value="">Selecciona...</option>
                {yearFilteredPeriods.map((period) => (
                  <option key={period.id} value={period.id}>{period.name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-600 dark:text-slate-300">
              Grupo (opcional)
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={form.group}
                onChange={(e) => setForm((prev) => ({ ...prev, group: e.target.value }))}
              >
                <option value="">Todos</option>
                {yearFilteredGroups.map((group) => (
                  <option key={group.id} value={group.id}>{group.grade_name} - {group.name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-600 dark:text-slate-300 md:col-span-2">
              Título
              <Input
                value={form.title}
                readOnly
                title="Título generado automáticamente"
              />
            </label>
          </div>

          <label className="text-sm text-slate-600 dark:text-slate-300 block">
            Observaciones
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </label>

          <div className="flex justify-stretch sm:justify-end">
            <Button onClick={handleCreate} disabled={creating || loading} className="w-full sm:w-auto">
              {creating ? 'Creando...' : 'Crear comisión'}
            </Button>
          </div>
        </CardContent>
      </Card>
      ) : null}

      {activeTab === 'commissions' ? (
      <Card>
        <CardHeader>
          <CardTitle>Comisiones registradas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <p className="text-sm text-slate-500">Cargando...</p> : null}

          <div className="space-y-3 md:grid md:grid-cols-1 md:gap-3 md:space-y-0 lg:grid-cols-2 xl:hidden">
            {commissions.length === 0 ? (
              <p className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 dark:border-slate-800">No hay comisiones registradas.</p>
            ) : commissions.map((commission) => {
              const group = groups.find((item) => item.id === commission.group)
              return (
                <div
                  key={`mobile-commission-${commission.id}`}
                  className={`rounded-lg border border-slate-200 p-3 dark:border-slate-800 ${selectedCommissionId === commission.id ? 'bg-blue-50/70 dark:bg-blue-950/20' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">#{commission.id} · {commission.commission_type === 'EVALUATION' ? 'Evaluación' : 'Promoción'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Año {years.find((year) => year.id === commission.academic_year)?.year ?? commission.academic_year}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getCommissionStatusClasses(commission.status)}`}>
                      {getCommissionStatusLabel(commission.status)}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300 lg:grid-cols-3">
                    <p><span className="font-medium">Periodo:</span> {commission.period_name || '—'}</p>
                    <p><span className="font-medium">Grado:</span> {group?.grade_name || '—'}</p>
                    <p><span className="font-medium">Grupo:</span> {commission.group_name || 'Todos'}</p>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-10"
                      onClick={() => void handleViewCommission(commission.id)}
                      disabled={viewingCommissionId === commission.id || deletingCommissionId === commission.id}
                    >
                      {viewingCommissionId === commission.id ? 'Abriendo...' : 'Ver'}
                    </Button>
                    {commission.status === 'DRAFT' ? (
                      <Button variant="outline" size="sm" className="min-h-10" onClick={() => handleStartCommission(commission.id)} disabled={deletingCommissionId === commission.id}>
                        Iniciar
                      </Button>
                    ) : commission.status === 'IN_PROGRESS' ? (
                      <Button variant="outline" size="sm" className="min-h-10" onClick={() => handleCloseCommission(commission.id)} disabled={deletingCommissionId === commission.id}>
                        Cerrar
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="min-h-10" disabled>
                        Cerrada
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-10"
                      onClick={() => handleRefreshDifficulties(commission.id)}
                      disabled={commission.status !== 'DRAFT' || deletingCommissionId === commission.id}
                      title={getRecalculateDisabledReason(commission.status)}
                    >
                      Recalcular
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-10"
                      onClick={() => handleQueueBulkActas(commission.id)}
                      disabled={commission.status !== 'IN_PROGRESS' || deletingCommissionId === commission.id}
                      title={getQueueActasDisabledReason(commission.status)}
                    >
                      Actas async
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="col-span-2 min-h-10 lg:col-span-3"
                      onClick={() => handleRequestDeleteCommission(commission.id)}
                      disabled={deletingCommissionId === commission.id}
                      title="Eliminar comisión"
                    >
                      {deletingCommissionId === commission.id ? 'Eliminando...' : 'Eliminar'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="hidden overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 xl:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60">
                <tr className="text-left text-slate-600 dark:text-slate-300">
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Año</th>
                  <th className="px-3 py-2 font-medium">Periodo</th>
                  <th className="px-3 py-2 font-medium">Grado</th>
                  <th className="px-3 py-2 font-medium">Grupo</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((commission) => {
                  const group = groups.find((item) => item.id === commission.group)
                  return (
                    <tr
                      key={commission.id}
                      className={`border-t border-slate-200 dark:border-slate-800 ${selectedCommissionId === commission.id ? 'bg-blue-50/70 dark:bg-blue-950/20' : ''}`}
                    >
                      <td className="px-3 py-2">{commission.id}</td>
                      <td className="px-3 py-2">{commission.commission_type === 'EVALUATION' ? 'Evaluación' : 'Promoción'}</td>
                      <td className="px-3 py-2">{years.find((year) => year.id === commission.academic_year)?.year ?? commission.academic_year}</td>
                      <td className="px-3 py-2">{commission.period_name || '—'}</td>
                      <td className="px-3 py-2">{group?.grade_name || '—'}</td>
                      <td className="px-3 py-2">{commission.group_name || 'Todos'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getCommissionStatusClasses(commission.status)}`}>
                          {getCommissionStatusLabel(commission.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleViewCommission(commission.id)}
                            disabled={viewingCommissionId === commission.id || deletingCommissionId === commission.id}
                          >
                            {viewingCommissionId === commission.id ? 'Abriendo...' : 'Ver'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRefreshDifficulties(commission.id)}
                            disabled={commission.status !== 'DRAFT' || deletingCommissionId === commission.id}
                            title={getRecalculateDisabledReason(commission.status)}
                          >
                            Recalcular
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleQueueBulkActas(commission.id)}
                            disabled={commission.status !== 'IN_PROGRESS' || deletingCommissionId === commission.id}
                            title={getQueueActasDisabledReason(commission.status)}
                          >
                            Actas async
                          </Button>
                          {commission.status === 'DRAFT' ? (
                            <Button variant="outline" size="sm" onClick={() => handleStartCommission(commission.id)} disabled={deletingCommissionId === commission.id}>
                              Iniciar
                            </Button>
                          ) : null}
                          {commission.status === 'IN_PROGRESS' ? (
                            <Button variant="outline" size="sm" onClick={() => handleCloseCommission(commission.id)} disabled={deletingCommissionId === commission.id}>
                              Cerrar
                            </Button>
                          ) : null}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRequestDeleteCommission(commission.id)}
                            disabled={deletingCommissionId === commission.id}
                            title="Eliminar comisión"
                          >
                            {deletingCommissionId === commission.id ? 'Eliminando...' : 'Eliminar'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      ) : null}

      {activeTab === 'decisions' ? (
      <div>
      <Card>
        <CardHeader>
          <CardTitle>
            Decisiones por estudiante {selectedCommission ? `(Comisión #${selectedCommission.id})` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedCommissionId ? (
            <p className="text-sm text-slate-500">Selecciona una comisión para ver sus decisiones.</p>
          ) : loadingDecisions && decisions.length === 0 ? (
            <p className="text-sm text-slate-500">Cargando decisiones...</p>
          ) : (
            <div className="space-y-4">
              {loadingDecisions ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Actualizando página de decisiones...</p>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
                  <p className="text-xs text-slate-500">Total estudiantes</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{decisionsSummary.total_students}</p>
                </div>
                <div className="rounded-lg border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 px-3 py-2">
                  <p className="text-xs text-rose-700 dark:text-rose-300">En riesgo</p>
                  <p className="text-lg font-semibold text-rose-700 dark:text-rose-300">{decisionsSummary.total_flagged}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2">
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">Sin riesgo</p>
                  <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{decisionsSummary.total_not_flagged}</p>
                </div>
                <div className="rounded-lg border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 px-3 py-2">
                  <p className="text-xs text-blue-700 dark:text-blue-300">% en riesgo</p>
                  <p className="text-lg font-semibold text-blue-700 dark:text-blue-300">{decisionsSummary.flagged_rate}%</p>
                </div>
              </div>

              <div className="space-y-3 md:grid md:grid-cols-1 md:gap-3 md:space-y-0 lg:grid-cols-2 xl:hidden">
                {loadingDecisions && decisions.length > 0
                  ? Array.from({ length: Math.min(decisionsPageSize, 5) }).map((_, index) => (
                    <div key={`decisions-mobile-skeleton-${index}`} className="animate-pulse rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="h-4 w-36 rounded bg-slate-200 dark:bg-slate-700" />
                      <div className="mt-2 h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
                      <div className="mt-3 h-8 w-full rounded bg-slate-200 dark:bg-slate-700" />
                    </div>
                  ))
                  : decisions.map((decision) => (
                    <div key={`mobile-decision-${decision.id}`} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{decision.student_name || '—'}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Doc: {decision.student_document || '—'} · Grupo: {decision.group_name || '—'}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${decision.is_flagged ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300'}`}>
                          {decision.is_flagged ? 'En riesgo' : 'Sin riesgo'}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <p><span className="font-medium">Materias:</span> {decision.failed_subjects_count}</p>
                        <p><span className="font-medium">Áreas:</span> {decision.failed_areas_count}</p>
                        <p><span className="font-medium">Acta:</span> {decision.acta_id ? `#${decision.acta_id}` : '—'}</p>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-10"
                          onClick={() => handleGenerateActa(decision)}
                          disabled={!decision.is_flagged || selectedCommission?.status !== 'IN_PROGRESS'}
                          title={getGenerateActaDisabledReason(selectedCommission?.status, decision.is_flagged)}
                        >
                          Generar acta
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-10"
                          onClick={() => handleDownloadActaPdf(decision)}
                          disabled={!decision.acta_id}
                        >
                          PDF
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-10"
                          onClick={() => handleOpenObserver(decision)}
                          disabled={!decision.student_id}
                          title={decision.student_id ? 'Abrir observador del estudiante' : 'Estudiante no disponible'}
                        >
                          Observador
                        </Button>
                      </div>
                    </div>
                  ))}

                {!loadingDecisions && decisions.length === 0 ? (
                  <p className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 dark:border-slate-800">No hay decisiones para esta comisión.</p>
                ) : null}
              </div>

              <div className="hidden overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 xl:block">
                <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/60">
                  <tr className="text-left text-slate-600 dark:text-slate-300">
                    <th className="px-3 py-2 font-medium">Estudiante</th>
                    <th className="px-3 py-2 font-medium">Documento</th>
                    <th className="px-3 py-2 font-medium">Grupo</th>
                    <th className="px-3 py-2 font-medium">Materias</th>
                    <th className="px-3 py-2 font-medium">Áreas</th>
                    <th className="px-3 py-2 font-medium">Riesgo</th>
                    <th className="px-3 py-2 font-medium">Acta</th>
                    <th className="px-3 py-2 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingDecisions && decisions.length > 0
                    ? Array.from({ length: Math.min(decisionsPageSize, 5) }).map((_, index) => (
                      <tr key={`decisions-skeleton-${index}`} className="border-t border-slate-200 dark:border-slate-800 animate-pulse">
                        <td className="px-3 py-2"><div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-700" /></td>
                        <td className="px-3 py-2"><div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700" /></td>
                        <td className="px-3 py-2"><div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700" /></td>
                        <td className="px-3 py-2"><div className="h-3 w-8 rounded bg-slate-200 dark:bg-slate-700" /></td>
                        <td className="px-3 py-2"><div className="h-3 w-8 rounded bg-slate-200 dark:bg-slate-700" /></td>
                        <td className="px-3 py-2"><div className="h-3 w-10 rounded bg-slate-200 dark:bg-slate-700" /></td>
                        <td className="px-3 py-2"><div className="h-3 w-10 rounded bg-slate-200 dark:bg-slate-700" /></td>
                        <td className="px-3 py-2 text-right"><div className="ml-auto h-7 w-40 rounded bg-slate-200 dark:bg-slate-700" /></td>
                      </tr>
                    ))
                    : decisions.map((decision) => (
                      <tr key={decision.id} className="border-t border-slate-200 dark:border-slate-800">
                        <td className="px-3 py-2">{decision.student_name || '—'}</td>
                        <td className="px-3 py-2">{decision.student_document || '—'}</td>
                        <td className="px-3 py-2">{decision.group_name || '—'}</td>
                        <td className="px-3 py-2">{decision.failed_subjects_count}</td>
                        <td className="px-3 py-2">{decision.failed_areas_count}</td>
                        <td className="px-3 py-2">{decision.is_flagged ? 'Sí' : 'No'}</td>
                        <td className="px-3 py-2">{decision.acta_id ? `#${decision.acta_id}` : '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGenerateActa(decision)}
                              disabled={!decision.is_flagged || selectedCommission?.status !== 'IN_PROGRESS'}
                              title={getGenerateActaDisabledReason(selectedCommission?.status, decision.is_flagged)}
                            >
                              Generar acta
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadActaPdf(decision)}
                              disabled={!decision.acta_id}
                            >
                              PDF
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenObserver(decision)}
                              disabled={!decision.student_id}
                              title={decision.student_id ? 'Abrir observador del estudiante' : 'Estudiante no disponible'}
                            >
                              Observador
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Mostrando {decisionsPageStart}–{decisionsPageEnd} de {decisionsTotalCount} decisiones
                </p>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <label className="text-xs text-slate-500 dark:text-slate-400" htmlFor="decisions-page-size">
                    Filas
                  </label>
                  <select
                    id="decisions-page-size"
                    className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                    value={decisionsPageSize}
                    disabled={loadingDecisions}
                    onChange={(e) => {
                      setDecisionsPageSize(Number(e.target.value))
                      setDecisionsPage(1)
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDecisionsPage((prev) => Math.max(1, prev - 1))}
                    disabled={decisionsPage <= 1 || loadingDecisions}
                  >
                    Anterior
                  </Button>
                  <span className="text-xs text-slate-600 dark:text-slate-300 min-w-16 text-center">
                    {decisionsPage}/{decisionsTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDecisionsPage((prev) => Math.min(decisionsTotalPages, prev + 1))}
                    disabled={decisionsPage >= decisionsTotalPages || loadingDecisions}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
      ) : null}

      {activeTab === 'jobs' ? (
      <Card>
        <CardHeader>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Jobs asíncronos de actas</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadCommissionActaJobs(selectedCommissionId)}
              disabled={jobsLoading || decisionsTotalCount === 0}
              className="w-full sm:w-auto"
            >
              {jobsLoading ? 'Actualizando...' : 'Actualizar'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {selectedCommissionId === null ? (
            <p className="text-sm text-slate-500">Selecciona una comisión para consultar la cola de actas.</p>
          ) : decisionsTotalCount === 0 ? (
            <p className="text-sm text-slate-500">No hay decisiones en la comisión actual.</p>
          ) : actaJobs.length === 0 ? (
            <p className="text-sm text-slate-500">Aún no hay jobs asíncronos para esta comisión.</p>
          ) : (
            <>
              <div className="space-y-3 md:grid md:grid-cols-1 md:gap-3 md:space-y-0 lg:grid-cols-2 xl:hidden">
                {actaJobs.map((job) => {
                  const decisionId = getDecisionIdFromJob(job)
                  return (
                    <div key={`mobile-job-${job.id}`} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Job #{job.id}</p>
                        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                          {getStatusLabel(job.status)}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                        <p><span className="font-medium">Decisión:</span> {decisionId ? `#${decisionId}` : '—'}</p>
                        <p><span className="font-medium">Progreso:</span> {job.progress ?? '—'}{typeof job.progress === 'number' ? '%' : ''}</p>
                        <p><span className="font-medium">Actualización:</span> {new Date(job.created_at).toLocaleString('es-CO')}</p>
                      </div>
                      <div className="mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDownloadJob(job)}
                          disabled={job.status !== 'SUCCEEDED'}
                          className="min-h-10 w-full"
                        >
                          Descargar
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="hidden overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 xl:block">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/60">
                  <tr className="text-left text-slate-600 dark:text-slate-300">
                    <th className="px-3 py-2 font-medium">Job</th>
                    <th className="px-3 py-2 font-medium">Decisión</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    <th className="px-3 py-2 font-medium">Progreso</th>
                    <th className="px-3 py-2 font-medium">Actualización</th>
                    <th className="px-3 py-2 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {actaJobs.map((job) => {
                    const decisionId = getDecisionIdFromJob(job)
                    return (
                      <tr key={job.id} className="border-t border-slate-200 dark:border-slate-800">
                        <td className="px-3 py-2">#{job.id}</td>
                        <td className="px-3 py-2">{decisionId ? `#${decisionId}` : '—'}</td>
                        <td className="px-3 py-2">{getStatusLabel(job.status)}</td>
                        <td className="px-3 py-2">{job.progress ?? '—'}{typeof job.progress === 'number' ? '%' : ''}</td>
                        <td className="px-3 py-2">{new Date(job.created_at).toLocaleString('es-CO')}</td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleDownloadJob(job)}
                            disabled={job.status !== 'SUCCEEDED'}
                          >
                            Descargar
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      ) : null}
    </div>
  )
}
