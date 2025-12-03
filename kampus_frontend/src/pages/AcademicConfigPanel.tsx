import { type FormEvent, useEffect, useState } from 'react'
import { academicApi } from '../services/academic'
import type { AcademicYear, Grade, Period, Area, Subject, Group, EvaluationScale } from '../services/academic'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'

export default function AcademicConfigPanel() {
  const [activeTab, setActiveTab] = useState<'general' | 'curriculum' | 'organization' | 'evaluation'>('general')
  
  // Data states
  const [years, setYears] = useState<AcademicYear[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [scales, setScales] = useState<EvaluationScale[]>([])

  // Form states
  const [yearInput, setYearInput] = useState('')
  const [gradeInput, setGradeInput] = useState('')
  const [areaInput, setAreaInput] = useState('')
  
  // Loading state
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [y, p, g, a, s, gr, sc] = await Promise.all([
        academicApi.listYears(),
        academicApi.listPeriods(),
        academicApi.listGrades(),
        academicApi.listAreas(),
        academicApi.listSubjects(),
        academicApi.listGroups(),
        academicApi.listEvaluationScales()
      ])
      setYears(y.data)
      setPeriods(p.data)
      setGrades(g.data)
      setAreas(a.data)
      setSubjects(s.data)
      setGroups(gr.data)
      setScales(sc.data)
    } catch (error) {
      console.error("Failed to load data", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const onAddYear = async (e: FormEvent) => {
    e.preventDefault()
    const y = parseInt(yearInput, 10)
    if (!y) return
    await academicApi.createYear(y)
    setYearInput('')
    await load()
  }

  const onAddGrade = async (e: FormEvent) => {
    e.preventDefault()
    if (!gradeInput.trim()) return
    await academicApi.createGrade(gradeInput.trim())
    setGradeInput('')
    await load()
  }

  const onAddArea = async (e: FormEvent) => {
    e.preventDefault()
    if (!areaInput.trim()) return
    await academicApi.createArea({ name: areaInput.trim(), description: '' })
    setAreaInput('')
    await load()
  }

  if (loading) {
    return <div className="p-6 text-slate-500">Cargando configuración...</div>
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Configuración Académica</h2>
        <Button onClick={load} variant="outline" size="sm">Actualizar</Button>
      </div>

      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-fit">
        {(['general', 'curriculum', 'organization', 'evaluation'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab 
                ? 'bg-white text-slate-900 shadow-sm' 
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {tab === 'general' && 'General'}
            {tab === 'curriculum' && 'Plan de Estudios'}
            {tab === 'organization' && 'Organización'}
            {tab === 'evaluation' && 'Evaluación (SIEE)'}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Años Lectivos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={onAddYear} className="flex gap-2">
                <Input
                  placeholder="Ej: 2025"
                  value={yearInput}
                  onChange={(e) => setYearInput(e.target.value)}
                  type="number"
                />
                <Button type="submit">Agregar</Button>
              </form>
              <div className="space-y-2">
                {years.map((y) => (
                  <div key={y.id} className="p-2 bg-slate-50 rounded border flex justify-between">
                    <span className="font-medium">{y.year}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Periodos Académicos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {periods.length === 0 && <p className="text-slate-500 text-sm">No hay periodos configurados.</p>}
                {periods.map((p) => (
                  <div key={p.id} className="p-2 bg-slate-50 rounded border">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.start_date} - {p.end_date}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Grados / Niveles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={onAddGrade} className="flex gap-2">
                <Input
                  placeholder="Ej: Noveno"
                  value={gradeInput}
                  onChange={(e) => setGradeInput(e.target.value)}
                />
                <Button type="submit">Agregar</Button>
              </form>
              <div className="grid grid-cols-2 gap-2">
                {grades.map((g) => (
                  <div key={g.id} className="p-2 bg-slate-50 rounded border text-center">
                    {g.name}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'curriculum' && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Áreas de Conocimiento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={onAddArea} className="flex gap-2">
                <Input
                  placeholder="Ej: Ciencias Naturales"
                  value={areaInput}
                  onChange={(e) => setAreaInput(e.target.value)}
                />
                <Button type="submit">Agregar</Button>
              </form>
              <div className="space-y-2">
                {areas.map((a) => (
                  <div key={a.id} className="p-2 bg-slate-50 rounded border">
                    {a.name}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Asignaturas (Malla Curricular)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {subjects.map((s) => (
                  <div key={s.id} className="p-2 bg-slate-50 rounded border flex justify-between items-center">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-slate-500">{s.area_name} • {s.grade_name}</div>
                    </div>
                    <div className="text-xs font-bold bg-slate-200 px-2 py-1 rounded">
                      {s.weight_percentage}%
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'organization' && (
        <div className="grid md:grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Grupos y Directores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {groups.map((g) => (
                  <div key={g.id} className="p-4 bg-white border rounded-lg shadow-sm">
                    <div className="text-lg font-bold text-slate-800">{g.grade_name} - {g.name}</div>
                    <div className="text-sm text-slate-500 mt-1">
                      Director: {g.director_name || 'Sin asignar'}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'evaluation' && (
        <div className="grid md:grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Escala de Valoración (SIEE)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {scales.length === 0 && <p className="text-slate-500 text-sm">No hay escala configurada.</p>}
                {scales.map((s) => (
                  <div key={s.id} className="p-3 bg-slate-50 rounded border flex justify-between items-center">
                    <span className="font-bold text-lg">{s.name}</span>
                    <span className="text-slate-600 bg-slate-200 px-3 py-1 rounded-full text-sm">
                      {s.min_score} - {s.max_score}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

