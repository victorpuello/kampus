import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

import { Button } from '../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card'
import { ConfirmationModal } from '../components/ui/ConfirmationModal'
import { Input } from '../components/ui/Input'
import ElectionCandidatesContraloria from './ElectionCandidatesContraloria'
import ElectionCandidatesPersoneria from './ElectionCandidatesPersoneria'
import ElectionRolesManage from './ElectionRolesManage'
import {
  electionsApi,
  type ElectionGovernanceConfig,
  type ElectionGovernanceParticipantOption,
  type ElectionEligibleStudentItem,
  type ElectionObserverCongratsSummary,
  getApiErrorMessage,
  type ElectionOpeningRecord,
  type ElectionProcessItem,
  type ElectionScrutinySummaryResponse,
  type ElectionTokenEligibilityIssueItem,
} from '../services/elections'
import { useAuthStore } from '../store/auth'

function localDatetimeToIso(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function isoToLocalDatetime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const timezoneOffset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16)
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

type MultiChoiceListProps = {
  options: ElectionGovernanceParticipantOption[]
  selectedValues: string[]
  onChange: (values: string[]) => void
  limit: number
  emptyMessage: string
}

function MultiChoiceList({ options, selectedValues, onChange, limit, emptyMessage }: MultiChoiceListProps) {
  const toggleValue = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((item) => item !== value))
      return
    }
    if (selectedValues.length >= limit) return
    onChange([...selectedValues, value])
  }

  if (options.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 sm:max-h-72 dark:border-slate-700 dark:bg-slate-950">
      {options.map((option) => {
        const checked = selectedValues.includes(option.key)
        const disabled = !checked && selectedValues.length >= limit
        return (
          <label
            key={option.key}
            className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm transition ${
              checked
                ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-100'
                : 'border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100'
            } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={checked}
              disabled={disabled}
              onChange={() => toggleValue(option.key)}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{option.full_name}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {option.document_number || 'Sin documento'}
                {option.subtitle ? ` · ${option.subtitle}` : ''}
              </span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

function parseGradeValue(rawGrade: string | null | undefined): number | null {
  const compact = normalizeText(rawGrade || '').replace(/\s+/g, '')
  if (!compact) return null

  const direct = Number(compact)
  if (Number.isInteger(direct)) return direct

  const prefixed = compact.match(/^(\d{1,2})/)
  if (prefixed) return Number(prefixed[1])

  if (compact.startsWith('decimo')) return 10
  if (compact.startsWith('once')) return 11
  if (compact.startsWith('undecimo')) return 11
  if (compact.startsWith('decimoprimero')) return 11
  return null
}

function normalizeGovernanceOption(option: ElectionGovernanceParticipantOption): ElectionGovernanceParticipantOption {
  const source = String(option.source || '').toUpperCase() as 'STUDENT' | 'TEACHER'
  const derivedGrade = option.grade_value ?? parseGradeValue(option.subtitle)
  const key = option.key || `${source}:${option.user_id}`
  return {
    ...option,
    key,
    source,
    grade_value: derivedGrade,
  }
}

function mapEligibleStudentToGovernanceOption(student: ElectionEligibleStudentItem): ElectionGovernanceParticipantOption {
  const gradeValue = parseGradeValue(student.grade)
  return {
    key: `STUDENT:${student.student_id}`,
    source: 'STUDENT',
    user_id: student.student_id,
    full_name: student.full_name,
    document_number: student.document_number,
    grade_value: gradeValue,
    subtitle: `Estudiante matriculado - ${student.grade || 'Sin grado'} ${student.group || ''}`.trim(),
  }
}

function uniqueOptionsByKey(options: ElectionGovernanceParticipantOption[]): ElectionGovernanceParticipantOption[] {
  const seen = new Set<string>()
  return options.filter((option) => {
    if (seen.has(option.key)) return false
    seen.add(option.key)
    return true
  })
}

type ProcessActionMenuProps = {
  item: ElectionProcessItem
  updatingProcessId: number | null
  deletingProcessId: number | null
  closingProcessId: number | null
  restartingProcessId: number | null
  compact?: boolean
  onStartEditProcess: (item: ElectionProcessItem) => void
  onOpenProcess: (processId: number) => void
  onRequestCloseProcess: (item: ElectionProcessItem) => void
  onRequestRestartProcess: (item: ElectionProcessItem) => void
  onRequestDeleteProcess: (item: ElectionProcessItem) => void
  onDownloadPersoneroActa: (processId: number) => void
  onDownloadContralorActa: (processId: number) => void
}

function ProcessActionMenu({
  item,
  updatingProcessId,
  deletingProcessId,
  closingProcessId,
  restartingProcessId,
  compact = false,
  onStartEditProcess,
  onOpenProcess,
  onRequestCloseProcess,
  onRequestRestartProcess,
  onRequestDeleteProcess,
  onDownloadPersoneroActa,
  onDownloadContralorActa,
}: ProcessActionMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null)
  const isClosed = item.status === 'CLOSED'
  const isOpen = item.status === 'OPEN'
  const canRestart = item.status !== 'DRAFT'
  const canDelete = item.can_delete
  const wrapperClassName = compact
    ? 'mt-3 flex flex-wrap items-center gap-2'
    : 'flex flex-wrap items-center gap-2'
  const menuAlignClassName = compact ? 'left-0' : 'right-0'

  const closeMenu = () => {
    const details = detailsRef.current
    if (!details?.open) return
    details.open = false
    const summary = details.querySelector('summary') as HTMLElement | null
    summary?.focus()
  }

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDetailsElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    closeMenu()
  }

  return (
    <div className={wrapperClassName}>
      <Button type="button" variant="outline" size="sm" disabled={updatingProcessId === item.id} onClick={() => onStartEditProcess(item)}>
        {updatingProcessId === item.id ? 'Actualizando...' : 'Editar'}
      </Button>

      {isOpen ? (
        <Button type="button" variant="secondary" size="sm" disabled={closingProcessId === item.id} onClick={() => onRequestCloseProcess(item)}>
          {closingProcessId === item.id ? 'Cerrando...' : 'Cerrar'}
        </Button>
      ) : (
        <Button type="button" variant="secondary" size="sm" disabled={isOpen} onClick={() => void onOpenProcess(item.id)}>
          {isOpen ? 'Abierta' : 'Abrir'}
        </Button>
      )}

      <details ref={detailsRef} className="relative" onKeyDown={onMenuKeyDown}>
        <summary className="flex h-9 cursor-pointer list-none items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-800">
          Acciones
        </summary>
        <div className={`absolute top-11 z-20 min-w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-950 ${menuAlignClassName}`}>
          <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Gestion de jornada
          </div>
          <div className="space-y-1 border-b border-slate-100 pb-2 dark:border-slate-800">
            {canRestart ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
                disabled={restartingProcessId === item.id}
                onClick={() => onRequestRestartProcess(item)}
              >
                {restartingProcessId === item.id ? 'Reiniciando...' : 'Reiniciar jornada'}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start"
              disabled={deletingProcessId === item.id || !canDelete}
              title={canDelete ? 'Eliminar jornada' : 'No se puede eliminar: la jornada ya tiene votos registrados.'}
              onClick={() => onRequestDeleteProcess(item)}
            >
              {deletingProcessId === item.id ? 'Eliminando...' : 'Eliminar jornada'}
            </Button>
          </div>
          <div className="px-2 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Descargas
          </div>
          <div className="space-y-1">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start"
              disabled={!isClosed}
              onClick={() => void onDownloadPersoneroActa(item.id)}
            >
              Descargar acta personero
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start"
              disabled={!isClosed}
              onClick={() => void onDownloadContralorActa(item.id)}
            >
              Descargar acta contralor
            </Button>
          </div>
        </div>
      </details>
    </div>
  )
}

export default function ElectionProcessesManage() {
  const user = useAuthStore((s) => s.user)
  const canManage = user?.role === 'SUPERADMIN' || user?.role === 'ADMIN'

  const [items, setItems] = useState<ElectionProcessItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [status] = useState<'DRAFT'>('DRAFT')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [governanceOptions, setGovernanceOptions] = useState<ElectionGovernanceParticipantOption[]>([])
  const [committeeOptions, setCommitteeOptions] = useState<ElectionGovernanceParticipantOption[]>([])
  const [witnessOptions, setWitnessOptions] = useState<ElectionGovernanceParticipantOption[]>([])
  const [committeeSelection, setCommitteeSelection] = useState<string[]>([])
  const [witnessSelection, setWitnessSelection] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'processes' | 'roles' | 'candidates'>('processes')
  const [candidatesTab, setCandidatesTab] = useState<'personeria' | 'contraloria'>('personeria')
  const [eligibilityProcessId, setEligibilityProcessId] = useState('')
  const [eligibilityIssues, setEligibilityIssues] = useState<ElectionTokenEligibilityIssueItem[]>([])
  const [eligibilityScannedCount, setEligibilityScannedCount] = useState(0)
  const [eligibilityLoading, setEligibilityLoading] = useState(false)
  const [eligibilityError, setEligibilityError] = useState<string | null>(null)
  const [eligibilityChecked, setEligibilityChecked] = useState(false)
  const [scrutinyProcessId, setScrutinyProcessId] = useState('')
  const [scrutinyLoading, setScrutinyLoading] = useState(false)
  const [scrutinyError, setScrutinyError] = useState<string | null>(null)
  const [openingRecord, setOpeningRecord] = useState<ElectionOpeningRecord | null>(null)
  const [scrutinySummary, setScrutinySummary] = useState<ElectionScrutinySummaryResponse | null>(null)
  const [deletingProcessId, setDeletingProcessId] = useState<number | null>(null)
  const [processToDelete, setProcessToDelete] = useState<ElectionProcessItem | null>(null)
  const [closingProcessId, setClosingProcessId] = useState<number | null>(null)
  const [processToClose, setProcessToClose] = useState<ElectionProcessItem | null>(null)
  const [restartingProcessId, setRestartingProcessId] = useState<number | null>(null)
  const [processToRestart, setProcessToRestart] = useState<ElectionProcessItem | null>(null)
  const [editingProcess, setEditingProcess] = useState<ElectionProcessItem | null>(null)
  const [editingStartsAt, setEditingStartsAt] = useState('')
  const [editingEndsAt, setEditingEndsAt] = useState('')
  const [editingCommitteeSelection, setEditingCommitteeSelection] = useState<string[]>([])
  const [editingWitnessSelection, setEditingWitnessSelection] = useState<string[]>([])
  const [updatingProcessId, setUpdatingProcessId] = useState<number | null>(null)
  const [closeSummaryByProcess, setCloseSummaryByProcess] = useState<Record<number, ElectionObserverCongratsSummary>>({})

  const loadItems = async () => {
    if (!canManage) return
    setLoading(true)
    setError(null)
    try {
      const response = await electionsApi.listProcesses()
      setItems(response.results)
      const persistedSummaries = response.results.reduce<Record<number, ElectionObserverCongratsSummary>>((accumulator, item) => {
        if (item.observer_congrats_summary) {
          accumulator[item.id] = item.observer_congrats_summary
        }
        return accumulator
      }, {})
      setCloseSummaryByProcess(persistedSummaries)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible cargar las jornadas electorales.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage])

  useEffect(() => {
    if (!canManage) return
    void (async () => {
      try {
        const [governanceResponse, eligibleResponse] = await Promise.allSettled([
          electionsApi.listGovernanceParticipants(undefined, 250),
          electionsApi.listEligibleStudents({ role_code: 'CONTRALOR', limit: 500 }),
        ])

        const teacherRows =
          governanceResponse.status === 'fulfilled'
            ? uniqueOptionsByKey(((governanceResponse.value.results.teachers || []).map(normalizeGovernanceOption)))
            : []

        const witnessRows =
          eligibleResponse.status === 'fulfilled'
            ? uniqueOptionsByKey(
                (eligibleResponse.value.results || [])
                  .map(mapEligibleStudentToGovernanceOption)
                  .filter((option) => option.grade_value === 10 || option.grade_value === 11),
              )
            : []

        setCommitteeOptions(teacherRows)
        setWitnessOptions(witnessRows)
        setGovernanceOptions([...teacherRows, ...witnessRows])

        if (teacherRows.length === 0 && witnessRows.length === 0) {
          setError('No fue posible cargar docentes y estudiantes elegibles para comité/testigos.')
        }
      } catch {
        setGovernanceOptions([])
        setCommitteeOptions([])
        setWitnessOptions([])
        setError('No fue posible cargar docentes y estudiantes elegibles para comité/testigos.')
      }
    })()
  }, [canManage])

  const optionKeyFromParticipant = (participant: { source: 'STUDENT' | 'TEACHER'; user_id: number } | undefined): string => {
    if (!participant) return ''
    return `${participant.source}:${participant.user_id}`
  }

  const participantFromOptionKey = (value: string): ElectionGovernanceParticipantOption | null => {
    if (!value) return null
    return governanceOptions.find((option) => option.key === value) || null
  }

  const buildGovernanceConfig = (slots: {
    committee: string[]
    witnesses: string[]
  }): ElectionGovernanceConfig => {
    const committeeMembers = slots.committee
      .map(participantFromOptionKey)
      .filter((item): item is ElectionGovernanceParticipantOption => item !== null)
      .slice(0, 3)
      .map((item) => ({
        source: item.source,
        user_id: item.user_id,
        full_name: item.full_name,
        document_number: item.document_number,
      }))

    const studentWitnesses = slots.witnesses
      .map(participantFromOptionKey)
      .filter((item): item is ElectionGovernanceParticipantOption => item !== null)
      .slice(0, 2)
      .map((item) => ({
        source: item.source,
        user_id: item.user_id,
        full_name: item.full_name,
        document_number: item.document_number,
      }))

    return {
      committee_members: committeeMembers,
      student_witnesses: studentWitnesses,
    }
  }

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canManage) return

    const normalizedName = name.trim()
    if (!normalizedName) {
      setError('Debes ingresar el nombre de la jornada.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const payload = {
        name: normalizedName,
        status,
        starts_at: localDatetimeToIso(startsAt),
        ends_at: localDatetimeToIso(endsAt),
        governance_config: buildGovernanceConfig({
          committee: committeeSelection,
          witnesses: witnessSelection,
        }),
      }
      await electionsApi.createProcess(payload)
      setName('')
      setStartsAt('')
      setEndsAt('')
      setCommitteeSelection([])
      setWitnessSelection([])
      setSuccess('Jornada electoral creada correctamente.')
      await loadItems()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible crear la jornada electoral.'))
    } finally {
      setSaving(false)
    }
  }

  const onOpenProcess = async (processId: number) => {
    if (!canManage) return
    setError(null)
    setSuccess(null)
    try {
      await electionsApi.openProcess(processId)
      setSuccess('Jornada electoral abierta correctamente.')
      await loadItems()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible abrir la jornada electoral.'))
    }
  }

  const onCloseProcess = async (processId: number) => {
    if (!canManage) return

    setClosingProcessId(processId)

    setError(null)
    setSuccess(null)
    try {
      const response = await electionsApi.closeProcess(processId)
      const closedProcessName = response.name
      if (response.observer_congrats_summary) {
        setCloseSummaryByProcess((prev) => ({
          ...prev,
          [processId]: response.observer_congrats_summary as ElectionObserverCongratsSummary,
        }))
      }

      const generatedCount =
        (response.observer_congrats_summary?.winner_annotations_created || 0) +
        (response.observer_congrats_summary?.participant_annotations_created || 0)
      const closeSuccessMessage =
        response.observer_congrats_generated && generatedCount > 0
          ? `Jornada electoral cerrada correctamente. Felicitaciones generadas: ${generatedCount}.`
          : 'Jornada electoral cerrada correctamente. No se generaron nuevas felicitaciones en este cierre.'

      let actaDownloaded = false
      try {
        const actaBlob = await electionsApi.downloadPersoneroActaPdf(processId)
        downloadBlobFile(actaBlob, `acta_personero_${processId}.pdf`)
        actaDownloaded = true
      } catch {
        actaDownloaded = false
      }

      if (response.observer_congrats_generated && generatedCount > 0) {
        setSuccess(actaDownloaded ? `${closeSuccessMessage} Acta de personero descargada.` : `${closeSuccessMessage} La jornada se cerro, pero no se pudo descargar el acta de personero automaticamente.`)
      } else {
        setSuccess(actaDownloaded ? `${closeSuccessMessage} Acta de personero descargada.` : `${closeSuccessMessage} La jornada se cerro, pero no se pudo descargar el acta de personero automaticamente.`)
      }
      setProcessToClose(null)
      await loadItems()
      if (!actaDownloaded && closedProcessName) {
        setError(`Puedes descargar el acta manualmente desde la fila de la jornada "${closedProcessName}".`)
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible cerrar la jornada electoral.'))
    } finally {
      setClosingProcessId(null)
    }
  }

  const onRequestCloseProcess = (processItem: ElectionProcessItem) => {
    setProcessToClose(processItem)
  }

  const onRequestRestartProcess = (processItem: ElectionProcessItem) => {
    setProcessToRestart(processItem)
  }

  const onRequestDeleteProcess = (processItem: ElectionProcessItem) => {
    setProcessToDelete(processItem)
  }

  const onStartEditProcess = (processItem: ElectionProcessItem) => {
    setEditingProcess(processItem)
    setEditingStartsAt(isoToLocalDatetime(processItem.starts_at))
    setEditingEndsAt(isoToLocalDatetime(processItem.ends_at))
    setEditingCommitteeSelection((processItem.governance_config?.committee_members || []).map((item) => optionKeyFromParticipant(item)).filter(Boolean))
    setEditingWitnessSelection((processItem.governance_config?.student_witnesses || []).map((item) => optionKeyFromParticipant(item)).filter(Boolean))
    setError(null)
    setSuccess(null)
  }

  const onCancelEditProcess = () => {
    if (updatingProcessId) return
    setEditingProcess(null)
    setEditingStartsAt('')
    setEditingEndsAt('')
    setEditingCommitteeSelection([])
    setEditingWitnessSelection([])
  }

  const onSubmitEditProcess = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editingProcess) return

    setUpdatingProcessId(editingProcess.id)
    setError(null)
    setSuccess(null)

    try {
      await electionsApi.updateProcess(editingProcess.id, {
        starts_at: localDatetimeToIso(editingStartsAt),
        ends_at: localDatetimeToIso(editingEndsAt),
        governance_config: buildGovernanceConfig({
          committee: editingCommitteeSelection,
          witnesses: editingWitnessSelection,
        }),
      })
      setSuccess('Fechas de la jornada actualizadas correctamente.')
      setEditingProcess(null)
      setEditingStartsAt('')
      setEditingEndsAt('')
      setEditingCommitteeSelection([])
      setEditingWitnessSelection([])
      await loadItems()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible actualizar las fechas de la jornada.'))
    } finally {
      setUpdatingProcessId(null)
    }
  }

  const onConfirmDeleteProcess = async () => {
    if (!processToDelete) return

    setDeletingProcessId(processToDelete.id)
    setError(null)
    setSuccess(null)
    try {
      await electionsApi.deleteProcess(processToDelete.id)
      setSuccess('Jornada electoral eliminada correctamente.')
      setProcessToDelete(null)
      await loadItems()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible eliminar la jornada electoral.'))
    } finally {
      setDeletingProcessId(null)
    }
  }

  const onConfirmRestartProcess = async () => {
    if (!processToRestart) return

    setRestartingProcessId(processToRestart.id)
    setError(null)
    setSuccess(null)
    try {
      await electionsApi.restartProcess(processToRestart.id)
      setSuccess('Jornada electoral reiniciada correctamente. Se limpiaron votos, se reactivaron tokens y se retiraron felicitaciones automáticas del observador.')
      setProcessToRestart(null)
      await loadItems()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible reiniciar la jornada electoral.'))
    } finally {
      setRestartingProcessId(null)
    }
  }

  const onRunEligibilityValidation = async () => {
    if (!canManage) return
    setEligibilityLoading(true)
    setEligibilityError(null)
    setEligibilityChecked(false)

    try {
      const processId = eligibilityProcessId ? Number(eligibilityProcessId) : undefined
      const response = await electionsApi.listTokenEligibilityIssues(processId, 200)
      setEligibilityIssues(response.results)
      setEligibilityScannedCount(response.scanned_count)
      setEligibilityChecked(true)
    } catch (requestError) {
      setEligibilityError(getApiErrorMessage(requestError, 'No fue posible ejecutar la prevalidación de censo.'))
      setEligibilityIssues([])
      setEligibilityScannedCount(0)
    } finally {
      setEligibilityLoading(false)
    }
  }

  const onExportEligibilityCsv = () => {
    if (eligibilityIssues.length === 0) return

    const headers = ['token', 'estado', 'grado', 'jornada', 'error', 'proceso_id', 'proceso_nombre']
    const escapeCsv = (value: string) => `"${value.replaceAll('"', '""')}"`

    const rows = eligibilityIssues.map((issue) => [
      issue.token_prefix || String(issue.token_id),
      issue.status || '',
      issue.student_grade || '',
      issue.student_shift || '',
      issue.error || '',
      String(issue.process_id),
      issue.process_name || '',
    ])

    const csv = [headers, ...rows].map((row) => row.map((cell) => escapeCsv(String(cell ?? ''))).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
    link.href = url
    link.download = `prevalidacion_censo_${timestamp}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const onLoadScrutiny = async () => {
    if (!canManage) return

    const processId = Number(scrutinyProcessId)
    if (!Number.isFinite(processId) || processId <= 0) {
      setScrutinyError('Debes seleccionar una jornada para consultar apertura y escrutinio.')
      return
    }

    setScrutinyLoading(true)
    setScrutinyError(null)
    try {
      const [opening, summary] = await Promise.all([
        electionsApi.getProcessOpeningRecord(processId),
        electionsApi.getProcessScrutinySummary(processId),
      ])
      setOpeningRecord(opening)
      setScrutinySummary(summary)
    } catch (requestError) {
      setScrutinyError(getApiErrorMessage(requestError, 'No fue posible consultar apertura en cero y escrutinio.'))
      setOpeningRecord(null)
      setScrutinySummary(null)
    } finally {
      setScrutinyLoading(false)
    }
  }

  const downloadBlobFile = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const onExportScrutinyCsv = async () => {
    const processId = Number(scrutinyProcessId)
    if (!Number.isFinite(processId) || processId <= 0) {
      setScrutinyError('Debes seleccionar una jornada para exportar acta CSV.')
      return
    }

    try {
      const blob = await electionsApi.downloadScrutinyCsv(processId)
      downloadBlobFile(blob, `acta_escrutinio_${processId}.csv`)
    } catch (requestError) {
      setScrutinyError(getApiErrorMessage(requestError, 'No fue posible exportar el acta CSV de escrutinio.'))
    }
  }

  const onExportScrutinyXlsx = async () => {
    const processId = Number(scrutinyProcessId)
    if (!Number.isFinite(processId) || processId <= 0) {
      setScrutinyError('Debes seleccionar una jornada para exportar acta Excel.')
      return
    }

    try {
      const blob = await electionsApi.downloadScrutinyXlsx(processId)
      downloadBlobFile(blob, `acta_escrutinio_${processId}.xlsx`)
    } catch (requestError) {
      setScrutinyError(getApiErrorMessage(requestError, 'No fue posible exportar el acta Excel de escrutinio.'))
    }
  }

  const onExportScrutinyPdf = async () => {
    const processId = Number(scrutinyProcessId)
    if (!Number.isFinite(processId) || processId <= 0) {
      setScrutinyError('Debes seleccionar una jornada para exportar acta PDF.')
      return
    }

    try {
      const blob = await electionsApi.downloadScrutinyPdf(processId)
      downloadBlobFile(blob, `acta_escrutinio_${processId}.pdf`)
    } catch (requestError) {
      setScrutinyError(getApiErrorMessage(requestError, 'No fue posible exportar el acta PDF de escrutinio.'))
    }
  }

  const onDownloadPersoneroActa = async (processId: number) => {
    try {
      const blob = await electionsApi.downloadPersoneroActaPdf(processId)
      downloadBlobFile(blob, `acta_personero_${processId}.pdf`)
    } catch (requestError) {
      setScrutinyError(getApiErrorMessage(requestError, 'No fue posible descargar el acta PDF de eleccion de personero.'))
    }
  }

  const onDownloadContralorActa = async (processId: number) => {
    try {
      const blob = await electionsApi.downloadContralorActaPdf(processId)
      downloadBlobFile(blob, `acta_contralor_${processId}.pdf`)
    } catch (requestError) {
      setScrutinyError(getApiErrorMessage(requestError, 'No fue posible descargar el acta PDF de eleccion de contralor.'))
    }
  }

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sin permisos</CardTitle>
          <CardDescription>Solo superadmin y administrador pueden gestionar Gobierno Escolar.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-linear-to-br from-slate-50 via-white to-blue-50/60 p-4 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/80 sm:p-5 lg:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-700 dark:text-blue-300">Gobierno Escolar</p>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-2xl">Procesos electorales</h1>
            <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-300">Administra jornadas, comité, testigos, prevalidación de censo y escrutinio.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-left dark:border-slate-700 dark:bg-slate-950/70">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Jornadas</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{items.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-left dark:border-slate-700 dark:bg-slate-950/70">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Testigos</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{witnessOptions.length}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="overflow-x-auto pb-1">
        <div className="inline-flex min-w-full gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80 sm:min-w-0" role="tablist" aria-label="Secciones de Gobierno Escolar">
        <button
          type="button"
          onClick={() => setActiveTab('processes')}
          id="gobierno-tab-jornadas"
          role="tab"
          aria-selected={activeTab === 'processes'}
          aria-controls="gobierno-panel-jornadas"
          tabIndex={activeTab === 'processes' ? 0 : -1}
          className={`min-h-11 min-w-34 flex-1 rounded-lg px-3 py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 ${
            activeTab === 'processes'
              ? 'bg-white text-blue-700 shadow dark:bg-slate-900 dark:text-blue-300'
              : 'text-slate-600 hover:bg-white/12 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-slate-100'
          }`}
        >
          Jornadas
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('roles')}
          id="gobierno-tab-cargos"
          role="tab"
          aria-selected={activeTab === 'roles'}
          aria-controls="gobierno-panel-cargos"
          tabIndex={activeTab === 'roles' ? 0 : -1}
          className={`min-h-11 min-w-34 flex-1 rounded-lg px-3 py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 ${
            activeTab === 'roles'
              ? 'bg-white text-blue-700 shadow dark:bg-slate-900 dark:text-blue-300'
              : 'text-slate-600 hover:bg-white/12 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-slate-100'
          }`}
        >
          Cargos
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('candidates')}
          id="gobierno-tab-candidatos"
          role="tab"
          aria-selected={activeTab === 'candidates'}
          aria-controls="gobierno-panel-candidatos"
          tabIndex={activeTab === 'candidates' ? 0 : -1}
          className={`min-h-11 min-w-34 flex-1 rounded-lg px-3 py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 ${
            activeTab === 'candidates'
              ? 'bg-white text-blue-700 shadow dark:bg-slate-900 dark:text-blue-300'
              : 'text-slate-600 hover:bg-white/12 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-slate-100'
          }`}
        >
          Candidatos
        </button>
        </div>
      </div>

      {activeTab === 'processes' ? (
        <div id="gobierno-panel-jornadas" role="tabpanel" aria-labelledby="gobierno-tab-jornadas" className="space-y-6">
          <Card>
            <CardHeader className="p-4 sm:p-5 lg:p-6">
              <CardTitle className="text-xl sm:text-2xl">Jornadas electorales</CardTitle>
              <CardDescription>Crea o abre la jornada en Election Processes.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0 lg:p-6 lg:pt-0">
              <form className="grid gap-4 xl:grid-cols-2" onSubmit={onCreate}>
                <div className="space-y-1 xl:col-span-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Nombre de la jornada</label>
                  <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: Jornada electoral 2026" />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Estado inicial</label>
                  <select
                    value={status}
                    disabled
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="DRAFT">Borrador</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Inicio (opcional)</label>
                  <Input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
                </div>

                <div className="space-y-1 xl:col-span-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Fin (opcional)</label>
                  <Input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
                </div>

                <div className="space-y-1 xl:col-span-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Integrantes Comité de Democracia (solo docentes, máximo 3)</label>
                  <MultiChoiceList
                    options={committeeOptions}
                    selectedValues={committeeSelection}
                    onChange={setCommitteeSelection}
                    limit={3}
                    emptyMessage="No hay docentes activos disponibles para comité."
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Mantén presionado Ctrl/Cmd para seleccionar múltiples opciones. Disponibles: {committeeOptions.length}.</p>
                </div>

                <div className="space-y-1 xl:col-span-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Testigos (solo estudiantes de grado 10 y 11, máximo 2)</label>
                  <MultiChoiceList
                    options={witnessOptions}
                    selectedValues={witnessSelection}
                    onChange={setWitnessSelection}
                    limit={2}
                    emptyMessage="No hay estudiantes de grado 10 u 11 disponibles para testigos."
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Mantén presionado Ctrl/Cmd para seleccionar múltiples opciones. Disponibles: {witnessOptions.length}.</p>
                </div>

                <div className="xl:col-span-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Seleccionados: comité {committeeSelection.length}/3 · testigos {witnessSelection.length}/2</p>
                  <Button type="submit" className="w-full sm:w-auto" disabled={saving}>{saving ? 'Guardando...' : 'Crear jornada'}</Button>
                </div>
              </form>

              {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p> : null}
              {success ? <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-300">{success}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 sm:p-5 lg:p-6">
              <CardTitle className="text-xl sm:text-2xl">Listado de jornadas</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0 lg:p-6 lg:pt-0">
              {loading ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">Cargando jornadas...</p>
              ) : (
                <>
                  <div className="space-y-3 lg:hidden">
                    {items.map((item) => (
                      <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/60 sm:p-4">
                        {closeSummaryByProcess[item.id] ? (
                          <p className="mb-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
                            Felicitaciones generadas: {(closeSummaryByProcess[item.id].winner_annotations_created || 0) + (closeSummaryByProcess[item.id].participant_annotations_created || 0)}
                          </p>
                        ) : null}
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-slate-800 dark:text-slate-100">{item.name}</p>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {item.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Inicio: {item.starts_at ? new Date(item.starts_at).toLocaleString() : '—'}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Fin: {item.ends_at ? new Date(item.ends_at).toLocaleString() : '—'}</p>
                        {item.votes_count > 0 ? (
                          <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">Con votos ({item.votes_count})</p>
                        ) : null}
                        <ProcessActionMenu
                          item={item}
                          compact
                          updatingProcessId={updatingProcessId}
                          deletingProcessId={deletingProcessId}
                          closingProcessId={closingProcessId}
                          restartingProcessId={restartingProcessId}
                          onStartEditProcess={onStartEditProcess}
                          onOpenProcess={onOpenProcess}
                          onRequestCloseProcess={onRequestCloseProcess}
                          onRequestRestartProcess={onRequestRestartProcess}
                          onRequestDeleteProcess={onRequestDeleteProcess}
                          onDownloadPersoneroActa={onDownloadPersoneroActa}
                          onDownloadContralorActa={onDownloadContralorActa}
                        />
                      </article>
                    ))}
                  </div>

                  <div className="hidden rounded-lg border border-slate-200 dark:border-slate-700 lg:block">
                    <div className="overflow-x-auto overflow-y-visible">
                    <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-900/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Nombre</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Estado</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Inicio</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Fin</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.name}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{item.status}</span>
                              {closeSummaryByProcess[item.id] ? (
                                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                  Felicitaciones generadas
                                </span>
                              ) : null}
                              {item.votes_count > 0 ? (
                                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                  Con votos ({item.votes_count})
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.starts_at ? new Date(item.starts_at).toLocaleString() : '—'}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.ends_at ? new Date(item.ends_at).toLocaleString() : '—'}</td>
                          <td className="px-3 py-2">
                            <ProcessActionMenu
                              item={item}
                              updatingProcessId={updatingProcessId}
                              deletingProcessId={deletingProcessId}
                              closingProcessId={closingProcessId}
                              restartingProcessId={restartingProcessId}
                              onStartEditProcess={onStartEditProcess}
                              onOpenProcess={onOpenProcess}
                              onRequestCloseProcess={onRequestCloseProcess}
                              onRequestRestartProcess={onRequestRestartProcess}
                              onRequestDeleteProcess={onRequestDeleteProcess}
                              onDownloadPersoneroActa={onDownloadPersoneroActa}
                              onDownloadContralorActa={onDownloadContralorActa}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {editingProcess ? (
            <Card>
              <CardHeader className="p-4 sm:p-5 lg:p-6">
                <CardTitle className="text-xl sm:text-2xl">Editar fechas de jornada</CardTitle>
                <CardDescription>
                  Jornada: <span className="font-semibold">{editingProcess.name}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0 lg:p-6 lg:pt-0">
                <form className="grid gap-4 xl:grid-cols-2" onSubmit={onSubmitEditProcess}>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Inicio (opcional)</label>
                    <Input type="datetime-local" value={editingStartsAt} onChange={(event) => setEditingStartsAt(event.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Fin (opcional)</label>
                    <Input type="datetime-local" value={editingEndsAt} onChange={(event) => setEditingEndsAt(event.target.value)} />
                  </div>

                  <div className="space-y-1 xl:col-span-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Integrantes Comité de Democracia (solo docentes, máximo 3)</label>
                    <MultiChoiceList
                      options={committeeOptions}
                      selectedValues={editingCommitteeSelection}
                      onChange={setEditingCommitteeSelection}
                      limit={3}
                      emptyMessage="No hay docentes activos disponibles para comité."
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">Mantén presionado Ctrl/Cmd para seleccionar múltiples opciones. Disponibles: {committeeOptions.length}.</p>
                  </div>

                  <div className="space-y-1 xl:col-span-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Testigos (solo estudiantes de grado 10 y 11, máximo 2)</label>
                    <MultiChoiceList
                      options={witnessOptions}
                      selectedValues={editingWitnessSelection}
                      onChange={setEditingWitnessSelection}
                      limit={2}
                      emptyMessage="No hay estudiantes de grado 10 u 11 disponibles para testigos."
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">Mantén presionado Ctrl/Cmd para seleccionar múltiples opciones. Disponibles: {witnessOptions.length}.</p>
                  </div>

                  <div className="xl:col-span-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Seleccionados: comité {editingCommitteeSelection.length}/3 · testigos {editingWitnessSelection.length}/2</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="submit" className="w-full sm:w-auto" disabled={updatingProcessId === editingProcess.id}>
                      {updatingProcessId === editingProcess.id ? 'Guardando...' : 'Guardar cambios'}
                    </Button>
                    <Button type="button" className="w-full sm:w-auto" variant="outline" onClick={onCancelEditProcess} disabled={updatingProcessId === editingProcess.id}>
                      Cancelar
                    </Button>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="p-4 sm:p-5 lg:p-6">
              <CardTitle className="text-xl sm:text-2xl">Prevalidación de censo</CardTitle>
              <CardDescription>
                Revisa tokens no elegibles antes de abrir jornada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0 lg:p-6 lg:pt-0">
              <div className="grid gap-3 xl:grid-cols-3">
                <div className="space-y-1 xl:col-span-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Jornada (opcional)</label>
                  <select
                    value={eligibilityProcessId}
                    onChange={(event) => setEligibilityProcessId(event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="">Todas las jornadas</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <Button className="w-full sm:w-auto" type="button" disabled={eligibilityLoading} onClick={() => void onRunEligibilityValidation()}>
                    {eligibilityLoading ? 'Validando...' : 'Validar elegibilidad'}
                  </Button>
                </div>
              </div>

              {eligibilityError ? <p className="text-sm text-red-600 dark:text-red-300">{eligibilityError}</p> : null}

              {eligibilityChecked ? (
                <div className="space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Tokens revisados: <span className="font-semibold">{eligibilityScannedCount}</span> · Incidencias: <span className="font-semibold">{eligibilityIssues.length}</span>
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={eligibilityIssues.length === 0}
                      onClick={onExportEligibilityCsv}
                    >
                      Exportar CSV de incidencias
                    </Button>
                  </div>

                  {eligibilityIssues.length === 0 ? (
                    <p className="text-sm text-emerald-600 dark:text-emerald-300">No se encontraron incidencias de elegibilidad en el censo.</p>
                  ) : (
                    <>
                      <div className="space-y-3 lg:hidden">
                        {eligibilityIssues.map((issue) => (
                          <article key={issue.token_id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900/60">
                            <p className="font-semibold text-slate-800 dark:text-slate-100">{issue.token_prefix || `#${issue.token_id}`}</p>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Estado: {issue.status} · Grado: {issue.student_grade || '—'}</p>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Jornada: {issue.student_shift || '—'}</p>
                            <p className="mt-2 text-red-700 dark:text-red-300">{issue.error}</p>
                          </article>
                        ))}
                      </div>

                      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 lg:block">
                        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                        <thead className="bg-slate-50 dark:bg-slate-900/50">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Token</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Estado</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Grado</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Jornada</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Error</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                          {eligibilityIssues.map((issue) => (
                            <tr key={issue.token_id}>
                              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{issue.token_prefix || `#${issue.token_id}`}</td>
                              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{issue.status}</td>
                              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{issue.student_grade || '—'}</td>
                              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{issue.student_shift || '—'}</td>
                              <td className="px-3 py-2 text-red-700 dark:text-red-300">{issue.error}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 sm:p-5 lg:p-6">
              <CardTitle className="text-xl sm:text-2xl">Apertura en cero y escrutinio</CardTitle>
              <CardDescription>
                Consulta evidencia de apertura y resumen de votación por cargo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0 lg:p-6 lg:pt-0">
              <div className="grid gap-3 xl:grid-cols-3">
                <div className="space-y-1 xl:col-span-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Jornada</label>
                  <select
                    value={scrutinyProcessId}
                    onChange={(event) => setScrutinyProcessId(event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="">Selecciona una jornada</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <Button className="w-full sm:w-auto" type="button" disabled={scrutinyLoading} onClick={() => void onLoadScrutiny()}>
                    {scrutinyLoading ? 'Consultando...' : 'Consultar'}
                  </Button>
                </div>
              </div>

              {scrutinyError ? <p className="text-sm text-red-600 dark:text-red-300">{scrutinyError}</p> : null}

              {openingRecord ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-200">
                  <p>
                    Apertura certificada por <span className="font-semibold">{openingRecord.opened_by_name || 'Sistema'}</span> ·{' '}
                    {new Date(openingRecord.opened_at).toLocaleString()} · votos al abrir: <span className="font-semibold">{openingRecord.votes_count_at_open}</span>
                  </p>
                </div>
              ) : null}

              {scrutinySummary ? (
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950/40 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-slate-700 dark:text-slate-200">
                      Total votos: <span className="font-semibold">{scrutinySummary.summary.total_votes}</span> · Votos en blanco:{' '}
                      <span className="font-semibold">{scrutinySummary.summary.total_blank_votes}</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={() => void onExportScrutinyCsv()}>
                        Exportar CSV
                      </Button>
                      <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={() => void onExportScrutinyPdf()}>
                        Exportar PDF
                      </Button>
                      <Button
                        className="w-full sm:w-auto"
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          const processId = Number(scrutinyProcessId)
                          if (!Number.isFinite(processId) || processId <= 0) {
                            setScrutinyError('Debes seleccionar una jornada para descargar el acta de personero.')
                            return
                          }
                          void onDownloadPersoneroActa(processId)
                        }}
                      >
                        Acta personero PDF
                      </Button>
                      <Button
                        className="w-full sm:w-auto"
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          const processId = Number(scrutinyProcessId)
                          if (!Number.isFinite(processId) || processId <= 0) {
                            setScrutinyError('Debes seleccionar una jornada para descargar el acta de contralor.')
                            return
                          }
                          void onDownloadContralorActa(processId)
                        }}
                      >
                        Acta contralor PDF
                      </Button>
                      <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={() => void onExportScrutinyXlsx()}>
                        Exportar Excel
                      </Button>
                    </div>
                  </div>

                  {scrutinySummary.roles.map((role) => (
                    <div key={role.role_id} className="rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
                        {role.title} ({role.code}) · Total: {role.total_votes} · Blanco: {role.blank_votes}
                      </div>
                      <div className="space-y-2 p-3 lg:hidden">
                        {role.candidates.length === 0 ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400">Sin votos registrados para candidaturas en este cargo.</p>
                        ) : (
                          role.candidates.map((candidate) => (
                            <article key={candidate.candidate_id} className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/60">
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">#{candidate.number} · {candidate.name}</p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Votos: {candidate.votes}</p>
                            </article>
                          ))
                        )}
                      </div>
                      <div className="hidden overflow-x-auto lg:block">
                        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                          <thead className="bg-white dark:bg-slate-950/40">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Número</th>
                              <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Candidato</th>
                              <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Votos</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                            {role.candidates.length === 0 ? (
                              <tr>
                                <td colSpan={3} className="px-3 py-2 text-slate-500 dark:text-slate-400">Sin votos registrados para candidaturas en este cargo.</td>
                              </tr>
                            ) : (
                              role.candidates.map((candidate) => (
                                <tr key={candidate.candidate_id}>
                                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{candidate.number}</td>
                                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{candidate.name}</td>
                                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{candidate.votes}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === 'roles' ? (
        <div id="gobierno-panel-cargos" role="tabpanel" aria-labelledby="gobierno-tab-cargos">
          <ElectionRolesManage />
        </div>
      ) : null}

      {activeTab === 'candidates' ? (
        <div id="gobierno-panel-candidatos" role="tabpanel" aria-labelledby="gobierno-tab-candidatos" className="space-y-6">
          <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-950/60 sm:flex-row">
            <button
              type="button"
              onClick={() => setCandidatesTab('personeria')}
              className={`min-h-10 rounded-md px-3 text-sm font-medium ${
                candidatesTab === 'personeria'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              Personería
            </button>
            <button
              type="button"
              onClick={() => setCandidatesTab('contraloria')}
              className={`min-h-10 rounded-md px-3 text-sm font-medium ${
                candidatesTab === 'contraloria'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              Contraloría
            </button>
          </div>

          {candidatesTab === 'personeria' ? <ElectionCandidatesPersoneria /> : <ElectionCandidatesContraloria />}
        </div>
      ) : null}

      <ConfirmationModal
        isOpen={Boolean(processToDelete)}
        onClose={() => {
          if (!deletingProcessId) {
            setProcessToDelete(null)
          }
        }}
        onConfirm={() => void onConfirmDeleteProcess()}
        title="Eliminar jornada electoral"
        description={
          processToDelete
            ? `¿Estás seguro de eliminar la jornada ${processToDelete.name}? Esta acción no se puede deshacer.`
            : '¿Estás seguro de eliminar esta jornada?'
        }
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="destructive"
        loading={deletingProcessId !== null}
      />

      <ConfirmationModal
        isOpen={Boolean(processToClose)}
        onClose={() => {
          if (!closingProcessId) {
            setProcessToClose(null)
          }
        }}
        onConfirm={() => {
          if (processToClose) {
            void onCloseProcess(processToClose.id)
          }
        }}
        title="Cerrar jornada electoral"
        description={
          processToClose
            ? `¿Cerrar la jornada ${processToClose.name}? Esto generará felicitaciones automáticas en el observador para ganadores y candidatos activos.`
            : '¿Cerrar esta jornada electoral?'
        }
        confirmText="Cerrar jornada"
        cancelText="Cancelar"
        variant="destructive"
        loading={closingProcessId !== null}
      />

      <ConfirmationModal
        isOpen={Boolean(processToRestart)}
        onClose={() => {
          if (!restartingProcessId) {
            setProcessToRestart(null)
          }
        }}
        onConfirm={() => void onConfirmRestartProcess()}
        title="Reiniciar jornada electoral"
        description={
          processToRestart
            ? `¿Reiniciar la jornada ${processToRestart.name}? Esta acción eliminará votos registrados y reactivará todos los tokens de votación.`
            : '¿Reiniciar esta jornada electoral?'
        }
        confirmText="Reiniciar jornada"
        cancelText="Cancelar"
        variant="destructive"
        loading={restartingProcessId !== null}
      />
    </div>
  )
}
