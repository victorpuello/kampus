import { useState, useEffect } from 'react';
import { academicApi } from '../../services/academic';
import type { Dimension, AcademicYear } from '../../services/academic';
import { Plus, Edit, Trash, Save, X, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';

export default function DimensionsConfig() {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySourceYearId, setCopySourceYearId] = useState<number | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Partial<Dimension>>({
    name: '',
    description: '',
    percentage: 0,
    is_active: true
  });

  useEffect(() => {
    loadYears();
  }, []);

  useEffect(() => {
    if (selectedYear) {
      loadDimensions(selectedYear);
    }
  }, [selectedYear]);

  const loadYears = async () => {
    try {
      const res = await academicApi.listYears();
      setYears(res.data);
      const active = res.data.find(y => y.status === 'ACTIVE') || res.data[0];
      if (active) setSelectedYear(active.id);
    } catch (error) {
      console.error("Error loading years", error);
    }
  };

  const openCopyModal = () => {
    if (!selectedYear) return;
    setCopyError(null);
    const firstOther = years.find(y => y.id !== selectedYear);
    setCopySourceYearId(firstOther ? firstOther.id : null);
    setShowCopyModal(true);
  };

  const handleCopyFromYear = async () => {
    if (!selectedYear || !copySourceYearId) return;
    setCopying(true);
    setCopyError(null);
    try {
      await academicApi.copyDimensionsFromYear(copySourceYearId, selectedYear);
      setShowCopyModal(false);
      await loadDimensions(selectedYear);
    } catch (error: any) {
      const msg =
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        'Error al copiar dimensiones';
      setCopyError(msg);
      console.error('Error copying dimensions', error);
    } finally {
      setCopying(false);
    }
  };

  const loadDimensions = async (yearId: number) => {
    setLoading(true);
    try {
      const res = await academicApi.listDimensions(yearId);
      setDimensions(res.data);
    } catch (error) {
      console.error("Error loading dimensions", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedYear) return;

    try {
      const data = { ...formData, academic_year: selectedYear };
      if (editingId) {
        await academicApi.updateDimension(editingId, data);
      } else {
        await academicApi.createDimension(data);
      }
      setShowForm(false);
      setEditingId(null);
      setFormData({ name: '', description: '', percentage: 0, is_active: true });
      loadDimensions(selectedYear);
    } catch (error) {
      console.error("Error saving dimension", error);
    }
  };

  const handleEdit = (dim: Dimension) => {
    setFormData(dim);
    setEditingId(dim.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('¿Estás seguro de eliminar esta dimensión?')) {
      try {
        await academicApi.deleteDimension(id);
        if (selectedYear) loadDimensions(selectedYear);
      } catch (error) {
        console.error("Error deleting dimension", error);
      }
    }
  };

  const totalPercentage = dimensions.filter(d => d.is_active).reduce((sum, d) => sum + d.percentage, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dimensiones de Evaluación</h1>
          <p className="text-slate-500 mt-1">Configura los pesos porcentuales para la evaluación</p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={selectedYear || ''}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {years.map(y => (
              <option key={y.id} value={y.id}>Año {y.year} ({y.status_display})</option>
            ))}
          </select>
          <button
            onClick={openCopyModal}
            disabled={!selectedYear || years.length < 2}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-800 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title={years.length < 2 ? 'Debes tener al menos 2 años lectivos' : 'Copiar dimensiones desde otro año'}
          >
            <Save size={20} /> Copiar de otro año
          </button>
          <button 
            onClick={() => { setShowForm(true); setEditingId(null); setFormData({ name: '', description: '', percentage: 0, is_active: true }); }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 shadow-sm transition-all"
          >
            <Plus size={20} /> Nueva Dimensión
          </button>
        </div>
      </div>

      {showCopyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 transition-all p-4">
          <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-slate-900">Copiar Dimensiones</h2>
              <button onClick={() => setShowCopyModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              Copia las dimensiones del año origen al año seleccionado.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Año origen</label>
                <select
                  value={copySourceYearId || ''}
                  onChange={(e) => setCopySourceYearId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  {years
                    .filter(y => y.id !== selectedYear)
                    .map(y => (
                      <option key={y.id} value={y.id}>Año {y.year} ({y.status_display})</option>
                    ))}
                </select>
              </div>

              {copyError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded p-2">
                  {copyError}
                </div>
              )}

              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCopyModal(false)}
                  className="px-4 py-2 text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 font-medium text-sm"
                  disabled={copying}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCopyFromYear}
                  disabled={!copySourceYearId || copying}
                  className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {copying ? 'Copiando...' : 'Copiar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats / Validation */}
      <div className="grid gap-4 md:grid-cols-1">
        <div className={`p-4 rounded-lg border ${totalPercentage === 100 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center gap-3">
            {totalPercentage === 100 ? (
              <div className="p-2 bg-emerald-100 rounded-full text-emerald-600">
                <Save size={20} />
              </div>
            ) : (
              <div className="p-2 bg-amber-100 rounded-full text-amber-600">
                <AlertCircle size={20} />
              </div>
            )}
            <div>
              <h3 className={`font-semibold ${totalPercentage === 100 ? 'text-emerald-900' : 'text-amber-900'}`}>
                Total Porcentaje: {totalPercentage}%
              </h3>
              <p className={`text-sm ${totalPercentage === 100 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {totalPercentage === 100 
                  ? 'La configuración de porcentajes es correcta.' 
                  : `La suma de los porcentajes debe ser 100%. Actualmente es ${totalPercentage}%.`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 transition-all p-4">
          <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-slate-900">{editingId ? 'Editar Dimensión' : 'Nueva Dimensión'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                <Input 
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="Ej. Cognitivo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Porcentaje (%)</label>
                <Input 
                  type="number"
                  required
                  min="0"
                  max="100"
                  value={formData.percentage}
                  onChange={e => setFormData({...formData, percentage: Number(e.target.value)})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                <textarea 
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  rows={3}
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input 
                    type="checkbox"
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={formData.is_active}
                    onChange={e => setFormData({...formData, is_active: e.target.checked})}
                  />
                  Activo
                </label>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button 
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 font-medium text-sm"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 font-medium text-sm"
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
          <CardTitle className="text-lg font-semibold text-slate-900">Listado de Dimensiones</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">Nombre</th>
                  <th className="px-6 py-4 font-semibold">Descripción</th>
                  <th className="px-6 py-4 font-semibold">Porcentaje</th>
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">Cargando...</td></tr>
                ) : dimensions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No hay dimensiones configuradas para este año.
                    </td>
                  </tr>
                ) : dimensions.map((dim) => (
                  <tr key={dim.id} className="bg-white hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{dim.name}</td>
                    <td className="px-6 py-4 text-slate-600">{dim.description || '-'}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        {dim.percentage}%
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${dim.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                        {dim.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleEdit(dim)} className="p-1 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded transition-colors"><Edit size={16} /></button>
                        <button onClick={() => handleDelete(dim.id)} className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition-colors"><Trash size={16} /></button>
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
