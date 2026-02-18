import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, CheckCircle2, ChevronRight, QrCode, ShieldCheck, Sparkles, Vote, XCircle } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Toast, type ToastType } from '../components/ui/Toast'
import {
  electionsApi,
  getApiErrorMessage,
  type ElectionCandidatePublic,
  type ElectionRolePublic,
} from '../services/elections'

type VotingStep = 'landing' | 'scan' | 'ballots' | 'review' | 'success'

type ElectionRole = Omit<ElectionRolePublic, 'candidates'> & {
  candidates: Candidate[]
}

type Candidate = ElectionCandidatePublic & {
  colorClass: string
}

const BLANK_VOTE_ID = 'BLANK'
const CANDIDATE_COLOR_CLASSES = [
  'from-sky-500 to-cyan-500',
  'from-violet-500 to-fuchsia-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-pink-500 to-rose-500',
  'from-indigo-500 to-blue-500',
]

function toUiRoles(roles: ElectionRolePublic[]): ElectionRole[] {
  return roles.map((role) => ({
    ...role,
    candidates: role.candidates.map((candidate, index) => ({
      ...candidate,
      colorClass: CANDIDATE_COLOR_CLASSES[index % CANDIDATE_COLOR_CLASSES.length],
    })),
  }))
}

function getCandidateById(role: ElectionRole, candidateId: string) {
  if (candidateId === BLANK_VOTE_ID) {
    return {
      id: BLANK_VOTE_ID,
      name: 'Voto en Blanco',
      number: 'VB',
      grade: '',
      proposal: 'Elegiste no apoyar ninguna candidatura en este cargo.',
      photo_url: '',
      colorClass: 'from-slate-500 to-slate-600',
    }
  }
  return role.candidates.find((candidate) => String(candidate.id) === candidateId) ?? null
}

function getRoleCandidateLabel(roleCode: string): string {
  const normalizedCode = (roleCode || '').toUpperCase()
  if (normalizedCode === 'PERSONERO') return 'Candidatura de Personería'
  if (normalizedCode === 'CONTRALOR') return 'Candidatura de Contraloría'
  return 'Candidatura'
}

