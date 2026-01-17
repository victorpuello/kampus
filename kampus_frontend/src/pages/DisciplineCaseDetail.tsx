import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { Toast, type ToastType } from '../components/ui/Toast'
import { useAuthStore } from '../store/auth'
import { disciplineApi, type DisciplineCaseDetail } from '../services/discipline'

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

export default function DisciplineCaseDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const user = useAuthStore((s) => s.user)

  const isParent = user?.role === 'PARENT'

  const caseId = Number(id)
  const [loading, setLoading] = useState(true)
  const [downloadingActa, setDownloadingActa] = useState(false)

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

  const [participantStudentId, setParticipantStudentId] = useState('')
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

  const isSealed = Boolean(item?.sealed_at)
  const status = item?.status || '—'

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, caseId])

  const handleRecordDescargos = async () => {
    if (!item) return
    const text = descargosText.trim()
    if (!text) return alert('Debes escribir los descargos')

    setBusy(true)
    try {
      await disciplineApi.recordDescargos(item.id, { text, ...(descargosFile ? { file: descargosFile } : {}) })
      setDescargosText('')
      setDescargosFile(null)
      await load()
    } catch (e: unknown) {
      console.error(e)
      alert(getErrorDetail(e) || 'Error registrando descargos')
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

  const handleDecide = async () => {
    if (!item) return
    const text = decisionText.trim()
    if (!text) return alert('Debes escribir la decisión')

    setBusy(true)
    try {
      await disciplineApi.decide(item.id, { decision_text: text })
      setDecisionText('')
      await load()
    } catch (e: unknown) {
      console.error(e)
      alert(getErrorDetail(e) || 'Error al decidir')
    } finally {
      setBusy(false)
    }
  }

  const handleClose = async () => {
    if (!item) return
    if (!confirm('¿Cerrar el caso?')) return

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

  const handleSaveDeadline = async () => {
    if (!item) return
    setBusy(true)
    try {
      if (!deadlineLocal) {
        await disciplineApi.setDescargosDeadline(item.id, { descargos_due_at: null })
      } else {
        const iso = new Date(deadlineLocal).toISOString()
        await disciplineApi.setDescargosDeadline(item.id, { descargos_due_at: iso })
      }
      await load()
    } catch (e: unknown) {
      console.error(e)
      alert(getErrorDetail(e) || 'Error actualizando plazo de descargos')
    } finally {
      setBusy(false)
    }
  }

  const handleAddNote = async () => {
    if (!item) return
    const text = noteText.trim()
    if (!text) return alert('Debes escribir una nota')

    setBusy(true)
    try {
      await disciplineApi.addNote(item.id, { text })
      setNoteText('')
      await load()
    } catch (e: unknown) {
      console.error(e)
      alert(getErrorDetail(e) || 'Error agregando nota')
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

  if (loading) return <div className="p-6 text-slate-600 dark:text-slate-300">Cargando…</div>
  if (error) return <div className="p-6 text-red-600 dark:text-rose-200">{error}</div>
  if (!item) return <div className="p-6 text-slate-600 dark:text-slate-300">Caso no encontrado</div>

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
          'whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-colors ' +
          (isActive
            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800')
        }
      >
        <span>{label}</span>
        {badge ? (
          <span
            className={
              'ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] ' +
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

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            <Link to="/discipline/cases" className="hover:underline">
              Convivencia
            </Link>
            <span className="mx-2">/</span>
            <span>Caso #{item.id}</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-1">{item.student_full_name}</h2>
          <p className="text-slate-500 dark:text-slate-400">{item.grade_name} / {item.group_name} • Año {item.academic_year ?? '-'}</p>

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

        <div className="flex gap-2">
          <button
            className="px-3 py-2 text-sm border border-slate-200 rounded-md bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            onClick={handleOpenActa}
            disabled={downloadingActa}
            type="button"
          >
            {downloadingActa ? 'Generando acta…' : 'Acta'}
          </button>
        </div>
      </div>

      <div className="sticky top-2 z-40">
        <div className="rounded-lg border border-slate-200 bg-white/80 p-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex items-center gap-2 overflow-x-auto">
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
            <div className="text-sm text-slate-600 dark:text-slate-300">Manual: {item.manual_severity} • Ley 1620: {item.law_1620_type}</div>
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
              <CardTitle>Acciones (MVP)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label>Nota aclaratoria</Label>
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      className="w-full min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                      placeholder="Registrar nota aclaratoria"
                    />
                    <div className="flex justify-end">
                      <Button onClick={handleAddNote} disabled={busy}>Agregar nota</Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Plazo de descargos</Label>
                    <div className="grid grid-cols-1 gap-3">
                      <Input
                        type="datetime-local"
                        value={deadlineLocal}
                        onChange={(e) => setDeadlineLocal(e.target.value)}
                        disabled={busy || isSealed}
                      />
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {item.descargos_due_at
                            ? `Límite actual: ${new Date(item.descargos_due_at).toLocaleString()}`
                            : 'Sin límite configurado'}
                          {item.descargos_overdue ? (
                            <div className="mt-1 text-red-600 dark:text-rose-200">Vencido: no hay descargos y el plazo ya pasó.</div>
                          ) : null}
                        </div>
                        <Button onClick={handleSaveDeadline} disabled={busy || isSealed}>
                          Guardar
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label>Registrar descargos</Label>
                    <textarea
                      value={descargosText}
                      onChange={(e) => setDescargosText(e.target.value)}
                      className="w-full min-h-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                      placeholder="Versión libre y espontánea del estudiante"
                      disabled={busy || isSealed}
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:items-end">
                      <div className="space-y-2">
                        <Label>Adjuntar archivo (opcional)</Label>
                        <Input
                          type="file"
                          onChange={(e) => setDescargosFile(e.target.files?.[0] || null)}
                          disabled={busy || isSealed}
                        />
                      </div>
                      <div className="flex justify-end sm:justify-start">
                        <Button onClick={handleRecordDescargos} disabled={busy || isSealed}>
                          Guardar descargos
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Decisión</Label>
                    <textarea
                      value={decisionText}
                      onChange={(e) => setDecisionText(e.target.value)}
                      className="w-full min-h-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                      placeholder="Medida pedagógica o sanción (fundamento)"
                      disabled={busy || isSealed}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {hasDescargos ? 'OK: Hay descargos' : 'Requiere descargos antes de decidir'}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button onClick={handleDecide} disabled={busy || isSealed || !hasDescargos}>
                          Decidir
                        </Button>
                        <Button variant="outline" onClick={handleClose} disabled={busy || isSealed}>
                          Cerrar
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Seleccionar notificación</Label>
                  <select
                    value={ackLogId}
                    onChange={(e) => setAckLogId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:scheme-dark"
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>ID Estudiante</Label>
                  <Input
                    value={participantStudentId}
                    onChange={(e) => setParticipantStudentId(e.target.value)}
                    placeholder="Ej: 123"
                    disabled={busy || isSealed}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rol</Label>
                  <select
                    value={participantRole}
                    onChange={(e) => setParticipantRole(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:scheme-dark"
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

                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <select
                    value={attachmentKind}
                    onChange={(e) => setAttachmentKind(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:scheme-dark"
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
                    <td className="px-6 py-4">{a.kind}</td>
                    <td className="px-6 py-4">{a.description || '-'}</td>
                    <td className="px-6 py-4">
                      {a.file ? (
                        <a
                          href={a.file}
                          className="text-blue-600 dark:text-blue-300 hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Descargar
                        </a>
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
                  <div className="text-xs text-slate-500 dark:text-slate-400">{new Date(e.created_at).toLocaleString()}</div>
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
    </div>
  )
}
