import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { Label } from '../ui/Label'

interface Point {
  x: number
  y: number
}

interface IdentityImageEditorProps {
  label: string
  onProcessedFileChange: (file: File | null) => void
  maxSizeMb?: number
  required?: boolean
  initialFile?: File | null
}

const defaultCorners: Point[] = [
  { x: 0.08, y: 0.1 },
  { x: 0.92, y: 0.1 },
  { x: 0.92, y: 0.9 },
  { x: 0.08, y: 0.9 },
]

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const rotatePoint = (point: Point, rotation: 0 | 90 | 180 | 270): Point => {
  switch (rotation) {
    case 90:
      return { x: 1 - point.y, y: point.x }
    case 180:
      return { x: 1 - point.x, y: 1 - point.y }
    case 270:
      return { x: point.y, y: 1 - point.x }
    default:
      return point
  }
}

const getFileExtension = (type: string) => {
  if (type.includes('png')) return 'png'
  if (type.includes('webp')) return 'webp'
  return 'jpg'
}

const triggerHaptic = (type: 'light' | 'medium' | 'success' | 'error') => {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return

  if (type === 'light') {
    navigator.vibrate(8)
    return
  }
  if (type === 'medium') {
    navigator.vibrate(16)
    return
  }
  if (type === 'success') {
    navigator.vibrate([12, 24, 12])
    return
  }
  navigator.vibrate(40)
}

