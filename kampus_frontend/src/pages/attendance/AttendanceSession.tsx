import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import {
  bulkMarkAttendance,
  closeAttendanceSession,
  flushAttendanceOfflineQueue,
  getAttendanceRoster,
  type AttendanceBulkMarkItem,
  type AttendanceRosterResponse,
  type AttendanceStatus,
} from '../../services/attendance'

type DraftRow = {
  status: AttendanceStatus | null
  excuse_reason: string
}

function formatDateTime(value: string | null) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) return `${hours}:${mm}:${ss}`
  return `${mm}:${ss}`
}

function getInitials(fullName: string) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

function addHoursIso(iso: string, hours: number) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    d.setHours(d.getHours() + hours)
    return d.toISOString()
  } catch {
    return null
  }
}

type AxiosLikeError = {
  response?: {
    status?: unknown
    data?: unknown
  }
}

type AxiosErrorDataWithDetail = {
  detail?: unknown
}

function getAxiosStatus(err: unknown): number | null {
  const anyErr = err as AxiosLikeError
  const status = anyErr.response?.status
  return typeof status === 'number' ? status : null
}

function getAxiosDetail(err: unknown): string | null {
  const anyErr = err as AxiosLikeError
  const data = anyErr.response?.data as AxiosErrorDataWithDetail | undefined
  const detail = data?.detail
  return typeof detail === 'string' ? detail : null
}

