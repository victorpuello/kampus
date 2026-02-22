import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Toast, type ToastType } from '../components/ui/Toast'
import { certificatesApi, type CertificateStudiesIssuePayload } from '../services/certificates'

const STORAGE_KEY = 'kampus:certificates:previewPayload'
const PREVIEW_STORAGE_PREFIX = 'kampus:certificates:previewPayload:'
const PREVIEW_LAST_ID_KEY = 'kampus:certificates:previewLastId'

function injectBaseHref(html: string, baseHref: string) {
  if (!html) return html
  if (html.includes('<base ')) return html
  if (html.includes('<head>')) return html.replace('<head>', `<head><base href="${baseHref}">`)
  return `<base href="${baseHref}">${html}`
}

const getErrorDetail = (err: unknown): string | undefined => {
  const anyErr = err as {
    response?: {
      data?: unknown
    }
  }

  let rawData = anyErr?.response?.data
  if (typeof rawData === 'string') {
    const trimmed = rawData.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        rawData = JSON.parse(trimmed)
      } catch {
        if (trimmed) return trimmed.slice(0, 220)
      }
    } else if (trimmed) {
      return trimmed.slice(0, 220)
    }
  }

  const data = rawData as Record<string, unknown> | undefined
  if (!data || typeof data !== 'object') return undefined

  const detail = data.detail
  if (typeof detail === 'string' && detail.trim()) return detail

  const error = data.error
  if (typeof error === 'string' && error.trim()) return error

  const message = data.message
  if (typeof message === 'string' && message.trim()) return message

  return undefined
}

export default function AdministrativeCertificatesPreview() {
  const [loading, setLoading] = useState(false)
  const [html, setHtml] = useState('')
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const previewId = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const id = params.get('id')
      return id && id.trim() ? id : null
    } catch {
      return null
    }
  }, [])

  const payload = useMemo(() => {
    try {
      // Preferred: payload stored in localStorage and referenced by id (works across tabs)
      const effectiveId = previewId || localStorage.getItem(PREVIEW_LAST_ID_KEY)
      if (effectiveId) {
        const rawLocal = localStorage.getItem(`${PREVIEW_STORAGE_PREFIX}${effectiveId}`)
        if (rawLocal) return JSON.parse(rawLocal) as CertificateStudiesIssuePayload
      }

      // Fallback: legacy storage (same-tab only)
      const rawSession = sessionStorage.getItem(STORAGE_KEY)
      if (!rawSession) return null
      return JSON.parse(rawSession) as CertificateStudiesIssuePayload
    } catch {
      return null
    }
  }, [previewId])

  const load = async () => {
    if (!payload) {
      showToast('No hay datos de vista previa. Vuelve a Certificados y abre la vista previa desde allí.', 'error')
      return
    }

    setLoading(true)
    try {
      const res = await certificatesApi.previewStudies(payload)
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
      setHtml(injectBaseHref(String(res.data ?? ''), baseUrl))
    } catch (err: unknown) {
      console.error(err)
      const detail = getErrorDetail(err)
      showToast(detail ? `Error cargando vista previa HTML: ${detail}` : 'Error cargando vista previa HTML.', 'error')
      setHtml('')
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    if (!html) {
      showToast('No hay contenido para imprimir.', 'error')
      return
    }

    try {
      const w = iframeRef.current?.contentWindow
      if (!w) {
        showToast('No se pudo acceder a la vista previa para imprimir.', 'error')
        return
      }
      w.focus()
      w.print()
    } catch (err) {
      console.error(err)
      showToast('El navegador bloqueó la impresión. Intenta recargar y volver a imprimir.', 'error')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Vista previa HTML — Certificado de estudios</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? 'Cargando...' : 'Recargar'}
            </Button>
            <Button variant="outline" onClick={handlePrint} disabled={loading || !html}>
              Imprimir
            </Button>
          </div>

          {!html ? (
            <div className="mt-4 text-slate-600">No hay contenido para mostrar.</div>
          ) : (
            <div className="mt-4">
              <iframe
                title="Vista previa certificado"
                ref={iframeRef}
                style={{ width: '100%', height: '80vh', border: '1px solid #e5e7eb', borderRadius: 8 }}
                sandbox="allow-same-origin allow-modals"
                srcDoc={html}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((prev) => ({ ...prev, isVisible: false }))}
      />
    </>
  )
}
