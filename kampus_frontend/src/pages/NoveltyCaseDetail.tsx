import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, UploadCloud } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { Toast, type ToastType } from '../components/ui/Toast'
import {
  noveltiesWorkflowApi,
  type NoveltyAttachment,
  type NoveltyCase,
  type NoveltyCaseTransition,
  type NoveltyReason,
  type NoveltyRequiredDocumentRule,
  type NoveltyType,
} from '../services/noveltiesWorkflow'
import { studentsApi, type Student } from '../services/students'

const getErrorDetail = (err: unknown): string | undefined => {
  if (typeof err !== 'object' || err === null) return undefined
  const maybe = err as { response?: { data?: { detail?: unknown } } }
  const detail = maybe.response?.data?.detail
  return typeof detail === 'string' ? detail : undefined
}

const statusLabel = (s: string) => {
  switch (s) {
    case 'DRAFT':
      return 'Borrador'
    case 'FILED':
      return 'Radicada'
    case 'IN_REVIEW':
      return 'En revisión'
    case 'PENDING_DOCS':
      return 'Pendiente docs'
    case 'APPROVED':
      return 'Aprobada'
    case 'REJECTED':
      return 'Rechazada'
    case 'EXECUTED':
      return 'Ejecutada'
    case 'REVERTED':
      return 'Revertida'
    case 'CLOSED':
      return 'Cerrada'
    default:
      return s
  }
}

