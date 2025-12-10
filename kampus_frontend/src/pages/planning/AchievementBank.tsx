import { useState, useEffect } from 'react';
import { academicApi } from '../../services/academic';
import type { AchievementDefinition, Area, Subject, Grade, Dimension } from '../../services/academic';
import { Plus, Edit, Trash, Sparkles, Search, BookOpen, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';

export default function AchievementBank() {
  const [definitions, setDefinitions] = useState<AchievementDefinition[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [improving, setImproving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState<Partial<AchievementDefinition>>({
    code: '',
    description: '',
    area: undefined,
    grade: undefined,
    subject: undefined,
    dimension: undefined,
    is_active: true
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [defsRes, areasRes, subjectsRes, gradesRes, yearsRes] = await Promise.all([
        academicApi.listAchievementDefinitions(),
        academicApi.listAreas(),
        academicApi.listSubjects(),
        academicApi.listGrades(),
        academicApi.listYears()
      ]);
      setDefinitions(defsRes.data);
      setAreas(areasRes.data);
      setSubjects(subjectsRes.data);
      setGrades(gradesRes.data);

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

  const totalAchievements = definitions.length;
  const activeAchievements = definitions.filter(d => d.is_active).length;
  const inactiveAchievements = totalAchievements - activeAchievements;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Banco de Logros</h1>
          <p className="text-slate-500 mt-1">Gestiona los logros académicos institucionales</p>
        </div>
        <button 
          onClick={() => { setShowForm(true); setEditingId(null); setFormData({ code: '', description: '', is_active: true }); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 shadow-sm transition-all"
        >
          <Plus size={20} /> Nuevo Logro
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500">Total Logros</p>
              <BookOpen className="h-4 w-4 text-slate-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{totalAchievements}</div>
            <p className="text-xs text-slate-500 mt-1">Registrados en el banco</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500">Activos</p>
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{activeAchievements}</div>
            <p className="text-xs text-slate-500 mt-1">Disponibles para uso</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500">Inactivos</p>
              <XCircle className="h-4 w-4 text-red-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{inactiveAchievements}</div>
            <p className="text-xs text-slate-500 mt-1">Deshabilitados temporalmente</p>
          </CardContent>
        </Card>
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

              <div>
                <label className="block text-sm font-medium text-gray-700">Dimensión (Opcional)</label>
                <select 
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  value={formData.dimension || ''}
                  onChange={e => setFormData({...formData, dimension: e.target.value ? Number(e.target.value) : undefined})}
                >
                  <option value="">Seleccionar Dimensión</option>
                  {dimensions.filter(d => d.is_active).map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.percentage}%)</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Dimensiones del año lectivo activo.</p>
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

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle className="text-lg font-semibold text-slate-900">Listado de Logros</CardTitle>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Buscar por código, descripción..." 
                className="pl-9 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">Código</th>
                  <th className="px-6 py-4 font-semibold">Descripción</th>
                  <th className="px-6 py-4 font-semibold">Área / Grado / Asignatura</th>
                  <th className="px-6 py-4 font-semibold">Dimensión</th>
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">Cargando...</td></tr>
                ) : filteredDefinitions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center py-4">
                        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                          <Search className="h-6 w-6 text-slate-400" />
                        </div>
                        <p className="font-medium text-slate-900">No se encontraron logros</p>
                        <p className="text-sm text-slate-500 mt-1">Intenta ajustar los filtros de búsqueda</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredDefinitions.map((def) => (
                  <tr key={def.id} className="bg-white hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{def.code}</td>
                    <td className="px-6 py-4 text-slate-600 max-w-md truncate">{def.description}</td>
                    <td className="px-6 py-4 text-slate-600">
                      {[
                        def.area_name,
                        def.grade_name,
                        def.subject_name
                      ].filter(Boolean).join(' / ') || 'General'}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {def.dimension_name ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                          {def.dimension_name}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${def.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {def.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleEdit(def)} className="p-1 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded transition-colors"><Edit size={16} /></button>
                        <button onClick={() => handleDelete(def.id)} className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition-colors"><Trash size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
