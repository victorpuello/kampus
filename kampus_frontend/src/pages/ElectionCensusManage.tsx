import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import * as XLSX from 'xlsx'

import { Button } from '../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card'
import {
  electionsApi,
  getApiErrorMessage,
  type ElectionProcessCensusMemberItem,
  type ElectionProcessItem,
} from '../services/elections'
import { academicApi, type Group as AcademicGroup } from '../services/academic'
import { studentsApi } from '../services/students'
import { useAuthStore } from '../store/auth'

const CENSUS_PAGE_SIZE_STORAGE_KEY = 'kampus.elections.census.pageSize'
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL || `${window.location.protocol}//${window.location.hostname}:8000`).replace(/\/+$/, '')

const CENSUS_EXPORT_HEADER = {
  document: 'Documento',
  code: 'Código manual',
}

type CensusCardData = {
  memberId: number
  fullName: string
  grade: string
  group: string
  documentNumber: string
  shift: string
  campus: string
  manualCode: string
  studentPhotoUrl: string
  qrDataUrl: string
}

type PrintTemplate = 'institucional' | 'clasica' | 'minimal'

type GroupOption = {
  value: string
  label: string
  queryGroup: string
}

const PRINT_TEMPLATE_LABEL: Record<PrintTemplate, string> = {
  institucional: 'Institucional',
  clasica: 'Clasica',
  minimal: 'Minimal',
}

function normalizePrintTemplate(value: string | null | undefined): PrintTemplate {
  if (value === 'clasica' || value === 'minimal') return value
  return 'institucional'
}

function normalizeIdentity(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

function normalizeDisplayValue(value: string | null | undefined, fallback = '—'): string {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function buildAcademicGroupLabel(group: AcademicGroup): string {
  const gradeName = String(group.grade_name || '').trim()
  const groupName = String(group.name || '').trim()
  if (gradeName && groupName) return `${gradeName}-${groupName}`
  return gradeName || groupName || 'Grupo'
}

function toAbsoluteAssetUrl(url: string | null | undefined): string {
  const normalized = String(url || '').trim()
  if (!normalized) return ''
  if (/^https?:\/\//i.test(normalized)) return normalized
  if (normalized.startsWith('/')) return `${API_BASE_URL}${normalized}`
  return `${API_BASE_URL}/${normalized}`
}

function parseManualCodesFromWorkbook(blob: Blob): Promise<Map<string, string>> {
  return blob.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      throw new Error('No se encontró una hoja de cálculo válida para extraer códigos manuales.')
    }

    const worksheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Array<string | number | null>>(worksheet, {
      header: 1,
      raw: false,
      defval: '',
    })

    let headerRowIndex = -1
    let documentColumnIndex = -1
    let codeColumnIndex = -1

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const headerCells = rows[rowIndex].map((cell) => String(cell || '').trim())
      const docIndex = headerCells.findIndex((cell) => cell === CENSUS_EXPORT_HEADER.document)
      const manualCodeIndex = headerCells.findIndex((cell) => cell === CENSUS_EXPORT_HEADER.code)
      if (docIndex >= 0 && manualCodeIndex >= 0) {
        headerRowIndex = rowIndex
        documentColumnIndex = docIndex
        codeColumnIndex = manualCodeIndex
        break
      }
    }

    if (headerRowIndex < 0 || documentColumnIndex < 0 || codeColumnIndex < 0) {
      throw new Error('No fue posible identificar columnas Documento y Código manual en el XLSX exportado.')
    }

    const codeByDocument = new Map<string, string>()

    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex]
      const normalizedDocument = normalizeIdentity(String(row[documentColumnIndex] || ''))
      const manualCode = String(row[codeColumnIndex] || '').trim()
      if (!normalizedDocument || !manualCode) continue
      codeByDocument.set(normalizedDocument, manualCode)
    }

    return codeByDocument
  })
}

async function buildQrDataUrlByCode(codes: string[]): Promise<Map<string, string>> {
  const uniqueCodes = Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)))
  const qrPairs = await Promise.all(
    uniqueCodes.map(async (manualCode) => {
      const qr = await QRCode.toDataURL(manualCode, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 420,
      })
      return [manualCode, qr] as const
    }),
  )
  return new Map(qrPairs)
}

async function buildStudentPhotoMap(studentIds: number[]): Promise<Map<number, string>> {
  const uniqueIds = Array.from(new Set(studentIds.filter((studentId) => Number.isFinite(studentId) && studentId > 0)))
  const photoMap = new Map<number, string>()
  if (uniqueIds.length === 0) return photoMap

  const chunkSize = 8
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize)
    const resolved = await Promise.all(
      chunk.map(async (studentId) => {
        try {
          const response = await studentsApi.get(studentId)
          const source = toAbsoluteAssetUrl(response.data.photo_thumb || response.data.photo || '')
          return [studentId, source] as const
        } catch {
          return [studentId, ''] as const
        }
      }),
    )
    resolved.forEach(([studentId, photoUrl]) => {
      photoMap.set(studentId, photoUrl)
    })
  }

  return photoMap
}

