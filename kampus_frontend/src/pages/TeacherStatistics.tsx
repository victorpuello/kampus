import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, BarChart3, ClipboardCheck, FileSpreadsheet, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Pill } from '../components/ui/Pill'
import { academicApi, type AcademicYear, type Period } from '../services/academic'
import { teachersApi, type TeacherStatisticsResponse } from '../services/teachers'

type ChartRow = Record<string, unknown>

const CHART_COLORS: Record<string, string> = {
  emerald: '#10b981',
  sky: '#0ea5e9',
  rose: '#f43f5e',
  amber: '#f59e0b',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  fuchsia: '#d946ef',
  lime: '#84cc16',
  orange: '#f97316',
  gray: '#94a3b8',
}

const pickColor = (key: unknown, fallback: string) => {
  if (typeof key === 'string' && key in CHART_COLORS) return CHART_COLORS[key]
  return fallback
}

const readNumber = (obj: ChartRow, key: string) => {
  const v = obj[key]
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

const readString = (obj: ChartRow, key: string) => {
  const v = obj[key]
  return typeof v === 'string' ? v : String(v ?? '')
}

type DonutChartProps = {
  data: ChartRow[]
  category: string
  index: string
  colors?: string[]
  className?: string
  variant?: string
}

const DonutChart = ({ data, category, index, colors, className }: DonutChartProps) => {
  const rows = (data || []).map((row, idx) => {
    const fallback = pickColor(colors?.[idx], '#94a3b8')
    return {
      name: readString(row, index) || '—',
      value: Math.max(0, readNumber(row, category)),
      color: pickColor((row as { color?: unknown }).color, fallback),
    }
  })

  const total = rows.reduce((acc, r) => acc + r.value, 0)
  const segments = total
    ? rows
        .filter((r) => r.value > 0)
        .reduce<{ stops: string[]; accPct: number }>(
          (acc, r) => {
            const start = acc.accPct
            const end = start + (r.value / total) * 100
            acc.stops.push(`${r.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`)
            acc.accPct = end
            return acc
          },
          { stops: [], accPct: 0 }
        ).stops
    : []

  const background = segments.length ? `conic-gradient(${segments.join(', ')})` : 'conic-gradient(#e2e8f0 0% 100%)'

  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-center ${className || ''}`}>
      <div className="relative mx-auto h-32 w-32 sm:mx-0 sm:h-36 sm:w-36">
        <div className="h-full w-full rounded-full" style={{ background }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-sm font-medium text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100 sm:h-20 sm:w-20">
            {total ? total : '—'}
          </div>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {rows.length === 0 ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">No hay datos para graficar.</div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const pct = total ? Math.round((r.value / total) * 100) : 0
              return (
                <div key={r.name} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                    <span className="truncate text-slate-700 dark:text-slate-200">{r.name}</span>
                  </div>
                  <div className="shrink-0 text-slate-600 dark:text-slate-300">
                    {r.value} ({pct}%)
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

type BarListRow = { name: string; value: number; color?: string }
type BarListProps = {
  data: BarListRow[]
  className?: string
  valueFormatter?: (v: number) => string
}

const BarList = ({ data, className, valueFormatter }: BarListProps) => {
  const rows = data || []
  const max = Math.max(0, ...rows.map((r) => (Number.isFinite(r.value) ? r.value : 0)))

  return (
    <div className={className || ''}>
      <div className="space-y-2">
        {rows.map((r) => {
          const value = Number.isFinite(r.value) ? r.value : 0
          const pct = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
          const color = pickColor(r.color, '#0ea5e9')
          return (
            <div key={r.name} className="grid grid-cols-[1fr_auto] items-center gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <div className="truncate text-sm text-slate-700 dark:text-slate-200">{r.name}</div>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
              </div>
              <div className="text-sm tabular-nums text-slate-600 dark:text-slate-300">
                {valueFormatter ? valueFormatter(value) : value}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type TabKey = 'subject' | 'director'

type DirectorSubtabKey = 'resumen' | 'asignaturas' | 'estudiantes' | 'ia'

const toLocalDate = (value: string | null | undefined) => {
  if (!value) return null
  // Dates come as YYYY-MM-DD; force local midnight to avoid TZ shifts.
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

const pickActivePeriodId = (items: Period[]): number | '' => {
  if (!items.length) return ''
  const today = new Date()

  const sorted = items
    .slice()
    .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))

  const byRange = sorted.find((p) => {
    if (p.is_closed) return false
    const start = toLocalDate(p.start_date)
    const end = toLocalDate(p.end_date)
    if (!start) return false
    if (today < start) return false
    if (end && today > end) return false
    return true
  })
  if (byRange) return byRange.id

  // Fallback: most recent open period that already started.
  const openStarted = sorted
    .filter((p) => !p.is_closed)
    .filter((p) => {
      const start = toLocalDate(p.start_date)
      return !!start && today >= start
    })
  if (openStarted.length) return openStarted[openStarted.length - 1].id

  // Fallback: first open period, else last by date.
  const firstOpen = sorted.find((p) => !p.is_closed)
  return firstOpen?.id ?? sorted[sorted.length - 1].id
}

const pct = (num: number, den: number) => {
  if (!den) return '0%'
  const p = Math.round((num / den) * 100)
  return `${p}%`
}

const clampPct = (num: number, den: number) => {
  if (!den) return 0
  const p = Math.round((num / den) * 100)
  return Math.max(0, Math.min(100, p))
}

const toneForPct = (p: number) => {
  if (p >= 85) {
    return {
      bar: 'bg-emerald-500',
      pill: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/40',
    }
  }
  if (p >= 60) {
    return {
      bar: 'bg-sky-500',
      pill: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-200 dark:border-sky-900/40',
    }
  }
  if (p >= 35) {
    return {
      bar: 'bg-amber-500',
      pill: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/40',
    }
  }
  return {
    bar: 'bg-red-500',
    pill: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900/50',
  }
}

export default function TeacherStatistics() {
  const [tab, setTab] = useState<TabKey>('subject')
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [loadingStats, setLoadingStats] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [years, setYears] = useState<AcademicYear[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [yearId, setYearId] = useState<number | ''>('')
  const [periodId, setPeriodId] = useState<number | ''>('')

  const [directorMode, setDirectorMode] = useState<'period' | 'accumulated'>('period')
  const [directorGroupId, setDirectorGroupId] = useState<number | ''>('')
  const [directorSubjectId, setDirectorSubjectId] = useState<number | ''>('')
  const [directorSubtab, setDirectorSubtab] = useState<DirectorSubtabKey>('resumen')

  const [stats, setStats] = useState<TeacherStatisticsResponse | null>(null)

  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiText, setAiText] = useState<string | null>(null)
  const [aiNotice, setAiNotice] = useState<string | null>(null)

  const renderAiInline = (text: string) => {
    // Supports **bold** without exposing literal asterisks.
    const parts: Array<string | { bold: string }> = []
    const re = /\*\*(.+?)\*\*/g
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index))
      parts.push({ bold: m[1] })
      last = m.index + m[0].length
    }
    if (last < text.length) parts.push(text.slice(last))

    return (
      <>
        {parts.map((p, idx) =>
          typeof p === 'string' ? (
            <span key={idx}>{p}</span>
          ) : (
            <strong key={idx} className="font-semibold text-slate-900 dark:text-slate-100">
              {p.bold}
            </strong>
          ),
        )}
      </>
    )
  }

  const renderAiAnalysis = (text: string) => {
    const lines = text.split(/\r?\n/)
    const blocks: ReactNode[] = []
    const isTitle = (s: string) => {
      const t = s.trim()
      if (!t) return false
      if (t.startsWith('-') || t.startsWith('*')) return false
      // Executive report uses all-caps section titles.
      return /^[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9 \-—]{3,}$/.test(t)
    }

    let i = 0
    while (i < lines.length) {
      const raw = lines[i] ?? ''
      const line = raw.trimEnd()
      const t = line.trim()

      if (!t) {
        i += 1
        continue
      }

      if (isTitle(t)) {
        blocks.push(
          <div key={`t-${i}`} className="mt-3 font-semibold text-slate-900 dark:text-slate-100">
            {renderAiInline(t)}
          </div>,
        )
        i += 1
        continue
      }

      const bulletMatch = /^\s*[-*]\s+(.+)$/.exec(line)
      if (bulletMatch) {
        const items: string[] = []
        while (i < lines.length) {
          const cur = (lines[i] ?? '').trimEnd()
          const curMatch = /^\s*[-*]\s+(.+)$/.exec(cur)
          if (!curMatch) break
          items.push(curMatch[1].trim())
          i += 1
        }
        blocks.push(
          <ul key={`ul-${i}`} className="list-disc pl-5 mt-2 space-y-1">
            {items.map((it, idx) => (
              <li key={idx} className="text-slate-700 dark:text-slate-200">
                {renderAiInline(it)}
              </li>
            ))}
          </ul>,
        )
        continue
      }

      // Paragraph: merge consecutive non-empty, non-bullet, non-title lines.
      const para: string[] = [t]
      i += 1
      while (i < lines.length) {
        const nxt = (lines[i] ?? '').trim()
        if (!nxt) break
        if (isTitle(nxt)) break
        if (/^\s*[-*]\s+/.test(nxt)) break
        para.push(nxt)
        i += 1
      }
      blocks.push(
        <p key={`p-${i}`} className="mt-2 text-slate-700 dark:text-slate-200">
          {renderAiInline(para.join(' '))}
        </p>,
      )
    }

    return <div>{blocks}</div>
  }

  useEffect(() => {
    let mounted = true

    ;(async () => {
      setLoadingMeta(true)
      setError(null)
      try {
        const [yearsRes, periodsRes] = await Promise.all([academicApi.listYears(), academicApi.listPeriods()])
        if (!mounted) return

        const yearsData = yearsRes.data || []
        const periodsData = periodsRes.data || []
        setYears(yearsData)
        setPeriods(periodsData)

        const activeYear = yearsData.find((y) => y.status === 'ACTIVE')
        const defaultYearId = activeYear?.id ?? yearsData[0]?.id
        if (defaultYearId) {
          setYearId(defaultYearId)

          const yearPeriods = periodsData.filter((p) => p.academic_year === defaultYearId)
          const activePeriodId = pickActivePeriodId(yearPeriods)
          setPeriodId(activePeriodId)
        }
      } catch {
        if (mounted) setError('No se pudo cargar año/periodo.')
      } finally {
        if (mounted) setLoadingMeta(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  const filteredPeriods = useMemo(() => {
    if (!yearId) return []
    return periods
      .filter((p) => p.academic_year === yearId)
      .slice()
      .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
  }, [periods, yearId])

  useEffect(() => {
    if (!yearId) return
    const current = filteredPeriods.find((p) => p.id === periodId)
    if (current) return
    const activePeriodId = pickActivePeriodId(filteredPeriods)
    setPeriodId(activePeriodId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId, filteredPeriods.length])

  useEffect(() => {
    let mounted = true
    if (!yearId || !periodId) return

    ;(async () => {
      setLoadingStats(true)
      setError(null)
      try {
        const res = await teachersApi.myStatistics({
          year_id: yearId,
          period_id: periodId,
          director_mode: directorMode,
          director_group_id: directorGroupId ? directorGroupId : undefined,
          director_subject_id: directorSubjectId ? directorSubjectId : undefined,
        })
        if (!mounted) return
        setStats(res.data)
      } catch {
        if (mounted) {
          setError('No se pudo cargar estadísticas.')
          setStats(null)
        }
      } finally {
        if (mounted) setLoadingStats(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [yearId, periodId, directorMode, directorGroupId, directorSubjectId])

  useEffect(() => {
    setAiError(null)
    setAiText(null)
    setAiNotice(null)
  }, [yearId, periodId, directorMode, directorGroupId])

  const subject = stats?.subject_teacher
  const director = stats?.director
  const directorPerformance = director?.performance
  const directorPassingScore = directorPerformance?.scope?.passing_score || '3.00'

  const canGenerateAI = (director?.groups || []).length > 0

  useEffect(() => {
    if (directorGroupId) return
    const groups = director?.groups || []
    if (groups.length === 1) setDirectorGroupId(groups[0].group_id)
  }, [director?.groups, directorGroupId])

  const directorSubjects = useMemo(() => {
    const items = directorPerformance?.subjects_by_average || []
    return items
      .slice()
      .sort((a, b) => (a.area_name || '').localeCompare(b.area_name || '') || a.subject_name.localeCompare(b.subject_name))
  }, [directorPerformance?.subjects_by_average])

  const directorCharts = useMemo(() => {
    const best = (directorPerformance?.subjects_by_average || []).slice(0, 10)
    const worst = (directorPerformance?.subjects_by_failure_rate || []).slice(0, 10)

    const palette = ['sky', 'indigo', 'emerald', 'amber', 'rose', 'violet', 'cyan', 'fuchsia', 'lime', 'orange']

    const bestAvg = best.map((s, idx) => ({
      name: s.subject_name,
      value: Number(s.average) || 0,
      color: palette[idx % palette.length],
    }))

    const worstFail = worst.map((s, idx) => ({
      name: s.subject_name,
      value: Number(s.failure_rate) || 0,
      color: palette[idx % palette.length],
    }))

    return { bestAvg, worstFail }
  }, [directorPerformance?.subjects_by_average, directorPerformance?.subjects_by_failure_rate])

  const directorRiskChart = useMemo(() => {
    const rs = directorPerformance?.risk_summary
    if (!rs) return []
    const withoutData = (rs as { students_without_data?: number }).students_without_data ?? 0
    return [
      { name: 'OK', value: rs.ok ?? 0 },
      { name: 'En riesgo', value: rs.at_risk ?? 0 },
      { name: 'Sin datos', value: withoutData },
    ].filter((x) => x.value > 0)
  }, [directorPerformance?.risk_summary])

  const generateAI = async (opts?: { refresh?: boolean }) => {
    if (!yearId || !periodId) return
    setAiLoading(true)
    setAiError(null)
    setAiNotice(null)
    try {
      const res = await teachersApi.myStatisticsAI({
        year_id: yearId,
        period_id: periodId,
        director_mode: directorMode,
        director_group_id: directorGroupId ? directorGroupId : undefined,
        director_subject_id: directorSubjectId ? directorSubjectId : undefined,
        refresh: opts?.refresh ? 1 : undefined,
      })
      setAiText(res.data.analysis)
      if (opts?.refresh) setAiNotice('Análisis regenerado.')
      else if (res.data.cached) setAiNotice('Mostrando análisis guardado.')
    } catch (err: unknown) {
      const detail =
        typeof err === 'object' && err && 'response' in err
          ? (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : null
      const msg = typeof detail === 'string' && detail.trim() ? detail : 'No se pudo generar el análisis.'
      setAiError(msg)
      setAiText(null)
    } finally {
      setAiLoading(false)
    }
  }

  const copyAI = async () => {
    if (!aiText) return
    setAiNotice(null)
    try {
      await navigator.clipboard.writeText(aiText)
      setAiNotice('Copiado al portapapeles.')
    } catch {
      setAiNotice('No se pudo copiar automáticamente.')
    }
  }

  const downloadAIPdf = async (opts?: { refresh?: boolean }) => {
    if (!yearId || !periodId) return
    setAiNotice(null)
    try {
      const res = await teachersApi.myStatisticsAIPdf({
        year_id: yearId,
        period_id: periodId,
        director_mode: directorMode,
        director_group_id: directorGroupId ? directorGroupId : undefined,
        director_subject_id: directorSubjectId ? directorSubjectId : undefined,
        refresh: opts?.refresh ? 1 : undefined,
      })

      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      const yearLabel = stats?.academic_year?.year ? String(stats.academic_year.year) : String(yearId)
      const periodLabel = stats?.period?.name ? String(stats.period.name).replace(/\s+/g, '_') : String(periodId)
      a.href = url
      a.download = `analisis_ia_${yearLabel}_${periodLabel}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      setAiNotice('No se pudo descargar el PDF.')
    }
  }

  const subjectCharts = useMemo(() => {
    const expected = subject?.grade_sheets.expected ?? 0
    const published = subject?.grade_sheets.published ?? 0
    const draft = subject?.grade_sheets.draft ?? 0
    const missing = subject?.grade_sheets.missing ?? 0

    const gradeSheets = [
      { name: 'Publicadas', value: published },
      { name: 'Borrador', value: draft },
      { name: 'Faltantes', value: missing },
    ].filter((x) => x.value > 0)

    const cellsExpected = subject?.gradebook_cells.expected ?? 0
    const cellsFilled = subject?.gradebook_cells.filled ?? 0
    const cells = [
      { name: 'Diligenciadas', value: cellsFilled },
      { name: 'Pendientes', value: Math.max(0, cellsExpected - cellsFilled) },
    ].filter((x) => x.value > 0)

    return { expected, gradeSheets, cells }
  }, [subject])

  const kpiCards = useMemo(() => {
    if (!stats) return []

    if (tab === 'subject') {
      const published = subject?.grade_sheets.published ?? 0
      const expected = subject?.grade_sheets.expected ?? 0
      const publishedPct = clampPct(published, expected)
      const filled = subject?.gradebook_cells.filled ?? 0
      const cellsExpected = subject?.gradebook_cells.expected ?? 0
      const cellsPct = clampPct(filled, cellsExpected)

      return [
        {
          key: 'students',
          title: 'Estudiantes activos',
          value: String(subject?.students_active ?? 0),
          subtitle: 'En tus grupos/asignaturas',
          icon: Users,
        },
        {
          key: 'planning',
          title: 'Planillas publicadas',
          value: `${publishedPct}%`,
          subtitle: `${published}/${expected} en ${stats.period.name}`,
          icon: FileSpreadsheet,
        },
        {
          key: 'cells',
          title: 'Calificaciones diligenciadas',
          value: `${cellsPct}%`,
          subtitle: `${filled}/${cellsExpected} celdas`,
          icon: ClipboardCheck,
        },
        {
          key: 'assignments',
          title: 'Asignaciones',
          value: String(subject?.assignments ?? 0),
          subtitle: `${subject?.groups ?? 0} grupos · ${subject?.subjects ?? 0} asignaturas`,
          icon: BarChart3,
        },
      ]
    }

    const risk = directorPerformance?.risk_summary
    const studentsTotal = risk?.students_total ?? 0
    const atRisk = risk?.at_risk ?? 0
    const riskPct = clampPct(atRisk, studentsTotal)

    return [
      {
        key: 'director_students',
        title: 'Estudiantes activos',
        value: String(director?.totals.students_active ?? 0),
        subtitle: `${director?.totals.groups ?? 0} grupos dirigidos`,
        icon: Users,
      },
      {
        key: 'risk',
        title: 'Riesgo académico',
        value: `${riskPct}%`,
        subtitle: `${atRisk} de ${studentsTotal} en riesgo`,
        icon: AlertTriangle,
      },
      {
        key: 'cases',
        title: 'Casos convivencia',
        value: String(director?.totals.discipline_cases_total ?? 0),
        subtitle: `${director?.totals.discipline_cases_open ?? 0} abiertos`,
        icon: FileSpreadsheet,
      },
      {
        key: 'subjects',
        title: 'Asignaturas analizadas',
        value: String((directorPerformance?.subjects_by_average || []).length),
        subtitle: 'Ranking de desempeño',
        icon: BarChart3,
      },
    ]
  }, [director, directorPerformance, stats, subject, tab])

  useEffect(() => {
    if (!directorSubjectId) return
    const exists = directorSubjects.some((s) => s.subject_id === directorSubjectId)
    if (!exists) setDirectorSubjectId('')
  }, [directorSubjects, directorSubjectId])

  return (
    <div className="max-w-6xl mx-auto px-3 py-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Estadísticas docentes</h1>
        <p className="text-slate-600 dark:text-slate-300 mt-1">Indicadores de rendimiento, planeación y seguimiento por periodo.</p>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-slate-500 dark:text-slate-400">Año</span>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={yearId}
                disabled={loadingMeta}
                onChange={(e) => setYearId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Selecciona</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.year}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-sm text-slate-500 dark:text-slate-400">Periodo</span>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={periodId}
                disabled={loadingMeta || !yearId}
                onChange={(e) => setPeriodId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Selecciona</option>
                {filteredPeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {stats ? (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Pill text={`Año ${stats.academic_year.year}`} className="bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-800" />
          <Pill text={stats.period.name} className="bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-800" />
          {stats.period.is_closed ? (
            <Pill text="Periodo cerrado" className="bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/40" />
          ) : (
            <Pill text="Periodo en curso" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/40" />
          )}
        </div>
      ) : null}

      <div className="-mx-3 px-3 overflow-x-auto">
        <div className="grid grid-cols-2 w-full min-w-[280px] gap-2">
          <Button variant={tab === 'subject' ? 'default' : 'outline'} onClick={() => setTab('subject')}>
            Docente de asignatura
          </Button>
          <Button variant={tab === 'director' ? 'default' : 'outline'} onClick={() => setTab('director')}>
            Director de grupo
          </Button>
        </div>
      </div>

      {!loadingStats && stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpiCards.map((kpi) => (
            <Card key={kpi.key} className="hover:border-slate-300 hover:shadow-sm transition-all">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{kpi.title}</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{kpi.value}</p>
                  </div>
                  <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                    <kpi.icon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{kpi.subtitle}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {loadingStats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-pulse">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Card key={`kpi-skeleton-${idx}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-2">
                    <div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-8 w-16 rounded bg-slate-200 dark:bg-slate-800" />
                  </div>
                  <div className="h-8 w-8 rounded-lg bg-slate-200 dark:bg-slate-800" />
                </div>
                <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="text-sm text-red-600 dark:text-red-300 mb-4">{error}</div>
      ) : null}

      {loadingStats ? (
        <div className="text-sm text-slate-500 dark:text-slate-400">Actualizando estadísticas…</div>
      ) : null}

      {!loadingStats && stats && tab === 'subject' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Asignaciones</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="text-slate-500 dark:text-slate-400">Asignaciones</div>
                <div className="text-slate-900 font-medium dark:text-slate-100">{subject?.assignments ?? 0}</div>

                <div className="text-slate-500 dark:text-slate-400">Grupos</div>
                <div className="text-slate-900 font-medium dark:text-slate-100">{subject?.groups ?? 0}</div>

                <div className="text-slate-500 dark:text-slate-400">Asignaturas</div>
                <div className="text-slate-900 font-medium dark:text-slate-100">{subject?.subjects ?? 0}</div>

                <div className="text-slate-500 dark:text-slate-400">Estudiantes (activos)</div>
                <div className="text-slate-900 font-medium dark:text-slate-100">{subject?.students_active ?? 0}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Planillas ({stats.period.name})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 mb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Estado de planillas</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Sobre {subjectCharts.expected} esperadas</div>
                    <div className="mt-2">
                      <DonutChart data={subjectCharts.gradeSheets} category="value" index="name" colors={['emerald', 'sky', 'rose']} />
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Celdas de calificación</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Diligenciadas vs pendientes</div>
                    <div className="mt-2">
                      <DonutChart data={subjectCharts.cells} category="value" index="name" colors={['emerald', 'amber']} />
                    </div>
                  </div>
                </div>
              </div>

              {(() => {
                const expected = subject?.grade_sheets.expected ?? 0
                const published = subject?.grade_sheets.published ?? 0
                const p = clampPct(published, expected)
                const t = toneForPct(p)
                return (
                  <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Publicación de planillas</div>
                      <Pill text={`${p}%`} className={t.pill} />
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-slate-200 overflow-hidden dark:bg-slate-800">
                      <div className={`h-2 ${t.bar}`} style={{ width: `${p}%` }} />
                    </div>
                  </div>
                )
              })()}

              {(() => {
                const expected = subject?.gradebook_cells.expected ?? 0
                const filled = subject?.gradebook_cells.filled ?? 0
                const p = clampPct(filled, expected)
                const t = toneForPct(p)
                return (
                  <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Diligenciamiento de celdas</div>
                      <Pill text={`${p}%`} className={t.pill} />
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-slate-200 overflow-hidden dark:bg-slate-800">
                      <div className={`h-2 ${t.bar}`} style={{ width: `${p}%` }} />
                    </div>
                  </div>
                )
              })()}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="text-slate-500 dark:text-slate-400">Esperadas</div>
                <div className="text-slate-900 font-medium dark:text-slate-100">{subject?.grade_sheets.expected ?? 0}</div>

                <div className="text-slate-500 dark:text-slate-400">Creadas</div>
                <div className="text-slate-900 font-medium dark:text-slate-100">{subject?.grade_sheets.created ?? 0}</div>

                <div className="text-slate-500 dark:text-slate-400">Publicadas</div>
                <div className="text-slate-900 font-medium dark:text-slate-100">
                  {subject?.grade_sheets.published ?? 0} ({pct(subject?.grade_sheets.published ?? 0, subject?.grade_sheets.expected ?? 0)})
                </div>

                <div className="text-slate-500 dark:text-slate-400">Borrador</div>
                <div className="text-slate-900 font-medium dark:text-slate-100">{subject?.grade_sheets.draft ?? 0}</div>

                <div className="text-slate-500 dark:text-slate-400">Faltantes</div>
                <div className="text-slate-900 font-medium dark:text-slate-100">{subject?.grade_sheets.missing ?? 0}</div>

                <div className="text-slate-500 dark:text-slate-400">Celdas diligenciadas</div>
                <div className="text-slate-900 font-medium dark:text-slate-100">
                  {subject?.gradebook_cells.filled ?? 0} / {subject?.gradebook_cells.expected ?? 0} (
                  {pct(subject?.gradebook_cells.filled ?? 0, subject?.gradebook_cells.expected ?? 0)})
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!loadingStats && stats && tab === 'director' ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Rendimiento académico</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
                  <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-2">
                    <span className="text-sm text-slate-500 dark:text-slate-400">Vista</span>
                    <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 lg:mx-0 lg:px-0">
                      <Button
                        variant={directorMode === 'period' ? 'default' : 'outline'}
                        onClick={() => setDirectorMode('period')}
                      >
                        Periodo
                      </Button>
                      <Button
                        variant={directorMode === 'accumulated' ? 'default' : 'outline'}
                        onClick={() => setDirectorMode('accumulated')}
                      >
                        Acumulado
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-2">
                    <span className="text-sm text-slate-500 dark:text-slate-400">Grupo</span>
                    <select
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 lg:w-auto"
                      value={directorGroupId}
                      disabled={(director?.groups || []).length === 0}
                      onChange={(e) => setDirectorGroupId(e.target.value ? Number(e.target.value) : '')}
                    >
                      <option value="">Todos</option>
                      {(director?.groups || []).map((g) => (
                        <option key={g.group_id} value={g.group_id}>
                          {g.grade_name} - {g.group_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-2 sm:col-span-2">
                    <span className="text-sm text-slate-500 dark:text-slate-400">Asignatura</span>
                    <select
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      value={directorSubjectId}
                      disabled={directorSubjects.length === 0}
                      onChange={(e) => setDirectorSubjectId(e.target.value ? Number(e.target.value) : '')}
                    >
                      <option value="">(Sin detalle)</option>
                      {directorSubjects.map((s) => (
                        <option key={s.subject_id} value={s.subject_id}>
                          {(s.area_name || '—') + ' - ' + s.subject_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-sm text-slate-600 dark:text-slate-300">
                  <Pill
                    text={`Umbral SIEE: ${directorPassingScore}`}
                    className="bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-800"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="-mx-3 px-3 overflow-x-auto">
            <div className="flex w-max min-w-full items-center gap-2">
            <Button variant={directorSubtab === 'resumen' ? 'default' : 'outline'} onClick={() => setDirectorSubtab('resumen')}>
              Resumen
            </Button>
            <Button
              variant={directorSubtab === 'asignaturas' ? 'default' : 'outline'}
              onClick={() => setDirectorSubtab('asignaturas')}
            >
              Asignaturas
            </Button>
            <Button
              variant={directorSubtab === 'estudiantes' ? 'default' : 'outline'}
              onClick={() => setDirectorSubtab('estudiantes')}
            >
              Estudiantes
            </Button>
            <Button variant={directorSubtab === 'ia' ? 'default' : 'outline'} onClick={() => setDirectorSubtab('ia')}>
              IA
            </Button>
            </div>
          </div>

          {directorSubtab === 'resumen' ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Estado general</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!directorPerformance?.risk_summary ? (
                      <div className="text-sm text-slate-500 dark:text-slate-400">No hay datos para graficar.</div>
                    ) : (
                      <>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                          Estudiantes con calificaciones: {directorPerformance.risk_summary.students_total} /{' '}
                          {(directorPerformance.risk_summary as { students_active?: number }).students_active ?? '—'}
                        </div>
                        <DonutChart
                          data={directorRiskChart}
                          category="value"
                          index="name"
                          variant="donut"
                          colors={['emerald', 'rose', 'gray']}
                        />
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Notas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                      En riesgo = promedio &lt; umbral SIEE o al menos 1 asignatura perdida.
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}

          {directorSubtab === 'asignaturas' ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Top asignaturas por promedio</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {directorCharts.bestAvg.length === 0 ? (
                      <div className="text-sm text-slate-500 dark:text-slate-400">No hay datos para graficar.</div>
                    ) : (
                      <BarList data={directorCharts.bestAvg} className="mt-2" valueFormatter={(v: number) => v.toFixed(2)} />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Top asignaturas por pérdida</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {directorCharts.worstFail.length === 0 ? (
                      <div className="text-sm text-slate-500 dark:text-slate-400">No hay datos para graficar.</div>
                    ) : (
                      <BarList
                        data={directorCharts.worstFail}
                        className="mt-2"
                        valueFormatter={(v: number) => `${v.toFixed(1)}%`}
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}

          {directorSubtab === 'asignaturas' && directorPerformance?.subject_detail ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  Detalle: {directorPerformance.subject_detail.area_name || '—'} - {directorPerformance.subject_detail.subject_name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const expected = directorPerformance.subject_detail.gradebook_cells.expected
                  const filled = directorPerformance.subject_detail.gradebook_cells.filled
                  const p = clampPct(filled, expected)
                  const t = toneForPct(p)
                  return (
                    <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Calificación vs avance</div>
                        <Pill text={`Celdas ${p}%`} className={t.pill} />
                      </div>
                      <div className="mt-2 h-2 w-full rounded-full bg-slate-200 overflow-hidden dark:bg-slate-800">
                        <div className={`h-2 ${t.bar}`} style={{ width: `${p}%` }} />
                      </div>
                    </div>
                  )
                })()}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Estudiantes</div>
                    <div className="text-slate-900 font-medium dark:text-slate-100">{directorPerformance.subject_detail.students}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Promedio</div>
                    <div className="text-slate-900 font-medium dark:text-slate-100">
                      <Pill text={directorPerformance.subject_detail.average} className="bg-sky-50 text-sky-700 border-sky-200" />
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Pérdida</div>
                    <div className="text-slate-900 font-medium dark:text-slate-100">
                      {(() => {
                        const fr = Number(directorPerformance.subject_detail.failure_rate)
                        const t = toneForPct(Math.max(0, 100 - (isFinite(fr) ? fr : 0)))
                        return <Pill text={`${directorPerformance.subject_detail.failure_rate}%`} className={t.pill} />
                      })()}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Celdas</div>
                    <div className="text-slate-900 font-medium dark:text-slate-100">
                      {directorPerformance.subject_detail.gradebook_cells.filled} / {directorPerformance.subject_detail.gradebook_cells.expected} (
                      {pct(
                        directorPerformance.subject_detail.gradebook_cells.filled,
                        directorPerformance.subject_detail.gradebook_cells.expected
                      )})
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                    <thead className="bg-slate-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Estudiante</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Grupo</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Nota</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200 dark:bg-slate-900 dark:divide-slate-800">
                      {(directorPerformance.subject_detail.students_rows || []).length === 0 ? (
                        <tr>
                          <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400" colSpan={4}>
                            No hay datos para el detalle.
                          </td>
                        </tr>
                      ) : (
                        directorPerformance.subject_detail.students_rows.map((r) => (
                          <tr
                            key={r.enrollment_id}
                            className={
                              r.failed
                                ? 'bg-red-50 hover:bg-red-100 dark:bg-red-950/25 dark:hover:bg-red-950/35'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                            }
                          >
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{r.student_name}</td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">
                              {(r.grade_name || '').trim() ? `${r.grade_name} - ${r.group_name}` : r.group_name || '—'}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{r.score}</td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">
                              {r.failed ? (
                                <Pill text="En riesgo" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900/50" />
                              ) : (
                                <Pill text="OK" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/40" />
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {directorSubtab === 'asignaturas' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Asignaturas (mejor promedio)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                        <thead className="bg-slate-50 dark:bg-slate-900">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Área</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Asignatura</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Est.</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Prom.</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Pérdida</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Celdas</th>
                        </tr>
                      </thead>
                        <tbody className="bg-white divide-y divide-slate-200 dark:bg-slate-900 dark:divide-slate-800">
                        {(directorPerformance?.subjects_by_average || []).length === 0 ? (
                          <tr>
                              <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400" colSpan={6}>
                              No hay datos académicos para mostrar.
                            </td>
                          </tr>
                        ) : (
                          (directorPerformance?.subjects_by_average || []).slice(0, 10).map((s) => (
                              <tr key={s.subject_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{s.area_name || '—'}</td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{s.subject_name}</td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{s.students}</td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">
                                <Pill text={s.average} className="bg-sky-50 text-sky-700 border-sky-200" />
                              </td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">
                                {(() => {
                                  const fr = Number(s.failure_rate)
                                  const t = toneForPct(Math.max(0, 100 - (isFinite(fr) ? fr : 0)))
                                  return <Pill text={`${s.failure_rate}%`} className={t.pill} />
                                })()}
                              </td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">
                                {s.gradebook_cells.filled} / {s.gradebook_cells.expected} ({pct(s.gradebook_cells.filled, s.gradebook_cells.expected)})
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Asignaturas (mayor pérdida)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                        <thead className="bg-slate-50 dark:bg-slate-900">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Área</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Asignatura</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Est.</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Prom.</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Pérdida</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Celdas</th>
                        </tr>
                      </thead>
                        <tbody className="bg-white divide-y divide-slate-200 dark:bg-slate-900 dark:divide-slate-800">
                        {(directorPerformance?.subjects_by_failure_rate || []).length === 0 ? (
                          <tr>
                              <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400" colSpan={6}>
                              No hay datos académicos para mostrar.
                            </td>
                          </tr>
                        ) : (
                          (directorPerformance?.subjects_by_failure_rate || []).slice(0, 10).map((s) => (
                              <tr key={s.subject_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{s.area_name || '—'}</td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{s.subject_name}</td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{s.students}</td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">
                                <Pill text={s.average} className="bg-sky-50 text-sky-700 border-sky-200" />
                              </td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">
                                  <Pill text={`${s.failure_rate}%`} className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900/50" />
                              </td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">
                                {s.gradebook_cells.filled} / {s.gradebook_cells.expected} ({pct(s.gradebook_cells.filled, s.gradebook_cells.expected)})
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {directorSubtab === 'estudiantes' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Mejores estudiantes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                    <thead className="bg-slate-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Estudiante</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Grupo</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Prom.</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Reprob.</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200 dark:bg-slate-900 dark:divide-slate-800">
                      {(directorPerformance?.top_students || []).length === 0 ? (
                        <tr>
                          <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400" colSpan={4}>
                            No hay datos de estudiantes.
                          </td>
                        </tr>
                      ) : (
                        (directorPerformance?.top_students || []).map((r) => (
                          <tr key={r.enrollment_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{r.student_name}</td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">
                              {(r.grade_name || '').trim() ? `${r.grade_name} - ${r.group_name}` : r.group_name || '—'}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">
                              <Pill text={r.average} className="bg-sky-50 text-sky-700 border-sky-200" />
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{r.failed_subjects}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Estudiantes en riesgo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                    <thead className="bg-slate-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Estudiante</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Grupo</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Prom.</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Reprob.</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200 dark:bg-slate-900 dark:divide-slate-800">
                      {(directorPerformance?.at_risk_students || []).length === 0 ? (
                        <tr>
                          <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400" colSpan={4}>
                            No hay estudiantes en riesgo con el umbral actual.
                          </td>
                        </tr>
                      ) : (
                        (directorPerformance?.at_risk_students || []).map((r) => (
                          <tr key={r.enrollment_id} className="bg-red-50 hover:bg-red-100 dark:bg-red-950/25 dark:hover:bg-red-950/35">
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{r.student_name}</td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">
                              {(r.grade_name || '').trim() ? `${r.grade_name} - ${r.group_name}` : r.group_name || '—'}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">
                              <Pill text={r.average} className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900/50" />
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{r.failed_subjects}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          ) : null}


          {directorSubtab === 'resumen' ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Totales</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Grupos</div>
                      <div className="text-slate-900 font-medium dark:text-slate-100">{director?.totals.groups ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Estudiantes (activos)</div>
                      <div className="text-slate-900 font-medium dark:text-slate-100">{director?.totals.students_active ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Casos convivencia</div>
                      <div className="text-slate-900 font-medium dark:text-slate-100">{director?.totals.discipline_cases_total ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Casos abiertos</div>
                      <div className="text-slate-900 font-medium dark:text-slate-100">{director?.totals.discipline_cases_open ?? 0}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Grupos a cargo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                        <thead className="bg-slate-50 dark:bg-slate-900">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Grado</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Grupo</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Estudiantes</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Casos</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Abiertos</th>
                        </tr>
                      </thead>
                        <tbody className="bg-white divide-y divide-slate-200 dark:bg-slate-900 dark:divide-slate-800">
                        {(director?.groups || []).length === 0 ? (
                          <tr>
                              <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400" colSpan={5}>
                              No tienes grupos asignados como director en este año.
                            </td>
                          </tr>
                        ) : (
                          (director?.groups || []).map((g) => (
                              <tr key={g.group_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{g.grade_name}</td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{g.group_name}</td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{g.students_active}</td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{g.discipline_cases_total}</td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{g.discipline_cases_open}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}

          {directorSubtab === 'ia' ? (
            <Card>
              <CardHeader>
                <CardTitle>Análisis IA (estado del grupo)</CardTitle>
              </CardHeader>
              <CardContent>
                {!canGenerateAI ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">Disponible solo si eres director(a) de grupo.</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button onClick={() => generateAI()} disabled={aiLoading || loadingStats}>
                        {aiLoading ? 'Generando…' : 'Generar análisis'}
                      </Button>
                      {aiText ? (
                        <>
                          <Button variant="outline" onClick={copyAI} disabled={aiLoading || loadingStats}>
                            Copiar
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => generateAI({ refresh: true })}
                            disabled={aiLoading || loadingStats}
                          >
                            Regenerar
                          </Button>
                          <Button variant="outline" onClick={() => downloadAIPdf()} disabled={aiLoading || loadingStats}>
                            Descargar PDF
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => downloadAIPdf({ refresh: true })}
                            disabled={aiLoading || loadingStats}
                          >
                            PDF (regenerar)
                          </Button>
                        </>
                      ) : null}
                      <div className="text-xs text-slate-500 dark:text-slate-400">Usa datos agregados (sin nombres).</div>
                    </div>

                    {aiNotice ? <div className="text-xs text-slate-600 dark:text-slate-300">{aiNotice}</div> : null}

                    {aiError ? (
                      <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3 dark:text-red-200 dark:bg-red-950/30 dark:border-red-900/50">{aiError}</div>
                    ) : null}

                    {aiText ? (
                      <div className="text-sm rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                        {renderAiAnalysis(aiText)}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500 dark:text-slate-400">Genera un resumen interpretativo con señales y recomendaciones.</div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
