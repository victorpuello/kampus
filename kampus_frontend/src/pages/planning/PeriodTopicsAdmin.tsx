import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, FileUp, Pencil, Plus } from 'lucide-react'
import { academicApi } from '../../services/academic'
import type {
  AcademicLoad,
  AcademicYear,
  Period,
  PeriodTopic,
  PeriodTopicImportCorrection,
  PeriodTopicImportValidationResult,
  Subject,
  TeacherAssignment,
} from '../../services/academic'
import { useAuthStore } from '../../store/auth'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Label } from '../../components/ui/Label'
import { Modal } from '../../components/ui/Modal'
import { Toast, type ToastType } from '../../components/ui/Toast'

const requiredCsvColumns = ['academic_year', 'period_name', 'grade_name', 'subject_name', 'sequence_order', 'title', 'description'] as const

type CsvPreviewRow = Record<(typeof requiredCsvColumns)[number], string>

type CsvPreviewState = {
  totalRows: number
  rows: CsvPreviewRow[]
  missingColumns: string[]
}

type TopicFormState = {
  period: number | ''
  academic_load: number | ''
  title: string
  description: string
  sequence_order: number
  is_active: boolean
}

const emptyForm = (): TopicFormState => ({
  period: '',
  academic_load: '',
  title: '',
  description: '',
  sequence_order: 1,
  is_active: true,
})

const buildSpreadsheetPreview = (rows: unknown[][]): CsvPreviewState => {
  if (rows.length === 0) {
    return { totalRows: 0, rows: [], missingColumns: [...requiredCsvColumns] }
  }

  const headers = rows[0].map((header) => String(header ?? '').trim())
  const missingColumns = requiredCsvColumns.filter((column) => !headers.includes(column))
  const previewRows = rows.slice(1).filter((row) => row.some((cell) => String(cell ?? '').trim().length > 0)).map((values) => {
    return requiredCsvColumns.reduce<CsvPreviewRow>(
      (row, column) => {
        const headerIndex = headers.indexOf(column)
        row[column] = headerIndex >= 0 ? String(values[headerIndex] ?? '').trim() : ''
        return row
      },
      {
        academic_year: '',
        period_name: '',
        grade_name: '',
        subject_name: '',
        sequence_order: '',
        title: '',
        description: '',
      }
    )
  })

  return {
    totalRows: previewRows.length,
    rows: previewRows.slice(0, 5),
    missingColumns,
  }
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error !== 'object' || error === null) return fallback
  const maybeAxios = error as { response?: { data?: unknown } }
  const data = maybeAxios.response?.data
  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const detail = (data as Record<string, unknown>).detail
    if (typeof detail === 'string') return detail
    const firstValue = Object.values(data as Record<string, unknown>)[0]
    if (typeof firstValue === 'string') return firstValue
    if (Array.isArray(firstValue) && typeof firstValue[0] === 'string') return firstValue[0]
  }
  return fallback
}

