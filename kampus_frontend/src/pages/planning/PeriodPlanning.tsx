import { useState, useEffect } from 'react';
import { academicApi } from '../../services/academic';
import type { Achievement, Period, Subject, AchievementDefinition, Dimension, AcademicYear, Grade, Group, PerformanceIndicatorCreate } from '../../services/academic';
import { Plus, Wand2, Save, Trash } from 'lucide-react';

export default function PeriodPlanning() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
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

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedYear) {
      loadPeriods(Number(selectedYear));
      loadDimensions(Number(selectedYear));
    }
  }, [selectedYear]);

  useEffect(() => {
    if (selectedGrade) {
      loadGroups(Number(selectedGrade));
    }
  }, [selectedGrade]);

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
  }, [selectedPeriod, selectedSubject, selectedGroup]);

  const loadInitialData = async () => {
    try {
      const [yRes, gRes, sRes, dRes] = await Promise.all([
        academicApi.listYears(),
        academicApi.listGrades(),
        academicApi.listSubjects(),
        academicApi.listAchievementDefinitions()
      ]);
      setYears(yRes.data);
      setGrades(gRes.data);
      setSubjects(sRes.data);
      setDefinitions(dRes.data);

      const activeYear = yRes.data.find(y => y.status === 'ACTIVE');
      if (activeYear) setSelectedYear(activeYear.id);
    } catch (error) {
      console.error("Error loading initial data", error);
    }
  };

  const loadPeriods = async (yearId: number) => {
    try {
      const res = await academicApi.listPeriods();
      // Filter periods by year locally or via API if supported
      const yearPeriods = res.data.filter(p => p.academic_year === yearId);
      setPeriods(yearPeriods);
    } catch (error) {
      console.error("Error loading periods", error);
    }
  };

  const loadGroups = async (gradeId: number) => {
    try {
      const res = await academicApi.listGroups({ grade: gradeId });
      setGroups(res.data);
    } catch (error) {
      console.error("Error loading groups", error);
    }
  };

  const loadDimensions = async (yearId: number) => {
    try {
      const res = await academicApi.listDimensions(yearId);
      setDimensions(res.data);
    } catch (error) {
      console.error("Error loading dimensions", error);
    }
  };

  const loadAchievements = async () => {
    setLoading(true);
    setAchievements([]); // Clear previous achievements while loading
    try {
      const res = await academicApi.listAchievements({ 
        period: selectedPeriod, 
        subject: selectedSubject,
        group: selectedGroup 
      });
      setAchievements(res.data);
    } finally {
      setLoading(false);
    }
  };

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
    } catch (error) {
      console.error(error);
      alert('Error guardando la planeación');
    }
  };

  // Filter subjects based on selected grade
  const filteredSubjects = subjects;

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
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Planeación de Periodo</h1>
      
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Año Lectivo</label>
            <select 
              className="w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500"
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
            >
              <option value="">Seleccione Año</option>
              {years.map(y => <option key={y.id} value={y.id}>{y.year} ({y.status_display})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Periodo</label>
            <select 
              className="w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500"
              value={selectedPeriod}
              onChange={e => setSelectedPeriod(Number(e.target.value))}
              disabled={!selectedYear}
            >
              <option value="">Seleccione Periodo</option>
              {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Grado</label>
            <select 
              className="w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500"
              value={selectedGrade}
              onChange={e => { setSelectedGrade(Number(e.target.value)); setSelectedGroup(''); }}
            >
              <option value="">Seleccione Grado</option>
              {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Grupo</label>
            <select 
              className="w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500"
              value={selectedGroup}
              onChange={e => setSelectedGroup(Number(e.target.value))}
              disabled={!selectedGrade}
            >
              <option value="">Seleccione Grupo</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Asignatura</label>
            <select 
              className="w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500"
              value={selectedSubject}
              onChange={e => setSelectedSubject(Number(e.target.value))}
              disabled={!selectedGroup}
            >
              <option value="">Seleccione Asignatura</option>
              {filteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {selectedPeriod && selectedSubject && selectedGroup && (
        <>
          {/* Dimension Stats Panel */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-bold text-blue-800 mb-3">Estado de la Planeación por Dimensión</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {dimensionStats.map(stat => (
                <div key={stat.id} className={`bg-white p-3 rounded-lg border shadow-sm flex justify-between items-center ${
                  !stat.isMinMet ? 'border-amber-300' : stat.isMaxReached ? 'border-green-500' : 'border-slate-200'
                }`}>
                  <div>
                    <span className="block text-sm font-medium text-slate-700">{stat.name}</span>
                    <span className="text-xs text-slate-500">Requerido: 1 - 3 logros</span>
                  </div>
                  <div className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    stat.count === 0 ? 'bg-red-100 text-red-700' :
                    stat.count > 3 ? 'bg-red-100 text-red-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {stat.count} / 3
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-4 text-xs text-slate-500">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div> Pendiente (0 logros)</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div> Correcto (1-3 logros)</div>
            </div>
          </div>

          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-slate-800">Logros Planificados</h2>
            <button 
              onClick={() => setShowForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 shadow-sm transition-all"
            >
              <Plus size={20} /> Agregar Logro
            </button>
          </div>

          {showForm && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-8">
                <div className="p-6 border-b border-slate-100">
                  <h3 className="text-xl font-bold text-slate-900">Nuevo Logro</h3>
                  <p className="text-sm text-slate-500">Define el logro y sus indicadores de desempeño</p>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Dimensión <span className="text-red-500">*</span></label>
                      <select 
                        required
                        className="w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500"
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
                      <label className="block text-sm font-medium text-slate-700 mb-1">Importar del Banco (Opcional)</label>
                      <select 
                        className="w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                        value={formData.definitionId}
                        onChange={e => handleDefinitionChange(Number(e.target.value))}
                        disabled={!formData.dimensionId}
                      >
                        <option value="">
                          {!formData.dimensionId ? 'Seleccione una dimensión primero' : '-- Escribir nuevo --'}
                        </option>
                        {definitions
                          .filter(d => 
                            d.dimension === Number(formData.dimensionId) &&
                            d.grade === Number(selectedGrade) &&
                            d.subject === Number(selectedSubject)
                          )
                          .map(d => (
                            <option key={d.id} value={d.id}>{d.code} - {d.description.substring(0, 50)}...</option>
                          ))
                        }
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Descripción del Logro</label>
                    <textarea 
                      required
                      rows={3}
                      className="w-full rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                      onBlur={handleDescriptionBlur}
                      placeholder="Describe el logro que el estudiante debe alcanzar..."
                    />
                    <p className="text-xs text-slate-500 mt-1">Al terminar de escribir, la IA generará sugerencias de indicadores automáticamente.</p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="flex justify-between items-center mb-4">
                      <label className="block text-sm font-bold text-slate-700">Indicadores de Desempeño</label>
                      <button 
                        type="button"
                        onClick={() => generateIndicators(formData.description)}
                        disabled={generatingAI || !formData.description}
                        className="text-xs bg-purple-100 text-purple-700 px-3 py-1.5 rounded-full flex items-center gap-1.5 hover:bg-purple-200 font-medium transition-colors disabled:opacity-50"
                      >
                        <Wand2 size={14} /> {generatingAI ? 'Generando...' : 'Regenerar con IA'}
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      {formData.indicators.map((ind, idx) => (
                        <div key={ind.level} className="flex gap-3 items-start">
                          <div className={`w-24 flex-shrink-0 text-xs font-bold uppercase py-2.5 px-2 rounded-lg text-center border ${
                            ind.level === 'LOW' ? 'bg-red-50 text-red-700 border-red-100' :
                            ind.level === 'BASIC' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                            ind.level === 'HIGH' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                            'bg-emerald-50 text-emerald-700 border-emerald-100'
                          }`}>
                            {ind.level === 'LOW' ? 'Bajo' : ind.level === 'BASIC' ? 'Básico' : ind.level === 'HIGH' ? 'Alto' : 'Superior'}
                          </div>
                          <textarea 
                            className="flex-1 text-sm border-slate-300 rounded-lg focus:border-blue-500 focus:ring-blue-500 min-h-[60px]"
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

                  <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                    <button 
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 font-medium"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium shadow-sm"
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
              <div key={ach.id} className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {ach.dimension_name && (
                        <span className="text-xs font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                          {ach.dimension_name}
                        </span>
                      )}
                      {ach.definition_code && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          Ref: {ach.definition_code}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-900 font-medium">{ach.description}</p>
                  </div>
                  <button className="text-red-500 hover:text-red-700"><Trash size={18} /></button>
                </div>
                
                {ach.indicators && ach.indicators.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {ach.indicators.map(ind => (
                      <div key={ind.id} className="text-xs bg-gray-50 p-2 rounded">
                        <span className="font-bold text-gray-700">{ind.level_display}:</span> {ind.description}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {achievements.length === 0 && !loading && (
              <p className="text-center text-gray-500 py-8">No hay logros planeados para este periodo.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
