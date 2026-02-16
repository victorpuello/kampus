import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom'
import { academicApi } from '../../services/academic';
import { useAuthStore } from '../../store/auth'
import type { Achievement, Period, Subject, AchievementDefinition, Dimension, AcademicYear, Grade, Group, PerformanceIndicatorCreate, TeacherAssignment, EditGrant } from '../../services/academic';
import { Plus, Wand2, Save, Trash } from 'lucide-react';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal'

export default function PeriodPlanning() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const getErrorResponseData = (error: unknown): unknown | undefined => {
    if (typeof error !== 'object' || error === null) return undefined
    const maybeAxios = error as { response?: { data?: unknown } }
    return maybeAxios.response?.data
  }

  const getDetailFromErrorData = (data: unknown): string | undefined => {
    if (!data || typeof data !== 'object') return undefined
    const detail = (data as Record<string, unknown>).detail
    if (typeof detail === 'string') return detail
    if (detail != null) return String(detail)
    return undefined
  }
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teacherAllowed, setTeacherAllowed] = useState<{
    gradeIds: number[]
    groupIdsByGrade: Record<number, number[]>
    subjectIds: number[]
    subjectIdsByGrade: Record<number, number[]>
  } | null>(null)
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [definitions, setDefinitions] = useState<AchievementDefinition[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  
  const [selectedYear, setSelectedYear] = useState<number | ''>('');
  const [selectedPeriod, setSelectedPeriod] = useState<number | ''>('');
  const [selectedGrade, setSelectedGrade] = useState<number | ''>('');
  const [selectedGroup, setSelectedGroup] = useState<number | ''>('');
  const [selectedSubject, setSelectedSubject] = useState<number | ''>('');
  
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)
  const [deletingAchievement, setDeletingAchievement] = useState(false)

  const selectedPeriodObj = useMemo(() => {
    if (!selectedPeriod) return null
    return periods.find((p) => p.id === Number(selectedPeriod)) ?? null
  }, [periods, selectedPeriod])

  const planningWindowClosed = useMemo(() => {
    if (user?.role !== 'TEACHER') return false
    const until = selectedPeriodObj?.planning_edit_until
    if (until) return Date.now() > new Date(until).getTime()

    const endDate = selectedPeriodObj?.end_date
    if (!endDate) return false
    const fallback = new Date(`${endDate}T23:59:59`).getTime()
    return Date.now() > fallback
  }, [selectedPeriodObj?.end_date, selectedPeriodObj?.planning_edit_until, user?.role])

  const [activePlanningGrant, setActivePlanningGrant] = useState<EditGrant | null>(null)
  const [loadingPlanningGrant, setLoadingPlanningGrant] = useState(false)

  const planningCanEdit = useMemo(() => {
    if (user?.role !== 'TEACHER') return true
    if (!planningWindowClosed) return true
    return !!activePlanningGrant
  }, [activePlanningGrant, planningWindowClosed, user?.role])

  const refreshPlanningGrants = useCallback(async () => {
    if (user?.role !== 'TEACHER') {
      setActivePlanningGrant(null)
      return
    }
    if (!selectedPeriod) {
      setActivePlanningGrant(null)
      return
    }
    if (!planningWindowClosed) {
      setActivePlanningGrant(null)
      return
    }

    setLoadingPlanningGrant(true)
    try {
      const res = await academicApi.listMyEditGrants({ scope: 'PLANNING', period: Number(selectedPeriod) })
      const now = Date.now()
      const active = (res.data ?? []).filter((g) => new Date(g.valid_until).getTime() > now)
      setActivePlanningGrant(active[0] ?? null)
    } catch (e) {
      console.error(e)
      setActivePlanningGrant(null)
    } finally {
      setLoadingPlanningGrant(false)
    }
  }, [planningWindowClosed, selectedPeriod, user?.role])
  
  // Form State
  const [formData, setFormData] = useState<{
    definitionId: number | '';
    dimensionId: number | '';
    description: string;
    percentage: number;
    indicators: PerformanceIndicatorCreate[];
  }>({
    definitionId: '',
    dimensionId: '',
    description: '',
    percentage: 0,
    indicators: [
      { level: 'LOW', description: '' },
      { level: 'BASIC', description: '' },
      { level: 'HIGH', description: '' },
      { level: 'SUPERIOR', description: '' }
    ]
  });

  const [generatingAI, setGeneratingAI] = useState(false);

  const loadInitialData = useCallback(async () => {
    try {
      const teacherMode = user?.role === 'TEACHER'
      const [yRes, gRes, sRes, dRes, assignmentsRes, groupsRes] = await Promise.all([
        academicApi.listYears(),
        academicApi.listGrades(),
        academicApi.listSubjects(),
        academicApi.listAchievementDefinitions(),
        teacherMode ? academicApi.listMyAssignments() : Promise.resolve({ data: [] as TeacherAssignment[] }),
        teacherMode ? academicApi.listGroups() : Promise.resolve({ data: [] as Group[] }),
      ])
      setYears(yRes.data)
      setSubjects(sRes.data)
      setDefinitions(dRes.data)

      if (teacherMode && user) {
        const subjectIdByName = new Map<string, number>()
        for (const s of sRes.data ?? []) subjectIdByName.set(s.name, s.id)

        const groupById = new Map<number, Group>()
        for (const g of groupsRes.data ?? []) groupById.set(g.id, g)

        const gradeIds = new Set<number>()
        const subjectIds = new Set<number>()
        const groupIdsByGrade: Record<number, number[]> = {}
        const subjectIdsByGrade: Record<number, number[]> = {}

        const myAssignments = assignmentsRes.data ?? []
        for (const a of myAssignments) {
          const group = groupById.get(a.group)
          const gradeId = group?.grade
          const subjectId = subjectIdByName.get(a.subject_name || '')
          if (!gradeId || !subjectId) continue

          gradeIds.add(gradeId)
          subjectIds.add(subjectId)

          if (!groupIdsByGrade[gradeId]) groupIdsByGrade[gradeId] = []
          if (!groupIdsByGrade[gradeId].includes(a.group)) groupIdsByGrade[gradeId].push(a.group)

          if (!subjectIdsByGrade[gradeId]) subjectIdsByGrade[gradeId] = []
          if (!subjectIdsByGrade[gradeId].includes(subjectId)) subjectIdsByGrade[gradeId].push(subjectId)
        }

        setTeacherAllowed({
          gradeIds: Array.from(gradeIds),
          groupIdsByGrade,
          subjectIds: Array.from(subjectIds),
          subjectIdsByGrade,
        })

        setGrades(gRes.data.filter((g) => gradeIds.has(g.id)))

        // Clear dependent selects (safe defaults for TEACHER)
        setSelectedGrade('')
        setSelectedGroup('')
        setSelectedSubject('')
      } else {
        setTeacherAllowed(null)
        setGrades(gRes.data)
      }

      const activeYear = yRes.data.find((y) => y.status === 'ACTIVE')
      if (activeYear) setSelectedYear(activeYear.id)
    } catch (error) {
      console.error('Error loading initial data', error)
    }
  }, [user])

  const loadPeriods = useCallback(async (yearId: number) => {
    try {
      const res = await academicApi.listPeriods()
      // Filter periods by year locally or via API if supported
      const yearPeriods = res.data.filter((p) => p.academic_year === yearId)
      setPeriods(yearPeriods)
    } catch (error) {
      console.error('Error loading periods', error)
    }
  }, [])

  const loadGroups = useCallback(
    async (gradeId: number) => {
      try {
        const params: Record<string, unknown> = { grade: gradeId }
        if (selectedYear) params.academic_year = Number(selectedYear)
        const res = await academicApi.listGroups(params)
        if (teacherAllowed?.groupIdsByGrade?.[gradeId]) {
          const allowed = new Set<number>(teacherAllowed.groupIdsByGrade[gradeId])
          setGroups(res.data.filter((g) => allowed.has(g.id)))
        } else {
          setGroups(res.data)
        }
      } catch (error) {
        console.error('Error loading groups', error)
      }
    },
    [selectedYear, teacherAllowed]
  )

  const loadDimensions = useCallback(async (yearId: number) => {
    try {
      const res = await academicApi.listDimensions(yearId)
      setDimensions(res.data)
    } catch (error) {
      console.error('Error loading dimensions', error)
    }
  }, [])

  const loadAchievements = useCallback(async () => {
    setLoading(true)
    setAchievements([]) // Clear previous achievements while loading
    try {
      const res = await academicApi.listAchievements({
        period: selectedPeriod,
        subject: selectedSubject,
        group: selectedGroup,
      })
      setAchievements(res.data)
    } finally {
      setLoading(false)
    }
  }, [selectedGroup, selectedPeriod, selectedSubject])

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (selectedYear) {
      loadPeriods(Number(selectedYear));
      loadDimensions(Number(selectedYear));

      // Reset dependent selections to avoid mixing entities across academic years
      setSelectedPeriod('')
      setSelectedGrade('')
      setSelectedGroup('')
      setSelectedSubject('')
      setGroups([])
      setAchievements([])
    }
  }, [loadDimensions, loadPeriods, selectedYear]);

  useEffect(() => {
    if (selectedGrade) {
      loadGroups(Number(selectedGrade));
    }
  }, [loadGroups, selectedGrade]);

  useEffect(() => {
    if (selectedGrade && selectedGroup) {
      // Filter subjects by grade (assuming subjects are linked to grade via area or directly)
      // In this system, subjects are linked to grade.
      // We can filter the subjects list loaded initially or fetch specific subjects.
      // For now, we filter the loaded subjects.
      // Ideally, we should fetch AcademicLoads for the group, but let's use subjects for now.
    }
  }, [selectedGrade, selectedGroup]);

  useEffect(() => {
    if (selectedPeriod && selectedSubject && selectedGroup) {
      loadAchievements();
    }
  }, [loadAchievements, selectedGroup, selectedPeriod, selectedSubject]);

  useEffect(() => {
    refreshPlanningGrants()
  }, [refreshPlanningGrants])

  const handleDefinitionChange = (defId: number) => {
    const def = definitions.find(d => d.id === defId);
    if (def) {
      setFormData(prev => ({ ...prev, definitionId: defId, description: def.description }));
      // Auto generate indicators if description is set
      if (def.description) {
        generateIndicators(def.description);
      }
    }
  };

  const generateIndicators = async (text: string) => {
    setGeneratingAI(true);
    try {
      const res = await academicApi.generateIndicators(text);
      const newIndicators: PerformanceIndicatorCreate[] = [
        { level: 'LOW', description: res.data.LOW || '' },
        { level: 'BASIC', description: res.data.BASIC || '' },
        { level: 'HIGH', description: res.data.HIGH || '' },
        { level: 'SUPERIOR', description: res.data.SUPERIOR || '' }
      ];
      setFormData(prev => ({ ...prev, indicators: newIndicators }));
    } catch (error) {
      console.error("Error generating indicators", error);
      // Don't alert on auto-generation to avoid spamming
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleDescriptionBlur = () => {
    if (formData.description && !formData.indicators[0].description) {
      generateIndicators(formData.description);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPeriod || !selectedSubject || !selectedGroup) return;
    if (user?.role === 'TEACHER' && !planningCanEdit) {
      alert('La edición de planeación está cerrada. Debes solicitar permiso.')
      return
    }

    // Validate max achievements per dimension
    if (formData.dimensionId) {
      const currentCount = achievements.filter(a => a.dimension === Number(formData.dimensionId)).length;
      if (currentCount >= 3) {
        alert(`La dimensión seleccionada ya tiene el máximo de 3 logros permitidos.`);
        return;
      }
    }

    try {
      // 1. Create Achievement with Indicators (Atomic)
      await academicApi.createAchievement({
        period: Number(selectedPeriod),
        subject: Number(selectedSubject),
        group: Number(selectedGroup),
        definition: formData.definitionId ? Number(formData.definitionId) : null,
        dimension: formData.dimensionId ? Number(formData.dimensionId) : undefined,
        description: formData.description,
        percentage: formData.percentage,
        indicators: formData.indicators // Send indicators nested
      });

      setShowForm(false);
      setFormData({
        definitionId: '',
        dimensionId: '',
        description: '',
        percentage: 0,
        indicators: [
            { level: 'LOW', description: '' },
            { level: 'BASIC', description: '' },
            { level: 'HIGH', description: '' },
            { level: 'SUPERIOR', description: '' }
        ]
      });
      loadAchievements();
    } catch (error: unknown) {
      console.error(error);
      const data = getErrorResponseData(error)
      const detail = getDetailFromErrorData(data)
      if (detail) {
        alert(detail)
      } else if (data && typeof data === 'object') {
        const firstKey = Object.keys(data)[0]
        const firstVal = firstKey ? (data as Record<string, unknown>)[firstKey] : null
        if (firstKey && Array.isArray(firstVal) && firstVal[0]) {
          alert(String(firstVal[0]))
        } else if (firstKey && firstVal) {
          alert(`${firstKey}: ${String(firstVal)}`)
        } else {
          alert('Error guardando la planeación')
        }
      } else {
        alert('Error guardando la planeación');
      }
    }
  };

  const handleDeleteAchievement = (achievementId: number) => {
    if (user?.role === 'TEACHER' && !planningCanEdit) {
      alert('La edición de planeación está cerrada. Debes solicitar permiso.')
      return
    }
    setDeleteConfirmId(achievementId)
  }

  const confirmDeleteAchievement = async () => {
    if (!deleteConfirmId) return

    setDeletingAchievement(true)
    try {
      await academicApi.deleteAchievement(deleteConfirmId)
      setAchievements((prev) => prev.filter((a) => a.id !== deleteConfirmId))
      setDeleteConfirmId(null)
    } catch (error: unknown) {
      console.error(error)
      const data = getErrorResponseData(error)
      const detail = getDetailFromErrorData(data)
      if (detail) {
        alert(detail)
      } else if (data && typeof data === 'object') {
        const firstKey = Object.keys(data)[0]
        const firstVal = firstKey ? (data as Record<string, unknown>)[firstKey] : null
        if (firstKey && Array.isArray(firstVal) && firstVal[0]) {
          alert(String(firstVal[0]))
        } else if (firstKey && firstVal) {
          alert(`${firstKey}: ${String(firstVal)}`)
        } else {
          alert('Error eliminando el logro')
        }
      } else {
        alert('Error eliminando el logro')
      }
    } finally {
      setDeletingAchievement(false)
    }
  }

  const filteredSubjects = useMemo(() => {
    if (!teacherAllowed) return subjects
    const gradeId = selectedGrade ? Number(selectedGrade) : null
    if (gradeId && teacherAllowed.subjectIdsByGrade?.[gradeId]) {
      const allowed = new Set<number>(teacherAllowed.subjectIdsByGrade[gradeId])
      return subjects.filter((s) => allowed.has(s.id))
    }
    const allowed = new Set<number>(teacherAllowed.subjectIds)
    return subjects.filter((s) => allowed.has(s.id))
  }, [selectedGrade, subjects, teacherAllowed])

  // Calculate stats per dimension
  const dimensionStats = dimensions.filter(d => d.is_active).map(dim => {
    const count = achievements.filter(a => a.dimension === dim.id).length;
    return {
      ...dim,
      count,
      isValid: count >= 1 && count <= 3,
      isMaxReached: count >= 3,
      isMinMet: count >= 1
    };
  });

  return (
    <div className="p-3 sm:p-6">
      <ConfirmationModal
        isOpen={deleteConfirmId !== null}
        onClose={() => (!deletingAchievement ? setDeleteConfirmId(null) : null)}
        onConfirm={confirmDeleteAchievement}
        title="¿Eliminar logro?"
        description="Esta acción no se puede deshacer. Se eliminará el logro y sus indicadores de desempeño."
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="destructive"
        loading={deletingAchievement}
      />

      <h1 className="mb-4 text-xl font-bold text-gray-800 dark:text-slate-100 sm:mb-6 sm:text-2xl">Planeación de Periodo</h1>
      
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-xl shadow-sm dark:shadow-none border border-slate-200 dark:border-slate-800 mb-6 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Año Lectivo</label>
            <select 
              className="h-11 w-full rounded-lg border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Seleccione Año</option>
              {years.map(y => <option key={y.id} value={y.id}>{y.year} ({y.status_display})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Periodo</label>
            <select 
              className="h-11 w-full rounded-lg border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              value={selectedPeriod}
              onChange={e => setSelectedPeriod(e.target.value ? Number(e.target.value) : '')}
              disabled={!selectedYear}
            >
              <option value="">Seleccione Periodo</option>
              {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Grado</label>
            <select 
              className="h-11 w-full rounded-lg border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              value={selectedGrade}
              onChange={e => {
                const next = e.target.value ? Number(e.target.value) : ''
                setSelectedGrade(next)
                setSelectedGroup('')
                setSelectedSubject('')
              }}
            >
              <option value="">Seleccione Grado</option>
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
        
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Grupo</label>
            <select 
              className="h-11 w-full rounded-lg border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              value={selectedGroup}
              onChange={e => {
                const next = e.target.value ? Number(e.target.value) : ''
                setSelectedGroup(next)
                setSelectedSubject('')
              }}
              disabled={!selectedGrade}
            >
              <option value="">Seleccione Grupo</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Asignatura</label>
            <select 
              className="h-11 w-full rounded-lg border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value ? Number(e.target.value) : '')}
              disabled={!selectedGroup}
            >
              <option value="">Seleccione Asignatura</option>
              {filteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {user?.role === 'TEACHER' && planningWindowClosed && (
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-xl p-4 mb-6">
          <div className="text-sm font-bold text-rose-800 dark:text-rose-200">Edición cerrada (Planeación)</div>
          <div className="mt-1 text-sm text-rose-700 dark:text-rose-200/90">
            El plazo para modificar la planeación de este periodo ya venció.
            {loadingPlanningGrant ? ' Verificando permisos…' : ''}
            {activePlanningGrant ? ` Permiso vigente hasta: ${new Date(activePlanningGrant.valid_until).toLocaleString()}` : ''}
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={refreshPlanningGrants}
              disabled={loadingPlanningGrant || !selectedPeriod}
              className="min-h-11 w-full touch-manipulation rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
            >
              {loadingPlanningGrant ? 'Revisando…' : 'Revisar permisos'}
            </button>
          </div>

          {!activePlanningGrant ? (
            <div className="mt-3 flex flex-col sm:flex-row gap-3 justify-end">
              <button
                type="button"
                onClick={() => navigate(selectedPeriod ? `/edit-requests/planning?period=${Number(selectedPeriod)}` : '/edit-requests/planning')}
                disabled={!selectedPeriod}
                className="min-h-11 w-full touch-manipulation rounded-lg bg-rose-700 px-4 py-2 text-white shadow-sm transition-all hover:bg-rose-800 disabled:opacity-50 sm:w-auto"
              >
                Ir a Solicitudes de edición
              </button>
              <button
                type="button"
                onClick={() => navigate('/edit-requests/planning')}
                className="min-h-11 w-full touch-manipulation rounded-lg border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
              >
                Ver mis solicitudes
              </button>
            </div>
          ) : null}
        </div>
      )}

      {selectedPeriod && selectedSubject && selectedGroup && (
        <>
          {/* Dimension Stats Panel */}
          <div className="bg-blue-50 dark:bg-blue-950/25 border border-blue-100 dark:border-blue-900/40 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-bold text-blue-800 dark:text-blue-200 mb-3">Estado de la Planeación por Dimensión</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 sm:gap-4">
              {dimensionStats.map(stat => (
                <div key={stat.id} className={`bg-white dark:bg-slate-900 p-3 rounded-lg border shadow-sm dark:shadow-none flex justify-between items-center ${
                  !stat.isMinMet ? 'border-amber-300' : stat.isMaxReached ? 'border-green-500' : 'border-slate-200'
                }`}>
                  <div>
                    <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">{stat.name}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Requerido: 1 - 3 logros</span>
                  </div>
                  <div className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    stat.count === 0 ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-200' :
                    stat.count > 3 ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-200' :
                    'bg-green-100 text-green-700 dark:bg-emerald-950/30 dark:text-emerald-200'
                  }`}>
                    {stat.count} / 3
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2 text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:gap-4">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div> Pendiente (0 logros)</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div> Correcto (1-3 logros)</div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Logros Planificados</h2>
            <button 
              onClick={() => setShowForm(true)}
              disabled={user?.role === 'TEACHER' && !planningCanEdit}
              className="min-h-11 w-full touch-manipulation rounded-lg bg-blue-600 px-4 py-2 text-white shadow-sm transition-all hover:bg-blue-700 sm:w-auto"
            >
              <Plus size={20} /> Agregar Logro
            </button>
          </div>

          {showForm && (
            <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/60 p-2 backdrop-blur-sm sm:items-center sm:p-4">
              <div className="my-0 max-h-dvh w-full max-w-3xl overflow-y-auto rounded-t-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:my-8 sm:max-h-[90vh] sm:rounded-xl">
                <div className="sticky top-0 z-10 border-b border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Nuevo Logro</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Define el logro y sus indicadores de desempeño</p>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-6 p-4 sm:p-6">
                  <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Dimensión <span className="text-red-500">*</span></label>
                      <select 
                        required
                        className="h-11 w-full rounded-lg border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        value={formData.dimensionId}
                        onChange={e => {
                          setFormData({
                            ...formData, 
                            dimensionId: Number(e.target.value),
                            definitionId: '' // Reset definition when dimension changes
                          });
                        }}
                      >
                        <option value="">Seleccione Dimensión</option>
                        {dimensions.filter(d => d.is_active).map(d => (
                          <option key={d.id} value={d.id}>{d.name} ({d.percentage}%)</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Importar del Banco (Opcional)</label>
                      <select 
                        className="h-11 w-full rounded-lg border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        value={formData.definitionId}
                        onChange={e => handleDefinitionChange(Number(e.target.value))}
                        disabled={!formData.dimensionId}
                      >
                        <option value="">
                          {!formData.dimensionId ? 'Seleccione una dimensión primero' : '-- Escribir nuevo --'}
                        </option>
                        {definitions
                          .filter((d) => {
                            const selectedDimension = dimensions.find((dim) => dim.id === Number(formData.dimensionId))
                            const selectedDimensionName = selectedDimension?.name?.trim().toLowerCase() || ''
                            const definitionDimensionName = d.dimension_name?.trim().toLowerCase() || ''

                            const dimensionMatches =
                              d.dimension === Number(formData.dimensionId) ||
                              (selectedDimensionName !== '' && definitionDimensionName !== '' && definitionDimensionName === selectedDimensionName)

                            return (
                              d.is_active &&
                              dimensionMatches &&
                              d.grade === Number(selectedGrade) &&
                              d.subject === Number(selectedSubject)
                            )
                          })
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.code} - {d.description.substring(0, 50)}...
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Descripción del Logro</label>
                    <textarea 
                      required
                      rows={3}
                      className="w-full rounded-lg border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                      onBlur={handleDescriptionBlur}
                      placeholder="Describe el logro que el estudiante debe alcanzar..."
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Al terminar de escribir, la IA generará sugerencias de indicadores automáticamente.</p>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-4">
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">Indicadores de Desempeño</label>
                      <button 
                        type="button"
                        onClick={() => generateIndicators(formData.description)}
                        disabled={generatingAI || !formData.description}
                        className="w-full sm:w-auto text-xs bg-purple-100 text-purple-700 px-3 py-1.5 rounded-full flex items-center justify-center gap-1.5 hover:bg-purple-200 font-medium transition-colors disabled:opacity-50"
                      >
                        <Wand2 size={14} /> {generatingAI ? 'Generando...' : 'Regenerar con IA'}
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      {formData.indicators.map((ind, idx) => (
                        <div key={ind.level} className="flex flex-col items-start gap-2 sm:flex-row sm:gap-3">
                          <div className={`w-full shrink-0 rounded-lg border px-2 py-2.5 text-center text-xs font-bold uppercase sm:w-24 ${
                            ind.level === 'LOW' ? 'bg-red-50 text-red-700 border-red-100 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900/40' :
                            ind.level === 'BASIC' ? 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/25 dark:text-amber-200 dark:border-amber-900/40' :
                            ind.level === 'HIGH' ? 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/30 dark:text-blue-200 dark:border-blue-900/40' :
                            'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/40'
                          }`}>
                            {ind.level === 'LOW' ? 'Bajo' : ind.level === 'BASIC' ? 'Básico' : ind.level === 'HIGH' ? 'Alto' : 'Superior'}
                          </div>
                          <textarea 
                            className="min-h-[72px] flex-1 rounded-lg border-slate-300 bg-white text-sm text-slate-900 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            rows={2}
                            value={ind.description}
                            onChange={e => {
                              const newInds = [...formData.indicators];
                              newInds[idx].description = e.target.value;
                              setFormData({...formData, indicators: newInds});
                            }}
                            placeholder={`Descripción para desempeño ${ind.level}...`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="sticky bottom-0 flex flex-col gap-3 border-t border-slate-100 bg-white pt-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:justify-end sm:pt-2">
                    <button 
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      disabled={user?.role === 'TEACHER' && !planningCanEdit}
                      className="min-h-11 w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-blue-700 sm:w-auto"
                    >
                      <Save size={18} /> Guardar Planeación
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {achievements.map(ach => (
              <div key={ach.id} className="rounded-lg border border-slate-200 border-l-4 border-l-blue-500 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:p-4">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {ach.dimension_name && (
                        <span className="text-xs font-semibold bg-blue-100 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full">
                          {ach.dimension_name}
                        </span>
                      )}
                      {ach.definition_code && (
                        <span className="text-xs text-gray-500 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          Ref: {ach.definition_code}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-900 dark:text-slate-100 font-medium">{ach.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAchievement(ach.id)}
                    disabled={user?.role === 'TEACHER' && !planningCanEdit}
                    className="min-h-11 min-w-11 self-end rounded-md p-2 text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:hover:bg-red-950/20 sm:self-auto"
                    title={user?.role === 'TEACHER' && !planningCanEdit ? 'Edición cerrada' : 'Eliminar'}
                  >
                    <Trash size={18} />
                  </button>
                </div>
                
                {ach.indicators && ach.indicators.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {ach.indicators.map(ind => (
                      <div key={ind.id} className="text-xs bg-gray-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 p-2 rounded border border-transparent dark:border-slate-700">
                        <span className="font-bold text-gray-700 dark:text-slate-100">{ind.level_display}:</span> {ind.description}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {achievements.length === 0 && !loading && (
              <p className="text-center text-gray-500 dark:text-slate-400 py-8">No hay logros planeados para este periodo.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
