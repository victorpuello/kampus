import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Toast, type ToastType } from '../components/ui/Toast'
import { useAuthStore } from '../store/auth'
import { certificatesApi } from '../services/certificates'

type CertificateIssueListItem = {
  uuid: string
  certificate_type: string
  status: string
  issued_at: string
  amount_cop: number
  student_full_name: string
  document_number: string
  academic_year: string | number
  grade_name: string
  issued_by: { id: number; name: string } | null
  has_pdf: boolean
}

type IssuesListResponse = {
  results: CertificateIssueListItem[]
  count: number
  limit: number
}

type RevenueSummaryResponse = {
  total_count: number
  total_amount_cop: number
}

const formatCop = (value: number) => {
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `$${value.toLocaleString('es-CO')}`
  }
}

export default function AdministrativeCertificatesRevenue() {
  const user = useAuthStore((s) => s.user)
  const isAdministrativeStaff =
    user?.role === 'ADMIN' ||
    user?.role === 'SUPERADMIN' ||
    user?.role === 'COORDINATOR' ||
    user?.role === 'SECRETARY'

  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const today = useMemo(() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }, [])

  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>(today)
  const [statusFilter, setStatusFilter] = useState<string>('ISSUED')
  const [query, setQuery] = useState<string>('')

  const [summary, setSummary] = useState<RevenueSummaryResponse>({ total_count: 0, total_amount_cop: 0 })
  const [issues, setIssues] = useState<CertificateIssueListItem[]>([])
  const [count, setCount] = useState(0)

  const load = async () => {
    setLoading(true)
    try {
      const params = {
        certificate_type: 'STUDIES',
        status: statusFilter || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        limit: 200,
        q: query.trim() ? query.trim() : undefined,
      }

      const [summaryRes, issuesRes] = await Promise.all([
        certificatesApi.revenueSummary({
          certificate_type: 'STUDIES',
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        }),
        certificatesApi.listIssues(params),
      ])

      setSummary(summaryRes.data as RevenueSummaryResponse)
      const data = issuesRes.data as IssuesListResponse
      setIssues(Array.isArray(data?.results) ? data.results : [])
      setCount(typeof data?.count === 'number' ? data.count : 0)
    } catch (err) {
      console.error(err)
      showToast('Error cargando ingresos de certificados.', 'error')
      setSummary({ total_count: 0, total_amount_cop: 0 })
      setIssues([])
      setCount(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAdministrativeStaff) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdministrativeStaff])

  const downloadPdf = async (uuid: string) => {
    try {
      const res = await certificatesApi.downloadIssuePdf(uuid)
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
      const url = window.URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => {
        try {
          window.URL.revokeObjectURL(url)
        } catch {
          // ignore
        }
      }, 10_000)
    } catch (err) {
      console.error(err)
      showToast('No se pudo descargar el PDF.', 'error')
    }
  }

  if (!isAdministrativeStaff) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Ingresos por certificados</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">No tienes permisos para acceder a este módulo.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Ingresos — Certificados</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Auditoría de emisión y totales por periodo.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/administrativos/certificados">
            <Button variant="outline">Volver a Certificados</Button>
          </Link>
          <Button onClick={load} disabled={loading}>
            {loading ? 'Cargando...' : 'Recargar'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300">Desde</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300">Hasta</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300">Estado</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="ISSUED">Emitidos</option>
                <option value="REVOKED">Revocados</option>
                <option value="">Todos</option>
              </select>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div className="md:col-span-3">
              <label className="text-sm text-slate-600 dark:text-slate-300">Buscar (nombre o documento)</label>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ej: 1033... o Juan" />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={load} disabled={loading} className="w-full">
                Aplicar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total certificados (emitidos)</p>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{summary.total_count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total ingresos (COP)</p>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatCop(summary.total_amount_cop)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Emisiones ({count})</CardTitle>
        </CardHeader>
        <CardContent>
          {issues.length === 0 ? (
            <p className="text-slate-600 dark:text-slate-300">No hay registros para mostrar.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-900">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Estudiante
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Documento
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Año / Grado
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Valor
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Usuario
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                      PDF
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200 dark:bg-slate-900 dark:divide-slate-800">
                  {issues.map((row) => (
                    <tr key={row.uuid} className="bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/60">
                      <td className="px-3 py-2 text-sm text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {row.issued_at ? new Date(row.issued_at).toLocaleString('es-CO') : ''}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-900 dark:text-slate-100">{row.student_full_name}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 dark:text-slate-200">{row.document_number}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
                        {String(row.academic_year ?? '')} / {row.grade_name}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {formatCop(Number(row.amount_cop || 0))}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 dark:text-slate-200">{row.issued_by?.name || ''}</td>
                      <td className="px-3 py-2 text-sm text-right">
                        {row.has_pdf ? (
                          <Button variant="outline" onClick={() => downloadPdf(row.uuid)}>
                            Ver PDF
                          </Button>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
    </div>
  )
}
