import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { GraduationCap, Printer, ChevronLeft, Download } from 'lucide-react'
import { studentsApi, type ObserverReport } from '../services/students'
import { coreApi, type Institution } from '../services/core'
import { reportsApi, type ReportJob } from '../services/reports'

function monthNameEs(monthIndex: number) {
  const months = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ]
  return months[monthIndex] || ''
}

function pickCurrentEnrollment(report: ObserverReport) {
  const list = report.enrollments || []
  const active = list.filter((e) => e?.status === 'ACTIVE')
  const best = (active.length ? active : list)
    .slice()
    .sort((a, b) => {
      const ay = typeof a.academic_year === 'number' ? a.academic_year : -9999
      const by = typeof b.academic_year === 'number' ? b.academic_year : -9999
      if (ay !== by) return by - ay
      return (b.enrolled_at || '').localeCompare(a.enrolled_at || '')
    })[0]
  return best || null
}

function normalizePreviewHtmlForIframe(html: string, apiBaseUrl: string): string {
  const baseHref = (apiBaseUrl || '').trim().replace(/\/+$/, '') + '/'

  if (!html) return html

  let out = html

  // 1) Ensure <base> so relative media URLs resolve when using srcDoc.
  if (!/<base\s+/i.test(out)) {
    if (/<head\b[^>]*>/i.test(out)) {
      out = out.replace(/<head\b[^>]*>/i, (m) => `${m}\n<base href="${baseHref}" />`)
    } else {
      out = `<!doctype html><html><head><base href="${baseHref}" /></head><body>${out}</body></html>`
    }
  }

  // 2) Add an A4 wrapper with padding-based margins for browsers.
  // Backend templates are designed for WeasyPrint; browsers often ignore @page margins on screen (and sometimes on print).
  if (!/kampus-browser-a4/i.test(out)) {
    const injectedCss = `
<style>
  /* Browser-friendly print/screen wrapper for WeasyPrint-oriented templates */
  @page { size: A4; margin: 0 !important; }
  html, body { margin: 0; padding: 0; }
  body { background: #f3f4f6; }
  .kampus-browser-a4 {
    width: 210mm;
    min-height: 297mm;
    box-sizing: border-box;
    padding: 18mm 12mm;
    background: #fff;
    margin: 10mm auto;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -1px rgba(0,0,0,.06);
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @media print {
    body { background: #fff; }
    .kampus-browser-a4 { margin: 0; box-shadow: none; }
  }
</style>
`

    if (/<head\b[^>]*>/i.test(out)) {
      out = out.replace(/<head\b[^>]*>/i, (m) => `${m}\n${injectedCss}`)
    }

    if (/<body\b[^>]*>/i.test(out) && /<\/body>/i.test(out)) {
      out = out.replace(/<body\b[^>]*>/i, (m) => `${m}\n<div class="kampus-browser-a4">`)
      out = out.replace(/<\/body>/i, '</div>\n</body>')
    }
  }

  return out
}