export default function PeriodTopicsAdmin() {
  const TOPICS_PAGE_SIZE = 8
  const user = useAuthStore((state) => state.user)
  const isTeacher = user?.role === 'TEACHER'

  const [years, setYears] = useState<AcademicYear[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loads, setLoads] = useState<AcademicLoad[]>([])
  const [topics, setTopics] = useState<PeriodTopic[]>([])
  const [selectedYear, setSelectedYear] = useState<number | ''>('')
  const [selectedPeriod, setSelectedPeriod] = useState<number | ''>('')
  const [selectedSubject, setSelectedSubject] = useState<number | ''>('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [previewingFile, setPreviewingFile] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [csvPreview, setCsvPreview] = useState<CsvPreviewState | null>(null)
  const [csvPreviewError, setCsvPreviewError] = useState<string | null>(null)
  const [importValidation, setImportValidation] = useState<PeriodTopicImportValidationResult | null>(null)
  const [importCorrections, setImportCorrections] = useState<Record<number, string>>({})
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState<TopicFormState>(emptyForm())
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const pendingCorrections = useMemo(() => {
    if (!importValidation) return 0
    return importValidation.rows.filter((row) => row.status === 'review' && !importCorrections[row.row_number]).length
  }, [importCorrections, importValidation])

  const hasBlockingValidationIssues = Boolean(csvPreviewError || csvPreview?.missingColumns.length || (importValidation && (importValidation.error_rows > 0 || pendingCorrections > 0)))

  const buildCorrectionsPayload = useCallback((): PeriodTopicImportCorrection[] => {
    return Object.entries(importCorrections)
      .filter(([, subjectName]) => Boolean(subjectName))
      .map(([rowNumber, subject_name]) => ({ row_number: Number(rowNumber), subject_name }))
  }, [importCorrections])

  const validateSelectedFile = useCallback(async (file: File, corrections: Record<number, string> = {}) => {
    const correctionPayload = Object.entries(corrections)
      .filter(([, subjectName]) => Boolean(subjectName))
      .map(([rowNumber, subject_name]) => ({ row_number: Number(rowNumber), subject_name }))
    const response = await academicApi.validatePeriodTopicsFile(file, correctionPayload)
    setImportValidation(response.data)
    return response.data
  }, [])

  useEffect(() => {
    const loadBase = async () => {
      try {
        const [yearsRes, periodsRes, subjectsRes, loadsRes] = await Promise.all([
          academicApi.listYears(),
          academicApi.listPeriods(),
          academicApi.listSubjects(),
          academicApi.listAcademicLoads(),
        ])

        setYears(yearsRes.data)
        setPeriods(periodsRes.data)

        if (isTeacher) {
          const assignmentsRes = await academicApi.listMyAssignments()
          const allowedLoadIds = new Set(assignmentsRes.data.map((assignment: TeacherAssignment) => assignment.academic_load))
          const teacherLoads = loadsRes.data.filter((load) => allowedLoadIds.has(load.id))
          const teacherSubjectIds = new Set(teacherLoads.map((load) => load.subject))

          setLoads(teacherLoads)
          setSubjects(subjectsRes.data.filter((subject) => teacherSubjectIds.has(subject.id)))
        } else {
          setSubjects(subjectsRes.data)
          setLoads(loadsRes.data)
        }

        const activeYear = yearsRes.data.find((year) => year.status === 'ACTIVE')
        setSelectedYear(activeYear?.id ?? yearsRes.data[0]?.id ?? '')
      } catch (error) {
        console.error(error)
        showToast('No se pudo cargar el catálogo base de temáticas.', 'error')
      }
    }
    loadBase()
  }, [isTeacher])

  const filteredPeriods = useMemo(
    () => periods.filter((period) => !selectedYear || period.academic_year === Number(selectedYear)),
    [periods, selectedYear]
  )

  const filteredLoads = useMemo(
    () => loads.filter((load) => !selectedSubject || load.id === Number(selectedSubject) || load.subject === Number(selectedSubject)),
    [loads, selectedSubject]
  )

  const filteredTopics = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return topics
    return topics.filter((topic) => {
      const haystack = [topic.title, topic.description, topic.period_name, topic.subject_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [searchTerm, topics])

  const totalPages = Math.max(1, Math.ceil(filteredTopics.length / TOPICS_PAGE_SIZE))

  const paginatedTopics = useMemo(() => {
    const start = (currentPage - 1) * TOPICS_PAGE_SIZE
    return filteredTopics.slice(start, start + TOPICS_PAGE_SIZE)
  }, [currentPage, filteredTopics])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedYear, selectedPeriod, selectedSubject])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const refreshTopics = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = {}
      if (selectedYear) params.academic_year = Number(selectedYear)
      if (selectedPeriod) params.period = Number(selectedPeriod)
      if (selectedSubject) params.subject = Number(selectedSubject)
      const response = await academicApi.listPeriodTopics(params)
      setTopics(response.data)
    } catch (error) {
      console.error(error)
      showToast('No se pudieron cargar las temáticas.', 'error')
    } finally {
      setLoading(false)
    }
  }, [selectedPeriod, selectedSubject, selectedYear])

  useEffect(() => {
    if (!selectedYear && !selectedPeriod && !selectedSubject) return
    refreshTopics()
  }, [refreshTopics, selectedYear, selectedPeriod, selectedSubject])

  const openCreate = () => {
    setEditingId(null)
    setFormData({ ...emptyForm(), period: selectedPeriod || '' })
    setIsModalOpen(true)
  }

  const openEdit = (topic: PeriodTopic) => {
    setEditingId(topic.id)
    setFormData({
      period: topic.period,
      academic_load: topic.academic_load,
      title: topic.title,
      description: topic.description,
      sequence_order: topic.sequence_order,
      is_active: topic.is_active,
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return
    setIsModalOpen(false)
    setEditingId(null)
    setFormData(emptyForm())
  }

  const handleSave = async () => {
    if (!formData.period || !formData.academic_load || !formData.title.trim()) {
      showToast('Periodo, carga académica y temática son obligatorios.', 'warning')
      return
    }

    setSaving(true)
    try {
      const payload = {
        period: Number(formData.period),
        academic_load: Number(formData.academic_load),
        title: formData.title.trim(),
        description: formData.description.trim(),
        sequence_order: formData.sequence_order,
        is_active: formData.is_active,
      }

      if (editingId) {
        await academicApi.updatePeriodTopic(editingId, payload)
        showToast('Temática actualizada correctamente.', 'success')
      } else {
        await academicApi.createPeriodTopic(payload)
        showToast('Temática creada correctamente.', 'success')
      }
      await refreshTopics()
      closeModal()
    } catch (error) {
      console.error(error)
      showToast(getErrorMessage(error, 'No se pudo guardar la temática.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleTemplateDownload = async () => {
    try {
      const response = await academicApi.downloadPeriodTopicImportTemplate()
      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      )
      const link = document.createElement('a')
      link.href = url
      link.download = 'plantilla_tematicas_periodo.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error(error)
      showToast('No se pudo descargar la plantilla de importación.', 'error')
    }
  }

  const handleImport = async () => {
    if (!selectedFile) {
      showToast('Selecciona un archivo para importar.', 'warning')
      return
    }
    if (hasBlockingValidationIssues) {
      showToast('Corrige el archivo antes de importar.', 'warning')
      return
    }
    setImporting(true)
    setImportResult(null)
    try {
      const response = await academicApi.importPeriodTopicsFile(selectedFile, buildCorrectionsPayload())
      setImportResult(response.data)
      await refreshTopics()
      showToast(`Importación completada. Creadas: ${response.data.created}, actualizadas: ${response.data.updated}.`, 'success')
    } catch (error) {
      console.error(error)
      showToast(getErrorMessage(error, 'No se pudo importar el archivo de temáticas.'), 'error')
    } finally {
      setImporting(false)
    }
  }

  const handleFileChange = async (file: File | null) => {
    setSelectedFile(file)
    setImportResult(null)
    setCsvPreview(null)
    setCsvPreviewError(null)
    setImportValidation(null)
    setImportCorrections({})

    if (!file) return

    setPreviewingFile(true)
    try {
      const xlsxModule = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const workbook = xlsxModule.read(buffer, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      const firstSheet = workbook.Sheets[firstSheetName]
      const rows = xlsxModule.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, raw: false })
      const preview = buildSpreadsheetPreview(rows)
      setCsvPreview(preview)

      if (preview.missingColumns.length > 0) {
        setCsvPreviewError(`Faltan columnas requeridas: ${preview.missingColumns.join(', ')}.`)
      } else if (preview.totalRows === 0) {
        setCsvPreviewError('El archivo no contiene filas para importar.')
      } else {
        await validateSelectedFile(file)
      }
    } catch (error) {
      console.error(error)
      setCsvPreviewError('No se pudo leer el archivo seleccionado.')
    } finally {
      setPreviewingFile(false)
    }
  }

  const handleCorrectionChange = async (rowNumber: number, subjectName: string) => {
    const nextCorrections = {
      ...importCorrections,
      [rowNumber]: subjectName,
    }
    setImportCorrections(nextCorrections)
    if (!selectedFile) return
    setPreviewingFile(true)
    try {
      await validateSelectedFile(selectedFile, nextCorrections)
    } catch (error) {
      console.error(error)
      showToast(getErrorMessage(error, 'No se pudo validar la corrección seleccionada.'), 'error')
    } finally {
      setPreviewingFile(false)
    }
  }

  if (!isTeacher) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Gestión de temáticas</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Esta vista está disponible solo para docentes desde el submenú del planeador de clases.</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-lg border border-sky-100 bg-linear-to-br from-white via-sky-50/70 to-emerald-50/50 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Planeador de clases docente</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Temáticas por período</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">Crea o importa las temáticas de tus asignaciones para usarlas luego en el planeador de clases.</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button type="button" variant="outline" onClick={handleTemplateDownload} className="w-full gap-2 sm:w-auto">
                <Download size={16} />
                Plantilla Excel
              </Button>
              <Button type="button" onClick={openCreate} className="w-full gap-2 sm:w-auto">
                <Plus size={16} />
                Nueva temática
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Año lectivo
                <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value ? Number(event.target.value) : '')} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                  <option value="">Todos</option>
                  {years.map((year) => (
                    <option key={year.id} value={year.id}>{year.year} - {year.status_display}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Periodo
                <select value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value ? Number(event.target.value) : '')} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                  <option value="">Todos</option>
                  {filteredPeriods.map((period) => (
                    <option key={period.id} value={period.id}>{period.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Asignatura
                <select value={selectedSubject} onChange={(event) => setSelectedSubject(event.target.value ? Number(event.target.value) : '')} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                  <option value="">Todas</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>{subject.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 mb-3 rounded-lg bg-slate-50/80 p-3 dark:bg-slate-950/40">
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar por temática, descripción, periodo o asignatura"
              />
            </div>

            <div className="space-y-3 md:hidden">
              {loading ? (
                <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">Cargando temáticas...</div>
              ) : filteredTopics.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">No hay temáticas que coincidan con la búsqueda actual.</div>
              ) : (
                paginatedTopics.map((topic) => (
                  <article key={topic.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{topic.title}</h4>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{topic.description || 'Sin descripción'}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        #{topic.sequence_order}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                        <span className="block text-[11px] uppercase tracking-wide">Periodo</span>
                        <span className="mt-1 block text-sm text-slate-700 dark:text-slate-200">{topic.period_name}</span>
                      </div>
                      <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                        <span className="block text-[11px] uppercase tracking-wide">Asignatura</span>
                        <span className="mt-1 block text-sm text-slate-700 dark:text-slate-200">{topic.subject_name}</span>
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="mt-3 w-full justify-center gap-2" onClick={() => openEdit(topic)}>
                      <Pencil size={14} />
                      Editar
                    </Button>
                  </article>
                ))
              )}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-950/60">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Temática</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Periodo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Asignatura</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Orden</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                  {loading ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">Cargando temáticas...</td></tr>
                  ) : filteredTopics.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">No hay temáticas que coincidan con la búsqueda actual.</td></tr>
                  ) : paginatedTopics.map((topic) => (
                    <tr key={topic.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                        <div className="font-medium">{topic.title}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{topic.description || 'Sin descripción'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{topic.period_name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{topic.subject_name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{topic.sequence_order}</td>
                      <td className="px-4 py-3 text-sm">
                        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => openEdit(topic)}>
                          <Pencil size={14} />
                          Editar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="text-slate-500 dark:text-slate-400">
                Mostrando {filteredTopics.length === 0 ? 0 : (currentPage - 1) * TOPICS_PAGE_SIZE + 1}
                {' '}-{' '}
                {Math.min(currentPage * TOPICS_PAGE_SIZE, filteredTopics.length)} de {filteredTopics.length}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>
                  Anterior
                </Button>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Página {currentPage} de {totalPages}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage >= totalPages}>
                  Siguiente
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-amber-100 bg-linear-to-br from-white via-amber-50/50 to-sky-50/40 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Importación masiva</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Carga un archivo Excel `.xlsx` o `.xls` con las columnas de la plantilla. El sistema creará o actualizará temáticas y también acepta `.csv` por compatibilidad.</p>
            <div className="mt-4 space-y-3">
              <Label htmlFor="period-topic-file">Archivo de importación</Label>
              <Input id="period-topic-file" type="file" accept=".xlsx,.xls,.csv" onChange={(event) => void handleFileChange(event.target.files?.[0] ?? null)} />
              <Button
                type="button"
                onClick={handleImport}
                disabled={importing || previewingFile || !selectedFile || hasBlockingValidationIssues}
                className="w-full gap-2"
              >
                <FileUp size={16} />
                {importing ? 'Importando...' : 'Importar temáticas'}
              </Button>
            </div>

            {selectedFile && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950/40">
                <p className="font-medium text-slate-900 dark:text-slate-100">Vista previa</p>
                <p className="mt-1 text-slate-700 dark:text-slate-300">Archivo: {selectedFile.name}</p>
                {previewingFile ? (
                  <p className="mt-2 text-slate-600 dark:text-slate-400">Analizando archivo...</p>
                ) : csvPreviewError ? (
                  <p className="mt-2 text-rose-700 dark:text-rose-300">{csvPreviewError}</p>
                ) : csvPreview ? (
                  <>
                    <p className="mt-2 text-slate-700 dark:text-slate-300">Filas detectadas: {csvPreview.totalRows}</p>
                    {importValidation && (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900/70">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">Validación previa</p>
                        <p className="mt-1 text-slate-600 dark:text-slate-300">
                          Listas: {importValidation.ready_rows} · Revisión: {importValidation.review_rows} · Errores: {importValidation.error_rows}
                        </p>
                        {pendingCorrections > 0 && (
                          <p className="mt-2 text-amber-700 dark:text-amber-300">Debes confirmar {pendingCorrections} fila(s) antes de importar.</p>
                        )}
                      </div>
                    )}
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-800">
                        <thead className="bg-white/70 dark:bg-slate-900/60">
                          <tr>
                            <th className="px-2 py-2 text-left font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Año</th>
                            <th className="px-2 py-2 text-left font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Periodo</th>
                            <th className="px-2 py-2 text-left font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Grado</th>
                            <th className="px-2 py-2 text-left font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Asignatura</th>
                            <th className="px-2 py-2 text-left font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Orden</th>
                            <th className="px-2 py-2 text-left font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Temática</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {csvPreview.rows.map((row, index) => (
                            <tr key={`${row.title}-${row.sequence_order}-${index}`}>
                              <td className="px-2 py-2 text-slate-700 dark:text-slate-300">{row.academic_year}</td>
                              <td className="px-2 py-2 text-slate-700 dark:text-slate-300">{row.period_name}</td>
                              <td className="px-2 py-2 text-slate-700 dark:text-slate-300">{row.grade_name}</td>
                              <td className="px-2 py-2 text-slate-700 dark:text-slate-300">{row.subject_name}</td>
                              <td className="px-2 py-2 text-slate-700 dark:text-slate-300">{row.sequence_order}</td>
                              <td className="px-2 py-2 text-slate-700 dark:text-slate-300">{row.title}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {csvPreview.totalRows > csvPreview.rows.length && (
                      <p className="mt-2 text-slate-500 dark:text-slate-400">Mostrando {csvPreview.rows.length} de {csvPreview.totalRows} filas antes de importar.</p>
                    )}
                    {importValidation && importValidation.rows.some((row) => row.status !== 'ready') && (
                      <div className="mt-4 space-y-3">
                        <p className="font-medium text-slate-900 dark:text-slate-100">Filas por revisar</p>
                        {importValidation.rows.filter((row) => row.status !== 'ready').map((row) => (
                          <div key={row.row_number} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/70">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              Fila {row.row_number}: {row.title || 'Sin temática'}
                            </p>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                              Grado {row.grade_name} · Valor cargado: {row.subject_name || 'Sin asignatura'}
                            </p>
                            <p className={`mt-2 text-xs ${row.status === 'error' ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'}`}>
                              {row.message}
                            </p>
                            {row.suggestions.length > 0 && (
                              <div className="mt-3">
                                <Label htmlFor={`correction-${row.row_number}`}>Asignatura sugerida</Label>
                                <select
                                  id={`correction-${row.row_number}`}
                                  value={importCorrections[row.row_number] || ''}
                                  onChange={(event) => void handleCorrectionChange(row.row_number, event.target.value)}
                                  className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                >
                                  <option value="">Selecciona una sugerencia</option>
                                  {row.suggestions.map((suggestion) => (
                                    <option key={`${row.row_number}-${suggestion}`} value={suggestion}>{suggestion}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            {row.resolved_subject_name && (
                              <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">Se importará como: {row.resolved_subject_name}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}

            {importResult && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950/40">
                <p className="font-medium text-slate-900 dark:text-slate-100">Resultado</p>
                <p className="mt-2 text-slate-700 dark:text-slate-300">Creadas: {importResult.created}</p>
                <p className="text-slate-700 dark:text-slate-300">Actualizadas: {importResult.updated}</p>
                {importResult.errors.length > 0 && (
                  <div className="mt-3">
                    <p className="font-medium text-rose-700 dark:text-rose-300">Errores</p>
                    <ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-5 text-rose-700 dark:text-rose-300">
                      {importResult.errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingId ? 'Editar temática' : 'Nueva temática'}
        description="Registra la temática oficial que luego quedará disponible para el planeador docente."
        size="lg"
        loading={saving}
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>Cancelar</Button>
            <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar temática'}</Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="topic-period">Periodo</Label>
            <select id="topic-period" value={formData.period} onChange={(event) => setFormData((prev) => ({ ...prev, period: event.target.value ? Number(event.target.value) : '' }))} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
              <option value="">Selecciona un periodo</option>
              {filteredPeriods.map((period) => (
                <option key={period.id} value={period.id}>{period.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="topic-load">Carga académica</Label>
            <select id="topic-load" value={formData.academic_load} onChange={(event) => setFormData((prev) => ({ ...prev, academic_load: event.target.value ? Number(event.target.value) : '' }))} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
              <option value="">Selecciona una carga</option>
              {filteredLoads.map((load) => (
                <option key={load.id} value={load.id}>{load.subject_name} · {load.grade_name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="topic-title">Temática</Label>
            <Input id="topic-title" value={formData.title} onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))} />
          </div>
          <div>
            <Label htmlFor="topic-order">Orden</Label>
            <Input id="topic-order" type="number" min={1} value={formData.sequence_order} onChange={(event) => setFormData((prev) => ({ ...prev, sequence_order: Number(event.target.value) || 1 }))} />
          </div>
          <div>
            <Label htmlFor="topic-active">Estado</Label>
            <select id="topic-active" value={String(formData.is_active)} onChange={(event) => setFormData((prev) => ({ ...prev, is_active: event.target.value === 'true' }))} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
              <option value="true">Activa</option>
              <option value="false">Inactiva</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="topic-description">Descripción</Label>
            <textarea id="topic-description" value={formData.description} onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))} className="mt-1 min-h-28 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
          </div>
        </div>
      </Modal>

      <Toast message={toast.message} type={toast.type} isVisible={toast.isVisible} onClose={() => setToast((prev) => ({ ...prev, isVisible: false }))} />
    </>
  )
}