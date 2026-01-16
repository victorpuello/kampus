import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { academicApi, type AcademicYear, type Group } from '../../services/academic'
import { downloadAttendanceManualSheetPdf } from '../../services/attendance'

function formatGroupLabel(g: Group) {
  const grade = g.grade_name ? String(g.grade_name).trim() : ''
  const name = String(g.name || '').trim()
  const shift = g.shift ? String(g.shift).trim() : ''
  const base = grade ? `${grade}-${name}` : name
  return shift ? `${base} (${shift})` : base
}

export default function AttendanceManualSheets() {
  const [years, setYears] = useState<AcademicYear[]>([])
  const [groups, setGroups] = useState<Group[]>([])

  const [selectedYearId, setSelectedYearId] = useState<number | ''>('')
  const [selectedGroupId, setSelectedGroupId] = useState<number | ''>('')
  const [columns, setColumns] = useState(24)

  const [loading, setLoading] = useState(true)
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const yearsRes = await academicApi.listYears()
        if (!mounted) return
        setYears(yearsRes.data)

        const active = yearsRes.data.find((y) => y.status === 'ACTIVE')
        if (active) setSelectedYearId(active.id)
        else if (yearsRes.data[0]) setSelectedYearId(yearsRes.data[0].id)
      } catch (err) {
        console.error(err)
        if (mounted) setError('No se pudo cargar años académicos.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  const filteredGroups = useMemo(() => {
    const list = groups
      .slice()
      .sort((a, b) => formatGroupLabel(a).localeCompare(formatGroupLabel(b)))
    return list
  }, [groups])

  useEffect(() => {
    if (!selectedYearId) {
      setGroups([])
      setSelectedGroupId('')
      return
    }

    let mounted = true

    ;(async () => {
      setLoadingGroups(true)
      setError(null)
      try {
        const res = await academicApi.listGroups({ academic_year: selectedYearId })
        if (!mounted) return
        setGroups(res.data)

        // Pick a sensible default.
        if (res.data.length && !selectedGroupId) {
          setSelectedGroupId(res.data[0].id)
        }
      } catch (err) {
        console.error(err)
        if (mounted) setError('No se pudo cargar los grupos.')
      } finally {
        if (mounted) setLoadingGroups(false)
      }
    })()

    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYearId])

  const handleDownload = async () => {
    setError(null)

    if (!selectedGroupId) {
      setError('Selecciona un grupo.')
      return
    }

    const cols = Math.max(1, Math.min(40, Number(columns) || 24))

    setDownloading(true)
    try {
      const blob = await downloadAttendanceManualSheetPdf({ group_id: Number(selectedGroupId), columns: cols })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      console.error(err)
      setError('No se pudo generar la planilla. Verifica permisos o conexión.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Planillas de asistencia (manual / imprimible)</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-slate-600 dark:text-slate-300">Cargando…</p>
        ) : (
          <div className="space-y-4">
            {error ? (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-rose-950/30 dark:text-rose-200">
                {error}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Año académico</label>
                <select
                  className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                  value={selectedYearId}
                  onChange={(e) => setSelectedYearId(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">Selecciona…</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.year} {y.status === 'ACTIVE' ? '(Activo)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Grupo</label>
                <select
                  className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value ? Number(e.target.value) : '')}
                  disabled={loadingGroups}
                >
                  <option value="">Selecciona…</option>
                  {filteredGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {formatGroupLabel(g)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Columnas (inasistencias)</label>
                <Input
                  type="number"
                  min={1}
                  max={40}
                  value={columns}
                  onChange={(e) => setColumns(Number(e.target.value) || 24)}
                />
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Por defecto: 24</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleDownload} disabled={downloading || !selectedGroupId}>
                {downloading ? 'Generando…' : 'Descargar PDF'}
              </Button>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Se abre en una nueva pestaña para imprimir.
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