export default function StudentStudyCertificationPrint() {
  const { id } = useParams()
  const studentId = Number(id)
  const navigate = useNavigate()

  const [report, setReport] = useState<ObserverReport | null>(null)
  const [institution, setInstitution] = useState<Institution | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null)
  const [iframeHeightPx, setIframeHeightPx] = useState<number>(0)

  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').trim()
  const previewHtmlWithBase = useMemo(
    () => (previewHtml ? normalizePreviewHtmlForIframe(previewHtml, apiBaseUrl) : null),
    [previewHtml, apiBaseUrl]
  )

  const resizeIframeToContent = useCallback(() => {
    const iframe = previewIframeRef.current
    if (!iframe) return

    try {
      const doc = iframe.contentDocument
      if (!doc) return

      // Ensure no internal scrollbars.
      if (doc.body) doc.body.style.overflow = 'hidden'
      if (doc.documentElement) doc.documentElement.style.overflow = 'hidden'

      const next = Math.max(
        doc.documentElement?.scrollHeight || 0,
        doc.body?.scrollHeight || 0,
        doc.documentElement?.offsetHeight || 0,
        doc.body?.offsetHeight || 0
      )
      if (next && next !== iframeHeightPx) setIframeHeightPx(next)
    } catch {
      // Ignore cross-origin / transient DOM access errors.
    }
  }, [iframeHeightPx])

  useEffect(() => {
    if (!previewHtmlWithBase) return

    const t1 = window.setTimeout(() => resizeIframeToContent(), 50)
    const t2 = window.setTimeout(() => resizeIframeToContent(), 250)
    const onResize = () => resizeIframeToContent()
    window.addEventListener('resize', onResize)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.removeEventListener('resize', onResize)
    }
  }, [previewHtmlWithBase, resizeIframeToContent])

  const pollJobUntilFinished = async (jobId: number): Promise<ReportJob> => {
    let attempt = 0
    const nextDelayMs = () => Math.min(4000, 800 + attempt * 400)

    for (;;) {
      const res = await reportsApi.getJob(jobId)
      const job = res.data
      if (job.status === 'SUCCEEDED' || job.status === 'FAILED' || job.status === 'CANCELED') return job
      attempt += 1
      await new Promise((resolve) => setTimeout(resolve, nextDelayMs()))
    }
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  useEffect(() => {
    let mounted = true

    if (!studentId) {
      setError('ID de estudiante inválido')
      setLoading(false)
      return
    }

    ;(async () => {
      try {
        setLoading(true)
        setError(null)

        const [reportRes, instRes] = await Promise.all([
          studentsApi.getObserverReport(studentId),
          coreApi.listInstitutions().catch(() => ({ data: [] as Institution[] })),
        ])

        if (!mounted) return
        setReport(reportRes.data)
        setInstitution(instRes.data?.[0] || null)
      } catch (err) {
        console.error(err)
        if (!mounted) return
        setError('No se pudo cargar la certificación.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [studentId])

  const enrollment = useMemo(() => (report ? pickCurrentEnrollment(report) : null), [report])

  useEffect(() => {
    let mounted = true

    if (!enrollment?.id) return

    const enrollmentId = Number(enrollment.id)
    const cacheKey = `kampus:study-certification:print:job:${enrollmentId}`

    ;(async () => {
      try {
        setLoadingPreview(true)
        setActionError(null)

        const cached = Number(sessionStorage.getItem(cacheKey) || '')
        if (cached && Number.isFinite(cached)) {
          try {
            const htmlRes = await reportsApi.previewJobHtml(cached)
            if (!mounted) return
            setPreviewHtml(htmlRes.data)
            return
          } catch {
            // Cached job missing/unauthorized/expired; fall through and create a new one.
          }
        }

        const created = await reportsApi.createJob({
          report_type: 'STUDY_CERTIFICATION',
          params: { enrollment_id: enrollmentId },
        })

        const jobId = created.data.id
        const htmlRes = await reportsApi.previewJobHtml(jobId)
        if (!mounted) return
        sessionStorage.setItem(cacheKey, String(jobId))
        setPreviewHtml(htmlRes.data)
      } catch (err) {
        console.error(err)
        if (!mounted) return
        setPreviewHtml(null)
        setActionError('No se pudo cargar la previsualización (QR).')
      } finally {
        if (mounted) setLoadingPreview(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [enrollment?.id])

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true)
    setActionError(null)
    try {
      if (!enrollment?.id) {
        setActionError('El estudiante no tiene matrícula activa para generar el PDF.')
        return
      }

      // Always create a fresh job for downloads.
      // Cached preview jobs may already have a PDF generated with older QR URL logic.
      const jobId = (
        await reportsApi.createJob({
          report_type: 'STUDY_CERTIFICATION',
          params: { enrollment_id: Number(enrollment.id) },
        })
      ).data.id

      const job = await pollJobUntilFinished(jobId)
      if (job.status !== 'SUCCEEDED') {
        setActionError(job.error_message || 'No se pudo generar el PDF.')
        return
      }

      const res = await reportsApi.downloadJob(job.id)
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
      const doc = (report?.student?.document_number || '').trim()
      const filename = doc ? `certificacion-academica-${doc}.pdf` : 'certificacion-academica.pdf'
      downloadBlob(blob, filename)
    } catch (err) {
      console.error(err)
      setActionError('Error generando/descargando el PDF.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  if (loading) return <div className="p-6 text-slate-600">Cargando…</div>

  if (error || !report) {
    return (
      <div className="p-6">
        <div className="text-red-600 mb-4">{error || 'No encontrado'}</div>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" /> Volver
        </button>
      </div>
    )
  }

  const inst = report.institution
  const campus = report.campus
  const student = report.student

  const headerLine1 = inst.pdf_header_line1 || inst.name
  const headerLine2 = inst.pdf_header_line2 || campus.municipality
  const headerLine3 = inst.pdf_header_line3

  const rectorName = (institution?.rector_name || '').trim()
  const signerName = rectorName || ''
  const signerRole = 'Rector(a)'

  const gradeName = (enrollment?.grade_name || '').trim()
  const groupName = (enrollment?.group_name || '').trim()
  const yearLabel = enrollment?.academic_year ? String(enrollment.academic_year) : ''

  const issueDate = new Date()
  // Igual que el template PDF oficial.
  const place = 'San Bernardo del Viento'

  const studentFullName = (student.full_name || '').trim()
  const documentType = (student.document_type || '').trim()
  const documentNumber = (student.document_number || '').trim()

  const gradeLine = gradeName
    ? groupName
      ? `${gradeName.toUpperCase()} - GRUPO (${groupName.toUpperCase()})`
      : gradeName.toUpperCase()
    : ''

  const isPreviewMode = Boolean(previewHtmlWithBase)

  return (
    <div className="print-root text-gray-900 bg-gray-100 min-h-screen">
      <style>
        {`
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @page {
          size: A4;
          margin: 18mm 12mm;
        }

        ${isPreviewMode ? `
        .preview-page {
          width: 216mm;
          min-height: 279mm;
          margin: 10mm auto;
          background: white;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          position: relative;
          overflow: hidden;
        }
        ` : `
        .page {
          width: 216mm;
          min-height: 279mm;
          padding: 25mm 30mm;
          margin: 10mm auto;
          background: white;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          position: relative;
          display: flex;
          flex-direction: column;
        }
        `}

        .font-header {
          font-family: Georgia, 'Times New Roman', serif;
        }

        @media print {
          html, body { background: #fff !important; margin: 0; }
          .print-root { background: #fff !important; min-height: auto !important; }
          .page, .preview-page {
            margin: 0;
            width: auto;
            height: auto;
            min-height: auto;
            box-shadow: none;
            /* @page already defines the margins; avoid double-padding */
            padding: 0;
            background: #fff !important;
          }
          .no-print { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }

        ${isPreviewMode ? '' : `
        /* Estilo para que coincida con study_certification_pdf.html */
        .pdf-title {
          text-align: center;
          font-size: 14px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin: 10px 0 6px;
          color: #0f172a;
        }

        .pdf-subtitle {
          text-align: center;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          margin: 0 0 10px;
          color: #1f2937;
        }

        .pdf-block {
          margin: 8px 0;
          line-height: 1.4;
          text-align: justify;
          font-size: 12px;
          color: #111827;
        }

        .pdf-em {
          font-weight: 700;
          text-transform: uppercase;
        }

        .pdf-grade-box {
          margin: 10px 0 8px;
          padding: 10px 8px;
          border: 1px solid #e5e7eb;
          background: #f8fafc;
          text-align: center;
        }

        .pdf-grade-name {
          font-size: 14px;
          font-weight: 800;
          color: #0f172a;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .pdf-year-name {
          margin-top: 3px;
          font-size: 10px;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 700;
        }

        .pdf-signature {
          margin-top: 18px;
          text-align: center;
          position: relative;
        }

        .pdf-signature-image {
          height: 125px;
          width: auto;
          display: block;
          position: absolute;
          left: 50%;
          top: 25px;
          transform: translateX(-50%);
          z-index: 2;
        }

        .pdf-signature-line {
          position: relative;
          z-index: 1;
          margin: 105px auto 0;
          width: 260px;
          border-top: 1px solid #111827;
          padding-top: 6px;
        }

        .pdf-signer-name {
          font-weight: 700;
          text-transform: uppercase;
          font-size: 11px;
          color: #111827;
        }

        .pdf-signer-role {
          font-size: 10px;
          color: #6b7280;
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.05em;
        }
        `}
        `}
      </style>

      {/* Barra superior */}
      <div className="no-print fixed top-0 left-0 w-full bg-white shadow-md z-50 p-4 flex justify-between items-center border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/students/${studentId}`)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
            title="Volver a la ficha"
          >
            <ChevronLeft className="h-4 w-4" /> Volver
          </button>
          <div className="h-6 w-px bg-gray-200" />
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Certificación Académica</h2>
        </div>

        <div className="flex items-center gap-2">
          {actionError ? <span className="text-xs text-red-600 hidden sm:inline">{actionError}</span> : null}

          <button
            onClick={() => void handleDownloadPdf()}
            disabled={downloadingPdf}
            className={
              'text-sm font-bold py-2 px-4 rounded shadow-sm flex items-center gap-2 transition ' +
              (downloadingPdf ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-700 hover:bg-blue-800 text-white')
            }
            title="Descargar PDF"
          >
            <Download className="h-4 w-4" /> {downloadingPdf ? 'Preparando…' : 'Descargar'}
          </button>

          <button
            onClick={() => {
              const iframeWin = previewIframeRef.current?.contentWindow
              if (iframeWin) {
                iframeWin.focus()
                iframeWin.print()
              } else {
                window.print()
              }
            }}
            className="bg-gray-800 hover:bg-gray-900 text-white text-sm font-bold py-2 px-4 rounded shadow-sm flex items-center gap-2 transition"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        </div>
      </div>
      <div className="h-20 no-print" />

      {/* Prefer backend preview HTML for exact PDF look + embedded QR */}
      {previewHtmlWithBase ? (
        <div className="preview-page">
          <iframe
            ref={previewIframeRef}
            title="Certificación Académica (previsualización)"
            srcDoc={previewHtmlWithBase}
            scrolling="no"
            onLoad={() => resizeIframeToContent()}
            style={{
              width: '100%',
              height: iframeHeightPx ? `${iframeHeightPx}px` : '297mm',
              border: 'none',
              display: 'block',
              overflow: 'hidden',
            }}
          />
        </div>
      ) : (
        <div className="page" id="certification-page">
        <header className="mb-2">
          {institution?.pdf_letterhead_image ? (
            <div className="w-full" style={{ margin: '10px', padding: 0, lineHeight: 0 }}>
              <img
                src={institution.pdf_letterhead_image}
                alt="Membrete"
                style={{ display: 'block', width: '100%', maxHeight: '90px', height: 'auto', objectFit: 'contain' }}
              />
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <div style={{ width: 90 }}>
                  {(institution?.pdf_show_logo ?? true) && inst.logo_url ? (
                    <img
                      src={inst.logo_url}
                      alt="Logo"
                      style={{ height: `${institution?.pdf_logo_height_px ?? 60}px`, width: 'auto', objectFit: 'contain' }}
                    />
                  ) : (
                    <GraduationCap className="h-10 w-10 text-slate-700" />
                  )}
                </div>
                <div className="text-center grow">
                  <div className="text-[11px] font-bold uppercase">{headerLine1 || inst.name}</div>
                  {headerLine1 && inst.name ? <div className="text-[10px] font-bold uppercase mt-px">{inst.name}</div> : null}
                  {headerLine2 ? <div className="text-[9px] mt-px">{headerLine2}</div> : null}
                  {headerLine3 ? <div className="text-[9px]">{headerLine3}</div> : null}
                </div>
                <div style={{ width: 90 }} />
              </div>

              {institution?.pdf_footer_text ? (
                <div className="text-center text-[9px] text-slate-500" style={{ marginTop: 10 }}>
                  {institution.pdf_footer_text}
                </div>
              ) : null}
            </div>
          )}
        </header>

        <div className="pdf-title">Certificación Académica</div>
        <div className="pdf-subtitle">Hace constar</div>

        <div className="pdf-block">
          Que el estudiante <span className="pdf-em">{studentFullName || '—'}</span>, identificado(a) con{' '}
          <strong>{documentType || 'Documento'}</strong> No. <strong>{documentNumber || '—'}</strong>, se encuentra oficialmente
          matriculado(a) en el Sistema de Gestión Académica de esta institución.
        </div>

        <div className="pdf-block">Que, a la fecha de expedición de este documento, cursa el grado:</div>

        <div className="pdf-grade-box">
          <div className="pdf-grade-name">{gradeLine || '—'}</div>
          <div className="pdf-year-name">Año lectivo {yearLabel || '—'}</div>
        </div>

        <div className="pdf-block">
          Para constancia de lo anterior, se firma en <strong>{place} </strong>, a los{' '}
          <strong>{issueDate.getDate()}</strong> días del mes de <strong>{monthNameEs(issueDate.getMonth())}</strong> de{' '}
          <strong>{issueDate.getFullYear()}</strong>.
        </div>

        <div className="pdf-signature">
          {institution?.pdf_rector_signature_image ? (
            <img src={institution.pdf_rector_signature_image} alt="Firma" className="pdf-signature-image" />
          ) : null}

          <div className="pdf-signature-line">
            <div className="pdf-signer-name">{signerName || '\u00A0'}</div>
            <div className="pdf-signer-role">{signerRole}</div>
          </div>
        </div>
      </div>
      )}

      {loadingPreview ? (
        <div className="no-print max-w-[900px] mx-auto text-xs text-slate-500" style={{ marginTop: 10 }}>
          Cargando QR…
        </div>
      ) : null}
    </div>
  )
}
