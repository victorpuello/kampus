import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload } from 'lucide-react'
import { enrollmentsApi } from '../../services/enrollments'
import { useAuthStore } from '../../store/auth'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Label } from '../../components/ui/Label'
import { Toast, type ToastType } from '../../components/ui/Toast'

export default function EnrollmentBulkUpload() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'

  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [uploadResult, setUploadResult] = useState<{ success: number; errors: string[] } | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  if (isTeacher) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Carga Masiva de Matrículas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">No tienes permisos para acceder a la carga masiva de matrículas.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const handleBulkUpload = async () => {
    if (!file) {
      showToast('Seleccione un archivo CSV', 'error')
      return
    }

    setLoading(true)
    setUploadResult(null)

    try {
      const response = await enrollmentsApi.bulkUpload(file)
      setUploadResult(response.data)
      showToast(`Proceso completado: ${response.data.success} matriculados`, 'success')
    } catch (error: unknown) {
      console.error(error)
      showToast('Error al procesar el archivo', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Carga Masiva de Matrículas</h2>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((prev) => ({ ...prev, isVisible: false }))}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Carga Masiva
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-blue-50 text-blue-800 rounded-md text-sm dark:bg-blue-950/40 dark:text-blue-200">
            <p className="font-medium mb-1">Instrucciones:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>El archivo debe ser formato <strong>.csv</strong></li>
              <li>
                Para <strong>estudiantes antiguos (ya existentes)</strong>: <code>document_number</code>, <code>grade_name</code>
              </li>
              <li>
                Para <strong>estudiantes nuevos</strong>: agregar <code>first_name</code> y <code>last_name</code>
              </li>
              <li>
                Columnas opcionales: <code>group_name</code>, <code>email</code>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <Label>Seleccionar Archivo</Label>
            <Input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/enrollments')} className="flex-1">
              Volver a Matrículas
            </Button>
            <Button onClick={handleBulkUpload} disabled={loading || !file} className="flex-1">
              {loading ? 'Procesando...' : 'Cargar Matrículas'}
            </Button>
          </div>

          {uploadResult && (
            <div className="mt-4 p-4 border rounded-md bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
              <p className="font-medium text-green-600">Exitosos: {uploadResult.success}</p>
              {uploadResult.errors.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium text-red-600">Errores:</p>
                  <ul className="text-sm text-red-500 dark:text-red-300 list-disc list-inside max-h-40 overflow-y-auto">
                    {uploadResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
