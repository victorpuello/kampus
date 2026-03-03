import { useEffect, useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { documentsApi } from '../../services/students'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

interface DocumentViewerModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  sourceUrl: string
}

export default function DocumentViewerModal({ isOpen, onClose, title, sourceUrl }: DocumentViewerModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [viewerUrl, setViewerUrl] = useState('')
  const [viewerKind, setViewerKind] = useState<'pdf' | 'image' | 'other'>('other')

  const detectViewerType = async (
    blob: Blob,
    mimeHint: string,
    urlHint: string
  ): Promise<{ kind: 'pdf' | 'image' | 'other'; mimeType: string }> => {
    const normalizedMime = (mimeHint || '').toLowerCase()
    const normalizedUrl = (urlHint || '').toLowerCase()

    if (normalizedMime.includes('pdf')) return { kind: 'pdf', mimeType: 'application/pdf' }
    if (normalizedMime.startsWith('image/')) return { kind: 'image', mimeType: normalizedMime }
    if (normalizedUrl.includes('.pdf')) return { kind: 'pdf', mimeType: 'application/pdf' }
    if (/\.(jpe?g)(\?|$)/.test(normalizedUrl)) return { kind: 'image', mimeType: 'image/jpeg' }
    if (/\.(png)(\?|$)/.test(normalizedUrl)) return { kind: 'image', mimeType: 'image/png' }
    if (/\.(webp)(\?|$)/.test(normalizedUrl)) return { kind: 'image', mimeType: 'image/webp' }
    if (/\.(gif)(\?|$)/.test(normalizedUrl)) return { kind: 'image', mimeType: 'image/gif' }
    if (/\.(bmp)(\?|$)/.test(normalizedUrl)) return { kind: 'image', mimeType: 'image/bmp' }
    if (/\.(tiff?)(\?|$)/.test(normalizedUrl)) return { kind: 'image', mimeType: 'image/tiff' }

    try {
      const headerBytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer())
      const headerText = String.fromCharCode(...headerBytes)
      if (headerText.startsWith('%PDF-')) return { kind: 'pdf', mimeType: 'application/pdf' }

      const isJpeg = headerBytes[0] === 0xff && headerBytes[1] === 0xd8 && headerBytes[2] === 0xff
      const isPng =
        headerBytes[0] === 0x89 &&
        headerBytes[1] === 0x50 &&
        headerBytes[2] === 0x4e &&
        headerBytes[3] === 0x47
      const isGif =
        headerBytes[0] === 0x47 &&
        headerBytes[1] === 0x49 &&
        headerBytes[2] === 0x46 &&
        headerBytes[3] === 0x38
      const isBmp = headerBytes[0] === 0x42 && headerBytes[1] === 0x4d
      const isTiff =
        (headerBytes[0] === 0x49 && headerBytes[1] === 0x49 && headerBytes[2] === 0x2a && headerBytes[3] === 0x00) ||
        (headerBytes[0] === 0x4d && headerBytes[1] === 0x4d && headerBytes[2] === 0x00 && headerBytes[3] === 0x2a)
      const isWebp =
        headerBytes[0] === 0x52 &&
        headerBytes[1] === 0x49 &&
        headerBytes[2] === 0x46 &&
        headerBytes[3] === 0x46 &&
        headerBytes[8] === 0x57 &&
        headerBytes[9] === 0x45 &&
        headerBytes[10] === 0x42 &&
        headerBytes[11] === 0x50

      if (isJpeg) return { kind: 'image', mimeType: 'image/jpeg' }
      if (isPng) return { kind: 'image', mimeType: 'image/png' }
      if (isGif) return { kind: 'image', mimeType: 'image/gif' }
      if (isBmp) return { kind: 'image', mimeType: 'image/bmp' }
      if (isTiff) return { kind: 'image', mimeType: 'image/tiff' }
      if (isWebp) return { kind: 'image', mimeType: 'image/webp' }
    } catch {
      // no-op
    }

    return { kind: 'other', mimeType: normalizedMime || 'application/octet-stream' }
  }

  useEffect(() => {
    if (!isOpen || !sourceUrl) return

    let isCancelled = false
    setLoading(true)
    setError('')

    void documentsApi.previewDocumentByUrl(sourceUrl)
      .then(async (response) => {
        if (isCancelled) return
        const blob = response.data
        const headerContentType = String(response.headers?.['content-type'] || '')
        const effectiveMime = (blob.type || headerContentType || 'application/octet-stream').toLowerCase()
        const detected = await detectViewerType(blob, effectiveMime, sourceUrl)
        if (isCancelled) return
        const typedBlob = blob.type === detected.mimeType ? blob : new Blob([blob], { type: detected.mimeType })
        const objectUrl = URL.createObjectURL(typedBlob)
        setViewerUrl((current) => {
          if (current) URL.revokeObjectURL(current)
          return objectUrl
        })
        setViewerKind(detected.kind)
      })
      .catch((err) => {
        if (isCancelled) return
        console.error('Error opening integrated viewer:', err)
        setError('No se pudo cargar la previsualización del documento.')
      })
      .finally(() => {
        if (!isCancelled) setLoading(false)
      })

    return () => {
      isCancelled = true
    }
  }, [isOpen, sourceUrl])

  useEffect(() => {
    return () => {
      if (viewerUrl) URL.revokeObjectURL(viewerUrl)
    }
  }, [viewerUrl])

  const closeViewer = () => {
    setLoading(false)
    setError('')
    setViewerKind('other')
    if (viewerUrl) {
      URL.revokeObjectURL(viewerUrl)
      setViewerUrl('')
    }
    onClose()
  }

  const baseName = useMemo(() => {
    const cleanTitle = (title || 'documento')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\-_ ]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .toLowerCase()
    return cleanTitle || 'documento'
  }, [title])

  const buildViewerPdfBlob = async (): Promise<Blob> => {
    if (!viewerUrl) {
      throw new Error('No hay documento para convertir a PDF')
    }

    if (viewerKind === 'pdf') {
      const response = await fetch(viewerUrl)
      return await response.blob()
    }

    if (viewerKind === 'image') {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('No se pudo cargar la imagen para PDF'))
        img.src = viewerUrl
      })

      const orientation = image.width >= image.height ? 'l' : 'p'
      const pdf = new jsPDF({
        orientation,
        unit: 'pt',
        format: 'a4',
      })

      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const ratio = Math.min(pageWidth / image.width, pageHeight / image.height)
      const renderWidth = image.width * ratio
      const renderHeight = image.height * ratio
      const x = (pageWidth - renderWidth) / 2
      const y = (pageHeight - renderHeight) / 2

      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('No se pudo preparar el lienzo de conversión')
      context.drawImage(image, 0, 0)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)

      pdf.addImage(dataUrl, 'JPEG', x, y, renderWidth, renderHeight)
      return pdf.output('blob')
    }

    throw new Error('Este tipo de archivo no se puede convertir a PDF')
  }

  const downloadAsPdf = () => {
    if (!viewerUrl) return

    const run = async () => {
      const pdfBlob = await buildViewerPdfBlob()
      const pdfUrl = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = pdfUrl
      link.download = `${baseName}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(pdfUrl)
    }

    void run().catch((err) => {
      console.error('Error descargando documento en PDF:', err)
      setError('No se pudo descargar en PDF. Intenta nuevamente.')
    })
  }

  const printAsPdf = () => {
    if (!viewerUrl) return

    const run = async () => {
      const pdfBlob = await buildViewerPdfBlob()
      const pdfUrl = URL.createObjectURL(pdfBlob)
      const printWindow = window.open(pdfUrl, '_blank', 'noopener,noreferrer')
      if (!printWindow) {
        URL.revokeObjectURL(pdfUrl)
        return
      }

      window.setTimeout(() => {
        try {
          printWindow.print()
        } catch {
          // no-op
        }
      }, 800)

      window.setTimeout(() => {
        URL.revokeObjectURL(pdfUrl)
      }, 4000)
    }

    void run().catch((err) => {
      console.error('Error imprimiendo documento en PDF:', err)
      setError('No se pudo imprimir en PDF. Intenta nuevamente.')
    })
  }

  const detectedTypeLabel = viewerKind === 'pdf' ? 'PDF detectado' : viewerKind === 'image' ? 'Imagen detectada' : 'Tipo no compatible'
  const detectedTypeClassName = viewerKind === 'pdf'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200'
    : viewerKind === 'image'
      ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-200'
      : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200'

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeViewer}
      title={title || 'Documento'}
      size="xl"
      footer={(
        <>
          <Button
            type="button"
            variant="outline"
            onClick={printAsPdf}
            disabled={loading || !!error || !viewerUrl}
          >
            <Printer className="mr-2 h-4 w-4" /> Imprimir
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={downloadAsPdf}
            disabled={loading || !!error || !viewerUrl}
          >
            <Download className="mr-2 h-4 w-4" /> Descargar PDF
          </Button>
          <Button type="button" onClick={closeViewer}>Cerrar</Button>
        </>
      )}
    >
      {!loading && !error && viewerUrl ? (
        <div className="mb-3">
          <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${detectedTypeClassName}`}>
            {detectedTypeLabel}
          </span>
        </div>
      ) : null}

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Cargando previsualización…</div>
      ) : error ? (
        <div className="py-8 text-center text-sm text-red-600 dark:text-red-300">{error}</div>
      ) : !viewerUrl ? (
        <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No hay documento para previsualizar.</div>
      ) : viewerKind === 'pdf' ? (
        <iframe
          title="Vista previa de documento"
          src={viewerUrl}
          className="h-[70vh] w-full rounded border border-slate-200 dark:border-slate-800"
        />
      ) : viewerKind === 'image' ? (
        <img
          src={viewerUrl}
          alt="Vista previa de documento"
          className="max-h-[70vh] w-full rounded border border-slate-200 object-contain dark:border-slate-800"
        />
      ) : (
        <div className="space-y-3 py-8 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-300">No hay visor integrado para este tipo de archivo.</p>
          <a
            href={viewerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline dark:text-sky-400"
          >
            Abrir en nueva pestaña
          </a>
        </div>
      )}
    </Modal>
  )
}
