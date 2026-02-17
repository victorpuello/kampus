import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
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

type IssueStatus = 'PENDING' | 'ISSUED' | 'REVOKED' | string

const statusLabel = (s: IssueStatus) => {
  switch (s) {
    case 'PENDING':
      return 'Pendiente'
    case 'ISSUED':
      return 'Emitido'
    case 'REVOKED':
      return 'Revocado'
    default:
      return s || '—'
  }
}

const statusClassName = (s: IssueStatus) => {
  switch (s) {
    case 'PENDING':
      return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-800'
    case 'ISSUED':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-200 dark:border-emerald-800'
    case 'REVOKED':
      return 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-900/20 dark:text-rose-200 dark:border-rose-800'
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/40 dark:text-slate-200 dark:border-slate-700'
  }
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

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  const [summary, setSummary] = useState<RevenueSummaryResponse>({ total_count: 0, total_amount_cop: 0 })
  const [issues, setIssues] = useState<CertificateIssueListItem[]>([])
  const [count, setCount] = useState(0)

  const [editOpen, setEditOpen] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [editIssue, setEditIssue] = useState<CertificateIssueListItem | null>(null)
  const [editForm, setEditForm] = useState({
    student_full_name: '',
    document_number: '',
    academic_year: '',
    grade_name: '',
    amount_cop: '',
  })

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [confirmIssue, setConfirmIssue] = useState<CertificateIssueListItem | null>(null)
  const [confirmMode, setConfirmMode] = useState<'revoke' | 'delete'>('delete')
  const [revokeReason, setRevokeReason] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const params = {
        certificate_type: 'STUDIES',
        status: statusFilter || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        limit: 500,
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
      setPage(1)
    } catch (err) {
      console.error(err)
      showToast('Error cargando ingresos de certificados.', 'error')
      setSummary({ total_count: 0, total_amount_cop: 0 })
      setIssues([])
      setCount(0)
      setPage(1)
    } finally {
      setLoading(false)
    }
  }

  const openEdit = (issue: CertificateIssueListItem) => {
    setEditIssue(issue)
    setEditForm({
      student_full_name: issue.student_full_name || '',
      document_number: issue.document_number || '',
      academic_year: String(issue.academic_year ?? ''),
      grade_name: issue.grade_name || '',
      amount_cop: String(issue.amount_cop ?? ''),
    })
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!editIssue) return
    setEditLoading(true)
    try {
      const amount = parseInt(editForm.amount_cop || '0', 10)
      if (Number.isNaN(amount) || amount < 0) {
        showToast('El valor (COP) es inválido.', 'error')
        return
      }

      const res = await certificatesApi.updateIssue(editIssue.uuid, {
        student_full_name: editForm.student_full_name.trim(),
        document_number: editForm.document_number.trim(),
        academic_year: editForm.academic_year.trim(),
        grade_name: editForm.grade_name.trim(),
        amount_cop: amount,
      })
      const updated = res.data as CertificateIssueListItem

      setIssues((prev) => prev.map((it) => (it.uuid === updated.uuid ? { ...it, ...updated } : it)))
      setEditOpen(false)
      setEditIssue(null)
      showToast('Certificado actualizado.', 'success')
    } catch (err) {
      console.error(err)
      showToast('No se pudo actualizar el certificado.', 'error')
    } finally {
      setEditLoading(false)
    }
  }

  const openConfirm = (issue: CertificateIssueListItem, mode: 'revoke' | 'delete') => {
    setConfirmIssue(issue)
    setConfirmMode(mode)
    setRevokeReason('')
    setConfirmOpen(true)
  }

  const runConfirm = async () => {
    if (!confirmIssue) return
    setConfirmLoading(true)
    try {
      const issue = confirmIssue
      if (confirmMode === 'revoke') {
        const res = await certificatesApi.deleteIssue(issue.uuid, {
          reason: revokeReason.trim() ? revokeReason.trim() : undefined,
        })
        const updated = (res.data || {}) as Partial<CertificateIssueListItem> & { revoked?: boolean }
        const nextStatus = (updated.status || 'REVOKED') as string

        setIssues((prev) => {
          // If currently filtering ISSUED, remove it from the list.
          if (statusFilter === 'ISSUED') return prev.filter((it) => it.uuid !== issue.uuid)
          return prev.map((it) => (it.uuid === issue.uuid ? { ...it, ...updated, status: nextStatus } : it))
        })
        showToast('Certificado revocado.', 'success')
      } else {
        await certificatesApi.deleteIssue(issue.uuid)
        setIssues((prev) => prev.filter((it) => it.uuid !== issue.uuid))
        showToast('Certificado eliminado.', 'success')
      }

      setConfirmOpen(false)
      setConfirmIssue(null)
    } catch (err) {
      console.error(err)
      showToast('No se pudo completar la acción.', 'error')
    } finally {
      setConfirmLoading(false)
    }
  }

  const totalPages = useMemo(() => {
    const safePerPage = Math.max(1, perPage)
    return Math.max(1, Math.ceil(issues.length / safePerPage))
  }, [issues.length, perPage])

  const currentPage = Math.min(Math.max(1, page), totalPages)

  useEffect(() => {
    if (page !== currentPage) setPage(currentPage)
  }, [currentPage, page])

  const pageItems = useMemo(() => {
    const safePerPage = Math.max(1, perPage)
    const start = (currentPage - 1) * safePerPage
    return issues.slice(start, start + safePerPage)
  }, [currentPage, issues, perPage])

  const desktopPages = useMemo(() => {
    if (totalPages <= 9) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages = new Set<number>()
    pages.add(1)
    pages.add(totalPages)
    for (let p = currentPage - 2; p <= currentPage + 2; p += 1) {
      if (p >= 1 && p <= totalPages) pages.add(p)
    }
    const sorted = Array.from(pages).sort((a, b) => a - b)
    const out: Array<number | '…'> = []
    for (let i = 0; i < sorted.length; i += 1) {
      const v = sorted[i]
      const prev = i > 0 ? sorted[i - 1] : null
      if (prev !== null && v - prev > 1) out.push('…')
      out.push(v)
    }
    return out
  }, [currentPage, totalPages])

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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Ingresos — Certificados</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Auditoría de emisión y totales por periodo.</p>
        </div>
        <div className="flex w-full flex-col gap-2 md:flex-row lg:w-auto">
          <Link to="/administrativos/certificados" className="w-full md:w-auto">
            <Button variant="outline" className="min-h-11 w-full md:w-auto">
              Volver a Certificados
            </Button>
          </Link>
          <Button onClick={load} disabled={loading} className="min-h-11 w-full md:w-auto">
            {loading ? 'Cargando...' : 'Recargar'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-4">
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300">Desde</label>
              <Input className="h-11" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300">Hasta</label>
              <Input className="h-11" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300">Estado</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="flex h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:scheme-dark"
              >
                <option value="ISSUED">Emitidos</option>
                <option value="PENDING">Pendientes</option>
                <option value="REVOKED">Revocados</option>
                <option value="">Todos</option>
              </select>
            </div>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-4">
            <div className="lg:col-span-3">
              <label className="text-sm text-slate-600 dark:text-slate-300">Buscar (nombre o documento)</label>
              <Input className="h-11" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ej: 1033... o Juan" />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={load} disabled={loading} className="min-h-11 w-full">
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
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-slate-900 dark:text-slate-100">Emisiones ({count})</CardTitle>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Mostrando {pageItems.length} de {issues.length}
                {count > issues.length ? ` (de ${count} totales)` : ''}
                {issues.length > 0 ? ` • Página ${currentPage} de ${totalPages}` : ''}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Por página:</span>
                <select
                  value={perPage}
                  onChange={(e) => {
                    setPerPage(parseInt(e.target.value) || 10)
                    setPage(1)
                  }}
                  className="h-11 rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:scheme-dark"
                  aria-label="Emisiones por página"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {issues.length === 0 ? (
            <p className="text-slate-600 dark:text-slate-300">No hay registros para mostrar.</p>
          ) : (
            <>
              {/* Mobile list */}
              <div className="space-y-3 xl:hidden">
                {pageItems.map((row) => (
                  <div
                    key={row.uuid}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 wrap-break-word">
                          {row.student_full_name}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {row.document_number ? `Doc: ${row.document_number}` : 'Doc: —'}
                          <span className="mx-2">•</span>
                          {String(row.academic_year ?? '')} / {row.grade_name || '—'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-slate-500 dark:text-slate-400">Valor</div>
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {formatCop(Number(row.amount_cop || 0))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClassName(
                          row.status
                        )}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2">
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold">Fecha:</span> {row.issued_at ? new Date(row.issued_at).toLocaleString('es-CO') : '—'}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold">Usuario:</span> {row.issued_by?.name || '—'}
                      </div>
                      <div>
                        {row.has_pdf ? (
                          <Button variant="outline" className="min-h-11 w-full" onClick={() => downloadPdf(row.uuid)}>
                            Ver PDF
                          </Button>
                        ) : (
                          <div className="text-center text-sm text-slate-400 dark:text-slate-500">Sin PDF</div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {row.status === 'PENDING' ? (
                          <Button variant="outline" className="min-h-11 w-full" onClick={() => openEdit(row)}>
                            Editar
                          </Button>
                        ) : (
                          <Button variant="outline" className="min-h-11 w-full" disabled>
                            Editar
                          </Button>
                        )}

                        {row.status === 'ISSUED' ? (
                          <Button
                            variant="outline"
                            className="min-h-11 w-full text-rose-700 border-rose-200 hover:bg-rose-50 dark:text-rose-200 dark:border-rose-800 dark:hover:bg-rose-900/20"
                            onClick={() => openConfirm(row, 'revoke')}
                          >
                            Revocar
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            className="min-h-11 w-full text-rose-700 border-rose-200 hover:bg-rose-50 dark:text-rose-200 dark:border-rose-800 dark:hover:bg-rose-900/20"
                            onClick={() => openConfirm(row, 'delete')}
                          >
                            Eliminar
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {totalPages > 1 && (
                  <div className="pt-2 flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      disabled={currentPage <= 1}
                      onClick={() => setPage(Math.max(1, currentPage - 1))}
                    >
                      Anterior
                    </Button>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Página {currentPage} de {totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                    >
                      Siguiente
                    </Button>
                  </div>
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto xl:block">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-900">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Fecha
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Estado
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
                      <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200 dark:bg-slate-900 dark:divide-slate-800">
                    {pageItems.map((row) => (
                      <tr key={row.uuid} className="bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/60">
                        <td className="px-3 py-2 text-sm text-slate-700 dark:text-slate-200 whitespace-nowrap">
                          {row.issued_at ? new Date(row.issued_at).toLocaleString('es-CO') : ''}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusClassName(
                              row.status
                            )}`}
                          >
                            {statusLabel(row.status)}
                          </span>
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
                            <Button variant="outline" size="sm" onClick={() => downloadPdf(row.uuid)}>
                              Ver PDF
                            </Button>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={row.status !== 'PENDING'}
                              onClick={() => openEdit(row)}
                            >
                              Editar
                            </Button>
                            {row.status === 'ISSUED' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-rose-700 border-rose-200 hover:bg-rose-50 dark:text-rose-200 dark:border-rose-800 dark:hover:bg-rose-900/20"
                                onClick={() => openConfirm(row, 'revoke')}
                              >
                                Revocar
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-rose-700 border-rose-200 hover:bg-rose-50 dark:text-rose-200 dark:border-rose-800 dark:hover:bg-rose-900/20"
                                onClick={() => openConfirm(row, 'delete')}
                              >
                                Eliminar
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-2 py-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-10"
                        disabled={currentPage <= 1}
                        onClick={() => setPage(Math.max(1, currentPage - 1))}
                      >
                        ◀
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-10"
                        disabled={currentPage >= totalPages}
                        onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                      >
                        ▶
                      </Button>
                      <div className="text-xs text-slate-500 dark:text-slate-400 ml-2">
                        Página {currentPage} de {totalPages}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1 justify-end">
                      {desktopPages.map((p, idx) =>
                        p === '…' ? (
                          <span key={`ellipsis-${idx}`} className="px-2 text-slate-400">…</span>
                        ) : (
                          <Button
                            key={p}
                            variant={p === currentPage ? 'secondary' : 'outline'}
                            size="sm"
                            className="min-h-10 px-2"
                            onClick={() => setPage(p)}
                            aria-current={p === currentPage ? 'page' : undefined}
                          >
                            {p}
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((prev) => ({ ...prev, isVisible: false }))}
      />

      <Modal
        isOpen={editOpen}
        onClose={() => {
          if (editLoading) return
          setEditOpen(false)
          setEditIssue(null)
        }}
        title="Editar certificado"
        description={editIssue ? `UUID: ${editIssue.uuid}` : undefined}
        loading={editLoading}
        footer={
          <>
            <Button
              variant="outline"
              className="min-h-11 w-full md:w-auto"
              onClick={() => {
                setEditOpen(false)
                setEditIssue(null)
              }}
              disabled={editLoading}
            >
              Cancelar
            </Button>
            <Button className="min-h-11 w-full md:w-auto" onClick={saveEdit} disabled={editLoading}>
              {editLoading ? 'Guardando...' : 'Guardar'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-sm text-slate-600 dark:text-slate-300">Nombre estudiante</label>
            <Input
              value={editForm.student_full_name}
              onChange={(e) => setEditForm((p) => ({ ...p, student_full_name: e.target.value }))}
              placeholder="Nombre completo"
            />
          </div>
          <div>
            <label className="text-sm text-slate-600 dark:text-slate-300">Documento</label>
            <Input
              value={editForm.document_number}
              onChange={(e) => setEditForm((p) => ({ ...p, document_number: e.target.value }))}
              placeholder="Número de documento"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300">Año</label>
              <Input
                value={editForm.academic_year}
                onChange={(e) => setEditForm((p) => ({ ...p, academic_year: e.target.value }))}
                placeholder="2025"
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300">Grado</label>
              <Input
                value={editForm.grade_name}
                onChange={(e) => setEditForm((p) => ({ ...p, grade_name: e.target.value }))}
                placeholder="5°"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-slate-600 dark:text-slate-300">Valor (COP)</label>
            <Input
              inputMode="numeric"
              value={editForm.amount_cop}
              onChange={(e) => setEditForm((p) => ({ ...p, amount_cop: e.target.value }))}
              placeholder="10000"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Solo se puede editar si el estado es Pendiente.
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={confirmOpen}
        onClose={() => {
          if (confirmLoading) return
          setConfirmOpen(false)
          setConfirmIssue(null)
        }}
        title={confirmMode === 'revoke' ? 'Revocar certificado' : 'Eliminar certificado'}
        description={
          confirmIssue
            ? confirmMode === 'revoke'
              ? 'Esto marcará el certificado como Revocado (no se elimina físicamente).'
              : 'Esto eliminará el registro del certificado.'
            : undefined
        }
        loading={confirmLoading}
        footer={
          <>
            <Button
              variant="outline"
              className="min-h-11 w-full md:w-auto"
              onClick={() => {
                setConfirmOpen(false)
                setConfirmIssue(null)
              }}
              disabled={confirmLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={runConfirm}
              disabled={confirmLoading}
              className="min-h-11 w-full text-white bg-rose-600 hover:bg-rose-700 md:w-auto"
            >
              {confirmLoading ? 'Procesando...' : confirmMode === 'revoke' ? 'Revocar' : 'Eliminar'}
            </Button>
          </>
        }
      >
        {confirmMode === 'revoke' ? (
          <div className="space-y-2">
            <label className="text-sm text-slate-600 dark:text-slate-300">Motivo (opcional)</label>
            <Input value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder="Ej: duplicado" />
          </div>
        ) : (
          <div className="text-sm text-slate-600 dark:text-slate-300">
            {confirmIssue ? (
              <>
                <div className="font-medium text-slate-900 dark:text-slate-100">{confirmIssue.student_full_name}</div>
                <div className="mt-1 text-xs">UUID: {confirmIssue.uuid}</div>
              </>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  )
}
