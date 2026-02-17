import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { Toast, type ToastType } from '../components/ui/Toast'
import { Modal } from '../components/ui/Modal'
import { ConfirmationModal } from '../components/ui/ConfirmationModal'
import { useAuthStore } from '../store/auth'
import {
  disciplineApi,
  type ConvivenciaManual,
  type DisciplineCaseDetail,
  type DisciplineCaseEvent,
  type DisciplineDecisionSuggestion,
} from '../services/discipline'
import { studentsApi, type Student } from '../services/students'

const canAccess = (role?: string) =>
  role === 'TEACHER' || role === 'COORDINATOR' || role === 'ADMIN' || role === 'SUPERADMIN' || role === 'PARENT'

const getErrorDetail = (err: unknown): string | undefined => {
  if (typeof err !== 'object' || err === null) return undefined

  const maybe = err as { response?: { data?: { detail?: unknown } } }
  const detail = maybe.response?.data?.detail
  return typeof detail === 'string' ? detail : undefined
}

const statusLabel = (s: string) => {
  switch (s) {
    case 'OPEN':
      return 'Abierto'
    case 'DECIDED':
      return 'Decidido'
    case 'CLOSED':
      return 'Cerrado'
    default:
      return s
  }
}

const manualSeverityLabel = (s: string) => {
  switch (s) {
    case 'MINOR':
      return 'Leve'
    case 'MAJOR':
      return 'Grave'
    case 'VERY_MAJOR':
      return 'Gravísima'
    default:
      return s
  }
}

const law1620Label = (s: string) => {
  switch (s) {
    case 'I':
      return 'Tipo I'
    case 'II':
      return 'Tipo II'
    case 'III':
      return 'Tipo III'
    case 'UNKNOWN':
      return 'Sin clasificar'
    default:
      return s
  }
}

const attachmentKindLabel = (k: string) => {
  switch (k) {
    case 'EVIDENCE':
      return 'Evidencia'
    case 'DESCARGOS':
      return 'Descargos'
    case 'NOTIFICATION':
      return 'Notificación'
    case 'OTHER':
      return 'Otro'
    default:
      return k
  }
}

const getFileNameFromUrl = (url: string): string => {
  if (!url) return 'Archivo'
  try {
    const resolved = new URL(url, window.location.origin)
    const parts = resolved.pathname.split('/').filter(Boolean)
    const raw = parts[parts.length - 1] || ''
    const decoded = decodeURIComponent(raw)
    return decoded || 'Archivo'
  } catch {
    const parts = url.split('?')[0].split('#')[0].split('/').filter(Boolean)
    return parts[parts.length - 1] || 'Archivo'
  }
}

const getFileTypeBadge = (url: string): { label: string; className: string } => {
  const fileName = getFileNameFromUrl(url).toLowerCase()
  const ext = fileName.includes('.') ? fileName.split('.').pop() || '' : ''

  const base = 'inline-flex items-center justify-center rounded-md border px-2 py-1 text-[10px] font-bold tracking-wide '

  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext)) {
    return { label: 'IMG', className: base + 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-200' }
  }
  if (ext === 'pdf') {
    return { label: 'PDF', className: base + 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200' }
  }
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
    return { label: 'VID', className: base + 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200' }
  }
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
    return { label: 'AUD', className: base + 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200' }
  }

  return { label: 'FILE', className: base + 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200' }
}

const studentDisplayName = (s: Student): string => {
  const first = (s.user?.first_name || '').trim()
  const last = (s.user?.last_name || '').trim()
  const full = `${first} ${last}`.trim()
  return full || `Estudiante #${s.id}`
}

const attachmentDisplayLabel = (a: { description?: string | null }) => {
  const desc = (a.description || '').trim()
  return desc || 'Archivo adjunto'
}

const eventTypeLabel = (t: string) => {
  switch (t) {
    case 'CREATED':
      return 'Creación'
    case 'NOTE':
      return 'Nota'
    case 'NOTIFIED_GUARDIAN':
      return 'Notificación a acudiente'
    case 'DESCARGOS':
      return 'Descargos'
    case 'DECISION':
      return 'Decisión'
    case 'CLOSED':
      return 'Cierre'
    default:
      return t
  }
}

const chipClassName = (opts: {
  active: boolean
  tone?: 'slate' | 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky'
}) => {
  const { active, tone = 'slate' } = opts

  if (active) {
    switch (tone) {
      case 'emerald':
        return 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950'
      case 'indigo':
        return 'bg-indigo-600 text-white dark:bg-indigo-400 dark:text-slate-950'
      case 'amber':
        return 'bg-amber-500 text-slate-950 dark:bg-amber-400 dark:text-slate-950'
      case 'rose':
        return 'bg-rose-600 text-white dark:bg-rose-400 dark:text-slate-950'
      case 'sky':
        return 'bg-sky-600 text-white dark:bg-sky-400 dark:text-slate-950'
      default:
        return 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
    }
  }

  switch (tone) {
    case 'emerald':
      return 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-200 dark:hover:bg-emerald-900/30'
    case 'indigo':
      return 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-200 dark:hover:bg-indigo-900/30'
    case 'amber':
      return 'bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-200 dark:hover:bg-amber-900/30'
    case 'rose':
      return 'bg-rose-50 text-rose-800 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-200 dark:hover:bg-rose-900/30'
    case 'sky':
      return 'bg-sky-50 text-sky-900 hover:bg-sky-100 dark:bg-sky-900/20 dark:text-sky-200 dark:hover:bg-sky-900/30'
    default:
      return 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
  }
}

const eventTypeTone = (t: string): 'slate' | 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky' => {
  switch (t) {
    case 'DESCARGOS':
      return 'emerald'
    case 'DECISION':
      return 'indigo'
    case 'NOTIFIED_GUARDIAN':
      return 'amber'
    case 'NOTE':
      return 'sky'
    case 'CLOSED':
      return 'rose'
    default:
      return 'slate'
  }
}

const attachmentKindTone = (k: string): 'slate' | 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky' => {
  switch (k) {
    case 'EVIDENCE':
      return 'sky'
    case 'DESCARGOS':
      return 'emerald'
    case 'NOTIFICATION':
      return 'amber'
    case 'OTHER':
      return 'slate'
    default:
      return 'slate'
  }
}

const suggestionStatusLabel = (s: string) => {
  switch (s) {
    case 'DRAFT':
      return 'Borrador'
    case 'APPROVED':
      return 'Aprobada'
    case 'APPLIED':
      return 'Aplicada'
    case 'REJECTED':
      return 'Rechazada'
    default:
      return s
  }
}