function buildCarnetsPrintHtml(params: {
  processName: string
  groupLabel: string
  institutionName: string
  institutionLogoUrl: string
  generatedAt: Date
  template: PrintTemplate
  cards: CensusCardData[]
}): string {
  const escape = (value: string): string =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')

  const generatedAtLabel = params.generatedAt.toLocaleString('es-CO')
  const cardsMarkup = params.cards
    .map((card) => {
      const photoBlock = card.studentPhotoUrl
        ? `<img class="student-photo" src="${escape(card.studentPhotoUrl)}" alt="Foto de ${escape(card.fullName)}" />`
        : '<div class="student-photo student-photo-placeholder">Sin foto</div>'

      const qrBlock = card.qrDataUrl
        ? `<div class="qr-main"><img class="qr-image" src="${escape(card.qrDataUrl)}" alt="QR de ${escape(card.manualCode)}" /></div>`
        : '<div class="qr-placeholder">QR no disponible</div>'

      const densityScore =
        card.fullName.length +
        card.campus.length +
        card.documentNumber.length +
        card.shift.length +
        card.group.length
      const densityClass = densityScore > 58 ? ' density-tight' : ''

      return `
        <article class="card-shell${densityClass}">
          <div class="card-top-band"></div>
          <div class="card-main">
            <header class="card-header">
              <div class="logo-wrap">
                ${params.institutionLogoUrl ? `<img class="logo" src="${escape(params.institutionLogoUrl)}" alt="Logo institucional" />` : '<div class="logo logo-placeholder">IE</div>'}
              </div>
              <div class="brand-copy">
                <p class="institution-name">${escape(params.institutionName)}</p>
                <p class="card-kind">Carnet estudiantil electoral</p>
              </div>
            </header>
            <section class="content-grid">
              <div class="identity-panel">
                <div class="photo-column">
                  ${photoBlock}
                  <div class="manual-code-block">
                    <p class="manual-code-caption">Código manual</p>
                    <p class="manual-code-value">${escape(card.manualCode || 'SIN-CODIGO')}</p>
                  </div>
                </div>
                <div class="student-info">
                  <h2 class="student-name">${escape(card.fullName)}</h2>
                  <p class="meta-row"><span>Grado:</span> ${escape(card.grade)}</p>
                  <p class="meta-row"><span>Grupo:</span> ${escape(card.group)}</p>
                  <p class="meta-row"><span>Documento:</span> ${escape(card.documentNumber)}</p>
                  <p class="meta-row"><span>Jornada:</span> ${escape(card.shift)}</p>
                  <p class="meta-row"><span>Sede:</span> ${escape(card.campus)}</p>
                </div>
              </div>
              <div class="qr-panel">
                <p class="qr-caption">QR de votación</p>
                ${qrBlock}
              </div>
            </section>
          </div>
        </article>
      `
    })
    .join('')

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Carnets ${escape(params.processName)} - ${escape(params.groupLabel)}</title>
    <style>
      :root {
        --ink-900: #0d243c;
        --ink-700: #264b71;
        --ink-500: #4f7398;
        --ink-300: #87a4c3;
        --paper: #edf3fb;
        --panel: #ffffff;
        --line: #c6d7ea;
        --accent: #e67e22;
        --top-gradient: linear-gradient(90deg, #264b71, #3d6a99 65%, #e67e22);
      }

      .theme-clasica {
        --ink-900: #1d2130;
        --ink-700: #33415a;
        --ink-500: #5f6d84;
        --ink-300: #8f98aa;
        --paper: #f0f1f5;
        --line: #cfd4e3;
        --accent: #b97731;
        --top-gradient: linear-gradient(90deg, #33415a, #4a5a79 68%, #b97731);
      }

      .theme-minimal {
        --ink-900: #102938;
        --ink-700: #1f4a63;
        --ink-500: #4d7389;
        --ink-300: #8ca8b8;
        --paper: #eef6f5;
        --line: #bfd7dc;
        --accent: #1ea48e;
        --top-gradient: linear-gradient(90deg, #1f4a63, #2e697f 70%, #1ea48e);
      }

      .theme-institucional .qr-panel {
        border-color: #9ab7d9;
        box-shadow: 0 0 0 0.2mm rgba(159, 186, 220, 0.32);
      }

      .theme-institucional .qr-caption {
        color: #1f4d79;
      }

      .theme-institucional .manual-code-value {
        color: #123d67;
      }

      * { box-sizing: border-box; }

      @page {
        size: A4 portrait;
        margin: 10mm;
      }

      body {
        margin: 0;
        font-family: "Montserrat", "Segoe UI", sans-serif;
        background: linear-gradient(160deg, var(--paper) 0%, #dbe9f7 100%);
        color: var(--ink-900);
      }

      .sheet {
        padding: 8mm 6mm;
      }

      .sheet-head {
        margin-bottom: 4mm;
      }

      .sheet-title {
        margin: 0;
        font-size: 13pt;
        color: var(--ink-900);
      }

      .sheet-meta {
        margin: 1.2mm 0 0;
        color: var(--ink-500);
        font-size: 8pt;
      }

      .cards-grid {
        display: grid;
        grid-template-columns: repeat(2, 86mm);
        grid-auto-rows: 54mm;
        gap: 3.5mm;
        justify-content: center;
      }

      .card-shell {
        break-inside: avoid;
        width: 86mm;
        height: 54mm;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 2.6mm;
        overflow: hidden;
        box-shadow: 0 1.2mm 3.5mm rgba(26, 64, 108, 0.12);
      }

      .card-top-band {
        height: 2.2mm;
        background: var(--top-gradient);
      }

      .card-main {
        padding: 2.1mm;
        height: calc(54mm - 2.2mm);
        display: grid;
        grid-template-rows: auto 1fr;
        gap: 1.2mm;
      }

      .card-header {
        display: flex;
        align-items: center;
        gap: 1.8mm;
        min-height: 9.8mm;
      }

      .logo-wrap {
        width: 9.8mm;
        height: 9.8mm;
        border-radius: 1.5mm;
        display: grid;
        place-items: center;
        overflow: hidden;
      }

      .logo,
      .logo-placeholder {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .logo-placeholder {
        font-weight: 700;
        color: var(--ink-700);
        display: grid;
        place-items: center;
        font-size: 5.5pt;
      }

      .institution-name {
        margin: 0;
        font-weight: 700;
        color: var(--ink-900);
        text-transform: uppercase;
        letter-spacing: 0.02em;
        font-size: 5.35pt;
        line-height: 1.2;
      }

      .card-kind {
        margin: 0.3mm 0 0;
        color: var(--ink-500);
        font-size: 4.75pt;
      }

      .content-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.1mm;
        min-height: 0;
      }

      .identity-panel {
        display: grid;
        grid-template-columns: 15.8mm 1fr;
        gap: 1mm;
        border: 1px solid var(--line);
        border-radius: 1.35mm;
        background: #f9fbff;
        padding: 0.9mm;
        min-height: 0;
      }

      .photo-column {
        display: grid;
        grid-template-rows: 1fr auto;
        gap: 0.4mm;
        min-width: 0;
      }

      .student-photo,
      .student-photo-placeholder {
        width: 100%;
        height: 27.8mm;
        border-radius: 1.4mm;
        border: 1px solid var(--line);
        object-fit: cover;
        display: grid;
        place-items: center;
      }

      .student-photo-placeholder {
        background: #eff4fb;
        color: var(--ink-500);
        font-size: 5pt;
        font-weight: 600;
      }

      .student-name {
        margin: 0 0 0.42mm;
        font-size: 5.35pt;
        line-height: 1.12;
        text-transform: uppercase;
        color: var(--ink-900);
        word-break: break-word;
      }

      .meta-row {
        margin: 0.06mm 0;
        font-size: 4.25pt;
        color: #294a6b;
        line-height: 1.1;
        word-break: break-word;
      }

      .meta-row span {
        font-weight: 700;
        color: var(--ink-700);
      }

      .manual-code-block {
        border: 1px solid var(--line);
        border-radius: 1.05mm;
        background: #ffffff;
        padding: 0.35mm 0.45mm;
      }

      .manual-code-caption {
        margin: 0;
        color: var(--ink-300);
        font-size: 3.65pt;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        line-height: 1;
      }

      .manual-code-value {
        margin: 0.2mm 0 0;
        font-family: "Consolas", "Courier New", monospace;
        font-size: 4.15pt;
        font-weight: 700;
        color: var(--ink-900);
        line-height: 1;
        word-break: break-all;
      }

      .qr-panel {
        border: 1px solid var(--line);
        border-radius: 1.5mm;
        background: linear-gradient(180deg, #ffffff 0%, #f2f8ff 100%);
        padding: 0.75mm;
        display: grid;
        grid-template-rows: auto 1fr;
        gap: 0.35mm;
        align-items: center;
        min-height: 0;
      }

      .qr-main {
        width: 80%;
        max-width: 100%;
        aspect-ratio: 1 / 1;
        border-radius: 1.1mm;
        background: #fff;
        overflow: hidden;
        justify-self: center;
        align-self: center;
        display: grid;
        place-items: center;
      }

      .qr-caption {
        margin: 0;
        font-size: 4.15pt;
        font-weight: 700;
        color: var(--ink-700);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        text-align: center;
      }

      .qr-image,
      .qr-placeholder {
        width: 100%;
        height: 100%;
        object-fit: contain;
        image-rendering: pixelated;
        background: #ffffff;
      }

      .qr-placeholder {
        display: grid;
        place-items: center;
        font-size: 4.3pt;
        color: var(--ink-500);
        border: 1px solid var(--line);
        border-radius: 1.1mm;
      }

      .card-shell.density-tight .student-photo,
      .card-shell.density-tight .student-photo-placeholder {
        height: 25.8mm;
      }

      .card-shell.density-tight .student-name {
        font-size: 5pt;
      }

      .card-shell.density-tight .meta-row {
        font-size: 4.05pt;
      }

      .card-shell.density-tight .manual-code-caption {
        font-size: 3.45pt;
      }

      .card-shell.density-tight .manual-code-value {
        font-size: 3.9pt;
      }

      @media print {
        body { background: #fff; }
        .sheet { padding: 0; }
      }
    </style>
  </head>
  <body class="theme-${escape(params.template)}">
    <main class="sheet">
      <header class="sheet-head">
        <h1 class="sheet-title">Carnets electorales · ${escape(params.processName)}</h1>
        <p class="sheet-meta">Grupo: ${escape(params.groupLabel)} · Plantilla: ${escape(PRINT_TEMPLATE_LABEL[params.template])} · Total: ${params.cards.length} · Generado: ${escape(generatedAtLabel)}</p>
      </header>
      <section class="cards-grid">
        ${cardsMarkup}
      </section>
    </main>
    <script>
      window.addEventListener('load', () => {
        setTimeout(() => {
          window.print()
        }, 250)
      })
    </script>
  </body>
</html>`
}

function downloadBlobFile(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

export default function ElectionCensusManage() {
  const user = useAuthStore((s) => s.user)
  const canManage = user?.role === 'SUPERADMIN' || user?.role === 'ADMIN'

  const [processes, setProcesses] = useState<ElectionProcessItem[]>([])
  const [selectedProcessId, setSelectedProcessId] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [voteStatusFilter, setVoteStatusFilter] = useState<'all' | 'voted' | 'not_voted'>('all')
  const [groups, setGroups] = useState<string[]>([])
  const [items, setItems] = useState<ElectionProcessCensusMemberItem[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      const rawValue = window.localStorage.getItem(CENSUS_PAGE_SIZE_STORAGE_KEY)
      const parsedValue = Number(rawValue)
      if ([10, 20, 50].includes(parsedValue)) {
        return parsedValue
      }
    } catch {
      // no-op
    }
    return 10
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busyMemberId, setBusyMemberId] = useState<number | null>(null)
  const [printing, setPrinting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [syncingCensus, setSyncingCensus] = useState(false)
  const [codeMode, setCodeMode] = useState<'existing' | 'regenerate'>('existing')
  const [regenerationReason, setRegenerationReason] = useState('')
  const [showQrModal, setShowQrModal] = useState(false)
  const [printGroup, setPrintGroup] = useState('')
  const [printTemplate, setPrintTemplate] = useState<PrintTemplate>('institucional')
  const [activeYearGroups, setActiveYearGroups] = useState<AcademicGroup[]>([])
  const [activeYearLabel, setActiveYearLabel] = useState('')
  const [loadingActiveYearGroups, setLoadingActiveYearGroups] = useState(false)

  const selectedProcess = useMemo(
    () => processes.find((process) => String(process.id) === selectedProcessId) || null,
    [processes, selectedProcessId],
  )

  const modalGroupOptions = useMemo<GroupOption[]>(() => {
    const byNormalizedLabel = new Map<string, GroupOption>()

    if (activeYearGroups.length > 0) {
      activeYearGroups.forEach((group) => {
        const label = buildAcademicGroupLabel(group)
        const queryGroup = String(group.name || '').trim() || label
        const normalizedLabel = normalizeIdentity(label)
        if (!normalizedLabel || byNormalizedLabel.has(normalizedLabel)) return
        byNormalizedLabel.set(normalizedLabel, { value: label, label, queryGroup })
      })
    }

    if (byNormalizedLabel.size > 0) {
      return Array.from(byNormalizedLabel.values()).sort((a, b) => a.label.localeCompare(b.label, 'es'))
    }

    return groups
      .map((groupName) => ({ value: groupName, label: groupName, queryGroup: groupName }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [activeYearGroups, groups])

  const votedCountInPage = useMemo(
    () => items.filter((item) => item.has_completed_vote).length,
    [items],
  )
  const notVotedCountInPage = useMemo(
    () => items.filter((item) => !item.has_completed_vote).length,
    [items],
  )

  const loadProcesses = async () => {
    if (!canManage) return
    try {
      const response = await electionsApi.listProcesses()
      setProcesses(response.results)
      if (!selectedProcessId && response.results.length > 0) {
        setSelectedProcessId(String(response.results[0].id))
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible cargar jornadas para el censo.'))
    }
  }

  const loadCensus = useCallback(async (processId: number, page = 1) => {
    setLoading(true)
    setError(null)
    try {
      const response = await electionsApi.getProcessCensus(
        processId,
        page,
        pageSize,
        debouncedSearchQuery || undefined,
        voteStatusFilter === 'all' ? undefined : voteStatusFilter,
      )
      setItems(response.results)
      setGroups(response.groups || [])
      setCurrentPage(response.page || page)
      setTotalPages(response.total_pages || 1)
      setTotalCount(response.total_count || 0)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible cargar el censo de la jornada seleccionada.'))
      setItems([])
      setGroups([])
      setTotalPages(1)
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [pageSize, debouncedSearchQuery, voteStatusFilter])

  useEffect(() => {
    void loadProcesses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage])

  useEffect(() => {
    const processId = Number(selectedProcessId)
    if (!Number.isFinite(processId) || processId <= 0) return
    void loadCensus(processId, currentPage)
  }, [selectedProcessId, currentPage, loadCensus])

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedProcessId])

  useEffect(() => {
    setCurrentPage(1)
  }, [pageSize])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim())
    }, 350)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [searchQuery])

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearchQuery])

  useEffect(() => {
    setCurrentPage(1)
  }, [voteStatusFilter])

  useEffect(() => {
    try {
      window.localStorage.setItem(CENSUS_PAGE_SIZE_STORAGE_KEY, String(pageSize))
    } catch {
      // no-op
    }
  }, [pageSize])

  useEffect(() => {
    if (!showQrModal) return

    let cancelled = false

    const loadActiveYearGroups = async () => {
      setLoadingActiveYearGroups(true)
      try {
        const yearsResponse = await academicApi.listYears()
        const activeYear = yearsResponse.data.find((year) => year.status === 'ACTIVE')

        if (!activeYear) {
          if (!cancelled) {
            setActiveYearGroups([])
            setActiveYearLabel('')
          }
          return
        }

        const groupsResponse = await academicApi.listGroups({ academic_year: activeYear.id })
        if (cancelled) return

        setActiveYearGroups(groupsResponse.data)
        setActiveYearLabel(String(activeYear.year))
      } catch {
        if (!cancelled) {
          setActiveYearGroups([])
          setActiveYearLabel('')
        }
      } finally {
        if (!cancelled) {
          setLoadingActiveYearGroups(false)
        }
      }
    }

    void loadActiveYearGroups()

    return () => {
      cancelled = true
    }
  }, [showQrModal])

  useEffect(() => {
    if (!showQrModal) return
    if (printGroup.trim()) return

    const preferredByFilter = groupFilter.trim()
    const hasPreferred = modalGroupOptions.some(
      (option) => normalizeIdentity(option.value) === normalizeIdentity(preferredByFilter),
    )
    if (hasPreferred) {
      setPrintGroup(preferredByFilter)
      return
    }

    setPrintGroup(modalGroupOptions[0]?.value || '')
  }, [showQrModal, printGroup, groupFilter, modalGroupOptions])

  const onExclude = async (item: ElectionProcessCensusMemberItem) => {
    const processId = Number(selectedProcessId)
    if (!Number.isFinite(processId) || processId <= 0) return

    setBusyMemberId(item.member_id)
    setError(null)
    setSuccess(null)
    try {
      await electionsApi.excludeCensusMember(processId, item.member_id)
      setSuccess('Estudiante excluido de la jornada.')
      await loadCensus(processId, currentPage)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible excluir el estudiante del censo de la jornada.'))
    } finally {
      setBusyMemberId(null)
    }
  }

  const onInclude = async (item: ElectionProcessCensusMemberItem) => {
    const processId = Number(selectedProcessId)
    if (!Number.isFinite(processId) || processId <= 0) return

    setBusyMemberId(item.member_id)
    setError(null)
    setSuccess(null)
    try {
      await electionsApi.includeCensusMember(processId, item.member_id)
      setSuccess('Estudiante habilitado nuevamente para la jornada.')
      await loadCensus(processId, currentPage)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible habilitar nuevamente al estudiante.'))
    } finally {
      setBusyMemberId(null)
    }
  }

  const onExportXlsx = async () => {
    const processId = Number(selectedProcessId)
    if (!Number.isFinite(processId) || processId <= 0) return

    const isRegenerateMode = codeMode === 'regenerate'
    const normalizedReason = regenerationReason.trim()
    if (isRegenerateMode && normalizedReason.length < 10) {
      setError('Debes indicar un motivo de regeneración (mínimo 10 caracteres).')
      return
    }

    if (isRegenerateMode) {
      const confirmed = window.confirm('Se regenerarán códigos manuales y se revocarán los activos previos para esta selección. ¿Deseas continuar?')
      if (!confirmed) return
    }

    setExporting(true)
    setError(null)
    try {
      const blob = await electionsApi.downloadCensusManualCodesXlsx(processId, {
        group: groupFilter || undefined,
        mode: codeMode,
        confirm_regeneration: isRegenerateMode,
        regeneration_reason: isRegenerateMode ? normalizedReason : undefined,
      })
      const suffix = groupFilter ? groupFilter.replaceAll(' ', '_') : 'todos'
      downloadBlobFile(blob, `censo_codigos_${processId}_${suffix}.xlsx`)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible exportar códigos manuales en Excel.'))
    } finally {
      setExporting(false)
    }
  }

  const onPrintQr = async (selectedGroup?: string, selectedTemplate?: PrintTemplate, backendGroupFilter?: string) => {
    const processId = Number(selectedProcessId)
    if (!Number.isFinite(processId) || processId <= 0) return

    const normalizedGroup = (selectedGroup || '').trim()
    const normalizedTemplate = normalizePrintTemplate(selectedTemplate)
    if (!normalizedGroup) {
      setError('Debes seleccionar un grupo/salón para generar los carnés (ejemplo: 8-A).')
      return
    }

    const isRegenerateMode = codeMode === 'regenerate'
    const normalizedReason = regenerationReason.trim()
    if (isRegenerateMode && normalizedReason.length < 10) {
      setError('Debes indicar un motivo de regeneración (mínimo 10 caracteres).')
      return
    }

    if (isRegenerateMode) {
      const confirmed = window.confirm('Se regenerarán códigos manuales y se revocarán los activos previos para esta selección. ¿Deseas continuar?')
      if (!confirmed) return
    }

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      setError('El navegador bloqueó la ventana de impresión. Habilita popups e inténtalo nuevamente.')
      return
    }

    setPrinting(true)
    setError(null)
    setSuccess(null)
    try {
      // 1) Resolver o regenerar códigos manuales desde backend y extraerlos del XLSX.
      const manualCodesBlob = await electionsApi.downloadCensusManualCodesXlsx(processId, {
        group: (backendGroupFilter || normalizedGroup).trim(),
        mode: codeMode,
        confirm_regeneration: isRegenerateMode,
        regeneration_reason: isRegenerateMode ? normalizedReason : undefined,
      })

      const manualCodeByDocument = await parseManualCodesFromWorkbook(manualCodesBlob)
      if (manualCodeByDocument.size === 0) {
        throw new Error('No se encontraron códigos manuales para la selección del grupo.')
      }

      // 2) Cargar censo completo para el proceso y filtrar solo habilitados del grupo solicitado.
      const aggregatedItems: ElectionProcessCensusMemberItem[] = []
      let page = 1
      let totalPagesToFetch = 1
      while (page <= totalPagesToFetch) {
        const pageResponse = await electionsApi.getProcessCensus(processId, page, 200)
        aggregatedItems.push(...pageResponse.results)
        totalPagesToFetch = pageResponse.total_pages || 1
        page += 1
      }

      // Source of truth: the XLSX is generated by backend for the selected group,
      // so we only print enabled students whose document appears in that XLSX.
      const selectedGroupItems = aggregatedItems.filter((item) => {
        if (!item.is_enabled) return false
        const normalizedDocument = normalizeIdentity(item.document_number)
        if (!normalizedDocument) return false
        return manualCodeByDocument.has(normalizedDocument)
      })

      if (selectedGroupItems.length === 0) {
        throw new Error('No hay estudiantes habilitados para imprimir en el grupo seleccionado.')
      }

      const studentPhotoMap = await buildStudentPhotoMap(
        selectedGroupItems
          .map((item) => item.student_id || 0)
          .filter((studentId) => Number.isFinite(studentId) && studentId > 0),
      )

      const rawCards = selectedGroupItems
        .map((item) => {
          const normalizedDocument = normalizeIdentity(item.document_number)
          const manualCode = manualCodeByDocument.get(normalizedDocument) || ''
          return {
            memberId: item.member_id,
            fullName: normalizeDisplayValue(item.full_name),
            grade: normalizeDisplayValue(item.grade),
            group: normalizeDisplayValue(item.group),
            documentNumber: normalizeDisplayValue(item.document_number),
            shift: normalizeDisplayValue(item.shift),
            campus: normalizeDisplayValue(item.campus),
            manualCode,
            studentPhotoUrl:
              item.student_id && studentPhotoMap.get(item.student_id)
                ? normalizeDisplayValue(studentPhotoMap.get(item.student_id), '')
                : '',
          }
        })
        .filter((card) => Boolean(card.manualCode))

      if (rawCards.length === 0) {
        throw new Error('No fue posible relacionar estudiantes con códigos manuales para este grupo.')
      }

      const qrByCode = await buildQrDataUrlByCode(rawCards.map((card) => card.manualCode))

      const branding = await electionsApi.getPublicVotingBranding()
      const institutionName = normalizeDisplayValue(branding.institution_name, 'Institución Educativa')
      const institutionLogoUrl = toAbsoluteAssetUrl(branding.logo_url)
      const processName = normalizeDisplayValue(selectedProcess?.name, `Proceso ${processId}`)

      const cards: CensusCardData[] = rawCards.map((card) => ({
        memberId: card.memberId,
        fullName: card.fullName,
        grade: card.grade,
        group: card.group,
        documentNumber: card.documentNumber,
        shift: card.shift,
        campus: card.campus,
        manualCode: card.manualCode,
        studentPhotoUrl: card.studentPhotoUrl,
        qrDataUrl: qrByCode.get(card.manualCode) || '',
      }))

      const html = buildCarnetsPrintHtml({
        processName,
        groupLabel: normalizedGroup,
        institutionName,
        institutionLogoUrl,
        generatedAt: new Date(),
        template: normalizedTemplate,
        cards,
      })

      printWindow.document.open()
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.focus()
      setSuccess(`Carnets preparados para el grupo ${normalizedGroup} en plantilla ${PRINT_TEMPLATE_LABEL[normalizedTemplate]}.`)
    } catch (requestError) {
      printWindow.close()
      if (requestError instanceof Error && requestError.message.trim()) {
        setError(requestError.message)
      } else {
        setError(getApiErrorMessage(requestError, 'No fue posible generar la impresión de carnés QR desde el frontend.'))
      }
    } finally {
      setPrinting(false)
    }
  }

  const onSyncCensusFromEnrollments = async () => {
    setSyncingCensus(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await electionsApi.syncCensusFromActiveEnrollments()
      setSuccess(
        `${response.detail} Recibidos: ${response.sync.received_count}, creados: ${response.sync.created_count}, actualizados: ${response.sync.updated_count}.`,
      )

      const processId = Number(selectedProcessId)
      if (Number.isFinite(processId) && processId > 0) {
        await loadCensus(processId, 1)
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible cargar censo desde matriculados.'))
    } finally {
      setSyncingCensus(false)
    }
  }

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sin permisos</CardTitle>
          <CardDescription>Solo superadmin y administrador pueden gestionar Censo de Gobierno Escolar.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Censo electoral por jornada</CardTitle>
          <CardDescription>
            Visualiza estudiantes habilitados para votar, excluye temporalmente por jornada y genera códigos/QR grupales.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <section className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Filtros</h3>
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Jornada</label>
                <select
                  value={selectedProcessId}
                  onChange={(event) => setSelectedProcessId(event.target.value)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">Selecciona una jornada</option>
                  {processes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Grupo para QR/XLSX</label>
                <select
                  value={groupFilter}
                  onChange={(event) => setGroupFilter(event.target.value)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">Todos los grupos</option>
                  {groups.map((groupName) => (
                    <option key={groupName} value={groupName}>
                      {groupName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Paginación</label>
                <select
                  value={String(pageSize)}
                  onChange={(event) => setPageSize(Number(event.target.value) || 10)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="10">10 por página</option>
                  <option value="20">20 por página</option>
                  <option value="50">50 por página</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Votación</label>
                <select
                  value={voteStatusFilter}
                  onChange={(event) => {
                    const value = event.target.value
                    if (value === 'voted' || value === 'not_voted') {
                      setVoteStatusFilter(value)
                      return
                    }
                    setVoteStatusFilter('all')
                  }}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">Todos</option>
                  <option value="voted">Votó</option>
                  <option value="not_voted">No votó</option>
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Emisión y mantenimiento</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Modo de códigos</label>
                <select
                  value={codeMode}
                  onChange={(event) => setCodeMode(event.target.value === 'regenerate' ? 'regenerate' : 'existing')}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="existing">Reusar existentes y generar faltantes (sin regenerar)</option>
                  <option value="regenerate">Regenerar códigos (revoca códigos activos previos)</option>
                </select>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Buscar en censo</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Nombre, documento, grupo, grado, jornada..."
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>
          </section>

          {codeMode === 'regenerate' ? (
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Motivo de regeneración (obligatorio)</label>
              <input
                type="text"
                value={regenerationReason}
                onChange={(event) => setRegenerationReason(event.target.value)}
                placeholder="Ejemplo: reimpresión controlada por pérdida de planillas"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void onSyncCensusFromEnrollments()} disabled={syncingCensus}>
              {syncingCensus ? 'Cargando censo...' : 'Cargar desde matriculados'}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setPrintGroup(groupFilter || '')
                setPrintTemplate('institucional')
                setShowQrModal(true)
              }}
              disabled={printing || !selectedProcessId}
            >
              {printing ? 'Generando impresión...' : 'Imprimir QR grupal'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void onExportXlsx()} disabled={exporting || !selectedProcessId}>
              {exporting ? 'Exportando...' : 'Exportar XLSX códigos manuales'}
            </Button>
          </div>

          {selectedProcess ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Jornada: <strong>{selectedProcess.name}</strong> · Orden: grado y grupo descendente. Modo actual:{' '}
              <strong>{codeMode === 'regenerate' ? 'Regenerar códigos' : 'Reusar + generar faltantes'}</strong>.
            </p>
          ) : null}
          {error ? <p className="text-sm text-red-600 dark:text-red-300">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-600 dark:text-emerald-300">{success}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estudiantes en censo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              Votó (página): {votedCountInPage}
            </span>
            <span className="rounded-full bg-slate-200 px-2 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              No votó (página): {notVotedCountInPage}
            </span>
          </div>

          {loading ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Cargando censo...</p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-3 md:hidden">
                {items.map((item) => (
                  <article key={item.member_id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900/60">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{item.full_name || '—'}</p>
                      {item.is_enabled ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Habilitado</span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Excluido</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Documento: {item.document_number || '—'}</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Grado/Grupo: {item.grade || '—'} · {item.group || '—'}</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Jornada: {item.shift || '—'}</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Votación: {item.has_completed_vote ? 'Completó' : 'No completó'}</p>
                    <div className="mt-3">
                      {item.is_enabled ? (
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-10 w-full"
                          disabled={busyMemberId === item.member_id}
                          onClick={() => void onExclude(item)}
                        >
                          {busyMemberId === item.member_id ? 'Procesando...' : 'Excluir'}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 w-full"
                          disabled={busyMemberId === item.member_id}
                          onClick={() => void onInclude(item)}
                        >
                          {busyMemberId === item.member_id ? 'Procesando...' : 'Reincluir'}
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 md:block">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-900/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Grado</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Grupo</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Estudiante</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Documento</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Jornada</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Estado</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Votación</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                    {items.map((item) => (
                      <tr key={item.member_id}>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.grade || '—'}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.group || '—'}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.full_name || '—'}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.document_number || '—'}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.shift || '—'}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                          {item.is_enabled ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              Habilitado
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                              Excluido
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                          {item.has_completed_vote ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              Votó
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              No votó
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {item.is_enabled ? (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={busyMemberId === item.member_id}
                              onClick={() => void onExclude(item)}
                            >
                              {busyMemberId === item.member_id ? 'Procesando...' : 'Excluir'}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={busyMemberId === item.member_id}
                              onClick={() => void onInclude(item)}
                            >
                              {busyMemberId === item.member_id ? 'Procesando...' : 'Reincluir'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Mostrando {items.length} de {totalCount} estudiantes · Página {currentPage} de {totalPages} · {pageSize} por página
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={currentPage <= 1 || loading}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={currentPage >= totalPages || loading}
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {showQrModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900">
            <h2 className="mb-1 text-base font-semibold text-slate-800 dark:text-slate-100">Imprimir carnés QR</h2>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              Selecciona un grupo específico para generar un PDF más rápido y de mayor calidad.
            </p>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Grupo</label>
                <select
                  value={printGroup}
                  onChange={(event) => setPrintGroup(event.target.value)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  disabled={loadingActiveYearGroups}
                >
                  <option value="">Selecciona un grupo</option>
                  {modalGroupOptions.map((groupOption) => (
                    <option key={groupOption.value} value={groupOption.value}>
                      {groupOption.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {loadingActiveYearGroups
                    ? 'Cargando grupos del año académico activo...'
                    : activeYearLabel
                      ? `Mostrando grupos del año activo ${activeYearLabel} (igual que en /groups).`
                      : 'No se detectó año activo; se muestran grupos disponibles del censo.'}
                </p>
                {!printGroup ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Debes elegir un solo grupo/salón para generar el PDF.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Plantilla visual</label>
                <select
                  value={printTemplate}
                  onChange={(event) => setPrintTemplate(normalizePrintTemplate(event.target.value))}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="institucional">Institucional (azul y acento dorado)</option>
                  <option value="clasica">Clasica (sobria)</option>
                  <option value="minimal">Minimal (limpia verde/azul)</option>
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tamaño final del carnet: <strong>86 mm x 54 mm</strong> (formato credencial).
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowQrModal(false)}
                  disabled={printing}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (!printGroup.trim()) {
                      setError('Selecciona un grupo/salón para imprimir carnés.')
                      return
                    }
                    const selectedOption = modalGroupOptions.find((option) => option.value === printGroup)
                    setShowQrModal(false)
                    void onPrintQr(printGroup, printTemplate, selectedOption?.queryGroup || printGroup)
                  }}
                  disabled={printing || !printGroup.trim()}
                >
                  Generar PDF
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
