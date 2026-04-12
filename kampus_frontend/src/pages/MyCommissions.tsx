import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Toast, type ToastType } from '../components/ui/Toast'
import { academicApi, type Commission, type CommissionDecision } from '../services/academic'

// ─── constants ────────────────────────────────────────────────────────────────

const DECISION_META: Record<string, { label: string; cls: string }> = {
  PENDING: {
    label: 'Pendiente',
    cls: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300',
  },
  COMMITMENT: {
    label: 'Compromiso',
    cls: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300',
  },
  FOLLOW_UP: {
    label: 'Seguimiento',
    cls: 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/40 dark:bg-purple-950/20 dark:text-purple-300',
  },
  CLOSED: {
    label: 'Cerrado',
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300',
  },
}

const RISK_COLORS = ['#f43f5e', '#10b981']

// ─── helpers ──────────────────────────────────────────────────────────────────

function getInitials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

// ─── custom recharts tooltip ──────────────────────────────────────────────────

interface TooltipPayload {
  name?: string
  value?: number
  color?: string
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null
  const entry = payload[0] as TooltipPayload & { payload?: { fullName?: string } }
  const fullName = entry.payload?.fullName
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-700 dark:bg-slate-800">
      {fullName && (
        <p className="mb-1 font-semibold text-slate-800 dark:text-slate-100">{fullName}</p>
      )}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

// ─── student card ─────────────────────────────────────────────────────────────

interface StudentCardProps {
  decision: CommissionDecision
  onDownloadActa: (id: number) => void
  loadingActa: boolean
}

function StudentCard({ decision, onDownloadActa, loadingActa }: StudentCardProps) {
  const meta = DECISION_META[decision.decision] ?? DECISION_META.PENDING
  const isRisk = decision.is_flagged
  const failedSubjects = decision.failed_subjects_count ?? 0
  const failedAreas = decision.failed_areas_count ?? 0

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-slate-900 ${
        isRisk
          ? 'ring-1 ring-rose-200 dark:ring-rose-900/50'
          : 'ring-1 ring-slate-200 dark:ring-slate-800'
      }`}
    >
      {/* Photo banner */}
      <div
        className={`relative flex h-36 items-end justify-between px-4 pb-3 ${
          isRisk
            ? 'bg-gradient-to-br from-rose-100 to-rose-50 dark:from-rose-950/60 dark:to-slate-900'
            : 'bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950/60 dark:to-slate-900'
        }`}
      >
        {/* Centered photo / initials */}
        <div className="absolute inset-x-0 top-4 flex justify-center">
          {decision.student_photo_url ? (
            <img
              src={decision.student_photo_url}
              alt={decision.student_name ?? ''}
              className={`h-20 w-20 rounded-full object-cover shadow-md ring-4 ${
                isRisk
                  ? 'ring-rose-200 dark:ring-rose-900/60'
                  : 'ring-white dark:ring-slate-800'
              }`}
            />
          ) : (
            <div
              className={`flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold shadow-md ring-4 ${
                isRisk
                  ? 'bg-rose-200 text-rose-700 ring-rose-100 dark:bg-rose-900/60 dark:text-rose-300 dark:ring-rose-950'
                  : 'bg-slate-200 text-slate-500 ring-white dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-800'
              }`}
            >
              {getInitials(decision.student_name)}
            </div>
          )}
        </div>

        {/* Risk badge — top right */}
        <div className="absolute right-3 top-3">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow-sm ${
              isRisk
                ? 'bg-rose-500 text-white'
                : 'bg-emerald-500 text-white'
            }`}
          >
            {isRisk ? '⚠ Riesgo' : '✓ OK'}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
        {/* Name & doc */}
        <div className="text-center">
          <p className="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
            {decision.student_name ?? '—'}
          </p>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {decision.student_document ?? '—'}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div
            className={`rounded-xl px-1 py-2.5 text-center ${
              failedSubjects > 0
                ? 'bg-rose-50 dark:bg-rose-950/30'
                : 'bg-slate-50 dark:bg-slate-800/40'
            }`}
          >
            <p
              className={`text-xl font-bold leading-none ${
                failedSubjects > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-300 dark:text-slate-600'
              }`}
            >
              {failedSubjects}
            </p>
            <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Asignat.
            </p>
          </div>

