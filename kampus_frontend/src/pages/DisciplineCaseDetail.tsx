import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
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

export default function DisciplineCaseDetailPage() {
  const navigate = useNavigate()
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

  const [notifyChannel, setNotifyChannel] = useState('IN_APP')
  const [notifyNote, setNotifyNote] = useState('')
  const [ackLogId, setAckLogId] = useState('')
  const [ackNote, setAckNote] = useState('')

  const [deadlineLocal, setDeadlineLocal] = useState('')

  const [noteText, setNoteText] = useState('')

  const hasDescargos = useMemo(() => {
    return Boolean(item?.events?.some((e) => e.event_type === 'DESCARGOS'))
  }, [item?.events])

  const isSealed = Boolean(item?.sealed_at)

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
          <p className="text-slate-600">No tienes permisos para acceder al módulo de convivencia.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading) return <div className="p-6">Cargando…</div>
  if (error) return <div className="p-6 text-red-600">{error}</div>
  if (!item) return <div className="p-6 text-slate-600">Caso no encontrado</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">
            <Link to="/discipline/cases" className="hover:underline">
              Convivencia
            </Link>
            <span className="mx-2">/</span>
            <span>Caso #{item.id}</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{item.student_full_name}</h2>
          <p className="text-slate-500">{item.grade_name} / {item.group_name} • Año {item.academic_year ?? '-'}</p>

          {isSealed && (
            <div className="mt-2 text-xs text-slate-600">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-slate-200 text-slate-700">
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
            className="px-3 py-2 text-sm border border-slate-200 rounded-md bg-white hover:bg-slate-50"
            onClick={handleOpenActa}
            disabled={downloadingActa}
            type="button"
          >
            {downloadingActa ? 'Generando acta…' : 'Acta'}
          </button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hechos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-slate-600">Fecha: {new Date(item.occurred_at).toLocaleString()}</div>
          <div className="text-sm text-slate-600">Lugar: {item.location || '-'}</div>
          <div className="text-sm text-slate-600">Manual: {item.manual_severity} • Ley 1620: {item.law_1620_type}</div>
          <div className="border-t border-slate-200 pt-3 text-slate-800 whitespace-pre-wrap">{item.narrative}</div>
        </CardContent>
      </Card>

      {isSealed && (
        <Card>
          <CardHeader>
            <CardTitle>Sello / Cadena de custodia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-slate-600">
              Sellado: {item.sealed_at ? new Date(item.sealed_at).toLocaleString() : '—'}
            </div>
            <div className="text-sm text-slate-600 break-all">
              Hash (SHA-256): {item.sealed_hash || '—'}
            </div>
          </CardContent>
        </Card>
      )}

      {!isParent && (
        <Card>
          <CardHeader>
            <CardTitle>Acciones (MVP)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Nota aclaratoria</Label>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="w-full min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Registrar nota aclaratoria"
              />
              <div className="flex justify-end">
                <Button onClick={handleAddNote} disabled={busy}>Agregar nota</Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Plazo de descargos</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Input
                    type="datetime-local"
                    value={deadlineLocal}
                    onChange={(e) => setDeadlineLocal(e.target.value)}
                    disabled={busy || isSealed}
                  />
                  <div className="text-xs text-slate-500">
                    {item.descargos_due_at
                      ? `Límite actual: ${new Date(item.descargos_due_at).toLocaleString()}`
                      : 'Sin límite configurado'}
                  </div>
                  {item.descargos_overdue && (
                    <div className="text-xs text-red-600">Vencido: no hay descargos y el plazo ya pasó.</div>
                  )}
                </div>
                <div className="flex md:justify-end md:items-start">
                  <Button onClick={handleSaveDeadline} disabled={busy || isSealed}>
                    Guardar plazo
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Registrar descargos</Label>
              <textarea
                value={descargosText}
                onChange={(e) => setDescargosText(e.target.value)}
                className="w-full min-h-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Versión libre y espontánea del estudiante"
                disabled={busy || isSealed}
              />
              <div className="space-y-2">
                <Label>Adjuntar archivo (opcional)</Label>
                <Input
                  type="file"
                  onChange={(e) => setDescargosFile(e.target.files?.[0] || null)}
                  disabled={busy || isSealed}
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleRecordDescargos} disabled={busy || isSealed}>Guardar descargos</Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Decisión</Label>
              <textarea
                value={decisionText}
                onChange={(e) => setDecisionText(e.target.value)}
                className="w-full min-h-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Medida pedagógica o sanción (fundamento)"
                disabled={busy || isSealed}
              />
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  {hasDescargos ? 'OK: Hay descargos' : 'Requiere descargos antes de decidir'}
                </div>
                <Button onClick={handleDecide} disabled={busy || isSealed || !hasDescargos}>Decidir</Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={handleClose} disabled={busy || isSealed}>Cerrar caso</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Notificación a acudiente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-sm text-slate-600">
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
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">Fecha</th>
                  <th className="px-6 py-4 font-semibold">Canal</th>
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold">Destinatario</th>
                  <th className="px-6 py-4 font-semibold">Acuse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(item.notification_logs || []).map((l) => (
                  <tr key={l.id} className="bg-white hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">{new Date(l.created_at).toLocaleString()}</td>
                    <td className="px-6 py-4">{l.channel || '-'}</td>
                    <td className="px-6 py-4">{l.status}</td>
                    <td className="px-6 py-4">
                      <div>{l.recipient_name || '-'}</div>
                      <div className="text-xs text-slate-500">{l.recipient_contact || ''}</div>
                    </td>
                    <td className="px-6 py-4">{l.acknowledged_at ? new Date(l.acknowledged_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
                {(item.notification_logs || []).length === 0 && (
                  <tr>
                    <td className="px-6 py-6 text-slate-500" colSpan={5}>
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
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
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
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
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
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">Estudiante</th>
                  <th className="px-6 py-4 font-semibold">Rol</th>
                  <th className="px-6 py-4 font-semibold">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(item.participants || []).map((p) => (
                  <tr key={p.id} className="bg-white hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">#{p.student_id}</td>
                    <td className="px-6 py-4">{p.role}</td>
                    <td className="px-6 py-4">{p.notes || '-'}</td>
                  </tr>
                ))}
                {(item.participants || []).length === 0 && (
                  <tr>
                    <td className="px-6 py-6 text-slate-500" colSpan={3}>
                      Sin participantes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adjuntos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isParent && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <select
                    value={attachmentKind}
                    onChange={(e) => setAttachmentKind(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
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
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">Tipo</th>
                  <th className="px-6 py-4 font-semibold">Descripción</th>
                  <th className="px-6 py-4 font-semibold">Archivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(item.attachments || []).map((a) => (
                  <tr key={a.id} className="bg-white hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">{a.kind}</td>
                    <td className="px-6 py-4">{a.description || '-'}</td>
                    <td className="px-6 py-4">
                      {a.file ? (
                        <a
                          href={a.file}
                          className="text-blue-600 hover:underline"
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
                    <td className="px-6 py-6 text-slate-500" colSpan={3}>
                      Sin adjuntos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bitácora</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(item.events || []).map((e) => (
              <div key={e.id} className="border border-slate-200 rounded-md p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500">{e.event_type}</div>
                  <div className="text-xs text-slate-500">{new Date(e.created_at).toLocaleString()}</div>
                </div>
                {e.text && <div className="mt-2 text-sm text-slate-800 whitespace-pre-wrap">{e.text}</div>}
              </div>
            ))}
            {(item.events || []).length === 0 && (
              <div className="text-sm text-slate-500">Sin eventos.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
