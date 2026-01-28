import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Label } from '../ui/Label'
import { Toast, type ToastType } from '../ui/Toast'
import { noveltiesWorkflowApi, type NoveltyReason, type NoveltyType } from '../../services/noveltiesWorkflow'
import { studentsApi, type Student } from '../../services/students'
import { academicApi, type AcademicYear, type Grade, type Group } from '../../services/academic'
import { coreApi, type Institution } from '../../services/core'
import { useAuthStore } from '../../store/auth'

const getErrorDetail = (err: unknown): string | undefined => {
  if (typeof err !== 'object' || err === null) return undefined
  const maybe = err as { response?: { data?: unknown } }
  const data = maybe.response?.data
  if (!data || typeof data !== 'object') return undefined

  const asObj = data as Record<string, unknown>
  const detail = asObj.detail
  if (typeof detail === 'string') return detail

  // DRF field errors often come like: { field: ["message"] }
  for (const v of Object.values(asObj)) {
    if (typeof v === 'string') return v
    if (Array.isArray(v) && typeof v[0] === 'string') return v[0]
  }

  return undefined
}

const studentDisplayName = (s: Student): string => {
  const first = (s.user?.first_name || '').trim()
  const last = (s.user?.last_name || '').trim()
  const full = `${first} ${last}`.trim()
  return full || `Estudiante #${s.id}`
}