export default function IdentityImageEditor({
  label,
  onProcessedFileChange,
  maxSizeMb = 5,
  required = false,
  initialFile = null,
}: IdentityImageEditorProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0)
  const [corners, setCorners] = useState<Point[]>(defaultCorners)
  const [draggingCorner, setDraggingCorner] = useState<number | null>(null)
  const [isApplying, setIsApplying] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showSuccessFeedback, setShowSuccessFeedback] = useState(false)
  const [showErrorFeedback, setShowErrorFeedback] = useState(false)
  const [inlineStatus, setInlineStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const frameRef = useRef<HTMLDivElement | null>(null)

  const frameHeightClass = isFullscreen ? 'h-[42vh] md:h-[52vh]' : 'h-48 md:h-56'

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [sourceUrl, previewUrl])

  useEffect(() => {
    if (!isFullscreen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (isDirty) {
        const shouldClose = window.confirm('Tienes cambios sin aplicar. ¿Seguro que deseas cerrar?')
        if (!shouldClose) return
      }
      setIsFullscreen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isFullscreen, isDirty])

  useEffect(() => {
    if (!isFullscreen) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isFullscreen])

  const polygonPoints = useMemo(() => {
    return corners.map((corner) => `${corner.x * 100}% ${corner.y * 100}%`).join(', ')
  }, [corners])

  const getFileMeta = (file: File) => {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2)
    return `${file.name} · ${sizeMb}MB · ${file.type || 'tipo desconocido'}`
  }

  const sameFile = (first: File | null, second: File | null) => {
    if (!first || !second) return false
    return first.name === second.name && first.size === second.size && first.lastModified === second.lastModified
  }

  const loadFileIntoEditor = (file: File | null, shouldResetEditingState: boolean) => {
    if (!file) {
      setSelectedFile(null)
      if (sourceUrl) URL.revokeObjectURL(sourceUrl)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setSourceUrl('')
      setPreviewUrl('')
      setRotation(0)
      setCorners(defaultCorners)
      setIsDirty(false)
      return
    }

    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    if (previewUrl) URL.revokeObjectURL(previewUrl)

    const nextUrl = URL.createObjectURL(file)
    setSelectedFile(file)
    setSourceUrl(nextUrl)
    if (shouldResetEditingState) {
      setPreviewUrl('')
      setRotation(0)
      setCorners(defaultCorners)
      setIsDirty(true)
    }
  }

  useEffect(() => {
    if (!initialFile && selectedFile) {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setSelectedFile(null)
      setSourceUrl('')
      setPreviewUrl('')
      setRotation(0)
      setCorners(defaultCorners)
      setIsDirty(false)
      return
    }

    if (initialFile && !sameFile(initialFile, selectedFile)) {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      const nextUrl = URL.createObjectURL(initialFile)
      setSelectedFile(initialFile)
      setSourceUrl(nextUrl)
      setIsDirty(false)
    }
  }, [initialFile, previewUrl, selectedFile, sourceUrl])

  const requestCloseFullscreen = () => {
    if (isDirty) {
      const shouldClose = window.confirm('Tienes cambios sin aplicar. ¿Seguro que deseas cerrar?')
      if (!shouldClose) return
    }
    setIsFullscreen(false)
  }

  const handleFileSelect = (file: File | null, inputElement: HTMLInputElement) => {
    if (!file) {
      setSelectedFile(null)
      onProcessedFileChange(null)
      return
    }

    if (!file.type.startsWith('image/')) {
      inputElement.value = ''
      setInlineStatus({ type: 'error', message: 'Formato no válido. Usa JPG, PNG o WebP.' })
      window.setTimeout(() => setInlineStatus(null), 2200)
      return
    }

    if (file.size > maxSizeMb * 1024 * 1024) {
      inputElement.value = ''
      setInlineStatus({ type: 'error', message: `El archivo excede ${maxSizeMb}MB.` })
      window.setTimeout(() => setInlineStatus(null), 2200)
      return
    }

    loadFileIntoEditor(file, true)
    onProcessedFileChange(file)
    setInlineStatus({ type: 'success', message: `Archivo cargado: ${getFileMeta(file)}` })
    window.setTimeout(() => setInlineStatus(null), 1800)
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      setIsFullscreen(true)
    }
  }

  const updateCornerFromPointer = (clientX: number, clientY: number, cornerIndex: number) => {
    const frame = frameRef.current
    if (!frame) return

    const rect = frame.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const x = clamp01((clientX - rect.left) / rect.width)
    const y = clamp01((clientY - rect.top) / rect.height)

    setCorners((prev) => prev.map((corner, idx) => (idx === cornerIndex ? { x, y } : corner)))
  }

  const rotateClockwise = () => {
    triggerHaptic('medium')
    setIsDirty(true)
    setRotation((prev) => {
      const next = (((prev + 90) % 360) as 0 | 90 | 180 | 270)
      setCorners((oldCorners) => oldCorners.map((corner) => rotatePoint(corner, 90)))
      return next
    })
  }

  const resetCorners = () => {
    triggerHaptic('medium')
    setIsDirty(true)
    setCorners(defaultCorners)
  }

  const applyAdjustments = async () => {
    if (!selectedFile || !sourceUrl) return

    triggerHaptic('medium')
    setIsApplying(true)
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
        img.src = sourceUrl
      })

      const baseCanvas = document.createElement('canvas')
      const baseContext = baseCanvas.getContext('2d')
      if (!baseContext) throw new Error('No se pudo preparar el lienzo')

      const sourceWidth = image.naturalWidth
      const sourceHeight = image.naturalHeight

      if (rotation === 90 || rotation === 270) {
        baseCanvas.width = sourceHeight
        baseCanvas.height = sourceWidth
      } else {
        baseCanvas.width = sourceWidth
        baseCanvas.height = sourceHeight
      }

      baseContext.save()
      if (rotation === 90) {
        baseContext.translate(baseCanvas.width, 0)
        baseContext.rotate(Math.PI / 2)
      } else if (rotation === 180) {
        baseContext.translate(baseCanvas.width, baseCanvas.height)
        baseContext.rotate(Math.PI)
      } else if (rotation === 270) {
        baseContext.translate(0, baseCanvas.height)
        baseContext.rotate(-Math.PI / 2)
      }
      baseContext.drawImage(image, 0, 0)
      baseContext.restore()

      const points = corners.map((corner) => ({
        x: Math.round(corner.x * baseCanvas.width),
        y: Math.round(corner.y * baseCanvas.height),
      }))

      const minX = Math.max(0, Math.min(...points.map((point) => point.x)))
      const maxX = Math.min(baseCanvas.width, Math.max(...points.map((point) => point.x)))
      const minY = Math.max(0, Math.min(...points.map((point) => point.y)))
      const maxY = Math.min(baseCanvas.height, Math.max(...points.map((point) => point.y)))

      const outputWidth = Math.max(1, maxX - minX)
      const outputHeight = Math.max(1, maxY - minY)

      const outputCanvas = document.createElement('canvas')
      outputCanvas.width = outputWidth
      outputCanvas.height = outputHeight
      const outputContext = outputCanvas.getContext('2d')
      if (!outputContext) throw new Error('No se pudo crear la vista previa')

      outputContext.save()
      outputContext.beginPath()
      outputContext.moveTo(points[0].x - minX, points[0].y - minY)
      for (let index = 1; index < points.length; index += 1) {
        outputContext.lineTo(points[index].x - minX, points[index].y - minY)
      }
      outputContext.closePath()
      outputContext.clip()
      outputContext.drawImage(baseCanvas, -minX, -minY)
      outputContext.restore()

      const outputType = selectedFile.type.startsWith('image/') ? selectedFile.type : 'image/jpeg'
      const blob = await new Promise<Blob | null>((resolve) => {
        outputCanvas.toBlob((value) => resolve(value), outputType, 0.95)
      })

      if (!blob) throw new Error('No se pudo generar la imagen ajustada')

      const extension = getFileExtension(blob.type)
      const editedFile = new File([blob], `${label.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.${extension}`, {
        type: blob.type,
      })

      if (previewUrl) URL.revokeObjectURL(previewUrl)
      const newPreviewUrl = URL.createObjectURL(blob)
      setPreviewUrl(newPreviewUrl)
      onProcessedFileChange(editedFile)
      setIsDirty(false)
      triggerHaptic('success')
      setShowSuccessFeedback(true)
      setInlineStatus({ type: 'success', message: 'Ajuste aplicado correctamente.' })
      window.setTimeout(() => setShowSuccessFeedback(false), 850)
      window.setTimeout(() => setInlineStatus(null), 1800)
    } catch (error) {
      console.error(error)
      triggerHaptic('error')
      setShowErrorFeedback(true)
      setInlineStatus({ type: 'error', message: 'No se pudo procesar la imagen. Reintenta.' })
      window.setTimeout(() => setShowErrorFeedback(false), 1000)
      window.setTimeout(() => setInlineStatus(null), 2200)
    } finally {
      setIsApplying(false)
    }
  }

  const adjustmentWorkspace = (
    <>
      <div className="relative">
      <div
        ref={frameRef}
        className={`relative w-full overflow-hidden rounded-md border border-slate-200 bg-slate-950/5 dark:border-slate-800 ${frameHeightClass}`}
        style={{
          clipPath: `polygon(${polygonPoints})`,
        }}
      >
        <img src={sourceUrl} alt={`Ajuste de ${label}`} className="h-full w-full object-contain" style={{ transform: `rotate(${rotation}deg)` }} />
      </div>

      <div
        className={`pointer-events-none absolute inset-0 rounded-md border-2 border-emerald-400/70 transition-opacity duration-300 ${showSuccessFeedback ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        className={`pointer-events-none absolute inset-0 rounded-md border-2 border-red-400/70 transition-opacity duration-300 ${showErrorFeedback ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-all duration-300 ${showSuccessFeedback ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
      >
        <div className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white shadow">
          Ajuste aplicado
        </div>
      </div>
      <div
        className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-all duration-300 ${showErrorFeedback ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
      >
        <div className="rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white shadow">
          Error al procesar
        </div>
      </div>
      </div>

      <div className={`relative w-full overflow-hidden rounded-md border border-dashed border-blue-300 dark:border-sky-700 ${frameHeightClass}`}>
        <img src={sourceUrl} alt={`Guía de ${label}`} className="h-full w-full object-contain opacity-90" style={{ transform: `rotate(${rotation}deg)` }} />

        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points={corners.map((corner) => `${corner.x * 100},${corner.y * 100}`).join(' ')} fill="rgba(14, 165, 233, 0.12)" stroke="rgba(14, 165, 233, 0.8)" strokeWidth="0.8" strokeDasharray="2 2" />
          {corners.map((corner, index) => (
            <circle
              key={`${label}-${index}`}
              cx={corner.x * 100}
              cy={corner.y * 100}
              r={2.1}
              fill="rgba(2, 132, 199, 1)"
              style={{ cursor: 'grab' }}
              onPointerDown={(event) => {
                event.preventDefault()
                triggerHaptic('light')
                setDraggingCorner(index)
                ;(event.currentTarget as SVGCircleElement).setPointerCapture(event.pointerId)
              }}
              onPointerMove={(event) => {
                if (draggingCorner !== index) return
                setIsDirty(true)
                updateCornerFromPointer(event.clientX, event.clientY, index)
              }}
              onPointerUp={(event) => {
                if (draggingCorner === index) setDraggingCorner(null)
                triggerHaptic('light')
                ;(event.currentTarget as SVGCircleElement).releasePointerCapture(event.pointerId)
              }}
            />
          ))}
        </svg>
      </div>

      {previewUrl ? (
        <img src={previewUrl} alt={`Vista final ${label}`} className="h-24 w-full rounded border border-slate-200 object-contain dark:border-slate-800" />
      ) : null}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Guía: centra el documento en el marco, evita sombras y ajusta las 4 esquinas para quitar zonas indeseadas antes de subir.
      </p>

      {inlineStatus ? (
        <div
          className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs font-medium ${inlineStatus.type === 'success'
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200'
            : 'border-red-300 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200'
            }`}
        >
          <span>{inlineStatus.message}</span>
          <button
            type="button"
            onClick={() => setInlineStatus(null)}
            className="h-5 w-5 rounded text-xs leading-none opacity-80 hover:opacity-100"
            aria-label="Cerrar mensaje"
          >
            ×
          </button>
        </div>
      ) : null}
    </>
  )

  const actionButtons = (
    <div className="grid grid-cols-3 gap-2">
      <Button type="button" variant="outline" onClick={rotateClockwise} className="h-11">Rotar</Button>
      <Button type="button" variant="outline" onClick={resetCorners} className="h-11">Reiniciar</Button>
      <Button type="button" onClick={applyAdjustments} disabled={isApplying} className="h-11">{isApplying ? 'Aplicando...' : 'Aplicar'}</Button>
    </div>
  )

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <input
        type="file"
        capture="environment"
        accept="image/*,.jpg,.jpeg,.png,.webp"
        onChange={(event) => handleFileSelect(event.target.files?.[0] || null, event.target)}
        required={required}
        className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:file:bg-slate-800 dark:file:text-slate-200"
      />
      {selectedFile ? (
        <div className="text-xs text-slate-500 dark:text-slate-400">Archivo actual: {getFileMeta(selectedFile)}</div>
      ) : null}

      {sourceUrl ? (
        <>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsFullscreen(true)}
              className="h-10 px-4"
            >
              Pantalla completa
            </Button>
          </div>

          {isFullscreen ? (
            <div className="fixed inset-0 z-50 bg-black/70 p-3 backdrop-blur-sm md:p-6">
              <div className="mx-auto h-full w-full max-w-4xl overflow-auto rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Edición de documento</div>
                  <Button type="button" variant="outline" className="h-9 px-3" onClick={requestCloseFullscreen}>
                    Cerrar
                  </Button>
                </div>
                <div className="space-y-3 pb-24">{adjustmentWorkspace}</div>
                <div className="sticky bottom-0 left-0 right-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
                  {actionButtons}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {adjustmentWorkspace}
              {actionButtons}
            </div>
          )}
        </>
      ) : (
        <div className={`relative w-full overflow-hidden rounded-md border border-dashed border-blue-300 bg-slate-50 dark:border-sky-700 dark:bg-slate-900/40 ${frameHeightClass}`}>
          <div className="absolute inset-4 rounded-md border-2 border-dashed border-blue-400/80 dark:border-sky-500/80" />
          <div className="absolute left-4 top-4 h-4 w-4 border-l-2 border-t-2 border-blue-500 dark:border-sky-400" />
          <div className="absolute right-4 top-4 h-4 w-4 border-r-2 border-t-2 border-blue-500 dark:border-sky-400" />
          <div className="absolute left-4 bottom-4 h-4 w-4 border-l-2 border-b-2 border-blue-500 dark:border-sky-400" />
          <div className="absolute right-4 bottom-4 h-4 w-4 border-r-2 border-b-2 border-blue-500 dark:border-sky-400" />
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-slate-600 dark:text-slate-300">
            Alinea el documento dentro del marco guía y toma la foto en horizontal.
          </div>
        </div>
      )}
    </div>
  )
}
