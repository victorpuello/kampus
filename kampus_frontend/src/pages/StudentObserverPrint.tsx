import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Printer, ChevronLeft, School, UserRound } from 'lucide-react'
import { studentsApi, type ObserverReport } from '../services/students'

function formatDateTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

type SeverityMeta = {
  label: string
  badgeClass: string
  borderClass: string
}

function severityMeta(manualSeverity?: string | null): SeverityMeta {
  switch (manualSeverity) {
    case 'VERY_MAJOR':
      return {
        label: 'Llamado de Atención (Gravísima)',
        badgeClass: 'bg-red-100 text-red-700',
        borderClass: 'border-l-red-500',
      }
    case 'MAJOR':
      return {
        label: 'Llamado de Atención (Grave)',
        badgeClass: 'bg-red-100 text-red-700',
        borderClass: 'border-l-red-500',
      }
    case 'MINOR':
    default:
      return {
        label: 'Llamado de Atención (Leve)',
        badgeClass: 'bg-yellow-100 text-yellow-800',
        borderClass: 'border-l-yellow-500',
      }
  }
}

function annotationMeta(annotationType?: string | null): SeverityMeta {
  switch (annotationType) {
    case 'ALERT':
      return {
        label: 'Anotación (Alerta)',
        badgeClass: 'bg-red-100 text-red-700',
        borderClass: 'border-l-red-500',
      }
    case 'PRAISE':
      return {
        label: 'Anotación (Felicitación)',
        badgeClass: 'bg-green-100 text-green-800',
        borderClass: 'border-l-green-500',
      }
    case 'COMMITMENT':
      return {
        label: 'Anotación (Compromiso)',
        badgeClass: 'bg-sky-100 text-sky-800',
        borderClass: 'border-l-sky-500',
      }
    case 'OBSERVATION':
    default:
      return {
        label: 'Anotación',
        badgeClass: 'bg-yellow-100 text-yellow-800',
        borderClass: 'border-l-yellow-500',
      }
  }
}

function toTimestamp(value?: string | null) {
  if (!value) return 0
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? 0 : t
}

