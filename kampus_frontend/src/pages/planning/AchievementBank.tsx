import { useState, useEffect } from 'react';
import { academicApi } from '../../services/academic';
import type { AchievementDefinition, Area, Subject, Grade } from '../../services/academic';
import { Plus, Edit, Trash, Sparkles } from 'lucide-react';

export default function AchievementBank() {
  const [definitions, setDefinitions] = useState<AchievementDefinition[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [improving, setImproving] = useState(false);
  
  const [formData, setFormData] = useState<Partial<AchievementDefinition>>({
    code: '',
    description: '',
    area: undefined,
    grade: undefined,
    subject: undefined,
    is_active: true
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [defsRes, areasRes, subjectsRes, gradesRes] = await Promise.all([
        academicApi.listAchievementDefinitions(),
        academicApi.listAreas(),
        academicApi.listSubjects(),
        academicApi.listGrades()
      ]);
      setDefinitions(defsRes.data);
      setAreas(areasRes.data);
      setSubjects(subjectsRes.data);
      setGrades(gradesRes.data);
    } catch (error) {
      console.error("Error loading data", error);
    } finally {
      setLoading(false);
    }
  };

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
      setFormData({ code: '', description: '', is_active: true, area: undefined, grade: undefined, subject: undefined });
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

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Banco de Logros</h1>
        <button 
          onClick={() => { setShowForm(true); setEditingId(null); setFormData({ code: '', description: '', is_active: true }); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
        >
          <Plus size={20} /> Nuevo Logro
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 transition-all">
          <div className="bg-white/95 backdrop-blur-md p-6 rounded-xl w-full max-w-2xl shadow-2xl border border-white/20">
            <h2 className="text-xl font-bold mb-4 text-gray-800">{editingId ? 'Editar Logro' : 'Nuevo Logro'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {editingId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Código</label>
                    <input 
                      type="text" 
                      disabled
                      className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm border p-2"
                      value={formData.code || ''}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Estado</label>
                  <select 
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
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
                  <label className="block text-sm font-medium text-gray-700">Descripción</label>
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
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Área <span className="text-red-500">*</span></label>
                  <select 
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    value={formData.area || ''}
                    onChange={e => setFormData({...formData, area: e.target.value ? Number(e.target.value) : undefined, subject: undefined})}
                  >
                    <option value="">Seleccionar Área</option>
                    {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Asignatura <span className="text-red-500">*</span></label>
                  <select 
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    value={formData.subject || ''}
                    onChange={e => setFormData({...formData, subject: e.target.value ? Number(e.target.value) : undefined})}
                  >
                    <option value="">Seleccionar Asignatura</option>
                    {subjects
                      .filter(s => !formData.area || s.area === formData.area)
                      .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Grado <span className="text-red-500">*</span></label>
                  <select 
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    value={formData.grade || ''}
                    onChange={e => setFormData({...formData, grade: e.target.value ? Number(e.target.value) : undefined})}
                  >
                    <option value="">Seleccionar Grado</option>
                    {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              </div>


              <div className="flex justify-end gap-2 mt-6">
                <button 
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Área / Grado / Asignatura</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-4 text-center">Cargando...</td></tr>
            ) : definitions.map((def) => (
              <tr key={def.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{def.code}</td>
                <td className="px-6 py-4 text-sm text-gray-500 max-w-md truncate">{def.description}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {[
                    def.area_name,
                    def.grade_name,
                    def.subject_name
                  ].filter(Boolean).join(' / ') || 'General'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${def.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {def.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button onClick={() => handleEdit(def)} className="text-indigo-600 hover:text-indigo-900 mr-4"><Edit size={18} /></button>
                  <button onClick={() => handleDelete(def.id)} className="text-red-600 hover:text-red-900"><Trash size={18} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
