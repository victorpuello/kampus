import { useState, useEffect } from 'react'
import { documentsApi, type StudentDocument } from '../../services/students'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Label } from '../ui/Label'
import { FileText, Trash2, Upload, Eye } from 'lucide-react'

interface StudentDocumentsProps {
  studentId: number
}

export default function StudentDocuments({ studentId }: StudentDocumentsProps) {
  const [documents, setDocuments] = useState<StudentDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  
  // Upload Form
  const [file, setFile] = useState<File | null>(null)
  const [docType, setDocType] = useState('OTHER')
  const [description, setDescription] = useState('')

  useEffect(() => {
    loadDocuments()
  }, [studentId])

  const loadDocuments = async () => {
    setLoading(true)
    try {
      // Ideally we would have an endpoint to list documents for a student
      // For now, we might need to fetch the student details which includes documents
      // Or assume we have a list endpoint. 
      // Based on previous context, `studentsApi.get(id)` returns a student object which has a `documents` array.
      // Let's use that for now.
      const response = await import('../../services/students').then(m => m.studentsApi.get(studentId))
      setDocuments(response.data.documents || [])
    } catch (error) {
      console.error('Error loading documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('student', String(studentId))
    formData.append('file', file)
    formData.append('document_type', docType)
    formData.append('description', description)

    try {
      await documentsApi.create(formData, (_progressEvent) => {
        // Optional: Add progress tracking here if needed for single uploads
      })
      setFile(null)
      setDescription('')
      setDocType('OTHER')
      loadDocuments() // Reload list
    } catch (error) {
      console.error('Error uploading document:', error)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Está seguro de eliminar este documento?')) return
    try {
      await documentsApi.delete(id)
      loadDocuments()
    } catch (error) {
      console.error('Error deleting document:', error)
    }
  }

  const getDocTypeName = (type: string) => {
    const types: Record<string, string> = {
      'IDENTITY': 'Documento de Identidad',
      'VACCINES': 'Carnet de Vacunas',
      'EPS': 'Certificado EPS',
      'ACADEMIC': 'Certificado Académico',
      'PHOTO': 'Foto',
      'OTHER': 'Otro'
    }
    return types[type] || type
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cargar Nuevo Documento</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Documento</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-sky-400"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                >
                  <option value="IDENTITY">Documento de Identidad</option>
                  <option value="VACCINES">Carnet de Vacunas</option>
                  <option value="EPS">Certificado EPS</option>
                  <option value="ACADEMIC">Certificado Académico</option>
                  <option value="PHOTO">Foto</option>
                  <option value="OTHER">Otro</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Descripción (Opcional)</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej: Certificado de notas 2023"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Archivo</Label>
              <Input
                type="file"
                onChange={(e) => {
                  const selectedFile = e.target.files ? e.target.files[0] : null
                  if (selectedFile && selectedFile.size > 5 * 1024 * 1024) {
                    alert('El archivo excede el tamaño máximo de 5MB')
                    e.target.value = ''
                    setFile(null)
                  } else {
                    setFile(selectedFile)
                  }
                }}
                accept=".pdf,.jpg,.jpeg,.png"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">Formatos: PDF, JPG, PNG. Máximo 5MB.</p>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={uploading || !file}>
                <Upload className="mr-2 h-4 w-4" />
                {uploading ? 'Subiendo...' : 'Subir Documento'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documentos Registrados</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4 text-slate-500 dark:text-slate-400">Cargando documentos...</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">No hay documentos registrados.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map((doc) => (
                <div key={doc.id} className="border rounded-lg p-4 flex flex-col justify-between bg-slate-50 hover:bg-slate-100 transition-colors dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/50">
                  <div className="flex items-start justify-between mb-2">
                    <div className="p-2 bg-blue-100 rounded-full text-blue-600 dark:bg-sky-950/40 dark:text-sky-300">
                      <FileText className="h-5 w-5" />
                    </div>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 dark:hover:text-red-300" onClick={() => handleDelete(doc.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div>
                    <h4 className="font-medium text-slate-900 dark:text-slate-100">{getDocTypeName(doc.document_type)}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{doc.description || 'Sin descripción'}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Subido: {new Date(doc.uploaded_at).toLocaleDateString()}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <a 
                      href={doc.file} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline flex items-center justify-center dark:text-sky-400"
                    >
                      <Eye className="mr-1 h-3 w-3" /> Ver Documento
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}