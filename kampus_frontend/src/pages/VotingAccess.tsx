import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, CheckCircle2, ChevronRight, QrCode, ShieldCheck, Sparkles, Vote, XCircle } from 'lucide-react'
import jsQR from 'jsqr'
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

type BarcodeDetectorLike = new (options?: { formats?: string[] }) => {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>
}

type VideoInputDevice = {
  deviceId: string
  label: string
}

function getBarcodeDetectorCtor(): BarcodeDetectorLike | null {
  if (typeof window === 'undefined') return null
  const candidate = (window as Window & { BarcodeDetector?: BarcodeDetectorLike }).BarcodeDetector
  return candidate ?? null
}

function extractTokenFromQrPayload(rawValue: string): string {
  const raw = (rawValue || '').trim()
  if (!raw) return ''

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw)
      const tokenFromQuery =
        url.searchParams.get('token') ||
        url.searchParams.get('code') ||
        url.searchParams.get('qr') ||
        ''
      if (tokenFromQuery.trim()) return tokenFromQuery.trim()

      const pathLastSegment = url.pathname.split('/').filter(Boolean).at(-1) || ''
      if (pathLastSegment.trim()) return pathLastSegment.trim()
    } catch {
      return raw
    }
  }

  return raw
}

function decodeQrFromImageData(imageData: ImageData): string | null {
  const decodeScales = [1, 0.75, 0.5]
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = imageData.width
  sourceCanvas.height = imageData.height
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) return null
  sourceContext.putImageData(imageData, 0, 0)

  for (const scale of decodeScales) {
    const width = Math.max(160, Math.floor(imageData.width * scale))
    const height = Math.max(160, Math.floor(imageData.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) continue
    context.drawImage(sourceCanvas, 0, 0, width, height)
    const scaledImageData = context.getImageData(0, 0, width, height)
    const decoded = jsQR(scaledImageData.data, scaledImageData.width, scaledImageData.height, {
      inversionAttempts: 'attemptBoth',
    })
    if (decoded?.data?.trim()) return decoded.data.trim()
  }

  return null
}

type CaptureQualityLevel = 'low' | 'medium' | 'high'

