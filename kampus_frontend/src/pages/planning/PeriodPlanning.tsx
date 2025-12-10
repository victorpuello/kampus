import { useState, useEffect } from 'react';
import { academicApi } from '../../services/academic';
import type { Achievement, Period, Subject, AchievementDefinition } from '../../services/academic';
import { Plus, Wand2, Save, Trash } from 'lucide-react';

export default function PeriodPlanning() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [definitions, setDefinitions] = useState<AchievementDefinition[]>([]);
  
  const [selectedPeriod, setSelectedPeriod] = useState<number | ''>('');
  const [selectedSubject, setSelectedSubject] = useState<number | ''>('');
  
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState<{
    definitionId: number | '';
    description: string;
    percentage: number;
    indicators: { level: string; description: string }[];
  }>({
    definitionId: '',
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
    if (selectedPeriod && selectedSubject) {
      loadAchievements();
    }
  }, [selectedPeriod, selectedSubject]);

  const loadInitialData = async () => {
    const [pRes, sRes, dRes] = await Promise.all([
      academicApi.listPeriods(),
      academicApi.listSubjects(),
      academicApi.listAchievementDefinitions()
    ]);
    setPeriods(pRes.data);
    setSubjects(sRes.data);
    setDefinitions(dRes.data);
  };

  const loadAchievements = async () => {
    setLoading(true);
    try {
      const res = await academicApi.listAchievements({ period: selectedPeriod, subject: selectedSubject });
      setAchievements(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleDefinitionChange = (defId: number) => {
    const def = definitions.find(d => d.id === defId);
    if (def) {
      setFormData(prev => ({ ...prev, definitionId: defId, description: def.description }));
    }
  };

  const handleGenerateAI = async () => {
    if (!formData.description) return alert('Ingrese una descripción primero');
    setGeneratingAI(true);
    try {
      const res = await academicApi.generateIndicators(formData.description);
      const newIndicators = [
        { level: 'LOW', description: res.data.LOW || '' },
        { level: 'BASIC', description: res.data.BASIC || '' },
        { level: 'HIGH', description: res.data.HIGH || '' },
        { level: 'SUPERIOR', description: res.data.SUPERIOR || '' }
      ];
      setFormData(prev => ({ ...prev, indicators: newIndicators }));
    } catch (error) {
      alert('Error generando indicadores. Verifique la API Key.');
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPeriod || !selectedSubject) return;

    try {
      // 1. Create Achievement
      const achRes = await academicApi.createAchievement({
        period: Number(selectedPeriod),
        subject: Number(selectedSubject),
        definition: formData.definitionId ? Number(formData.definitionId) : null,
        description: formData.description,
        percentage: formData.percentage
      });

      // 2. Create Indicators
      if (achRes.data.id) {
        await academicApi.createIndicators(achRes.data.id, formData.indicators);
      }

      setShowForm(false);
      setFormData({
        definitionId: '',
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

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Planeación de Periodo</h1>
      
      <div className="grid grid-cols-2 gap-4 mb-6 bg-white p-4 rounded-lg shadow">
        <div>
          <label className="block text-sm font-medium text-gray-700">Periodo</label>
          <select 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
            value={selectedPeriod}
            onChange={e => setSelectedPeriod(Number(e.target.value))}
          >
            <option value="">Seleccione Periodo</option>
            {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Asignatura</label>
          <select 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
            value={selectedSubject}
            onChange={e => setSelectedSubject(Number(e.target.value))}
          >
            <option value="">Seleccione Asignatura</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name} - {s.grade_name}</option>)}
          </select>
        </div>
      </div>

      {selectedPeriod && selectedSubject && (
        <>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Logros Planificados</h2>
            <button 
              onClick={() => setShowForm(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700"
            >
              <Plus size={20} /> Agregar Logro
            </button>
          </div>

          {showForm && (
            <div className="bg-white p-6 rounded-lg shadow mb-6 border border-blue-200">
              <h3 className="text-lg font-bold mb-4">Nuevo Logro</h3>
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700">Importar del Banco (Opcional)</label>
                  <select 
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
                    value={formData.definitionId}
                    onChange={e => handleDefinitionChange(Number(e.target.value))}
                  >
                    <option value="">-- Escribir nuevo --</option>
                    {definitions.map(d => <option key={d.id} value={d.id}>{d.code} - {d.description.substring(0, 50)}...</option>)}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700">Descripción del Logro</label>
                  <textarea 
                    required
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                  />
                </div>

                <div className="mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">Indicadores de Desempeño</label>
                    <button 
                      type="button"
                      onClick={handleGenerateAI}
                      disabled={generatingAI}
                      className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-full flex items-center gap-1 hover:bg-purple-200"
                    >
                      <Wand2 size={14} /> {generatingAI ? 'Generando...' : 'Generar con IA'}
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {formData.indicators.map((ind, idx) => (
                      <div key={ind.level} className="flex gap-2 items-start">
                        <span className={`w-24 text-xs font-bold uppercase py-2 px-2 rounded text-center ${
                          ind.level === 'LOW' ? 'bg-red-100 text-red-800' :
                          ind.level === 'BASIC' ? 'bg-yellow-100 text-yellow-800' :
                          ind.level === 'HIGH' ? 'bg-blue-100 text-blue-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {ind.level === 'LOW' ? 'Bajo' : ind.level === 'BASIC' ? 'Básico' : ind.level === 'HIGH' ? 'Alto' : 'Superior'}
                        </span>
                        <textarea 
                          className="flex-1 text-sm border-gray-300 rounded-md border p-2"
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

                <div className="flex justify-end gap-2">
                  <button 
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                  >
                    <Save size={18} /> Guardar Planeación
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="space-y-4">
            {achievements.map(ach => (
              <div key={ach.id} className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-gray-900 font-medium">{ach.description}</p>
                    {ach.definition_code && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded mt-1 inline-block">Ref: {ach.definition_code}</span>}
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
