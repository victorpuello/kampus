import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

type VerifyResponse = {
  valid: boolean
  status?: string
  type?: string
  uuid?: string
  issued_at?: string
  seal_hash?: string
  revoked?: boolean
  revoke_reason?: string
  student_full_name?: string
  document_number?: string
  academic_year?: string
  grade?: string
  detail?: string
}

function joinUrl(base: string, path: string) {
  const b = (base || '').trim().replace(/\/+$/, '')
  const p = (path || '').trim()
  if (!b) return p
  if (!p) return b
  return `${b}${p.startsWith('/') ? '' : '/'}${p}`
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = (err as { message?: unknown }).message
    if (typeof msg === 'string') return msg
  }
  return ''
}

export default function PublicCertificateVerify() {
  const { uuid = '' } = useParams()
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  const apiBase = (import.meta.env.VITE_API_BASE_URL || '').toString()

  const apiJsonUrl = useMemo(() => {
    const safeUuid = (uuid || '').trim()
    return joinUrl(apiBase, `/api/public/certificates/${encodeURIComponent(safeUuid)}/verify/`)
  }, [apiBase, uuid])

  useEffect(() => {
    let cancelled = false

    async function run() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(apiJsonUrl, {
          headers: {
            Accept: 'application/json',
          },
        })

        const json = (await res.json().catch(() => null)) as VerifyResponse | null
        if (cancelled) return

        if (!res.ok) {
          const detail = json?.detail || `Error HTTP ${res.status}`
          setData(json)
          setError(detail)
          return
        }

        setData(json)
      } catch (e: unknown) {
        if (cancelled) return
        setError(getErrorMessage(e) || 'Error consultando verificación')
        setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (!uuid || !uuid.trim()) {
      setLoading(false)
      setError('Código de verificación inválido')
      setData(null)
      return
    }

    run()
    return () => {
      cancelled = true
    }
  }, [apiJsonUrl, uuid])

  const statusLabel = data?.revoked
    ? 'REVOCADO'
    : data?.valid
      ? 'VÁLIDO'
      : 'NO VÁLIDO'

  const statusClass = data?.revoked
    ? 'bg-red-100 text-red-800 border-red-200'
    : data?.valid
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : 'bg-yellow-100 text-yellow-800 border-yellow-200'

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Verificación de certificado</h1>
            <p className="text-sm text-gray-600">Consulta pública por código QR</p>
          </div>
          <Link
            to="/login"
            className="text-sm px-3 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50"
          >
            Ingresar
          </Link>
        </div>

        <div className={`border rounded-lg px-4 py-3 mb-6 ${statusClass}`}>
          <div className="font-semibold">Estado: {loading ? 'CARGANDO…' : statusLabel}</div>
          <div className="text-sm break-all">Código: {(uuid || '').trim()}</div>
        </div>

        {error ? (
          <div className="border border-red-200 bg-red-50 text-red-800 rounded-lg p-4 mb-6">
            <div className="font-medium">No se pudo verificar</div>
            <div className="text-sm">{error}</div>
          </div>
        ) : null}

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-500">Estudiante</div>
              <div className="font-medium">{data?.student_full_name || '—'}</div>
            </div>
            <div>
              <div className="text-gray-500">Documento</div>
              <div className="font-medium">{data?.document_number || '—'}</div>
            </div>
            <div>
              <div className="text-gray-500">Año</div>
              <div className="font-medium">{data?.academic_year || '—'}</div>
            </div>
            <div>
              <div className="text-gray-500">Grado</div>
              <div className="font-medium">{data?.grade || '—'}</div>
            </div>
            <div>
              <div className="text-gray-500">Sello</div>
              <div className="font-medium break-all">{data?.seal_hash || '—'}</div>
            </div>
            <div>
              <div className="text-gray-500">Emitido</div>
              <div className="font-medium">{data?.issued_at ? new Date(data.issued_at).toLocaleString() : '—'}</div>
            </div>
          </div>

          {data?.revoked && data?.revoke_reason ? (
            <div className="mt-4 text-sm text-red-700">
              <span className="font-medium">Motivo revocación:</span> {data.revoke_reason}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={apiJsonUrl}
              className="text-sm px-3 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50"
            >
              Ver JSON
            </a>
          </div>
        </div>

        <div className="mt-6 text-xs text-gray-500">
          Si este documento fue emitido por Kampus, aquí se muestra su estado de validez.
        </div>
      </div>
    </div>
  )
}