const studentDisplayName = (s: Student): string => {
  const first = (s.user?.first_name || '').trim()
  const last = (s.user?.last_name || '').trim()
  const full = `${first} ${last}`.trim()
  return full || `Estudiante #${s.id}`
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

const resolveFileUrl = (file: string): string => {
  if (!file) return file
  if (/^https?:\/\//i.test(file)) return file
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
  if (file.startsWith('/')) return base + file
  return base + '/' + file
}

function unwrapList<T>(data: { results?: T[] } | T[]): T[] {
  if (Array.isArray(data)) return data
  return (data as { results?: T[] }).results || []
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

export default function NoveltyCaseDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const caseId = Number(id)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [novelty, setNovelty] = useState<NoveltyCase | null>(null)
  const [student, setStudent] = useState<Student | null>(null)
  const [attachments, setAttachments] = useState<NoveltyAttachment[]>([])
  const [transitions, setTransitions] = useState<NoveltyCaseTransition[]>([])

  const [requiredRules, setRequiredRules] = useState<NoveltyRequiredDocumentRule[]>([])

  const [types, setTypes] = useState<NoveltyType[]>([])
  const [reasons, setReasons] = useState<NoveltyReason[]>([])

  const [comment, setComment] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState('')

  const [docTypeChoice, setDocTypeChoice] = useState('')
  const [docTypeOther, setDocTypeOther] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const resolvedDocType = useMemo(() => {
    if (docTypeChoice === '__other__') return docTypeOther.trim()
    return docTypeChoice.trim()
  }, [docTypeChoice, docTypeOther])

  const typeById = useMemo(() => {
    const m = new Map<number, NoveltyType>()
    for (const t of types) m.set(t.id, t)
    return m
  }, [types])

  const reasonById = useMemo(() => {
    const m = new Map<number, NoveltyReason>()
    for (const r of reasons) m.set(r.id, r)
    return m
  }, [reasons])

  useEffect(() => {
    let mounted = true

    ;(async () => {
      try {
        const [tRes, rRes] = await Promise.all([
          noveltiesWorkflowApi.listTypes(),
          noveltiesWorkflowApi.listReasons({ is_active: true }),
        ])
        if (!mounted) return
        setTypes(tRes.items)
        setReasons(rRes.items)
      } catch {
        // best-effort
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!caseId) return

    setLoading(true)
    try {
      const res = await noveltiesWorkflowApi.getCase(caseId)
      setNovelty(res.data)

      try {
        const rulesRes = await noveltiesWorkflowApi.listRequiredDocumentRules({
          novelty_type: res.data.novelty_type,
          is_required: true,
        })
        const rules = unwrapList(rulesRes.data)
        const applicable = rules.filter((r) => r.novelty_reason == null || r.novelty_reason === res.data.novelty_reason)
        setRequiredRules(applicable)
      } catch {
        setRequiredRules([])
      }

      try {
        const [aRes, tRes] = await Promise.all([
          noveltiesWorkflowApi.listAttachments(caseId),
          noveltiesWorkflowApi.listTransitions(caseId),
        ])
        setAttachments(unwrapList(aRes.data))
        setTransitions(unwrapList(tRes.data))
      } catch {
        // best-effort
      }

      try {
        const sRes = await studentsApi.get(res.data.student)
        setStudent(sRes.data)
      } catch {
        setStudent(null)
      }
    } catch (err) {
      showToast(getErrorDetail(err) || 'No se pudo cargar el caso', 'error')
      setNovelty(null)
    } finally {
      setLoading(false)
    }
  }, [caseId])

  useEffect(() => {
    if (!caseId) return

    if (!idempotencyKey) {
      try {
        const generated = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())
        setIdempotencyKey(generated)
      } catch {
        setIdempotencyKey(String(Date.now()))
      }
    }

    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  const headerTitle = useMemo(() => {
    if (!novelty) return 'Caso'
    return novelty.radicado ? `Novedad ${novelty.radicado}` : `Novedad #${novelty.id}`
  }, [novelty])

  const noveltyTypeLabel = useMemo(() => {
    if (!novelty) return ''
    const t = typeById.get(novelty.novelty_type)
    if (!t) return `Tipo #${novelty.novelty_type}`
    return `${t.name} (${t.code})`
  }, [novelty, typeById])

  const noveltyReasonLabel = useMemo(() => {
    if (!novelty?.novelty_reason) return ''
    const r = reasonById.get(novelty.novelty_reason)
    return r ? r.name : `Motivo #${novelty.novelty_reason}`
  }, [novelty?.novelty_reason, reasonById])

  const noveltyTypeCode = useMemo(() => {
    if (!novelty) return ''
    return (typeById.get(novelty.novelty_type)?.code || '').trim().toLowerCase()
  }, [novelty, typeById])

  const isRetiro = noveltyTypeCode === 'retiro'
  const isGraduacion = noveltyTypeCode === 'graduacion'

  const doTransition = useCallback(
    async (action: string, opts?: { requireComment?: boolean; execute?: boolean; revert?: boolean }) => {
      if (!novelty) return

      const typeCode = (typeById.get(novelty.novelty_type)?.code || '').trim().toLowerCase()
      let text = comment.trim()

      // UX: for retiro, avoid forcing the user to type comments.
      // Backend requires non-empty comment for approve/execute.
      if (opts?.requireComment && !text && (typeCode === 'retiro' || typeCode === 'graduacion')) {
        const tag = typeCode === 'retiro' ? 'retiro' : 'graduación'
        if (opts.execute || action === 'execute') text = `Ejecución automática (${tag})`
        else if (action === 'approve') text = `Aprobación automática (${tag})`
        else if (opts.revert || action === 'revert') text = `Reversión automática (${tag})`
      }

      // UX: executing always needs a backend comment, but we don't want to block the user.
      if ((opts?.execute || action === 'execute') && !text) {
        text = typeCode === 'retiro' ? 'Ejecución automática (retiro)' : 'Ejecución automática'
      }

      if (opts?.requireComment && !text) {
        showToast('Debes escribir un comentario', 'info')
        return
      }

      setSaving(true)
      try {
        if (opts?.execute) {
          await noveltiesWorkflowApi.execute(novelty.id, {
            comment: text,
            idempotency_key: idempotencyKey || undefined,
          })
        } else if (opts?.revert) {
          await noveltiesWorkflowApi.revert(novelty.id, { comment: text })
        } else {
          await noveltiesWorkflowApi.transition(novelty.id, action, { comment: text })
        }

        showToast('Acción aplicada', 'success')
        setComment('')
        await refresh()
      } catch (err) {
        showToast(getErrorDetail(err) || 'No se pudo aplicar la acción', 'error')
      } finally {
        setSaving(false)
      }
    },
    [comment, idempotencyKey, novelty, refresh, typeById]
  )

  const upload = async () => {
    if (!novelty) return
    if (!resolvedDocType || !file) {
      showToast('Selecciona el tipo de soporte y el archivo', 'info')
      return
    }

    setSaving(true)
    try {
      await noveltiesWorkflowApi.uploadAttachment({ caseId: novelty.id, doc_type: resolvedDocType, file })
      setDocTypeChoice('')
      setDocTypeOther('')
      setFile(null)
      showToast('Adjunto cargado', 'success')
      await refresh()
    } catch (err) {
      showToast(getErrorDetail(err) || 'No se pudo cargar el adjunto', 'error')
    } finally {
      setSaving(false)
    }
  }

  type CaseAction = {
    label: string
    variant?: 'default' | 'outline' | 'destructive'
    disabled?: boolean
    onClick: () => void
  }
  const requiredDocTypes = useMemo(() => {
    if (isGraduacion) return []
    const types = requiredRules.filter((r) => r.is_required).map((r) => (r.doc_type || '').trim()).filter(Boolean)
    return Array.from(new Set(types)).sort()
  }, [isGraduacion, requiredRules])

  const presentDocTypes = useMemo(() => {
    const present = attachments.map((a) => (a.doc_type || '').trim()).filter(Boolean)
    return new Set(present)
  }, [attachments])

  const missingDocTypes = useMemo(() => {
    if (requiredDocTypes.length === 0) return []
    return requiredDocTypes.filter((t) => !presentDocTypes.has(t))
  }, [presentDocTypes, requiredDocTypes])

  const docTypeOptions = useMemo(() => {
    // Prefer showing missing required documents first, then defaults, then the rest.
    const order: string[] = [
      ...missingDocTypes,
      ...DEFAULT_DOC_TYPES,
      ...requiredDocTypes,
      ...Array.from(presentDocTypes),
    ]

    const seen = new Set<string>()
    const out: string[] = []

    for (const raw of order) {
      const t = (raw || '').trim()
      if (!t) continue
      if (seen.has(t)) continue
      seen.add(t)
      out.push(t)
    }

    return out
  }, [missingDocTypes, presentDocTypes, requiredDocTypes])

  const actions = useMemo(() => {
    const s = novelty?.status
    if (!s) return [] as CaseAction[]

    const out: CaseAction[] = []

    if (s === 'DRAFT') out.push({ label: 'Radicar', onClick: () => doTransition('file') })

    if (s === 'FILED') {
      out.push({ label: 'Enviar a revisión', variant: 'outline', onClick: () => doTransition('send-to-review') })
      out.push({ label: 'Pendiente docs', variant: 'outline', onClick: () => doTransition('mark-pending-docs') })
      out.push({ label: 'Rechazar', variant: 'destructive', onClick: () => doTransition('reject') })
    }

    if (s === 'IN_REVIEW') {
      out.push({ label: 'Aprobar', onClick: () => doTransition('approve') })
      out.push({ label: 'Pendiente docs', variant: 'outline', onClick: () => doTransition('mark-pending-docs') })
      out.push({ label: 'Rechazar', variant: 'destructive', onClick: () => doTransition('reject', { requireComment: true }) })
    }

    if (s === 'PENDING_DOCS') {
      out.push({ label: 'Enviar a revisión', variant: 'outline', onClick: () => doTransition('send-to-review') })
      out.push({ label: 'Rechazar', variant: 'destructive', onClick: () => doTransition('reject', { requireComment: true }) })
    }

    if (s === 'APPROVED') {
      const hasMissingDocs = missingDocTypes.length > 0
      out.push({
        label: 'Ejecutar',
        disabled: hasMissingDocs,
        onClick: () => {
          if (hasMissingDocs) {
            showToast(`No se puede ejecutar: faltan soportes: ${missingDocTypes.join(', ')}`, 'info')
            return
          }
          void doTransition('execute', { execute: true })
        },
      })
      out.push({ label: 'Cerrar', variant: 'outline', onClick: () => doTransition('close') })
    }

    if (s === 'EXECUTED') {
      out.push({ label: 'Revertir', variant: 'destructive', onClick: () => doTransition('revert', { requireComment: true, revert: true }) })
      out.push({ label: 'Cerrar', variant: 'outline', onClick: () => doTransition('close') })
    }

    if (s === 'REVERTED') {
      out.push({ label: 'Cerrar', variant: 'outline', onClick: () => doTransition('close') })
    }

    if (s === 'REJECTED') {
      out.push({ label: 'Cerrar', variant: 'outline', onClick: () => doTransition('close') })
    }

    return out
  }, [doTransition, missingDocTypes, novelty?.status])

  if (!caseId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="text-sm text-slate-600 dark:text-slate-400">ID inválido</div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={() => navigate('/novelties')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver
          </Button>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">{headerTitle}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9" disabled={loading} onClick={refresh}>
            Actualizar
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="mt-6">
          <CardContent className="py-10 text-center text-slate-500 dark:text-slate-400">Cargando…</CardContent>
        </Card>
      ) : !novelty ? (
        <Card className="mt-6">
          <CardContent className="py-10 text-center text-slate-500 dark:text-slate-400">No se encontró el caso</CardContent>
        </Card>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Resumen</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Estado</div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{statusLabel(novelty.status)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Estudiante</div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {student ? studentDisplayName(student) : `#${novelty.student}`}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">ID: {novelty.student}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Tipo / Motivo</div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {noveltyTypeLabel}{noveltyReasonLabel ? ` • ${noveltyReasonLabel}` : ''}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Fechas</div>
                    <div className="text-sm text-slate-700 dark:text-slate-200">Creación: {new Date(novelty.created_at).toLocaleString()}</div>
                    {novelty.effective_date ? (
                      <div className="text-sm text-slate-700 dark:text-slate-200">Efectiva: {novelty.effective_date}</div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Payload</div>
                  <pre className="mt-1 text-xs bg-slate-50 border border-slate-200 rounded-md p-3 overflow-auto dark:bg-slate-950 dark:border-slate-800 dark:text-slate-200">
                    {JSON.stringify(novelty.payload || {}, null, 2)}
                  </pre>
                </div>

                <div className="mt-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Checklist de soportes</div>
                  {requiredDocTypes.length === 0 ? (
                    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">No hay soportes obligatorios configurados para este tipo.</div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <div className="text-sm">
                        {missingDocTypes.length === 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-300">Completado</span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-300">Faltan {missingDocTypes.length} soporte(s)</span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {requiredDocTypes.map((dt) => {
                          const ok = presentDocTypes.has(dt)
                          return (
                            <div
                              key={dt}
                              className={
                                'flex items-center justify-between gap-2 rounded-md border px-3 py-2 ' +
                                (ok
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200'
                                  : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200')
                              }
                            >
                              <div>
                                <div className="text-sm font-semibold">{docTypeLabel(dt)}</div>
                                <div className="text-[11px] opacity-80">{dt}</div>
                              </div>
                              <div className="text-xs font-semibold">{ok ? 'OK' : 'Falta'}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Acciones</CardTitle>
              </CardHeader>
              <CardContent>
                {isRetiro || isGraduacion ? (
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    {isRetiro
                      ? 'Para retiro, el sistema usa comentarios automáticos para aprobar/ejecutar.'
                      : 'Para graduación, el sistema usa comentarios automáticos para aprobar/ejecutar y no exige adjuntos.'}
                  </div>
                ) : (
                  <>
                    <Label>Comentario</Label>
                    <textarea
                      className="mt-1 w-full min-h-[90px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Opcional (obligatorio para ejecutar/revertir)"
                    />
                  </>
                )}

                <div className="mt-4 flex flex-col gap-2">
                  {actions.length === 0 ? (
                    <div className="text-sm text-slate-500 dark:text-slate-400">No hay acciones disponibles</div>
                  ) : (
                    actions.map((a) => (
                      <Button
                        key={a.label}
                        variant={a.variant || 'default'}
                        disabled={saving || Boolean(a.disabled)}
                        onClick={a.onClick}
                      >
                        {a.label}
                      </Button>
                    ))
                  )}
                </div>

                {novelty.status === 'APPROVED' && missingDocTypes.length ? (
                  <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
                    <div className="font-semibold">Ejecución bloqueada</div>
                    <div className="mt-1">Faltan soportes obligatorios: {missingDocTypes.map(docTypeLabel).join(', ')}</div>
                  </div>
                ) : null}

                {novelty.execution ? (
                  <div className="mt-5 text-xs text-slate-600 dark:text-slate-300">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">Ejecución</div>
                    <div>{new Date(novelty.execution.executed_at).toLocaleString()}</div>
                  </div>
                ) : null}

                {novelty.reversion ? (
                  <div className="mt-4 text-xs text-slate-600 dark:text-slate-300">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">Reversión</div>
                    <div>{new Date(novelty.reversion.reverted_at).toLocaleString()}</div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Adjuntos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div className="md:col-span-1">
                    <Label>Tipo de soporte</Label>
                    <select
                      className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      value={docTypeChoice}
                      disabled={saving}
                      onChange={(e) => {
                        const v = e.target.value
                        setDocTypeChoice(v)
                        if (v !== '__other__') setDocTypeOther('')
                      }}
                    >
                      <option value="">Selecciona…</option>
                      {docTypeOptions.map((dt) => (
                        <option key={dt} value={dt}>
                          {docTypeLabel(dt)}
                        </option>
                      ))}
                      <option value="__other__">Otro…</option>
                    </select>

                    {docTypeChoice === '__other__' ? (
                      <Input
                        value={docTypeOther}
                        onChange={(e) => setDocTypeOther(e.target.value)}
                        className="mt-2"
                        placeholder="Ej: carta_retiro"
                      />
                    ) : null}

                    {missingDocTypes.length ? (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Sugeridos: {missingDocTypes.slice(0, 3).map(docTypeLabel).join(', ')}
                        {missingDocTypes.length > 3 ? '…' : ''}
                      </div>
                    ) : null}
                  </div>
                  <div className="md:col-span-2">
                    <Label>Archivo</Label>
                    <Input
                      type="file"
                      className="mt-1"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <Button variant="outline" onClick={upload} disabled={saving}>
                    <UploadCloud className="h-4 w-4 mr-2" />
                    Cargar adjunto
                  </Button>
                </div>

                <div className="mt-4 space-y-2">
                  {attachments.length === 0 ? (
                    <div className="text-sm text-slate-500 dark:text-slate-400">Sin adjuntos</div>
                  ) : (
                    attachments.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{docTypeLabel(a.doc_type)}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{getFileNameFromUrl(a.file)}</div>
                        </div>
                        <a
                          className="text-sm text-sky-700 hover:underline dark:text-sky-300"
                          href={resolveFileUrl(a.file)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Bitácora</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {transitions.length === 0 ? (
                    <div className="text-sm text-slate-500 dark:text-slate-400">Sin eventos</div>
                  ) : (
                    transitions.map((t) => (
                      <div key={t.id} className="rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {statusLabel(t.from_status)} → {statusLabel(t.to_status)}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{new Date(t.created_at).toLocaleString()}</div>
                        </div>
                        {t.actor_role ? (
                          <div className="text-xs text-slate-500 dark:text-slate-400">Rol: {t.actor_role}</div>
                        ) : null}
                        {t.comment ? (
                          <div className="mt-1 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{t.comment}</div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-4">
                  <Link to="/novelties">
                    <Button variant="link" className="px-0">
                      Ver bandeja
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((t) => ({ ...t, isVisible: false }))}
      />
    </div>
  )
}
