import { useCallback, useEffect, useMemo, useState } from 'react';
import { academicApi } from '../../services/academic';
import { useAuthStore } from '../../store/auth'
import type { AchievementDefinition, Area, Subject, Grade, Dimension, TeacherAssignment, Group } from '../../services/academic';
import { Plus, Edit, Trash, Sparkles, Search, BookOpen, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';

export default function AchievementBank() {
  const user = useAuthStore((s) => s.user)
  const [definitions, setDefinitions] = useState<AchievementDefinition[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [teacherAllowed, setTeacherAllowed] = useState<{
    gradeIds: number[]
    subjectIds: number[]
    areaIds: number[]
    subjectIdsByGrade: Record<number, number[]>
  } | null>(null)
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [improving, setImproving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  
  const [formData, setFormData] = useState<Partial<AchievementDefinition>>({
    code: '',
    description: '',
    area: undefined,
    grade: undefined,
    subject: undefined,
    dimension: undefined,
    is_active: true
  });

  const loadData = useCallback(async () => {
    try {
      const teacherMode = user?.role === 'TEACHER'
      const [defsRes, areasRes, subjectsRes, gradesRes, yearsRes, assignmentsRes, groupsRes] = await Promise.all([
        academicApi.listAchievementDefinitions(),
        academicApi.listAreas(),
        academicApi.listSubjects(),
        academicApi.listGrades(),
        academicApi.listYears(),
        teacherMode ? academicApi.listMyAssignments() : Promise.resolve({ data: [] as TeacherAssignment[] }),
        teacherMode ? academicApi.listGroups() : Promise.resolve({ data: [] as Group[] }),
      ]);
      setDefinitions(defsRes.data);

      if (teacherMode && user) {
        const allAssignments = assignmentsRes.data ?? []
        const groupById = new Map<number, Group>()
        for (const g of groupsRes.data ?? []) groupById.set(g.id, g)

        const subjectIdByName = new Map<string, number>()
        const areaIdBySubjectName = new Map<string, number>()
        for (const s of subjectsRes.data ?? []) {
          subjectIdByName.set(s.name, s.id)
          areaIdBySubjectName.set(s.name, s.area)
        }

        const gradeIds = new Set<number>()
        const subjectIds = new Set<number>()
        const areaIds = new Set<number>()
        const subjectIdsByGrade: Record<number, number[]> = {}

        for (const a of allAssignments) {
          const group = groupById.get(a.group)
          const gradeId = group?.grade
          const subjectName = a.subject_name || ''
          const subjectId = subjectIdByName.get(subjectName)
          const areaId = areaIdBySubjectName.get(subjectName)

          if (!gradeId || !subjectId) continue

          gradeIds.add(gradeId)
          subjectIds.add(subjectId)
          if (areaId) areaIds.add(areaId)

          if (!subjectIdsByGrade[gradeId]) subjectIdsByGrade[gradeId] = []
          if (!subjectIdsByGrade[gradeId].includes(subjectId)) subjectIdsByGrade[gradeId].push(subjectId)
        }

        const allowed = {
          gradeIds: Array.from(gradeIds),
          subjectIds: Array.from(subjectIds),
          areaIds: Array.from(areaIds),
          subjectIdsByGrade,
        }
        setTeacherAllowed(allowed)

        setGrades(gradesRes.data.filter((g) => gradeIds.has(g.id)))
        setSubjects(subjectsRes.data.filter((s) => subjectIds.has(s.id)))
        setAreas(areasRes.data.filter((ar) => areaIds.has(ar.id)))

        // If current selections become invalid, clear them
        setFormData((prev) => {
          const next = { ...prev }
          if (next.grade && !gradeIds.has(Number(next.grade))) {
            next.grade = undefined
            next.subject = undefined
            next.area = undefined
          }
          if (next.subject && !subjectIds.has(Number(next.subject))) {
            next.subject = undefined
            next.area = undefined
          }
          if (next.area && !areaIds.has(Number(next.area))) {
            next.area = undefined
            next.subject = undefined
          }
          return next
        })
      } else {
        setTeacherAllowed(null)
        setAreas(areasRes.data);
        setSubjects(subjectsRes.data);
        setGrades(gradesRes.data);
      }

      // Load dimensions for active year
      const activeYear = yearsRes.data.find(y => y.status === 'ACTIVE');
      if (activeYear) {
        const dimRes = await academicApi.listDimensions(activeYear.id);
        setDimensions(dimRes.data);
      }
    } catch (error) {
      console.error("Error loading data", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData()
  }, [loadData])

  const visibleSubjectIds = useMemo(() => {
    if (!teacherAllowed) return null
    if (formData.grade && teacherAllowed.subjectIdsByGrade[Number(formData.grade)]) {
      return new Set<number>(teacherAllowed.subjectIdsByGrade[Number(formData.grade)])
    }
    return new Set<number>(teacherAllowed.subjectIds)
  }, [formData.grade, teacherAllowed])

  const visibleSubjects = useMemo(() => {
    if (!visibleSubjectIds) return subjects
    return subjects.filter((s) => visibleSubjectIds.has(s.id))
  }, [subjects, visibleSubjectIds])

  const visibleAreas = useMemo(() => {
    if (!teacherAllowed) return areas
    if (formData.subject) {
      const s = subjects.find((sub) => sub.id === Number(formData.subject))
      return s ? areas.filter((a) => a.id === s.area) : []
    }
    const allowed = new Set<number>(teacherAllowed.areaIds)
    return areas.filter((a) => allowed.has(a.id))
  }, [areas, formData.subject, subjects, teacherAllowed])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.area || !formData.grade || !formData.subject) {
      alert("El Área, Grado y Asignatura son obligatorios.");
      return;
    }

    try {
      if (editingId) {
        await academicApi.updateAchievementDefinition(editingId, formData);
      } else {
        await academicApi.createAchievementDefinition(formData);
      }
      setShowForm(false);
      setEditingId(null);
      setFormData({ code: '', description: '', is_active: true, area: undefined, grade: undefined, subject: undefined, dimension: undefined });
      loadData();
    } catch (error) {
      console.error("Error saving", error);
    }
  };

  const handleImproveWording = async () => {
    if (!formData.description) return;
    setImproving(true);
    try {
      const res = await academicApi.improveAchievementWording(formData.description);
      setFormData({ ...formData, description: res.data.improved_text });
    } catch (error) {
      console.error("Error improving text", error);
      alert("Error al mejorar el texto con IA");
    } finally {
      setImproving(false);
    }
  };

  const handleEdit = (def: AchievementDefinition) => {
    setFormData(def);
    setEditingId(def.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('¿Estás seguro de eliminar este logro del banco?')) {
      try {
        await academicApi.deleteAchievementDefinition(id);
        loadData();
      } catch (error) {
        console.error("Error deleting", error);
      }
    }
  };

  const filteredDefinitions = definitions.filter(def => 
    def.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    def.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (def.subject_name && def.subject_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalItems = filteredDefinitions.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  useEffect(() => {
    setPage(1)
  }, [searchTerm, pageSize, definitions.length])

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages))
  }, [totalPages])

  const pagedDefinitions = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredDefinitions.slice(start, start + pageSize)
  }, [filteredDefinitions, page, pageSize])

  const pageInfo = useMemo(() => {
    if (totalItems === 0) return { from: 0, to: 0 }
    const from = (page - 1) * pageSize + 1
    const to = Math.min(page * pageSize, totalItems)
    return { from, to }
  }, [page, pageSize, totalItems])

  const pageButtons = useMemo(() => {
    const maxButtons = 5
    if (totalPages <= maxButtons) return Array.from({ length: totalPages }, (_, i) => i + 1)

    const buttons = new Set<number>()
    buttons.add(1)
    buttons.add(totalPages)
    buttons.add(page)

    if (page - 1 > 1) buttons.add(page - 1)
    if (page + 1 < totalPages) buttons.add(page + 1)

    const ordered = Array.from(buttons).sort((a, b) => a - b)
    return ordered
  }, [page, totalPages])

  const totalAchievements = definitions.length;
  const activeAchievements = definitions.filter(d => d.is_active).length;
  const inactiveAchievements = totalAchievements - activeAchievements;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Banco de Logros</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Gestiona los logros académicos institucionales</p>
        </div>
        <button 
          onClick={() => { setShowForm(true); setEditingId(null); setFormData({ code: '', description: '', is_active: true }); }}
          className="min-h-11 w-full touch-manipulation rounded-lg bg-blue-600 px-4 py-2 text-white shadow-sm transition-all hover:bg-blue-700 md:w-auto"
        >
          <Plus size={20} /> Nuevo Logro
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Logros</p>
              <BookOpen className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totalAchievements}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Registrados en el banco</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Activos</p>
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{activeAchievements}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Disponibles para uso</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Inactivos</p>
              <XCircle className="h-4 w-4 text-red-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{inactiveAchievements}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Deshabilitados temporalmente</p>
          </CardContent>
        </Card>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm transition-all sm:items-center">
          <div className="max-h-dvh w-full max-w-2xl overflow-y-auto rounded-t-xl border border-white/20 bg-white/95 p-4 shadow-2xl backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-900/95 sm:max-h-[90vh] sm:rounded-xl sm:p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-slate-100">{editingId ? 'Editar Logro' : 'Nuevo Logro'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {editingId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Código</label>
                    <input 
                      type="text" 
                      disabled
                      className="mt-1 block w-full rounded-md border-gray-300 dark:border-slate-700 bg-gray-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm border p-2"
                      value={formData.code || ''}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Estado</label>
                  <select 
                    className="mt-1 block h-11 w-full rounded-md border border-gray-300 bg-white p-2 text-slate-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={formData.is_active ? 'true' : 'false'}
                    onChange={e => setFormData({...formData, is_active: e.target.value === 'true'})}
                  >
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Descripción</label>
                  <button
                    type="button"
                    onClick={handleImproveWording}
                    disabled={improving || !formData.description}
                    className="text-xs flex items-center gap-1 text-purple-600 hover:text-purple-800 disabled:opacity-50 transition-colors font-medium"
                    title="Mejorar redacción con IA"
                  >
                    <Sparkles size={14} />
                    {improving ? 'Mejorando...' : 'Mejorar con IA'}
                  </button>
                </div>
                <textarea 
                  required
                  rows={3}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-slate-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Área <span className="text-red-500">*</span></label>
                  <select 
                    required
                    className="mt-1 block h-11 w-full rounded-md border border-gray-300 bg-white p-2 text-slate-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={formData.area || ''}
                    onChange={e => setFormData({...formData, area: e.target.value ? Number(e.target.value) : undefined, subject: undefined})}
                  >
                    <option value="">Seleccionar Área</option>
                    {visibleAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Asignatura <span className="text-red-500">*</span></label>
                  <select 
                    required
                    className="mt-1 block h-11 w-full rounded-md border border-gray-300 bg-white p-2 text-slate-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={formData.subject || ''}
                    onChange={e => {
                      const nextId = e.target.value ? Number(e.target.value) : undefined
                      const nextSubj = nextId ? subjects.find((s) => s.id === nextId) : undefined
                      setFormData({
                        ...formData,
                        subject: nextId,
                        // Keep area consistent with subject selection
                        area: nextSubj ? nextSubj.area : formData.area,
                      })
                    }}
                  >
                    <option value="">Seleccionar Asignatura</option>
                    {visibleSubjects
                      .filter(s => !formData.area || s.area === formData.area)
                      .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Grado <span className="text-red-500">*</span></label>
                  <select 
                    required
                    className="mt-1 block h-11 w-full rounded-md border border-gray-300 bg-white p-2 text-slate-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={formData.grade || ''}
                    onChange={e => {
                      const nextGrade = e.target.value ? Number(e.target.value) : undefined
                      // Changing grade can invalidate subject/area
                      setFormData({ ...formData, grade: nextGrade, subject: undefined, area: undefined })
                    }}
                  >
                    <option value="">Seleccionar Grado</option>
                    {grades
                      .slice()
                      .sort((a, b) => {
                        const ao = a.ordinal === null || a.ordinal === undefined ? -9999 : a.ordinal
                        const bo = b.ordinal === null || b.ordinal === undefined ? -9999 : b.ordinal
                        if (ao !== bo) return bo - ao
                        return (a.name || '').localeCompare(b.name || '')
                      })
                      .map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Dimensión (Opcional)</label>
                <select 
                  className="mt-1 block h-11 w-full rounded-md border border-gray-300 bg-white p-2 text-slate-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={formData.dimension || ''}
                  onChange={e => setFormData({...formData, dimension: e.target.value ? Number(e.target.value) : undefined})}
                >
                  <option value="">Seleccionar Dimensión</option>
                  {dimensions.filter(d => d.is_active).map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.percentage}%)</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Dimensiones del año lectivo activo.</p>
              </div>


              <div className="flex flex-col sm:flex-row sm:justify-end gap-2 mt-6">
                <button 
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="min-h-11 w-full rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:w-auto"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="min-h-11 w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 sm:w-auto"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">Listado de Logros</CardTitle>
            <div className="relative w-full lg:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Buscar por código, descripción..." 
                className="pl-9 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {totalItems > 0 ? (
                <span>
                  Mostrando {pageInfo.from}–{pageInfo.to} de {totalItems}
                </span>
              ) : (
                <span>0 resultados</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 dark:text-slate-400">Por página</label>
              <select
                className="rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs px-2 py-1"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                {[10, 20, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">Cargando...</div>
          ) : filteredDefinitions.length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-500">
              <div className="flex flex-col items-center justify-center py-4">
                <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                  <Search className="h-6 w-6 text-slate-400" />
                </div>
                <p className="font-medium text-slate-900 dark:text-slate-100">No se encontraron logros</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Intenta ajustar los filtros de búsqueda</p>
              </div>
            </div>
          ) : (
            <>
              {/* Mobile + Tablet cards */}
              <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
                {pagedDefinitions.map((def) => {
                  const meta = [def.area_name, def.grade_name, def.subject_name].filter(Boolean).join(' / ') || 'General'
                  const statusClass = def.is_active
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/40'
                    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900/40'

                  return (
                    <div
                      key={def.id}
                      className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{def.code}</div>
                        <div className={`mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusClass}`}>
                          {def.is_active ? 'Activo' : 'Inactivo'}
                        </div>
                      </div>

                      <div className="mt-3 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line line-clamp-4 md:line-clamp-5">
                        {def.description}
                      </div>

                      <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">{meta}</div>

                      <div className="mt-2">
                        {def.dimension_name ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-200">
                            {def.dimension_name}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Sin dimensión</span>
                        )}
                      </div>

                      <div className="mt-auto pt-3">
                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => handleEdit(def)}
                            className="min-h-11 min-w-11 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            aria-label="Editar"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(def.id)}
                            className="min-h-11 min-w-11 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-rose-700 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200 dark:hover:bg-rose-950/30"
                            aria-label="Eliminar"
                          >
                            <Trash size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden xl:block overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-linear-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Código</th>
                      <th className="px-6 py-4 font-semibold">Descripción</th>
                      <th className="px-6 py-4 font-semibold">Área / Grado / Asignatura</th>
                      <th className="px-6 py-4 font-semibold">Dimensión</th>
                      <th className="px-6 py-4 font-semibold">Estado</th>
                      <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {pagedDefinitions.map((def) => (
                      <tr key={def.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">{def.code}</td>
                        <td className="px-6 py-4 text-slate-600 dark:text-slate-300 max-w-md truncate">{def.description}</td>
                        <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                          {[def.area_name, def.grade_name, def.subject_name].filter(Boolean).join(' / ') || 'General'}
                        </td>
                        <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                          {def.dimension_name ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-200">
                              {def.dimension_name}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${def.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/40' : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900/40'}`}>
                            {def.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => handleEdit(def)} className="min-h-11 min-w-11 rounded p-1 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"><Edit size={16} /></button>
                            <button onClick={() => handleDelete(def.id)} className="min-h-11 min-w-11 rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-300"><Trash size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="border-t border-slate-100 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Página {page} de {totalPages}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2">
                  <button
                    type="button"
                    className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    Anterior
                  </button>

                  <div className="flex items-center gap-1">
                    {pageButtons.map((p, idx) => {
                      const prev = idx > 0 ? pageButtons[idx - 1] : null
                      const showEllipsis = prev != null && p - prev > 1

                      return (
                        <span key={p} className="flex items-center gap-1">
                          {showEllipsis ? <span className="px-1 text-slate-400">…</span> : null}
                          <button
                            type="button"
                            className={`h-11 w-11 rounded-lg border text-xs ${
                              p === page
                                ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/25 dark:text-blue-200'
                                : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                            }`}
                            onClick={() => setPage(p)}
                          >
                            {p}
                          </button>
                        </span>
                      )
                    })}
                  </div>

                  <button
                    type="button"
                    className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
