import { useEffect, useMemo, useRef, useState } from 'react'
import Cropper, { type ReactCropperElement } from 'react-cropper'
import 'cropperjs/dist/cropper.css'
import { Button } from '../ui/Button'
import { Label } from '../ui/Label'

interface IdentityImageEditorProps {
  label: string
  onProcessedFileChange: (file: File | null) => void
  maxSizeMb?: number
  required?: boolean
  initialFile?: File | null
}

interface AspectPreset {
  id: 'free' | 'id_h' | 'id_v' | 'square'
  label: string
  ratio: number | null
}

interface CropResolution {
  width: number
  height: number
}

const ASPECT_PRESETS: AspectPreset[] = [
  { id: 'free', label: 'Libre', ratio: null },
  { id: 'id_h', label: 'ID H', ratio: 1.586 },
  { id: 'id_v', label: 'ID V', ratio: 1 / 1.586 },
  { id: 'square', label: '1:1', ratio: 1 },
]

const MIN_LONG_SIDE_PX = 1200
const MIN_SHORT_SIDE_PX = 700

const getFileExtension = (type: string) => {
  if (type.includes('png')) return 'png'
  if (type.includes('webp')) return 'webp'
  return 'jpg'
}

const triggerHaptic = (type: 'light' | 'success' | 'error') => {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  if (type === 'light') {
    navigator.vibrate(8)
    return
  }
  if (type === 'success') {
    navigator.vibrate([12, 20, 12])
    return
  }
  navigator.vibrate(35)
}

const defaultAspectPresetForLabel = (label: string): AspectPreset['id'] => {
  const normalized = (label || '').trim().toLowerCase()
  if (/anverso|reverso|identidad|documento/.test(normalized)) return 'id_h'
  return 'free'
}

const toSlug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'editor'