function estimateCaptureQuality(imageData: ImageData): { level: CaptureQualityLevel; message: string } {
  const data = imageData.data
  const pixelCount = imageData.width * imageData.height
  if (pixelCount <= 0) {
    return { level: 'low', message: 'Sin señal de cámara estable.' }
  }

  const step = Math.max(4, Math.floor(pixelCount / 4000))
  let luminanceSum = 0
  let sampleCount = 0
  let contrastAccumulator = 0

  for (let index = 0; index < data.length; index += 4 * step) {
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b
    luminanceSum += luminance
    sampleCount += 1
  }

  const averageLuminance = sampleCount > 0 ? luminanceSum / sampleCount : 0

  for (let y = 1; y < imageData.height; y += Math.max(2, Math.floor(imageData.height / 120))) {
    for (let x = 1; x < imageData.width; x += Math.max(2, Math.floor(imageData.width / 120))) {
      const i = (y * imageData.width + x) * 4
      const left = (y * imageData.width + (x - 1)) * 4
      const top = ((y - 1) * imageData.width + x) * 4
      const current = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      const leftLum = 0.299 * data[left] + 0.587 * data[left + 1] + 0.114 * data[left + 2]
      const topLum = 0.299 * data[top] + 0.587 * data[top + 1] + 0.114 * data[top + 2]
      contrastAccumulator += Math.abs(current - leftLum) + Math.abs(current - topLum)
    }
  }

  if (averageLuminance < 55) {
    return { level: 'low', message: 'Iluminación baja. Acerca el QR y aumenta la luz.' }
  }
  if (averageLuminance > 220) {
    return { level: 'medium', message: 'Hay demasiado brillo. Evita reflejos directos.' }
  }

  if (contrastAccumulator < 80000) {
    return { level: 'medium', message: 'Imagen poco nítida. Mantén el celular quieto y enfoca el QR.' }
  }

  return { level: 'high', message: 'Calidad de lectura óptima. Mantén el QR dentro del recuadro.' }
}

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
  const [recentSelectionKey, setRecentSelectionKey] = useState<string | null>(null)
  const [institutionBranding, setInstitutionBranding] = useState<{ institutionName: string | null; logoUrl: string | null } | null>(null)
  const [cameraDevices, setCameraDevices] = useState<VideoInputDevice[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string>('')
  const [isStartingCamera, setIsStartingCamera] = useState(false)
  const [captureQuality, setCaptureQuality] = useState<{ level: CaptureQualityLevel; message: string } | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const ballotActionsRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const captureQualityRef = useRef<string>('')

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

  useEffect(() => {
    let mounted = true

    const loadBranding = async () => {
      try {
        const branding = await electionsApi.getPublicVotingBranding()
        if (!mounted) return
        setInstitutionBranding({
          institutionName: branding.institution_name,
          logoUrl: branding.logo_url,
        })
      } catch {
        if (!mounted) return
        setInstitutionBranding(null)
      }
    }

    void loadBranding()

    return () => {
      mounted = false
    }
  }, [])

  const stopCamera = useCallback(() => {
    const stream = streamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setIsCameraOn(false)
    setCaptureQuality(null)
    captureQualityRef.current = ''
  }, [])

  const loadCameraDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoInputs = devices
        .filter((device) => device.kind === 'videoinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Cámara ${index + 1}`,
        }))

      setCameraDevices(videoInputs)
      if (!selectedCameraId && videoInputs.length > 0) {
        setSelectedCameraId(videoInputs[0].deviceId)
      }
    } catch {
      setCameraDevices([])
    }
  }, [selectedCameraId])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    setIsStartingCamera(true)
    stopCamera()

    const constraintsCandidates: MediaStreamConstraints[] = [
      selectedCameraId
        ? {
            video: {
              deviceId: { exact: selectedCameraId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          }
        : {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          },
      {
        video: {
          facingMode: { exact: 'environment' },
        },
        audio: false,
      },
      {
        video: {
          facingMode: { ideal: 'user' },
        },
        audio: false,
      },
      {
        video: true,
        audio: false,
      },
    ]

    try {
      let stream: MediaStream | null = null
      for (const constraints of constraintsCandidates) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints)
          break
        } catch {
          continue
        }
      }

      if (!stream) {
        throw new Error('camera-unavailable')
      }

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      await loadCameraDevices()

      if (!getBarcodeDetectorCtor()) {
        setScanHint('Tu navegador no soporta lector QR nativo. Activamos modo compatible automático.')
      } else {
        setScanHint('Apunta el QR dentro del recuadro para validar automáticamente.')
      }
      setIsCameraOn(true)
    } catch {
      setCameraError('No fue posible acceder a la cámara. Puedes cambiar de cámara, subir foto del QR o usar el código manual.')
      setIsCameraOn(false)
    } finally {
      setIsStartingCamera(false)
    }
  }, [loadCameraDevices, selectedCameraId, stopCamera])

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

  const decodeQrFromUploadedFile = useCallback(async (file: File) => {
    const objectUrl = URL.createObjectURL(file)
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('image-load-error'))
        img.src = objectUrl
      })

      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth || image.width
      canvas.height = image.naturalHeight || image.height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('canvas-context-error')

      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
      const decodedValue = decodeQrFromImageData(imageData)
      if (!decodedValue) {
        setCameraError('No se encontró un código QR válido en la imagen. Intenta con otra foto más nítida.')
        return
      }

      const token = extractTokenFromQrPayload(decodedValue)
      if (!token) {
        setCameraError('El QR fue leído pero no contiene un token válido para esta votación.')
        return
      }

      setManualToken(token)
      setCameraError(null)
      setScanHint('QR leído desde imagen. Validando código...')
      void validateToken(token)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }, [validateToken])

  useEffect(() => {
    if (step !== 'scan') {
      stopCamera()
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Tu navegador no permite acceso directo a cámara. Sube una foto del QR o usa el código manual.')
      return
    }

    void startCamera()
    void loadCameraDevices()

    return () => {
      stopCamera()
    }
  }, [loadCameraDevices, startCamera, step, stopCamera])

  useEffect(() => {
    if (step !== 'scan') return
    if (!selectedCameraId) return
    void startCamera()
  }, [selectedCameraId, startCamera, step])

  useEffect(() => {
    if (step !== 'scan' || !isCameraOn || !videoRef.current) return

    const barcodeDetectorCtor = getBarcodeDetectorCtor()
    const detector = barcodeDetectorCtor ? new barcodeDetectorCtor({ formats: ['qr_code'] }) : null
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    let active = true

    const scanLoop = async () => {
      if (!active || !videoRef.current || step !== 'scan') return

      const video = videoRef.current
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
        window.setTimeout(scanLoop, 350)
        return
      }

      const handleDetectedCode = (detectedCode: string) => {
        const token = extractTokenFromQrPayload(detectedCode)
        if (!token) return
        setManualToken(token)
        void validateToken(token)
      }

      const tryDecodeWithJsQr = () => {
        if (!context) return false

        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
        const quality = estimateCaptureQuality(imageData)
        const qualityKey = `${quality.level}:${quality.message}`
        if (captureQualityRef.current !== qualityKey) {
          captureQualityRef.current = qualityKey
          setCaptureQuality(quality)
        }
        const decoded = decodeQrFromImageData(imageData)

        if (decoded?.trim()) {
          handleDetectedCode(decoded.trim())
          return true
        }
        return false
      }

      try {
        if (detector) {
          const barcodes = await detector.detect(video)
          const firstBarcode = barcodes.find((barcode) => typeof barcode.rawValue === 'string' && barcode.rawValue.trim().length > 0)
          if (firstBarcode?.rawValue) {
            handleDetectedCode(firstBarcode.rawValue.trim())
            return
          }
        }

        if (tryDecodeWithJsQr()) {
          return
        }
      } catch {
        if (tryDecodeWithJsQr()) {
          return
        }
      }

      setScanHint('No se detectó QR todavía. Mantén el código estable y bien iluminado.')

      window.setTimeout(scanLoop, 700)
    }

    void scanLoop()

    return () => {
      active = false
    }
  }, [isCameraOn, step, validateToken])

  const handleSelectVote = (roleId: number, candidateId: string) => {
    setVotes((previousVotes) => ({ ...previousVotes, [roleId]: candidateId }))
    const selectionKey = `${roleId}:${candidateId}`
    setRecentSelectionKey(selectionKey)
    window.setTimeout(() => {
      setRecentSelectionKey((previousKey) => (previousKey === selectionKey ? null : previousKey))
    }, 240)

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(18)
    }

    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      window.setTimeout(() => {
        ballotActionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 120)
    }

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
          <div className="mx-auto w-fit rounded-2xl border border-sky-100 bg-white/95 px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-sky-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900">
                {institutionBranding?.logoUrl ? (
                  <img
                    src={institutionBranding.logoUrl}
                    alt={institutionBranding.institutionName ? `Escudo de ${institutionBranding.institutionName}` : 'Escudo institucional'}
                    className="h-full w-full object-contain"
                    loading="eager"
                  />
                ) : (
                  <ShieldCheck className="h-7 w-7 text-sky-600 dark:text-sky-300" />
                )}
              </div>
              <div className="space-y-1 text-left">
                <p className="max-w-56 text-sm font-semibold text-slate-800 dark:text-slate-100 sm:max-w-none">
                  {institutionBranding?.institutionName || 'Gobierno Escolar'}
                </p>
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                  <Vote className="h-3.5 w-3.5" />
                  Elecciones Gobierno Escolar
                </p>
              </div>
            </div>
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

              {captureQuality ? (
                <p
                  className={`rounded-md border px-3 py-2 text-sm ${
                    captureQuality.level === 'high'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/50 dark:text-emerald-200'
                      : captureQuality.level === 'medium'
                        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-200'
                        : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200'
                  }`}
                >
                  Calidad de lectura: {captureQuality.level === 'high' ? 'Alta' : captureQuality.level === 'medium' ? 'Media' : 'Baja'} · {captureQuality.message}
                </p>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="camera-select" className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Cámara activa
                  </label>
                  <select
                    id="camera-select"
                    value={selectedCameraId}
                    onChange={(event) => setSelectedCameraId(event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    disabled={cameraDevices.length === 0 || isStartingCamera}
                  >
                    {cameraDevices.length === 0 ? <option value="">Cámara predeterminada</option> : null}
                    {cameraDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 flex-1"
                    onClick={() => void startCamera()}
                    disabled={isStartingCamera}
                  >
                    {isStartingCamera ? 'Iniciando...' : 'Reiniciar cámara'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 flex-1"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Subir foto QR
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) {
                        void decodeQrFromUploadedFile(file)
                      }
                      event.currentTarget.value = ''
                    }}
                  />
                </div>
              </div>

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
                  const isRecentlySelected = recentSelectionKey === `${currentRole.id}:${candidate.id}`
                  return (
                    <div
                      key={candidate.id}
                      className={`group relative w-full min-h-[150px] overflow-hidden rounded-xl transition-all duration-300 sm:min-h-[170px] ${
                        isRecentlySelected ? 'scale-[1.01]' : ''
                      }`}
                    >
                      <div
                        className={`pointer-events-none absolute -inset-1 rounded-2xl bg-linear-to-r ${candidate.colorClass} blur-xl transition-opacity duration-500 ${
                          isSelected
                            ? 'opacity-30 dark:opacity-20'
                            : 'opacity-5 group-hover:opacity-16'
                        }`}
                      />
                      <div
                        className={`pointer-events-none absolute inset-0 rounded-xl bg-linear-to-r ${candidate.colorClass} p-[1px] transition-all duration-300 animate-in fade-in-50 duration-500 ${
                          isSelected ? 'opacity-85' : 'opacity-45 group-hover:opacity-70'
                        }`}
                      >
                        <div
                          className={`h-full w-full rounded-[11px] ${
                            isSelected ? 'bg-sky-50/95 dark:bg-sky-900/45' : 'bg-white dark:bg-slate-900'
                          }`}
                        />
                      </div>

                      <div
                        className={`relative z-10 min-h-[150px] rounded-xl p-4 transition sm:min-h-[170px] ${
                          isSelected
                            ? 'ring-2 ring-sky-300/70 shadow-sm shadow-sky-200/50 dark:ring-sky-700/70 dark:shadow-sky-950/30'
                            : ''
                        } ${isRecentlySelected ? 'ring-2 ring-emerald-300/60 dark:ring-emerald-700/60' : ''}`}
                      >
                      <button
                        type="button"
                        onClick={() => handleSelectVote(currentRole.id, String(candidate.id))}
                        className="w-full min-h-[92px] text-left"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-base font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">#{candidate.number}</p>
                            <p className="text-xl font-bold leading-tight text-slate-900 dark:text-slate-100 sm:text-2xl">{candidate.name}</p>
                            <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Grado {candidate.grade}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {isSelected ? (
                              <span className={`inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 ${isRecentlySelected ? 'animate-pulse' : ''}`}>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Seleccionado
                              </span>
                            ) : null}
                            {candidate.photo_url ? (
                              <img
                                src={candidate.photo_url}
                                alt={`Foto de ${candidate.name}`}
                                className="h-24 w-24 rounded-xl border border-slate-200 object-cover shadow-sm dark:border-slate-700 sm:h-28 sm:w-28"
                              />
                            ) : (
                              <div className={`h-24 w-24 rounded-xl bg-linear-to-br shadow-sm ${candidate.colorClass} sm:h-28 sm:w-28`} />
                            )}
                          </div>
                        </div>
                      </button>

                      <div className="mt-3 flex gap-2">
                        <Button type="button" variant="outline" className="h-10 px-4 text-sm font-semibold" onClick={() => openProposalModal(candidate)}>
                          Ver propuesta
                        </Button>
                      </div>
                      </div>
                    </div>
                  )
                })}

                <button
                  type="button"
                  onClick={() => handleSelectVote(currentRole.id, BLANK_VOTE_ID)}
                  className={`w-full min-h-[120px] rounded-xl border border-dashed px-4 py-5 text-left transition ${
                    currentVote === BLANK_VOTE_ID
                      ? 'border-slate-500 bg-slate-100 ring-2 ring-slate-300 dark:border-slate-400 dark:bg-slate-800 dark:ring-slate-600'
                      : 'border-slate-300 bg-white hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:hover:border-slate-500'
                  } ${recentSelectionKey === `${currentRole.id}:${BLANK_VOTE_ID}` ? 'scale-[1.01] ring-4 ring-emerald-300/70 dark:ring-emerald-700/70' : ''}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Voto en Blanco</p>
                    {currentVote === BLANK_VOTE_ID ? (
                      <span className={`inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 ${recentSelectionKey === `${currentRole.id}:${BLANK_VOTE_ID}` ? 'animate-pulse' : ''}`}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Seleccionado
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Selecciona esta opción si no eliges ninguna candidatura para este cargo.</p>
                </button>
              </CardContent>
            </Card>

            <div ref={ballotActionsRef} className="flex flex-col gap-2 sm:flex-row sm:justify-end">
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
              <div className="mx-auto mb-2 w-fit rounded-xl border border-emerald-200 bg-white/80 px-3 py-2 animate-in fade-in zoom-in-95 duration-300 dark:border-emerald-900/40 dark:bg-slate-900/70">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-emerald-200 bg-white dark:border-emerald-800/50 dark:bg-slate-900">
                    {institutionBranding?.logoUrl ? (
                      <img
                        src={institutionBranding.logoUrl}
                        alt={institutionBranding.institutionName ? `Escudo de ${institutionBranding.institutionName}` : 'Escudo institucional'}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <ShieldCheck className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
                    )}
                  </div>
                  <p className="max-w-56 text-left text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                    {institutionBranding?.institutionName || 'Institución educativa'}
                  </p>
                </div>
              </div>

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