const docTypeLabel = (docType: string): string => {
  const key = (docType || '').trim().toLowerCase()
  const map: Record<string, string> = {
    carta_retiro: 'Carta de retiro',
    acta_retiro: 'Acta de retiro',
    carta_reingreso: 'Carta de reingreso',
    acta_reingreso: 'Acta de reingreso',
    cambio_grupo: 'Soporte de cambio de grupo',
    cambio_interno: 'Soporte de cambio interno',
    documento_identidad: 'Documento de identidad',
    registro_civil: 'Registro civil',
    boletin: 'Boletín',
  }
  if (map[key]) return map[key]

  const pretty = key.replace(/[_-]+/g, ' ').trim()
  if (!pretty) return 'Documento'

  return pretty
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const DEFAULT_DOC_TYPES: string[] = [
  'carta_retiro',
  'acta_retiro',
  'carta_reingreso',
  'acta_reingreso',
  'cambio_grupo',
  'cambio_interno',
  'documento_identidad',
  'registro_civil',
  'boletin',
]

export type NoveltyCaseFormInitial = {
  studentId?: number
  institutionId?: number
  typeId?: number
  reasonId?: number
  effectiveDate?: string
}

export interface NoveltyCaseFormProps {
  initial?: NoveltyCaseFormInitial
  onCancel?: () => void
  onCreated?: (caseId: number) => void
}

export function NoveltyCaseForm({ initial, onCancel, onCreated }: NoveltyCaseFormProps) {
  const me = useAuthStore((s) => s.user)
  const isAdmin = me?.role === 'ADMIN' || me?.role === 'SUPERADMIN'

  const unwrapInstitutions = (data: unknown): Institution[] => {
    if (Array.isArray(data)) return data as Institution[]
    const maybe = data as { results?: unknown }
    if (Array.isArray(maybe?.results)) return maybe.results as Institution[]
    return []
  }

  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [institutionId, setInstitutionId] = useState<string>(initial?.institutionId ? String(initial.institutionId) : '')
  const [loadingInstitutions, setLoadingInstitutions] = useState(false)
  const [institutionTouched, setInstitutionTouched] = useState(Boolean(initial?.institutionId))
  const [guessingInstitution, setGuessingInstitution] = useState(false)
  const [guessedInstitutionForStudentId, setGuessedInstitutionForStudentId] = useState<number | null>(null)

  const [types, setTypes] = useState<NoveltyType[]>([])
  const [reasons, setReasons] = useState<NoveltyReason[]>([])
  const [loading, setLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [studentId, setStudentId] = useState<string>(initial?.studentId ? String(initial.studentId) : '')
  const [student, setStudent] = useState<Student | null>(null)
  const [loadingStudent, setLoadingStudent] = useState(false)

  const [typeId, setTypeId] = useState<string>(initial?.typeId ? String(initial.typeId) : '')
  const [reasonId, setReasonId] = useState<string>(initial?.reasonId ? String(initial.reasonId) : '')
  const [effectiveDate, setEffectiveDate] = useState<string>(initial?.effectiveDate || '')

  const [sendToReviewAfterFile, setSendToReviewAfterFile] = useState(true)

  const [retiroDocTypeChoice, setRetiroDocTypeChoice] = useState<string>('carta_retiro')
  const [retiroDocTypeOther, setRetiroDocTypeOther] = useState<string>('')
  const [retiroFile, setRetiroFile] = useState<File | null>(null)
  const [quickRetiroWorking, setQuickRetiroWorking] = useState(false)
  const [showRetiroExtras, setShowRetiroExtras] = useState(false)

  const [advancedPayloadEnabled, setAdvancedPayloadEnabled] = useState(false)
  const [payloadText, setPayloadText] = useState<string>('')

  const [years, setYears] = useState<AcademicYear[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loadingPayloadCatalogs, setLoadingPayloadCatalogs] = useState(false)

  const [payloadAcademicYearId, setPayloadAcademicYearId] = useState<string>('')
  const [payloadGradeId, setPayloadGradeId] = useState<string>('')
  const [payloadGroupId, setPayloadGroupId] = useState<string>('')

  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const reloadCatalogs = async (opts?: { mounted?: () => boolean }) => {
    setLoading(true)
    setCatalogError(null)
    try {
      const [typesRes, reasonsRes] = await Promise.all([
        noveltiesWorkflowApi.listTypes(),
        noveltiesWorkflowApi.listReasons({ is_active: true }),
      ])

      if (opts?.mounted && !opts.mounted()) return
      setTypes(typesRes.items)
      setReasons(reasonsRes.items)

      if (typesRes.items.length === 0) {
        setCatalogError('No hay tipos de novedad activos. Verifica que estén creados/activos en el backend.')
      }
    } catch (err) {
      if (opts?.mounted && !opts.mounted()) return
      const detail = getErrorDetail(err)
      const msg = detail ? `No se pudieron cargar los catálogos: ${detail}` : 'No se pudieron cargar los catálogos'
      setCatalogError(msg)
      showToast(msg, 'error')
    } finally {
      if (!opts?.mounted || opts.mounted()) setLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    void reloadCatalogs({ mounted: () => mounted })
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let mounted = true

    ;(async () => {
      setLoadingInstitutions(true)
      try {
        const res = await coreApi.listInstitutions()
        if (!mounted) return
        const items = unwrapInstitutions(res.data)
        setInstitutions(items)

        // Default to the first institution for faster workflow.
        if (!institutionId && items.length) setInstitutionId(String(items[0].id))
      } catch {
        if (!mounted) return
        setInstitutions([])
      } finally {
        if (mounted) setLoadingInstitutions(false)
      }
    })()

    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredReasons = useMemo(() => {
    const t = Number(typeId)
    if (!t) return []
    return reasons.filter((r) => r.novelty_type === t)
  }, [reasons, typeId])

  const selectedType = useMemo(() => {
    const tId = Number(typeId)
    if (!tId) return null
    return types.find((t) => t.id === tId) || null
  }, [typeId, types])

  const selectedTypeCode = useMemo(() => {
    return (selectedType?.code || '').trim().toLowerCase()
  }, [selectedType?.code])

  const isStudent11thGrade = useMemo(() => {
    const ordinal = Number(student?.current_grade_ordinal)
    const name = (student?.current_grade_name || '').toLowerCase().trim()
    if (ordinal === 11 || ordinal === 13) return true
    if (name.includes('undecimo') || name.includes('undécimo')) return true
    if (/\b11\b/.test(name)) return true
    return false
  }, [student?.current_grade_name, student?.current_grade_ordinal])

  const visibleTypes = useMemo(() => {
    return types.filter((t) => {
      const code = (t.code || '').trim().toLowerCase()
      if (code === 'graduacion' || code === 'graduación') {
        // Only show Graduation when the student is loaded and is in 11th grade.
        return Boolean(student) && isStudent11thGrade
      }
      return true
    })
  }, [isStudent11thGrade, student, types])

  useEffect(() => {
    if (!typeId) return
    const selectedId = Number(typeId)
    if (!selectedId) return
    if (!visibleTypes.some((t) => t.id === selectedId)) {
      setTypeId('')
      setReasonId('')
    }
  }, [typeId, visibleTypes])

  useEffect(() => {
    if (selectedTypeCode !== 'retiro') setShowRetiroExtras(false)
  }, [selectedTypeCode])

  const payloadMode = useMemo(() => {
    if (!selectedTypeCode) return 'none' as const
    if (selectedTypeCode === 'retiro') return 'none' as const
    if (selectedTypeCode === 'reingreso') return 'reingreso' as const
    if (
      selectedTypeCode === 'cambio_interno' ||
      selectedTypeCode === 'cambio-interno' ||
      selectedTypeCode === 'cambio_grupo' ||
      selectedTypeCode === 'cambio-grupo'
    )
      return 'cambio_interno' as const
    return 'none' as const
  }, [selectedTypeCode])

  const retiroResolvedDocType = useMemo(() => {
    if (retiroDocTypeChoice === '__other__') return retiroDocTypeOther.trim()
    return retiroDocTypeChoice.trim()
  }, [retiroDocTypeChoice, retiroDocTypeOther])

  const retiroDocTypeOptions = useMemo(() => {
    // Keep it simple: default list + allow other.
    // Required rules are validated server-side (approve/execute will block if missing).
    const out = Array.from(new Set(DEFAULT_DOC_TYPES.map((t) => t.trim()).filter(Boolean)))
    return out
  }, [])

  useEffect(() => {
    setPayloadAcademicYearId('')
    setPayloadGradeId('')
    setPayloadGroupId('')
    if (!advancedPayloadEnabled) setPayloadText('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeId])

  useEffect(() => {
    if (payloadMode === 'none') return

    let mounted = true

    ;(async () => {
      setLoadingPayloadCatalogs(true)
      try {
        const [yearsRes, gradesRes] = await Promise.all([academicApi.listYears(), academicApi.listGrades()])
        if (!mounted) return
        const yearsData = yearsRes.data
        setYears(yearsData)
        setGrades(gradesRes.data)

        const active = yearsData.find((y) => y.status === 'ACTIVE')
        if (active && !payloadAcademicYearId) setPayloadAcademicYearId(String(active.id))
      } catch {
        if (!mounted) return
        showToast('No se pudieron cargar catálogos académicos para el tipo seleccionado', 'error')
      } finally {
        if (mounted) setLoadingPayloadCatalogs(false)
      }
    })()

    return () => {
      mounted = false
    }
    // payloadAcademicYearId intentionally omitted from deps to avoid overriding user choice
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadMode])

  useEffect(() => {
    if (payloadMode === 'none') {
      setGroups([])
      return
    }

    const yearId = Number(payloadAcademicYearId)
    const gradeId = Number(payloadGradeId)
    if (!yearId && !gradeId) {
      setGroups([])
      return
    }

    let mounted = true
    ;(async () => {
      try {
        const params: Record<string, unknown> = {}
        if (yearId) params.academic_year = yearId
        if (gradeId) params.grade = gradeId
        const res = await academicApi.listGroups(params)
        if (!mounted) return
        setGroups(res.data)
      } catch {
        if (!mounted) return
        setGroups([])
      }
    })()

    return () => {
      mounted = false
    }
  }, [payloadAcademicYearId, payloadGradeId, payloadMode])

  const computedPayload = useMemo(() => {
    if (payloadMode === 'none') return undefined

    const yearId = Number(payloadAcademicYearId) || undefined
    const gradeId = Number(payloadGradeId) || undefined
    const groupId = Number(payloadGroupId) || undefined

    if (payloadMode === 'cambio_interno') {
      if (!groupId) return {}
      return { destination_group_id: groupId }
    }

    if (payloadMode === 'reingreso') {
      const out: Record<string, unknown> = {}
      if (yearId) out.academic_year_id = yearId
      if (gradeId) out.grade_id = gradeId
      if (groupId) out.group_id = groupId
      return out
    }

    return undefined
  }, [payloadAcademicYearId, payloadGradeId, payloadGroupId, payloadMode])

  const canSubmit = useMemo(() => {
    return Boolean(Number(studentId)) && Boolean(Number(typeId)) && !saving
  }, [saving, studentId, typeId])

  const canFile = useMemo(() => {
    // For fast UX:
    // - If user selected an institution, use it.
    // - Otherwise, allow filing when the student is loaded, because backend can infer institution
    //   from the student's active enrollment (or from a single-institution system).
    return canSubmit && !loadingInstitutions && !guessingInstitution && (Boolean(Number(institutionId)) || Boolean(student))
  }, [canSubmit, guessingInstitution, institutionId, loadingInstitutions, student])

  const fetchStudent = async (opts?: { id?: number; silentSuccess?: boolean }) => {
    const id = Number(opts?.id ?? studentId)
    if (!id) {
      setStudent(null)
      showToast('Ingresa un ID de estudiante válido', 'info')
      return
    }

    setLoadingStudent(true)
    try {
      const res = await studentsApi.get(id)
      setStudent(res.data)
      if (!opts?.silentSuccess) showToast('Estudiante cargado', 'success')
    } catch {
      setStudent(null)
      showToast('No se encontró el estudiante', 'error')
    } finally {
      setLoadingStudent(false)
    }
  }

  useEffect(() => {
    if (!initial?.studentId) return
    void fetchStudent({ id: initial.studentId, silentSuccess: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const sId = Number(studentId)
    if (!sId || !student) return
    if (!institutions.length) return
    if (institutionTouched) return
    if (guessedInstitutionForStudentId === sId) return

    let mounted = true

    ;(async () => {
      setGuessingInstitution(true)
      try {
        const reportRes = await studentsApi.getObserverReport(sId)
        if (!mounted) return
        const reportInstitution = reportRes.data?.institution
        const dane = (reportInstitution?.dane_code || '').trim()
        const nit = (reportInstitution?.nit || '').trim()
        const name = (reportInstitution?.name || '').trim().toLowerCase()

        const match = institutions.find((i) => {
          const iDane = (i.dane_code || '').trim()
          const iNit = (i.nit || '').trim()
          const iName = (i.name || '').trim().toLowerCase()
          if (dane && iDane && dane === iDane) return true
          if (nit && iNit && nit === iNit) return true
          if (name && iName && name === iName) return true
          return false
        })

        if (match) {
          const next = String(match.id)
          if (institutionId !== next) setInstitutionId(next)
        }
      } catch {
        // Silent: user can still pick manually or rely on backend defaults.
      } finally {
        if (mounted) {
          setGuessedInstitutionForStudentId(sId)
          setGuessingInstitution(false)
        }
      }
    })()

    return () => {
      mounted = false
    }
  }, [guessedInstitutionForStudentId, institutionId, institutionTouched, institutions, student, studentId])

  const submit = async (opts?: { fileImmediately?: boolean }) => {
    const sId = Number(studentId)
    const tId = Number(typeId)
    const rId = Number(reasonId)
    const instId = Number(institutionId)

    if (!sId || !tId) {
      showToast('Completa estudiante y tipo', 'info')
      return
    }

    const fileImmediately = Boolean(opts?.fileImmediately)
    if (fileImmediately && !student) {
      // Helps backend infer institution from enrollments and gives user feedback.
      await fetchStudent({ id: sId, silentSuccess: true })
    }

    if (fileImmediately && !instId && !student) {
      showToast('Carga el estudiante o selecciona la institución para poder radicar', 'info')
      return
    }

    if (payloadMode === 'cambio_interno' && !Number(payloadGroupId)) {
      showToast('Selecciona el grupo destino para el cambio interno', 'info')
      return
    }

    if (payloadMode === 'reingreso' && !Number(payloadGradeId)) {
      showToast('Selecciona el grado para el reingreso', 'info')
      return
    }

    let payload: Record<string, unknown> | undefined

    if (advancedPayloadEnabled && isAdmin) {
      const raw = payloadText.trim()
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            showToast('Payload debe ser un objeto JSON', 'info')
            return
          }
          payload = parsed as Record<string, unknown>
        } catch {
          showToast('Payload JSON inválido', 'info')
          return
        }
      } else {
        payload = (computedPayload || undefined) as Record<string, unknown> | undefined
      }
    } else {
      payload = (computedPayload || undefined) as Record<string, unknown> | undefined
    }

    setSaving(true)
    let createdCaseId: number | null = null
    try {
      const res = await noveltiesWorkflowApi.createCase({
        student: sId,
        institution: instId || null,
        novelty_type: tId,
        novelty_reason: rId ? rId : null,
        effective_date: effectiveDate || null,
        payload,
      })

      createdCaseId = res.data.id

      if (fileImmediately) {
        try {
          await noveltiesWorkflowApi.transition(createdCaseId, 'file', { comment: '' })
        } catch (err) {
          showToast(getErrorDetail(err) || 'Novedad creada, pero no se pudo radicar', 'error')
          onCreated?.(createdCaseId)
          return
        }

        let sentToReview = false
        if (sendToReviewAfterFile) {
          try {
            await noveltiesWorkflowApi.transition(createdCaseId, 'send-to-review', { comment: '' })
            sentToReview = true
          } catch (err) {
            showToast(getErrorDetail(err) || 'Novedad radicada, pero no se pudo enviar a revisión', 'info')
          }
        }

        showToast(sentToReview ? 'Novedad radicada y enviada a revisión' : 'Novedad radicada', 'success')
      } else {
        showToast('Novedad guardada como borrador', 'success')
      }

      onCreated?.(createdCaseId)
    } catch (err) {
      // If the case was created but a later step failed unexpectedly, keep the UX recoverable.
      if (createdCaseId) {
        showToast(getErrorDetail(err) || 'Novedad creada, pero falló el flujo automático', 'error')
        onCreated?.(createdCaseId)
      } else {
        showToast(getErrorDetail(err) || 'No se pudo crear la novedad', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const quickRetiro = async () => {
    if (!isAdmin) {
      showToast('Solo administradores pueden ejecutar retiro rápido', 'info')
      return
    }

    const sId = Number(studentId)
    const tId = Number(typeId)
    const rId = Number(reasonId)
    const instId = Number(institutionId)

    if (!sId || !tId) {
      showToast('Completa estudiante y tipo', 'info')
      return
    }
    if (!retiroResolvedDocType || !retiroFile) {
      showToast('Selecciona el tipo de soporte y el archivo', 'info')
      return
    }

    setQuickRetiroWorking(true)
    setSaving(true)
    let createdCaseId: number | null = null

    try {
      const payload = advancedPayloadEnabled && isAdmin ? (() => {
        const raw = payloadText.trim()
        if (!raw) return undefined
        try {
          const parsed = JSON.parse(raw)
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
          return parsed as Record<string, unknown>
        } catch {
          return undefined
        }
      })() : computedPayload

      const res = await noveltiesWorkflowApi.createCase({
        student: sId,
        institution: instId || null,
        novelty_type: tId,
        novelty_reason: rId ? rId : null,
        effective_date: effectiveDate || null,
        payload,
      })

      createdCaseId = res.data.id

      await noveltiesWorkflowApi.uploadAttachment({ caseId: createdCaseId, doc_type: retiroResolvedDocType, file: retiroFile })

      // Radicar
      await noveltiesWorkflowApi.transition(createdCaseId, 'file', { comment: '' })

      // Flujo estándar: FILED -> IN_REVIEW -> APPROVED
      await noveltiesWorkflowApi.transition(createdCaseId, 'send-to-review', { comment: '' })

      // En vez de pedir comentario al usuario (backend lo exige), usamos uno mínimo.
      await noveltiesWorkflowApi.transition(createdCaseId, 'approve', { comment: 'Aprobación automática (retiro rápido)' })

      // Verifica estado antes de ejecutar (approve puede mover a PENDING_DOCS si faltan soportes)
      const afterApprove = await noveltiesWorkflowApi.getCase(createdCaseId)
      if (afterApprove.data.status !== 'APPROVED') {
        showToast('Retiro creado y radicado, pero no se pudo aprobar automáticamente. Revisa soportes.', 'info')
        onCreated?.(createdCaseId)
        return
      }

      // Ejecutar (backend exige comment no vacío)
      await noveltiesWorkflowApi.execute(createdCaseId, {
        comment: 'Ejecución automática (retiro rápido)',
        idempotency_key: undefined,
      })

      showToast('Retiro ejecutado', 'success')
      onCreated?.(createdCaseId)
    } catch (err) {
      const detail = getErrorDetail(err)
      showToast(detail || 'No se pudo completar el retiro rápido', 'error')
      if (createdCaseId) onCreated?.(createdCaseId)
    } finally {
      setQuickRetiroWorking(false)
      setSaving(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-base">Datos básicos</CardTitle>
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void reloadCatalogs()}>
              Recargar catálogos
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {catalogError ? (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
              {catalogError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label>Institución</Label>
              {institutions.length <= 1 && institutions.length > 0 ? (
                <div className="mt-1 flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-100">
                  {institutions[0].name}
                </div>
              ) : (
                <select
                  className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={institutionId}
                  disabled={saving || loadingInstitutions}
                  onChange={(e) => {
                    setInstitutionTouched(true)
                    setInstitutionId(e.target.value)
                  }}
                >
                  <option value="">Selecciona…</option>
                  {institutions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              )}
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Para radicar se usa esta institución (o se infiere del estudiante).
              </div>
            </div>

            <div>
              <Label>Estudiante (ID)</Label>
              <div className="flex gap-2 mt-1">
                <Input value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="Ej: 123" />
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  disabled={loadingStudent || !studentId.trim()}
                  onClick={() => void fetchStudent()}
                >
                  {loadingStudent ? 'Buscando…' : 'Buscar'}
                </Button>
              </div>
              {student ? (
                <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  {studentDisplayName(student)} • {student.document_type} {student.document_number}
                </div>
              ) : null}
            </div>

            {selectedTypeCode !== 'retiro' || showRetiroExtras ? (
              <div>
                <Label>Fecha efectiva (opcional)</Label>
                <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="mt-1" />
              </div>
            ) : null}

            <div>
              <Label>Tipo</Label>
              <select
                className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                value={typeId}
                disabled={loading}
                onChange={(e) => {
                  setTypeId(e.target.value)
                  setReasonId('')
                }}
              >
                <option value="">Selecciona…</option>
                {visibleTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </select>

              {student && !isStudent11thGrade ? (
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  La opción de Graduación solo está disponible para estudiantes de grado 11.
                </div>
              ) : null}
            </div>

            {selectedTypeCode === 'retiro' ? (
              <div className="md:col-span-2 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Retiro rápido</div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Crea el caso, carga el soporte, radica, aprueba y ejecuta sin pedirte comentarios.
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div className="md:col-span-1">
                    <Label>Tipo de soporte</Label>
                    <select
                      className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      value={retiroDocTypeChoice}
                      disabled={saving}
                      onChange={(e) => {
                        const v = e.target.value
                        setRetiroDocTypeChoice(v)
                        if (v !== '__other__') setRetiroDocTypeOther('')
                      }}
                    >
                      {retiroDocTypeOptions.map((dt) => (
                        <option key={dt} value={dt}>
                          {docTypeLabel(dt)}
                        </option>
                      ))}
                      <option value="__other__">Otro…</option>
                    </select>

                    {retiroDocTypeChoice === '__other__' ? (
                      <Input
                        value={retiroDocTypeOther}
                        onChange={(e) => setRetiroDocTypeOther(e.target.value)}
                        className="mt-2"
                        placeholder="Ej: carta_retiro"
                      />
                    ) : null}
                  </div>

                  <div className="md:col-span-2">
                    <Label>Archivo</Label>
                    <Input type="file" className="mt-1" onChange={(e) => setRetiroFile(e.target.files?.[0] || null)} />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-end">
                  <Button
                    onClick={() => void quickRetiro()}
                    disabled={!isAdmin || saving || quickRetiroWorking}
                    title={!isAdmin ? 'Solo administradores' : undefined}
                  >
                    {quickRetiroWorking ? 'Ejecutando retiro…' : 'Crear y ejecutar retiro'}
                  </Button>
                </div>

                <div className="mt-2 flex items-center justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setShowRetiroExtras((v) => !v)}
                  >
                    {showRetiroExtras ? 'Ocultar opciones' : 'Opciones adicionales'}
                  </Button>
                </div>
              </div>
            ) : null}

            {selectedTypeCode !== 'retiro' || showRetiroExtras ? (
              <div>
                <Label>Motivo (opcional)</Label>
                <select
                  className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={reasonId}
                  disabled={!typeId || loading}
                  onChange={(e) => setReasonId(e.target.value)}
                >
                  <option value="">—</option>
                  {filteredReasons.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          <div className="mt-4">
            {payloadMode !== 'none' ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Parámetros del tipo</div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">Campos guiados. No necesitas escribir JSON.</div>
                  </div>
                  {loadingPayloadCatalogs ? (
                    <div className="text-xs text-slate-500 dark:text-slate-400">Cargando…</div>
                  ) : null}
                </div>

                {(payloadMode === 'cambio_interno' || payloadMode === 'reingreso') ? (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Año lectivo</Label>
                      <select
                        className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        value={payloadAcademicYearId}
                        disabled={loadingPayloadCatalogs}
                        onChange={(e) => {
                          setPayloadAcademicYearId(e.target.value)
                          setPayloadGroupId('')
                        }}
                      >
                        <option value="">Selecciona…</option>
                        {years.map((y) => (
                          <option key={y.id} value={y.id}>
                            {y.year} ({y.status_display || y.status})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <Label>{payloadMode === 'reingreso' ? 'Grado (obligatorio)' : 'Grado (recomendado)'}</Label>
                      <select
                        className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        value={payloadGradeId}
                        disabled={loadingPayloadCatalogs}
                        onChange={(e) => {
                          setPayloadGradeId(e.target.value)
                          setPayloadGroupId('')
                        }}
                      >
                        <option value="">Selecciona…</option>
                        {grades.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <Label>{payloadMode === 'cambio_interno' ? 'Grupo destino (obligatorio)' : 'Grupo (opcional)'}</Label>
                      <select
                        className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        value={payloadGroupId}
                        disabled={loadingPayloadCatalogs || groups.length === 0}
                        onChange={(e) => setPayloadGroupId(e.target.value)}
                      >
                        <option value="">{groups.length ? 'Selecciona…' : 'Sin grupos para filtros actuales'}</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name} • {g.grade_name || g.grade} • {g.campus_name || 'Sede'}
                          </option>
                        ))}
                      </select>
                      <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">Tip: filtra por año y grado para ver menos grupos.</div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Vista previa (automática)</div>
                  <pre className="mt-1 whitespace-pre-wrap wrap-break-word rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
                    {JSON.stringify(computedPayload || {}, null, 2)}
                  </pre>
                </div>

                {isAdmin ? (
                  <div className="mt-4">
                    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={advancedPayloadEnabled}
                        onChange={(e) => {
                          const next = e.target.checked
                          setAdvancedPayloadEnabled(next)
                          if (next) setPayloadText(JSON.stringify(computedPayload || {}, null, 2))
                          if (!next) setPayloadText('')
                        }}
                      />
                      Editar JSON (avanzado)
                    </label>

                    {advancedPayloadEnabled ? (
                      <textarea
                        className="mt-2 w-full min-h-[140px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        placeholder='{"destination_group_id": 123}'
                        value={payloadText}
                        onChange={(e) => setPayloadText(e.target.value)}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onCancel} disabled={saving}>
              Cancelar
            </Button>
            {selectedTypeCode !== 'retiro' || showRetiroExtras ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => void submit({ fileImmediately: false })}
                  disabled={!canSubmit}
                >
                  {saving ? 'Guardando…' : 'Guardar borrador'}
                </Button>
                <Button
                  onClick={() => void submit({ fileImmediately: true })}
                  disabled={!canFile}
                  title={!institutionId ? (student ? 'Se inferirá la institución del estudiante' : 'Selecciona institución para radicar') : undefined}
                >
                  {saving ? 'Radicando…' : 'Crear y radicar'}
                </Button>
              </>
            ) : null}
          </div>

          {selectedTypeCode !== 'retiro' ? (
            <div className="mt-3 flex items-center justify-end">
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={sendToReviewAfterFile}
                  onChange={(e) => setSendToReviewAfterFile(e.target.checked)}
                />
                Al radicar, enviar a revisión automáticamente
              </label>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((t) => ({ ...t, isVisible: false }))}
      />
    </>
  )
}