export default function IdentityImageEditor({
  label,
  onProcessedFileChange,
  maxSizeMb = 5,
  required = false,
  initialFile = null,
}: IdentityImageEditorProps) {
  const cropperRef = useRef<ReactCropperElement | null>(null)
  const labelSlug = useMemo(() => toSlug(label), [label])

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [isApplying, setIsApplying] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [isInteracting, setIsInteracting] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [viewMode, setViewMode] = useState<'before' | 'after'>('before')
  const [aspectPresetId, setAspectPresetId] = useState<AspectPreset['id']>(() => defaultAspectPresetForLabel(label))
  const [cropResolution, setCropResolution] = useState<CropResolution>({ width: 0, height: 0 })
  const [inlineStatus, setInlineStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const isLowResolution =
    cropResolution.width > 0 &&
    cropResolution.height > 0 &&
    (Math.max(cropResolution.width, cropResolution.height) < MIN_LONG_SIDE_PX ||
      Math.min(cropResolution.width, cropResolution.height) < MIN_SHORT_SIDE_PX)

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl, sourceUrl])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia('(max-width: 768px)')
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches)
    updateViewport()
    mediaQuery.addEventListener('change', updateViewport)
    return () => mediaQuery.removeEventListener('change', updateViewport)
  }, [])

  useEffect(() => {
    if (!isInteracting || !isMobileViewport) return
    const previousOverscroll = document.body.style.overscrollBehavior
    const preventTouchMove = (event: TouchEvent) => event.preventDefault()
    document.body.style.overscrollBehavior = 'none'
    document.addEventListener('touchmove', preventTouchMove, { passive: false })
    return () => {
      document.body.style.overscrollBehavior = previousOverscroll
      document.removeEventListener('touchmove', preventTouchMove)
    }
  }, [isInteracting, isMobileViewport])

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

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isDirty, isFullscreen])

  useEffect(() => {
    if (!sourceUrl) return

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return
      }

      const cropper = cropperRef.current?.cropper
      if (!cropper) return

      const key = event.key.toLowerCase()
      if (key === '+' || key === '=' || key === 'add') {
        event.preventDefault()
        cropper.zoom(0.1)
        setIsDirty(true)
        triggerHaptic('light')
        return
      }

      if (key === '-' || key === '_' || key === 'subtract') {
        event.preventDefault()
        cropper.zoom(-0.1)
        setIsDirty(true)
        triggerHaptic('light')
        return
      }

      if (key === 'r') {
        event.preventDefault()
        cropper.rotate(90)
        setIsDirty(true)
        triggerHaptic('light')
        return
      }

      if (key === '0') {
        event.preventDefault()
        cropper.reset()
        setIsDirty(true)
        triggerHaptic('light')
        return
      }

      if (key === 'enter') {
        event.preventDefault()
        const applyButton = document.querySelector(`[data-testid="apply-crop-${labelSlug}"]`) as HTMLButtonElement | null
        if (applyButton && !applyButton.disabled) applyButton.click()
        return
      }

      if (key === 'escape' && isFullscreen) {
        event.preventDefault()
        if (isDirty) {
          const shouldClose = window.confirm('Tienes cambios sin aplicar. ¿Seguro que deseas cerrar?')
          if (!shouldClose) return
        }
        setIsFullscreen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isDirty, isFullscreen, labelSlug, sourceUrl])

  useEffect(() => {
    if (!initialFile && selectedFile) {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setSelectedFile(null)
      setSourceUrl('')
      setPreviewUrl('')
      setIsDirty(false)
      return
    }

    if (!initialFile) return

    const isSameFile =
      selectedFile &&
      initialFile.name === selectedFile.name &&
      initialFile.size === selectedFile.size &&
      initialFile.lastModified === selectedFile.lastModified

    if (isSameFile) return

    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    if (previewUrl) URL.revokeObjectURL(previewUrl)

    const nextUrl = URL.createObjectURL(initialFile)
    setSelectedFile(initialFile)
    setSourceUrl(nextUrl)
    setPreviewUrl('')
    setViewMode('before')
    setIsDirty(false)
  }, [initialFile, previewUrl, selectedFile, sourceUrl])

  const updateResolutionFromCropper = (cropper?: ReactCropperElement['cropper']) => {
    const targetCropper = cropper || cropperRef.current?.cropper
    if (!targetCropper) return
    const data = targetCropper.getData(true)
    const width = Math.max(0, Math.round(Math.abs(data.width || 0)))
    const height = Math.max(0, Math.round(Math.abs(data.height || 0)))
    setCropResolution({ width, height })
  }

  const fitCropBoxToImage = (cropper?: ReactCropperElement['cropper']) => {
    const targetCropper = cropper || cropperRef.current?.cropper
    if (!targetCropper) return

    const imageData = targetCropper.getImageData()
    const marginFactor = 0.9
    const preset = ASPECT_PRESETS.find((item) => item.id === aspectPresetId)
    const ratio = preset?.ratio ?? null

    let width = imageData.width * marginFactor
    let height = imageData.height * marginFactor

    if (ratio) {
      width = imageData.width * marginFactor
      height = width / ratio
      if (height > imageData.height * marginFactor) {
        height = imageData.height * marginFactor
        width = height * ratio
      }
    }

    const left = imageData.left + (imageData.width - width) / 2
    const top = imageData.top + (imageData.height - height) / 2

    targetCropper.setCropBoxData({ left, top, width, height })
    updateResolutionFromCropper(targetCropper)
  }

  const applyAspectPreset = (presetId: AspectPreset['id']) => {
    setAspectPresetId(presetId)
    const cropper = cropperRef.current?.cropper
    if (!cropper) return

    const preset = ASPECT_PRESETS.find((item) => item.id === presetId)
    cropper.setAspectRatio(preset?.ratio ?? NaN)
    window.requestAnimationFrame(() => {
      fitCropBoxToImage(cropper)
    })
    setIsDirty(true)
    triggerHaptic('light')
  }

  const getFileMeta = (file: File) => {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2)
    return `${file.name} · ${sizeMb}MB · ${file.type || 'tipo desconocido'}`
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

    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    if (previewUrl) URL.revokeObjectURL(previewUrl)

    const nextUrl = URL.createObjectURL(file)
    setSelectedFile(file)
    setSourceUrl(nextUrl)
    setPreviewUrl('')
    setViewMode('before')
    setIsDirty(true)
    setCropResolution({ width: 0, height: 0 })
    onProcessedFileChange(file)
    setInlineStatus({ type: 'success', message: `Archivo cargado: ${getFileMeta(file)}` })
    window.setTimeout(() => setInlineStatus(null), 1800)

    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      setIsFullscreen(true)
    }
  }

  const requestCloseFullscreen = () => {
    if (isDirty) {
      const shouldClose = window.confirm('Tienes cambios sin aplicar. ¿Seguro que deseas cerrar?')
      if (!shouldClose) return
    }
    setIsFullscreen(false)
  }

  const zoomIn = () => {
    const cropper = cropperRef.current?.cropper
    if (!cropper) return
    cropper.zoom(0.1)
    setIsDirty(true)
    updateResolutionFromCropper(cropper)
    triggerHaptic('light')
  }

  const zoomOut = () => {
    const cropper = cropperRef.current?.cropper
    if (!cropper) return
    cropper.zoom(-0.1)
    setIsDirty(true)
    updateResolutionFromCropper(cropper)
    triggerHaptic('light')
  }

  const rotateClockwise = () => {
    const cropper = cropperRef.current?.cropper
    if (!cropper) return
    cropper.rotate(90)
    setIsDirty(true)
    updateResolutionFromCropper(cropper)
    triggerHaptic('light')
  }

  const resetCrop = () => {
    const cropper = cropperRef.current?.cropper
    if (!cropper) return
    cropper.reset()
    setIsDirty(true)
    fitCropBoxToImage(cropper)
    triggerHaptic('light')
  }

  const applyAdjustments = async () => {
    const cropper = cropperRef.current?.cropper
    if (!selectedFile || !cropper) return

    if (isLowResolution) {
      const shouldProceed = window.confirm(
        `La resolución del recorte (${cropResolution.width}x${cropResolution.height}) es baja. Se recomienda al menos ${MIN_LONG_SIDE_PX}x${MIN_SHORT_SIDE_PX}. ¿Deseas continuar?`,
      )
      if (!shouldProceed) return
    }

    setIsApplying(true)
    try {
      const outputCanvas = cropper.getCroppedCanvas({
        fillColor: '#ffffff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        maxWidth: 3000,
        maxHeight: 3000,
      })

      if (!outputCanvas) throw new Error('No se pudo generar la imagen recortada')

      const outputType = selectedFile.type.startsWith('image/') ? selectedFile.type : 'image/jpeg'
      const blob = await new Promise<Blob | null>((resolve) => {
        outputCanvas.toBlob((value) => resolve(value), outputType, 0.95)
      })

      if (!blob) throw new Error('No se pudo generar la imagen recortada')

      const extension = getFileExtension(blob.type)
      const editedFile = new File([blob], `${label.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.${extension}`, {
        type: blob.type,
      })

      const nextUrl = URL.createObjectURL(blob)
      setSourceUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return nextUrl
      })
      setPreviewUrl((current) => {
        if (current && current !== nextUrl) URL.revokeObjectURL(current)
        return nextUrl
      })
      setSelectedFile(editedFile)
      onProcessedFileChange(editedFile)
      setViewMode('after')
      setIsDirty(false)
      updateResolutionFromCropper(cropper)
      setInlineStatus({ type: 'success', message: 'Recorte aplicado correctamente.' })
      triggerHaptic('success')
      window.setTimeout(() => setInlineStatus(null), 1800)
    } catch (error) {
      console.error(error)
      setInlineStatus({ type: 'error', message: 'No se pudo procesar la imagen. Reintenta.' })
      triggerHaptic('error')
      window.setTimeout(() => setInlineStatus(null), 2200)
    } finally {
      setIsApplying(false)
    }
  }

  const cropperAreaClass = isFullscreen ? 'h-[46vh] md:h-[58vh]' : 'h-56 md:h-72'

  const editorBlock = sourceUrl ? (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {ASPECT_PRESETS.map((preset) => (
          <Button
            key={`${labelSlug}-${preset.id}`}
            type="button"
            variant={aspectPresetId === preset.id ? 'default' : 'outline'}
            className="h-9 px-3"
            data-testid={`aspect-preset-${preset.id}-${labelSlug}`}
            onClick={() => applyAspectPreset(preset.id)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {previewUrl ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={viewMode === 'before' ? 'default' : 'outline'}
            className="h-8 px-3 text-xs"
            data-testid={`before-toggle-${labelSlug}`}
            onClick={() => setViewMode('before')}
          >
            Antes
          </Button>
          <Button
            type="button"
            variant={viewMode === 'after' ? 'default' : 'outline'}
            className="h-8 px-3 text-xs"
            data-testid={`after-toggle-${labelSlug}`}
            onClick={() => setViewMode('after')}
          >
            Después
          </Button>
        </div>
      ) : null}

      {viewMode === 'after' && previewUrl ? (
        <img
          src={previewUrl}
          alt={`Vista previa ${label}`}
          className={`h-56 w-full rounded border border-slate-200 object-contain dark:border-slate-800 ${isFullscreen ? 'md:h-[58vh]' : 'md:h-72'}`}
        />
      ) : (
        <div
          className={`w-full overflow-hidden rounded-md border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 ${cropperAreaClass}`}
          style={{ touchAction: 'none' }}
        >
          <Cropper
            ref={cropperRef}
            src={sourceUrl}
            style={{ height: '100%', width: '100%' }}
            viewMode={1}
            dragMode="move"
            guides
            center
            background={false}
            responsive
            checkOrientation
            autoCrop
            autoCropArea={0.88}
            movable
            zoomable
            rotatable
            scalable={false}
            zoomOnWheel
            zoomOnTouch
            cropBoxMovable
            cropBoxResizable
            toggleDragModeOnDblclick={false}
            ready={() => {
              const cropper = cropperRef.current?.cropper
              if (!cropper) return
              const preset = ASPECT_PRESETS.find((item) => item.id === aspectPresetId)
              cropper.setAspectRatio(preset?.ratio ?? NaN)
              fitCropBoxToImage(cropper)
              setIsDirty(false)
            }}
            cropstart={() => {
              setIsInteracting(true)
            }}
            cropend={() => {
              setIsInteracting(false)
              setIsDirty(true)
              updateResolutionFromCropper()
            }}
            cropmove={() => updateResolutionFromCropper()}
            zoom={() => {
              setIsDirty(true)
              updateResolutionFromCropper()
            }}
          />
        </div>
      )}

      <div
        className={`rounded-md border px-3 py-2 text-xs font-medium ${isLowResolution
          ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200'
          : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200'
          }`}
        data-testid={`resolution-status-${labelSlug}`}
      >
        Resolución estimada: {cropResolution.width || 0}x{cropResolution.height || 0}px. Objetivo recomendado: {MIN_LONG_SIDE_PX}x{MIN_SHORT_SIDE_PX}px.
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Atajos: `+/-` zoom, `R` rotar, `0` reiniciar, `Esc` cerrar y `Enter` aplicar.
      </p>

      {previewUrl ? (
        <img src={previewUrl} alt={`Vista previa ${label}`} className="h-24 w-full rounded border border-slate-200 object-contain dark:border-slate-800" />
      ) : null}

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

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Button type="button" variant="outline" onClick={zoomOut} className="h-11">- Zoom</Button>
        <Button type="button" variant="outline" onClick={zoomIn} className="h-11">+ Zoom</Button>
        <Button type="button" variant="outline" onClick={rotateClockwise} className="h-11">Rotar</Button>
        <Button type="button" variant="outline" onClick={resetCrop} className="h-11">Reiniciar</Button>
        <Button
          type="button"
          onClick={applyAdjustments}
          disabled={isApplying || !isDirty}
          className="h-11"
          data-testid={`apply-crop-${labelSlug}`}
        >
          {isApplying ? 'Aplicando...' : 'Aplicar'}
        </Button>
      </div>

      {isFullscreen && isMobileViewport ? (
        <div className="sticky bottom-0 z-20 -mx-4 border-t border-slate-200 bg-white/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <Button
            type="button"
            onClick={applyAdjustments}
            disabled={isApplying || !isDirty}
            className="h-12 w-full"
            data-testid={`mobile-apply-crop-${labelSlug}`}
          >
            {isApplying ? 'Aplicando...' : 'Aplicar Recorte'}
          </Button>
        </div>
      ) : null}
    </div>
  ) : (
    <div className={`relative w-full overflow-hidden rounded-md border border-dashed border-blue-300 bg-slate-50 dark:border-sky-700 dark:bg-slate-900/40 ${cropperAreaClass}`}>
      <div className="absolute inset-4 rounded-md border-2 border-dashed border-blue-400/80 dark:border-sky-500/80" />
      <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-slate-600 dark:text-slate-300">
        Selecciona una imagen para abrir el editor de recorte tradicional.
      </div>
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
            <Button type="button" variant="outline" onClick={() => setIsFullscreen(true)} className="h-10 px-4">
              Pantalla completa
            </Button>
          </div>

          {isFullscreen ? (
            <div className="fixed inset-0 z-50 bg-black/70 p-3 backdrop-blur-sm md:p-6">
              <div className="mx-auto h-full w-full max-w-5xl overflow-auto rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Edición de documento</div>
                  <Button type="button" variant="outline" className="h-9 px-3" onClick={requestCloseFullscreen}>
                    Cerrar
                  </Button>
                </div>
                <div className="space-y-3 pb-24">{editorBlock}</div>
              </div>
            </div>
          ) : (
            editorBlock
          )}
        </>
      ) : (
        editorBlock
      )}
    </div>
  )
}