export default function VotingAccess() {
  const [step, setStep] = useState<VotingStep>('landing')
  const [processName, setProcessName] = useState('')
  const [manualToken, setManualToken] = useState('')
  const [validatedToken, setValidatedToken] = useState<string | null>(null)
  const [accessSessionId, setAccessSessionId] = useState<string | null>(null)
  const [roles, setRoles] = useState<ElectionRole[]>([])
  const [currentRoleIndex, setCurrentRoleIndex] = useState(0)
  const [proposalCandidate, setProposalCandidate] = useState<Candidate | null>(null)
  const [votes, setVotes] = useState<Record<string, string>>({})
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [scanHint, setScanHint] = useState<string | null>(null)
  const [isValidatingToken, setIsValidatingToken] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [receiptCode, setReceiptCode] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }, [])

  const rolesCount = roles.length
  const currentRole = roles[currentRoleIndex]
  const currentVote = currentRole ? votes[currentRole.id] : null

  const completionPercent = useMemo(() => {
    if (rolesCount === 0) return 0
    return Math.round((Object.keys(votes).length / rolesCount) * 100)
  }, [votes, rolesCount])

  const stopCamera = useCallback(() => {
    const stream = streamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setIsCameraOn(false)
  }, [])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      if (!(window as Window & { BarcodeDetector?: unknown }).BarcodeDetector) {
        setScanHint('Tu dispositivo no soporta lectura QR automática en navegador. Usa el código manual.')
      } else {
        setScanHint('Apunta el QR dentro del recuadro para validar automáticamente.')
      }
      setIsCameraOn(true)
    } catch {
      setCameraError('No fue posible acceder a la cámara. Puedes usar el código manual para continuar.')
      setIsCameraOn(false)
    }
  }, [])

  const validateToken = useCallback(async (rawToken: string) => {
    if (isValidatingToken) return

    const normalized = rawToken.trim().toUpperCase()
    if (!normalized) {
      const message = 'Ingresa un código válido para habilitar la votación.'
      setTokenError(message)
      showToast(message, 'error')
      return
    }

    if (normalized.length < 6) {
      const message = 'El código debe tener al menos 6 caracteres.'
      setTokenError(message)
      showToast(message, 'error')
      return
    }

    setIsValidatingToken(true)
    setTokenError(null)
    setSubmitError(null)

    try {
      const response = await electionsApi.validateToken(normalized)
      const normalizedRoles = toUiRoles(response.roles || [])
      if (normalizedRoles.length === 0) {
        const message = 'No hay cargos habilitados para este token en este momento.'
        setTokenError(message)
        showToast(message, 'error')
        return
      }

      setRoles(normalizedRoles)
      setProcessName(response.process.name)
      setAccessSessionId(response.access_session_id)
      setValidatedToken(normalized)
      setCurrentRoleIndex(0)
      setVotes({})
      setProposalCandidate(null)
      setStep('ballots')
    } catch (error) {
      const message = getApiErrorMessage(error, 'No fue posible validar el token. Intenta de nuevo.')
      setTokenError(message)
      showToast(message, 'error')
    } finally {
      setIsValidatingToken(false)
    }
  }, [isValidatingToken, showToast])

  useEffect(() => {
    if (step !== 'scan') {
      stopCamera()
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Tu navegador no permite acceso directo a cámara. Usa el código manual.')
      return
    }

    void startCamera()

    return () => {
      stopCamera()
    }
  }, [startCamera, step, stopCamera])

  useEffect(() => {
    if (step !== 'scan' || !isCameraOn || !videoRef.current) return

    const barcodeDetectorCtor = (window as Window & { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector
    if (!barcodeDetectorCtor) return

    const detector = new barcodeDetectorCtor({ formats: ['qr_code'] })
    let active = true

    const scanLoop = async () => {
      if (!active || !videoRef.current || step !== 'scan') return

      try {
        const barcodes = await detector.detect(videoRef.current)
        const firstBarcode = barcodes.find((barcode) => typeof barcode.rawValue === 'string' && barcode.rawValue.trim().length > 0)
        if (firstBarcode?.rawValue) {
          const detectedCode = firstBarcode.rawValue.trim()
          setManualToken(detectedCode)
          void validateToken(detectedCode)
          return
        }
      } catch {
        setScanHint('No se detectó QR todavía. Mantén el código estable y bien iluminado.')
      }

      window.setTimeout(scanLoop, 700)
    }

    void scanLoop()

    return () => {
      active = false
    }
  }, [isCameraOn, step, validateToken])

  const handleSelectVote = (roleId: number, candidateId: string) => {
    setVotes((previousVotes) => ({ ...previousVotes, [roleId]: candidateId }))
    setSubmitError(null)
  }

  const openProposalModal = (candidate: Candidate) => {
    setProposalCandidate(candidate)
  }

  const handleNextRole = () => {
    if (!currentRole || !currentVote) return

    if (currentRoleIndex < rolesCount - 1) {
      setCurrentRoleIndex((previousIndex) => previousIndex + 1)
      setProposalCandidate(null)
      return
    }

    setStep('review')
  }

  const handleSubmitVotes = async () => {
    if (!accessSessionId) {
      const message = 'La sesión de votación no es válida. Vuelve a escanear tu código.'
      setSubmitError(message)
      showToast(message, 'error')
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    const selections = roles.map((role) => {
      const selectedId = votes[role.id]
      if (selectedId === BLANK_VOTE_ID) {
        return {
          role_id: role.id,
          is_blank: true,
          candidate_id: null,
        }
      }

      return {
        role_id: role.id,
        candidate_id: Number(selectedId),
        is_blank: false,
      }
    })

    try {
      const response = await electionsApi.submitVote(accessSessionId, selections)
      setReceiptCode(response.receipt_code)
      setIsSubmitting(false)
      setStep('success')
      stopCamera()
    } catch (error) {
      const message = getApiErrorMessage(error, 'No fue posible registrar el voto. Intenta nuevamente.')
      setSubmitError(message)
      showToast(message, 'error')
      setIsSubmitting(false)
    }
  }

  const handleRestart = () => {
    setStep('landing')
    setProcessName('')
    setManualToken('')
    setValidatedToken(null)
    setAccessSessionId(null)
    setRoles([])
    setCurrentRoleIndex(0)
    setProposalCandidate(null)
    setVotes({})
    setTokenError(null)
    setSubmitError(null)
    setCameraError(null)
    setScanHint(null)
    setIsSubmitting(false)
    setIsValidatingToken(false)
    setReceiptCode(null)
    stopCamera()
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-sky-50 via-white to-indigo-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-100">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="space-y-3 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-4 py-1 text-sm font-medium text-sky-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-sky-300">
            <Vote className="h-4 w-4" /> Elecciones Gobierno Escolar
          </div>
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Tu voto cuenta. Tu voz transforma.</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 sm:text-base">
            Proceso rápido, seguro e intuitivo para estudiantes. Sigue cada paso y confirma tu elección con tranquilidad.
          </p>
          {processName && (
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-300">
              Jornada activa: {processName}
            </p>
          )}
        </header>

        {step === 'landing' && (
          <Card className="border-sky-100 bg-white/90 shadow-lg shadow-sky-100/50 dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
            <CardHeader className="space-y-3">
              <CardTitle className="text-2xl">Antes de iniciar</CardTitle>
              <CardDescription>
                Ten tu código QR a la mano. Podrás revisar propuestas antes de confirmar cada voto y siempre tendrás opción de voto en blanco.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-sky-100 bg-sky-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
                  <p className="font-semibold text-sky-700 dark:text-sky-300">1. Acceso</p>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">Escanea QR o ingresa código manual.</p>
                </div>
                <div className="rounded-lg border border-violet-100 bg-violet-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
                  <p className="font-semibold text-violet-700 dark:text-violet-300">2. Tarjetones</p>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">Vota por cada cargo de forma guiada.</p>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
                  <p className="font-semibold text-emerald-700 dark:text-emerald-300">3. Confirmación</p>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">Revisa y envía tu voto de forma segura.</p>
                </div>
              </div>

              <Button className="h-12 w-full text-base font-semibold" size="lg" onClick={() => setStep('scan')}>
                Iniciar votación <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'scan' && (
          <Card className="border-slate-200 bg-white/95 shadow-lg dark:border-slate-800 dark:bg-slate-900/95">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <QrCode className="h-6 w-6 text-sky-600 dark:text-sky-300" /> Acceso por código
              </CardTitle>
              <CardDescription>Escanea tu QR o escribe tu código para habilitar los tarjetones.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 dark:border-slate-700">
                <video ref={videoRef} autoPlay playsInline muted className="h-64 w-full object-cover" />
                {!isCameraOn && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/80 text-slate-200">
                    <Camera className="h-8 w-8" />
                    <p className="text-sm">Activa la cámara para escanear el QR</p>
                  </div>
                )}
              </div>

              {cameraError && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/60 dark:text-amber-200">
                  {cameraError}
                </p>
              )}

              {scanHint && (
                <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/60 dark:text-sky-200">
                  {scanHint}
                </p>
              )}

              <div className="space-y-2">
                <label htmlFor="manual-token" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Código de acceso (manual)
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="manual-token"
                    value={manualToken}
                    onChange={(event) => setManualToken(event.target.value)}
                    placeholder="Ej: VOTO-2026-ABC123"
                    className="h-12 text-base"
                  />
                  <Button size="lg" className="h-12 sm:px-6" onClick={() => void validateToken(manualToken)} disabled={isValidatingToken}>
                    {isValidatingToken ? 'Validando...' : 'Validar'}
                  </Button>
                </div>
                {tokenError && <p className="text-sm text-red-600 dark:text-red-300">{tokenError}</p>}
              </div>

              <Button variant="outline" className="h-11 w-full" onClick={handleRestart}>
                Volver al inicio
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'ballots' && currentRole && (
          <div className="space-y-4">
            <Card className="border-slate-200 bg-white/95 dark:border-slate-800 dark:bg-slate-900/95">
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="rounded-full bg-sky-100 px-3 py-1 font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
                    Paso {currentRoleIndex + 1} de {rolesCount}
                  </span>
                  <span className="font-medium text-slate-600 dark:text-slate-300">Avance {completionPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div className="h-full bg-sky-600 transition-all" style={{ width: `${completionPercent}%` }} />
                </div>
                <CardTitle className="text-2xl">Tarjetón: {currentRole.title}</CardTitle>
                <CardDescription>{currentRole.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentRole.candidates.map((candidate) => {
                  const isSelected = currentVote === String(candidate.id)
                  return (
                    <div
                      key={candidate.id}
                      className={`w-full rounded-xl border p-4 transition ${
                        isSelected
                          ? 'border-sky-600 bg-sky-50 ring-4 ring-sky-300 shadow-md shadow-sky-200/70 dark:border-sky-300 dark:bg-sky-900/40 dark:ring-sky-700 dark:shadow-sky-950/40'
                          : 'border-slate-200 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectVote(currentRole.id, String(candidate.id))}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-base font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">#{candidate.number}</p>
                            <p className="text-xl font-bold leading-tight text-slate-900 dark:text-slate-100 sm:text-2xl">{candidate.name}</p>
                            <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Grado {candidate.grade}
                            </p>
                          </div>
                          {candidate.photo_url ? (
                            <img
                              src={candidate.photo_url}
                              alt={`Foto de ${candidate.name}`}
                              className="h-20 w-20 rounded-xl border border-slate-200 object-cover shadow-sm dark:border-slate-700 sm:h-24 sm:w-24"
                            />
                          ) : (
                            <div className={`h-20 w-20 rounded-xl bg-linear-to-br shadow-sm ${candidate.colorClass} sm:h-24 sm:w-24`} />
                          )}
                        </div>
                      </button>

                      <div className="mt-3 flex gap-2">
                        <Button type="button" variant="outline" className="h-10 px-4 text-sm font-semibold" onClick={() => openProposalModal(candidate)}>
                          Ver propuesta
                        </Button>
                      </div>
                    </div>
                  )
                })}

                <button
                  type="button"
                  onClick={() => handleSelectVote(currentRole.id, BLANK_VOTE_ID)}
                  className={`w-full rounded-xl border border-dashed p-4 text-left transition ${
                    currentVote === BLANK_VOTE_ID
                      ? 'border-slate-500 bg-slate-100 ring-2 ring-slate-300 dark:border-slate-400 dark:bg-slate-800 dark:ring-slate-600'
                      : 'border-slate-300 bg-white hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:hover:border-slate-500'
                  }`}
                >
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Voto en Blanco</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Selecciona esta opción si no eliges ninguna candidatura para este cargo.</p>
                </button>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                className="h-11"
                onClick={() => {
                  if (currentRoleIndex > 0) {
                    setCurrentRoleIndex((previousIndex) => previousIndex - 1)
                  }
                }}
                disabled={currentRoleIndex === 0}
              >
                Anterior
              </Button>
              <Button className="h-11" onClick={handleNextRole} disabled={!currentVote}>
                {currentRoleIndex === rolesCount - 1 ? 'Revisar votos' : 'Siguiente cargo'}
              </Button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <Card className="border-slate-200 bg-white/95 shadow-lg dark:border-slate-800 dark:bg-slate-900/95">
            <CardHeader>
              <CardTitle className="text-2xl">Revisa antes de confirmar</CardTitle>
              <CardDescription>
                Verifica tus selecciones. Después de confirmar, el sistema cerrará tu sesión de votación.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {roles.map((role) => {
                  const selected = getCandidateById(role, votes[role.id])
                  return (
                    <div key={role.id} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{role.title}</p>
                      <p className="mt-1 text-base font-medium">{selected?.name ?? 'Sin seleccionar'}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{getRoleCandidateLabel(role.code)}</p>
                      {selected?.grade ? (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Grado {selected.grade}</p>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200">
                <p className="flex items-center gap-2 font-medium">
                  <ShieldCheck className="h-4 w-4" />
                  Token validado: {validatedToken}
                </p>
                <p className="mt-1">Al confirmar, tu código quedará invalidado para evitar reingresos.</p>
              </div>

              {submitError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/60 dark:text-red-200">
                  {submitError}
                </p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" className="h-11" onClick={() => setStep('ballots')}>
                  Volver a tarjetones
                </Button>
                <Button className="h-11" onClick={() => void handleSubmitVotes()} disabled={isSubmitting}>
                  {isSubmitting ? 'Enviando...' : 'Confirmar voto'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'success' && (
          <Card className="border-emerald-200 bg-emerald-50 shadow-lg dark:border-emerald-900/40 dark:bg-emerald-950/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="h-7 w-7" />
                ¡Votación registrada!
              </CardTitle>
              <CardDescription className="text-emerald-900/80 dark:text-emerald-200/90">
                Gracias por participar en el gobierno escolar. Tu voto fue recibido correctamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-emerald-300 bg-white/70 p-3 text-sm dark:border-emerald-900/50 dark:bg-slate-900/60">
                <p className="font-semibold">Comprobante interno</p>
                <p className="mt-1">{receiptCode ?? 'Procesado correctamente'}</p>
              </div>

              <Button className="h-11 w-full" onClick={handleRestart}>
                Finalizar y salir
              </Button>
            </CardContent>
          </Card>
        )}

        {!['landing', 'scan', 'ballots', 'review', 'success'].includes(step) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <XCircle className="h-5 w-5" /> Estado no reconocido
              </CardTitle>
            </CardHeader>
          </Card>
        )}

        <Modal
          isOpen={Boolean(proposalCandidate)}
          onClose={() => setProposalCandidate(null)}
          title={proposalCandidate ? `Propuesta de ${proposalCandidate.name}` : 'Propuesta'}
          description={proposalCandidate ? `Candidato #${proposalCandidate.number} · Grado ${proposalCandidate.grade}` : undefined}
          size="md"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              {proposalCandidate?.photo_url ? (
                <img
                  src={proposalCandidate.photo_url}
                  alt={`Foto de ${proposalCandidate.name}`}
                  className="h-24 w-24 rounded-xl border border-slate-200 object-cover shadow-sm dark:border-slate-700 sm:h-28 sm:w-28"
                />
              ) : (
                <div className={`h-24 w-24 rounded-xl bg-linear-to-br shadow-sm ${proposalCandidate?.colorClass || 'from-slate-500 to-slate-600'} sm:h-28 sm:w-28`} />
              )}
              <div>
                <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{proposalCandidate?.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-300">#{proposalCandidate?.number}</p>
              </div>
            </div>

            <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm leading-relaxed text-slate-700 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-slate-200">
              <p className="mb-2 flex items-center gap-2 font-semibold text-violet-700 dark:text-violet-300">
                <Sparkles className="h-4 w-4" />
                Propuesta
              </p>
              <p>{proposalCandidate?.proposal?.trim() || 'Este candidato no registró propuesta.'}</p>
            </div>
          </div>
        </Modal>
      </div>
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((prev) => ({ ...prev, isVisible: false }))}
      />
    </div>
  )
}