export default function StudentObserverPrint() {
  const { id } = useParams()
  const studentId = Number(id)
  const navigate = useNavigate()

  const [data, setData] = useState<ObserverReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        const res = await studentsApi.getObserverReport(studentId)
        if (!mounted) return
        setData(res.data)
      } catch {
        if (!mounted) return
        setError('No se pudo cargar el Observador del estudiante')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [studentId])

  const printedAtLabel = useMemo(() => formatDateTime(data?.generated_at), [data?.generated_at])

  const mergedTimeline = useMemo(() => {
    const discipline = (data?.discipline_entries || []).map((entry) => {
      const dateRaw = entry.occurred_at || entry.created_at || ''
      return {
        kind: 'discipline' as const,
        ts: toTimestamp(dateRaw),
        dateRaw,
        entry,
      }
    })

    const annotations = (data?.observer_annotations || []).map((a) => {
      const dateRaw = a.created_at || ''
      return {
        kind: 'observer_annotation' as const,
        ts: toTimestamp(dateRaw),
        dateRaw,
        annotation: a,
      }
    })

    return [...discipline, ...annotations].sort((a, b) => b.ts - a.ts)
  }, [data?.discipline_entries, data?.observer_annotations])

  if (loading && !data) {
    return <div className="p-6 text-slate-600">Cargando…</div>
  }

  if (error || !data) {
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

  const headerLine1 = data.institution.pdf_header_line1
  const headerLine2 = data.institution.pdf_header_line2 || data.campus.municipality
  const institutionName = data.institution.name
  const headerLine3 = data.institution.pdf_header_line3

  const headerLine3Display =
    headerLine3?.trim() === 'DANE: 223675000297 NIT: 900003571-2' ? 'ee_22367500029701@sedcordoba.gov.co' : headerLine3

  const studentFullName = data.student.full_name || `${data.student.last_name} ${data.student.first_name}`.trim()

  return (
    <div className="print-root text-slate-800 bg-slate-100 min-h-screen">
      <style>{`
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @media screen and (max-width: 640px) {
          .page {
            width: 100%;
            min-height: auto;
            padding: 12px;
            margin: 0;
            box-shadow: none;
          }
        }

        .page {
          width: 210mm;
          min-height: 297mm;
          padding: 15mm;
          margin: 10mm auto;
          background: white;
          box-shadow: 0 0 10px rgba(0,0,0,0.10);
          position: relative;
        }

        .table-row-striped:nth-child(even) {
          background-color: #f9fafb;
        }

        @media print {
          html, body {
            background: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .print-root {
            background: white !important;
          }

          .page {
            margin: 0 !important;
            width: 100% !important;
            min-height: 297mm !important;
            box-shadow: none !important;
            page-break-after: always;
          }

          .no-print {
            display: none !important;
          }

          tr, .avoid-break {
            page-break-inside: avoid;
          }

          h1, h2, h3 {
            page-break-after: avoid;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print fixed top-0 left-0 w-full bg-white shadow z-50 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" /> Volver
          </button>
          <div className="hidden sm:block h-5 w-px bg-slate-200" />
          <span className="text-sm font-semibold text-slate-700 truncate">Vista previa del Observador</span>
        </div>

        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold px-4 py-2 rounded-md shadow"
        >
          <Printer className="h-4 w-4" /> Imprimir / Guardar PDF
        </button>
      </div>

      <div className="h-16 no-print" />

      {/* PAGE 1 */}
      <div className="page">
        {/* Header */}
        <header className="border-b-2 border-slate-900 pb-3 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
            <div className="col-span-1 md:col-span-8 flex items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                {data.institution.logo_url ? (
                  <img src={data.institution.logo_url} alt="Escudo" className="w-full h-full object-contain" />
                ) : (
                  <School className="h-8 w-8 text-slate-400" />
                )}
              </div>

              <div className="min-w-0">
                {headerLine1 ? (
                  <p className="text-xs text-slate-600 font-bold uppercase tracking-wide">{headerLine1}</p>
                ) : null}
                {headerLine2 ? <p className="text-sm text-slate-600 font-semibold">{headerLine2}</p> : null}
                <h1 className="text-[15px] font-extrabold text-slate-900 uppercase leading-tight wrap-break-word">
                  {institutionName || 'Institución Educativa'}
                </h1>
                <p className="text-xs text-slate-500">
                  {data.institution.dane_code ? `Código DANE: ${data.institution.dane_code}` : 'Código DANE: -'}
                  {data.institution.nit ? ` | NIT: ${data.institution.nit}` : ''}
                </p>
                {headerLine3Display ? (
                  <p className="text-xs text-sky-700 mt-1 font-bold tracking-wide">{headerLine3Display}</p>
                ) : null}
              </div>
            </div>

            <div className="col-span-1 md:col-span-4 grid grid-cols-[auto,1fr] gap-3 items-stretch md:justify-items-end">
              <div className="inline-flex items-stretch">
                <div className="w-24 h-28 rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm ring-1 ring-slate-900/5">
                  {data.student.photo_url ? (
                    <img src={data.student.photo_url} alt="Foto del estudiante" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <UserRound className="h-10 w-10" />
                    </div>
                  )}
                </div>
              </div>

              <div className="w-full bg-slate-50 px-4 py-3 rounded-lg border border-slate-200 text-right flex flex-col justify-between">
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider">Ficha de Observador</p>
                  <p className="text-base font-extrabold text-slate-900">N° {data.observer_number}</p>
                </div>
                {printedAtLabel ? <p className="text-[11px] text-slate-500 mt-1">Impreso: {printedAtLabel}</p> : null}
              </div>
            </div>
          </div>
        </header>

        {/* Student info */}
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-wide text-slate-500 font-bold border-b border-slate-200 mb-4 pb-1 flex items-center gap-2">
            <UserRound className="h-4 w-4" /> Información del Estudiante
          </h2>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="grid grid-cols-12 gap-x-6 gap-y-4">
              <div className="col-span-12 md:col-span-8">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">Apellidos y Nombres</label>
                <div className="text-lg font-extrabold text-slate-900 uppercase">{studentFullName || '-'}</div>
              </div>
              <div className="col-span-12 md:col-span-4">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">Documento de Identidad</label>
                <div className="text-lg font-semibold text-slate-900">
                  {(data.student.document_type || '').toUpperCase()} {data.student.document_number || '-'}
                </div>
              </div>

              <div className="col-span-12 md:col-span-3">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">Fecha Nacimiento</label>
                <div className="text-sm font-medium">{formatDate(data.student.birth_date) || '-'}</div>
              </div>
              <div className="col-span-12 md:col-span-5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">Lugar Expedición</label>
                <div className="text-sm font-medium">{data.student.place_of_issue || '-'}</div>
              </div>
              <div className="col-span-12 md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">Tipo Sangre</label>
                <div className="text-sm font-bold text-red-700 bg-red-50 inline-block px-2 rounded">
                  {data.student.blood_type || '-'}
                </div>
              </div>
              <div className="col-span-12 md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">Estrato</label>
                <div className="text-sm font-medium">{data.student.stratum || '-'}</div>
              </div>
              <div className="col-span-12 md:col-span-4">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">SISBÉN</label>
                <div className="text-sm font-medium">{data.student.sisben_score || '-'}</div>
              </div>

              <div className="col-span-12 md:col-span-8">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">Dirección de Residencia</label>
                <div className="text-sm font-medium">
                  {[data.student.address, data.student.neighborhood].filter(Boolean).join(' - ') || '-'}
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* NOTE: Observer annotations are rendered together with the discipline log on page 2 */}

        {/* Family */}
        <section className="mb-8 avoid-break">
          <h2 className="text-xs uppercase tracking-wide text-slate-500 font-bold border-b border-slate-200 mb-4 pb-1">
            Información Familiar
          </h2>

          <div className="overflow-hidden border border-slate-200 rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px]">
                <tr>
                  <th className="px-4 py-2 text-left">Parentesco</th>
                  <th className="px-4 py-2 text-left">Nombre Completo</th>
                  <th className="px-4 py-2 text-left">Documento</th>
                  <th className="px-4 py-2 text-left">Teléfono</th>
                  <th className="px-4 py-2 text-center">Acudiente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {data.family_members.length > 0 ? (
                  data.family_members.map((fm) => (
                    <tr key={fm.id}>
                      <td className="px-4 py-2 font-semibold uppercase">{fm.relationship || '-'}</td>
                      <td className="px-4 py-2">{fm.full_name || '-'}</td>
                      <td className="px-4 py-2">{fm.document_number || '-'}</td>
                      <td className="px-4 py-2">{fm.phone || '-'}</td>
                      <td className="px-4 py-2 text-center">
                        {fm.is_main_guardian ? (
                          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-green-50 text-green-700 border border-green-200">
                            ✓
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500 italic">
                      No hay familiares registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Enrollment history */}
        <section className="mb-8 avoid-break">
          <h2 className="text-xs uppercase tracking-wide text-slate-500 font-bold border-b border-slate-200 mb-4 pb-1">
            Historial de Matrícula
          </h2>

          <div className="overflow-hidden border border-slate-200 rounded-lg">
            <table className="min-w-full text-[11px]">
              <thead className="bg-slate-100 text-slate-600 font-bold uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Año</th>
                  <th className="px-3 py-2 text-left">Grado</th>
                  <th className="px-3 py-2 text-left">Grupo</th>
                  <th className="px-3 py-2 text-left">Sede</th>
                  <th className="px-3 py-2 text-center">Estado</th>
                  <th className="px-3 py-2 text-center">Promoción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {data.enrollments.length > 0 ? (
                  data.enrollments.map((en) => (
                    <tr key={en.id} className="table-row-striped">
                      <td className="px-3 py-2 font-bold text-slate-900">{en.academic_year ?? '-'}</td>
                      <td className="px-3 py-2">{en.grade_name || '-'}</td>
                      <td className="px-3 py-2">{en.group_name || '-'}</td>
                      <td className="px-3 py-2">{en.campus_name || '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border border-slate-200 bg-slate-50 text-slate-700">
                          {en.status || '-'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {en.final_status ? (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-green-100 text-green-800">
                            {en.final_status}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500 italic">
                      No hay historial de matrícula.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* PAGE 2 */}
      <div className="page">
        <div className="flex justify-between items-center border-b pb-2 mb-6">
          <span className="text-slate-400 text-xs uppercase font-bold">Hoja de Seguimiento Disciplinario</span>
          <span className="text-slate-900 font-bold text-sm uppercase">{studentFullName}</span>
        </div>

        <section>
          <h2 className="text-lg font-extrabold text-slate-900 mb-6">Bitácora de Observaciones</h2>

          <div className="space-y-6">
            {mergedTimeline.length > 0 ? (
              mergedTimeline.map((row) => {
                if (row.kind === 'discipline') {
                  const entry = row.entry
                  const meta = severityMeta(entry.manual_severity)
                  const occurredLabel = formatDate(entry.occurred_at) || formatDateTime(entry.occurred_at) || ''
                  const gradeLabel = entry.grade_name || ''
                  const yearLabel = entry.academic_year ? String(entry.academic_year) : ''
                  const groupLabel = entry.group_name || ''
                  const subtitleParts = [gradeLabel, groupLabel, yearLabel].filter(Boolean)

                  const lawLabel =
                    entry.law_1620_type && entry.law_1620_type !== 'UNKNOWN' ? `Ley 1620: ${entry.law_1620_type}` : ''

                  return (
                    <div
                      key={`discipline-${entry.id}`}
                      className={`avoid-break bg-white border-l-4 ${meta.borderClass} shadow-sm rounded-r-lg p-4 relative border border-slate-200`}
                    >
                      {occurredLabel ? (
                        <div className="absolute top-4 right-4 text-xs text-slate-400">{occurredLabel}</div>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`${meta.badgeClass} px-2 py-1 rounded text-xs font-bold uppercase tracking-wide`}>
                          {meta.label}
                        </span>
                        {subtitleParts.length > 0 ? (
                          <span className="text-xs font-semibold text-slate-500">{subtitleParts.join(' · ')}</span>
                        ) : null}
                        {lawLabel ? <span className="text-[11px] font-semibold text-slate-500">({lawLabel})</span> : null}
                      </div>

                      {entry.location ? (
                        <div className="text-xs text-slate-500 mb-2">
                          <span className="font-bold">Lugar:</span> {entry.location}
                        </div>
                      ) : null}

                      <p className="text-sm text-slate-800 mb-3 whitespace-pre-line">
                        <span className="font-bold">Descripción:</span> {entry.narrative || '—'}
                      </p>

                      {(entry.decision_text || '').trim() ? (
                        <div className="bg-slate-50 p-3 rounded border border-slate-200 text-sm">
                          <p className="mb-1">
                            <strong className="text-slate-900">Acción Institucional:</strong> {entry.decision_text}
                          </p>
                        </div>
                      ) : null}

                      <div className="mt-3 flex justify-between items-end">
                        <div className="text-xs text-slate-500">
                          <strong>Registrado por:</strong> {entry.created_by_name || '—'}
                        </div>
                      </div>
                    </div>
                  )
                }

                const a = row.annotation
                const meta = annotationMeta(a.annotation_type)
                const occurredLabel = formatDateTime(a.created_at) || ''
                const periodLabel = a.period ? `${a.period.name}${a.period.academic_year ? ` (${a.period.academic_year})` : ''}` : ''

                return (
                  <div
                    key={`observer-annotation-${a.id}`}
                    className={`avoid-break bg-white border-l-4 ${meta.borderClass} shadow-sm rounded-r-lg p-4 relative border border-slate-200`}
                  >
                    {occurredLabel ? <div className="absolute top-4 right-4 text-xs text-slate-400">{occurredLabel}</div> : null}

                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`${meta.badgeClass} px-2 py-1 rounded text-xs font-bold uppercase tracking-wide`}>
                        {meta.label}
                        {a.is_automatic ? ' (Auto)' : ''}
                      </span>
                      {periodLabel ? <span className="text-xs font-semibold text-slate-500">{periodLabel}</span> : null}
                    </div>

                    {a.title ? <div className="text-xs text-slate-500 mb-2"><span className="font-bold">Título:</span> {a.title}</div> : null}

                    <p className="text-sm text-slate-800 mb-3 whitespace-pre-line">
                      <span className="font-bold">Descripción:</span> {a.text || '—'}
                    </p>

                    {(a.commitments || '').trim() ? (
                      <div className="bg-slate-50 p-3 rounded border border-slate-200 text-sm">
                        <p className="mb-1">
                          <strong className="text-slate-900">Compromisos:</strong> {a.commitments}
                        </p>
                        {(a.commitment_due_date || '').trim() || (a.commitment_responsible || '').trim() ? (
                          <div className="mt-2 text-xs text-slate-600">
                            {a.commitment_due_date ? (
                              <span>
                                <strong>Fecha:</strong> {formatDate(a.commitment_due_date)}
                              </span>
                            ) : null}
                            {a.commitment_due_date && a.commitment_responsible ? <span> · </span> : null}
                            {a.commitment_responsible ? (
                              <span>
                                <strong>Responsable:</strong> {a.commitment_responsible}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-3 flex justify-between items-end">
                      <div className="text-xs text-slate-500">
                        <strong>Registrado por:</strong> {a.created_by_name || '—'}
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-sm text-slate-500 italic">No hay observaciones registradas.</div>
            )}
          </div>
        </section>

        <section className="mt-12 pt-8 border-t border-slate-300 avoid-break">
          <div className="grid grid-cols-3 gap-8 text-center">
            <div>
              <div className="h-16 border-b border-slate-400 mb-2" />
              <p className="text-xs font-bold text-slate-600 uppercase">Firma del Director de grupo</p>
            </div>
            <div>
              <div className="h-16 border-b border-slate-400 mb-2" />
              <p className="text-xs font-bold text-slate-600 uppercase">Firma del Acudiente</p>
            </div>
            <div>
              <div className="h-16 border-b border-slate-400 mb-2" />
              <p className="text-xs font-bold text-slate-600 uppercase">Firma del Estudiante</p>
            </div>
          </div>
          <div className="mt-8 text-center text-[10px] text-slate-400">
            <p>
              {institutionName || 'Institución Educativa'} | Sistema de Gestión Escolar | Reporte generado el{' '}
              {formatDate(data.generated_at)}
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
