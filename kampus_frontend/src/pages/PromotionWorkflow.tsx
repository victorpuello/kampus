import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Toast, type ToastType } from '../components/ui/Toast'
import { ConfirmationModal } from '../components/ui/ConfirmationModal'
import { academicApi, type AcademicYear, type Grade, type Group, type PromotionDecision, type PromotionPreviewResponse } from '../services/academic'
import { useAuthStore } from '../store/auth'

type ApiErrorShape = {
  response?: {
    data?: {
      detail?: unknown
    }
  }
}

function parseErrorMessage(e: unknown, fallback: string) {
  const err = e as ApiErrorShape
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  return fallback
}

export default function PromotionWorkflow() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const blocked = user?.role === 'TEACHER' || user?.role === 'PARENT' || user?.role === 'STUDENT'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [years, setYears] = useState<AcademicYear[]>([])
  const [grades, setGrades] = useState<Grade[]>([])

  const [sourceYearId, setSourceYearId] = useState<number | ''>('')
  const [targetYearId, setTargetYearId] = useState<number | ''>('')
  const [passingScore, setPassingScore] = useState('')
  const [sourceGradeId, setSourceGradeId] = useState<number | ''>('')
  const [excludeRepeated, setExcludeRepeated] = useState(true)
  const [selectedEnrollmentIds, setSelectedEnrollmentIds] = useState<number[]>([])

  const [targetGroups, setTargetGroups] = useState<Group[]>([])
  const [targetGroupId, setTargetGroupId] = useState<number | ''>('')

  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState<PromotionPreviewResponse | null>(null)

  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'CLOSE' | 'APPLY' | null>(null)

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const loadYears = async () => {
    setLoading(true)
    setError(null)
    try {
      const [yearsRes, gradesRes] = await Promise.all([academicApi.listYears(), academicApi.listGrades()])
      const ys = yearsRes.data || []
      setYears(ys)
      setGrades(gradesRes.data || [])

      const active = ys.find((y) => y.status === 'ACTIVE')
      if (active && sourceYearId === '') {
        setSourceYearId(active.id)
      }

      const planning = ys.find((y) => y.status === 'PLANNING')
      if (planning && targetYearId === '') {
        setTargetYearId(planning.id)
      }
    } catch (e) {
      console.error(e)
      setError('No se pudo cargar los años académicos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (blocked) return
    loadYears()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked])

  const summary = useMemo(() => {
    const res = preview?.results || []
    const byDecision: Record<string, number> = {}
    for (const item of res) {
      byDecision[item.decision] = (byDecision[item.decision] || 0) + 1
    }
    return {
      total: res.length,
      byDecision,
    }
  }, [preview])

  const filteredGrades = useMemo(() => {
    return (grades || []).slice().sort((a, b) => {
      const ao = typeof a.ordinal === 'number' ? a.ordinal : 999
      const bo = typeof b.ordinal === 'number' ? b.ordinal : 999
      if (ao !== bo) return ao - bo
      return String(a.name || '').localeCompare(String(b.name || ''))
    })
  }, [grades])

  const applySelectionDefaults = (p: PromotionPreviewResponse | null, nextExcludeRepeated: boolean) => {
    if (!p) {
      setSelectedEnrollmentIds([])
      return
    }
    const ids = (p.results || [])
      .filter((r) => !nextExcludeRepeated || r.decision !== 'REPEATED')
      .filter((r) => r.decision !== 'GRADUATED')
      .map((r) => r.enrollment_id)
    setSelectedEnrollmentIds(ids)
  }

  const canPreview = typeof sourceYearId === 'number'
  const canClose = typeof sourceYearId === 'number'
  const canApply = typeof sourceYearId === 'number' && typeof targetYearId === 'number' && sourceYearId !== targetYearId

  const runPreview = async () => {
    if (!canPreview) return

    setPreviewLoading(true)
    setPreview(null)
    try {
      const params: Record<string, unknown> = {}
      if (passingScore.trim()) params.passing_score = passingScore.trim()
      if (typeof sourceGradeId === 'number') params.grade_id = sourceGradeId

      const res = await academicApi.promotionPreview(sourceYearId, params)
      setPreview(res.data)
      applySelectionDefaults(res.data, excludeRepeated)
      setTargetGroups([])
      setTargetGroupId('')
      showToast('Previsualización generada', 'success')
    } catch (e) {
      console.error(e)
      showToast(parseErrorMessage(e, 'No se pudo generar la previsualización'), 'error')
    } finally {
      setPreviewLoading(false)
    }
  }

  const openCloseConfirm = () => {
    setConfirmAction('CLOSE')
    setConfirmOpen(true)
  }

  const openApplyConfirm = () => {
    if (!preview) {
      showToast('Primero genera la previsualización', 'error')
      return
    }
    if (selectedEnrollmentIds.length === 0) {
      showToast('Selecciona al menos una matrícula para aplicar', 'error')
      return
    }
    if (targetGroups.length > 1 && typeof targetGroupId !== 'number') {
      showToast('Selecciona el grupo destino para aplicar', 'error')
      return
    }
    setConfirmAction('APPLY')
    setConfirmOpen(true)
  }

  const confirm = async () => {
    if (!confirmAction) return

    setConfirmLoading(true)
    try {
      if (confirmAction === 'CLOSE') {
        if (!canClose) return
        const data = passingScore.trim() ? { passing_score: passingScore.trim() } : undefined
        const res = await academicApi.closeWithPromotion(sourceYearId, data)
        showToast(`Año ${res.data.academic_year.year} cerrado. Snapshots: +${res.data.snapshots.created} / ~${res.data.snapshots.updated}`, 'success')
        await loadYears()
      } else {
        if (!canApply) return
        const res = await academicApi.applyPromotions(sourceYearId, {
          target_academic_year: targetYearId as number,
          passing_score: passingScore.trim() ? passingScore.trim() : undefined,
          enrollment_ids: selectedEnrollmentIds,
          source_grade_id: typeof sourceGradeId === 'number' ? sourceGradeId : undefined,
          exclude_repeated: excludeRepeated,
          target_group_id: typeof targetGroupId === 'number' ? targetGroupId : undefined,
        })
        const skippedRepeated = typeof res.data.skipped_repeated === 'number' ? res.data.skipped_repeated : 0
        showToast(
          `Promociones aplicadas: creadas ${res.data.created}. Saltadas: existentes ${res.data.skipped_existing}, graduados ${res.data.skipped_graduated}, sin ordinal ${res.data.skipped_missing_grade_ordinal}${excludeRepeated ? `, reprobados ${skippedRepeated}` : ''}`,
          'success'
        )
      }

      setConfirmOpen(false)
      setConfirmAction(null)
    } catch (e) {
      console.error(e)
      showToast(parseErrorMessage(e, 'No se pudo ejecutar la acción'), 'error')
    } finally {
      setConfirmLoading(false)
    }
  }

  const sourceYear = years.find((y) => y.id === sourceYearId) || null
  const targetYear = years.find((y) => y.id === targetYearId) || null

  const effectiveTargetGradeId = useMemo(() => {
    const res = preview?.results || []
    if (!res.length) return null
    const selected = new Set(selectedEnrollmentIds)
    const ids = new Set<number>()
    for (const r of res) {
      if (!selected.has(r.enrollment_id)) continue
      if (excludeRepeated && r.decision === 'REPEATED') continue
      const tg = r.target_grade_id
      if (typeof tg === 'number') ids.add(tg)
    }
    if (ids.size === 1) return Array.from(ids)[0]
    return null
  }, [preview, selectedEnrollmentIds, excludeRepeated])

  useEffect(() => {
    const loadTargetGroups = async () => {
      if (typeof targetYearId !== 'number') {
        setTargetGroups([])
        setTargetGroupId('')
        return
      }
      if (!effectiveTargetGradeId) {
        setTargetGroups([])
        setTargetGroupId('')
        return
      }
      try {
        const res = await academicApi.listGroups({ academic_year: targetYearId, grade: effectiveTargetGradeId })
        const gs = (res.data || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))
        setTargetGroups(gs)
        if (gs.length === 1) {
          setTargetGroupId(gs[0].id)
        } else {
          setTargetGroupId('')
        }
      } catch (e) {
        console.error(e)
        setTargetGroups([])
        setTargetGroupId('')
      }
    }
    loadTargetGroups()
  }, [targetYearId, effectiveTargetGradeId])

  const toggleEnrollment = (id: number) => {
    setSelectedEnrollmentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const selectAllFromPreview = () => {
    if (!preview) return
    applySelectionDefaults(preview, excludeRepeated)
  }

  const clearSelection = () => setSelectedEnrollmentIds([])

  const decisionLabel = (d: PromotionDecision) => {
    if (d === 'PROMOTED') return 'Promovido'
    if (d === 'CONDITIONAL') return 'Condicional (PAP)'
    if (d === 'REPEATED') return 'Reprobó (repite)'
    if (d === 'GRADUATED') return 'Graduado'
    return d
  }

  return (
    <div className="space-y-6">
      {blocked ? (
        <Card>
          <CardHeader>
            <CardTitle>Promoción anual (SIEE)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-600">No tienes permisos para acceder a Promoción anual.</p>
            <div className="mt-4">
              <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Promoción anual (SIEE)</CardTitle>
                <p className="text-sm text-slate-500 mt-1">Previsualizar → Cerrar año → Aplicar promociones al año destino</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate('/')}>Volver</Button>
                <Button variant="outline" onClick={loadYears} disabled={loading}>Refrescar</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-slate-600">Cargando…</div>
            ) : error ? (
              <div className="text-red-600">{error}</div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Año origen</label>
                    <select
                      value={sourceYearId}
                      onChange={(e) => setSourceYearId(e.target.value ? Number(e.target.value) : '')}
                      className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                    >
                      <option value="">Selecciona…</option>
                      {years
                        .slice()
                        .sort((a, b) => b.year - a.year)
                        .map((y) => (
                          <option key={y.id} value={y.id}>
                            {y.year} — {y.status_display || y.status}
                          </option>
                        ))}
                    </select>
                    {sourceYear ? (
                      <div className="text-xs text-slate-500 mt-1">Estado: {sourceYear.status_display || sourceYear.status}</div>
                    ) : null}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">Año destino (para aplicar)</label>
                    <select
                      value={targetYearId}
                      onChange={(e) => setTargetYearId(e.target.value ? Number(e.target.value) : '')}
                      className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                    >
                      <option value="">Selecciona…</option>
                      {years
                        .slice()
                        .sort((a, b) => b.year - a.year)
                        .map((y) => (
                          <option key={y.id} value={y.id}>
                            {y.year} — {y.status_display || y.status}
                          </option>
                        ))}
                    </select>
                    {targetYear ? (
                      <div className="text-xs text-slate-500 mt-1">Estado: {targetYear.status_display || targetYear.status}</div>
                    ) : null}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">Puntaje mínimo (opcional)</label>
                    <Input
                      placeholder="Ej: 3.0"
                      value={passingScore}
                      onChange={(e) => setPassingScore(e.target.value)}
                    />
                    <div className="text-xs text-slate-500 mt-1">Vacío = usa el valor por defecto del backend</div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">Filtrar por grado (opcional)</label>
                    <select
                      value={sourceGradeId}
                      onChange={(e) => {
                        const v = e.target.value
                        setSourceGradeId(v ? Number(v) : '')
                        setPreview(null)
                        setSelectedEnrollmentIds([])
                        setTargetGroups([])
                        setTargetGroupId('')
                      }}
                      className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                    >
                      <option value="">Todos</option>
                      {filteredGrades.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}{typeof g.ordinal === 'number' ? ` (ord ${g.ordinal})` : ''}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-slate-500 mt-1">Útil para pasar, por ejemplo, 10→11</div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">Grupo destino (opcional)</label>
                    {targetGroups.length === 0 ? (
                      <div className="text-xs text-slate-500 mt-2">
                        {typeof targetYearId === 'number' && effectiveTargetGradeId
                          ? 'No hay grupos para el grado destino (se creará sin grupo).'
                          : 'Genera previsualización y selecciona matrículas para detectar el grado destino.'}
                      </div>
                    ) : targetGroups.length === 1 ? (
                      <div className="text-xs text-slate-500 mt-2">Se asignará automáticamente: {targetGroups[0].name}</div>
                    ) : (
                      <select
                        value={targetGroupId}
                        onChange={(e) => setTargetGroupId(e.target.value ? Number(e.target.value) : '')}
                        className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                      >
                        <option value="">Selecciona…</option>
                        {targetGroups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {targetGroups.length > 1 ? (
                      <div className="text-xs text-slate-500 mt-1">Requerido si hay más de un grupo en el grado destino.</div>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="excludeRepeated"
                    type="checkbox"
                    checked={excludeRepeated}
                    onChange={(e) => {
                      const next = e.target.checked
                      setExcludeRepeated(next)
                      // Keep selection aligned with the rule
                      applySelectionDefaults(preview, next)
                    }}
                  />
                  <label htmlFor="excludeRepeated" className="text-sm text-slate-700">
                    Excluir reprobados (no crear matrícula para “REPEATED”)
                  </label>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={runPreview} disabled={!canPreview || previewLoading}>
                    {previewLoading ? 'Generando…' : 'Previsualizar'}
                  </Button>
                  <Button variant="destructive" onClick={openCloseConfirm} disabled={!canClose || confirmLoading}>
                    Cerrar año
                  </Button>
                  <Button onClick={openApplyConfirm} disabled={!canApply || confirmLoading}>
                    Aplicar promociones
                  </Button>
                </div>

                {preview ? (
                  <div className="space-y-3">
                    <div className="text-sm text-slate-600">
                      <span className="font-medium text-slate-900">Resumen:</span> {summary.total} matrícula(s)
                      {Object.keys(summary.byDecision).length > 0 ? (
                        <span> — {Object.entries(summary.byDecision).map(([k, v]) => `${k}: ${v}`).join(' | ')}</span>
                      ) : null}
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" onClick={selectAllFromPreview}>
                        Seleccionar según regla
                      </Button>
                      <Button variant="outline" onClick={clearSelection}>
                        Limpiar selección
                      </Button>
                      <div className="text-sm text-slate-600 flex items-center">
                        Seleccionadas: <span className="ml-1 font-medium text-slate-900">{selectedEnrollmentIds.length}</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Sel</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Estudiante</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Documento</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Grado</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Decisión</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Reprob. materias</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Reprob. áreas</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Áreas distintas</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                          {preview.results.map((r) => (
                            <tr key={r.enrollment_id} className="hover:bg-slate-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <input
                                  type="checkbox"
                                  checked={selectedEnrollmentIds.includes(r.enrollment_id)}
                                  onChange={() => toggleEnrollment(r.enrollment_id)}
                                  disabled={excludeRepeated && r.decision === 'REPEATED'}
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                                {r.student_name || `Matrícula #${r.enrollment_id}`}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                                {r.student_document_number || '—'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                                {r.grade_name || '—'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{decisionLabel(r.decision)}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{r.failed_subjects_count}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{r.failed_areas_count}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{r.failed_subjects_distinct_areas_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmationModal
        isOpen={confirmOpen}
        onClose={() => {
          if (!confirmLoading) setConfirmOpen(false)
        }}
        onConfirm={confirm}
        title={
          confirmAction === 'CLOSE'
            ? `Cerrar año ${sourceYear?.year ?? ''}`
            : confirmAction === 'APPLY'
              ? `Aplicar promociones a ${targetYear?.year ?? ''}`
              : 'Confirmar'
        }
        description={
          confirmAction === 'CLOSE'
            ? 'Esto guardará snapshots de promoción y cerrará el año. Requiere que todos los periodos estén cerrados.'
            : confirmAction === 'APPLY'
              ? 'Esto creará matrículas en el año destino usando los snapshots del año origen, para las matrículas seleccionadas.'
              : ''
        }
        confirmText="Confirmar"
        cancelText="Cancelar"
        variant={confirmAction === 'CLOSE' ? 'destructive' : 'default'}
        loading={confirmLoading}
      />

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((t) => ({ ...t, isVisible: false }))}
      />
    </div>
  )
}
