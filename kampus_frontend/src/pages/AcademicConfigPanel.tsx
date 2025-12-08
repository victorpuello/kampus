import { type FormEvent, useEffect, useState } from 'react'
import { academicApi } from '../services/academic'
import { coreApi, type Institution, type Campus } from '../services/core'
import { usersApi, type User } from '../services/users'
import type { AcademicYear, Grade, Period, Area, Subject, Group, EvaluationScale, AcademicLevel } from '../services/academic'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { ConfirmationModal } from '../components/ui/ConfirmationModal'
import { Toast, type ToastType } from '../components/ui/Toast'

export default function AcademicConfigPanel() {
  const [activeTab, setActiveTab] = useState<'general' | 'institution' | 'curriculum' | 'organization' | 'evaluation'>('general')
  
  // Data states
  const [years, setYears] = useState<AcademicYear[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [levels, setLevels] = useState<AcademicLevel[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [scales, setScales] = useState<EvaluationScale[]>([])
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [users, setUsers] = useState<User[]>([])

  // Form states
  const [yearInput, setYearInput] = useState('')
  const [editingYearId, setEditingYearId] = useState<number | null>(null)
  const [periodInput, setPeriodInput] = useState({ name: '', start_date: '', end_date: '', academic_year: '' })
  const [editingPeriodId, setEditingPeriodId] = useState<number | null>(null)
  const [gradeInput, setGradeInput] = useState('')
  const [gradeLevelInput, setGradeLevelInput] = useState('')
  const [areaInput, setAreaInput] = useState('')
  const [instInput, setInstInput] = useState({
    name: '',
    nit: '',
    dane_code: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    rector: '',
    secretary: ''
  })
  const [instLogo, setInstLogo] = useState<File | null>(null)
  const [campusInput, setCampusInput] = useState({ name: '', institution: '' })
  
  // Modal states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<number | null>(null)
  const [deleteType, setDeleteType] = useState<'year' | 'period' | null>(null)

  // Filter states
  const [selectedPeriodYear, setSelectedPeriodYear] = useState<number | null>(null)

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const getErrorMessage = (error: any, defaultMsg: string) => {
    if (error.response?.data) {
      const data = error.response.data
      if (typeof data === 'string') return data
      if (data.detail) return data.detail
      if (data.non_field_errors) return Array.isArray(data.non_field_errors) ? data.non_field_errors.join(', ') : data.non_field_errors
      
      // If it's an object with field errors
      const messages = Object.entries(data).map(([field, errors]) => {
        if (Array.isArray(errors)) {
          return `${field}: ${errors.join(', ')}`
        }
        return `${field}: ${errors}`
      })
      
      if (messages.length > 0) return messages.join('\n')
    }
    return defaultMsg
  }

  // Loading state
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [y, p, l, g, a, s, gr, sc, i, c, u] = await Promise.all([
        academicApi.listYears(),
        academicApi.listPeriods(),
        academicApi.listLevels(),
        academicApi.listGrades(),
        academicApi.listAreas(),
        academicApi.listSubjects(),
        academicApi.listGroups(),
        academicApi.listEvaluationScales(),
        coreApi.listInstitutions(),
        coreApi.listCampuses(),
        usersApi.getAll()
      ])
      setYears(y.data)
      setPeriods(p.data)
      setLevels(l.data)
      setGrades(g.data)
      setAreas(a.data)
      setSubjects(s.data)
      setGroups(gr.data)
      setScales(sc.data)
      setInstitutions(i.data)
      setCampuses(c.data)
      setUsers(u.data)
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
    try {
      if (editingYearId) {
        await academicApi.updateYear(editingYearId, y)
        setEditingYearId(null)
      } else {
        await academicApi.createYear(y)
      }
      setYearInput('')
      await load()
      showToast(editingYearId ? 'Año lectivo actualizado correctamente' : 'Año lectivo creado correctamente', 'success')
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al guardar el año lectivo'), 'error')
    }
  }

  const onEditYear = (year: AcademicYear) => {
    setYearInput(year.year.toString())
    setEditingYearId(year.id)
  }

  const onDeleteYear = (id: number) => {
    setItemToDelete(id)
    setDeleteType('year')
    setDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!itemToDelete || !deleteType) return
    try {
      if (deleteType === 'year') {
        await academicApi.deleteYear(itemToDelete)
        showToast('Año lectivo eliminado correctamente', 'success')
      } else if (deleteType === 'period') {
        await academicApi.deletePeriod(itemToDelete)
        showToast('Periodo eliminado correctamente', 'success')
      }
      await load()
      setDeleteModalOpen(false)
      setItemToDelete(null)
      setDeleteType(null)
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, `Error al eliminar ${deleteType === 'year' ? 'el año lectivo' : 'el periodo'}`), 'error')
    }
  }

  const onCancelEditYear = () => {
    setYearInput('')
    setEditingYearId(null)
  }

  const onAddPeriod = async (e: FormEvent) => {
    e.preventDefault()
    if (!periodInput.name || !periodInput.start_date || !periodInput.end_date || !periodInput.academic_year) return
    try {
      const data = {
        name: periodInput.name,
        start_date: periodInput.start_date,
        end_date: periodInput.end_date,
        academic_year: parseInt(periodInput.academic_year),
        is_closed: false
      }

      if (editingPeriodId) {
        await academicApi.updatePeriod(editingPeriodId, data)
        setEditingPeriodId(null)
        showToast('Periodo actualizado correctamente', 'success')
      } else {
        await academicApi.createPeriod(data)
        showToast('Periodo creado correctamente', 'success')
      }
      
      setPeriodInput({ name: '', start_date: '', end_date: '', academic_year: '' })
      await load()
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al guardar el periodo'), 'error')
    }
  }

  const onEditPeriod = (period: Period) => {
    setPeriodInput({
      name: period.name,
      start_date: period.start_date,
      end_date: period.end_date,
      academic_year: period.academic_year.toString()
    })
    setEditingPeriodId(period.id)
  }

  const onDeletePeriod = (id: number) => {
    setItemToDelete(id)
    setDeleteType('period')
    setDeleteModalOpen(true)
  }

  const onCancelEditPeriod = () => {
    setPeriodInput({ name: '', start_date: '', end_date: '', academic_year: '' })
    setEditingPeriodId(null)
  }

  const onAddGrade = async (e: FormEvent) => {
    e.preventDefault()
    if (!gradeInput.trim()) return
    try {
      await academicApi.createGrade({ 
        name: gradeInput.trim(),
        level: gradeLevelInput ? parseInt(gradeLevelInput) : undefined
      })
      setGradeInput('')
      setGradeLevelInput('')
      await load()
      showToast('Grado creado correctamente', 'success')
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al crear el grado'), 'error')
    }
  }

  const onAddArea = async (e: FormEvent) => {
    e.preventDefault()
    if (!areaInput.trim()) return
    try {
      await academicApi.createArea({ name: areaInput.trim(), description: '' })
      setAreaInput('')
      await load()
      showToast('Área creada correctamente', 'success')
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al crear el área'), 'error')
    }
  }

  const onAddInstitution = async (e: FormEvent) => {
    e.preventDefault()
    if (!instInput.name) return
    try {
      const formData = new FormData()
      formData.append('name', instInput.name)
      formData.append('nit', instInput.nit)
      formData.append('dane_code', instInput.dane_code)
      formData.append('address', instInput.address)
      formData.append('phone', instInput.phone)
      formData.append('email', instInput.email)
      formData.append('website', instInput.website)
      if (instInput.rector) formData.append('rector', instInput.rector)
      if (instInput.secretary) formData.append('secretary', instInput.secretary)
      if (instLogo) formData.append('logo', instLogo)

      await coreApi.createInstitution(formData)
      setInstInput({
        name: '',
        nit: '',
        dane_code: '',
        address: '',
        phone: '',
        email: '',
        website: '',
        rector: '',
        secretary: ''
      })
      setInstLogo(null)
      await load()
      showToast('Institución creada correctamente', 'success')
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al crear la institución'), 'error')
    }
  }

  const onAddCampus = async (e: FormEvent) => {
    e.preventDefault()
    if (!campusInput.name || !campusInput.institution) return
    try {
      await coreApi.createCampus({ 
        name: campusInput.name, 
        institution: parseInt(campusInput.institution),
        dane_code: '', address: '', phone: '', is_main: false 
      })
      setCampusInput({ name: '', institution: '' })
      await load()
      showToast('Sede creada correctamente', 'success')
    } catch (error: any) {
      console.error(error)
      showToast(getErrorMessage(error, 'Error al crear la sede'), 'error')
    }
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

      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-fit overflow-x-auto">
        {(['general', 'institution', 'curriculum', 'organization', 'evaluation'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab 
                ? 'bg-white text-slate-900 shadow-sm' 
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {tab === 'general' && 'General'}
            {tab === 'institution' && 'Institucional'}
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
                <Button type="submit">{editingYearId ? 'Actualizar' : 'Agregar'}</Button>
                {editingYearId && (
                  <Button type="button" variant="outline" onClick={onCancelEditYear}>Cancelar</Button>
                )}
              </form>
              <div className="space-y-2">
                {years.map((y) => (
                  <div key={y.id} className="p-2 bg-slate-50 rounded border flex justify-between items-center">
                    <span className="font-medium">{y.year}</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => onEditYear(y)}>Editar</Button>
                      <Button size="sm" variant="destructive" onClick={() => onDeleteYear(y.id)}>Eliminar</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Periodos Académicos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between bg-slate-50 p-2 rounded border mb-4">
                <span className="text-sm font-medium text-slate-600">Filtrar por Año Lectivo:</span>
                <select
                  className="p-1 border rounded text-sm min-w-[120px]"
                  value={selectedPeriodYear || ''}
                  onChange={(e) => setSelectedPeriodYear(e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">Año Actual</option>
                  {years.map(y => <option key={y.id} value={y.id}>{y.year}</option>)}
                </select>
              </div>

              <form onSubmit={onAddPeriod} className="space-y-2">
                <select
                  className="w-full p-2 border rounded text-sm"
                  value={periodInput.academic_year}
                  onChange={(e) => setPeriodInput({...periodInput, academic_year: e.target.value})}
                >
                  <option value="">Seleccionar Año Lectivo</option>
                  {years.map(y => <option key={y.id} value={y.id}>{y.year}</option>)}
                </select>
                <Input
                  placeholder="Nombre Periodo (Ej: Primer Periodo)"
                  value={periodInput.name}
                  onChange={(e) => setPeriodInput({...periodInput, name: e.target.value})}
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500">Inicio</label>
                    <Input
                      type="date"
                      value={periodInput.start_date}
                      onChange={(e) => setPeriodInput({...periodInput, start_date: e.target.value})}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-500">Fin</label>
                    <Input
                      type="date"
                      value={periodInput.end_date}
                      onChange={(e) => setPeriodInput({...periodInput, end_date: e.target.value})}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full">{editingPeriodId ? 'Actualizar Periodo' : 'Agregar Periodo'}</Button>
                {editingPeriodId && (
                  <Button type="button" variant="outline" className="w-full" onClick={onCancelEditPeriod}>Cancelar Edición</Button>
                )}
              </form>
              <div className="space-y-2">
                {(() => {
                  const currentYear = new Date().getFullYear()
                  const currentYearObj = years.find(y => y.year === currentYear)
                  const displayYearId = selectedPeriodYear || currentYearObj?.id
                  const filteredPeriods = periods.filter(p => displayYearId ? p.academic_year === displayYearId : false)

                  if (filteredPeriods.length === 0) return <p className="text-slate-500 text-sm">No hay periodos para el año seleccionado.</p>

                  return filteredPeriods.map((p) => (
                    <div key={p.id} className="p-2 bg-slate-50 rounded border flex justify-between items-center">
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-slate-500">
                          {p.start_date} - {p.end_date} 
                          <span className="ml-2 text-slate-400">
                            ({years.find(y => y.id === p.academic_year)?.year})
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => onEditPeriod(p)}>Editar</Button>
                        <Button size="sm" variant="destructive" onClick={() => onDeletePeriod(p.id)}>Eliminar</Button>
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'institution' && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Institución</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={onAddInstitution} className="space-y-2">
                <Input
                  placeholder="Nombre Institución"
                  value={instInput.name}
                  onChange={(e) => setInstInput({...instInput, name: e.target.value})}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="NIT"
                    value={instInput.nit}
                    onChange={(e) => setInstInput({...instInput, nit: e.target.value})}
                  />
                  <Input
                    placeholder="Código DANE"
                    value={instInput.dane_code}
                    onChange={(e) => setInstInput({...instInput, dane_code: e.target.value})}
                  />
                </div>
                <Input
                  placeholder="Dirección"
                  value={instInput.address}
                  onChange={(e) => setInstInput({...instInput, address: e.target.value})}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Teléfono"
                    value={instInput.phone}
                    onChange={(e) => setInstInput({...instInput, phone: e.target.value})}
                  />
                  <Input
                    placeholder="Email"
                    value={instInput.email}
                    onChange={(e) => setInstInput({...instInput, email: e.target.value})}
                  />
                </div>
                <Input
                  placeholder="Sitio Web"
                  value={instInput.website}
                  onChange={(e) => setInstInput({...instInput, website: e.target.value})}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500">Rector</label>
                    <select
                      className="w-full p-2 border rounded text-sm"
                      value={instInput.rector}
                      onChange={(e) => setInstInput({...instInput, rector: e.target.value})}
                    >
                      <option value="">Seleccionar Rector</option>
                      {users.filter(u => ['ADMIN', 'TEACHER'].includes(u.role)).map(u => (
                        <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Secretario/a</label>
                    <select
                      className="w-full p-2 border rounded text-sm"
                      value={instInput.secretary}
                      onChange={(e) => setInstInput({...instInput, secretary: e.target.value})}
                    >
                      <option value="">Seleccionar Secretario/a</option>
                      {users.filter(u => u.role === 'SECRETARY').map(u => (
                        <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Escudo / Logo</label>
                  <Input 
                    type="file" 
                    accept="image/png, image/jpeg"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setInstLogo(e.target.files[0])
                      }
                    }}
                  />
                </div>
                <Button type="submit" className="w-full">Guardar Institución</Button>
              </form>
              <div className="space-y-2 mt-4">
                {institutions.map((i) => (
                  <div key={i.id} className="p-3 bg-slate-50 rounded border flex gap-4 items-center">
                    {i.logo && <img src={i.logo} alt="Logo" className="w-16 h-16 object-contain bg-white rounded border p-1" />}
                    <div>
                      <div className="font-bold">{i.name}</div>
                      <div className="text-xs text-slate-500">NIT: {i.nit} | DANE: {i.dane_code}</div>
                      <div className="text-xs text-slate-500">
                        Rector: {i.rector_name || 'No asignado'} | Secretario: {i.secretary_name || 'No asignado'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sedes (Campus)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={onAddCampus} className="space-y-2">
                <select 
                  className="w-full p-2 border rounded text-sm"
                  value={campusInput.institution}
                  onChange={(e) => setCampusInput({...campusInput, institution: e.target.value})}
                >
                  <option value="">Seleccionar Institución</option>
                  {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <Input
                  placeholder="Nombre Sede"
                  value={campusInput.name}
                  onChange={(e) => setCampusInput({...campusInput, name: e.target.value})}
                />
                <Button type="submit" className="w-full">Agregar Sede</Button>
              </form>
              <div className="space-y-2">
                {campuses.map((c) => (
                  <div key={c.id} className="p-2 bg-slate-50 rounded border flex justify-between items-center">
                    <span className="font-medium">{c.name}</span>
                    {c.is_main && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Principal</span>}
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
              <CardTitle>Grados y Niveles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={onAddGrade} className="flex gap-2">
                <Input
                  placeholder="Nombre Grado"
                  value={gradeInput}
                  onChange={(e) => setGradeInput(e.target.value)}
                  className="flex-1"
                />
                <select
                  className="w-32 p-2 border rounded text-sm"
                  value={gradeLevelInput}
                  onChange={(e) => setGradeLevelInput(e.target.value)}
                >
                  <option value="">Nivel...</option>
                  {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <Button type="submit">Agregar</Button>
              </form>
              <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                {grades.map((g) => (
                  <div key={g.id} className="p-2 bg-slate-50 rounded border text-center">
                    <div className="font-medium">{g.name}</div>
                    <div className="text-xs text-slate-500">{g.level_name || 'Sin Nivel'}</div>
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
                    <div className="text-xs text-slate-500 mb-2">{g.campus_name || 'Sin Sede'}</div>
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

      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title={`Eliminar ${deleteType === 'year' ? 'Año Lectivo' : 'Periodo'}`}
        description={`¿Estás seguro de que deseas eliminar este ${deleteType === 'year' ? 'año lectivo' : 'periodo'}? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        variant="destructive"
      />

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast({ ...toast, isVisible: false })}
      />
    </div>
  )
}

