import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Label } from '../components/ui/Label'
import { Input } from '../components/ui/Input'
import { Toast, type ToastType } from '../components/ui/Toast'
import { useAuthStore } from '../store/auth'
import { certificatesApi, type CertificateStudiesIssuePayload } from '../services/certificates'
import { academicApi, type AcademicYear, type Grade, type Group } from '../services/academic'
import { enrollmentsApi } from '../services/enrollments'

type EnrollmentOption = {
  id: number
  student: { id: number; full_name: string; document_number: string; document_type?: string }
}

type Mode = 'REGISTERED' | 'ARCHIVE'

type ArchiveDocTypeOption = { value: string; label: string }

type GroupOption = Group & { label: string }

function injectBaseHref(html: string, baseHref: string) {
  if (!html) return html
  if (html.includes('<base ')) return html
  if (html.includes('<head>')) return html.replace('<head>', `<head><base href="${baseHref}">`)
  return `<base href="${baseHref}">${html}`
}

function injectPreviewToolbar(html: string) {
  if (!html) return html

  const toolbar = `
<div id="kampus-preview-toolbar" style="position: fixed; top: 12px; right: 12px; z-index: 99999; display: flex; gap: 8px;">
  <button onclick="window.print()" style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; font-size: 13px; padding: 8px 10px; border: 1px solid #e5e7eb; background: white; border-radius: 8px; cursor: pointer;">Imprimir</button>
  <button onclick="window.close()" style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; font-size: 13px; padding: 8px 10px; border: 1px solid #e5e7eb; background: white; border-radius: 8px; cursor: pointer;">Cerrar</button>
</div>
`;

  if (html.includes('kampus-preview-toolbar')) return html
  if (html.includes('</body>')) return html.replace('</body>', `${toolbar}</body>`)
  return `${html}${toolbar}`
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


export default function AdministrativeCertificates() {
  const user = useAuthStore((s) => s.user)
  const isAdministrativeStaff =
    user?.role === 'ADMIN' ||
    user?.role === 'SUPERADMIN' ||
    user?.role === 'COORDINATOR' ||
    user?.role === 'SECRETARY'

  const [mode, setMode] = useState<Mode>('REGISTERED')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const showAxiosBlobError = async (err: unknown, fallbackMessage: string) => {
    const anyErr = err as {
      response?: { data?: unknown; status?: number }
      message?: string
    }

    const statusText = anyErr?.response?.status ? ` (${anyErr.response.status})` : ''
    const data = anyErr?.response?.data

    if (data instanceof Blob) {
      try {
        const text = await data.text()
        showToast(`${fallbackMessage}${statusText}: ${text}`, 'error')
        return
      } catch {
        // ignore
      }
    }

    showToast(`${fallbackMessage}${statusText}`, 'error')
  }

  const openPreviewWindow = async (payload: CertificateStudiesIssuePayload) => {
    // Open the tab synchronously (user gesture) to reduce popup-blocking.
    const w = window.open('', '_blank', 'noopener,noreferrer')
    if (!w) {
      showToast('El navegador bloqueó la ventana emergente. Permite popups para previsualizar.', 'error')
      return
    }

    try {
      w.document.open()
      w.document.write('<!doctype html><html><head><meta charset="utf-8" /><title>Vista previa</title></head><body style="font-family: system-ui; padding: 16px;">Cargando vista previa…</body></html>')
      w.document.close()
    } catch {
      // ignore
    }

    try {
      const res = await certificatesApi.previewStudies(payload)
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
      const html = injectPreviewToolbar(injectBaseHref(String(res.data ?? ''), baseUrl))
      w.document.open()
      w.document.write(html)
      w.document.close()
    } catch (err) {
      console.error(err)
      try {
        w.document.open()
        w.document.write(
          '<!doctype html><html><head><meta charset="utf-8" /><title>Error</title></head><body style="font-family: system-ui; padding: 16px;"><h3>No se pudo cargar la vista previa</h3><p>Revisa tu sesión y vuelve a intentar.</p></body></html>'
        )
        w.document.close()
      } catch {
        // ignore
      }
      showToast('Error cargando vista previa HTML.', 'error')
    }
  }

  // Registered mode state
  const [years, setYears] = useState<AcademicYear[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedYearId, setSelectedYearId] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [enrollments, setEnrollments] = useState<EnrollmentOption[]>([])
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState('')
  const [loadingEnrollments, setLoadingEnrollments] = useState(false)

  // Archive mode state
  const [grades, setGrades] = useState<Grade[]>([])
  const [archiveName, setArchiveName] = useState('')
  const [archiveDocTypeOptions, setArchiveDocTypeOptions] = useState<ArchiveDocTypeOption[]>([
    { value: 'Registro Civil de Nacimiento', label: 'Registro Civil de Nacimiento' },
    { value: 'Tarjeta de Identidad', label: 'Tarjeta de Identidad' },
    { value: 'Cédula de Ciudadanía', label: 'Cédula de Ciudadanía' },
    { value: 'Cédula de Extranjería', label: 'Cédula de Extranjería' },
    { value: 'Pasaporte', label: 'Pasaporte' },
    { value: 'PEP', label: 'PEP' },
  ])
  const [archiveDocTypeAllowOther, setArchiveDocTypeAllowOther] = useState(true)
  const [archiveDocType, setArchiveDocType] = useState<string>('Registro Civil de Nacimiento')
  const [archiveDocTypeOther, setArchiveDocTypeOther] = useState('')
  const [archiveDocNumber, setArchiveDocNumber] = useState('')
  const [archiveGradeId, setArchiveGradeId] = useState('')
  const [archiveYear, setArchiveYear] = useState(String(new Date().getFullYear()))

  useEffect(() => {
    if (!isAdministrativeStaff) return

    Promise.all([
      academicApi.listYears(),
      academicApi.listGroups(),
      academicApi.listGrades(),
      certificatesApi.listDocumentTypes(),
    ])
      .then(([yearsRes, groupsRes, gradesRes, docTypesRes]) => {
        setYears(yearsRes.data)
        setGroups(groupsRes.data)
        setGrades(gradesRes.data)

        if (docTypesRes?.data?.options?.length) {
          setArchiveDocTypeOptions(docTypesRes.data.options)
          setArchiveDocTypeAllowOther(Boolean(docTypesRes.data.allow_other))
          if (!docTypesRes.data.options.some((o) => o.value === archiveDocType)) {
            setArchiveDocType(docTypesRes.data.options[0].value)
          }
        }

        const activeYear = yearsRes.data.find((y) => y.status === 'ACTIVE')
        if (activeYear) setSelectedYearId(String(activeYear.id))
      })
      .catch((err) => {
        console.error(err)
        showToast('Error cargando datos iniciales', 'error')
      })
  }, [isAdministrativeStaff])

  const groupOptions = useMemo<GroupOption[]>(() => {
    const yearId = selectedYearId ? Number(selectedYearId) : null
    if (!yearId) return []

    const gradeNameById = new Map<number, string>()
    const gradeOrdinalById = new Map<number, number | null | undefined>()
    for (const grade of grades) gradeNameById.set(grade.id, grade.name)
    for (const grade of grades) gradeOrdinalById.set(grade.id, grade.ordinal)

    return groups
      .filter((g) => (g as unknown as { academic_year?: number }).academic_year === yearId)
      .map((g) => {
        const gradeName = g.grade_name || gradeNameById.get(g.grade) || ''
        const label = gradeName ? `${gradeName} - ${g.name}` : g.name
        return { ...g, label }
      })
      .sort((a, b) => {
        const ao = gradeOrdinalById.get(a.grade)
        const bo = gradeOrdinalById.get(b.grade)
        const aOrd = ao === null || ao === undefined ? -9999 : ao
        const bOrd = bo === null || bo === undefined ? -9999 : bo
        if (aOrd !== bOrd) return bOrd - aOrd
        return (a.label || '').localeCompare(b.label || '')
      })
  }, [grades, groups, selectedYearId])

  useEffect(() => {
    // reset downstream selection
    setSelectedGroupId('')
    setEnrollments([])
    setSelectedEnrollmentId('')
  }, [selectedYearId])

  useEffect(() => {
    setEnrollments([])
    setSelectedEnrollmentId('')
  }, [selectedGroupId])

  useEffect(() => {
    if (!isAdministrativeStaff) return
    if (!selectedYearId || !selectedGroupId) return

    let cancelled = false
    setLoadingEnrollments(true)
    enrollmentsApi
      .list({
        academic_year: Number(selectedYearId),
        group: Number(selectedGroupId),
        status: 'ACTIVE',
        page_size: 300,
      })
      .then((res) => {
        if (cancelled) return
        const results = (res.data?.results ?? []) as unknown as EnrollmentOption[]
        setEnrollments(
          results
            .filter((e) => e && typeof e.id === 'number' && e.student && typeof e.student.full_name === 'string')
            .sort((a, b) => a.student.full_name.localeCompare(b.student.full_name))
        )
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setEnrollments([])
      })
      .finally(() => {
        if (!cancelled) setLoadingEnrollments(false)
      })

    return () => {
      cancelled = true
    }
  }, [isAdministrativeStaff, selectedGroupId, selectedYearId])

  if (!isAdministrativeStaff) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Certificados</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600">No tienes permisos para generar certificados.</p>
        </CardContent>
      </Card>
    )
  }

  const handleIssueRegistered = async () => {
    if (!selectedEnrollmentId) {
      showToast('Selecciona el estudiante matriculado.', 'error')
      return
    }

    setLoading(true)
    try {
      const res = await certificatesApi.issueStudies({
        enrollment_id: Number(selectedEnrollmentId),
      })

      const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
      const enrollment = enrollments.find((e) => String(e.id) === selectedEnrollmentId)
      const filename = enrollment
        ? `certificado-estudios-${enrollment.student.document_number}.pdf`
        : 'certificado-estudios.pdf'

      downloadBlob(blob, filename)
      showToast('Certificado generado.', 'success')
    } catch (err: unknown) {
      console.error(err)
      await showAxiosBlobError(err, 'Error generando certificado')
    } finally {
      setLoading(false)
    }
  }

  const preparePreviewRegistered = () => {
    if (!selectedEnrollmentId) {
      showToast('Selecciona el estudiante matriculado.', 'error')
      return false
    }

    try {
      const payload = {
        enrollment_id: Number(selectedEnrollmentId),
      }
      void openPreviewWindow(payload)
      return true
    } catch {
      showToast('No se pudo preparar la vista previa.', 'error')
      return false
    }
  }

  const handleIssueArchive = async () => {
    const effectiveDocType = archiveDocType === '__OTHER__' ? archiveDocTypeOther.trim() : archiveDocType

    if (!archiveName.trim() || !archiveDocNumber.trim() || !archiveGradeId) {
      showToast('Completa nombre, documento y grado.', 'error')
      return
    }

    if (!effectiveDocType) {
      showToast('Selecciona el tipo de documento.', 'error')
      return
    }

    setLoading(true)
    try {
      const res = await certificatesApi.issueStudies({
        student_full_name: archiveName.trim(),
        document_type: effectiveDocType,
        document_number: archiveDocNumber.trim(),
        grade_id: Number(archiveGradeId),
        academic_year: archiveYear.trim(),
      })

      const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
      downloadBlob(blob, `certificado-estudios-${archiveDocNumber.trim()}.pdf`)
      showToast('Certificado generado.', 'success')
    } catch (err: unknown) {
      console.error(err)
      await showAxiosBlobError(err, 'Error generando certificado')
    } finally {
      setLoading(false)
    }
  }

  const preparePreviewArchive = () => {
    const effectiveDocType = archiveDocType === '__OTHER__' ? archiveDocTypeOther.trim() : archiveDocType

    if (!archiveName.trim() || !archiveDocNumber.trim() || !archiveGradeId) {
      showToast('Completa nombre, documento y grado.', 'error')
      return false
    }
    if (!effectiveDocType) {
      showToast('Selecciona el tipo de documento.', 'error')
      return false
    }

    try {
      const payload = {
        student_full_name: archiveName.trim(),
        document_type: effectiveDocType,
        document_number: archiveDocNumber.trim(),
        grade_id: Number(archiveGradeId),
        academic_year: archiveYear.trim(),
      }
      void openPreviewWindow(payload)
      return true
    } catch {
      showToast('No se pudo preparar la vista previa.', 'error')
      return false
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Certificados de estudios</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Link to="/administrativos/certificados/ingresos">
                <Button variant="outline">Ingresos</Button>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={mode === 'REGISTERED' ? 'default' : 'outline'}
              onClick={() => setMode('REGISTERED')}
              disabled={loading}
            >
              Estudiante registrado
            </Button>
            <Button
              variant={mode === 'ARCHIVE' ? 'default' : 'outline'}
              onClick={() => setMode('ARCHIVE')}
              disabled={loading}
            >
              Estudiante archivo
            </Button>
          </div>

          {mode === 'REGISTERED' ? (
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>Año lectivo</Label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={selectedYearId}
                  onChange={(e) => setSelectedYearId(e.target.value)}
                  disabled={loading}
                >
                  <option value="">Selecciona...</option>
                  {years.map((y) => (
                    <option key={y.id} value={String(y.id)}>
                      {y.year} {y.status === 'ACTIVE' ? '(Activo)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Grupo</Label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  disabled={loading || !selectedYearId}
                >
                  <option value="">Selecciona...</option>
                  {groupOptions.map((g) => (
                    <option key={g.id} value={String(g.id)}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <Label>Estudiante matriculado</Label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={selectedEnrollmentId}
                  onChange={(e) => setSelectedEnrollmentId(e.target.value)}
                  disabled={loading || loadingEnrollments || !selectedGroupId}
                >
                  <option value="">
                    {loadingEnrollments
                      ? 'Cargando estudiantes...'
                      : !selectedGroupId
                        ? 'Selecciona un grupo'
                        : enrollments.length
                          ? 'Selecciona...'
                          : 'No hay matriculados'}
                  </option>
                  {enrollments.map((e) => (
                    <option key={e.id} value={String(e.id)}>
                      {e.student.full_name} — {e.student.document_number}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleIssueRegistered} disabled={loading || !selectedEnrollmentId}>
                    {loading ? 'Generando...' : 'Generar PDF'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (loading) return
                      preparePreviewRegistered()
                    }}
                    disabled={loading}
                  >
                    Vista previa HTML
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Nombre completo</Label>
                <Input value={archiveName} onChange={(e) => setArchiveName(e.target.value)} disabled={loading} />
              </div>

              <div>
                <Label>Tipo de documento</Label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={archiveDocType}
                  onChange={(e) => setArchiveDocType(e.target.value)}
                  disabled={loading}
                >
                  {archiveDocTypeOptions.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                  {archiveDocTypeAllowOther ? <option value="__OTHER__">Otro</option> : null}
                </select>
              </div>

              {archiveDocType === '__OTHER__' ? (
                <div>
                  <Label>Especifica el tipo</Label>
                  <Input
                    value={archiveDocTypeOther}
                    onChange={(e) => setArchiveDocTypeOther(e.target.value)}
                    disabled={loading}
                    placeholder="Ej: Permiso especial..."
                  />
                </div>
              ) : null}

              <div>
                <Label>Número de documento</Label>
                <Input value={archiveDocNumber} onChange={(e) => setArchiveDocNumber(e.target.value)} disabled={loading} />
              </div>

              <div>
                <Label>Grado</Label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={archiveGradeId}
                  onChange={(e) => setArchiveGradeId(e.target.value)}
                  disabled={loading}
                >
                  <option value="">Selecciona...</option>
                  {grades
                    .slice()
                    .sort((a, b) => {
                      const ao = a.ordinal === null || a.ordinal === undefined ? -9999 : a.ordinal
                      const bo = b.ordinal === null || b.ordinal === undefined ? -9999 : b.ordinal
                      if (ao !== bo) return bo - ao
                      return (a.name || '').localeCompare(b.name || '')
                    })
                    .map((g) => (
                      <option key={g.id} value={String(g.id)}>
                        {g.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <Label>Año lectivo</Label>
                <Input value={archiveYear} onChange={(e) => setArchiveYear(e.target.value)} disabled={loading} />
              </div>

              <div className="md:col-span-2">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleIssueArchive} disabled={loading}>
                    {loading ? 'Generando...' : 'Generar PDF'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (loading) return
                      preparePreviewArchive()
                    }}
                    disabled={loading}
                  >
                    Vista previa HTML
                  </Button>
                </div>
              </div>
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