export default function AttendanceSession() {
  const navigate = useNavigate()
  const params = useParams()

  const sessionId = useMemo(() => {
    const raw = params.id
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }, [params.id])

  const [data, setData] = useState<AttendanceRosterResponse | null>(null)
  const [draft, setDraft] = useState<Record<number, DraftRow>>({})

  const [currentIndex, setCurrentIndex] = useState(0)
  const [leaving, setLeaving] = useState<null | 'next' | 'prev'>(null)
  const [entering, setEntering] = useState(false)
  const [enterDir, setEnterDir] = useState<'next' | 'prev'>('next')
  const [excuseMode, setExcuseMode] = useState(false)
  const [excuseText, setExcuseText] = useState('')
  const excuseInputRef = useRef<HTMLInputElement | null>(null)

  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const dragStateRef = useRef<{ pointerId: number; startX: number; startY: number; lastX: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [releaseX, setReleaseX] = useState<number | null>(null)

  const [showCompletion, setShowCompletion] = useState(false)
  const prevIsLastCardRef = useRef(false)

  const [showLockedNotice, setShowLockedNotice] = useState(false)
  const [lockedNoticeText, setLockedNoticeText] = useState<string | null>(null)
  const autoCloseTimeoutFiredRef = useRef(false)
  const prevLockedRef = useRef(false)

  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const locked = !!data?.session.locked_at

  const load = async () => {
    if (!sessionId) return
    setLoading(true)
    setError(null)
    try {
      const res = await getAttendanceRoster(sessionId)
      setData(res)

      const nextDraft: Record<number, DraftRow> = {}
      for (const s of res.students) {
        nextDraft[s.enrollment_id] = {
          status: s.status,
          excuse_reason: s.excuse_reason || '',
        }
      }
      setDraft(nextDraft)

      // Reset UI cursor on reload.
      setCurrentIndex(0)
      setExcuseMode(false)
      setExcuseText('')
    } catch (err) {
      console.error(err)
      setError('No se pudo cargar la clase.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (loading) return

      // When excuse modal is open, use Enter/Escape.
      if (excuseMode) {
        if (e.key === 'Enter') {
          e.preventDefault()
          confirmExcuse()
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setExcuseMode(false)
          setExcuseText('')
        }
        return
      }

      if (locked) return
      if (saving) return

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
        return
      }

      // Quick mark: 1-4
      if (e.key === '1') {
        e.preventDefault()
        handleMark('PRESENT')
      } else if (e.key === '2') {
        e.preventDefault()
        handleMark('ABSENT')
      } else if (e.key === '3') {
        e.preventDefault()
        handleMark('TARDY')
      } else if (e.key === '4') {
        e.preventDefault()
        handleMark('EXCUSED')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, excuseMode, locked, saving, currentIndex, sessionId])

  const markAll = (status: AttendanceStatus) => {
    if (!data) return
    setDraft((prev) => {
      const next = { ...prev }
      for (const s of data.students) {
        next[s.enrollment_id] = {
          status,
          excuse_reason: next[s.enrollment_id]?.excuse_reason ?? '',
        }
      }
      return next
    })
  }

  const handleSave = async () => {
    if (!sessionId || !data) return
    if (locked) {
      setError('La clase está cerrada y no permite ediciones.')
      return
    }

    setError(null)
    setInfo(null)

    const records: AttendanceBulkMarkItem[] = []
    for (const s of data.students) {
      const d = draft[s.enrollment_id]
      const status: AttendanceStatus = (d?.status ?? 'PRESENT') as AttendanceStatus
      const excuse_reason = (d?.excuse_reason ?? '').trim()

      if (status === 'EXCUSED' && !excuse_reason) {
        setError(`La excusa requiere motivo: ${s.student_full_name}`)
        return
      }

      const item: AttendanceBulkMarkItem = { enrollment_id: s.enrollment_id, status }
      if (status === 'EXCUSED') item.excuse_reason = excuse_reason
      records.push(item)
    }

    setSaving(true)
    try {
      const res = await bulkMarkAttendance(sessionId, records)
      if (res.queued) {
        setInfo('Sin conexión: el envío quedó en cola offline. Puedes reintentar más tarde.')
        return
      }
      setInfo('Asistencia guardada.')
      await load()
    } catch (err) {
      console.error(err)
      setError('No se pudo guardar la asistencia.')
    } finally {
      setSaving(false)
    }
  }

  const students = data?.students ?? []
  const currentStudent = students[currentIndex] ?? null
  const nextStudent = students[currentIndex + 1] ?? null

  const isLastCard = students.length > 0 && currentIndex === students.length - 1
  const lateWindowEndsAt = useMemo(() => {
    const startsAt = data?.session?.starts_at
    if (!startsAt) return null
    return addHoursIso(startsAt, 1)
  }, [data?.session?.starts_at])

  const remainingToAutoCloseMs = useMemo(() => {
    if (!lateWindowEndsAt) return null
    const end = new Date(lateWindowEndsAt).getTime()
    if (!Number.isFinite(end)) return null
    return Math.max(0, end - nowMs)
  }, [lateWindowEndsAt, nowMs])

  // Live countdown ticker (1s) while the class is still open.
  useEffect(() => {
    if (!lateWindowEndsAt) return
    if (locked) return

    setNowMs(Date.now())
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [lateWindowEndsAt, locked])

  // Auto-refresh right when the 1-hour late window ends so the UI reflects the lock.
  useEffect(() => {
    autoCloseTimeoutFiredRef.current = false
    if (!data?.session?.starts_at) return
    if (locked) return

    const autoCloseAt = addHoursIso(data.session.starts_at, 1)
    if (!autoCloseAt) return

    const ms = new Date(autoCloseAt).getTime() - Date.now()
    if (!Number.isFinite(ms)) return

    const t = window.setTimeout(() => {
      autoCloseTimeoutFiredRef.current = true
      load()
    }, Math.max(0, ms + 250))

    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.session?.starts_at, locked, sessionId])

  // If the class becomes locked (auto or manual), notify the teacher.
  useEffect(() => {
    const wasLocked = prevLockedRef.current
    prevLockedRef.current = locked

    if (!wasLocked && locked) {
      const isAuto = autoCloseTimeoutFiredRef.current
      autoCloseTimeoutFiredRef.current = false

      setLockedNoticeText(
        isAuto
          ? 'La clase se cerró automáticamente (1 hora después del inicio). Ya no permite ediciones.'
          : 'La clase está cerrada. Ya no permite ediciones.'
      )
      setShowLockedNotice(true)
    }
  }, [locked])

  useEffect(() => {
    if (loading) return
    if (!students.length) return

    const wasLast = prevIsLastCardRef.current
    prevIsLastCardRef.current = isLastCard

    // Show the alert when the user *arrives* at the last card.
    if (!wasLast && isLastCard) {
      setShowCompletion(true)
    }
  }, [isLastCard, loading, students.length])

  const animateTo = (nextIndex: number, dir: 'next' | 'prev') => {
    if (nextIndex < 0 || nextIndex >= students.length) return
    setLeaving(dir)
    window.setTimeout(() => {
      setCurrentIndex(nextIndex)
      setLeaving(null)
      setEnterDir(dir)
      setEntering(true)
      window.setTimeout(() => setEntering(false), 220)
    }, 220)
  }

  const goNext = () => animateTo(Math.min(currentIndex + 1, students.length - 1), 'next')
  const goPrev = () => animateTo(Math.max(currentIndex - 1, 0), 'prev')

  const swipeTo = (dir: 'next' | 'prev') => {
    const nextIndex = dir === 'next' ? currentIndex + 1 : currentIndex - 1
    if (nextIndex < 0 || nextIndex >= students.length) return

    const width = typeof window !== 'undefined' ? window.innerWidth : 800
    setReleaseX(dir === 'next' ? -width : width)

    window.setTimeout(() => {
      setCurrentIndex(nextIndex)
      setReleaseX(null)
      setEnterDir(dir)
      setEntering(true)
      window.setTimeout(() => setEntering(false), 220)
    }, 220)
  }

  const setDragXThrottled = (x: number) => {
    if (rafRef.current) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      setDragX(x)
    })
  }

  const onSwipeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    swipeStartRef.current = { x: e.clientX, y: e.clientY }
    dragStateRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, lastX: e.clientX }
    setIsDragging(true)
    setReleaseX(null)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const onSwipeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current
    if (!st) return
    if (st.pointerId !== e.pointerId) return

    const dx = e.clientX - st.startX
    const dy = e.clientY - st.startY
    st.lastX = e.clientX

    // Only treat as horizontal drag if it's mostly horizontal.
    if (Math.abs(dx) < Math.abs(dy)) {
      return
    }

    // Clamp for nicer feel.
    const clamped = Math.max(-160, Math.min(160, dx))
    setDragXThrottled(clamped)
  }

  const onSwipeEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current
    swipeStartRef.current = null

    dragStateRef.current = null

    setIsDragging(false)
    setDragX(0)

    if (!start) return

    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) < 70) return
    if (Math.abs(dx) < Math.abs(dy)) return

    if (dx < 0) swipeTo('next')
    else swipeTo('prev')
  }

  const persistOne = async (input: AttendanceBulkMarkItem) => {
    if (!sessionId) return
    const res = await bulkMarkAttendance(sessionId, [input])
    if (res.queued) setInfo('Sin conexión: se guardó en cola offline y se reintentará luego.')
  }

  const applyLocalStudentUpdate = (enrollmentId: number, status: AttendanceStatus, excuse_reason?: string) => {
    setDraft((prev) => ({
      ...prev,
      [enrollmentId]: {
        status,
        excuse_reason: excuse_reason ?? prev[enrollmentId]?.excuse_reason ?? '',
      },
    }))

    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        students: prev.students.map((s) => {
          if (s.enrollment_id !== enrollmentId) return s
          const nowIso = new Date().toISOString()
          return {
            ...s,
            status,
            excuse_reason: excuse_reason ?? s.excuse_reason,
            tardy_at: status === 'TARDY' ? nowIso : null,
          }
        }),
      }
    })
  }

  const handleMark = async (status: AttendanceStatus) => {
    if (!currentStudent || !sessionId) return
    if (locked) {
      setError('La clase está cerrada y no permite ediciones.')
      return
    }

    setError(null)
    setInfo(null)

    const enrollmentId = currentStudent.enrollment_id

    if (status === 'EXCUSED') {
      setExcuseMode(true)
      setExcuseText(draft[enrollmentId]?.excuse_reason ?? '')
      window.setTimeout(() => excuseInputRef.current?.focus(), 0)
      return
    }

    setSaving(true)
    try {
      applyLocalStudentUpdate(enrollmentId, status)
      await persistOne({ enrollment_id: enrollmentId, status })

      // Tiny haptic feedback (mobile).
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(10)
        }
      } catch {
        // ignore
      }

      if (currentIndex < students.length - 1) goNext()
    } catch (err) {
      console.error(err)
      const httpStatus = getAxiosStatus(err)
      if (httpStatus === 409) {
        setError(getAxiosDetail(err) || 'La clase está cerrada y no permite ediciones.')
        await load()
        return
      }
      setError(getAxiosDetail(err) || 'No se pudo guardar el cambio.')
    } finally {
      setSaving(false)
    }
  }

  const confirmExcuse = async () => {
    if (!currentStudent || !sessionId) return
    if (locked) {
      setError('La clase está cerrada y no permite ediciones.')
      return
    }

    const enrollmentId = currentStudent.enrollment_id
    const reason = (excuseText || '').trim()
    if (!reason) {
      setError('La excusa requiere un motivo.')
      return
    }

    setSaving(true)
    setError(null)
    setInfo(null)

    try {
      applyLocalStudentUpdate(enrollmentId, 'EXCUSED', reason)
      await persistOne({ enrollment_id: enrollmentId, status: 'EXCUSED', excuse_reason: reason })

      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(10)
        }
      } catch {
        // ignore
      }

      setExcuseMode(false)
      setExcuseText('')
      if (currentIndex < students.length - 1) goNext()
    } catch (err) {
      console.error(err)
      const httpStatus = getAxiosStatus(err)
      if (httpStatus === 409) {
        setError(getAxiosDetail(err) || 'La clase está cerrada y no permite ediciones.')
        await load()
        return
      }
      setError(getAxiosDetail(err) || 'No se pudo guardar la excusa.')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = async () => {
    if (!sessionId || !data) return

    setError(null)
    setInfo(null)

    try {
      await closeAttendanceSession(sessionId)
      setInfo('Clase cerrada.')
      await load()
    } catch (err) {
      console.error(err)
      setError('No se pudo cerrar la clase.')
    }
  }

  const handleFlushQueue = async () => {
    setError(null)
    setInfo(null)
    try {
      const res = await flushAttendanceOfflineQueue()
      setInfo(`Cola offline: enviados ${res.flushed}, pendientes ${res.remaining}`)
    } catch (err) {
      console.error(err)
      setError('No se pudo reintentar la cola offline.')
    }
  }

  if (!sessionId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Asistencias</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">Sesión inválida.</p>
          <div className="mt-4">
            <Button onClick={() => navigate('/attendance')}>Volver</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Toma de asistencia</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-slate-600 dark:text-slate-300">Cargando…</p>
        ) : (
          <div className="space-y-4">
            {error ? (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-rose-950/30 dark:text-rose-200">
                {error}
              </div>
            ) : null}
            {info ? (
              <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                {info}
              </div>
            ) : null}

            {data ? (
              <div className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">{data.session.subject_name} — {data.session.group_name}</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      Fecha: {data.session.class_date} · Inicio: {formatDateTime(data.session.starts_at)} · Clase #{data.session.sequence}
                    </div>
                    {!data.session.locked_at && lateWindowEndsAt ? (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Cierre automático en: {formatCountdown(remainingToAutoCloseMs ?? 0)} · a las {formatDateTime(lateWindowEndsAt)}
                      </div>
                    ) : null}
                    {data.session.locked_at ? (
                      <div className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-200">Cerrada: {formatDateTime(data.session.locked_at)}</div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={load}>Actualizar</Button>
                    <Button variant="outline" onClick={handleFlushQueue}>Reintentar cola offline</Button>
                    <Button onClick={handleSave} disabled={saving || locked}>
                      {saving ? 'Guardando…' : 'Guardar'}
                    </Button>
                    <Button variant="destructive" onClick={handleClose} disabled={locked}>
                      Cerrar clase
                    </Button>
                    <Link className="text-sm text-blue-600 dark:text-blue-300 underline" to="/attendance">Volver</Link>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => markAll('PRESENT')} disabled={locked}>
                Marcar todos presentes
              </Button>
              <Button variant="outline" onClick={() => markAll('ABSENT')} disabled={locked}>
                Marcar todos ausentes
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <div className="relative mx-auto max-w-xl">
                  {/* Background next card (preview) */}
                  {nextStudent ? (
                    <div className="absolute inset-0 translate-y-3 scale-[0.98] rounded-2xl border border-slate-200 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/80" />
                  ) : null}

                  {/* Current card */}
                  {currentStudent ? (
                    <div
                      onPointerDown={onSwipeStart}
                      onPointerMove={onSwipeMove}
                      onPointerUp={onSwipeEnd}
                      className={
                        `relative rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900 transition-all duration-200 motion-reduce:transition-none motion-reduce:transform-none ` +
                        (leaving === 'next'
                          ? 'opacity-0 -translate-x-24'
                          : leaving === 'prev'
                            ? 'opacity-0 translate-x-24'
                            : entering
                              ? enterDir === 'next'
                                ? 'opacity-0 translate-x-8'
                                : 'opacity-0 -translate-x-8'
                              : 'opacity-100 translate-x-0')
                      }
                      style={
                        isDragging
                          ? {
                              transform: `translateX(${dragX}px) rotate(${dragX / 30}deg)`,
                              transition: 'none',
                            }
                          : releaseX !== null
                            ? {
                                transform: `translateX(${releaseX}px) rotate(${releaseX / 80}deg)`,
                                opacity: 0,
                                transition: 'transform 220ms ease, opacity 220ms ease',
                              }
                            : undefined
                      }
                    >
                      <div className="p-4 sm:p-6">
                        <div className="flex items-center gap-4">
                          <div className="h-14 w-14 sm:h-16 sm:w-16 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                            {currentStudent.student_photo_url ? (
                              <img
                                src={currentStudent.student_photo_url}
                                alt={currentStudent.student_full_name}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 text-lg font-semibold text-slate-600 dark:text-slate-200">
                                {getInitials(currentStudent.student_full_name)}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{currentStudent.student_full_name}</div>
                            <div className="text-sm text-slate-500 dark:text-slate-400">
                              Estudiante {Math.min(currentIndex + 1, students.length)} de {students.length}
                            </div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Estado actual: <span className="font-medium text-slate-700 dark:text-slate-200">{currentStudent.status ?? '(sin marcar)'}</span>
                              {currentStudent.status === 'TARDY' && currentStudent.tardy_at ? (
                                <span className="ml-2">· {formatDateTime(currentStudent.tardy_at)}</span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {/* Desktop actions (bigger, inline) */}
                        <div className="mt-5 hidden grid-cols-2 gap-2 sm:grid-cols-4 lg:grid">
                          <Button onClick={() => handleMark('PRESENT')} disabled={saving || locked}>
                            Presente
                          </Button>
                          <Button variant="outline" onClick={() => handleMark('ABSENT')} disabled={saving || locked}>
                            Ausente
                          </Button>
                          <Button variant="outline" onClick={() => handleMark('TARDY')} disabled={saving || locked}>
                            Tarde
                          </Button>
                          <Button variant="outline" onClick={() => handleMark('EXCUSED')} disabled={saving || locked}>
                            Excusa
                          </Button>
                        </div>

                        {excuseMode ? (
                          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/60">
                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Motivo de excusa</div>
                            <div className="mt-2">
                              <Input
                                ref={excuseInputRef}
                                value={excuseText}
                                disabled={saving || locked}
                                onChange={(e) => setExcuseText(e.target.value)}
                                placeholder="Ej: Cita médica, incapacidad, calamidad…"
                              />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button onClick={confirmExcuse} disabled={saving || locked}>
                                Confirmar y continuar
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setExcuseMode(false)
                                  setExcuseText('')
                                }}
                                disabled={saving}
                              >
                                Cancelar
                              </Button>
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                              Soportes/adjuntos: los agregamos en la siguiente iteración.
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-5 flex items-center justify-between">
                          <Button variant="outline" onClick={goPrev} disabled={currentIndex === 0 || saving}>
                            Anterior
                          </Button>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            <span className="hidden sm:inline">Auto-avanza al marcar · </span>
                            <span className="hidden sm:inline">Teclas: 1-4 · </span>
                            <span className="hidden sm:inline">Desliza ← →</span>
                            <span className="sm:hidden">Desliza ← →</span>
                          </div>
                          <Button
                            variant="outline"
                            onClick={goNext}
                            disabled={currentIndex >= students.length - 1 || saving}
                          >
                            Siguiente
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                      No hay estudiantes activos en este grupo.
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-1">
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Acciones</div>
                  <div className="mt-3 space-y-2">
                    <Button variant="outline" onClick={handleFlushQueue}>
                      Reintentar cola offline
                    </Button>
                    <Button onClick={handleSave} disabled={saving || locked}>
                      {saving ? 'Guardando…' : 'Guardar todo (opcional)'}
                    </Button>
                    <Button variant="destructive" onClick={handleClose} disabled={locked}>
                      Cerrar clase
                    </Button>
                    <Link className="block text-sm text-blue-600 dark:text-blue-300 underline" to="/attendance">
                      Volver
                    </Link>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Progreso</div>
                    <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-2 rounded-full bg-slate-900 dark:bg-slate-100 transition-all"
                        style={{ width: `${students.length ? Math.round(((currentIndex + 1) / students.length) * 100) : 0}%` }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {students.length ? Math.round(((currentIndex + 1) / students.length) * 100) : 0}%
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile sticky action bar */}
            {currentStudent ? (
              <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 lg:hidden">
                <div className="mx-auto max-w-xl px-4 pt-3" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
                  <div className="grid grid-cols-4 gap-2">
                    <Button onClick={() => handleMark('PRESENT')} disabled={saving || locked}>
                      Pres.
                    </Button>
                    <Button variant="outline" onClick={() => handleMark('ABSENT')} disabled={saving || locked}>
                      Aus.
                    </Button>
                    <Button variant="outline" onClick={() => handleMark('TARDY')} disabled={saving || locked}>
                      Tarde
                    </Button>
                    <Button variant="outline" onClick={() => handleMark('EXCUSED')} disabled={saving || locked}>
                      Exc.
                    </Button>
                  </div>
                  <div className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
                    Desliza para navegar · 1-4 para marcar
                  </div>
                </div>
              </div>
            ) : null}

            {/* Completion modal */}
            {showCompletion ? (
              <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center">
                <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">Asistencia completada</div>
                  <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Ya llegaste al último estudiante.
                  </div>

                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
                    La clase permanecerá abierta por 1 hora para registrar los estudiantes que llegan tarde.
                    {lateWindowEndsAt ? (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Hasta: {formatDateTime(lateWindowEndsAt)}</div>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCompletion(false)
                        setCurrentIndex(0)
                      }}
                    >
                      Revisar desde el inicio
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCompletion(false)
                      }}
                    >
                      Mantener abierta
                    </Button>
                    <Button variant="destructive" onClick={handleClose} disabled={locked}>
                      Cerrar clase
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Locked notice modal */}
            {showLockedNotice ? (
              <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center">
                <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">Clase cerrada</div>
                  <div className="mt-2 text-sm text-slate-700 dark:text-slate-200">{lockedNoticeText || 'La clase ya no permite ediciones.'}</div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowLockedNotice(false)
                      }}
                    >
                      Entendido
                    </Button>
                    <Button
                      onClick={() => {
                        setShowLockedNotice(false)
                        navigate('/attendance')
                      }}
                    >
                      Volver
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Spacer so sticky bar doesn't cover content */}
            <div className="h-28 lg:hidden" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