          <div
            className={`rounded-xl px-1 py-2.5 text-center ${
              failedAreas > 0
                ? 'bg-amber-50 dark:bg-amber-950/30'
                : 'bg-slate-50 dark:bg-slate-800/40'
            }`}
          >
            <p
              className={`text-xl font-bold leading-none ${
                failedAreas > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-300 dark:text-slate-600'
              }`}
            >
              {failedAreas}
            </p>
            <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Áreas
            </p>
          </div>

          <div
            className={`rounded-xl px-1 py-2.5 text-center ${
              decision.acta_id
                ? 'bg-emerald-50 dark:bg-emerald-950/30'
                : 'bg-slate-50 dark:bg-slate-800/40'
            }`}
          >
            <p
              className={`text-xl font-bold leading-none ${
                decision.acta_id
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-300 dark:text-slate-600'
              }`}
            >
              {decision.acta_id ? '✓' : '—'}
            </p>
            <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Acta
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.cls}`}>
            {meta.label}
          </span>

          {decision.acta_id ? (
            <button
              type="button"
              disabled={loadingActa}
              onClick={() => onDownloadActa(decision.id)}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {loadingActa ? (
                <span className="opacity-70">Generando…</span>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    className="h-3.5 w-3.5"
                  >
                    <path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z" />
                    <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
                  </svg>
                  Descargar acta
                </>
              )}
            </button>
          ) : (
            <span className="text-xs text-slate-300 dark:text-slate-600">Sin acta</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── types ────────────────────────────────────────────────────────────────────

type ViewState = 'list' | 'decisions'

// ─── main component ───────────────────────────────────────────────────────────

export default function MyCommissions() {
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCommission, setSelectedCommission] = useState<Commission | null>(null)
  const [decisions, setDecisions] = useState<CommissionDecision[]>([])
  const [loadingDecisions, setLoadingDecisions] = useState(false)
  const [downloadingZip, setDownloadingZip] = useState(false)
  const [downloadingGroupActa, setDownloadingGroupActa] = useState(false)
  const [downloadingDecisionActa, setDownloadingDecisionActa] = useState<number | null>(null)
  const [view, setView] = useState<ViewState>('list')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterFlagged, setFilterFlagged] = useState<boolean | null>(null)
  const [filterHasActa, setFilterHasActa] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  // ── data loading ─────────────────────────────────────────────────────────

  const loadCommissions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await academicApi.listTeacherCommissions()
      setCommissions(res.data)
    } catch {
      showToast('No se pudieron cargar las comisiones', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCommissions()
  }, [loadCommissions])

  const handleOpenDecisions = async (commission: Commission) => {
    setSelectedCommission(commission)
    setView('decisions')
    setLoadingDecisions(true)
    setSearchTerm('')
    setFilterFlagged(null)
    setFilterHasActa(false)
    try {
      const res = await academicApi.listTeacherCommissionDecisions(commission.id)
      setDecisions(res.data)
    } catch {
      showToast('No se pudieron cargar las decisiones', 'error')
    } finally {
      setLoadingDecisions(false)
    }
  }

  const handleBack = () => {
    setView('list')
    setSelectedCommission(null)
    setDecisions([])
  }

  // ── downloads ─────────────────────────────────────────────────────────────

  const handleDownloadZip = async () => {
    if (!selectedCommission) return
    setDownloadingZip(true)
    try {
      const res = await academicApi.downloadTeacherCommissionActasZip(selectedCommission.id)
      downloadBlob(res.data, `actas-comision-${selectedCommission.id}.zip`)
      showToast('ZIP descargado correctamente', 'success')
    } catch {
      showToast('No hay actas completadas disponibles para descargar', 'error')
    } finally {
      setDownloadingZip(false)
    }
  }

  const handleDownloadGroupActa = async () => {
    if (!selectedCommission) return
    setDownloadingGroupActa(true)
    try {
      const res = await academicApi.downloadTeacherCommissionGroupActa(selectedCommission.id)
      downloadBlob(res.data, `acta-grupal-comision-${selectedCommission.id}.pdf`)
      showToast('Acta grupal descargada', 'success')
    } catch {
      showToast('No fue posible generar el acta grupal', 'error')
    } finally {
      setDownloadingGroupActa(false)
    }
  }

  const handleDownloadDecisionActa = async (decisionId: number) => {
    if (!selectedCommission) return
    setDownloadingDecisionActa(decisionId)
    try {
      const res = await academicApi.downloadTeacherCommissionDecisionActa(
        selectedCommission.id,
        decisionId,
      )
      const d = decisions.find((x) => x.id === decisionId)
      const name = d?.student_name?.replace(/\s+/g, '_') ?? `decision-${decisionId}`
      downloadBlob(res.data, `acta_${name}.pdf`)
    } catch {
      showToast('No fue posible generar el acta individual', 'error')
    } finally {
      setDownloadingDecisionActa(null)
    }
  }

  // ── derived values ────────────────────────────────────────────────────────

  const flaggedCount = useMemo(() => decisions.filter((d) => d.is_flagged).length, [decisions])
  const actaCount = useMemo(() => decisions.filter((d) => d.acta_id).length, [decisions])
  const pendingCount = useMemo(
    () => decisions.filter((d) => d.is_flagged && d.decision === 'PENDING').length,
    [decisions],
  )

  const filteredDecisions = useMemo(() => {
    return decisions.filter((d) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        if (
          !d.student_name?.toLowerCase().includes(q) &&
          !d.student_document?.toLowerCase().includes(q)
        )
          return false
      }
      if (filterFlagged !== null && d.is_flagged !== filterFlagged) return false
      if (filterHasActa && !d.acta_id) return false
      return true
    })
  }, [decisions, searchTerm, filterFlagged, filterHasActa])

  const riskChartData = useMemo(
    () => [
      { name: 'En riesgo', value: flaggedCount },
      { name: 'Sin riesgo', value: decisions.length - flaggedCount },
    ],
    [decisions.length, flaggedCount],
  )

  const topRiskData = useMemo(() => {
    return [...decisions]
      .filter((d) => d.is_flagged)
      .sort((a, b) => (b.failed_subjects_count ?? 0) - (a.failed_subjects_count ?? 0))
      .slice(0, 8)
      .map((d, i) => ({
        name: String(i + 1),
        fullName: d.student_name ?? `#${d.id}`,
        materias: d.failed_subjects_count ?? 0,
      }))
  }, [decisions])

  const honorStudents = useMemo(() => {
    // Mirror backend logic: sort by average DESC, then failed_subjects_count ASC, then name ASC
    return [...decisions]
      .filter((d) => d.average != null)
      .sort(
        (a, b) =>
          (b.average ?? 0) - (a.average ?? 0) ||
          (a.failed_subjects_count ?? 0) - (b.failed_subjects_count ?? 0) ||
          (a.student_name ?? '').localeCompare(b.student_name ?? ''),
      )
      .slice(0, 2)
  }, [decisions])

  // ── decisions view ────────────────────────────────────────────────────────

  if (view === 'decisions' && selectedCommission) {
    const riskPct =
      decisions.length > 0 ? Math.round((flaggedCount / decisions.length) * 100) : 0
    const isEval = selectedCommission.commission_type === 'EVALUATION'

    return (
      <div className="space-y-5">
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={() => setToast((p) => ({ ...p, isVisible: false }))}
        />

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <button
              type="button"
              onClick={handleBack}
              className="mb-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              ← Mis comisiones
            </button>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {[selectedCommission.grade_name, selectedCommission.group_name].filter(Boolean).join(' ') || 'Grupo'} —{' '}
              {isEval ? 'Evaluación' : 'Promoción'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {selectedCommission.period_name ?? 'Ciclo anual'} · Comisión #
              {selectedCommission.id}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isEval && (
              <Button
                variant="outline"
                size="sm"
                disabled={downloadingGroupActa}
                onClick={() => void handleDownloadGroupActa()}
                className="min-h-9"
              >
                {downloadingGroupActa ? 'Generando…' : '📄 Acta grupal'}
              </Button>
            )}
            <Button
              size="sm"
              disabled={downloadingZip || actaCount === 0}
              onClick={() => void handleDownloadZip()}
              className="min-h-9"
              title={actaCount === 0 ? 'No hay actas generadas' : `Descargar ${actaCount} actas`}
            >
              {downloadingZip ? 'Comprimiendo…' : `↓ ZIP (${actaCount})`}
            </Button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Estudiantes</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {decisions.length}
            </p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/40 px-4 py-3 dark:border-rose-900/40 dark:bg-rose-950/20">
            <p className="text-xs text-rose-600 dark:text-rose-400">En riesgo</p>
            <p className="mt-1 text-2xl font-bold text-rose-700 dark:text-rose-300">
              {flaggedCount}
              <span className="ml-1 text-sm font-normal text-rose-500 dark:text-rose-400">
                ({riskPct}%)
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Actas generadas</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {actaCount}
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
            <p className="text-xs text-amber-600 dark:text-amber-400">Pendientes</p>
            <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-300">
              {pendingCount}
            </p>
          </div>
        </div>

        {/* Charts */}
        {decisions.length > 0 && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Donut: risk distribution */}
            <div className="rounded-xl border border-slate-200 p-5 dark:border-slate-800">
              <p className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
                Distribución de riesgo
              </p>
              <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
                Del total de {decisions.length} estudiantes en esta comisión
              </p>

              <div className="flex items-center gap-6">
                {/* Donut with center label */}
                <div className="relative flex-shrink-0">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie
                        data={riskChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={46}
                        outerRadius={66}
                        paddingAngle={3}
                        startAngle={90}
                        endAngle={-270}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {riskChartData.map((_entry, index) => (
                          <Cell key={index} fill={RISK_COLORS[index % RISK_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center text overlay */}
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold leading-none text-rose-600 dark:text-rose-400">
                      {flaggedCount}
                    </span>
                    <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      en riesgo
                    </span>
                  </div>
                </div>

                {/* Legend with real numbers */}
                <div className="flex flex-1 flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 flex-shrink-0 rounded-full bg-rose-500" />
                      <span className="text-sm text-slate-600 dark:text-slate-400">En riesgo</span>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-bold text-rose-600 dark:text-rose-400">{flaggedCount}</span>
                      <span className="ml-1 text-xs text-slate-400">
                        ({decisions.length > 0 ? Math.round((flaggedCount / decisions.length) * 100) : 0}%)
                      </span>
                    </div>
                  </div>

                  <div className="h-px bg-slate-100 dark:bg-slate-800" />

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 flex-shrink-0 rounded-full bg-emerald-500" />
                      <span className="text-sm text-slate-600 dark:text-slate-400">Sin riesgo</span>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                        {decisions.length - flaggedCount}
                      </span>
                      <span className="ml-1 text-xs text-slate-400">
                        ({decisions.length > 0 ? Math.round(((decisions.length - flaggedCount) / decisions.length) * 100) : 0}%)
                      </span>
                    </div>
                  </div>

                  <div className="h-px bg-slate-100 dark:bg-slate-800" />

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-400 dark:text-slate-500">Actas generadas</span>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {actaCount} / {flaggedCount}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bar: top at-risk students */}
            {topRiskData.length > 0 && (
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Top estudiantes en riesgo (materias)
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={topRiskData}
                    layout="vertical"
                    margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={false}
                      width={4}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="materias" fill="#f43f5e" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Honor roll */}
        {honorStudents.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-amber-200 bg-linear-to-r from-amber-50 to-yellow-50 dark:border-amber-800/40 dark:from-amber-950/30 dark:to-yellow-950/20">
            <div className="flex items-center gap-2 border-b border-amber-200/60 px-5 py-3 dark:border-amber-800/30">
              <span className="text-base">🏆</span>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Cuadro de honor</p>
              <p className="ml-1 text-xs text-amber-600/70 dark:text-amber-500/70">Mejor desempeño en esta comisión</p>
            </div>
            <div className="grid grid-cols-1 divide-y divide-amber-200/50 sm:grid-cols-2 sm:divide-x sm:divide-y-0 dark:divide-amber-800/30">
              {honorStudents.map((d, i) => (
                <div key={d.id} className="flex items-center gap-4 px-5 py-4">
                  {/* Medal */}
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl font-black shadow-inner ${
                      i === 0
                        ? 'bg-amber-400 text-white dark:bg-amber-500'
                        : 'bg-slate-300 text-white dark:bg-slate-600'
                    }`}
                  >
                    {i === 0 ? '①' : '②'}
                  </div>

                  {/* Photo / initials */}
                  {d.student_photo_url ? (
                    <img
                      src={d.student_photo_url}
                      alt={d.student_name ?? ''}
                      className="h-12 w-12 shrink-0 rounded-full object-cover shadow ring-2 ring-amber-300 dark:ring-amber-700"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-200 text-sm font-bold text-amber-800 shadow ring-2 ring-amber-300 dark:bg-amber-900/60 dark:text-amber-200 dark:ring-amber-700">
                      {getInitials(d.student_name)}
                    </div>
                  )}

                  {/* Info */}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {d.student_name ?? '—'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {d.student_document ?? '—'}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      {d.average != null && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                          ⌀ {d.average.toFixed(1)}
                        </span>
                      )}
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        ✓ Sin riesgo
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        {decisions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Buscar estudiante…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
            />
            <button
              type="button"
              onClick={() => setFilterFlagged(filterFlagged === true ? null : true)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filterFlagged === true
                  ? 'border-rose-500 bg-rose-500 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-rose-300 hover:text-rose-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              Solo en riesgo
            </button>
            <button
              type="button"
              onClick={() => setFilterFlagged(filterFlagged === false ? null : false)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filterFlagged === false
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              Sin riesgo
            </button>
            <button
              type="button"
              onClick={() => setFilterHasActa(!filterHasActa)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filterHasActa
                  ? 'border-blue-500 bg-blue-500 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              Con acta
            </button>
            {(searchTerm || filterFlagged !== null || filterHasActa) && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('')
                  setFilterFlagged(null)
                  setFilterHasActa(false)
                }}
                className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              >
                ✕ Limpiar
              </button>
            )}
            <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
              {filteredDecisions.length} de {decisions.length}
            </span>
          </div>
        )}

        {/* Student grid */}
        {loadingDecisions ? (
          <p className="py-8 text-center text-sm text-slate-500">Cargando estudiantes…</p>
        ) : decisions.length === 0 ? (
          <div className="rounded-xl border border-slate-200 py-10 text-center dark:border-slate-800">
            <p className="text-sm text-slate-500">No hay decisiones registradas en esta comisión.</p>
          </div>
        ) : filteredDecisions.length === 0 ? (
          <div className="rounded-xl border border-slate-200 py-8 text-center dark:border-slate-800">
            <p className="text-sm text-slate-500">Ningún estudiante coincide con los filtros.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredDecisions.map((decision) => (
              <StudentCard
                key={decision.id}
                decision={decision}
                onDownloadActa={(id) => void handleDownloadDecisionActa(id)}
                loadingActa={downloadingDecisionActa === decision.id}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── list view ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((p) => ({ ...p, isVisible: false }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Mis comisiones</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
            Comisiones cerradas de los grupos que diriges. Consulta los resultados y descarga las
            actas individuales en un solo ZIP.
          </p>

          {loading ? (
            <p className="text-sm text-slate-500">Cargando comisiones…</p>
          ) : commissions.length === 0 ? (
            <div className="rounded-xl border border-slate-200 px-4 py-8 text-center dark:border-slate-800">
              <p className="text-sm text-slate-500">
                No tienes comisiones cerradas asignadas a tus grupos.
              </p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Las comisiones aparecen aquí cuando el coordinador las cierra y tú eres director
                del grupo.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-3 xl:hidden">
                {commissions.map((commission) => (
                  <div
                    key={commission.id}
                    className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          #{commission.id} ·{' '}
                          {commission.commission_type === 'EVALUATION' ? 'Evaluación' : 'Promoción'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {commission.period_name ?? 'Ciclo anual'} · Grupo:{' '}
                          {commission.group_name ?? 'Todos'}
                        </p>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
                        Cerrada
                      </span>
                    </div>
                    <div className="mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-10 w-full"
                        onClick={() => void handleOpenDecisions(commission)}
                      >
                        Ver resultados y actas
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 xl:block">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/60">
                    <tr className="text-left text-slate-600 dark:text-slate-300">
                      <th className="px-4 py-2.5 font-medium">#</th>
                      <th className="px-4 py-2.5 font-medium">Tipo</th>
                      <th className="px-4 py-2.5 font-medium">Grupo</th>
                      <th className="px-4 py-2.5 font-medium">Periodo</th>
                      <th className="px-4 py-2.5 font-medium">Estado</th>
                      <th className="px-4 py-2.5 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissions.map((commission) => (
                      <tr
                        key={commission.id}
                        className="border-t border-slate-200 dark:border-slate-800"
                      >
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                          #{commission.id}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                          {commission.commission_type === 'EVALUATION' ? 'Evaluación' : 'Promoción'}
                        </td>
                        <td className="px-4 py-2.5">{commission.group_name ?? '—'}</td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                          {commission.period_name ?? 'Ciclo anual'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
                            Cerrada
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleOpenDecisions(commission)}
                          >
                            Ver resultados y actas
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