export default function DisciplineCaseDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const user = useAuthStore((s) => s.user)

  const isParent = user?.role === 'PARENT'
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN'

  const extractionStatusLabel = (s?: string | null) => {
    switch (s) {
      case 'PENDING':
        return 'Pendiente'
      case 'DONE':
        return 'Listo'
      case 'FAILED':
        return 'Falló'
      default:
        return s || '—'
    }
  }

  const caseId = Number(id)
  const [loading, setLoading] = useState(true)
  const [downloadingActa, setDownloadingActa] = useState(false)

  const [activeManual, setActiveManual] = useState<ConvivenciaManual | null>(null)
  const [manualLoading, setManualLoading] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)

  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  async function handleOpenActa() {
    if (!id) return
    try {
      setDownloadingActa(true)
      const blob = await disciplineApi.downloadActa(Number(id))
      const url = window.URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      console.error(e)
      alert('No se pudo generar el acta.')
    } finally {
      setDownloadingActa(false)
    }
  }

  const [error, setError] = useState<string | null>(null)
  const [item, setItem] = useState<DisciplineCaseDetail | null>(null)

  const [descargosText, setDescargosText] = useState('')
  const [descargosFile, setDescargosFile] = useState<File | null>(null)
  const [decisionText, setDecisionText] = useState('')
  const [busy, setBusy] = useState(false)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTitle, setConfirmTitle] = useState('')
  const [confirmDescription, setConfirmDescription] = useState('')
  const [confirmConfirmText, setConfirmConfirmText] = useState('Confirmar')
  const [confirmVariant, setConfirmVariant] = useState<'default' | 'destructive'>('default')
  const [confirmAction, setConfirmAction] = useState<null | (() => Promise<void>)>(null)

  const [editEventModalOpen, setEditEventModalOpen] = useState(false)
  const [editEventId, setEditEventId] = useState<number | null>(null)
  const [editEventType, setEditEventType] = useState<string>('')
  const [editEventText, setEditEventText] = useState('')

  const [participantStudentId, setParticipantStudentId] = useState('')
  const [participantStudentQuery, setParticipantStudentQuery] = useState('')
  const [participantStudentResults, setParticipantStudentResults] = useState<Student[]>([])
  const [participantStudentSearching, setParticipantStudentSearching] = useState(false)
  const [participantStudentSearchError, setParticipantStudentSearchError] = useState<string | null>(null)
  const [participantStudentDropdownOpen, setParticipantStudentDropdownOpen] = useState(false)
  const [participantRole, setParticipantRole] = useState('WITNESS')
  const [participantNotes, setParticipantNotes] = useState('')

  const [attachmentKind, setAttachmentKind] = useState('EVIDENCE')
  const [attachmentDescription, setAttachmentDescription] = useState('')
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)

  const [quickEvidenceFiles, setQuickEvidenceFiles] = useState<File[]>([])
  const [quickUploadTotal, setQuickUploadTotal] = useState(0)
  const [quickUploadDone, setQuickUploadDone] = useState(0)
  const [quickUploading, setQuickUploading] = useState(false)

  const [notifyChannel, setNotifyChannel] = useState('IN_APP')
  const [notifyNote, setNotifyNote] = useState('')
  const [ackLogId, setAckLogId] = useState('')
  const [ackNote, setAckNote] = useState('')

  const [deadlineLocal, setDeadlineLocal] = useState('')

  const [noteText, setNoteText] = useState('')

  const [noteModalOpen, setNoteModalOpen] = useState(false)
  const [deadlineModalOpen, setDeadlineModalOpen] = useState(false)
  const [descargosModalOpen, setDescargosModalOpen] = useState(false)
  const [decisionModalOpen, setDecisionModalOpen] = useState(false)
  const [aiModalOpen, setAiModalOpen] = useState(false)

  const [actionsShowAllEvents, setActionsShowAllEvents] = useState(false)
  const [actionsShowAllAttachments, setActionsShowAllAttachments] = useState(false)

  const [actionsEventsQuery, setActionsEventsQuery] = useState('')
  const [actionsAttachmentsQuery, setActionsAttachmentsQuery] = useState('')
  const [actionsEventTypeFilter, setActionsEventTypeFilter] = useState<string>('ALL')
  const [actionsAttachmentKindFilter, setActionsAttachmentKindFilter] = useState<string>('ALL')

  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const [uploadFailures, setUploadFailures] = useState<string[]>([])
  const [showUploadFailures, setShowUploadFailures] = useState(true)

  const [retryEvidenceFiles, setRetryEvidenceFiles] = useState<File[]>([])
  const [retryUploadTotal, setRetryUploadTotal] = useState(0)
  const [retryUploadDone, setRetryUploadDone] = useState(0)
  const [retryUploading, setRetryUploading] = useState(false)

  type DetailTab = 'overview' | 'actions' | 'guardian' | 'participants' | 'attachments' | 'log'
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')

  useEffect(() => {
    if (isParent && activeTab === 'actions') setActiveTab('overview')
  }, [activeTab, isParent])

  useEffect(() => {
    const state = location.state as unknown
    const maybe = state as {
      toast?: { message?: unknown; type?: unknown }
      uploadFailures?: unknown
    } | null
    const message = maybe?.toast?.message
    const type = maybe?.toast?.type
    const failures = maybe?.uploadFailures
    if (typeof message === 'string' && message.trim()) {
      const safeType: ToastType = type === 'success' || type === 'error' || type === 'info' ? (type as ToastType) : 'info'
      setToast({ message, type: safeType, isVisible: true })
    }

    if (Array.isArray(failures) && failures.every((x) => typeof x === 'string')) {
      setUploadFailures(failures)
      setShowUploadFailures(true)
    }

    if ((typeof message === 'string' && message.trim()) || Array.isArray(failures)) {
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.pathname, location.state, navigate])

  const hasDescargos = useMemo(() => {
    return Boolean(item?.events?.some((e) => e.event_type === 'DESCARGOS'))
  }, [item?.events])

  const descargosEvents = useMemo(() => {
    const list = (item?.events || []).filter((e) => e.event_type === 'DESCARGOS')
    return [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  }, [item?.events])

  const notesEvents = useMemo(() => {
    const list = (item?.events || []).filter((e) => e.event_type === 'NOTE' && String(e.text || '').trim())
    return [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  }, [item?.events])

  const sortedEvents = useMemo(() => {
    const list = [...(item?.events || [])]
    list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return list
  }, [item?.events])

  const actionsEventTypeOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of sortedEvents) counts.set(e.event_type, (counts.get(e.event_type) || 0) + 1)
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => a.type.localeCompare(b.type))
  }, [sortedEvents])

  const filteredEvents = useMemo(() => {
    const q = actionsEventsQuery.trim().toLowerCase()
    return sortedEvents.filter((e) => {
      if (actionsEventTypeFilter !== 'ALL' && e.event_type !== actionsEventTypeFilter) return false
      if (!q) return true
      const hay = `${e.event_type}\n${e.text || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [actionsEventTypeFilter, actionsEventsQuery, sortedEvents])

  const displayedEvents = useMemo(() => {
    return actionsShowAllEvents ? filteredEvents : filteredEvents.slice(0, 8)
  }, [actionsShowAllEvents, filteredEvents])

  const sortedAttachments = useMemo(() => {
    const list = [...(item?.attachments || [])]
    list.sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1))
    return list
  }, [item?.attachments])

  const actionsAttachmentKindOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of sortedAttachments) counts.set(a.kind, (counts.get(a.kind) || 0) + 1)
    return Array.from(counts.entries())
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => a.kind.localeCompare(b.kind))
  }, [sortedAttachments])

  const filteredAttachments = useMemo(() => {
    const q = actionsAttachmentsQuery.trim().toLowerCase()
    return sortedAttachments.filter((a) => {
      if (actionsAttachmentKindFilter !== 'ALL' && a.kind !== actionsAttachmentKindFilter) return false
      if (!q) return true
      const hay = `${a.kind}\n${a.description || ''}\n${a.file || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [actionsAttachmentKindFilter, actionsAttachmentsQuery, sortedAttachments])

  const displayedAttachments = useMemo(() => {
    return actionsShowAllAttachments ? filteredAttachments : filteredAttachments.slice(0, 8)
  }, [actionsShowAllAttachments, filteredAttachments])

  const isSealed = Boolean(item?.sealed_at)
  const status = item?.status || '—'

  const loadManual = async () => {
    setManualLoading(true)
    setManualError(null)
    try {
      const res = await disciplineApi.getActiveManual()
      setActiveManual(res.data)
    } catch (e: unknown) {
      console.error(e)
      setManualError(getErrorDetail(e) || 'No se pudo cargar el manual activo')
    } finally {
      setManualLoading(false)
    }
  }

  const load = async () => {
    if (!caseId) return
    setLoading(true)
    setError(null)
    try {
      const res = await disciplineApi.get(caseId)
      setItem(res.data)

      const due = res.data.descargos_due_at
      if (due) {
        const d = new Date(due)
        const pad = (n: number) => String(n).padStart(2, '0')
        const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
        setDeadlineLocal(local)
      } else {
        setDeadlineLocal('')
      }
    } catch (e: unknown) {
      console.error(e)
      setError('No se pudo cargar el caso')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canAccess(user?.role)) return
    if (!caseId) {
      setError('ID inválido')
      setLoading(false)
      return
    }
    load()
    loadManual()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, caseId])

  const goToManualConfig = () => navigate('/academic-config?tab=convivencia_manual')

  const latestSuggestion: DisciplineDecisionSuggestion | null = useMemo(() => {
    const list = item?.decision_suggestions || []
    if (list.length === 0) return null
    const sorted = [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return sorted[0] || null
  }, [item?.decision_suggestions])

  const handleGenerateAiSuggestion = async (): Promise<boolean> => {
    if (!item) return false
    setAiBusy(true)
    setAiError(null)
    try {
      await disciplineApi.suggestDecisionAi(item.id)
      await load()
      setToast({ message: 'Sugerencia IA generada.', type: 'success', isVisible: true })
      return true
    } catch (e: unknown) {
      console.error(e)
      setAiError(getErrorDetail(e) || 'No se pudo generar la sugerencia IA')
      return false
    } finally {
      setAiBusy(false)
    }
  }

  const handleApproveAiSuggestion = async (): Promise<boolean> => {
    if (!item) return false
    if (!latestSuggestion) return false
    if (!isAdmin) return false
    setAiBusy(true)
    setAiError(null)
    try {
      await disciplineApi.approveDecisionSuggestionAi(item.id, latestSuggestion.id)
      await load()
      setToast({ message: 'Sugerencia aprobada.', type: 'success', isVisible: true })
      return true
    } catch (e: unknown) {
      console.error(e)
      setAiError(getErrorDetail(e) || 'No se pudo aprobar la sugerencia')
      return false
    } finally {
      setAiBusy(false)
    }
  }

  const handleApplyAiSuggestion = async (): Promise<boolean> => {
    if (!item) return false
    if (!latestSuggestion) return false
    if (!isAdmin) return false
    setAiBusy(true)
    setAiError(null)
    try {
      await disciplineApi.applyDecisionSuggestionAi(item.id, latestSuggestion.id)
      await load()
      setToast({ message: 'Decisión aplicada desde sugerencia IA.', type: 'success', isVisible: true })
      return true
    } catch (e: unknown) {
      console.error(e)
      setAiError(getErrorDetail(e) || 'No se pudo aplicar la sugerencia')
      return false
    } finally {
      setAiBusy(false)
    }
  }

  const handleRecordDescargos = async (): Promise<boolean> => {
    if (!item) return false
    const text = descargosText.trim()
    if (!text) {
      alert('Debes escribir los descargos')
      return false
    }

    setBusy(true)
    try {
      await disciplineApi.recordDescargos(item.id, { text, ...(descargosFile ? { file: descargosFile } : {}) })
      setDescargosText('')
      setDescargosFile(null)
      await load()
      return true
    } catch (e: unknown) {
      console.error(e)
      alert(getErrorDetail(e) || 'Error registrando descargos')
      return false
    } finally {
      setBusy(false)
    }
  }

  const handleAddParticipant = async () => {
    if (!item) return
    const idValue = Number(participantStudentId)
    if (!Number.isFinite(idValue) || idValue <= 0) return alert('Ingresa un ID de estudiante válido')
    if (!participantRole) return alert('Selecciona un rol')

    setBusy(true)
    try {
      await disciplineApi.addParticipant(item.id, {
        student_id: idValue,
        role: participantRole,
        ...(participantNotes.trim() ? { notes: participantNotes.trim() } : {}),
      })
      setParticipantStudentId('')
      setParticipantStudentQuery('')
      setParticipantStudentResults([])
      setParticipantStudentDropdownOpen(false)
      setParticipantNotes('')
      setParticipantRole('WITNESS')
      await load()
    } catch (e: unknown) {
      console.error(e)
      alert(getErrorDetail(e) || 'Error agregando participante')
    } finally {
      setBusy(false)
    }
  }

  const handlePickParticipantStudent = (s: Student) => {
    setParticipantStudentId(String(s.id))
    setParticipantStudentQuery(studentDisplayName(s))
    setParticipantStudentResults([])
    setParticipantStudentDropdownOpen(false)
    setParticipantStudentSearchError(null)
  }

  useEffect(() => {
    if (isParent) return

    const raw = participantStudentQuery.trim()
    const isNumeric = /^\d+$/.test(raw)

    setParticipantStudentSearchError(null)

    if (isNumeric) {
      setParticipantStudentId(raw)
      setParticipantStudentResults([])
      setParticipantStudentSearching(false)
      setParticipantStudentDropdownOpen(false)
      return
    }

    if (raw.length < 2) {
      setParticipantStudentResults([])
      setParticipantStudentSearching(false)
      setParticipantStudentDropdownOpen(false)
      return
    }

    let alive = true
    setParticipantStudentSearching(true)

    const timer = window.setTimeout(async () => {
      try {
        const res = await studentsApi.list({ search: raw, page_size: 8, page: 1 })
        if (!alive) return
        const results = Array.isArray(res.data?.results) ? res.data.results : []
        setParticipantStudentResults(results)
        setParticipantStudentDropdownOpen(true)
      } catch (e: unknown) {
        if (!alive) return
        console.error(e)
        setParticipantStudentResults([])
        setParticipantStudentSearchError(getErrorDetail(e) || 'No se pudo buscar estudiantes')
        setParticipantStudentDropdownOpen(true)
      } finally {
        if (alive) setParticipantStudentSearching(false)
      }
    }, 250)

    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [isParent, participantStudentQuery])

  const handleAddAttachment = async () => {
    if (!item) return
    if (!attachmentFile) return alert('Selecciona un archivo')

    setBusy(true)
    try {
      await disciplineApi.addAttachment(item.id, {
        file: attachmentFile,
        ...(attachmentKind ? { kind: attachmentKind } : {}),
        ...(attachmentDescription.trim() ? { description: attachmentDescription.trim() } : {}),
      })
      setAttachmentFile(null)
      setAttachmentKind('EVIDENCE')
      setAttachmentDescription('')
      await load()
    } catch (e: unknown) {
      console.error(e)
      alert(getErrorDetail(e) || 'Error agregando adjunto')
    } finally {
      setBusy(false)
    }
  }

  const handleQuickEvidenceUpload = async () => {
    if (!item) return
    if (quickEvidenceFiles.length === 0) return

    setQuickUploading(true)
    setQuickUploadTotal(quickEvidenceFiles.length)
    setQuickUploadDone(0)

    const failed: string[] = []
    try {
      for (const f of quickEvidenceFiles) {
        try {
          await disciplineApi.addAttachment(item.id, { file: f, kind: 'EVIDENCE' })
        } catch (e) {
          console.error(e)
          failed.push(f.name)
        } finally {
          setQuickUploadDone((n) => n + 1)
        }
      }

      await load()
      setQuickEvidenceFiles([])

      if (failed.length > 0) {
        setUploadFailures(failed)
        setShowUploadFailures(true)
        setToast({
          message: `No se pudieron subir ${failed.length} archivo(s).`,
          type: 'error',
          isVisible: true,
        })
      } else {
        setToast({ message: 'Evidencias subidas correctamente.', type: 'success', isVisible: true })
      }
    } finally {
      setQuickUploading(false)
    }
  }

  const handleRetryEvidenceUpload = async () => {
    if (!item) return
    if (retryEvidenceFiles.length === 0) return

    setRetryUploading(true)
    setRetryUploadTotal(retryEvidenceFiles.length)
    setRetryUploadDone(0)

    const failed: string[] = []
    try {
      for (const f of retryEvidenceFiles) {
        try {
          await disciplineApi.addAttachment(item.id, { file: f, kind: 'EVIDENCE' })
        } catch (e) {
          console.error(e)
          failed.push(f.name)
        } finally {
          setRetryUploadDone((n) => n + 1)
        }
      }

      await load()
      setRetryEvidenceFiles([])

      if (failed.length > 0) {
        setUploadFailures(failed)
        setShowUploadFailures(true)
        setToast({
          message: `No se pudieron subir ${failed.length} archivo(s).`,
          type: 'error',
          isVisible: true,
        })
      } else {
        setUploadFailures([])
        setShowUploadFailures(false)
        setToast({ message: 'Evidencias subidas correctamente.', type: 'success', isVisible: true })
      }
    } finally {
      setRetryUploading(false)
    }
  }

  const handleDecide = async (): Promise<boolean> => {
    if (!item) return false
    const text = decisionText.trim()
    if (!text) {
      alert('Debes escribir la decisión')
      return false
    }

    setBusy(true)
    try {
      if (item.status === 'OPEN') {
        await disciplineApi.decide(item.id, { decision_text: text })
      } else {
        await disciplineApi.updateDecision(item.id, { decision_text: text })
      }
      setDecisionText('')
      await load()
      return true
    } catch (e: unknown) {
      console.error(e)
      alert(getErrorDetail(e) || 'Error al decidir')
      return false
    } finally {
      setBusy(false)
    }
  }

  const openEditEvent = (e: DisciplineCaseEvent) => {
    setEditEventId(e.id)
    setEditEventType(e.event_type)
    setEditEventText(e.text || '')
    setEditEventModalOpen(true)
  }

  const canEditOrDeleteEvent = (e: DisciplineCaseEvent) => {
    if (isParent || isSealed) return false
    if (e.event_type !== 'NOTE' && e.event_type !== 'DESCARGOS') return false
    if (isAdmin) return true
    if (user?.role === 'TEACHER') return e.created_by === user.id
    return false
  }

  const handleUpdateEvent = async (): Promise<boolean> => {
    if (!item) return false
    if (!editEventId) return false
    const text = editEventText.trim()
    if (!text) {
      alert('El texto es obligatorio')
      return false
    }

    setBusy(true)
    try {
      await disciplineApi.updateEvent(item.id, editEventId, { text })
      await load()
      return true
    } catch (e: unknown) {
      console.error(e)
      alert(getErrorDetail(e) || 'Error al actualizar')
      return false
    } finally {
      setBusy(false)
    }
  }

  const performDeleteEvent = async (eventId: number) => {
    if (!item) return

    setBusy(true)
    try {
      await disciplineApi.deleteEvent(item.id, eventId)
      await load()
      setToast({ message: 'Registro eliminado.', type: 'success', isVisible: true })
    } catch (e: unknown) {
      console.error(e)
      alert(getErrorDetail(e) || 'Error al eliminar')
    } finally {
      setBusy(false)
    }
  }

  const requestDeleteEvent = (eventId: number) => {
    setConfirmTitle('Eliminar registro')
    setConfirmDescription('¿Eliminar este registro? Esta acción no se puede deshacer.')
    setConfirmConfirmText('Eliminar')
    setConfirmVariant('destructive')
    setConfirmAction(() => async () => {
      await performDeleteEvent(eventId)
      setConfirmOpen(false)
    })
    setConfirmOpen(true)
  }

  const performClearDecision = async () => {
    if (!item) return

    setBusy(true)
    try {
      await disciplineApi.clearDecision(item.id)
      await load()
      setDecisionText('')
      setToast({ message: 'Decisión eliminada.', type: 'success', isVisible: true })
    } catch (e: unknown) {
      console.error(e)
      alert(getErrorDetail(e) || 'Error al eliminar la decisión')
    } finally {
      setBusy(false)
    }
  }

  const requestClearDecision = () => {
    setConfirmTitle('Eliminar decisión')
    setConfirmDescription('¿Eliminar la decisión actual y volver el caso a ABIERTO?')
    setConfirmConfirmText('Eliminar')
    setConfirmVariant('destructive')
    setConfirmAction(() => async () => {
      await performClearDecision()
      setConfirmOpen(false)
    })
    setConfirmOpen(true)
  }

  const performCloseCase = async () => {
    if (!item) return
    setBusy(true)
    try {
      await disciplineApi.close(item.id)
      await load()
    } catch (e: unknown) {
      console.error(e)
      alert(getErrorDetail(e) || 'Error al cerrar')
    } finally {
      setBusy(false)
    }
  }

  const requestCloseCase = () => {
    setConfirmTitle('Cerrar caso')
    setConfirmDescription('¿Cerrar el caso? Esto sellará el caso y bloqueará nuevas modificaciones.')
    setConfirmConfirmText('Cerrar caso')
    setConfirmVariant('destructive')
    setConfirmAction(() => async () => {
      await performCloseCase()
      setConfirmOpen(false)
    })
    setConfirmOpen(true)
  }

  const handleNotifyGuardian = async () => {
    if (!item) return
    setBusy(true)
    try {
      await disciplineApi.notifyGuardian(item.id, {
        channel: notifyChannel.trim() || undefined,
        note: notifyNote.trim() || undefined,
      })
      setNotifyNote('')
      await load()
    } catch (e: unknown) {
      console.error(e)
      alert(getErrorDetail(e) || 'Error registrando notificación')
    } finally {
      setBusy(false)
    }
  }

  const handleAcknowledge = async () => {
    if (!item) return
    const logId = Number(ackLogId)
    if (!Number.isFinite(logId) || logId <= 0) return alert('Selecciona una notificación válida')

    setBusy(true)
    try {
      await disciplineApi.acknowledgeGuardian(item.id, {
        log_id: logId,
        ...(ackNote.trim() ? { note: ackNote.trim() } : {}),
      })
      setAckLogId('')
      setAckNote('')
      await load()
    } catch (e: unknown) {
      console.error(e)
      alert(getErrorDetail(e) || 'Error registrando acuse')
    } finally {
      setBusy(false)
    }
  }

  const handleSaveDeadline = async (): Promise<boolean> => {
    if (!item) return false
    setBusy(true)
    try {
      if (!deadlineLocal) {
        await disciplineApi.setDescargosDeadline(item.id, { descargos_due_at: null })
      } else {
        const iso = new Date(deadlineLocal).toISOString()
        await disciplineApi.setDescargosDeadline(item.id, { descargos_due_at: iso })
      }
      await load()
      return true
    } catch (e: unknown) {
      console.error(e)
      alert(getErrorDetail(e) || 'Error actualizando plazo de descargos')
      return false
    } finally {
      setBusy(false)
    }
  }

  const handleAddNote = async (): Promise<boolean> => {
    if (!item) return false
    const text = noteText.trim()
    if (!text) {
      alert('Debes escribir una nota')
      return false
    }

    setBusy(true)
    try {
      await disciplineApi.addNote(item.id, { text })
      setNoteText('')
      await load()
      return true
    } catch (e: unknown) {
      console.error(e)
      alert(getErrorDetail(e) || 'Error agregando nota')
      return false
    } finally {
      setBusy(false)
    }
  }

  if (!canAccess(user?.role)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Convivencia</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">No tienes permisos para acceder al módulo de convivencia.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading)
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
        Cargando…
      </div>
    )
  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
        {error}
      </div>
    )
  if (!item)
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
        Caso no encontrado
      </div>
    )

  const TabButton = ({
    tab,
    label,
    badge,
  }: {
    tab: DetailTab
    label: string
    badge?: string
  }) => {
    const isActive = activeTab === tab
    return (
      <button
        type="button"
        onClick={() => setActiveTab(tab)}
        aria-pressed={isActive}
        className={
          'inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-colors sm:px-3.5 ' +
          (isActive
            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800')
        }
      >
        <span>{label}</span>
        {badge ? (
          <span
            className={
              'ml-2 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] sm:px-2 ' +
              (isActive
                ? 'bg-white/15 text-white dark:bg-slate-900/15 dark:text-slate-900'
                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200')
            }
          >
            {badge}
          </span>
        ) : null}
      </button>
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

      {showUploadFailures && uploadFailures.length > 0 ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">Algunas evidencias no se pudieron subir</div>
              <div className="mt-1 text-xs opacity-90">Selecciona los archivos nuevamente para reintentar la subida.</div>
            </div>
            <button
              type="button"
              className="text-xs underline underline-offset-2 opacity-90 hover:opacity-100"
              onClick={() => setShowUploadFailures(false)}
            >
              Ocultar
            </button>
          </div>
          <ul className="mt-2 list-disc pl-5 text-xs">
            {uploadFailures.slice(0, 10).map((name) => (
              <li key={name}>{name}</li>
            ))}
            {uploadFailures.length > 10 ? <li>…</li> : null}
          </ul>

          <div className="mt-3 rounded-md border border-red-200/70 bg-white/50 p-3 dark:border-red-900/40 dark:bg-slate-950/40">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label>Reintentar evidencias</Label>
                <Input
                  type="file"
                  multiple
                  accept="image/*,video/*,audio/*"
                  disabled={retryUploading}
                  onChange={(e) => {
                    const incoming = Array.from(e.target.files || [])
                    if (incoming.length === 0) return
                    setRetryEvidenceFiles((prev) => {
                      const next = [...prev]
                      for (const f of incoming) {
                        const exists = next.some(
                          (x) => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified,
                        )
                        if (!exists) next.push(f)
                      }
                      return next
                    })
                    e.currentTarget.value = ''
                  }}
                />
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span>
                    {retryEvidenceFiles.length > 0
                      ? `${retryEvidenceFiles.length} archivo(s) seleccionado(s)`
                      : 'Sin archivos seleccionados'}
                  </span>
                  {retryEvidenceFiles.length > 0 ? (
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() => setRetryEvidenceFiles([])}
                      disabled={retryUploading}
                    >
                      Limpiar
                    </button>
                  ) : null}
                </div>
                {retryUploading ? (
                  <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Subiendo {retryUploadDone}/{retryUploadTotal}…
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleRetryEvidenceUpload}
                  disabled={retryUploading || retryEvidenceFiles.length === 0}
                >
                  {retryUploading ? 'Subiendo…' : 'Reintentar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            <Link to="/discipline/cases" className="hover:underline">
              Convivencia
            </Link>
            <span className="mx-2">/</span>
            <span>Caso #{item.id}</span>
          </div>
          <h2 className="mt-1 wrap-break-word text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
            {item.student_full_name}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {item.grade_name} / {item.group_name} • Año {item.academic_year ?? '-'}
          </p>

          {isSealed && (
            <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200">
                Sellado
              </span>
              <span className="ml-2">
                {isParent
                  ? 'Caso en modo solo lectura.'
                  : 'Este caso no permite modificaciones; solo notas aclaratorias.'}
              </span>
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row">
          <Button
            variant="outline"
            className="min-h-11 w-full lg:w-auto"
            onClick={() => navigate('/discipline/cases')}
            type="button"
          >
            Volver
          </Button>
          <Button
            className="min-h-11 w-full lg:w-auto"
            onClick={handleOpenActa}
            disabled={downloadingActa}
            aria-busy={downloadingActa}
            type="button"
            title="Abrir acta en PDF"
          >
            {downloadingActa ? 'Generando acta…' : 'Acta (PDF)'}
          </Button>
        </div>
      </div>

      <div className="sticky top-0 z-40 sm:top-2">
        <div className="rounded-lg border border-slate-200 bg-white/80 p-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <TabButton tab="overview" label="Resumen" />
            {!isParent ? <TabButton tab="actions" label="Acciones" /> : null}
            <TabButton tab="guardian" label="Acudiente" badge={String((item.notification_logs || []).length)} />
            <TabButton tab="participants" label="Participantes" badge={String((item.participants || []).length)} />
            <TabButton tab="attachments" label="Adjuntos" badge={String((item.attachments || []).length)} />
            <TabButton tab="log" label="Bitácora" badge={String((item.events || []).length)} />
          </div>
        </div>
      </div>

      <div className={activeTab === 'overview' ? 'block space-y-6' : 'hidden'}>
        <Card>
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                Estado: {statusLabel(status)}
              </span>
              {item.status === 'OPEN' && (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                  En seguimiento
                </span>
              )}
              {isSealed && (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  Sellado
                </span>
              )}
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                Descargos: {hasDescargos ? 'Sí' : 'No'}
              </span>
              {item.descargos_due_at ? (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  Plazo: {new Date(item.descargos_due_at).toLocaleString()}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  Plazo: —
                </span>
              )}
              {item.descargos_overdue ? (
                <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                  Vencido
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hechos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-slate-600 dark:text-slate-300">Fecha: {new Date(item.occurred_at).toLocaleString()}</div>
            <div className="text-sm text-slate-600 dark:text-slate-300">Lugar: {item.location || '-'}</div>
            <div className="text-sm text-slate-600 dark:text-slate-300">Manual: {manualSeverityLabel(item.manual_severity)} • Ley 1620: {law1620Label(item.law_1620_type)}</div>
            <div className="border-t border-slate-200 dark:border-slate-800 pt-3 text-slate-800 dark:text-slate-100 whitespace-pre-wrap">{item.narrative}</div>
          </CardContent>
        </Card>

        {isSealed && (
          <Card>
            <CardHeader>
              <CardTitle>Sello / Cadena de custodia</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Sellado: {item.sealed_at ? new Date(item.sealed_at).toLocaleString() : '—'}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300 break-all">
                Hash (SHA-256): {item.sealed_hash || '—'}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className={activeTab === 'actions' ? 'block' : 'hidden'}>
        {!isParent && (
          <Card>
            <CardHeader>
              <CardTitle>Acciones</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Estado actual</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      {statusLabel(item.status)}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      Descargos: {hasDescargos ? 'Sí' : 'No'}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      Archivos: {(item.attachments || []).length}
                    </span>
                  </div>

                  <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    {item.decided_at ? `Decidido: ${new Date(item.decided_at).toLocaleString()}` : 'Aún no hay decisión registrada.'}
                  </div>

                  {item.decision_text?.trim() ? (
                    <div className="mt-3 rounded-md bg-slate-50 p-3 dark:bg-slate-900/40">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Decisión registrada</div>
                      <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{item.decision_text}</div>
                      <div className="mt-2 flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDecisionText(item.decision_text)}
                          disabled={busy || isSealed}
                          title="Cargar la decisión registrada en el editor"
                        >
                          Editar decisión
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-col gap-2 md:flex-row">
                    <Button variant="outline" size="sm" className="min-h-11 w-full md:w-auto" onClick={() => setActiveTab('attachments')}>
                      Ver adjuntos
                    </Button>
                    <Button variant="outline" size="sm" className="min-h-11 w-full md:w-auto" onClick={() => setActiveTab('log')}>
                      Ver bitácora
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 lg:col-span-2">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Historial reciente</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Lo último registrado en el caso (puedes expandir).</div>
                    </div>
                    <div className="flex flex-col gap-2 md:flex-row">
                      {filteredEvents.length > 8 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActionsShowAllEvents((v) => !v)}
                          title="Mostrar más/menos registros"
                        >
                          {actionsShowAllEvents ? 'Ver menos' : 'Ver todo'}
                        </Button>
                      ) : null}
                      <Button variant="outline" size="sm" onClick={() => setActiveTab('log')}>
                        Ir a bitácora
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setActionsEventTypeFilter('ALL')}
                        className={
                          'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
                          chipClassName({ active: actionsEventTypeFilter === 'ALL', tone: 'slate' })
                        }
                      >
                        Todos ({sortedEvents.length})
                      </button>
                      {actionsEventTypeOptions.map((opt) => (
                        <button
                          key={opt.type}
                          type="button"
                          onClick={() => setActionsEventTypeFilter(opt.type)}
                          className={
                            'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
                            chipClassName({ active: actionsEventTypeFilter === opt.type, tone: eventTypeTone(opt.type) })
                          }
                          title={eventTypeLabel(opt.type)}
                        >
                          {eventTypeLabel(opt.type)} ({opt.count})
                        </button>
                      ))}
                    </div>

                    <div>
                      <Input
                        value={actionsEventsQuery}
                        onChange={(e) => setActionsEventsQuery(e.target.value)}
                        placeholder="Buscar en historial…"
                      />
                      {(actionsEventsQuery.trim() || actionsEventTypeFilter !== 'ALL') && (
                        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          Mostrando {filteredEvents.length} de {sortedEvents.length}.
                        </div>
                      )}
                    </div>
                  </div>

                  {displayedEvents.length === 0 ? (
                    <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">Sin registros aún.</div>
                  ) : (
                    <div className={
                      'mt-3 space-y-2 ' +
                      (actionsShowAllEvents ? 'max-h-[420px] overflow-auto pr-1' : '')
                    }>
                      {displayedEvents.map((e) => (
                        <div key={e.id} className="rounded-md border border-slate-100 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{eventTypeLabel(e.event_type)}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{new Date(e.created_at).toLocaleString()}</div>
                          </div>
                          {e.text ? (
                            <div className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-200">
                              {e.text}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}

                  {displayedAttachments.length > 0 ? (
                    <div className="mt-4">
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Archivos</div>
                        <div className="flex flex-col gap-2 md:flex-row">
                          {filteredAttachments.length > 8 ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setActionsShowAllAttachments((v) => !v)}
                              title="Mostrar más/menos archivos"
                            >
                              {actionsShowAllAttachments ? 'Ver menos' : 'Ver todo'}
                            </Button>
                          ) : null}
                          <Button variant="outline" size="sm" onClick={() => setActiveTab('attachments')}>
                            Ir a adjuntos
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setActionsAttachmentKindFilter('ALL')}
                            className={
                              'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
                              chipClassName({ active: actionsAttachmentKindFilter === 'ALL', tone: 'slate' })
                            }
                          >
                            Todos ({sortedAttachments.length})
                          </button>
                          {actionsAttachmentKindOptions.map((opt) => (
                            <button
                              key={opt.kind}
                              type="button"
                              onClick={() => setActionsAttachmentKindFilter(opt.kind)}
                              className={
                                'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
                                chipClassName({ active: actionsAttachmentKindFilter === opt.kind, tone: attachmentKindTone(opt.kind) })
                              }
                              title={attachmentKindLabel(opt.kind)}
                            >
                              {attachmentKindLabel(opt.kind)} ({opt.count})
                            </button>
                          ))}
                        </div>

                        <div>
                          <Input
                            value={actionsAttachmentsQuery}
                            onChange={(e) => setActionsAttachmentsQuery(e.target.value)}
                            placeholder="Buscar en archivos…"
                          />
                          {(actionsAttachmentsQuery.trim() || actionsAttachmentKindFilter !== 'ALL') && (
                            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                              Mostrando {filteredAttachments.length} de {sortedAttachments.length}.
                            </div>
                          )}
                        </div>
                      </div>

                      <div
                        className={
                          'mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 ' +
                          (actionsShowAllAttachments ? 'max-h-[360px] overflow-auto pr-1' : '')
                        }
                      >
                        {displayedAttachments.map((a) => (
                          <div
                            key={a.id}
                            className="rounded-md border border-slate-100 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950"
                          >
                            <div className="text-xs text-slate-500 dark:text-slate-400">{attachmentKindLabel(a.kind)}</div>
                            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <a
                                href={a.file}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 hover:underline"
                                title="Ver archivo"
                              >
                                <span className={getFileTypeBadge(a.file).className}>{getFileTypeBadge(a.file).label}</span>
                                <span className="font-medium text-slate-800 dark:text-slate-100 wrap-break-word">
                                  {attachmentDisplayLabel(a)}
                                </span>
                              </a>
                              <div className="flex items-center gap-3">
                                <a
                                  href={a.file}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-slate-600 underline underline-offset-2 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                                >
                                  Ver
                                </a>
                                <a
                                  href={a.file}
                                  download
                                  className="text-xs text-slate-600 underline underline-offset-2 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                                >
                                  Descargar
                                </a>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-linear-to-r from-slate-50 to-white p-4 dark:border-slate-800 dark:from-slate-950 dark:to-slate-900">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Acciones rápidas</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Los formularios se abren en ventanas para mantener la vista limpia.</div>
                  </div>
                  <div className="flex flex-col gap-2 md:flex-row">
                    <Button variant="outline" className="min-h-11 w-full md:w-auto" onClick={() => setNoteModalOpen(true)} disabled={busy}>
                      Agregar nota
                    </Button>
                    <Button variant="outline" className="min-h-11 w-full md:w-auto" onClick={() => setDeadlineModalOpen(true)} disabled={busy || isSealed}>
                      Plazo de descargos
                    </Button>
                    <Button className="min-h-11 w-full md:w-auto" onClick={() => setDescargosModalOpen(true)} disabled={busy || isSealed}>
                      Registrar descargos
                    </Button>
                    <Button className="min-h-11 w-full md:w-auto" onClick={() => setDecisionModalOpen(true)} disabled={busy || isSealed}>
                      Decisión
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <div className="rounded-lg border border-emerald-200 bg-linear-to-r from-emerald-50 to-teal-50 p-4 dark:border-emerald-900/40 dark:from-slate-950 dark:to-slate-900">
                    <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">Descargos</div>
                    <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                      {hasDescargos ? 'Registrados' : 'Pendientes'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {item.descargos_due_at ? `Límite: ${new Date(item.descargos_due_at).toLocaleString()}` : 'Sin límite configurado'}
                      {item.descargos_overdue ? (
                        <div className="mt-1 text-rose-700 dark:text-rose-200">Vencido.</div>
                      ) : null}
                    </div>
                    {descargosEvents.length > 0 ? (
                      <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">
                        {descargosEvents[0].text}
                      </div>
                    ) : null}
                    <div className="mt-3 flex justify-end">
                      <Button size="sm" onClick={() => setDescargosModalOpen(true)} disabled={busy || isSealed}>
                        Abrir
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-indigo-200 bg-linear-to-r from-indigo-50 to-violet-50 p-4 dark:border-indigo-900/40 dark:from-slate-950 dark:to-slate-900">
                    <div className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">Decisión</div>
                    <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                      {item.decision_text?.trim() ? 'Registrada' : 'Pendiente'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {hasDescargos ? 'OK: Hay descargos' : 'Requiere descargos antes de decidir'}
                    </div>
                    {item.decision_text?.trim() ? (
                      <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">
                        {item.decision_text}
                      </div>
                    ) : null}
                    <div className="mt-3 flex justify-end">
                      <Button size="sm" onClick={() => setDecisionModalOpen(true)} disabled={busy || isSealed}>
                        Abrir
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-sky-200 bg-linear-to-r from-sky-50 to-indigo-50 p-4 dark:border-sky-900/40 dark:from-slate-950 dark:to-slate-900">
                    <div className="text-xs font-semibold text-sky-900 dark:text-sky-200">Asistente IA</div>
                    <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                      {activeManual ? 'Manual activo' : manualLoading ? 'Cargando manual…' : 'Sin manual activo'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {activeManual
                        ? `${activeManual.title}${activeManual.version ? ` v${activeManual.version}` : ''} · ${extractionStatusLabel(activeManual.extraction_status)}`
                        : 'Configura un manual para usar IA.'}
                    </div>
                    {latestSuggestion ? (
                      <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                        Última sugerencia: {suggestionStatusLabel(latestSuggestion.status)} · {new Date(latestSuggestion.created_at).toLocaleString()}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">Aún no hay sugerencias.</div>
                    )}
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAiModalOpen(true)}
                        disabled={aiBusy || busy || isSealed || isParent}
                      >
                        Abrir
                      </Button>
                      <Button
                        size="sm"
                        onClick={async () => {
                          setAiModalOpen(true)
                          if (!activeManual || !hasDescargos) return
                          await handleGenerateAiSuggestion()
                        }}
                        disabled={aiBusy || busy || isSealed || !hasDescargos || isParent || !activeManual}
                        title={!hasDescargos ? 'Requiere descargos antes de sugerir' : undefined}
                      >
                        {aiBusy ? 'Generando…' : 'Sugerir'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <Modal
                isOpen={noteModalOpen}
                onClose={() => setNoteModalOpen(false)}
                title="Agregar nota"
                description="Registra una nota aclaratoria en la bitácora del caso."
                loading={busy}
                footer={
                  <>
                    <Button variant="outline" onClick={() => setNoteModalOpen(false)} disabled={busy}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={async () => {
                        const ok = await handleAddNote()
                        if (ok) setNoteModalOpen(false)
                      }}
                      disabled={busy}
                    >
                      Agregar nota
                    </Button>
                  </>
                }
              >
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div>
                    <Label>Nota</Label>
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      className="mt-2 w-full min-h-32 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                      placeholder="Registrar nota aclaratoria"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notas recientes</div>
                      <Button variant="outline" size="sm" onClick={() => setActiveTab('log')}>
                        Ver en bitácora
                      </Button>
                    </div>

                    {notesEvents.length === 0 ? (
                      <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                        Aún no hay notas.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {notesEvents.slice(0, 5).map((e) => (
                          <div key={e.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs text-slate-500 dark:text-slate-400">{new Date(e.created_at).toLocaleString()}</div>
                              {canEditOrDeleteEvent(e) ? (
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    className="text-xs text-slate-600 underline underline-offset-2 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                                    onClick={() => openEditEvent(e)}
                                    disabled={busy || isSealed}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="text-xs text-rose-700 underline underline-offset-2 hover:text-rose-800 dark:text-rose-200 dark:hover:text-rose-100"
                                    onClick={() => requestDeleteEvent(e.id)}
                                    disabled={busy || isSealed}
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              ) : null}
                            </div>
                            <div className="mt-1 whitespace-pre-wrap text-slate-800 dark:text-slate-100">{e.text}</div>
                          </div>
                        ))}
                        {notesEvents.length > 5 ? (
                          <div className="text-xs text-slate-500 dark:text-slate-400">Hay más registros en Bitácora.</div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </Modal>

              <Modal
                isOpen={deadlineModalOpen}
                onClose={() => setDeadlineModalOpen(false)}
                title="Plazo de descargos"
                description="Define o elimina el límite de tiempo para presentar descargos."
                loading={busy}
                footer={
                  <>
                    <Button variant="outline" onClick={() => setDeadlineModalOpen(false)} disabled={busy}>
                      Cancelar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        setDeadlineLocal('')
                        const ok = await handleSaveDeadline()
                        if (ok) setDeadlineModalOpen(false)
                      }}
                      disabled={busy || isSealed}
                    >
                      Quitar plazo
                    </Button>
                    <Button
                      onClick={async () => {
                        const ok = await handleSaveDeadline()
                        if (ok) setDeadlineModalOpen(false)
                      }}
                      disabled={busy || isSealed}
                    >
                      Guardar
                    </Button>
                  </>
                }
              >
                <div className="space-y-2">
                  <Label>Fecha y hora</Label>
                  <Input
                    type="datetime-local"
                    value={deadlineLocal}
                    onChange={(e) => setDeadlineLocal(e.target.value)}
                    disabled={busy || isSealed}
                  />
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {item.descargos_due_at
                      ? `Límite actual: ${new Date(item.descargos_due_at).toLocaleString()}`
                      : 'Sin límite configurado'}
                    {item.descargos_overdue ? (
                      <div className="mt-1 text-rose-700 dark:text-rose-200">Vencido: no hay descargos y el plazo ya pasó.</div>
                    ) : null}
                  </div>
                </div>
              </Modal>

              <Modal
                isOpen={descargosModalOpen}
                onClose={() => setDescargosModalOpen(false)}
                title="Registrar descargos"
                description="Versión libre y espontánea del estudiante (puedes adjuntar un archivo)."
                loading={busy}
                size="lg"
                footer={
                  <>
                    <Button variant="outline" onClick={() => setDescargosModalOpen(false)} disabled={busy}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={async () => {
                        const ok = await handleRecordDescargos()
                        if (ok) setDescargosModalOpen(false)
                      }}
                      disabled={busy || isSealed}
                    >
                      Guardar descargos
                    </Button>
                  </>
                }
              >
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Texto</Label>
                    <textarea
                      value={descargosText}
                      onChange={(e) => setDescargosText(e.target.value)}
                      className="w-full min-h-44 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                      placeholder="Escribe los descargos"
                      disabled={busy || isSealed}
                    />
                    <div className="space-y-2">
                      <Label>Adjuntar archivo (opcional)</Label>
                      <Input type="file" onChange={(e) => setDescargosFile(e.target.files?.[0] || null)} disabled={busy || isSealed} />
                    </div>
                    {descargosFile ? (
                      <div className="text-xs text-slate-500 dark:text-slate-400 break-all">Archivo: {descargosFile.name}</div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Descargos registrados</div>
                      <Button variant="outline" size="sm" onClick={() => setActiveTab('log')}>
                        Ver en bitácora
                      </Button>
                    </div>
                    {descargosEvents.length === 0 ? (
                      <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                        Aún no hay descargos.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {descargosEvents.slice(0, 5).map((e) => (
                          <div key={e.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs text-slate-500 dark:text-slate-400">{new Date(e.created_at).toLocaleString()}</div>
                              {canEditOrDeleteEvent(e) ? (
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    className="text-xs text-slate-600 underline underline-offset-2 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                                    onClick={() => openEditEvent(e)}
                                    disabled={busy || isSealed}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="text-xs text-rose-700 underline underline-offset-2 hover:text-rose-800 dark:text-rose-200 dark:hover:text-rose-100"
                                    onClick={() => requestDeleteEvent(e.id)}
                                    disabled={busy || isSealed}
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              ) : null}
                            </div>
                            <div className="mt-1 whitespace-pre-wrap text-slate-800 dark:text-slate-100">{e.text}</div>
                          </div>
                        ))}
                        {descargosEvents.length > 5 ? (
                          <div className="text-xs text-slate-500 dark:text-slate-400">Hay más registros en Bitácora.</div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </Modal>

              <Modal
                isOpen={decisionModalOpen}
                onClose={() => setDecisionModalOpen(false)}
                title="Decisión del caso"
                description="Registra la medida pedagógica o sanción. Solo se permite decidir si hay descargos."
                loading={busy}
                size="lg"
                footer={
                  <>
                    <Button variant="outline" onClick={() => setDecisionModalOpen(false)} disabled={busy}>
                      Cancelar
                    </Button>
                    {!isParent && !isSealed && item.status === 'DECIDED' && item.decision_text?.trim() ? (
                      <Button
                        variant="outline"
                        onClick={requestClearDecision}
                        disabled={busy}
                        className="border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-200 dark:hover:bg-rose-950/30"
                      >
                        Eliminar decisión
                      </Button>
                    ) : null}
                    <Button variant="outline" onClick={requestCloseCase} disabled={busy || isSealed}>
                      Cerrar caso
                    </Button>
                    <Button
                      onClick={async () => {
                        const ok = await handleDecide()
                        if (ok) setDecisionModalOpen(false)
                      }}
                      disabled={busy || isSealed || !hasDescargos}
                      title={!hasDescargos ? 'Requiere descargos antes de decidir' : undefined}
                    >
                      Guardar decisión
                    </Button>
                  </>
                }
              >
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Decisión</Label>
                    <textarea
                      value={decisionText}
                      onChange={(e) => setDecisionText(e.target.value)}
                      className="w-full min-h-48 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                      placeholder="Medida pedagógica o sanción (fundamento)"
                      disabled={busy || isSealed}
                    />
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {hasDescargos ? 'OK: Hay descargos' : 'Requiere descargos antes de decidir'}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Decisión registrada</div>
                    {item.decision_text?.trim() ? (
                      <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 whitespace-pre-wrap">
                        {item.decision_text}
                      </div>
                    ) : (
                      <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                        Aún no hay decisión.
                      </div>
                    )}
                    {latestSuggestion ? (
                      <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-900/40">
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Sugerencia IA disponible</div>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDecisionText(latestSuggestion.suggested_decision_text)
                            }}
                            disabled={busy || isSealed}
                          >
                            Copiar a decisión
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setAiModalOpen(true)}>
                            Ver detalle IA
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </Modal>

              <Modal
                isOpen={editEventModalOpen}
                onClose={() => setEditEventModalOpen(false)}
                title="Editar registro"
                description={editEventType === 'DESCARGOS' ? 'Edita el texto de los descargos.' : 'Edita el texto de la nota.'}
                loading={busy}
                size="lg"
                footer={
                  <>
                    <Button variant="outline" onClick={() => setEditEventModalOpen(false)} disabled={busy}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={async () => {
                        const ok = await handleUpdateEvent()
                        if (ok) setEditEventModalOpen(false)
                      }}
                      disabled={busy}
                    >
                      Guardar cambios
                    </Button>
                  </>
                }
              >
                <Label>Texto</Label>
                <textarea
                  value={editEventText}
                  onChange={(e) => setEditEventText(e.target.value)}
                  className="mt-2 w-full min-h-40 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                  placeholder="Escribe el texto"
                  disabled={busy || isSealed}
                />
              </Modal>

              <Modal
                isOpen={aiModalOpen}
                onClose={() => setAiModalOpen(false)}
                title="Asistente IA (Manual de Convivencia)"
                description="Genera una sugerencia con citas verificables del manual. El docente sugiere; el administrador aprueba y aplica."
                loading={aiBusy}
                size="xl"
                footer={
                  <>
                    <Button variant="outline" onClick={goToManualConfig} disabled={aiBusy}>
                      Configurar manual
                    </Button>
                    <Button variant="outline" onClick={() => setAiModalOpen(false)} disabled={aiBusy}>
                      Cerrar
                    </Button>
                    <Button
                      onClick={handleGenerateAiSuggestion}
                      disabled={aiBusy || busy || isSealed || !hasDescargos || isParent || !activeManual}
                      title={!hasDescargos ? 'Requiere descargos antes de sugerir' : undefined}
                    >
                      {aiBusy ? 'Generando…' : 'Generar sugerencia'}
                    </Button>
                  </>
                }
              >
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Manual activo</div>
                    <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                      {activeManual
                        ? `${activeManual.title}${activeManual.version ? ` v${activeManual.version}` : ''}`
                        : manualLoading
                          ? 'Cargando…'
                          : 'Sin manual activo'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {activeManual ? `Estado: ${extractionStatusLabel(activeManual.extraction_status)}` : 'Configura un manual para habilitar IA.'}
                    </div>
                    {(manualError || aiError) ? (
                      <div className="mt-3 text-sm text-rose-700 dark:text-rose-200">
                        {manualError || aiError}
                      </div>
                    ) : null}
                  </div>

                  {latestSuggestion ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                          Estado: {suggestionStatusLabel(latestSuggestion.status)}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{new Date(latestSuggestion.created_at).toLocaleString()}</span>
                      </div>

                      <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 whitespace-pre-wrap">
                        <div className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Decisión sugerida</div>
                        {latestSuggestion.suggested_decision_text}
                      </div>

                      {latestSuggestion.reasoning ? (
                        <div className="rounded-md bg-slate-50 p-4 text-xs text-slate-700 dark:bg-slate-900/40 dark:text-slate-200 whitespace-pre-wrap">
                          <div className="mb-2 font-semibold">Fundamento (resumen)</div>
                          {latestSuggestion.reasoning}
                        </div>
                      ) : null}

                      {Array.isArray(latestSuggestion.citations) && latestSuggestion.citations.length > 0 ? (
                        <div className="rounded-md bg-slate-50 p-4 dark:bg-slate-900/40">
                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Citas del manual (verificables)</div>
                          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                            {latestSuggestion.citations.map((c, idx) => (
                              <div key={`${c.chunk_id}-${idx}`} className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                                <div className="font-medium">Fragmento {c.chunk_id}{c.label ? ` · ${c.label}` : ''}</div>
                                <div className="mt-2 whitespace-pre-wrap text-slate-600 dark:text-slate-300">“{c.quote}”</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Sin citas: el manual no aportó fundamento suficiente en los fragmentos recuperados.
                        </div>
                      )}

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setDecisionText(latestSuggestion.suggested_decision_text)
                            setAiModalOpen(false)
                            setDecisionModalOpen(true)
                          }}
                          disabled={busy || isSealed}
                        >
                          Copiar a decisión
                        </Button>

                        {isAdmin ? (
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                              variant="outline"
                              onClick={handleApproveAiSuggestion}
                              disabled={aiBusy || busy || isSealed || latestSuggestion.status !== 'DRAFT'}
                            >
                              Aprobar
                            </Button>
                            <Button
                              onClick={async () => {
                                const ok = await handleApplyAiSuggestion()
                                if (ok) {
                                  setToast({ message: 'Decisión aplicada desde sugerencia IA.', type: 'success', isVisible: true })
                                }
                              }}
                              disabled={aiBusy || busy || isSealed || latestSuggestion.status !== 'APPROVED'}
                            >
                              Aplicar como decisión
                            </Button>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Solo un administrador puede aprobar y aplicar.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                      Genera una sugerencia para ver una propuesta con citas del manual.
                    </div>
                  )}
                </div>
              </Modal>
            </CardContent>
          </Card>
        )}
      </div>

      <div className={activeTab === 'guardian' ? 'block' : 'hidden'}>
        <Card>
          <CardHeader>
            <CardTitle>Notificación a acudiente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Última notificación: {item.notified_guardian_at ? new Date(item.notified_guardian_at).toLocaleString() : '—'}
          </div>

          {!isParent && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Canal</Label>
                  <Input
                    value={notifyChannel}
                    onChange={(e) => setNotifyChannel(e.target.value)}
                    placeholder="Ej: IN_APP / WhatsApp / Llamada"
                    disabled={busy || isSealed}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nota (opcional)</Label>
                  <Input
                    value={notifyNote}
                    onChange={(e) => setNotifyNote(e.target.value)}
                    placeholder="Detalle de la notificación"
                    disabled={busy || isSealed}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleNotifyGuardian} disabled={busy || isSealed}>Registrar notificación</Button>
              </div>
            </>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-700 dark:text-slate-200">
              <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-linear-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-semibold">Fecha</th>
                  <th className="px-6 py-4 font-semibold">Canal</th>
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold">Destinatario</th>
                  <th className="px-6 py-4 font-semibold">Acuse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(item.notification_logs || []).map((l) => (
                  <tr key={l.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                    <td className="px-6 py-4">{new Date(l.created_at).toLocaleString()}</td>
                    <td className="px-6 py-4">{l.channel || '-'}</td>
                    <td className="px-6 py-4">{l.status}</td>
                    <td className="px-6 py-4">
                      <div>{l.recipient_name || '-'}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{l.recipient_contact || ''}</div>
                    </td>
                    <td className="px-6 py-4">{l.acknowledged_at ? new Date(l.acknowledged_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
                {(item.notification_logs || []).length === 0 && (
                  <tr>
                    <td className="px-6 py-6 text-slate-500 dark:text-slate-400" colSpan={5}>
                      Sin notificaciones registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {(item.notification_logs || []).length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Seleccionar notificación</Label>
                  <select
                    value={ackLogId}
                    onChange={(e) => setAckLogId(e.target.value)}
                    className="flex h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:scheme-dark"
                    disabled={busy}
                  >
                    <option value="">—</option>
                    {(item.notification_logs || []).map((l) => (
                      <option key={l.id} value={String(l.id)}>
                        #{l.id} • {l.status} • {l.recipient_name || '-'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Nota de acuse (opcional)</Label>
                  <Input
                    value={ackNote}
                    onChange={(e) => setAckNote(e.target.value)}
                    placeholder="Ej: acudiente confirma recepción"
                    disabled={busy}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleAcknowledge} disabled={busy}>Registrar acuse</Button>
              </div>
            </div>
          )}
          </CardContent>
        </Card>
      </div>

      <div className={activeTab === 'participants' ? 'block' : 'hidden'}>
        <Card>
          <CardHeader>
            <CardTitle>Participantes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
          {!isParent && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Buscar estudiante</Label>
                  <div className="relative">
                    <Input
                      value={participantStudentQuery}
                      onChange={(e) => {
                        const v = e.target.value
                        setParticipantStudentQuery(v)
                        if (!/^\d+$/.test(v.trim())) setParticipantStudentId('')
                      }}
                      onFocus={() => {
                        if (participantStudentQuery.trim().length >= 2 && !busy && !isSealed) setParticipantStudentDropdownOpen(true)
                      }}
                      onBlur={() => {
                        window.setTimeout(() => setParticipantStudentDropdownOpen(false), 150)
                      }}
                      placeholder="Escribe nombre, apellido o documento… (o pega el ID)"
                      disabled={busy || isSealed}
                    />

                    {participantStudentDropdownOpen && !busy && !isSealed && (
                      <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
                        <div className="max-h-64 overflow-y-auto py-1">
                          {participantStudentSearchError ? (
                            <div className="px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
                              {participantStudentSearchError}
                            </div>
                          ) : participantStudentSearching ? (
                            <div className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                              Buscando…
                            </div>
                          ) : participantStudentResults.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                              Sin resultados.
                            </div>
                          ) : (
                            participantStudentResults.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handlePickParticipantStudent(s)}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="font-medium text-slate-900 dark:text-slate-100">
                                    {studentDisplayName(s)}
                                  </div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400">#{s.id}</div>
                                </div>
                                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                  {s.document_number ? `Doc: ${s.document_number}` : '—'}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {participantStudentId ? `ID seleccionado: #${participantStudentId}` : 'Selecciona un estudiante para autollenar el ID.'}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Rol</Label>
                  <select
                    value={participantRole}
                    onChange={(e) => setParticipantRole(e.target.value)}
                    className="flex h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:scheme-dark"
                    disabled={busy || isSealed}
                  >
                    <option value="ALLEGED_AGGRESSOR">Presunto agresor</option>
                    <option value="ALLEGED_VICTIM">Presunta víctima</option>
                    <option value="WITNESS">Testigo</option>
                    <option value="OTHER">Otro</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Notas (opcional)</Label>
                  <Input
                    value={participantNotes}
                    onChange={(e) => setParticipantNotes(e.target.value)}
                    disabled={busy || isSealed}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleAddParticipant} disabled={busy || isSealed}>Agregar participante</Button>
              </div>
            </>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-700 dark:text-slate-200">
              <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-linear-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-semibold">Estudiante</th>
                  <th className="px-6 py-4 font-semibold">Rol</th>
                  <th className="px-6 py-4 font-semibold">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(item.participants || []).map((p) => (
                  <tr key={p.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                    <td className="px-6 py-4">#{p.student_id}</td>
                    <td className="px-6 py-4">{p.role}</td>
                    <td className="px-6 py-4">{p.notes || '-'}</td>
                  </tr>
                ))}
                {(item.participants || []).length === 0 && (
                  <tr>
                    <td className="px-6 py-6 text-slate-500 dark:text-slate-400" colSpan={3}>
                      Sin participantes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </CardContent>
        </Card>
      </div>

      <div className={activeTab === 'attachments' ? 'block' : 'hidden'}>
        <Card>
          <CardHeader>
            <CardTitle>Adjuntos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
          {!isParent && (
            <>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Carga rápida de evidencias</div>
                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      Sube varias fotos, videos o audios de una sola vez.
                    </div>
                  </div>
                  {quickUploading ? (
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      Subiendo {quickUploadDone}/{quickUploadTotal}…
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end">
                  <div className="flex-1">
                    <Label>Archivos</Label>
                    <Input
                      type="file"
                      multiple
                      accept="image/*,video/*,audio/*"
                      disabled={busy || isSealed || quickUploading}
                      onChange={(e) => {
                        const incoming = Array.from(e.target.files || [])
                        if (incoming.length === 0) return
                        setQuickEvidenceFiles((prev) => {
                          const next = [...prev]
                          for (const f of incoming) {
                            const exists = next.some(
                              (x) => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified,
                            )
                            if (!exists) next.push(f)
                          }
                          return next
                        })
                        e.currentTarget.value = ''
                      }}
                    />
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <span>
                        {quickEvidenceFiles.length > 0
                          ? `${quickEvidenceFiles.length} archivo(s) seleccionado(s)`
                          : 'Sin archivos seleccionados'}
                      </span>
                      {quickEvidenceFiles.length > 0 ? (
                        <button
                          type="button"
                          className="underline underline-offset-2"
                          onClick={() => setQuickEvidenceFiles([])}
                          disabled={busy || isSealed || quickUploading}
                        >
                          Limpiar
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleQuickEvidenceUpload}
                      disabled={busy || isSealed || quickUploading || quickEvidenceFiles.length === 0}
                    >
                      {quickUploading ? 'Subiendo…' : 'Subir evidencias'}
                    </Button>
                  </div>
                </div>

                {quickEvidenceFiles.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {quickEvidenceFiles.slice(0, 8).map((f) => {
                      const key = `${f.name}:${f.size}:${f.lastModified}`
                      return (
                        <li key={key} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950/40">
                          <span className="truncate text-slate-700 dark:text-slate-200" title={f.name}>
                            {f.name}
                          </span>
                          <button
                            type="button"
                            className="text-slate-600 underline underline-offset-2 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                            onClick={() =>
                              setQuickEvidenceFiles((prev) =>
                                prev.filter(
                                  (x) => !(x.name === f.name && x.size === f.size && x.lastModified === f.lastModified),
                                ),
                              )
                            }
                            disabled={busy || isSealed || quickUploading}
                          >
                            Quitar
                          </button>
                        </li>
                      )
                    })}
                    {quickEvidenceFiles.length > 8 ? (
                      <li className="text-xs text-slate-600 dark:text-slate-300">…</li>
                    ) : null}
                  </ul>
                ) : null}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <select
                    value={attachmentKind}
                    onChange={(e) => setAttachmentKind(e.target.value)}
                    className="flex h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:scheme-dark"
                    disabled={busy || isSealed}
                  >
                    <option value="EVIDENCE">Evidencia</option>
                    <option value="DESCARGOS">Descargos</option>
                    <option value="NOTIFICATION">Notificación</option>
                    <option value="OTHER">Otro</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Descripción (opcional)</Label>
                  <Input
                    value={attachmentDescription}
                    onChange={(e) => setAttachmentDescription(e.target.value)}
                    disabled={busy || isSealed}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Archivo</Label>
                  <Input
                    type="file"
                    onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                    disabled={busy || isSealed}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleAddAttachment} disabled={busy || isSealed}>Subir adjunto</Button>
              </div>
            </>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-700 dark:text-slate-200">
              <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-linear-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-semibold">Tipo</th>
                  <th className="px-6 py-4 font-semibold">Descripción</th>
                  <th className="px-6 py-4 font-semibold">Archivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(item.attachments || []).map((a) => (
                  <tr key={a.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                    <td className="px-6 py-4">{attachmentKindLabel(a.kind)}</td>
                    <td className="px-6 py-4">{a.description || '-'}</td>
                    <td className="px-6 py-4">
                      {a.file ? (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <a
                            href={a.file}
                            className="flex items-center gap-2 text-slate-800 hover:underline dark:text-slate-100"
                            target="_blank"
                            rel="noreferrer"
                            title="Ver archivo"
                          >
                            <span className={getFileTypeBadge(a.file).className}>{getFileTypeBadge(a.file).label}</span>
                            <span className="wrap-break-word">Ver archivo</span>
                          </a>
                          <div className="flex items-center gap-3">
                            <a
                              href={a.file}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-blue-600 hover:underline dark:text-blue-300"
                            >
                              Ver
                            </a>
                            <a
                              href={a.file}
                              download
                              className="text-xs text-blue-600 hover:underline dark:text-blue-300"
                            >
                              Descargar
                            </a>
                          </div>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
                {(item.attachments || []).length === 0 && (
                  <tr>
                    <td className="px-6 py-6 text-slate-500 dark:text-slate-400" colSpan={3}>
                      Sin adjuntos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </CardContent>
        </Card>
      </div>

      <div className={activeTab === 'log' ? 'block' : 'hidden'}>
        <Card>
          <CardHeader>
            <CardTitle>Bitácora</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="space-y-3">
            {(item.events || []).map((e) => (
              <div key={e.id} className="border border-slate-200 dark:border-slate-700 rounded-md p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500 dark:text-slate-400">{e.event_type}</div>
                  <div className="flex items-center gap-2">
                    {canEditOrDeleteEvent(e) ? (
                      <>
                        <button
                          type="button"
                          className="text-xs text-slate-600 underline underline-offset-2 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                          onClick={() => openEditEvent(e)}
                          disabled={busy || isSealed}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="text-xs text-rose-700 underline underline-offset-2 hover:text-rose-800 dark:text-rose-200 dark:hover:text-rose-100"
                          onClick={() => requestDeleteEvent(e.id)}
                          disabled={busy || isSealed}
                        >
                          Eliminar
                        </button>
                      </>
                    ) : null}
                    <div className="text-xs text-slate-500 dark:text-slate-400">{new Date(e.created_at).toLocaleString()}</div>
                  </div>
                </div>
                {e.text && <div className="mt-2 text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap">{e.text}</div>}
              </div>
            ))}
            {(item.events || []).length === 0 && (
              <div className="text-sm text-slate-500 dark:text-slate-400">Sin eventos.</div>
            )}
          </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmationModal
        isOpen={confirmOpen}
        onClose={() => {
          if (busy) return
          setConfirmOpen(false)
        }}
        onConfirm={() => {
          if (!confirmAction) return
          confirmAction().catch(() => {
            // handled inside action
          })
        }}
        title={confirmTitle}
        description={confirmDescription}
        confirmText={confirmConfirmText}
        cancelText="Cancelar"
        variant={confirmVariant}
        loading={busy}
      />
    </div>
  )
}
